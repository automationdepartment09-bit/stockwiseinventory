-- Returns table to track return of withdrawn items
CREATE TYPE return_status AS ENUM ('pending', 'completed', 'cancelled');
CREATE TYPE return_condition AS ENUM ('good', 'damaged', 'lost', 'partial');

CREATE TABLE public.returns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  withdrawal_id UUID,
  item_id UUID NOT NULL,
  warehouse_id UUID NOT NULL,
  project_id UUID,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  returned_by_user_id UUID,
  returned_by_name TEXT,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  condition return_condition NOT NULL DEFAULT 'good',
  notes TEXT,
  attachment_url TEXT,
  attachment_name TEXT,
  status return_status NOT NULL DEFAULT 'pending',
  created_by UUID NOT NULL,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  movement_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read returns" ON public.returns FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff+ create returns" ON public.returns FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'staff'::app_role]) AND created_by = auth.uid());

CREATE POLICY "Owner cancel pending returns" ON public.returns FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND status = 'pending');

CREATE POLICY "Mgr+ review returns" ON public.returns FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]));

CREATE POLICY "Admins delete returns" ON public.returns FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER returns_touch BEFORE UPDATE ON public.returns FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- On completion, push stock back into the warehouse (only for 'good' or 'partial' condition portion).
CREATE OR REPLACE FUNCTION public.handle_return_completion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mid UUID; v_item TEXT; v_admin UUID;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    IF NEW.condition IN ('good','partial') THEN
      INSERT INTO public.stock_movements (item_id, movement_type, quantity, to_warehouse_id, reason, reference, created_by)
      VALUES (NEW.item_id, 'in', NEW.quantity, NEW.warehouse_id,
              COALESCE('Return: ' || NEW.condition::text, 'Return'),
              'RET:' || NEW.id::text,
              COALESCE(NEW.reviewed_by, auth.uid()))
      RETURNING id INTO v_mid;
      NEW.movement_id := v_mid;
    END IF;

    SELECT name INTO v_item FROM public.items WHERE id = NEW.item_id;
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (NEW.created_by, 'Return completed',
            NEW.quantity || ' × ' || COALESCE(v_item,'item') || ' marked as returned (' || NEW.condition::text || ').',
            'return_completed', '/returns');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER returns_completion BEFORE UPDATE ON public.returns
FOR EACH ROW EXECUTE FUNCTION public.handle_return_completion();

-- Notify managers when a new return is logged
CREATE OR REPLACE FUNCTION public.notify_new_return()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item TEXT; v_admin UUID;
BEGIN
  SELECT name INTO v_item FROM public.items WHERE id = NEW.item_id;
  FOR v_admin IN SELECT user_id FROM public.user_roles WHERE role IN ('admin','manager') LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (v_admin, 'New return logged',
            NEW.quantity || ' × ' || COALESCE(v_item,'item') || ' (' || NEW.condition::text || ')',
            'return_new', '/returns');
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER returns_notify_new AFTER INSERT ON public.returns
FOR EACH ROW EXECUTE FUNCTION public.notify_new_return();

-- Withdrawals: dedicated table with approval flow
CREATE TYPE public.withdrawal_status AS ENUM ('pending','approved','rejected','cancelled');

CREATE TABLE public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL,
  warehouse_id UUID NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  withdrawn_by_user_id UUID,           -- optional: app user
  withdrawn_by_name TEXT,              -- optional: free-text name
  purpose TEXT NOT NULL,
  project_reference TEXT,
  withdrawal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  return_expected BOOLEAN NOT NULL DEFAULT false,
  expected_return_date DATE,
  notes TEXT,
  attachment_url TEXT,
  attachment_name TEXT,
  status public.withdrawal_status NOT NULL DEFAULT 'pending',
  requested_by UUID NOT NULL,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  movement_id UUID, -- link to the stock movement created on approval
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (withdrawn_by_user_id IS NOT NULL OR (withdrawn_by_name IS NOT NULL AND length(trim(withdrawn_by_name)) > 0))
);

CREATE INDEX idx_withdrawals_item ON public.withdrawals(item_id);
CREATE INDEX idx_withdrawals_warehouse ON public.withdrawals(warehouse_id);
CREATE INDEX idx_withdrawals_requested_by ON public.withdrawals(requested_by);
CREATE INDEX idx_withdrawals_status ON public.withdrawals(status);
CREATE INDEX idx_withdrawals_date ON public.withdrawals(withdrawal_date DESC);

ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read withdrawals" ON public.withdrawals
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff+ create withdrawals" ON public.withdrawals
  FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'staff'::app_role])
              AND requested_by = auth.uid());

CREATE POLICY "Owner cancel pending" ON public.withdrawals
  FOR UPDATE TO authenticated
  USING (requested_by = auth.uid() AND status = 'pending')
  WITH CHECK (requested_by = auth.uid());

CREATE POLICY "Mgr+ review withdrawals" ON public.withdrawals
  FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]));

CREATE POLICY "Admins delete withdrawals" ON public.withdrawals
  FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER trg_withdrawals_updated BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Approval handler: on approve, create stock 'out' movement and link it; notify requester
CREATE OR REPLACE FUNCTION public.handle_withdrawal_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mid UUID;
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    INSERT INTO public.stock_movements (item_id, movement_type, quantity, from_warehouse_id, reason, reference, created_by)
    VALUES (NEW.item_id, 'out', NEW.quantity, NEW.warehouse_id,
            COALESCE('Withdrawal: ' || NEW.purpose, 'Withdrawal'),
            'WTH:' || NEW.id::text,
            COALESCE(NEW.reviewed_by, auth.uid()))
    RETURNING id INTO v_mid;
    NEW.movement_id := v_mid;

    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (NEW.requested_by, 'Withdrawal approved',
            NEW.quantity || ' unit(s) withdrawn for: ' || NEW.purpose,
            'withdrawal_approved', '/withdrawals');

  ELSIF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (NEW.requested_by, 'Withdrawal rejected',
            COALESCE(NEW.review_note, 'Your withdrawal request was rejected.'),
            'withdrawal_rejected', '/withdrawals');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_withdrawal_approval BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.handle_withdrawal_approval();

-- Notify managers/admins on new withdrawal requests
CREATE OR REPLACE FUNCTION public.notify_new_withdrawal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item TEXT; v_wh TEXT; v_admin UUID;
BEGIN
  SELECT name INTO v_item FROM public.items WHERE id = NEW.item_id;
  SELECT name INTO v_wh FROM public.warehouses WHERE id = NEW.warehouse_id;
  FOR v_admin IN SELECT user_id FROM public.user_roles WHERE role IN ('admin','manager') LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (v_admin, 'New withdrawal request',
            NEW.quantity || ' × ' || COALESCE(v_item,'item') || ' from ' || COALESCE(v_wh,'warehouse')
              || ' — ' || NEW.purpose,
            'withdrawal_new', '/withdrawals');
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_withdrawal_notify_new AFTER INSERT ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_withdrawal();

-- Storage policies for withdrawal attachments (reuse chat-attachments bucket under withdrawals/ prefix)
CREATE POLICY "Auth read withdrawal attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = 'withdrawals');

CREATE POLICY "Staff+ upload withdrawal attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments'
              AND (storage.foldername(name))[1] = 'withdrawals'
              AND has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'staff'::app_role]));

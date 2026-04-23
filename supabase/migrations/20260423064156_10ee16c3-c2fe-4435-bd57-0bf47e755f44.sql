-- Stock add requests requiring admin/manager approval
CREATE TYPE public.request_status AS ENUM ('pending','approved','rejected');

CREATE TABLE public.stock_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reason TEXT,
  status public.request_status NOT NULL DEFAULT 'pending',
  requested_by UUID NOT NULL,
  reviewed_by UUID,
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_requests_status ON public.stock_requests(status);
CREATE INDEX idx_stock_requests_item ON public.stock_requests(item_id);

ALTER TABLE public.stock_requests ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view requests (so requesters see status, managers see queue)
CREATE POLICY "Auth read stock_requests"
  ON public.stock_requests FOR SELECT TO authenticated USING (true);

-- Any authenticated user (staff and up effectively) can create their own request
CREATE POLICY "Users create own stock_requests"
  ON public.stock_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

-- Only admin/manager can update (approve/reject)
CREATE POLICY "Mgr+ update stock_requests"
  ON public.stock_requests FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]));

-- updated_at trigger
CREATE TRIGGER trg_stock_requests_touch
BEFORE UPDATE ON public.stock_requests
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- On approval, insert the corresponding stock movement
CREATE OR REPLACE FUNCTION public.handle_stock_request_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    INSERT INTO public.stock_movements (item_id, movement_type, quantity, to_warehouse_id, reason, reference, created_by)
    VALUES (NEW.item_id, 'in', NEW.quantity, NEW.warehouse_id,
            COALESCE(NEW.reason, 'Approved stock request'),
            'REQ:' || NEW.id::text,
            COALESCE(NEW.reviewed_by, auth.uid()));

    -- Notify requester
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (NEW.requested_by, 'Stock request approved',
            'Your request for ' || NEW.quantity || ' units was approved.',
            'request_approved', '/items');
  ELSIF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (NEW.requested_by, 'Stock request rejected',
            COALESCE(NEW.review_note, 'Your stock request was rejected.'),
            'request_rejected', '/items');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stock_request_approval
AFTER UPDATE ON public.stock_requests
FOR EACH ROW EXECUTE FUNCTION public.handle_stock_request_approval();

-- Notify admins/managers when a new request is created
CREATE OR REPLACE FUNCTION public.notify_new_stock_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_name TEXT;
  v_wh_name TEXT;
  v_admin_id UUID;
BEGIN
  SELECT name INTO v_item_name FROM public.items WHERE id = NEW.item_id;
  SELECT name INTO v_wh_name FROM public.warehouses WHERE id = NEW.warehouse_id;
  FOR v_admin_id IN SELECT user_id FROM public.user_roles WHERE role IN ('admin','manager') LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (v_admin_id, 'New stock request',
            'Request: ' || NEW.quantity || ' × ' || COALESCE(v_item_name,'item') || ' → ' || COALESCE(v_wh_name,'warehouse'),
            'request_new', '/requests');
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stock_request_new
AFTER INSERT ON public.stock_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_new_stock_request();
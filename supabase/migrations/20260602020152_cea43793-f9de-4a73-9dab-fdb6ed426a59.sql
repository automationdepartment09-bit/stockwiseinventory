
-- 1. Movement approval workflow ---------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.movement_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS status public.movement_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

-- Backfill any historical rows as approved (they already affected stock).
UPDATE public.stock_movements SET status='approved' WHERE status='pending' AND created_at < now();

-- Re-create the apply trigger so stock only changes on approval transition.
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_reorder INTEGER; v_item_name TEXT; v_new_qty INTEGER; v_admin_id UUID;
  should_apply BOOLEAN := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    should_apply := (NEW.status = 'approved');
  ELSIF TG_OP = 'UPDATE' THEN
    should_apply := (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved');
  END IF;

  IF NOT should_apply THEN RETURN NEW; END IF;

  IF NEW.movement_type IN ('in','adjustment') AND NEW.to_warehouse_id IS NOT NULL THEN
    INSERT INTO public.stock_levels (item_id, warehouse_id, quantity)
    VALUES (NEW.item_id, NEW.to_warehouse_id, NEW.quantity)
    ON CONFLICT (item_id, warehouse_id) DO UPDATE SET quantity = stock_levels.quantity + EXCLUDED.quantity, updated_at = now();
  END IF;
  IF NEW.movement_type = 'out' AND NEW.from_warehouse_id IS NOT NULL THEN
    INSERT INTO public.stock_levels (item_id, warehouse_id, quantity)
    VALUES (NEW.item_id, NEW.from_warehouse_id, -NEW.quantity)
    ON CONFLICT (item_id, warehouse_id) DO UPDATE SET quantity = stock_levels.quantity - NEW.quantity, updated_at = now();
  END IF;
  IF NEW.movement_type = 'transfer' THEN
    IF NEW.from_warehouse_id IS NOT NULL THEN
      INSERT INTO public.stock_levels (item_id, warehouse_id, quantity)
      VALUES (NEW.item_id, NEW.from_warehouse_id, -NEW.quantity)
      ON CONFLICT (item_id, warehouse_id) DO UPDATE SET quantity = stock_levels.quantity - NEW.quantity, updated_at = now();
    END IF;
    IF NEW.to_warehouse_id IS NOT NULL THEN
      INSERT INTO public.stock_levels (item_id, warehouse_id, quantity)
      VALUES (NEW.item_id, NEW.to_warehouse_id, NEW.quantity)
      ON CONFLICT (item_id, warehouse_id) DO UPDATE SET quantity = stock_levels.quantity + NEW.quantity, updated_at = now();
    END IF;
  END IF;

  SELECT i.reorder_level, i.name INTO v_reorder, v_item_name FROM public.items i WHERE i.id = NEW.item_id;
  SELECT COALESCE(SUM(quantity),0) INTO v_new_qty FROM public.stock_levels WHERE item_id = NEW.item_id;
  IF v_reorder > 0 AND v_new_qty <= v_reorder THEN
    FOR v_admin_id IN SELECT user_id FROM public.user_roles WHERE role IN ('admin','manager') LOOP
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (v_admin_id, 'Low stock: ' || v_item_name, 'Current quantity: ' || v_new_qty || ' (reorder at ' || v_reorder || ')', 'low_stock', '/items');
    END LOOP;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_apply_stock_movement_ins ON public.stock_movements;
DROP TRIGGER IF EXISTS trg_apply_stock_movement_upd ON public.stock_movements;
CREATE TRIGGER trg_apply_stock_movement_ins
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();
CREATE TRIGGER trg_apply_stock_movement_upd
  AFTER UPDATE OF status ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- Allow mgr+ to update movement status; allow staff to update their own pending (e.g. cancel).
DROP POLICY IF EXISTS "Mgr+ review movements" ON public.stock_movements;
CREATE POLICY "Mgr+ review movements" ON public.stock_movements
  FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]));

-- Patch downstream functions that insert movements: pass status='approved' since those flows already approved.
CREATE OR REPLACE FUNCTION public.handle_withdrawal_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_mid UUID;
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    INSERT INTO public.stock_movements (item_id, movement_type, quantity, from_warehouse_id, reason, reference, created_by, status, reviewed_by, reviewed_at)
    VALUES (NEW.item_id, 'out', NEW.quantity, NEW.warehouse_id,
            COALESCE('Withdrawal: ' || NEW.purpose, 'Withdrawal'),
            'WTH:' || NEW.id::text,
            COALESCE(NEW.reviewed_by, auth.uid()),
            'approved', COALESCE(NEW.reviewed_by, auth.uid()), now())
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
END $fn$;

CREATE OR REPLACE FUNCTION public.handle_return_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_mid UUID; v_item TEXT;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    IF NEW.condition IN ('good','partial') THEN
      INSERT INTO public.stock_movements (item_id, movement_type, quantity, to_warehouse_id, reason, reference, created_by, status, reviewed_by, reviewed_at)
      VALUES (NEW.item_id, 'in', NEW.quantity, NEW.warehouse_id,
              COALESCE('Return: ' || NEW.condition::text, 'Return'),
              'RET:' || NEW.id::text,
              COALESCE(NEW.reviewed_by, auth.uid()),
              'approved', COALESCE(NEW.reviewed_by, auth.uid()), now())
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
END $fn$;

CREATE OR REPLACE FUNCTION public.handle_stock_request_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (NEW.requested_by, 'Stock request approved',
            'Your request for ' || NEW.quantity || ' units was approved.',
            'request_approved', '/requests');
  ELSIF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (NEW.requested_by, 'Stock request rejected',
            COALESCE(NEW.review_note, 'Your stock request was rejected.'),
            'request_rejected', '/requests');
  ELSIF NEW.status = 'on_arrival' AND OLD.status IS DISTINCT FROM 'on_arrival' THEN
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (NEW.requested_by, 'Stock on arrival', 'Your requested stock is on the way.', 'request_on_arrival', '/requests');
  ELSIF NEW.status = 'arrived' AND OLD.status IS DISTINCT FROM 'arrived' THEN
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (NEW.requested_by, 'Stock arrived', 'Your requested stock has arrived and is awaiting receiving.', 'request_arrived', '/requests');
  ELSIF NEW.status = 'received' AND OLD.status IS DISTINCT FROM 'received' THEN
    INSERT INTO public.stock_movements (item_id, movement_type, quantity, to_warehouse_id, reason, reference, created_by, status, reviewed_by, reviewed_at)
    VALUES (NEW.item_id, 'in', NEW.quantity, NEW.warehouse_id,
            COALESCE(NEW.reason, 'Received stock request'),
            'REQ:' || NEW.id::text,
            COALESCE(NEW.reviewed_by, auth.uid()),
            'approved', COALESCE(NEW.reviewed_by, auth.uid()), now());
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (NEW.requested_by, 'Stock received',
            'Your requested ' || NEW.quantity || ' units have been received into stock.',
            'request_received', '/items');
  END IF;
  RETURN NEW;
END $fn$;

-- Notify reviewers when a new pending movement is created
CREATE OR REPLACE FUNCTION public.notify_new_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_item TEXT; v_admin UUID;
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;
  SELECT name INTO v_item FROM public.items WHERE id = NEW.item_id;
  FOR v_admin IN SELECT user_id FROM public.user_roles WHERE role IN ('admin','manager') LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (v_admin, 'Movement awaiting approval',
            NEW.movement_type || ' · ' || NEW.quantity || ' × ' || COALESCE(v_item,'item'),
            'movement_new', '/movements');
  END LOOP;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_notify_new_movement ON public.stock_movements;
CREATE TRIGGER trg_notify_new_movement AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_movement();


-- 2. Customers + Sales -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Mgr+ manage customers" ON public.customers FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'staff'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'staff'::app_role]));
CREATE TRIGGER trg_customers_touch BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DO $$ BEGIN
  CREATE TYPE public.sale_status AS ENUM ('draft','confirmed','paid','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text NOT NULL UNIQUE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  warehouse_id uuid NOT NULL,
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status public.sale_status NOT NULL DEFAULT 'draft',
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read sales" ON public.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff+ create sales" ON public.sales FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'staff'::app_role]) AND created_by = auth.uid());
CREATE POLICY "Staff+ update sales" ON public.sales FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'staff'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'staff'::app_role]));
CREATE POLICY "Admins delete sales" ON public.sales FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_sales_touch BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  item_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read sale_items" ON public.sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff+ manage sale_items" ON public.sale_items FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'staff'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'staff'::app_role]));

-- When a sale moves to confirmed/paid, create stock OUT movements (auto-approved).
CREATE OR REPLACE FUNCTION public.handle_sale_confirm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE r record;
BEGIN
  IF NEW.status IN ('confirmed','paid') AND OLD.status = 'draft' THEN
    FOR r IN SELECT * FROM public.sale_items WHERE sale_id = NEW.id LOOP
      INSERT INTO public.stock_movements (item_id, movement_type, quantity, from_warehouse_id, reason, reference, created_by, status, reviewed_by, reviewed_at)
      VALUES (r.item_id, 'out', r.quantity, NEW.warehouse_id,
              'Sale ' || NEW.invoice_no, 'SAL:' || NEW.id::text,
              COALESCE(NEW.created_by, auth.uid()),
              'approved', COALESCE(auth.uid(), NEW.created_by), now());
    END LOOP;
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_handle_sale_confirm ON public.sales;
CREATE TRIGGER trg_handle_sale_confirm AFTER UPDATE OF status ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.handle_sale_confirm();


-- 3. Project materials (manual entries) -------------------------------------
CREATE TABLE IF NOT EXISTS public.project_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_id uuid,
  description text,
  quantity numeric NOT NULL DEFAULT 0,
  unit text,
  unit_cost numeric NOT NULL DEFAULT 0,
  used_on date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_materials TO authenticated;
GRANT ALL ON public.project_materials TO service_role;
ALTER TABLE public.project_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read project_materials" ON public.project_materials FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff+ manage project_materials" ON public.project_materials FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'staff'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'staff'::app_role]));
CREATE TRIGGER trg_pm_touch BEFORE UPDATE ON public.project_materials FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'staff', 'viewer');
CREATE TYPE public.movement_type AS ENUM ('in', 'out', 'transfer', 'adjustment');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles (separate table)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- helper: any of these roles
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles app_role[])
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
$$;

-- Warehouses
CREATE TABLE public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  location TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

-- Categories
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  sku_prefix TEXT NOT NULL UNIQUE,
  sku_seq BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Items
CREATE TABLE public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  barcode TEXT,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- Stock levels per warehouse
CREATE TABLE public.stock_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(item_id, warehouse_id)
);
ALTER TABLE public.stock_levels ENABLE ROW LEVEL SECURITY;

-- Stock movements
CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  movement_type movement_type NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  from_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  to_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  reason TEXT,
  reference TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- Audit log
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL,
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  type TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ============== RLS POLICIES ==============

-- profiles
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- user_roles
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- warehouses
CREATE POLICY "Auth read warehouses" ON public.warehouses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Mgr+ manage warehouses" ON public.warehouses FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

-- categories
CREATE POLICY "Auth read categories" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Mgr+ manage categories" ON public.categories FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

-- items
CREATE POLICY "Auth read items" ON public.items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Mgr+ manage items" ON public.items FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

-- stock_levels
CREATE POLICY "Auth read stock" ON public.stock_levels FOR SELECT TO authenticated USING (true);
-- updates happen via trigger using SECURITY DEFINER; no direct write policy needed

-- stock_movements
CREATE POLICY "Auth read movements" ON public.stock_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff+ create movements" ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','staff']::app_role[]) AND created_by = auth.uid());

-- audit_log
CREATE POLICY "Admins read audit" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- notifications
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ============== TRIGGERS ==============

-- updated_at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_items_updated BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- handle new user: create profile + assign role (first user = admin, else viewer)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INTEGER;
  assigned_role app_role;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := 'viewer';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto SKU generation
CREATE OR REPLACE FUNCTION public.generate_sku()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prefix TEXT;
  seq BIGINT;
BEGIN
  IF NEW.sku IS NOT NULL AND NEW.sku <> '' THEN RETURN NEW; END IF;
  IF NEW.category_id IS NULL THEN
    NEW.sku := 'ITM-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);
    RETURN NEW;
  END IF;
  UPDATE public.categories SET sku_seq = sku_seq + 1 WHERE id = NEW.category_id RETURNING sku_prefix, sku_seq INTO prefix, seq;
  NEW.sku := prefix || '-' || lpad(seq::text, 5, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_items_sku BEFORE INSERT ON public.items FOR EACH ROW EXECUTE FUNCTION public.generate_sku();

-- Stock movement -> update stock_levels + low stock notification
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reorder INTEGER;
  v_item_name TEXT;
  v_new_qty INTEGER;
  v_admin_id UUID;
BEGIN
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

  -- Low-stock notification (sum across warehouses)
  SELECT i.reorder_level, i.name INTO v_reorder, v_item_name FROM public.items i WHERE i.id = NEW.item_id;
  SELECT COALESCE(SUM(quantity),0) INTO v_new_qty FROM public.stock_levels WHERE item_id = NEW.item_id;
  IF v_reorder > 0 AND v_new_qty <= v_reorder THEN
    FOR v_admin_id IN SELECT user_id FROM public.user_roles WHERE role IN ('admin','manager') LOOP
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (v_admin_id, 'Low stock: ' || v_item_name, 'Current quantity: ' || v_new_qty || ' (reorder at ' || v_reorder || ')', 'low_stock', '/items');
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_movement AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- Audit log triggers for items
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log (user_id, table_name, record_id, action, changes)
  VALUES (
    auth.uid(),
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_audit_items AFTER INSERT OR UPDATE OR DELETE ON public.items FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER trg_audit_warehouses AFTER INSERT OR UPDATE OR DELETE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER trg_audit_categories AFTER INSERT OR UPDATE OR DELETE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER trg_audit_movements AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER trg_audit_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- Indexes
CREATE INDEX idx_items_category ON public.items(category_id);
CREATE INDEX idx_items_name ON public.items(name);
CREATE INDEX idx_movements_item ON public.stock_movements(item_id);
CREATE INDEX idx_movements_created ON public.stock_movements(created_at DESC);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_audit_created ON public.audit_log(created_at DESC);

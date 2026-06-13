
-- CATALOGUE ITEMS
CREATE TABLE public.catalogue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(14,2),
  uom TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  remarks TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogue_items TO authenticated;
GRANT ALL ON public.catalogue_items TO service_role;
ALTER TABLE public.catalogue_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read catalogue" ON public.catalogue_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/manager manage catalogue" ON public.catalogue_items FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));
CREATE TRIGGER trg_catalogue_items_touch BEFORE UPDATE ON public.catalogue_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- QUOTATIONS
CREATE TABLE public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_no TEXT NOT NULL UNIQUE DEFAULT ('QT-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6)),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  issue_date DATE NOT NULL DEFAULT current_date,
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | sent | accepted | rejected | expired
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  terms TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO authenticated;
GRANT ALL ON public.quotations TO service_role;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read quotations" ON public.quotations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create quotations" ON public.quotations FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by OR created_by IS NULL);
CREATE POLICY "Creator or admin/manager update quotations" ON public.quotations FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
  WITH CHECK (auth.uid() = created_by OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));
CREATE POLICY "Admin/manager delete quotations" ON public.quotations FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));
CREATE TRIGGER trg_quotations_touch BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- QUOTATION ITEMS
CREATE TABLE public.quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  catalogue_item_id UUID REFERENCES public.catalogue_items(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_items TO authenticated;
GRANT ALL ON public.quotation_items TO service_role;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read quotation items via parent" ON public.quotation_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage quotation items via parent" ON public.quotation_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id AND (q.created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id AND (q.created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))));

CREATE INDEX idx_quotation_items_quotation ON public.quotation_items(quotation_id);
CREATE INDEX idx_catalogue_items_item ON public.catalogue_items(item_id);

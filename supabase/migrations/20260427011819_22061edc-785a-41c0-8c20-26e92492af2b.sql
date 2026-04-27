ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS ref_number text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS initial_quantity integer,
  ADD COLUMN IF NOT EXISTS uom text,
  ADD COLUMN IF NOT EXISTS coding text,
  ADD COLUMN IF NOT EXISTS remarks text;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS batch_ref text;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS batch_ref text;
ALTER TABLE public.stock_requests ADD COLUMN IF NOT EXISTS batch_ref text;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS batch_ref text;
CREATE INDEX IF NOT EXISTS idx_withdrawals_batch_ref ON public.withdrawals(batch_ref);
CREATE INDEX IF NOT EXISTS idx_returns_batch_ref ON public.returns(batch_ref);
CREATE INDEX IF NOT EXISTS idx_stock_requests_batch_ref ON public.stock_requests(batch_ref);
CREATE INDEX IF NOT EXISTS idx_stock_movements_batch_ref ON public.stock_movements(batch_ref);
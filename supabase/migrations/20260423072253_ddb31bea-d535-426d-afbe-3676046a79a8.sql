ALTER TYPE public.request_status ADD VALUE IF NOT EXISTS 'on_arrival';
ALTER TYPE public.request_status ADD VALUE IF NOT EXISTS 'arrived';
ALTER TYPE public.request_status ADD VALUE IF NOT EXISTS 'received';
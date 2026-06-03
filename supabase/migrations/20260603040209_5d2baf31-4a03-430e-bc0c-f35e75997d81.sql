-- Add 'partial' to stock_status enum
ALTER TYPE public.stock_status ADD VALUE IF NOT EXISTS 'partial';

-- Allow staff to update stock_levels (so they can set partial status too)
DROP POLICY IF EXISTS "Mgr+ update stock_levels status" ON public.stock_levels;
CREATE POLICY "Staff+ update stock_levels status"
ON public.stock_levels
FOR UPDATE
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'staff'::app_role]))
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'staff'::app_role]));
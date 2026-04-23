CREATE OR REPLACE FUNCTION public.handle_stock_request_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    VALUES (NEW.requested_by, 'Stock on arrival',
            'Your requested stock is on the way.',
            'request_on_arrival', '/requests');
  ELSIF NEW.status = 'arrived' AND OLD.status IS DISTINCT FROM 'arrived' THEN
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (NEW.requested_by, 'Stock arrived',
            'Your requested stock has arrived and is awaiting receiving.',
            'request_arrived', '/requests');
  ELSIF NEW.status = 'received' AND OLD.status IS DISTINCT FROM 'received' THEN
    INSERT INTO public.stock_movements (item_id, movement_type, quantity, to_warehouse_id, reason, reference, created_by)
    VALUES (NEW.item_id, 'in', NEW.quantity, NEW.warehouse_id,
            COALESCE(NEW.reason, 'Received stock request'),
            'REQ:' || NEW.id::text,
            COALESCE(NEW.reviewed_by, auth.uid()));

    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (NEW.requested_by, 'Stock received',
            'Your requested ' || NEW.quantity || ' units have been received into stock.',
            'request_received', '/items');
  END IF;
  RETURN NEW;
END;
$function$;
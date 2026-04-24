-- Make chat-attachments private to authenticated users
UPDATE storage.buckets SET public = false WHERE id = 'chat-attachments';

DROP POLICY IF EXISTS "Public read chat-attachments" ON storage.objects;

CREATE POLICY "Auth read chat-attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments');
-- 1. Stock level status
CREATE TYPE public.stock_status AS ENUM ('available','reserved','on_arrival','arrived','damaged');

ALTER TABLE public.stock_levels
  ADD COLUMN status public.stock_status NOT NULL DEFAULT 'available';

CREATE POLICY "Mgr+ update stock_levels status"
  ON public.stock_levels FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]));

-- 2. Telegram saved chats
CREATE TABLE public.telegram_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  chat_id bigint NOT NULL UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read telegram_chats" ON public.telegram_chats
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Mgr+ manage telegram_chats" ON public.telegram_chats
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]));

-- 3. Telegram messages (in & out)
CREATE TABLE public.telegram_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id bigint UNIQUE,
  message_id bigint,
  chat_id bigint NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  sender_user_id uuid,
  sender_name text,
  text text,
  attachment_url text,
  attachment_type text,
  attachment_name text,
  telegram_file_id text,
  raw jsonb,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tg_msgs_chat ON public.telegram_messages(chat_id, created_at DESC);
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read telegram_messages" ON public.telegram_messages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own outgoing messages" ON public.telegram_messages
  FOR INSERT TO authenticated
  WITH CHECK (direction = 'out' AND sender_user_id = auth.uid());
CREATE POLICY "Sender or admin can update (delete)" ON public.telegram_messages
  FOR UPDATE TO authenticated
  USING (sender_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (sender_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));

-- 4. Polling state singleton
CREATE TABLE public.telegram_bot_state (
  id int PRIMARY KEY CHECK (id = 1),
  update_offset bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.telegram_bot_state (id, update_offset) VALUES (1, 0);
ALTER TABLE public.telegram_bot_state ENABLE ROW LEVEL SECURITY;
-- no policies = service role only

-- 5. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.telegram_messages;
ALTER TABLE public.telegram_messages REPLICA IDENTITY FULL;

-- 6. Storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments','chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read chat-attachments" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat-attachments');
CREATE POLICY "Auth upload chat-attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');
CREATE POLICY "Admin delete chat-attachments" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat-attachments' AND public.has_role(auth.uid(),'admin'::app_role));
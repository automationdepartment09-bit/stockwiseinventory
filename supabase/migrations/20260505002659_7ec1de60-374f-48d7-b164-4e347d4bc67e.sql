-- Notification preferences
CREATE TABLE public.notification_preferences (
  user_id UUID PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'all',
  prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own prefs" ON public.notification_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own prefs" ON public.notification_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own prefs" ON public.notification_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own prefs" ON public.notification_preferences
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER touch_notif_prefs
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Allow users to delete their own notifications
CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
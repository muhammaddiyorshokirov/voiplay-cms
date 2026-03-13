-- App settings table for configurable limits
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage settings" ON public.app_settings
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can read settings" ON public.app_settings
  FOR SELECT USING (true);

-- Seed default settings
INSERT INTO public.app_settings (key, value, description) VALUES
  ('upload_limits', '{"max_video_mb": 350, "max_image_mb": 5}', 'Yuklash hajmi chegaralari'),
  ('content_limits', '{"max_content_per_day": 10, "max_episodes_per_day": 50}', 'Kunlik kontent limiti'),
  ('moderation', '{"enabled": true, "auto_publish": false}', 'Moderatsiya sozlamalari'),
  ('notifications', '{"notify_new_content": true, "notify_new_episode": true}', 'Bildirishnoma sozlamalari')
ON CONFLICT (key) DO NOTHING;
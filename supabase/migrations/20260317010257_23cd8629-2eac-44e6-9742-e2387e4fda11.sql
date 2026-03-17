
-- ========================================
-- Telegram Bot Integration Tables
-- ========================================

-- 1. Bot configuration (admin-only, stores token securely behind RLS)
CREATE TABLE public.telegram_bot_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bot_token text,
  bot_username text,
  is_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.telegram_bot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_bot_config" ON public.telegram_bot_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.telegram_bot_config (id) VALUES (1);

-- 2. Temporary link codes for CM telegram linking
CREATE TABLE public.telegram_link_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_codes" ON public.telegram_link_codes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "admin_view_codes" ON public.telegram_link_codes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Content maker to Telegram bot links
CREATE TABLE public.telegram_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  telegram_user_id bigint NOT NULL,
  telegram_chat_id bigint NOT NULL,
  telegram_username text,
  telegram_first_name text,
  my_notifications_enabled boolean NOT NULL DEFAULT true,
  conversation_state text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_select_tg_link" ON public.telegram_links
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "own_insert_tg_link" ON public.telegram_links
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_update_tg_link" ON public.telegram_links
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "own_delete_tg_link" ON public.telegram_links
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "admin_manage_tg_links" ON public.telegram_links
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Telegram channel links (CM channel <-> Telegram channel)
CREATE TABLE public.telegram_channel_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.content_maker_channels(id) ON DELETE CASCADE,
  telegram_channel_id bigint NOT NULL,
  telegram_channel_title text,
  telegram_channel_username text,
  channel_notifications_enabled boolean NOT NULL DEFAULT true,
  linked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel_id)
);

ALTER TABLE public.telegram_channel_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_select_ch_link" ON public.telegram_channel_links
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "own_insert_ch_link" ON public.telegram_channel_links
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_update_ch_link" ON public.telegram_channel_links
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "own_delete_ch_link" ON public.telegram_channel_links
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "admin_manage_ch_links" ON public.telegram_channel_links
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. Notification log
CREATE TABLE public.telegram_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL,
  target_chat_id bigint NOT NULL,
  user_id uuid,
  event_type text NOT NULL,
  content_id uuid,
  episode_id uuid,
  message_text text,
  telegram_message_id bigint,
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_notif_log" ON public.telegram_notification_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. Bot polling state (singleton)
CREATE TABLE public.telegram_bot_state (
  id int PRIMARY KEY CHECK (id = 1),
  update_offset bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_bot_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_bot_state" ON public.telegram_bot_state
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.telegram_bot_state (id, update_offset) VALUES (1, 0);

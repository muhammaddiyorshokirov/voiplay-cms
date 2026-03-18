-- Allow all authenticated users to read bot config (is_enabled, bot_username)
CREATE POLICY "authenticated_read_bot_config"
ON public.telegram_bot_config
FOR SELECT
TO authenticated
USING (true);

-- Drop the old ALL policy and replace with admin-only INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "admins_manage_bot_config" ON public.telegram_bot_config;

CREATE POLICY "admins_manage_bot_config"
ON public.telegram_bot_config
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
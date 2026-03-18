ALTER TABLE public.telegram_links 
ADD COLUMN IF NOT EXISTS last_menu_message_id bigint DEFAULT NULL;
ALTER TYPE public.content_request_type ADD VALUE IF NOT EXISTS 'episode';

ALTER TABLE public.content_requests
  ADD COLUMN IF NOT EXISTS season_id uuid REFERENCES public.seasons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS episode_number integer,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS stream_url text,
  ADD COLUMN IF NOT EXISTS subtitle_url text,
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS intro_start_seconds integer,
  ADD COLUMN IF NOT EXISTS intro_end_seconds integer,
  ADD COLUMN IF NOT EXISTS release_date date,
  ADD COLUMN IF NOT EXISTS premium_unlock_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_comment_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_downloadable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_telegram_file_id text,
  ADD COLUMN IF NOT EXISTS source_telegram_file_path text,
  ADD COLUMN IF NOT EXISTS media_processing_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS media_processing_notes text;

CREATE INDEX IF NOT EXISTS idx_content_requests_episode_lookup
  ON public.content_requests (request_type, content_id, season_id, episode_number);

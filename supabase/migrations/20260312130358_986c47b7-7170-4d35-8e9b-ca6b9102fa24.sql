
-- Content requests table for CM submissions
CREATE TYPE public.content_request_type AS ENUM ('content', 'season');
CREATE TYPE public.content_request_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.content_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_type public.content_request_type NOT NULL DEFAULT 'content',
  status public.content_request_status NOT NULL DEFAULT 'pending',
  requested_by UUID NOT NULL,
  channel_id UUID REFERENCES public.content_maker_channels(id) ON DELETE CASCADE NOT NULL,
  
  -- Content fields (used when request_type = 'content')
  title TEXT,
  alternative_title TEXT,
  content_type public.content_type,
  description TEXT,
  year INTEGER,
  country TEXT,
  studio TEXT,
  age_rating TEXT,
  total_episodes INTEGER,
  total_seasons INTEGER,
  has_dub BOOLEAN DEFAULT false,
  has_subtitle BOOLEAN DEFAULT false,
  poster_url TEXT,
  banner_url TEXT,
  thumbnail_url TEXT,
  trailer_url TEXT,
  
  -- Season fields (used when request_type = 'season')
  content_id UUID REFERENCES public.contents(id) ON DELETE SET NULL,
  season_number INTEGER,
  season_title TEXT,
  season_description TEXT,
  
  -- Admin response
  admin_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.content_requests ENABLE ROW LEVEL SECURITY;

-- CMs can insert their own requests
CREATE POLICY "CMs can insert own requests"
ON public.content_requests FOR INSERT TO authenticated
WITH CHECK (
  requested_by = auth.uid() 
  AND has_role(auth.uid(), 'content_maker')
);

-- CMs can view their own requests
CREATE POLICY "CMs can view own requests"
ON public.content_requests FOR SELECT TO authenticated
USING (
  requested_by = auth.uid() 
  OR has_role(auth.uid(), 'admin')
);

-- CMs can update their own pending requests
CREATE POLICY "CMs can update own pending requests"
ON public.content_requests FOR UPDATE TO authenticated
USING (
  (requested_by = auth.uid() AND status = 'pending')
  OR has_role(auth.uid(), 'admin')
);

-- Only admins can delete requests
CREATE POLICY "Admins can delete requests"
ON public.content_requests FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'));

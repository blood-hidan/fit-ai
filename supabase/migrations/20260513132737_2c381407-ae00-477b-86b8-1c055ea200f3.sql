
CREATE TABLE public.stories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  caption TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX stories_user_idx ON public.stories(user_id);
CREATE INDEX stories_active_idx ON public.stories(expires_at);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active stories viewable by everyone"
  ON public.stories FOR SELECT
  USING (expires_at > now());

CREATE POLICY "Users insert own stories"
  ON public.stories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own stories"
  ON public.stories FOR DELETE
  USING (auth.uid() = user_id);

CREATE TABLE public.story_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(story_id, viewer_id)
);

ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Viewer or owner can see views"
  ON public.story_views FOR SELECT
  USING (
    auth.uid() = viewer_id
    OR EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id AND s.user_id = auth.uid())
  );

CREATE POLICY "Users insert own views"
  ON public.story_views FOR INSERT
  WITH CHECK (auth.uid() = viewer_id);

CREATE TABLE IF NOT EXISTS public.smartwatch_samples (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source TEXT NOT NULL,
  metric TEXT NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX smartwatch_user_idx ON public.smartwatch_samples(user_id, recorded_at DESC);
ALTER TABLE public.smartwatch_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own samples" ON public.smartwatch_samples FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own samples" ON public.smartwatch_samples FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own samples" ON public.smartwatch_samples FOR DELETE USING (auth.uid() = user_id);

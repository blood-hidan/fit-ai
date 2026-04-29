-- 1) Avatars storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatars publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own avatar"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own avatar"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 2) Post reports table
CREATE TABLE public.post_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  reason text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

ALTER TABLE public.post_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own reports"
ON public.post_reports FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users see own reports"
ON public.post_reports FOR SELECT
USING (auth.uid() = user_id);

-- 3) Runs (GPS tracking)
CREATE TABLE public.runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Corrida',
  distance_m numeric NOT NULL DEFAULT 0,
  duration_s integer NOT NULL DEFAULT 0,
  avg_pace_s_per_km numeric,
  calories integer,
  path jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own runs"
ON public.runs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own runs"
ON public.runs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own runs"
ON public.runs FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own runs"
ON public.runs FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX idx_runs_user_created ON public.runs(user_id, created_at DESC);
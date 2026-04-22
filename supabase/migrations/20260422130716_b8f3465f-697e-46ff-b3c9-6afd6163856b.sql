-- POSTS
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  caption TEXT DEFAULT '',
  media_url TEXT,
  media_type TEXT CHECK (media_type IN ('image','video','none')) DEFAULT 'none',
  original_post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  reposts_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Posts viewable by everyone" ON public.posts FOR SELECT USING (true);
CREATE POLICY "Users insert own posts" ON public.posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own posts" ON public.posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own posts" ON public.posts FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_posts_created ON public.posts(created_at DESC);
CREATE INDEX idx_posts_user ON public.posts(user_id);

-- LIKES
CREATE TABLE public.post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes viewable by everyone" ON public.post_likes FOR SELECT USING (true);
CREATE POLICY "Users insert own likes" ON public.post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own likes" ON public.post_likes FOR DELETE USING (auth.uid() = user_id);

-- COMMENTS
CREATE TABLE public.post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments viewable by everyone" ON public.post_comments FOR SELECT USING (true);
CREATE POLICY "Users insert own comments" ON public.post_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own comments" ON public.post_comments FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_comments_post ON public.post_comments(post_id, created_at);

-- COUNTER TRIGGERS
CREATE OR REPLACE FUNCTION public.bump_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_post_likes_count
AFTER INSERT OR DELETE ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.bump_likes_count();

CREATE OR REPLACE FUNCTION public.bump_comments_count()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_post_comments_count
AFTER INSERT OR DELETE ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.bump_comments_count();

CREATE OR REPLACE FUNCTION public.bump_reposts_count()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.original_post_id IS NOT NULL THEN
    UPDATE public.posts SET reposts_count = reposts_count + 1 WHERE id = NEW.original_post_id;
  ELSIF TG_OP = 'DELETE' AND OLD.original_post_id IS NOT NULL THEN
    UPDATE public.posts SET reposts_count = GREATEST(reposts_count - 1, 0) WHERE id = OLD.original_post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_post_reposts_count
AFTER INSERT OR DELETE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.bump_reposts_count();

-- STORAGE
INSERT INTO storage.buckets (id, name, public) VALUES ('community-media', 'community-media', true);

CREATE POLICY "Community media public read" ON storage.objects
FOR SELECT USING (bucket_id = 'community-media');

CREATE POLICY "Users upload own community media" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'community-media' AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users update own community media" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'community-media' AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users delete own community media" ON storage.objects
FOR DELETE USING (
  bucket_id = 'community-media' AND auth.uid()::text = (storage.foldername(name))[1]
);
-- Restrict mutable columns and keep trigger-maintained counters server-owned.
DROP POLICY IF EXISTS "Users update own posts" ON public.posts;
REVOKE UPDATE ON TABLE public.posts FROM PUBLIC, anon, authenticated;
REVOKE INSERT ON TABLE public.posts FROM PUBLIC, anon, authenticated;
GRANT INSERT (user_id, caption, media_url, media_type, original_post_id)
  ON TABLE public.posts TO authenticated;

DROP POLICY IF EXISTS "Users insert own posts" ON public.posts;
CREATE POLICY "Users insert own posts"
  ON public.posts FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (
      media_url IS NULL
      OR (
        original_post_id IS NULL
        AND (storage.foldername(media_url))[1] = (SELECT auth.uid())::text
      )
      OR (
        original_post_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.posts p
          JOIN public.profiles author ON author.user_id = p.user_id
          WHERE p.id = posts.original_post_id
            AND p.media_url = posts.media_url
            AND NOT author.is_private
        )
      )
    )
    AND (
      original_post_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.posts p
        JOIN public.profiles author ON author.user_id = p.user_id
        WHERE p.id = posts.original_post_id
          AND NOT author.is_private
      )
    )
  );

DROP POLICY IF EXISTS "Users insert own likes" ON public.post_likes;
CREATE POLICY "Users insert own likes"
  ON public.post_likes FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_likes.post_id)
  );

DROP POLICY IF EXISTS "Users insert own comments" ON public.post_comments;
CREATE POLICY "Users insert own comments"
  ON public.post_comments FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_comments.post_id)
  );
ALTER TABLE public.post_comments
  ADD CONSTRAINT post_comments_content_length_check
  CHECK (char_length(content) BETWEEN 1 AND 2000) NOT VALID;

DROP POLICY IF EXISTS "Users insert own stories" ON public.stories;
CREATE POLICY "Users insert own stories"
  ON public.stories FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND expires_at > now()
    AND expires_at <= now() + interval '24 hours'
    AND media_type IN ('image', 'video')
    AND (storage.foldername(media_url))[1] = (SELECT auth.uid())::text
  );

CREATE OR REPLACE FUNCTION public.bump_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_comments_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_reposts_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.original_post_id IS NOT NULL THEN
    UPDATE public.posts SET reposts_count = reposts_count + 1 WHERE id = NEW.original_post_id;
  ELSIF TG_OP = 'DELETE' AND OLD.original_post_id IS NOT NULL THEN
    UPDATE public.posts SET reposts_count = GREATEST(reposts_count - 1, 0) WHERE id = OLD.original_post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Only the followed account may change the follow request's status.
DROP POLICY IF EXISTS "Followed user accepts requests" ON public.follows;
CREATE POLICY "Followed user accepts requests"
  ON public.follows FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = following_id)
  WITH CHECK ((SELECT auth.uid()) = following_id);
REVOKE UPDATE ON TABLE public.follows FROM PUBLIC, anon, authenticated;
GRANT UPDATE (status) ON TABLE public.follows TO authenticated;

-- Conversation membership is immutable to clients. The trigger remains responsible
-- for advancing last_message_at when a new message is inserted.
DROP POLICY IF EXISTS "Conv participants update" ON public.conversations;
REVOKE UPDATE ON TABLE public.conversations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bump_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

-- Recipients can mark a notification read without changing its actor or target.
DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users mark own notifications read"
  ON public.notifications FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
REVOKE UPDATE ON TABLE public.notifications FROM PUBLIC, anon, authenticated;
GRANT UPDATE (read) ON TABLE public.notifications TO authenticated;

-- A view can be recorded only for a currently visible story.
DROP POLICY IF EXISTS "Users insert own views" ON public.story_views;
CREATE POLICY "Users insert views for visible stories"
  ON public.story_views FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = viewer_id
    AND EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id AND s.expires_at > now()
    )
  );

-- Storage validates the upload size and MIME type on the server side.
UPDATE storage.buckets
SET file_size_limit = 26214400,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
WHERE id = 'community-media';

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'avatars';

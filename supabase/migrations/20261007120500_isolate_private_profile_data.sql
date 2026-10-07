-- Keep health and body measurements out of the publicly readable profile row.
CREATE TABLE public.profile_private (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  age INTEGER DEFAULT 25,
  weight NUMERIC DEFAULT 70,
  height NUMERIC DEFAULT 170,
  sleep_hours NUMERIC DEFAULT 7,
  sleep_quality TEXT DEFAULT 'boa',
  allergies TEXT DEFAULT '',
  dietary_restrictions TEXT DEFAULT ''
);

INSERT INTO public.profile_private (
  user_id, age, weight, height, sleep_hours, sleep_quality, allergies, dietary_restrictions
)
SELECT user_id, age, weight, height, sleep_hours, sleep_quality, allergies, dietary_restrictions
FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.profiles
  DROP COLUMN age,
  DROP COLUMN weight,
  DROP COLUMN height,
  DROP COLUMN sleep_hours,
  DROP COLUMN sleep_quality,
  DROP COLUMN allergies,
  DROP COLUMN dietary_restrictions;

-- Apply the private-account setting at the database boundary as well as in the UI.
DROP POLICY IF EXISTS "Posts viewable by everyone" ON public.posts;
CREATE POLICY "Posts visible to profile owner or accepted followers"
  ON public.posts FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = posts.user_id
        AND (
          NOT p.is_private
          OR p.user_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.follows f
            WHERE f.follower_id = (SELECT auth.uid())
              AND f.following_id = p.user_id
              AND f.status = 'accepted'
          )
        )
    )
  );

DROP POLICY IF EXISTS "Active stories viewable by everyone" ON public.stories;
CREATE POLICY "Active stories visible to profile owner or accepted followers"
  ON public.stories FOR SELECT TO anon, authenticated
  USING (
    expires_at > now()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = stories.user_id
        AND (
          NOT p.is_private
          OR p.user_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.follows f
            WHERE f.follower_id = (SELECT auth.uid())
              AND f.following_id = p.user_id
              AND f.status = 'accepted'
          )
        )
    )
  );

DROP POLICY IF EXISTS "Comments viewable by everyone" ON public.post_comments;
CREATE POLICY "Comments visible with their post"
  ON public.post_comments FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_comments.post_id));

DROP POLICY IF EXISTS "Likes viewable by everyone" ON public.post_likes;
CREATE POLICY "Likes visible with their post"
  ON public.post_likes FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_likes.post_id));
ALTER TABLE public.profile_private ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.profile_private FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profile_private TO authenticated;

CREATE POLICY "Users can view own private profile data"
  ON public.profile_private FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can insert own private profile data"
  ON public.profile_private FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can update own private profile data"
  ON public.profile_private FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can delete own private profile data"
  ON public.profile_private FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.create_private_profile_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profile_private (user_id) VALUES (NEW.user_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.create_private_profile_row() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER create_private_profile_after_insert
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.create_private_profile_row();


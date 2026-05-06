
-- ============ PROFILES additions ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;

-- backfill usernames from name where missing (slugified, ensure unique)
UPDATE public.profiles
SET username = LOWER(REGEXP_REPLACE(COALESCE(NULLIF(name,''), 'user'), '[^a-zA-Z0-9_]+', '_', 'g')) || '_' || SUBSTRING(user_id::text, 1, 6)
WHERE username IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON public.profiles (LOWER(username));
CREATE INDEX IF NOT EXISTS profiles_user_id_idx ON public.profiles(user_id);

-- update handle_new_user to set username
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  counter INT := 0;
BEGIN
  base_username := LOWER(REGEXP_REPLACE(
    COALESCE(NEW.raw_user_meta_data->>'username',
             NEW.raw_user_meta_data->>'name',
             NEW.raw_user_meta_data->>'full_name',
             split_part(NEW.email, '@', 1)),
    '[^a-zA-Z0-9_]+', '_', 'g'
  ));
  IF base_username IS NULL OR base_username = '' THEN base_username := 'user'; END IF;
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(username) = LOWER(final_username)) LOOP
    counter := counter + 1;
    final_username := base_username || '_' || counter;
  END LOOP;

  INSERT INTO public.profiles (user_id, name, username, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    final_username,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ FOLLOWS ============
CREATE TABLE IF NOT EXISTS public.follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL,
  following_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('pending','accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX IF NOT EXISTS follows_follower_idx ON public.follows(follower_id, status);
CREATE INDEX IF NOT EXISTS follows_following_idx ON public.follows(following_id, status);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Follows viewable by everyone" ON public.follows;
CREATE POLICY "Follows viewable by everyone" ON public.follows FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users follow others" ON public.follows;
CREATE POLICY "Users follow others" ON public.follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Followed user accepts requests" ON public.follows;
CREATE POLICY "Followed user accepts requests" ON public.follows FOR UPDATE
  USING (auth.uid() = following_id);

DROP POLICY IF EXISTS "Users unfollow" ON public.follows;
CREATE POLICY "Users unfollow" ON public.follows FOR DELETE
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

-- helper: mutual follow check
CREATE OR REPLACE FUNCTION public.are_mutual_followers(_a UUID, _b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.follows
    WHERE follower_id = _a AND following_id = _b AND status = 'accepted'
  ) AND EXISTS (
    SELECT 1 FROM public.follows
    WHERE follower_id = _b AND following_id = _a AND status = 'accepted'
  );
$$;

-- ============ CONVERSATIONS ============
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID NOT NULL,
  user2_id UUID NOT NULL,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user1_id < user2_id),
  UNIQUE (user1_id, user2_id)
);
CREATE INDEX IF NOT EXISTS conv_user1_idx ON public.conversations(user1_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS conv_user2_idx ON public.conversations(user2_id, last_message_at DESC);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Conv participants select" ON public.conversations;
CREATE POLICY "Conv participants select" ON public.conversations FOR SELECT
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

DROP POLICY IF EXISTS "Mutual followers create conv" ON public.conversations;
CREATE POLICY "Mutual followers create conv" ON public.conversations FOR INSERT
  WITH CHECK (
    (auth.uid() = user1_id OR auth.uid() = user2_id)
    AND public.are_mutual_followers(user1_id, user2_id)
  );

DROP POLICY IF EXISTS "Conv participants update" ON public.conversations;
CREATE POLICY "Conv participants update" ON public.conversations FOR UPDATE
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- get or create conversation helper (handles ordering)
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(_other_user UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := auth.uid();
  u1 UUID;
  u2 UUID;
  conv_id UUID;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF me = _other_user THEN RAISE EXCEPTION 'Cannot DM yourself'; END IF;
  IF NOT public.are_mutual_followers(me, _other_user) THEN
    RAISE EXCEPTION 'Users must follow each other';
  END IF;
  IF me < _other_user THEN u1 := me; u2 := _other_user;
  ELSE u1 := _other_user; u2 := me; END IF;

  SELECT id INTO conv_id FROM public.conversations WHERE user1_id = u1 AND user2_id = u2;
  IF conv_id IS NULL THEN
    INSERT INTO public.conversations (user1_id, user2_id) VALUES (u1, u2) RETURNING id INTO conv_id;
  END IF;
  RETURN conv_id;
END;
$$;

-- ============ MESSAGES ============
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conv_idx ON public.messages(conversation_id, created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conv UUID, _user UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = _conv AND (user1_id = _user OR user2_id = _user)
  );
$$;

DROP POLICY IF EXISTS "Participants select messages" ON public.messages;
CREATE POLICY "Participants select messages" ON public.messages FOR SELECT
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Participants send messages" ON public.messages;
CREATE POLICY "Participants send messages" ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND public.is_conversation_participant(conversation_id, auth.uid())
  );

DROP POLICY IF EXISTS "Participants mark read" ON public.messages;
CREATE POLICY "Participants mark read" ON public.messages FOR UPDATE
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

-- bump last_message_at on insert
CREATE OR REPLACE FUNCTION public.bump_conversation_last_message()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS messages_bump_conv ON public.messages;
CREATE TRIGGER messages_bump_conv AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_last_message();

-- ============ NOTIFICATIONS ============
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  actor_id UUID,
  type TEXT NOT NULL CHECK (type IN ('follow','follow_request','follow_accepted','like','comment','message')),
  entity_id UUID,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notif_user_idx ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own notifications" ON public.notifications;
CREATE POLICY "Users see own notifications" ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System inserts notifications" ON public.notifications;
CREATE POLICY "System inserts notifications" ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = actor_id OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
CREATE POLICY "Users delete own notifications" ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- triggers to auto-create notifications
CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, actor_id, type, entity_id)
  VALUES (NEW.following_id, NEW.follower_id,
    CASE WHEN NEW.status = 'pending' THEN 'follow_request' ELSE 'follow' END,
    NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS follows_notify ON public.follows;
CREATE TRIGGER follows_notify AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();

CREATE OR REPLACE FUNCTION public.notify_on_follow_accept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    INSERT INTO public.notifications (user_id, actor_id, type, entity_id)
    VALUES (NEW.follower_id, NEW.following_id, 'follow_accepted', NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS follows_notify_accept ON public.follows;
CREATE TRIGGER follows_notify_accept AFTER UPDATE ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow_accept();

CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE post_owner UUID;
BEGIN
  SELECT user_id INTO post_owner FROM public.posts WHERE id = NEW.post_id;
  IF post_owner IS NOT NULL AND post_owner <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, entity_id)
    VALUES (post_owner, NEW.user_id, 'like', NEW.post_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS likes_notify ON public.post_likes;
CREATE TRIGGER likes_notify AFTER INSERT ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_like();

CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE post_owner UUID;
BEGIN
  SELECT user_id INTO post_owner FROM public.posts WHERE id = NEW.post_id;
  IF post_owner IS NOT NULL AND post_owner <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, entity_id)
    VALUES (post_owner, NEW.user_id, 'comment', NEW.post_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS comments_notify ON public.post_comments;
CREATE TRIGGER comments_notify AFTER INSERT ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recipient UUID;
BEGIN
  SELECT CASE WHEN user1_id = NEW.sender_id THEN user2_id ELSE user1_id END
    INTO recipient FROM public.conversations WHERE id = NEW.conversation_id;
  IF recipient IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, actor_id, type, entity_id)
    VALUES (recipient, NEW.sender_id, 'message', NEW.conversation_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS messages_notify ON public.messages;
CREATE TRIGGER messages_notify AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_message();

-- ============ REALTIME ============
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.follows REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.follows;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

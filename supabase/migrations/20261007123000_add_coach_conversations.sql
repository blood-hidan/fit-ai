CREATE TABLE public.coach_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Nova conversa' CHECK (char_length(title) BETWEEN 1 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.coach_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own coach conversations"
  ON public.coach_conversations FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE INDEX coach_conversations_user_updated_idx
  ON public.coach_conversations(user_id, updated_at DESC);

ALTER TABLE public.chat_messages
  ADD COLUMN conversation_id UUID REFERENCES public.coach_conversations(id) ON DELETE CASCADE;

-- Keep existing history in a single thread per user during upgrades.
INSERT INTO public.coach_conversations (user_id, title, created_at, updated_at)
SELECT user_id, 'Conversa anterior', min(created_at), max(created_at)
FROM public.chat_messages
GROUP BY user_id
ON CONFLICT DO NOTHING;

UPDATE public.chat_messages m
SET conversation_id = c.id
FROM public.coach_conversations c
WHERE c.user_id = m.user_id AND m.conversation_id IS NULL;

ALTER TABLE public.chat_messages ALTER COLUMN conversation_id SET NOT NULL;
CREATE INDEX chat_messages_conversation_created_idx
  ON public.chat_messages(conversation_id, created_at);

DROP POLICY IF EXISTS "Users insert own messages" ON public.chat_messages;
CREATE POLICY "Users insert own coach messages"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id AND role = 'user'
    AND EXISTS (
      SELECT 1 FROM public.coach_conversations c
      WHERE c.id = conversation_id AND c.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users see own messages" ON public.chat_messages;
CREATE POLICY "Users see own coach messages"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.coach_conversations c
      WHERE c.id = conversation_id AND c.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users delete own messages" ON public.chat_messages;
CREATE POLICY "Users delete own coach messages"
  ON public.chat_messages FOR DELETE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.coach_conversations c
      WHERE c.id = conversation_id AND c.user_id = (SELECT auth.uid())
    )
  );

REVOKE UPDATE ON TABLE public.chat_messages FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.touch_coach_conversation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.coach_conversations SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER chat_message_touches_coach_conversation
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_coach_conversation();

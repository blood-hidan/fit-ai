-- Prevent users from forging notifications for other accounts.
-- Notification rows are created by SECURITY DEFINER triggers below.
DROP POLICY IF EXISTS "System inserts notifications" ON public.notifications;

-- Participants may only update read_at on messages sent by the other participant.
-- Column privileges prevent changing content, sender_id, conversation_id, or timestamps.
DROP POLICY IF EXISTS "Participants mark read" ON public.messages;
CREATE POLICY "Recipients mark messages read"
  ON public.messages FOR UPDATE TO authenticated
  USING (
    public.is_conversation_participant(conversation_id, (SELECT auth.uid()))
    AND sender_id <> (SELECT auth.uid())
  )
  WITH CHECK (
    public.is_conversation_participant(conversation_id, (SELECT auth.uid()))
    AND sender_id <> (SELECT auth.uid())
  );

REVOKE UPDATE ON TABLE public.messages FROM PUBLIC, anon, authenticated;
GRANT UPDATE (read_at) ON TABLE public.messages TO authenticated;


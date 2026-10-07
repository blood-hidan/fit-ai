CREATE TABLE private.ai_usage_limits (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL CHECK (endpoint IN ('chat-fitness', 'generate-nutrition')),
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (user_id, endpoint)
);

REVOKE ALL ON TABLE private.ai_usage_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_ai_rate_limit(p_endpoint TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_limit INTEGER;
  v_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  v_limit := CASE p_endpoint
    WHEN 'chat-fitness' THEN 30
    WHEN 'generate-nutrition' THEN 5
    ELSE NULL
  END;
  IF v_limit IS NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO private.ai_usage_limits (user_id, endpoint, window_started_at, request_count)
  VALUES (v_user_id, p_endpoint, now(), 1)
  ON CONFLICT (user_id, endpoint) DO UPDATE
  SET window_started_at = CASE
        WHEN private.ai_usage_limits.window_started_at <= now() - interval '1 hour' THEN now()
        ELSE private.ai_usage_limits.window_started_at
      END,
      request_count = CASE
        WHEN private.ai_usage_limits.window_started_at <= now() - interval '1 hour' THEN 1
        ELSE private.ai_usage_limits.request_count + 1
      END
  RETURNING request_count INTO v_count;

  RETURN v_count <= v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_rate_limit(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_rate_limit(TEXT) TO authenticated;

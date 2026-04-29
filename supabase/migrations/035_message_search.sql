-- Migration 035: Message content search
--
-- Adds full-text-style search across messages the user can read.
-- pg_trgm provides fuzzy substring matching with a GIN index for speed.
-- RLS handles access control (SECURITY INVOKER), so messages table policies
-- naturally restrict the result set to conversations the caller is a member of.
--
-- Behavior:
--   - Min query length: 3 chars (matches when trigram index is most efficient)
--   - User-supplied wildcards (%, _, \) are escaped before being passed to ILIKE
--   - Substring match (ILIKE) determines what's IN the results
--   - word_similarity ranks within those results (most relevant first), tiebroken by recency
--   - LIMIT 50 caps result size

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_messages_body_trgm
  ON public.messages USING gin (body gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_my_messages(p_query text)
RETURNS TABLE (
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  rank real
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_query_clean text;
  v_query_escaped text;
BEGIN
  IF p_query IS NULL THEN
    RETURN;
  END IF;

  v_query_clean := trim(p_query);

  IF length(v_query_clean) < 3 THEN
    RETURN;
  END IF;

  -- Escape ILIKE wildcards: \ first (so we don't double-escape), then % and _
  v_query_escaped := replace(replace(replace(v_query_clean, '\', '\\'), '%', '\%'), '_', '\_');

  RETURN QUERY
  SELECT
    m.id           AS message_id,
    m.conversation_id,
    m.sender_id,
    m.body,
    m.created_at,
    word_similarity(v_query_clean, m.body) AS rank
  FROM messages m
  WHERE m.body ILIKE '%' || v_query_escaped || '%' ESCAPE '\'
  ORDER BY rank DESC, m.created_at DESC
  LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_my_messages(text) TO authenticated;

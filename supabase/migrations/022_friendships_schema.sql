-- Friendship/connection table.
-- One row per relationship. Status flips pending → accepted; row deleted on decline, retract, or unfriend.

CREATE TABLE IF NOT EXISTS public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  accepted_at timestamptz,
  CONSTRAINT no_self_friendship CHECK (requester_id != recipient_id),
  CONSTRAINT unique_pair UNIQUE (requester_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS friendships_requester_idx
  ON public.friendships(requester_id, status);
CREATE INDEX IF NOT EXISTS friendships_recipient_idx
  ON public.friendships(recipient_id, status);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view friendships involving them"
  ON public.friendships FOR SELECT
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

CREATE POLICY "Users can send connect requests"
  ON public.friendships FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = requester_id
    AND status = 'pending'
  );

CREATE POLICY "Recipients can accept requests"
  ON public.friendships FOR UPDATE
  TO authenticated
  USING (auth.uid() = recipient_id AND status = 'pending')
  WITH CHECK (status = 'accepted' AND recipient_id = auth.uid());

CREATE POLICY "Either party can delete"
  ON public.friendships FOR DELETE
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

-- RPC: are two users connected (status accepted)?
CREATE OR REPLACE FUNCTION public.are_connected(other_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR other_user_id IS NULL THEN RETURN false; END IF;
  IF v_user_id = other_user_id THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
      AND (
        (requester_id = v_user_id AND recipient_id = other_user_id)
        OR (requester_id = other_user_id AND recipient_id = v_user_id)
      )
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.are_connected(uuid) TO authenticated;

-- RPC: connection status with another user
-- Returns: 'none', 'pending_outgoing', 'pending_incoming', or 'connected'
-- Drives the button state on profile views
CREATE OR REPLACE FUNCTION public.connection_status(other_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row record;
BEGIN
  IF v_user_id IS NULL OR other_user_id IS NULL THEN RETURN 'none'; END IF;
  IF v_user_id = other_user_id THEN RETURN 'self'; END IF;

  SELECT requester_id, recipient_id, status INTO v_row
  FROM friendships
  WHERE (requester_id = v_user_id AND recipient_id = other_user_id)
     OR (requester_id = other_user_id AND recipient_id = v_user_id);

  IF v_row IS NULL THEN RETURN 'none'; END IF;
  IF v_row.status = 'accepted' THEN RETURN 'connected'; END IF;
  IF v_row.requester_id = v_user_id THEN RETURN 'pending_outgoing'; END IF;
  RETURN 'pending_incoming';
END;
$$;
GRANT EXECUTE ON FUNCTION public.connection_status(uuid) TO authenticated;

-- RPC: pending incoming requests (for the friend row + accept UI)
CREATE OR REPLACE FUNCTION public.pending_connect_requests()
RETURNS TABLE (
  id uuid,
  requester_id uuid,
  username text,
  avatar_diamond_url text,
  avatar_url text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT f.id, f.requester_id, p.username, p.avatar_diamond_url, p.avatar_url, f.created_at
  FROM friendships f
  JOIN profiles p ON p.id = f.requester_id
  WHERE f.recipient_id = v_user_id AND f.status = 'pending'
  ORDER BY f.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.pending_connect_requests() TO authenticated;

-- RPC: count pending incoming for the YOU nav badge
CREATE OR REPLACE FUNCTION public.pending_connect_request_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN RETURN 0; END IF;
  SELECT COUNT(*) INTO v_count FROM friendships
  WHERE recipient_id = v_user_id AND status = 'pending';
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.pending_connect_request_count() TO authenticated;

-- RPC: list a user's connections (privacy-aware: only the user themselves or their connections can see the list)
CREATE OR REPLACE FUNCTION public.list_connections(target_user_id uuid)
RETURNS TABLE (
  id uuid,
  username text,
  avatar_diamond_url text,
  avatar_url text,
  connected_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR target_user_id IS NULL THEN RETURN; END IF;
  IF target_user_id != v_user_id AND NOT public.are_connected(target_user_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT
    p.id, p.username, p.avatar_diamond_url, p.avatar_url, f.accepted_at
  FROM friendships f
  JOIN profiles p ON p.id = CASE
    WHEN f.requester_id = target_user_id THEN f.recipient_id
    ELSE f.requester_id
  END
  WHERE f.status = 'accepted'
    AND (f.requester_id = target_user_id OR f.recipient_id = target_user_id)
  ORDER BY f.accepted_at DESC NULLS LAST;
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_connections(uuid) TO authenticated;

-- Add to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'friendships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
  END IF;
END $$;

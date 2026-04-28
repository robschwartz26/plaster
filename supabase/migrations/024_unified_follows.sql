-- Drop old fragmented tables
DROP TABLE IF EXISTS public.friendships CASCADE;
DROP TABLE IF EXISTS public.follows CASCADE;
DROP TABLE IF EXISTS public.venue_follows CASCADE;

-- Drop RPCs from previous design iterations
DROP FUNCTION IF EXISTS public.are_connected(uuid);
DROP FUNCTION IF EXISTS public.connection_status(uuid);
DROP FUNCTION IF EXISTS public.pending_connect_requests();
DROP FUNCTION IF EXISTS public.pending_connect_request_count();
DROP FUNCTION IF EXISTS public.list_connections(uuid);

-- Unified follows table.
-- For person targets: status='pending' until target accepts, then 'accepted'.
-- For artist/venue targets: status auto-set to 'accepted' on insert (public, no approval).
CREATE TABLE public.follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  accepted_at timestamptz,
  CONSTRAINT no_self_follow CHECK (follower_id != following_id),
  CONSTRAINT unique_pair UNIQUE (follower_id, following_id)
);

CREATE INDEX follows_follower_idx ON public.follows(follower_id, status);
CREATE INDEX follows_following_idx ON public.follows(following_id, status);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view follows involving them"
  ON public.follows FOR SELECT
  TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

CREATE POLICY "Users can create follows"
  ON public.follows FOR INSERT
  TO authenticated
  WITH CHECK (follower_id = auth.uid());

CREATE POLICY "Recipients can accept pending follows"
  ON public.follows FOR UPDATE
  TO authenticated
  USING (auth.uid() = following_id AND status = 'pending')
  WITH CHECK (status = 'accepted' AND following_id = auth.uid());

CREATE POLICY "Either party can delete"
  ON public.follows FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

-- Trigger: auto-accept follows targeting artists or venues.
-- Person targets stay pending until manual approval.
CREATE OR REPLACE FUNCTION public.handle_follow_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_type text;
BEGIN
  SELECT account_type INTO v_target_type FROM profiles WHERE id = NEW.following_id;
  IF v_target_type IN ('artist', 'venue') THEN
    NEW.status := 'accepted';
    NEW.accepted_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER follows_before_insert_auto_accept
  BEFORE INSERT ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_follow_insert();

-- RPC: relationship status with another user.
-- Returns: 'self', 'none', 'pending_outgoing', or 'following'.
CREATE OR REPLACE FUNCTION public.follow_status(other_user_id uuid)
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

  SELECT status INTO v_row FROM follows
  WHERE follower_id = v_user_id AND following_id = other_user_id;

  IF v_row IS NULL THEN RETURN 'none'; END IF;
  IF v_row.status = 'pending' THEN RETURN 'pending_outgoing'; END IF;
  RETURN 'following';
END;
$$;
GRANT EXECUTE ON FUNCTION public.follow_status(uuid) TO authenticated;

-- RPC: are two persons mutually following each other?
-- Used for profile-clickability gating on PERSON-type profiles only.
CREATE OR REPLACE FUNCTION public.are_mutual_follows(other_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR other_user_id IS NULL THEN RETURN false; END IF;
  IF v_user_id = other_user_id THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM follows WHERE follower_id = v_user_id AND following_id = other_user_id AND status = 'accepted'
  ) AND EXISTS (
    SELECT 1 FROM follows WHERE follower_id = other_user_id AND following_id = v_user_id AND status = 'accepted'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.are_mutual_follows(uuid) TO authenticated;

-- RPC: pending incoming follow requests (only persons receive these)
CREATE OR REPLACE FUNCTION public.pending_follow_requests()
RETURNS TABLE (
  id uuid,
  follower_id uuid,
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
  SELECT f.id, f.follower_id, p.username, p.avatar_diamond_url, p.avatar_url, f.created_at
  FROM follows f
  JOIN profiles p ON p.id = f.follower_id
  WHERE f.following_id = v_user_id AND f.status = 'pending'
  ORDER BY f.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.pending_follow_requests() TO authenticated;

-- RPC: count for the YOU nav badge
CREATE OR REPLACE FUNCTION public.pending_follow_request_count()
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
  SELECT COUNT(*) INTO v_count FROM follows WHERE following_id = v_user_id AND status = 'pending';
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.pending_follow_request_count() TO authenticated;

-- RPC: list followers of target. For persons, gated to mutual follows + self.
CREATE OR REPLACE FUNCTION public.list_followers(target_user_id uuid)
RETURNS TABLE (
  id uuid,
  username text,
  avatar_diamond_url text,
  avatar_url text,
  followed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_target_type text;
BEGIN
  IF v_user_id IS NULL OR target_user_id IS NULL THEN RETURN; END IF;

  SELECT account_type INTO v_target_type FROM profiles WHERE id = target_user_id;

  IF v_target_type = 'person' AND target_user_id != v_user_id THEN
    IF NOT public.are_mutual_follows(target_user_id) THEN RETURN; END IF;
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.avatar_diamond_url, p.avatar_url, f.accepted_at
  FROM follows f
  JOIN profiles p ON p.id = f.follower_id
  WHERE f.following_id = target_user_id AND f.status = 'accepted'
  ORDER BY f.accepted_at DESC NULLS LAST;
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_followers(uuid) TO authenticated;

-- RPC: list who target is following
CREATE OR REPLACE FUNCTION public.list_following(target_user_id uuid)
RETURNS TABLE (
  id uuid,
  username text,
  avatar_diamond_url text,
  avatar_url text,
  account_type text,
  followed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_target_type text;
BEGIN
  IF v_user_id IS NULL OR target_user_id IS NULL THEN RETURN; END IF;

  SELECT account_type INTO v_target_type FROM profiles WHERE id = target_user_id;

  IF v_target_type = 'person' AND target_user_id != v_user_id THEN
    IF NOT public.are_mutual_follows(target_user_id) THEN RETURN; END IF;
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.avatar_diamond_url, p.avatar_url, p.account_type, f.accepted_at
  FROM follows f
  JOIN profiles p ON p.id = f.following_id
  WHERE f.follower_id = target_user_id AND f.status = 'accepted'
  ORDER BY f.accepted_at DESC NULLS LAST;
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_following(uuid) TO authenticated;

-- Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='follows'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.follows;
  END IF;
END $$;

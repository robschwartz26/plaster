-- Slice E5: RPCs for accept, decline, and unfollow operations.
-- Person<->Person follows are always mutual: accepting creates the reverse row;
-- unfollowing deletes both directions.

-- Accept a pending follow request.
-- Caller must be the recipient (auth.uid() = following_id of the pending row).
-- Updates the pending row to accepted AND creates the reverse row if it doesn't exist.
CREATE OR REPLACE FUNCTION public.accept_follow_request(follower_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row_count integer;
BEGIN
  IF v_user_id IS NULL OR follower_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or invalid follower id';
  END IF;
  IF v_user_id = follower_user_id THEN
    RAISE EXCEPTION 'Cannot accept your own follow request';
  END IF;

  -- Update the existing pending row to accepted
  UPDATE follows
    SET status = 'accepted',
        accepted_at = NOW()
  WHERE follower_id = follower_user_id
    AND following_id = v_user_id
    AND status = 'pending';

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count = 0 THEN
    RAISE EXCEPTION 'No pending follow request found from this user';
  END IF;

  -- Insert the reverse direction to make it mutual (only if it doesn't already exist).
  -- This is the core of the mutual-follow spec: accepting = becoming mutual.
  INSERT INTO follows (follower_id, following_id, status, accepted_at)
    VALUES (v_user_id, follower_user_id, 'accepted', NOW())
  ON CONFLICT (follower_id, following_id) DO UPDATE
    SET status = 'accepted',
        accepted_at = COALESCE(follows.accepted_at, NOW());
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_follow_request(uuid) TO authenticated;

-- Decline a pending follow request.
-- Caller must be the recipient. Deletes the row.
CREATE OR REPLACE FUNCTION public.decline_follow_request(follower_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row_count integer;
BEGIN
  IF v_user_id IS NULL OR follower_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or invalid follower id';
  END IF;

  DELETE FROM follows
  WHERE follower_id = follower_user_id
    AND following_id = v_user_id
    AND status = 'pending';

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count = 0 THEN
    RAISE EXCEPTION 'No pending follow request found from this user';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.decline_follow_request(uuid) TO authenticated;

-- Unfollow a user.
-- For person targets: deletes BOTH directions (mutual disconnect per spec).
-- For artist/venue targets: deletes only the caller's direction.
-- For pending outgoing requests: deletes only the caller's direction (retract).
CREATE OR REPLACE FUNCTION public.unfollow_user(other_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_target_type text;
BEGIN
  IF v_user_id IS NULL OR other_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or invalid target id';
  END IF;
  IF v_user_id = other_user_id THEN
    RAISE EXCEPTION 'Cannot unfollow yourself';
  END IF;

  SELECT profiles.account_type INTO v_target_type
  FROM profiles WHERE profiles.id = other_user_id;

  IF v_target_type = 'person' THEN
    -- Persons can only be mutually followed; unfollowing breaks both sides
    DELETE FROM follows
    WHERE (follower_id = v_user_id AND following_id = other_user_id)
       OR (follower_id = other_user_id AND following_id = v_user_id);
  ELSE
    -- Artist or venue: only delete the user's own follow direction
    DELETE FROM follows
    WHERE follower_id = v_user_id AND following_id = other_user_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.unfollow_user(uuid) TO authenticated;

-- Update follow_status to recognize incoming pending requests AND mutual state.
-- Must DROP first because the return type/behavior has changed.
DROP FUNCTION IF EXISTS public.follow_status(uuid);

CREATE FUNCTION public.follow_status(other_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_outgoing record;
  v_incoming record;
BEGIN
  IF v_user_id IS NULL OR other_user_id IS NULL THEN RETURN 'none'; END IF;
  IF v_user_id = other_user_id THEN RETURN 'self'; END IF;

  -- Check outgoing relationship (me -> other)
  SELECT status INTO v_outgoing FROM follows
  WHERE follower_id = v_user_id AND following_id = other_user_id;

  -- Check incoming relationship (other -> me)
  SELECT status INTO v_incoming FROM follows
  WHERE follower_id = other_user_id AND following_id = v_user_id;

  -- If they sent me a pending request and I haven't done anything: pending_incoming
  IF v_incoming.status = 'pending' AND v_outgoing IS NULL THEN
    RETURN 'pending_incoming';
  END IF;

  -- If I sent them a pending request: pending_outgoing
  IF v_outgoing.status = 'pending' THEN
    RETURN 'pending_outgoing';
  END IF;

  -- If I follow them and they follow me back: mutual
  IF v_outgoing.status = 'accepted' AND v_incoming.status = 'accepted' THEN
    RETURN 'mutual';
  END IF;

  -- If I follow them but they don't follow me back: following (one-way, valid for artist/venue)
  IF v_outgoing.status = 'accepted' THEN
    RETURN 'following';
  END IF;

  RETURN 'none';
END;
$$;
GRANT EXECUTE ON FUNCTION public.follow_status(uuid) TO authenticated;

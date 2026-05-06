-- ================================================================
-- Migration 040: blocking, muting, and content reporting
--
-- ADDITIVE ONLY — no existing policies modified or dropped.
--
-- Tables (new):
--   • user_blocks  — A blocks B → mutual invisibility
--   • user_mutes   — A mutes B → A doesn't see B (one-way, silent)
--   • content_reports — flags on profiles, posts, messages
--
-- Helper functions (new):
--   • is_blocked_either_way(viewer, target)
--   • is_muted_by(viewer, target)
--
-- Trigger (new):
--   • cleanup_follows_on_block — AFTER INSERT on user_blocks,
--     deletes any existing follows in either direction.
--
-- RLS (new RESTRICTIVE policies — additive only):
--   Postgres RLS combines PERMISSIVE policies with OR (any-pass = allow)
--   and RESTRICTIVE policies with AND (all must pass = allow). Adding a
--   RESTRICTIVE policy stacks an additional constraint on top of existing
--   PERMISSIVE policies. PERMISSIVE policies must already exist for the
--   relation, otherwise RESTRICTIVE = no access.
--
-- Step 1 inspection confirmed PERMISSIVE policies exist for all ops:
--   • profiles SELECT        → profiles_select
--   • event_wall_posts SELECT → Wall posts are viewable by everyone
--   • messages SELECT        → select_messages_if_member
--   • notifications SELECT   → Users can view their own notifications
--   • follows INSERT         → Users can create follows
--   • messages INSERT        → insert_messages_if_member
-- ================================================================

-- ── user_blocks ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked
  ON public.user_blocks(blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_blocks" ON public.user_blocks
  FOR SELECT USING (blocker_id = auth.uid());
CREATE POLICY "insert_own_blocks" ON public.user_blocks
  FOR INSERT WITH CHECK (blocker_id = auth.uid());
CREATE POLICY "delete_own_blocks" ON public.user_blocks
  FOR DELETE USING (blocker_id = auth.uid());

-- ── user_mutes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_mutes (
  muter_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (muter_id, muted_id),
  CHECK (muter_id <> muted_id)
);

CREATE INDEX IF NOT EXISTS idx_user_mutes_muted
  ON public.user_mutes(muted_id);

ALTER TABLE public.user_mutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_mutes" ON public.user_mutes
  FOR SELECT USING (muter_id = auth.uid());
CREATE POLICY "insert_own_mutes" ON public.user_mutes
  FOR INSERT WITH CHECK (muter_id = auth.uid());
CREATE POLICY "delete_own_mutes" ON public.user_mutes
  FOR DELETE USING (muter_id = auth.uid());

-- ── content_reports ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_kind     text NOT NULL CHECK (target_kind IN
                    ('profile','wall_post','message')),
  target_id       uuid NOT NULL,
  target_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason          text NOT NULL CHECK (reason IN
                    ('spam','harassment','hate_speech','sexual_content',
                     'violence','self_harm','other')),
  notes           text,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN
                    ('open','reviewing','resolved','dismissed')),
  admin_notes     text,
  reviewed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_status
  ON public.content_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_target_user
  ON public.content_reports(target_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter
  ON public.content_reports(reporter_id);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insert_own_reports" ON public.content_reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "select_own_reports" ON public.content_reports
  FOR SELECT USING (reporter_id = auth.uid());
CREATE POLICY "admin_select_all_reports" ON public.content_reports
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "admin_update_all_reports" ON public.content_reports
  FOR UPDATE USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ── Helper functions ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_blocked_either_way(
  viewer_id uuid,
  target_id uuid
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = viewer_id AND blocked_id = target_id)
       OR (blocker_id = target_id AND blocked_id = viewer_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_blocked_either_way(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_muted_by(
  viewer_id uuid,
  target_id uuid
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_mutes
    WHERE muter_id = viewer_id AND muted_id = target_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_muted_by(uuid, uuid) TO authenticated;

-- ── Trigger: clean up follows on block ──────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_follows_on_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.follows
   WHERE (follower_id = NEW.blocker_id AND following_id = NEW.blocked_id)
      OR (follower_id = NEW.blocked_id AND following_id = NEW.blocker_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_blocks_after_insert_cleanup ON public.user_blocks;
CREATE TRIGGER user_blocks_after_insert_cleanup
  AFTER INSERT ON public.user_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_follows_on_block();

-- ── RESTRICTIVE policies (additive only) ────────────────────────
-- Each only effective because a PERMISSIVE policy exists for the same op.
-- Confirmed via Step 1 inspection before this migration was applied.

-- profiles SELECT: hide blocked profiles
CREATE POLICY "restrictive_profiles_block_filter" ON public.profiles
  AS RESTRICTIVE
  FOR SELECT
  USING (
    auth.uid() IS NULL
    OR NOT public.is_blocked_either_way(auth.uid(), id)
  );

-- follows INSERT: prevent following a blocked user
CREATE POLICY "restrictive_follows_block_filter" ON public.follows
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (
    NOT public.is_blocked_either_way(auth.uid(), following_id)
  );

-- event_wall_posts SELECT: hide blocked authors' posts
CREATE POLICY "restrictive_wall_posts_block_filter" ON public.event_wall_posts
  AS RESTRICTIVE
  FOR SELECT
  USING (
    auth.uid() IS NULL
    OR NOT public.is_blocked_either_way(auth.uid(), user_id)
  );

-- messages INSERT: prevent DM into a convo that contains a blocked user
CREATE POLICY "restrictive_messages_block_filter" ON public.messages
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (
    NOT EXISTS (
      SELECT 1
      FROM public.conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
        AND cm.user_id <> auth.uid()
        AND public.is_blocked_either_way(auth.uid(), cm.user_id)
    )
  );

-- notifications SELECT: hide notifs from blocked senders
CREATE POLICY "restrictive_notifications_block_filter" ON public.notifications
  AS RESTRICTIVE
  FOR SELECT
  USING (
    sender_id IS NULL
    OR NOT public.is_blocked_either_way(auth.uid(), sender_id)
  );

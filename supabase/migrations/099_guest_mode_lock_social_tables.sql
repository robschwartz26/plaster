-- Migration 099: guest mode, part 1 — lock social/UGC reads to signed-in users
--
-- Apple 5.1.1(v) requires guest browsing (no login wall for general content),
-- which means the app will soon run with NO session against the anon role.
-- Today these five tables are anon-readable via permissive `using (true)`-style
-- SELECT policies — the login screen was the only thing "protecting" them, and
-- guest mode removes that screen. Verified against prod (2026-07-29 anon probe):
--
--   profiles         → readable  (profiles_select, 010)
--   attendees        → readable  (attendees_select, 004)
--   event_likes      → readable  ("Likes are viewable by everyone", 003)
--   event_wall_posts → readable  (posts_select, 004)
--   post_likes       → readable  (post_likes_select, 004)
--
-- Everything else user-linked is already locked (messages, conversations,
-- follows, notifications, reports, blocks/mutes, views, superlatives,
-- community_posts, device_tokens all returned 0 rows / denied to anon).
--
-- What this does: re-scope every PERMISSIVE SELECT policy on the five tables
-- to `TO authenticated`, keeping each policy's USING expression intact — so
-- signed-in behavior (is_public, block filters, suspended filters) is
-- unchanged, and anon simply has no permissive SELECT path left. RESTRICTIVE
-- policies are left alone (they only further-limit roles they apply to).
--
-- What stays public (required for guest browsing + the /e/:id share layer):
-- events, venues. Deliberately untouched.

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles', 'attendees', 'event_likes',
                        'event_wall_posts', 'post_likes')
      AND cmd = 'SELECT'
      AND permissive = 'PERMISSIVE'
      AND roles::text LIKE '%public%'   -- only policies still open to all roles
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated',
                   pol.policyname, pol.tablename);
    RAISE NOTICE 'Re-scoped SELECT policy % on % to authenticated',
                 pol.policyname, pol.tablename;
  END LOOP;
END $$;

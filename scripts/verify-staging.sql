-- ============================================================================
-- verify-staging.sql — staging-trigger regression check
--
-- Codifies the manual Phase-1 check for the events ingest trigger
-- (events_set_ingest_status, migration 063): a non-admin ingester's insert must
-- land as status='pending' with created_by stamped; an admin's insert must land
-- as status='published'. Unit tests can't reach a DB trigger, so run this.
--
-- HOW TO RUN: paste into the Supabase SQL editor (or run via the Supabase MCP)
-- after ANY migration touching the events table, its RLS, or the ingest trigger.
-- It simulates each role via request.jwt.claims (so auth.uid()/is_admin resolve),
-- inserts test rows, asserts, and ROLLS BACK — nothing persists.
--
-- PASS = you see the final "PASS: staging trigger correct" NOTICE and no ERROR.
-- FAIL = an ERROR with "FAIL: ..." (assertion) or a setup error (missing admin /
-- ingester profile). The transaction rolls back either way.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_admin      uuid;
  v_ingester   uuid;
  v_status     text;
  v_created_by uuid;
BEGIN
  -- Pick a real admin and a real non-admin ingester (created_by FK → profiles).
  SELECT id INTO v_admin
    FROM public.profiles WHERE COALESCE(is_admin, false) = true LIMIT 1;
  SELECT id INTO v_ingester
    FROM public.profiles
    WHERE COALESCE(is_admin, false) = false
      AND COALESCE(is_ingester, false) = true
    LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'SETUP: no admin profile found (is_admin = true)';
  END IF;
  IF v_ingester IS NULL THEN
    RAISE EXCEPTION 'SETUP: no non-admin ingester profile found (is_ingester = true, is_admin = false)';
  END IF;

  -- ── Case 1: non-admin ingester → expect status='pending', created_by stamped ──
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_ingester)::text, true);
  INSERT INTO public.events (title, starts_at)
  VALUES ('STAGING TRIGGER TEST — ingester', now() + interval '7 days')
  RETURNING status, created_by INTO v_status, v_created_by;

  RAISE NOTICE 'ingester insert → status=%, created_by=% (expected: pending, %)',
               v_status, v_created_by, v_ingester;
  IF v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'FAIL: ingester event status=% (expected pending)', v_status;
  END IF;
  IF v_created_by IS DISTINCT FROM v_ingester THEN
    RAISE EXCEPTION 'FAIL: ingester event created_by=% (expected %)', v_created_by, v_ingester;
  END IF;

  -- ── Case 2: admin → expect status='published', created_by stamped ──
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_admin)::text, true);
  INSERT INTO public.events (title, starts_at)
  VALUES ('STAGING TRIGGER TEST — admin', now() + interval '7 days')
  RETURNING status, created_by INTO v_status, v_created_by;

  RAISE NOTICE 'admin insert → status=%, created_by=% (expected: published, %)',
               v_status, v_created_by, v_admin;
  IF v_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'FAIL: admin event status=% (expected published)', v_status;
  END IF;
  IF v_created_by IS DISTINCT FROM v_admin THEN
    RAISE EXCEPTION 'FAIL: admin event created_by=% (expected %)', v_created_by, v_admin;
  END IF;

  RAISE NOTICE 'PASS: staging trigger correct (pending for ingester, published for admin, created_by stamped both)';
END $$;

ROLLBACK;

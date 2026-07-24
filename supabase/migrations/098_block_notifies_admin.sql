-- Migration 098: blocking notifies the developer (Apple App Store Guideline 1.2)
--
-- Apple requires that blocking an abusive user "also notify the developer of the
-- inappropriate content." Today a block only writes user_blocks (+ the
-- cleanup_follows_on_block trigger). This adds an AFTER INSERT trigger that
-- files a lightweight content_reports row on the blocked account, so the block
-- flows through the SAME machinery we already have for reports:
--   • the report-alert email webhook → plasterpdx@gmail.com, and
--   • the admin Reports queue (open → 24h review → resolve/suspend/delete).
--
-- Deduped: we skip filing if an OPEN report from this reporter about this target
-- already exists (e.g. they already reported them, or unblock→reblock), so the
-- queue and inbox don't fill with duplicates. reason='other' with a clear note
-- marks it as block-originated. SECURITY DEFINER so the insert bypasses the
-- reporter-only RLS on content_reports.

CREATE OR REPLACE FUNCTION public.notify_admin_on_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.content_reports r
    WHERE r.reporter_id = NEW.blocker_id
      AND r.target_user_id = NEW.blocked_id
      AND r.status IN ('open', 'reviewing')
  ) THEN
    RETURN NEW;  -- already on the admin's radar; don't duplicate
  END IF;

  INSERT INTO public.content_reports
    (reporter_id, target_kind, target_id, target_user_id, reason, notes, status)
  VALUES
    (NEW.blocker_id, 'profile', NEW.blocked_id, NEW.blocked_id, 'other',
     'Auto-filed on block (Apple 1.2 developer notification): a user blocked this account. Review within 24h.',
     'open');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_notifies_admin ON public.user_blocks;
CREATE TRIGGER block_notifies_admin
  AFTER INSERT ON public.user_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_on_block();

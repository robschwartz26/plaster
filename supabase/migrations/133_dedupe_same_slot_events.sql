-- ── Duplicate pass: the same show ingested twice under two titles ──────────
-- 132 exposed the gap: the earlier duplicate audit keyed on venue + title +
-- date, so one concert under two names read as two concerts. Re-running it on
-- venue + date + exact start time found 39 collisions across 1,844 upcoming
-- events. Most are not duplicates, so this was judged per pair rather than
-- swept.
--
-- What makes a collision legitimate, and why a blanket fix would have been
-- destructive:
--   • Venues with more than one room. Portland Center Stage runs Covenant on
--     the Main Stage while Furlough's Paradise plays the Ellyn Bye Studio;
--     Curious Comedy has a Mainstage and an Annex; Mission Theater has Lola's
--     Room. Twenty-one collisions are this.
--   • Calendar-page sources. Alberta Street Pub's listings all share one
--     source_url, so "same source" is no evidence at all — three unrelated
--     events there looked identical by that test.
--   • Variants of one show. "ZooLights" and "ZooLights 21+ Only Night" are
--     different sittings, not a double entry.
--
-- So a row is retired only when the SHOWS match: identical titles once
-- promoter prefixes, subtitles and "at <venue>" padding are stripped, or one
-- stripped title nests inside the other, or both rows share a poster image.
-- Anything carrying a variant marker is skipped outright.
--
-- Which of a pair survives: the more informative title, except where the extra
-- text is only a promoter ("Special Event:", "Kingbanana Presents:") or the
-- venue's own name ("…at Mississippi Studios", "Kennedy School …"), which the
-- card already shows.

update public.events
   set status = 'rejected', rejection_reason = 'duplicate',
       rejection_note = 'Same show as another row at this venue, date and start time, ingested under a second title. Kept the more informative title.',
       reviewed_at = now()
 where id in (
  '363b7cd7-095b-4c7d-bae5-930a4e9657e0',
  '179e9b64-ab25-4b90-a94a-0e7dff33d6d9',
  '2d608c21-ac0f-4c65-b60b-d430da4548ad',
  '1b6dcf9f-5973-4b6e-807c-da8aa0e54b0f',
  '75eb73e2-0df4-41c0-ab0a-67621c02169f',
  'ae707e32-a4c8-46b7-8ca7-06da31e384ac',
  'e2e9ab8d-eea1-4027-9c65-b4be8622548e',
  '40d30236-a802-406b-9b8c-5501c24c4a65',
  'f15cb900-3de9-498a-b609-2c7149dcf800',
  '84025858-22b5-42e1-add0-0edd0dce43dd',
  'd646c9ec-f587-4249-8999-173f7db2a674',
  'aefd6851-fe13-4c6a-ada7-3018ff61b317');

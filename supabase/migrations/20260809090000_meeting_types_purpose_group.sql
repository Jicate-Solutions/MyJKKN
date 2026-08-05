-- 20260809090000_meeting_types_purpose_group.sql
-- Updated: 2026-08-03 - Add meeting_types.purpose_group + rewrite the public booking copy
--
-- WHY
-- ---
-- The public booking page (/meet/<handle>) lists a host's meeting types as a
-- flat set of buttons. On the only page with more than two options that reads
-- badly, because two of the four rows are the SAME meeting offered in two
-- formats — the booker has to diff two near-identical titles to spot it.
--
-- That duplication is not an authoring mistake, it is import damage. These
-- types were mirrored from Calendly on 2026-06-11, and the mirror's own
-- description strings still record each type's original Calendly location:
--
--     'In-person / online'  (invitee chooses)   14 types
--     'Google Meet'                             16
--     'In-person'                                7
--     'In-person · Cabin No.5' / Board Room / Seminar Room   1 each
--     'Ask invitee'                              1
--
-- Calendly had ONE event whose location the invitee chose. meeting_types has
-- no way to say that, so the import forced a single location_mode and left the
-- real meaning in free text. That is why one type today shows an "In person"
-- badge above a description reading "In-person / online" — the badge and the
-- text disagree, on a page shown to college principals.
--
-- WHAT THIS DOES
-- --------------
-- 1. Adds `purpose_group` (nullable). Types sharing a value render as ONE
--    choice whose label is that value; the booker then picks the format. NULL
--    keeps a type standing alone under its own title — i.e. exactly today's
--    behaviour, so no host who has not set it is affected.
--    This does not invent a concept; it restores the one Calendly had.
--
-- 2. Groups the two 60-minute one-to-one types under 'Full review'.
--
-- 3. Rewrites title/description for all 9 types that are actually visible to
--    the public. Eight of the nine had NO description at all, and the two that
--    did leaked "Mirrored from Calendly on 2026-06-11" to the booker.
--
-- SCOPE — this is the entire public surface, not a sample. Of 87 host pages
-- only 9 are truly bookable (is_public AND NOT auto_hidden AND an active
-- Google connection) and they expose 9 visible types between 5 hosts. Hidden
-- and inactive types are untouched.
--
-- ORDERING — APPLY THIS BEFORE THE CODE DEPLOYS
-- ---------------------------------------------
-- PublicHostService.resolveBookableHost adds `purpose_group` to its select but
-- does NOT check that query's error. If the new code runs against a database
-- without this column the select fails, `types` comes back null, meetingTypes
-- collapses to [] and page.tsx renders the "not ready" state — silently, for
-- EVERY bookable host. The column is additive and nullable, so applying it
-- early is harmless to the code running now.
--
-- No _bak_ table by design: backup tables here ship RLS-off and anon-granted.
-- The prior values are recorded in the rollback block at the foot of this file.
-- No COMMIT anywhere in this file, so a BEGIN..ROLLBACK rehearsal stays a
-- rehearsal.

ALTER TABLE public.meeting_types
  ADD COLUMN IF NOT EXISTS purpose_group text;

COMMENT ON COLUMN public.meeting_types.purpose_group IS
  'Optional grouping label for the public booking page. Types sharing a value are shown as ONE choice (this text is its label) and the booker picks the format second. NULL = stands alone under its own title.';

-- ── Omm (handle "omm") ────────────────────────────────────────────────────
-- The two 60-minute types are one meeting in two formats: group them.
UPDATE public.meeting_types SET
  purpose_group = 'Full review',
  description   = 'Reports, planning or appraisals'
WHERE slug IN (
  'one-to-one-meeting-with-ommsharravana-60-minutes',
  'online-one-to-one-60-mins-meeting-with-omm'
) AND is_active AND NOT hidden;

UPDATE public.meeting_types SET
  title       = 'Quick question',
  description = 'A single decision or approval'
WHERE slug = '15min' AND is_active AND NOT hidden;

UPDATE public.meeting_types SET
  title       = 'Discussion',
  description = 'One topic that needs back-and-forth'
WHERE slug = '30min' AND is_active AND NOT hidden;

-- ── Other hosts: generic Calendly defaults → something a booker can act on ──
-- Only rows that are actually visible to the public are touched.
UPDATE public.meeting_types mt SET
  title       = 'Discussion',
  description = 'One topic that needs back-and-forth'
WHERE mt.title = '30-Minute Meeting'
  AND mt.is_active AND NOT mt.hidden
  AND EXISTS (
    SELECT 1 FROM public.meeting_host_pages hp
    WHERE hp.host_profile_id = mt.host_profile_id
      AND hp.is_public AND NOT hp.auto_hidden
  );

UPDATE public.meeting_types mt SET
  title       = 'Admission counselling',
  description = 'Course options, eligibility and fees'
WHERE mt.title = 'Admission Counseling'
  AND mt.is_active AND NOT mt.hidden
  AND EXISTS (
    SELECT 1 FROM public.meeting_host_pages hp
    WHERE hp.host_profile_id = mt.host_profile_id
      AND hp.is_public AND NOT hp.auto_hidden
  );

-- Already well-named; it only lacked the one line that says what it is for.
UPDATE public.meeting_types mt SET
  description = 'One topic that needs back-and-forth'
WHERE mt.title = 'Discussion'
  AND mt.description IS NULL
  AND mt.is_active AND NOT mt.hidden
  AND EXISTS (
    SELECT 1 FROM public.meeting_host_pages hp
    WHERE hp.host_profile_id = mt.host_profile_id
      AND hp.is_public AND NOT hp.auto_hidden
  );

-- ───────────────────────────────────────────────────────────────────────────
-- ROLLBACK (exact prior values, read live 2026-08-03; run by hand if needed)
--
-- UPDATE public.meeting_types SET purpose_group = NULL,
--   title = 'One to One Meeting with Ommsharravana 60 Minutes',
--   description = 'In-person / online. Mirrored from Calendly on 2026-06-11.'
--  WHERE slug = 'one-to-one-meeting-with-ommsharravana-60-minutes';
--
-- UPDATE public.meeting_types SET purpose_group = NULL,
--   title = 'Online One to One 60 Mins Meeting with Omm',
--   description = 'Google Meet. Mirrored from Calendly on 2026-06-11.'
--  WHERE slug = 'online-one-to-one-60-mins-meeting-with-omm';
--
-- UPDATE public.meeting_types SET title = '15 min meeting', description = NULL
--  WHERE slug = '15min';
-- UPDATE public.meeting_types SET title = '30 min meeting', description = NULL
--  WHERE slug = '30min';
--
-- The three other hosts' rows were all title='30-Minute Meeting' (x3),
-- 'Admission Counseling' (x1) and 'Discussion' (x1), every one with
-- description = NULL. Restore by setting those titles back and description=NULL
-- for the rows this file matched.
--
-- ALTER TABLE public.meeting_types DROP COLUMN purpose_group;
-- ───────────────────────────────────────────────────────────────────────────

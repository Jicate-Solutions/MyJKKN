-- ============================================================================
-- quality_evidence_source_registry — where a person goes to fill the gap
-- Created: 2026-08-09
-- ============================================================================
-- ✅ APPLIED TO PRODUCTION 2026-08-04 under Director authorisation.
--    Rehearsed in BEGIN..ROLLBACK; residue verified 0 in a SEPARATE call.
--    Verified by catalog after apply: 3 columns present; 21 of 24 registry
--    rows carry fix_route + owner_role; 3 remain NULL by design (no verified
--    destination, so consumers render the gap with no link).
--    All 21 fix_route paths were checked to resolve to a real page before the
--    apply — note /staff is an app/(routes)/staff/route.ts landing, not a
--    page.tsx, so a page.tsx-only check reports it missing when it is not.
--    All 4 referenced owner_role keys exist in custom_roles.
--
-- Adds three NULLABLE text columns to public.quality_evidence_source_registry
-- and seeds them for the sources whose destination could be verified. Creates no
-- object, drops nothing, adds no function — so no SECURITY DEFINER clause and no
-- anon-revoke clause applies to this file. The table already carries RLS and an
-- explicit anon posture from 20260423_unification_crud_retrofit.sql; neither is
-- touched here, and adding a column cannot widen either.
--
-- ----------------------------------------------------------------------------
-- WHAT THE REGISTRY COULD NOT ANSWER
-- ----------------------------------------------------------------------------
-- The 24 rows answer WHAT a source is (source_kind, source_table, display_name,
-- description). They do not answer the only question a person reading a gap
-- actually has: where do I go, what do I type, and whose job is this?
--
-- So an accreditation screen could say "not captured yet" and stop there. The
-- reader was told a fact and given no next step, which is the same dead end as
-- the 0 badge it replaced — quieter, but equally unactionable.
--
--   fix_route   the in-app path a person opens to add or edit this data
--   fix_hint    one sentence naming the FIELD to fill and the FILTER that shows
--               who is outstanding
--   owner_role  the custom_roles.role_key that realistically maintains it
--
-- ----------------------------------------------------------------------------
-- NULLABLE ON PURPOSE — A DEAD LINK IS WORSE THAN NO LINK
-- ----------------------------------------------------------------------------
-- 21 of 24 sources are seeded. THREE ARE DELIBERATELY LEFT NULL, and the reason
-- is the same in each case: the data is a DERIVED snapshot with no screen where
-- a person types the underlying value, so any path chosen would be a plausible
-- guess that sends someone to a screen which cannot fix their gap.
--
--   facility_teaching_snapshot  nightly rollup of lesson-plan coverage and
--                               facility usage; the upstream entry points are
--                               spread across several modules, and picking one
--                               would hide the others.
--   coe_result_snapshot         mirrored nightly from the COE examination
--                               system, which is a different application. There
--                               is no MyJKKN screen that edits a pass
--                               percentage, and there must not be.
--   event_feedback_snapshot     feedback is collected per event, so the
--                               destination is /events/<that event>, never a
--                               static path. A link to the event LIST would
--                               look like an instruction and give none.
--
-- Every consumer must treat NULL fix_route as "render the gap with NO button".
-- app/(routes)/accreditation/_lib/metric-gap-state.ts enforces that in code and
-- __tests__/app/accreditation/metric-gap-state.test.ts holds it there.
--
-- ----------------------------------------------------------------------------
-- EVERY SEEDED ROUTE WAS CHECKED AGAINST THE ROUTE TREE, NOT REMEMBERED
-- ----------------------------------------------------------------------------
-- Each fix_route below corresponds to an existing app/(routes)/<path>/page.tsx
-- on jicate/main at 667432d5 (2026-08-09). No path contains a dynamic [segment]:
-- a fix_route must be openable without knowing an id, because the person reading
-- the gap does not have one.
--
-- ----------------------------------------------------------------------------
-- owner_role IS A ROUTING HINT AND NOTHING READS IT FOR ACCESS
-- ----------------------------------------------------------------------------
-- It is NOT a permission, NOT a grant, and NOT consulted by any RLS policy or
-- SECURITY DEFINER function. It answers "who would normally keep this up to
-- date" so a gap can name a desk instead of naming nobody. Access continues to
-- come from custom_roles.permissions via user_has_permission(), unchanged.
--
-- Every value below is a role_key already present in this repo's migrations.
-- Section 4 REPORTS (does not fail on) any owner_role with no matching
-- custom_roles row, because which roles are seeded varies per database and a
-- missing hint must never block a migration that changes no access.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS, and an UPDATE that rewrites the same
-- values. Re-running changes nothing. Carries no BEGIN/COMMIT of its own so a
-- BEGIN .. ROLLBACK rehearsal stays a rehearsal.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. PRECONDITION
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.quality_evidence_source_registry') IS NULL THEN
    RAISE EXCEPTION 'quality_evidence_source_registry does not exist — apply 20260423_unification_crud_retrofit.sql first';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. COLUMNS
-- ----------------------------------------------------------------------------
ALTER TABLE public.quality_evidence_source_registry
  ADD COLUMN IF NOT EXISTS fix_route  text NULL,
  ADD COLUMN IF NOT EXISTS fix_hint   text NULL,
  ADD COLUMN IF NOT EXISTS owner_role text NULL;

COMMENT ON COLUMN public.quality_evidence_source_registry.fix_route IS
  'In-app path a person opens to add or edit this data, e.g. /solutions/publications. NULL = no verified destination; consumers MUST then render the gap with no link. Never a path containing a dynamic [segment].';
COMMENT ON COLUMN public.quality_evidence_source_registry.fix_hint IS
  'One sentence naming the FIELD to fill and the FILTER that reveals who is outstanding. Shown to the reader verbatim, so it uses JKKN terminology.';
COMMENT ON COLUMN public.quality_evidence_source_registry.owner_role IS
  'custom_roles.role_key that realistically maintains this source. A ROUTING HINT ONLY — not a permission, not a grant, read by no RLS policy and no SECURITY DEFINER function.';

-- ----------------------------------------------------------------------------
-- 2. SEED — 21 of 24 sources
-- One UPDATE .. FROM (VALUES ..) so the whole decision reads as one table.
-- ----------------------------------------------------------------------------
UPDATE public.quality_evidence_source_registry r
   SET fix_route  = s.fix_route,
       fix_hint   = s.fix_hint,
       owner_role = s.owner_role,
       updated_at = now()
  FROM (VALUES
    ('grievance_ticket',
     '/accreditation/naac/grievance',
     'Open a ticket and record its Resolution and Closed On date. Filter the list to Status: open to see what is still outstanding.',
     'accreditation_officer'),

    ('ip_filing',
     '/faculty/innovation/portfolio',
     'Open an initiative and fill Filing Number and Filing Date. Filter the portfolio to Status: filed to find entries still missing them.',
     'hod'),

    ('sh_publication',
     '/solutions/publications',
     'Add each published paper with its Journal, Indexing and Year. Filter the list to Indexing: blank to see which entries an assessor could not verify.',
     'hod'),

    ('anti_ragging_affidavit',
     '/campus-living/safety/anti-ragging',
     'Record the signed affidavit against each resident. Filter to Affidavit: not received to see who has still not signed.',
     'chief_warden'),

    ('admission_naac_evidence',
     '/admission/applications',
     'Open an application and complete Category, Home State and Seat Type. Filter to Category: blank to see which admissions cannot be counted.',
     'admission'),

    ('pde_naac_evidence',
     '/pde/admin/accreditation-evidence',
     'Publish the development activity so it is countable. Filter to Evidence: not published to see which activities are still invisible.',
     'accreditation_officer'),

    ('hostel_incident',
     '/campus-living/safety/incidents',
     'Log the incident and record its Action Taken and Closed On date. Filter to Status: open to see what is unresolved.',
     'chief_warden'),

    ('accreditation_submission',
     '/accreditation',
     'Generate the compliance output for the body and period so the submission is on record. Open the body card to see which periods have never been generated.',
     'accreditation_officer'),

    ('institution_collaboration',
     '/accreditation/manage/collaborations',
     'Add the partner and attach the signed MoU with its Start and End dates. Filter to MoU: missing to see collaborations an assessor would discount.',
     'accreditation_officer'),

    ('ss_grant',
     '/startup-studio/finance',
     'Record each grant with its Funding Agency, Sanctioned Amount and Sanction Date. Filter to Sanctioned Amount: blank to see incomplete entries.',
     'nif_coordinator'),

    ('event',
     '/events',
     'Open the event and complete its Category, Dates and Participant count. Filter to Status: draft to see events that never reached the record.',
     'event_coordinator'),

    ('learner_exit_outcome',
     '/learners/alumni',
     'Record what each leaver went on to do — higher study, employment or self-employment. Filter to Outcome: not recorded to see who is unaccounted for.',
     'hod'),

    ('learner_achievement',
     '/health/achievements',
     'Record the achievement with its Level and Award Date. Filter to Level: blank to see entries an assessor cannot rank.',
     'sports_coordinator'),

    ('bos_meeting',
     '/bos/meetings',
     'Open the meeting and upload its approved Minutes. Filter to Minutes: not uploaded to see which meetings leave no trace.',
     'hod'),

    ('cdc_drive',
     '/cdc/drives',
     'Open the drive and record its Offers Made and Offers Accepted. Filter to Outcome: not recorded to see drives that closed without a result.',
     'cdc_head'),

    ('cdc_training',
     '/cdc/training',
     'Add the training programme with its Hours and Attendance. Filter to Hours: blank to see programmes that cannot be totalled.',
     'cdc_head'),

    ('procurement_po',
     '/procurement/purchase-orders',
     'Open the purchase order and record its Received On date and value. Filter to Status: pending receipt to see spend that is not yet evidenced.',
     'accounts'),

    ('audit_cycle',
     '/audit/cycles',
     'Close the cycle and attach its findings and attestations. Filter to Status: in progress to see cycles with no conclusion on record.',
     'lead_auditor'),

    ('hr_snapshot',
     '/staff',
     'Open a team member and fill Qualification, Designation and Date of Joining. Filter the list to Qualification: blank to see who is outstanding.',
     'hr_admin'),

    ('stakeholder_survey',
     '/accreditation/naac/surveys/stakeholders',
     'Run the survey for the period and record the responses received. Filter to Responses: none to see surveys that were opened and never answered.',
     'accreditation_officer'),

    ('sustainability_snapshot',
     '/accreditation/manage/utility-readings',
     'Enter the meter reading for each month. Filter to Reading: missing to see the months that break the year total.',
     'accreditation_officer')
  ) AS s(source_kind, fix_route, fix_hint, owner_role)
 WHERE r.source_kind = s.source_kind;

-- ----------------------------------------------------------------------------
-- 3. ASSERTIONS — fail the apply rather than ship a half-seeded registry
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_missing_cols int;
  v_bad_route    text;
  v_half_seeded  text;
  v_routed       int;
BEGIN
  -- (a) all three columns landed
  SELECT count(*) INTO v_missing_cols
    FROM (VALUES ('fix_route'), ('fix_hint'), ('owner_role')) AS want(c)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'quality_evidence_source_registry'
        AND column_name  = want.c
   );
  IF v_missing_cols > 0 THEN
    RAISE EXCEPTION 'expected fix_route, fix_hint and owner_role on quality_evidence_source_registry — % missing', v_missing_cols;
  END IF;

  -- (b) no route may be relative, and none may carry a dynamic segment: the
  --     person reading a gap has no id to substitute.
  SELECT source_kind INTO v_bad_route
    FROM public.quality_evidence_source_registry
   WHERE fix_route IS NOT NULL
     AND (left(fix_route, 1) <> '/' OR fix_route LIKE '%[%')
   LIMIT 1;
  IF v_bad_route IS NOT NULL THEN
    RAISE EXCEPTION 'fix_route on % is not an absolute static path', v_bad_route;
  END IF;

  -- (c) a route with no hint is a button with no instruction, which is the
  --     failure this whole file exists to remove.
  SELECT source_kind INTO v_half_seeded
    FROM public.quality_evidence_source_registry
   WHERE (fix_route IS NOT NULL) <> (fix_hint IS NOT NULL)
   LIMIT 1;
  IF v_half_seeded IS NOT NULL THEN
    RAISE EXCEPTION 'source % has a fix_route without a fix_hint, or the reverse', v_half_seeded;
  END IF;

  -- (d) the seed reached the rows it was written for. Fewer than 21 means a
  --     source_kind was renamed and the UPDATE silently matched nothing.
  SELECT count(*) INTO v_routed
    FROM public.quality_evidence_source_registry
   WHERE fix_route IS NOT NULL;
  IF v_routed < 21 THEN
    RAISE EXCEPTION 'expected at least 21 routed sources, found % — a source_kind in the seed no longer matches a registry row', v_routed;
  END IF;

  RAISE NOTICE 'quality_evidence_source_registry: % of % sources now carry a destination',
    v_routed, (SELECT count(*) FROM public.quality_evidence_source_registry);
END $$;

-- ----------------------------------------------------------------------------
-- 4. ADVISORY — report, never fail
-- An owner_role naming a role that is not seeded on THIS database is a stale
-- hint, not a fault. Failing here would block a migration that grants nothing
-- and changes no access.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_unknown text;
BEGIN
  IF to_regclass('public.custom_roles') IS NULL THEN
    RAISE NOTICE 'custom_roles absent — owner_role hints not cross-checked';
    RETURN;
  END IF;

  SELECT string_agg(DISTINCT r.owner_role, ', ') INTO v_unknown
    FROM public.quality_evidence_source_registry r
   WHERE r.owner_role IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.custom_roles c WHERE c.role_key = r.owner_role
     );

  IF v_unknown IS NOT NULL THEN
    RAISE NOTICE 'owner_role hints with no custom_roles row on this database: % — routing hint only, no access affected', v_unknown;
  END IF;
END $$;

-- ============================================================================
-- MBA Teaching-Enterprise · PR-4 · Access Wiring
-- Created: 2026-07-24  (spec: specs/mba-improvement-board-design-2026-07-23.md)
--
-- DORMANT migration. Ships as a FILE only; the Director applies it AFTER merge
-- (a MyJKKN deploy ships CODE, not DB migrations). Fully idempotent — safe to
-- re-run. Zero residue on prod from the PR itself.
--
-- Wires WHO can use the Improvement Board (PR-1/PR-2, already shipped) and the
-- CEO Rounds log (PR-3):
--   (a) a dedicated 'mba_associate' role carrying the learner-side perms;
--   (b) backfill that role onto the 44 current MBA Management Associates;
--   (c) grant the two manager-side perms to the existing 'ceo' role;
--   (d) a DECORATION cohort mirroring the 44 (analytics only — NOT an access gate);
--   (e) fn_mba_associate_sync() — the service-role sweep the daily cron calls.
--
-- ACCESS-GATE PRINCIPLE (locked 2026-07-24): the *role* is the access gate.
-- A cohort membership grants ZERO permissions in MyJKKN, so the cohort in (d)
-- is purely for analytics/reporting; never gate access on it.
--
-- The base 'student' role is NOT granted improvement.* and the base 'faculty'
-- role is NOT granted ceo_rounds.*/improvement.board.manage — only the dedicated
-- roles below carry those keys.
--
-- The MBA learning-facilitator grant is DEFERRED (human-gated) — see the
-- commented-out block (f) at the foot of this file.
--
-- MBA program  : 43eed6cf-fa51-4e6b-ba93-1b27c4c16df4
-- MBA rule (44) : learners_profiles in that program, semester_order IN (3,4),
--                 active academic year, lifecycle_status='active'.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (a) 'mba_associate' role — the learner-side access gate
--     Perms: file + view Improvement Board ideas, author CEO Rounds summaries.
--     institution_scope='own' (an Associate sees their own institution's board).
-- ----------------------------------------------------------------------------
INSERT INTO public.custom_roles
  (role_key, role_name, description, permissions, institution_scope, is_system_role, is_active)
VALUES
  ('mba_associate',
   'MBA Associate',
   'MBA Management Associates (MBA learners in semesters III-IV with active enrolment). '
   || 'Auto-synced daily from the enrolment rule by fn_mba_associate_sync(). Grants Improvement '
   || 'Board create/view plus CEO Rounds summary authoring. The role is the access gate; the '
   || 'matching mba_associate cohort is analytics-only.',
   '{"improvement.ideas.create":true,"improvement.ideas.view":true,"ceo_rounds.summary.write":true}'::jsonb,
   'own', false, true)
ON CONFLICT (role_key) DO UPDATE SET
  role_name         = EXCLUDED.role_name,
  description       = EXCLUDED.description,
  permissions       = EXCLUDED.permissions,
  institution_scope = EXCLUDED.institution_scope,
  is_active         = true,
  updated_at        = now();

-- ----------------------------------------------------------------------------
-- (b) Backfill the 44 current MBA Management Associates onto the role.
--     Map: user_roles.user_id = profiles.id WHERE profiles.learner_id = lp.id.
--     is_primary=false so it never displaces their primary 'student' role.
--     ON CONFLICT (user_id, role_id) DO NOTHING → idempotent.
-- ----------------------------------------------------------------------------
INSERT INTO public.user_roles (user_id, role_id, is_primary)
SELECT p.id,
       (SELECT id FROM public.custom_roles WHERE role_key = 'mba_associate'),
       false
FROM public.learners_profiles lp
JOIN public.semesters      s  ON s.id  = lp.semester_id
JOIN public.academic_years ay ON ay.id = lp.academic_year_id
JOIN public.profiles       p  ON p.learner_id = lp.id
WHERE lp.program_id = '43eed6cf-fa51-4e6b-ba93-1b27c4c16df4'
  AND s.semester_order IN (3, 4)
  AND ay.is_active
  AND lp.lifecycle_status = 'active'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- (c) Grant the two manager-side perms to the EXISTING 'ceo' role via JSONB
--     merge (|| is idempotent). CEO office hosts Rounds and manages the board.
-- ----------------------------------------------------------------------------
UPDATE public.custom_roles
SET permissions = permissions || '{"improvement.board.manage":true,"ceo_rounds.log":true}'::jsonb,
    updated_at  = now()
WHERE role_key = 'ceo';

-- ----------------------------------------------------------------------------
-- (d) DECORATION cohort + memberships — analytics/reporting only.
--     NOT an access gate (cohort membership grants zero permissions). Kept in
--     sync with the same 44 by fn_mba_associate_sync(). Idempotent throughout.
--
--     cohorts.kind is a controlled vocabulary; the live CHECK admits only
--     sf100/foundations/cdc/trainer. Widen it to admit the analytics-only
--     'mba_associate' kind (existing values preserved). Idempotent (drop-if-
--     exists then re-add). NOTE FOR REVIEW: this is a shared-vocabulary change
--     the brief did not anticipate; if undesired, drop block (d) entirely — it
--     is decoration only and nothing else depends on it.
-- ----------------------------------------------------------------------------
ALTER TABLE public.cohorts DROP CONSTRAINT IF EXISTS cohorts_kind_check;
ALTER TABLE public.cohorts ADD CONSTRAINT cohorts_kind_check
  CHECK (kind = ANY (ARRAY['sf100'::text,'foundations'::text,'cdc'::text,'trainer'::text,'mba_associate'::text]));

DO $$
DECLARE
  v_inst   uuid;
  v_cohort uuid;
BEGIN
  -- The MBA rule provably resolves to a single institution; take it.
  SELECT DISTINCT lp.institution_id
    INTO v_inst
  FROM public.learners_profiles lp
  JOIN public.semesters      s  ON s.id  = lp.semester_id
  JOIN public.academic_years ay ON ay.id = lp.academic_year_id
  WHERE lp.program_id = '43eed6cf-fa51-4e6b-ba93-1b27c4c16df4'
    AND s.semester_order IN (3, 4)
    AND ay.is_active
    AND lp.lifecycle_status = 'active'
  LIMIT 1;

  IF v_inst IS NULL THEN
    RAISE NOTICE 'mba_access_wiring (d): no MBA institution resolved; skipping cohort decoration';
    RETURN;
  END IF;

  SELECT id INTO v_cohort
  FROM public.cohorts
  WHERE kind = 'mba_associate' AND institution_id = v_inst
  LIMIT 1;

  IF v_cohort IS NULL THEN
    INSERT INTO public.cohorts (kind, name, institution_id, status, config)
    VALUES ('mba_associate', 'MBA Associates', v_inst, 'active',
            '{"purpose":"analytics_only","note":"access gate is the mba_associate role, NOT this cohort"}'::jsonb)
    RETURNING id INTO v_cohort;
  END IF;

  INSERT INTO public.cohort_memberships (cohort_id, member_type, member_ref, status)
  SELECT v_cohort, 'learner', lp.id, 'active'
  FROM public.learners_profiles lp
  JOIN public.semesters      s  ON s.id  = lp.semester_id
  JOIN public.academic_years ay ON ay.id = lp.academic_year_id
  WHERE lp.program_id = '43eed6cf-fa51-4e6b-ba93-1b27c4c16df4'
    AND s.semester_order IN (3, 4)
    AND ay.is_active
    AND lp.lifecycle_status = 'active'
  ON CONFLICT (cohort_id, member_type, member_ref) DO NOTHING;
END $$;

-- ----------------------------------------------------------------------------
-- (e) fn_mba_associate_sync() — daily reconciliation (cron/system-only).
--     Re-derives the current MBA-Associate set from the RULE, then:
--       • ADDs the role to new matches;
--       • REMOVEs the role from anyone who no longer matches (a leaver loses the
--         role but their filed ideas/summaries STAY — those key on author_id and
--         RLS checks the VIEWER's perms, not the author's current role);
--       • keeps the analytics cohort's membership aligned to the same set.
--     SERVICE-ROLE-ONLY: REVOKE anon/PUBLIC/authenticated; GRANT service_role
--     (CLAUDE.md cron-RPC rule — a system sweep must never be caller-invokable).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_mba_associate_sync()
RETURNS TABLE (
  role_added    integer,
  role_removed  integer,
  role_total    integer,
  cohort_added  integer,
  cohort_removed integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id   uuid;
  v_inst      uuid;
  v_cohort    uuid;
  v_role_add  integer := 0;
  v_role_del  integer := 0;
  v_role_tot  integer := 0;
  v_coh_add   integer := 0;
  v_coh_del   integer := 0;
BEGIN
  SELECT id INTO v_role_id FROM public.custom_roles WHERE role_key = 'mba_associate';
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'mba_associate role missing; apply the access-wiring migration first';
  END IF;

  -- Current matching set: carry both the learner id (for the cohort) and the
  -- profile id (for the role) so both stay aligned to one derivation.
  CREATE TEMP TABLE _mba_match ON COMMIT DROP AS
  SELECT DISTINCT lp.id AS learner_id, p.id AS user_id, lp.institution_id
  FROM public.learners_profiles lp
  JOIN public.semesters      s  ON s.id  = lp.semester_id
  JOIN public.academic_years ay ON ay.id = lp.academic_year_id
  JOIN public.profiles       p  ON p.learner_id = lp.id
  WHERE lp.program_id = '43eed6cf-fa51-4e6b-ba93-1b27c4c16df4'
    AND s.semester_order IN (3, 4)
    AND ay.is_active
    AND lp.lifecycle_status = 'active';

  -- ROLE (the access gate) — ADD new matches
  WITH ins AS (
    INSERT INTO public.user_roles (user_id, role_id, is_primary)
    SELECT m.user_id, v_role_id, false FROM _mba_match m
    ON CONFLICT (user_id, role_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_role_add FROM ins;

  -- ROLE — REMOVE leavers (held the role, no longer match)
  WITH del AS (
    DELETE FROM public.user_roles ur
    WHERE ur.role_id = v_role_id
      AND NOT EXISTS (SELECT 1 FROM _mba_match m WHERE m.user_id = ur.user_id)
    RETURNING 1
  )
  SELECT count(*) INTO v_role_del FROM del;

  SELECT count(*) INTO v_role_tot FROM public.user_roles WHERE role_id = v_role_id;

  -- COHORT (analytics decoration) — keep aligned to the same set, best-effort.
  SELECT DISTINCT institution_id INTO v_inst FROM _mba_match LIMIT 1;
  IF v_inst IS NOT NULL THEN
    SELECT id INTO v_cohort FROM public.cohorts
     WHERE kind = 'mba_associate' AND institution_id = v_inst LIMIT 1;
    IF v_cohort IS NULL THEN
      INSERT INTO public.cohorts (kind, name, institution_id, status, config)
      VALUES ('mba_associate', 'MBA Associates', v_inst, 'active',
              '{"purpose":"analytics_only","note":"access gate is the mba_associate role, NOT this cohort"}'::jsonb)
      RETURNING id INTO v_cohort;
    END IF;

    WITH cins AS (
      INSERT INTO public.cohort_memberships (cohort_id, member_type, member_ref, status)
      SELECT v_cohort, 'learner', m.learner_id, 'active' FROM _mba_match m
      ON CONFLICT (cohort_id, member_type, member_ref) DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO v_coh_add FROM cins;

    WITH cdel AS (
      DELETE FROM public.cohort_memberships cm
      WHERE cm.cohort_id = v_cohort
        AND cm.member_type = 'learner'
        AND NOT EXISTS (SELECT 1 FROM _mba_match m WHERE m.learner_id = cm.member_ref)
      RETURNING 1
    )
    SELECT count(*) INTO v_coh_del FROM cdel;
  END IF;

  RETURN QUERY SELECT v_role_add, v_role_del, v_role_tot, v_coh_add, v_coh_del;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_associate_sync() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_mba_associate_sync() TO service_role;

-- ============================================================================
-- (f) PENDING — DIRECTOR CONFIRM — MBA learning-facilitator grant  [DORMANT]
-- ----------------------------------------------------------------------------
-- DISCOVERY (verified 2026-07-24, active staff plans):
--   Path: staff_plans sp (program_id = MBA program) JOIN staff_plan_courses spc
--         ON spc.staff_plan_id = sp.id JOIN staff st ON st.id = spc.staff_id.
--   The program-scoped and department-scoped
--   (sp.department_id='e73d1763-7479-4771-9c9e-cdea547d0205') paths AGREE
--   exactly: 8 distinct facilitators, all active, all with profile_id.
--   (courses.department_id does NOT exist — the brief's original join was broken;
--    the department/program live on staff_plans, not courses.)
--
--   The 8 (staff_id / name / email / profile_id):
--     5bf7d19e-a4ca-498e-af8d-faaae4d5a6b8  DR. MOHANRAJ G     mohanraj_g@jkkn.ac.in    5ac71af0-9c33-4d7b-b536-eed6189f2b79
--     288b46ca-d553-4833-b690-b6ca759546ba  Mr. ARUN V P       arunvp@jkkn.ac.in        66d788e7-6138-401d-9cf7-b2ca09385453
--     ed85e500-1e9f-4557-9fe2-c8952608b9bf  MRS. SARANYA G     saranya_g@jkkn.ac.in     04bfa810-95ac-4b05-9004-17eabeb0c2c5
--     f10bbe3c-daf9-481c-85b9-6766f5460094  MRS. SARASWATHI M  saraswathi_m@jkkn.ac.in  3729af57-ffdb-44dd-9649-358ba590ce10
--     b1bae5cc-c49d-47cd-ab61-cac0fa2fba9f  MRS. VIMALA C      vimala.c@jkkn.ac.in      7cb1ba28-84a7-4cfb-a1f5-5eff11b9c59a
--     4b50cfc0-54ff-4f25-a0f6-0ec8d6fd8e86  Narayan Rao        coo@jkkn.ac.in           1b84aed1-253d-4021-8aad-1723ab5aa0a7
--     4657519b-7195-43be-a4e4-892116d714e5  RAJESWARI V        rajeswari@jkkn.ac.in     197b539d-56df-400f-a58a-d7d0bb258e79
--     e7c9b33f-b5db-4337-9c92-7b6705a56720  RAMYA B            ramya_b@jkkn.ac.in       1aeb1248-212c-43db-affd-b0c06ecb74da
--
-- INTENT: a dedicated 'mba_facilitator' role (cleaner + auto-syncable, mirrors
-- the mba_associate pattern) carrying improvement.board.manage + ceo_rounds.log.
-- Do NOT grant these to the base 'faculty' role.
--
-- The Director UNCOMMENTS the block below after confirming the 8-person list.
-- (A follow-up cron could then keep mba_facilitator aligned to the same path.)
-- ----------------------------------------------------------------------------
-- INSERT INTO public.custom_roles
--   (role_key, role_name, description, permissions, institution_scope, is_system_role, is_active)
-- VALUES
--   ('mba_facilitator',
--    'MBA Facilitator',
--    'MBA learning facilitators (staff mapped to MBA program via active staff plans). '
--    || 'Reviews/scores/approves Improvement Board ideas and hosts/logs CEO Rounds.',
--    '{"improvement.board.manage":true,"ceo_rounds.log":true}'::jsonb,
--    'own', false, true)
-- ON CONFLICT (role_key) DO UPDATE SET
--   role_name = EXCLUDED.role_name, description = EXCLUDED.description,
--   permissions = EXCLUDED.permissions, is_active = true, updated_at = now();
--
-- INSERT INTO public.user_roles (user_id, role_id, is_primary)
-- SELECT DISTINCT st.profile_id,
--        (SELECT id FROM public.custom_roles WHERE role_key = 'mba_facilitator'),
--        false
-- FROM public.staff_plans sp
-- JOIN public.staff_plan_courses spc ON spc.staff_plan_id = sp.id
-- JOIN public.staff st ON st.id = spc.staff_id
-- WHERE sp.program_id = '43eed6cf-fa51-4e6b-ba93-1b27c4c16df4'
--   AND sp.is_active
--   AND st.profile_id IS NOT NULL
-- ON CONFLICT (user_id, role_id) DO NOTHING;
-- ============================================================================
-- End PR-4 migration.
-- ============================================================================

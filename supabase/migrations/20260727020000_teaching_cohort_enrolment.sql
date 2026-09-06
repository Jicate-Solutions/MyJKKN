-- Migration: Teaching-enterprise spine — cohort-driven analytics gate + CSE resident enrolment
-- Date: 2026-07-27
-- Spec: specs/teaching-enterprise-spine-generalization-2026-07-26.md (§4.1, §4.3, §4.4, §4.5, Phase 1b)
--
-- ############################################################################
-- ## APPLY ORDER — HARD DEPENDENCY                                          ##
-- ##                                                                        ##
-- ## 20260727010000_teaching_enterprise_cohorts.sql  (Lane A)  MUST be       ##
-- ## applied FIRST. It creates public.teaching_enterprise_cohorts and seeds  ##
-- ## the `mba_associate` row. This migration only READS/REFERENCES that      ##
-- ## table — it never creates or redefines it.                              ##
-- ##                                                                        ##
-- ## Part 0 below hard-fails with an explicit message if either the table or ##
-- ## the active `mba_associate` seed row is missing, because widening        ##
-- ## fn_mba_analyst_views against an empty config table would lock out all   ##
-- ## 44 MBA Associates instead of failing visibly.                          ##
-- ############################################################################
--
-- ############################################################################
-- ## THIS FILE IS NOW THE AUTHORITY FOR fn_mba_analyst_views                ##
-- ##                                                                        ##
-- ## The DEPLOYED body of fn_mba_analyst_views has DRIFTED from every        ##
-- ## migration file in this repo: it silently lost the PR #2388 money gate   ##
-- ## (verified 2026-07-26 by pg_get_functiondef — the live body contains 0   ##
-- ## occurrences of `include_financial` and 0 of `v_can_money`). Because     ##
-- ## repo files can no longer be assumed to describe production, the exact   ##
-- ## live body being replaced is captured verbatim in the ROLLBACK block at  ##
-- ## the foot of Part 1. Reverting is impossible without it.                 ##
-- ##                                                                        ##
-- ## After this migration is applied, treat THIS file — not the live body,   ##
-- ## and not the earlier #2388/#2435 files — as the source of truth.         ##
-- ############################################################################
--
-- WHAT THIS DOES
--   1. Widens the analytics-delivery gate `fn_mba_analyst_views(uuid)` so the
--      learner-role check is CONFIG-DRIVEN (any active cohort's
--      learner_role_key) instead of the hardcoded literal 'mba_associate'.
--      This is the single semantic change the Phase-1b spec authorises.
--   2. Restores the `include_financial` money gate that was silently dropped on
--      production (see "REGRESSION REPAIR" below). Delimited so it can be
--      removed as one block if the Director wants the widening alone.
--   3. Seeds two roles for cohort #2 — `cse_resident` and `cse_facilitator`.
--      `cse_resident` COPIES the permission JSONB from the live `mba_associate`
--      row (never retyped, so the two cohorts' LEARNER roles cannot drift).
--      `cse_facilitator` is deliberately NOT a copy of `mba_faculty` — it is a
--      NARROWED set. See the SECURITY NARROWING note in Part 2.
--   4. Seeds the CSE cohort config row (is_active = false — see Part 3 note).
--   5. Adds the admin read path (`fn_teaching_cohort_list`) at
--      improvement.board.manage per spec §4.1, and the admin write path
--      (`fn_teaching_cohort_update`) at SUPER ADMIN only. See Part 4.
--
-- ============================================================================
-- REGRESSION REPAIR (read before reviewing Part 1)
-- ============================================================================
-- Verified on production 2026-07-26 with pg_get_functiondef:
--
--   * PR #2388 (`20260803010000_mba_postings_financial_toggle.sql`) added
--     `mba_associate_postings.include_financial` and rewrote the RPC so a
--     posted Associate receives the `is_sensitive` (money) views ONLY when
--     their active posting has include_financial = true.
--   * PR #2435 (`20260726180000_mba_typea_analyst_views.sql`) later did its own
--     CREATE OR REPLACE of the same RPC to move the k>=5 guard column into the
--     `mba_area_analyst_views.guard_col` data column — and, in doing so,
--     DROPPED the money gate. The two migration FILENAMES are mis-ordered
--     relative to merge order (20260803… shipped before 20260726…), which is
--     how the loss went unnoticed.
--   * The live definition therefore contains NO reference to
--     include_financial. `is_sensitive` is SELECTed from the map row and then
--     EMITTED as an output label — it is never used as a filter. The loop runs
--     every mapped view for the area, returns its rows, and tags them
--     "is_sensitive": true.
--
-- MEASURED live exposure, 2026-07-26 (all figures re-verified for this file):
--   * 6 is_sensitive mapped views: learning_channel_roi,
--     learning_collection_summary, learning_event_budget_actual,
--     learning_finance_collection_yearly, learning_placement_outcomes,
--     learning_procurement_spend   (of 15 mapped views total).
--   * 26 active mba_associate_postings, of which 0 have include_financial=true.
--   * 10 of those 26 postings (10 distinct learners) are to areas that map at
--     least one is_sensitive view — i.e. 10 learners can read money views right
--     now that the designed policy says they must not.
--
-- This migration rebases on the LIVE (guard_col) body — so the #2449/#2435
-- privacy hardening is preserved verbatim, NOT regressed to the older
-- event-counting CASE — and re-applies the #2388 money gate on top.
--
-- Effect on production once applied: the 6 money views stop being served to the
-- posted Associates whose include_financial = false. That is the DESIGNED
-- behaviour of #2388; it is a tightening, never a widening, of access. A board
-- manager (improvement.board.manage) still sees every view including money.
--
-- ============================================================================
-- SAFETY: timings taken on production before replacing this SECDEF
-- ============================================================================
-- Every distinct mapped analyst view was executed with its real guard predicate
-- (`<guard_col> >= 5`, or no predicate where guard_col IS NULL) on production
-- 2026-07-26. Measured:
--     learning_admission_funnel                 37.0 ms  (116 rows)
--     learning_conversion_gaps                  23.5 ms   (69 rows)
--     learning_channel_roi                      17.4 ms   (40 rows)
--     learning_event_feedback                    6.1 ms
--     learning_collection_summary                4.6 ms
--     learning_finance_collection_yearly         4.3 ms
--     learning_placement_outcomes                4.2 ms
--     learning_event_attendance                  3.8 ms
--     learning_academic_assessment_performance   3.7 ms
--     learning_hr_leave_utilization              3.0 ms
--     learning_hostel_occupancy                  2.6 ms
--     learning_procurement_spend                 1.1 ms
--     learning_event_budget_actual               1.0 ms
--     learning_accreditation_committee_activity  1.0 ms
--     learning_transport_ridership               0.8 ms
--   TOTAL across all 15 distinct mapped views: 114.1 ms.
-- No single statement approaches a lock-contention window, so CREATE OR REPLACE
-- takes its lock instantly. (A real call touches only the views mapped to ONE
-- area — a strict subset of the 114.1 ms above.)

BEGIN;

-- ============================================================================
-- PART 0. Dependency assertion — fail loudly, never silently.
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.teaching_enterprise_cohorts') IS NULL THEN
    RAISE EXCEPTION
      'DEPENDENCY MISSING: public.teaching_enterprise_cohorts does not exist. Apply 20260727010000_teaching_enterprise_cohorts.sql (Lane A) BEFORE this migration.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.teaching_enterprise_cohorts
    WHERE cohort_key = 'mba_associate' AND is_active
  ) THEN
    RAISE EXCEPTION
      'DEPENDENCY MISSING: no ACTIVE teaching_enterprise_cohorts row with cohort_key=''mba_associate''. Widening fn_mba_analyst_views against an empty config set would deny every MBA Associate (44 users). Apply the Lane A seed first.';
  END IF;
END $$;

-- ============================================================================
-- PART 1. fn_mba_analyst_views — config-driven learner-role gate.
--
-- Rebased line-by-line on the LIVE production body (pg_get_functiondef,
-- 2026-07-26). Preserved verbatim:
--   * the auth.uid() NULL check,
--   * the improvement.board.manage / is_super_admin / is_admin manager bypass,
--   * Gate 2 (active posting to THIS area) and the manager bypass of it,
--   * the data-driven allowlist (^learning_[a-z0-9_]+$ + to_regclass) so the
--     dynamic EXECUTE can never touch an arbitrary relation,
--   * the k>=5 small-cell suppression reading guard_col FROM the map row — the
--     #2449 hardening. NOT regressed to the older hardcoded event-counting
--     CASE. The guard column is DATA: adding a view does not edit this
--     function. (Suppression is live and material: measured 2026-07-26,
--     learning_finance_collection_yearly drops 1 of 8 groups on
--     distinct_payers >= 5; learning_hr_leave_utilization drops 9 of 15 on
--     distinct_employees; learning_admission_funnel drops 112 of 228.)
--   * the returned {area_id, views:[{view_name,is_sensitive,rows}]} shape.
--
-- Changed:
--   (a) THE ONE authorised semantic change — the learner-role literal
--       'mba_associate' becomes `IN (SELECT learner_role_key FROM
--       teaching_enterprise_cohorts WHERE is_active)`.
--   (b) the money gate restored (see REGRESSION REPAIR header). Delimited
--       between the "MONEY GATE" comment banners.
--   (c) the Gate-1 error text no longer names one cohort (copy only; no code
--       or test asserts on this string — verified by grep across the repo).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_mba_analyst_views(p_area_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid       uuid := auth.uid();
  v_manage    boolean;
  v_is_assoc  boolean;   -- holds an ACTIVE cohort's learner role (any cohort)
  v_posted    boolean;
  v_can_money boolean;   -- may this caller receive is_sensitive (money) views?
  v_rec       record;
  v_where     text;
  v_rows      jsonb;
  v_views     jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  v_manage := is_super_admin() OR is_admin()
              OR user_has_permission('improvement.board.manage');

  -- Gate 1 membership test — CONFIG-DRIVEN (was: cr.role_key = 'mba_associate').
  -- The set of participating cohorts is data in teaching_enterprise_cohorts, so
  -- adding a cohort (CSE Resident, …) no longer edits this function. Only
  -- is_active rows count, which makes the admin screen's activate/deactivate
  -- toggle the kill switch for a cohort's analytics access.
  --
  -- NOTE this reads learner_role_key ONLY. A cohort's faculty_role_key
  -- (e.g. cse_facilitator) deliberately confers NO analytics access through
  -- this gate — see the SECURITY NARROWING note in Part 2.
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = v_uid
      AND cr.is_active
      AND cr.role_key IN (
        SELECT c.learner_role_key
        FROM teaching_enterprise_cohorts c
        WHERE c.is_active
      )
  ) INTO v_is_assoc;

  -- Gate 1: must hold a participating cohort's learner role, or manage the board.
  IF NOT (v_is_assoc OR v_manage) THEN
    RAISE EXCEPTION 'not authorized: a teaching-enterprise cohort role or improvement.board.manage is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM mba_associate_postings p
    WHERE p.associate_user_id = v_uid
      AND p.area_id = p_area_id
      AND p.is_active
  ) INTO v_posted;

  -- Gate 2: must be posted to THIS department (managers bypass — they see any).
  IF NOT (v_posted OR v_manage) THEN
    RAISE EXCEPTION 'not authorized: no active posting to this department'
      USING ERRCODE = '42501';
  END IF;

  -- ==== MONEY GATE (restored from PR #2388; see REGRESSION REPAIR header) ====
  -- Per-assignment. A board manager always sees the money views. A posted
  -- cohort learner sees the is_sensitive views ONLY when their active posting to
  -- THIS area has include_financial = true. UNIQUE(associate, area) means at
  -- most one such row. Delete this assignment + the CONTINUE below to ship the
  -- cohort widening on its own.
  v_can_money := v_manage OR EXISTS (
    SELECT 1
    FROM mba_associate_postings p
    WHERE p.associate_user_id = v_uid
      AND p.area_id = p_area_id
      AND p.is_active
      AND p.include_financial
  );
  -- ==== end MONEY GATE ======================================================

  -- Deliver each mapped view with k>=5 small-cell suppression.
  --   The map row IS the allowlist: only view_names present as rows for this
  --   area are ever read, and guard_col comes FROM the row (data-only — adding a
  --   view no longer edits this function).
  FOR v_rec IN
    SELECT view_name, is_sensitive, guard_col
    FROM mba_area_analyst_views
    WHERE area_id = p_area_id
    ORDER BY view_name
  LOOP
    -- ==== MONEY GATE (part 2 of 2) ==========================================
    IF v_rec.is_sensitive AND NOT v_can_money THEN
      CONTINUE;
    END IF;
    -- ==== end MONEY GATE ====================================================

    -- Defense-in-depth: the RPC can only ever read a REAL, EXISTING learning_*
    -- relation. A typo'd, dropped, or non-learning_* map row is skipped — never
    -- errors, never touches an arbitrary relation.
    IF v_rec.view_name !~ '^learning_[a-z0-9_]+$'
       OR to_regclass('public.' || v_rec.view_name) IS NULL THEN
      CONTINUE;
    END IF;

    -- guard_col NULL => no small-cell dimension => rows pass (WHERE TRUE).
    -- else => drop any group whose guard count is below 5. The column named by
    -- guard_col is the suppression dimension chosen per view in
    -- mba_area_analyst_views (the #2449 hardening moved this choice OUT of this
    -- function and INTO the data, so the threshold cannot be bypassed by
    -- adding a view). Preserved here byte-for-byte from the live body.
    IF v_rec.guard_col IS NULL THEN
      v_where := 'TRUE';
    ELSE
      v_where := format('%I >= 5', v_rec.guard_col);
    END IF;

    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.%I t WHERE %s',
      v_rec.view_name, v_where
    ) INTO v_rows;

    v_views := v_views || jsonb_build_object(
      'view_name',    v_rec.view_name,
      'is_sensitive', v_rec.is_sensitive,
      'rows',         v_rows
    );
  END LOOP;

  RETURN jsonb_build_object(
    'area_id', p_area_id,
    'views',   v_views
  );
END;
$fn$;

COMMENT ON FUNCTION public.fn_mba_analyst_views(uuid) IS
  'Assignment-scoped delivery of de-identified analyst views for one improvement_area. Gate 1: caller holds the learner_role_key of any ACTIVE teaching_enterprise_cohorts row (config-driven since 2026-07-27), or improvement.board.manage. A cohort faculty_role_key confers nothing here. Gate 2: an active mba_associate_postings row for the area (managers bypass). is_sensitive (money) views are delivered only when that posting has include_financial=true; managers always get money. Reads the per-view k>=5 small-cell guard column from mba_area_analyst_views.guard_col. Returns {area_id, views:[{view_name,is_sensitive,rows[]}]}.';

-- Anon lock-out re-asserted: Supabase's ALTER DEFAULT PRIVILEGES grants anon
-- EXECUTE on every new function separately from PUBLIC, and the secdef-anon CI
-- gate treats a CREATE OR REPLACE of a locked SECDEF function as new.
REVOKE EXECUTE ON FUNCTION public.fn_mba_analyst_views(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_analyst_views(uuid) TO authenticated;

-- ============================================================================
-- ROLLBACK ARTIFACT for PART 1 — fn_mba_analyst_views
--
-- WHY THIS BLOCK EXISTS
--   This migration CREATE OR REPLACEs a live SECURITY DEFINER function that
--   currently serves 44 MBA Associates across 26 active postings. The live body
--   demonstrably DRIFTS from every repo migration file (that drift is exactly
--   how the #2388 money gate went missing), so `git revert` of this file would
--   NOT restore production — it would restore a body that never ran. The only
--   safe revert is to re-apply the captured body below.
--
-- HOW TO REVERT
--   1. Extract the block below into a runnable file. From a checkout of this
--      migration, this exact command reproduces the captured body byte-for-byte
--      (verified by round-trip diff against production at capture time):
--
--        sed -n '/^-- BEGIN CAPTURED PRIOR BODY/,/^-- END CAPTURED PRIOR BODY/p' \
--          20260727020000_teaching_cohort_enrolment.sql \
--          | grep -v 'CAPTURED PRIOR BODY' \
--          | sed -e 's/^--   //' -e 's/^--$//' > revert_fn_mba_analyst_views.sql
--
--      The result is a complete, self-contained CREATE OR REPLACE statement.
--   2. Apply it to production the same way this migration was applied
--      (Management API `database/query`, project ref kvizhngldtiuufknvehv, or
--      psql as the table owner). It needs no other DDL.
--   3. Immediately re-assert the anon lock, because a CREATE OR REPLACE
--      re-triggers Supabase's default grant to anon:
--        REVOKE EXECUTE ON FUNCTION public.fn_mba_analyst_views(uuid)
--          FROM anon, PUBLIC;
--        GRANT  EXECUTE ON FUNCTION public.fn_mba_analyst_views(uuid)
--          TO authenticated;
--   4. Verify with:
--        SELECT pg_get_functiondef(
--          'public.fn_mba_analyst_views(uuid)'::regprocedure);
--      and confirm `include_financial` no longer appears.
--
--   ⚠️ REVERTING RE-OPENS THE MONEY LEAK. The captured body has NO money gate:
--   it serves all 6 is_sensitive views to every posted Associate regardless of
--   include_financial. Reverting is a deliberate decision to accept that
--   exposure (10 learners as measured 2026-07-26), not a neutral rollback. It
--   does NOT need to be paired with a revert of Parts 2–4, which touch
--   different objects and are independent.
--
--   Parts 2, 3 and 4 need no rollback artifact: Part 2 and Part 3 are
--   INSERT ... WHERE NOT EXISTS seeds (delete the `cse_resident` /
--   `cse_facilitator` custom_roles rows and the `cse_resident` cohort row), and
--   Part 4 creates two NEW functions (DROP FUNCTION removes them).
--
-- CAPTURED VERBATIM FROM PRODUCTION 2026-07-26 via
--   SELECT pg_get_functiondef('public.fn_mba_analyst_views(uuid)'::regprocedure);
-- Independently checked at capture time: 0 occurrences of `include_financial`,
-- 0 of `v_can_money`, 3 of `is_sensitive` (one SELECT in the loop header, two in
-- the output jsonb_build_object) — i.e. never used as a filter.
-- ---------------------------------------------------------------------------
-- BEGIN CAPTURED PRIOR BODY (commented out — do not un-comment in this file)
--   CREATE OR REPLACE FUNCTION public.fn_mba_analyst_views(p_area_id uuid)
--    RETURNS jsonb
--    LANGUAGE plpgsql
--    STABLE SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     v_uid       uuid := auth.uid();
--     v_manage    boolean;
--     v_is_assoc  boolean;
--     v_posted    boolean;
--     v_rec       record;
--     v_where     text;
--     v_rows      jsonb;
--     v_views     jsonb := '[]'::jsonb;
--   BEGIN
--     IF v_uid IS NULL THEN
--       RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
--     END IF;
--
--     v_manage := is_super_admin() OR is_admin()
--                 OR user_has_permission('improvement.board.manage');
--
--     SELECT EXISTS (
--       SELECT 1
--       FROM user_roles ur
--       JOIN custom_roles cr ON cr.id = ur.role_id
--       WHERE ur.user_id = v_uid
--         AND cr.role_key = 'mba_associate'
--         AND cr.is_active
--     ) INTO v_is_assoc;
--
--     -- Gate 1: must be an MBA Associate or a board manager.
--     IF NOT (v_is_assoc OR v_manage) THEN
--       RAISE EXCEPTION 'not authorized: MBA Associate role or improvement.board.manage required'
--         USING ERRCODE = '42501';
--     END IF;
--
--     SELECT EXISTS (
--       SELECT 1
--       FROM mba_associate_postings p
--       WHERE p.associate_user_id = v_uid
--         AND p.area_id = p_area_id
--         AND p.is_active
--     ) INTO v_posted;
--
--     -- Gate 2: must be posted to THIS department (managers bypass — they see any).
--     IF NOT (v_posted OR v_manage) THEN
--       RAISE EXCEPTION 'not authorized: no active posting to this department'
--         USING ERRCODE = '42501';
--     END IF;
--
--     -- Deliver each mapped view with k>=5 small-cell suppression.
--     --   The map row IS the allowlist: only view_names present as rows for this
--     --   area are ever read, and guard_col comes FROM the row (data-only — adding a
--     --   view no longer edits this function). This replaces the old hardcoded CASE
--     --   / '__unknown__' sentinel.
--     FOR v_rec IN
--       SELECT view_name, is_sensitive, guard_col
--       FROM mba_area_analyst_views
--       WHERE area_id = p_area_id
--       ORDER BY view_name
--     LOOP
--       -- Defense-in-depth (stricter than the old CASE): the RPC can only ever read
--       -- a REAL, EXISTING learning_* relation. A typo'd, dropped, or non-learning_*
--       -- map row is skipped — never errors, never touches an arbitrary relation.
--       IF v_rec.view_name !~ '^learning_[a-z0-9_]+$'
--          OR to_regclass('public.' || v_rec.view_name) IS NULL THEN
--         CONTINUE;
--       END IF;
--
--       -- guard_col NULL => no individual-count dimension => rows pass (WHERE TRUE).
--       -- else => drop any group representing fewer than 5 underlying individuals.
--       IF v_rec.guard_col IS NULL THEN
--         v_where := 'TRUE';
--       ELSE
--         v_where := format('%I >= 5', v_rec.guard_col);
--       END IF;
--
--       EXECUTE format(
--         'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.%I t WHERE %s',
--         v_rec.view_name, v_where
--       ) INTO v_rows;
--
--       v_views := v_views || jsonb_build_object(
--         'view_name',    v_rec.view_name,
--         'is_sensitive', v_rec.is_sensitive,
--         'rows',         v_rows
--       );
--     END LOOP;
--
--     RETURN jsonb_build_object(
--       'area_id', p_area_id,
--       'views',   v_views
--     );
--   END;
--   $function$
--
-- END CAPTURED PRIOR BODY
-- ============================================================================

-- ============================================================================
-- PART 2. Roles for cohort #2 (CSE developer residency).
--
-- `cse_resident` / `cse_facilitator` are role_key CODE identifiers, which the
-- JKKN terminology rule exempts. All user-facing copy below says "learner" /
-- "Senior Learner".
--
-- ----------------------------------------------------------------------------
-- SECURITY NARROWING — cse_facilitator is NOT a copy of mba_faculty
-- ----------------------------------------------------------------------------
-- The live `mba_faculty` permissions JSONB, read from production 2026-07-26,
-- is exactly:
--     {"ceo_rounds.log": true, "improvement.board.manage": true}
--
-- Copying that verbatim would be a privilege-escalation vector, because
-- `improvement.board.manage` is not merely a board permission — inside
-- fn_mba_analyst_views (Part 1) that single key sets v_manage = true, which:
--     * bypasses Gate 1 (cohort learner-role membership),
--     * bypasses Gate 2 (active posting to THIS department), AND
--     * sets v_can_money = true (every is_sensitive money view, every area).
--
-- Lane A's faculty sync grants a cohort's faculty_role_key to EVERY staff row
-- in the configured department. So seeding cse_facilitator with
-- improvement.board.manage and then flipping the CSE cohort's is_active = true
-- would mass-grant unrestricted cross-department analytics — money included —
-- to every member of the CSE department in ONE click. A bulk department sync
-- must never be able to deliver that permission.
--
-- cse_facilitator is therefore seeded with the narrower set below. All four
-- keys exist in lib/constants/permissions.ts (verified 2026-07-26):
--     ceo_rounds.log           -> /ceo-rounds: log rounds, grade participation,
--                                 approve learner summaries (the supervision job)
--     improvement.ideas.view   -> see the Improvement Board, dashboard,
--                                 leaderboard and rotation
--     improvement.ideas.create -> file improvement ideas
--
-- What a Senior Learner does NOT get, and why that is correct:
--     improvement.board.manage -> review/approve/apply ideas, postings,
--                                 data-gaps, rotation config/teams, AND the
--                                 analytics + money bypass above.
--
-- If a specific Senior Learner genuinely needs to review and approve ideas, a
-- Director may grant `improvement.board.manage` to THAT PERSON deliberately,
-- via Role Management. It must never arrive as a side effect of a bulk
-- department sync. That is the whole distinction this narrowing encodes.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.custom_roles WHERE role_key = 'mba_associate') THEN
    RAISE EXCEPTION 'source role mba_associate is missing — cannot copy permissions for cse_resident';
  END IF;

  -- Drift guard on the COPY below. cse_resident copies mba_associate verbatim
  -- so the two cohorts' learner roles stay in lockstep. If mba_associate ever
  -- acquires a manage-grade permission, that copy would silently become the
  -- same mass-grant vector this migration exists to close — so fail loudly
  -- instead of copying it.
  IF EXISTS (
    SELECT 1 FROM public.custom_roles
    WHERE role_key = 'mba_associate'
      AND COALESCE((permissions->>'improvement.board.manage')::boolean, false)
  ) THEN
    RAISE EXCEPTION 'REFUSING TO COPY: custom_roles.mba_associate now grants improvement.board.manage. Copying it into cse_resident would grant the fn_mba_analyst_views manager bypass (all departments, money views included) to every synced CSE learner. Resolve the mba_associate grant first, then re-run.';
  END IF;
END $$;

-- cse_resident — mirrors mba_associate exactly (guarded above).
INSERT INTO public.custom_roles
  (role_key, role_name, description, permissions, module_scopes,
   institution_scope, is_system_role, is_active)
SELECT
  'cse_resident',
  'CSE Resident',
  'CSE developer-residency learners (Computer Science and Engineering learners in the residency semester window). Auto-synced from the teaching_enterprise_cohorts row cohort_key=''cse_resident''. Grants Improvement Board create/view plus CEO Rounds summary authoring — identical to MBA Associate. contribution_mode=''build'': a Resident takes an approved idea and ships the change, where an MBA Associate analyses and files it.',
  src.permissions,
  src.module_scopes,
  src.institution_scope,
  false,
  true
FROM public.custom_roles src
WHERE src.role_key = 'mba_associate'
  AND NOT EXISTS (
    SELECT 1 FROM public.custom_roles WHERE role_key = 'cse_resident'
  );

-- cse_facilitator — NARROWED (see SECURITY NARROWING above). Permissions are
-- written as explicit FLAT keys, which is the form hooks/use-permissions.ts
-- reads first. institution_scope is pinned to 'own' rather than inherited, so a
-- later change to mba_faculty's scope cannot silently widen this role.
INSERT INTO public.custom_roles
  (role_key, role_name, description, permissions, module_scopes,
   institution_scope, is_system_role, is_active)
SELECT
  'cse_facilitator',
  'CSE Senior Learner',
  'Senior Learners of the Computer Science and Engineering department. Auto-synced from department membership per the teaching_enterprise_cohorts row cohort_key=''cse_resident'' (faculty_source=''department_membership''). Supervises the residency: logs CEO Rounds, grades participation and approves learner summaries, and reads and files Improvement Board ideas. Deliberately does NOT grant improvement.board.manage — that permission also confers the cross-department analytics and financial-view bypass in fn_mba_analyst_views, and must never be delivered by a bulk department sync. A Director may grant it to an individual Senior Learner via Role Management when review/approve duty is genuinely required.',
  jsonb_build_object(
    'ceo_rounds.log',           true,
    'improvement.ideas.view',   true,
    'improvement.ideas.create', true
  ),
  '{}'::jsonb,
  'own',
  false,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.custom_roles WHERE role_key = 'cse_facilitator'
);

-- Post-seed assertion: neither new role may carry the manager bypass. This is
-- the invariant the whole narrowing exists to protect, so it is asserted rather
-- than assumed — and it also catches a pre-existing cse_facilitator row left by
-- an earlier partial run (the WHERE NOT EXISTS above would skip that row).
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(role_key, ', ' ORDER BY role_key) INTO v_bad
  FROM public.custom_roles
  WHERE role_key IN ('cse_resident', 'cse_facilitator')
    AND COALESCE((permissions->>'improvement.board.manage')::boolean, false);

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'INVARIANT VIOLATED: role(s) % grant improvement.board.manage, which confers the fn_mba_analyst_views manager bypass (all departments + money views). A cohort role populated by bulk department sync must never hold it.', v_bad;
  END IF;
END $$;

-- ============================================================================
-- PART 3. CSE cohort config row.
--
-- IDs re-verified live on production 2026-07-26 for this file (never invented),
-- and cross-checked for mutual consistency:
--   program_id     7bf53be0-1cc5-407d-9a14-c1b6b39e874a
--                  = programs.program_id 'CSE',
--                    'B.E. Computer Science and Engineering'.
--   department_id  f88b1171-1753-46b3-b3fb-961ef54feb36
--                  = departments 'Computer Science and Engineering'.
--                    This is also that programme's OWN departments FK, so the
--                    programme and the department are not merely co-named.
--   institution_id 5de4fba1-4564-41ed-8c73-5d948b74b843
--                  = JKKN College of Engineering and Technology, and the
--                    institution_id of BOTH rows above.
--   Disambiguation: two programmes share the display name 'B.E. Computer
--   Science and Engineering'. The other one (programs.program_id 'CSE-SH') is
--   parented to the Science and Humanities department, so the row above — whose
--   program_id code is plainly 'CSE' and whose department FK is the CSE
--   department — is the unambiguous match.
--
-- semester_orders '{5,6,7}' — rationale: a developer residency needs learners
--   who have finished the CS core (through semester 4) and are not in the
--   final-semester capstone/placement window (8), where a multi-month residency
--   cannot fit the academic calendar. Semesters {3,4} (the MBA window) are
--   deliberately excluded: those learners lack the build grounding a
--   contribution_mode='build' cohort assumes.
--   ⚠️ The per-semester learner counts quoted in the previous draft of this
--   file could NOT be re-verified here: learners_profiles has no
--   `semester_order` column, so the cohort's semester predicate is resolved
--   elsewhere (Lane A's sync). This is harmless while the row is inactive — the
--   window selects nobody until the Director activates — but the Director
--   should confirm the resulting learner count from the admin screen's live
--   member count BEFORE activating.
--
-- is_active = false — DELIBERATE, and the one thing the Director must decide.
--   Reason: activation is what makes the generic sync grant `cse_resident` to
--   the qualifying learners and `cse_facilitator` to the CSE department's Senior
--   Learners. Lane A's sync loops over ACTIVE config rows only, so once the
--   grant has happened, flipping is_active back to false SKIPS the cohort
--   rather than removing the roles — the flag is not a clean un-grant.
--   While inactive the row is inert: the Part-1 gate only reads is_active rows,
--   so no CSE learner or Senior Learner gains analytics access on apply.
--
--   Activation is now a SUPER ADMIN action (see Part 4 — it was previously
--   reachable by any holder of improvement.board.manage, which was the
--   escalation path this migration closes). A super administrator activates
--   deliberately, after Lane A's 44/6/26 no-op regression test passes, via
--   /admin/teaching-cohorts (one click, no deploy) or:
--     SELECT public.fn_teaching_cohort_update('cse_resident', p_is_active => true);
-- ============================================================================
INSERT INTO public.teaching_enterprise_cohorts
  (cohort_key, display_name, program_id, department_id, semester_orders,
   learner_role_key, faculty_role_key, faculty_source, contribution_mode,
   institution_id, is_active)
SELECT
  'cse_resident',
  'CSE Resident',
  '7bf53be0-1cc5-407d-9a14-c1b6b39e874a'::uuid,
  'f88b1171-1753-46b3-b3fb-961ef54feb36'::uuid,
  '{5,6,7}'::int[],
  'cse_resident',
  'cse_facilitator',
  'department_membership',
  'build',
  '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM public.teaching_enterprise_cohorts WHERE cohort_key = 'cse_resident'
);
-- WHERE NOT EXISTS, never ON CONFLICT (42P10 against expression unique indexes).

-- ============================================================================
-- PART 4. Admin read / write path for the cohort config rows.
--
-- Follows the repo's hardened-config pattern (read-only base table, writes via
-- SECDEF RPCs — same shape as the PM Change Requests hardening), so this
-- migration owns its whole write path and cannot conflict with, or depend on,
-- Lane A's policy set.
--
-- PRIVILEGE SPLIT — deliberately asymmetric:
--   READ  (fn_teaching_cohort_list)   improvement.board.manage / is_admin /
--                                     is_super_admin. Matches spec §4.1 and
--                                     Lane A's SELECT policy exactly.
--   WRITE (fn_teaching_cohort_update) SUPER ADMIN ONLY.
--
-- Why the write path is stricter than the read path: `is_active` is not a
-- display flag. Activating a cohort makes Lane A's sync grant that cohort's
-- learner_role_key and faculty_role_key in bulk, and grants every holder of the
-- learner role analytics access through Part 1's Gate 1. A single UPDATE
-- therefore changes who can read other departments' data. Spec §4.1 grants
-- improvement.board.manage a READ policy and specifies NO write path; gating
-- writes at that permission would have let any of the 6 current
-- improvement.board.manage holders (none of whom is a super administrator,
-- measured 2026-07-26) activate a cohort. Cohort activation is a
-- migration-grade decision, so it is held at the highest bar.
--
-- Note is_admin() is NOT accepted for writes either: it is satisfied by the
-- hardcoded legacy roles ('admin' / 'super_admin' / 'administrator') and is a
-- known over-broad bypass. Only profiles.is_super_admin = true may write.
--
-- SURFACE COMPLETENESS: after this migration the ONLY write path to
-- teaching_enterprise_cohorts reachable from a browser session is
-- fn_teaching_cohort_update. Lane A grants `authenticated` SELECT and nothing
-- else, and ships no INSERT/UPDATE/DELETE policy. The REVOKE below re-asserts
-- that table-level position so this file's guarantee cannot be undone by a
-- later edit to Lane A. There is deliberately no INSERT RPC: new cohorts arrive
-- by migration, reviewed, not from a UI form.
--
-- Both functions are user-callable => GRANT authenticated, REVOKE anon+PUBLIC.
-- Every guard is COALESCE(..., false): a bare `IF NOT (SELECT …)` falls through
-- when there is no session, because NOT NULL is NULL, not TRUE.
-- ============================================================================

-- Defence in depth: no browser role may write this table directly, under any
-- RLS policy. Idempotent, and a no-op against Lane A as shipped.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.teaching_enterprise_cohorts
  FROM authenticated, anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.fn_teaching_cohort_list()
RETURNS TABLE (
  cohort_key        text,
  display_name      text,
  program_id        uuid,
  program_name      text,
  department_id     uuid,
  department_name   text,
  semester_orders   int[],
  learner_role_key  text,
  faculty_role_key  text,
  faculty_source    text,
  contribution_mode text,
  institution_id    uuid,
  institution_name  text,
  is_active         boolean,
  learner_members   integer,
  faculty_members   integer,
  updated_at        timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- READ gate — improvement.board.manage is sufficient (spec §4.1).
  IF NOT (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR COALESCE(user_has_permission('improvement.board.manage'), false)
  ) THEN
    RAISE EXCEPTION 'not authorized: improvement.board.manage or super administrator required to view teaching cohorts'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.cohort_key::text,
    c.display_name::text,
    c.program_id,
    pr.program_name::text,
    c.department_id,
    d.department_name::text,
    c.semester_orders,
    c.learner_role_key::text,
    c.faculty_role_key::text,
    c.faculty_source::text,
    c.contribution_mode::text,
    c.institution_id,
    i.name::text,
    c.is_active,
    -- Live member counts: how many users currently hold each granted role.
    COALESCE((
      SELECT count(*) FROM user_roles ur
      JOIN custom_roles cr ON cr.id = ur.role_id
      WHERE cr.role_key = c.learner_role_key
    ), 0)::integer,
    COALESCE((
      SELECT count(*) FROM user_roles ur
      JOIN custom_roles cr ON cr.id = ur.role_id
      WHERE c.faculty_role_key IS NOT NULL
        AND cr.role_key = c.faculty_role_key
    ), 0)::integer,
    c.updated_at
  FROM teaching_enterprise_cohorts c
  LEFT JOIN programs     pr ON pr.id = c.program_id
  LEFT JOIN departments  d  ON d.id  = c.department_id
  LEFT JOIN institutions i  ON i.id  = c.institution_id
  ORDER BY c.is_active DESC, c.display_name;
END;
$fn$;

COMMENT ON FUNCTION public.fn_teaching_cohort_list() IS
  'Lists teaching_enterprise_cohorts config rows with resolved programme / department / institution names and live member counts, for /admin/teaching-cohorts. READ-ONLY. Requires improvement.board.manage, is_admin or is_super_admin (spec §4.1). Writing requires super administrator — see fn_teaching_cohort_update.';

REVOKE EXECUTE ON FUNCTION public.fn_teaching_cohort_list() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_teaching_cohort_list() TO authenticated;

-- Editable fields only. cohort_key is the immutable identity, and program_id /
-- department_id / *_role_key are deliberately NOT editable here — changing who
-- a cohort points at is a migration-grade decision, not a UI toggle.
-- NULL argument = leave that column unchanged.
--
-- SUPER ADMIN ONLY. See the PRIVILEGE SPLIT note above: is_active drives bulk
-- role grants and cross-department analytics access, so improvement.board.manage
-- is NOT sufficient here even though it is sufficient to read.
CREATE OR REPLACE FUNCTION public.fn_teaching_cohort_update(
  p_cohort_key        text,
  p_display_name      text    DEFAULT NULL,
  p_semester_orders   int[]   DEFAULT NULL,
  p_contribution_mode text    DEFAULT NULL,
  p_is_active         boolean DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- WRITE gate — super administrator ONLY. Not improvement.board.manage (which
  -- would let a board manager activate a cohort and thereby bulk-grant roles),
  -- and not is_admin() (hardcoded legacy-role bypass). Explicit, never a silent
  -- no-op: the caller is told exactly what is required.
  IF NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'not authorized: changing a teaching cohort requires a super administrator. Activating a cohort bulk-grants its learner and Senior Learner roles and opens cross-department analytics, so improvement.board.manage is intentionally not sufficient.'
      USING ERRCODE = '42501';
  END IF;

  IF p_cohort_key IS NULL OR btrim(p_cohort_key) = '' THEN
    RAISE EXCEPTION 'cohort_key is required' USING ERRCODE = '22023';
  END IF;

  IF p_display_name IS NOT NULL AND btrim(p_display_name) = '' THEN
    RAISE EXCEPTION 'display_name cannot be blank' USING ERRCODE = '22023';
  END IF;

  IF p_contribution_mode IS NOT NULL
     AND p_contribution_mode NOT IN ('analyse', 'build') THEN
    RAISE EXCEPTION 'contribution_mode must be analyse or build' USING ERRCODE = '22023';
  END IF;

  -- An empty semester window would silently match nobody; reject it rather
  -- than let the sync quietly de-populate a cohort.
  IF p_semester_orders IS NOT NULL
     AND (array_length(p_semester_orders, 1) IS NULL
          OR EXISTS (SELECT 1 FROM unnest(p_semester_orders) s WHERE s < 1)) THEN
    RAISE EXCEPTION 'semester_orders must be a non-empty list of positive integers'
      USING ERRCODE = '22023';
  END IF;

  UPDATE teaching_enterprise_cohorts c
     SET display_name      = COALESCE(p_display_name,      c.display_name),
         semester_orders   = COALESCE(p_semester_orders,   c.semester_orders),
         contribution_mode = COALESCE(p_contribution_mode, c.contribution_mode),
         is_active         = COALESCE(p_is_active,         c.is_active),
         updated_at        = now()
   WHERE c.cohort_key = p_cohort_key;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'no teaching_enterprise_cohorts row with cohort_key=%', p_cohort_key
      USING ERRCODE = 'P0002';
  END IF;

  RETURN true;
END;
$fn$;

COMMENT ON FUNCTION public.fn_teaching_cohort_update(text, text, int[], text, boolean) IS
  'Updates the editable fields of one teaching_enterprise_cohorts row (display_name, semester_orders, contribution_mode, is_active) for /admin/teaching-cohorts. NULL argument = leave unchanged. cohort_key, program_id, department_id and the role keys are not editable here. SUPER ADMINISTRATOR ONLY: is_active drives bulk role grants and cross-department analytics access, so improvement.board.manage (sufficient to READ via fn_teaching_cohort_list) is deliberately not sufficient to write.';

REVOKE EXECUTE ON FUNCTION public.fn_teaching_cohort_update(text, text, int[], text, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_teaching_cohort_update(text, text, int[], text, boolean) TO authenticated;

COMMIT;

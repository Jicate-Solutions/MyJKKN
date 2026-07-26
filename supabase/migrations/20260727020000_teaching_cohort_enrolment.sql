-- Migration: Teaching-enterprise spine — cohort-driven analytics gate + CSE resident enrolment
-- Date: 2026-07-27
-- Spec: specs/teaching-enterprise-spine-generalization-2026-07-26.md (§4.3, §4.4, §4.5, Phase 1b)
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
-- WHAT THIS DOES
--   1. Widens the analytics-delivery gate `fn_mba_analyst_views(uuid)` so the
--      learner-role check is CONFIG-DRIVEN (any active cohort's
--      learner_role_key) instead of the hardcoded literal 'mba_associate'.
--      This is the single semantic change the Phase-1b spec authorises.
--   2. Restores the `include_financial` money gate that was silently dropped on
--      production (see "REGRESSION REPAIR" below). Delimited so it can be
--      removed as one block if the Director wants the widening alone.
--   3. Seeds two roles for cohort #2 — `cse_resident` and `cse_facilitator` —
--      by COPYING the permission JSONB from the live `mba_associate` /
--      `mba_faculty` rows (never retyped, so the two cohorts cannot drift).
--   4. Seeds the CSE cohort config row (is_active = false — see Part 3 note).
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
--   * Live definition on prod therefore contains NO reference to
--     include_financial. Measured blast radius: 6 is_sensitive mapped views ×
--     26 active postings, every one of which has include_financial = false —
--     i.e. all 26 posted Associates can currently read money views that the
--     designed policy says they must not.
--
-- This migration rebases on the LIVE (guard_col / individual-counting) body —
-- so the #2449/#2435 privacy hardening is preserved verbatim, NOT regressed to
-- event counting — and re-applies the #2388 money gate on top.
--
-- Effect on production once applied: the 6 money views stop being served to the
-- 26 posted Associates whose include_financial = false. That is the DESIGNED
-- behaviour of #2388; it is a tightening, never a widening, of access. A board
-- manager (improvement.board.manage) still sees every view including money.
--
-- ============================================================================
-- SAFETY: timings taken on production before replacing this SECDEF
-- ============================================================================
-- Every mapped analyst view was executed with its real guard predicate
-- (2026-07-26). Slowest: learning_admission_funnel 41.8 ms (116 rows);
-- learning_channel_roi 29.1 ms; learning_conversion_gaps 24.1 ms; all other 12
-- views <= 7.2 ms. Whole-loop worst case ~132 ms across all 15 map rows. No
-- long-running statement, so CREATE OR REPLACE takes its lock instantly.

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
--   * the k>=5 small-cell suppression reading guard_col FROM the map row, which
--     counts INDIVIDUALS (distinct_payers / distinct_employees /
--     distinct_residents / distinct_learners) — the #2449 hardening. NOT
--     regressed to the older event-counting CASE.
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

    -- guard_col NULL => no individual-count dimension => rows pass (WHERE TRUE).
    -- else => drop any group representing fewer than 5 underlying INDIVIDUALS
    -- (the #2449 hardening: guard_col points at a distinct-person count, not an
    -- event count).
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
  'Assignment-scoped delivery of de-identified analyst views for one improvement_area. Gate 1: caller holds the learner_role_key of any ACTIVE teaching_enterprise_cohorts row (config-driven since 2026-07-27), or improvement.board.manage. Gate 2: an active mba_associate_postings row for the area (managers bypass). is_sensitive (money) views are delivered only when that posting has include_financial=true; managers always get money. Reads the per-view k>=5 guard column from mba_area_analyst_views.guard_col, which counts INDIVIDUALS. Returns {area_id, views:[{view_name,is_sensitive,rows[]}]}.';

-- Anon lock-out re-asserted: Supabase's ALTER DEFAULT PRIVILEGES grants anon
-- EXECUTE on every new function separately from PUBLIC, and the secdef-anon CI
-- gate treats a CREATE OR REPLACE of a locked SECDEF function as new.
REVOKE EXECUTE ON FUNCTION public.fn_mba_analyst_views(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_analyst_views(uuid) TO authenticated;

-- ============================================================================
-- PART 2. Roles for cohort #2 (CSE developer residency).
--
-- The permission JSONB is COPIED from the live mba_* rows, never retyped, so
-- cohort #2 cannot drift from cohort #1. Those rows store FLAT keys
--   mba_associate -> {"improvement.ideas.view","improvement.ideas.create","ceo_rounds.summary.write"}
--   mba_faculty   -> {"improvement.board.manage","ceo_rounds.log"}
-- and the flat form is what hooks/use-permissions.ts merges, so the copy is
-- read correctly by the UI gate.
--
-- Note on identifiers: `cse_resident` / `cse_facilitator` are role_key CODE
-- identifiers, which the JKKN terminology rule exempts. All user-facing copy
-- below says "learner" / "Senior Learner".
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.custom_roles WHERE role_key = 'mba_associate') THEN
    RAISE EXCEPTION 'source role mba_associate is missing — cannot copy permissions for cse_resident';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.custom_roles WHERE role_key = 'mba_faculty') THEN
    RAISE EXCEPTION 'source role mba_faculty is missing — cannot copy permissions for cse_facilitator';
  END IF;
END $$;

-- cse_resident — mirrors mba_associate exactly.
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

-- cse_facilitator — mirrors mba_faculty exactly (improvement.board.manage + ceo_rounds.log).
INSERT INTO public.custom_roles
  (role_key, role_name, description, permissions, module_scopes,
   institution_scope, is_system_role, is_active)
SELECT
  'cse_facilitator',
  'CSE Senior Learner',
  'Senior Learners of the Computer Science and Engineering department. Auto-synced from department membership per the teaching_enterprise_cohorts row cohort_key=''cse_resident'' (faculty_source=''department_membership''). Grants Improvement Board management plus CEO Rounds logging, and — as board managers — read access to every department''s de-identified analytics, financial views included.',
  src.permissions,
  src.module_scopes,
  src.institution_scope,
  false,
  true
FROM public.custom_roles src
WHERE src.role_key = 'mba_faculty'
  AND NOT EXISTS (
    SELECT 1 FROM public.custom_roles WHERE role_key = 'cse_facilitator'
  );

-- ============================================================================
-- PART 3. CSE cohort config row.
--
-- IDs read live from production 2026-07-26 (never invented):
--   program_id     7bf53be0-1cc5-407d-9a14-c1b6b39e874a
--                  = programs.program_id 'CSE', 'B.E. Computer Science and
--                    Engineering', 163 active learners.
--   department_id  f88b1171-1753-46b3-b3fb-961ef54feb36
--                  = departments 'Computer Science and Engineering'
--                    (8 active Senior Learners, all with a login profile).
--   institution_id 5de4fba1-4564-41ed-8c73-5d948b74b843
--                  = JKKN College of Engineering and Technology (matches both
--                    the programme and the department, cross-checked).
--   Disambiguation: two programmes share the name 'B.E. Computer Science and
--   Engineering'. The other one (programs.program_id 'CSE-SH') is parented to
--   the Science and Humanities department and has 0 active learners, so the
--   CSE-department row above is the unambiguous match.
--
-- semester_orders '{5,6,7}' — JUSTIFICATION. Live distribution of the 163
--   active CSE learners by semester_order: 3 -> 60, 4 -> 2, 5 -> 48, 6 -> 1,
--   7 -> 52 (8 -> 0). A developer residency needs learners who have finished
--   the CS core (programming, data structures, DBMS — through semester 4) and
--   are NOT in the final-semester capstone/placement window (8), where a
--   multi-month residency cannot fit the academic calendar. {5,6,7} therefore
--   selects 101 of the 163 learners. Semesters {3,4} (the MBA window) are
--   deliberately excluded: those learners lack the build grounding a
--   contribution_mode='build' cohort assumes.
--
-- is_active = false — DELIBERATE, and the one thing the Director must decide.
--   Reason: activation is what makes the generic sync grant `cse_resident` to
--   101 learners. Lane A's sync loops over ACTIVE config rows only, so once the
--   grant has happened, flipping is_active back to false SKIPS the cohort
--   rather than removing the role — the flag is not a clean un-grant. The
--   Director should therefore activate deliberately, after Lane A's 44/6/26
--   no-op regression test passes, using the new admin screen
--   /admin/teaching-cohorts (one click, no deploy) or:
--     UPDATE public.teaching_enterprise_cohorts
--        SET is_active = true, updated_at = now()
--      WHERE cohort_key = 'cse_resident';
--   While inactive the row is inert: the Part-1 gate only reads is_active rows,
--   so no CSE learner gains analytics access on apply.
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
-- PART 4. Admin read/write path for the cohort config rows.
--
-- Deliberately NOT a grant + RLS policy on Lane A's table: this follows the
-- repo's hardened-config pattern (read-only base table, writes via SECDEF
-- RPCs — same shape as the PM Change Requests hardening). It also means this
-- migration owns its whole write path and cannot conflict with, or depend on,
-- whatever policy set Lane A ships.
--
-- Both functions are user-callable => GRANT authenticated, REVOKE anon+PUBLIC.
-- Both guards COALESCE(..., false): a bare `IF NOT (SELECT …)` falls through
-- when there is no session.
-- ============================================================================

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

  IF NOT (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR COALESCE(user_has_permission('improvement.board.manage'), false)
  ) THEN
    RAISE EXCEPTION 'not authorized: improvement.board.manage or super admin required'
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
  'Lists teaching_enterprise_cohorts config rows with resolved programme / department / institution names and live member counts, for /admin/teaching-cohorts. Requires improvement.board.manage, is_admin or is_super_admin.';

REVOKE EXECUTE ON FUNCTION public.fn_teaching_cohort_list() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_teaching_cohort_list() TO authenticated;

-- Editable fields only. cohort_key is the immutable identity, and program_id /
-- department_id / *_role_key are deliberately NOT editable here — changing who
-- a cohort points at is a migration-grade decision, not a UI toggle.
-- NULL argument = leave that column unchanged.
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

  IF NOT (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR COALESCE(user_has_permission('improvement.board.manage'), false)
  ) THEN
    RAISE EXCEPTION 'not authorized: improvement.board.manage or super admin required'
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
  'Updates the editable fields of one teaching_enterprise_cohorts row (display_name, semester_orders, contribution_mode, is_active) for /admin/teaching-cohorts. NULL argument = leave unchanged. cohort_key, program_id, department_id and the role keys are not editable here. Requires improvement.board.manage, is_admin or is_super_admin.';

REVOKE EXECUTE ON FUNCTION public.fn_teaching_cohort_update(text, text, int[], text, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_teaching_cohort_update(text, text, int[], text, boolean) TO authenticated;

COMMIT;

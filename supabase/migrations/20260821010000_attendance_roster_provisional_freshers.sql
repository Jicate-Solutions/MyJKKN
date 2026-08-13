-- =====================================================================
-- 20260821010000 — provisional freshers reach the attendance roster
-- =====================================================================
-- FILE ONLY / NOT APPLIED — Director-gated. Nothing here has been run against
-- production; the numbers below were read with SELECT only.
--
-- Spec: specs/provisional-freshers-spec-2026-08-05.md (§2.6, §4.6, §6.4, §7.1)
--
-- THE DEFECT
-- ----------
-- A learner who has reserved or been offered a seat for the CURRENT intake, but
-- has not yet cleared the fee gate that promotes them to `active`, cannot be
-- marked present. `fn_attendance_roster` filters `lifecycle_status = 'active'`,
-- so those learners are not marked absent — they are absent from the screen.
-- The person marking cannot tell that anybody is missing.
--
-- Measured on production 2026-08-08 (SELECT only, and these numbers drift —
-- nine sessions write this database, so they are evidence, never a fixture):
--   994 current-intake learners at `reserved` (870) or `admitted` (124)
--   529 of them already sit in a real section
--   ZERO attendance rows for any of them, across the entire history of
--   student_attendance — the capability does not partly exist, it is nil.
--
-- WHAT THIS CHANGES, AND WHAT IT DELIBERATELY DOES NOT
-- ---------------------------------------------------
-- Director decision (2026-08-05): provisional learners are markable from day
-- one, and are NEVER removed from a roster afterwards.
--
-- This is NOT a new `lifecycle_status` enum value and NOT a new boolean column.
-- It is a derived condition over statuses that already exist. Three reasons,
-- all recorded in the spec:
--   * a Postgres enum value cannot be dropped — adding one is a one-way door,
--     and this repo already has an add-then-drop cycle (20260508140001 →
--     20260509063308) that had to recreate the type;
--   * a new value would silently change the meaning of all 88 existing
--     lifecycle_status filters at once — every IN-list that omits it starts
--     excluding a population it used to include;
--   * `evaluate_learner_status_after_payment` keys on the exact strings
--     'account' and 'reserved'. A learner moved to some new status falls out of
--     its guard and becomes UNPROMOTABLE — stranded behind the fee gate
--     permanently. That alone disqualifies the enum approach.
--
-- Because nothing here writes `lifecycle_status`, the ₹6.26 crore fee gate is
-- untouched STRUCTURALLY rather than merely by intention. There is no path from
-- this file to `active`.
--
-- WHY THE WINDOW IS ABSENT, AND WHY THAT IS NOT A GAP
-- --------------------------------------------------
-- The spec's provisional predicate carries a third term — a window, after which
-- the learner "lapses". The window is NOT needed here, and its absence blocks
-- nothing: Director decision 2 is that a lapsed learner STAYS on the roster and
-- is merely flagged. Roster membership therefore does not depend on the window
-- at all; only the flag's wording does. The window's configuration shape is
-- still open (spec §8 — `platform_policies` has no `programme` scope), so the
-- lapse wording ships later. Membership does not wait for it.
--
-- SCOPE — this widens WHO IS RETURNED, never WHO MAY ASK
-- -----------------------------------------------------
-- The authorization guard below is reproduced byte-for-byte from the live
-- definition and is not touched. It still requires institution access (or the
-- visiting-teaching grant) AND an attendance permission key, so this function
-- cannot be pointed at another college's section by passing its id. The added
-- predicate is a filter over learners INSIDE the already-authorized scope; it
-- can only ever add current-intake learners of an institution the caller was
-- already entitled to read.
--
-- STALE-BODY CHECK
-- ----------------
-- DDL reaches this database through the Management API, so the repo file is not
-- automatically what runs. `pg_get_functiondef` was read from production
-- 2026-08-08 and compared to 20260723140000_attendance_roster_section_
-- authoritative.sql: byte-identical after whitespace normalisation. The body
-- below is that live body with ONE changed clause.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. "Current intake", defined once.
-- ---------------------------------------------------------------------
-- The provisional predicate has to hold identically in SQL and in TypeScript.
-- The induction-tier spec that this design reuses warns exactly here: its status
-- list is mirrored by hand into a trigger, and "both gate on the same list —
-- they must widen together". Rather than mirror the admission-year rule too,
-- both halves call THIS function, so there is one definition and it cannot
-- drift.
--
-- It exists because the browser cannot answer the question. `admission_years`
-- has RLS requiring `admission.settings.years.view`, and of the eight active
-- roles holding `academic.attendance.mark` only `hod` has it (verified on
-- production 2026-08-08). A direct client read therefore returns zero rows with
-- error = null for the other seven — including `faculty`, who do most of the
-- marking — which is the silent-denial failure class: the feature would appear
-- to work for HODs and do nothing at all for everyone else, with no error to
-- explain it.
--
-- What it returns is identifiers only — no learner data, no counts, no names —
-- and it cannot widen any roster on its own, because every call site applies
-- institution scoping independently (the RPC's own guard below; RLS plus an
-- explicit institution filter on the service path). `is_current` is enforced
-- one-per-institution by admission_years_enforce_single_current(), so this is a
-- short list (11 rows on 2026-08-08, one per institution).
CREATE OR REPLACE FUNCTION public.fn_current_admission_year_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(ay.id), '{}'::uuid[])
  FROM public.admission_years ay
  WHERE ay.is_current = true;
$function$;

-- Lock down execution. REVOKE FROM PUBLIC alone is NOT sufficient on Supabase:
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon`
-- gives anon a DIRECT grant on every newly created function, separate from
-- PUBLIC. Without the explicit anon revoke this would be callable by any
-- unauthenticated client holding the public anon key, which ships in the
-- browser bundle.
REVOKE EXECUTE ON FUNCTION public.fn_current_admission_year_ids() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_current_admission_year_ids() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. The roster itself.
-- ---------------------------------------------------------------------
-- Everything except the WHERE's first clause is verbatim from the live
-- definition: the auth guard, the returned columns (which already include
-- lifecycle_status, so the UI can distinguish provisional rows without any
-- change to the function's signature), the section-authoritative CASE, and the
-- ordering. Idempotent CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.fn_attendance_roster(p_institution_id uuid, p_section_ids uuid[] DEFAULT NULL::uuid[], p_degree_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_semester_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, roll_number text, student_photo_url text, institution_id uuid, degree_id uuid, program_id uuid, department_id uuid, semester_id uuid, section_id uuid, lifecycle_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the access checks that learners_profiles_select_policy
  -- would normally enforce MUST be replicated here. Gate on institution access + an
  -- attendance permission key (never on hardcoded role names).
  -- Updated 2026-07-06: staff_teaches_in_institution() admits visiting staff — a
  -- staff member assigned (via staff planning) to teach in an institution other
  -- than their own can load the roster there.
  IF NOT (
    is_super_admin()
    OR is_admin()
    OR (
      (
        role_has_institution_access(p_institution_id)
        OR staff_teaches_in_institution(p_institution_id)
      )
      AND (
        user_has_permission('academic.attendance.mark')
        OR user_has_permission('academic.attendance.view')
        OR user_has_permission('academic.attendance.reports')
      )
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to view the attendance roster for this institution'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    lp.id,
    lp.first_name,
    lp.last_name,
    lp.roll_number,
    lp.student_photo_url,
    lp.institution_id,
    lp.degree_id,
    lp.program_id,
    lp.department_id,
    lp.semester_id,
    lp.section_id,
    lp.lifecycle_status::text
  FROM public.learners_profiles lp
  -- Updated 2026-08-08: provisional freshers join the roster. `active` is
  -- unchanged and evaluated first, so no learner who appears today can stop
  -- appearing — this predicate is strictly additive.
  --
  -- The admission-year term is load-bearing even though it looks redundant
  -- today: on 2026-08-08 every `reserved`/`admitted` row in the database is
  -- current-intake, so dropping it would change nothing NOW. It stops being
  -- redundant at the next intake, when `is_current` moves to the new year and
  -- this year's never-paid learners keep their status under a year that is no
  -- longer current. Without it they would silently keep a roster seat forever.
  --
  -- A NULL admission_year_id yields NULL from `= ANY(...)`, which is not TRUE,
  -- so a provisional learner whose intake cannot be established is excluded.
  -- That is the intended direction: absence of evidence of current intake is
  -- not evidence of it.
  WHERE (
      lp.lifecycle_status = 'active'
      OR (
        lp.lifecycle_status IN ('reserved', 'admitted')
        AND lp.admission_year_id = ANY (public.fn_current_admission_year_ids())
      )
    )
    AND lp.institution_id = p_institution_id
    -- Section is AUTHORITATIVE. When a section scope is given it alone determines
    -- the roster; the degree/program/semester params are redundant denormalized
    -- copies from the timetable/section row and, if drifted, would silently drop
    -- matching-section learners (BUG-003249/003250). They still apply on the
    -- no-section path, where they are the only scoping available.
    -- Department is intentionally NOT filtered: teaching staff can teach learners
    -- from other departments (subdivision groups / electives).
    AND CASE
          WHEN p_section_ids IS NOT NULL
            THEN lp.section_id = ANY (p_section_ids)
          ELSE (p_degree_id   IS NULL OR lp.degree_id   = p_degree_id)
           AND (p_program_id  IS NULL OR lp.program_id  = p_program_id)
           AND (p_semester_id IS NULL OR lp.semester_id = p_semester_id)
        END
  ORDER BY lp.first_name ASC, lp.last_name ASC;
END;
$function$;

-- Re-assert the lock. CREATE OR REPLACE preserves existing privileges, but this
-- function is redefined by several migrations over time and an implicit grant is
-- not a reviewable one — restate it so every file that touches the body also
-- shows who may execute it.
REVOKE EXECUTE ON FUNCTION public.fn_attendance_roster(uuid, uuid[], uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_attendance_roster(uuid, uuid[], uuid, uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- KNOWN AND DISCLOSED — this reaches 529 of 994, not 994.
-- =====================================================================
-- 465 of the 994 provisional learners carry NO section_id (measured 2026-08-08:
-- 429 of 870 `reserved`, 36 of 124 `admitted`). The roster is keyed on section,
-- so those learners remain invisible after this change — they fail the CASE
-- above, not the status test.
--
-- That is a DATA-READINESS blocker, not a code one, and NONE of the four locked
-- Director decisions covers it. No section-assignment rule is invented here.
-- It needs a Director decision; see the PR body.
-- =====================================================================

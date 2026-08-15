-- ============================================================================
-- 2026-08-15 — A team-taught session belongs on EVERY assigned Senior Learner's
--              own attendance report, not just the primary one's.
--
-- Rebuilt VERBATIM from the live production definition
--   (pg_get_functiondef of public.get_faculty_attendance_reports, oid 576168,
--    read 2026-08-15). Only the membership test changes; the ACL loses one item.
--
-- THE DEFECT
-- ----------
-- student_attendance.attendance_data is a JSONB object keyed by timetable slot.
-- Each slot's 'assigned_faculty' is stored in TWO shapes:
--     object  { faculty_id, faculty_name, faculty_email }
--     array   [ { faculty_id, is_primary: true, ... }, { ... }, ... ]
-- The membership test read  assigned_faculty ->> 'faculty_id'.  Applying ->>
-- with a TEXT key to a JSON ARRAY returns NULL, so every array-shaped slot
-- failed the test and the row never appeared on any assignee's report — not
-- even the primary's, unless that person happened to be the marker.
--
-- Production census, whole table, 2026-08-15 (independently measured for this
-- migration, not inherited):
--     31,026 slots over 11,978 rows
--        25,766 object-shaped  (83.0%)
--         5,952 array-shaped   (19.2% of the shaped slots) — 19,557 elements,
--                              lengths 2..14, every array carrying exactly one
--                              is_primary = true (5,952 / 5,952)
--         3,308 with no 'assigned_faculty' key at all
--
-- WHAT THIS RECOVERS  (denominators stated; method in the PR body)
--     15,299  distinct (person, row) pairs live inside array-shaped slots
--     10,978  of those are invisible today — the person is matched by NEITHER
--             the object branch on another slot of the same row NOR the
--             marked_by_details branch.  These are what this migration returns.
--        738  were already visible via an object-shaped slot on the same row
--      3,583  were already visible because that person marked the register
--        184  distinct people appear inside arrays; all 184 are real rows in
--             the team-member directory
--         17  of them receive ZERO rows today and become visible here
--
-- WHY THIS DOES *NOT* USE fn_attendance_slot_faculty(jsonb)
-- --------------------------------------------------------
-- That helper (PRs #2860 / #3092 / #3095 / #3096) returns the PRIMARY assignee
-- only. That is correct for an AUTHORISATION GUARD — "is the caller this
-- session's owner?" — and wrong for a MEMBERSHIP FILTER, which is what this
-- function is: "which attendance rows belong on MY report?".
-- Measured on production for this migration: a primary-only test recovers
-- 2,643 of the 10,978 missing pairs (24.1%) and leaves 8,335 (75.9%) missing,
-- and leaves 8 of the 17 invisible people still invisible. A partial fix that
-- reads as complete is worse than the known defect, because the remainder
-- stops looking like a bug. This migration therefore has NO dependency on
-- #2860 and can merge in any order relative to it.
--
-- SHAPE OF THE CHANGE — the object path is provably untouched
-- -----------------------------------------------------------
-- The original object predicate is preserved BYTE-IDENTICAL and a second term
-- is OR'd beside it. OR is monotone, so no slot that matched before can stop
-- matching, and the added term is structurally FALSE on every object-shaped
-- slot (an empty array has no elements). This is a stronger guarantee than a
-- CASE branch, which would also have to be argued about evaluation order; the
-- array argument is additionally wrapped in a CASE that yields '[]'::jsonb for
-- any non-array shape, so jsonb_array_elements can never be handed a scalar.
-- The marked_by_details term is preserved byte-identical as well.
--
-- ACL — the anon EXECUTE grant is REMOVED
-- ---------------------------------------
-- Live ACL read 2026-08-15:
--   {=X/postgres,postgres=X/postgres,anon=X/postgres,
--    authenticated=X/postgres,service_role=X/postgres}
-- The function is SECURITY INVOKER, so RLS on student_attendance still applies
-- and the grant was never a data leak. It was TESTED rather than reasoned
-- about, twice, on production:
--   (1) POST /rest/v1/rpc/get_faculty_attendance_reports with the public anon
--       key -> HTTP 401, body 42501 "permission denied for function
--       staff_ids_visiting_accessible_institutions", zero rows.
--   (2) SET LOCAL ROLE anon inside BEGIN … ROLLBACK -> the same 42501, raised
--       at line 7 (the team-member directory lookup), because that table's RLS
--       policy calls a helper anon may not execute.
-- anon therefore cannot retrieve a single row and never could; removing the
-- grant breaks no caller. Repo callers are both authenticated browser-client
-- paths in lib/services/academic/attendance-report-service.ts
-- (getFacultyAttendanceReports, getAttendanceStatistics) — there is no
-- unauthenticated route, cron or edge function that calls this name.
-- Per CLAUDE.md ("Lock new RPCs from anon"), an anon grant must be deliberate
-- and documented; this one is Supabase's silent default, so it goes.
--
-- 🔴 PUBLIC MUST GO WITH IT — measured, not assumed. This ACL carries BOTH an
-- explicit anon item AND the PUBLIC item (`=X/postgres`), and anon is a member
-- of PUBLIC. Rehearsed on production inside a self-aborting transaction:
--     has_function_privilege('anon', fn, 'EXECUTE')
--       before                       -> true
--       after REVOKE … FROM anon     -> STILL true   (PUBLIC keeps granting it)
--       after REVOKE … FROM PUBLIC   -> false
-- So a revoke naming anon alone would have looked correct in the ACL string
-- and changed nothing. This is the mirror image of the failure CLAUDE.md
-- documents (revoking PUBLIC alone leaves the explicit anon grant): here the
-- explicit anon grant is removed and PUBLIC survives. Both names are required.
-- Revoking PUBLIC is safe because every role that actually calls this function
-- is granted explicitly below — PostgREST executes as authenticated, the
-- server paths as service_role, migrations as postgres.
--
-- PRESERVED EXACTLY: identity arguments (text + 7 uuid + 2 date + 2 int, same
-- order, same defaults), RETURNS TABLE column list, LANGUAGE plpgsql,
-- SECURITY INVOKER (prosecdef = false), VOLATILE (provolatile = 'v'),
-- SET search_path TO 'public', and the grants to postgres / authenticated /
-- service_role.
--
-- IDEMPOTENT. Adds no table, drops nothing, backfills nothing, touches no
-- policy and no other function.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_faculty_attendance_reports(faculty_staff_id text, filter_institution_id uuid DEFAULT NULL::uuid, filter_academic_year_id uuid DEFAULT NULL::uuid, filter_degree_id uuid DEFAULT NULL::uuid, filter_department_id uuid DEFAULT NULL::uuid, filter_program_id uuid DEFAULT NULL::uuid, filter_semester_id uuid DEFAULT NULL::uuid, filter_section_id uuid DEFAULT NULL::uuid, filter_date_from date DEFAULT NULL::date, filter_date_to date DEFAULT NULL::date, page_offset integer DEFAULT 0, page_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, attendance_date date, institution_id uuid, academic_year_id uuid, degree_id uuid, department_id uuid, program_id uuid, semester_id uuid, section_id uuid, timetable_id uuid, attendance_data jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  total_records BIGINT;
  faculty_profile_id TEXT;
BEGIN
  -- Get the profile_id for the faculty staff
  SELECT s.profile_id::text INTO faculty_profile_id 
  FROM staff s 
  WHERE s.id = faculty_staff_id::uuid;

  -- First get the total count for pagination
  SELECT COUNT(*) INTO total_records
  FROM student_attendance sa
  WHERE EXISTS (
    SELECT 1 
    FROM jsonb_each(sa.attendance_data) AS period_data
    WHERE (period_data.value -> 'assigned_faculty' ->> 'faculty_id' = faculty_staff_id)
       OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(period_data.value -> 'assigned_faculty') = 'array'
                        THEN period_data.value -> 'assigned_faculty'
                        ELSE '[]'::jsonb
                   END
                 ) AS co_assignee
            WHERE co_assignee ->> 'faculty_id' = faculty_staff_id
          )
       OR (period_data.value -> 'marked_by_details' ->> 'marker_id' = faculty_profile_id)
  )
  AND (filter_institution_id IS NULL OR sa.institution_id = filter_institution_id)
  AND (filter_academic_year_id IS NULL OR sa.academic_year_id = filter_academic_year_id)
  AND (filter_degree_id IS NULL OR sa.degree_id = filter_degree_id)
  AND (filter_department_id IS NULL OR sa.department_id = filter_department_id)
  AND (filter_program_id IS NULL OR sa.program_id = filter_program_id)
  AND (filter_semester_id IS NULL OR sa.semester_id = filter_semester_id)
  AND (filter_section_id IS NULL OR sa.section_id = filter_section_id)
  AND (filter_date_from IS NULL OR sa.attendance_date >= filter_date_from)
  AND (filter_date_to IS NULL OR sa.attendance_date <= filter_date_to);

  -- Return the paginated results with total count
  RETURN QUERY
  SELECT 
    sa.id,
    sa.attendance_date,
    sa.institution_id,
    sa.academic_year_id,
    sa.degree_id,
    sa.department_id,
    sa.program_id,
    sa.semester_id,
    sa.section_id,
    sa.timetable_id,
    sa.attendance_data,
    sa.created_at,
    sa.updated_at,
    total_records as total_count
  FROM student_attendance sa
  WHERE EXISTS (
    SELECT 1 
    FROM jsonb_each(sa.attendance_data) AS period_data
    WHERE (period_data.value -> 'assigned_faculty' ->> 'faculty_id' = faculty_staff_id)
       OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(period_data.value -> 'assigned_faculty') = 'array'
                        THEN period_data.value -> 'assigned_faculty'
                        ELSE '[]'::jsonb
                   END
                 ) AS co_assignee
            WHERE co_assignee ->> 'faculty_id' = faculty_staff_id
          )
       OR (period_data.value -> 'marked_by_details' ->> 'marker_id' = faculty_profile_id)
  )
  AND (filter_institution_id IS NULL OR sa.institution_id = filter_institution_id)
  AND (filter_academic_year_id IS NULL OR sa.academic_year_id = filter_academic_year_id)
  AND (filter_degree_id IS NULL OR sa.degree_id = filter_degree_id)
  AND (filter_department_id IS NULL OR sa.department_id = filter_department_id)
  AND (filter_program_id IS NULL OR sa.program_id = filter_program_id)
  AND (filter_semester_id IS NULL OR sa.semester_id = filter_semester_id)
  AND (filter_section_id IS NULL OR sa.section_id = filter_section_id)
  AND (filter_date_from IS NULL OR sa.attendance_date >= filter_date_from)
  AND (filter_date_to IS NULL OR sa.attendance_date <= filter_date_to)
  ORDER BY sa.attendance_date DESC
  OFFSET page_offset
  LIMIT page_limit;
END;
$function$;

-- ----------------------------------------------------------------------------
-- ACL: drop the silent Supabase default anon EXECUTE grant AND the PUBLIC grant
-- it hides behind. See the header for the two live tests proving anon retrieves
-- zero rows through this function, and for the measurement proving that
-- revoking anon WITHOUT PUBLIC leaves has_function_privilege('anon', …) = true.
-- The three real callers are re-granted explicitly so the ACL is deterministic
-- after this migration regardless of what CREATE OR REPLACE preserved.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_faculty_attendance_reports(text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, date, integer, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_faculty_attendance_reports(text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, date, integer, integer) TO postgres, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- CLOSING GUARD — refuses to leave the transaction in a wrong state.
-- Asserts: identity signature survived · SECURITY INVOKER survived · VOLATILE
-- survived · search_path survived · anon can no longer EXECUTE (tested with
-- has_function_privilege, NOT by reading the ACL string, because an ACL with no
-- anon item still grants anon through PUBLIC) · the three real callers can
-- still EXECUTE · and — the majority-path control — that the added term
-- contributes NOTHING on any object-shaped slot, which is what makes the object
-- path's result provably identical to before.
-- ----------------------------------------------------------------------------
DO $guard$
DECLARE
  v_fn           regprocedure := 'public.get_faculty_attendance_reports(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,date,date,integer,integer)'::regprocedure;
  v_oid          oid;
  v_ident        text;
  v_secdef       boolean;
  v_volatile     "char";
  v_config       text[];
  v_acl          text;
  v_object_slots bigint;
  v_object_hits  bigint;
  v_array_slots  bigint;
  v_array_hits   bigint;
BEGIN
  SELECT p.oid, pg_get_function_identity_arguments(p.oid), p.prosecdef, p.provolatile, p.proconfig, p.proacl::text
    INTO v_oid, v_ident, v_secdef, v_volatile, v_config, v_acl
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'get_faculty_attendance_reports';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'guard: public.get_faculty_attendance_reports is missing after replace';
  END IF;

  IF v_ident <> 'faculty_staff_id text, filter_institution_id uuid, filter_academic_year_id uuid, '
              || 'filter_degree_id uuid, filter_department_id uuid, filter_program_id uuid, '
              || 'filter_semester_id uuid, filter_section_id uuid, filter_date_from date, '
              || 'filter_date_to date, page_offset integer, page_limit integer' THEN
    RAISE EXCEPTION 'guard: identity arguments changed -> %', v_ident;
  END IF;

  IF v_secdef IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'guard: SECURITY INVOKER was not preserved (prosecdef=%)', v_secdef;
  END IF;

  IF v_volatile IS DISTINCT FROM 'v' THEN
    RAISE EXCEPTION 'guard: volatility changed (provolatile=%)', v_volatile;
  END IF;

  IF NOT ('search_path=public' = ANY (COALESCE(v_config, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'guard: search_path setting lost -> %', v_config;
  END IF;

  -- The EFFECTIVE privilege, not the ACL string: an ACL with no anon item still
  -- grants anon EXECUTE while the PUBLIC item survives (measured on production).
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'guard: anon can still EXECUTE (PUBLIC not revoked?) -> %', v_acl;
  END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'guard: an intended caller lost EXECUTE -> %', v_acl;
  END IF;

  -- Majority-path control. For every OBJECT-shaped slot in the table, the added
  -- array term must evaluate FALSE for EVERY assignee id present in the data —
  -- if it never fires on the object path, OR-ing it in cannot change any object
  -- slot's outcome. Counted directly rather than argued.
  SELECT count(*),
         count(*) FILTER (
           WHERE EXISTS (
             SELECT 1
             FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof(pd.value -> 'assigned_faculty') = 'array'
                         THEN pd.value -> 'assigned_faculty'
                         ELSE '[]'::jsonb
                    END
                  ) AS el
             WHERE el ->> 'faculty_id' IS NOT NULL
           ))
    INTO v_object_slots, v_object_hits
    FROM student_attendance sa, jsonb_each(sa.attendance_data) pd
   WHERE jsonb_typeof(pd.value -> 'assigned_faculty') = 'object';

  IF v_object_hits <> 0 THEN
    RAISE EXCEPTION 'guard: the co-assignee term fired on % of % object-shaped slots; the majority path is NOT byte-identical',
      v_object_hits, v_object_slots;
  END IF;

  -- And the new term must actually be capable of firing, or this migration is a
  -- no-op that only looks like a fix.
  SELECT count(*),
         count(*) FILTER (
           WHERE EXISTS (
             SELECT 1
             FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof(pd.value -> 'assigned_faculty') = 'array'
                         THEN pd.value -> 'assigned_faculty'
                         ELSE '[]'::jsonb
                    END
                  ) AS el
             WHERE el ->> 'faculty_id' IS NOT NULL
           ))
    INTO v_array_slots, v_array_hits
    FROM student_attendance sa, jsonb_each(sa.attendance_data) pd
   WHERE jsonb_typeof(pd.value -> 'assigned_faculty') = 'array';

  IF v_array_slots > 0 AND v_array_hits = 0 THEN
    RAISE EXCEPTION 'guard: % array-shaped slots exist but the co-assignee term matched none of them', v_array_slots;
  END IF;

  RAISE NOTICE 'guard OK — signature/INVOKER/VOLATILE/search_path preserved, anon EXECUTE removed (acl %); object slots % (term fired on 0), array slots % (term fired on %)',
    v_acl, v_object_slots, v_array_slots, v_array_hits;
END;
$guard$;

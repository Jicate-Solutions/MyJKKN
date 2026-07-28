-- Updated: 2026-07-28 - Make "every Saturday off" real: weekly recurrence on institution_leaves
--
-- WHY
-- ----
-- institution_leaves already has an `is_recurring` boolean and a `recurrence_pattern`
-- jsonb column, but recurrence was a DEAD no-op: recurrence_pattern is NULL on all 29
-- production rows and no code anywhere expanded it. There is also no per-college
-- weekly-off setting. So a Mon-Fri college has to file every single Saturday by hand --
-- and two of them literally do: JKKN College of Arts and Science (Aided) and (Self)
-- have hand-filed a one-day leave named "Saturday" for six consecutive Saturdays
-- (2026-06-20, 06-27, 07-04, 07-11, 07-18, 07-25).
--
-- The colleges that DON'T hand-file are the ones that will get burned. Measured live
-- over a 28-day window (average attendance marks per day):
--
--   College                     Mon-Fri avg   Sat avg   Saturday is...
--   JKKN Allied Health              518           4     NOT a working day
--   JKKN Arts & Science            2789          44     NOT a working day
--   JKKN Nursing                    810          44     NOT a working day
--   JKKN Pharmacy                  1748         904     a working day
--   JKKN Dental                     631         587     a working day
--   JKKN Matric                     235         226     a working day
--   Nattraja CBSE                   311         127     borderline
--
-- A dry-run of the (currently dormant) college data-gap trigger over the last 3 days
-- produced 5 fires, 4 of them on a Saturday. Without this migration, three colleges
-- would receive a FALSE "no attendance recorded" alert EVERY Saturday, forever.
--
-- WHAT
-- ----
-- 1. Documents the recurrence contract on institution_leaves.recurrence_pattern.
-- 2. Adds a CHECK constraint so a malformed weekly pattern can never be stored
--    (the holiday function below is load-bearing; a bad date cast in it would break
--    the timetable working-day engine, so we keep garbage out at the door).
-- 3. Adds ONE additional OR branch to is_institution_holiday(). The existing
--    explicit-date-range branch is preserved byte-for-byte.
--
-- BACKWARD COMPATIBILITY
-- ----------------------
-- Every existing row has recurrence_pattern IS NULL, so the new branch can never
-- match today: NULL->>'freq' is NULL, and NULL = 'weekly' is NULL (not TRUE).
-- Behaviour is therefore IDENTICAL until somebody deliberately creates a pattern.
-- Proven by a BEGIN..ROLLBACK dry-run over 14 institutions x 60 days (840 evaluations):
-- the per-institution count of holiday=TRUE days is byte-identical before and after.
--
-- BLAST RADIUS (read before merging)
-- ----------------------------------
-- is_institution_holiday() is SHARED and load-bearing. Two callers:
--   * get_cycle_for_date()        -- the timetable working-day / cycle engine
--   * fn_college_data_gap_check() -- the (dormant) data-gap trigger
-- Once a college DOES create a weekly-off pattern, Saturdays stop counting as
-- working days for that college, which shifts its timetable cycle numbering.
-- That is the intended and correct semantic -- and it is exactly what already
-- happens today for Arts & Science via their hand-filed one-day Saturday leaves.
-- Creating a pattern is an explicit, opt-in act; nothing changes on deploy.
--
-- KNOWN LIMITATION (deliberate, follow-up work)
-- --------------------------------------------
-- LeaveManagementService also expands leaves in TypeScript, by querying
-- institution_leaves and comparing start_date/end_date directly instead of
-- calling is_institution_holiday(). Those methods -- getWorkingDays(),
-- checkLeaveBlockForAttendance(), getMonthlyCalendarData(), getLeavesForDate(),
-- getLeaveDatesInRange(), getBlockedDatesInRange(), canMarkAttendance(),
-- checkMultipleDates(), getLeaveInfoForDate() -- will NOT see a weekly pattern
-- until they are migrated onto the RPC. The divergence fails SAFE: the
-- TypeScript side stays permissive (a recurring Saturday is still markable and
-- still counts as a working day in the calendar UI), while the database side
-- correctly treats it as a holiday. Nothing breaks; the calendar simply does not
-- yet render the repeat. Folding those call sites onto is_institution_holiday()
-- is the natural next PR and is out of scope here.
--
-- NOTE: this file deliberately contains NO BEGIN;/COMMIT; of its own. The
-- migration runner already wraps it in a transaction, and an inner COMMIT would
-- turn a BEGIN..ROLLBACK dry-run into a live apply.

-- ---------------------------------------------------------------------------
-- 1. The recurrence contract
-- ---------------------------------------------------------------------------
-- Weekday codes are the iCalendar (RFC 5545) BYDAY 2-letter codes, ordered so
-- that the array index lines up with PostgreSQL EXTRACT(DOW) where 0 = Sunday:
--
--   DOW   0    1    2    3    4    5    6
--   code  SU   MO   TU   WE   TH   FR   SA
--
COMMENT ON COLUMN public.institution_leaves.recurrence_pattern IS
$doc$Recurrence rule for this leave, expanded by public.is_institution_holiday().

Only weekly-by-weekday recurrence is implemented. Shape:

  {"freq": "weekly", "byday": ["SAT"]}                          -- forever
  {"freq": "weekly", "byday": ["SA"], "until": "2027-05-31"}     -- bounded

  freq   (required) must be the literal "weekly" for the rule to be expanded.
         Any other value is stored but ignored (no expansion).
  byday  (required) non-empty JSON array of iCalendar RFC-5545 two-letter
         weekday codes: SU MO TU WE TH FR SA. Index-aligned with PostgreSQL
         EXTRACT(DOW) where 0=Sunday .. 6=Saturday.
  until  (optional) inclusive last date the rule applies, "YYYY-MM-DD".
         Omit or null for an open-ended rule.

The rule only takes effect when is_recurring = true AND status = 'approved'
AND scope_level = 'institution'. The row's start_date is the first date the
rule can apply (end_date is ignored by the recurring branch, and continues to
drive the ordinary explicit-date-range branch as before).

Shape is enforced by CHECK institution_leaves_recurrence_pattern_valid.$doc$;

-- ---------------------------------------------------------------------------
-- 2. Keep malformed weekly patterns out
-- ---------------------------------------------------------------------------
-- Every expression below is total (never raises) regardless of the jsonb shape,
-- so the constraint itself can never error on a weird payload -- it just rejects.
-- Non-weekly patterns (including the legacy {"type":"yearly"} shape the TypeScript
-- RecurrencePattern type describes) are deliberately left unconstrained.
--
-- The COALESCE(..., false) is load-bearing, not decoration: when the "byday" key is
-- absent, recurrence_pattern->'byday' is SQL NULL, jsonb_typeof(NULL) is NULL, and
-- the whole conjunction evaluates to NULL -- which a CHECK constraint treats as
-- SATISFIED. Without the COALESCE, {"freq":"weekly"} with no byday at all is
-- accepted. (Caught by the dry-run below, which initially reported
-- 'REJECT {"freq":"weekly"}' -> 'FAIL - was accepted'.)
ALTER TABLE public.institution_leaves
  DROP CONSTRAINT IF EXISTS institution_leaves_recurrence_pattern_valid;

ALTER TABLE public.institution_leaves
  ADD CONSTRAINT institution_leaves_recurrence_pattern_valid CHECK (
    recurrence_pattern IS NULL
    OR recurrence_pattern->>'freq' IS DISTINCT FROM 'weekly'
    OR COALESCE(
         jsonb_typeof(recurrence_pattern->'byday') = 'array'
     AND recurrence_pattern->'byday' <> '[]'::jsonb
     AND recurrence_pattern->'byday' <@ '["SU","MO","TU","WE","TH","FR","SA"]'::jsonb
     AND (
           recurrence_pattern->>'until' IS NULL
        OR recurrence_pattern->>'until' ~ '^\d{4}-\d{2}-\d{2}$'
     ), false)
  );

-- ---------------------------------------------------------------------------
-- 3. Teach the canonical holiday function about weekly recurrence
-- ---------------------------------------------------------------------------
-- Base definition captured live from production via pg_get_functiondef() on
-- 2026-07-28 (NOT copied from a repo .sql file). It is LANGUAGE sql / STABLE /
-- SECURITY INVOKER with no search_path setting -- all preserved exactly.
-- The only change is that the two date-range predicates are now the first arm
-- of an OR, with the new weekly-recurrence arm as the second.
CREATE OR REPLACE FUNCTION public.is_institution_holiday(p_institution_id uuid, p_date date)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.institution_leaves
        WHERE institution_id = p_institution_id
          AND scope_level    = 'institution'
          AND status         = 'approved'
          AND (
                -- (a) EXISTING BRANCH, unchanged: explicit date range
                (    start_date <= p_date
                 AND end_date   >= p_date )

                -- (b) NEW BRANCH: weekly recurrence, e.g. every Saturday
                OR ( is_recurring = true
                 AND recurrence_pattern->>'freq' = 'weekly'
                 AND jsonb_typeof(recurrence_pattern->'byday') = 'array'
                 AND recurrence_pattern->'byday' @>
                       to_jsonb(
                         (ARRAY['SU','MO','TU','WE','TH','FR','SA'])[
                           EXTRACT(DOW FROM p_date)::int + 1
                         ]
                       )
                 AND p_date >= start_date
                 -- 'until' is inclusive and optional. Guarded with CASE (which
                 -- fixes evaluation order) so a malformed value can never raise
                 -- inside this shared, load-bearing function; it simply stops
                 -- the rule from matching, i.e. degrades to pre-migration
                 -- behaviour rather than erroring the timetable engine.
                 AND CASE
                       WHEN recurrence_pattern->>'until' IS NULL THEN true
                       WHEN recurrence_pattern->>'until' ~ '^\d{4}-\d{2}-\d{2}$'
                            THEN p_date <= (recurrence_pattern->>'until')::date
                       ELSE false
                     END
                )
          )
    );
$function$;

-- Grants are unchanged. CREATE OR REPLACE preserves the existing ACL
-- ({=X/postgres, postgres, anon, authenticated, service_role}) and the function
-- remains SECURITY INVOKER, so RLS on institution_leaves still applies to every
-- caller exactly as it did before this migration.

COMMENT ON FUNCTION public.is_institution_holiday(uuid, date) IS
'Canonical "is this date a holiday for this institution?" check. Matches an approved
institution-scoped row in institution_leaves either by explicit date range, or by a
weekly recurrence_pattern such as {"freq":"weekly","byday":["SA"]}. Shared by
get_cycle_for_date() (timetable working-day engine) and fn_college_data_gap_check().';

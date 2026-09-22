-- ============================================================================
-- 20260919005000_harden_first_present_activation.sql
--
-- REPAIR ROUND 1 for PR #3924. Three defects a blind reviewer found in the
-- mechanism that PR switches on. This file fixes two of them in the database;
-- the third turned out to be already correct and is proved by test instead.
--
-- 🅰️  AN ACTIVATION FAILURE COULD REJECT A TEACHER'S WHOLE ATTENDANCE SAVE.
--
--     `trg_activate_learner_on_first_present` is an AFTER trigger, and an AFTER
--     trigger that raises ABORTS THE STATEMENT THAT FIRED IT. The 2026-08-11
--     body has no exception handling at all, so anything that goes wrong while
--     activating a learner — or while writing the activation's audit row —
--     takes the marked attendance down with it.
--
--     This is not hypothetical. `learners_profile_status_history.changed_by` is
--     `uuid REFERENCES public.profiles(id)` (20260517000005, FK re-stated in
--     20260517000012). The trigger writes `auth.uid()` into it. A signed-in
--     caller whose `profiles` row is missing or has just been deleted produces
--     a foreign-key violation inside the AFTER trigger, and the attendance
--     INSERT that fired it is rolled back. The marker sees a failed save and no
--     explanation. The same shape is available to every one of the five other
--     triggers that observe the `learners_profiles` UPDATE.
--
--     Attendance is the most used feature in the product. Activation is a
--     CONSEQUENCE of marking attendance, never a condition of it. So the whole
--     activation path now runs inside `BEGIN … EXCEPTION WHEN OTHERS THEN …`:
--     the attendance row saves, and the failure is RECORDED in a table a human
--     can open, not only announced to a log nobody reads. `RAISE WARNING` is
--     kept as well, but it is the second-loudest signal here, not the only one.
--
-- 🅱️  A WRONG PRESENT MARK ACTIVATES AN UNPAID LEARNER AND NOTHING UNDOES IT.
--
--     Correct by design already, and DELIBERATELY NOT automated further
--     (Director, 2026-09-19 04:58): a wrong mark is reversed BY THE OFFICE, by
--     hand. No automatic de-activation — a learner flapping between states is
--     worse than a learner in the wrong one, and it is a policy question.
--
--     What this file adds is two metadata fields. The audit row already named
--     the reason (`first_present_attendance`), the attendance row
--     (`student_attendance_id`) and the actor (`changed_by = auth.uid()`). But
--     `auth.uid()` is NULL on every service-role and SQL write path, and those
--     paths write attendance too — so on exactly the rows an office user would
--     be puzzling over, "who marked it" could be blank.
--
--     🛑 WHERE THE MARKER ACTUALLY LIVES (corrected in repair round 3).
--     Rounds 1 and 2 of this file read `NEW.marked_by`. THERE IS NO SUCH COLUMN.
--     `public.student_attendance` has exactly: id, attendance_date,
--     institution_id, created_at, updated_at, timetable_id, section_id,
--     attendance_data, semester_id, program_id, department_id, degree_id,
--     academic_year_id, period_slot_id, section_ids. That claim came from a
--     repo file, not from the live table, and a migration or setup file naming
--     a column is not evidence the column exists.
--
--     The write path stores the marker INSIDE the payload, per period:
--       attendance_data -> <period> -> 'marked_by_details' ->> 'marker_id'
--     written by app/(routes)/academic/attendance/mark/page.tsx (marked_by_details)
--     and by AttendanceCoreService.upsertConsolidatedAttendance, whose INSERT
--     column list carries no marked_by at all. It is a `profiles.id`, the same
--     identity space as `changed_by`. attendance-report-service reads it back
--     the same way.
--
--     So the audit row now carries `marked_by` (read defensively out of the
--     payload — missing, malformed or non-uuid all yield NULL, never an error)
--     and `marked_by_source`, which says where that value came from:
--     `attendance_data.marked_by_details.marker_id`, `auth.uid` when the
--     payload records none but a JWT is present, or `unknown` when neither.
--     Nothing else about the audit row changes.
--
-- 🅲  EDITING AN OLD ATTENDANCE ROW COULD ACTIVATE LEARNERS WHOSE PRESENT MARKS
--     PREDATE THE SWITCH.
--
--     REAL, and the sharpest of the three. The trigger fires
--     `AFTER INSERT OR UPDATE OF attendance_data`. On UPDATE the only guard was
--     "did the payload change at all"; if it did, the function collected EVERY
--     learner marked present ANYWHERE in the NEW payload — including learners
--     who were already present in the OLD one and were never touched by the
--     edit. So correcting one learner's mark on a row written weeks ago
--     activated every other reserved/admitted learner on that row, retroactively
--     and invisibly, and the PR's own "NOT RETROACTIVE" promise was false for
--     any row anybody edits.
--
--     Fixed by computing what BECAME present: on INSERT, everyone marked present;
--     on UPDATE, only ids present in NEW that were NOT already present in OLD.
--     An edit that does not move anybody INTO present now activates nobody.
--
--     (The one-time catch-up for learners whose Present marks already exist is a
--     SEPARATE, Director-gated exercise — he reads the list of names first. It is
--     prepared, un-run, in scripts/rehearsals/3924-catchup-preview.sql and
--     scripts/rehearsals/3924-catchup-apply.sql. No bulk UPDATE ships in any
--     migration.)
--
-- ── WHY THE ACTIVATION CORE IS NOW ITS OWN FUNCTION ─────────────────────────
--
--     `fn_activate_learner_on_first_present()` RETURNS trigger and reads NEW.*,
--     so it cannot be called for a Present mark recorded in the past. The
--     promote-and-audit step is therefore lifted into
--     `fn_activate_learners_for_first_present(...)`, which the trigger calls and
--     which the Director-gated catch-up script also calls. One body, one audit
--     shape, one failure-recording path — the alternative was a second hand-
--     rolled status UPDATE in a script, which is how two routes to `active`
--     drift apart.
--
-- ── ORDER OF APPLY ──────────────────────────────────────────────────────────
--
--     This file is numbered BELOW 20260919010000 on purpose. `supabase db push`
--     applies in version order, so the hardening lands before the switch. The
--     switch file also asserts this file is present and refuses to turn the rule
--     on over the unhardened body, so applying them out of order fails loudly
--     rather than opening the window this file exists to close.
--
-- Idempotent and safe to re-apply. Deliberately carries NO `BEGIN;`/`COMMIT;` so
-- a reviewer's `BEGIN … ROLLBACK` rehearsal against production actually rolls
-- back.
--
-- MIGRATION IS FILE ONLY — NOT APPLIED. Director-gated.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Where an activation failure goes so a human sees it.
--
--    The repo has no general-purpose trigger-failure table; the nearest
--    precedent is `learners_profile_fee_backfill_failures` (20260516130100) —
--    domain-scoped, RLS on, admin-gated SELECT, no INSERT policy, written only
--    by SECURITY DEFINER. This follows that shape exactly.
--
--    🔒 NO FOREIGN KEYS, ON PURPOSE. This table exists because a write failed.
--    Every FK on it would be one more way for the failure RECORD to fail, and a
--    failure record that cannot be written is the silent swallow all over again.
--    `learner_ids` is an array, which cannot carry an FK in any case.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.learner_activation_failures (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at            timestamptz NOT NULL DEFAULT now(),

  -- The attendance row whose save triggered the attempt. Plain uuid: see above.
  student_attendance_id  uuid,
  attendance_date        date,
  section_id             uuid,
  timetable_id           uuid,
  institution_id         uuid,
  trigger_op             text,

  -- Exactly the learners the activation was trying to move. This is the list an
  -- office user works from: these people were NOT activated.
  learner_ids            uuid[] NOT NULL DEFAULT '{}'::uuid[],

  -- Who marked the attendance, read out of
  -- attendance_data -> <period> -> marked_by_details ->> marker_id (a
  -- profiles.id) — NULL when the payload records none. And who the database
  -- thought was calling (auth.uid(), NULL off a JWT path).
  marked_by              uuid,
  attempted_by           uuid,

  sqlstate               text,
  error_message          text NOT NULL,
  error_detail           text,
  error_context          text,

  resolved_at            timestamptz,
  resolved_by            uuid,
  resolution_notes       text
);

CREATE INDEX IF NOT EXISTS idx_learner_activation_failures_occurred
  ON public.learner_activation_failures (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_learner_activation_failures_unresolved
  ON public.learner_activation_failures (occurred_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_learner_activation_failures_institution
  ON public.learner_activation_failures (institution_id, occurred_at DESC);

ALTER TABLE public.learner_activation_failures ENABLE ROW LEVEL SECURITY;

-- Read: the same gate that already guards `learners_profile_status_history`
-- (20260517000005), so whoever can read a learner's status history can read the
-- activations that did NOT happen. Repo standard policy shape: the two admin
-- predicates first, then permission + institution scope.
DROP POLICY IF EXISTS learner_activation_failures_select ON public.learner_activation_failures;
CREATE POLICY learner_activation_failures_select
  ON public.learner_activation_failures
  FOR SELECT
  TO authenticated
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('learners.profiles.view')
        AND role_has_institution_access(institution_id))
  );

-- No INSERT / UPDATE / DELETE policy. Rows are written by SECURITY DEFINER only.
REVOKE ALL    ON public.learner_activation_failures FROM anon, PUBLIC;
GRANT  SELECT ON public.learner_activation_failures TO authenticated;

COMMENT ON TABLE public.learner_activation_failures IS
  'Activations that FAILED while a learner was being moved to active on their first Present mark. Written by fn_activate_learner_on_first_present() from inside an exception handler so the attendance save itself is never rejected. A row here means the attendance was saved and the learner was NOT activated — someone has to look.';


-- ----------------------------------------------------------------------------
-- 2. Who is marked present in one attendance payload.
--
--    Lifted out of the trigger body so the SAME reading is used for NEW and for
--    OLD. Risk C is a difference between two payloads; computing it with two
--    copies of the parsing SQL is how the two copies drift.
--
--    `jsonb_each` raises on a non-object, so a payload that is somehow an array
--    or a scalar is read as empty rather than blowing up.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_present_learner_ids(p_attendance_data jsonb)
RETURNS uuid[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
  SELECT array_agg(DISTINCT (s.rec ->> 'student_id')::uuid)
  FROM jsonb_each(
         CASE WHEN jsonb_typeof(p_attendance_data) = 'object'
              THEN p_attendance_data
              ELSE '{}'::jsonb END) AS per(period_key, period_val),
       jsonb_array_elements(
         CASE WHEN jsonb_typeof(per.period_val -> 'students') = 'array'
              THEN per.period_val -> 'students'
              ELSE '[]'::jsonb END) AS s(rec)
  WHERE lower(COALESCE(s.rec ->> 'status', '')) = 'present'
    AND COALESCE(s.rec ->> 'student_id', '') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$function$;

-- 2026-09-22: `authenticated` is revoked EXPLICITLY on every function below, not just
-- anon + PUBLIC. Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON
-- FUNCTIONS TO anon, authenticated`, so a new function is born with a DIRECT grant to
-- authenticated that revoking PUBLIC does not touch — it would be callable by any signed-in
-- client through PostgREST. A local database has no such default privileges, which is why
-- the local suite passed; section 9's own guard caught it on the first production rehearsal
-- (rolled back, 2026-09-22 05:20 IST).
REVOKE EXECUTE ON FUNCTION public.fn_present_learner_ids(jsonb) FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.fn_present_learner_ids(jsonb) IS
  'The distinct learners_profiles.id values marked Present anywhere in one student_attendance.attendance_data payload. Case-insensitive on the status token (production holds a lowercase absent). Not granted to anybody: called only from SECURITY DEFINER code that owns it.';


-- ----------------------------------------------------------------------------
-- 2b. Who marked THIS learner present — read out of the payload.
--
--     There is no `marked_by` column on `public.student_attendance`. The marker
--     is written into the payload per period by the marking screens and by
--     AttendanceCoreService.upsertConsolidatedAttendance:
--         attendance_data -> <period> -> 'marked_by_details' ->> 'marker_id'
--     and it is a `profiles.id`.
--
--     DEFENSIVE BY CONSTRUCTION, because this runs inside an attendance save:
--     a period that is not an object, a missing `marked_by_details`, a missing
--     `marker_id`, an empty string or anything that is not uuid-shaped all
--     yield NULL. Nothing here can raise.
--
--     WHICH period's marker: the first (by period key) in which this learner is
--     marked Present — the period that activates them. If that period records
--     no usable marker, any other period on the same row that does, because a
--     name is more use to the office than a NULL.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_attendance_marker_for_learner(
  p_attendance_data jsonb,
  p_learner_id      uuid)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
  SELECT m.marker
  FROM (
    SELECT
      per.period_key,
      CASE WHEN jsonb_typeof(per.period_val) = 'object'
             AND COALESCE(per.period_val -> 'marked_by_details' ->> 'marker_id', '') ~*
                 '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN (per.period_val -> 'marked_by_details' ->> 'marker_id')::uuid
      END AS marker
    FROM jsonb_each(
           CASE WHEN jsonb_typeof(p_attendance_data) = 'object'
                THEN p_attendance_data
                ELSE '{}'::jsonb END) AS per(period_key, period_val),
         jsonb_array_elements(
           CASE WHEN jsonb_typeof(per.period_val -> 'students') = 'array'
                THEN per.period_val -> 'students'
                ELSE '[]'::jsonb END) AS s(rec)
    WHERE lower(COALESCE(s.rec ->> 'status', '')) = 'present'
      AND COALESCE(s.rec ->> 'student_id', '') ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND (s.rec ->> 'student_id')::uuid = p_learner_id
  ) m
  ORDER BY (m.marker IS NULL), m.period_key
  LIMIT 1;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_attendance_marker_for_learner(jsonb, uuid) FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.fn_attendance_marker_for_learner(jsonb, uuid) IS
  'The profiles.id of whoever marked this learner Present on one student_attendance payload, read from attendance_data -> <period> -> marked_by_details ->> marker_id. There is NO marked_by column on student_attendance; the marking screens and AttendanceCoreService write the marker into the payload. Returns NULL for a missing, empty or non-uuid value rather than raising — it runs inside an attendance save.';


-- ----------------------------------------------------------------------------
-- 3. The activation itself — promote + audit, callable.
--
--    Verbatim logic from 20260821030000's step (d): an ALLOWLIST OF TWO, the
--    predicate repeated inside the UPDATE so a concurrent activation loses the
--    race cleanly under READ COMMITTED, and exactly one history row per learner
--    actually promoted. What is new is that it takes its context as arguments
--    instead of reading NEW.*, so the Director-gated catch-up can run through
--    this same body rather than hand-rolling a second status UPDATE.
--
--    NOT GRANTED TO ANYBODY. It is SECURITY DEFINER and would move learners to
--    `active` for whatever ids it is handed, so a grant to `authenticated`
--    would hand every signed-in user a lifecycle write over PostgREST. The
--    trigger reaches it as the function owner; the catch-up script runs as the
--    operator. Nobody else needs it and nobody else gets it.
--
--    The 10-argument shape from repair rounds 1 and 2 is dropped first. It was
--    never applied to any database — this whole PR is FILE ONLY — but leaving
--    it would create an overload rather than replace it, and two functions with
--    the same name and different marker semantics is how the wrong one gets
--    called a year from now.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_activate_learners_for_first_present(
  uuid[], uuid, date, uuid, uuid, uuid, uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.fn_activate_learners_for_first_present(
  p_learner_ids           uuid[],
  p_student_attendance_id uuid,
  p_attendance_date       date,
  p_section_id            uuid,
  p_timetable_id          uuid,
  p_institution_id        uuid,
  p_marked_by             uuid,
  p_changed_by            uuid,
  p_trigger_op            text,
  p_source                text,
  -- Where p_marked_by came from, recorded verbatim in the audit row:
  -- 'attendance_data.marked_by_details.marker_id' | 'auth.uid' | 'unknown'.
  -- The caller knows; the function cannot work it out, and a guessed
  -- provenance is worse than none.
  p_marked_by_source      text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_activated integer := 0;
BEGIN
  IF p_learner_ids IS NULL OR cardinality(p_learner_ids) = 0 THEN
    RETURN 0;
  END IF;

  WITH eligible AS (
    SELECT lp.id, lp.lifecycle_status AS from_status
    FROM public.learners_profiles lp
    WHERE lp.id = ANY(p_learner_ids)
      AND lp.lifecycle_status::text IN ('reserved', 'admitted')
  ),
  promoted AS (
    UPDATE public.learners_profiles lp
       SET lifecycle_status = 'active'::lifecycle_status,
           updated_at       = now()
      FROM eligible e
     WHERE lp.id = e.id
       AND lp.lifecycle_status::text IN ('reserved', 'admitted')
    RETURNING lp.id AS learner_id, e.from_status
  ),
  audited AS (
    INSERT INTO public.learners_profile_status_history
      (learner_id, from_status, to_status, reason_code, changed_by, metadata)
    SELECT
      p.learner_id,
      p.from_status,
      'active'::lifecycle_status,
      'first_present_attendance',
      p_changed_by,
      jsonb_build_object(
        'source',                  p_source,
        'trigger_op',              p_trigger_op,
        'from_status',             p.from_status::text,
        'student_attendance_id',   p_student_attendance_id,
        'attendance_date',         p_attendance_date,
        'section_id',              p_section_id,
        'timetable_id',            p_timetable_id,
        'institution_id',          p_institution_id,
        -- 🅱️ Who actually marked the attendance, and where that came from.
        -- `changed_by` above is auth.uid(), which is NULL on every
        -- service-role / SQL write path. The marker is read out of the payload
        -- (attendance_data -> <period> -> marked_by_details ->> marker_id);
        -- there is no marked_by COLUMN on student_attendance. Recording the
        -- source means a NULL here is readable as "nobody wrote one" rather
        -- than mistaken for "we did not look".
        'marked_by',               p_marked_by,
        'marked_by_source',        p_marked_by_source,
        -- Recorded so the money consequence is visible in the audit trail
        -- itself, not only in a file header.
        'fee_thresholds_bypassed', true)
    FROM promoted p
    RETURNING 1 AS wrote
  )
  SELECT count(*)::integer INTO v_activated FROM audited;

  RETURN COALESCE(v_activated, 0);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_activate_learners_for_first_present(
  uuid[], uuid, date, uuid, uuid, uuid, uuid, uuid, text, text, text) FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.fn_activate_learners_for_first_present(
  uuid[], uuid, date, uuid, uuid, uuid, uuid, uuid, text, text, text) IS
  'Moves the reserved/admitted learners among p_learner_ids to active and writes one learners_profile_status_history row each (reason_code first_present_attendance). Returns how many were activated. Allowlist of two statuses; idempotent — an already-active learner matches nothing and gets no history row. Granted to NOBODY: the trigger reaches it as owner, the Director-gated catch-up runs it as the operator.';


-- ----------------------------------------------------------------------------
-- 4. The trigger function — now unable to reject an attendance save.
--
--    Body replaced in full, starting from 20260821030000's definition, which is
--    the only definition of this function anywhere on jicate/main (checked:
--    `git grep -l fn_activate_learner_on_first_present jicate/main` returns that
--    migration, its test and SQL_FILE_INDEX.md and nothing else). No later
--    migration has rewritten it, so nothing of anybody else's is reverted here.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_activate_learner_on_first_present()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_newly_present uuid[];
  v_group         record;
  v_err_state     text;
  v_err_msg       text;
  v_err_detail    text;
  v_err_context   text;
BEGIN
  -- 🅰️ EVERYTHING below runs inside an exception-handled sub-block. An AFTER
  --    trigger that raises aborts the statement that fired it, and the statement
  --    here is somebody saving a class's attendance. Activation is a
  --    consequence of that save and must never be a condition of it.
  BEGIN

    -- (a) Master switch. Read before any parsing, so the disabled cost is one
    --     policy lookup per attendance write and nothing else.
    IF NOT COALESCE(
         public.fn_get_policy_bool('learners.activate_on_first_present.enabled', false, NULL),
         false) THEN
      RETURN NULL;
    END IF;

    -- (b) Re-saving an unchanged payload must not thrash any learner row.
    IF TG_OP = 'UPDATE'
       AND OLD.attendance_data IS NOT DISTINCT FROM NEW.attendance_data THEN
      RETURN NULL;
    END IF;

    -- (c) 🅲 WHO BECAME PRESENT — not "who is present".
    --
    --     On INSERT the row did not exist, so every Present mark on it is new.
    --     On UPDATE only the ids that were NOT already present in OLD count: an
    --     edit that corrects somebody else's mark, or adds a period, or fixes a
    --     typo, leaves every already-present learner exactly where they are.
    --     Without this, editing an attendance row written before the switch was
    --     turned on retroactively activated everyone marked present on it.
    IF TG_OP = 'UPDATE' THEN
      SELECT array_agg(n)
        INTO v_newly_present
        FROM unnest(COALESCE(public.fn_present_learner_ids(NEW.attendance_data), '{}'::uuid[])) AS n
       WHERE NOT (n = ANY(COALESCE(public.fn_present_learner_ids(OLD.attendance_data), '{}'::uuid[])));
    ELSE
      v_newly_present := public.fn_present_learner_ids(NEW.attendance_data);
    END IF;

    IF v_newly_present IS NULL OR cardinality(v_newly_present) = 0 THEN
      RETURN NULL;
    END IF;

    -- (d) Promote and audit, through the one shared body.
    --
    --     GROUPED BY MARKER, because one attendance row holds several periods
    --     and `upsertConsolidatedAttendance` merges later periods into the
    --     existing row — so two different people can legitimately have marked
    --     two learners on the same row. Attributing both to whichever name came
    --     first would put a wrong person on an audit row the office uses to
    --     reverse an activation by hand. One call per distinct marker costs a
    --     loop and is the honest answer.
    --
    --     A NULL marker is a group of its own: the payload recorded none, so the
    --     caller falls back to auth.uid() and says so in `marked_by_source`.
    FOR v_group IN
      SELECT m.marker, array_agg(m.learner_id ORDER BY m.learner_id) AS ids
      FROM (
        SELECT n AS learner_id,
               public.fn_attendance_marker_for_learner(NEW.attendance_data, n) AS marker
        FROM unnest(v_newly_present) AS n
      ) m
      GROUP BY m.marker
    LOOP
      PERFORM public.fn_activate_learners_for_first_present(
        v_group.ids,
        NEW.id,
        NEW.attendance_date,
        NEW.section_id,
        NEW.timetable_id,
        NEW.institution_id,
        COALESCE(v_group.marker, auth.uid()),
        auth.uid(),
        TG_OP,
        'fn_activate_learner_on_first_present',
        CASE
          WHEN v_group.marker IS NOT NULL THEN 'attendance_data.marked_by_details.marker_id'
          WHEN auth.uid()     IS NOT NULL THEN 'auth.uid'
          ELSE 'unknown'
        END);
    END LOOP;

    RETURN NULL;

  EXCEPTION WHEN OTHERS THEN
    -- The attendance row is SAVED. Only the activation failed, and it is
    -- written where somebody will find it.
    GET STACKED DIAGNOSTICS
      v_err_state   = RETURNED_SQLSTATE,
      v_err_msg     = MESSAGE_TEXT,
      v_err_detail  = PG_EXCEPTION_DETAIL,
      v_err_context = PG_EXCEPTION_CONTEXT;

    -- The recorder gets its own handler. A failure table that can itself abort
    -- the attendance save would reintroduce the exact defect being fixed.
    BEGIN
      INSERT INTO public.learner_activation_failures
        (student_attendance_id, attendance_date, section_id, timetable_id,
         institution_id, trigger_op, learner_ids, marked_by, attempted_by,
         sqlstate, error_message, error_detail, error_context)
      VALUES
        (NEW.id, NEW.attendance_date, NEW.section_id, NEW.timetable_id,
         NEW.institution_id, TG_OP, COALESCE(v_newly_present, '{}'::uuid[]),
         -- The marker for the failure record: whatever the payload says for the
         -- first learner we were trying to move, else the caller. Best effort —
         -- this is the handler, and it must not be the thing that raises.
         COALESCE(
           public.fn_attendance_marker_for_learner(NEW.attendance_data, v_newly_present[1]),
           auth.uid()),
         auth.uid(),
         v_err_state, COALESCE(v_err_msg, 'unknown error'), v_err_detail, v_err_context);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING
        '[learners] first-present activation failed for student_attendance % AND the failure could not be recorded: % %',
        NEW.id, SQLSTATE, SQLERRM;
    END;

    RAISE WARNING
      '[learners] first-present activation failed for student_attendance % (%): % — the attendance save is unaffected; see public.learner_activation_failures',
      NEW.id, v_err_state, v_err_msg;

    RETURN NULL;
  END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_activate_learner_on_first_present() FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.fn_activate_learner_on_first_present() IS
  'Moves a reserved/admitted learner to active on their FIRST Present mark (Director ruling 2026-08-11). Gated by platform policy learners.activate_on_first_present.enabled. Activates only learners who BECOME present on this write — an UPDATE that does not move somebody into Present activates nobody. Cannot reject the attendance save: every failure is caught and written to public.learner_activation_failures.';


-- ----------------------------------------------------------------------------
-- 5. Apply-time assertions. RAISE EXCEPTION, never RAISE NOTICE: a guard whose
--    miss path is a notice reads as a successful apply.
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  v_rls  boolean;
  v_body text;
  v_refs text[];
  v_bad  text[];
BEGIN
  IF to_regclass('public.learner_activation_failures') IS NULL THEN
    RAISE EXCEPTION 'public.learner_activation_failures was not created';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'learner_activation_failures';

  IF NOT COALESCE(v_rls, false) THEN
    RAISE EXCEPTION 'RLS is not enabled on public.learner_activation_failures';
  END IF;

  IF has_table_privilege('anon', 'public.learner_activation_failures', 'SELECT') THEN
    RAISE EXCEPTION 'anon still holds SELECT on public.learner_activation_failures';
  END IF;

  IF to_regprocedure('public.fn_activate_learners_for_first_present(uuid[],uuid,date,uuid,uuid,uuid,uuid,uuid,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'fn_activate_learners_for_first_present() was not created';
  END IF;

  IF has_function_privilege('anon',
       'public.fn_activate_learners_for_first_present(uuid[],uuid,date,uuid,uuid,uuid,uuid,uuid,text,text,text)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'anon still holds EXECUTE on fn_activate_learners_for_first_present()';
  END IF;

  IF has_function_privilege('authenticated',
       'public.fn_activate_learners_for_first_present(uuid[],uuid,date,uuid,uuid,uuid,uuid,uuid,text,text,text)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated holds EXECUTE on fn_activate_learners_for_first_present() — it must be reachable only as the owner';
  END IF;

  IF has_function_privilege('anon', 'public.fn_activate_learner_on_first_present()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon still holds EXECUTE on fn_activate_learner_on_first_present()';
  END IF;

  -- The hardened body really is the one installed. Checking that the function
  -- exists proves nothing — it existed before this file too.
  v_body := pg_get_functiondef('public.fn_activate_learner_on_first_present()'::regprocedure);

  IF position('EXCEPTION' in v_body) = 0
     OR position('learner_activation_failures' in v_body) = 0
     OR position('fn_activate_learners_for_first_present' in v_body) = 0 THEN
    RAISE EXCEPTION 'fn_activate_learner_on_first_present() is not the hardened body — CREATE OR REPLACE did not take';
  END IF;

  -- 🛑 EVERY COLUMN THE TRIGGER READS MUST EXIST ON student_attendance,
  --    CHECKED AGAINST *THIS* DATABASE'S CATALOG.
  --
  --    Repair rounds 1 and 2 read `NEW.marked_by`, a column that exists in no
  --    database anywhere. Every local test passed, because the test fixture
  --    invented the column; the switch's own pre-flight passed, because it only
  --    looked at the function's TEXT. On production the trigger would have
  --    raised `record "new" has no field "marked_by"` on every attendance save,
  --    the new exception handler would have caught it, and the rule would have
  --    been switched on and activated NOBODY — silently, while looking
  --    perfectly installed.
  --
  --    A file naming a column is not evidence the column exists. This is.
  --    NOTE: a NEW.<name> written in a COMMENT inside the body counts as a
  --    reference too. This guard fails CLOSED on purpose — a needless refusal
  --    costs one reworded comment; a missed one costs a rule that activates
  --    nobody on production.
  SELECT array_agg(DISTINCT lower(m[1]))
    INTO v_refs
    FROM regexp_matches(v_body, '\m(?:NEW|OLD)\.([a-zA-Z_][a-zA-Z0-9_]*)', 'g') AS m;

  SELECT array_agg(r ORDER BY r)
    INTO v_bad
    FROM unnest(COALESCE(v_refs, '{}'::text[])) AS r
   WHERE r NOT IN (
     SELECT lower(c.column_name)
     FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = 'student_attendance');

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'fn_activate_learner_on_first_present() reads %, which public.student_attendance does not have in THIS database. Every NEW./OLD. reference must be a real column, or the trigger raises on every attendance save and silently activates nobody',
      v_bad
      USING ERRCODE = 'undefined_column';
  END IF;

  RAISE LOG 'first-present activation hardened: failures table installed, trigger body can no longer reject an attendance save, UPDATE activates only learners who become present, and every column it reads (%) exists on student_attendance', v_refs;
END
$do$;

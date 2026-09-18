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
--     What this file adds is one field. The audit row already named the reason
--     (`first_present_attendance`), the attendance row (`student_attendance_id`)
--     and the actor (`changed_by = auth.uid()`). But `auth.uid()` is NULL on
--     every service-role and SQL write path, and those paths write attendance
--     too — so on exactly the rows an office user would be puzzling over, "who
--     marked it" could be blank. `student_attendance.marked_by` is NOT NULL, so
--     it is now copied into the audit metadata as `marked_by`. Nothing else
--     about the audit row changes.
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

  -- Who marked the attendance (student_attendance.marked_by, always present)
  -- and who the database thought was calling (auth.uid(), NULL off a JWT path).
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

REVOKE EXECUTE ON FUNCTION public.fn_present_learner_ids(jsonb) FROM anon, PUBLIC;

COMMENT ON FUNCTION public.fn_present_learner_ids(jsonb) IS
  'The distinct learners_profiles.id values marked Present anywhere in one student_attendance.attendance_data payload. Case-insensitive on the status token (production holds a lowercase absent). Not granted to anybody: called only from SECURITY DEFINER code that owns it.';


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
-- ----------------------------------------------------------------------------
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
  p_source                text DEFAULT 'fn_activate_learner_on_first_present'
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
        -- 🅱️ Who actually marked the attendance. `changed_by` above is
        -- auth.uid(), which is NULL on every service-role / SQL write path;
        -- student_attendance.marked_by is NOT NULL, so the office can always
        -- see whose mark caused this.
        'marked_by',               p_marked_by,
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
  uuid[], uuid, date, uuid, uuid, uuid, uuid, uuid, text, text) FROM anon, PUBLIC;

COMMENT ON FUNCTION public.fn_activate_learners_for_first_present(
  uuid[], uuid, date, uuid, uuid, uuid, uuid, uuid, text, text) IS
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
    PERFORM public.fn_activate_learners_for_first_present(
      v_newly_present,
      NEW.id,
      NEW.attendance_date,
      NEW.section_id,
      NEW.timetable_id,
      NEW.institution_id,
      NEW.marked_by,
      auth.uid(),
      TG_OP,
      'fn_activate_learner_on_first_present');

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
         NEW.marked_by, auth.uid(),
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

REVOKE EXECUTE ON FUNCTION public.fn_activate_learner_on_first_present() FROM anon, PUBLIC;

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

  IF to_regprocedure('public.fn_activate_learners_for_first_present(uuid[],uuid,date,uuid,uuid,uuid,uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'fn_activate_learners_for_first_present() was not created';
  END IF;

  IF has_function_privilege('anon',
       'public.fn_activate_learners_for_first_present(uuid[],uuid,date,uuid,uuid,uuid,uuid,uuid,text,text)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'anon still holds EXECUTE on fn_activate_learners_for_first_present()';
  END IF;

  IF has_function_privilege('authenticated',
       'public.fn_activate_learners_for_first_present(uuid[],uuid,date,uuid,uuid,uuid,uuid,uuid,text,text)',
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

  RAISE LOG 'first-present activation hardened: failures table installed, trigger body can no longer reject an attendance save, UPDATE activates only learners who become present';
END
$do$;

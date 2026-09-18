-- ============================================================================
-- 20260918170000_learner_auto_activate_on_induction.sql
--
-- Finishing induction is what makes an admitted learner active.
--
-- DIRECTOR'S RULE (2026-09-18 14:30): learner activation becomes AUTOMATIC
-- when induction completes. Spec:
--   docs/features/2026-09-18-FEATURE-learner-auto-activation-on-induction.md
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
--
--   304 learners sit at `admitted` on production (read-only, 2026-09-18) and
--   155 of them have already finished induction. `admitted` restricts the
--   sidebar to four entries (lib/constants/induction-access.ts), which is what
--   the eleven "only three dashboard options" reporters were looking at — ten
--   of the eleven were induction-only learners. Nothing moved them on because
--   moving them on was a button somebody had to remember to press.
--
-- ── THE SIGNAL, FOUND RATHER THAN GUESSED ───────────────────────────────────
--
--   There is no induction "enrolment" table with a `completed` status. The
--   signal is ONE column:
--
--       public.induction_completion.outcome_complete  (boolean, default false)
--
--   defined in 20260627160000_induction_phase0_foundation.sql:109, one row per
--   (event_id, learner_id) under induction_completion_event_learner_uniq.
--
--   TWO writers reach it, and only two:
--     fn_induction_recompute_completion(uuid) — INSERT … ON CONFLICT DO UPDATE;
--        driven by the admin/coordinator recompute and by the attendance
--        writers fn_induction_mark_attendance / fn_induction_mark_day_attendance
--     fn_induction_completion_on_feedback()   — statement triggers on
--        event_session_feedback, carrying their OWN copy of the denominator
--   (both in 20261018000000_induction_completion_basis_and_mentoring_track.sql)
--
--   Because both land on the same column of the same table, a ROW trigger on
--   induction_completion catches both and cannot be bypassed by a third writer
--   added later. That is the whole reason this is a trigger and not a hook in
--   one of the two functions. induction_completion carries NO trigger today;
--   this is the first.
--
--   NOT the signal: mentoring_complete / mentoring_completed_at, added by the
--   same 2026-10-18 migration, track a YEAR-LONG relationship judged on its own
--   bar. A learner is not held out of activation for a year.
--
-- ── THIS IS THE FOURTH ROUTE TO `active`, AND IT BYPASSES THE FEE GATE ──────
--
--   Live today:
--     evaluate_learner_status_after_payment  -> reserved, admitted  (never active)
--     fn_activate_learner_from_onboarding    -> active  (165 rows on production)
--     fn_activate_learner_on_first_present   -> active  (0 rows — SWITCHED OFF
--        by learners.activate_on_first_present.enabled = false, verified live)
--
--   Reaching `admitted` already means the ~30% payment threshold was cleared;
--   the step from admitted to active was the notional 60% manual gate. This
--   rule replaces that manual step, so a learner who finishes induction becomes
--   active WITHOUT clearing 60%. Stated here in money terms so it is confirmed
--   rather than discovered, exactly as 20260821030000 did for attendance.
--
--   `learners_profiles.fees_confirmed` was considered as a gate and REJECTED:
--   measured read-only on production it is false/NULL on ALL 7,582 rows,
--   including all 5,164 already-active learners. Gating on it would activate
--   nobody, forever, and say nothing.
--
-- ── ELIGIBILITY IS AN ALLOWLIST OF EXACTLY ONE ──────────────────────────────
--
--   Of the 673 learners whose induction is already complete (production,
--   2026-09-18): 470 active, 155 ADMITTED, 24 inactive, 12 rejected,
--   9 reserved, 3 account. Only the 155 move. The 48 others are protected
--   BY the allowlist — `inactive` is a deliberate suspension somebody entered
--   by hand, and `rejected` must never be revived. A blocklist would fail open
--   the day a sixteenth enum label is added.
--
-- ── FAIL SOFT, NEVER BLOCK THE RECOMPUTE ────────────────────────────────────
--
--   trg_validate_learner_semester_year_scope fires BEFORE UPDATE on ALL columns
--   of learners_profiles, so it re-validates degree/department/semester/year
--   institution scope even on an update that touches none of them. On a learner
--   whose rows are already cross-institution-inconsistent it RAISES — and a
--   raise inside an AFTER row trigger aborts the whole transaction, which here
--   is the induction recompute for an ENTIRE EVENT. One bad learner record
--   would stop completion being recorded for everyone in the event.
--
--   So the activation is wrapped in an exception handler that downgrades any
--   failure to a WARNING, mirroring trg_jkkn_auto_issue_learner's documented
--   "fail-soft by design: an issuance failure warns, never blocks".
--
-- ── AUDIT ───────────────────────────────────────────────────────────────────
--
--   Every activation writes learners_profile_status_history — the table the
--   three existing activation paths already write — with a new reason_code
--   `induction_completed` and metadata naming the induction event and the
--   completion row that caused it. No learner record is moved without a trace.
--
-- ── NOT HERE, ON PURPOSE ────────────────────────────────────────────────────
--
--   * The 155-learner BACKFILL. Forward-only triggers never see history. The
--     backfill lives in supabase/manual/ so nothing can auto-apply it, and is
--     run only on the Director's number.
--   * Any notification. Nobody is emailed, pushed or messaged.
--   * reserved / account / inactive learners.
--
-- Idempotent and safe to re-apply. Deliberately carries NO BEGIN;/COMMIT; so a
-- reviewer's BEGIN … ROLLBACK rehearsal against production actually rolls back.
--
-- MIGRATION IS FILE ONLY — NOT APPLIED.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The switch — a config row, per docs/architecture/config-table-pattern.md.
--
--    DEFAULT TRUE, unlike the attendance switch's false. That one shipped off
--    because its precondition (provisional learners on the marking roster) was
--    not live. This one has no precondition: the signal already exists, already
--    fires, and 155 learners are already waiting behind it. The ruling is that
--    activation "becomes automatic", so the shipped state is on.
--
--    INSERT … WHERE NOT EXISTS — add-only. Re-applying this file can never
--    switch OFF a switch someone deliberately turned off, and never resets a
--    value someone deliberately changed.
--
--    scope_type 'global' gives per-institution override for free: fn_get_policy
--    resolves user > institution > role > global, so turning this off for one
--    college is a row, not a code change.
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   is_system, is_active, classification, publication_state, ui_category)
SELECT
  'learners.auto_activate_on_induction',
  'global',
  NULL::uuid,
  'true'::jsonb,
  'MASTER SWITCH (Director ruling 2026-09-18). While true, a learner sitting at '
  '`admitted` is moved to `active` the moment their induction_completion row '
  'reaches outcome_complete = true. While false NOTHING happens: finishing '
  'induction never changes a learner''s lifecycle status and activation stays a '
  'manual admin action. Only `admitted` is eligible — reserved, account, '
  'inactive, rejected and every other status are untouched. Enabling means a '
  'learner reaches `active` WITHOUT the notional 60% payment step that the '
  'manual activation stood in for.',
  'boolean',
  true,
  true,
  'major',
  'published',
  'Learners — Lifecycle'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'learners.auto_activate_on_induction'
    AND scope_type = 'global'
    AND scope_id IS NULL
);


-- ----------------------------------------------------------------------------
-- 2. The trigger function.
--
--    SECURITY DEFINER because the writers that flip outcome_complete are a
--    Senior Learner recording attendance or a learner submitting session
--    feedback — neither holds UPDATE on learners_profiles nor INSERT on the
--    status-history table. Activation must not require handing every one of
--    them learner-edit permission.
--
--    Owner is postgres, which owns both target tables, and neither has FORCE
--    ROW LEVEL SECURITY — so the writes below bypass RLS exactly the way
--    fn_activate_learner_from_onboarding and fn_activate_learner_on_first_present
--    already do.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_activate_learner_on_induction_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_from_status public.lifecycle_status;
BEGIN
  -- (a) Master switch, read FIRST so the disabled cost is one policy lookup
  --     per completion write and nothing else.
  IF NOT COALESCE(
       public.fn_get_policy_bool('learners.auto_activate_on_induction', true, NULL),
       true) THEN
    RETURN NULL;
  END IF;

  -- (b) Nothing to do unless this write is what made the learner complete.
  --     The WHEN clause already requires NEW.outcome_complete; this stops a
  --     recompute that rewrites an already-true row (the ON CONFLICT DO UPDATE
  --     path runs on every recompute) from doing the work again. On INSERT
  --     there is no OLD, so a row born complete always proceeds.
  IF TG_OP = 'UPDATE' AND OLD.outcome_complete IS TRUE THEN
    RETURN NULL;
  END IF;

  IF NEW.learner_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- (c) Promote, and audit exactly what was promoted.
  --
  --     IDEMPOTENT BY CONSTRUCTION: a learner who is not `admitted` fails the
  --     status predicate, the UPDATE matches no row, RETURNING yields nothing
  --     and no audit row is written. Re-running the recompute every day for a
  --     year produces exactly one activation and exactly one history row.
  --
  --     The status predicate sits INSIDE the UPDATE, so under READ COMMITTED
  --     the row re-check after the lock makes a concurrent activation (the
  --     attendance rule, the onboarding RPC, an admin) lose the race cleanly
  --     instead of producing a second history row.
  --
  --     activated_at is stamped by trg_set_learner_activated_at, which only
  --     writes when it is NULL — a learner re-activated later keeps their
  --     original seat-fill date.
  --
  --     FAIL SOFT: trg_validate_learner_semester_year_scope re-validates FK
  --     scope on EVERY update to learners_profiles, so a learner whose rows are
  --     already cross-institution-inconsistent raises here. Aborting would kill
  --     the induction recompute for the whole event, so the failure is
  --     downgraded to a WARNING and the recompute proceeds.
  BEGIN
    WITH promoted AS (
      UPDATE public.learners_profiles lp
         SET lifecycle_status = 'active'::lifecycle_status,
             updated_at       = now()
       WHERE lp.id = NEW.learner_id
         AND lp.lifecycle_status::text = 'admitted'
      RETURNING lp.id AS learner_id
    )
    INSERT INTO public.learners_profile_status_history
      (learner_id, from_status, to_status, reason_code, changed_by, metadata)
    SELECT
      p.learner_id,
      'admitted'::lifecycle_status,
      'active'::lifecycle_status,
      'induction_completed',
      auth.uid(),
      jsonb_build_object(
        'source',                  'fn_activate_learner_on_induction_complete',
        'trigger_op',              TG_OP,
        'from_status',             'admitted',
        'induction_completion_id', NEW.id,
        'event_id',                NEW.event_id,
        'institution_id',          NEW.institution_id,
        'completed_at',            NEW.completed_at,
        'attendance_pct',          NEW.attendance_pct,
        -- Recorded so the money consequence is visible in the audit trail
        -- itself, not only in this file's header.
        'fee_thresholds_bypassed', true)
    FROM promoted p;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING
      'fn_activate_learner_on_induction_complete: learner % not activated (%): %',
      NEW.learner_id, SQLSTATE, SQLERRM;
  END;

  RETURN NULL;
END;
$function$;

-- Trigger functions are exempt from the repo's anon-lock CI guard (PostgreSQL
-- does not check EXECUTE when a trigger fires, and a `RETURNS trigger` function
-- cannot be called over PostgREST). The revoke is asserted anyway, in the same
-- file as the definition, because "exempt from the checker" is not the same as
-- "safe to leave granted". No GRANT is issued: nothing may call this directly.
REVOKE EXECUTE ON FUNCTION public.fn_activate_learner_on_induction_complete()
  FROM anon, PUBLIC;

COMMENT ON FUNCTION public.fn_activate_learner_on_induction_complete() IS
  'Moves an ADMITTED learner to active the moment induction_completion.'
  'outcome_complete becomes true (Director ruling 2026-09-18). Allowlist of one '
  'status: reserved, account, inactive and rejected are never touched. Gated by '
  'platform policy learners.auto_activate_on_induction (default true). Audits '
  'every activation to learners_profile_status_history with reason_code '
  'induction_completed. Fail-soft: any error warns and lets the induction '
  'recompute finish.';


-- ----------------------------------------------------------------------------
-- 3. The trigger.
--
--    AFTER, not BEFORE: the completion row must be durable before a learner is
--    moved on the strength of it.
--
--    `UPDATE OF outcome_complete` narrows the wake-ups — a recompute that only
--    changes attendance_pct or a referral count does not fire this at all.
--
--    The WHEN clause keeps the false case free: a learner who is recomputed and
--    found NOT complete never enters the function.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_activate_learner_on_induction_complete
  ON public.induction_completion;

CREATE TRIGGER trg_activate_learner_on_induction_complete
  AFTER INSERT OR UPDATE OF outcome_complete ON public.induction_completion
  FOR EACH ROW
  WHEN (NEW.outcome_complete IS TRUE)
  EXECUTE FUNCTION public.fn_activate_learner_on_induction_complete();

COMMENT ON TRIGGER trg_activate_learner_on_induction_complete
  ON public.induction_completion IS
  'Activates an admitted learner when their induction completes. Catches BOTH '
  'writers of outcome_complete (fn_induction_recompute_completion and '
  'fn_induction_completion_on_feedback) because it sits on the column they '
  'share, not inside either function.';


-- ----------------------------------------------------------------------------
-- 4. PostgREST schema cache reload.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

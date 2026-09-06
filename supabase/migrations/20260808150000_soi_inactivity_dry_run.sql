-- ============================================================================
-- SCHOOL OF INFLUENCE — INACTIVITY LIFECYCLE, SHIPPED AS A DRY RUN (S7)
-- Created: 2026-07-31 (spec: specs/school-of-influence-batches-2026-07-30.md §5, §7 S7)
-- ============================================================================
-- D8 — remind → pause → remove. Spec §5 makes this section's shape NON-NEGOTIABLE
-- and it is the entire point of the file, so it is restated here in full:
--
--   cohort_status_events has 0 rows platform-wide. SF100 carried grace,
--   escalation and inactivity settings in cohorts.config and they NEVER FIRED
--   ONCE — that inertness is why SF100 sat four months with nobody noticing.
--   An engine that claims "paused" while silently doing nothing is a FAILURE,
--   not a feature.
--
-- Therefore this migration ships the EVALUATOR and nothing else:
--   1. Every run writes a cohort_status_events row describing what the engine
--      WOULD do — unconditionally, even when the batch has zero members and
--      zero verdicts. A run that finds nothing still leaves a receipt, which is
--      exactly the property SF100 lacked.
--   2. soi.inactivity.enabled (seeded false by 20260731180200) gates the
--      ACTIONS. This build contains NO action step at all: nothing here updates
--      cohort_memberships.status, sends a reminder, or deletes anything. The
--      flag is read on every run and RECORDED on the receipt, and when it is
--      found ON the run writes a LOUD 'armed_without_actions' event instead of
--      pretending to act. Arming is a separate, later Director decision, and
--      the action step is the change that decision unblocks.
--   3. The admin list at /startup-studio/school-of-influence/admin/lifecycle
--      reads these rows so the Director can inspect the verdicts before anything
--      is armed.
--
-- NO NEW TABLE. Verdicts land in public.cohort_status_events, the spine's own
-- append-only audit — the table spec §6 P6 names as never written. Its RLS
-- (20260731040000) already scopes SELECT through the parent cohort on
-- cohort.view + role_has_institution_access, so the admin list needs no new
-- policy and no widening.
--
-- INACTIVITY DERIVES FROM THE S6 SIGNAL, NOT A SECOND DEFINITION OF "ACTIVE".
--   "Quiet" here means: no event_session_attendance mark, with a status that
--   fn_soi_attending_statuses counts as attending, on a session of THIS
--   programme's event. That is the identical numerator
--   fn_soi_batch_completion(20260808145000) uses. There is deliberately no
--   second notion of activity (logins, page views, form submissions): two
--   definitions of "active" would let the completion screen and the removal
--   engine disagree about the same person.
--
-- THE HIGHEST-RISK DEFECT, MADE IMPOSSIBLE (carried from S6)
--   cohort_memberships.member_ref is a profiles.id, but
--   event_session_attendance.learner_id is NOT NULL REFERENCES
--   learners_profiles(id) and the bridge is profiles.learner_id. D4 admits
--   member_type='staff', and such a profile has learner_id NULL — so NO
--   attendance row can exist for them, ever. Scoring them 0% would make every
--   one of them look maximally inactive and, once armed, remove them.
--   Three independent guarantees stop that:
--     (a) the verdict CASE's FIRST branch is learner_id IS NULL -> 'not_tracked'
--         (identical shape to fn_soi_batch_completion), and days_quiet is
--         returned NULL for them rather than a number;
--     (b) fn_soi_record_inactivity_dry_run ASSERTS the invariant before writing
--         and ABORTS the whole run with a named error if any untrackable member
--         ever carries an actionable verdict — a wrong answer stops the engine
--         instead of being recorded as a verdict;
--     (c) the TypeScript reader re-derives it independently
--         (lib/services/school-of-influence/lifecycle.ts) and downgrades any
--         actionable verdict on an untrackable row, so a future SQL regression
--         still cannot reach the screen.
--
-- NOTHING TO ATTEND IS NOT INACTIVITY. A member whose clock started before any
-- session was held, or who joined a programme that has held nothing since, is
-- reported 'none' with that reason — never nudged for missing sessions that do
-- not exist. This is the inverse of the SF100 failure and just as important.
--
-- NO MAGIC NUMBERS. The three thresholds and the master switch are read at
-- runtime through fn_get_policy_int / fn_get_policy_bool against the rows
-- 20260731180200 seeded. The spec §4 fallbacks are declared ONCE, in
-- fn_soi_inactivity_core, and the EFFECTIVE values travel on every result and
-- every recorded row, so the screen and the audit trail show the numbers the
-- database actually judged against. Nothing downstream restates them.
--
-- NOT APPLIED TO ANY DATABASE — Director-gated apply. This file carries no
-- BEGIN;/COMMIT; of its own so that wrapping it in a Mgmt-API BEGIN..ROLLBACK
-- stays a genuine dry run (ref feedback_inner_commit_defeats_begin_rollback_dryrun).
-- ============================================================================


-- ── 1. THIS MIGRATION SEEDS NOTHING, AND THAT IS DELIBERATE ──────────────────
-- It creates functions and indexes only. No INSERT, no UPDATE, no DELETE, no row
-- of data — so applying it cannot change what any existing screen shows, and
-- rolling it back is a DROP.
--
-- The thresholds this engine judges against (soi.inactivity.nudge_days /
-- pause_days / remove_days and the soi.inactivity.enabled master switch) are
-- ALREADY seeded by 20260731180200 at scope_type='cohort', scope_id IS NULL.
-- This file introduces NO new threshold of its own, so spec §8's
-- "config, not constants" is satisfied without adding a row: every number is
-- read at runtime through fn_get_policy_int / fn_get_policy_bool and the
-- EFFECTIVE value travels on every result and every recorded row.
--
-- One key it reads is NOT seeded anywhere: soi.completion.attending_statuses,
-- which decides which marks count as attending and therefore who looks quiet.
-- 20260808145000 introduced that key and explicitly left the seeding to whoever
-- owns the settings surface (S2), and fn_soi_attending_statuses already falls
-- back to the locked default 'present,od' when the row is absent — so nothing is
-- broken by its absence and this file does not reach across that boundary to
-- create it. Instead the effective statuses are RETURNED by the evaluator on
-- every run and rendered on the dry-run screen, so a reviewer can still see what
-- the database counted as attending without a policy row existing.


-- ── 2. The evaluator — ONE computation, no caller guard ──────────────────────
-- INTERNAL ONLY. This function carries no permission check because it is never
-- reachable from outside the database: no role is granted EXECUTE on it (see the
-- REVOKE below, and the deliberate absence of any GRANT). The two entry points
-- below call it while running as the definer, which is why they need no grant
-- to reach it. Every caller-facing surface applies its own guard.
--
-- Returns ONE jsonb document rather than a row set so that a batch with ZERO
-- members still carries the batch identity, the effective thresholds, the master
-- switch and the session counts. The honest empty state ("nothing to evaluate
-- yet") needs all of those, and a row set cannot express them when there are no
-- rows.
CREATE OR REPLACE FUNCTION public.fn_soi_inactivity_core(p_cohort_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Spec §4 defaults, declared ONCE for the whole feature. Used only as the
  -- fn_get_policy_* fallback so a missing or unreadable row degrades to the
  -- LOCKED DECISION rather than to something invented at a call site.
  c_default_nudge  constant integer := 7;
  c_default_pause  constant integer := 14;
  c_default_remove constant integer := 28;
  -- The platform's operating timezone. Not a tunable: this is the repo-wide
  -- convention for "what day is it" (276 uses across supabase/migrations), and
  -- an inactivity engine that disagreed with the rest of the platform about the
  -- date would double-write across a UTC midnight.
  c_zone constant text := 'Asia/Kolkata';

  v_kind     text;
  v_name     text;
  v_inst     uuid;
  v_event    uuid;
  v_nudge    integer;
  v_pause    integer;
  v_remove   integer;
  v_armed    boolean;
  v_statuses text[];
  v_sched    integer;
  v_held     integer;
  v_members  jsonb;
BEGIN
  SELECT c.kind, c.name, c.institution_id,
         NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid
    INTO v_kind, v_name, v_inst, v_event
  FROM public.cohorts c
  WHERE c.id = p_cohort_id;

  IF v_kind IS NULL OR v_kind IS DISTINCT FROM 'school_of_influence' THEN
    RAISE EXCEPTION 'That batch does not exist, or it is not a School of Influence batch.'
      USING ERRCODE = '22023';
  END IF;

  -- p_scope_id = the batch: since 20260731180000 taught fn_get_policy the
  -- 'cohort' branch, a scope_type='cohort' row for THIS batch wins over the
  -- programme-wide cohort row, which wins over global.
  v_nudge  := public.fn_get_policy_int('soi.inactivity.nudge_days',  c_default_nudge,  p_cohort_id);
  v_pause  := public.fn_get_policy_int('soi.inactivity.pause_days',  c_default_pause,  p_cohort_id);
  v_remove := public.fn_get_policy_int('soi.inactivity.remove_days', c_default_remove, p_cohort_id);
  v_armed  := COALESCE(
                public.fn_get_policy_bool('soi.inactivity.enabled', false, p_cohort_id),
                false);

  -- trg_guard_soi_policy_thresholds (20260731180100) already rejects a write that
  -- breaks nudge < pause < remove. Re-checking here is deliberate anyway: an
  -- engine that decides who gets removed must not silently depend on a trigger it
  -- cannot see having been present for every historical write. A broken order
  -- falls back to the LOCKED §4 ladder rather than to an arbitrary repair.
  IF v_nudge IS NULL OR v_pause IS NULL OR v_remove IS NULL
     OR v_nudge < 1 OR v_nudge >= v_pause OR v_pause >= v_remove THEN
    v_nudge  := c_default_nudge;
    v_pause  := c_default_pause;
    v_remove := c_default_remove;
  END IF;

  v_statuses := public.fn_soi_attending_statuses(p_cohort_id);

  -- Cancelled sessions count for nobody: calling a session off must not make the
  -- whole batch look quiet.
  SELECT COUNT(*)::integer,
         COUNT(*) FILTER (WHERE s.end_at <= now())::integer
    INTO v_sched, v_held
  FROM public.event_sessions s
  WHERE v_event IS NOT NULL
    AND s.event_id = v_event
    AND s.status <> 'cancelled';

  v_sched := COALESCE(v_sched, 0);
  v_held  := COALESCE(v_held, 0);

  SELECT COALESCE(
           jsonb_agg(to_jsonb(r) ORDER BY (r.verdict = 'not_tracked'), r.full_name),
           '[]'::jsonb)
    INTO v_members
  FROM (
    SELECT
      m.id                                   AS membership_id,
      p.id                                   AS profile_id,
      COALESCE(NULLIF(btrim(p.full_name), ''), p.email, 'Unnamed')::text AS full_name,
      m.member_type::text                    AS member_type,
      m.status::text                         AS membership_status,
      base.trackable                         AS attendance_trackable,
      base.last_attended_at,
      -- Reported for a trackable member only. An untrackable member has no
      -- measurable quiet period at all, and returning 0 for them would read as
      -- "attended today" while returning a large number would read as "gone for
      -- months". NULL is the only honest answer.
      CASE WHEN base.trackable THEN base.quiet_since END       AS quiet_since,
      CASE WHEN base.trackable THEN base.days_quiet END        AS days_quiet,
      CASE WHEN base.trackable THEN base.sessions_missed END   AS sessions_missed,
      base.verdict,
      CASE base.verdict WHEN 'pause' THEN 'paused'
                        WHEN 'remove' THEN 'removed' END       AS would_move_to,
      CASE base.verdict WHEN 'nudge'  THEN v_nudge
                        WHEN 'pause'  THEN v_pause
                        WHEN 'remove' THEN v_remove END        AS threshold_days,
      base.reason
    FROM public.cohort_memberships m
    JOIN public.profiles p ON p.id = m.member_ref
    CROSS JOIN LATERAL (
      SELECT
        q.trackable,
        q.last_attended_at,
        q.quiet_since,
        q.days_quiet,
        q.sessions_missed,
        q.verdict,
        CASE q.verdict
          WHEN 'not_tracked' THEN
            'Attendance cannot be recorded for this person: the register stores marks against a learner record and this profile has none. They stay in the batch and are left out of the inactivity figures rather than counted as quiet.'
          WHEN 'none' THEN
            CASE
              WHEN m.status = 'invited' THEN
                'Invited but not yet in the batch, so there is nothing to be quiet about yet.'
              WHEN q.sessions_missed = 0 THEN
                'No session has been held since their clock started, so there has been nothing to attend.'
              WHEN m.status = 'paused' THEN
                'Already paused. Only the removal threshold escalates a paused member further.'
              ELSE
                'Quiet for ' || q.days_quiet || ' day(s) — under the ' || v_nudge || '-day reminder threshold.'
            END
          WHEN 'nudge' THEN
            'Quiet for ' || q.days_quiet || ' day(s), missing ' || q.sessions_missed
            || ' held session(s), which is at or past the ' || v_nudge || '-day reminder threshold.'
          WHEN 'pause' THEN
            'Quiet for ' || q.days_quiet || ' day(s), missing ' || q.sessions_missed
            || ' held session(s), which is at or past the ' || v_pause || '-day pause threshold.'
          WHEN 'remove' THEN
            'Quiet for ' || q.days_quiet || ' day(s), missing ' || q.sessions_missed
            || ' held session(s), which is at or past the ' || v_remove || '-day removal threshold.'
        END AS reason
      FROM (
        SELECT
          (p.learner_id IS NOT NULL)                       AS trackable,
          a.last_attended_at,
          a.quiet_since,
          a.days_quiet,
          a.sessions_missed,
          CASE
            -- FIRST branch, always. See "THE HIGHEST-RISK DEFECT" above.
            WHEN p.learner_id IS NULL          THEN 'not_tracked'
            -- Mirrors the spine's own eligibility rule
            -- (cohort-core/lifecycle.nextMembershipStatusOnInactivity treats only
            -- active/enrolled as participating); 'invited' has not joined yet.
            WHEN m.status = 'invited'          THEN 'none'
            -- Nothing has been held since their clock started: the inverse of
            -- the SF100 failure, and just as wrong to get wrong.
            WHEN a.sessions_missed = 0         THEN 'none'
            WHEN a.days_quiet >= v_remove      THEN 'remove'
            -- A paused member is already paused; only removal escalates them.
            WHEN m.status = 'paused'           THEN 'none'
            WHEN a.days_quiet >= v_pause       THEN 'pause'
            WHEN a.days_quiet >= v_nudge       THEN 'nudge'
            ELSE 'none'
          END AS verdict
        FROM (
          SELECT
            la.last_attended_at,
            COALESCE(la.last_attended_at, COALESCE(m.joined_at, m.created_at)) AS quiet_since,
            GREATEST(
              FLOOR(EXTRACT(EPOCH FROM (
                now() - COALESCE(la.last_attended_at, COALESCE(m.joined_at, m.created_at))
              )) / 86400.0)::integer, 0)                                       AS days_quiet,
            (
              SELECT COUNT(*)::integer
              FROM public.event_sessions s2
              WHERE v_event IS NOT NULL
                AND s2.event_id = v_event
                AND s2.status <> 'cancelled'
                AND s2.end_at <= now()
                AND s2.end_at > COALESCE(la.last_attended_at, COALESCE(m.joined_at, m.created_at))
            )                                                                  AS sessions_missed
          FROM (
            SELECT MAX(s.end_at) AS last_attended_at
            FROM public.event_session_attendance esa
            JOIN public.event_sessions s ON s.id = esa.session_id
            WHERE p.learner_id IS NOT NULL
              AND esa.learner_id = p.learner_id
              AND v_event IS NOT NULL
              AND s.event_id = v_event
              AND s.status <> 'cancelled'
              AND s.end_at <= now()
              AND esa.status = ANY (v_statuses)
          ) la
        ) a
      ) q
    ) base
    WHERE m.cohort_id = p_cohort_id
      -- Terminal memberships are out of the ladder entirely (spine rule): a
      -- graduated or removed member cannot be nudged, paused or removed again.
      AND m.status NOT IN ('graduated', 'removed')
  ) r;

  RETURN jsonb_build_object(
    'cohort_id',       p_cohort_id,
    'batch_name',      v_name,
    'institution_id',  v_inst,
    'source_event_id', v_event,
    'evaluated_at',    now(),
    'evaluated_on',    (now() AT TIME ZONE c_zone)::date::text,
    'engine_armed',    v_armed,
    'actions_taken',   0,
    'thresholds', jsonb_build_object(
      'nudge_days',  v_nudge,
      'pause_days',  v_pause,
      'remove_days', v_remove
    ),
    'attending_statuses', to_jsonb(v_statuses),
    'sessions_scheduled', v_sched,
    'sessions_held',      v_held,
    'members',            v_members,
    'counts', jsonb_build_object(
      'members',     jsonb_array_length(v_members),
      'none',        (SELECT COUNT(*) FROM jsonb_array_elements(v_members) e WHERE e ->> 'verdict' = 'none'),
      'nudge',       (SELECT COUNT(*) FROM jsonb_array_elements(v_members) e WHERE e ->> 'verdict' = 'nudge'),
      'pause',       (SELECT COUNT(*) FROM jsonb_array_elements(v_members) e WHERE e ->> 'verdict' = 'pause'),
      'remove',      (SELECT COUNT(*) FROM jsonb_array_elements(v_members) e WHERE e ->> 'verdict' = 'remove'),
      'not_tracked', (SELECT COUNT(*) FROM jsonb_array_elements(v_members) e WHERE e ->> 'verdict' = 'not_tracked')
    )
  );
END;
$$;

COMMENT ON FUNCTION public.fn_soi_inactivity_core(uuid) IS
  'School of Influence S7: the inactivity evaluator. INTERNAL — no role holds '
  'EXECUTE; the guarded preview and the service-role recorder call it as definer. '
  'Reads the §4 thresholds at runtime and returns them on the result. Takes no '
  'action and writes nothing.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_inactivity_core(uuid) FROM anon, PUBLIC;
-- Deliberately NO grant to authenticated or service_role: the only legitimate
-- callers are the two SECURITY DEFINER functions below, which reach it as the
-- definer and therefore need no grant of their own.
--
-- WRITING NO GRANT IS NOT THE SAME AS DENYING ONE. Supabase ships
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated
-- which is a DIRECT grant applied to every newly created function, independent of
-- PUBLIC. So the comment above described the intent while the platform silently did
-- the opposite: measured on production 2026-08-01, authenticated held EXECUTE on
-- this function. Because it is SECURITY DEFINER and carries no permission check of
-- its own (the check lives in fn_soi_inactivity_preview), any signed-in user could
-- call it directly and read who the engine would nudge, pause or remove — across
-- every batch. The explicit revoke below is what actually enforces the intent.
--
-- Note the CI gate "New SECURITY DEFINER functions lock anon" passes either way:
-- it is anon-only by construction and never inspects the authenticated grant.
REVOKE EXECUTE ON FUNCTION public.fn_soi_inactivity_core(uuid) FROM authenticated;


-- ── 3. Guarded preview — what the admin list reads ───────────────────────────
-- Same guard as every other S6/S7 surface, so the screen and the database cannot
-- disagree about who belongs here. Every SECDEF predicate is COALESCEd inside
-- fn_soi_can_manage_batch (ref feedback_secdef_guard_not_null_safe_falls_through),
-- and the refusal names the permission so the caller can act on it (rule 27).
CREATE OR REPLACE FUNCTION public.fn_soi_inactivity_preview(p_cohort_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.fn_soi_can_manage_batch(p_cohort_id) THEN
    RAISE EXCEPTION 'You do not have permission to view the inactivity preview for this School of Influence batch. Ask a programme coordinator or an administrator — it needs the "cohort.manage" permission for this institution.'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.fn_soi_inactivity_core(p_cohort_id);
END;
$$;

COMMENT ON FUNCTION public.fn_soi_inactivity_preview(uuid) IS
  'School of Influence S7: read-only preview of what the inactivity engine WOULD '
  'do for one batch, for the dry-run admin list. Writes nothing and acts on '
  'nobody.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_inactivity_preview(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_inactivity_preview(uuid) TO authenticated;


-- ── 4. The recorder — the receipt SF100 never had ────────────────────────────
-- Called once a day by app/api/cron/soi-inactivity. p_cohort_id NULL sweeps every
-- non-archived School of Influence batch.
--
-- SERVICE-ROLE ONLY. There is no caller permission check because there is no
-- interactive caller: EXECUTE is revoked from anon and PUBLIC and is NOT granted
-- to authenticated, so no signed-in user can reach it over PostgREST. That is
-- strictly tighter than the CLAUDE.md "GRANT TO authenticated" template, which
-- exists to keep anon out; granting a write-path to every authenticated user in
-- order to satisfy the letter of the template would be the weaker choice.
--
-- SAFE TO RUN REPEATEDLY. uniq_soi_inactivity_dry_run_daily makes a second run on
-- the same day a no-op per membership and per batch, so a retry, a manual poke and
-- the scheduled run cannot triple-write the same verdict.
--
-- TAKES NO ACTION. Nothing below updates cohort_memberships, sends anything, or
-- deletes anything. actions_taken is 0 on every receipt, by construction.
CREATE OR REPLACE FUNCTION public.fn_soi_record_inactivity_dry_run(
  p_cohort_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch     record;
  v_result    jsonb;
  v_today     text;
  v_batches   integer := 0;
  v_receipts  integer := 0;
  v_verdicts  integer := 0;
  v_armed     integer := 0;
  v_written   integer := 0;
  v_summaries jsonb   := '[]'::jsonb;
BEGIN
  FOR v_batch IN
    SELECT c.id
    FROM public.cohorts c
    WHERE c.kind = 'school_of_influence'
      AND c.status <> 'archived'
      AND (p_cohort_id IS NULL OR c.id = p_cohort_id)
    ORDER BY c.created_at
  LOOP
    v_batches := v_batches + 1;
    v_result  := public.fn_soi_inactivity_core(v_batch.id);
    v_today   := v_result ->> 'evaluated_on';

    -- INVARIANT ASSERT. A member with no learner record can have no attendance
    -- row, so an actionable verdict for them is arithmetically impossible. If it
    -- ever happens the engine STOPS rather than recording it: a wrong verdict
    -- that is merely logged is how a removal engine becomes trusted while being
    -- wrong. This aborts the whole run, all batches, so the failure is loud.
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_result -> 'members') e
      WHERE COALESCE((e ->> 'attendance_trackable')::boolean, false) = false
        AND COALESCE(e ->> 'verdict', '') <> 'not_tracked'
    ) THEN
      RAISE EXCEPTION 'School of Influence inactivity run aborted for batch %: a member whose attendance cannot be tracked was given an actionable verdict. No verdicts were recorded for any batch. This is a bug in fn_soi_inactivity_core, not a configuration problem.', v_batch.id
        USING ERRCODE = '55000';
    END IF;

    IF COALESCE((v_result ->> 'engine_armed')::boolean, false) THEN
      v_armed := v_armed + 1;
    END IF;

    -- 4a. The batch-level receipt. Written UNCONDITIONALLY, every run, even for a
    -- batch with zero members and zero verdicts. This row is the whole point of
    -- spec §5: "the engine ran and found nothing" and "the engine never ran" must
    -- never look the same again.
    INSERT INTO public.cohort_status_events
      (cohort_id, membership_id, event_type, from_status, to_status, actor_id, reason, metadata)
    VALUES (
      v_batch.id,
      NULL,
      'soi.inactivity.dry_run',
      NULL,
      NULL,
      NULL,
      CASE
        WHEN COALESCE((v_result ->> 'engine_armed')::boolean, false)
          THEN 'Inactivity engine evaluated this batch. The master switch is ON but this build has no action step, so nobody was reminded, paused or removed.'
        ELSE 'Inactivity engine evaluated this batch in dry-run. No reminder was sent, nobody was paused and nobody was removed.'
      END,
      (v_result - 'members')
        || jsonb_build_object('dry_run', true, 'actions_taken', 0)
    )
    ON CONFLICT DO NOTHING;

    -- 0 when this batch was already evaluated today (the daily unique index).
    GET DIAGNOSTICS v_written = ROW_COUNT;
    v_receipts := v_receipts + v_written;

    -- 4b. One row per ACTIONABLE verdict, so the admin list can name the person,
    -- the reason and the threshold that fired. 'none' and 'not_tracked' are
    -- deliberately NOT written per member: the batch receipt already counts them,
    -- and a daily row per quiet-nobody would bury the verdicts that matter.
    INSERT INTO public.cohort_status_events
      (cohort_id, membership_id, event_type, from_status, to_status, actor_id, reason, metadata)
    SELECT
      v_batch.id,
      (e ->> 'membership_id')::uuid,
      'soi.inactivity.dry_run.member',
      e ->> 'membership_status',
      e ->> 'would_move_to',
      NULL,
      e ->> 'reason',
      e || jsonb_build_object(
             'dry_run',      true,
             'action_taken', false,
             'evaluated_on', v_today,
             'evaluated_at', v_result -> 'evaluated_at',
             'engine_armed', v_result -> 'engine_armed',
             'thresholds',   v_result -> 'thresholds'
           )
    FROM jsonb_array_elements(v_result -> 'members') e
    WHERE e ->> 'verdict' IN ('nudge', 'pause', 'remove')
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_written = ROW_COUNT;
    v_verdicts := v_verdicts + v_written;

    -- 4c. The master switch is ON but this build has no action step. Say so
    -- LOUDLY and in its own event type: an armed switch that quietly does nothing
    -- is the exact failure spec §5 forbids, so it must be impossible to mistake
    -- for a working engine.
    IF COALESCE((v_result ->> 'engine_armed')::boolean, false) THEN
      INSERT INTO public.cohort_status_events
        (cohort_id, membership_id, event_type, from_status, to_status, actor_id, reason, metadata)
      VALUES (
        v_batch.id,
        NULL,
        'soi.inactivity.armed_without_actions',
        NULL,
        NULL,
        NULL,
        'soi.inactivity.enabled is ON for this batch, but this build of the engine contains no action step: nobody has been reminded, paused or removed. Turn the switch back off, or ship the action step, so the setting and the behaviour agree.',
        (v_result - 'members') || jsonb_build_object('dry_run', true, 'actions_taken', 0)
      )
      ON CONFLICT DO NOTHING;
    END IF;

    v_summaries := v_summaries || jsonb_build_array(
      (v_result - 'members') || jsonb_build_object('verdicts_recorded_this_run', v_written)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok',                true,
    'dry_run',           true,
    'actions_taken',     0,
    'batches_evaluated', v_batches,
    'batches_armed',     v_armed,
    'receipts_written',  v_receipts,
    'verdicts_written',  v_verdicts,
    'batches',           v_summaries
  );
END;
$$;

COMMENT ON FUNCTION public.fn_soi_record_inactivity_dry_run(uuid) IS
  'School of Influence S7 (spec §5): evaluate every School of Influence batch and '
  'record what the inactivity engine WOULD do in cohort_status_events. Writes a '
  'batch receipt on every run even when nothing is found. Takes NO action — no '
  'membership status is changed and nothing is sent. Service-role only.';

-- `authenticated` is revoked EXPLICITLY, in addition to anon and PUBLIC.
-- Supabase ships ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS
-- TO authenticated, which is a DIRECT grant on every newly created function and is
-- therefore untouched by "REVOKE ... FROM PUBLIC". Without this line the recorder
-- stays callable by any signed-in user, and the apply-time assert below (which is
-- what caught this) refuses the migration. The house template
-- "REVOKE FROM anon, PUBLIC; GRANT TO authenticated" is right for a normal RPC and
-- wrong here: this one is service-role only, invoked by the cron route alone.
REVOKE EXECUTE ON FUNCTION public.fn_soi_record_inactivity_dry_run(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_soi_record_inactivity_dry_run(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_soi_record_inactivity_dry_run(uuid) TO service_role;


-- ── 5. Idempotency — one dry-run row per target per day ──────────────────────
-- COALESCE(membership_id, cohort_id) keys the batch receipt on its cohort and a
-- member verdict on its membership; event_type keeps the two families apart. Both
-- expressions are IMMUTABLE, which a (created_at AT TIME ZONE …) expression is
-- not — hence the evaluated_on stamp carried in metadata.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_soi_inactivity_dry_run_daily
  ON public.cohort_status_events (
    event_type,
    (COALESCE(membership_id, cohort_id)),
    ((metadata ->> 'evaluated_on'))
  )
  WHERE event_type IN (
    'soi.inactivity.dry_run',
    'soi.inactivity.dry_run.member',
    'soi.inactivity.armed_without_actions'
  );

-- Reading the recorded verdicts back needs no new function: the admin list
-- selects from cohort_status_events under the spine's own RLS
-- (cohort_status_events_select_permission, 20260731040000), which already scopes
-- on cohort.view + role_has_institution_access through the parent cohort. This
-- index keeps that read cheap as the log grows.
CREATE INDEX IF NOT EXISTS idx_cohort_status_events_soi_inactivity
  ON public.cohort_status_events (cohort_id, event_type, created_at DESC)
  WHERE event_type LIKE 'soi.inactivity%';


-- ── 6. Apply-time asserts ────────────────────────────────────────────────────
-- Existence is checked BEFORE any privilege probe: has_function_privilege raises
-- on a missing object rather than returning false
-- (ref feedback_privilege_checks_raise_on_missing_object).
DO $assert$
DECLARE
  v_armed boolean;
BEGIN
  IF to_regprocedure('public.fn_soi_inactivity_core(uuid)') IS NULL
     OR to_regprocedure('public.fn_soi_inactivity_preview(uuid)') IS NULL
     OR to_regprocedure('public.fn_soi_record_inactivity_dry_run(uuid)') IS NULL THEN
    RAISE EXCEPTION 'assert failed: one of the three School of Influence inactivity functions was not created.';
  END IF;

  -- Role existence is checked first for the same reason: has_function_privilege
  -- raises on an unknown role, and a bare Postgres has neither Supabase role.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND (has_function_privilege('anon', 'public.fn_soi_inactivity_core(uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_soi_inactivity_preview(uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_soi_record_inactivity_dry_run(uuid)', 'EXECUTE')) THEN
    RAISE EXCEPTION 'assert failed: anon holds EXECUTE on a School of Influence inactivity function.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     AND has_function_privilege('authenticated', 'public.fn_soi_record_inactivity_dry_run(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'assert failed: the recorder is reachable by any signed-in caller; it is service-role only.';
  END IF;

  -- The same assert for the unguarded engine. fn_soi_inactivity_core is SECURITY
  -- DEFINER and carries no permission check of its own (the check lives in
  -- fn_soi_inactivity_preview), so a signed-in caller holding EXECUTE could read
  -- every batch's nudge/pause/remove verdicts directly. Only the guarded preview
  -- and the service-role recorder may reach it, and both do so as the definer
  -- without needing a grant. Measured on production 2026-08-01: authenticated DID
  -- hold EXECUTE here, via Supabase's ALTER DEFAULT PRIVILEGES, despite the
  -- migration never granting it.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     AND has_function_privilege('authenticated', 'public.fn_soi_inactivity_core(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'assert failed: the unguarded inactivity engine is reachable by any signed-in caller.';
  END IF;

  -- Reported, never enforced: this migration must not fail an apply just because
  -- the Director has since armed the switch. It only makes the state visible in
  -- the apply log, which is where a reviewer confirms the flag on the day.
  v_armed := COALESCE(public.fn_get_policy_bool('soi.inactivity.enabled', false, NULL), false);
  RAISE NOTICE 'School of Influence S7 applied. soi.inactivity.enabled (programme-wide) = %. This build has no action step regardless.', v_armed;
END
$assert$;

NOTIFY pgrst, 'reload schema';

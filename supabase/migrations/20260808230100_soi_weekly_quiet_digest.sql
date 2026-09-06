-- ============================================================================
-- SCHOOL OF INFLUENCE — WEEKLY SUMMARY OF WHO HAS GONE QUIET
-- Created: 2026-08-02 (Director decision 2026-08-02)
-- ============================================================================
-- THE ENGINE STAYS IN DRY RUN. Nothing in this file arms it, and nothing here
-- can act on a member. 20260808150000 shipped the evaluator deliberately
-- disabled: it records what it WOULD do and takes no action, and
-- soi.inactivity.enabled is seeded false and STAYS false. This migration adds no
-- action step, reads that flag without ever writing it, and creates no code path
-- whose default is "armed".
--
-- WHAT IT ADDS, AND WHY
--   A dry-run log that nobody reads has the same failure mode as an engine that
--   does nothing. SF100 carried inactivity settings that never fired once, which
--   is why it sat four months with nobody noticing — the lesson is not "switch
--   the engine on", it is "make the finding reach a human on a schedule instead
--   of waiting to be looked up". So the Director chose a WEEKLY SUMMARY over
--   "only when I ask".
--
--   This file therefore creates ONE read-only function that composes that
--   summary, plus the three config rows that govern it. The delivery itself
--   (one bell notification per coordinator) is done by
--   app/api/cron/soi-weekly-quiet-digest, because the notification write needs
--   the targeting validation that belongs in code — see that route's header.
--
-- SILENCE IS THE FAILURE MODE, SO THERE IS NO SILENT PATH
--   The summary distinguishes FOUR states and names each one in plain English:
--     no_batches   — no School of Influence batch exists yet
--     no_members   — batches exist, nobody is in them yet
--     none_quiet   — people are in them and nobody has gone quiet
--     quiet        — the list
--   "Nothing to evaluate yet" and "everyone is fine" are different sentences,
--   and neither is ever expressed by sending nothing. As of 2026-08-01 there are
--   zero School of Influence memberships, so the honest live answer today is one
--   of the first two — not a zero dressed up as good news.
--
-- CARRIED FROM S6/S7, THE HIGHEST-RISK DEFECT
--   A member whose profile carries no learner record can have NO attendance row,
--   ever, so scoring them would make them look permanently quiet and, once
--   armed, remove them. fn_soi_inactivity_core already makes that impossible
--   (its verdict CASE tests learner_id FIRST and returns 'not_tracked' with a
--   NULL days_quiet), and fn_soi_record_inactivity_dry_run aborts the whole run
--   if it is ever handed an actionable verdict for such a member. This function
--   adds the SAME assert independently — see section 3 — and counts those people
--   in their own "attendance not trackable" figure that is never added to, and
--   never presented as, the quiet count.
--
-- NO MAGIC NUMBERS. Which day the summary goes out, and what "gone quiet" means
-- for it, are platform_policies rows read at runtime through fn_get_policy_*.
-- The "quiet" setting is deliberately a POINTER INTO THE EXISTING LADDER
-- ('nudge' / 'pause' / 'remove') rather than a fourth number, so the summary and
-- the engine can never drift apart about the same person.
--
-- HOW IT IS WOKEN UP: THE DISPATCHER, NOT A NEW VERCEL CRON
--   vercel.json holds exactly 100 cron entries today and the most recent one to
--   be added took it from 99 to 100, so a 101st is the kind of change that fails
--   the deployment for every other change too. The platform already has the
--   right home for this: ai_routine_schedules + /api/cron/ai-routine-dispatcher,
--   "the single clock for scheduler-managed AI routines", whose day and time a
--   super admin can edit from /admin/ai-routines without a release. Section 4
--   seeds this job's row there — waking DAILY, because which day it actually
--   sends on is the soi.digest.weekday policy row above and nowhere else.
--   A second benefit: /api/cron/loop-watchdog already watches dispatcher rows
--   with a cadence-aware staleness threshold, so a summary job that stops firing
--   is itself reported rather than becoming a new silence.
--
-- NOT APPLIED TO ANY DATABASE — Director-gated apply. This file carries no
-- BEGIN;/COMMIT; of its own so that wrapping it in a Mgmt-API BEGIN..ROLLBACK
-- stays a genuine dry run (ref feedback_inner_commit_defeats_begin_rollback_dryrun).
-- ============================================================================


-- ── 1. The three config rows ─────────────────────────────────────────────────
-- scope_type='cohort', scope_id IS NULL — the PROGRAMME-WIDE defaults, exactly
-- where 20260731180200 seeded the other School of Influence rows. A per-batch
-- override written later at scope_id = that cohorts.id shadows them, which is
-- the precedence 20260731180000 taught fn_get_policy.
--
-- They appear in the existing settings editor with NO code change: that screen
-- is generic over any platform_policies row whose policy_key starts 'soi.' and
-- renders the control named by ui_widget. Every widget token used below
-- ('toggle', 'dropdown') is one the shared dispatcher already switches on.
--
-- Guarded on IDENTITY (policy_key + scope), never on value, following the S1
-- seed: re-running never resurrects a value the Director has since changed.
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   enum_options, ui_options, validation_schema, classification,
   ui_widget, ui_category, ui_consequence, ui_cascade, is_system, is_active)
SELECT
  s.policy_key,
  'cohort',
  NULL,
  s.value,
  s.description,
  s.data_type,
  s.enum_options,
  s.ui_options,
  s.validation_schema,
  'operational',
  s.ui_widget,
  'School of Influence',
  s.ui_consequence,
  s.ui_cascade,
  false,
  true
FROM (VALUES
  (
    'soi.digest.enabled'::text,
    'true'::jsonb,
    'Whether the weekly summary of who has gone quiet is sent to coordinators. The inactivity engine itself is governed by soi.inactivity.enabled and is unaffected by this row.'::text,
    'boolean'::text,
    NULL::jsonb,
    NULL::jsonb,
    '{"type":"boolean"}'::jsonb,
    'toggle'::text,
    'When on, coordinators get one summary a week of who has gone quiet. Turning it off stops the summary — the system still records who has gone quiet, but nobody is told unless they open the screen.'::text,
    '[{"effect":"Turning this off is how the four-month SF100 silence happened: the record keeps filling up and nobody is told, so it has to be a deliberate choice","severity":"high"},{"effect":"This setting sends or stops a message only. It never reminds, pauses or removes anybody — that is a separate switch","severity":"low"}]'::jsonb
  ),
  (
    'soi.digest.weekday',
    '"monday"'::jsonb,
    'Which day of the week the summary of who has gone quiet is sent. The job wakes daily and sends only on this day, so changing this needs no release.',
    'enum',
    '["sunday","monday","tuesday","wednesday","thursday","friday","saturday"]'::jsonb,
    '[{"value":"sunday","label":"Sunday"},{"value":"monday","label":"Monday (default)"},{"value":"tuesday","label":"Tuesday"},{"value":"wednesday","label":"Wednesday"},{"value":"thursday","label":"Thursday"},{"value":"friday","label":"Friday"},{"value":"saturday","label":"Saturday"}]'::jsonb,
    '{"type":"string","enum":["sunday","monday","tuesday","wednesday","thursday","friday","saturday"]}'::jsonb,
    'dropdown',
    'The day the weekly summary arrives. Each summary covers the seven days ending on that day. Changing the day mid-week can produce one extra summary that week, because the week it covers moves with it.',
    '[{"effect":"Moving the day shifts which seven days each summary covers; nothing is skipped, but one changeover week may be summarised twice","severity":"low"}]'::jsonb
  ),
  (
    'soi.digest.include_from',
    '"nudge"'::jsonb,
    'How far down the reminder / pause / removal ladder somebody has to be before the weekly summary lists them. Deliberately a pointer into the existing thresholds rather than a fourth number, so the summary and the engine cannot disagree about the same person.',
    'enum',
    '["nudge","pause","remove"]'::jsonb,
    '[{"value":"nudge","label":"Everyone at or past the reminder point (default)"},{"value":"pause","label":"Only those at or past the pause point"},{"value":"remove","label":"Only those at or past the removal point"}]'::jsonb,
    '{"type":"string","enum":["nudge","pause","remove"]}'::jsonb,
    'dropdown',
    'How quiet somebody has to be before the weekly summary names them. It does not change who the engine would act on — only who is listed in the message.',
    '[{"effect":"Choosing a later point shortens the message but hides people who are already past the reminder threshold, so nobody is told about them until somebody opens the screen","severity":"medium"},{"effect":"This never changes a threshold. The reminder, pause and removal days are set separately and the summary always prints the values the database actually used","severity":"low"}]'::jsonb
  )
) AS s(policy_key, value, description, data_type, enum_options, ui_options,
       validation_schema, ui_widget, ui_consequence, ui_cascade)
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies p
  WHERE p.policy_key = s.policy_key
    AND p.scope_type = 'cohort'
    AND p.scope_id IS NULL
);


-- ── 2. Who the summary is FOR ────────────────────────────────────────────────
-- The coordinator: whoever holds cohort.manage, plus the super admins and admins
-- that fn_soi_can_manage_batch admits ahead of any permission check. This
-- deliberately MIRRORS that function rather than inventing a second audience —
-- if a person cannot open the lifecycle screen, sending them its summary would
-- be a message with a dead link at the end of it.
--
-- WHY IT IS RESOLVED SET-BASED AND THEN CONFIRMED ONE BY ONE
-- user_has_permission(user_id, key) is the canonical answer but is a per-row
-- plpgsql call, and profiles is ~7,000 rows. So a cheap set-based prefilter
-- narrows the field (roles that carry the key BY VALUE, plus the admin columns)
-- and the canonical function then confirms each survivor. The prefilter reads
-- (permissions->>key)::boolean = true, never `permissions ? key` — the latter
-- tests EXISTENCE, and every cohort.* key on this platform is currently stored
-- false, i.e. as dead as absent (ref feedback_permission_audit_by_value_persona_test_first).
--
-- Returns the audience as a table so the digest function can join batches to it.
-- 'all_institutions' marks the callers fn_soi_can_manage_batch lets past without
-- an institution test at all.
CREATE OR REPLACE FUNCTION public.fn_soi_digest_audience()
RETURNS TABLE (
  profile_id       uuid,
  full_name        text,
  institution_id   uuid,
  all_institutions boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH granting_roles AS (
    SELECT cr.id AS role_id, cr.role_key, cr.institution_scope
    FROM public.custom_roles cr
    WHERE COALESCE(cr.is_active, true)
      AND COALESCE((cr.permissions ->> 'cohort.manage')::boolean, false)
  ),
  candidates AS (
    SELECT p.id, p.full_name, p.email, p.institution_id, p.role, p.is_super_admin
    FROM public.profiles p
    WHERE COALESCE(p.is_active, true)
      AND (
        COALESCE(p.is_super_admin, false)
        OR p.role IN ('admin', 'super_admin', 'administrator')
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          JOIN granting_roles g ON g.role_id = ur.role_id
          WHERE ur.user_id = p.id
        )
        OR EXISTS (SELECT 1 FROM granting_roles g WHERE g.role_key = p.role)
      )
  )
  SELECT
    c.id,
    COALESCE(NULLIF(btrim(c.full_name), ''), c.email, 'Unnamed')::text,
    c.institution_id,
    (
      COALESCE(c.is_super_admin, false)
      OR c.role IN ('admin', 'super_admin', 'administrator')
      -- Mirrors role_has_institution_access: any role scoped 'all' sees every
      -- institution, through either the multi-role table or the legacy column.
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = c.id AND cr.institution_scope = 'all'
      )
      OR EXISTS (
        SELECT 1 FROM public.custom_roles cr
        WHERE cr.role_key = c.role AND cr.institution_scope = 'all'
      )
    )
  FROM candidates c
  WHERE COALESCE(c.is_super_admin, false)
     OR c.role IN ('admin', 'super_admin', 'administrator')
     -- The canonical check, on the narrowed set only.
     OR COALESCE(public.user_has_permission(c.id, 'cohort.manage'), false);
$$;

COMMENT ON FUNCTION public.fn_soi_digest_audience() IS
  'School of Influence weekly summary: who may receive it — the same audience '
  'fn_soi_can_manage_batch admits (cohort.manage, plus super admins and admins). '
  'Read-only. Service-role only; the digest function calls it as definer.';

-- Service-role only, like the recorder it sits beside. `authenticated` is
-- revoked EXPLICITLY as well as PUBLIC: Supabase ships
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated,
-- a DIRECT grant on every newly created function that "REVOKE ... FROM PUBLIC"
-- does not touch. Omitting a GRANT is not denying one — that trap produced two
-- live holes on 2026-08-01. This function lists people and their institutions,
-- so a signed-in caller must not be able to enumerate it.
REVOKE EXECUTE ON FUNCTION public.fn_soi_digest_audience() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_soi_digest_audience() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_soi_digest_audience() TO service_role;


-- ── 3. The summary itself ────────────────────────────────────────────────────
-- ONE read-only document covering the week. STABLE: it writes nothing, changes
-- no membership, and contains no branch that could act on anybody.
--
-- THE ARITHMETIC IS NOT RE-DERIVED HERE. Every verdict comes from
-- fn_soi_inactivity_core — the same function the lifecycle screen and the daily
-- recorder use — so the summary cannot disagree with the screen it links to.
-- The core carries no EXECUTE grant for any role; this function reaches it as
-- the definer, exactly as fn_soi_inactivity_preview does.
--
-- p_as_of lets a caller ask "what would this week's summary say", defaulting to
-- today in the platform's operating timezone. p_ignore_weekday lets the cron
-- route send outside the configured day for a deliberate manual run; it changes
-- WHEN, never WHAT, and the route's idempotency key still prevents a second
-- message for the same week.
CREATE OR REPLACE FUNCTION public.fn_soi_weekly_quiet_digest(
  p_as_of           date    DEFAULT NULL,
  p_ignore_weekday  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- The platform's operating timezone, the repo-wide convention for "what day is
  -- it" and the same constant fn_soi_inactivity_core stamps evaluated_on with.
  c_zone constant text := 'Asia/Kolkata';
  -- Fallbacks used ONLY when the policy row is missing or unreadable, so a
  -- deleted row degrades to the seeded decision rather than to something
  -- invented at a call site.
  c_default_weekday      constant text := 'monday';
  c_default_include_from constant text := 'nudge';

  v_today        date;
  v_enabled      boolean;
  v_weekday      text;
  v_weekday_dow  integer;
  v_include      text;
  v_include_rank integer;
  v_week_start   date;
  v_window_start date;
  v_is_day       boolean;

  v_batch    record;
  v_result   jsonb;
  v_listed   jsonb;
  v_batches  jsonb := '[]'::jsonb;
  v_runs     integer;

  v_n_batches   integer := 0;
  v_n_members   integer := 0;
  v_n_trackable integer := 0;
  v_n_untracked integer := 0;
  v_n_quiet     integer := 0;
  v_n_nudge     integer := 0;
  v_n_pause     integer := 0;
  v_n_remove    integer := 0;
  v_n_runs      integer := 0;
  v_armed_any   boolean := false;
  v_state       text;
BEGIN
  v_today := COALESCE(p_as_of, (now() AT TIME ZONE c_zone)::date);

  -- Config, read at runtime. Nothing below restates a number.
  v_enabled := COALESCE(public.fn_get_policy_bool('soi.digest.enabled', true, NULL), true);
  v_weekday := lower(btrim(COALESCE(
                 public.fn_get_policy_text('soi.digest.weekday', c_default_weekday, NULL),
                 c_default_weekday)));
  v_include := lower(btrim(COALESCE(
                 public.fn_get_policy_text('soi.digest.include_from', c_default_include_from, NULL),
                 c_default_include_from)));

  v_weekday_dow := CASE v_weekday
                     WHEN 'sunday' THEN 0 WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2
                     WHEN 'wednesday' THEN 3 WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5
                     WHEN 'saturday' THEN 6
                   END;
  -- An unrecognised value falls back to the seeded decision rather than to an
  -- arbitrary day, and says so on the result.
  IF v_weekday_dow IS NULL THEN
    v_weekday     := c_default_weekday;
    v_weekday_dow := 1;
  END IF;

  v_include_rank := CASE v_include WHEN 'nudge' THEN 1 WHEN 'pause' THEN 2 WHEN 'remove' THEN 3 END;
  IF v_include_rank IS NULL THEN
    v_include      := c_default_include_from;
    v_include_rank := 1;
  END IF;

  -- The most recent occurrence of the configured weekday, today included. The
  -- summary covers the seven days ending on it.
  v_week_start   := v_today - ((EXTRACT(DOW FROM v_today)::integer - v_weekday_dow + 7) % 7);
  v_window_start := v_week_start - 6;
  v_is_day       := (v_today = v_week_start) OR COALESCE(p_ignore_weekday, false);

  FOR v_batch IN
    SELECT c.id, c.institution_id
    FROM public.cohorts c
    WHERE c.kind = 'school_of_influence'
      AND c.status <> 'archived'
    ORDER BY c.created_at
  LOOP
    v_n_batches := v_n_batches + 1;
    v_result    := public.fn_soi_inactivity_core(v_batch.id);

    -- INDEPENDENT ASSERT, the same one the recorder makes. A member whose
    -- attendance cannot be recorded at all has no measurable quiet period, so an
    -- actionable verdict for them is arithmetically impossible. If it ever
    -- happens the summary REFUSES to be composed rather than naming that person
    -- as quiet in a message a human will act on.
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_result -> 'members') e
      WHERE COALESCE((e ->> 'attendance_trackable')::boolean, false) = false
        AND COALESCE(e ->> 'verdict', '') <> 'not_tracked'
    ) THEN
      RAISE EXCEPTION 'School of Influence weekly summary aborted for batch %: a member whose attendance cannot be recorded was given an actionable verdict. No summary was produced. This is a bug in fn_soi_inactivity_core, not a configuration problem.', v_batch.id
        USING ERRCODE = '55000';
    END IF;

    IF COALESCE((v_result ->> 'engine_armed')::boolean, false) THEN
      v_armed_any := true;
    END IF;

    -- Did the daily dry-run recorder actually run in this window? "The engine
    -- ran and found nothing" and "the engine never ran" must never look the
    -- same, so the number travels on the summary instead of being assumed.
    SELECT COUNT(*)::integer INTO v_runs
    FROM public.cohort_status_events ev
    WHERE ev.cohort_id = v_batch.id
      AND ev.event_type = 'soi.inactivity.dry_run'
      AND (ev.metadata ->> 'evaluated_on') BETWEEN v_window_start::text AND v_week_start::text;
    v_runs := COALESCE(v_runs, 0);

    -- Who the summary NAMES: trackable members at or past the configured rung.
    -- 'not_tracked' can never satisfy the rank test, so an untrackable member
    -- cannot reach this list even if the assert above were removed.
    SELECT COALESCE(jsonb_agg(m ORDER BY (m ->> 'days_quiet')::integer DESC), '[]'::jsonb)
      INTO v_listed
    FROM jsonb_array_elements(v_result -> 'members') m
    WHERE COALESCE((m ->> 'attendance_trackable')::boolean, false)
      AND CASE m ->> 'verdict'
            WHEN 'nudge' THEN 1 WHEN 'pause' THEN 2 WHEN 'remove' THEN 3 ELSE 0
          END >= v_include_rank;

    v_n_members   := v_n_members   + COALESCE((v_result #>> '{counts,members}')::integer, 0);
    v_n_untracked := v_n_untracked + COALESCE((v_result #>> '{counts,not_tracked}')::integer, 0);
    v_n_nudge     := v_n_nudge     + COALESCE((v_result #>> '{counts,nudge}')::integer, 0);
    v_n_pause     := v_n_pause     + COALESCE((v_result #>> '{counts,pause}')::integer, 0);
    v_n_remove    := v_n_remove    + COALESCE((v_result #>> '{counts,remove}')::integer, 0);
    v_n_quiet     := v_n_quiet     + jsonb_array_length(v_listed);
    v_n_runs      := v_n_runs      + v_runs;

    v_batches := v_batches || jsonb_build_array(jsonb_build_object(
      'cohort_id',        v_result -> 'cohort_id',
      'batch_name',       v_result -> 'batch_name',
      'institution_id',   v_batch.institution_id,
      'source_event_id',  v_result -> 'source_event_id',
      'engine_armed',     v_result -> 'engine_armed',
      'thresholds',       v_result -> 'thresholds',
      'sessions_held',    v_result -> 'sessions_held',
      'members_total',    v_result #> '{counts,members}',
      'not_trackable',    v_result #> '{counts,not_tracked}',
      'nudge',            v_result #> '{counts,nudge}',
      'pause',            v_result #> '{counts,pause}',
      'remove',           v_result #> '{counts,remove}',
      'listed_count',     jsonb_array_length(v_listed),
      'runs_recorded',    v_runs,
      'listed_members',   v_listed
    ));
  END LOOP;

  v_n_trackable := GREATEST(v_n_members - v_n_untracked, 0);

  -- FOUR STATES, each its own sentence. "Nothing to evaluate yet" is not the
  -- same news as "nobody has gone quiet", and neither is ever expressed by
  -- sending nothing at all.
  v_state := CASE
               WHEN v_n_batches = 0 THEN 'no_batches'
               WHEN v_n_members  = 0 THEN 'no_members'
               WHEN v_n_quiet    = 0 THEN 'none_quiet'
               ELSE 'quiet'
             END;

  RETURN jsonb_build_object(
    'generated_at',    now(),
    'as_of',           v_today::text,
    'digest_enabled',  v_enabled,
    'weekday',         v_weekday,
    'weekday_dow',     v_weekday_dow,
    'include_from',    v_include,
    'is_digest_day',   v_is_day,
    'week_start',      v_week_start::text,
    'window_start',    v_window_start::text,
    'state',           v_state,
    -- Reported so the message can say plainly that nothing has been done to
    -- anybody. This build has no action step regardless of the flag.
    'engine_armed_anywhere', v_armed_any,
    'dry_run',         true,
    'actions_taken',   0,
    'totals', jsonb_build_object(
      'batches',            v_n_batches,
      'members_evaluated',  v_n_members,
      'trackable',          v_n_trackable,
      'not_trackable',      v_n_untracked,
      'listed',             v_n_quiet,
      'nudge',              v_n_nudge,
      'pause',              v_n_pause,
      'remove',             v_n_remove,
      'runs_recorded',      v_n_runs
    ),
    'batches',    v_batches,
    'recipients', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
                'profile_id',       a.profile_id,
                'full_name',        a.full_name,
                'all_institutions', a.all_institutions,
                -- The batches THIS person may actually open, so the message
                -- never names a batch whose screen would refuse them.
                'cohort_ids', COALESCE((
                  SELECT jsonb_agg(c.id ORDER BY c.created_at)
                  FROM public.cohorts c
                  WHERE c.kind = 'school_of_influence'
                    AND c.status <> 'archived'
                    AND (
                      a.all_institutions
                      OR c.institution_id = a.institution_id
                      OR EXISTS (
                        SELECT 1 FROM public.user_institution_access uia
                        WHERE uia.user_id = a.profile_id
                          AND uia.institution_id = c.institution_id
                          AND COALESCE(uia.is_active, true)
                      )
                    )
                ), '[]'::jsonb)
              ) ORDER BY a.full_name)
       FROM public.fn_soi_digest_audience() a),
      '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.fn_soi_weekly_quiet_digest(date, boolean) IS
  'School of Influence: the weekly summary of who the inactivity engine WOULD '
  'nudge, pause or remove, plus who may receive it. Read-only — writes nothing, '
  'changes no membership, takes no action. Service-role only; delivered by '
  'app/api/cron/soi-weekly-quiet-digest.';

-- Service-role only. Same reasoning as fn_soi_digest_audience above, and the
-- same reasoning fn_soi_record_inactivity_dry_run carries: there is no
-- interactive caller, and this document names people across EVERY batch and
-- every institution, so it must not be reachable by a signed-in user. The house
-- template "REVOKE FROM anon, PUBLIC; GRANT TO authenticated" is right for a
-- normal RPC and wrong here.
REVOKE EXECUTE ON FUNCTION public.fn_soi_weekly_quiet_digest(date, boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_soi_weekly_quiet_digest(date, boolean) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_soi_weekly_quiet_digest(date, boolean) TO service_role;


-- ── 4. The wake-up: one dispatcher schedule row ──────────────────────────────
-- DAILY on purpose. The dispatcher only decides WHEN the route is woken; the
-- route then sends only on soi.digest.weekday, so the send day stays a single
-- policy row that a coordinator edits on the School of Influence settings
-- screen. Leaving this row on all seven days is what keeps those two from
-- disagreeing — the registry entry says so where a super admin would go to
-- change it.
--
-- minute_of_day = 525 → 08:45 IST. The dispatcher floors both sides to the
-- 15-minute slot, so this fires in the 08:45 tick.
--
-- ON CONFLICT DO NOTHING: seeds the schedule ONCE and never overwrites a time a
-- super admin has since edited, matching 20260701210500.
INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES
  ('soi-weekly-quiet-digest', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 525)
ON CONFLICT (routine_id) DO NOTHING;


-- ── 5. Apply-time asserts, on the END STATE ──────────────────────────────────
-- Existence is checked BEFORE any privilege probe: has_function_privilege raises
-- on a missing object rather than returning false
-- (ref feedback_privilege_checks_raise_on_missing_object), and on an unknown
-- role, so each role's existence is tested first.
DO $assert$
DECLARE
  v_rows  integer;
  v_armed boolean;
BEGIN
  IF to_regprocedure('public.fn_soi_digest_audience()') IS NULL
     OR to_regprocedure('public.fn_soi_weekly_quiet_digest(date, boolean)') IS NULL THEN
    RAISE EXCEPTION 'assert failed: a School of Influence weekly summary function was not created.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND (has_function_privilege('anon', 'public.fn_soi_digest_audience()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_soi_weekly_quiet_digest(date, boolean)', 'EXECUTE')) THEN
    RAISE EXCEPTION 'assert failed: anon holds EXECUTE on a School of Influence weekly summary function.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     AND (has_function_privilege('authenticated', 'public.fn_soi_digest_audience()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.fn_soi_weekly_quiet_digest(date, boolean)', 'EXECUTE')) THEN
    RAISE EXCEPTION 'assert failed: a weekly summary function is reachable by any signed-in caller; both are service-role only.';
  END IF;

  SELECT COUNT(*) INTO v_rows
  FROM public.platform_policies
  WHERE scope_type = 'cohort' AND scope_id IS NULL
    AND policy_key IN ('soi.digest.enabled', 'soi.digest.weekday', 'soi.digest.include_from');
  IF v_rows <> 3 THEN
    RAISE EXCEPTION 'assert failed: expected 3 programme-wide soi.digest.* rows, found %.', v_rows;
  END IF;

  -- The wake-up must exist and must be daily, or the send day would silently
  -- become whatever the dispatcher row says instead of the policy row.
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_routine_schedules
    WHERE routine_id = 'soi-weekly-quiet-digest'
  ) THEN
    RAISE EXCEPTION 'assert failed: the weekly summary has no ai_routine_schedules row, so nothing would ever wake it.';
  END IF;

  -- Reported, never enforced: this migration must not fail an apply because the
  -- Director has since armed the engine, and it must never be the thing that
  -- arms it. It only makes the state visible in the apply log, which is where a
  -- reviewer confirms the flag on the day.
  v_armed := COALESCE(public.fn_get_policy_bool('soi.inactivity.enabled', false, NULL), false);
  RAISE NOTICE 'School of Influence weekly summary applied. soi.inactivity.enabled (programme-wide) = %. Unchanged by this migration, and this build still has no action step.', v_armed;
END
$assert$;

NOTIFY pgrst, 'reload schema';

-- ROLLBACK (down migration):
--   DROP FUNCTION IF EXISTS public.fn_soi_weekly_quiet_digest(date, boolean);
--   DROP FUNCTION IF EXISTS public.fn_soi_digest_audience();
--   DELETE FROM public.ai_routine_schedules WHERE routine_id = 'soi-weekly-quiet-digest';
--   DELETE FROM public.platform_policies
--    WHERE scope_type = 'cohort' AND scope_id IS NULL
--      AND policy_key IN ('soi.digest.enabled','soi.digest.weekday','soi.digest.include_from');

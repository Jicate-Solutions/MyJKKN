-- ============================================================================
-- SCHOOL OF INFLUENCE — FOLDING A BATCH THAT IS TOO SMALL TO RUN
-- Created: 2026-08-02 (Director decision 2026-08-02)
-- ============================================================================
-- THE SITUATION. Intake closes 14 August. Three batches. A plausible outcome is
-- one batch full and another holding six people: a session too small to be worth
-- running, and unfair to the six. This file is the machinery that spots that and
-- proposes the fold.
--
-- THE TENSION, RESOLVED DELIBERATELY. Merging moves real people between groups
-- without asking them. The same Director has repeatedly chosen "leave a visible
-- record" over silent automation in this programme, and requires the inactivity
-- engine (20260808150000) to act on nobody without review. So:
--
--   • THE PLAN IS AUTOMATIC. THE MOVE IS NOT. fn_soi_merge_plan works out which
--     batches are under strength and where each one should go. It is STABLE, it
--     writes nothing, and it is the only thing that runs without a human. There
--     is NO cron route in this change and no unattended caller anywhere: a
--     coordinator reads the plan and presses Confirm, or does not.
--   • NOTHING IS SILENT. Every person who moves gets a cohort_status_events row
--     naming who moved, out of which batch, into which batch and why — and a
--     notification in their own bell saying the same thing in plain words.
--   • NOTHING IS IRREVERSIBLE. The row carries the batch they came from, so
--     putting somebody back is one transfer along the same path they arrived by,
--     recorded and announced by the same function with p_undo = true.
--
-- THE MOVE ITSELF IS NOT IN THIS FILE, ON PURPOSE. CohortService.transferMembership
-- (lib/services/cohort-core/cohort-service.ts) already re-points a membership,
-- preserves its lifecycle status, re-runs assertMemberIdentity, appends the
-- config.transfers breadcrumb and writes the audit event. A SQL move path here
-- would be a SECOND implementation of all four guarantees, and the one that got
-- SF100 into trouble was the mechanism nobody could see. So the browser walks
-- the confirmed plan through the existing spine, one transfer per person, and
-- calls fn_soi_record_batch_merge afterwards to write the batch-level receipt
-- and tell the people who moved.
--
-- WHAT THIS FILE ADDS TO THAT, AND WHY IT IS NOT DECORATION.
--   CohortService.transferMembership writes its audit event BEST-EFFORT — the
--   catch around recordStatusEvent deliberately never lets a failed event mask a
--   successful move. That is right for the spine and wrong for a merge, where the
--   audit row IS the answer to "why am I in Batch B when I chose C?". So the
--   recorder below re-checks every membership it is handed and BACKFILLS the
--   per-person row when the spine's is missing, flagging that it had to. A person
--   can therefore always be told why they moved, even if the browser tab died
--   between the transfer and the event.
--
-- NO MAGIC NUMBERS. The minimum viable batch size is a platform_policies row
-- (scope_type='cohort'), read at runtime through fn_get_policy_int, per batch,
-- with a per-batch override winning over the programme-wide row. The EFFECTIVE
-- value travels on the plan and on every receipt, so the screen and the audit
-- trail show the number the database actually judged against.
--
-- NOT APPLIED TO ANY DATABASE — Director-gated apply. This file carries no
-- BEGIN;/COMMIT; of its own so that wrapping it in a Mgmt-API BEGIN..ROLLBACK
-- stays a genuine dry run (ref feedback_inner_commit_defeats_begin_rollback_dryrun).
-- ============================================================================


-- ── 1. The threshold — a config row, not a constant ─────────────────────────
-- WHY 8. It is derived from a number this programme already configures rather
-- than invented: soi.completion.min_attendance_pct is 75, so a batch running at
-- its own attendance bar has three quarters of its members in the room. Eight is
-- the smallest headcount at which that still puts six people in the room, and six
-- is the smallest group in which a facilitated discussion is still a discussion.
-- Seven would put five in the room; the Director's own example, six, would put
-- four. The number is a judgement, which is exactly why it is a row a coordinator
-- can change without a deploy — not a literal compiled into a service.
--
-- Seeded at scope_type='cohort', scope_id IS NULL: the programme-wide cohort
-- default that 20260731180000 taught fn_get_policy to resolve. A per-batch
-- override is a row of the same key with scope_id = the batch, and it wins.
--
-- NOT VALIDATED BY trg_guard_soi_policy_thresholds, DELIBERATELY. That trigger
-- passes any soi.* key it does not name straight through, so this row inserts
-- cleanly. Extending it would mean CREATE OR REPLACE of a live function from a
-- repo file that may already be behind the database — the trap that silently
-- reverted a money gate on 2026-07-26. The bound is enforced in the reader below
-- instead, which is where every other School of Influence threshold re-checks
-- itself anyway ("a reader that decides who moves must not silently depend on a
-- trigger it cannot see having been present for every historical write").
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   enum_options, ui_options, validation_schema, classification,
   ui_widget, ui_category, ui_consequence, ui_cascade, is_system, is_active)
SELECT
  'soi.min_viable_batch_size'::text,
  'cohort'::text,
  NULL::uuid,
  '8'::jsonb,
  'The fewest people a School of Influence batch can hold and still be worth running on its own. Once intake has closed, a batch below this is proposed for folding into another batch.'::text,
  'number'::text,
  NULL::jsonb,
  NULL::jsonb,
  '{"type":"integer","minimum":1}'::jsonb,
  'operational'::text,
  'number'::text,
  'School of Influence'::text,
  'The smallest group worth running a session for. After intake closes, a batch with fewer people than this is offered up to be folded into another batch — a coordinator still has to confirm each fold, and everybody moved is told.'::text,
  '[{"effect":"Raising this proposes more batches for folding, so more people are moved out of the batch they applied to","severity":"medium"},{"effect":"Lowering it to 1 stops any batch ever being proposed for folding, and a near-empty session will run as it is","severity":"medium"},{"effect":"Setting it above the batch capacity would mark every batch under strength; the reader clamps it to the capacity rather than doing that","severity":"low"}]'::jsonb,
  false,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies p
  WHERE p.policy_key = 'soi.min_viable_batch_size'
    AND p.scope_type = 'cohort'
    AND p.scope_id IS NULL
);


-- ── 2. The reader — the effective threshold for ONE batch ───────────────────
-- INTERNAL. No role holds EXECUTE; the guarded plan below reaches it as the
-- definer. The effective value is returned on the plan, so nothing on the client
-- needs to call this and nothing on the client restates the number.
--
-- CLAMPED TO THE BATCH CAPACITY. A threshold above soi.batch_capacity would mark
-- every batch under strength for ever, including a batch that is completely full
-- — the one state that is obviously fine. Clamping is the honest repair: it can
-- only ever make the fold LESS eager.
CREATE OR REPLACE FUNCTION public.fn_soi_min_viable_batch_size(p_cohort_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Declared ONCE for the whole feature, used only as the reader's fallback so a
  -- missing or unreadable row degrades to the decided value rather than to
  -- something invented at a call site.
  c_default_min      constant integer := 8;
  c_default_capacity constant integer := 30;
  v_min      integer;
  v_capacity integer;
BEGIN
  v_min      := public.fn_get_policy_int('soi.min_viable_batch_size', c_default_min, p_cohort_id);
  v_capacity := public.fn_get_policy_int('soi.batch_capacity', c_default_capacity, p_cohort_id);

  IF v_min IS NULL OR v_min < 1 THEN
    v_min := c_default_min;
  END IF;
  IF v_capacity IS NULL OR v_capacity < 1 THEN
    v_capacity := c_default_capacity;
  END IF;

  RETURN LEAST(v_min, v_capacity);
END;
$$;

COMMENT ON FUNCTION public.fn_soi_min_viable_batch_size(uuid) IS
  'School of Influence: the effective soi.min_viable_batch_size for one batch, '
  'clamped to soi.batch_capacity. INTERNAL — no role holds EXECUTE; the guarded '
  'merge plan reaches it as the definer and returns the value it used.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_min_viable_batch_size(uuid) FROM anon, PUBLIC;
-- WRITING NO GRANT IS NOT THE SAME AS DENYING ONE. Supabase ships
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated
-- as a DIRECT grant on every newly created function, independent of PUBLIC, so
-- the revoke above would leave this callable by any signed-in user. Measured on
-- production 2026-08-01 on exactly this shape. The explicit revoke is what
-- enforces the intent; the CI gate "New SECURITY DEFINER functions lock anon" is
-- anon-only by construction and would pass either way.
REVOKE EXECUTE ON FUNCTION public.fn_soi_min_viable_batch_size(uuid) FROM authenticated;


-- ── 3. The plan — automatic, read-only, acts on nobody ──────────────────────
-- Returns ONE jsonb document rather than a row set: a programme with no
-- under-strength batch still has to carry the threshold, every batch's headcount
-- and the reason nothing is proposed, and a row set cannot say that when there
-- are no rows.
--
-- WHICH BATCHES ARE IN SCOPE. Only batches of this event that the CALLER may run
-- (fn_soi_can_manage_batch, per batch). A coordinator with access to one college
-- sees that college's batches and nothing else, so the plan can never move
-- somebody between institutions or name a person the caller may not see.
--
-- WHEN A BATCH BECOMES FOLDABLE. Only once its intake has CLOSED — closes_at is
-- set and has passed. A batch with no closing date has an open-ended intake and
-- is NEVER proposed for folding: more people may still be coming, and folding a
-- batch that is still recruiting would be acting on a number that is not final.
-- That is reported in words rather than silently skipped.
--
-- THE DESTINATION RULE: the FULLEST batch that can take EVERYONE.
--   • It must have free seats >= the number of people actually moving, so
--     soi.batch_capacity is never breached (the seat definition is the same
--     non-terminal count fn_soi_review_batches enforces at intake, so the merge
--     and the intake cannot disagree about whether a batch is full).
--   • Among those, the one with the FEWEST free seats wins. That consolidates
--     into the healthiest group and leaves the emptier batches free to receive,
--     rather than spreading a small group thinly.
--   • The group is never SPLIT across two destinations. Six people who applied
--     together and are already being moved once should not be moved into two
--     different rooms; if no single batch can take them all, nothing is proposed
--     and the coordinator is told the shortfall.
--   • The destination must be at or above the minimum viable size AFTER the move.
--     This is what makes the "every batch is under strength" case honest: folding
--     6 into 7 gives 13, which clears the bar and is a real fix, so it IS
--     proposed — but if even the combination falls short, nothing is proposed and
--     the arithmetic is stated.
--   • NEAREST START DATE WAS CONSIDERED AND REJECTED. Sessions belong to the
--     EVENT, not the batch (fn_soi_list_sessions and fn_soi_batch_completion both
--     read event_sessions WHERE event_id = the programme event), and every batch
--     of one programme shares them. Start date therefore carries no information
--     for this decision.
--
-- ATTENDANCE IS UNAFFECTED BY A MOVE, AND THAT IS STRUCTURAL. Because both
-- denominators in fn_soi_batch_completion come from the programme EVENT's
-- sessions, and every batch here points at the same event by construction, a
-- person's sessions_attended, pct_to_date and pct_of_programme are byte-for-byte
-- identical before and after. Nobody's 75% is put at risk by a move they did not
-- choose. The plan states this rather than leaving the reader to work it out.
--
-- WHO MOVES. Memberships in enrolled / active / paused — people who HAVE a place.
-- A paused member moves too: leaving them behind in a batch that will not run is
-- worse than moving them, and paused -> active is still legal afterwards.
-- 'invited' does NOT move: an invitation names a batch and has not been answered,
-- and re-pointing an unanswered offer changes what somebody was offered without
-- them ever accepting it. Those are listed as left behind, with the reason, so
-- the coordinator knows the folded batch is not empty.
--
-- WHO COUNTS TOWARDS "TOO SMALL". enrolled + active only — the people who would
-- be in the room. A paused member is not in the room, and an invitation is not a
-- person yet. The seat count used for capacity is the wider non-terminal one.
-- Two numbers because there are two questions; both are returned.
--
-- A WAITING-LIST PLACE IS NEVER TOUCHED. The mover set is pinned to three named
-- statuses, so any status a waiting list introduces is outside it by
-- construction. Such a place still counts against the destination's capacity
-- (the seat count is every non-terminal membership), which is the conservative
-- direction: the merge can refuse for lack of room, never overfill.
CREATE OR REPLACE FUNCTION public.fn_soi_merge_plan(
  p_event_id            uuid,
  p_exclude_cohort_ids  uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_zone constant text := 'Asia/Kolkata';
  v_exclude   uuid[] := COALESCE(p_exclude_cohort_ids, ARRAY[]::uuid[]);
  -- The batch picture is held as jsonb, not a temp table: a STABLE function may
  -- not run DDL, and this plan must stay read-only to be safe to open.
  v_batches   jsonb  := '[]'::jsonb;
  v_proposals jsonb  := '[]'::jsonb;
  v_blocked   jsonb  := '[]'::jsonb;
  v_state     jsonb  := '{}'::jsonb;   -- cohort_id -> running { headcount, free_seats }
  v_sources   uuid[] := ARRAY[]::uuid[];
  v_dests     uuid[] := ARRAY[]::uuid[];
  v_src       record;
  v_dst_id    uuid;
  v_dst_name  text;
  v_dst_free  integer;
  v_dst_head  integer;
  v_movers    jsonb;
  v_left      jsonb;
  v_sched     integer := 0;
  v_held      integer := 0;
  v_combined  integer := 0;
  v_smallest  integer := NULL;
  v_all_under boolean := false;
BEGIN
  IF NOT COALESCE(public.fn_soi_can_review_applications(p_event_id), false) THEN
    RAISE EXCEPTION 'You do not have permission to plan batch merges for this School of Influence programme. Ask a programme coordinator or an administrator — it needs the "cohort.manage" (or "cohort.school_of_influence.manage") permission for this institution.'
      USING ERRCODE = '42501';
  END IF;

  -- Every batch of this programme the caller may actually run, measured once.
  SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.name), '[]'::jsonb)
    INTO v_batches
  FROM (
    SELECT
      c.id                                                        AS cohort_id,
      c.name::text                                                AS name,
      c.status::text                                              AS status,
      c.institution_id                                            AS institution_id,
      c.opens_at                                                  AS opens_at,
      c.closes_at                                                 AS closes_at,
      c.created_at                                                AS created_at,
      hc.headcount                                                AS headcount,
      hc.movers_count                                             AS movers_count,
      hc.invited_count                                            AS invited_count,
      hc.occupied_seats                                           AS occupied_seats,
      cap.capacity                                                AS capacity,
      GREATEST(cap.capacity - hc.occupied_seats, 0)               AS free_seats,
      mv.min_viable                                               AS min_viable,
      (c.closes_at IS NOT NULL AND c.closes_at <= now())          AS intake_closed,
      (c.id = ANY (v_exclude))                                    AS excluded,
      -- A completed or archived batch has finished; it cannot take anybody new.
      (c.status::text NOT IN ('completed', 'archived')
        AND c.id <> ALL (v_exclude))                              AS can_receive,
      (hc.headcount < mv.min_viable)                              AS under_strength
    FROM public.cohorts c
    CROSS JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE m.status IN ('enrolled', 'active'))::integer            AS headcount,
        COUNT(*) FILTER (WHERE m.status IN ('enrolled', 'active', 'paused'))::integer  AS movers_count,
        COUNT(*) FILTER (WHERE m.status = 'invited')::integer                          AS invited_count,
        COUNT(*) FILTER (WHERE m.status NOT IN ('graduated', 'removed'))::integer      AS occupied_seats
      FROM public.cohort_memberships m
      WHERE m.cohort_id = c.id
    ) hc
    CROSS JOIN LATERAL (
      SELECT GREATEST(
               COALESCE(public.fn_get_policy_int('soi.batch_capacity', 30, c.id), 30), 1
             ) AS capacity
    ) cap
    CROSS JOIN LATERAL (
      SELECT public.fn_soi_min_viable_batch_size(c.id) AS min_viable
    ) mv
    WHERE c.kind = 'school_of_influence'
      AND c.archived_at IS NULL
      AND NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid = p_event_id
      AND COALESCE(public.fn_soi_can_manage_batch(c.id), false)
  ) b;

  -- The programme's session counts, for the attendance statement below. Cancelled
  -- sessions count for nobody, exactly as the completion reader treats them.
  SELECT COUNT(*)::integer,
         COUNT(*) FILTER (WHERE s.end_at <= now())::integer
    INTO v_sched, v_held
  FROM public.event_sessions s
  WHERE s.event_id = p_event_id
    AND s.status <> 'cancelled';

  v_sched := COALESCE(v_sched, 0);
  v_held  := COALESCE(v_held, 0);

  SELECT COALESCE(SUM(b.headcount), 0)::integer,
         MIN(b.min_viable)::integer,
         (COUNT(*) > 0 AND bool_and(b.under_strength))
    INTO v_combined, v_smallest, v_all_under
  FROM jsonb_to_recordset(v_batches)
    AS b(headcount integer, min_viable integer, under_strength boolean);

  -- Running state, so a destination that has already received in this same plan
  -- offers fewer seats to the next source rather than being counted twice.
  SELECT COALESCE(
           jsonb_object_agg(
             b.cohort_id::text,
             jsonb_build_object('headcount', b.headcount, 'free_seats', b.free_seats)),
           '{}'::jsonb)
    INTO v_state
  FROM jsonb_to_recordset(v_batches)
    AS b(cohort_id uuid, headcount integer, free_seats integer);

  -- Smallest first: the batch in most trouble is placed while the most rooms are
  -- still open to it.
  FOR v_src IN
    SELECT *
    FROM jsonb_to_recordset(v_batches) AS b(
      cohort_id uuid, name text, status text, institution_id uuid,
      created_at timestamptz, headcount integer, movers_count integer,
      min_viable integer, intake_closed boolean, excluded boolean,
      under_strength boolean)
    WHERE b.under_strength
      AND b.intake_closed
      AND NOT b.excluded
      AND b.status NOT IN ('completed', 'archived')
      AND b.movers_count > 0
    ORDER BY b.headcount, b.created_at, b.name
  LOOP
    -- A batch cannot both give and receive in one plan: that would move somebody
    -- twice on one confirmation, and nobody should have to read two reasons for
    -- one afternoon.
    IF v_src.cohort_id = ANY (v_dests) THEN
      v_blocked := v_blocked || jsonb_build_array(jsonb_build_object(
        'from_cohort_id', v_src.cohort_id,
        'from_name',      v_src.name,
        'headcount',      v_src.headcount,
        'movers_count',   v_src.movers_count,
        'min_viable',     v_src.min_viable,
        'reason',         'This batch is already receiving people from another batch in this same plan, so it is not folded as well. Run the plan again afterwards if it is still short.'
      ));
      CONTINUE;
    END IF;

    v_dst_id   := NULL;
    v_dst_name := NULL;
    v_dst_free := NULL;
    v_dst_head := NULL;

    SELECT b.cohort_id,
           b.name,
           (v_state -> b.cohort_id::text ->> 'free_seats')::integer,
           (v_state -> b.cohort_id::text ->> 'headcount')::integer
      INTO v_dst_id, v_dst_name, v_dst_free, v_dst_head
    FROM jsonb_to_recordset(v_batches) AS b(
      cohort_id uuid, name text, institution_id uuid, opens_at timestamptz,
      created_at timestamptz, min_viable integer, can_receive boolean)
    WHERE b.cohort_id <> v_src.cohort_id
      AND b.can_receive
      AND b.institution_id = v_src.institution_id
      AND b.cohort_id <> ALL (v_sources)
      AND (v_state -> b.cohort_id::text ->> 'free_seats')::integer >= v_src.movers_count
      AND ((v_state -> b.cohort_id::text ->> 'headcount')::integer + v_src.headcount) >= b.min_viable
    -- FULLEST first (fewest free seats), then the earliest-opening batch, then a
    -- stable tie-break so the same plan is produced twice running.
    ORDER BY (v_state -> b.cohort_id::text ->> 'free_seats')::integer ASC,
             b.opens_at ASC NULLS LAST,
             b.created_at ASC,
             b.name ASC,
             b.cohort_id ASC
    LIMIT 1;

    IF v_dst_id IS NULL THEN
      v_blocked := v_blocked || jsonb_build_array(jsonb_build_object(
        'from_cohort_id', v_src.cohort_id,
        'from_name',      v_src.name,
        'headcount',      v_src.headcount,
        'movers_count',   v_src.movers_count,
        'min_viable',     v_src.min_viable,
        'reason',         'No other batch of this programme, at this institution, can take all ' || v_src.movers_count
                          || ' of them and still be a group worth running. Raise soi.batch_capacity on a batch that has room, leave a batch out of this plan, or run this batch as it is.'
      ));
      CONTINUE;
    END IF;

    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
                 'membership_id',     x.membership_id,
                 'profile_id',        x.profile_id,
                 'full_name',         x.full_name,
                 'member_type',       x.member_type,
                 'membership_status', x.membership_status)
               ORDER BY x.full_name) FILTER (WHERE x.moves), '[]'::jsonb),
      COALESCE(jsonb_agg(jsonb_build_object(
                 'membership_id',     x.membership_id,
                 'full_name',         x.full_name,
                 'membership_status', x.membership_status,
                 'reason',            x.left_behind_reason)
               ORDER BY x.full_name) FILTER (WHERE NOT x.moves), '[]'::jsonb)
      INTO v_movers, v_left
    FROM (
      SELECT
        m.id                AS membership_id,
        p.id                AS profile_id,
        COALESCE(NULLIF(btrim(p.full_name), ''), p.email, 'Unnamed')::text AS full_name,
        m.member_type::text AS member_type,
        m.status::text      AS membership_status,
        (m.status IN ('enrolled', 'active', 'paused')) AS moves,
        CASE
          WHEN m.status IN ('enrolled', 'active', 'paused') THEN NULL
          WHEN m.status = 'invited' THEN
            'Invited to this batch but has not accepted yet. An invitation names a batch, so a coordinator withdraws or re-issues it rather than it being quietly re-pointed.'
          ELSE
            'Held in something other than an accepted place in this batch, so the fold leaves it exactly as it is.'
        END AS left_behind_reason
      FROM public.cohort_memberships m
      JOIN public.profiles p ON p.id = m.member_ref
      WHERE m.cohort_id = v_src.cohort_id
        AND m.status NOT IN ('graduated', 'removed')
    ) x;

    v_proposals := v_proposals || jsonb_build_array(jsonb_build_object(
      'from_cohort_id',       v_src.cohort_id,
      'from_name',            v_src.name,
      'from_headcount',       v_src.headcount,
      'to_cohort_id',         v_dst_id,
      'to_name',              v_dst_name,
      'to_headcount',         v_dst_head,
      'to_headcount_after',   v_dst_head + v_src.headcount,
      'to_free_seats_before', v_dst_free,
      'to_free_seats_after',  v_dst_free - v_src.movers_count,
      'min_viable',           v_src.min_viable,
      'moving_count',         jsonb_array_length(v_movers),
      'movers',               v_movers,
      'left_behind',          v_left,
      'reason',               v_src.name || ' has ' || v_src.headcount || ' member(s) taking part, below the '
                              || v_src.min_viable || ' this programme treats as the smallest group worth running, and its intake has closed. '
                              || v_dst_name || ' is the fullest batch with room for all ' || v_src.movers_count || ' of them.'
    ));

    v_sources := v_sources || v_src.cohort_id;
    v_dests   := v_dests   || v_dst_id;
    v_state   := jsonb_set(
                   jsonb_set(v_state,
                             ARRAY[v_dst_id::text, 'free_seats'],
                             to_jsonb(v_dst_free - v_src.movers_count)),
                   ARRAY[v_dst_id::text, 'headcount'],
                   to_jsonb(v_dst_head + v_src.headcount));
  END LOOP;

  RETURN jsonb_build_object(
    'event_id',            p_event_id,
    'evaluated_at',        now(),
    'evaluated_on',        (now() AT TIME ZONE c_zone)::date::text,
    'batches',             v_batches,
    'proposals',           v_proposals,
    'blocked',             v_blocked,
    'has_proposals',       jsonb_array_length(v_proposals) > 0,
    'sessions_scheduled',  v_sched,
    'sessions_held',       v_held,
    -- Stated, not left to be worked out. Both completion denominators are the
    -- programme event's sessions, which every batch here shares, so a move cannot
    -- change anybody's attendance percentage.
    'attendance_effect',   'unchanged',
    'attendance_note',     'Every batch of this programme attends the same sessions, and the attendance figure is worked out from those sessions rather than from the batch. Moving somebody therefore leaves their attendance record and their percentage exactly as they were, including the ' || v_held || ' session(s) already held.',
    'all_under_strength',  COALESCE(v_all_under, false),
    'combined_headcount',  v_combined,
    'combined_clears_threshold',
      CASE WHEN v_smallest IS NULL THEN false ELSE v_combined >= v_smallest END,
    'smallest_min_viable', v_smallest
  );
END;
$$;

COMMENT ON FUNCTION public.fn_soi_merge_plan(uuid, uuid[]) IS
  'School of Influence: which batches are too small to run once their intake has '
  'closed, and where each one should be folded. READ-ONLY — writes nothing and '
  'moves nobody; a coordinator confirms each fold. Returns the effective '
  'soi.min_viable_batch_size it judged against.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_merge_plan(uuid, uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_merge_plan(uuid, uuid[]) TO authenticated;


-- ── 4. The receipt, and telling the people who moved ────────────────────────
-- Called ONCE by the browser after the confirmed transfers have gone through the
-- spine. It records what happened and notifies the people it happened to. It
-- MOVES NOBODY — there is no UPDATE of cohort_memberships anywhere in this file.
--
-- IT ALSO RECORDS THE UNDO. p_undo = true is the same journey backwards: the
-- coordinator has moved somebody out of the batch they were folded into and back
-- to the one they applied to. Giving the undo its own function would create a
-- second set of guards, a second notification writer and a second place for the
-- two to drift apart — so it is one function with branched wording, and the undo
-- is audited and announced exactly as loudly as the merge was.
--
-- IT VERIFIES BEFORE IT RECORDS. Every membership handed to it must actually sit
-- in the destination batch now. One that does not is reported back as unverified
-- and is neither recorded nor notified: a receipt for a move that did not happen
-- is worse than no receipt.
--
-- IT BACKFILLS THE PER-PERSON ROW WHEN THE SPINE'S IS MISSING. transferMembership
-- writes its audit event best-effort, so a browser that died between the UPDATE
-- and the event leaves a person moved with no explanation. This closes that hole
-- and says in the return that it had to.
--
-- SAFE TO RUN TWICE. uniq_soi_batch_merge_run keys every row on the merge run id,
-- and the notification is looked up by its idempotency key before it is written,
-- so a retry after a failed notification writes nothing twice.
CREATE OR REPLACE FUNCTION public.fn_soi_record_batch_merge(
  p_run_id           uuid,
  p_from_cohort_id   uuid,
  p_to_cohort_id     uuid,
  p_membership_ids   uuid[],
  p_undo             boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_zone constant text := 'Asia/Kolkata';
  v_undo       boolean := COALESCE(p_undo, false);
  v_from_name  text;
  v_to_name    text;
  v_from_event uuid;
  v_to_event   uuid;
  v_from_inst  uuid;
  v_to_inst    uuid;
  v_min        integer;
  v_verified   uuid[] := ARRAY[]::uuid[];
  v_unverified uuid[] := ARRAY[]::uuid[];
  v_targets    uuid[] := ARRAY[]::uuid[];
  v_moved      integer := 0;
  v_backfilled integer := 0;
  v_actor      uuid;
  v_note       uuid;
  v_key        text;
  v_written    integer := 0;
  v_receipts   integer := 0;
  v_notified   integer := 0;
BEGIN
  IF p_run_id IS NULL OR p_from_cohort_id IS NULL OR p_to_cohort_id IS NULL THEN
    RAISE EXCEPTION 'A merge receipt needs the run id and both batches.'
      USING ERRCODE = '22023';
  END IF;

  IF p_from_cohort_id = p_to_cohort_id THEN
    RAISE EXCEPTION 'A batch cannot be folded into itself.' USING ERRCODE = '22023';
  END IF;

  -- Both ends are checked. Holding cohort.manage on the destination alone would
  -- let somebody pull people out of a batch they have no business touching.
  IF NOT (COALESCE(public.fn_soi_can_manage_batch(p_from_cohort_id), false)
          AND COALESCE(public.fn_soi_can_manage_batch(p_to_cohort_id), false)) THEN
    RAISE EXCEPTION 'You do not have permission to record a batch merge between these two School of Influence batches. Ask a programme coordinator or an administrator — it needs the "cohort.manage" (or "cohort.school_of_influence.manage") permission for this institution.'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.name, NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid, c.institution_id
    INTO v_from_name, v_from_event, v_from_inst
  FROM public.cohorts c WHERE c.id = p_from_cohort_id;

  SELECT c.name, NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid, c.institution_id
    INTO v_to_name, v_to_event, v_to_inst
  FROM public.cohorts c WHERE c.id = p_to_cohort_id;

  -- The attendance guarantee in section 3 holds ONLY while both batches share one
  -- programme event. This is the line that keeps it true.
  IF v_from_event IS NULL OR v_to_event IS NULL OR v_from_event <> v_to_event THEN
    RAISE EXCEPTION 'These two batches do not belong to the same School of Influence programme, so people cannot be folded from one into the other: their sessions and their attendance records are different.'
      USING ERRCODE = '22023';
  END IF;

  IF v_from_inst IS DISTINCT FROM v_to_inst THEN
    RAISE EXCEPTION 'These two batches belong to different institutions. Moving somebody across institutions is a decision a coordinator makes one person at a time, not in bulk.'
      USING ERRCODE = '22023';
  END IF;

  v_min := public.fn_soi_min_viable_batch_size(
             CASE WHEN v_undo THEN p_to_cohort_id ELSE p_from_cohort_id END);

  SELECT COALESCE(array_agg(m.id) FILTER (WHERE m.cohort_id = p_to_cohort_id), ARRAY[]::uuid[]),
         COALESCE(array_agg(m.id) FILTER (WHERE m.cohort_id <> p_to_cohort_id), ARRAY[]::uuid[]),
         COALESCE(array_agg(m.member_ref) FILTER (WHERE m.cohort_id = p_to_cohort_id), ARRAY[]::uuid[])
    INTO v_verified, v_unverified, v_targets
  FROM public.cohort_memberships m
  WHERE m.id = ANY (COALESCE(p_membership_ids, ARRAY[]::uuid[]));

  v_moved := COALESCE(array_length(v_verified, 1), 0);

  -- ── 4a. Two batch-level receipts: one where they left, one where they arrived.
  -- "What happened to Batch C?" and "why did Batch B grow?" are asked from
  -- different screens, and both answers cost one row.
  INSERT INTO public.cohort_status_events
    (cohort_id, membership_id, event_type, from_status, to_status, actor_id, reason, metadata)
  VALUES (
    p_from_cohort_id,
    NULL,
    CASE WHEN v_undo THEN 'soi.batch_merge.undone' ELSE 'soi.batch_merge' END,
    NULL, NULL, auth.uid(),
    CASE WHEN v_undo
      THEN v_moved || ' member(s) were moved back out of ' || v_from_name || ' to ' || v_to_name
           || ', undoing that part of an earlier fold.'
      ELSE v_from_name || ' had fewer than ' || v_min || ' member(s) taking part once its intake closed, so '
           || v_moved || ' of them were moved into ' || v_to_name || '.'
    END,
    jsonb_build_object(
      'merge_run_id',              p_run_id::text,
      'undo',                      v_undo,
      'from_cohort_id',            p_from_cohort_id,
      'to_cohort_id',              p_to_cohort_id,
      'from_batch_name',           v_from_name,
      'to_batch_name',             v_to_name,
      'min_viable_batch_size',     v_min,
      'moved_count',               v_moved,
      'moved_membership_ids',      to_jsonb(v_verified),
      'unverified_membership_ids', to_jsonb(v_unverified),
      'merged_on',                 (now() AT TIME ZONE c_zone)::date::text,
      'confirmed_by_a_person',     true)
  )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_written = ROW_COUNT;
  v_receipts := v_receipts + v_written;

  INSERT INTO public.cohort_status_events
    (cohort_id, membership_id, event_type, from_status, to_status, actor_id, reason, metadata)
  VALUES (
    p_to_cohort_id,
    NULL,
    CASE WHEN v_undo THEN 'soi.batch_merge.undo_received' ELSE 'soi.batch_merge.received' END,
    NULL, NULL, auth.uid(),
    CASE WHEN v_undo
      THEN v_to_name || ' took back ' || v_moved || ' member(s) from ' || v_from_name || '.'
      ELSE v_to_name || ' received ' || v_moved || ' member(s) from ' || v_from_name
           || ', which was too small to run on its own.'
    END,
    jsonb_build_object(
      'merge_run_id',          p_run_id::text,
      'undo',                  v_undo,
      'from_cohort_id',        p_from_cohort_id,
      'to_cohort_id',          p_to_cohort_id,
      'from_batch_name',       v_from_name,
      'to_batch_name',         v_to_name,
      'min_viable_batch_size', v_min,
      'moved_count',           v_moved,
      'merged_on',             (now() AT TIME ZONE c_zone)::date::text,
      'confirmed_by_a_person', true)
  )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_written = ROW_COUNT;
  v_receipts := v_receipts + v_written;

  -- ── 4b. Backfill any per-person row the spine failed to write.
  INSERT INTO public.cohort_status_events
    (cohort_id, membership_id, event_type, from_status, to_status, actor_id, reason, metadata)
  SELECT
    p_to_cohort_id,
    m.id,
    'soi.batch_merge.moved',
    m.status::text,
    m.status::text,          -- a fold moves the batch, never the lifecycle status
    auth.uid(),
    CASE WHEN v_undo
      THEN 'Moved back from ' || v_from_name || ' to ' || v_to_name
           || ' at a programme coordinator''s request, undoing an earlier fold.'
      ELSE 'Moved from ' || v_from_name || ' to ' || v_to_name || ' because ' || v_from_name
           || ' had fewer than ' || v_min || ' member(s) taking part once its intake closed.'
    END,
    jsonb_build_object(
      'merge_run_id',          p_run_id::text,
      'undo',                  v_undo,
      'member_name',           COALESCE(NULLIF(btrim(p.full_name), ''), p.email, 'Unnamed'),
      'from_cohort_id',        p_from_cohort_id,
      'to_cohort_id',          p_to_cohort_id,
      'from_batch_name',       v_from_name,
      'to_batch_name',         v_to_name,
      'min_viable_batch_size', v_min,
      'audit_backfilled',      true)
  FROM public.cohort_memberships m
  JOIN public.profiles p ON p.id = m.member_ref
  WHERE m.id = ANY (v_verified)
    AND NOT EXISTS (
      SELECT 1 FROM public.cohort_status_events e
      WHERE e.membership_id = m.id
        AND e.event_type = 'soi.batch_merge.moved'
        AND e.metadata ->> 'merge_run_id' = p_run_id::text
    )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_backfilled = ROW_COUNT;

  -- ── 4c. Tell them. A move nobody was told about is the thing this whole file
  -- exists to avoid, so this is not optional and not best-effort.
  IF COALESCE(array_length(v_targets, 1), 0) > 0 THEN
    v_key := 'soi.batch_merge:' || p_run_id::text;

    SELECT n.id INTO v_note
    FROM public.notifications n
    WHERE n.idempotency_key = v_key
    LIMIT 1;

    IF v_note IS NULL THEN
      -- notifications.created_by is NOT NULL. This function is only ever called
      -- by a signed-in coordinator, so auth.uid() is the right author; the
      -- fallback exists so a NULL can never turn a notified move into a silent one.
      v_actor := auth.uid();
      IF v_actor IS NULL THEN
        SELECT id INTO v_actor FROM public.profiles
         WHERE is_super_admin = true ORDER BY created_at NULLS LAST LIMIT 1;
      END IF;
      IF v_actor IS NULL THEN
        v_actor := v_targets[1];
      END IF;

      INSERT INTO public.notifications
        (title, body, url, icon, priority, category, kind, idempotency_key,
         targeting, created_by, created_at, updated_at)
      VALUES (
        CASE WHEN v_undo
          THEN 'You are back in ' || v_to_name
          ELSE 'Your School of Influence batch has changed'
        END,
        CASE WHEN v_undo
          THEN 'Your programme coordinator has moved you back from ' || v_from_name || ' to '
               || v_to_name || '. Your sessions, your dates and your attendance record are unchanged — every batch of this programme attends the same sessions.'
          ELSE 'You were in ' || v_from_name || ' and you are now in ' || v_to_name || '. '
               || v_from_name || ' had fewer than ' || v_min
               || ' people taking part, which is too few to run a session for, so it has been folded into '
               || v_to_name || '. Your sessions, your dates and your attendance record are unchanged — every batch of this programme attends the same sessions. If this does not work for you, tell your programme coordinator and they can move you back.'
        END,
        '/startup-studio/school-of-influence',
        'Users',
        'normal',
        'general',
        'announcement',
        v_key,
        jsonb_build_object('type', 'user', 'user_ids', to_jsonb(v_targets)),
        v_actor,
        now(), now()
      )
      RETURNING id INTO v_note;
    END IF;

    -- THE WRITE THAT ACTUALLY DELIVERS. A notifications row on its own reaches
    -- nobody's bell, because nothing fans out targeting.
    INSERT INTO public.user_notifications (notification_id, user_id, created_at)
    SELECT v_note, t, now() FROM unnest(v_targets) AS t
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_notified = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok',                  true,
    'undo',                v_undo,
    'merge_run_id',        p_run_id,
    'from_cohort_id',      p_from_cohort_id,
    'to_cohort_id',        p_to_cohort_id,
    'moved_count',         v_moved,
    'receipts_written',    v_receipts,
    'audit_backfilled',    v_backfilled,
    'notified',            v_notified,
    'unverified_membership_ids', to_jsonb(v_unverified),
    'min_viable_batch_size', v_min);
END;
$$;

COMMENT ON FUNCTION public.fn_soi_record_batch_merge(uuid, uuid, uuid, uuid[], boolean) IS
  'School of Influence: record a confirmed batch fold (or its undo) and tell the '
  'people it moved. Writes two cohort_status_events receipts, backfills any '
  'per-person row the spine failed to write, and sends one notification to '
  'everybody moved. MOVES NOBODY — the transfers go through '
  'CohortService.transferMembership.';

REVOKE EXECUTE ON FUNCTION public.fn_soi_record_batch_merge(uuid, uuid, uuid, uuid[], boolean)
  FROM anon, PUBLIC;
-- Granted to authenticated on purpose: the caller is the coordinator who pressed
-- Confirm, and the function re-checks cohort.manage on BOTH batches before it
-- writes a single row.
GRANT  EXECUTE ON FUNCTION public.fn_soi_record_batch_merge(uuid, uuid, uuid, uuid[], boolean)
  TO authenticated;

-- ── 5. Idempotency and read cost ────────────────────────────────────────────
-- One row per target per merge run: a retry after a network failure, and the
-- backfill above, cannot write the same receipt twice. Both index expressions are
-- IMMUTABLE.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_soi_batch_merge_run
  ON public.cohort_status_events (
    event_type,
    (COALESCE(membership_id, cohort_id)),
    ((metadata ->> 'merge_run_id'))
  )
  WHERE event_type IN (
    'soi.batch_merge',
    'soi.batch_merge.received',
    'soi.batch_merge.moved',
    'soi.batch_merge.undone',
    'soi.batch_merge.undo_received'
  );

-- The merge history screen reads these rows straight from cohort_status_events
-- under the spine's own RLS (cohort_status_events_select_permission,
-- 20260731040000), so no new function and no widened policy. This keeps that read
-- cheap as the log grows.
CREATE INDEX IF NOT EXISTS idx_cohort_status_events_soi_batch_merge
  ON public.cohort_status_events (cohort_id, event_type, created_at DESC)
  WHERE event_type LIKE 'soi.batch_merge%';


-- ── 6. Apply-time asserts on the END STATE ──────────────────────────────────
-- Existence is checked BEFORE any privilege probe: has_function_privilege raises
-- on a missing object rather than returning false
-- (ref feedback_privilege_checks_raise_on_missing_object).
DO $assert$
DECLARE
  v_min integer;
BEGIN
  IF to_regprocedure('public.fn_soi_min_viable_batch_size(uuid)') IS NULL
     OR to_regprocedure('public.fn_soi_merge_plan(uuid, uuid[])') IS NULL
     OR to_regprocedure('public.fn_soi_record_batch_merge(uuid, uuid, uuid, uuid[], boolean)') IS NULL THEN
    RAISE EXCEPTION 'assert failed: one of the three School of Influence batch-merge functions was not created.';
  END IF;

  -- Role existence first, for the same reason: has_function_privilege raises on
  -- an unknown role, and a bare Postgres has neither Supabase role.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND (has_function_privilege('anon', 'public.fn_soi_min_viable_batch_size(uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_soi_merge_plan(uuid, uuid[])', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_soi_record_batch_merge(uuid, uuid, uuid, uuid[], boolean)', 'EXECUTE')) THEN
    RAISE EXCEPTION 'assert failed: anon holds EXECUTE on a School of Influence batch-merge function.';
  END IF;

  -- The threshold reader carries no permission check of its own, so a signed-in
  -- caller holding EXECUTE could read another programme's configured threshold
  -- directly. Only the guarded plan and the guarded recorder may reach it, and
  -- both do so as the definer without needing a grant.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     AND has_function_privilege('authenticated', 'public.fn_soi_min_viable_batch_size(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'assert failed: the unguarded minimum-batch-size reader is reachable by any signed-in caller.';
  END IF;

  -- The other half of the same question, and the one a revoke-everything reflex
  -- gets wrong: the two caller-facing functions must still be REACHABLE, or the
  -- screen renders a permission error for everybody and the feature ships dark.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     AND NOT (has_function_privilege('authenticated', 'public.fn_soi_merge_plan(uuid, uuid[])', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.fn_soi_record_batch_merge(uuid, uuid, uuid, uuid[], boolean)', 'EXECUTE')) THEN
    RAISE EXCEPTION 'assert failed: a signed-in coordinator cannot reach the merge plan or the merge recorder, so the screen would refuse everybody.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.platform_policies p
    WHERE p.policy_key = 'soi.min_viable_batch_size'
      AND p.scope_type = 'cohort'
      AND p.scope_id IS NULL
      AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'assert failed: the soi.min_viable_batch_size policy row is missing, so the threshold would come from the code fallback alone.';
  END IF;

  -- Reported, never enforced: the apply must not fail because a coordinator has
  -- since tuned the row. It only makes the effective value visible in the apply
  -- log, which is where a reviewer confirms the number on the day.
  v_min := COALESCE(public.fn_get_policy_int('soi.min_viable_batch_size', 8, NULL), 8);
  RAISE NOTICE 'School of Influence batch merge applied. soi.min_viable_batch_size (programme-wide) = %. No batch is folded without a coordinator confirming it.', v_min;
END
$assert$;

NOTIFY pgrst, 'reload schema';

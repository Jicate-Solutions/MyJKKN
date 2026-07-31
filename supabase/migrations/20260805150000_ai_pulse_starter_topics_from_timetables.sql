-- =====================================================================
-- AI Pulse — Domain Starter: candidate topics come from what is TAUGHT,
-- never from who checked in. (Director decisions #3, #4, #5, #6, #7, #12
-- — specs/ai-pulse-starter-and-board-decisions-2026-07-30.md)
-- Created: 2026-07-30. NOT APPLIED — file only, Director-gated apply.
-- =====================================================================
--
-- THE DEFECT THIS CLOSES (root-caused live on prod 2026-07-30)
--   fn_ai_pulse_domain_starter_candidates derived its topics from
--   ai_pulse_live_attendance for THAT cycle — i.e. from learners who had
--   already checked in to the evening session. The generation cron fires at
--   09:00 UTC. Measured on cycle 53a9eb29 (2026-07-30): 285 check-ins exist
--   now, but exactly 0 of them existed before 09:00 UTC — the first was
--   13:10:06 UTC, four hours and ten minutes after the cron. With nobody
--   checked in, the '>= min_learners' floor yielded zero topics and the run
--   enqueued nothing. Of 8 AI Pulse cycles ever run, only 2 produced any
--   starters at all. This recurred every week.
--
-- WHAT THIS FILE CHANGES — ONLY how candidate topics are chosen. (Two app-side
--   changes ship alongside it in the same PR and are NOT in this file: the cron
--   route reports `remaining` instead of truncating silently, and vercel.json
--   re-cadences generation to Sat/Sun/Mon/Tue 09:08 UTC per decision #12.)
--   The prompt-authoring, the ₹0 Max-lane job path, the pack shape
--   ({en:{build,skill,career}, ta:{...}}), the dedupe key, the prior-cycle
--   improvement hint and its auto-revert branch are all preserved verbatim:
--   the CASE ... prior_context block below is copied byte-for-byte from the
--   LIVE definition (pg_get_functiondef, md5 790099e503eba1e5ddd3e93f333c600a),
--   not from any repo file. Column shape is unchanged, so the cron route needs
--   no reshaping.
--
-- 1. TAUGHT, NOT ATTENDED (decision #3). Candidates are enumerated from the
--    academic offer — ACTIVE programmes — and prioritised by whether an ACTIVE
--    class timetable is scheduled against them. Nothing reads attendance.
--
-- 2. GRAIN = PROGRAMME, ALL INSTITUTIONS (decision #4). Measured live:
--    120 active programmes across 11 institutions, versus 3,833 active
--    courses (64x over capacity) and 44 programmes inside the 5 rotation
--    colleges. Programme is the decided unit, and it is deliberately NOT
--    restricted to rotation colleges (decision #7): the ~2,049 learners in
--    Arts & Science Self (760), Matric (552), Arts & Science Aided (511) and
--    CBSE (225) receive a prompt even though they have no session, team or
--    leaderboard place.
--
-- 3. THE >= min_learners FLOOR NO LONGER EXCLUDES — IT PRIORITISES.
--    The old floor existed for "relevance + privacy" of an ATTENDANCE cohort,
--    where a group of 1 could identify a person. A programme is public
--    catalogue data, so no such disclosure exists. Keeping it as an exclusion
--    would silently drop 44 of the 120 programmes (measured: only 76 have >=1
--    active enrolled learner; JKKN College of Education has 12 active
--    programmes and 0 enrolled learners, which is a data gap, not an empty
--    college) — re-creating the exact "produces nothing" fault this migration
--    exists to close, and dropping a whole institution without saying so.
--    p_min_learners is therefore a PRIORITY tier in ORDER BY: programmes at or
--    above the floor are served first, and nothing is ever dropped in silence.
--    learner_count now counts REAL ENROLMENT (learners_profiles, active
--    lifecycle) instead of attendees.
--
-- 4. CARRY-OVER (decision #5). The route holds a hard CAP = 60 per run and
--    there are ~121 candidates, so a run cannot serve them all. Topics that
--    ALREADY hold a starter for this cycle are excluded outright, so each run
--    naturally continues where the last stopped and `remaining` in the route's
--    response is exactly "how many are still waiting".
--    EXCLUDED rather than merely SORTED LAST, deliberately: the lane's dedupe
--    key is an IN-FLIGHT guard only (queued/claimed/running — see
--    lib/services/platform/ai-jobs-lane.ts), NOT an "already done" guard, so a third
--    run over a sorted-but-included list would re-enqueue served topics and
--    fn_ai_pulse_record_domain_starter would UPSERT over prompts learners may
--    already have copied. Exclusion is the same intent, safely.
--
-- 5. GENERAL FALLBACK (decision #6). No learner sees an empty card. ONE extra
--    candidate per cycle carries topic_type = 'general' on a sentinel
--    topic_id (the nil UUID — verified to collide with no programme and no
--    course on prod). It is a REAL generated row like any other, so the
--    fallback prompt is authored by the same loop, in both languages, with no
--    prompt text hardcoded in SQL and no new table. It sorts FIRST every
--    cycle so the safety net is always generated in the first run.
--    fn_ai_pulse_my_domain_starters returns it ONLY when the learner's own
--    topics have no starter; programme/course prompts always win.
--
-- Tamil stays UNREVIEWED (Director, 2026-07-23) — no gate is reintroduced here.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Allow the 'general' topic_type.
--    Live CHECK (verified via pg_constraint) was
--    CHECK ((topic_type = ANY (ARRAY['course'::text, 'programme'::text]))).
--    Widened only — 'course' and 'programme' remain exactly as they were.
--    DROP and ADD are subcommands of ONE ALTER TABLE, deliberately: as two
--    statements, an apply that died between them would leave the table with no
--    topic_type CHECK at all. A single ALTER TABLE is atomic without needing
--    transaction control keywords in the file (a standalone COMMIT; here would
--    turn any BEGIN..ROLLBACK rehearsal into a live apply).
-- ---------------------------------------------------------------------
ALTER TABLE public.ai_pulse_domain_starters
  DROP CONSTRAINT IF EXISTS ai_pulse_domain_starters_topic_type_check,
  ADD  CONSTRAINT ai_pulse_domain_starters_topic_type_check
       CHECK ((topic_type = ANY (ARRAY['course'::text, 'programme'::text, 'general'::text])));

-- ---------------------------------------------------------------------
-- 2. Candidate topics: active programmes + the general safety net.
--    Same RETURNS TABLE shape the cron route already consumes.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_domain_starter_candidates(
  p_cycle_id uuid,
  p_min_learners integer DEFAULT 3
)
RETURNS TABLE(topic_type text, topic_id uuid, topic_label text, institution_id uuid, learner_count integer, prior_context jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_autorevert boolean;
  v_margin numeric;
BEGIN
  -- Dark-by-default toggle + noise margin (config rows above).
  SELECT COALESCE((value_jsonb)::boolean, false) INTO v_autorevert
  FROM ai_pulse_policies
  WHERE config_key = 'domain_starter_autorevert_enabled' AND is_active
  LIMIT 1;
  v_autorevert := COALESCE(v_autorevert, false);

  SELECT COALESCE((value_jsonb)::numeric, 0.05) INTO v_margin
  FROM ai_pulse_policies
  WHERE config_key = 'domain_starter_revert_margin' AND is_active
  LIMIT 1;
  v_margin := COALESCE(v_margin, 0.05);

  RETURN QUERY
  WITH taught AS (
    -- Decision #3: what is being TAUGHT this term, read from the class
    -- timetable. Used to prioritise, never to exclude — only 51 of the 120
    -- active programmes currently carry an active timetable, and the two
    -- schools carry almost none, so filtering on it would drop them.
    SELECT DISTINCT s.program_id AS program_id
    FROM timetables t
    JOIN sections s ON s.id = t.section_id
    WHERE t.is_active AND s.program_id IS NOT NULL
  ),
  enrolled AS (
    -- learner_count from REAL ENROLMENT, not from who turned up.
    SELECT l.program_id AS program_id, count(*)::int AS n
    FROM learners_profiles l
    WHERE l.lifecycle_status = 'active' AND l.program_id IS NOT NULL
    GROUP BY l.program_id
  ),
  grouped AS (
    -- (a) The ONE general all-subject topic (decision #6). ord_kind = 0 keeps
    --     it first, so the safety net is authored in the very first run.
    SELECT 'general'::text AS topic_type,
           '00000000-0000-0000-0000-000000000000'::uuid AS topic_id,
           'Any subject — works for every programme'::text AS topic_label,
           NULL::uuid AS institution_id,
           (SELECT count(*)::int FROM learners_profiles l2
             WHERE l2.lifecycle_status = 'active') AS learner_count,
           0 AS ord_kind,
           true AS is_taught
    UNION ALL
    -- (b) Every ACTIVE programme, every institution (decisions #4 + #7).
    SELECT 'programme'::text,
           pr.id,
           pr.program_name,
           pr.institution_id,
           COALESCE(e.n, 0),
           1,
           (tt.program_id IS NOT NULL)
    FROM programs pr
    LEFT JOIN enrolled     e  ON e.program_id   = pr.id
    LEFT JOIN taught       tt ON tt.program_id  = pr.id
    LEFT JOIN institutions i  ON i.id           = pr.institution_id
    -- An archived institution must not keep generating prompts (its prior
    -- prompt text rides along in prior_context). LEFT JOIN + COALESCE(...,true)
    -- on purpose: only an EXPLICITLY inactive institution excludes a programme.
    -- An INNER JOIN would silently drop any programme whose institution_id is
    -- NULL or dangling — the same invisible truncation this migration exists to
    -- end. Measured on prod: 14 institutions, 0 inactive, 0 with a NULL flag,
    -- 0 active programmes without an institution, so this drops nothing today.
    WHERE pr.is_active AND COALESCE(i.is_active, true)
  )
  SELECT g.topic_type, g.topic_id, g.topic_label, g.institution_id, g.learner_count,
    CASE
      -- AUTO-REVERT ON: seed from best-by-copy-rate; revert flag when latest regressed.
      WHEN v_autorevert THEN
        COALESCE((
          SELECT jsonb_build_object(
            'prior_cycle_id', CASE WHEN rev THEN best_cycle_id ELSE last_cycle_id END,
            'prior_prompt',   CASE WHEN rev THEN best_prompt   ELSE last_prompt   END,
            'prior_views',    CASE WHEN rev THEN best_views    ELSE last_views    END,
            'prior_copies',   CASE WHEN rev THEN best_copies   ELSE last_copies   END,
            'prior_lift',     CASE WHEN rev THEN best_lift     ELSE last_lift     END,
            'reverted',       rev,
            'best_copy_rate', best_copy_rate,
            'last_copy_rate', last_copy_rate
          )
          FROM (
            SELECT
              lp.cycle_id          AS last_cycle_id,
              lp.final_prompt      AS last_prompt,
              lp.views             AS last_views,
              lp.copies            AS last_copies,
              lp.dept_outcome_lift AS last_lift,
              lp.copy_rate         AS last_copy_rate,
              bp.cycle_id          AS best_cycle_id,
              bp.final_prompt      AS best_prompt,
              bp.views             AS best_views,
              bp.copies            AS best_copies,
              bp.dept_outcome_lift AS best_lift,
              bp.copy_rate         AS best_copy_rate,
              (bp.cycle_id IS NOT NULL
                 AND bp.cycle_id IS DISTINCT FROM lp.cycle_id
                 AND bp.copy_rate > COALESCE(lp.copy_rate, 0) + v_margin) AS rev
            FROM
              -- latest prior version for this topic (unchanged legacy seed)
              (SELECT d.cycle_id, d.final_prompt, d.views, d.copies, d.dept_outcome_lift,
                      (d.copies::numeric / NULLIF(d.learner_count, 0)) AS copy_rate
               FROM ai_pulse_domain_starters d
               WHERE d.topic_type = g.topic_type AND d.topic_id = g.topic_id
                 AND d.cycle_id <> p_cycle_id
               ORDER BY d.created_at DESC
               LIMIT 1) lp
              -- best prior version by copy-rate (only versions with real usage signal)
              LEFT JOIN LATERAL
              (SELECT d.cycle_id, d.final_prompt, d.views, d.copies, d.dept_outcome_lift,
                      (d.copies::numeric / NULLIF(d.learner_count, 0)) AS copy_rate
               FROM ai_pulse_domain_starters d
               WHERE d.topic_type = g.topic_type AND d.topic_id = g.topic_id
                 AND d.cycle_id <> p_cycle_id
                 AND d.final_prompt IS NOT NULL
                 AND d.learner_count > 0
                 AND d.copies IS NOT NULL
               ORDER BY (d.copies::numeric / NULLIF(d.learner_count, 0)) DESC NULLS LAST,
                        d.created_at DESC
               LIMIT 1) bp ON true
          ) prior_pick
        ), '{}'::jsonb)
      -- AUTO-REVERT OFF (default): most-recent prior, byte-identical to legacy.
      ELSE
        COALESCE((
          SELECT jsonb_build_object(
                   'prior_cycle_id', d.cycle_id,
                   'prior_prompt',   d.final_prompt,
                   'prior_views',    d.views,
                   'prior_copies',   d.copies,
                   'prior_lift',     d.dept_outcome_lift)
          FROM ai_pulse_domain_starters d
          WHERE d.topic_type = g.topic_type AND d.topic_id = g.topic_id
            AND d.cycle_id <> p_cycle_id
          ORDER BY d.created_at DESC LIMIT 1
        ), '{}'::jsonb)
    END AS prior_context
  FROM grouped g
  -- CARRY-OVER (decision #5): a topic that already holds a starter for THIS
  -- cycle is done. Each run therefore continues where the previous one
  -- stopped, with no extra state to keep.
  -- `final_prompt IS NOT NULL` is load-bearing, not decoration: it is the SAME
  -- predicate fn_ai_pulse_my_domain_starters uses to decide a learner has a
  -- prompt. Keying on row existence alone would let a recorded-but-empty row
  -- count as served here while still counting as unserved to the learner —
  -- stranding that programme on the general fallback for the whole cycle with
  -- nothing ever retrying it. (0 such rows on prod today; this stops the two
  -- predicates drifting apart later.)
  WHERE NOT EXISTS (
    SELECT 1 FROM ai_pulse_domain_starters d0
    WHERE d0.cycle_id     = p_cycle_id
      AND d0.topic_type   = g.topic_type
      AND d0.topic_id     = g.topic_id
      AND d0.final_prompt IS NOT NULL
  )
  ORDER BY
    g.ord_kind,                                                   -- general safety net first
    (g.learner_count >= COALESCE(p_min_learners, 0)) DESC,        -- floor = priority, not exclusion
    g.is_taught DESC,                                             -- programmes with live classes next
    g.learner_count DESC,                                         -- biggest programmes before smallest
    g.topic_label;                                                -- stable, reproducible tail
END; $function$;

-- Live ACL is {postgres, service_role} — this is a cron/service-role read that
-- exposes every programme plus prior prompt text, so `authenticated` is
-- deliberately NOT granted (granting it here would WIDEN live access).
-- CREATE OR REPLACE preserves the existing ACL, but the revoke is re-asserted
-- because Supabase's default privileges hand `anon` EXECUTE on new functions.
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_domain_starter_candidates(uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_domain_starter_candidates(uuid, integer) TO service_role;

COMMENT ON FUNCTION public.fn_ai_pulse_domain_starter_candidates(uuid, integer) IS
  'AI Pulse starter candidates: ACTIVE programmes (all institutions) + one general fallback topic, ordered so unserved topics carry over between capped runs. Reads the academic offer and class timetables, never attendance (Director decisions #3-#7, 2026-07-30).';

-- ---------------------------------------------------------------------
-- 3. Learner read: fall back to the general prompt (decision #6).
--    Replaced from the LIVE definition (md5 052ca151c6724e3bdf611d9a385cb7e5);
--    the dark gate, the learner resolution, the removed Tamil gate and the
--    course-beats-programme rule are preserved exactly.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_my_domain_starters(p_cycle_id uuid)
RETURNS TABLE(starter_id uuid, topic_type text, topic_label text, final_prompt text, prompt_pack jsonb, tamil_available boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_learner uuid;
BEGIN
  -- DARK gate: invisible to learners until the kill switch is on.
  IF NOT COALESCE((SELECT (value_jsonb#>>'{}')::boolean FROM ai_pulse_policies
                   WHERE config_key = 'domain_starter_enabled' AND is_active), false) THEN
    RETURN;
  END IF;

  SELECT learner_id INTO v_learner FROM profiles WHERE id = auth.uid();
  IF v_learner IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH mine AS (
    SELECT d.id, d.topic_type, d.topic_label, d.final_prompt, d.prompt_pack
    FROM public.fn_ai_pulse_learner_topics(v_learner) t
    JOIN ai_pulse_domain_starters d
      ON d.topic_type = t.topic_type AND d.topic_id = t.topic_id AND d.cycle_id = p_cycle_id
    WHERE d.final_prompt IS NOT NULL
  ),
  -- Decision #6: a learner whose own subject has no prompt this cycle sees the
  -- general all-subject prompt rather than an empty card. Never additive — it
  -- appears ONLY when `mine` is empty, so a subject-specific prompt always wins.
  general_fallback AS (
    SELECT d.id, d.topic_type, d.topic_label, d.final_prompt, d.prompt_pack
    FROM ai_pulse_domain_starters d
    WHERE d.cycle_id = p_cycle_id
      AND d.topic_type = 'general'
      AND d.final_prompt IS NOT NULL
    ORDER BY d.created_at DESC
    LIMIT 1
  ),
  picked AS (
    SELECT * FROM mine
    UNION ALL
    SELECT * FROM general_fallback WHERE NOT EXISTS (SELECT 1 FROM mine)
  )
  -- Tamil review gate REMOVED (Director, 2026-07-23). Tamil shows whenever the
  -- pack has a 'ta' block; the loop's own signals correct any bad Tamil.
  SELECT m.id, m.topic_type, m.topic_label, m.final_prompt,
         m.prompt_pack,
         (m.prompt_pack ? 'ta') AS tamil_available
  FROM picked m
  WHERE m.topic_type = 'course'                                          -- finest grain: course prompt
     OR NOT EXISTS (SELECT 1 FROM picked m2 WHERE m2.topic_type = 'course'); -- else programme / general fallback
END; $function$;

-- Live ACL is {postgres, authenticated, service_role} — preserved exactly; the
-- anon revoke is re-asserted against Supabase's default function grant.
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_my_domain_starters(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_my_domain_starters(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_my_domain_starters(uuid) TO service_role;

COMMENT ON FUNCTION public.fn_ai_pulse_my_domain_starters(uuid) IS
  'AI Pulse learner read: this cycle''s starter pack for the learner''s own course/programme, falling back to the cycle general prompt when their subject has none (Director decision #6, 2026-07-30).';

-- ---------------------------------------------------------------------
-- 4. Keep the new 'general' row OUT of the loop's own A/B verdict, and stop
--    dropping zero-enrolment programmes in silence.
--    Replaced from the LIVE definition (pg_get_functiondef md5
--    ab46816e438ce5fd6e170d83eab7518b); the cycle resolution, the unweighted
--    avg, the is_control split and the rounding are all preserved exactly.
--
--    WHY: fn_ai_pulse_control_vs_tuned averages copies/learner_count UNWEIGHTED
--    over rows WHERE learner_count > 0, split by is_control. The general row
--    carries learner_count = every active learner (4,342 on prod) but
--    fn_ai_pulse_my_domain_starters shows it ONLY to learners whose own
--    programme has no starter — so its denominator overstates its real audience
--    60-100x and it is guaranteed to be a near-zero copy-rate outlier. In an
--    unweighted mean one such row moves the whole cohort average, and
--    isControlTopic() is a hash of (topic_id | cycle_id), so roughly one cycle
--    in ten it lands in the CONTROL arm and deflates the control average —
--    INFLATING the reported tuning lift. Excluding it by topic_type is the
--    explicit fix; relying on the denominator accident is not a fix.
--    (The route also no longer marks a general row is_control at all, so the
--    fallback keeps its improvement hint. This exclusion is the guarantee.)
--
--    AND: `learner_count > 0` silently dropped the 44 active programmes with no
--    enrolled learners — the same invisible-exclusion class this migration
--    exists to end. They still cannot be averaged (copy_rate divides by
--    learner_count), but the count is now RETURNED instead of vanishing.
--
--    DROP + CREATE, not CREATE OR REPLACE: the RETURNS TABLE shape gains two
--    columns. Verified on prod before writing — no view and no other function
--    references this function, and the repo's only mentions are a comment in
--    the cron route and its own origin migration, so nothing breaks. Live ACL
--    {postgres, authenticated, service_role} is re-asserted below.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_ai_pulse_control_vs_tuned(uuid);

CREATE OR REPLACE FUNCTION public.fn_ai_pulse_control_vs_tuned(p_cycle_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(cycle_id uuid, tuned_n integer, tuned_avg_copy_rate numeric,
              control_n integer, control_avg_copy_rate numeric, tuning_lift numeric,
              excluded_general integer, excluded_no_learners integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH c AS (
    SELECT COALESCE(p_cycle_id,
      (SELECT d.cycle_id FROM ai_pulse_domain_starters d ORDER BY d.created_at DESC LIMIT 1)) AS cid
  ),
  scope AS (
    -- every starter in the cycle, before any exclusion — so the exclusions can
    -- be counted instead of disappearing.
    SELECT d.is_control, d.topic_type, d.learner_count,
           d.copies::numeric / NULLIF(d.learner_count, 0) AS copy_rate
    FROM ai_pulse_domain_starters d, c
    WHERE d.cycle_id = c.cid
  ),
  base AS (
    SELECT s.is_control, s.copy_rate FROM scope s
    WHERE s.topic_type <> 'general'   -- the fallback row is not in the experiment
      AND s.learner_count > 0
  )
  SELECT (SELECT cid FROM c),
    count(*) FILTER (WHERE NOT is_control)::int,
    round(avg(copy_rate) FILTER (WHERE NOT is_control), 4),
    count(*) FILTER (WHERE is_control)::int,
    round(avg(copy_rate) FILTER (WHERE is_control), 4),
    round(COALESCE(avg(copy_rate) FILTER (WHERE NOT is_control),0)
        - COALESCE(avg(copy_rate) FILTER (WHERE is_control),0), 4),
    (SELECT count(*) FROM scope s WHERE s.topic_type = 'general')::int,
    (SELECT count(*) FROM scope s WHERE s.topic_type <> 'general'
                                    AND COALESCE(s.learner_count, 0) = 0)::int
  FROM base;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_control_vs_tuned(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_control_vs_tuned(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_control_vs_tuned(uuid) TO service_role;

COMMENT ON FUNCTION public.fn_ai_pulse_control_vs_tuned(uuid) IS
  'AI Pulse starter A/B: tuned-vs-control avg copy rate for a cycle. Excludes the topic_type=''general'' fallback (its learner_count is every active learner, so it would be a guaranteed near-zero outlier able to inflate the reported lift) and RETURNS the count of rows excluded for zero enrolment rather than dropping them silently.';

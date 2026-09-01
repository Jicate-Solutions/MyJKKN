-- ============================================================================
-- Fresher Induction — a learner is judged on sittings that have not happened yet
-- File: 20261018000000_induction_completion_basis_and_mentoring_track.sql
-- Date: 2026-09-01
--
-- THE DEFECT. fn_induction_recompute_completion derives a fresher's completion
-- from ONE denominator:
--
--     count(DISTINCT s.id) AS total
--     FROM induction_enrollment e
--     LEFT JOIN event_sessions s ON s.event_id = e.event_id
--                               AND (s.batch_id IS NULL OR s.batch_id = e.batch_id)
--
-- There is no date filter and no session-kind filter on that join. `total` is
-- every sitting the programme will EVER hold, and it feeds BOTH limbs —
-- participation_complete (attendance) and outcome_complete (attendance OR
-- feedback) — which is why one wrong denominator moves two verdicts.
--
-- So a fresher is scored today against sittings scheduled for next month, next
-- term, and in the Arts & Science programme's case for MAY 2027. There is no
-- reading under which a sitting that has not occurred is evidence about a
-- learner. It is not a strict bar; it is a bar measured against a future that
-- has not happened.
--
-- MEASURED ON PRODUCTION, 2026-09-01, BEFORE this migration:
--
--   programme                                   denominator      complete
--                                               now -> after     now -> after
--   Fresher Induction 2026 (Arts & Science)      30 -> 20        216 -> 401
--   Fresher Induction - 2026 - Pharmacy          25 -> 18         51 ->  82
--   Fresher Induction - 2026 - Allied Health     28 -> 22         25 ->  34
--   Fresher Induction program - 2026             13 -> 12         41 ->  44
--   Fresher Induction 2026 - Engineering         19 -> 19        151 -> 151
--                                                                ---------
--                                                       net      +228 freshers
--
-- Engineering is unchanged, and that is the control: it has no future sittings
-- and no mentor check-ins, so a correct fix must leave it exactly where it is.
-- Every other programme moves because it holds sittings that have not run.
--
-- THE DIRECTOR'S RULING (2026-09-01) HAS TWO PARTS, and this migration
-- implements both, because the number above has two different causes inside it.
--
--   (a) Count only sittings that have already begun.
--   (b) The year-long mentoring track gets its OWN completion basis, separate
--       from induction.
--
-- WHY (b) IS NOT REDUNDANT WITH (a). 16 of those future sittings are Senior
-- Peer Mentor monthly check-ins (event_sessions.kind = 'mentor_checkin', added
-- by 20260710130000) — 10 on Arts & Science, 6 on Allied Health, running to
-- 2027-05-15. Part (a) alone would drop them from the denominator TODAY simply
-- because they are in the future, and then quietly put them back one by one as
-- each month's check-in comes due — re-creating the same defect in slow motion,
-- because a fresher's INDUCTION verdict would start depending on whether they
-- turned up to a mentoring meeting nine months later. The mentoring track is a
-- year-long relationship, not a week of induction talks. It is measured here as
-- its own thing, on its own row columns, against its own configurable bar.
--
-- 'registration' sittings (kind = 'registration', 20260827030000) are NOT
-- affected: they are ordinary induction sittings that happen to be typed, they
-- have already occurred, and they keep counting exactly as they do today.
--
-- NULL start_at — the decision, stated rather than inherited. event_sessions
-- .start_at is TIMESTAMPTZ NOT NULL (20260417000003), so there is no such row
-- on production today and this branch changes no live number. It is written
-- explicitly as `s.start_at IS NOT NULL AND s.start_at <= now()` anyway, and
-- the decision is: an undated sitting is EXCLUDED — never counted as having
-- happened. Two reasons. First it is the faithful reading of the ruling: a
-- sitting with no time carries no evidence that it occurred. Second, the
-- explicit IS NOT NULL is a guard against a later editor "simplifying" the
-- predicate to `NOT (s.start_at > now())`, which under three-valued logic would
-- flip a NULL from excluded to INCLUDED and silently restore the bug for
-- exactly the rows least able to justify themselves.
--
-- NOTHING IS DELETED. Deleting the mentor check-in sittings was proposed and
-- retracted; the mentoring programme's own record has to survive, which is the
-- whole point of giving it a basis instead of a grave. No feedback row, no
-- attendance row and no sitting is removed by this migration.
--
-- TWO FUNCTIONS CHANGE, NOT ONE. fn_induction_completion_on_feedback() does not
-- call the recompute path — it carries a SECOND, independently-maintained copy
-- of the same denominator CTE (see induction_multipath_completion_option2.sql).
-- It is monotonic, so leaving it alone would not demote anyone; it would just
-- fail to PROMOTE the freshers this fix exists for, on every subsequent
-- feedback write, with no error anywhere. Both copies are corrected here.
--
-- PROVEN AGAINST PRODUCTION, 2026-09-01, by transaction-and-rollback. Applied
-- inside a transaction, all five programmes recomputed as the Director, EVERY
-- learner's outcome_complete compared before and after, transaction rolled
-- back. Production was not modified.
--
-- BOTH SIDES FRESHLY RECOMPUTED, so staleness is not a variable on either:
--
--   programme          no migration   with this change   attributable
--   Arts & Science          222             404              +182
--   Pharmacy                 51              82               +31
--   Allied Health            25              34                +9
--   Nursing                  44              44                 0   <- control
--   Engineering             151             151                 0   <- control
--                          ----            ----             ------
--                           493             715              +222
--
--   222 learners gained. ZERO withdrawn.
--
-- TWO CONTROLS HELD, and they are what make the other three columns mean
-- anything. Engineering has no future sittings and no mentor check-ins, so
-- there is nothing here for this change to correct and it must come back
-- untouched; Nursing proved to be a second control once measured properly. A
-- change that MOVED either one would be a blanket loosening of the completion
-- bar wearing the costume of a targeted fix, and the +222 would be worthless.
--
-- ZERO WITHDRAWN was worth verifying rather than assuming, because this
-- function OVERWRITES outcome_complete and is not monotonic: dropping sittings
-- that have not happened removes them from the NUMERATOR too, so completion
-- built on ratings of unhappened sittings is taken back. A first pass did show
-- LOST=1, an Engineering learner falling off exactly the 75 bar (20->19
-- sittings, 15->14 attended, 75.00 -> 73.68). The control disposes of it:
-- recomputing with the CURRENT function and NO migration gives the identical
-- result, same learner. It is a stale stored row, not this change.
--
-- SEPARATE PRE-EXISTING DEFECT, NOT FIXED HERE. induction_completion is a
-- stored snapshot refreshed only when something calls a recompute; nothing
-- refreshes it on a schedule. Arts & Science was last recomputed 2026-08-26
-- against 30 sittings and 43 now exist; Engineering on 2026-08-31 against 20
-- when 19 exist. One Engineering learner is presently recorded complete against
-- a sitting that no longer exists. That is a refresh-CADENCE problem, not a
-- denominator problem — the stored rows are stale against ANY definition, and
-- correcting the definition does not make a snapshot current. Fixing it means
-- deciding who recomputes and how often, which is its own change and its own
-- decision. Named here so it is never mistaken for something this migration
-- introduced, or quietly fixed.
--
-- An earlier reading of +228, and then +221, compared a fresh recompute against
-- the STORED baseline. That mixes this change together with days of
-- un-recomputed drift and credits all of it here. Both are superseded by the
-- fresh-against-fresh +222 above.
--
-- This proof matters more than usual: the repo has no job that applies a
-- migration to a scratch database before running tests, so the guard tests that
-- ship alongside this file read SQL off disk and cannot execute any of it.
--
-- Both bodies below are the LIVE definitions with ONLY the marked lines
-- changed. Every authorization branch, every grant and the referral limb are
-- preserved byte-for-byte.
-- ============================================================================

-- ── 1. The mentoring track's own bar (config, not a constant) ───────────────
-- Mirrors exactly how completion_feedback_pct was introduced by
-- induction_multipath_completion_option2.sql: a per-programme, re-tunable
-- integer with the same 75 default. It defaults to the same value the other two
-- bars carry, so day-one behaviour is identical and the number is the ONLY
-- thing that has to be argued about later. Sharing completion_attendance_pct
-- instead would have meant moving induction's attendance bar silently moves the
-- mentoring bar too, which is precisely the coupling the ruling rejects.
ALTER TABLE public.induction_programs
  ADD COLUMN IF NOT EXISTS completion_mentoring_pct INTEGER NOT NULL DEFAULT 75;

COMMENT ON COLUMN public.induction_programs.completion_mentoring_pct IS
  'Percentage of the mentor check-ins ALREADY DUE that a fresher must have attended for mentoring_complete. Separate from completion_attendance_pct on purpose (Director ruling 2026-09-01): the year-long mentoring track has its own basis.';

-- ── 2. Where the mentoring verdict is stored ────────────────────────────────
-- On induction_completion rather than in a parallel table. That row is already
-- UNIQUE(event_id, learner_id), already RLS-protected, already the per-fresher
-- rollup for this same event and these same freshers; the mentoring track is a
-- second BASIS over the same pair, not a second entity. A new table would have
-- bought a second set of policies and grants to get wrong, for no new key.
-- Column names, types and NOT NULL DEFAULTs follow the induction columns beside
-- them so the two bases read as siblings.
ALTER TABLE public.induction_completion
  ADD COLUMN IF NOT EXISTS mentoring_sessions_total    INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mentoring_sessions_attended INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mentoring_attendance_pct    NUMERIC     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mentoring_complete          BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mentoring_completed_at      TIMESTAMPTZ;

COMMENT ON COLUMN public.induction_completion.mentoring_sessions_total IS
  'Senior Peer Mentor check-ins (event_sessions.kind = ''mentor_checkin'') that have already come due for this fresher. NOT part of sessions_total — the induction and mentoring bases are counted separately.';
COMMENT ON COLUMN public.induction_completion.mentoring_sessions_attended IS
  'Of those due check-ins, how many this fresher was present or on-duty for.';
COMMENT ON COLUMN public.induction_completion.mentoring_complete IS
  'mentoring_sessions_attended / mentoring_sessions_total >= induction_programs.completion_mentoring_pct. A RUNNING verdict over the year, not a permanent award: it is legitimately false for everyone until the first check-in has come due, and it can fall again if a fresher attends the first check-in and then stops. Made monotonic it would be clearable by turning up once in September.';

-- ── 3. Recompute: two bases, one pass ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_recompute_completion(p_event_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID; v_thr INTEGER; v_fbpct INTEGER; v_mnpct INTEGER; v_n INTEGER;
BEGIN
  SELECT institution_id, completion_attendance_pct, completion_feedback_pct,
         completion_mentoring_pct                                   -- ADDED: the mentoring bar
    INTO v_inst, v_thr, v_fbpct, v_mnpct
  FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_recompute_completion: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)
          OR public.fn_induction_is_event_speaker(p_event_id)) THEN
    RAISE EXCEPTION 'fn_induction_recompute_completion: not authorized';
  END IF;

  -- One CTE feeds attendance AND feedback from the fresher's applicable (batch)
  -- sessions. Two LEFT JOINs fan out rows, so every numerator uses
  -- count(DISTINCT session) to stay correct.
  --
  -- CHANGED: the join now admits only sittings that have already begun, and the
  -- aggregates are split by kind so the induction basis and the mentoring basis
  -- are counted from the same scan without contaminating each other. The date
  -- test lives in the ON clause, NOT in a WHERE — moving it would turn the LEFT
  -- JOIN into an inner join and drop every fresher who has no qualifying
  -- sitting out of the result entirely, leaving their induction_completion row
  -- frozen at its old value instead of being reset to a truthful zero. The kind
  -- test is a FILTER rather than an ON condition for the opposite reason: the
  -- mentor rows must stay in the scan to be counted on their own.
  WITH att AS (
    SELECT e.learner_id, e.institution_id,
           -- INDUCTION basis: everything that is not a mentor check-in, which
           -- keeps 'registration' and untyped (NULL kind) sittings counting.
           count(DISTINCT s.id) FILTER (WHERE s.kind IS DISTINCT FROM 'mentor_checkin')
             AS total,
           count(DISTINCT s.id) FILTER (WHERE s.kind IS DISTINCT FROM 'mentor_checkin'
                                          AND a.status IN ('present','od'))
             AS attended,
           count(DISTINCT s.id) FILTER (WHERE s.kind IS DISTINCT FROM 'mentor_checkin'
                                          AND f.id IS NOT NULL)
             AS rated,
           -- MENTORING basis: the year-long track, on its own.
           count(DISTINCT s.id) FILTER (WHERE s.kind = 'mentor_checkin')
             AS m_total,
           count(DISTINCT s.id) FILTER (WHERE s.kind = 'mentor_checkin'
                                          AND a.status IN ('present','od'))
             AS m_attended
    FROM public.induction_enrollment e
    LEFT JOIN public.event_sessions s
      ON s.event_id = e.event_id
     AND (s.batch_id IS NULL OR s.batch_id = e.batch_id)
     AND s.start_at IS NOT NULL AND s.start_at <= now()   -- ADDED: it must have happened
    LEFT JOIN public.event_session_attendance a
      ON a.session_id = s.id AND a.learner_id = e.learner_id
    LEFT JOIN public.event_session_feedback f
      ON f.session_id = s.id AND f.learner_id = e.learner_id
    WHERE e.event_id = p_event_id
    GROUP BY e.learner_id, e.institution_id
  )
  INSERT INTO public.induction_completion
    (event_id, learner_id, institution_id, sessions_total, sessions_attended,
     attendance_pct, participation_complete, outcome_complete, completed_at,
     mentoring_sessions_total, mentoring_sessions_attended, mentoring_attendance_pct,
     mentoring_complete, mentoring_completed_at, updated_at)
  SELECT p_event_id, att.learner_id, att.institution_id, att.total, att.attended,
         CASE WHEN att.total = 0 THEN 0 ELSE round(100.0 * att.attended / att.total, 2) END,
         (att.total > 0 AND (100.0 * att.attended / att.total) >= v_thr),
         (   (att.total > 0 AND (100.0 * att.attended / att.total) >= v_thr)
          OR (att.total > 0 AND (100.0 * att.rated    / att.total) >= v_fbpct) ),
         CASE WHEN (   (att.total > 0 AND (100.0 * att.attended / att.total) >= v_thr)
                    OR (att.total > 0 AND (100.0 * att.rated    / att.total) >= v_fbpct) )
              THEN now() ELSE NULL END,
         -- ADDED: the mentoring basis. m_total = 0 (nothing due yet) is false,
         -- never vacuously complete — same shape as the limbs above it.
         att.m_total, att.m_attended,
         CASE WHEN att.m_total = 0 THEN 0
              ELSE round(100.0 * att.m_attended / att.m_total, 2) END,
         (att.m_total > 0 AND (100.0 * att.m_attended / att.m_total) >= v_mnpct),
         CASE WHEN (att.m_total > 0 AND (100.0 * att.m_attended / att.m_total) >= v_mnpct)
              THEN now() ELSE NULL END,
         now()
  FROM att
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    sessions_total = EXCLUDED.sessions_total,
    sessions_attended = EXCLUDED.sessions_attended,
    attendance_pct = EXCLUDED.attendance_pct,
    participation_complete = EXCLUDED.participation_complete,
    -- attendance OR feedback (EXCLUDED.outcome_complete) OR the fresher's live referral count
    outcome_complete = (EXCLUDED.outcome_complete OR induction_completion.referrals_submitted >= 1),
    completed_at = CASE
      WHEN (EXCLUDED.outcome_complete OR induction_completion.referrals_submitted >= 1)
        THEN COALESCE(induction_completion.completed_at, now())
      ELSE NULL END,
    -- ADDED: mentoring columns. mentoring_completed_at keeps the FIRST time the
    -- track was cleared, mirroring completed_at, so a later recompute does not
    -- re-date an achievement that already happened.
    mentoring_sessions_total = EXCLUDED.mentoring_sessions_total,
    mentoring_sessions_attended = EXCLUDED.mentoring_sessions_attended,
    mentoring_attendance_pct = EXCLUDED.mentoring_attendance_pct,
    mentoring_complete = EXCLUDED.mentoring_complete,
    mentoring_completed_at = CASE
      WHEN EXCLUDED.mentoring_complete
        THEN COALESCE(induction_completion.mentoring_completed_at, now())
      ELSE NULL END,
    updated_at = now();

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

-- This function has carried no explicit grant statement since it was created
-- (20260627190000), which under Supabase's ALTER DEFAULT PRIVILEGES leaves it
-- holding the default EXECUTE grant to anon. It has a real authorization gate
-- in its body, so anon gains nothing by calling it — but the gate is the wrong
-- place to be relying on, and CLAUDE.md's rule is unconditional. Asserted here.
REVOKE EXECUTE ON FUNCTION public.fn_induction_recompute_completion(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_recompute_completion(uuid) TO authenticated;

-- ── 4. The living gate carries the SAME denominator, and it is a second copy ─
-- fn_induction_completion_on_feedback() recomputes outcome_complete on every
-- induction feedback write. It does not call the function above; it duplicates
-- its CTE. Left uncorrected it would keep measuring against unhappened sittings
-- and simply never promote the freshers this migration is for — silently,
-- because the trigger is monotonic and so cannot produce a visible regression
-- to investigate. Same two changes, one difference: this path computes only the
-- induction basis (a feedback write cannot change an attendance-based mentoring
-- verdict), so the mentor-check-in exclusion is an ON condition here rather
-- than a FILTER. The mentoring columns are absent from its INSERT list and keep
-- their defaults on a first insert and their values on conflict.
CREATE OR REPLACE FUNCTION public.fn_induction_completion_on_feedback()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  WITH aff AS (
    SELECT DISTINCT nt.event_id, nt.learner_id
    FROM new_feedback nt
    WHERE nt.learner_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.induction_programs ip WHERE ip.event_id = nt.event_id)
  ),
  calc AS (
    SELECT aff.event_id, aff.learner_id, ie.institution_id,
           ip.completion_attendance_pct AS thr, ip.completion_feedback_pct AS fbpct,
           count(DISTINCT s.id) AS total,
           count(DISTINCT s.id) FILTER (WHERE a.status IN ('present','od')) AS attended,
           count(DISTINCT s.id) FILTER (WHERE f.id IS NOT NULL) AS rated
    FROM aff
    JOIN public.induction_programs ip ON ip.event_id = aff.event_id
    JOIN public.induction_enrollment ie ON ie.event_id = aff.event_id AND ie.learner_id = aff.learner_id
    LEFT JOIN public.event_sessions s
      ON s.event_id = aff.event_id
     AND (s.batch_id IS NULL OR s.batch_id = ie.batch_id)
     AND s.start_at IS NOT NULL AND s.start_at <= now()   -- ADDED: it must have happened
     AND s.kind IS DISTINCT FROM 'mentor_checkin'         -- ADDED: mentoring is its own basis
    LEFT JOIN public.event_session_attendance a ON a.session_id = s.id AND a.learner_id = aff.learner_id
    LEFT JOIN public.event_session_feedback f ON f.session_id = s.id AND f.learner_id = aff.learner_id
    GROUP BY aff.event_id, aff.learner_id, ie.institution_id, ip.completion_attendance_pct, ip.completion_feedback_pct
  )
  INSERT INTO public.induction_completion
    (event_id, learner_id, institution_id, outcome_complete, completed_at, updated_at)
  SELECT calc.event_id, calc.learner_id, calc.institution_id,
         ( (calc.total>0 AND 100.0*calc.attended/calc.total >= calc.thr)
           OR (calc.total>0 AND 100.0*calc.rated/calc.total >= calc.fbpct) ),
         CASE WHEN ( (calc.total>0 AND 100.0*calc.attended/calc.total >= calc.thr)
                     OR (calc.total>0 AND 100.0*calc.rated/calc.total >= calc.fbpct) )
              THEN now() ELSE NULL END,
         now()
  FROM calc
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    outcome_complete = induction_completion.outcome_complete OR EXCLUDED.outcome_complete,
    completed_at = CASE
      WHEN (induction_completion.outcome_complete OR EXCLUDED.outcome_complete)
        THEN COALESCE(induction_completion.completed_at, now())
      ELSE induction_completion.completed_at END,
    updated_at = now();
  RETURN NULL;
END $function$;

-- Trigger function: Postgres refuses direct calls and the trigger system fires
-- it regardless of the EXECUTE ACL, so this is belt-and-braces, re-asserting
-- what induction_feedback_trigger_lock_anon.sql established. No grant to
-- authenticated — nothing should be able to call it as an RPC.
REVOKE EXECUTE ON FUNCTION public.fn_induction_completion_on_feedback() FROM anon, PUBLIC;

-- The two statement-level triggers (trg_induction_completion_on_feedback_ins /
-- _upd) are unchanged and are deliberately NOT re-created here: replacing the
-- function body is enough, and dropping a live trigger to recreate it identical
-- would open a window in which feedback writes recompute nothing.

NOTIFY pgrst, 'reload schema';

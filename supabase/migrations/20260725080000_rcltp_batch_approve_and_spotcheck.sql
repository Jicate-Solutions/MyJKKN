-- ============================================================================
-- RCLTP Part-B review — most-needed-first priority + weekly enforced spot-check
-- 2026-07-25
-- ----------------------------------------------------------------------------
-- Implements two of the locked AI/Senior-Learner division-of-labour decisions
-- (specs/senior-learner-ai-offload-decisions-2026-07-25.md):
--
--   #5  When the review pile grows, sort MOST-NEEDED FIRST — the passages whose
--       assessments run soonest, and the passages carrying the most at-risk
--       readers, come to the top.
--   #7  Anti-rubber-stamp: a small RANDOM SAMPLE each week that the Senior
--       Learner must genuinely open and confirm. Remind/enforce, never block.
--
-- WHY #7 EXISTS: the console is gaining an "approve all AI-agreed" batch action.
-- A batch approve without a policed sample is a rubber stamp with a nicer UI.
-- The sample is drawn from what the reviewer ALREADY approved, so it audits the
-- approving act itself — including the batch one.
--
-- REUSE, NOT REINVENTION: the at-risk definition below is copied verbatim from
-- fn_rcltp_at_risk_learners (migration 20260723073000) — latest result per
-- learner, flagged when band='emergent' OR the score regressed. A second,
-- divergent definition of "at-risk" in the same module would be a bug factory.
-- The sample size is a platform_policies row read through fn_get_policy_int,
-- per the standing "every policy decision is a config row" rule.
--
-- SECURITY: every function here is SECURITY DEFINER and therefore explicitly
-- REVOKEd from anon + PUBLIC (Supabase's ALTER DEFAULT PRIVILEGES otherwise
-- grants EXECUTE to anon on every new function). The spot-check table's base
-- writes are locked entirely — all mutation goes through the RPCs below.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Config row — how many items land in the weekly spot-check sample.
-- ---------------------------------------------------------------------------
-- Idempotent via NOT EXISTS rather than ON CONFLICT: the table's uniqueness is
-- an EXPRESSION index (policy_key, scope_type, COALESCE(scope_id, '000…')), so
-- a bare column conflict target does not match it.
INSERT INTO platform_policies (
  policy_key, scope_type, scope_id, value, data_type, description,
  ui_widget, ui_options, ui_consequence, ui_cascade, ui_category, is_system, is_active
)
SELECT
  'rcltp.review.spotcheck_weekly_sample',
  'global', NULL::uuid,
  '3'::jsonb, 'number',
  'How many already-approved AI-drafted questions are sampled each week for a Senior Learner to genuinely re-read (anti-rubber-stamp check, decision #7)',
  'number', NULL::jsonb,
  'Each week the system picks this many questions the Senior Learner already approved and asks them to open and confirm each one. It is a reminder, not a block — nothing stops while they are outstanding.',
  '[{"effect":"Set too low, a rubber-stamped batch approval can go unnoticed for a long time","severity":"high"},{"effect":"Set too high, the weekly re-read becomes its own chore and gets ignored","severity":"medium"}]'::jsonb,
  'Question Review', true, true
WHERE NOT EXISTS (
  SELECT 1 FROM platform_policies
  WHERE policy_key = 'rcltp.review.spotcheck_weekly_sample'
    AND scope_type = 'global'
    AND scope_id IS NULL
);

-- ---------------------------------------------------------------------------
-- 2. Most-needed-first priority per passage.
-- ---------------------------------------------------------------------------
-- Returns one row per passage the caller may see, with the counts the console
-- needs plus an explicit priority_rank so the ordering rule lives in exactly
-- one place (the client sorts by rank; it does not re-implement the comparator).
--
-- Ordering: soonest upcoming official assessment first, then most at-risk
-- readers, then biggest draft pile, then a stable id tiebreak.
--
-- NOTE ON next_scheduled_at: rcltp_assessments.scheduled_start is currently
-- NULL on every row in production, so this dimension is INERT today and the
-- ranking is driven by at-risk count. It becomes live the moment assessment
-- scheduling is used — no code change needed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_rcltp_passage_review_priority(
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  passage_id        uuid,
  draft_count       int,
  ai_agreed_count   int,
  attention_count   int,
  at_risk_count     int,
  next_scheduled_at timestamptz,
  priority_rank     int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    is_super_admin() OR is_admin()
    OR user_has_permission('rcltp.review')
    OR user_has_permission('rcltp.question.approve')
    OR user_has_permission('rcltp.config.manage')
  ) THEN
    RAISE EXCEPTION 'Not authorized to view question-review priority'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH visible_passages AS (
    -- Global rows (institution_id IS NULL) are shared library content and are
    -- visible to any holder of the capability; institution-owned rows are
    -- scoped by the canonical access function, exactly as RLS would.
    SELECT p.id, p.institution_id
    FROM rcltp_passages p
    WHERE (
            p_institution_id IS NULL
            OR p.institution_id = p_institution_id
            OR p.institution_id IS NULL
          )
      AND (
            is_super_admin() OR is_admin()
            OR p.institution_id IS NULL
            OR role_has_institution_access(p.institution_id)
          )
  ),
  q AS (
    SELECT
      b.passage_id AS pid,
      count(*) FILTER (WHERE b.status = 'draft')::int AS draft_count,
      count(*) FILTER (
        WHERE b.status = 'draft'
          AND b.ai_meta -> 'checker' ->> 'verdict' = 'agree'
      )::int AS ai_agreed_count,
      count(*) FILTER (
        WHERE b.status = 'draft'
          AND coalesce(b.ai_meta -> 'checker' ->> 'verdict', 'unchecked') <> 'agree'
      )::int AS attention_count
    FROM rcltp_part_b_questions b
    WHERE b.passage_id IN (SELECT vp.id FROM visible_passages vp)
    GROUP BY b.passage_id
  ),
  sched AS (
    SELECT a.passage_id AS pid, min(a.scheduled_start) AS next_scheduled_at
    FROM rcltp_assessments a
    WHERE a.passage_id IN (SELECT vp.id FROM visible_passages vp)
      AND a.is_active
      AND a.is_official
      AND a.submitted_at IS NULL
      AND a.scheduled_start IS NOT NULL
      AND a.scheduled_start >= now()
    GROUP BY a.passage_id
  ),
  latest AS (
    -- Latest result per learner, restricted to visible passages.
    SELECT DISTINCT ON (r.learner_id)
      r.learner_id,
      r.overall_band,
      r.overall_score,
      r.previous_overall_score,
      a.passage_id AS pid
    FROM rcltp_assessment_results r
    JOIN rcltp_assessments a ON a.id = r.assessment_id
    WHERE a.passage_id IN (SELECT vp.id FROM visible_passages vp)
    ORDER BY r.learner_id, r.created_at DESC
  ),
  at_risk AS (
    -- Verbatim at-risk rule from fn_rcltp_at_risk_learners.
    SELECT l.pid, count(*)::int AS at_risk_count
    FROM latest l
    WHERE l.overall_band = 'emergent'
       OR (l.previous_overall_score IS NOT NULL
           AND l.overall_score < l.previous_overall_score)
    GROUP BY l.pid
  )
  SELECT
    vp.id,
    coalesce(q.draft_count, 0),
    coalesce(q.ai_agreed_count, 0),
    coalesce(q.attention_count, 0),
    coalesce(ar.at_risk_count, 0),
    s.next_scheduled_at,
    row_number() OVER (
      ORDER BY
        (s.next_scheduled_at IS NULL),          -- scheduled passages first
        s.next_scheduled_at ASC,                -- soonest test first
        coalesce(ar.at_risk_count, 0) DESC,     -- most at-risk readers next
        coalesce(q.draft_count, 0) DESC,        -- biggest pile next
        vp.id                                   -- stable tiebreak
    )::int
  FROM visible_passages vp
  LEFT JOIN q       ON q.pid  = vp.id
  LEFT JOIN sched s ON s.pid  = vp.id
  LEFT JOIN at_risk ar ON ar.pid = vp.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_rcltp_passage_review_priority(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_rcltp_passage_review_priority(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Weekly spot-check ledger.
-- ---------------------------------------------------------------------------
-- One row per (reviewer, week, sampled question). Base-table writes are locked:
-- there is a SELECT policy and deliberately NO insert/update/delete policy, so
-- the only way to create or resolve a sample is through the SECDEF RPCs below.
-- That keeps a reviewer from quietly marking their own sample confirmed with a
-- direct PostgREST call, and from sampling themselves a friendlier set.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rcltp_review_spotchecks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  question_id    uuid NOT NULL REFERENCES rcltp_part_b_questions(id) ON DELETE CASCADE,
  reviewer_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start     date NOT NULL,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'confirmed', 'flagged')),
  note           text,
  resolved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reviewer_id, week_start, question_id)
);

CREATE INDEX IF NOT EXISTS idx_rcltp_spotchecks_reviewer_week
  ON public.rcltp_review_spotchecks (reviewer_id, week_start);

ALTER TABLE public.rcltp_review_spotchecks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rcltp_spotcheck_read ON public.rcltp_review_spotchecks;
CREATE POLICY rcltp_spotcheck_read ON public.rcltp_review_spotchecks
FOR SELECT USING (
  is_super_admin() OR is_admin() OR reviewer_id = auth.uid()
);
-- (no INSERT / UPDATE / DELETE policy by design — see comment above)

-- ---------------------------------------------------------------------------
-- 4. Ensure + return this week's sample for the calling Senior Learner.
-- ---------------------------------------------------------------------------
-- Self-healing: the first call in a given week draws the sample, later calls in
-- the same week return the same rows. No scheduler to configure or to silently
-- stop running. The sample is drawn from AI-drafted questions this reviewer
-- personally approved in the preceding 7 days — the window the batch-approve
-- button acts on.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_rcltp_spotcheck_week()
RETURNS TABLE (
  id             uuid,
  question_id    uuid,
  question_text  text,
  correct_answer text,
  passage_id     uuid,
  passage_title  text,
  week_start     date,
  status         text,
  note           text,
  resolved_at    timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
-- The RETURNS TABLE output names (id, question_id, week_start, status, …) are
-- also plpgsql variables, and an ON CONFLICT target cannot be alias-qualified —
-- so a bare `week_start` there is ambiguous. Resolve bare names to COLUMNS; every
-- genuine local below is v_-prefixed, so nothing else is affected.
#variable_conflict use_column
DECLARE
  v_uid   uuid := auth.uid();
  v_week  date := date_trunc('week', current_date)::date;
  v_n     int;
  v_have  int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    is_super_admin() OR is_admin()
    OR user_has_permission('rcltp.review')
    OR user_has_permission('rcltp.question.approve')
    OR user_has_permission('rcltp.config.manage')
  ) THEN
    RAISE EXCEPTION 'Not authorized to run the question-review spot-check'
      USING ERRCODE = '42501';
  END IF;

  v_n := greatest(1, least(20,
    coalesce(fn_get_policy_int('rcltp.review.spotcheck_weekly_sample', 3, NULL), 3)));

  SELECT count(*) INTO v_have
  FROM rcltp_review_spotchecks s
  WHERE s.reviewer_id = v_uid AND s.week_start = v_week;

  IF v_have = 0 THEN
    INSERT INTO rcltp_review_spotchecks (
      institution_id, question_id, reviewer_id, week_start
    )
    SELECT b.institution_id, b.id, v_uid, v_week
    FROM rcltp_part_b_questions b
    WHERE b.reviewed_by = v_uid
      AND b.status = 'approved'
      AND b.source = 'ai_generated'
      AND b.reviewed_at IS NOT NULL
      AND b.reviewed_at >= (v_week - interval '7 days')
    ORDER BY random()
    LIMIT v_n
    ON CONFLICT (reviewer_id, week_start, question_id) DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT
    s.id, s.question_id, b.question_text, b.correct_answer,
    b.passage_id, p.title, s.week_start, s.status, s.note, s.resolved_at
  FROM rcltp_review_spotchecks s
  JOIN rcltp_part_b_questions b ON b.id = s.question_id
  LEFT JOIN rcltp_passages p    ON p.id = b.passage_id
  WHERE s.reviewer_id = v_uid AND s.week_start = v_week
  ORDER BY (s.status <> 'pending'), s.created_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_rcltp_spotcheck_week() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_rcltp_spotcheck_week() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Resolve one spot-check item (confirm it reads correctly, or flag it).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_rcltp_spotcheck_resolve(
  p_id     uuid,
  p_status text,
  p_note   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hit int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('confirmed', 'flagged') THEN
    RAISE EXCEPTION 'status must be confirmed or flagged';
  END IF;

  -- Scoped to the caller's own PENDING row: a reviewer cannot resolve someone
  -- else's sample, and cannot silently re-resolve one they already answered.
  UPDATE rcltp_review_spotchecks s
  SET status      = p_status,
      note        = nullif(btrim(coalesce(p_note, '')), ''),
      resolved_at = now(),
      updated_at  = now()
  WHERE s.id = p_id
    AND s.reviewer_id = v_uid
    AND s.status = 'pending';

  GET DIAGNOSTICS v_hit = ROW_COUNT;
  IF v_hit = 0 THEN
    RAISE EXCEPTION 'Spot-check item not found, not yours, or already resolved'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_rcltp_spotcheck_resolve(uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_rcltp_spotcheck_resolve(uuid, text, text) TO authenticated;

COMMIT;

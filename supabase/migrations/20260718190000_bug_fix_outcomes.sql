-- =====================================================================
-- Bug-cluster self-improving loop — increment #3: Learn
-- Date: 2026-07-18
-- Spec: docs/features/2026-07-18-FEATURE-cluster-selfimproving-loop.md
--
-- The outcome LEDGER + retrieval. One row per fixed cluster records
-- {root-cause category, files touched, fix pattern, verify tally,
-- reporter_confirmed} — and the retrieval RPC feeds ONLY MEASURED
-- outcomes (reporter-confirmed positive/negative) into the next fix.
--
-- MOAT HONESTY (the whole point):
--   - reporter_confirmed derives ONLY from reporter 👍/👎 answers
--     (increment #2), never from the AI's own verify tally. The verify
--     tally is stored for context but is NEVER a retrieval key.
--   - 'none' (silence/expiry, E2) rows are EXCLUDED from retrieval —
--     the loop learns nothing from unmeasured fixes.
--   - Loop gate f for `bug-triage` is NOT flipped here. It flips only
--     after the 2-cycle falsification test passes on REAL measured
--     outcomes (a later migration).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Ledger table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bug_fix_outcomes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id          uuid NOT NULL UNIQUE REFERENCES public.bug_clusters(id) ON DELETE CASCADE,
  canonical_bug_id    uuid,
  -- Retrieval key (D4: category first). Derived from the fix's primary
  -- shared file: its first 3 path segments (e.g. 'lib/services/billing') —
  -- code locality beats module labels as a root-cause signature.
  root_cause_category text NOT NULL,
  root_cause          text,
  files_touched       text[] NOT NULL DEFAULT '{}',
  fix_pattern         jsonb,             -- {note, branch, pr_number} from the fix state
  fix_pr              text,
  verify_verdict      jsonb,             -- increment #1 tally — WEAK signal, context only
  reporter_confirmed  text NOT NULL DEFAULT 'none'
                        CHECK (reporter_confirmed IN ('positive','negative','none')),
  reporter_pos        int NOT NULL DEFAULT 0,
  reporter_neg        int NOT NULL DEFAULT 0,
  resolved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bug_fix_outcomes_category
  ON public.bug_fix_outcomes (root_cause_category)
  WHERE reporter_confirmed <> 'none';

ALTER TABLE public.bug_fix_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bug_fix_outcomes_admin_select" ON public.bug_fix_outcomes;
CREATE POLICY "bug_fix_outcomes_admin_select" ON public.bug_fix_outcomes
  FOR SELECT USING (is_super_admin() OR is_admin());

-- ---------------------------------------------------------------------
-- 2) fn_bug_fix_outcome_record(cluster) — idempotent snapshot/refresh.
--    Called (a) from the resolve path when a cluster canonical resolves,
--    (b) from fn_bug_feedback_answer so late 👎s (E1) keep the ledger
--    current. Requires a fixability verdict (the category source).
--    No auth guard inside: it is reachable only via service_role grants
--    or nested SECDEF calls (owner context) — never directly by users.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_fix_outcome_record(p_cluster_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cluster   public.bug_clusters%ROWTYPE;
  v_verdict   jsonb;
  v_fix       jsonb;
  v_files     text[];
  v_category  text;
  v_pos       int;
  v_neg       int;
  v_confirmed text;
  v_resolved  timestamptz;
BEGIN
  SELECT * INTO v_cluster FROM public.bug_clusters WHERE id = p_cluster_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'group not found');
  END IF;

  v_verdict := v_cluster.metadata -> 'fixability' -> 'verdict';
  IF v_verdict IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no fixability verdict to learn from');
  END IF;
  v_fix := v_cluster.metadata -> 'fixability' -> 'fix';

  SELECT COALESCE(array_agg(f), '{}') INTO v_files
  FROM jsonb_array_elements_text(COALESCE(v_verdict -> 'files', '[]'::jsonb)) f;

  IF array_length(v_files, 1) IS NULL THEN
    v_category := 'uncategorized';
  ELSE
    v_category := array_to_string((string_to_array(v_files[1], '/'))[1:3], '/');
  END IF;

  -- GROUND TRUTH derivation (D5: any 👎 = not clean; E2: silence = none).
  SELECT count(*) FILTER (WHERE answer = 'fixed'),
         count(*) FILTER (WHERE answer = 'not_fixed')
    INTO v_pos, v_neg
  FROM public.bug_fix_feedback_requests
  WHERE cluster_id = p_cluster_id AND status = 'answered';

  v_confirmed := CASE
    WHEN v_neg > 0 THEN 'negative'
    WHEN v_pos > 0 THEN 'positive'
    ELSE 'none'
  END;

  SELECT resolved_at INTO v_resolved
  FROM public.bug_reports WHERE id = v_cluster.seed_bug_id;

  INSERT INTO public.bug_fix_outcomes AS o
    (cluster_id, canonical_bug_id, root_cause_category, root_cause, files_touched,
     fix_pattern, fix_pr, verify_verdict, reporter_confirmed, reporter_pos,
     reporter_neg, resolved_at, updated_at)
  VALUES
    (p_cluster_id, v_cluster.seed_bug_id, v_category, v_verdict ->> 'root_cause', v_files,
     CASE WHEN v_fix IS NULL THEN NULL ELSE jsonb_build_object(
       'note', v_fix ->> 'note', 'branch', v_fix ->> 'branch', 'pr_number', v_fix -> 'pr_number') END,
     v_fix ->> 'pr_url',
     v_cluster.metadata -> 'verify' -> 'tally',
     v_confirmed, COALESCE(v_pos, 0), COALESCE(v_neg, 0), v_resolved, now())
  ON CONFLICT (cluster_id) DO UPDATE SET
    canonical_bug_id    = EXCLUDED.canonical_bug_id,
    root_cause_category = EXCLUDED.root_cause_category,
    root_cause          = EXCLUDED.root_cause,
    files_touched       = EXCLUDED.files_touched,
    fix_pattern         = EXCLUDED.fix_pattern,
    fix_pr              = EXCLUDED.fix_pr,
    verify_verdict      = EXCLUDED.verify_verdict,
    reporter_confirmed  = EXCLUDED.reporter_confirmed,
    reporter_pos        = EXCLUDED.reporter_pos,
    reporter_neg        = EXCLUDED.reporter_neg,
    resolved_at         = EXCLUDED.resolved_at,
    updated_at          = now();

  RETURN jsonb_build_object('success', true, 'category', v_category,
    'reporter_confirmed', v_confirmed, 'pos', COALESCE(v_pos,0), 'neg', COALESCE(v_neg,0));
END;
$$;

-- ---------------------------------------------------------------------
-- 3) fn_bug_fix_outcomes_match(category) — the retrieval feed-forward.
--    Returns ONLY MEASURED outcomes (reporter-confirmed, never 'none')
--    for the given category, newest first. Called by the Mac fix runner
--    to inject ground-truth history into the next fix prompt.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_fix_outcomes_match(
  p_category text,
  p_limit int DEFAULT 5
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'cluster_id', o.cluster_id,
    'root_cause_category', o.root_cause_category,
    'root_cause', left(o.root_cause, 400),
    'files_touched', to_jsonb(o.files_touched),
    'fix_pattern', o.fix_pattern,
    'fix_pr', o.fix_pr,
    'reporter_confirmed', o.reporter_confirmed,
    'reporter_pos', o.reporter_pos,
    'reporter_neg', o.reporter_neg,
    'updated_at', o.updated_at
  ) ORDER BY o.updated_at DESC), '[]'::jsonb)
  FROM (
    SELECT * FROM public.bug_fix_outcomes
    WHERE root_cause_category = p_category
      AND reporter_confirmed <> 'none'   -- measured outcomes ONLY (the moat rule)
    ORDER BY updated_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 5), 1)
  ) o;
$$;

-- ---------------------------------------------------------------------
-- 4) fn_bug_feedback_answer REPLACED — after recording the reporter's
--    answer, refresh the outcome ledger row (so late 👎s [E1] keep it
--    current). Outcome refresh failures never break the answer write.
--    Body otherwise identical to 20260718180000.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_feedback_answer(p_request_id uuid, p_answer text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.bug_fix_feedback_requests%ROWTYPE;
BEGIN
  IF p_answer NOT IN ('fixed','not_fixed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'answer must be fixed or not_fixed');
  END IF;

  SELECT * INTO v_row
  FROM public.bug_fix_feedback_requests
  WHERE id = p_request_id AND reporter_user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not found');
  END IF;
  IF v_row.status = 'pending_send' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not sent yet');
  END IF;
  IF v_row.expires_at <= now() AND v_row.status <> 'answered' THEN
    RETURN jsonb_build_object('success', false, 'error', 'this question has expired');
  END IF;

  UPDATE public.bug_fix_feedback_requests
  SET answer = p_answer,
      answered_at = now(),
      status = 'answered',
      delivered_at = COALESCE(delivered_at, now()),
      updated_at = now()
  WHERE id = p_request_id AND reporter_user_id = auth.uid();

  -- Learn (#3): refresh the measured-outcome ledger. Never fail the answer.
  BEGIN
    PERFORM public.fn_bug_fix_outcome_record(v_row.cluster_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('success', true, 'answer', p_answer);
END;
$$;

-- ---------------------------------------------------------------------
-- 5) Grants — anon locked on everything new; record/match are internal
--    (service_role + nested SECDEF calls only). fn_bug_feedback_answer
--    is REPLACED above → re-assert its posture for the anon-lock gate.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_bug_fix_outcome_record(uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_bug_fix_outcome_record(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_bug_fix_outcomes_match(text, int) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_bug_fix_outcomes_match(text, int) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_bug_feedback_answer(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_feedback_answer(uuid, text) TO authenticated, service_role;

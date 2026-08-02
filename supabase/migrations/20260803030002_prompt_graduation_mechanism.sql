-- ============================================================================
-- 20260803030000_prompt_graduation_mechanism.sql
-- ----------------------------------------------------------------------------
-- Judge-scored champion–challenger GRADUATION mechanism for AI job prompts.
-- Builds on the substrate from 20260726073915 (table ai_prompt_versions +
-- RPC fn_prompt_promote_version, already merged via #2421). This migration is
-- the judge-scoring + proposal flow the substrate deferred ("NO judge-scoring
-- flow in this PR — those graduate later").
--
-- THE LOOP (promotion stays HUMAN — there is NO auto-promote path anywhere):
--   1. A challenger row exists in ai_prompt_versions (written by service_role,
--      e.g. the Max-lane improvement flow — out of scope here).
--   2. A driver (box-side script or a later cron, mirroring the model-compare
--      collect loop) runs the champion and challenger prompts on the SAME real
--      inputs and enqueues a 'prompt_compare.judge' job per pair. The judge is
--      an ai_job_types ROW (declarative registry — a new prompt-only AI job is
--      a DB row, not a runner script). It ships DARK: enabled=false, so
--      fn_ai_enqueue_system refuses to queue it until the Director flips it.
--   3. The driver records each verdict via fn_prompt_record_judgment
--      (service_role only). The recorder tallies all judgments for the pair,
--      keeps ai_prompt_versions.clean_rate current, and — once the policy bar
--      is met (min samples AND win margin, BOTH platform_policies config rows,
--      never constants) — raises ONE pending row in
--      ai_prompt_graduation_proposals.
--   4. A human admin sees the proposal on /admin/ai-models and decides via
--      fn_prompt_graduation_decide (admin-asserted). Approval calls the
--      EXISTING substrate RPC fn_prompt_promote_version — one door for every
--      promotion; this migration never re-implements the promotion act.
--
-- Why the judge is CONSERVATIVE: the costly error is falsely graduating a
-- worse prompt into production. Ties are the default verdict; the win-margin
-- policy then demands a clear gap on top of that.
--
-- Stamped 20260803030000 (after the latest existing migration, 20260803020000)
-- so it sorts after the fn_ai_claim cap fix on any ordered rebuild.
--
-- ⛔ NOT APPLIED to any database — file only, Director-gated apply.
--    (Validated on prod via a single BEGIN..ROLLBACK Mgmt-API batch only.)
-- ============================================================================

-- ── 1. TABLE: ai_prompt_judgments — one row per judged champion-vs-challenger pair
CREATE TABLE IF NOT EXISTS public.ai_prompt_judgments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type           text NOT NULL,
  challenger_version int  NOT NULL,
  verdict            text NOT NULL,
  reason             text,
  ai_job_id          uuid,                       -- the prompt_compare.judge ai_jobs row, for audit
  judged_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_prompt_judgments_verdict_chk
    CHECK (verdict IN ('champion_better','challenger_better','tie')),
  CONSTRAINT ai_prompt_judgments_challenger_fk
    FOREIGN KEY (job_type, challenger_version)
    REFERENCES public.ai_prompt_versions (job_type, version)
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_judgments_pair
  ON public.ai_prompt_judgments (job_type, challenger_version);

COMMENT ON TABLE public.ai_prompt_judgments IS
  'One row per prompt_compare.judge verdict: for the same real input, did the CHAMPION (live) prompt or the CHALLENGER prompt produce the better output? Written only via fn_prompt_record_judgment (service_role). Tallied against the ai_prompt_graduation.* policy bar to raise graduation proposals.';

-- ── 2. TABLE: ai_prompt_graduation_proposals — "challenger beat champion" for a human
CREATE TABLE IF NOT EXISTS public.ai_prompt_graduation_proposals (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type                 text NOT NULL,
  challenger_version       int  NOT NULL,
  champion_version         int,                  -- champion at proposal time (NULL if the job type had none)
  samples                  int  NOT NULL,
  challenger_wins          int  NOT NULL,
  champion_wins            int  NOT NULL,
  ties                     int  NOT NULL,
  min_samples_at_proposal  int  NOT NULL,        -- policy snapshot: the bar this proposal cleared
  win_margin_at_proposal   int  NOT NULL,
  status                   text NOT NULL DEFAULT 'pending',
  decided_by               uuid,
  decided_at               timestamptz,
  decision_note            text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_prompt_graduation_proposals_status_chk
    CHECK (status IN ('pending','approved','rejected')),
  CONSTRAINT ai_prompt_graduation_proposals_challenger_fk
    FOREIGN KEY (job_type, challenger_version)
    REFERENCES public.ai_prompt_versions (job_type, version)
);

-- At most ONE pending proposal per (job_type, challenger). A rejected challenger
-- that keeps winning may re-propose later; an approved one is no longer a
-- challenger, so the recorder skips it.
CREATE UNIQUE INDEX IF NOT EXISTS ai_prompt_graduation_proposals_one_pending_idx
  ON public.ai_prompt_graduation_proposals (job_type, challenger_version)
  WHERE status = 'pending';

COMMENT ON TABLE public.ai_prompt_graduation_proposals IS
  'Graduation proposals for the prompt champion–challenger loop: raised automatically by fn_prompt_record_judgment when a challenger clears the ai_prompt_graduation.* policy bar. RECOMMENDATION-ONLY — nothing promotes automatically; a human admin decides via fn_prompt_graduation_decide, and approval calls the substrate RPC fn_prompt_promote_version.';

-- ── 3. RLS: admin-only read; NO direct writes (RPC/service_role discipline,
--          mirroring ai_prompt_versions from the substrate) ──────────────────
ALTER TABLE public.ai_prompt_judgments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_prompt_judgments_admin_read ON public.ai_prompt_judgments;
CREATE POLICY ai_prompt_judgments_admin_read ON public.ai_prompt_judgments
  FOR SELECT TO authenticated
  USING (is_super_admin() OR is_admin());
-- (no INSERT/UPDATE/DELETE policies → writes only via the SECURITY DEFINER
--  recorder below or service_role)

REVOKE ALL ON public.ai_prompt_judgments FROM anon;

ALTER TABLE public.ai_prompt_graduation_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_prompt_graduation_proposals_admin_read ON public.ai_prompt_graduation_proposals;
CREATE POLICY ai_prompt_graduation_proposals_admin_read ON public.ai_prompt_graduation_proposals
  FOR SELECT TO authenticated
  USING (is_super_admin() OR is_admin());
-- (no INSERT/UPDATE/DELETE policies → all writes via the two SECDEF RPCs below;
--  a direct client UPDATE is meant to be a 0-row no-op here, by design)

REVOKE ALL ON public.ai_prompt_graduation_proposals FROM anon;

-- ── 4. POLICY BAR: both thresholds are platform_policies config rows ─────────
-- Guarded on IDENTITY via WHERE NOT EXISTS (never ON CONFLICT — the table's
-- uniqueness is an EXPRESSION index, 42P10; and a Director edit must never be
-- clobbered by a seed re-run).
INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, description, is_system, is_active,
   classification, publication_state, ui_widget, ui_category)
SELECT * FROM (VALUES
  ('ai_prompt_graduation.min_samples','global','10'::jsonb,'number',
   'Prompt champion–challenger loop: minimum number of judged input pairs before a challenger prompt may raise a graduation proposal. Below this, the evidence is considered too thin no matter the win rate.',
   false, true, 'operational','published','number','ai_lane'),
  ('ai_prompt_graduation.win_margin','global','3'::jsonb,'number',
   'Prompt champion–challenger loop: how many MORE judged pairs the challenger must win than the champion (wins minus wins; ties count for neither) before a graduation proposal is raised. Keeps a coin-flip challenger from nagging a human.',
   false, true, 'operational','published','number','ai_lane')
) v(policy_key, scope_type, value, data_type, description, is_system, is_active,
    classification, publication_state, ui_widget, ui_category)
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies p
  WHERE p.policy_key = v.policy_key AND p.scope_type = 'global');

-- ── 5. THE JUDGE — one declarative ai_job_types ROW, shipped DARK ────────────
-- Mirrors the proven judge-row shape (model_compare.judge / accreditation.cac_brief):
-- ₹0 Max lane, family-alias model id ('sonnet', never a dated id), tool_set='none',
-- output_target='job.result' (writes ONLY ai_jobs.result, never a domain table),
-- interactive=false (interactive types are only served by the chat drain and
-- would never run), and the {{prompt}} slot the driver fills with the assembled
-- pair (the model_compare judge shipped once WITHOUT its slot — codified lesson).
-- enabled=false → fn_ai_enqueue_system refuses it until the Director flips it.
INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, max_inflight, schedulable, enabled,
   input_schema, expected_seconds, provider, model_id, external_allowed, loop_key)
SELECT
  'prompt_compare.judge',
  'Prompt Graduation · Champion–Challenger Judge',
  'Neutral judge for the prompt champion–challenger graduation loop. Given the CHAMPION (live) prompt''s output and a CHALLENGER prompt''s output for the SAME real input, it decides which better serves the job''s purpose against an absolute rubric — never by position — and returns strict JSON {verdict, reason}. The driver records each verdict via fn_prompt_record_judgment; once a challenger clears the ai_prompt_graduation.min_samples / .win_margin policy bar, a graduation PROPOSAL appears on /admin/ai-models. Promotion stays human: an admin approves, which calls fn_prompt_promote_version. DARK: ships enabled=false until the Director flips it (no deploy needed).',
  $judge$You are a strict, impartial quality judge for a prompt-improvement trial. Two AI outputs were produced for the SAME input by the SAME model: one using the CHAMPION prompt (the current live prompt for this job) and one using a CHALLENGER prompt (a proposed replacement). Decide which output better serves the job's purpose, so a human can tell whether the challenger prompt is genuinely better.

You will be given:
- The job's purpose / input context.
- CHAMPION_OUTPUT: the output produced with the current live prompt.
- CHALLENGER_OUTPUT: the output produced with the proposed new prompt.

CONTROL FOR POSITION BIAS — THIS IS MANDATORY:
- Do NOT decide by ordering. The labels CHAMPION_OUTPUT and CHALLENGER_OUTPUT, and which came first, must NOT influence your verdict.
- Judge EACH output independently against an ABSOLUTE quality rubric for this task, then compare the two absolute assessments. The rubric:
  1. Correctness & factual grounding — no fabrication; claims supported by the given input.
  2. Task fit — actually does what the job asked, in the required form/format.
  3. Completeness — covers what matters for the input; no important omission.
  4. Clarity & usefulness — a JKKN reader (Director / Senior Learner / learner as appropriate) can act on it.
  5. Safety & appropriateness — no harmful, biased, or out-of-scope content.
- Score each output against this rubric in your own reasoning BEFORE choosing a verdict.

BE CONSERVATIVE — A FALSE "challenger is better" IS THE COSTLY ERROR:
- Graduating a worse prompt into production hurts every future run of this job. Output "tie" whenever the two outputs are close, or the difference is subjective, stylistic, or within normal model variation. Ties are the correct default.
- Only choose "challenger_better" or "champion_better" when there is a CLEAR, STATEABLE difference on one or more rubric dimensions that you can name in the reason.
- If you are unsure, choose "tie". Do not manufacture a difference.

OUTPUT — strict JSON only, no prose, no code fences:
{"verdict": "champion_better" | "challenger_better" | "tie", "reason": "<=200 chars naming the concrete rubric-based difference, or why it is a tie"}

{{prompt}}$judge$,
  'none', 'job.result',
  false,          -- interactive: judge pairs are enqueued by the driver, never the chat drain
  'max', 'seat_owner', 1,
  false,          -- schedulable: enqueued per judged pair, not cron-scheduled on its own
  false,          -- enabled: ships DARK; Director flips at go-live (no deploy needed)
  '[{"key":"prompt","type":"textarea","label":"Assembled pair (job context + CHAMPION_OUTPUT + CHALLENGER_OUTPUT)","required":true}]'::jsonb,
  45, 'anthropic', 'sonnet',
  false,          -- external_allowed: internal quality loop, never B2A-reachable
  NULL            -- loop_key: welded later if the graduation loop is spine-registered
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_job_types WHERE job_type = 'prompt_compare.judge'
);
-- fallback_provider / fallback_model_id deliberately omitted (NULL) — mirrors
-- ops.brief / accreditation.cac_brief, which carry no fallback.

-- ── 6. RPC: fn_prompt_record_judgment — the driver persists ONE verdict ──────
-- SYSTEM writer (service_role only): called by the box-side driver / a later
-- collect cron after it parses the judge job's JSON verdict. Granting
-- authenticated would let any logged-in user forge judgments and push a bad
-- challenger over the graduation bar — so it is locked to service_role, same
-- reasoning as fn_model_switch_record_comparison.
CREATE OR REPLACE FUNCTION public.fn_prompt_record_judgment(
  p_job_type           text,
  p_challenger_version int,
  p_verdict            text,
  p_ai_job_id          uuid DEFAULT NULL,
  p_reason             text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $fn$
DECLARE
  v_version          public.ai_prompt_versions%ROWTYPE;
  v_samples          int;
  v_ch_wins          int;
  v_cm_wins          int;
  v_ties             int;
  v_min              int;
  v_margin           int;
  v_champion_version int;
  v_proposal_id      uuid;
BEGIN
  IF p_verdict NOT IN ('champion_better','challenger_better','tie') THEN
    RAISE EXCEPTION 'BAD_VERDICT: % (want champion_better | challenger_better | tie)', p_verdict;
  END IF;

  -- Lock the challenger's version row: serializes concurrent recorders for this
  -- pair AND excludes a mid-flight promotion (fn_prompt_promote_version locks
  -- the same rows), so tally + proposal-raise can never race a status change.
  SELECT * INTO v_version
    FROM public.ai_prompt_versions
   WHERE job_type = p_job_type AND version = p_challenger_version
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: no prompt version % for job type %', p_challenger_version, p_job_type;
  END IF;

  -- A stale verdict for an already-promoted/retired version is dropped
  -- gracefully (the driver may still have pairs in flight when a promotion
  -- lands) — no insert, no error, the driver's loop keeps going.
  IF v_version.status <> 'challenger' THEN
    RETURN jsonb_build_object('ok', false, 'skipped', true,
      'note', format('version %s of %s is ''%s'', not a challenger — judgment not recorded',
                     p_challenger_version, p_job_type, v_version.status));
  END IF;

  INSERT INTO public.ai_prompt_judgments (job_type, challenger_version, verdict, reason, ai_job_id)
  VALUES (p_job_type, p_challenger_version, p_verdict, p_reason, p_ai_job_id);

  SELECT count(*),
         count(*) FILTER (WHERE verdict = 'challenger_better'),
         count(*) FILTER (WHERE verdict = 'champion_better'),
         count(*) FILTER (WHERE verdict = 'tie')
    INTO v_samples, v_ch_wins, v_cm_wins, v_ties
    FROM public.ai_prompt_judgments
   WHERE job_type = p_job_type AND challenger_version = p_challenger_version;

  -- clean_rate (substrate column, definition set here as the judge flow lands):
  -- share of judged pairs where the challenger was AT LEAST as good as the
  -- champion (wins + ties) / samples, 0..1.
  UPDATE public.ai_prompt_versions
     SET clean_rate = round((v_ch_wins + v_ties)::numeric / v_samples, 4),
         updated_at = now()
   WHERE job_type = p_job_type AND version = p_challenger_version;

  -- The graduation bar: BOTH thresholds are config rows, never constants.
  v_min    := public.fn_get_policy_int('ai_prompt_graduation.min_samples', 10);
  v_margin := public.fn_get_policy_int('ai_prompt_graduation.win_margin', 3);

  IF v_samples >= v_min
     AND (v_ch_wins - v_cm_wins) >= v_margin
     AND NOT EXISTS (
       SELECT 1 FROM public.ai_prompt_graduation_proposals
        WHERE job_type = p_job_type
          AND challenger_version = p_challenger_version
          AND status = 'pending')
  THEN
    SELECT version INTO v_champion_version
      FROM public.ai_prompt_versions
     WHERE job_type = p_job_type AND status = 'champion';

    INSERT INTO public.ai_prompt_graduation_proposals
      (job_type, challenger_version, champion_version, samples,
       challenger_wins, champion_wins, ties,
       min_samples_at_proposal, win_margin_at_proposal)
    VALUES
      (p_job_type, p_challenger_version, v_champion_version, v_samples,
       v_ch_wins, v_cm_wins, v_ties, v_min, v_margin)
    RETURNING id INTO v_proposal_id;
  END IF;

  RETURN jsonb_build_object('ok', true,
    'samples', v_samples,
    'challenger_wins', v_ch_wins, 'champion_wins', v_cm_wins, 'ties', v_ties,
    'min_samples', v_min, 'win_margin', v_margin,
    'proposal_created', v_proposal_id IS NOT NULL, 'proposal_id', v_proposal_id);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_prompt_record_judgment(text, int, text, uuid, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_prompt_record_judgment(text, int, text, uuid, text) TO service_role;

-- ── 7. RPC: fn_prompt_graduation_decide — the HUMAN act ──────────────────────
-- Admin-asserted (mirrors fn_prompt_promote_version's gate). Approval calls the
-- EXISTING substrate promotion RPC — one door for every promotion; if the
-- challenger was retired/promoted meanwhile, that RPC raises and the whole
-- decision rolls back atomically.
CREATE OR REPLACE FUNCTION public.fn_prompt_graduation_decide(
  p_proposal_id uuid,
  p_approve     boolean,
  p_note        text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $fn$
DECLARE
  v_prop public.ai_prompt_graduation_proposals%ROWTYPE;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_admin()) THEN
    RAISE EXCEPTION 'FORBIDDEN: admin required to decide a graduation proposal';
  END IF;

  SELECT * INTO v_prop
    FROM public.ai_prompt_graduation_proposals
   WHERE id = p_proposal_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: no graduation proposal %', p_proposal_id;
  END IF;

  IF v_prop.status <> 'pending' THEN
    RAISE EXCEPTION 'INVALID_STATE: proposal % is already %', p_proposal_id, v_prop.status;
  END IF;

  IF p_approve THEN
    -- The promotion act stays the substrate RPC (retires champion, crowns
    -- challenger, copies the winning prompt into ai_job_types.prompt_template
    -- so out-of-repo runners need zero change).
    PERFORM public.fn_prompt_promote_version(v_prop.job_type, v_prop.challenger_version);
  END IF;

  UPDATE public.ai_prompt_graduation_proposals
     SET status        = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         decided_by    = auth.uid(),
         decided_at    = now(),
         decision_note = p_note,
         updated_at    = now()
   WHERE id = p_proposal_id
  RETURNING * INTO v_prop;

  RETURN to_jsonb(v_prop);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_prompt_graduation_decide(uuid, boolean, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_prompt_graduation_decide(uuid, boolean, text) TO authenticated;
-- (the internal is_super_admin() OR is_admin() assert is the real gate —
--  same style as fn_prompt_promote_version in the substrate)

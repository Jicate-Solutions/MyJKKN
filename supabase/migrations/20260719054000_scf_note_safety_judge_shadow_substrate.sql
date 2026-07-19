-- PR-2 Stage A: SCF note-safety self-improving loop — SHADOW substrate
-- Spec: specs/scf-note-safety-review-loop-2026-07-19.md
-- SHADOW ONLY: this substrate stores judge predictions; it NEVER changes scf_learner_notes.status.

-- 1) Judgements table (audit + label pairing). One judgement per note (idempotent upsert).
CREATE TABLE IF NOT EXISTS public.scf_note_judgements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id       uuid NOT NULL REFERENCES public.scf_learner_notes(id) ON DELETE CASCADE,
  verdict       text NOT NULL CHECK (verdict IN ('auto_safe','needs_human','likely_unsafe')),
  confidence    numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  safety_flags  jsonb NOT NULL DEFAULT '[]'::jsonb,
  reasons       jsonb NOT NULL DEFAULT '[]'::jsonb,
  model         text,
  threshold_ver text,
  auto_approved boolean NOT NULL DEFAULT false,   -- always false in shadow; set only by a later graduated phase
  human_action  text CHECK (human_action IS NULL OR human_action IN ('approve','reject')),
  human_by      uuid,
  human_at      timestamptz,
  agreed        boolean,                           -- judge auto_safe == human approve (the learning signal)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scf_note_judgements_note ON public.scf_note_judgements(note_id);
CREATE INDEX IF NOT EXISTS idx_scf_note_judgements_verdict ON public.scf_note_judgements(verdict);

-- RLS on, NO policies → deny-all to session clients; access only via SECDEF RPCs / service_role.
-- (mirrors scf_learner_notes, which also has no policies and is reached only through fn_scf_* RPCs.)
ALTER TABLE public.scf_note_judgements ENABLE ROW LEVEL SECURITY;

-- 2) Record RPC — the cron (service_role) persists a judge verdict. Idempotent per note.
CREATE OR REPLACE FUNCTION public.fn_scf_record_note_judgement(
  p_note_id uuid,
  p_verdict text,
  p_confidence numeric,
  p_safety_flags jsonb DEFAULT '[]'::jsonb,
  p_reasons jsonb DEFAULT '[]'::jsonb,
  p_model text DEFAULT NULL,
  p_threshold_ver text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_verdict NOT IN ('auto_safe','needs_human','likely_unsafe') THEN
    RAISE EXCEPTION 'fn_scf_record_note_judgement: bad verdict %', p_verdict;
  END IF;
  INSERT INTO public.scf_note_judgements (note_id, verdict, confidence, safety_flags, reasons, model, threshold_ver)
  VALUES (p_note_id, p_verdict, GREATEST(0, LEAST(1, p_confidence)),
          COALESCE(p_safety_flags, '[]'::jsonb), COALESCE(p_reasons, '[]'::jsonb), p_model, p_threshold_ver)
  ON CONFLICT (note_id) DO UPDATE SET
    verdict=EXCLUDED.verdict, confidence=EXCLUDED.confidence, safety_flags=EXCLUDED.safety_flags,
    reasons=EXCLUDED.reasons, model=EXCLUDED.model, threshold_ver=EXCLUDED.threshold_ver, updated_at=now()
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
-- service_role ONLY: this RPC is called solely by the scf-note-judge cron (service_role,
-- which bypasses grants). Granting authenticated would let any user forge/overwrite a
-- verdict for any note_id (poisoning the learning signal + suppressing the real judge).
REVOKE EXECUTE ON FUNCTION public.fn_scf_record_note_judgement(uuid,text,numeric,jsonb,jsonb,text,text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_record_note_judgement(uuid,text,numeric,jsonb,jsonb,text,text) TO service_role;

-- 3) Awaiting-judgement RPC — draft notes with no judgement yet (the cron's work list).
CREATE OR REPLACE FUNCTION public.fn_scf_notes_awaiting_judgement(p_limit int DEFAULT 50)
RETURNS TABLE(id uuid, note text, net_decline smallint, course_code text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
    SELECT n.id, n.note, n.net_decline, n.course_code
    FROM public.scf_learner_notes n
    WHERE n.status = 'draft'
      AND NOT EXISTS (SELECT 1 FROM public.scf_note_judgements j WHERE j.note_id = n.id)
    ORDER BY n.generated_at ASC
    LIMIT GREATEST(1, LEAST(500, p_limit));
END; $$;
-- service_role ONLY: called solely by the cron. This SECDEF fn bypasses RLS and returns
-- verbatim draft support-note text (sensitive learner PII); granting authenticated would let
-- any logged-in user of any tenant exfiltrate it system-wide.
REVOKE EXECUTE ON FUNCTION public.fn_scf_notes_awaiting_judgement(int) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_notes_awaiting_judgement(int) TO service_role;

-- 4) AI job type — the shadow judge, on the ₹0 Max lane (near-copy of scf.suggest_improvement config).
INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target, interactive, lane, allow_rule, max_inflight, schedulable, enabled, input_schema, expected_seconds, external_allowed)
VALUES
  ('scf.note_safety_judge',
   'SCF — Struggling-note safety judge (shadow)',
   'SHADOW judge for the self-improving note-safety loop. Scores whether an AI-drafted struggling-student support note is safe to release. Returns strict JSON {verdict,confidence,safety_flags,reasons}. RECOMMENDATION-ONLY — never changes note status; predictions stored via fn_scf_record_note_judgement into scf_note_judgements for human-agreement measurement. Crisis/self-harm => needs_human, never auto_safe. Auto-approval belongs to a later graduated phase only.',
   '{{prompt}}', 'none', 'job.result', false, 'max', 'seat_owner', 3, true, true,
   '[{"key":"prompt","type":"textarea","label":"Assembled prompt","required":true}]'::jsonb, 30, false)
ON CONFLICT (job_type) DO UPDATE SET
  title=EXCLUDED.title, description=EXCLUDED.description, prompt_template=EXCLUDED.prompt_template,
  tool_set=EXCLUDED.tool_set, output_target=EXCLUDED.output_target, interactive=EXCLUDED.interactive,
  lane=EXCLUDED.lane, allow_rule=EXCLUDED.allow_rule, max_inflight=EXCLUDED.max_inflight,
  schedulable=EXCLUDED.schedulable, enabled=EXCLUDED.enabled, input_schema=EXCLUDED.input_schema,
  expected_seconds=EXCLUDED.expected_seconds, external_allowed=EXCLUDED.external_allowed, updated_at=now();

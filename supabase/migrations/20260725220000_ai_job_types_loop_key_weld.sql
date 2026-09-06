-- APPLIED to prod 2026-07-25 directly via Supabase Mgmt API, Director-approved ("go").
-- Rolled-back-validated before apply (col=1 mapped=22 unclaimed=28 bad_fk=0). This file is the RECORD.
-- Loops->graphs WELD: every job type may declare the governance loop it serves. Additive + nullable.
ALTER TABLE public.ai_job_types ADD COLUMN IF NOT EXISTS loop_key text REFERENCES public.loop_registry(loop_key);
COMMENT ON COLUMN public.ai_job_types.loop_key IS
 'Which loop_registry loop this job type serves (loops->graphs weld, 2026-07-25). NULL = unclaimed. Seeded only where the association is certain.';
UPDATE public.ai_job_types SET loop_key = 'bug-triage', updated_at = now() WHERE job_type IN
 ('bug.triage','bug.reverify','bug.categorize','bug.cluster_fix','bug.duplicate_check','bug.fixability','bug.suggest_fix','bug.summarize');
UPDATE public.ai_job_types SET loop_key = 'scf-note-safety', updated_at = now() WHERE job_type IN
 ('scf.note_safety_judge','scf.learner_notes');
UPDATE public.ai_job_types SET loop_key = 'scf-freetext-carry', updated_at = now() WHERE job_type = 'scf.freetext_carry';
UPDATE public.ai_job_types SET loop_key = 'scf', updated_at = now() WHERE job_type IN
 ('scf.generate_suggestions','scf.suggest_improvement','scf.suggest_success','scf.judge_help_ask',
  'session_feedback.escalation','session_feedback.suggest_improvement');
UPDATE public.ai_job_types SET loop_key = 'induction-playbook', updated_at = now() WHERE job_type = 'induction.generate_playbook';
UPDATE public.ai_job_types SET loop_key = 'induction-session', updated_at = now() WHERE job_type = 'induction.session_effectiveness';
UPDATE public.ai_job_types SET loop_key = 'ai-pulse', updated_at = now() WHERE job_type IN
 ('ai_pulse.anomaly_detection','ai_pulse.domain_starter','ai_pulse.prompt_grade');

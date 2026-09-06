-- APPLIED to prod 2026-07-19 (late evening) directly via Supabase Mgmt API, Director-approved.
-- Rolled-back-validated before apply. This file is the RECORD of what already ran (do not re-apply blindly).
-- Part 1: register 3 loops + owner on all rows. Part 2: counter_metric column + loop_conflicts table (C1 seeded).
ALTER TABLE public.loop_registry ADD COLUMN IF NOT EXISTS counter_metric text;
COMMENT ON COLUMN public.loop_registry.counter_metric IS
 'The independent number that catches this loop''s cheap win (Goodhart pair). Convention 2026-07-19: the m gate may not be set "on" unless counter_metric is named AND measured. NULL = unpaired (honest).';
UPDATE public.loop_registry SET counter_metric = 'reporter thumbs-up/down on resolution emails (outcome ledger)', updated_at = now()
 WHERE loop_key = 'bug-triage';
UPDATE public.loop_registry SET counter_metric = 'measured outcome delta vs baseline (suggestions; ~4 measured, confound check due at 10)', updated_at = now()
 WHERE loop_key = 'scf';
CREATE TABLE IF NOT EXISTS public.loop_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conflict_key text UNIQUE NOT NULL,
  title text NOT NULL,
  loops text[] NOT NULL,
  description text NOT NULL,
  arbiter_email text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','ruled','resolved')),
  ruling text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.loop_conflicts IS
 'Arbitration home for cross-loop conflicts (loops->graphs upgrade #3, 2026-07-19). Reads: admin only. Writes: governance only (service_role / Mgmt API - no client write policies by design).';
ALTER TABLE public.loop_conflicts ENABLE ROW LEVEL SECURITY;
DO $POL$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='loop_conflicts' AND policyname='loop_conflicts_select_admin') THEN
    CREATE POLICY "loop_conflicts_select_admin" ON public.loop_conflicts FOR SELECT USING (is_super_admin() OR is_admin());
  END IF;
END $POL$;
INSERT INTO public.loop_conflicts (conflict_key, title, loops, description, arbiter_email, status) VALUES
('C1-appraisal-feedback-wire',
 'Appraisal grades careers on the same sensor four SCF loops trust',
 ARRAY['faculty-appraisal','scf','scf-note-safety','scf-freetext-carry'],
 'faculty-appraisal (M12) grades Senior Learners on session_feedback understood-scores - the SAME wire the SCF teaching, note-safety and free-text loops treat as honest learner signal. Career pressure on the sensor creates an incentive to game it, which would corrupt every loop reading it. feedback_improvement delta is NOT an independent counter (same wire). Flagged by loop-graph audit 2026-07-19; no mitigation designed yet.',
 'aieee@jkkn.ac.in', 'open')
ON CONFLICT (conflict_key) DO NOTHING;

-- APPLIED to prod 2026-07-19 (late evening) directly via Supabase Mgmt API, Director-approved.
-- Two batches, each validated in a rolled-back txn before apply. This file is the record of what ran.
-- Part 1: register 3 invisible loops + owner on all rows. Part 2: counter_metric column + loop_conflicts table (C1 seeded).
-- Ship to jicate/main with the quiet-period cleanup PR (~29-30 Jul).

-- ============ PART 1: visibility + ownership ============
-- Loop-graph audit first move (2026-07-19, Director-approved):
-- register the 3 highest-activity unregistered loops + set a human owner on every loop.
-- Honest starting state: loop_class='intake', all gates OFF — nothing earned through the registry yet.
INSERT INTO loop_registry (loop_key, name, stack_tier, loop_class, domain, description, gates, routine_id, is_active, owner_email) VALUES
('faculty-appraisal', 'Senior Learner (faculty) appraisal -> work-signals', 3, 'intake', 'people',
 'Quarterly 13-metric appraisal captured as work signals via okr_metric_registry (M4 initiatives + M12 feedback understood/delta LIVE; M6 mentorship pending). UNPAIRED: no counter-metric on gaming; M12 rides a fragile email bridge; hr_performance_reviews (human ratification) has 0 rows. Registered 2026-07-19 by loop-graph audit - gates OFF until earned.',
 '{"a":"off","f":"off","g":"off","m":"off"}', NULL, true, 'aieee@jkkn.ac.in'),
('scf-note-safety', 'SCF note-safety judge (shadow)', 3, 'intake', 'academic',
 'Watching loop paired with the scf.learner_notes writer: judges every draft (auto_safe/needs_human/likely_unsafe). SHADOW - never mutates status; may never auto-reject; crisis -> human immediately. 369 predictions, 0 human labels - cannot calibrate; must not graduate until agreement is measured on regenerated notes (spec PR-3/PR-4). Registered 2026-07-19 by loop-graph audit.',
 '{"a":"off","f":"off","g":"off","m":"off"}', NULL, true, 'aieee@jkkn.ac.in'),
('scf-freetext-carry', 'SCF free-text carry-forward', 3, 'intake', 'academic',
 'Grounding loop: the learner''s own free-text words are re-asked at the next session (8-decision interview design). Live on the Rs0 jobs lane since 2026-07-19 (214 jobs day one). Registered 2026-07-19 by loop-graph audit - gates OFF until its measured cycle is verified.',
 '{"a":"off","f":"off","g":"off","m":"off"}', NULL, true, 'aieee@jkkn.ac.in');

UPDATE loop_registry SET owner_email = 'aieee@jkkn.ac.in', updated_at = now() WHERE owner_email IS NULL;

-- ============ PART 2: pairing column + arbitration home ============
-- Loop-graph edges v1 (2026-07-19, Director-approved "build all 3 now"):
-- (1) counter_metric column on loop_registry -- the Goodhart pairing made structural
-- (2) loop_conflicts table + C1 seeded -- the arbitration home
ALTER TABLE public.loop_registry ADD COLUMN IF NOT EXISTS counter_metric text;
COMMENT ON COLUMN public.loop_registry.counter_metric IS
 'The independent number that catches this loop''s cheap win (Goodhart pair). Convention 2026-07-19: the m gate may not be set "on" unless counter_metric is named AND measured. NULL = unpaired (honest).';

UPDATE public.loop_registry SET counter_metric = 'reporter thumbs-up/down on resolution emails (outcome ledger)', updated_at = now()
 WHERE loop_key = 'bug-triage';
UPDATE public.loop_registry SET counter_metric = 'measured outcome delta vs baseline (suggestions; ~4 measured, confound check due at 10)', updated_at = now()
 WHERE loop_key = 'scf';

CREATE TABLE public.loop_conflicts (
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
CREATE POLICY "loop_conflicts_select_admin" ON public.loop_conflicts
  FOR SELECT USING (is_super_admin() OR is_admin());

INSERT INTO public.loop_conflicts (conflict_key, title, loops, description, arbiter_email, status) VALUES
('C1-appraisal-feedback-wire',
 'Appraisal grades careers on the same sensor four SCF loops trust',
 ARRAY['faculty-appraisal','scf','scf-note-safety','scf-freetext-carry'],
 'faculty-appraisal (M12) grades Senior Learners on session_feedback understood-scores - the SAME wire the SCF teaching, note-safety and free-text loops treat as honest learner signal. Career pressure on the sensor creates an incentive to game it, which would corrupt every loop reading it. feedback_improvement delta is NOT an independent counter (same wire). Flagged by loop-graph audit 2026-07-19; no mitigation designed yet.',
 'aieee@jkkn.ac.in', 'open');

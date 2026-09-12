-- =============================================================================
-- OneMark — the drafter puts the right answer first every time
-- File: 20260918160000_onemark_answer_position_bias.sql
-- Date: 2026-09-10
--
-- MEASURED ON PRODUCTION 2026-09-10. AI drafting was proven end to end on
-- 09-08 (job fac380b1 inserted 5 items, all approved and now live). Reading
-- what it actually produced:
--
--   c20d867f  electrostatic force …            answer {"correct":"A"}
--   7518b77b  electric field E …               answer {"correct":"A"}
--   7946106b  electric potential V …           answer {"correct":"A"}
--   f0d484aa  capacitance C …                  answer {"correct":"A"}
--   8da392a0  electrostatic potential energy … answer {"correct":"A"}
--
-- Five of five. By chance that is 1 in 1,024, so it is the model's habit, not
-- luck: asked for four options with one correct, it writes the correct one
-- first. Nothing downstream corrects it —
--   * the prompt_template never asks for the correct option to move (checked:
--     no 'vary', no 'random', no 'position of the correct');
--   * options are only reordered when a paper sets config.shuffle_options
--     = true, and BOTH standing practice pools (31dd445e tn_hsc_physics,
--     ad5ce2c8 tn_hsc_english) have it NULL.
--
-- So on /foundation/onemark/practice — the surface every learner uses — a
-- learner who always taps the first option scores 100%. That silently destroys
-- what the bank measures, and it gets worse with every drafted item, which is
-- why this is worth a migration rather than a note.
--
-- TWO INDEPENDENT FIXES, because either alone leaves a hole:
--   (1) SOURCE — the prompt now requires the correct option to be spread across
--       A, B, C and D across a batch, and says outright that putting it first
--       every time makes the bank worthless. Fixes new items; cannot fix the
--       five already in the bank.
--   (2) SERVE — the two standing practice pools get shuffle_options = true, so
--       the order is randomised per sitting whatever the stored position is.
--       Fixes existing AND future items, on the surface that matters most.
--       Safe: shuffleOptionsTogether (lib/services/onemark/attempt-server.ts)
--       reorders by key and carries options_ta across by the same key, with a
--       test asserting the Tamil list keeps its pairing and a null Tamil list
--       stays null. It is what live papers already use.
--
-- Additive: two UPDATEs on config rows plus an asserting DO block. No schema
-- change, no policy change, nothing deleted, and the drafting instructions are
-- appended to, never rewritten.
--
-- NOT DONE HERE, needs a human: the five live items still have their correct
-- option first in storage. Shuffling hides that at serve time; only re-writing
-- the rows (or re-drafting) removes it. Left alone because they are approved
-- content and rewriting an approved question is a Senior Learner's call.
--
-- Rollback:
--   UPDATE public.ai_job_types SET prompt_template = replace(prompt_template,
--     chr(10) || chr(10) || 'ANSWER POSITION' || …, '') WHERE job_type = 'onemark.item_draft';
--   UPDATE public.fp_assessments SET config = config - 'shuffle_options'
--    WHERE id IN ('31dd445e-…','ad5ce2c8-…');  -- ids read at apply time
-- =============================================================================

-- 1. SOURCE — tell the drafter to move the correct option around ---------------
UPDATE public.ai_job_types
   SET prompt_template = prompt_template || chr(10) || chr(10) ||
       'ANSWER POSITION — this is a hard requirement, not a preference. Across the items in one run, spread the correct option evenly over A, B, C and D. Do NOT make A correct every time, or even most of the time: a bank whose answer is always in the same place measures nothing, because a learner scores full marks by tapping the first option without reading. Decide each item''s correct letter before you write the distractors, and vary it.',
       updated_at = now()
 WHERE job_type = 'onemark.item_draft'
   AND position('ANSWER POSITION' in prompt_template) = 0;

-- 2. SERVE — randomise option order in the standing practice pools -------------
UPDATE public.fp_assessments a
   SET config = coalesce(a.config, '{}'::jsonb) || '{"shuffle_options": true}'::jsonb,
       updated_at = now()
  FROM public.exam_definitions e
 WHERE e.id = a.exam_definition_id
   AND e.config_key IN ('tn_hsc_physics', 'tn_hsc_english')
   AND a.kind = 'practice'
   AND coalesce(a.config->>'pool', 'false') = 'true'
   AND coalesce(a.config->>'shuffle_options', 'false') <> 'true';

DO $chk$
DECLARE
  v_tpl   text;
  v_pools int;
  v_open  int;
BEGIN
  SELECT prompt_template INTO v_tpl FROM public.ai_job_types WHERE job_type = 'onemark.item_draft';
  IF v_tpl IS NULL THEN
    RAISE EXCEPTION 'onemark.item_draft is missing — 20260918101500 must be applied first';
  END IF;
  IF position('ANSWER POSITION' in v_tpl) = 0 THEN
    RAISE EXCEPTION 'the answer-position instruction is not in the prompt';
  END IF;
  -- the instructions this file must not have damaged
  IF position('"correct":' in v_tpl) = 0
     OR position('is_active=false' in v_tpl) = 0
     OR position('shortfall_reason' in v_tpl) = 0
     OR (SELECT count(*) FROM regexp_matches(v_tpl, '\{\{prompt\}\}', 'g')) <> 1 THEN
    RAISE EXCEPTION 'the drafting instructions or the prompt slot were damaged';
  END IF;

  SELECT count(*) INTO v_pools
    FROM public.fp_assessments a JOIN public.exam_definitions e ON e.id = a.exam_definition_id
   WHERE e.config_key IN ('tn_hsc_physics', 'tn_hsc_english')
     AND a.kind = 'practice' AND coalesce(a.config->>'pool','false') = 'true';
  SELECT count(*) INTO v_open
    FROM public.fp_assessments a JOIN public.exam_definitions e ON e.id = a.exam_definition_id
   WHERE e.config_key IN ('tn_hsc_physics', 'tn_hsc_english')
     AND a.kind = 'practice' AND coalesce(a.config->>'pool','false') = 'true'
     AND coalesce(a.config->>'shuffle_options','false') <> 'true';
  IF v_pools < 2 THEN
    RAISE EXCEPTION 'expected both standing practice pools, found %', v_pools;
  END IF;
  IF v_open > 0 THEN
    RAISE EXCEPTION '% practice pool(s) still serve options in stored order', v_open;
  END IF;

  -- nothing outside this file's scope moved
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_job_types
     WHERE job_type = 'onemark.item_draft' AND enabled AND lane = 'max'
       AND output_target = 'job.result' AND monthly_spend_cap_inr = 5000
       AND allow_rule = 'permission:foundation.items.manage'
  ) THEN
    RAISE EXCEPTION 'a field outside this file''s scope changed on the job type row';
  END IF;
END
$chk$;

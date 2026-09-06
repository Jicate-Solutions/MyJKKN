-- =============================================================================
-- OneMark AI drafting — put the run's data in the ONE slot the runner fills
-- File: 20260918150000_onemark_item_draft_prompt_slot.sql
-- Date: 2026-09-06 (Director ruling, 20:5x IST: "fix it properly")
--
-- THIRD AND FINAL BREAK ON THIS PATH, measured end to end today:
--   1. output_target 'table:fp_items'  → runner refused the job outright.
--      Fixed by 20260918140000 (applied 10:23 IST). Job then reached the model.
--   2. The model answered: "I don't see the actual input payload — the message
--      says 'The payload for this run:' but no JSON follows it."
--      (ai_jobs 1096542b, 06:09Z.) The template's {{payload}} slot is NOT one
--      the Max seat runner substitutes.
--   3. A follow-up attempt nested the fields under _ctx (PR #3314) and the
--      runner rejected the job before the model saw it:
--      "missing required input(s): exam_definition_id, tag_keys, count,
--      bloom_level" (ai_jobs bbbf0cbc, 13:39Z, runner 'windows').
--
-- SO THE RUNNER'S CONTRACT IS: it VALIDATES the job type's input_schema keys at
-- the TOP LEVEL of the payload, and it SUBSTITUTES exactly one slot, {{prompt}},
-- from payload.prompt. It fills no other slot. Read live 2026-09-06, all five
-- other working Max-lane job types agree and none deviates:
--
--   job_type                            input_schema   template slots
--   ai_pulse.domain_starter             [prompt]       {{prompt}}
--   loops.charter_draft                 [prompt]       {{prompt}}
--   accreditation.naac_narrative_draft  [prompt]       {{prompt}}
--   learner.360_verdict                 [prompt]       {{prompt}}
--   improvement.rank_ideas              [prompt]       {{prompt}}
--   onemark.item_draft                  [5 fields]     {{payload}} + {{prompt}}   ← the odd one out
--
-- The estate's pattern is that the SENDER composes the run's data into the
-- prompt text; the structured fields ride along for the collector, not for the
-- model. This file makes onemark.item_draft the sixth job type that follows it.
--
--   (a) input_schema  → a single required `prompt` field, so the runner's
--       validation passes and the admin Run card renders a box that actually
--       reaches the model (its old 5-field form produced a payload with no
--       `prompt` at all, so the card could never have worked either).
--   (b) prompt_template → the "The payload for this run:" block now reads
--       {{prompt}}, and the redundant trailing {{prompt}} is removed, leaving
--       EXACTLY ONE slot. Not one word of the drafting instructions changes.
--
-- The companion app change (same PR) composes the six fields as JSON into
-- payload.prompt and keeps them under payload._ctx, which is where the collect
-- pass already reads them (parsePayload, merged 2026-09-06).
--
-- Additive: one UPDATE on a config row + an asserting DO block. No schema
-- change, no policy change, nothing deleted, no drafting rule altered.
--
-- Rollback:
--   restore the row's input_schema and prompt_template from 20260918101500 §6
--   (which is the state this file corrects, and which never reached the model).
-- =============================================================================

UPDATE public.ai_job_types
   SET input_schema = '[{"key":"prompt","type":"textarea","label":"Drafting request — the JSON payload for this run (exam_definition_id, exam_key, topic_id, tag_keys, count, bloom_level)","required":true}]'::jsonb,
       prompt_template = rtrim(
         regexp_replace(
           replace(prompt_template, 'The payload for this run:' || chr(10) || '{{payload}}',
                                    'The payload for this run:' || chr(10) || '{{prompt}}'),
           chr(10) || '+\{\{prompt\}\}\s*$', ''
         )
       ),
       updated_at = now()
 WHERE job_type = 'onemark.item_draft';

DO $chk$
DECLARE
  v public.ai_job_types%ROWTYPE;
  v_slots int;
BEGIN
  SELECT * INTO v FROM public.ai_job_types WHERE job_type = 'onemark.item_draft';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'onemark.item_draft is missing — 20260918101500 must be applied first';
  END IF;

  -- exactly one slot, and it is {{prompt}}
  IF position('{{payload}}' in v.prompt_template) > 0 THEN
    RAISE EXCEPTION 'the template still carries a {{payload}} slot the runner never fills';
  END IF;
  SELECT count(*) INTO v_slots FROM regexp_matches(v.prompt_template, '\{\{prompt\}\}', 'g');
  IF v_slots <> 1 THEN
    RAISE EXCEPTION 'expected exactly one {{prompt}} slot, found %', v_slots;
  END IF;

  -- input_schema is the single prompt field the runner validates
  IF jsonb_array_length(v.input_schema) <> 1
     OR v.input_schema->0->>'key' <> 'prompt'
     OR (v.input_schema->0->>'required')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'input_schema is not a single required prompt field: %', v.input_schema;
  END IF;

  -- the drafting instructions themselves must survive untouched
  IF position('"correct":' in v.prompt_template) = 0
     OR position('is_active=false' in v.prompt_template) = 0
     OR position('shortfall_reason' in v.prompt_template) = 0 THEN
    RAISE EXCEPTION 'the drafting instructions were damaged by the rewrite';
  END IF;

  -- everything else on the row is unchanged
  IF NOT v.enabled OR v.lane IS DISTINCT FROM 'max'
     OR v.output_target IS DISTINCT FROM 'job.result'
     OR v.monthly_spend_cap_inr IS DISTINCT FROM 5000
     OR v.allow_rule IS DISTINCT FROM 'permission:foundation.items.manage' THEN
    RAISE EXCEPTION 'a field outside this file''s scope changed: enabled=% lane=% target=% cap=% allow=%',
      v.enabled, v.lane, v.output_target, v.monthly_spend_cap_inr, v.allow_rule;
  END IF;
END
$chk$;

-- =============================================================================
-- OneMark AI drafting — make the DOCUMENTED input shape match the REAL one
-- File: 20261120150000_onemark_item_draft_contract_labels.sql
-- Date: 2026-09-08
--
-- WHY. PR #3378 (merged 2026-09-08) started sending READABLE NAMES beside the
-- ids, because with a bare uuid the model refused to draft rather than guess:
--
--   "I have no way to resolve topic_id: 2fad3ea2-… to an actual TN HSC Physics
--    chapter … the rules require every item to stay strictly inside the correct
--    textbook unit's content, so I need to know which chapter this is."
--   (ai_jobs e81294c6, 2026-09-06 16:11Z)
--
-- So `payload.prompt` now carries exam_label, topic_label and tag_labels on top
-- of the six machine fields. But TWO places still describe the old ids-only
-- shape, and the model reads both of them:
--
--   (a) prompt_template's own "INPUT (JSON):" line, which enumerates exactly six
--       keys and stops. This is the more serious of the two — it is inside the
--       text the model is given, so the model is told the input has six keys and
--       then handed nine.
--   (b) input_schema[0].label, which the /admin/ai-models Run card renders.
--
-- MEASURED, not assumed: on 2026-09-08 08:1xZ a run with the labels present but
-- this template unchanged drafted 5 valid items, 0 rejected (ai_jobs fac380b1).
-- So this mismatch is NOT what blocks drafting — the model reads past it. This
-- migration is therefore a CONTRACT-HYGIENE fix, not a bug fix: it stops the
-- documented shape from drifting further from the real one, which is precisely
-- how the four earlier breaks on this path stayed invisible.
--
-- A THIRD drift is fixed in the same string: the template tells the model the
-- runner writes source='ai', but lib/services/onemark/draft-contract.ts
-- (toDraftRow) writes source='ai_generated'. The code is authoritative; the
-- sentence was wrong.
--
-- NOT ONE WORD of the drafting RULES, the OUTPUT contract, or the bilingual and
-- JABT requirements changes. Every edit below is a targeted replace() and each
-- one is ASSERTED, so a template that has moved on since this was written fails
-- the migration loudly instead of silently doing nothing.
-- =============================================================================

DO $$
DECLARE
  v_tmpl      text;
  v_new       text;
  v_old_input text := 'INPUT (JSON): {"exam_definition_id": uuid, "exam_key": "tn_hsc_physics" | "tn_hsc_english", "topic_id": uuid or null, "tag_keys": [category tag keys], "count": N, "bloom_level": "K1".."K6"}';
  v_new_input text := 'INPUT (JSON): {"exam_definition_id": uuid, "exam_key": "tn_hsc_physics" | "tn_hsc_english", "topic_id": uuid or null, "tag_keys": [category tag keys], "count": N, "bloom_level": "K1".."K6", "exam_label": "the subject''s readable name", "topic_label": "the unit''s readable name, or null", "tag_labels": [readable tag names, in the same order as tag_keys]}
The *_label fields NAME what the ids point at. Draft for the unit named in `topic_label`; the uuids are identifiers only and carry no meaning you can use.';
  v_old_unit  text := 'Every item must belong to the given unit (topic_id; when null the item is chapter-agnostic';
  v_new_unit  text := 'Every item must belong to the given unit (named by `topic_label`, identified by `topic_id`; when both are null the item is chapter-agnostic';
  v_old_src   text := 'source=''ai''';
  v_new_src   text := 'source=''ai_generated''';
BEGIN
  SELECT prompt_template INTO v_tmpl
  FROM public.ai_job_types WHERE job_type = 'onemark.item_draft';

  IF v_tmpl IS NULL THEN
    RAISE EXCEPTION 'onemark.item_draft has no row in ai_job_types — nothing to update';
  END IF;

  -- (a) the INPUT line the model reads
  IF position(v_old_input IN v_tmpl) = 0 THEN
    RAISE EXCEPTION 'prompt_template no longer contains the expected "INPUT (JSON):" line — refusing to guess';
  END IF;
  v_new := replace(v_tmpl, v_old_input, v_new_input);

  -- (b) the on-unit RULE, so the label is what the rule points at
  IF position(v_old_unit IN v_new) = 0 THEN
    RAISE EXCEPTION 'prompt_template no longer contains the expected on-unit rule — refusing to guess';
  END IF;
  v_new := replace(v_new, v_old_unit, v_new_unit);

  -- (c) source: the code writes 'ai_generated', not 'ai'
  IF position(v_old_src IN v_new) = 0 THEN
    RAISE EXCEPTION 'prompt_template no longer contains the expected source= sentence — refusing to guess';
  END IF;
  v_new := replace(v_new, v_old_src, v_new_src);

  -- EXACTLY ONE {{prompt}} slot must survive; the runner fills no other.
  IF (length(v_new) - length(replace(v_new, '{{prompt}}', ''))) / length('{{prompt}}') <> 1 THEN
    RAISE EXCEPTION 'prompt_template must contain exactly one {{prompt}} slot after this edit';
  END IF;
  IF position('{{payload}}' IN v_new) > 0 THEN
    RAISE EXCEPTION '{{payload}} is not a slot the Max seat runner fills — it must not reappear';
  END IF;

  UPDATE public.ai_job_types
  SET prompt_template = v_new,
      input_schema = jsonb_build_array(
        jsonb_build_object(
          'key', 'prompt',
          'type', 'textarea',
          'required', true,
          'label', 'Drafting request — the JSON payload for this run (exam_definition_id, exam_key, topic_id, tag_keys, count, bloom_level, plus the readable names exam_label, topic_label, tag_labels)'
        )
      ),
      updated_at = now()
  WHERE job_type = 'onemark.item_draft';

  RAISE NOTICE 'onemark.item_draft: documented input shape now matches what buildDraftPayload sends';
END $$;

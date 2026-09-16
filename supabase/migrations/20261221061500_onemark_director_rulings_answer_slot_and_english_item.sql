-- OneMark: two Director rulings on live bank data (2026-09-16, 06:15 IST, session d5ae90b7 successor).
--
-- Ruling 1 — answer-slot bias. The five AI-drafted Physics items in the OneMark bank
-- (exam definition b72a99f1…) all stored the correct answer as option A. Learners have
-- not seen that since #3653 shuffles at serve time, but the stored key is what any
-- future "which slot is correct" or distractor report reads. Ruling: re-order the
-- stored options. Mechanism: for each item, SWAP the option at slot A with the option
-- at a chosen slot (B/C/D/B/C), English and Tamil together, keys stay in place, and
-- re-key the answer. Every stored learner pick on that item (fp_responses.chosen) is
-- shifted by the SAME swap, so each past answer still points at the text the learner
-- actually chose; is_correct is untouched (already graded, still true).
--
-- Ruling 2 — item 14fd6c5d ("who are the two gentlemen?", English bank b10e68b1…):
-- two options only, no Tamil, no explanation, no source, no author, is_active = true.
-- Ruling: take it off the live bank. The row stays so its author can finish it and a
-- Senior Learner can switch it back on.
--
-- Idempotent: ruling 1 acts only while the item still keys A and is active; ruling 2
-- only while the row is still active. A second run is a no-op on both. Applied to
-- production by hand on 2026-09-16 via the Management API (rehearsed BEGIN…ROLLBACK
-- first); this file is the repo's record and re-applies as a no-op.
--
-- Checked before writing (live, 2026-09-16 06:10 IST): 4 sittings, all submitted;
-- 0 in-progress attempts; 20 responses on the five items, all graded; 0 responses on
-- 14fd6c5d; 0 item change requests; explanations mention no option letter; the only
-- letter-keyed stores are fp_items.options / options_ta / answer and fp_responses.chosen.

DO $$
DECLARE
  v_targets constant jsonb := '{
    "7518b77b-61a8-449d-a1a9-1dfa49c8ed16": "B",
    "7946106b-9efb-4d34-bd96-3f233c62b5f5": "C",
    "8da392a0-342c-4029-96dc-b1ba149e91f0": "D",
    "c20d867f-43b5-4e92-97b5-6bfb37d6a7d6": "B",
    "f0d484aa-251f-412b-8b54-b807817dd569": "C"
  }'::jsonb;
  v_id     uuid;
  v_to     text;
  v_item   public.fp_items%ROWTYPE;
  v_opts   jsonb;
  v_opts_ta jsonb;
  v_swapped integer := 0;
BEGIN
  FOR v_id, v_to IN SELECT (key)::uuid, value #>> '{}' FROM jsonb_each(v_targets) LOOP
    SELECT * INTO v_item FROM public.fp_items WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE NOTICE 'onemark ruling 1: item % not found, skipped', v_id;
      CONTINUE;
    END IF;
    IF NOT v_item.is_active OR v_item.answer ->> 'correct' IS DISTINCT FROM 'A' THEN
      RAISE NOTICE 'onemark ruling 1: item % keys % (active=%), already handled, skipped',
        v_id, v_item.answer ->> 'correct', v_item.is_active;
      CONTINUE;
    END IF;
    -- Both language lists must carry slot A and the target slot, or the swap is unsafe.
    IF NOT (v_item.options @> jsonb_build_array(jsonb_build_object('key','A'))
        AND v_item.options @> jsonb_build_array(jsonb_build_object('key',v_to))) THEN
      RAISE EXCEPTION 'onemark ruling 1: item % lacks slot A or % in options', v_id, v_to;
    END IF;
    IF v_item.options_ta IS NOT NULL AND NOT (
           v_item.options_ta @> jsonb_build_array(jsonb_build_object('key','A'))
       AND v_item.options_ta @> jsonb_build_array(jsonb_build_object('key',v_to))) THEN
      RAISE EXCEPTION 'onemark ruling 1: item % lacks slot A or % in options_ta', v_id, v_to;
    END IF;

    -- Swap everything except the key between slot A and the target slot (array order kept).
    SELECT jsonb_agg(
             CASE
               WHEN o ->> 'key' = 'A'  THEN (SELECT x FROM jsonb_array_elements(v_item.options) x WHERE x ->> 'key' = v_to) || jsonb_build_object('key','A')
               WHEN o ->> 'key' = v_to THEN (SELECT x FROM jsonb_array_elements(v_item.options) x WHERE x ->> 'key' = 'A')  || jsonb_build_object('key',v_to)
               ELSE o
             END ORDER BY ord)
      INTO v_opts
      FROM jsonb_array_elements(v_item.options) WITH ORDINALITY t(o, ord);

    IF v_item.options_ta IS NOT NULL THEN
      SELECT jsonb_agg(
               CASE
                 WHEN o ->> 'key' = 'A'  THEN (SELECT x FROM jsonb_array_elements(v_item.options_ta) x WHERE x ->> 'key' = v_to) || jsonb_build_object('key','A')
                 WHEN o ->> 'key' = v_to THEN (SELECT x FROM jsonb_array_elements(v_item.options_ta) x WHERE x ->> 'key' = 'A')  || jsonb_build_object('key',v_to)
                 ELSE o
               END ORDER BY ord)
        INTO v_opts_ta
        FROM jsonb_array_elements(v_item.options_ta) WITH ORDINALITY t(o, ord);
    ELSE
      v_opts_ta := NULL;
    END IF;

    -- Stored learner picks follow the same swap so each still names the text chosen.
    UPDATE public.fp_responses
       SET chosen = CASE chosen #>> '{}'
                      WHEN 'A'  THEN to_jsonb(v_to)
                      WHEN v_to THEN to_jsonb('A'::text)
                      ELSE chosen
                    END
     WHERE item_id = v_id
       AND chosen #>> '{}' IN ('A', v_to);

    UPDATE public.fp_items
       SET options    = v_opts,
           options_ta = v_opts_ta,
           answer     = answer || jsonb_build_object('correct', v_to),
           updated_at = now()
     WHERE id = v_id;

    v_swapped := v_swapped + 1;
  END LOOP;
  RAISE NOTICE 'onemark ruling 1: % item(s) re-slotted', v_swapped;
END $$;

-- Ruling 2: off the live bank, row kept.
UPDATE public.fp_items
   SET is_active  = false,
       updated_at = now()
 WHERE id = '14fd6c5d-c6d5-42fd-a044-6a5c32aba89b'
   AND is_active;

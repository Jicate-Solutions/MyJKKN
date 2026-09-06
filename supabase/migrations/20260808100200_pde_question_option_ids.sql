-- ============================================================================
-- Migration: 20260808100200_pde_question_option_ids
-- Date: 2026-08-08
-- NOT APPLIED to any database — Director-gated apply.
-- ============================================================================
-- WHAT IS BROKEN
--   An MCQ option in pde_assessment_questions.options is expected to carry an
--   `id`. AI-drafted and PMS-imported options arrive with only `text`,
--   `feedback` and `is_correct`. A missing id breaks the learner path twice:
--
--   1. Submit is permanently disabled. MCQWarmupQuestion.tsx selects by
--      `selectedId === o.id`; with o.id undefined the selection never becomes
--      truthy, so the submit control can never enable. The learner is stuck on
--      the question with no way forward and no error explaining why.
--
--   2. Every answer grades wrong. fn_pde_mark_objective falls back to the
--      answer key embedded in options when correct_answer is empty:
--          SELECT elem->>'id' ... WHERE (elem->>'is_correct')::boolean IS TRUE
--      With no id that returns NULL, so correct_id is NULL and is_correct is
--      false for every option the learner could possibly pick.
--
-- FIX = a normaliser, not a constraint
--   A CHECK constraint would REJECT the AI/PMS insert and turn a silent defect
--   into a hard import failure. Filling the id instead makes the bad shape
--   impossible without breaking a single existing writer, so no route has to
--   change.
--
-- IDEMPOTENCE AND THE HAND-REPAIRED ROWS
--   Three questions were already repaired by hand on 2026-07-27 using ids
--   opt1..optN. The backfill only touches rows that still contain an option
--   with no non-empty id, so those three are not matched and not renumbered.
--   Re-running updates 0 rows.
--
--   Ids already present are reserved BEFORE any are generated, so a generated
--   id can never collide with one a human assigned (an array holding
--   ['a', <no id>, 'opt2'] gets 'opt2_2' for the gap, not a duplicate 'opt2').
--
--   Option `text`, `feedback` and `is_correct` are never read for a decision
--   and never written. The rebuild is `element || {"id": ...}`, which adds the
--   one missing key and preserves every other key's value exactly.
--
-- Contains NO BEGIN/COMMIT of its own, so wrapping the file in BEGIN..ROLLBACK
-- stays a genuine dry run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Pure normaliser
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_pde_normalize_question_option_ids(p_options jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_taken  text[] := '{}';
  v_used   text[] := '{}';
  v_out    jsonb  := '[]'::jsonb;
  v_elem   jsonb;
  v_ord    integer := 0;
  v_id     text;
  v_cand   text;
  v_suffix integer;
BEGIN
  -- Not an option array: hand it back untouched.
  IF p_options IS NULL OR jsonb_typeof(p_options) <> 'array' THEN
    RETURN p_options;
  END IF;

  -- Pass 1 — reserve every id already present, so nothing is renumbered and no
  -- generated id can collide with an existing one.
  FOR v_elem IN SELECT e FROM jsonb_array_elements(p_options) AS t(e) LOOP
    IF jsonb_typeof(v_elem) = 'object' THEN
      v_id := coalesce(v_elem ->> 'id', '');
      IF v_id <> '' THEN
        v_taken := v_taken || v_id;
      END IF;
    END IF;
  END LOOP;

  -- Pass 2 — fill gaps, preserving original order and all other keys.
  --
  -- A DUPLICATE id is treated as a gap, not as "already fine". Two options
  -- sharing 'opt1' break the learner path in exactly the way a missing id does:
  -- `selectedId === o.id` matches both, and the fn_pde_mark_objective answer-key
  -- fallback (LIMIT 1 over is_correct) can resolve to the wrong one. The FIRST
  -- occurrence keeps the id — so a correctly-formed array, including the three
  -- rows repaired by hand, is never renumbered — and each later collision is
  -- reassigned.
  FOR v_elem IN SELECT e FROM jsonb_array_elements(p_options) AS t(e) LOOP
    v_ord := v_ord + 1;

    IF jsonb_typeof(v_elem) <> 'object' THEN
      v_out := v_out || jsonb_build_array(v_elem);
      CONTINUE;
    END IF;

    v_id := coalesce(v_elem ->> 'id', '');
    IF v_id <> '' AND NOT (v_id = ANY (v_used)) THEN
      v_used := v_used || v_id;
      v_out  := v_out || jsonb_build_array(v_elem);
      CONTINUE;
    END IF;

    -- Empty id, or a repeat of one already used earlier in this array.
    v_cand   := 'opt' || v_ord;
    v_suffix := 1;
    WHILE v_cand = ANY (v_taken) OR v_cand = ANY (v_used) LOOP
      v_suffix := v_suffix + 1;
      v_cand   := 'opt' || v_ord || '_' || v_suffix;
    END LOOP;
    v_taken := v_taken || v_cand;
    v_used  := v_used  || v_cand;

    v_out := v_out || jsonb_build_array(v_elem || jsonb_build_object('id', v_cand));
  END LOOP;

  RETURN v_out;
END;
$fn$;

COMMENT ON FUNCTION public.fn_pde_normalize_question_option_ids(jsonb) IS
  'Returns pde_assessment_questions.options with a non-empty id on every object element. Ids already present are reserved first and never renumbered; text, feedback and is_correct are never altered. Non-array input is returned unchanged. Pure and idempotent: f(f(x)) = f(x).';

-- Pure helper over caller-supplied input, so it leaks nothing — but Supabase
-- default privileges hand anon EXECUTE on every new function, and this repo
-- locks new functions unconditionally. authenticated needs it because the
-- SECURITY INVOKER trigger below calls it as whoever is writing the question.
REVOKE EXECUTE ON FUNCTION public.fn_pde_normalize_question_option_ids(jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_normalize_question_option_ids(jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Guard: no write can reintroduce an id-less option
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_pde_questions_fill_option_ids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
BEGIN
  NEW.options := public.fn_pde_normalize_question_option_ids(NEW.options);
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.fn_pde_questions_fill_option_ids() IS
  'BEFORE INSERT/UPDATE OF options on pde_assessment_questions: fills any missing option id so an AI-drafted or PMS-imported question can never disable the learner submit control or defeat the fn_pde_mark_objective answer-key fallback.';

REVOKE EXECUTE ON FUNCTION public.fn_pde_questions_fill_option_ids() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_questions_fill_option_ids() TO authenticated;

DROP TRIGGER IF EXISTS trg_pde_questions_fill_option_ids ON public.pde_assessment_questions;
CREATE TRIGGER trg_pde_questions_fill_option_ids
  BEFORE INSERT OR UPDATE OF options
  ON public.pde_assessment_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_pde_questions_fill_option_ids();

-- ----------------------------------------------------------------------------
-- 3. Backfill — only rows that still have a gap
-- ----------------------------------------------------------------------------

-- Matches a row needing repair in EITHER broken shape: an option with no id,
-- or two options sharing one id. Comparing the normaliser's output to the
-- current value would be the tersest predicate, but it would rewrite rows whose
-- JSONB merely re-serialises differently; testing for the two real defects keeps
-- the UPDATE to rows that are genuinely broken. Re-running touches 0 rows.
UPDATE public.pde_assessment_questions q
   SET options = public.fn_pde_normalize_question_option_ids(q.options)
 WHERE jsonb_typeof(q.options) = 'array'
   AND (
     EXISTS (
       SELECT 1
         FROM jsonb_array_elements(q.options) AS t(e)
        WHERE jsonb_typeof(t.e) = 'object'
          AND coalesce(t.e ->> 'id', '') = ''
     )
     OR EXISTS (
       SELECT t.e ->> 'id'
         FROM jsonb_array_elements(q.options) AS t(e)
        WHERE jsonb_typeof(t.e) = 'object'
          AND coalesce(t.e ->> 'id', '') <> ''
        GROUP BY t.e ->> 'id'
       HAVING count(*) > 1
     )
   );

-- =============================================================================
-- OneMark Wave 3 — Lane S3: the wave's ONLY schema change.
-- File: 20260919120000_onemark_wave3_schema.sql
-- Date: 2026-09-07
-- Spec: specs/onemark-wave3-2026-09-06.md, "## Lane S3" items 1-11 + header 7.
-- Rulings of record: specs/onemark-decisions-2026-09-02.md (20 decisions) and
-- the Rulings of 2026-09-06 relayed with this lane's brief — #1 (a bare
-- school_jkkn_owners row grants read on fn_onemark_cohort_results), #2 (full
-- post-close learner review: correct-option KEYS only once the paper's
-- close_at has passed), #3 (auto-close window = 30 minutes), #8 (a withdrawn
-- item is FLAGGED per item; scores are NEVER recomputed), #9
-- (onemark.results.min_learners_for_item_stats = 3).
--
-- Builds on, and does NOT redefine, the five OneMark migrations already
-- APPLIED to production: 20260917111500 (Wave 1 schema/seeds/roles),
-- 20260918101500 (Wave 2 Lane S RPCs), 20260918130000 (Lane S hardening),
-- 20260918120000 / 20260918140000 / 20260918150000 (item_draft job type).
-- The two functions this file DOES replace (fn_onemark_record_response,
-- fn_onemark_finalize_attempt) are replaced from their LIVE prosrc, read out
-- of pg_proc on 2026-09-07, so the hardening lock and every applied fix
-- survive; the diff is the served-set wall and the gate split, nothing else.
--
-- WHAT IT DOES
--   1.  fp_attempts.served_item_ids + fp_attempts.config; the server-side
--       served-set wall inside record_response and finalize.
--   2.  fn_onemark_close_abandoned_live() — the cron's auto-close.
--   3.  fn_onemark_cohort_results / fn_onemark_learner_report.
--   4.  onemark_user_prefs — per-person interface language (decision 5).
--   5.  Storage bucket onemark-question-assets + its storage.objects policies.
--   6.  Four platform_policies rows.
--   8.  onemark_board_paper_hits (Lane Q item 4).
--   9.  fn_onemark_vault_draw 4-argument overload (Lane Q item 3).
--   10. fn_onemark_source_analytics (Lane Q item 5).
--   11. BEFORE DELETE trigger on onemark_item_sources (Lane Q item 1).
--   12. Assertion DO block over items 1-11 + the anon lock.
--   (Item 7 of the lane spec is this header and step 12.)
--
-- WHAT IT DELIBERATELY DOES NOT DO (disclosed)
--   * It does not remove the HMAC served-set token in
--     lib/services/onemark/attempt-server.ts. Both walls coexist for one
--     release; Lane L retires the token (lane spec item 1).
--   * It does not backfill served_item_ids on the 9 existing fp_attempts rows.
--     Every one of them is mode NULL (a legacy Foundation attempt) — read live
--     2026-09-07 — so NULL is correct there and the new wall never engages.
--   * It does not touch onemark_question_assets' RLS. Wave 1 already created
--     onemark_question_assets_read / _write with exactly the fp_items
--     predicates; pg_policy was read live 2026-09-07 and confirms it. Step 5
--     ASSERTS them rather than re-creating them (lane spec item 5: "if
--     missing (check pg_policies first)").
--   * It does not recompute any score, ever (ruling #8). A withdrawn item is
--     reported with is_withdrawn = true and its answers stand as recorded.
--   * It applies nothing. The coordinator applies this file, ledgered, before
--     merge. Rehearsed on production inside BEGIN … ROLLBACK; the transcripts
--     and the separate post-rollback catalog check are in the PR body.
--
-- ROLLBACK RECIPE (per step; run in reverse order)
--   12. nothing to undo — the DO block writes nothing.
--   11. DROP TRIGGER IF EXISTS trg_onemark_item_sources_no_delete ON public.onemark_item_sources;
--       DROP FUNCTION IF EXISTS public.fn_onemark_item_sources_no_delete();
--   10. DROP FUNCTION IF EXISTS public.fn_onemark_source_analytics(uuid, int);
--   9.  DROP FUNCTION IF EXISTS public.fn_onemark_vault_draw(uuid, uuid, int, text[]);
--       (the 3-argument version is untouched and must NOT be dropped)
--   8.  DROP TABLE IF EXISTS public.onemark_board_paper_hits;
--   6.  DELETE FROM public.platform_policies WHERE scope_type = 'global' AND scope_id IS NULL
--         AND policy_key IN ('onemark.paper.question_count.tn_hsc_english',
--           'onemark.live.auto_close_after_minutes','onemark.live.grace_seconds',
--           'onemark.results.min_learners_for_item_stats');
--   5.  DROP POLICY IF EXISTS onemark_question_assets_storage_read   ON storage.objects;
--       DROP POLICY IF EXISTS onemark_question_assets_storage_write  ON storage.objects;
--       DROP POLICY IF EXISTS onemark_question_assets_storage_update ON storage.objects;
--       DROP POLICY IF EXISTS onemark_question_assets_storage_delete ON storage.objects;
--       DELETE FROM storage.buckets WHERE id = 'onemark-question-assets';  -- only while empty
--   4.  DROP TABLE IF EXISTS public.onemark_user_prefs;
--   3.  DROP FUNCTION IF EXISTS public.fn_onemark_cohort_results(uuid);
--       DROP FUNCTION IF EXISTS public.fn_onemark_learner_report(uuid, uuid);
--   2.  DROP FUNCTION IF EXISTS public.fn_onemark_close_abandoned_live();
--   1.  Re-run 20260918101500 §2 and §4 with 20260918130000's FOR NO KEY
--       UPDATE lock re-applied, then
--       DROP FUNCTION IF EXISTS public.fn_onemark_finalize_attempt_unchecked(uuid);
--       ALTER TABLE public.fp_attempts DROP COLUMN IF EXISTS served_item_ids;
--       ALTER TABLE public.fp_attempts DROP COLUMN IF EXISTS config;
-- =============================================================================


-- =============================================================================
-- 1. Served-set persistence — the server-side wall the HMAC token approximates.
-- =============================================================================
-- served_item_ids is the set of questions THIS sitting actually drew. It is
-- NULL for a live paper (whose set is fp_assessment_items) and NULL on every
-- pre-Wave-3 attempt; the wall engages only when the column is populated, so
-- nothing in flight breaks.
--
-- config is added here because the lane spec's own item 10 and Lane Q item 3
-- both read `fp_attempts.config.source_keys`, and the column DOES NOT EXIST in
-- production (information_schema read live 2026-09-07). Without it neither the
-- learner's source pick nor the lift half of the source analytics has anywhere
-- to live. Additive, defaulted, nullable-free.
ALTER TABLE public.fp_attempts
  ADD COLUMN IF NOT EXISTS served_item_ids uuid[],
  ADD COLUMN IF NOT EXISTS config          jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.fp_attempts.served_item_ids IS
  'The item ids this sitting actually served, persisted at draw time. NULL on a live paper (its set is fp_assessment_items) and on every pre-Wave-3 attempt. When NOT NULL, fn_onemark_record_response and fn_onemark_finalize_attempt refuse any item outside it (22023) — the server-side wall that replaces the HMAC served-set token in lib/services/onemark/attempt-server.ts. Added 2026-09-07 (OneMark Wave 3, Lane S3).';
COMMENT ON COLUMN public.fp_attempts.config IS
  'Per-sitting settings recorded at draw time. Today: source_keys (text[] of onemark_item_sources.key the learner picked; absent or empty = all), which fn_onemark_source_analytics reads to know what was practised. Added 2026-09-07 (OneMark Wave 3, Lane S3).';

CREATE INDEX IF NOT EXISTS idx_fp_attempts_served_items
  ON public.fp_attempts USING gin (served_item_ids)
  WHERE served_item_ids IS NOT NULL;


-- 1a. fn_onemark_record_response — the applied body (pg_proc, 2026-09-07),
--     plus ONE new block: the served-set membership check.
CREATE OR REPLACE FUNCTION public.fn_onemark_record_response(
  p_attempt_id uuid,
  p_item_id    uuid,
  p_chosen     jsonb,
  p_skipped    boolean,
  p_time_ms    int
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt        record;
  v_item           record;
  v_session        uuid;
  v_is_correct     boolean;
  v_skipped        boolean := COALESCE(p_skipped, false);
  v_existed        boolean;
  v_prev_skipped   boolean;
  v_first_graded   boolean;
  v_reveal         boolean;
  v_vault_status   text;
  v_streak         int;
BEGIN
  IF p_attempt_id IS NULL OR p_item_id IS NULL THEN
    RAISE EXCEPTION 'fn_onemark_record_response: attempt_id and item_id are required';
  END IF;

  SELECT a.id, a.student_id, a.status, a.session_id, a.mode, a.assessment_id,
         a.served_item_ids,
         s.exam_definition_id AS assessment_exam_id
    INTO v_attempt
    FROM public.fp_attempts a
    JOIN public.fp_assessments s ON s.id = a.assessment_id
   WHERE a.id = p_attempt_id
   -- Hardening 20260918130000: lock the attempt for the rest of this call.
   -- Two concurrent calls for the same (attempt, item) both saw NOT FOUND on
   -- fp_responses and double-bumped fp_items counters / the vault. NO KEY UPDATE
   -- conflicts with fn_onemark_finalize_attempt's FOR UPDATE, so record and
   -- finalize serialise too; the status check below reads the post-lock row.
   FOR NO KEY UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_onemark_record_response: attempt % not found', p_attempt_id;
  END IF;

  -- WRITE gate = the estate's own attempt-write predicate (fn_fp_record_attempt,
  -- 20260808220000): the learner / guardian, a registered manager of the
  -- learner's school, or the Senior Learner running a cohort this learner is
  -- enrolled in. NOT fn_fp_can_view_student — that is a READ predicate, and it
  -- also admits every bare school_jkkn_owners row.
  IF NOT (
    public.fn_fp_can_manage_student(v_attempt.student_id)
    OR public.fn_fp_is_own_or_guardian(v_attempt.student_id)
    OR public.fn_fp_teaches_student(v_attempt.student_id)
  ) THEN
    RAISE EXCEPTION 'fn_onemark_record_response: not authorized for attempt %', p_attempt_id
      USING ERRCODE = '42501';
  END IF;

  IF v_attempt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'fn_onemark_record_response: attempt % is %, not in_progress (single submission, decision 19)',
      p_attempt_id, v_attempt.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_attempt.mode IS NULL THEN
    RAISE EXCEPTION 'fn_onemark_record_response: attempt % has no mode — a legacy Foundation attempt is recorded by fn_fp_record_attempt, not here', p_attempt_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- NEW (Wave 3, Lane S3 item 1). The served set, when it was recorded, is the
  -- whole universe of this sitting: a caller may neither answer nor SKIP an id
  -- outside it. A named skip is what made this cheap — decision 18 costs a
  -- skip nothing, so without this wall a caller could name any active id of
  -- the subject as a blank and read its key at review, walking the bank.
  -- NULL means "not recorded" (a live paper, or a pre-Wave-3 attempt) and the
  -- fp_assessment_items check below is the wall there.
  IF v_attempt.served_item_ids IS NOT NULL
     AND NOT (p_item_id = ANY (v_attempt.served_item_ids)) THEN
    RAISE EXCEPTION 'fn_onemark_record_response: item % was not served in attempt %', p_item_id, p_attempt_id
      USING ERRCODE = '22023';
  END IF;

  SELECT i.id, i.answer, i.exam_definition_id
    INTO v_item
    FROM public.fp_items i
   WHERE i.id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_onemark_record_response: item % not found', p_item_id;
  END IF;

  -- Item membership. The item must be on the attempt's exam, and when the
  -- assessment is a fixed paper (it has fp_assessment_items rows) the item
  -- must be one of them. A standing pool (step 1) has no fp_assessment_items,
  -- so the exam match is the whole test there. Without this an in_progress
  -- attempt could drive fp_items serve counters and Mistake Vault rows for
  -- any item in the shared bank.
  IF v_item.exam_definition_id IS DISTINCT FROM v_attempt.assessment_exam_id THEN
    RAISE EXCEPTION 'fn_onemark_record_response: item % is not on the exam of attempt %', p_item_id, p_attempt_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fp_assessment_items ai WHERE ai.assessment_id = v_attempt.assessment_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.fp_assessment_items ai
        WHERE ai.assessment_id = v_attempt.assessment_id AND ai.item_id = p_item_id
     ) THEN
    RAISE EXCEPTION 'fn_onemark_record_response: item % is not part of assessment %', p_item_id, v_attempt.assessment_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_session := COALESCE(v_attempt.session_id, v_attempt.id);
  v_reveal  := v_attempt.mode IN ('practice', 'vault_review');

  -- Verdict: graded now only in a revealed mode; a skip is never graded
  -- (decision 18). In a withheld mode the column stays NULL until finalize.
  IF v_skipped OR NOT v_reveal THEN
    v_is_correct := NULL;
  ELSE
    v_is_correct := public.fn_onemark_grade(p_chosen, v_item.answer);
  END IF;

  -- What was there before decides whether this is the first response / the
  -- first graded answer to this item in this attempt.
  SELECT r.skipped INTO v_prev_skipped
    FROM public.fp_responses r
   WHERE r.attempt_id = p_attempt_id AND r.item_id = p_item_id;
  v_existed      := FOUND;
  v_first_graded := (NOT v_existed) OR COALESCE(v_prev_skipped, false);

  INSERT INTO public.fp_responses (attempt_id, item_id, chosen, is_correct, time_ms, skipped)
  VALUES (p_attempt_id, p_item_id,
          CASE WHEN v_skipped THEN NULL ELSE p_chosen END,
          v_is_correct, p_time_ms, v_skipped)
  ON CONFLICT (attempt_id, item_id)
  DO UPDATE SET chosen     = EXCLUDED.chosen,
                is_correct = EXCLUDED.is_correct,
                time_ms    = EXCLUDED.time_ms,
                skipped    = EXCLUDED.skipped;

  IF v_reveal THEN
    -- Bank counters: served once per attempt-item (on the first response of
    -- any kind), correct once per attempt-item (on the first graded answer).
    IF NOT v_existed THEN
      UPDATE public.fp_items
         SET times_served  = times_served + 1,
             times_correct = times_correct + CASE WHEN v_is_correct IS TRUE THEN 1 ELSE 0 END
       WHERE id = p_item_id;
    ELSIF v_first_graded AND v_is_correct IS TRUE THEN
      UPDATE public.fp_items
         SET times_correct = times_correct + 1
       WHERE id = p_item_id;
    END IF;

    -- Vault: the first graded answer, once.
    IF v_first_graded AND NOT v_skipped THEN
      PERFORM public.fn_onemark_apply_vault(v_attempt.student_id, p_item_id, v_session, v_is_correct);
    END IF;

    SELECT v.status, v.consecutive_correct_count
      INTO v_vault_status, v_streak
      FROM public.onemark_mistake_vault v
     WHERE v.student_id = v_attempt.student_id AND v.item_id = p_item_id;
  END IF;

  RETURN jsonb_build_object(
    'is_correct',   v_is_correct,     -- NULL when skipped or withheld
    'skipped',      v_skipped,
    'vault_status', v_vault_status,   -- NULL when withheld or no row
    'streak',       v_streak,
    'revealed',     v_reveal
  );
END;
$$;

COMMENT ON FUNCTION public.fn_onemark_record_response(uuid, uuid, jsonb, boolean, int) IS
  'OneMark: record one response on an in-progress OneMark attempt (mode set; caller must pass fn_fp_can_manage_student / fn_fp_is_own_or_guardian / fn_fp_teaches_student for the attempt''s learner — the fn_fp_record_attempt write gate; item must be on the attempt''s exam and, for a fixed paper, in fp_assessment_items; and when fp_attempts.served_item_ids was recorded, inside it — 22023). practice / vault_review: graded now, bank counters + Mistake Vault on the first graded answer per attempt-item (decisions 9/10/18/19). timed / live: stores chosen only — no verdict anywhere until fn_onemark_finalize_attempt grades the final answers. Returns {is_correct, skipped, vault_status, streak, revealed}; never returns the answer key. Added 2026-09-04, withheld grading 2026-09-05, locked 2026-09-05, served-set wall 2026-09-07 (OneMark Wave 3, Lane S3).';

REVOKE EXECUTE ON FUNCTION public.fn_onemark_record_response(uuid, uuid, jsonb, boolean, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_onemark_record_response(uuid, uuid, jsonb, boolean, int) TO authenticated;


-- 1b. fn_onemark_finalize_attempt_unchecked — the finalize BODY, with no caller
--     gate, callable by nobody but the function owner.
-- Why the split. fn_onemark_close_abandoned_live (step 2) runs from the cron
-- route on the service client, where auth.uid() is NULL. Every arm of the
-- finalize write gate (fn_fp_can_manage_student / fn_fp_is_own_or_guardian /
-- fn_fp_teaches_student) resolves auth.uid(), so the gate would refuse the
-- machine and the auto-close could never close anything. The alternatives were
-- worse: duplicating 100 lines of grading into the cron function (two bodies
-- to keep in step), or adding a p_system boolean to the granted finalize (any
-- authenticated caller passes true and skips the gate). So the body moves into
-- an internal helper with NO grants at all — the 20260918130000 idiom for
-- fn_onemark_grade and fn_onemark_apply_vault — and both public entry points
-- gate first, then call it.
CREATE OR REPLACE FUNCTION public.fn_onemark_finalize_attempt_unchecked(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt     record;
  v_session     uuid;
  v_reveal      boolean;
  v_backfilled  uuid[] := '{}';
  v_row         record;
  v_is_correct  boolean;
  v_correct     int;
  v_answered    int;
  v_skipped     int;
  v_stray       uuid;
  v_now         timestamptz := now();
BEGIN
  IF p_attempt_id IS NULL THEN
    RAISE EXCEPTION 'fn_onemark_finalize_attempt: attempt_id is required';
  END IF;

  SELECT a.id, a.student_id, a.status, a.mode, a.session_id, a.assessment_id,
         a.served_item_ids
    INTO v_attempt
    FROM public.fp_attempts a
   WHERE a.id = p_attempt_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_onemark_finalize_attempt: attempt % not found', p_attempt_id;
  END IF;

  IF v_attempt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'fn_onemark_finalize_attempt: attempt % is %, not in_progress (single submission, decision 19)',
      p_attempt_id, v_attempt.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_attempt.mode IS NULL THEN
    RAISE EXCEPTION 'fn_onemark_finalize_attempt: attempt % has no mode — a legacy Foundation attempt (score is a 0..1 ratio there) is not an OneMark attempt', p_attempt_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- NEW (Wave 3, Lane S3 item 1). Belt and braces behind record_response: if a
  -- response for an item outside the recorded served set somehow reached the
  -- table, this attempt is not scored — it is refused, loudly, before a number
  -- exists that anyone could act on.
  IF v_attempt.served_item_ids IS NOT NULL THEN
    SELECT r.item_id INTO v_stray
      FROM public.fp_responses r
     WHERE r.attempt_id = p_attempt_id
       AND NOT (r.item_id = ANY (v_attempt.served_item_ids))
     LIMIT 1;
    IF v_stray IS NOT NULL THEN
      RAISE EXCEPTION 'fn_onemark_finalize_attempt: attempt % holds a response for item %, which was never served', p_attempt_id, v_stray
        USING ERRCODE = '22023';
    END IF;
  END IF;

  v_session := COALESCE(v_attempt.session_id, v_attempt.id);
  v_reveal  := v_attempt.mode IN ('practice', 'vault_review');

  -- 2. Unanswered items of a fixed paper become skipped responses.
  WITH ins AS (
    INSERT INTO public.fp_responses (attempt_id, item_id, chosen, is_correct, time_ms, skipped)
    SELECT p_attempt_id, ai.item_id, NULL, NULL, NULL, true
      FROM public.fp_assessment_items ai
     WHERE ai.assessment_id = v_attempt.assessment_id
       AND NOT EXISTS (
         SELECT 1 FROM public.fp_responses r
          WHERE r.attempt_id = p_attempt_id AND r.item_id = ai.item_id
       )
    RETURNING item_id
  )
  SELECT COALESCE(array_agg(item_id), '{}') INTO v_backfilled FROM ins;

  IF v_reveal THEN
    -- A revealed attempt counted every served item as it went; only the
    -- backfilled blanks are new to the bank counters.
    UPDATE public.fp_items
       SET times_served = times_served + 1
     WHERE id = ANY (v_backfilled);
  ELSE
    -- 3. Withheld mode: grade the final answer of every response now.
    FOR v_row IN
      SELECT r.id, r.item_id, r.chosen, r.skipped, i.answer
        FROM public.fp_responses r
        JOIN public.fp_items i ON i.id = r.item_id
       WHERE r.attempt_id = p_attempt_id
       ORDER BY r.created_at, r.id
    LOOP
      IF v_row.skipped THEN
        v_is_correct := NULL;
      ELSE
        v_is_correct := public.fn_onemark_grade(v_row.chosen, v_row.answer);
      END IF;

      UPDATE public.fp_responses SET is_correct = v_is_correct WHERE id = v_row.id;

      UPDATE public.fp_items
         SET times_served  = times_served + 1,
             times_correct = times_correct + CASE WHEN v_is_correct IS TRUE THEN 1 ELSE 0 END
       WHERE id = v_row.item_id;

      IF NOT v_row.skipped THEN
        PERFORM public.fn_onemark_apply_vault(v_attempt.student_id, v_row.item_id, v_session, v_is_correct);
      END IF;
    END LOOP;
  END IF;

  -- 4. Score and close.
  SELECT count(*) FILTER (WHERE r.is_correct IS TRUE),
         count(*) FILTER (WHERE NOT r.skipped),
         count(*) FILTER (WHERE r.skipped)
    INTO v_correct, v_answered, v_skipped
    FROM public.fp_responses r
   WHERE r.attempt_id = p_attempt_id;

  UPDATE public.fp_attempts
     SET status       = 'submitted',
         submitted_at = v_now,
         score        = v_correct
   WHERE id = p_attempt_id;

  RETURN jsonb_build_object(
    'attempt_id',            p_attempt_id,
    'mode',                  v_attempt.mode,
    'score',                 v_correct,
    'correct',               v_correct,
    'answered',              v_answered,
    'skipped',               v_skipped,
    'unanswered_backfilled', COALESCE(array_length(v_backfilled, 1), 0),
    'submitted_at',          v_now
  );
END;
$$;

COMMENT ON FUNCTION public.fn_onemark_finalize_attempt_unchecked(uuid) IS
  'OneMark INTERNAL: the finalize body with NO caller gate. Grants to anon, authenticated, service_role and PUBLIC are all revoked — only the owner runs it, from inside fn_onemark_finalize_attempt (which gates on the caller) and fn_onemark_close_abandoned_live (which the cron reaches with the service client, where auth.uid() is NULL and every gate arm would refuse). Same idiom as fn_onemark_grade / fn_onemark_apply_vault (20260918130000). Added 2026-09-07 (OneMark Wave 3, Lane S3).';

REVOKE EXECUTE ON FUNCTION public.fn_onemark_finalize_attempt_unchecked(uuid) FROM anon, authenticated, service_role, PUBLIC;


-- 1c. fn_onemark_finalize_attempt — gate, then the shared body.
CREATE OR REPLACE FUNCTION public.fn_onemark_finalize_attempt(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student uuid;
BEGIN
  IF p_attempt_id IS NULL THEN
    RAISE EXCEPTION 'fn_onemark_finalize_attempt: attempt_id is required';
  END IF;

  SELECT a.student_id INTO v_student
    FROM public.fp_attempts a
   WHERE a.id = p_attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_onemark_finalize_attempt: attempt % not found', p_attempt_id;
  END IF;

  -- Same WRITE gate as fn_onemark_record_response (the 20260808220000
  -- predicate). Unchanged by Wave 3 — only its position moved, so that the
  -- machine path (step 2) can reach the body without it.
  IF NOT (
    public.fn_fp_can_manage_student(v_student)
    OR public.fn_fp_is_own_or_guardian(v_student)
    OR public.fn_fp_teaches_student(v_student)
  ) THEN
    RAISE EXCEPTION 'fn_onemark_finalize_attempt: not authorized for attempt %', p_attempt_id
      USING ERRCODE = '42501';
  END IF;

  RETURN public.fn_onemark_finalize_attempt_unchecked(p_attempt_id);
END;
$$;

COMMENT ON FUNCTION public.fn_onemark_finalize_attempt(uuid) IS
  'OneMark: submit an in-progress OneMark attempt once (decision 19; refuses submitted, abandoned and mode-NULL legacy attempts, and an attempt holding a response for an item outside its recorded served set — 22023). Backfills a skipped response for every unanswered item of a fixed paper (decision 18); on timed / live grades the final answer of every response here (is_correct backfilled, bank counters, Mistake Vault). score = count of correct responses. Caller must pass the fn_fp_record_attempt write gate; the body lives in fn_onemark_finalize_attempt_unchecked, which the auto-close cron shares. Added 2026-09-04, withheld grading 2026-09-05, gate split + served-set wall 2026-09-07 (OneMark Wave 3, Lane S3).';

REVOKE EXECUTE ON FUNCTION public.fn_onemark_finalize_attempt(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_onemark_finalize_attempt(uuid) TO authenticated;


-- =============================================================================
-- 2. fn_onemark_close_abandoned_live — the cron's auto-close (lane item 2).
-- =============================================================================
-- Every live sitting still in_progress whose paper's close_at passed more than
-- onemark.live.auto_close_after_minutes ago is finalised. finalize already
-- backfills the unanswered fp_assessment_items rows as skips (its step 2), so
-- this function does not duplicate that; it selects, finalises, counts.
--
-- Idempotent: a second run finds nothing, because finalize sets status to
-- submitted and the WHERE clause reads status = 'in_progress'. One attempt
-- failing does not abort the sweep — it is logged as a WARNING and the loop
-- continues, so a single bad row cannot wedge every cohort's results.
--
-- A paper with NO close_at in its config is never auto-closed by this
-- function. That is deliberate: without a close time there is no "past", and
-- guessing one would submit a learner's paper out from under them.
CREATE OR REPLACE FUNCTION public.fn_onemark_close_abandoned_live()
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minutes int;
  v_row     record;
  v_closed  int := 0;
BEGIN
  v_minutes := public.fn_get_policy_int('onemark.live.auto_close_after_minutes', 30);
  IF v_minutes IS NULL OR v_minutes < 0 THEN
    v_minutes := 30;
  END IF;

  FOR v_row IN
    SELECT a.id
      FROM public.fp_attempts a
      JOIN public.fp_assessments s ON s.id = a.assessment_id
     WHERE a.mode = 'live'
       AND a.status = 'in_progress'
       AND (s.config ->> 'close_at') IS NOT NULL
       AND (
             CASE WHEN (s.config ->> 'close_at') ~ '^\d{4}-\d{2}-\d{2}'
                  THEN (s.config ->> 'close_at')::timestamptz
             END
           ) + make_interval(mins => v_minutes) < now()
     ORDER BY a.started_at
  LOOP
    BEGIN
      PERFORM public.fn_onemark_finalize_attempt_unchecked(v_row.id);
      v_closed := v_closed + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[onemark auto-close] attempt % could not be closed: % (%)', v_row.id, SQLERRM, SQLSTATE;
    END;
  END LOOP;

  RETURN v_closed;
END;
$$;

COMMENT ON FUNCTION public.fn_onemark_close_abandoned_live() IS
  'OneMark: finalise every live sitting still in_progress more than onemark.live.auto_close_after_minutes (default 30) past its paper''s config.close_at, and return how many were closed. Unanswered items become skips through fn_onemark_finalize_attempt_unchecked''s own backfill (decision 18). Idempotent; one failing attempt is a WARNING, not an abort. A paper with no close_at is never touched. service_role only — the cron route at /api/cron/onemark-live-autoclose calls it with the service client; authenticated is REVOKED because no learner or Senior Learner should be able to close every cohort''s sittings at once. Added 2026-09-07 (OneMark Wave 3, Lane S3).';

REVOKE EXECUTE ON FUNCTION public.fn_onemark_close_abandoned_live() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_onemark_close_abandoned_live() TO service_role;


-- =============================================================================
-- 3. Cohort results and learner report (lane item 3; the PRD's Phase 3).
-- =============================================================================
-- fn_onemark_cohort_results — one paper, every learner who sat it.
--
-- GATE (ruling #1). A bare active school_jkkn_owners row on the paper's cohort
-- school is enough on its own: that is what a school principal holds, and
-- fn_fp_manages_cohort_school is exactly that predicate (pg_proc, read live
-- 2026-09-07 — no permission key in its body). A Senior Learner who built a
-- paper with NO cohort reaches it through the author arm instead.
--
-- ANSWER KEYS (ruling #2). The per-item entry carries correct_key ONLY when
-- the paper's close_at has passed; before that it is null with a reason. The
-- key is fp_items.answer -> 'correct' (or the bare answer when it is not an
-- object) — an option KEY, never a stem, an option text or an explanation.
--
-- WITHDRAWN ITEMS (ruling #8). is_withdrawn = NOT fp_items.is_active. It is a
-- flag on the item, and nothing else happens: no score is recomputed, no
-- response is deleted, no learner's number moves. The screen shows the flag
-- and the reader decides.
--
-- SMALL COHORTS (ruling #9). Per-item statistics — p-value, top distractor —
-- are withheld entirely while fewer than onemark.results.min_learners_for_item_stats
-- learners have submitted, because in a cohort of two the distractor IS the
-- learner. The learner list is unaffected; the caller manages that school.
CREATE OR REPLACE FUNCTION public.fn_onemark_cohort_results(p_assessment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a          record;
  v_min        int;
  v_learners   int;
  v_show_items boolean;
  v_closed     boolean;
  v_close_at   timestamptz;
  v_result     jsonb;
BEGIN
  IF p_assessment_id IS NULL THEN
    RAISE EXCEPTION 'fn_onemark_cohort_results: assessment_id is required';
  END IF;

  SELECT s.id, s.title, s.kind, s.cohort_id, s.exam_definition_id, s.created_by, s.config
    INTO v_a
    FROM public.fp_assessments s
   WHERE s.id = p_assessment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_onemark_cohort_results: assessment % not found', p_assessment_id;
  END IF;

  IF NOT (
    public.is_super_admin()
    OR (v_a.cohort_id IS NOT NULL AND public.fn_fp_manages_cohort_school(v_a.cohort_id))
    OR (public.user_has_permission('foundation.assessments.manage')
        AND v_a.created_by IS NOT NULL AND v_a.created_by = auth.uid())
  ) THEN
    RAISE EXCEPTION 'fn_onemark_cohort_results: not authorized for assessment %', p_assessment_id
      USING ERRCODE = '42501';
  END IF;

  v_min := public.fn_get_policy_int('onemark.results.min_learners_for_item_stats', 3);
  IF v_min IS NULL OR v_min < 1 THEN
    v_min := 3;
  END IF;

  v_close_at := CASE WHEN (v_a.config ->> 'close_at') ~ '^\d{4}-\d{2}-\d{2}'
                     THEN (v_a.config ->> 'close_at')::timestamptz END;
  v_closed   := v_close_at IS NOT NULL AND v_close_at <= now();

  SELECT count(DISTINCT a.student_id) INTO v_learners
    FROM public.fp_attempts a
   WHERE a.assessment_id = p_assessment_id AND a.status = 'submitted';
  v_show_items := v_learners >= v_min;

  WITH att AS (
    SELECT a.id, a.student_id, a.status, a.score, a.submitted_at, a.mode, a.started_at
      FROM public.fp_attempts a
     WHERE a.assessment_id = p_assessment_id
  ),
  resp AS (
    SELECT r.attempt_id, r.item_id, r.chosen, r.is_correct, r.skipped,
           t.student_id, t.status AS attempt_status,
           i.tags, i.topic_id, i.is_active AS item_active
      FROM public.fp_responses r
      JOIN att t          ON t.id = r.attempt_id
      JOIN public.fp_items i ON i.id = r.item_id
  ),
  per_learner AS (
    SELECT t.id AS attempt_id, t.student_id, t.status, t.score, t.submitted_at,
           t.mode, t.started_at,
           st.full_name,
           (SELECT count(*) FROM resp r WHERE r.attempt_id = t.id AND NOT r.skipped)  AS answered,
           (SELECT count(*) FROM resp r WHERE r.attempt_id = t.id AND r.skipped)      AS skipped,
           (SELECT COALESCE(jsonb_object_agg(x.tag, jsonb_build_object('correct', x.c, 'total', x.n)), '{}'::jsonb)
              FROM (SELECT tg AS tag,
                           count(*) FILTER (WHERE r.is_correct IS TRUE) AS c,
                           count(*)                                     AS n
                      FROM resp r, unnest(r.tags) AS tg
                     WHERE r.attempt_id = t.id
                     GROUP BY tg) x)                                                  AS per_tag,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                     'topic_id', y.topic_id, 'unit_no', y.unit_no,
                     'correct', y.c, 'total', y.n) ORDER BY y.unit_no NULLS LAST), '[]'::jsonb)
              FROM (SELECT r.topic_id,
                           (SELECT m.sort_order FROM public.exam_topic_map m
                             WHERE m.topic_id = r.topic_id
                               AND m.exam_definition_id = v_a.exam_definition_id) AS unit_no,
                           count(*) FILTER (WHERE r.is_correct IS TRUE) AS c,
                           count(*)                                     AS n
                      FROM resp r
                     WHERE r.attempt_id = t.id
                     GROUP BY r.topic_id) y)                                          AS per_unit
      FROM att t
      LEFT JOIN public.fp_students st ON st.id = t.student_id
  ),
  paper AS (
    -- The paper's item list when it is a fixed paper; otherwise every item any
    -- sitting actually touched, so a pool-backed sitting still gets a sheet.
    SELECT ai.item_id, ai.position
      FROM public.fp_assessment_items ai
     WHERE ai.assessment_id = p_assessment_id
     UNION
    SELECT DISTINCT r.item_id, NULL::int
      FROM resp r
     WHERE NOT EXISTS (SELECT 1 FROM public.fp_assessment_items z WHERE z.assessment_id = p_assessment_id)
  ),
  per_item AS (
    SELECT p.item_id, p.position,
           NOT i.is_active AS is_withdrawn,
           (SELECT count(*) FROM resp r WHERE r.item_id = p.item_id AND r.attempt_status = 'submitted')                       AS served,
           (SELECT count(*) FROM resp r WHERE r.item_id = p.item_id AND r.attempt_status = 'submitted' AND r.is_correct IS TRUE) AS correct,
           (SELECT count(*) FROM resp r WHERE r.item_id = p.item_id AND r.attempt_status = 'submitted' AND r.skipped)          AS skipped,
           CASE WHEN jsonb_typeof(i.answer) = 'object' AND (i.answer ? 'correct')
                THEN i.answer -> 'correct' ELSE i.answer END                                                                  AS correct_key,
           (SELECT r.chosen
              FROM resp r
             WHERE r.item_id = p.item_id AND r.attempt_status = 'submitted'
               AND NOT r.skipped AND r.is_correct IS FALSE AND r.chosen IS NOT NULL
             GROUP BY r.chosen
             ORDER BY count(*) DESC, r.chosen::text
             LIMIT 1)                                                                                                        AS top_distractor,
           (SELECT count(*)
              FROM resp r
             WHERE r.item_id = p.item_id AND r.attempt_status = 'submitted'
               AND NOT r.skipped AND r.is_correct IS FALSE AND r.chosen IS NOT NULL
             GROUP BY r.chosen
             ORDER BY count(*) DESC, r.chosen::text
             LIMIT 1)                                                                                                        AS top_distractor_n
      FROM paper p
      JOIN public.fp_items i ON i.id = p.item_id
  )
  SELECT jsonb_build_object(
    'assessment', jsonb_build_object(
        'id', v_a.id, 'title', v_a.title, 'kind', v_a.kind,
        'cohort_id', v_a.cohort_id, 'exam_definition_id', v_a.exam_definition_id,
        'close_at', v_close_at, 'closed', v_closed),
    'learner_count',      v_learners,
    'min_learners_for_item_stats', v_min,
    'item_stats_visible', v_show_items,
    'item_stats_hidden_reason',
        CASE WHEN v_show_items THEN NULL
             ELSE format('fewer than %s learners have submitted (%s) — per-item statistics would identify individuals', v_min, v_learners) END,
    'answer_keys_reason',
        CASE WHEN v_closed THEN NULL
             WHEN v_close_at IS NULL THEN 'this paper has no close time, so it has never closed'
             ELSE 'the paper has not closed yet' END,
    'learners', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
                 'student_id',      l.student_id,
                 'full_name',       l.full_name,
                 'attempt_id',      l.attempt_id,
                 'status',          l.status,
                 'score',           l.score,
                 'answered',        l.answered,
                 'skipped',         l.skipped,
                 -- decision 17: a sitting taken on a device is flagged; a
                 -- mode-NULL row is a legacy Foundation attempt, not digital.
                 'taken_digitally', l.mode IS NOT NULL,
                 'mode',            l.mode,
                 'started_at',      l.started_at,
                 'submitted_at',    l.submitted_at,
                 'per_tag',         l.per_tag,
                 'per_unit',        l.per_unit)
               ORDER BY l.score DESC NULLS LAST, l.full_name), '[]'::jsonb)
          FROM per_learner l),
    'items', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
                 'item_id',      it.item_id,
                 'position',     it.position,
                 'is_withdrawn', it.is_withdrawn,
                 -- ruling #8: flagged, never recomputed.
                 'withdrawn_note', CASE WHEN it.is_withdrawn
                       THEN 'this question was withdrawn from the bank after this paper ran; the scores above are as they were recorded and are not recomputed' END,
                 'served',       CASE WHEN v_show_items THEN to_jsonb(it.served)  END,
                 'correct',      CASE WHEN v_show_items THEN to_jsonb(it.correct) END,
                 'skipped',      CASE WHEN v_show_items THEN to_jsonb(it.skipped) END,
                 'p_value',      CASE WHEN v_show_items AND it.served > 0
                                      THEN to_jsonb(round(it.correct::numeric / it.served, 4)) END,
                 'top_distractor',       CASE WHEN v_show_items THEN it.top_distractor END,
                 'top_distractor_count', CASE WHEN v_show_items THEN to_jsonb(it.top_distractor_n) END,
                 -- ruling #2: keys only once the paper has closed.
                 'correct_key',  CASE WHEN v_closed THEN it.correct_key END)
               ORDER BY it.position NULLS LAST, it.item_id), '[]'::jsonb)
          FROM per_item it)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_onemark_cohort_results(uuid) IS
  'OneMark: the cohort results sheet for one paper — per learner (score, status, submitted_at, taken-digitally flag per decision 17, per-tag and per-unit correct/total) and per item (p-value, most-chosen wrong option, withdrawn flag per ruling #8). Per-item statistics are withheld entirely below onemark.results.min_learners_for_item_stats learners (ruling #9). Correct-option KEYS are returned only after the paper''s close_at has passed (ruling #2); a stem, an option text and an explanation are never returned at all. Caller: super admin, OR an active school_jkkn_owners row on the cohort''s school (ruling #1 — that alone, no permission key: it is what a principal holds), OR the paper''s own author holding foundation.assessments.manage. Added 2026-09-07 (OneMark Wave 3, Lane S3).';

REVOKE EXECUTE ON FUNCTION public.fn_onemark_cohort_results(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_onemark_cohort_results(uuid) TO authenticated;


-- fn_onemark_learner_report — one learner, one subject.
-- Wraps fn_fp_student_progress (which already computes learner-level progress
-- and must not be copied) and adds the Mistake Vault state and the last ten
-- sittings. Gate is the estate's READ predicate fn_fp_can_view_student, which
-- already admits the learner themselves, a guardian, the cohort's resource
-- person and any active school owner.
CREATE OR REPLACE FUNCTION public.fn_onemark_learner_report(
  p_student_id         uuid,
  p_exam_definition_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_student_id IS NULL OR p_exam_definition_id IS NULL THEN
    RAISE EXCEPTION 'fn_onemark_learner_report: student_id and exam_definition_id are required';
  END IF;
  IF NOT public.fn_fp_can_view_student(p_student_id) THEN
    RAISE EXCEPTION 'fn_onemark_learner_report: not authorized for learner %', p_student_id
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'student_id',         p_student_id,
    'exam_definition_id', p_exam_definition_id,
    'progress',           public.fn_fp_student_progress(p_student_id, p_exam_definition_id),
    'vault', (
      SELECT jsonb_build_object(
               'active',     count(*) FILTER (WHERE v.status = 'active'),
               'mastered',   count(*) FILTER (WHERE v.status = 'mastered'),
               'due_now',    count(*) FILTER (WHERE v.status = 'active'
                                              AND (v.next_eligible_at IS NULL OR v.next_eligible_at <= now())),
               'next_due_at', min(v.next_eligible_at) FILTER (WHERE v.status = 'active'
                                              AND v.next_eligible_at > now()))
        FROM public.onemark_mistake_vault v
        JOIN public.fp_items i ON i.id = v.item_id
       WHERE v.student_id = p_student_id
         AND i.exam_definition_id = p_exam_definition_id),
    'sittings', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'attempt_id',   s.id,
               'assessment_id', s.assessment_id,
               'title',        s.title,
               'mode',         s.mode,
               'status',       s.status,
               'score',        s.score,
               'out_of',       s.out_of,
               'started_at',   s.started_at,
               'submitted_at', s.submitted_at) ORDER BY s.ord), '[]'::jsonb)
        FROM (
          SELECT a.id, a.assessment_id, x.title, a.mode, a.status, a.score,
                 a.started_at, a.submitted_at,
                 (SELECT count(*) FROM public.fp_responses r WHERE r.attempt_id = a.id) AS out_of,
                 row_number() OVER (ORDER BY COALESCE(a.submitted_at, a.started_at) DESC) AS ord
            FROM public.fp_attempts a
            JOIN public.fp_assessments x ON x.id = a.assessment_id
           WHERE a.student_id = p_student_id
             AND x.exam_definition_id = p_exam_definition_id
             AND a.mode IS NOT NULL
           ORDER BY COALESCE(a.submitted_at, a.started_at) DESC
           LIMIT 10) s)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_onemark_learner_report(uuid, uuid) IS
  'OneMark: one learner''s report for one subject — fn_fp_student_progress (wrapped, never copied) plus Mistake Vault counts (active / mastered / due now / next due) and the last ten OneMark sittings. Never returns an answer key, a stem or an option. Caller must pass fn_fp_can_view_student — the learner themselves, a guardian, the cohort''s resource person, or an active school owner. Added 2026-09-07 (OneMark Wave 3, Lane S3).';

REVOKE EXECUTE ON FUNCTION public.fn_onemark_learner_report(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_onemark_learner_report(uuid, uuid) TO authenticated;


-- =============================================================================
-- 4. onemark_user_prefs — per-person interface language (lane item 4, decision 5).
-- =============================================================================
-- Deliberately NOT a column on profiles: profiles has no preferences column and
-- is shared by every module in the estate, so one product's toggle does not
-- belong there. One row per signed-in person, owned by that person.
CREATE TABLE IF NOT EXISTS public.onemark_user_prefs (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ui_locale  text NOT NULL DEFAULT 'en' CHECK (ui_locale IN ('en', 'ta')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.onemark_user_prefs IS
  'Per-person OneMark interface preferences (decision 5: each person picks English or Tamil for themselves, independently of the question content, which is bilingual on fp_items). One row per auth.users id, readable and writable only by that person. Added 2026-09-07 (OneMark Wave 3, Lane S3).';
COMMENT ON COLUMN public.onemark_user_prefs.ui_locale IS
  'Interface language: en (default) or ta. The question content language is separate — fp_items.stem_ta / options_ta.';

DROP TRIGGER IF EXISTS trg_onemark_user_prefs_touch ON public.onemark_user_prefs;
CREATE TRIGGER trg_onemark_user_prefs_touch BEFORE UPDATE ON public.onemark_user_prefs
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

ALTER TABLE public.onemark_user_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS onemark_user_prefs_select ON public.onemark_user_prefs;
DROP POLICY IF EXISTS onemark_user_prefs_insert ON public.onemark_user_prefs;
DROP POLICY IF EXISTS onemark_user_prefs_update ON public.onemark_user_prefs;
CREATE POLICY onemark_user_prefs_select ON public.onemark_user_prefs FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY onemark_user_prefs_insert ON public.onemark_user_prefs FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY onemark_user_prefs_update ON public.onemark_user_prefs FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- No DELETE policy: a preference row is overwritten, not removed. Deleting the
-- auth.users row cascades.

REVOKE ALL ON TABLE public.onemark_user_prefs FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.onemark_user_prefs TO authenticated;


-- =============================================================================
-- 5. Question images — the storage bucket (lane item 5).
-- =============================================================================
-- The TABLE onemark_question_assets and its RLS already exist (Wave 1,
-- 20260917111500 §6) with exactly the fp_items predicates; pg_policy was read
-- live 2026-09-07 and both policies are present, so this file does NOT
-- re-create them — step 12 asserts them instead.
--
-- What is missing is the bucket. Private, 2 MB, images only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT 'onemark-question-assets', 'onemark-question-assets', false, 2097152,
       ARRAY['image/png', 'image/jpeg', 'image/svg+xml']
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'onemark-question-assets');

-- storage.objects policies, in the idiom of the estate's other private buckets
-- (cdc-docs, read live 2026-09-07: bucket_id predicate + a role predicate).
-- Read is the LEARNER predicate too — a diagram is part of the question, and a
-- learner sitting a paper must be able to see it. It carries no answer.
DROP POLICY IF EXISTS onemark_question_assets_storage_read   ON storage.objects;
DROP POLICY IF EXISTS onemark_question_assets_storage_write  ON storage.objects;
DROP POLICY IF EXISTS onemark_question_assets_storage_update ON storage.objects;
DROP POLICY IF EXISTS onemark_question_assets_storage_delete ON storage.objects;

CREATE POLICY onemark_question_assets_storage_read ON storage.objects FOR SELECT
  USING (bucket_id = 'onemark-question-assets'
         AND auth.uid() IS NOT NULL
         AND (public.is_super_admin()
              OR public.user_has_permission('foundation.practice.take')
              OR public.user_has_permission('foundation.items.manage')));

CREATE POLICY onemark_question_assets_storage_write ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'onemark-question-assets'
              AND (public.is_super_admin() OR public.user_has_permission('foundation.items.manage')));

CREATE POLICY onemark_question_assets_storage_update ON storage.objects FOR UPDATE
  USING      (bucket_id = 'onemark-question-assets'
              AND (public.is_super_admin() OR public.user_has_permission('foundation.items.manage')))
  WITH CHECK (bucket_id = 'onemark-question-assets'
              AND (public.is_super_admin() OR public.user_has_permission('foundation.items.manage')));

CREATE POLICY onemark_question_assets_storage_delete ON storage.objects FOR DELETE
  USING (bucket_id = 'onemark-question-assets'
         AND (public.is_super_admin() OR public.user_has_permission('foundation.items.manage')));


-- =============================================================================
-- 6. Policy rows (lane item 6). Global, operational, published — house style.
-- =============================================================================
INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, description,
  data_type, is_system, is_active, classification, publication_state
)
SELECT v.policy_key, 'global', NULL, to_jsonb(v.value), v.description,
       'number', false, true, 'operational', 'published'
FROM (VALUES
  ('onemark.paper.question_count.tn_hsc_english', 20,
   'Default number of one-mark questions in a generated ENGLISH paper. The board standard is 20 for English and 15 for Physics (onemark.paper.question_count). This row exists so the English count is a setting rather than a fallback compiled into the paper wizard. Default 20 (PRD §3.3).'),
  ('onemark.live.auto_close_after_minutes', 30,
   'How long after a live paper''s close time a sitting still marked in progress is submitted automatically. Raising it gives a learner whose device died longer to come back; lowering it gets the results sheet finished sooner. Nobody loses an answer either way — unanswered questions become skips, which do not count against a score (decision 18). Default 30 (Director ruling 2026-09-06).'),
  ('onemark.live.grace_seconds', 15,
   'Seconds of grace after a sitting''s clock runs out during which an answer already being submitted is still accepted, so a slow connection does not cost a learner the question they just answered. Default 15.'),
  ('onemark.results.min_learners_for_item_stats', 3,
   'How many learners must have submitted a paper before per-question statistics (how many got it right, which wrong option was most chosen) are shown on the results sheet. Below this the numbers would identify individuals rather than describe a group, so they are withheld — the score list itself is unaffected. Default 3 (Director ruling 2026-09-06).')
) AS v(policy_key, value, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies p
  WHERE p.policy_key = v.policy_key
    AND p.scope_type = 'global'
    AND p.scope_id IS NULL
);


-- =============================================================================
-- 8. onemark_board_paper_hits — did this question appear in the real exam?
-- =============================================================================
-- Lane Q item 4. Append-only by design: a wrong tick is DELETED by its author,
-- never edited, so a hit always means "somebody looked at the board paper and
-- said yes", not "somebody edited a row until it agreed".
CREATE TABLE IF NOT EXISTS public.onemark_board_paper_hits (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_definition_id  uuid NOT NULL REFERENCES public.exam_definitions(id) ON DELETE RESTRICT,
  exam_year           int  NOT NULL,
  sitting             text,
  item_id             uuid NOT NULL REFERENCES public.fp_items(id) ON DELETE CASCADE,
  match_kind          text NOT NULL CHECK (match_kind IN ('exact', 'near')),
  board_qno           int,
  note                text,
  noted_by            uuid REFERENCES public.profiles(id),
  noted_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.onemark_board_paper_hits IS
  'One tick: "this bank question appeared in the real board paper". Recorded once a year, after the exam, by a question author (foundation.items.manage). exact = the same question; near = the same thing asked differently. Feeds the hit-rate half of fn_onemark_source_analytics — the evidence for Director ruling (a) of 2026-09-06, that a source "worked" only if BOTH its questions appeared AND learners who practised it improved. Append-only: a wrong tick is deleted by its author, never edited. Added 2026-09-07 (OneMark Wave 3, Lane S3).';
COMMENT ON COLUMN public.onemark_board_paper_hits.sitting IS 'Board sitting, e.g. March / June / September. NULL when the year had one sitting.';
COMMENT ON COLUMN public.onemark_board_paper_hits.match_kind IS 'exact = the identical question; near = the same idea tested in different words.';
COMMENT ON COLUMN public.onemark_board_paper_hits.board_qno IS 'Question number in the real board paper, when it was recorded.';

-- One tick per (item, year, sitting). COALESCE in an expression index because
-- a NULL sitting must still collide with another NULL sitting.
CREATE UNIQUE INDEX IF NOT EXISTS uq_onemark_board_paper_hits_item_year_sitting
  ON public.onemark_board_paper_hits (item_id, exam_year, (COALESCE(sitting, '')));
CREATE INDEX IF NOT EXISTS idx_onemark_board_paper_hits_exam_year
  ON public.onemark_board_paper_hits (exam_definition_id, exam_year);

ALTER TABLE public.onemark_board_paper_hits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS onemark_board_paper_hits_read  ON public.onemark_board_paper_hits;
DROP POLICY IF EXISTS onemark_board_paper_hits_write ON public.onemark_board_paper_hits;
CREATE POLICY onemark_board_paper_hits_read ON public.onemark_board_paper_hits FOR SELECT
  USING (auth.uid() IS NOT NULL
         AND (public.is_super_admin()
              OR public.user_has_permission('foundation.practice.take')
              OR public.user_has_permission('foundation.items.manage')));
CREATE POLICY onemark_board_paper_hits_write ON public.onemark_board_paper_hits FOR ALL
  USING      (public.is_super_admin() OR public.user_has_permission('foundation.items.manage'))
  WITH CHECK (public.is_super_admin() OR public.user_has_permission('foundation.items.manage'));

REVOKE ALL ON TABLE public.onemark_board_paper_hits FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.onemark_board_paper_hits TO authenticated;


-- =============================================================================
-- 9. fn_onemark_vault_draw — 4-argument overload, filtered by source.
-- =============================================================================
-- Lane Q item 3 / lane item 9. Same body and same gate as the live
-- 3-argument version (20260918101500 §3, unchanged and NOT dropped — Lane V
-- calls it), plus one predicate. NULL or an empty array means "every source",
-- exactly as the paper wizard treats an empty filter.
CREATE OR REPLACE FUNCTION public.fn_onemark_vault_draw(
  p_student_id         uuid,
  p_exam_definition_id uuid,
  p_count              int,
  p_source_keys        text[]
)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pct  int;
  v_cap  int;
  v_keys text[];
BEGIN
  IF p_student_id IS NULL OR p_exam_definition_id IS NULL THEN
    RAISE EXCEPTION 'fn_onemark_vault_draw: student_id and exam_definition_id are required';
  END IF;
  IF NOT public.fn_fp_can_view_student(p_student_id) THEN
    RAISE EXCEPTION 'fn_onemark_vault_draw: not authorized for learner %', p_student_id
      USING ERRCODE = '42501';
  END IF;
  IF p_count IS NULL OR p_count < 1 THEN
    RETURN;
  END IF;

  -- Empty array = no filter, so a caller that always sends the array does not
  -- have to special-case "the learner ticked nothing".
  v_keys := CASE WHEN p_source_keys IS NULL OR cardinality(p_source_keys) = 0
                 THEN NULL ELSE p_source_keys END;

  v_pct := public.fn_get_policy_int('onemark.vault.max_single_chapter_pct', 60);
  -- Floor of 1: decision 13 says shorter, not empty — a literal round-down
  -- would make p_count = 1 (cap 0) return nothing.
  v_cap := GREATEST(floor(p_count * v_pct / 100.0)::int, 1);

  RETURN QUERY
  WITH due AS (
    SELECT v.item_id,
           v.next_eligible_at,
           v.created_at,
           i.topic_id,
           row_number() OVER (
             PARTITION BY i.topic_id
             ORDER BY v.next_eligible_at ASC NULLS FIRST, v.created_at ASC, v.item_id
           ) AS rank_in_topic
      FROM public.onemark_mistake_vault v
      JOIN public.fp_items i ON i.id = v.item_id
     WHERE v.student_id = p_student_id
       AND v.status = 'active'
       AND (v.next_eligible_at IS NULL OR v.next_eligible_at <= now())
       AND i.exam_definition_id = p_exam_definition_id
       AND i.is_active
       AND (v_keys IS NULL OR i.source_key = ANY (v_keys))
  )
  SELECT d.item_id
    FROM due d
   WHERE d.rank_in_topic <= v_cap
   ORDER BY d.next_eligible_at ASC NULLS FIRST, d.created_at ASC, d.item_id
   LIMIT p_count;
END;
$$;

COMMENT ON FUNCTION public.fn_onemark_vault_draw(uuid, uuid, int, text[]) IS
  'OneMark: fn_onemark_vault_draw restricted to a set of onemark_item_sources keys (Director ruling (c) of 2026-09-06 — learners may pick sources in vault review too). Identical body and gate to the 3-argument version, which stays and is what Lane V calls. NULL or an empty array = every source; an item whose source_key is NULL is EXCLUDED by a non-empty filter, because "not recorded" is not one of the sources a learner picked. Added 2026-09-07 (OneMark Wave 3, Lane S3).';

REVOKE EXECUTE ON FUNCTION public.fn_onemark_vault_draw(uuid, uuid, int, text[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_onemark_vault_draw(uuid, uuid, int, text[]) TO authenticated;


-- =============================================================================
-- 10. fn_onemark_source_analytics — did this source earn its place?
-- =============================================================================
-- Lane Q item 5 / lane item 10, and the machine half of Director ruling (a) of
-- 2026-09-06: a source "worked" only if BOTH its questions appeared in the real
-- board paper AND learners who practised it improved. Both numbers, side by
-- side, neither alone.
--
-- hit_rate = board hits / active items, for the chosen exam year (or every year
-- when p_exam_year is NULL). NULL when the source has no active items.
--
-- lift is a MEDIAN SPLIT, and it is a correlation, not a cause. For each learner
-- with a submitted live sitting on this subject: their practice share on the
-- source = responses on items of that source ÷ all their practice responses,
-- counted from what was actually SERVED (fp_responses -> fp_items.source_key),
-- not from what they asked for. Their live result is normalised to a fraction
-- (score ÷ questions on the paper) so papers of different lengths compare.
-- lift = mean fraction of the learners above the median share minus the mean of
-- those at or below it. It is NULL, with a reason, while fewer than
-- onemark.results.min_learners_for_item_stats learners qualify.
--
-- The NULL source bucket is kept and labelled, never dropped: with 126 items
-- and 0 source_key values in production on 2026-09-07 it is, today, the only
-- bucket there is.
--
-- Never returns a stem, an option or an answer.
CREATE OR REPLACE FUNCTION public.fn_onemark_source_analytics(
  p_exam_definition_id uuid,
  p_exam_year          int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min       int;
  v_qualified int;
  v_median    numeric;
  v_result    jsonb;
BEGIN
  IF p_exam_definition_id IS NULL THEN
    RAISE EXCEPTION 'fn_onemark_source_analytics: exam_definition_id is required';
  END IF;

  -- Same scope Director decision 1 settles (ruling #1): the Senior Learner who
  -- builds papers, or a school owner — a principal's bare active row is enough.
  IF NOT (
    public.is_super_admin()
    OR public.user_has_permission('foundation.assessments.manage')
    OR EXISTS (SELECT 1 FROM public.school_jkkn_owners o
                WHERE o.jkkn_user_id = auth.uid() AND o.is_active)
  ) THEN
    RAISE EXCEPTION 'fn_onemark_source_analytics: not authorized'
      USING ERRCODE = '42501';
  END IF;

  v_min := public.fn_get_policy_int('onemark.results.min_learners_for_item_stats', 3);
  IF v_min IS NULL OR v_min < 1 THEN
    v_min := 3;
  END IF;

  WITH items AS (
    SELECT i.id, i.source_key, i.is_active, i.times_served, i.times_correct
      FROM public.fp_items i
     WHERE i.exam_definition_id = p_exam_definition_id
  ),
  -- Every learner with at least one submitted live sitting on this subject,
  -- with that sitting normalised to a fraction of the paper.
  live AS (
    SELECT a.student_id,
           avg(CASE WHEN n.q > 0 THEN a.score::numeric / n.q END) AS live_frac,
           count(*) AS live_sittings
      FROM public.fp_attempts a
      JOIN public.fp_assessments s ON s.id = a.assessment_id
      CROSS JOIN LATERAL (
        SELECT GREATEST(
                 (SELECT count(*) FROM public.fp_assessment_items ai WHERE ai.assessment_id = a.assessment_id),
                 (SELECT count(*) FROM public.fp_responses r WHERE r.attempt_id = a.id)
               ) AS q) n
     WHERE a.mode = 'live'
       AND a.status = 'submitted'
       AND a.score IS NOT NULL
       AND s.exam_definition_id = p_exam_definition_id
     GROUP BY a.student_id
  ),
  -- What each of those learners actually practised, by source, counted from
  -- the items that were served to them.
  prac AS (
    SELECT a.student_id, it.source_key, count(*) AS n
      FROM public.fp_attempts a
      JOIN public.fp_responses r ON r.attempt_id = a.id
      JOIN items it              ON it.id = r.item_id
     WHERE a.mode IN ('practice', 'vault_review', 'timed')
       AND a.student_id IN (SELECT student_id FROM live)
     GROUP BY a.student_id, it.source_key
  ),
  prac_total AS (
    SELECT student_id, sum(n) AS n FROM prac GROUP BY student_id
  ),
  hits AS (
    SELECT h.item_id,
           count(*) FILTER (WHERE h.match_kind = 'exact') AS exact_n,
           count(*) FILTER (WHERE h.match_kind = 'near')  AS near_n
      FROM public.onemark_board_paper_hits h
     WHERE h.exam_definition_id = p_exam_definition_id
       AND (p_exam_year IS NULL OR h.exam_year = p_exam_year)
     GROUP BY h.item_id
  ),
  -- One row per source that either has items on this exam or is an active
  -- master row, plus the NULL bucket whenever any item lacks a source.
  keys AS (
    SELECT DISTINCT it.source_key AS k FROM items it
     UNION
    SELECT s.key FROM public.onemark_item_sources s WHERE s.is_active
  ),
  agg AS (
    SELECT k.k AS source_key,
           (SELECT s.label     FROM public.onemark_item_sources s WHERE s.key = k.k)       AS label,
           (SELECT s.is_active FROM public.onemark_item_sources s WHERE s.key = k.k)       AS source_active,
           (SELECT count(*)                    FROM items it WHERE it.source_key IS NOT DISTINCT FROM k.k) AS items_total,
           (SELECT count(*) FILTER (WHERE it.is_active) FROM items it WHERE it.source_key IS NOT DISTINCT FROM k.k) AS items_active,
           (SELECT COALESCE(sum(it.times_served), 0)  FROM items it WHERE it.source_key IS NOT DISTINCT FROM k.k) AS times_served,
           (SELECT COALESCE(sum(it.times_correct), 0) FROM items it WHERE it.source_key IS NOT DISTINCT FROM k.k) AS times_correct,
           (SELECT COALESCE(sum(h.exact_n), 0) FROM hits h JOIN items it ON it.id = h.item_id
             WHERE it.source_key IS NOT DISTINCT FROM k.k)                                  AS hits_exact,
           (SELECT COALESCE(sum(h.near_n), 0)  FROM hits h JOIN items it ON it.id = h.item_id
             WHERE it.source_key IS NOT DISTINCT FROM k.k)                                  AS hits_near
      FROM keys k
     WHERE k.k IS NOT NULL
        OR EXISTS (SELECT 1 FROM items it WHERE it.source_key IS NULL)
  ),
  -- Practice share per (learner, source), zero-filled for the sources a
  -- learner never touched, so the median split has the whole cohort in it.
  share AS (
    SELECT l.student_id, a.source_key, l.live_frac,
           CASE WHEN pt.n > 0
                THEN COALESCE((SELECT p.n FROM prac p
                                WHERE p.student_id = l.student_id
                                  AND p.source_key IS NOT DISTINCT FROM a.source_key), 0)::numeric / pt.n
           END AS practice_share
      FROM live l
      CROSS JOIN agg a
      LEFT JOIN prac_total pt ON pt.student_id = l.student_id
     WHERE l.live_frac IS NOT NULL
  ),
  -- percentile_cont is an ordered-set aggregate and cannot be a window
  -- function, so the median is its own grouped pass and the split joins back.
  med AS (
    SELECT s.source_key,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY s.practice_share) AS med,
           count(*)                                                      AS learners
      FROM share s
     WHERE s.practice_share IS NOT NULL
     GROUP BY s.source_key
  ),
  lift AS (
    SELECT m.source_key,
           m.learners,
           CASE WHEN m.learners >= v_min
                THEN round(
                       COALESCE(avg(s.live_frac) FILTER (WHERE s.practice_share >  m.med), 0)
                     - COALESCE(avg(s.live_frac) FILTER (WHERE s.practice_share <= m.med), 0), 4)
           END AS lift_value
      FROM med m
      JOIN share s ON s.source_key IS NOT DISTINCT FROM m.source_key
     WHERE s.practice_share IS NOT NULL
     GROUP BY m.source_key, m.learners, m.med
  )
  SELECT jsonb_build_object(
    'exam_definition_id', p_exam_definition_id,
    'exam_year',          p_exam_year,
    'min_learners_for_item_stats', v_min,
    'sources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'source_key',    a.source_key,
               'label',         COALESCE(a.label, CASE WHEN a.source_key IS NULL THEN 'source not recorded' ELSE a.source_key END),
               'is_recorded',   a.source_key IS NOT NULL,
               'source_active', COALESCE(a.source_active, true),
               'items_total',   a.items_total,
               'items_active',  a.items_active,
               'times_served',  a.times_served,
               'times_correct', a.times_correct,
               'accuracy',      CASE WHEN a.times_served > 0
                                     THEN round(a.times_correct::numeric / a.times_served, 4) END,
               'hits_exact',    a.hits_exact,
               'hits_near',     a.hits_near,
               'hit_rate',      CASE WHEN a.items_active > 0
                                     THEN round((a.hits_exact + a.hits_near)::numeric / a.items_active, 4) END,
               'lift',          (SELECT f.lift_value FROM lift f WHERE f.source_key IS NOT DISTINCT FROM a.source_key),
               'lift_learners', COALESCE((SELECT f.learners FROM lift f WHERE f.source_key IS NOT DISTINCT FROM a.source_key), 0),
               'lift_reason',   CASE WHEN (SELECT f.lift_value FROM lift f WHERE f.source_key IS NOT DISTINCT FROM a.source_key) IS NULL
                                     THEN format('fewer than %s learners have both practised and sat a live paper on this subject (%s)',
                                                 v_min,
                                                 COALESCE((SELECT f.learners FROM lift f WHERE f.source_key IS NOT DISTINCT FROM a.source_key), 0))
                                END)
             ORDER BY a.items_active DESC, a.source_key NULLS LAST)
        FROM agg a), '[]'::jsonb),
    'notes', jsonb_build_object(
      'hit_rate', 'board hits divided by active questions, for the exam year asked for. It says how often this source''s questions turned up in the real paper — nothing about whether learners did better.',
      'lift',     'the difference in live-paper result between the learners who practised this source most and those who practised it least. It is a correlation, not a cause: a learner who practises more may simply be a learner who works harder.')
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_onemark_source_analytics(uuid, int) IS
  'OneMark: per question-source evidence for one subject — items total / active, times served, times correct, accuracy, board hits (exact and near) for one exam year or all years, hit rate, and learning lift (median split on practice share, normalised live-paper fraction; NULL with a reason below onemark.results.min_learners_for_item_stats learners). Both halves of Director ruling (a) of 2026-09-06, side by side. The NULL source bucket is kept and labelled "source not recorded", never dropped. Never returns a stem, an option or an answer. Caller: super admin, foundation.assessments.manage, or any active school_jkkn_owners row. Added 2026-09-07 (OneMark Wave 3, Lane S3).';

REVOKE EXECUTE ON FUNCTION public.fn_onemark_source_analytics(uuid, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_onemark_source_analytics(uuid, int) TO authenticated;


-- =============================================================================
-- 11. Retire, do not delete (lane item 11 / Lane Q item 1).
-- =============================================================================
-- fp_items.source_key is ON DELETE SET NULL, so deleting a source silently
-- blanks the provenance of every question that came from it — the one fact a
-- question can never be given back. Lane Q's API answers DELETE with 405; this
-- is the wall behind it, for anything that reaches the table another way.
CREATE OR REPLACE FUNCTION public.fn_onemark_item_sources_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'retire a source with is_active = false; deleting would blank provenance on every linked question'
    USING ERRCODE = 'check_violation',
          DETAIL  = format('onemark_item_sources.key = %L', OLD.key);
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.fn_onemark_item_sources_no_delete() IS
  'OneMark: refuses every DELETE on onemark_item_sources. fp_items.source_key is ON DELETE SET NULL, so a delete would blank the provenance of every question from that source — retire it (is_active = false) instead, which hides it from every picker and keeps it on its questions. The second wall behind Lane Q''s 405. Added 2026-09-07 (OneMark Wave 3, Lane S3).';

REVOKE EXECUTE ON FUNCTION public.fn_onemark_item_sources_no_delete() FROM anon, authenticated, service_role, PUBLIC;

DROP TRIGGER IF EXISTS trg_onemark_item_sources_no_delete ON public.onemark_item_sources;
CREATE TRIGGER trg_onemark_item_sources_no_delete
  BEFORE DELETE ON public.onemark_item_sources
  FOR EACH ROW EXECUTE FUNCTION public.fn_onemark_item_sources_no_delete();


-- =============================================================================
-- 12. Assertions (lane item 7): every object of items 1-11 exists, and anon is
--     locked out of all of it. Writes nothing; raises on the first failure.
-- =============================================================================
DO $chk$
DECLARE
  v_n   int;
  v_src text;
BEGIN
  -- 1. columns + the two replaced functions
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'fp_attempts'
                    AND column_name = 'served_item_ids') THEN
    RAISE EXCEPTION 'w3: fp_attempts.served_item_ids missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'fp_attempts'
                    AND column_name = 'config') THEN
    RAISE EXCEPTION 'w3: fp_attempts.config missing';
  END IF;
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_onemark_record_response';
  IF v_src IS NULL OR v_src !~ 'served_item_ids' OR v_src !~ 'FOR NO KEY UPDATE OF a' THEN
    RAISE EXCEPTION 'w3: fn_onemark_record_response is not the served-set + locked version';
  END IF;
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_onemark_finalize_attempt';
  IF v_src IS NULL OR v_src !~ 'fn_onemark_finalize_attempt_unchecked' THEN
    RAISE EXCEPTION 'w3: fn_onemark_finalize_attempt does not delegate to the shared body';
  END IF;
  IF v_src !~ 'fn_fp_can_manage_student' THEN
    RAISE EXCEPTION 'w3: fn_onemark_finalize_attempt lost its write gate';
  END IF;
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_onemark_finalize_attempt_unchecked';
  IF v_src IS NULL OR v_src !~ 'served_item_ids' THEN
    RAISE EXCEPTION 'w3: fn_onemark_finalize_attempt_unchecked missing or has no served-set wall';
  END IF;
  IF v_src ~ 'fn_fp_can_manage_student' THEN
    RAISE EXCEPTION 'w3: the unchecked body must NOT carry the gate — it runs for the machine';
  END IF;

  -- 2-3, 9-11: the functions exist with the signatures the lanes call.
  FOR v_src IN
    SELECT x FROM unnest(ARRAY[
      'public.fn_onemark_close_abandoned_live()',
      'public.fn_onemark_cohort_results(uuid)',
      'public.fn_onemark_learner_report(uuid, uuid)',
      'public.fn_onemark_vault_draw(uuid, uuid, integer, text[])',
      'public.fn_onemark_vault_draw(uuid, uuid, integer)',
      'public.fn_onemark_source_analytics(uuid, integer)',
      'public.fn_onemark_item_sources_no_delete()',
      'public.fn_onemark_finalize_attempt_unchecked(uuid)'
    ]) AS x
  LOOP
    IF to_regprocedure(v_src) IS NULL THEN
      RAISE EXCEPTION 'w3: % does not exist', v_src;
    END IF;
  END LOOP;

  -- 4, 8: the two new tables, with RLS on.
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND c.relname = 'onemark_user_prefs' AND c.relrowsecurity) THEN
    RAISE EXCEPTION 'w3: onemark_user_prefs missing or RLS off';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND c.relname = 'onemark_board_paper_hits' AND c.relrowsecurity) THEN
    RAISE EXCEPTION 'w3: onemark_board_paper_hits missing or RLS off';
  END IF;
  SELECT count(*) INTO v_n FROM pg_policy WHERE polrelid = 'public.onemark_user_prefs'::regclass;
  IF v_n < 3 THEN
    RAISE EXCEPTION 'w3: onemark_user_prefs has % policies, expected 3', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_policy WHERE polrelid = 'public.onemark_board_paper_hits'::regclass;
  IF v_n < 2 THEN
    RAISE EXCEPTION 'w3: onemark_board_paper_hits has % policies, expected 2', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
                  AND indexname = 'uq_onemark_board_paper_hits_item_year_sitting') THEN
    RAISE EXCEPTION 'w3: the one-tick-per-item-year-sitting index is missing';
  END IF;

  -- 5: the bucket, and the question-asset table policies Wave 1 already made.
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'onemark-question-assets' AND public = false) THEN
    RAISE EXCEPTION 'w3: the onemark-question-assets bucket is missing or is public';
  END IF;
  SELECT count(*) INTO v_n FROM pg_policy
   WHERE polrelid = 'storage.objects'::regclass
     AND polname LIKE 'onemark_question_assets_storage_%';
  IF v_n < 4 THEN
    RAISE EXCEPTION 'w3: storage.objects has % onemark-question-asset policies, expected 4', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_policy WHERE polrelid = 'public.onemark_question_assets'::regclass;
  IF v_n < 2 THEN
    RAISE EXCEPTION 'w3: onemark_question_assets lost its Wave 1 RLS (% policies)', v_n;
  END IF;

  -- 6: the four policy rows, published.
  SELECT count(*) INTO v_n FROM public.platform_policies
   WHERE scope_type = 'global' AND scope_id IS NULL AND is_active AND publication_state = 'published'
     AND policy_key IN ('onemark.paper.question_count.tn_hsc_english',
                        'onemark.live.auto_close_after_minutes',
                        'onemark.live.grace_seconds',
                        'onemark.results.min_learners_for_item_stats');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'w3: % of 4 Wave 3 policy rows are published', v_n;
  END IF;
  IF public.fn_get_policy_int('onemark.live.auto_close_after_minutes', -1) <> 30 THEN
    RAISE EXCEPTION 'w3: onemark.live.auto_close_after_minutes does not read back as 30';
  END IF;
  IF public.fn_get_policy_int('onemark.results.min_learners_for_item_stats', -1) <> 3 THEN
    RAISE EXCEPTION 'w3: onemark.results.min_learners_for_item_stats does not read back as 3';
  END IF;

  -- 11: the trigger.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_onemark_item_sources_no_delete'
                   AND tgrelid = 'public.onemark_item_sources'::regclass AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'w3: the retire-not-delete trigger is missing';
  END IF;

  -- THE ANON LOCK. Nothing this file adds may be reachable with the public
  -- anon key, which ships inside every browser bundle.
  FOR v_src IN
    SELECT x FROM unnest(ARRAY[
      'public.fn_onemark_close_abandoned_live()',
      'public.fn_onemark_cohort_results(uuid)',
      'public.fn_onemark_learner_report(uuid, uuid)',
      'public.fn_onemark_vault_draw(uuid, uuid, integer, text[])',
      'public.fn_onemark_source_analytics(uuid, integer)',
      'public.fn_onemark_item_sources_no_delete()',
      'public.fn_onemark_finalize_attempt_unchecked(uuid)',
      'public.fn_onemark_record_response(uuid, uuid, jsonb, boolean, integer)',
      'public.fn_onemark_finalize_attempt(uuid)'
    ]) AS x
  LOOP
    IF has_function_privilege('anon', v_src, 'EXECUTE') THEN
      RAISE EXCEPTION 'w3: anon can EXECUTE %', v_src;
    END IF;
  END LOOP;

  -- The two machine/internal functions must not be reachable by a signed-in
  -- person either.
  IF has_function_privilege('authenticated', 'public.fn_onemark_close_abandoned_live()', 'EXECUTE') THEN
    RAISE EXCEPTION 'w3: authenticated can close every live sitting';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_onemark_finalize_attempt_unchecked(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.fn_onemark_finalize_attempt_unchecked(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'w3: the ungated finalize body is reachable outside its two callers';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.fn_onemark_close_abandoned_live()', 'EXECUTE') THEN
    RAISE EXCEPTION 'w3: the cron cannot execute fn_onemark_close_abandoned_live';
  END IF;

  -- The functions a signed-in person legitimately needs.
  FOR v_src IN
    SELECT x FROM unnest(ARRAY[
      'public.fn_onemark_cohort_results(uuid)',
      'public.fn_onemark_learner_report(uuid, uuid)',
      'public.fn_onemark_vault_draw(uuid, uuid, integer, text[])',
      'public.fn_onemark_source_analytics(uuid, integer)',
      'public.fn_onemark_record_response(uuid, uuid, jsonb, boolean, integer)',
      'public.fn_onemark_finalize_attempt(uuid)'
    ]) AS x
  LOOP
    IF NOT has_function_privilege('authenticated', v_src, 'EXECUTE') THEN
      RAISE EXCEPTION 'w3: authenticated cannot EXECUTE %', v_src;
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.onemark_user_prefs', 'SELECT')
     OR has_table_privilege('anon', 'public.onemark_board_paper_hits', 'SELECT') THEN
    RAISE EXCEPTION 'w3: anon can read a Wave 3 table';
  END IF;

  RAISE NOTICE 'w3: all Lane S3 objects present and anon is locked out';
END
$chk$;

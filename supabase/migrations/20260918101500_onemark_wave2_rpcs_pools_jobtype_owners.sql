-- 20260918101500_onemark_wave2_rpcs_pools_jobtype_owners.sql
--
-- OneMark — Wave 2, Lane S: the ONLY Wave-2 lane that ships SQL. Practice
-- pools for the two subject exams, the three learner-side RPCs (record a
-- response + Mistake Vault logic · draw a vault review · finalize an attempt),
-- the `onemark.item_draft` AI job type, the idempotent owner catch-up, and the
-- owner-on-first-sign-in trigger.
--
-- Rulings of record: specs/onemark-decisions-2026-09-02.md (decisions 3, 6, 9,
-- 10, 13, 18, 19). Schema built on: 20260917111500 (Wave 1, APPLIED and
-- ledgered 2026-09-03) + types/onemark.ts. Lane spec: .claude/onemark-wave2-specs.md
-- § Lane S.
--
-- VERSION — 20260918101500 is a deliberately distinctive timestamp, checked
-- 2026-09-04 against all three registers: absent from supabase/migrations/ on
-- jicate/main (the neighbours are 20260917111500 and 20260920000000), absent
-- from supabase_migrations.schema_migrations (read live — no 20260918* row),
-- and absent from every open PR (scripts/ci/check-migration-version-cross-pr.sh).
-- NOT "one tick after the newest" — that arithmetic collided twice on 08-15.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS FILE DOES, IN ORDER
--
--   1. Practice pools for tn_hsc_physics / tn_hsc_english — the exact idiom of
--      20260808180000_fp_practice_pools.sql §1, filtered to the two subject
--      rows. Without a pool, fn_fp_record_attempt (and any attempt row Lane V
--      creates) has no fp_assessments row to hang on. Read live 2026-09-04:
--      0 pools exist for these two exams.
--   2. fn_onemark_record_response(attempt, item, chosen, skipped, time_ms)
--      — writes fp_responses, bumps fp_items.times_served / times_correct,
--      and runs the Mistake Vault rules (decisions 9 / 10 / 18). Returns
--      {is_correct, vault_status, streak}. Never returns fp_items.answer.
--   3. fn_onemark_vault_draw(learner, exam, count) — active vault rows that
--      are due, least-recently-wrong first, no single chapter above
--      onemark.vault.max_single_chapter_pct of the request (decision 13:
--      shorter, never lopsided, never padded).
--   4. fn_onemark_finalize_attempt(attempt) — single server-side submission
--      (decision 19); score = number of correct responses; skipped ≠ wrong
--      (decision 18).
--   5. ai_job_types row `onemark.item_draft` (decision 3: AI drafts, one
--      subject Senior Learner checks every one) + its version-1 champion in
--      ai_prompt_versions — the 20260825030200 idiom. NO lib/ai-tasks/registry.ts
--      entry: that is the click registry; this is a queued job.
--   6. Owner catch-up: Wave 1 step 12b re-run verbatim and idempotently.
--      Read live 2026-09-04: 30 target profiles, 17 hold an auth.users row and
--      an owner row, 13 are still pre-registered (no auth row). Whoever has
--      signed in by apply time gets their row here; nobody else can (FK to
--      auth.users).
--   6b. fn_onemark_provision_school_owner() + trigger on public.profiles —
--      the automatic version of step 6 for every future first sign-in.
--      Institution list is a platform_policies row, never a literal.
--   7. End-state assertion DO block: anon cannot execute any of the four
--      functions; pools = 2; job type + policy + trigger present; and a
--      simulated provisioning (inside a rolled-back sub-block) yields exactly
--      one owner row + one role row.
--
-- TIER: additive. Creates 4 functions + 1 trigger, inserts 2 pools, 1 job
-- type, 1 prompt version, 1 policy row, N owner rows (N = signed-in Senior
-- Learners still lacking one; 0 today). Alters no table, drops nothing.
-- Every step is idempotent (WHERE NOT EXISTS / CREATE OR REPLACE / DROP
-- TRIGGER IF EXISTS), so re-running is a no-op.
--
-- NOT APPLIED by this PR. Rehearsed on production inside BEGIN … ROLLBACK
-- (Management API, Python-built body + curl -d @file); the orchestrator applies
-- at merge.
--
-- Reversible (in this order):
--   DROP TRIGGER IF EXISTS trg_onemark_provision_school_owner ON public.profiles;
--   DROP FUNCTION IF EXISTS public.fn_onemark_provision_school_owner();
--   DROP FUNCTION IF EXISTS public.fn_onemark_finalize_attempt(uuid);
--   DROP FUNCTION IF EXISTS public.fn_onemark_vault_draw(uuid, uuid, int);
--   DROP FUNCTION IF EXISTS public.fn_onemark_record_response(uuid, uuid, jsonb, boolean, int);
--   DELETE FROM ai_prompt_versions WHERE job_type = 'onemark.item_draft';
--   DELETE FROM ai_job_types WHERE job_type = 'onemark.item_draft';
--   DELETE FROM platform_policies WHERE policy_key = 'onemark.provision.institution_ids';
--   DELETE FROM fp_assessments WHERE cohort_id IS NULL AND (config->>'pool')::boolean
--     AND exam_definition_id IN (SELECT id FROM exam_definitions WHERE config_key IN ('tn_hsc_physics','tn_hsc_english'))
--     AND created_at >= '<apply timestamp>';
--   Owner rows from step 6: DELETE FROM school_jkkn_owners WHERE ... assigned_at >= '<apply timestamp>'
--     (same predicate as the Wave 1 header).
-- ─────────────────────────────────────────────────────────────────────────────


-- =============================================================================
-- 1. Practice pools — one standing fp_assessments row per subject exam.
-- =============================================================================
-- Verbatim shape of 20260808180000 §1 (kind='practice', cohort_id NULL,
-- config.pool=true, guarded by NOT EXISTS pool), restricted to the two OneMark
-- subject rows. A pool is a container a practice run is recorded against, not
-- a fixed paper: no fp_assessment_items rows. Lane V's attempt routes create
-- fp_attempts against these ids for practice / timed / vault_review modes.
INSERT INTO public.fp_assessments (exam_definition_id, title, kind, config, is_active)
SELECT
  ed.id,
  'Practice — ' || ed.display_name,
  'practice',
  jsonb_build_object(
    'pool', true,
    'note', 'Standing practice pool. Questions are drawn per run; see fp_responses for what was answered.'
  ),
  true
FROM public.exam_definitions ed
WHERE ed.config_key IN ('tn_hsc_physics', 'tn_hsc_english')
  AND NOT EXISTS (
    SELECT 1
    FROM public.fp_assessments a
    WHERE a.exam_definition_id = ed.id
      AND a.cohort_id IS NULL
      AND COALESCE((a.config ->> 'pool')::boolean, false) IS TRUE
  );


-- =============================================================================
-- 2. fn_onemark_record_response — one answer, and the Mistake Vault rules.
-- =============================================================================
-- Caller must be able to see the attempt's learner (fn_fp_can_view_student —
-- the learner themself, their guardian, the Senior Learner running their
-- cohort, or the school owner; 20260706065000). The attempt must still be
-- in_progress: a submitted attempt is closed (decision 19).
--
-- Correctness is computed here, server-side, exactly as fn_fp_record_attempt
-- does (an `answer` that is an object with a `correct` key is normalised to
-- that key; otherwise compared whole) — the answer key never leaves the
-- database.
--
-- Vault rules (decisions 9 / 10 / 18):
--   · skipped            → nothing vault-related (not right, not wrong)
--   · wrong              → upsert (student_id, item_id): streak 0, total_wrong+1,
--                          status active, mastered_at NULL, next_eligible_at now()
--                          — a mastered row is re-activated (decision 10)
--   · correct, row active, and this sitting's session_id is NOT the session of
--     the last counted correct, and the row is due (next_eligible_at <= now(),
--     decision 9: "a separate session >= 2 days later")
--                        → streak+1, last_correct_session_id = session;
--                          streak >= onemark.vault.mastery_streak (2) → mastered;
--                          otherwise next_eligible_at = now() + min_gap_days
--   · correct, same session → no change (twice in one sitting counts once)
--   · correct, row mastered → no change
--   · correct, no row       → nothing (only a wrong answer creates a row)
--
-- session_id: fp_attempts.session_id (one uuid per sitting, set by Lane V).
-- When NULL (rows that predate OneMark, or a caller that did not set it) the
-- attempt id stands in, so "same sitting" still means something.
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
  v_attempt      record;
  v_item         record;
  v_session      uuid;
  v_norm_answer  jsonb;
  v_is_correct   boolean;
  v_skipped      boolean := COALESCE(p_skipped, false);
  v_existed      boolean;
  v_vault        record;
  v_streak_goal  int;
  v_gap_days     int;
  v_vault_status text;
  v_streak       int;
BEGIN
  IF p_attempt_id IS NULL OR p_item_id IS NULL THEN
    RAISE EXCEPTION 'fn_onemark_record_response: attempt_id and item_id are required';
  END IF;

  SELECT a.id, a.student_id, a.status, a.session_id
    INTO v_attempt
    FROM public.fp_attempts a
   WHERE a.id = p_attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_onemark_record_response: attempt % not found', p_attempt_id;
  END IF;

  IF NOT public.fn_fp_can_view_student(v_attempt.student_id) THEN
    RAISE EXCEPTION 'fn_onemark_record_response: not authorized for attempt %', p_attempt_id
      USING ERRCODE = '42501';
  END IF;

  IF v_attempt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'fn_onemark_record_response: attempt % is %, not in_progress (single submission, decision 19)',
      p_attempt_id, v_attempt.status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT i.id, i.answer
    INTO v_item
    FROM public.fp_items i
   WHERE i.id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_onemark_record_response: item % not found', p_item_id;
  END IF;

  v_session := COALESCE(v_attempt.session_id, v_attempt.id);

  -- Correctness (same normalisation as fn_fp_record_attempt). A skipped item
  -- is neither right nor wrong (decision 18).
  IF v_skipped THEN
    v_is_correct := NULL;
  ELSIF v_item.answer IS NULL THEN
    v_is_correct := NULL;
  ELSE
    IF jsonb_typeof(v_item.answer) = 'object' AND (v_item.answer ? 'correct') THEN
      v_norm_answer := v_item.answer -> 'correct';
    ELSE
      v_norm_answer := v_item.answer;
    END IF;
    v_is_correct := (p_chosen IS NOT DISTINCT FROM v_norm_answer);
  END IF;

  -- Persist the response. Re-answering the same item in the same attempt
  -- overwrites (the last answer stands for the score) and does NOT re-count
  -- a serve.
  SELECT EXISTS (
    SELECT 1 FROM public.fp_responses r
     WHERE r.attempt_id = p_attempt_id AND r.item_id = p_item_id
  ) INTO v_existed;

  INSERT INTO public.fp_responses (attempt_id, item_id, chosen, is_correct, time_ms, skipped)
  VALUES (p_attempt_id, p_item_id,
          CASE WHEN v_skipped THEN NULL ELSE p_chosen END,
          v_is_correct, p_time_ms, v_skipped)
  ON CONFLICT (attempt_id, item_id)
  DO UPDATE SET chosen     = EXCLUDED.chosen,
                is_correct = EXCLUDED.is_correct,
                time_ms    = EXCLUDED.time_ms,
                skipped    = EXCLUDED.skipped;

  IF NOT v_existed THEN
    UPDATE public.fp_items
       SET times_served  = times_served + 1,
           times_correct = times_correct + CASE WHEN v_is_correct IS TRUE THEN 1 ELSE 0 END
     WHERE id = p_item_id;
  END IF;

  -- Mistake Vault. Only the FIRST answer to an item in an attempt reaches the
  -- vault: a re-answer (timed mode may revisit a question before submitting)
  -- overwrites the response and the score, but must not let a learner who has
  -- just seen the explanation turn a wrong into a counted correct in the same
  -- breath (decision 9's spirit: the next correct is a separate sitting).
  IF v_existed THEN
    NULL;
  ELSIF NOT v_skipped AND v_is_correct IS FALSE THEN
    INSERT INTO public.onemark_mistake_vault AS mv
      (student_id, item_id, consecutive_correct_count, total_wrong, status, mastered_at, next_eligible_at)
    VALUES
      (v_attempt.student_id, p_item_id, 0, 1, 'active', NULL, now())
    ON CONFLICT (student_id, item_id)
    DO UPDATE SET consecutive_correct_count = 0,
                  total_wrong               = mv.total_wrong + 1,
                  status                    = 'active',
                  mastered_at               = NULL,
                  next_eligible_at          = now();
  ELSIF NOT v_skipped AND v_is_correct IS TRUE THEN
    SELECT v.id, v.status, v.consecutive_correct_count, v.last_correct_session_id, v.next_eligible_at
      INTO v_vault
      FROM public.onemark_mistake_vault v
     WHERE v.student_id = v_attempt.student_id AND v.item_id = p_item_id
       FOR UPDATE;
    IF FOUND
       AND v_vault.status = 'active'
       AND v_vault.last_correct_session_id IS DISTINCT FROM v_session
       AND (v_vault.next_eligible_at IS NULL OR v_vault.next_eligible_at <= now())
    THEN
      v_streak_goal := public.fn_get_policy_int('onemark.vault.mastery_streak', 2);
      v_gap_days    := public.fn_get_policy_int('onemark.vault.min_gap_days', 2);
      v_streak      := v_vault.consecutive_correct_count + 1;
      IF v_streak >= v_streak_goal THEN
        UPDATE public.onemark_mistake_vault
           SET consecutive_correct_count = v_streak,
               last_correct_session_id   = v_session,
               status                    = 'mastered',
               mastered_at               = now()
         WHERE id = v_vault.id;
      ELSE
        UPDATE public.onemark_mistake_vault
           SET consecutive_correct_count = v_streak,
               last_correct_session_id   = v_session,
               next_eligible_at          = now() + (v_gap_days * interval '1 day')
         WHERE id = v_vault.id;
      END IF;
    END IF;
  END IF;

  SELECT v.status, v.consecutive_correct_count
    INTO v_vault_status, v_streak
    FROM public.onemark_mistake_vault v
   WHERE v.student_id = v_attempt.student_id AND v.item_id = p_item_id;

  RETURN jsonb_build_object(
    'is_correct',   v_is_correct,
    'skipped',      v_skipped,
    'vault_status', v_vault_status,
    'streak',       v_streak
  );
END;
$$;

COMMENT ON FUNCTION public.fn_onemark_record_response(uuid, uuid, jsonb, boolean, int) IS
  'OneMark: record one response on an in-progress attempt (caller must pass fn_fp_can_view_student for the attempt''s learner), bump fp_items serve counters, and apply the Mistake Vault rules (decisions 9/10/18). Returns {is_correct, skipped, vault_status, streak}; never returns the answer key. Added 2026-09-04 (OneMark Wave 2, Lane S).';

REVOKE EXECUTE ON FUNCTION public.fn_onemark_record_response(uuid, uuid, jsonb, boolean, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_onemark_record_response(uuid, uuid, jsonb, boolean, int) TO authenticated;


-- =============================================================================
-- 3. fn_onemark_vault_draw — which questions a review session serves.
-- =============================================================================
-- Active vault rows for this learner whose items belong to the given subject
-- exam and are still active in the bank, due now (next_eligible_at <= now()),
-- ordered least-recently-wrong first — next_eligible_at is stamped now() by
-- every wrong answer and pushed out by a counted correct, so ascending order
-- IS "longest since it was last wrong / last reviewed"; created_at breaks ties.
--
-- Cap (decision 13): no single fp_items.topic_id may exceed
-- onemark.vault.max_single_chapter_pct (60) percent of p_count, rounded DOWN.
-- Items with no chapter (English chapter-agnostic tags, PRD §4.4) form one
-- bucket of their own under the same cap. When the vault cannot fill p_count
-- under the cap it returns fewer — never padded, never lopsided.
CREATE OR REPLACE FUNCTION public.fn_onemark_vault_draw(
  p_student_id         uuid,
  p_exam_definition_id uuid,
  p_count              int
)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pct int;
  v_cap int;
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

  v_pct := public.fn_get_policy_int('onemark.vault.max_single_chapter_pct', 60);
  v_cap := floor(p_count * v_pct / 100.0)::int;

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
  )
  SELECT d.item_id
    FROM due d
   WHERE d.rank_in_topic <= v_cap
   ORDER BY d.next_eligible_at ASC NULLS FIRST, d.created_at ASC, d.item_id
   LIMIT p_count;
END;
$$;

COMMENT ON FUNCTION public.fn_onemark_vault_draw(uuid, uuid, int) IS
  'OneMark: item ids for one Mistake Vault review session — active, due, least-recently-wrong first, no chapter above onemark.vault.max_single_chapter_pct of p_count (round down; fewer rather than padded, decision 13). Caller must pass fn_fp_can_view_student. Added 2026-09-04 (OneMark Wave 2, Lane S).';

REVOKE EXECUTE ON FUNCTION public.fn_onemark_vault_draw(uuid, uuid, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_onemark_vault_draw(uuid, uuid, int) TO authenticated;


-- =============================================================================
-- 4. fn_onemark_finalize_attempt — one submission, server-side.
-- =============================================================================
-- score = number of responses with is_correct = true (decision 18: a skipped
-- item is not wrong and simply does not count). NOTE the unit: fn_fp_record_attempt
-- (the older Foundation practice path) stores score as a 0..1 ratio; OneMark
-- attempts store the COUNT, per the lane spec. Readers must key on
-- fp_attempts.mode (NULL = legacy ratio, non-NULL = OneMark count).
-- Refuses an attempt that is already submitted (decision 19).
CREATE OR REPLACE FUNCTION public.fn_onemark_finalize_attempt(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt   record;
  v_correct   int;
  v_answered  int;
  v_skipped   int;
  v_now       timestamptz := now();
BEGIN
  IF p_attempt_id IS NULL THEN
    RAISE EXCEPTION 'fn_onemark_finalize_attempt: attempt_id is required';
  END IF;

  SELECT a.id, a.student_id, a.status
    INTO v_attempt
    FROM public.fp_attempts a
   WHERE a.id = p_attempt_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_onemark_finalize_attempt: attempt % not found', p_attempt_id;
  END IF;

  IF NOT public.fn_fp_can_view_student(v_attempt.student_id) THEN
    RAISE EXCEPTION 'fn_onemark_finalize_attempt: not authorized for attempt %', p_attempt_id
      USING ERRCODE = '42501';
  END IF;

  IF v_attempt.status = 'submitted' THEN
    RAISE EXCEPTION 'fn_onemark_finalize_attempt: attempt % is already submitted (single submission, decision 19)', p_attempt_id
      USING ERRCODE = 'check_violation';
  END IF;

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
    'attempt_id',   p_attempt_id,
    'score',        v_correct,
    'correct',      v_correct,
    'answered',     v_answered,
    'skipped',      v_skipped,
    'submitted_at', v_now
  );
END;
$$;

COMMENT ON FUNCTION public.fn_onemark_finalize_attempt(uuid) IS
  'OneMark: submit an in-progress attempt once (decision 19). score = count of correct responses; skipped is neither right nor wrong (decision 18). Caller must pass fn_fp_can_view_student. Added 2026-09-04 (OneMark Wave 2, Lane S).';

REVOKE EXECUTE ON FUNCTION public.fn_onemark_finalize_attempt(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_onemark_finalize_attempt(uuid) TO authenticated;


-- =============================================================================
-- 5. ai_job_types row `onemark.item_draft` — the 20260825030200 idiom.
-- =============================================================================
-- Declarative registry: a new prompt-only AI job is a DB row, not a runner
-- script. fn_ai_enqueue refuses any job_type without an enabled row here, so
-- this row IS the switch. Lane I's POST /api/foundation/onemark/draft
-- (PR #3269) validates its body against input_schema below and enqueues
-- {exam_definition_id, exam_key, topic_id, tag_keys, count, bloom_level} as
-- the payload; the drain substitutes the payload into the template.
--
-- monthly_spend_cap_inr = 2000 — a NUMBER THE DIRECTOR HAS NOT RULED ON
-- (decisions file §4: "set one before 44 Senior Learners can trigger
-- drafts"). Listed [risky] in the PR. daily_cap_per_user = 5 per lane spec.
--
-- allow_rule = permission:foundation.items.manage — the same key that approves
-- a draft (decision 7), and the gate Lane I's route enforces.
--
-- output_target = table:fp_items — the lane spec's ruling ("fp_items draft rows
-- with is_active=false and source_key='internal'"). Read live 2026-09-04: none
-- of the 67 existing job types uses a table:% target (all are job.result or
-- inbox), so the seat runner's support for it is UNVERIFIED from this lane —
-- listed [risky] in the PR with the fallback (job.result + a collect pass).
--
-- Enabled = true, as the charter-draft idiom is: the apply of this migration is
-- Director-gated and IS the go. While un-applied nothing changes.
INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, max_inflight, schedulable, enabled,
   input_schema, expected_seconds, provider, model_id, external_allowed, loop_key,
   daily_cap_per_user, monthly_spend_cap_inr)
SELECT
  'onemark.item_draft',
  'OneMark · One-mark MCQ Drafter',
  'Drafts N bilingual (Tamil + English) one-mark multiple-choice questions in the Tamil Nadu State Board Class-12 Part-I style for one unit and one or more category tags of tn_hsc_physics / tn_hsc_english. Output lands as fp_items DRAFT rows (is_active=false, source_key=''internal'') that queue on /foundation/onemark/review; NOTHING reaches a learner until one subject Senior Learner approves each item (decision 7). Difficulty is JABT K1–K6 only (decision 6); A-dimensions are never assigned by this job. Enqueued by POST /api/foundation/onemark/draft (gate foundation.items.manage).',
  $onemark$You draft ONE-MARK multiple-choice questions for the Tamil Nadu State Board Higher Secondary (Class 12) examination, Part-I style: one stem, exactly four options (A–D), exactly one correct option, one mark each. The subject is either Physics (Tamil Nadu textbook, Volumes 1–2) or English (Tamil Nadu textbook: prose, poem, supplementary reader, and the grammar/vocabulary categories used in Part-I).

INPUT (JSON): {"exam_definition_id": uuid, "exam_key": "tn_hsc_physics" | "tn_hsc_english", "topic_id": uuid or null, "tag_keys": [category tag keys], "count": N, "bloom_level": "K1".."K6"}

The payload for this run:
{{payload}}

RULES
- Produce exactly `count` items. Every item must belong to the given unit (topic_id; when null the item is chapter-agnostic — allowed only for English grammar/vocabulary tags) and to ONE of the given tag_keys.
- Stay inside the prescribed Tamil Nadu State Board textbook content for that unit. Do not invent facts, constants, or textbook lines. Physics numericals must be single-step and use the textbook's values and SI units; write powers of ten as ×10⁻⁵ style Unicode, subscripts/superscripts as Unicode.
- Bilingual: give the stem, all four options and the explanation in BOTH English and Tamil. The Tamil must be the textbook's own terminology for that concept; when unsure of the Tamil term, keep the English term in brackets after it rather than inventing one.
- Options: four, plausible, mutually exclusive, similar in length and form. Exactly one correct. No "all of the above" / "none of the above". Do not reuse a distractor pattern across items.
- Assign `bloom_level` from K1 to K6 (JKKN Advanced Bloom's Taxonomy K-dimension) and target the requested level. NEVER assign an A-dimension (A1–A5): a one-mark MCQ cannot evidence the affective/advanced dimensions, so that field must not appear.
- `option_layout`: "inline_4" when every option is short (≤ ~20 characters), "inline_2x2" when medium, "stacked" when any option is long or the item is an assertion/reason set, else "auto".
- Every item carries a short `explanation_en` / `explanation_ta` that a learner reads AFTER answering — state why the key is right in one or two sentences.

OUTPUT — strict JSON only, no prose, no code fences, no trailing commentary:
{"items":[{"stem_en":"...","stem_ta":"...","options_en":["...","...","...","..."],"options_ta":["...","...","...","..."],"answer":"A"|"B"|"C"|"D","explanation_en":"...","explanation_ta":"...","bloom_level":"K1".."K6","tag_key":"<one of tag_keys>","option_layout":"auto"|"inline_4"|"inline_2x2"|"stacked"}]}

If the unit and tags cannot honestly yield `count` items from the textbook, return fewer and add {"shortfall_reason":"..."} at the top level. Never pad with off-unit or invented content.

{{prompt}}$onemark$,
  'none', 'table:fp_items',
  false,          -- interactive: queued by the draft route, a human is not waiting on the request
  'max', 'permission:foundation.items.manage', 3,
  false,          -- schedulable: only ever enqueued by a Senior Learner's request
  true,           -- enabled: deliberate (see header) — the apply is the Director's go
  '[{"key":"exam_definition_id","type":"text","label":"Subject exam (exam_definitions.id of tn_hsc_physics / tn_hsc_english)","required":true},
    {"key":"topic_id","type":"text","label":"Unit / chapter (cdc_exam_syllabus_topics.id; null = chapter-agnostic English tag)","required":false},
    {"key":"tag_keys","type":"array","label":"Category tag keys from onemark_item_tags","required":true},
    {"key":"count","type":"number","label":"How many items to draft (1–20)","required":true},
    {"key":"bloom_level","type":"enum","label":"JABT K-level to target (K1–K6)","required":true,"options":["K1","K2","K3","K4","K5","K6"]}]'::jsonb,
  120, 'anthropic', 'sonnet',
  false,          -- external_allowed: internal authoring job, never B2A-reachable
  NULL,           -- loop_key: no MetaLoop registration yet
  5,              -- daily_cap_per_user: lane spec
  2000            -- monthly_spend_cap_inr: [risky] — Director has not set a number
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_job_types WHERE job_type = 'onemark.item_draft'
);
-- fallback_provider / fallback_model_id deliberately omitted (NULL) — mirrors
-- loops.charter_draft and prompt_compare.judge, which carry no fallback.

-- Version-1 champion in ai_prompt_versions (WHERE NOT EXISTS, never ON CONFLICT).
INSERT INTO public.ai_prompt_versions (job_type, version, prompt, status, notes, created_by)
SELECT t.job_type,
       1,
       t.prompt_template,
       'champion',
       'seed: initial one-mark MCQ drafting prompt (OneMark Wave 2, Lane S)',
       'migration:20260918101500'
  FROM public.ai_job_types t
 WHERE t.job_type = 'onemark.item_draft'
   AND t.prompt_template IS NOT NULL
   AND btrim(t.prompt_template) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM public.ai_prompt_versions v WHERE v.job_type = t.job_type
   );


-- =============================================================================
-- 6. Owner catch-up — Wave 1 step 12b, verbatim, idempotent.
-- =============================================================================
-- school_jkkn_owners.jkkn_user_id REFERENCES auth.users. A PRE-REGISTERED
-- profile has no auth row until its first Google sign-in (13 of 30 on
-- 2026-09-04), so Wave 1 could seed only the 17 who had signed in. Whoever has
-- signed in by the time THIS file applies gets their row here; step 6b makes
-- every later one automatic. Before/after counts are asserted in step 7 and
-- reported in the PR body.
INSERT INTO public.school_jkkn_owners (school_id, jkkn_user_id, role, is_active, assigned_at)
SELECT s.id, p.id, 'outreach_coordinator'::public.school_owner_role, true, now()
FROM public.schools s
JOIN public.profiles p ON p.institution_id = s.institution_id AND p.is_active
  AND p.role IN ('faculty', 'hod', 'principal')
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
WHERE s.name = 'Nattraja Vidhyalya CBSE'
  AND s.institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM public.school_jkkn_owners o
    WHERE o.school_id = s.id AND o.jkkn_user_id = p.id
  );


-- =============================================================================
-- 6b. Owner on first sign-in — policy row + trigger function + trigger.
-- =============================================================================
-- WHICH HOOK, AND WHY (read from the live sign-in path 2026-09-04):
--   · auth.users AFTER INSERT fires `on_auth_user_created` → handle_new_user(),
--     which SKIPS when a profiles row already carries that email (the
--     pre-registered case). At that instant the pre-registered profile still
--     has its OLD id, so an auth.users trigger keyed on NEW.id finds nothing.
--   · app/auth/callback/route.ts then calls migrate_pre_registered_profile_to_auth
--     (20260808190000): DELETE the old profile (CASCADE removes its user_roles,
--     including the Wave 1 school_faculty row), INSERT a NEW profiles row with
--     id = auth.users.id copying role / institution_id / is_active, re-INSERT
--     the snapshotted user_roles ON CONFLICT DO NOTHING.
--   ⇒ The profile row is created AFTER the auth row exists, keyed on the auth
--     id. The hook is therefore AFTER INSERT OR UPDATE OF institution_id, role,
--     is_active ON public.profiles — the INSERT in that RPC is what fires it.
--     (is_active is included beyond the spec's two columns so re-activating a
--     Senior Learner's profile provisions too; an inactive one never does.)
--
-- The function NEVER raises: a trigger that broke the profile swap would bounce
-- the sign-in itself (the 2026-05-06 `link_pre_registered_profile_trigger`
-- lockout, 20260506000001). Every failure is a WARNING and RETURN NULL.
--
-- Institution list = platform_policies row onemark.provision.institution_ids
-- (json array of institution uuids), seeded with Nattraja only. Adding a
-- school next year is one row UPDATE, not a migration. The school row is the
-- institution's `schools` row with ownership = 'internal' (oldest if several).
--
-- BLAST RADIUS (disclosed [risky]): an owner row makes user_owns_school(<that
-- school>) true, the predicate on 15 Schools-Network policies (school_contacts /
-- school_contributions / school_sessions / program_partner_schools / schools),
-- scoped to that one school row — every future Nattraja faculty / hod /
-- principal first sign-in self-provisions this, with no human in the loop.
INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, description,
  data_type, is_system, is_active, classification, publication_state
)
SELECT
  'onemark.provision.institution_ids',
  'global',
  NULL,
  '["29c221d1-b918-4c46-9d67-857273b0b553"]'::jsonb,
  'Institutions whose active faculty / hod / principal profiles are automatically made Schools-Network owners (outreach_coordinator) of the institution''s internal school AND given the school_faculty role the moment they hold a signed-in account — so a Senior Learner can enrol their own learners in OneMark without a hand-run migration. A JSON array of institutions.id. Empty array = the trigger does nothing. Seeded with Nattraja Vidhyalya CBSE only (OneMark Wave 2, Lane S).',
  'array',
  false,
  true,
  'operational',
  'published'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'onemark.provision.institution_ids'
    AND scope_type = 'global'
    AND scope_id IS NULL
);

CREATE OR REPLACE FUNCTION public.fn_onemark_provision_school_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institutions jsonb;
  v_school_id    uuid;
  v_role_id      uuid;
BEGIN
  -- Cheap exits first: this trigger sits on a 7,000-row table that every
  -- sign-in touches.
  IF NEW.institution_id IS NULL
     OR NEW.role IS NULL
     OR NEW.role NOT IN ('faculty', 'hod', 'principal')
     OR COALESCE(NEW.is_active, false) IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  v_institutions := public.fn_get_policy_json('onemark.provision.institution_ids', '[]'::jsonb);
  IF v_institutions IS NULL
     OR jsonb_typeof(v_institutions) <> 'array'
     OR NOT (v_institutions ? NEW.institution_id::text) THEN
    RETURN NULL;
  END IF;

  -- An owner row references auth.users; a pre-registered profile (admin-created,
  -- not yet signed in) has none and must not raise 23503 here.
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.id) THEN
    RETURN NULL;
  END IF;

  SELECT s.id INTO v_school_id
    FROM public.schools s
   WHERE s.institution_id = NEW.institution_id
     AND s.ownership = 'internal'::public.school_ownership
   ORDER BY s.created_at ASC
   LIMIT 1;
  IF v_school_id IS NULL THEN
    RAISE WARNING '[onemark provision] no internal schools row for institution % — profile % not provisioned', NEW.institution_id, NEW.id;
    RETURN NULL;
  END IF;

  INSERT INTO public.school_jkkn_owners (school_id, jkkn_user_id, role, is_active, assigned_at)
  SELECT v_school_id, NEW.id, 'outreach_coordinator'::public.school_owner_role, true, now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.school_jkkn_owners o
     WHERE o.school_id = v_school_id AND o.jkkn_user_id = NEW.id AND o.is_active
  );

  SELECT cr.id INTO v_role_id FROM public.custom_roles cr WHERE cr.role_key = 'school_faculty';
  IF v_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id, is_primary, assigned_at)
    SELECT NEW.id, v_role_id, false, now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = NEW.id AND ur.role_id = v_role_id
    );
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Never break a sign-in. The miss is visible in the logs and repairable by
  -- re-running step 6 of this file.
  RAISE WARNING '[onemark provision] profile % (institution %) not provisioned: % (%)', NEW.id, NEW.institution_id, SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.fn_onemark_provision_school_owner() IS
  'AFTER INSERT/UPDATE trigger on profiles: when an active faculty / hod / principal profile at an institution listed in platform_policies onemark.provision.institution_ids holds an auth.users row, insert (WHERE NOT EXISTS) its school_jkkn_owners outreach_coordinator row for the institution''s internal school and its school_faculty user_roles row. Never raises. Added 2026-09-04 (OneMark Wave 2, Lane S).';

-- A trigger function is not RPC-callable, but the lock is asserted anyway
-- (anon-lock rule, CLAUDE.md 2026-06-06) and proven in step 7.
REVOKE EXECUTE ON FUNCTION public.fn_onemark_provision_school_owner() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_onemark_provision_school_owner ON public.profiles;
CREATE TRIGGER trg_onemark_provision_school_owner
  AFTER INSERT OR UPDATE OF institution_id, role, is_active ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_onemark_provision_school_owner();


-- =============================================================================
-- 7. End-state assertion — raise on any miss so the file cannot land half-applied.
-- =============================================================================
DO $$
DECLARE
  v_pools          int;
  v_jobtype        int;
  v_prompt_v1      int;
  v_policy         int;
  v_trigger        int;
  v_owner_eligible int;
  v_owners         int;
  v_anon_exec      boolean;
  v_sim_profile    uuid;
  v_sim_school     uuid;
  v_sim_role       uuid;
  v_sim_owner_rows int := -1;
  v_sim_role_rows  int := -1;
BEGIN
  SELECT count(*) INTO v_pools
    FROM public.fp_assessments a
    JOIN public.exam_definitions e ON e.id = a.exam_definition_id
   WHERE e.config_key IN ('tn_hsc_physics', 'tn_hsc_english')
     AND a.cohort_id IS NULL
     AND COALESCE((a.config ->> 'pool')::boolean, false) IS TRUE;
  SELECT count(*) INTO v_jobtype   FROM public.ai_job_types      WHERE job_type = 'onemark.item_draft' AND enabled;
  SELECT count(*) INTO v_prompt_v1 FROM public.ai_prompt_versions WHERE job_type = 'onemark.item_draft' AND version = 1 AND status = 'champion';
  SELECT count(*) INTO v_policy    FROM public.platform_policies
   WHERE policy_key = 'onemark.provision.institution_ids' AND scope_type = 'global' AND scope_id IS NULL AND is_active;
  SELECT count(*) INTO v_trigger   FROM pg_trigger
   WHERE tgrelid = 'public.profiles'::regclass AND tgname = 'trg_onemark_provision_school_owner' AND NOT tgisinternal;

  -- anon must not be able to execute any of the four functions.
  SELECT has_function_privilege('anon', 'public.fn_onemark_record_response(uuid, uuid, jsonb, boolean, int)', 'EXECUTE')
      OR has_function_privilege('anon', 'public.fn_onemark_vault_draw(uuid, uuid, int)', 'EXECUTE')
      OR has_function_privilege('anon', 'public.fn_onemark_finalize_attempt(uuid)', 'EXECUTE')
      OR has_function_privilege('anon', 'public.fn_onemark_provision_school_owner()', 'EXECUTE')
    INTO v_anon_exec;

  -- Owner catch-up: every signed-in target profile now holds an owner row.
  SELECT count(*) INTO v_owner_eligible
    FROM public.profiles p
   WHERE p.institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'::uuid
     AND p.role IN ('faculty', 'hod', 'principal') AND p.is_active
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);
  SELECT count(*) INTO v_owners
    FROM public.school_jkkn_owners o
    JOIN public.schools s ON s.id = o.school_id
    JOIN public.profiles p ON p.id = o.jkkn_user_id
   WHERE s.name = 'Nattraja Vidhyalya CBSE' AND s.institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'::uuid
     AND o.is_active
     AND p.institution_id = s.institution_id AND p.role IN ('faculty', 'hod', 'principal') AND p.is_active;

  -- Simulated provisioning inside a rolled-back sub-block: take one signed-in
  -- Nattraja Senior Learner, remove their owner + school_faculty rows, touch
  -- the profile's role (an UPDATE OF role), and count what the trigger put
  -- back. The sentinel exception rolls the sub-block back; the counts survive
  -- because PL/pgSQL variables are not transactional. Skipped (not failed)
  -- when no such person exists — a non-production database.
  SELECT p.id INTO v_sim_profile
    FROM public.profiles p
   WHERE p.institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'::uuid
     AND p.role IN ('faculty', 'hod', 'principal') AND p.is_active
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
   ORDER BY p.email
   LIMIT 1;
  SELECT s.id INTO v_sim_school FROM public.schools s
   WHERE s.institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'::uuid AND s.ownership = 'internal'
   ORDER BY s.created_at LIMIT 1;
  SELECT cr.id INTO v_sim_role FROM public.custom_roles cr WHERE cr.role_key = 'school_faculty';

  IF v_sim_profile IS NOT NULL AND v_sim_school IS NOT NULL AND v_sim_role IS NOT NULL THEN
    BEGIN
      DELETE FROM public.school_jkkn_owners WHERE school_id = v_sim_school AND jkkn_user_id = v_sim_profile;
      DELETE FROM public.user_roles WHERE user_id = v_sim_profile AND role_id = v_sim_role;
      UPDATE public.profiles SET role = role WHERE id = v_sim_profile;
      SELECT count(*) INTO v_sim_owner_rows FROM public.school_jkkn_owners
       WHERE school_id = v_sim_school AND jkkn_user_id = v_sim_profile AND is_active;
      SELECT count(*) INTO v_sim_role_rows FROM public.user_roles
       WHERE user_id = v_sim_profile AND role_id = v_sim_role;
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'onemark:simulation-rollback';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'onemark:simulation-rollback' THEN
        RAISE;
      END IF;
    END;
    IF v_sim_owner_rows <> 1 OR v_sim_role_rows <> 1 THEN
      RAISE EXCEPTION 'onemark wave2: provisioning simulation expected 1 owner row + 1 role row, got % + %', v_sim_owner_rows, v_sim_role_rows;
    END IF;
  ELSE
    RAISE NOTICE 'onemark wave2: provisioning simulation SKIPPED (no signed-in Nattraja Senior Learner / school / role on this database)';
  END IF;

  IF v_pools <> 2        THEN RAISE EXCEPTION 'onemark wave2: expected 2 practice pools, found %', v_pools; END IF;
  IF v_jobtype <> 1      THEN RAISE EXCEPTION 'onemark wave2: ai_job_types onemark.item_draft missing or disabled'; END IF;
  IF v_prompt_v1 <> 1    THEN RAISE EXCEPTION 'onemark wave2: ai_prompt_versions v1 champion for onemark.item_draft missing'; END IF;
  IF v_policy <> 1       THEN RAISE EXCEPTION 'onemark wave2: platform_policies onemark.provision.institution_ids missing'; END IF;
  IF v_trigger <> 1      THEN RAISE EXCEPTION 'onemark wave2: trg_onemark_provision_school_owner missing on profiles'; END IF;
  IF v_anon_exec         THEN RAISE EXCEPTION 'onemark wave2: anon can EXECUTE one of the fn_onemark_* functions'; END IF;
  IF v_owners < v_owner_eligible THEN
    RAISE EXCEPTION 'onemark wave2: % signed-in Nattraja Senior Learners but only % owner rows', v_owner_eligible, v_owners;
  END IF;

  RAISE NOTICE 'onemark wave2 end state OK: pools=% jobtype=% prompt_v1=% policy=% trigger=% owners=%/% sim_owner=% sim_role=%',
    v_pools, v_jobtype, v_prompt_v1, v_policy, v_trigger, v_owners, v_owner_eligible, v_sim_owner_rows, v_sim_role_rows;
END $$;

NOTIFY pgrst, 'reload schema';

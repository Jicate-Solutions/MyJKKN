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
--      — writes fp_responses. In practice / vault_review it grades at once,
--      bumps fp_items.times_served / times_correct and runs the Mistake Vault
--      rules (decisions 9 / 10 / 18). In timed / live it stores ONLY the
--      chosen option (is_correct NULL, no counters, no vault) — grading
--      happens at finalize, so nothing a learner can read mid-paper (their own
--      fp_responses rows, their own vault rows) carries the verdict. Returns
--      {is_correct, vault_status, streak, revealed}. Never returns fp_items.answer.
--      Refuses an attempt whose mode is NULL (a legacy Foundation attempt).
--   2b. fn_onemark_grade(chosen, answer) + fn_onemark_apply_vault(...) — the
--      two internal helpers both RPCs share (one normaliser, one vault rule
--      set). Executable by nobody but the owner; never RPC-callable.
--   3. fn_onemark_vault_draw(learner, exam, count) — active vault rows that
--      are due, least-recently-wrong-or-reviewed first, no single chapter above
--      onemark.vault.max_single_chapter_pct of the request (decision 13:
--      shorter, never lopsided, never padded).
--   4. fn_onemark_finalize_attempt(attempt) — single server-side submission
--      (decision 19); on a fixed paper, every item without a response becomes
--      a skipped response first (decision 18, so "unanswered" is counted
--      without the client having to say so); on timed / live it grades every
--      response now (is_correct backfilled, counters bumped, vault applied);
--      score = number of correct responses; skipped ≠ wrong (decision 18).
--      Refuses submitted, abandoned and legacy (mode NULL) attempts.
--   5. ai_job_types row `onemark.item_draft` (decision 3: AI drafts, one
--      subject Senior Learner checks every one) + its version-1 champion in
--      ai_prompt_versions — the 20260825030200 idiom, but ENABLED = FALSE:
--      no runner on main honours table:fp_items yet, and the harmful failure
--      of a lenient runner is LIVE draft rows (see §5 and the block below).
--      The prompt's OUTPUT contract is the fp_items column shape (stem /
--      stem_ta / options / options_ta / answer {"correct":…} / explanation /
--      explanation_ta / bloom_level / tags / option_layout). NO
--      lib/ai-tasks/registry.ts entry: that is the click registry.
--   6. Owner catch-up: Wave 1 step 12b re-run verbatim and idempotently.
--      Read live 2026-09-04: 30 target profiles, 17 hold an auth.users row and
--      an owner row, 13 are still pre-registered (no auth row). Whoever has
--      signed in by apply time gets their row here; nobody else can (FK to
--      auth.users).
--   6b. fn_onemark_provision_school_owner() + trigger on public.profiles —
--      the automatic version of step 6 for every future first sign-in.
--      Institution list is a platform_policies row, never a literal.
--   7. End-state assertion DO block: anon cannot execute any of the six
--      functions (nor authenticated the two helpers); pools = 2; job type +
--      policy + trigger present; every signed-in target holds an ACTIVE
--      owner row; and a
--      simulated provisioning (inside a rolled-back sub-block) yields exactly
--      one owner row + one role row.
--
-- TIER: additive. Creates 6 functions + 1 trigger, inserts 2 pools, 1 job
-- type, 1 prompt version, 1 policy row, N owner rows (N = signed-in Senior
-- Learners still lacking an ACTIVE one; 0 today). Alters no table, drops
-- nothing. Every step is idempotent (WHERE NOT EXISTS / CREATE OR REPLACE /
-- DROP TRIGGER IF EXISTS), so re-running is a no-op.
--
-- NOT APPLIED by this PR. Rehearsed on production inside BEGIN … ROLLBACK
-- (Management API, Python-built body + curl -d @file); the orchestrator applies
-- at merge.
--
-- CLIENT CONTRACT (Lane V — read before calling any RPC here):
--   · Call the three RPCs through the SESSION client (createClient), never
--     createServiceRoleClient: every gate below is auth.uid()-based, and under
--     the service role auth.uid() is NULL, so fn_fp_can_manage_student /
--     fn_fp_is_own_or_guardian / fn_fp_teaches_student are all false and the
--     call raises 42501. service_role keeps its default EXECUTE grant; that
--     grant is not the gate. (The sibling app/api/foundation/practice/route.ts
--     uses the service-role client for its fp_assessments / fp_items READS —
--     that is fine for reads, not for these calls.)
--   · p_chosen must be the SAME JSON encoding as the item's key once
--     normalised: fp_items.answer is unwrapped when it is an object with a
--     `correct` key (exactly fn_fp_record_attempt, 20260808220000), otherwise
--     compared whole. A key stored as {"correct":"A"} or "A" grades a chosen
--     "A"; any other shape (e.g. {"index":2}) grades every answer wrong
--     unless p_chosen is that very object. (Lane W's 48 [TEST-W] fixture rows
--     carried {"index":n}; the Director had them and 5 test papers DELETED on
--     2026-09-05 — read live after the deletion: 0 remain. This file keeps the
--     estate normaliser rather than teaching the RPC a fixture's shape.)
--   · Withheld modes: on a timed / live attempt the respond RPC returns
--     is_correct / vault_status / streak as NULL and STORES no verdict; the
--     verdicts exist only after finalize (fp_responses.is_correct is
--     backfilled then). A result page reads fp_responses AFTER finalize.
--   · Unanswered = skipped (decision 18): finalize backfills a skipped
--     response for every fp_assessment_items row of a FIXED paper that has no
--     response. A POOL attempt (timed practice) has no item list in the
--     database, so for those the client must still record a skipped response
--     for each untouched item before finalize (Lane V's finalize route does:
--     body.skippedItemIds → fn_onemark_record_response(p_skipped := true)).
--
-- CROSS-MODULE EXPOSURE (disclosed, not fixed here — the page is not a Lane S
-- file): app/api/foundation/practice/route.ts lists EVERY fp_assessments row
-- with kind='practice', cohort_id NULL, is_active=true whose exam has ≥ 1
-- active fp_items row, for EVERY active fp_students learner — no exam or
-- enrolment scoping (that is how the 20260808180000 pools already behave: a
-- NEET learner sees the JEE / CUET pools). So the two pools in step 1 appear
-- on /foundation/practice as "Practice — TN HSC Physics / English" for every
-- active Foundation learner (3 fp_students rows today, the [PILOT] fixtures)
-- — but that page lists a pool ONLY when its exam has > 0 active fp_items
-- rows. With Lane W's 48 [TEST-W] fixture rows and 5 test papers DELETED by
-- the Director on 2026-09-05 and the draft job shipped disabled (§5), the
-- pools surface nothing until a human approves an ingested item. Read live
-- 2026-09-05 after the deletion: 0 active items on tn_hsc_physics; 1 on
-- tn_hsc_english (a hand-authored {"correct":…} row created that day), so the
-- English pool WILL list for those 3 learners from apply — that one row is
-- the whole exposure. Real Nattraja learners are not enrolled until both
-- banks reach 300 (decision 8). Scoping that page by enrolment or exam is a
-- follow-up outside this lane.
--
-- HARMFUL FAILURE DIRECTION OF THE DRAFT JOB (disclosed, and why enabled=false):
--   fp_items.is_active is NOT NULL DEFAULT true and Lane I's review queue
--   filters is_active = false. A runner that writes the model's items into
--   fp_items without forcing is_active = false therefore creates rows that
--   are LIVE on first insert, invisible to the reviewer, and served to every
--   Foundation learner by app/api/foundation/practice/route.ts (the two pools
--   in step 1 make those exams listable). That is decision 7 (one Senior
--   Learner approves every item) failing silently. Mitigations in this file:
--   the row ships enabled = false (fn_ai_enqueue refuses it — nothing queues),
--   the prompt names the columns the runner MUST set, and step 7 asserts the
--   row stays disabled and keeps saying so. The runner PR (Lane J) flips
--   enabled in its own migration after proving is_active = false on main.
--
-- APPLY-TIME DEPENDENCY (step 7, disclosed): the end-state block proves the
-- trigger by taking ONE real signed-in Nattraja Senior Learner (the first by
-- email among those with a staff-email match), deleting their owner + role
-- rows inside a PL/pgSQL sub-block, touching their profile, counting what
-- came back, and rolling the sub-block back with a sentinel. The apply
-- therefore depends on that DELETE + re-INSERT succeeding for whoever that
-- person is on apply day. What fires on the re-INSERT into user_roles (read
-- live 2026-09-05): sync_primary_role_trigger (is_primary=false → no sync),
-- trg_cdc_role_sync, trg_guard_escalation_user_roles, trg_jkkn_auto_issue_associate
-- (returns early on a staff-email match; its own handler swallows anyway),
-- trg_log_user_role_change, trg_no_self_authority_placement (auth.uid() NULL
-- in a migration → short-circuits). Wave 1's step 12 INSERTed the same rows
-- for 30 such profiles through the same trigger set at its apply (ledgered),
-- so the path is exercised, not assumed. If the simulation does fail, the
-- RAISE aborts the whole file — nothing lands half-applied — and the fix is
-- to look at the WARNING the trigger printed, not to edit the assertion.
-- Side effect that survives the sub-block rollback: sequence increments, if
-- any trigger consumed one (none does for a staff-matched profile).
--
-- SILENT-FAILURE SURFACING for the trigger (it never raises — see 6b): a
-- missed provisioning shows only as a Postgres WARNING. The check that
-- surfaces it is the step-7 assertion's own query — signed-in, active
-- Nattraja faculty/hod/principal profiles WITHOUT an active owner row:
--   SELECT p.id, p.email FROM profiles p
--    WHERE p.institution_id = '29c221d1-…' AND p.role IN ('faculty','hod','principal') AND p.is_active
--      AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
--      AND NOT EXISTS (SELECT 1 FROM school_jkkn_owners o JOIN schools s ON s.id = o.school_id
--            WHERE s.institution_id = p.institution_id AND s.ownership = 'internal'
--              AND o.jkkn_user_id = p.id AND o.is_active);
-- Any row = re-run step 6's INSERT statement ON ITS OWN, NOT the whole file
-- (step 7 asserts enabled = false on the job type, which Lane J's runner PR
-- deliberately flips, so a whole-file re-run aborts there). The INSERT is
-- idempotent. Wiring that query into a
-- MetaLoop / dashboard check is a follow-up outside this lane.
--
-- Reversible (in this order):
--   DROP TRIGGER IF EXISTS trg_onemark_provision_school_owner ON public.profiles;
--   DROP FUNCTION IF EXISTS public.fn_onemark_provision_school_owner();
--   DROP FUNCTION IF EXISTS public.fn_onemark_finalize_attempt(uuid);
--   DROP FUNCTION IF EXISTS public.fn_onemark_vault_draw(uuid, uuid, int);
--   DROP FUNCTION IF EXISTS public.fn_onemark_record_response(uuid, uuid, jsonb, boolean, int);
--   DROP FUNCTION IF EXISTS public.fn_onemark_apply_vault(uuid, uuid, uuid, boolean);
--   DROP FUNCTION IF EXISTS public.fn_onemark_grade(jsonb, jsonb);
--   DELETE FROM ai_prompt_versions WHERE job_type = 'onemark.item_draft';
--   DELETE FROM ai_job_types WHERE job_type = 'onemark.item_draft';
--   DELETE FROM platform_policies WHERE policy_key = 'onemark.provision.institution_ids';
--   DELETE FROM fp_assessments WHERE cohort_id IS NULL AND (config->>'pool')::boolean
--     AND exam_definition_id IN (SELECT id FROM exam_definitions WHERE config_key IN ('tn_hsc_physics','tn_hsc_english'))
--     AND created_at >= '<apply timestamp>';
--   Owner rows from step 6 of THIS file — and the corrected form of Wave 1's
--   step-12b reversal (Wave 1's header wrote `school_id = (SELECT id FROM schools
--   WHERE name = … AND institution_id = …)`; `schools` has no UNIQUE beyond its
--   PK, so that scalar subquery errors the day a second row matches — use IN):
--   DELETE FROM school_jkkn_owners
--    WHERE school_id IN (SELECT id FROM schools
--                         WHERE institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'
--                           AND ownership = 'internal')
--      AND role = 'outreach_coordinator'
--      AND assigned_at >= '<apply timestamp>';          -- this file's step 6
--   (for Wave 1's own rows substitute Wave 1's apply timestamp, 2026-09-03,
--    with the same IN (…) predicate — never the scalar `=` form).
--   Rows the TRIGGER inserted after apply carry assigned_at >= '<apply
--   timestamp>' too and are removed by the same statement; the school_faculty
--   user_roles rows it inserted: DELETE FROM user_roles ur USING profiles p
--    WHERE ur.user_id = p.id AND ur.is_primary = false
--      AND ur.role_id = (SELECT id FROM custom_roles WHERE role_key = 'school_faculty')
--      AND p.institution_id = '29c221d1-…' AND p.role IN ('faculty','hod','principal')
--      AND ur.assigned_at >= '<apply timestamp>';
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
-- 2. fn_onemark_grade + fn_onemark_apply_vault — the two shared helpers.
-- =============================================================================
-- Both RPCs below grade and move the vault through these, so there is ONE
-- normaliser and ONE set of vault rules in this file. Neither is a public
-- surface: EXECUTE is revoked from anon, authenticated and PUBLIC and granted
-- to nobody — the SECURITY DEFINER RPCs run as the function owner and reach
-- them that way. Step 7 asserts both locks.
--
-- fn_onemark_grade(chosen, answer): the correctness rule of fn_fp_record_attempt
-- (20260808220000) verbatim — an `answer` that is an object with a `correct`
-- key is normalised to that key; otherwise compared whole. NULL when the key
-- or the choice is NULL (unknown, not wrong).
CREATE OR REPLACE FUNCTION public.fn_onemark_grade(p_chosen jsonb, p_answer jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
           WHEN p_answer IS NULL OR p_chosen IS NULL THEN NULL
           WHEN jsonb_typeof(p_answer) = 'object' AND (p_answer ? 'correct')
             THEN (p_chosen IS NOT DISTINCT FROM (p_answer -> 'correct'))
           ELSE (p_chosen IS NOT DISTINCT FROM p_answer)
         END;
$$;

COMMENT ON FUNCTION public.fn_onemark_grade(jsonb, jsonb) IS
  'OneMark internal: is `chosen` the item''s key? Same normalisation as fn_fp_record_attempt ({"correct":…} unwrapped, else whole-value equality). Not RPC-callable. Added 2026-09-05 (OneMark Wave 2, Lane S).';

REVOKE EXECUTE ON FUNCTION public.fn_onemark_grade(jsonb, jsonb) FROM anon, authenticated, PUBLIC;

-- fn_onemark_apply_vault(learner, item, session, is_correct): the Mistake
-- Vault rules (decisions 9 / 10 / 18 / 19), applied to ONE graded answer.
--   · is_correct NULL  → nothing (a skip, or an item without a key)
--   · FALSE (wrong)    → upsert (student_id, item_id): streak 0, total_wrong+1,
--                        status active, mastered_at NULL, next_eligible_at now()
--                        — a mastered row is re-activated (decision 10)
--   · TRUE, row active, this session is NOT the session of the last counted
--     correct, and the row is due (next_eligible_at <= now(); decision 9:
--     "a separate session >= 2 days later")
--                      → streak+1, last_correct_session_id = session;
--                        streak >= onemark.vault.mastery_streak (2) → mastered;
--                        otherwise next_eligible_at = now() + min_gap_days
--   · TRUE, same session, or not yet due → no change (twice in one sitting
--                        counts once)
--   · TRUE, row mastered → no change
--   · TRUE, no row       → nothing (only a wrong answer creates a row)
-- The CALLER decides which answers reach this function (first graded answer
-- of an attempt-item in practice / vault_review; the final answer of every
-- item at finalize in timed / live) — see the two RPCs.
CREATE OR REPLACE FUNCTION public.fn_onemark_apply_vault(
  p_student_id uuid,
  p_item_id    uuid,
  p_session    uuid,
  p_is_correct boolean
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vault       record;
  v_streak_goal int;
  v_gap_days    int;
  v_streak      int;
BEGIN
  IF p_is_correct IS NULL THEN
    RETURN;
  END IF;

  IF p_is_correct IS FALSE THEN
    INSERT INTO public.onemark_mistake_vault AS mv
      (student_id, item_id, consecutive_correct_count, total_wrong, status, mastered_at, next_eligible_at)
    VALUES
      (p_student_id, p_item_id, 0, 1, 'active', NULL, now())
    ON CONFLICT (student_id, item_id)
    DO UPDATE SET consecutive_correct_count = 0,
                  total_wrong               = mv.total_wrong + 1,
                  status                    = 'active',
                  mastered_at               = NULL,
                  next_eligible_at          = now();
    RETURN;
  END IF;

  -- Correct.
  SELECT v.id, v.status, v.consecutive_correct_count, v.last_correct_session_id, v.next_eligible_at
    INTO v_vault
    FROM public.onemark_mistake_vault v
   WHERE v.student_id = p_student_id AND v.item_id = p_item_id
     FOR UPDATE;
  IF NOT FOUND
     OR v_vault.status <> 'active'
     OR v_vault.last_correct_session_id IS NOT DISTINCT FROM p_session
     OR (v_vault.next_eligible_at IS NOT NULL AND v_vault.next_eligible_at > now()) THEN
    RETURN;
  END IF;

  v_streak_goal := public.fn_get_policy_int('onemark.vault.mastery_streak', 2);
  v_gap_days    := public.fn_get_policy_int('onemark.vault.min_gap_days', 2);
  v_streak      := v_vault.consecutive_correct_count + 1;
  IF v_streak >= v_streak_goal THEN
    UPDATE public.onemark_mistake_vault
       SET consecutive_correct_count = v_streak,
           last_correct_session_id   = p_session,
           status                    = 'mastered',
           mastered_at               = now()
     WHERE id = v_vault.id;
  ELSE
    UPDATE public.onemark_mistake_vault
       SET consecutive_correct_count = v_streak,
           last_correct_session_id   = p_session,
           next_eligible_at          = now() + (v_gap_days * interval '1 day')
     WHERE id = v_vault.id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.fn_onemark_apply_vault(uuid, uuid, uuid, boolean) IS
  'OneMark internal: apply the Mistake Vault rules (decisions 9/10/18/19) for one graded answer — wrong re-activates and counts, a due correct in a new session advances the streak, streak >= onemark.vault.mastery_streak masters. Not RPC-callable. Added 2026-09-05 (OneMark Wave 2, Lane S).';

REVOKE EXECUTE ON FUNCTION public.fn_onemark_apply_vault(uuid, uuid, uuid, boolean) FROM anon, authenticated, PUBLIC;


-- =============================================================================
-- 2c. fn_onemark_record_response — one answer.
-- =============================================================================
-- Caller must pass the estate's attempt-WRITE gate (fn_fp_record_attempt,
-- 20260808220000): fn_fp_can_manage_student (super-admin, or a registered
-- school owner holding foundation.students.manage — every Nattraja
-- school_faculty holder), OR fn_fp_is_own_or_guardian (the learner, or the
-- guardian — admitted on main by that same ruling), OR fn_fp_teaches_student
-- (the Senior Learner running a cohort the learner is enrolled in). NOT the
-- READ predicate fn_fp_can_view_student, which would also let any bare
-- school_jkkn_owners row answer and submit on a learner's behalf. The attempt
-- must be in_progress (decision 19) and must be an OneMark attempt (mode set;
-- a legacy Foundation attempt with mode NULL belongs to fn_fp_record_attempt
-- and its 0..1 score unit). The item must be on the attempt's exam and, for a
-- fixed paper, one of its fp_assessment_items.
--
-- TWO GRADING REGIMES, by fp_attempts.mode:
--   · practice / vault_review — REVEALED. The answer is graded now
--     (fn_onemark_grade), the verdict returned, the bank counters bumped and
--     the vault moved. The learner sees the verdict immediately, so a later
--     change of answer to the same item in the same attempt is a reaction to
--     the verdict, not a fresh attempt: it overwrites the response row (the
--     last answer is what the score counts) and touches NOTHING else. Rule:
--       first response of any kind      → times_served + 1 (it was shown)
--       first GRADED answer (a skip does not grade; the first non-skipped
--       answer is the first graded one)  → times_correct (+1 if correct) and
--                                          the vault, exactly once
--       any later answer                 → response row only
--     So skip-then-wrong reaches the vault (decision 19), skip-then-correct
--     counts as correct in the bank, wrong-then-correct-then-wrong counts ONE
--     wrong — once per attempt-item, as stated.
--   · timed / live — WITHHELD. Only chosen / skipped / time_ms are stored;
--     is_correct stays NULL, no counters, no vault, and the return carries
--     is_correct / vault_status / streak as NULL with revealed = false. A
--     learner can SELECT their own fp_responses (fn_fp_can_view_attempt) and
--     their own vault rows (fn_fp_can_view_student) mid-paper, so a verdict
--     stored anywhere would be an answer-key oracle — try each option, read
--     the verdict, keep the winner. fn_onemark_finalize_attempt grades the
--     FINAL answer of every item at submit (correct-then-changed-to-wrong is
--     a wrong; skip-then-wrong is a wrong; decision 19 holds).
--
-- session_id: fp_attempts.session_id (one uuid per sitting, set by Lane V).
-- When NULL the attempt id stands in, so "same sitting" still means something.
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
         s.exam_definition_id AS assessment_exam_id
    INTO v_attempt
    FROM public.fp_attempts a
    JOIN public.fp_assessments s ON s.id = a.assessment_id
   WHERE a.id = p_attempt_id;
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
  'OneMark: record one response on an in-progress OneMark attempt (mode set; caller must pass fn_fp_can_manage_student / fn_fp_is_own_or_guardian / fn_fp_teaches_student for the attempt''s learner — the fn_fp_record_attempt write gate; item must be on the attempt''s exam and, for a fixed paper, in fp_assessment_items). practice / vault_review: graded now, bank counters + Mistake Vault on the first graded answer per attempt-item (decisions 9/10/18/19). timed / live: stores chosen only — no verdict anywhere until fn_onemark_finalize_attempt grades the final answers. Returns {is_correct, skipped, vault_status, streak, revealed}; never returns the answer key. Added 2026-09-04, withheld grading 2026-09-05 (OneMark Wave 2, Lane S).';

REVOKE EXECUTE ON FUNCTION public.fn_onemark_record_response(uuid, uuid, jsonb, boolean, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_onemark_record_response(uuid, uuid, jsonb, boolean, int) TO authenticated;


-- =============================================================================
-- 3. fn_onemark_vault_draw — which questions a review session serves.
-- =============================================================================
-- Active vault rows for this learner whose items belong to the given subject
-- exam and are still active in the bank, due now (next_eligible_at <= now()),
-- ordered by next_eligible_at ascending. Precisely: that is "least recently
-- TOUCHED" — next_eligible_at is stamped now() by every wrong answer and
-- pushed forward by a counted correct — so the spec's "least-recently-wrong
-- first" holds among rows never answered right since, and a row that earned
-- one counted correct queues behind them. That is decision 13's intent (the
-- item you have not seen longest comes first); created_at breaks ties.
-- Caller gate is the READ predicate fn_fp_can_view_student, per the lane
-- spec — a draw returns item ids only; recording answers goes through the
-- WRITE-gated RPCs.
--
-- Cap (decision 13): no single fp_items.topic_id may exceed
-- onemark.vault.max_single_chapter_pct (60) percent of p_count, rounded DOWN
-- with a floor of 1 (p_count = 1 draws one item, not none).
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
  )
  SELECT d.item_id
    FROM due d
   WHERE d.rank_in_topic <= v_cap
   ORDER BY d.next_eligible_at ASC NULLS FIRST, d.created_at ASC, d.item_id
   LIMIT p_count;
END;
$$;

COMMENT ON FUNCTION public.fn_onemark_vault_draw(uuid, uuid, int) IS
  'OneMark: item ids for one Mistake Vault review session — active, due, least-recently-wrong first, no chapter above onemark.vault.max_single_chapter_pct of p_count (round down, floor 1; fewer rather than padded, decision 13). Caller must pass fn_fp_can_view_student (a read). Added 2026-09-04 (OneMark Wave 2, Lane S).';

REVOKE EXECUTE ON FUNCTION public.fn_onemark_vault_draw(uuid, uuid, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_onemark_vault_draw(uuid, uuid, int) TO authenticated;


-- =============================================================================
-- 4. fn_onemark_finalize_attempt — one submission, server-side.
-- =============================================================================
-- In order:
--   1. lock the attempt (FOR UPDATE), gate, refuse anything not in_progress
--      ('submitted' — decision 19; 'abandoned' — a value of the fp_attempts
--      status CHECK, 20260706065000, that must not be revived into a score)
--      and refuse a legacy attempt (mode NULL: fn_fp_record_attempt owns those
--      and stores score as a 0..1 RATIO; OneMark stores the COUNT — mixing the
--      two units on one row would poison every report that averages score);
--   2. on a FIXED paper (the assessment has fp_assessment_items rows) insert a
--      skipped response for every item that has none — "unanswered = skipped"
--      (decision 18) without the client having to enumerate the blanks; a pool
--      attempt has no item list here, so the client records those skips itself
--      (Lane V's finalize route does);
--   3. on a timed / live attempt grade the FINAL answer of every response now:
--      fp_responses.is_correct backfilled, fp_items.times_served + 1 for every
--      response (served) and times_correct + 1 for every correct one, and the
--      Mistake Vault moved per answer (fn_onemark_apply_vault) — this is the
--      only place a withheld-mode verdict is ever written; a practice /
--      vault_review attempt was graded as it went (backfilled skips still
--      count as served);
--   4. score = number of responses with is_correct = true (decision 18: a
--      skipped item is not wrong and simply does not count), status submitted.
CREATE OR REPLACE FUNCTION public.fn_onemark_finalize_attempt(p_attempt_id uuid)
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
  v_now         timestamptz := now();
BEGIN
  IF p_attempt_id IS NULL THEN
    RAISE EXCEPTION 'fn_onemark_finalize_attempt: attempt_id is required';
  END IF;

  SELECT a.id, a.student_id, a.status, a.mode, a.session_id, a.assessment_id
    INTO v_attempt
    FROM public.fp_attempts a
   WHERE a.id = p_attempt_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_onemark_finalize_attempt: attempt % not found', p_attempt_id;
  END IF;

  -- Same WRITE gate as fn_onemark_record_response (the 20260808220000 predicate).
  IF NOT (
    public.fn_fp_can_manage_student(v_attempt.student_id)
    OR public.fn_fp_is_own_or_guardian(v_attempt.student_id)
    OR public.fn_fp_teaches_student(v_attempt.student_id)
  ) THEN
    RAISE EXCEPTION 'fn_onemark_finalize_attempt: not authorized for attempt %', p_attempt_id
      USING ERRCODE = '42501';
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

COMMENT ON FUNCTION public.fn_onemark_finalize_attempt(uuid) IS
  'OneMark: submit an in-progress OneMark attempt once (decision 19; refuses submitted, abandoned and mode-NULL legacy attempts). Backfills a skipped response for every unanswered item of a fixed paper (decision 18); on timed / live grades the final answer of every response here (is_correct backfilled, bank counters, Mistake Vault). score = count of correct responses. Caller must pass the fn_fp_record_attempt write gate. Added 2026-09-04, withheld grading 2026-09-05 (OneMark Wave 2, Lane S).';

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
-- monthly_spend_cap_inr = 5000 — DIRECTOR-RULED 2026-09-05 (₹5,000 / month;
-- decisions file §4 asked for one to be set before 44 Senior Learners can
-- trigger drafts). daily_cap_per_user = 5 per lane spec.
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
-- ENABLED = FALSE at apply (round 3, 2026-09-05). The charter-draft idiom
-- ships enabled = true, but this row's output_target is table:fp_items and
-- NO runner on main honours a table:% target today (0 of 67 job types). The
-- benign failure is that drafts never land. The HARMFUL failure is a lenient
-- runner that inserts the model's items into fp_items as-is: fp_items.is_active
-- is NOT NULL DEFAULT true, so every draft would be born LIVE — invisible to
-- Lane I's review queue (it filters is_active = false) and served straight to
-- learners through app/api/foundation/practice/route.ts, with no Senior
-- Learner approval (decision 7 broken silently). fn_ai_enqueue refuses a
-- disabled job type, so with enabled = false nothing can be queued at all.
-- Enabled ONLY by the runner PR (Lane J, feat/onemark-draft-runner) once a
-- runner that forces is_active = false / source_key = 'internal' / source =
-- 'ai' and sets exam_definition_id / topic_id / created_by exists on main —
-- one UPDATE in that PR's migration, never a hand flip.
INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, max_inflight, schedulable, enabled,
   input_schema, expected_seconds, provider, model_id, external_allowed, loop_key,
   daily_cap_per_user, monthly_spend_cap_inr)
SELECT
  'onemark.item_draft',
  'OneMark · One-mark MCQ Drafter',
  'Drafts N bilingual (Tamil + English) one-mark multiple-choice questions in the Tamil Nadu State Board Class-12 Part-I style for one unit and one or more category tags of tn_hsc_physics / tn_hsc_english. Output lands as fp_items DRAFT rows (the runner forces is_active=false, source_key=''internal'', source=''ai''; never live) that queue on /foundation/onemark/review; enabled=false until the runner PR (Lane J) proves that on main; NOTHING reaches a learner until one subject Senior Learner approves each item (decision 7). Difficulty is JABT K1–K6 only (decision 6); A-dimensions are never assigned by this job. Enqueued by POST /api/foundation/onemark/draft (gate foundation.items.manage).',
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
- Every item carries a short `explanation` / `explanation_ta` that a learner reads AFTER answering — state why the key is right in one or two sentences.

OUTPUT — strict JSON only, no prose, no code fences, no trailing commentary. Field names ARE the fp_items column names; the English text goes in the unsuffixed column, the Tamil in the _ta column:
{"items":[{"stem":"<English stem>","stem_ta":"<Tamil stem>","options":["<A>","<B>","<C>","<D>"],"options_ta":["<A>","<B>","<C>","<D>"],"answer":{"correct":"A"|"B"|"C"|"D"},"explanation":"<English>","explanation_ta":"<Tamil>","bloom_level":"K1".."K6","tags":["<one or more of tag_keys>"],"option_layout":"auto"|"inline_4"|"inline_2x2"|"stacked"}]}
- `answer` is ALWAYS the object {"correct":"<letter>"} — never a bare letter; the grader (fn_onemark_grade) and the review queue read that key.
- `options` and `options_ta` are arrays of exactly four strings in A–D order.
- Emit NOTHING else per item. The RUNNER, not you, sets exam_definition_id, topic_id, is_active=false, source='ai', source_key='internal' and created_by on every row it inserts — a draft is never live; a Senior Learner activates it on approval.

If the unit and tags cannot honestly yield `count` items from the textbook, return fewer and add {"shortfall_reason":"..."} at the top level. Never pad with off-unit or invented content.

{{prompt}}$onemark$,
  'none', 'table:fp_items',
  false,          -- interactive: queued by the draft route, a human is not waiting on the request
  'max', 'permission:foundation.items.manage', 3,
  false,          -- schedulable: only ever enqueued by a Senior Learner's request
  false,          -- enabled: OFF until the runner PR (Lane J) — see the §5 header
  '[{"key":"exam_definition_id","type":"text","label":"Subject exam (exam_definitions.id of tn_hsc_physics / tn_hsc_english)","required":true},
    {"key":"topic_id","type":"text","label":"Unit / chapter (cdc_exam_syllabus_topics.id; null = chapter-agnostic English tag)","required":false},
    {"key":"tag_keys","type":"text","label":"Category tag keys from onemark_item_tags (comma-separated; the draft route sends a JSON array)","required":true},
    {"key":"count","type":"number","label":"How many items to draft (1–20)","required":true},
    {"key":"bloom_level","type":"select","label":"JABT K-level to target (K1–K6)","required":true,"options":["K1","K2","K3","K4","K5","K6"]}]'::jsonb,
  120, 'anthropic', 'sonnet',
  false,          -- external_allowed: internal authoring job, never B2A-reachable
  NULL,           -- loop_key: no MetaLoop registration yet
  5,              -- daily_cap_per_user: lane spec
  5000            -- monthly_spend_cap_inr: Director ruling 2026-09-05 (₹5,000 / month)
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
-- ONE rule for the school row, shared with 6b and the step-7 assertion: the
-- institution's oldest schools row with ownership = 'internal'. (`schools` has
-- no UNIQUE beyond its PK — Wave 1 header — so keying on the name here and
-- on ownership in the trigger could diverge the day a second internal school
-- exists at that institution.)
WHERE s.id = (
    SELECT s2.id FROM public.schools s2
     WHERE s2.institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'::uuid
       AND s2.ownership = 'internal'::public.school_ownership
     ORDER BY s2.created_at ASC
     LIMIT 1
  )
  -- Guard includes o.is_active (lane spec 6(a)): the table's partial unique
  -- index is (school_id, jkkn_user_id, role, COALESCE(program_partner_id::text,''))
  -- WHERE is_active, so an INACTIVE row for the same person must not suppress
  -- a fresh active one — and the step-7 assertion counts ACTIVE rows only, so
  -- without this a deactivated owner would abort the apply.
  AND NOT EXISTS (
    SELECT 1 FROM public.school_jkkn_owners o
    WHERE o.school_id = s.id AND o.jkkn_user_id = p.id AND o.is_active
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
-- BLAST RADIUS (Director APPROVED the automatic-on-first-sign-in design
-- 2026-09-05; disclosed so the standing it confers stays on record): an
-- owner row makes user_owns_school(<that
-- school>) true, the predicate on 15 Schools-Network policies (school_contacts /
-- school_contributions / school_sessions / program_partner_schools / schools),
-- scoped to that one school row — every future Nattraja faculty / hod /
-- principal first sign-in self-provisions this, with no human in the loop.
-- The owner row + school_faculty (foundation.students.manage) together also
-- make fn_fp_can_manage_student true for every learner of that school, i.e.
-- the WRITE gate of fn_onemark_record_response / fn_onemark_finalize_attempt
-- and the Mistake Vault's write policy — the same standing Wave 1 gave the 30
-- seeded Senior Learners by hand. And the owner row ALONE — before, or
-- without, the role — already satisfies fn_fp_can_view_student
-- (20260706065000: a bare active school_jkkn_owners row, NO permission key
-- required), the READ predicate on fp_attempts / fp_responses / fp_baselines /
-- fp_revision_plans / fp_student_weakness / onemark_mistake_vault for EVERY
-- learner of that school, and the caller gate of fn_onemark_vault_draw. So a
-- first sign-in self-provisions read standing over every Nattraja learner's
-- performance data with no human in the loop. The school_faculty role is
-- withheld (with a WARNING) when the profile's email matches no staff row,
-- because that user_roles insert would mint a permanent 'associate' JKKN ID —
-- the outcome Wave 1's step-12 assertion refused to apply over.
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

  -- Two independently guarded sub-blocks: the owner row is what
  -- fn_fp_manages_school / fn_fp_can_manage_student need, and it must survive
  -- a failure of the role insert (one function-level handler would roll both
  -- back together and leave only a WARNING).
  BEGIN
    INSERT INTO public.school_jkkn_owners (school_id, jkkn_user_id, role, is_active, assigned_at)
    SELECT v_school_id, NEW.id, 'outreach_coordinator'::public.school_owner_role, true, now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.school_jkkn_owners o
       WHERE o.school_id = v_school_id AND o.jkkn_user_id = NEW.id AND o.is_active
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[onemark provision] profile % (institution %): owner row not inserted: % (%)', NEW.id, NEW.institution_id, SQLERRM, SQLSTATE;
  END;

  BEGIN
    SELECT cr.id INTO v_role_id FROM public.custom_roles cr WHERE cr.role_key = 'school_faculty';
    IF v_role_id IS NOT NULL THEN
      -- Wave 1 (20260917111500, step 12) REFUSED to apply when a target profile
      -- had no staff-email match, because a user_roles INSERT fires
      -- trg_jkkn_auto_issue_associate (20260827110000), which mints a PERMANENT
      -- 'associate' JKKN ID for a profile with learner_id NULL, no staff match
      -- and no jkkn_identities row. A trigger cannot block a sign-in, so it
      -- mirrors that ruling the only way it can: the role is NOT inserted
      -- for such a profile, and the WARNING names the repair (fix the staff
      -- row, then re-run step 6's INSERT on its own / re-save the profile).
      -- The owner row above
      -- is unaffected.
      IF EXISTS (
           SELECT 1 FROM public.profiles p
            WHERE p.id = NEW.id
              AND p.learner_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM public.jkkn_identities ji WHERE ji.profile_id = p.id)
              AND NOT (
                p.email IS NOT NULL AND btrim(p.email) <> '' AND EXISTS (
                  SELECT 1 FROM public.staff st
                   WHERE lower(btrim(coalesce(st.institution_email, ''))) = lower(btrim(p.email))
                      OR lower(btrim(coalesce(st.email, '')))             = lower(btrim(p.email))
                )
              )
         ) THEN
        RAISE WARNING '[onemark provision] profile % (institution %): school_faculty NOT assigned — no staff row matches its email, and the user_roles insert would mint a permanent ''associate'' JKKN ID (trg_jkkn_auto_issue_associate); fix the staff row first', NEW.id, NEW.institution_id;
      ELSE
        INSERT INTO public.user_roles (user_id, role_id, is_primary, assigned_at)
        SELECT NEW.id, v_role_id, false, now()
        WHERE NOT EXISTS (
          SELECT 1 FROM public.user_roles ur WHERE ur.user_id = NEW.id AND ur.role_id = v_role_id
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[onemark provision] profile % (institution %): school_faculty role not inserted: % (%)', NEW.id, NEW.institution_id, SQLERRM, SQLSTATE;
  END;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Never break a sign-in. The miss is visible in the logs and repairable by
  -- re-running step 6's INSERT statement on its own (not the whole file —
  -- see the header's SILENT-FAILURE SURFACING block).
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
  -- Draft-inactivity rule, as far as SQL can assert it: the row exists, is
  -- DISABLED (no runner on main honours table:% yet — a lenient one would
  -- insert LIVE rows, fp_items.is_active defaults true), targets fp_items,
  -- and its description + prompt both state is_active=false.
  SELECT count(*) INTO v_jobtype   FROM public.ai_job_types
   WHERE job_type = 'onemark.item_draft'
     AND enabled = false
     AND output_target = 'table:fp_items'
     AND description    LIKE '%is_active=false%'
     AND prompt_template LIKE '%is_active=false%'
     AND prompt_template LIKE '%{"correct":%';
  SELECT count(*) INTO v_prompt_v1 FROM public.ai_prompt_versions WHERE job_type = 'onemark.item_draft' AND version = 1 AND status = 'champion';
  SELECT count(*) INTO v_policy    FROM public.platform_policies
   WHERE policy_key = 'onemark.provision.institution_ids' AND scope_type = 'global' AND scope_id IS NULL AND is_active;
  SELECT count(*) INTO v_trigger   FROM pg_trigger
   WHERE tgrelid = 'public.profiles'::regclass AND tgname = 'trg_onemark_provision_school_owner' AND NOT tgisinternal;

  -- anon must not be able to execute any of the six functions, and the two
  -- internal helpers must not be callable by authenticated either.
  SELECT has_function_privilege('anon', 'public.fn_onemark_record_response(uuid, uuid, jsonb, boolean, int)', 'EXECUTE')
      OR has_function_privilege('anon', 'public.fn_onemark_vault_draw(uuid, uuid, int)', 'EXECUTE')
      OR has_function_privilege('anon', 'public.fn_onemark_finalize_attempt(uuid)', 'EXECUTE')
      OR has_function_privilege('anon', 'public.fn_onemark_provision_school_owner()', 'EXECUTE')
      OR has_function_privilege('anon', 'public.fn_onemark_grade(jsonb, jsonb)', 'EXECUTE')
      OR has_function_privilege('anon', 'public.fn_onemark_apply_vault(uuid, uuid, uuid, boolean)', 'EXECUTE')
      OR has_function_privilege('authenticated', 'public.fn_onemark_grade(jsonb, jsonb)', 'EXECUTE')
      OR has_function_privilege('authenticated', 'public.fn_onemark_apply_vault(uuid, uuid, uuid, boolean)', 'EXECUTE')
    INTO v_anon_exec;

  -- Owner catch-up: every signed-in target profile now holds an owner row.
  SELECT count(*) INTO v_owner_eligible
    FROM public.profiles p
   WHERE p.institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'::uuid
     AND p.role IN ('faculty', 'hod', 'principal') AND p.is_active
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);
  -- Same school rule as steps 6 and 6b (oldest internal schools row).
  SELECT s.id INTO v_sim_school FROM public.schools s
   WHERE s.institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'::uuid AND s.ownership = 'internal'
   ORDER BY s.created_at LIMIT 1;
  SELECT count(*) INTO v_owners
    FROM public.school_jkkn_owners o
    JOIN public.profiles p ON p.id = o.jkkn_user_id
   WHERE o.school_id = v_sim_school
     AND o.is_active
     AND p.institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'::uuid
     AND p.role IN ('faculty', 'hod', 'principal') AND p.is_active;

  -- Simulated provisioning inside a rolled-back sub-block: take one signed-in
  -- Nattraja Senior Learner, remove their owner + school_faculty rows, touch
  -- the profile's role (an UPDATE OF role), and count what the trigger put
  -- back. The sentinel exception rolls the sub-block back; the counts survive
  -- because PL/pgSQL variables are not transactional. Skipped (not failed)
  -- when no such person exists — a non-production database.
  -- The simulated profile must be one the trigger WOULD give the role to: a
  -- staff-email match (or an existing JKKN identity), so the associate-mint
  -- guard in 6b does not apply. All 30 matched at Wave 1 (its step-12 assert).
  SELECT p.id INTO v_sim_profile
    FROM public.profiles p
   WHERE p.institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'::uuid
     AND p.role IN ('faculty', 'hod', 'principal') AND p.is_active
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
     AND (
       p.learner_id IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.jkkn_identities ji WHERE ji.profile_id = p.id)
       OR (p.email IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.staff st
             WHERE lower(btrim(coalesce(st.institution_email, ''))) = lower(btrim(p.email))
                OR lower(btrim(coalesce(st.email, '')))             = lower(btrim(p.email))))
     )
   ORDER BY p.email
   LIMIT 1;
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
  IF v_jobtype <> 1      THEN RAISE EXCEPTION 'onemark wave2: ai_job_types onemark.item_draft missing, ENABLED (must stay off until the runner PR), not targeting table:fp_items, or its description/prompt no longer state is_active=false / answer {"correct":…}'; END IF;
  IF v_prompt_v1 <> 1    THEN RAISE EXCEPTION 'onemark wave2: ai_prompt_versions v1 champion for onemark.item_draft missing'; END IF;
  IF v_policy <> 1       THEN RAISE EXCEPTION 'onemark wave2: platform_policies onemark.provision.institution_ids missing'; END IF;
  IF v_trigger <> 1      THEN RAISE EXCEPTION 'onemark wave2: trg_onemark_provision_school_owner missing on profiles'; END IF;
  IF v_anon_exec         THEN RAISE EXCEPTION 'onemark wave2: anon can EXECUTE one of the fn_onemark_* functions, or authenticated can EXECUTE an internal helper'; END IF;
  IF v_owners < v_owner_eligible THEN
    RAISE EXCEPTION 'onemark wave2: % signed-in Nattraja Senior Learners but only % owner rows', v_owner_eligible, v_owners;
  END IF;

  RAISE NOTICE 'onemark wave2 end state OK: pools=% jobtype=% prompt_v1=% policy=% trigger=% owners=%/% sim_owner=% sim_role=%',
    v_pools, v_jobtype, v_prompt_v1, v_policy, v_trigger, v_owners, v_owner_eligible, v_sim_owner_rows, v_sim_role_rows;
END $$;

NOTIFY pgrst, 'reload schema';

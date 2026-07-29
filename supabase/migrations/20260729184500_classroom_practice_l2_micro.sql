-- =============================================================================
-- 20260729184500_classroom_practice_l2_micro.sql
-- Classroom Practice — LAYER 2: ONE sealed micro-item per feedback submission.
-- Design ratified 2026-07-29 (amended same day to PER-LEARNER ROTATION).
--
-- RATIFIED INVARIANTS (do not "improve" these without a new ruling):
--   1. AT MOST ONE micro-item rides a single feedback submission. Enforced by
--      UNIQUE (learner_id, attendance_date, period_id) — not by UI discipline.
--   2. ALWAYS SKIPPABLE. Skipping is a first-class recorded answer, not a
--      failure state.
--   3. NEVER BLOCKING. A micro-item must never break or delay the base feedback
--      submit. Both RPCs below are wrapped in BEGIN..EXCEPTION and return a
--      benign payload instead of raising; the client isolates them further.
--   4. PER-(learner, senior learner) ROTATION DECK. The same learner is never
--      asked the same item about the same person twice inside min_gap_days.
--   5. RELEVANCE-AWARE TARGETING. CP-C1 ("leave decided by clear rules") is only
--      offered to a learner who actually HAS a decided leave/OD request — the
--      platform already knows; asking everyone would be noise.
--   6. AUTO-BACKOFF per learner response rate. A learner who ignores these goes
--      quiet automatically; the loop never nags.
--   7. WATCHED ALARM METRIC = base session-feedback completion rate. If L2 costs
--      base submissions, L2 is wrong. fn_scf_micro_health() makes that visible
--      in one call.
--   8. OCCASIONAL SEALED COMMENT (added 2026-07-29 with the pivot below). After
--      every Nth ANSWERED item about the same person, the learner may add one
--      optional line addressed to the Principal. Readable by the Principal and
--      the Director ONLY — never by the person described, never in any reveal
--      aggregate. Optional, one per impression, and as non-blocking as the item.
--
-- SCOPE PIVOT (Director, 2026-07-29): the separate semester learner sheet is
-- CANCELLED. This drip IS the Classroom Practice learner input — the only one.
-- The teacher-facing semester compare (sibling lane, migration 20260729190000,
-- ordered AFTER this one) reads k>=3 aggregates of ANSWERED rows from this
-- table over COMPLETED calendar windows only, joined on teacher_email.
--
-- ROLLBACK SWITCH (no deploy needed): set the platform_policies row
--   'classroom_practice.l2' -> value->>'enabled' = false.
-- fn_scf_micro_next_item then returns {item:null} for every caller and the UI
-- renders NOTHING. That is the kill switch; use it before reverting code.
--
-- IDENTITY / GROUND TRUTH (verified against this branch, 2026-07-29):
--   learner:  auth.uid() = profiles.id -> learners_profiles.profile_id
--             -> learners_profiles.id  == student_attendance blob students[].student_id
--             == leave_onduty_applications.learner_id     (same key throughout)
--   senior learner: student_attendance blob assigned_faculty.faculty_email.
--             NOTE: assigned_faculty.faculty_id is a STAFF id, NOT a profiles.id
--             (stated in 20260615233000). Email is the reliable join, and is the
--             key session_feedback already indexes on. The rotation deck is
--             therefore keyed by teacher_email, and teacher_staff_id is carried
--             for reference only.
--
-- CATALOG DEPENDENCY: the 13 Classroom Practice items (CP-C1..C3, CP-A1..A3,
-- CP-RS1..RS5, CP-E1..E2) are seeded by a SIBLING migration into
-- audit_parameter_catalog. This migration does NOT seed them and tolerates their
-- absence: with no active CP-% rows, fn_scf_micro_next_item returns {item:null}
-- and the feature is invisible. Apply order between the two does not matter.
--
-- ADDITIVE + DARK: one new table, one config row, three locked RPCs. Touches no
-- existing table, no existing function, and nothing on the base feedback path.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Table — the sealed store of every micro-item OFFERED (answered or not).
--    Unanswered offers are rows too: that is what makes backoff honest.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.carre_micro_impressions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   uuid,                     -- from the attendance blob's row
  learner_id       uuid NOT NULL,            -- learners_profiles.id (NOT profiles.id)
  teacher_email    text NOT NULL,            -- assigned_faculty.faculty_email (join key)
  teacher_staff_id uuid,                     -- assigned_faculty.faculty_id (staff id, reference only)
  parameter_code   text NOT NULL,            -- audit_parameter_catalog.code, 'CP-%'
  attendance_date  date NOT NULL,
  timetable_id     uuid NOT NULL,
  period_id        text NOT NULL,            -- attendance_data key
  offered_at       timestamptz NOT NULL DEFAULT now(),
  answered_at      timestamptz,
  score            smallint CHECK (score BETWEEN 0 AND 4),  -- NULL = skipped or never answered
  skipped          boolean NOT NULL DEFAULT false,
  -- Occasional sealed comment invited after every Nth ANSWERED item. Readable
  -- by the Principal and the Director ONLY — never by the person being
  -- described. See the COMMENT ON COLUMN below.
  sealed_comment   text,   -- length CHECK added as a named constraint below
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- INVARIANT 1, enforced in the database: one micro-item per (learner, session).
  UNIQUE (learner_id, attendance_date, period_id)
);

-- Idempotency: the CREATE above is IF NOT EXISTS, so an environment that
-- already has an earlier copy of this table would silently miss the comment
-- column. Add it explicitly.
ALTER TABLE public.carre_micro_impressions
  ADD COLUMN IF NOT EXISTS sealed_comment text;
DO $$
BEGIN
  ALTER TABLE public.carre_micro_impressions
    ADD CONSTRAINT carre_micro_impressions_sealed_comment_len
    CHECK (sealed_comment IS NULL OR length(sealed_comment) <= 2000);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Deck query: "when did this learner last see this item about this person?"
CREATE INDEX IF NOT EXISTS idx_carre_micro_deck
  ON public.carre_micro_impressions (learner_id, teacher_email, parameter_code, offered_at DESC);
-- Backoff query: "this learner's last N impressions, any senior learner".
CREATE INDEX IF NOT EXISTS idx_carre_micro_learner_recent
  ON public.carre_micro_impressions (learner_id, offered_at DESC);
-- REVEAL SUBSTRATE (confirmed 2026-07-29): the sibling lane's semester compare
-- and the future weekly/monthly reveal both aggregate THIS table. offered_at is
-- part of the key because every reveal is windowed to COMPLETED calendar
-- periods only. Join key is teacher_email — NOT a profiles.id; see the header.
CREATE INDEX IF NOT EXISTS idx_carre_micro_reveal
  ON public.carre_micro_impressions (teacher_email, parameter_code, offered_at);

COMMENT ON TABLE public.carre_micro_impressions IS
  'SEALED Classroom Practice L2 micro-impressions: one row per micro-item OFFERED to a learner on a feedback submission (unanswered offers are rows too — that is what makes auto-backoff honest). RLS SELECT is super_admin-only, the same seal as carre_participant_scores: identities never leave this table. Writes are impossible directly — fn_scf_micro_next_item / fn_scf_micro_answer are the only write paths. learner_id = learners_profiles.id; teacher_email = attendance blob assigned_faculty.faculty_email (faculty_id is a STAFF id, not profiles.id). REVEAL SUBSTRATE (confirmed 2026-07-29, semester learner sheet cancelled): this table is now the ONLY learner input for Classroom Practice. The teacher-facing semester compare and any weekly/monthly reveal MUST read k>=3 aggregates of ANSWERED rows (answered_at IS NOT NULL AND NOT skipped) over COMPLETED calendar windows only — never an in-flight window, never a single learner''s answer, never sealed_comment.';

COMMENT ON COLUMN public.carre_micro_impressions.sealed_comment IS
  'Optional free-text line a learner may add when invited (every Nth ANSWERED item — see platform_policies classroom_practice.l2 -> comment_invite_every_n_answers). READABLE BY THE PRINCIPAL AND THE DIRECTOR ONLY. The person being described NEVER sees it: it is excluded from the teacher-facing semester compare and from every reveal aggregate, and the table''s RLS already limits SELECT to super admins. One comment maximum per impression — fn_scf_micro_answer refuses to overwrite a non-NULL value. Capped at 2000 characters.';

-- ---------------------------------------------------------------------------
-- 2) RLS — the Director seal. SELECT: super admin only. No write policies at
--    all, so direct INSERT/UPDATE/DELETE is impossible even for a super admin;
--    the SECURITY DEFINER RPCs below are the only write path.
-- ---------------------------------------------------------------------------
ALTER TABLE public.carre_micro_impressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carre_micro_impressions_seal ON public.carre_micro_impressions;
CREATE POLICY carre_micro_impressions_seal ON public.carre_micro_impressions
  FOR SELECT TO authenticated
  USING (COALESCE(is_super_admin(), false));

-- Supabase default privileges GRANT ALL on new public tables to anon /
-- authenticated. Strip that back: nothing for anon/PUBLIC, read-only for
-- authenticated (and RLS above then seals the read to super admin).
REVOKE ALL ON public.carre_micro_impressions FROM anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.carre_micro_impressions FROM authenticated;
GRANT SELECT ON public.carre_micro_impressions TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Config row — every threshold is a policy row, never a constant in code.
--    Missing row => the RPCs fall back to these same values via COALESCE, so a
--    fresh database behaves identically to a seeded one.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   is_system, is_active, classification, publication_state, ui_widget, ui_category)
SELECT
  'classroom_practice.l2', 'global', NULL,
  jsonb_build_object(
    'enabled',                  true,
    'min_gap_days_per_item',    10,
    'backoff_answer_rate_floor',0.2,
    'backoff_window',           10,
    'backoff_cooldown_days',    3,
    'leave_item_lookback_days', 60,
    'comment_invite_every_n_answers', 8
  ),
  'Classroom Practice L2 micro-item knobs. enabled=false is the ROLLBACK SWITCH (silences the feature platform-wide with no deploy). min_gap_days_per_item = never re-ask the same item about the same senior learner to the same learner inside this many days. backoff_* = auto-quiet a learner whose answer rate over their last backoff_window offers falls below the floor, for backoff_cooldown_days. leave_item_lookback_days = how recently a leave/OD decision must have landed for the CP-C1 relevance gate to open. comment_invite_every_n_answers = after every Nth ANSWERED (not skipped) item a learner gives about the same person, invite an optional sealed comment for the Principal and Director; 0 or negative disables the invite entirely.',
  'object', true, true, 'operational', 'published', 'json', 'Classroom Practice'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'classroom_practice.l2'
    AND scope_type = 'global'
    AND scope_id IS NULL
);

-- ---------------------------------------------------------------------------
-- 4) fn_scf_micro_next_item — pick (and RECORD) the one micro-item that rides
--    this submission. Called by the learner's dialog right after the base
--    feedback succeeds.
--
--    Signature note (deliberate): the client holds only the session key
--    (attendance_date, timetable_id, period_id) — PendingSession carries
--    faculty_NAME but no id (types/session-feedback.ts). So the senior learner
--    is resolved SERVER-SIDE from the attendance blob, exactly as
--    fn_scf_submit_feedback does. No teacher argument is accepted from the
--    client, which also means the client cannot mis-attribute an answer.
--
--    The impression is INSERTed HERE, at offer time, not at answer time: an
--    offer the learner ignored must still count against their response rate,
--    otherwise auto-backoff can never trigger.
--
--    Returns jsonb: {item: {impression_id, code, name, question}} or
--    {item: null, reason: <text>}. NEVER raises — invariant 3.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_micro_next_item(
  p_attendance_date date,
  p_timetable_id    uuid,
  p_period_id       text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cfg            jsonb;
  v_row_active     boolean;
  v_enabled        boolean;
  v_min_gap        int;
  v_floor          numeric;
  v_window         int;
  v_cooldown       int;
  v_leave_lookback int;

  v_lp        uuid;
  v_inst      uuid;
  v_period    jsonb;
  v_email     text;
  v_staff     uuid;
  v_present   boolean;

  v_total     int;
  v_answered  int;
  v_last_off  timestamptz;

  v_has_leave boolean;

  v_code      text;
  v_name      text;
  v_question  text;
  v_last_item timestamptz;
  v_id        uuid;
BEGIN
  -- ---- config (missing row => documented defaults) -------------------------
  -- is_active is read, NOT filtered on. A MISSING row means "fresh database" and
  -- falls through to the documented defaults (feature on). A row that is PRESENT
  -- but deliberately deactivated means an operator turned this off, and must
  -- silence the feature — filtering it out in the WHERE would have made
  -- is_active=false read as "no row" and therefore DEFAULT BACK ON, which is the
  -- wrong direction for a kill switch.
  SELECT pp.value, COALESCE(pp.is_active, true)
    INTO v_cfg, v_row_active
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'classroom_practice.l2'
    AND pp.scope_type = 'global'
    AND pp.scope_id IS NULL
  LIMIT 1;

  IF v_cfg IS NOT NULL AND NOT COALESCE(v_row_active, true) THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'disabled');
  END IF;

  -- COALESCE only replaces NULL, never false — an explicit enabled=false
  -- survives this line and disables the feature below.
  v_enabled        := COALESCE((v_cfg ->> 'enabled')::boolean, true);
  v_min_gap        := COALESCE((v_cfg ->> 'min_gap_days_per_item')::int, 10);
  v_floor          := COALESCE((v_cfg ->> 'backoff_answer_rate_floor')::numeric, 0.2);
  -- Floor the window at 1: a mis-typed 0 would otherwise make the backoff test
  -- vacuously true and silence the feature for everyone.
  v_window         := GREATEST(COALESCE((v_cfg ->> 'backoff_window')::int, 10), 1);
  v_cooldown       := COALESCE((v_cfg ->> 'backoff_cooldown_days')::int, 3);
  v_leave_lookback := COALESCE((v_cfg ->> 'leave_item_lookback_days')::int, 60);

  -- ROLLBACK SWITCH.
  IF NOT v_enabled THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'disabled');
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'not_authenticated');
  END IF;

  -- Learners only. 'student' here is the literal DB role VALUE stored in
  -- profiles.role (same check as fn_carre_participant_score, 20260725101500),
  -- not user-facing wording.
  IF COALESCE(get_current_user_role(), '') NOT IN ('student', 'learner') THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'learners_only');
  END IF;

  SELECT lp.id INTO v_lp
  FROM public.learners_profiles lp
  WHERE lp.profile_id = auth.uid()
  LIMIT 1;

  IF v_lp IS NULL THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'no_learner_profile');
  END IF;

  -- ---- resolve the session + the senior learner from the blob --------------
  SELECT sa.institution_id, sa.attendance_data -> p_period_id
    INTO v_inst, v_period
  FROM public.student_attendance sa
  WHERE sa.timetable_id = p_timetable_id
    AND sa.attendance_date = p_attendance_date
    AND sa.attendance_data ? p_period_id
  LIMIT 1;

  IF v_period IS NULL THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'no_such_session');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_period -> 'students') st
    WHERE (st ->> 'student_id')::uuid = v_lp
      AND st ->> 'status' = 'Present'
  ) INTO v_present;

  IF NOT COALESCE(v_present, false) THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'not_present');
  END IF;

  v_email := NULLIF(v_period -> 'assigned_faculty' ->> 'faculty_email', '');
  v_staff := NULLIF(v_period -> 'assigned_faculty' ->> 'faculty_id', '')::uuid;

  -- Coarse FN/AN blobs carry no assigned person. Nothing to attribute an
  -- answer to => offer nothing. (Documented in types/session-feedback.ts.)
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'no_attributable_session');
  END IF;

  -- ---- invariant 1: never a second item on the same submission -------------
  IF EXISTS (
    SELECT 1 FROM public.carre_micro_impressions mi
    WHERE mi.learner_id = v_lp
      AND mi.attendance_date = p_attendance_date
      AND mi.period_id = p_period_id
  ) THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'already_offered');
  END IF;

  -- ---- invariant 6: auto-backoff on this learner's own response rate -------
  -- Global across senior learners (a learner who ignores these ignores them
  -- everywhere). Requires a FULL window before it can fire, so one early skip
  -- never silences the loop.
  SELECT count(*), count(r.answered_at), max(r.offered_at)
    INTO v_total, v_answered, v_last_off
  FROM (
    SELECT mi.answered_at, mi.offered_at
    FROM public.carre_micro_impressions mi
    WHERE mi.learner_id = v_lp
    ORDER BY mi.offered_at DESC
    LIMIT GREATEST(v_window, 1)
  ) r;

  IF COALESCE(v_total, 0) >= v_window
     AND v_total > 0
     AND (v_answered::numeric / v_total::numeric) < v_floor
     AND v_last_off IS NOT NULL
     AND v_last_off > now() - make_interval(days => v_cooldown)
  THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'backoff');
  END IF;

  -- ---- invariant 5: relevance gate for CP-C1 ------------------------------
  -- Only offer the leave item to a learner who actually has a DECIDED
  -- (approved or rejected) leave/OD request in the lookback window. There is no
  -- decided_at column on leave_onduty_applications, so updated_at is the
  -- decision-time proxy.
  SELECT EXISTS (
    SELECT 1
    FROM public.leave_onduty_applications loa
    WHERE loa.learner_id = v_lp
      AND loa.status IN ('approved', 'rejected')
      AND loa.updated_at >= now() - make_interval(days => v_leave_lookback)
  ) INTO v_has_leave;

  -- ---- invariant 4: per-(learner, senior learner) rotation deck ------------
  -- Least-recently-offered first; never-offered sorts first of all. Ties break
  -- on catalog code so the deck is deterministic.
  SELECT c.code, c.name, COALESCE(NULLIF(c.description, ''), c.name), deck.last_offered
    INTO v_code, v_name, v_question, v_last_item
  FROM public.audit_parameter_catalog c
  LEFT JOIN LATERAL (
    SELECT max(mi.offered_at) AS last_offered
    FROM public.carre_micro_impressions mi
    WHERE mi.learner_id = v_lp
      AND mi.teacher_email = v_email
      AND mi.parameter_code = c.code
  ) deck ON true
  WHERE c.code LIKE 'CP-%'
    AND COALESCE(c.is_active, true)
    AND (c.code <> 'CP-C1' OR COALESCE(v_has_leave, false))
  ORDER BY deck.last_offered ASC NULLS FIRST, c.code ASC
  LIMIT 1;

  -- No catalog rows yet (sibling migration not applied), or every item was
  -- excluded by relevance.
  IF v_code IS NULL THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'no_candidate');
  END IF;

  -- The least-recently-offered item is still inside its gap => every item is.
  -- Deck exhausted for now; stay quiet.
  IF v_last_item IS NOT NULL
     AND v_last_item > now() - make_interval(days => v_min_gap)
  THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'deck_cooling');
  END IF;

  -- ---- record the offer ----------------------------------------------------
  INSERT INTO public.carre_micro_impressions (
    institution_id, learner_id, teacher_email, teacher_staff_id,
    parameter_code, attendance_date, timetable_id, period_id
  )
  VALUES (
    v_inst, v_lp, v_email, v_staff,
    v_code, p_attendance_date, p_timetable_id, p_period_id
  )
  ON CONFLICT (learner_id, attendance_date, period_id) DO NOTHING
  RETURNING id INTO v_id;

  -- Lost a race against a concurrent submit: the other call owns this session's
  -- single item. Offer nothing rather than double-ask.
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'already_offered');
  END IF;

  RETURN jsonb_build_object(
    'item', jsonb_build_object(
      'impression_id', v_id,
      'code',          v_code,
      'name',          v_name,
      'question',      v_question
    )
  );

EXCEPTION WHEN OTHERS THEN
  -- INVARIANT 3: this must never surface as an error to a learner who just
  -- submitted feedback. Swallow, stay silent, let the base flow finish.
  RETURN jsonb_build_object('item', NULL, 'reason', 'unavailable');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_micro_next_item(date,uuid,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_micro_next_item(date,uuid,text) TO authenticated;

COMMENT ON FUNCTION public.fn_scf_micro_next_item(date,uuid,text) IS
  'Classroom Practice L2: picks AND records the single micro-item riding one feedback submission. Learner-only. Senior learner resolved server-side from the attendance blob (the client has no id to give, and so cannot mis-attribute). Honors the enabled kill switch, per-(learner,senior learner) rotation with min_gap_days, the CP-C1 decided-leave relevance gate, and per-learner auto-backoff. Records the offer at OFFER time so ignored offers count against response rate. Never raises — returns {item:null,reason} instead.';

-- ---------------------------------------------------------------------------
-- 5) fn_scf_micro_answer — the learner answers (0-4) or skips. Skipping is a
--    real recorded answer (invariant 2), not an absence of one.
--    Owner-scoped: a learner can only ever touch their OWN impression, and the
--    impression id is not enough — it must resolve to their learners_profiles
--    row (so a guessed/leaked id from another learner is refused).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_micro_answer(
  p_impression_id uuid,
  p_score         int DEFAULT NULL,
  p_skip          boolean DEFAULT false,
  p_comment       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lp      uuid;
  v_hit     int;
  v_comment text;
  v_every   int;
  v_email   text;
  v_answers int;
  v_invite  boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  -- 'student' = literal DB role value (see note in fn_scf_micro_next_item).
  IF COALESCE(get_current_user_role(), '') NOT IN ('student', 'learner') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'learners_only');
  END IF;

  SELECT lp.id INTO v_lp
  FROM public.learners_profiles lp
  WHERE lp.profile_id = auth.uid()
  LIMIT 1;

  IF v_lp IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_learner_profile');
  END IF;

  -- Trim, empty-to-NULL, hard cap. A comment is never required.
  v_comment := NULLIF(btrim(COALESCE(p_comment, '')), '');
  IF v_comment IS NOT NULL THEN
    v_comment := left(v_comment, 2000);
  END IF;

  -- ---- comment-only follow-up -------------------------------------------
  -- The invite appears AFTER the item is answered, so the comment arrives in a
  -- second call. One comment maximum per impression: the sealed_comment IS NULL
  -- guard makes a second send a no-op rather than an overwrite.
  IF v_comment IS NOT NULL AND p_score IS NULL AND NOT COALESCE(p_skip, false) THEN
    UPDATE public.carre_micro_impressions mi
       SET sealed_comment = v_comment,
           updated_at     = now()
     WHERE mi.id = p_impression_id
       AND mi.learner_id = v_lp
       AND mi.answered_at IS NOT NULL
       AND mi.sealed_comment IS NULL;

    GET DIAGNOSTICS v_hit = ROW_COUNT;
    IF v_hit = 0 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'not_commentable');
    END IF;
    RETURN jsonb_build_object('success', true, 'comment_saved', true);
  END IF;

  -- ---- normal answer ------------------------------------------------------
  IF NOT COALESCE(p_skip, false) THEN
    IF p_score IS NULL OR p_score < 0 OR p_score > 4 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'invalid_score');
    END IF;
  END IF;

  UPDATE public.carre_micro_impressions mi
     SET score          = CASE WHEN COALESCE(p_skip, false) THEN NULL ELSE p_score::smallint END,
         skipped        = COALESCE(p_skip, false),
         answered_at    = now(),
         sealed_comment = COALESCE(mi.sealed_comment, v_comment),
         updated_at     = now()
   WHERE mi.id = p_impression_id
     AND mi.learner_id = v_lp          -- ownership: never a caller-supplied identity
     AND mi.answered_at IS NULL        -- answer once
  RETURNING mi.teacher_email INTO v_email;

  GET DIAGNOSTICS v_hit = ROW_COUNT;

  IF v_hit = 0 THEN
    -- Not theirs, already answered, or gone. One opaque reason either way —
    -- a learner must not be able to probe another learner's impressions.
    RETURN jsonb_build_object('success', false, 'reason', 'not_answerable');
  END IF;

  -- ---- comment invite cadence --------------------------------------------
  -- Only after a real ANSWER (never after a skip), counted per (learner, person
  -- described). N <= 0 disables the invite. Never blocks: any problem here just
  -- means no invite this time.
  IF NOT COALESCE(p_skip, false) AND v_email IS NOT NULL THEN
    SELECT COALESCE((pp.value ->> 'comment_invite_every_n_answers')::int, 8)
      INTO v_every
    FROM public.platform_policies pp
    WHERE pp.policy_key = 'classroom_practice.l2'
      AND pp.scope_type = 'global'
      AND pp.scope_id IS NULL
      AND COALESCE(pp.is_active, true)
    LIMIT 1;

    v_every := COALESCE(v_every, 8);

    IF v_every > 0 THEN
      SELECT count(*) INTO v_answers
      FROM public.carre_micro_impressions mi
      WHERE mi.learner_id = v_lp
        AND mi.teacher_email = v_email
        AND mi.answered_at IS NOT NULL
        AND NOT mi.skipped;

      v_invite := COALESCE(v_answers, 0) > 0
              AND (v_answers % v_every) = 0
              AND v_comment IS NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success',        true,
    'skipped',        COALESCE(p_skip, false),
    'comment_invite', v_invite
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'reason', 'unavailable');
END;
$$;

-- The pre-comment 3-arg signature never reached production, but drop it if an
-- environment picked up an earlier copy of this file: leaving both overloads in
-- place makes a 3-argument call ambiguous ("function is not unique").
DROP FUNCTION IF EXISTS public.fn_scf_micro_answer(uuid,int,boolean);

REVOKE EXECUTE ON FUNCTION public.fn_scf_micro_answer(uuid,int,boolean,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_micro_answer(uuid,int,boolean,text) TO authenticated;

COMMENT ON FUNCTION public.fn_scf_micro_answer(uuid,int,boolean,text) IS
  'Classroom Practice L2: the learner answers their own micro-item 0-4, or skips (skip is a recorded answer, not an absence), and may attach ONE sealed comment. Two shapes: a normal answer (score or skip), and a comment-only follow-up (comment with no score and no skip) for the invite that appears AFTER answering. Owner-scoped via learners_profiles — the impression id alone grants nothing, so a leaked id from another learner is refused with the same opaque reason as an already-answered one. Answer-once; one comment maximum per impression. Returns comment_invite=true after every Nth ANSWERED item about the same person (platform_policies classroom_practice.l2 -> comment_invite_every_n_answers; <=0 disables). Never raises.';

-- ---------------------------------------------------------------------------
-- 6) fn_scf_micro_health — INVARIANT 7, the watched alarm metric.
--    Weekly, last ~8 weeks: base session-feedback submissions alongside micro
--    offers/answers. The number that matters is base_submissions: if it falls
--    after L2 goes live, L2 is hurting the thing it rides on and must be
--    switched off via the config row. Aggregates only — no identities.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_micro_health()
RETURNS TABLE (
  week_start        date,
  base_submissions  bigint,
  impressions       bigint,
  answered          bigint,
  skipped           bigint,
  answer_rate       numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR COALESCE(user_has_permission('audit.cycle.view'), false)
  ) THEN
    RAISE EXCEPTION 'fn_scf_micro_health: not authorised';
  END IF;

  RETURN QUERY
  WITH weeks AS (
    SELECT generate_series(
      date_trunc('week', CURRENT_DATE - INTERVAL '7 weeks')::date,
      date_trunc('week', CURRENT_DATE)::date,
      INTERVAL '1 week'
    )::date AS wk
  ),
  base AS (
    SELECT date_trunc('week', sf.created_at)::date AS wk, count(*) AS n
    FROM public.session_feedback sf
    WHERE sf.created_at >= date_trunc('week', CURRENT_DATE - INTERVAL '7 weeks')
    GROUP BY 1
  ),
  micro AS (
    SELECT date_trunc('week', mi.offered_at)::date AS wk,
           count(*)                                            AS n,
           count(mi.answered_at) FILTER (WHERE NOT mi.skipped)  AS n_answered,
           count(*) FILTER (WHERE mi.skipped)                   AS n_skipped
    FROM public.carre_micro_impressions mi
    WHERE mi.offered_at >= date_trunc('week', CURRENT_DATE - INTERVAL '7 weeks')
    GROUP BY 1
  )
  SELECT
    w.wk,
    COALESCE(b.n, 0)::bigint,
    COALESCE(m.n, 0)::bigint,
    COALESCE(m.n_answered, 0)::bigint,
    COALESCE(m.n_skipped, 0)::bigint,
    CASE WHEN COALESCE(m.n, 0) = 0 THEN NULL
         ELSE round(COALESCE(m.n_answered, 0)::numeric / m.n::numeric, 3)
    END
  FROM weeks w
  LEFT JOIN base  b ON b.wk = w.wk
  LEFT JOIN micro m ON m.wk = w.wk
  ORDER BY w.wk;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_micro_health() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_micro_health() TO authenticated;

COMMENT ON FUNCTION public.fn_scf_micro_health() IS
  'Classroom Practice L2 alarm metric (invariant 7). Weekly for ~8 weeks: base session-feedback submissions next to micro offers/answers/skips. A DROP IN base_submissions after L2 ships is the signal to flip platform_policies classroom_practice.l2 -> enabled=false. Aggregates only, never identities. Gated: super admin / admin / audit.cycle.view.';

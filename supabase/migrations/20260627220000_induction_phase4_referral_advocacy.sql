-- ============================================================================
-- Induction Phase 4 — referral + advocacy (the value→advocacy→refer→join funnel).
-- Added: 2026-06-27
--
-- Spec §1b/§5b + decisions 11–14: a fresher who experienced VALUE advocates
-- (NPS 0–10) and refers a prospect; the referral effort (≥1) gates the fresher
-- (outcome_complete); whether the prospect JOINS is the program KPI (read live
-- from the admission funnel, never held against the individual).
--
-- REUSE the existing admission referral bridge — do NOT build a new referral
-- table (spec §4.3). A fresher referral = an `admission_leads` row with
-- source='referral' + referral_type='student' + referred_by_id=<fresher>
-- (referral_type is CHECK-constrained to {consultant,student,faculty}; a fresher
-- is a 'student' referrer — matches the 15.5k existing student-referral leads;
-- the induction-specific identity is referred_by_id). Referral leads are
-- deliberately excluded from counselor routing. Learners cannot INSERT
-- admission_leads directly (RLS is counselor/admin only), so writes flow through
-- a gated SECURITY DEFINER RPC.
--
-- Security (CLAUDE.md): STABLE/VOLATILE SECURITY DEFINER SET search_path=public
-- + explicit REVOKE EXECUTE FROM anon, PUBLIC + GRANT TO authenticated. RETURNS
-- TABLE columns cast to declared types (verify under an authenticated render).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. fn_induction_my_enrollments — REPLACE to add advocacy_score (the page reads
--    the whole "my induction" snapshot in one call). Return-type change → DROP +
--    CREATE (CREATE OR REPLACE cannot alter a function's return columns).
--    referrals_submitted/joined stay LIVE-derived in fn_induction_my_referrals;
--    advocacy_score is authoritative on induction_completion (only the advocacy
--    RPC writes it).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_induction_my_enrollments();
CREATE FUNCTION public.fn_induction_my_enrollments()
RETURNS TABLE (
  event_id               UUID,
  event_name             TEXT,
  institution_id         UUID,
  institution_name       TEXT,
  start_date             DATE,
  end_date               DATE,
  status                 TEXT,
  batch_id               UUID,
  batch_label            TEXT,
  sessions_total         INTEGER,
  sessions_attended      INTEGER,
  attendance_pct         NUMERIC,
  participation_complete BOOLEAN,
  value_score_avg        NUMERIC,
  advocacy_score         NUMERIC,
  is_profile_complete    BOOLEAN,
  profile_fields_total   INTEGER,
  profile_fields_filled  INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_learner UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_my_enrollments: not authenticated';
  END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.id::uuid,
    e.name::text,
    e.institution_id::uuid,
    i.name::text,
    e.start_date::date,
    e.end_date::date,
    e.status::text,
    ie.batch_id::uuid,
    b.label::text,
    COALESCE(c.sessions_total, 0)::integer,
    COALESCE(c.sessions_attended, 0)::integer,
    COALESCE(c.attendance_pct, 0)::numeric,
    COALESCE(c.participation_complete, false)::boolean,
    c.value_score_avg::numeric,
    c.advocacy_score::numeric,
    COALESCE(lp.is_profile_complete, false)::boolean,
    4::integer,
    (
      (lp.college_email   IS NOT NULL AND btrim(lp.college_email) <> '')::int +
      (lp.academic_year_id IS NOT NULL)::int +
      (lp.semester_id      IS NOT NULL)::int +
      (lp.section_id       IS NOT NULL)::int
    )::integer
  FROM public.induction_enrollment ie
  JOIN public.events             e  ON e.id = ie.event_id
  JOIN public.institutions       i  ON i.id = e.institution_id
  LEFT JOIN public.induction_batches    b ON b.id = ie.batch_id
  LEFT JOIN public.induction_completion c ON c.event_id = ie.event_id AND c.learner_id = ie.learner_id
  LEFT JOIN public.learners_profiles    lp ON lp.id = ie.learner_id
  WHERE ie.learner_id = v_learner
  ORDER BY e.start_date DESC NULLS LAST;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_my_enrollments() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_enrollments() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. fn_induction_submit_referral — a fresher refers a prospect (writes the LIVE
--    admission funnel via a controlled minimal insert; NOT capture_admission_lead
--    to avoid routing/gate-entry side effects). Anti-self-referral + per-fresher
--    phone dedupe. Recomputes induction_completion.referrals_submitted +
--    outcome_complete (effort gate ≥1, decision 13) from the source of truth.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_submit_referral(
  p_event_id   UUID,
  p_first_name TEXT,
  p_phone      TEXT,
  p_last_name  TEXT DEFAULT NULL,
  p_email      TEXT DEFAULT NULL,
  p_program_id UUID DEFAULT NULL,
  p_note       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_learner  UUID;
  v_inst     UUID;
  v_my_name  TEXT;
  v_my_phone TEXT;
  v_phone    TEXT;
  v_digits   TEXT;
  v_lead     UUID;
  v_existing UUID;
  v_count    INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_referral: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_referral: not a learner'; END IF;

  -- must be enrolled in THIS induction; the lead lands in the induction's institution
  SELECT ip.institution_id INTO v_inst
  FROM public.induction_enrollment ie
  JOIN public.induction_programs ip ON ip.event_id = ie.event_id
  WHERE ie.event_id = p_event_id AND ie.learner_id = v_learner;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_referral: not enrolled in this induction'; END IF;

  SELECT NULLIF(btrim(COALESCE(lp.first_name,'') || ' ' || COALESCE(lp.last_name,'')), ''),
         lp.student_mobile
    INTO v_my_name, v_my_phone
  FROM public.learners_profiles lp WHERE lp.id = v_learner;

  -- validate prospect
  IF btrim(COALESCE(p_first_name,'')) = '' THEN
    RAISE EXCEPTION 'fn_induction_submit_referral: prospect name is required';
  END IF;
  v_phone  := btrim(COALESCE(p_phone,''));
  v_digits := regexp_replace(v_phone, '\D', '', 'g');
  IF length(v_digits) < 10 THEN
    RAISE EXCEPTION 'fn_induction_submit_referral: a valid phone number is required';
  END IF;
  IF v_my_phone IS NOT NULL AND regexp_replace(v_my_phone, '\D', '', 'g') = v_digits THEN
    RAISE EXCEPTION 'fn_induction_submit_referral: you cannot refer your own number';
  END IF;

  -- dedupe: same prospect phone already referred by this fresher → return existing
  SELECT al.id INTO v_existing
  FROM public.admission_leads al
  WHERE al.referred_by_id = v_learner
    AND regexp_replace(al.phone, '\D', '', 'g') = v_digits
  ORDER BY al.created_at DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    v_lead := v_existing;
  ELSE
    INSERT INTO public.admission_leads
      (institution_id, first_name, last_name, phone, email,
       source, funnel_stage, referral_type, referred_by_id, referred_by_name,
       program_id, notes)
    VALUES
      (v_inst, btrim(p_first_name), NULLIF(btrim(COALESCE(p_last_name,'')), ''), v_phone,
       NULLIF(btrim(COALESCE(p_email,'')), ''),
       -- referral_type is constrained to {consultant,student,faculty}; a fresher is a
       -- STUDENT referrer (the induction-specific identity is referred_by_id below).
       'referral'::lead_source, 'new'::funnel_stage, 'student', v_learner, v_my_name,
       p_program_id, NULLIF(btrim(COALESCE(p_note,'')), ''))
    RETURNING id INTO v_lead;
  END IF;

  -- recompute the effort gate from the source of truth (no counter drift)
  SELECT count(*) INTO v_count
  FROM public.admission_leads al
  WHERE al.referred_by_id = v_learner AND al.source = 'referral'::lead_source;

  INSERT INTO public.induction_completion
      (event_id, learner_id, institution_id, referrals_submitted, outcome_complete)
  VALUES (p_event_id, v_learner, v_inst, v_count, v_count >= 1)
  ON CONFLICT (event_id, learner_id) DO UPDATE
    SET referrals_submitted = EXCLUDED.referrals_submitted,
        outcome_complete    = EXCLUDED.referrals_submitted >= 1,
        updated_at          = now();

  RETURN jsonb_build_object(
    'lead_id', v_lead,
    'action', CASE WHEN v_existing IS NOT NULL THEN 'duplicate' ELSE 'created' END,
    'referrals_submitted', v_count,
    'outcome_complete', v_count >= 1
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_submit_referral(UUID,TEXT,TEXT,TEXT,TEXT,UUID,TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_submit_referral(UUID,TEXT,TEXT,TEXT,TEXT,UUID,TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. fn_induction_my_referrals — the fresher's own referrals + LIVE join status
--    (funnel_stage terminal success = token_paid/confirmed/enrolled). The page
--    derives "submitted N, joined M" from this list.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_my_referrals(p_event_id UUID)
RETURNS TABLE (
  lead_id      UUID,
  full_name    TEXT,
  phone        TEXT,
  program_id   UUID,
  funnel_stage TEXT,
  joined       BOOLEAN,
  submitted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_learner UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_my_referrals: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    al.id::uuid,
    NULLIF(btrim(COALESCE(al.first_name,'') || ' ' || COALESCE(al.last_name,'')), '')::text,
    al.phone::text,
    al.program_id::uuid,
    al.funnel_stage::text,
    (al.funnel_stage IN ('token_paid','confirmed','enrolled'))::boolean,
    al.created_at
  FROM public.admission_leads al
  WHERE al.referred_by_id = v_learner
    AND al.source = 'referral'::lead_source
  ORDER BY al.created_at DESC;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_my_referrals(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_referrals(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. fn_induction_submit_advocacy — end-of-induction NPS 0–10 → advocacy_score
--    (the bridge signal between experienced value and referral).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_submit_advocacy(p_event_id UUID, p_score INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_learner UUID;
  v_inst    UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_advocacy: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_advocacy: not a learner'; END IF;
  IF p_score IS NULL OR p_score < 0 OR p_score > 10 THEN
    RAISE EXCEPTION 'fn_induction_submit_advocacy: score must be 0-10';
  END IF;

  SELECT ip.institution_id INTO v_inst
  FROM public.induction_enrollment ie
  JOIN public.induction_programs ip ON ip.event_id = ie.event_id
  WHERE ie.event_id = p_event_id AND ie.learner_id = v_learner;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_advocacy: not enrolled in this induction'; END IF;

  INSERT INTO public.induction_completion (event_id, learner_id, institution_id, advocacy_score)
  VALUES (p_event_id, v_learner, v_inst, p_score)
  ON CONFLICT (event_id, learner_id) DO UPDATE
    SET advocacy_score = EXCLUDED.advocacy_score, updated_at = now();

  RETURN p_score;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_submit_advocacy(UUID, INTEGER) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_submit_advocacy(UUID, INTEGER) TO authenticated;

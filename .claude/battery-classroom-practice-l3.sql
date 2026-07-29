-- ============================================================================
-- battery-classroom-practice-l3.sql
-- ============================================================================
-- Rolled-back rehearsal for supabase/migrations/20260729183000_classroom_practice_catalog_l3.sql
-- Run the WHOLE file in one Mgmt-API call. It opens a transaction and NEVER
-- commits, so the catalog seed, the cycles and every score roll back.
-- The migration body is inlined below so the asserts run against exactly the
-- objects the migration creates.
-- ============================================================================
BEGIN;

-- ============================================================================
-- Classroom Practice (L3) — the TEACHER-LEVEL slice of the CARRE audit
-- 2026-07-29 · Director-ratified design (Classroom Practice audit, 13 items,
-- 3-layer instrument carried by the session-feedback exhaust).
--
-- WHAT THIS IS
--   CARRE (25 items) audits an INITIATIVE. Classroom Practice (13 items) audits
--   ONE Senior Learner's own practice, as their learners actually experience it.
--   Same 0-4 scale, same sealed lane, same k>=3 floor — a different catalog and
--   a much tighter scope.
--
-- THE FOUR RATIFIED INVARIANTS THIS MIGRATION ENFORCES IN THE DATABASE
--   1. BATCH REVEAL — no live medians while the learner window is open. The
--      owner sees learner voice only AFTER participant_scoring_open = false.
--      A running median is a live scoreboard, and a live scoreboard is what
--      turns an honest instrument into a performance to be managed.
--   2. SELF-SCORE FIRST — the owner must have scored all 13 items themselves
--      before any learner median is shown to them. Otherwise the "compare"
--      is not a comparison, it is an answer key.
--   3. k >= 3 — unchanged from the sealed lane. A lone voice can never be
--      isolated. Enforced in the SAME clause as before; not weakened here.
--   4. ROSTER SCOPE — only a learner who actually sat in this Senior Learner's
--      sessions may score them. Enforced server-side, not in the UI.
--
--   1, 2 and 4 are enforced by the RPCs below, NOT by the UI. A crafted REST
--   call cannot bypass them.
--
-- THE ROSTER JOIN (the non-obvious part — read before editing)
--   session_feedback.faculty_id is a STAFF id, NOT a profiles.id. The reliable
--   join to a Senior Learner's profile is EMAIL — this is documented ground
--   truth in 20260615233000_session_feedback_substrate.sql:
--     learner : auth.uid() = profiles.id -> learners_profiles.profile_id
--                                        -> learners_profiles.id = session_feedback.student_id
--     owner   : profiles.id -> profiles.email = session_feedback.faculty_email
--   Roster membership therefore means "this learner has submitted post-session
--   feedback for at least one session this person taught". That is the exhaust
--   the machine already watches, and it is index-backed
--   (idx_session_feedback_student on (student_id, attendance_date)).
--
--   CONSEQUENCE, stated plainly: a learner who never submits session feedback
--   is not in the roster and cannot score. That is deliberate — being in the
--   loop is the price of speaking in it — and it is also the only predicate
--   cheap enough to run inside the 8s authenticated statement_timeout. The
--   attendance blob (student_attendance.attendance_data) would require a
--   per-row jsonb_each scan; that is the exact shape that took 110s and was
--   rewritten in 20260725110000.
--
-- ADDITIVE + THREE REPLACEMENTS. The three fn_carre_participant_* functions are
-- CREATE OR REPLACE'd from their CURRENT definitions (20260725101500 and
-- 20260725114500 — verified as the only definitions in the tree). Every gate
-- they already had is preserved verbatim; this migration only ADDs gates.
-- Anon locks are re-asserted on every replacement (CREATE OR REPLACE re-arms
-- Supabase's default anon EXECUTE grant).
--
-- Scale is 0-4 on every item (0 never … 4 always, and evidenced) — identical to
-- the CARRE/CARE catalogs, so the shared score sheet renders unchanged.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Catalog seed — 13 Classroom Practice items (CP-*), system rows.
--
--    parameter_group mirrors the CARRE pillar convention:
--      1 = Clarity · 2 = Appreciation · 4 = Respect · 5 = Empowerment
--    Group 3 (Recognition) is deliberately EMPTY: recognition is an
--    institutional surface (award cycles, showcases), not something a single
--    Senior Learner controls inside their own sessions. Scoring them on it
--    would measure the institution and blame the individual.
--
--    `name` is the short label; `description` is the LEARNER-WORDED QUESTION —
--    the learner reads the description, not the label. Wording is ratified and
--    is reproduced verbatim.
--
--    Guarded by NOT EXISTS on 'CP-%' so re-runs are idempotent.
-- ----------------------------------------------------------------------------
INSERT INTO public.audit_parameter_catalog
  (code, name, parameter_group, description, framework_mapping,
   default_owner_role, escalation_role, evidence_required, is_system, is_active)
SELECT v.code, v.name, v.grp, v.description, v.mapping,
       'hod', 'principal', v.evidence, true, true
FROM (
  VALUES
  -- Clarity (group 1) — can a learner predict how this person decides?
  ('CP-C1','Leave decided by clear rules',1::smallint,
   'When someone asks for leave or OD, the decision follows stated rules — not mood or favourites.',
   '{"classroom_practice":"CP-C1"}'::jsonb,
   '[{"setting":"ACAD","label":"OD/leave decisions on this person''s sessions: how many pending, and for how long"}]'::jsonb),
  ('CP-C2','Good work is defined upfront',1,
   'This teacher tells us what good work looks like before we start — marks never feel like a surprise.',
   '{"classroom_practice":"CP-C2"}',
   '[{"setting":"ACAD","label":"Rubric or success criteria published before the assessment window opens"}]'),
  ('CP-C3','Rules come with reasons',1,
   'When this teacher sets a rule or says no, we are told the reason.',
   '{"classroom_practice":"CP-C3"}',
   '[{"setting":"ACAD","label":"Session-feedback free-text: do learners report being told why?"}]'),
  -- Appreciation (group 2) — is effort noticed, and does noticing reach anyone?
  ('CP-A1','Permissions answered fast',2,
   'Requests and permissions get an answer quickly — we are not left waiting or chasing.',
   '{"classroom_practice":"CP-A1"}',
   '[{"setting":"ACAD","label":"Time from request to first answer on this person''s approvals queue"}]'),
  ('CP-A2','Struggling learners get follow-up',2,
   'When someone struggles in class, this teacher follows up with them afterwards.',
   '{"classroom_practice":"CP-A2"}',
   '[{"setting":"ACAD","label":"Low-understanding session-feedback rows and what happened next"}]'),
  ('CP-A3','Quiet learners re-engaged',2,
   'This teacher notices quiet classmates and draws them back in, without embarrassing them.',
   '{"classroom_practice":"CP-A3"}',
   '[{"setting":"ACAD","label":"Spread of participation across the register, not just the usual voices"}]'),
  -- Respect (group 4) — dignity. Never machine-scored; the sealed lane is the
  -- only honest source, which is why this pillar carries the most items.
  ('CP-RS1','No public punishment',4,
   'Mistakes are corrected privately — nobody is shamed in front of the class.',
   '{"classroom_practice":"CP-RS1"}',
   '[{"setting":"ACAD","label":"Human-observed only — the sealed learner sheet is the sole source"}]'),
  ('CP-RS2','Everyone treated the same',4,
   'This teacher treats every learner the same, whoever they are.',
   '{"classroom_practice":"CP-RS2"}',
   '[{"setting":"ACAD","label":"Human-observed only — the sealed learner sheet is the sole source"}]'),
  ('CP-RS3','Questions never cost marks',4,
   'Asking a question or admitting confusion never costs marks or goodwill with this teacher.',
   '{"classroom_practice":"CP-RS3"}',
   '[{"setting":"ACAD","label":"Human-observed only — the sealed learner sheet is the sole source"}]'),
  ('CP-RS4','Easy to ask in class',4,
   'It feels safe and easy to ask questions during this teacher''s class.',
   '{"classroom_practice":"CP-RS4"}',
   '[{"setting":"ACAD","label":"Session-feedback checklist: doubts addressed, per session"}]'),
  ('CP-RS5','No running around for signatures',4,
   'Getting a signature or a no-dues clearance from this teacher does not take repeated trips.',
   '{"classroom_practice":"CP-RS5"}',
   '[{"setting":"ACAD","label":"Clearance/no-dues turnaround attributable to this person"}]'),
  -- Empowerment (group 5) — does the session belong to the learners in it?
  ('CP-E1','Classes are engaging',5,
   'This teacher''s classes keep me engaged — I am not just copying notes.',
   '{"classroom_practice":"CP-E1"}',
   '[{"setting":"ACAD","label":"Session-feedback understanding band across this person''s sessions"}]'),
  ('CP-E2','Feedback causes change',5,
   'When we give feedback about this class, something actually changes.',
   '{"classroom_practice":"CP-E2"}',
   '[{"setting":"ACAD","label":"Improvement suggestions raised from these sessions that received a human verdict"}]')
) AS v(code, name, grp, description, mapping, evidence)
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_parameter_catalog WHERE code LIKE 'CP-%'
);

-- ----------------------------------------------------------------------------
-- 2. Roster helper — "did this learner sit in this person's sessions?"
--
--    SECURITY DEFINER because it reads session_feedback (learner-own RLS) on
--    behalf of the gate. It returns a BOOLEAN ONLY — it never leaks a row, a
--    date, a session, or a count, so it cannot be used to profile anyone.
--    NULL-safe: a missing learner row, a missing profile, or a NULL email all
--    collapse to EXISTS(...) = false, never NULL.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_carre_learner_in_owner_roster(
  p_learner_profile_id uuid,
  p_owner_profile_id   uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '8s'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.session_feedback sf
    WHERE sf.student_id = (
            SELECT lp.id
            FROM public.learners_profiles lp
            WHERE lp.profile_id = p_learner_profile_id
            LIMIT 1)
      AND sf.faculty_email IS NOT NULL
      AND lower(sf.faculty_email) = lower((
            SELECT p.email
            FROM public.profiles p
            WHERE p.id = p_owner_profile_id))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_learner_in_owner_roster(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_learner_in_owner_roster(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_carre_learner_in_owner_roster IS
  'Classroom Practice roster gate: TRUE when the learner has submitted post-session feedback for at least one session taught by the given profile. Joins on EMAIL because session_feedback.faculty_id is a staff id, not a profiles.id (see 20260615233000). Returns a boolean only — never a row.';

-- ----------------------------------------------------------------------------
-- 3. fn_carre_create_classroom_audit — open a 13-item Classroom Practice cycle.
--
--    Anyone on the team may open one on THEMSELVES. Opening one on someone
--    ELSE requires leadership (super admin / admin / audit.cycle.manage) —
--    a peer cannot open an audit on a peer.
--
--    module_key is set to 'classroom-practice' directly in the INSERT. That key
--    is deliberately ABSENT from CARRE_AUDITABLE_MODULES: teacher-level cycles
--    must not appear on the module coverage map, which tracks platform modules.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_carre_create_classroom_audit(
  p_name          text,
  p_teacher_id    uuid    DEFAULT NULL,
  p_re_audit_date date    DEFAULT NULL,
  p_open_scoring  boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_caller_role  text;
  v_owner        uuid;
  v_owner_role   text;
  v_institution  uuid;
  v_re_audit     date;
  v_params       jsonb;
  v_cycle_id     uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  -- Caller must be a team member. 'student' is an existing DB role value, kept
  -- verbatim alongside 'learner' exactly as the sealed lane checks it.
  v_caller_role := COALESCE(get_current_user_role(), '');
  IF v_caller_role = '' OR v_caller_role IN ('student', 'learner') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'staff_only',
      'detail', 'Classroom Practice cycles are opened by team members.');
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) < 4 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_name');
  END IF;

  v_owner := COALESCE(p_teacher_id, v_uid);

  -- Opening a cycle on someone else is a leadership act. COALESCE keeps the
  -- guard NULL-safe: a NULL from any helper must read as "no", never fall
  -- through the IF.
  IF v_owner <> v_uid THEN
    IF NOT (COALESCE(is_super_admin(), false)
            OR COALESCE(is_admin(), false)
            OR COALESCE(user_has_permission('audit.cycle.manage'), false)) THEN
      RETURN jsonb_build_object('success', false, 'reason', 'not_allowed_for_other_teacher',
        'detail', 'Only audit leadership can open a Classroom Practice cycle on someone else.');
    END IF;
  END IF;

  SELECT p.role, p.institution_id INTO v_owner_role, v_institution
  FROM public.profiles p WHERE p.id = v_owner;

  IF v_owner_role IS NULL OR v_owner_role IN ('student', 'learner') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'teacher_not_staff',
      'detail', 'A Classroom Practice cycle can only be opened on a team member.');
  END IF;

  -- Semester end is not knowable from here, so the default re-audit horizon is
  -- +120 days (roughly one teaching term). The caller can always override it.
  v_re_audit := COALESCE(p_re_audit_date, CURRENT_DATE + 120);
  IF v_re_audit < CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_re_audit_date',
      'detail', 'Re-audit date must be today or later.');
  END IF;

  -- Freeze the 13 CP items into the cycle. The sheet reads ONLY the snapshot,
  -- so later catalog edits never rewrite a cycle already in flight.
  SELECT jsonb_agg(jsonb_build_object(
           'code', code,
           'name', name,
           'description', description,
           'parameter_group', parameter_group,
           'framework_mapping', framework_mapping,
           'evidence_required', evidence_required
         ) ORDER BY parameter_group, code)
    INTO v_params
  FROM public.audit_parameter_catalog
  WHERE code LIKE 'CP-%' AND is_system = true AND is_active = true;

  IF v_params IS NULL OR jsonb_array_length(v_params) <> 13 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'catalog_incomplete',
      'detail', 'Expected 13 Classroom Practice parameters in the catalog.');
  END IF;

  INSERT INTO public.audit_cycles
    (name, description, frameworks, start_date, end_date, lead_auditor_id,
     cosigner_roles, institution_ids, phase, module_key,
     participant_scoring_open, parameter_catalog_snapshot, created_by)
  VALUES
    (trim(p_name),
     NULL,
     ARRAY['CARRE'],
     CURRENT_DATE,
     v_re_audit,
     v_owner,
     ARRAY['hod','principal'],
     CASE WHEN v_institution IS NULL THEN NULL ELSE ARRAY[v_institution] END,
     'in-progress',
     'classroom-practice',
     COALESCE(p_open_scoring, true),
     jsonb_build_object(
       'frozen_at', now(),
       'framework', 'CARRE',
       'catalog', 'CLASSROOM_PRACTICE',
       'version', '1.0',
       'setting_code', 'ACAD',
       'teacher_profile_id', v_owner,
       'parameters', v_params
     ),
     v_uid)
  RETURNING id INTO v_cycle_id;

  RETURN jsonb_build_object('success', true, 'cycle_id', v_cycle_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_create_classroom_audit(text, uuid, date, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_create_classroom_audit(text, uuid, date, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_carre_create_classroom_audit IS
  'Classroom Practice (L3): opens a 13-item CP cycle owned by one team member. Self-open is open to any team member; opening on someone else needs audit leadership. Freezes the CP catalog into parameter_catalog_snapshot with catalog=CLASSROOM_PRACTICE + teacher_profile_id, and tags module_key=classroom-practice (deliberately off the module coverage map).';

-- ----------------------------------------------------------------------------
-- 4. fn_carre_set_participant_window — open / close the learner window.
--
--    NEW. No RPC previously existed to move participant_scoring_open (it was
--    flipped by hand), and the batch-reveal invariant is worthless if the owner
--    cannot close the window from the UI. Owner OR leadership; anon-locked.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_carre_set_participant_window(
  p_cycle_id uuid,
  p_open     boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  IF p_open IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'bad_state');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.audit_cycles c
    WHERE c.id = p_cycle_id AND c.frameworks @> ARRAY['CARRE']::text[]
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;

  IF NOT (COALESCE(public.fn_carre_is_cycle_owner(p_cycle_id), false)
          OR COALESCE(is_super_admin(), false)
          OR COALESCE(is_admin(), false)
          OR COALESCE(user_has_permission('audit.cycle.manage'), false)) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_owner');
  END IF;

  UPDATE public.audit_cycles
     SET participant_scoring_open = p_open,
         updated_at = now()
   WHERE id = p_cycle_id;

  RETURN jsonb_build_object('success', true, 'participant_scoring_open', p_open);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_set_participant_window(uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_set_participant_window(uuid, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_carre_set_participant_window IS
  'Opens/closes a CARRE cycle''s sealed learner window (audit_cycles.participant_scoring_open). Cycle owner or audit leadership. Closing the window is what unlocks the batch reveal on a Classroom Practice cycle.';

-- ----------------------------------------------------------------------------
-- 5. fn_carre_search_teachers — the team-member picker behind the CP form.
--
--    Returns profiles.id (audit_cycles.lead_auditor_id references auth.users,
--    and profiles.id == auth.users.id 1:1). The staff table is NOT usable here:
--    staff.id is a different identifier space.
--
--    TENANT-SCOPED. profiles' RLS SELECT policy is not institution-scoped, so an
--    unscoped search would let any team member enumerate names and emails across
--    every institution. Cross-institution search is a super admin / admin
--    privilege; everyone else is pinned to their own institution, and a caller
--    with no institution on file gets an empty result rather than an unscoped
--    one. (Same reasoning as the schools-network staff search, PR #1745.)
--
--    sessions_90d tells the picker whether the roster gate can ever match for
--    this person — a candidate with 0 has no session-feedback exhaust, so no
--    learner would be admitted to their sheet.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_carre_search_teachers(p_q text)
RETURNS TABLE (
  profile_id   uuid,
  full_name    text,
  email        text,
  role         text,
  sessions_90d int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '8s'
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_role        text;
  v_institution uuid;
  v_cross       boolean;
  v_q           text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_role := COALESCE(get_current_user_role(), '');
  IF v_role = '' OR v_role IN ('student', 'learner') THEN
    RETURN;   -- the picker is a team-member surface
  END IF;

  v_q := trim(COALESCE(p_q, ''));
  IF length(v_q) < 2 THEN
    RETURN;   -- do not enumerate the directory on an empty query
  END IF;
  -- Neutralise LIKE wildcards so a typed query cannot widen its own scope.
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  v_cross := COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false);

  SELECT p.institution_id INTO v_institution
  FROM public.profiles p WHERE p.id = v_uid;

  IF NOT v_cross AND v_institution IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id,
         p.full_name,
         p.email,
         p.role,
         (SELECT count(*)::int
            FROM public.session_feedback sf
           WHERE sf.faculty_email IS NOT NULL
             AND lower(sf.faculty_email) = lower(p.email)
             AND sf.attendance_date >= CURRENT_DATE - 90)
  FROM public.profiles p
  WHERE COALESCE(p.role, '') NOT IN ('', 'student', 'learner')
    AND (p.full_name ILIKE '%' || v_q || '%' ESCAPE '\'
         OR p.email  ILIKE '%' || v_q || '%' ESCAPE '\')
    AND (v_cross OR p.institution_id = v_institution)
  ORDER BY p.full_name
  LIMIT 10;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_search_teachers(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_search_teachers(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_carre_search_teachers IS
  'Team-member picker for the Classroom Practice form. Returns profiles.id (NOT staff.id — audit_cycles.lead_auditor_id references auth.users). Institution-scoped unless super admin/admin; min 2-char query; max 10 rows. sessions_90d reports session-feedback exhaust so the picker can warn when the roster gate could never match.';

-- ----------------------------------------------------------------------------
-- 6. REPLACE fn_carre_participant_score
--
--    Changed vs 20260725101500:
--      (a) parameter validation moves from catalog-prefix ('CARRE-%') to
--          SNAPSHOT MEMBERSHIP. The frozen snapshot is the contract — this is
--          what lets a CP cycle accept CP-* codes without loosening anything,
--          and it also stops a CARRE cycle accepting a code that was added to
--          the catalog after it was frozen.
--      (b) NEW roster gate for CLASSROOM_PRACTICE cycles only.
--    Every pre-existing gate (learners-only, lane, score range, cycle open,
--    upsert-own-row) is preserved verbatim.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_carre_participant_score(
  p_cycle_id uuid,
  p_parameter_code text,
  p_score int,
  p_note text DEFAULT NULL,
  p_lane text DEFAULT 'own'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_cycle record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  -- Participant lane is for learners; team members score through the audit UI.
  IF COALESCE(get_current_user_role(), '') NOT IN ('student', 'learner') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'learners_only');
  END IF;

  IF p_lane NOT IN ('own', 'observer') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'bad_lane');
  END IF;

  IF p_score IS NULL OR p_score < 0 OR p_score > 4 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'bad_score');
  END IF;

  SELECT c.id, c.parameter_catalog_snapshot INTO v_cycle
  FROM public.audit_cycles c
  WHERE c.id = p_cycle_id
    AND c.frameworks @> ARRAY['CARRE']::text[]
    AND c.participant_scoring_open;

  IF v_cycle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cycle_not_open');
  END IF;

  -- The frozen snapshot is the parameter contract, not the live catalog.
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_cycle.parameter_catalog_snapshot -> 'parameters', '[]'::jsonb)) e
    WHERE e ->> 'code' = p_parameter_code
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'bad_parameter');
  END IF;

  -- Classroom Practice only: you may score the person whose sessions you sat in.
  IF v_cycle.parameter_catalog_snapshot ->> 'catalog' = 'CLASSROOM_PRACTICE' THEN
    IF NOT COALESCE(public.fn_carre_learner_in_owner_roster(
             v_uid,
             (v_cycle.parameter_catalog_snapshot ->> 'teacher_profile_id')::uuid), false) THEN
      RETURN jsonb_build_object('success', false, 'reason', 'not_in_teacher_roster');
    END IF;
  END IF;

  INSERT INTO public.carre_participant_scores
    (cycle_id, parameter_code, lane, score, evidence_note, scorer_id)
  VALUES (p_cycle_id, p_parameter_code, p_lane, p_score, NULLIF(trim(p_note), ''), v_uid)
  ON CONFLICT (cycle_id, parameter_code, scorer_id) DO UPDATE
    SET score = EXCLUDED.score,
        lane = EXCLUDED.lane,
        evidence_note = EXCLUDED.evidence_note,
        updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Anon lock: CREATE OR REPLACE re-arms Supabase's default anon grant — re-assert.
REVOKE EXECUTE ON FUNCTION public.fn_carre_participant_score(uuid, text, int, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_participant_score(uuid, text, int, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. REPLACE fn_carre_participant_context
--
--    Changed vs 20260725114500:
--      (a) returns 'catalog' and 'teacher_name' so the sealed door can say
--          whose sessions it is asking about;
--      (b) the same roster gate as the write path — a learner outside the
--          roster is told so EXPLICITLY instead of being shown a sheet they
--          cannot submit (rule #27: never a dead end without a reason).
--    It already served any CARRE-framework cycle's snapshot, so CP cycles need
--    no other change.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_carre_participant_context(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_cycle   record;
  v_catalog text;
  v_owner   uuid;
  v_owner_name text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  -- Mirror of fn_carre_participant_score: the sealed lane is for learners.
  IF COALESCE(get_current_user_role(), '') NOT IN ('student', 'learner') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'learners_only');
  END IF;

  SELECT c.id, c.name, c.description, c.phase, c.participant_scoring_open,
         c.parameter_catalog_snapshot
    INTO v_cycle
  FROM public.audit_cycles c
  WHERE c.id = p_cycle_id
    AND c.frameworks @> ARRAY['CARRE']::text[];

  IF v_cycle.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;

  IF NOT v_cycle.participant_scoring_open THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cycle_not_open');
  END IF;

  v_catalog := v_cycle.parameter_catalog_snapshot ->> 'catalog';

  IF v_catalog = 'CLASSROOM_PRACTICE' THEN
    v_owner := (v_cycle.parameter_catalog_snapshot ->> 'teacher_profile_id')::uuid;

    IF NOT COALESCE(public.fn_carre_learner_in_owner_roster(v_uid, v_owner), false) THEN
      RETURN jsonb_build_object('success', false, 'reason', 'not_in_teacher_roster');
    END IF;

    SELECT p.full_name INTO v_owner_name
    FROM public.profiles p WHERE p.id = v_owner;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cycle', jsonb_build_object(
      'id', v_cycle.id,
      'name', v_cycle.name,
      'audience', v_cycle.description,
      'phase', v_cycle.phase
    ),
    'catalog', v_catalog,
    'teacher_name', v_owner_name,
    'setting_code', v_cycle.parameter_catalog_snapshot ->> 'setting_code',
    'parameters', COALESCE(v_cycle.parameter_catalog_snapshot -> 'parameters', '[]'::jsonb),
    'my_scores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'parameter_code', s.parameter_code,
               'lane', s.lane,
               'score', s.score,
               'evidence_note', s.evidence_note))
      FROM public.carre_participant_scores s
      WHERE s.cycle_id = p_cycle_id AND s.scorer_id = v_uid
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_participant_context(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_participant_context(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. REPLACE fn_carre_participant_rollup
--
--    Changed vs 20260725101500: a SECOND admission path, for the owner of a
--    Classroom Practice cycle. The leadership path and the k>=3 floor are
--    byte-for-byte the same clause as before.
--
--    The owner path admits ONLY when all three ratified gates are satisfied:
--      · the cycle is Classroom Practice, and the caller is its lead auditor;
--      · the learner window is CLOSED (batch reveal — no live medians);
--      · the owner has scored every item themselves (self-score before
--        compare — otherwise the medians are an answer key).
--    Enforced HERE rather than in the UI so a hand-made REST call obeys them
--    too. Aggregates only: no notes, no identities, no per-scorer rows.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_carre_participant_rollup(p_cycle_id uuid)
RETURNS TABLE (parameter_code text, lane text, scorers int, median_score numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_cycle      record;
  v_is_leader  boolean;
  v_owner_ok   boolean := false;
  v_item_count int;
  v_self_count int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- Mirror of fn_carre_module_coverage's leadership gate (unchanged).
  v_is_leader := COALESCE(is_super_admin(), false)
              OR COALESCE(is_admin(), false)
              OR COALESCE(user_has_permission('audit.cycle.view'), false);

  IF NOT v_is_leader THEN
    SELECT c.lead_auditor_id, c.participant_scoring_open, c.parameter_catalog_snapshot
      INTO v_cycle
    FROM public.audit_cycles c
    WHERE c.id = p_cycle_id
      AND c.frameworks @> ARRAY['CARRE']::text[];

    IF v_cycle.lead_auditor_id = v_uid
       AND v_cycle.parameter_catalog_snapshot ->> 'catalog' = 'CLASSROOM_PRACTICE'
       AND COALESCE(v_cycle.participant_scoring_open, true) = false
    THEN
      v_item_count := jsonb_array_length(
        COALESCE(v_cycle.parameter_catalog_snapshot -> 'parameters', '[]'::jsonb));

      SELECT count(*)::int INTO v_self_count
      FROM public.care_audit_scores s
      WHERE s.cycle_id = p_cycle_id
        AND s.scorer_role = 'owner'
        AND s.scorer_id = v_uid;

      v_owner_ok := v_item_count > 0 AND v_self_count >= v_item_count;
    END IF;

    IF NOT v_owner_ok THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT s.parameter_code,
         s.lane,
         count(*)::int,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY s.score)::numeric
  FROM public.carre_participant_scores s
  WHERE s.cycle_id = p_cycle_id
  GROUP BY s.parameter_code, s.lane
  HAVING count(*) >= 3          -- the k-floor: below 3 scorers, NOTHING returns
  ORDER BY s.parameter_code, s.lane;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_participant_rollup(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_participant_rollup(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_carre_participant_rollup IS
  'Sealed participant aggregates, k>=3 floored, identities never returned. Two admission paths: audit leadership (any CARRE cycle), or the owner of a Classroom Practice cycle once the learner window is CLOSED and they have self-scored every item (batch reveal + self-score-before-compare, enforced server-side).';

-- ----------------------------------------------------------------------------
-- 9. REPLACE fn_carre_get_audit — ADD ONE KEY: cycle.participant_scoring_open.
--
--    Purely additive to the payload; every existing key keeps its name, type
--    and meaning, so no current consumer changes behaviour. It is needed
--    because the owner sheet must distinguish "the window is still open"
--    (batch reveal not due yet) from "you have not self-scored" and from
--    "fewer than 3 voices" — three different locks that otherwise all look
--    identical to an empty rollup, which is exactly the silent dead end
--    rule #27 exists to prevent.
--
--    Body is the 20260705120000 definition verbatim apart from that one key.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_carre_get_audit(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cycle record;
  v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  SELECT c.*, p.full_name AS owner_name INTO v_cycle
  FROM public.audit_cycles c
  LEFT JOIN public.profiles p ON p.id = c.lead_auditor_id
  WHERE c.id = p_cycle_id AND c.frameworks @> ARRAY['CARRE']::text[];

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;

  v_allowed := v_cycle.lead_auditor_id = auth.uid()
    OR v_cycle.created_by = auth.uid()
    OR is_super_admin() OR is_admin()
    OR user_has_permission('audit.cycle.view');

  IF NOT v_allowed THEN
    RETURN jsonb_build_object('success', false, 'reason', 'forbidden');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_owner', v_cycle.lead_auditor_id = auth.uid(),
    'cycle', jsonb_build_object(
      'id', v_cycle.id,
      'name', v_cycle.name,
      'audience', v_cycle.description,
      'phase', v_cycle.phase,
      'start_date', v_cycle.start_date,
      're_audit_date', v_cycle.end_date,
      'owner_id', v_cycle.lead_auditor_id,
      'owner_name', v_cycle.owner_name,
      'created_at', v_cycle.created_at,
      'participant_scoring_open', COALESCE(v_cycle.participant_scoring_open, false)
    ),
    'snapshot', v_cycle.parameter_catalog_snapshot,
    'scores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'parameter_code', s.parameter_code,
        'scorer_role', s.scorer_role,
        'scorer_id', s.scorer_id,
        'score', s.score,
        'evidence_note', s.evidence_note,
        'updated_at', s.updated_at
      ) ORDER BY s.parameter_code)
      FROM public.care_audit_scores s WHERE s.cycle_id = p_cycle_id
    ), '[]'::jsonb),
    'invite', (
      SELECT jsonb_build_object(
        'token', i.token,
        'invited_email', i.invited_email,
        'expires_at', i.expires_at,
        'accepted_by', i.accepted_by
      )
      FROM public.care_scorer_invites i
      WHERE i.cycle_id = p_cycle_id AND i.expires_at > now()
      ORDER BY i.created_at DESC
      LIMIT 1
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_get_audit(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_get_audit(uuid) TO authenticated, service_role;

-- PostgREST schema-cache reload (new functions invisible to REST until this).
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ASSERTS — Classroom Practice (L3)
-- ============================================================================
-- Everything above this line is the migration itself. Everything below seeds
-- hermetic fixtures, exercises every gate, and reports one row per assertion.
-- There is NO COMMIT anywhere in this file: the coordinator's rolled-back
-- Mgmt-API session discards the catalog seed, the cycles and the scores.
--
-- Identity simulation is the pattern already proven in this project
-- (.claude/battery-lane-d.sql): set request.jwt.claims + SET LOCAL role, call
-- the function, RESET ROLE.
--
-- The roster assertions need a REAL (learner, owner) pair that already shares a
-- session_feedback row. If prod has none, those rows report SKIP rather than
-- FAIL — a skip is a data condition, not a defect, and must not be read as a
-- pass either.
-- ============================================================================

CREATE TEMP TABLE _r (test text, pass boolean, detail text);

DO $do$
DECLARE
  v_lead     uuid;   -- leadership identity
  v_owner    uuid;   -- team member whose practice is audited
  v_owner2   uuid;   -- a DIFFERENT team member (isolation check)
  v_learner  uuid;   -- learner profile IN the owner's roster
  v_outsider uuid;   -- learner profile NOT in the owner's roster
  v_cycle    uuid;
  v_snap     jsonb;
  v_codes    text[];
  v          jsonb;
  n          int;
  i          int;
  s1 uuid := gen_random_uuid();
  s2 uuid := gen_random_uuid();
  v_anon_locked boolean;
  v_have_roster boolean := false;
BEGIN
  -- ── preflight ───────────────────────────────────────────────────────────
  SELECT id INTO v_lead FROM profiles WHERE email = 'test.superadmin@jkkn.ac.in';
  IF v_lead IS NULL THEN
    RAISE EXCEPTION 'battery preflight: test.superadmin@jkkn.ac.in missing';
  END IF;

  -- A real learner/owner pair that already shares session feedback.
  SELECT lp.profile_id, tp.id
    INTO v_learner, v_owner
  FROM session_feedback sf
  JOIN learners_profiles lp ON lp.id = sf.student_id
  JOIN profiles lpp        ON lpp.id = lp.profile_id
                          AND COALESCE(lpp.role,'') IN ('student','learner')
  JOIN profiles tp         ON lower(tp.email) = lower(sf.faculty_email)
  WHERE sf.faculty_email IS NOT NULL
    AND COALESCE(tp.role,'') NOT IN ('', 'student', 'learner')
  LIMIT 1;

  v_have_roster := v_learner IS NOT NULL AND v_owner IS NOT NULL;

  IF NOT v_have_roster THEN
    -- Fall back to any team member so the non-roster assertions still run.
    SELECT id INTO v_owner FROM profiles
     WHERE COALESCE(role,'') NOT IN ('', 'student', 'learner') LIMIT 1;
  END IF;

  -- A DIFFERENT team member who is NOT leadership. Excluding the admin roles
  -- matters: a super admin passes the rollup's leadership gate legitimately, so
  -- picking one would make the isolation assert below fail for the wrong reason.
  SELECT id INTO v_owner2 FROM profiles
   WHERE COALESCE(role,'') NOT IN ('', 'student', 'learner',
                                   'super_admin', 'admin', 'administrator')
     AND COALESCE(is_super_admin, false) = false
     AND id <> v_owner LIMIT 1;

  -- A learner with NO session feedback attributable to v_owner.
  SELECT p.id INTO v_outsider
  FROM profiles p
  WHERE COALESCE(p.role,'') IN ('student','learner')
    AND p.id IS DISTINCT FROM v_learner
    AND NOT EXISTS (
      SELECT 1 FROM session_feedback sf
      JOIN learners_profiles lp ON lp.id = sf.student_id
      WHERE lp.profile_id = p.id
        AND sf.faculty_email IS NOT NULL
        AND lower(sf.faculty_email) = lower((SELECT email FROM profiles WHERE id = v_owner)))
  LIMIT 1;

  -- ── a1: the catalog seeded exactly 13 CP items ──────────────────────────
  SELECT count(*)::int INTO n FROM audit_parameter_catalog
   WHERE code LIKE 'CP-%' AND is_system AND is_active;
  INSERT INTO _r VALUES ('a1_catalog_is_13', n = 13, format('rows=%s', n));

  INSERT INTO _r VALUES ('a2_pillar_spread',
    (SELECT count(*) FILTER (WHERE parameter_group = 1) = 3
        AND count(*) FILTER (WHERE parameter_group = 2) = 3
        AND count(*) FILTER (WHERE parameter_group = 3) = 0
        AND count(*) FILTER (WHERE parameter_group = 4) = 5
        AND count(*) FILTER (WHERE parameter_group = 5) = 2
       FROM audit_parameter_catalog WHERE code LIKE 'CP-%'),
    'C=3 A=3 R=0 RS=5 E=2');

  -- ── a3: happy-path create, as the owner themselves ──────────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v := fn_carre_create_classroom_audit('[BATTERY] Classroom Practice self-open');
  EXECUTE 'RESET ROLE';
  v_cycle := (v ->> 'cycle_id')::uuid;
  INSERT INTO _r VALUES ('a3_create_self', (v ->> 'success')::boolean IS TRUE, v::text);

  SELECT parameter_catalog_snapshot INTO v_snap FROM audit_cycles WHERE id = v_cycle;
  INSERT INTO _r VALUES ('a4_snapshot_shape',
    v_snap ->> 'catalog' = 'CLASSROOM_PRACTICE'
      AND v_snap ->> 'framework' = 'CARRE'
      AND v_snap ->> 'version' = '1.0'
      AND v_snap ->> 'setting_code' = 'ACAD'
      AND (v_snap ->> 'teacher_profile_id')::uuid = v_owner
      AND jsonb_array_length(v_snap -> 'parameters') = 13
      AND (SELECT module_key = 'classroom-practice' AND participant_scoring_open
             FROM audit_cycles WHERE id = v_cycle),
    format('catalog=%s params=%s module_key=%s',
           v_snap ->> 'catalog', jsonb_array_length(v_snap -> 'parameters'),
           (SELECT module_key FROM audit_cycles WHERE id = v_cycle)));

  -- ── a5: a peer cannot open a cycle on another team member ───────────────
  IF v_owner2 IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role','authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
    v := fn_carre_create_classroom_audit('[BATTERY] on someone else', v_owner2);
    EXECUTE 'RESET ROLE';
    INSERT INTO _r VALUES ('a5_peer_cannot_open_for_other',
      v ->> 'reason' = 'not_allowed_for_other_teacher', v::text);
  ELSE
    INSERT INTO _r VALUES ('a5_peer_cannot_open_for_other', NULL, 'SKIP: no second team member');
  END IF;

  -- ── a6: a learner target is refused even for leadership ─────────────────
  IF v_outsider IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_lead, 'role','authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
    v := fn_carre_create_classroom_audit('[BATTERY] on a learner', v_outsider);
    EXECUTE 'RESET ROLE';
    INSERT INTO _r VALUES ('a6_teacher_not_staff', v ->> 'reason' = 'teacher_not_staff', v::text);
  ELSE
    INSERT INTO _r VALUES ('a6_teacher_not_staff', NULL, 'SKIP: no learner profile found');
  END IF;

  -- ── a7: roster gate — in-roster learner may score, outsider may not ─────
  IF v_have_roster THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_learner, 'role','authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
    v := fn_carre_participant_score(v_cycle, 'CP-RS3', 4);
    EXECUTE 'RESET ROLE';
    INSERT INTO _r VALUES ('a7_in_roster_can_score', (v ->> 'success')::boolean IS TRUE, v::text);

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_learner, 'role','authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
    v := fn_carre_participant_context(v_cycle);
    EXECUTE 'RESET ROLE';
    INSERT INTO _r VALUES ('a8_context_in_roster',
      (v ->> 'success')::boolean IS TRUE
        AND v ->> 'catalog' = 'CLASSROOM_PRACTICE'
        AND v ->> 'teacher_name' IS NOT NULL
        AND jsonb_array_length(v -> 'parameters') = 13,
      format('catalog=%s name=%s', v ->> 'catalog', v ->> 'teacher_name'));
  ELSE
    INSERT INTO _r VALUES ('a7_in_roster_can_score', NULL,
      'SKIP: no (learner, owner) pair shares a session_feedback row in prod');
    INSERT INTO _r VALUES ('a8_context_in_roster', NULL, 'SKIP: same as a7');
  END IF;

  IF v_outsider IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_outsider, 'role','authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
    v := fn_carre_participant_score(v_cycle, 'CP-RS3', 0);
    EXECUTE 'RESET ROLE';
    INSERT INTO _r VALUES ('a9_outsider_denied', v ->> 'reason' = 'not_in_teacher_roster', v::text);

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_outsider, 'role','authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
    v := fn_carre_participant_context(v_cycle);
    EXECUTE 'RESET ROLE';
    INSERT INTO _r VALUES ('a10_outsider_context_denied',
      v ->> 'reason' = 'not_in_teacher_roster', v::text);
  ELSE
    INSERT INTO _r VALUES ('a9_outsider_denied', NULL, 'SKIP: no outsider learner found');
    INSERT INTO _r VALUES ('a10_outsider_context_denied', NULL, 'SKIP: same as a9');
  END IF;

  -- ── a11: parameter validation is SNAPSHOT membership, not catalog prefix ─
  IF v_have_roster THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_learner, 'role','authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
    v := fn_carre_participant_score(v_cycle, 'CARRE-C1', 3);
    EXECUTE 'RESET ROLE';
    INSERT INTO _r VALUES ('a11_off_snapshot_param_denied', v ->> 'reason' = 'bad_parameter', v::text);
  ELSE
    INSERT INTO _r VALUES ('a11_off_snapshot_param_denied', NULL, 'SKIP: needs a roster learner');
  END IF;

  -- Synthetic sealed scorers so CP-RS3 reaches k=3 and CP-C1 stays at 2.
  INSERT INTO carre_participant_scores (cycle_id, parameter_code, lane, score, scorer_id)
  VALUES (v_cycle, 'CP-RS3', 'own', 2, s1),
         (v_cycle, 'CP-RS3', 'own', 1, s2),
         (v_cycle, 'CP-C1',  'own', 2, s1),
         (v_cycle, 'CP-C1',  'own', 3, s2);
  IF NOT v_have_roster THEN
    -- No real learner scored, so add a third synthetic voice on CP-RS3 only.
    INSERT INTO carre_participant_scores (cycle_id, parameter_code, lane, score, scorer_id)
    VALUES (v_cycle, 'CP-RS3', 'own', 3, gen_random_uuid());
  END IF;

  -- ── a12: BATCH REVEAL — owner sees nothing while the window is open ─────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO n FROM fn_carre_participant_rollup(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('a12_owner_blocked_while_open', n = 0, format('rows=%s', n));

  -- ── a13: closing the window is still not enough without self-scores ─────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v := fn_carre_set_participant_window(v_cycle, false);
  SELECT count(*) INTO n FROM fn_carre_participant_rollup(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('a13_close_window_ok', (v ->> 'success')::boolean IS TRUE, v::text);
  INSERT INTO _r VALUES ('a14_owner_blocked_without_self_score', n = 0, format('rows=%s', n));

  -- ── a15: 12 of 13 self-scores is still short ───────────────────────────
  SELECT array_agg(e ->> 'code') INTO v_codes
  FROM jsonb_array_elements(v_snap -> 'parameters') e;
  FOR i IN 1..12 LOOP
    INSERT INTO care_audit_scores (cycle_id, parameter_code, scorer_id, scorer_role, score)
    VALUES (v_cycle, v_codes[i], v_owner, 'owner', 3);
  END LOOP;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO n FROM fn_carre_participant_rollup(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('a15_owner_blocked_at_12_of_13', n = 0, format('rows=%s', n));

  -- ── a16: the 13th self-score releases the reveal; k-floor still holds ───
  INSERT INTO care_audit_scores (cycle_id, parameter_code, scorer_id, scorer_role, score)
  VALUES (v_cycle, v_codes[13], v_owner, 'owner', 3);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO n FROM fn_carre_participant_rollup(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('a16_owner_unlocked_after_13', n = 1,
    format('rows=%s (expect 1 — CP-RS3 only; CP-C1 has 2 scorers)', n));

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO n FROM fn_carre_participant_rollup(v_cycle)
   WHERE parameter_code = 'CP-C1';
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('a17_k_floor_holds', n = 0, format('CP-C1 rows=%s (expect 0)', n));

  -- ── a18: a non-owner, non-leadership identity never sees this rollup ───
  -- Uses a stranger uuid so the assert cannot be weakened by whatever
  -- permissions a real second profile happens to hold in prod.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO n FROM fn_carre_participant_rollup(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('a18_non_owner_sees_nothing', n = 0, format('rows=%s', n));

  -- And a real, non-leadership team member is equally shut out.
  IF v_owner2 IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner2, 'role','authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
    SELECT count(*) INTO n FROM fn_carre_participant_rollup(v_cycle);
    EXECUTE 'RESET ROLE';
    INSERT INTO _r VALUES ('a18b_other_member_sees_nothing', n = 0, format('rows=%s', n));
  ELSE
    INSERT INTO _r VALUES ('a18b_other_member_sees_nothing', NULL,
      'SKIP: no non-leadership second team member in prod');
  END IF;

  -- ── a19: the leadership path is unchanged ──────────────────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_lead, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO n FROM fn_carre_participant_rollup(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('a19_leadership_path_intact', n = 1, format('rows=%s', n));

  -- ── a20: a learner cannot move the window ──────────────────────────────
  IF v_outsider IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_outsider, 'role','authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
    v := fn_carre_set_participant_window(v_cycle, true);
    EXECUTE 'RESET ROLE';
    INSERT INTO _r VALUES ('a20_learner_cannot_move_window', v ->> 'reason' = 'not_owner', v::text);
  ELSE
    INSERT INTO _r VALUES ('a20_learner_cannot_move_window', NULL, 'SKIP: no learner profile');
  END IF;

  -- ── a21: fn_carre_get_audit now carries the window state ───────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v := fn_carre_get_audit(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('a21_get_audit_has_window_key',
    (v ->> 'success')::boolean IS TRUE
      AND (v -> 'cycle' ? 'participant_scoring_open')
      AND (v -> 'cycle' ->> 'participant_scoring_open')::boolean = false,
    format('participant_scoring_open=%s', v -> 'cycle' ->> 'participant_scoring_open'));

  -- ── a22: the picker refuses to enumerate the directory ─────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO n FROM fn_carre_search_teachers('%');
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('a22_picker_wildcard_neutralised', n = 0, format('rows=%s', n));

  -- ── a23: anon EXECUTE is locked on every function this migration touches ─
  BEGIN
    PERFORM set_config('role', 'anon', true);
    PERFORM fn_carre_participant_rollup(v_cycle);
    RAISE EXCEPTION 'ANON_NOT_LOCKED';
  EXCEPTION
    WHEN insufficient_privilege THEN v_anon_locked := true;
    WHEN raise_exception       THEN v_anon_locked := false;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('a23_anon_locked_rollup', v_anon_locked,
    CASE WHEN v_anon_locked THEN 'permission denied as expected'
         ELSE 'LEAK: anon executed the rollup' END);

  BEGIN
    PERFORM set_config('role', 'anon', true);
    PERFORM fn_carre_create_classroom_audit('[BATTERY] anon');
    RAISE EXCEPTION 'ANON_NOT_LOCKED';
  EXCEPTION
    WHEN insufficient_privilege THEN v_anon_locked := true;
    WHEN raise_exception       THEN v_anon_locked := false;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('a24_anon_locked_create', v_anon_locked,
    CASE WHEN v_anon_locked THEN 'permission denied as expected'
         ELSE 'LEAK: anon opened a cycle' END);

  BEGIN
    PERFORM set_config('role', 'anon', true);
    PERFORM fn_carre_search_teachers('ab');
    RAISE EXCEPTION 'ANON_NOT_LOCKED';
  EXCEPTION
    WHEN insufficient_privilege THEN v_anon_locked := true;
    WHEN raise_exception       THEN v_anon_locked := false;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('a25_anon_locked_picker', v_anon_locked,
    CASE WHEN v_anon_locked THEN 'permission denied as expected'
         ELSE 'LEAK: anon searched the directory' END);
END $do$;

-- Every catalog function must have anon revoked (belt-and-braces on the grants).
INSERT INTO _r
SELECT 'a26_no_anon_execute_grant_' || p.proname,
       NOT has_function_privilege('anon', p.oid, 'EXECUTE'),
       'anon EXECUTE must be false'
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('fn_carre_create_classroom_audit','fn_carre_set_participant_window',
                    'fn_carre_search_teachers','fn_carre_learner_in_owner_roster',
                    'fn_carre_participant_score','fn_carre_participant_context',
                    'fn_carre_participant_rollup','fn_carre_get_audit');

SELECT test,
       CASE WHEN pass IS NULL THEN 'SKIP' WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result,
       detail
FROM _r ORDER BY test;

SELECT count(*) FILTER (WHERE pass)            AS passed,
       count(*) FILTER (WHERE pass IS FALSE)   AS failed,
       count(*) FILTER (WHERE pass IS NULL)    AS skipped,
       count(*)                                AS total
FROM _r;

-- NO COMMIT — the coordinator's rolled-back session discards everything above.

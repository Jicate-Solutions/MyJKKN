-- ============================================================================
-- battery-classroom-practice-hardening.sql
-- ============================================================================
-- Rolled-back rehearsal for supabase/migrations/20260730020000_classroom_practice_compare_hardening.sql
-- Run the WHOLE file in one Mgmt-API call. Opens a transaction, NEVER commits.
--
-- ASSUMES ALREADY APPLIED: 20260729190000_classroom_practice_catalog_and_compare
-- (the base migration — deliberately NOT inlined, it is live on prod) and
-- 20260729184500_classroom_practice_l2_micro (carre_micro_impressions).
-- ============================================================================
BEGIN;

-- ============================================================================
-- Classroom Practice — compare hardening
-- 2026-07-30 · Follow-up to 20260729190000_classroom_practice_catalog_and_compare
--
-- That migration is APPLIED. It is never edited; every fix below lands here as
-- a CREATE OR REPLACE of the same signature, with the anon lock re-asserted on
-- each (CREATE OR REPLACE re-arms Supabase's default anon EXECUTE grant).
--
-- Findings from the deep review on PR #2586:
--
--  1. HIGH — the k-floor counted IMPRESSIONS, not LEARNERS. One learner
--     answering the same item across three sessions unsealed a median that is
--     entirely their own voice. That is the exact harm the floor exists to
--     prevent: below three PEOPLE, an individual can be identified by
--     elimination, and worse, a single person's view was being reported to
--     their own assessor as if it were the class's. Now both the floor and the
--     median are per-LEARNER.
--
--  2. MEDIUM — the audit.cycle.view branch of the compare was tenant-blind: a
--     permission holder in another institution could read a cycle's medians.
--     Cross-institution reading is now a super-admin/admin act only.
--
--  3. MEDIUM — opening a cycle on someone ELSE was tenant-blind for
--     audit.cycle.manage holders. Same treatment.
--
--  4. LOW — the self-score gate counted ROWS. care_audit_scores legitimately
--     holds several rows per (cycle, parameter) because the CARE/CARRE
--     second-scorer flow stores participant rows alongside owner rows, so a
--     plain count could reach the item count without the owner having scored
--     every item. Counting DISTINCT parameter_code restricted to the frozen
--     snapshot is the right-sized fix. A UNIQUE constraint is deliberately NOT
--     added: it would break those shared flows.
--
--  5. LOW — the window opened at start_date::midnight, which admits
--     impressions offered earlier on the creation day, before the cycle
--     existed. The creation instant is now frozen into the snapshot and used
--     as the boundary.
--
--  6. LOW — the picker's sessions_90d counted across every institution.
--
--  7. Found by the 2026-07-30 prod rehearsal (SQLSTATE 23503), not by review:
--     audit_cycles.lead_auditor_id and created_by reference auth.users(id), but
--     public.profiles contains rows with NO matching auth.users row. Opening a
--     cycle on such a person raised a raw foreign-key error instead of a clean
--     denial — a rule #27 violation that a HOD would have hit through the
--     picker, which happily returned those profiles. Both ends are fixed: the
--     picker no longer offers a person who cannot own a cycle, and the create
--     RPC refuses one with a named reason if it is passed anyway.
--     Self-open is unaffected either way: auth.uid() always has an auth row.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. fn_carre_create_classroom_audit — tenant scope on open-for-other (#3),
--    plus the frozen creation instant the compare now reads (#5).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_carre_create_classroom_audit(
  p_name          text,
  p_teacher_id    uuid DEFAULT NULL,
  p_re_audit_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid              uuid := auth.uid();
  v_caller_role      text;
  v_caller_inst      uuid;
  v_cross            boolean;
  v_owner            uuid;
  v_owner_role       text;
  v_institution      uuid;
  v_re_audit         date;
  v_owner_email      text;
  v_params           jsonb;
  v_cycle_id         uuid;
  v_created_at       timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  -- Caller must be a team member. 'student' is an existing DB role value, kept
  -- verbatim alongside 'learner' exactly as the sealed lane checks it.
  SELECT p.role, p.institution_id INTO v_caller_role, v_caller_inst
  FROM public.profiles p WHERE p.id = v_uid;

  IF COALESCE(v_caller_role, '') = '' OR v_caller_role IN ('student', 'learner') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'staff_only',
      'detail', 'Classroom Practice cycles are opened by team members.');
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) < 4 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_name');
  END IF;

  v_owner := COALESCE(p_teacher_id, v_uid);
  v_cross := COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false);

  SELECT p.role, p.institution_id, lower(nullif(trim(p.email), ''))
    INTO v_owner_role, v_institution, v_owner_email
  FROM public.profiles p WHERE p.id = v_owner;

  -- Opening a cycle on someone else is a leadership act, and for anyone short
  -- of super-admin/admin it is a leadership act WITHIN THEIR OWN INSTITUTION.
  -- An audit.cycle.manage holder must not be able to open an audit on a person
  -- in another institution. NULL institutions on either side cannot establish
  -- tenancy, so they read as "no" rather than falling through.
  IF v_owner <> v_uid THEN
    IF NOT v_cross THEN
      IF NOT COALESCE(user_has_permission('audit.cycle.manage'), false) THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_allowed_for_other_teacher',
          'detail', 'Only audit leadership can open a Classroom Practice cycle on someone else.');
      END IF;
      IF v_caller_inst IS NULL OR v_institution IS NULL OR v_caller_inst <> v_institution THEN
        RETURN jsonb_build_object('success', false, 'reason', 'cross_institution_not_allowed',
          'detail', 'You can only open a Classroom Practice cycle on a team member in your own institution.');
      END IF;
    END IF;
  END IF;

  IF v_owner_role IS NULL OR v_owner_role IN ('student', 'learner') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'teacher_not_staff',
      'detail', 'A Classroom Practice cycle can only be opened on a team member.');
  END IF;

  -- lead_auditor_id and created_by both reference auth.users. A profiles row
  -- without a login cannot own a cycle, and without this guard the INSERT below
  -- raises a bare 23503 instead of something a human can act on.
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_owner) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'teacher_no_login_account',
      'detail', 'This team member has no login account yet, so a cycle cannot be owned by them. Ask IT to complete their account first.');
  END IF;

  -- The drip attributes every learner answer by email. Without one, no voice
  -- could ever reach this cycle, so refuse at creation rather than shipping a
  -- container that can only ever stay empty.
  IF v_owner_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'teacher_email_missing',
      'detail', 'This team member has no email on their profile, so learner answers could never be attributed to them.');
  END IF;

  -- Semester end is not knowable from here, so the default re-audit horizon is
  -- +120 days (roughly one teaching term). The caller can always override it.
  v_re_audit := COALESCE(p_re_audit_date, CURRENT_DATE + 120);
  IF v_re_audit < CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_re_audit_date',
      'detail', 'Re-audit date must be today or later.');
  END IF;

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
     false,          -- learner input is the SCF drip, never the sealed lane
     jsonb_build_object(
       'frozen_at', v_created_at,
       -- Same instant as frozen_at, under the name the compare reads. It is the
       -- window's lower bound: an impression offered earlier on the creation
       -- DAY predates the cycle and must not count toward it.
       'created_at', v_created_at,
       'framework', 'CARRE',
       'catalog', 'CLASSROOM_PRACTICE',
       'version', '1.0',
       'setting_code', 'ACAD',
       'teacher_profile_id', v_owner,
       'teacher_email', v_owner_email,   -- frozen: the drip's attribution key
       'parameters', v_params
     ),
     v_uid)
  RETURNING id INTO v_cycle_id;

  RETURN jsonb_build_object('success', true, 'cycle_id', v_cycle_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_create_classroom_audit(text, uuid, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_create_classroom_audit(text, uuid, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_carre_create_classroom_audit IS
  'Classroom Practice: opens a 13-item CP cycle owned by one team member. Self-open is open to any team member. Opening on someone ELSE requires audit.cycle.manage AND the same institution, or super-admin/admin for cross-institution. Freezes catalog=CLASSROOM_PRACTICE, teacher_profile_id, teacher_email (lower-cased) and created_at (the window''s lower bound) into parameter_catalog_snapshot; sets module_key=classroom-practice and participant_scoring_open=false — learner input arrives through the SCF drip.';

-- ----------------------------------------------------------------------------
-- 2. fn_carre_search_teachers — sessions_90d scoped to the candidate's own
--    institution (#6). The picker exists to answer "can this person's learners
--    be asked about them here", which is an in-institution question.
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
             AND sf.attendance_date >= CURRENT_DATE - 90
             -- Tenant-scoped: a candidate's exhaust is counted within their own
             -- institution, never summed across the estate.
             AND sf.institution_id IS NOT DISTINCT FROM p.institution_id)
  FROM public.profiles p
  WHERE COALESCE(p.role, '') NOT IN ('', 'student', 'learner')
    AND (p.full_name ILIKE '%' || v_q || '%' ESCAPE '\'
         OR p.email  ILIKE '%' || v_q || '%' ESCAPE '\')
    AND (v_cross OR p.institution_id = v_institution)
    -- Only people who can actually OWN a cycle: lead_auditor_id references
    -- auth.users, so a profiles row with no login is not a valid choice and
    -- must not be offered (prod rehearsal 2026-07-30, SQLSTATE 23503).
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  ORDER BY p.full_name
  LIMIT 10;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_search_teachers(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_search_teachers(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_carre_search_teachers IS
  'Team-member picker for the Classroom Practice form. Returns profiles.id (NOT staff.id — audit_cycles.lead_auditor_id references auth.users). Institution-scoped unless super admin/admin; min 2-char query; max 10 rows. sessions_90d counts the candidate''s session-feedback exhaust WITHIN THEIR OWN INSTITUTION — never summed across the estate. Only profiles with an auth.users row are returned: lead_auditor_id references auth.users, so a login-less profile cannot own a cycle and must not be offerable.';

-- ----------------------------------------------------------------------------
-- 3. fn_classroom_practice_compare — the HIGH plus three of the LOWs.
--
--    AGGREGATION CONTRACT (the review's headline finding):
--      · one learner contributes exactly ONE value per item — their LATEST
--        answered score (answered_at desc, offered_at desc as tiebreak);
--      · voices = count of DISTINCT LEARNERS, not impressions;
--      · the median is taken across those per-learner values, so a prolific
--        learner cannot outweigh a quiet one;
--      · k >= 3 is applied to the distinct-learner count. Three answers from
--        one person stay sealed — that is the whole point of the floor.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_classroom_practice_compare(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '8s'
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_cycle       record;
  v_owner_email text;
  v_caller_inst uuid;
  v_cross       boolean;
  v_item_count  int;
  v_self_count  int;
  v_cutoff      timestamptz := date_trunc('week', now());
  v_start       timestamptz;
  v_items       jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('locked', true, 'reason', 'not_authenticated');
  END IF;

  SELECT c.id, c.lead_auditor_id, c.start_date, c.institution_ids,
         c.parameter_catalog_snapshot
    INTO v_cycle
  FROM public.audit_cycles c
  WHERE c.id = p_cycle_id
    AND c.frameworks @> ARRAY['CARRE']::text[]
    AND c.parameter_catalog_snapshot ->> 'catalog' = 'CLASSROOM_PRACTICE';

  IF v_cycle.id IS NULL THEN
    RETURN jsonb_build_object('locked', true, 'reason', 'not_found');
  END IF;

  v_cross := COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false);

  -- Admission: the cycle's own owner, or super-admin/admin (cross-institution),
  -- or an audit.cycle.view holder WITHIN THE CYCLE'S INSTITUTION. A permission
  -- key is not a passport across tenants. NULL on either side cannot establish
  -- tenancy, so it reads as "no" rather than falling through the check.
  IF v_cycle.lead_auditor_id <> v_uid AND NOT v_cross THEN
    IF NOT COALESCE(user_has_permission('audit.cycle.view'), false) THEN
      RETURN jsonb_build_object('locked', true, 'reason', 'forbidden');
    END IF;

    SELECT p.institution_id INTO v_caller_inst
    FROM public.profiles p WHERE p.id = v_uid;

    IF v_caller_inst IS NULL
       OR v_cycle.institution_ids IS NULL
       OR NOT (v_caller_inst = ANY (v_cycle.institution_ids)) THEN
      RETURN jsonb_build_object('locked', true, 'reason', 'forbidden');
    END IF;
  END IF;

  -- Frozen at creation, so a later profile-email change cannot re-point a
  -- running cycle at someone else's voices. Already lower-cased when frozen.
  v_owner_email := v_cycle.parameter_catalog_snapshot ->> 'teacher_email';

  -- The window opens at the creation INSTANT, not at midnight of the creation
  -- day: impressions offered earlier that day predate the cycle. COALESCE keeps
  -- cycles created before this key existed working.
  v_start := COALESCE(
    (v_cycle.parameter_catalog_snapshot ->> 'created_at')::timestamptz,
    v_cycle.start_date::timestamptz);

  v_item_count := jsonb_array_length(
    COALESCE(v_cycle.parameter_catalog_snapshot -> 'parameters', '[]'::jsonb));

  -- DISTINCT parameter_code, and only codes actually in the frozen snapshot.
  -- care_audit_scores holds several rows per (cycle, parameter) by design — the
  -- CARE/CARRE second-scorer flow stores participant rows beside owner rows —
  -- so a plain count(*) could reach the item count without every item being
  -- self-scored. A UNIQUE constraint would be the wrong fix: it would break
  -- those shared flows.
  SELECT count(DISTINCT s.parameter_code)::int INTO v_self_count
  FROM public.care_audit_scores s
  WHERE s.cycle_id = p_cycle_id
    AND s.scorer_role = 'owner'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_cycle.parameter_catalog_snapshot -> 'parameters') e
      WHERE e ->> 'code' = s.parameter_code);

  -- GATE 1 — self-score first.
  IF v_item_count = 0 OR v_self_count < v_item_count THEN
    RETURN jsonb_build_object(
      'locked', true,
      'reason', 'self_score_incomplete',
      'item_count', v_item_count,
      'self_scored', v_self_count);
  END IF;

  -- GATES 2 and 3 — completed weeks only, and k >= 3 DISTINCT LEARNERS.
  WITH params AS (
    SELECT e ->> 'code' AS code, ord
    FROM jsonb_array_elements(v_cycle.parameter_catalog_snapshot -> 'parameters')
         WITH ORDINALITY AS t(e, ord)
  ),
  self AS (
    SELECT s.parameter_code, max(s.score) AS score
    FROM public.care_audit_scores s
    WHERE s.cycle_id = p_cycle_id AND s.scorer_role = 'owner'
    GROUP BY s.parameter_code
  ),
  -- One row per (item, learner): that learner's LATEST answered score.
  per_learner AS (
    SELECT DISTINCT ON (mi.parameter_code, mi.learner_id)
           mi.parameter_code, mi.learner_id, mi.score
    FROM public.carre_micro_impressions mi
    WHERE v_owner_email IS NOT NULL
      AND lower(mi.teacher_email) = v_owner_email
      AND mi.score IS NOT NULL          -- skips and unanswered offers never count
      AND mi.offered_at >= v_start      -- on or after the creation instant
      AND mi.offered_at <  v_cutoff     -- completed calendar weeks only
    ORDER BY mi.parameter_code, mi.learner_id,
             mi.answered_at DESC NULLS LAST, mi.offered_at DESC
  ),
  voice AS (
    SELECT pl.parameter_code,
           count(*)::int AS voices,     -- one row per learner => distinct learners
           percentile_cont(0.5) WITHIN GROUP (ORDER BY pl.score)::numeric AS med
    FROM per_learner pl
    GROUP BY pl.parameter_code
  )
  SELECT jsonb_agg(jsonb_build_object(
           'code', p.code,
           'self_score', s.score,
           'voices', COALESCE(v.voices, 0),
           'learner_median',
             CASE WHEN COALESCE(v.voices, 0) >= 3 THEN v.med ELSE NULL END
         ) ORDER BY p.ord)
    INTO v_items
  FROM params p
  LEFT JOIN self  s ON s.parameter_code = p.code
  LEFT JOIN voice v ON v.parameter_code = p.code;

  RETURN jsonb_build_object(
    'locked', false,
    'item_count', v_item_count,
    'self_scored', v_self_count,
    'week_cutoff', v_cutoff,
    'window_start', v_start,
    'items', COALESCE(v_items, '[]'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_classroom_practice_compare(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_classroom_practice_compare(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_classroom_practice_compare IS
  'Classroom Practice owner-side reveal: the owner''s own score beside the sealed learner median per item, read from carre_micro_impressions (the SCF drip). AGGREGATION: each learner contributes exactly ONE value per item — their LATEST answered score (answered_at desc, offered_at desc tiebreak); voices = count of DISTINCT LEARNERS; the median is taken across those per-learner values; k>=3 is applied to the distinct-learner count, so three answers from one person stay sealed. Window is [snapshot.created_at, date_trunc(week, now())) — completed calendar weeks only, opening at the creation instant. Admission: the cycle owner, or super-admin/admin, or an audit.cycle.view holder within the cycle''s own institution. Aggregates only — never an identity, a comment, or a single answer.';

-- PostgREST schema-cache reload (replaced signatures invisible to REST until this).
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ASSERTS — Classroom Practice compare hardening (review #2586)
-- ============================================================================
-- Everything above this line is the FOLLOW-UP migration. The base migration
-- 20260729190000 is already applied on prod, so it is deliberately NOT inlined.
--
-- No COMMIT anywhere: the coordinator's rolled-back session discards the cycle,
-- the self-scores and every synthetic impression. Every learner voice below is
-- synthetic (gen_random_uuid learner ids against the owner's own email).
--
-- FK DISCIPLINE (prod rehearsal 2026-07-30, SQLSTATE 23503): this battery
-- FABRICATES NO IDENTITIES — it selects real ones. audit_cycles.lead_auditor_id
-- and created_by reference auth.users(id), and public.profiles contains rows
-- with no matching auth.users row, so every actor that ends up as an owner or
-- as the JWT sub of a create call is now chosen WITH an auth.users row.
-- Nothing is inserted into auth.users: a SELECT filter is the smaller act, and
-- writing to Supabase's auth schema — even inside a rolled-back transaction —
-- is not something a rehearsal should do.
-- The synthetic learner ids stay synthetic: carre_micro_impressions.learner_id
-- carries NO foreign key (verified against the sibling's table definition).
--
-- Identity simulation is the pattern proven in .claude/battery-lane-d.sql.
-- Assertions that need a real audit.cycle.view holder PROBE for one and report
-- SKIP (not PASS) when prod has none in the needed tenancy.
-- ============================================================================

CREATE TEMP TABLE _r (test text, pass boolean, detail text);

DO $do$
DECLARE
  v_lead         uuid;
  v_owner        uuid;  v_owner_email text;  v_owner_inst uuid;
  v_other_inst   uuid;  v_other_member uuid;
  v_viewer_same  uuid;  v_viewer_cross uuid;
  v_learner      uuid;
  v_no_login     uuid;   -- a profiles row with no auth.users row
  v_no_login_q   text;   -- a search term that would match them
  v_cycle        uuid;
  v_snap         jsonb;
  v_codes        text[];
  v              jsonb;
  n              int;   i int;
  r              record;
  v_has          boolean;
  v_anon_locked  boolean;
  L1 uuid := gen_random_uuid();   -- synthetic learner ids
  L2 uuid := gen_random_uuid();
  L3 uuid := gen_random_uuid();
  v_last_week timestamptz := date_trunc('week', now()) - interval '2 days';
BEGIN
  IF to_regclass('public.carre_micro_impressions') IS NULL THEN
    RAISE EXCEPTION 'preflight: carre_micro_impressions missing — apply the L2 sibling migration first';
  END IF;
  SELECT id INTO v_lead FROM profiles WHERE email = 'test.superadmin@jkkn.ac.in';
  IF v_lead IS NULL THEN RAISE EXCEPTION 'preflight: test.superadmin@jkkn.ac.in missing'; END IF;

  SELECT p.id, lower(p.email), p.institution_id INTO v_owner, v_owner_email, v_owner_inst
  FROM profiles p
  WHERE COALESCE(p.role,'') NOT IN ('','student','learner','super_admin','admin','administrator')
    AND COALESCE(p.is_super_admin,false) = false
    AND p.email IS NOT NULL AND p.institution_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)   -- owns the cycle
  LIMIT 1;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'preflight: no non-leadership team member with email+institution+login';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_lead) THEN
    RAISE EXCEPTION 'preflight: test.superadmin has no auth.users row (it becomes created_by)';
  END IF;

  -- h03 actually INSERTS a cycle owned by this person, so they need a login too.
  SELECT p.id, p.institution_id INTO v_other_member, v_other_inst
  FROM profiles p
  WHERE COALESCE(p.role,'') NOT IN ('','student','learner','super_admin','admin','administrator')
    AND p.institution_id IS NOT NULL AND p.institution_id <> v_owner_inst
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  LIMIT 1;

  -- A team member WITHOUT a login: the exact prod shape that raised 23503.
  SELECT p.id, split_part(COALESCE(p.email, p.full_name, 'zzzz'), '@', 1)
    INTO v_no_login, v_no_login_q
  FROM profiles p
  WHERE COALESCE(p.role,'') NOT IN ('','student','learner')
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  LIMIT 1;

  SELECT id INTO v_learner FROM profiles WHERE COALESCE(role,'') IN ('student','learner') LIMIT 1;

  -- Probe for real audit.cycle.view holders, one per tenancy.
  FOR r IN
    SELECT p.id, p.institution_id FROM profiles p
    WHERE COALESCE(p.role,'') NOT IN ('','student','learner','super_admin','admin','administrator')
      AND COALESCE(p.is_super_admin,false) = false
    LIMIT 60
  LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', r.id, 'role','authenticated')::text, true);
    PERFORM set_config('role','authenticated', true);
    SELECT COALESCE(user_has_permission('audit.cycle.view'), false) INTO v_has;
    EXECUTE 'RESET ROLE';
    IF v_has THEN
      IF r.institution_id = v_owner_inst AND v_viewer_same IS NULL THEN v_viewer_same := r.id; END IF;
      IF r.institution_id IS DISTINCT FROM v_owner_inst AND r.institution_id IS NOT NULL
         AND v_viewer_cross IS NULL THEN v_viewer_cross := r.id; END IF;
    END IF;
    EXIT WHEN v_viewer_same IS NOT NULL AND v_viewer_cross IS NOT NULL;
  END LOOP;

  -- ── h01: creation freezes created_at (the window's lower bound) ──────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role','authenticated', true);
  v := fn_carre_create_classroom_audit('[HARDEN] Classroom Practice');
  EXECUTE 'RESET ROLE';
  v_cycle := (v ->> 'cycle_id')::uuid;
  SELECT parameter_catalog_snapshot INTO v_snap FROM audit_cycles WHERE id = v_cycle;
  INSERT INTO _r VALUES ('h01_snapshot_freezes_created_at',
    (v ->> 'success')::boolean IS TRUE
      AND v_snap ->> 'created_at' IS NOT NULL
      AND (v_snap ->> 'created_at')::timestamptz <= now()
      AND v_snap ->> 'teacher_email' = v_owner_email,
    format('created_at=%s', v_snap ->> 'created_at'));

  SELECT array_agg(e ->> 'code' ORDER BY ord) INTO v_codes
  FROM jsonb_array_elements(v_snap -> 'parameters') WITH ORDINALITY AS t(e, ord);

  -- AGE THE CYCLE (synthetic, in-transaction). A cycle created today has a
  -- window of [now, start-of-this-week) — which is EMPTY, because the
  -- completed-week cutoff is in the past. That is correct behaviour, and it is
  -- also why every reveal assertion below needs a cycle that has been running a
  -- while: 30 days back is the only state in which a compare says anything.
  UPDATE audit_cycles
     SET parameter_catalog_snapshot =
           jsonb_set(parameter_catalog_snapshot, '{created_at}',
                     to_jsonb((now() - interval '30 days')))
   WHERE id = v_cycle;
  SELECT parameter_catalog_snapshot INTO v_snap FROM audit_cycles WHERE id = v_cycle;


  -- ── h02: create-for-other ACROSS institutions is refused (non-admin) ─────
  IF v_other_member IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role','authenticated')::text, true);
    PERFORM set_config('role','authenticated', true);
    v := fn_carre_create_classroom_audit('[HARDEN] cross-tenant open', v_other_member);
    EXECUTE 'RESET ROLE';
    INSERT INTO _r VALUES ('h02_create_for_other_cross_tenant_refused',
      v ->> 'reason' IN ('cross_institution_not_allowed','not_allowed_for_other_teacher'),
      v::text);
  ELSE
    INSERT INTO _r VALUES ('h02_create_for_other_cross_tenant_refused', NULL,
      'SKIP: no team member in a different institution');
  END IF;

  -- ── h02b: a login-less team member is refused with a NAMED reason ────────
  -- Before this fix the INSERT raised a bare 23503 and the whole rehearsal
  -- aborted; a HOD picking that person would have seen a raw database error.
  IF v_no_login IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_lead, 'role','authenticated')::text, true);
    PERFORM set_config('role','authenticated', true);
    v := fn_carre_create_classroom_audit('[HARDEN] login-less target', v_no_login);
    EXECUTE 'RESET ROLE';
    INSERT INTO _r VALUES ('h02b_login_less_target_named_denial',
      (v ->> 'success')::boolean IS FALSE
        AND v ->> 'reason' = 'teacher_no_login_account', v::text);

    -- ...and the picker never offers them in the first place.
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role','authenticated')::text, true);
    PERFORM set_config('role','authenticated', true);
    SELECT count(*) INTO n
      FROM fn_carre_search_teachers(v_no_login_q) t
     WHERE t.profile_id = v_no_login;
    EXECUTE 'RESET ROLE';
    INSERT INTO _r VALUES ('h02c_picker_excludes_login_less', n = 0,
      format('picker rows matching the login-less person for query %L: %s (expect 0)',
             v_no_login_q, n));
  ELSE
    INSERT INTO _r VALUES ('h02b_login_less_target_named_denial', NULL,
      'SKIP: no login-less team member in this database');
    INSERT INTO _r VALUES ('h02c_picker_excludes_login_less', NULL, 'SKIP: as h02b');
  END IF;

  -- ── h03: super-admin may still open cross-institution ────────────────────
  IF v_other_member IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_lead, 'role','authenticated')::text, true);
    PERFORM set_config('role','authenticated', true);
    v := fn_carre_create_classroom_audit('[HARDEN] admin cross-tenant open', v_other_member);
    EXECUTE 'RESET ROLE';
    INSERT INTO _r VALUES ('h03_super_admin_cross_tenant_allowed',
      (v ->> 'success')::boolean IS TRUE, v::text);
  ELSE
    INSERT INTO _r VALUES ('h03_super_admin_cross_tenant_allowed', NULL, 'SKIP: as h02');
  END IF;

  -- ── self-score all 13 so the compare can unlock ──────────────────────────
  FOR i IN 1..13 LOOP
    INSERT INTO care_audit_scores (cycle_id, parameter_code, scorer_id, scorer_role, score)
    VALUES (v_cycle, v_codes[i], v_owner, 'owner', 3);
  END LOOP;

  -- Guard the fixture itself: the window keys only exist once the compare is
  -- unlocked, and if the window were empty every reveal assertion below would
  -- 'pass' as zero and prove nothing.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role','authenticated', true);
  v := fn_classroom_practice_compare(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('h03b_fixture_window_is_open',
    (v ->> 'locked')::boolean IS FALSE
      AND (v ->> 'window_start')::timestamptz < (v ->> 'week_cutoff')::timestamptz,
    format('window_start=%s < week_cutoff=%s', v ->> 'window_start', v ->> 'week_cutoff'));

  -- ══ THE HIGH ═════════════════════════════════════════════════════════════
  -- CP-RS3: THREE impressions, all from ONE learner. Must stay sealed.
  INSERT INTO carre_micro_impressions
    (learner_id, teacher_email, parameter_code, attendance_date, timetable_id,
     period_id, offered_at, answered_at, score)
  SELECT L1, v_owner_email, 'CP-RS3', current_date - 7, gen_random_uuid(),
         'a' || g, v_last_week + (g || ' minutes')::interval,
         v_last_week + (g || ' minutes')::interval, 4
  FROM generate_series(1, 3) g;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role','authenticated', true);
  v := fn_classroom_practice_compare(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('h04_HIGH_three_answers_one_learner_stay_sealed',
    (SELECT (it ->> 'voices')::int = 1 AND it ->> 'learner_median' IS NULL
       FROM jsonb_array_elements(v -> 'items') it WHERE it ->> 'code' = 'CP-RS3'),
    (SELECT it::text FROM jsonb_array_elements(v -> 'items') it WHERE it ->> 'code' = 'CP-RS3'));

  -- Two MORE distinct learners on the same item -> 3 learners -> reveals.
  INSERT INTO carre_micro_impressions
    (learner_id, teacher_email, parameter_code, attendance_date, timetable_id,
     period_id, offered_at, answered_at, score)
  VALUES (L2, v_owner_email, 'CP-RS3', current_date - 7, gen_random_uuid(), 'b1',
          v_last_week, v_last_week, 0),
         (L3, v_owner_email, 'CP-RS3', current_date - 7, gen_random_uuid(), 'b2',
          v_last_week, v_last_week, 0);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role','authenticated', true);
  v := fn_classroom_practice_compare(v_cycle);
  EXECUTE 'RESET ROLE';
  -- L1 answered 4 (three times), L2 and L3 answered 0 once each.
  -- Per-learner values are {4, 0, 0} -> median 0. Counting IMPRESSIONS instead
  -- would give {4,4,4,0,0} -> median 4, so this number proves the aggregation.
  INSERT INTO _r VALUES ('h05_HIGH_three_learners_reveal_learner_weighted_median',
    (SELECT (it ->> 'voices')::int = 3 AND (it ->> 'learner_median')::numeric = 0
       FROM jsonb_array_elements(v -> 'items') it WHERE it ->> 'code' = 'CP-RS3'),
    (SELECT it::text FROM jsonb_array_elements(v -> 'items') it WHERE it ->> 'code' = 'CP-RS3'));

  -- ── h06: a learner's LATEST answer is the one that counts ────────────────
  INSERT INTO carre_micro_impressions
    (learner_id, teacher_email, parameter_code, attendance_date, timetable_id,
     period_id, offered_at, answered_at, score)
  VALUES (L1, v_owner_email, 'CP-C2', current_date - 9, gen_random_uuid(), 'c1',
          v_last_week - interval '2 days', v_last_week - interval '2 days', 0),
         (L1, v_owner_email, 'CP-C2', current_date - 7, gen_random_uuid(), 'c2',
          v_last_week, v_last_week, 4),
         (L2, v_owner_email, 'CP-C2', current_date - 7, gen_random_uuid(), 'c3',
          v_last_week, v_last_week, 4),
         (L3, v_owner_email, 'CP-C2', current_date - 7, gen_random_uuid(), 'c4',
          v_last_week, v_last_week, 4);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role','authenticated', true);
  v := fn_classroom_practice_compare(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('h06_latest_answer_per_learner_wins',
    (SELECT (it ->> 'voices')::int = 3 AND (it ->> 'learner_median')::numeric = 4
       FROM jsonb_array_elements(v -> 'items') it WHERE it ->> 'code' = 'CP-C2'),
    (SELECT it::text FROM jsonb_array_elements(v -> 'items') it WHERE it ->> 'code' = 'CP-C2'));

  -- ── h07: impressions BEFORE the creation instant never count ─────────────
  INSERT INTO carre_micro_impressions
    (learner_id, teacher_email, parameter_code, attendance_date, timetable_id,
     period_id, offered_at, answered_at, score)
  SELECT gen_random_uuid(), v_owner_email, 'CP-C3', current_date, gen_random_uuid(),
         'd' || g, (v_snap ->> 'created_at')::timestamptz - interval '1 hour',
         (v_snap ->> 'created_at')::timestamptz - interval '1 hour', 4
  FROM generate_series(1, 5) g;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role','authenticated', true);
  v := fn_classroom_practice_compare(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('h07_pre_creation_instant_excluded',
    (SELECT (it ->> 'voices')::int = 0
       FROM jsonb_array_elements(v -> 'items') it WHERE it ->> 'code' = 'CP-C3'),
    (SELECT it::text FROM jsonb_array_elements(v -> 'items') it WHERE it ->> 'code' = 'CP-C3'));

  -- ── h08: self-score gate is not fooled by non-owner or off-snapshot rows ──
  -- Participant rows and a bogus code must not count toward the 13.
  INSERT INTO care_audit_scores (cycle_id, parameter_code, scorer_id, scorer_role, score)
  VALUES (v_cycle, v_codes[1], v_lead, 'participant', 4);
  DELETE FROM care_audit_scores
   WHERE cycle_id = v_cycle AND scorer_role = 'owner' AND parameter_code = v_codes[13];
  INSERT INTO care_audit_scores (cycle_id, parameter_code, scorer_id, scorer_role, score)
  VALUES (v_cycle, 'CP-NOT-A-REAL-CODE', v_owner, 'owner', 4);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role','authenticated', true);
  v := fn_classroom_practice_compare(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('h08_self_score_gate_counts_distinct_snapshot_codes',
    (v ->> 'locked')::boolean IS TRUE
      AND v ->> 'reason' = 'self_score_incomplete'
      AND (v ->> 'self_scored')::int = 12,
    v::text);

  -- restore the 13th so the tenancy assertions run against an unlocked cycle
  INSERT INTO care_audit_scores (cycle_id, parameter_code, scorer_id, scorer_role, score)
  VALUES (v_cycle, v_codes[13], v_owner, 'owner', 3);

  -- ── h09/h10: tenant scope on the audit.cycle.view branch ─────────────────
  IF v_viewer_cross IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_viewer_cross, 'role','authenticated')::text, true);
    PERFORM set_config('role','authenticated', true);
    v := fn_classroom_practice_compare(v_cycle);
    EXECUTE 'RESET ROLE';
    INSERT INTO _r VALUES ('h09_cross_tenant_permission_holder_forbidden',
      (v ->> 'locked')::boolean IS TRUE AND v ->> 'reason' = 'forbidden', v::text);
  ELSE
    INSERT INTO _r VALUES ('h09_cross_tenant_permission_holder_forbidden', NULL,
      'SKIP: no audit.cycle.view holder outside the owner''s institution');
  END IF;

  IF v_viewer_same IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_viewer_same, 'role','authenticated')::text, true);
    PERFORM set_config('role','authenticated', true);
    v := fn_classroom_practice_compare(v_cycle);
    EXECUTE 'RESET ROLE';
    INSERT INTO _r VALUES ('h10_same_tenant_permission_holder_allowed',
      (v ->> 'locked')::boolean IS FALSE, v::text);
  ELSE
    INSERT INTO _r VALUES ('h10_same_tenant_permission_holder_allowed', NULL,
      'SKIP: no audit.cycle.view holder inside the owner''s institution');
  END IF;

  -- ── h11: owner still admitted; a stranger still refused ──────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role','authenticated', true);
  v := fn_classroom_practice_compare(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('h11_owner_still_admitted',
    (v ->> 'locked')::boolean IS FALSE AND jsonb_array_length(v -> 'items') = 13,
    format('locked=%s items=%s', v ->> 'locked', jsonb_array_length(v -> 'items')));

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role','authenticated')::text, true);
  PERFORM set_config('role','authenticated', true);
  v := fn_classroom_practice_compare(v_cycle);
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('h12_stranger_forbidden',
    (v ->> 'locked')::boolean IS TRUE AND v ->> 'reason' = 'forbidden', v::text);

  -- ── h13: the payload still carries no identity and no free text ──────────
  INSERT INTO _r VALUES ('h13_no_identity_leak',
    v::text NOT ILIKE '%learner_id%' AND v::text NOT ILIKE '%teacher_email%'
      AND v::text NOT ILIKE '%comment%',
    'payload carries only code/self_score/voices/learner_median');

  -- ── h14-h16: anon EXECUTE re-locked on all three replaced functions ──────
  BEGIN
    PERFORM set_config('role','anon', true);
    PERFORM fn_classroom_practice_compare(v_cycle);
    RAISE EXCEPTION 'ANON_NOT_LOCKED';
  EXCEPTION WHEN insufficient_privilege THEN v_anon_locked := true;
            WHEN raise_exception       THEN v_anon_locked := false;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('h14_anon_locked_compare', v_anon_locked,
    CASE WHEN v_anon_locked THEN 'permission denied as expected' ELSE 'LEAK' END);

  BEGIN
    PERFORM set_config('role','anon', true);
    PERFORM fn_carre_create_classroom_audit('[HARDEN] anon');
    RAISE EXCEPTION 'ANON_NOT_LOCKED';
  EXCEPTION WHEN insufficient_privilege THEN v_anon_locked := true;
            WHEN raise_exception       THEN v_anon_locked := false;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('h15_anon_locked_create', v_anon_locked,
    CASE WHEN v_anon_locked THEN 'permission denied as expected' ELSE 'LEAK' END);

  BEGIN
    PERFORM set_config('role','anon', true);
    PERFORM fn_carre_search_teachers('ab');
    RAISE EXCEPTION 'ANON_NOT_LOCKED';
  EXCEPTION WHEN insufficient_privilege THEN v_anon_locked := true;
            WHEN raise_exception       THEN v_anon_locked := false;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('h16_anon_locked_picker', v_anon_locked,
    CASE WHEN v_anon_locked THEN 'permission denied as expected' ELSE 'LEAK' END);

  -- ── h17: picker still refuses to enumerate the directory ────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  PERFORM set_config('role','authenticated', true);
  SELECT count(*) INTO n FROM fn_carre_search_teachers('%');
  EXECUTE 'RESET ROLE';
  INSERT INTO _r VALUES ('h17_picker_wildcard_neutralised', n = 0, format('rows=%s', n));
END $do$;

INSERT INTO _r
SELECT 'h18_no_anon_execute_' || p.proname,
       NOT has_function_privilege('anon', p.oid, 'EXECUTE'),
       'anon EXECUTE must be false'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('fn_carre_create_classroom_audit','fn_carre_search_teachers',
                    'fn_classroom_practice_compare');

SELECT test,
       CASE WHEN pass IS NULL THEN 'SKIP' WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result,
       detail
FROM _r ORDER BY test;

SELECT count(*) FILTER (WHERE pass)          AS passed,
       count(*) FILTER (WHERE pass IS FALSE) AS failed,
       count(*) FILTER (WHERE pass IS NULL)  AS skipped,
       count(*)                              AS total
FROM _r;

-- NO COMMIT — the coordinator's rolled-back session discards everything above.

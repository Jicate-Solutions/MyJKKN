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

-- scripts/backfill-events-registrations-myjkkn-profile.sql
--
-- One-off backfill for events_registrations.myjkkn_profile (migration
-- 20260924120000). Existing INTERNAL registrations (profile_id set) predate
-- the snapshot the register API now writes; this fills them from the CURRENT
-- profile / staff / learner rows, mirroring the precedence in
-- lib/services/events/registration/registrant-profile.ts:
--   learner row > staff row > profile, for institution / department / name.
-- Only rows with myjkkn_profile IS NULL are touched; institution_id,
-- institution_name and department are filled only where still NULL.
-- Idempotent — re-running changes nothing. Run in the SQL editor (or via the
-- Management API); ran on production 2026-09-24 for 1,132 rows.

WITH src AS (
  SELECT
    r.id AS registration_id,
    p.id AS profile_id,
    p.full_name AS p_full_name, p.email AS p_email, p.phone_number AS p_phone,
    p.institution_id AS p_inst, p.department_id AS p_dept,
    s.id AS staff_row_id, s.staff_id, s.designation, s.role_key,
    s.first_name AS s_first, s.last_name AS s_last, s.email AS s_email, s.phone AS s_phone,
    s.institution_id AS s_inst, s.department_id AS s_dept,
    l.id AS learner_id, l.roll_number, l.register_number,
    l.first_name AS l_first, l.last_name AS l_last,
    l.college_email, l.student_email, l.student_mobile,
    l.institution_id AS l_inst, l.department_id AS l_dept,
    l.degree_id AS l_degree_id, l.program_id AS l_program_id, l.semester_id AS l_semester_id
  FROM events_registrations r
  JOIN profiles p ON p.id = r.profile_id
  LEFT JOIN LATERAL (
    SELECT * FROM staff st WHERE st.profile_id = p.id ORDER BY st.created_at LIMIT 1
  ) s ON true
  LEFT JOIN learners_profiles l ON l.id = p.learner_id
  WHERE r.myjkkn_profile IS NULL
),
built AS (
  SELECT
    registration_id,
    COALESCE(l_inst, s_inst, p_inst) AS institution_id,
    COALESCE(l_dept, s_dept, p_dept) AS department_id,
    jsonb_strip_nulls(jsonb_build_object(
      'person_type',
        CASE
          WHEN learner_id IS NOT NULL THEN 'learner'
          -- staff.role_type is 'teacher' on every row; role_key tells teaching from office staff
          WHEN staff_row_id IS NOT NULL AND role_key IN ('faculty','hod','principal','vice_principal','dean') THEN 'learning_facilitator'
          WHEN staff_row_id IS NOT NULL THEN 'staff_other'
          ELSE 'user'
        END,
      'profile_id', profile_id,
      'full_name', COALESCE(
        NULLIF(btrim(concat_ws(' ', l_first, l_last)), ''),
        NULLIF(btrim(concat_ws(' ', s_first, s_last)), ''),
        p_full_name),
      'email', COALESCE(NULLIF(college_email,''), NULLIF(student_email,''), NULLIF(s_email,''), NULLIF(p_email,'')),
      'phone', COALESCE(NULLIF(student_mobile,''), NULLIF(s_phone,''), NULLIF(p_phone,'')),
      'learner_id', learner_id,
      'roll_number', roll_number,
      'register_number', register_number,
      'staff_row_id', staff_row_id,
      'staff_id', staff_id,
      'designation', designation,
      'institution_id', COALESCE(l_inst, s_inst, p_inst),
      'institution_name', (SELECT i.name FROM institutions i WHERE i.id = COALESCE(l_inst, s_inst, p_inst)),
      'department_id', COALESCE(l_dept, s_dept, p_dept),
      'department_name', (SELECT de.department_name FROM departments de WHERE de.id = COALESCE(l_dept, s_dept, p_dept)),
      -- Aliased on purpose: degrees.degree_id / programs.program_id are the
      -- CODE columns and would shadow the learner's uuid inside the subquery.
      'degree_id', l_degree_id,
      'degree_name', (SELECT d.degree_name FROM degrees d WHERE d.id = l_degree_id),
      'program_id', l_program_id,
      'program_name', (SELECT pr.program_name FROM programs pr WHERE pr.id = l_program_id),
      'semester_id', l_semester_id,
      'semester_name', (SELECT se.semester_name FROM semesters se WHERE se.id = l_semester_id)
    )) AS snapshot
  FROM src
)
UPDATE events_registrations r
   SET myjkkn_profile   = b.snapshot,
       institution_id   = COALESCE(r.institution_id, b.institution_id),
       institution_name = COALESCE(r.institution_name, b.snapshot->>'institution_name'),
       department       = COALESCE(r.department, b.snapshot->>'department_name'),
       learner_id       = COALESCE(r.learner_id, (b.snapshot->>'learner_id')::uuid),
       updated_at       = now()
  FROM built b
 WHERE b.registration_id = r.id;

-- Re-classification pass (2026-09-24, after the first run used role_type):
UPDATE events_registrations r
   SET myjkkn_profile = r.myjkkn_profile || jsonb_build_object('person_type',
         CASE WHEN st.role_key IN ('faculty','hod','principal','vice_principal','dean')
              THEN 'learning_facilitator' ELSE 'staff_other' END)
  FROM staff st
 WHERE st.id = (r.myjkkn_profile->>'staff_row_id')::uuid
   AND r.myjkkn_profile->>'person_type' IN ('learning_facilitator','staff_other');

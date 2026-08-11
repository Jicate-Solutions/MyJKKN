-- Seed Principal-only department-level fallback approval flows.
--
-- Follow-up to 20260815030000_seed_department_level_leave_onduty_approval_flows.sql,
-- which seeded an hod -> principal fallback for the 22 blocked departments where
-- BOTH an HOD and a Principal could be resolved. That left 15 departments /
-- 784 active learners still unable to submit leave or OD at all, because no HOD
-- could be identified for them.
--
-- The original plan was for the academic team to appoint an HOD per department
-- and re-run the previous migration. That turned out not to be possible:
--   12 of the 15 departments have ZERO active staff records, so there is
--   literally nobody in them to appoint. This covers all of JKKN Matric Higher
--   Secondary School (552 learners), Nattraja Vidhyalya CBSE (125), the
--   CAS-Aided PG departments, and Dental Periodontics.
-- Only Dental Orthodontics (3 staff), Dental Prosthodontics (5) and CAS-Self
-- Visual Communication (1) have anyone to choose from.
--
-- Nor can the admin UI author this row: /academic/leave-onduty/settings
-- hard-requires Degree, Program AND Semester (page.tsx:477 "Please select a
-- semester") and offers no "All Semesters" choice, so it can only ever write
-- fully-specific per-semester flows. That mismatch — a backend fallback ladder
-- with no UI able to express it — is why 156 of 162 flows were fully specific
-- and no real fallback existed in the first place. Closing that UI gap is
-- tracked separately; this migration unblocks the learners now.
--
-- CHAIN: principal only, a single required step. Deliberately shorter than the
-- hod -> principal chain seeded for the other 22: naming a second approver here
-- would mean inventing one. A Principal resolves for all 15 institutions.
-- The academic team can add an HOD step later in the flow-builder UI without
-- another migration, once someone exists to appoint.
--
-- SCOPE (verified by dry run before applying):
--   15 institution+department pairs, 39 cohorts, 784 active learners
--   0 departments left blocked afterwards
--
-- IDEMPOTENT: the NOT EXISTS guard skips any department that already has a
-- department-level row — including all 22 seeded by the previous migration — so
-- re-running inserts nothing and no existing flow is modified or deleted.

INSERT INTO leave_onduty_approval_flows (
  institution_id, department_id, semester_id, category, sub_category,
  flow_type, flow_steps, is_active
)
WITH active_cohorts AS (
  SELECT lp.institution_id, lp.department_id, lp.semester_id, COUNT(*) AS learners
  FROM learners_profiles lp
  WHERE lp.lifecycle_status = 'active'
    AND lp.institution_id IS NOT NULL
    AND lp.department_id IS NOT NULL
    AND lp.semester_id IS NOT NULL
  GROUP BY 1, 2, 3
),
blocked_cohorts AS (
  -- Cohorts the ladder still resolves nothing for, AFTER the hod -> principal
  -- fallbacks are in place.
  SELECT c.*
  FROM active_cohorts c
  LEFT JOIN LATERAL get_applicable_approval_flow(
    c.institution_id, c.department_id, c.semester_id, 'onduty', NULL
  ) f ON TRUE
  WHERE f.id IS NULL
),
blocked_departments AS (
  SELECT institution_id, department_id
  FROM blocked_cohorts
  GROUP BY 1, 2
),
resolved AS (
  SELECT
    d.institution_id,
    d.department_id,
    (SELECT p.id FROM profiles p
      WHERE p.role = 'principal' AND p.institution_id = d.institution_id
      ORDER BY p.created_at
      LIMIT 1) AS principal_id
  FROM blocked_departments d
)
SELECT
  r.institution_id,
  r.department_id,
  NULL::uuid AS semester_id,
  'all'      AS category,
  NULL::text AS sub_category,
  'sequential'::flow_type,
  jsonb_build_array(
    jsonb_build_object(
      'step_order',    1,
      'role_id',       '046b426c-6c97-4657-a530-75282595772e',
      'role_name',     'Principal',
      'approver_role', 'principal',
      'approver_ids',  jsonb_build_array(r.principal_id),
      'is_required',   true
    )
  ) AS flow_steps,
  true AS is_active
FROM resolved r
WHERE r.principal_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM leave_onduty_approval_flows x
    WHERE x.institution_id = r.institution_id
      AND x.department_id  = r.department_id
      AND x.semester_id IS NULL
      AND x.sub_category IS NULL
      AND x.category IN ('all', 'onduty', 'leave')
  );

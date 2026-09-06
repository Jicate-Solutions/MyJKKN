-- Seed department-level fallback approval flows for leave / on-duty.
--
-- REPORTED 2026-08-07 by a JKKNCET ECE learner: "OD is not applying, some error
-- is showing". createApplication resolves an approval flow via
-- get_applicable_approval_flow(); when that yields no steps it deletes the
-- just-inserted application and throws "No approver is set up for your class
-- yet…" (leave-onduty-service.ts). That refusal is correct — an application
-- with zero approver rows is invisible to every approver and would sit pending
-- forever (the failure that previously stranded 54 of 60 applications).
--
-- The real defect is that almost nothing resolves. Flows were only ever seeded
-- per (department, semester): 156 of 162 active flows are fully specific, and
-- outside the Testing Institution NO department-level or institution-level
-- fallback exists. So every semester that never got its own row is locked out.
-- Measured before this migration: 101 cohorts / 2,867 of 4,366 active learners
-- (66%) could not submit leave or OD at all.
--
-- get_applicable_approval_flow() already implements the fallback ladder:
--   L1 institution+department+semester+category+sub_category
--   L2 institution+department+semester+category
--   L3 institution+department            (semester_id IS NULL, sub_category IS NULL)
--   L4 institution                       (department_id IS NULL, semester_id IS NULL)
-- Nobody ever populated L3/L4. This migration populates L3, so a department
-- keeps working when a new semester rolls over instead of silently blocking.
-- L1/L2 still win wherever a semester-specific flow exists, so no existing
-- routing changes.
--
-- CHAIN: hod → principal, matching the only pre-existing department-level rows
-- in the system (JKKN Testing Institution). The semester-specific class
-- advisor (the "faculty"/Facilitator step) is deliberately omitted — which
-- advisor applies is a per-semester fact that cannot be derived here, and
-- guessing one would route learners to the wrong person.
--
-- APPROVER DERIVATION, in order:
--   HOD       — the approver already pinned on another flow for the SAME
--               department (authoritative: the academic team chose it),
--               else the earliest-created profile with role 'hod' in that
--               department.
--   Principal — the earliest-created profile with role 'principal' in the
--               institution.
--
-- SCOPE (verified by dry run before applying):
--   37 blocked institution+department pairs
--   22 resolve BOTH an HOD and a Principal → seeded here (2,083 learners)
--   15 resolve only a Principal           → deliberately NOT seeded, per
--      decision on 2026-08-07: those 784 learners stay blocked until an HOD is
--      configured for their department. Seeding a Principal-only chain would
--      have unblocked them but was declined in favour of a complete chain.
--
-- Some derived HODs are placeholder accounts ("Hodcse", "test hod", "EEE IQAC
-- Coordinator"). That is pre-existing production data, not something this
-- migration invents; the academic team can repoint any step in the flow-builder
-- UI (/academic/leave-onduty) without another migration.
--
-- IDEMPOTENT: the NOT EXISTS guard skips any department that already has a
-- department-level row, so re-running inserts nothing and no existing flow is
-- modified or deleted.

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
  -- Cohorts for which the ladder currently resolves nothing.
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
    COALESCE(
      (SELECT (s->'approver_ids'->>0)::uuid
         FROM leave_onduty_approval_flows ef,
              jsonb_array_elements(ef.flow_steps::jsonb) s
        WHERE ef.institution_id = d.institution_id
          AND ef.department_id  = d.department_id
          AND ef.is_active
          AND s->>'approver_role' = 'hod'
          AND (s->'approver_ids'->>0) IS NOT NULL
        LIMIT 1),
      (SELECT p.id FROM profiles p
        WHERE p.role = 'hod' AND p.department_id = d.department_id
        ORDER BY p.created_at
        LIMIT 1)
    ) AS hod_id,
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
      'role_id',       'd2ba2195-eafc-434e-a437-b148dc4dc4b6',
      'role_name',     'HOD',
      'approver_role', 'hod',
      'approver_ids',  jsonb_build_array(r.hod_id),
      'is_required',   true
    ),
    jsonb_build_object(
      'step_order',    2,
      'role_id',       '046b426c-6c97-4657-a530-75282595772e',
      'role_name',     'Principal',
      'approver_role', 'principal',
      'approver_ids',  jsonb_build_array(r.principal_id),
      'is_required',   true
    )
  ) AS flow_steps,
  true AS is_active
FROM resolved r
WHERE r.hod_id IS NOT NULL
  AND r.principal_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM leave_onduty_approval_flows x
    WHERE x.institution_id = r.institution_id
      AND x.department_id  = r.department_id
      AND x.semester_id IS NULL
      AND x.sub_category IS NULL
      AND x.category IN ('all', 'onduty', 'leave')
  );

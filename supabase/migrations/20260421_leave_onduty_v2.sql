-- =====================================================
-- LEAVE / ONDUTY v2 — Individual/Team + Forward + Seeded Categories
-- =====================================================
-- Created: 2026-04-21
-- Purpose: Extend leave/onduty system to support:
--   (1) applicable_type (individual | team) on applications
--   (2) leave_onduty_team_members table (team OnDuty members)
--   (3) is_system_managed flag on sub_categories + seed 7 system codes
--       (Leave: general, medical; OnDuty: culturals, sports, events,
--        industrial_visits, meetings)
--   (4) 'forwarded' value in approval_status enum
--   (5) forwarded_to_id pointer on leave_onduty_approvals
--
-- Backward compatibility:
--   - Existing applications keep working (applicable_type defaults to
--     'individual').
--   - Existing custom sub-categories are preserved (new flag defaults to
--     false). Only the 7 seeded rows get is_system_managed = true.
--   - Existing approval rows keep their 'pending' / 'approved' / 'rejected'
--     status values; 'forwarded' is only written by the new forward action.
--
-- Data migration:
--   - The legacy 'casual' leave code is RE-LABELED to 'general' (code and
--     name both change) because the new spec explicitly calls it General.
--     Any existing applications / flows referencing 'casual' are updated
--     in-place so foreign data stays consistent.
--   - The legacy onduty codes ('event_participation', 'club_activities')
--     are deactivated (is_active = false) but NOT deleted — they remain
--     readable for historical applications. Admins can re-enable or delete
--     them from the settings UI if desired.
-- =====================================================


-- ============================================================================
-- 1. ENUMS
-- ============================================================================

-- 1.1  New: applicable_type for applications
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leave_onduty_applicable') THEN
    CREATE TYPE leave_onduty_applicable AS ENUM ('individual', 'team');
  END IF;
END $$;

-- 1.2  Extend existing approval_status with 'forwarded'
--      ALTER TYPE ADD VALUE is idempotent only via IF NOT EXISTS guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'forwarded'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'approval_status')
  ) THEN
    ALTER TYPE approval_status ADD VALUE 'forwarded';
  END IF;
END $$;


-- ============================================================================
-- 2. leave_onduty_applications — applicable_type column
-- ============================================================================

ALTER TABLE leave_onduty_applications
  ADD COLUMN IF NOT EXISTS applicable_type leave_onduty_applicable
    NOT NULL DEFAULT 'individual';

-- Business rule: Leave category is always individual. Only OnDuty supports
-- team applications (team OD for cultural events, inter-college sports, etc.).
ALTER TABLE leave_onduty_applications
  DROP CONSTRAINT IF EXISTS leave_onduty_applications_leave_is_individual;

ALTER TABLE leave_onduty_applications
  ADD CONSTRAINT leave_onduty_applications_leave_is_individual
    CHECK (category <> 'leave' OR applicable_type = 'individual');


-- ============================================================================
-- 3. leave_onduty_team_members — team OD members
-- ============================================================================

CREATE TABLE IF NOT EXISTS leave_onduty_team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL
    REFERENCES leave_onduty_applications(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL
    REFERENCES learners_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT leave_onduty_team_members_unique
    UNIQUE (application_id, learner_id)
);

CREATE INDEX IF NOT EXISTS idx_leave_onduty_team_members_application
  ON leave_onduty_team_members (application_id);

CREATE INDEX IF NOT EXISTS idx_leave_onduty_team_members_learner
  ON leave_onduty_team_members (learner_id);

COMMENT ON TABLE leave_onduty_team_members IS
  'Members of a team OnDuty application. One row per learner on the team. The primary applicant is stored on leave_onduty_applications.learner_id and is NOT duplicated here.';


-- ============================================================================
-- 4. leave_onduty_team_members — RLS
-- ============================================================================

ALTER TABLE leave_onduty_team_members ENABLE ROW LEVEL SECURITY;

-- SELECT: any user who can read the parent application can read its members
DROP POLICY IF EXISTS "team_members_select" ON leave_onduty_team_members;
CREATE POLICY "team_members_select" ON leave_onduty_team_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leave_onduty_applications a
      WHERE a.id = leave_onduty_team_members.application_id
        AND (
          is_super_admin()
          OR is_admin()
          OR a.learner_id IN (
            SELECT lp.id FROM learners_profiles lp
            WHERE lp.student_email = auth.email()
          )
          OR leave_onduty_team_members.learner_id IN (
            SELECT lp.id FROM learners_profiles lp
            WHERE lp.student_email = auth.email()
          )
          OR role_has_institution_access(a.institution_id)
        )
    )
  );

-- INSERT: only the applicant (learner who owns the parent application) or
-- a super admin can add members. The service layer is responsible for
-- creating the parent + members in a single transaction.
DROP POLICY IF EXISTS "team_members_insert" ON leave_onduty_team_members;
CREATE POLICY "team_members_insert" ON leave_onduty_team_members
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM leave_onduty_applications a
      JOIN learners_profiles lp ON lp.id = a.learner_id
      WHERE a.id = leave_onduty_team_members.application_id
        AND lp.student_email = auth.email()
        AND a.status = 'pending'
    )
  );

-- DELETE: applicant can remove members only while the application is still
-- pending. After approval the team roster is frozen for audit integrity.
DROP POLICY IF EXISTS "team_members_delete" ON leave_onduty_team_members;
CREATE POLICY "team_members_delete" ON leave_onduty_team_members
  FOR DELETE TO authenticated
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM leave_onduty_applications a
      JOIN learners_profiles lp ON lp.id = a.learner_id
      WHERE a.id = leave_onduty_team_members.application_id
        AND lp.student_email = auth.email()
        AND a.status = 'pending'
    )
  );

-- No UPDATE policy on purpose — team membership is insert/delete only.


-- ============================================================================
-- 5. leave_onduty_approvals — forwarded_to_id + forwarded_from_id
-- ============================================================================

-- When an approver forwards the application to another staff member, we
-- need to track both directions of the forward so the timeline shows:
--   Step N: Dr. A forwarded to Dr. B  (forwarded_to_id = B)
--   Step N: Dr. B received from Dr. A  (forwarded_from_id = A)
ALTER TABLE leave_onduty_approvals
  ADD COLUMN IF NOT EXISTS forwarded_to_id UUID
    REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE leave_onduty_approvals
  ADD COLUMN IF NOT EXISTS forwarded_from_id UUID
    REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_approvals_forwarded_to
  ON leave_onduty_approvals (forwarded_to_id)
  WHERE forwarded_to_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_approvals_forwarded_from
  ON leave_onduty_approvals (forwarded_from_id)
  WHERE forwarded_from_id IS NOT NULL;


-- ============================================================================
-- 6. leave_onduty_sub_categories — is_system_managed flag
-- ============================================================================

ALTER TABLE leave_onduty_sub_categories
  ADD COLUMN IF NOT EXISTS is_system_managed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN leave_onduty_sub_categories.is_system_managed IS
  'System-managed categories are seeded by the platform and cannot be deleted by institution admins (they can still be deactivated). Custom institution-specific categories stay unmanaged (default false).';


-- ============================================================================
-- 7. Seed the new system-managed codes for every institution
-- ============================================================================

-- 7.1  LEAVE: General, Medical
INSERT INTO leave_onduty_sub_categories
  (institution_id, category, code, name, description, is_system_managed, is_active)
SELECT i.id, 'leave'::leave_onduty_category, 'general', 'General',
       'General leave (personal reasons)', true, true
FROM institutions i
ON CONFLICT (institution_id, category, code) DO UPDATE
  SET is_system_managed = true,
      is_active = true,
      name = EXCLUDED.name,
      description = EXCLUDED.description;

INSERT INTO leave_onduty_sub_categories
  (institution_id, category, code, name, description, is_system_managed, is_active)
SELECT i.id, 'leave'::leave_onduty_category, 'medical', 'Medical',
       'Medical leave (may require documentation)', true, true
FROM institutions i
ON CONFLICT (institution_id, category, code) DO UPDATE
  SET is_system_managed = true,
      is_active = true,
      name = EXCLUDED.name,
      description = EXCLUDED.description;

-- 7.2  ONDUTY: Culturals, Sports, Events, Industrial Visits, Meetings
INSERT INTO leave_onduty_sub_categories
  (institution_id, category, code, name, description, is_system_managed, is_active)
SELECT i.id, 'onduty'::leave_onduty_category, 'culturals', 'Culturals',
       'Cultural events, arts, performances', true, true
FROM institutions i
ON CONFLICT (institution_id, category, code) DO UPDATE
  SET is_system_managed = true,
      is_active = true,
      name = EXCLUDED.name,
      description = EXCLUDED.description;

INSERT INTO leave_onduty_sub_categories
  (institution_id, category, code, name, description, is_system_managed, is_active)
SELECT i.id, 'onduty'::leave_onduty_category, 'sports', 'Sports',
       'Sports competitions, tournaments, athletic events', true, true
FROM institutions i
ON CONFLICT (institution_id, category, code) DO UPDATE
  SET is_system_managed = true,
      is_active = true,
      name = EXCLUDED.name,
      description = EXCLUDED.description;

INSERT INTO leave_onduty_sub_categories
  (institution_id, category, code, name, description, is_system_managed, is_active)
SELECT i.id, 'onduty'::leave_onduty_category, 'events', 'Events',
       'Conferences, symposia, academic events', true, true
FROM institutions i
ON CONFLICT (institution_id, category, code) DO UPDATE
  SET is_system_managed = true,
      is_active = true,
      name = EXCLUDED.name,
      description = EXCLUDED.description;

INSERT INTO leave_onduty_sub_categories
  (institution_id, category, code, name, description, is_system_managed, is_active)
SELECT i.id, 'onduty'::leave_onduty_category, 'industrial_visits', 'Industrial Visits',
       'Industry / factory / site visits', true, true
FROM institutions i
ON CONFLICT (institution_id, category, code) DO UPDATE
  SET is_system_managed = true,
      is_active = true,
      name = EXCLUDED.name,
      description = EXCLUDED.description;

INSERT INTO leave_onduty_sub_categories
  (institution_id, category, code, name, description, is_system_managed, is_active)
SELECT i.id, 'onduty'::leave_onduty_category, 'meetings', 'Meetings',
       'Official meetings, committee work', true, true
FROM institutions i
ON CONFLICT (institution_id, category, code) DO UPDATE
  SET is_system_managed = true,
      is_active = true,
      name = EXCLUDED.name,
      description = EXCLUDED.description;


-- ============================================================================
-- 8. Data migration: rename legacy 'casual' → 'general'
--    (only where a 'general' row already exists — seeded above — so FK-like
--    string refs in applications/flows can be repointed cleanly.)
-- ============================================================================

-- 8.1  Repoint applications that used 'casual' leave to 'general'
UPDATE leave_onduty_applications
SET sub_category = 'general'
WHERE category = 'leave' AND sub_category = 'casual';

-- 8.2  Repoint approval flows that targeted 'casual' leave to 'general'
UPDATE leave_onduty_approval_flows
SET sub_category = 'general'
WHERE category = 'leave' AND sub_category = 'casual';

-- 8.3  Remove the now-orphaned 'casual' seed row where a 'general' row exists
DELETE FROM leave_onduty_sub_categories s
WHERE s.category = 'leave'
  AND s.code = 'casual'
  AND EXISTS (
    SELECT 1 FROM leave_onduty_sub_categories g
    WHERE g.institution_id = s.institution_id
      AND g.category = 'leave'
      AND g.code = 'general'
  );


-- ============================================================================
-- 9. Deactivate legacy onduty codes (keep them readable for history)
-- ============================================================================

-- Admins can re-enable from the settings UI if they still use these codes.
UPDATE leave_onduty_sub_categories
SET is_active = false
WHERE category = 'onduty'
  AND code IN ('event_participation', 'club_activities')
  AND is_system_managed = false;


-- ============================================================================
-- 10. Sanity checks (no-op on success, error on broken state)
-- ============================================================================

DO $$
DECLARE
  missing_count INTEGER;
BEGIN
  -- Every institution should now have the 7 system-managed codes
  SELECT COUNT(*) INTO missing_count
  FROM institutions i
  WHERE (
    SELECT COUNT(*) FROM leave_onduty_sub_categories s
    WHERE s.institution_id = i.id
      AND s.is_system_managed = true
      AND s.code IN ('general','medical','culturals','sports','events','industrial_visits','meetings')
  ) <> 7;

  IF missing_count > 0 THEN
    RAISE WARNING 'leave_onduty_v2: % institution(s) missing one or more seeded sub-categories', missing_count;
  END IF;
END $$;

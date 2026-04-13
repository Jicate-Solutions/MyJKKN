-- Migration: Privilege Monthly Renewal & Committee Approval
-- Date: 2026-03-30
-- Adds: privilege_renewals, privilege_group_reviewers tables + renewal_status column

-- 1. New table: privilege_renewals
CREATE TABLE IF NOT EXISTS privilege_renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES privilege_members(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'auto_paused')),
  report_id UUID REFERENCES privilege_progress_reports(id),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id, month)
);

-- 2. New table: privilege_group_reviewers
CREATE TABLE IF NOT EXISTS privilege_group_reviewers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES privilege_groups(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES profiles(id),
  added_by UUID NOT NULL REFERENCES profiles(id),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, reviewer_id)
);

-- 3. Add renewal_status to privilege_members
ALTER TABLE privilege_members ADD COLUMN IF NOT EXISTS
  renewal_status TEXT NOT NULL DEFAULT 'active'
  CHECK (renewal_status IN ('active', 'paused', 'pending_report', 'pending_review'));

-- RLS
ALTER TABLE privilege_renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE privilege_group_reviewers ENABLE ROW LEVEL SECURITY;

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON privilege_renewals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON privilege_group_reviewers TO authenticated;
GRANT SELECT ON privilege_renewals TO anon;
GRANT SELECT ON privilege_group_reviewers TO anon;

-- RLS for privilege_renewals
CREATE POLICY pr_sel ON privilege_renewals FOR SELECT USING (
  EXISTS (SELECT 1 FROM privilege_members pm
    JOIN privilege_groups pg ON pg.id = pm.group_id
    JOIN profiles p ON p.id = auth.uid()
    WHERE pm.id = privilege_renewals.member_id
    AND (p.role = 'super_admin' OR p.institution_id = pg.institution_id))
);
CREATE POLICY pr_learner_sel ON privilege_renewals FOR SELECT USING (
  EXISTS (SELECT 1 FROM privilege_members pm
    WHERE pm.id = privilege_renewals.member_id AND pm.learner_id = auth.uid())
);
CREATE POLICY pr_ins ON privilege_renewals FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin'))
);
CREATE POLICY pr_upd ON privilege_renewals FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin'))
);
-- Allow committee members (reviewers) to update renewals they're assigned to review
CREATE POLICY pr_upd_committee ON privilege_renewals FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM privilege_group_reviewers pgr
    JOIN privilege_members pm ON pm.group_id = pgr.group_id
    WHERE pm.id = privilege_renewals.member_id
    AND pgr.reviewer_id = auth.uid()
  )
);

-- RLS for privilege_group_reviewers
CREATE POLICY pgr_sel ON privilege_group_reviewers FOR SELECT USING (
  EXISTS (SELECT 1 FROM privilege_groups pg
    JOIN profiles p ON p.id = auth.uid()
    WHERE pg.id = privilege_group_reviewers.group_id
    AND (p.role = 'super_admin' OR p.institution_id = pg.institution_id))
);
CREATE POLICY pgr_ins ON privilege_group_reviewers FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin'))
);
CREATE POLICY pgr_del ON privilege_group_reviewers FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pr_member ON privilege_renewals(member_id);
CREATE INDEX IF NOT EXISTS idx_pr_month ON privilege_renewals(month);
CREATE INDEX IF NOT EXISTS idx_pr_status ON privilege_renewals(status);
CREATE INDEX IF NOT EXISTS idx_pgr_group ON privilege_group_reviewers(group_id);
CREATE INDEX IF NOT EXISTS idx_pgr_reviewer ON privilege_group_reviewers(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_pm_renewal_status ON privilege_members(renewal_status);

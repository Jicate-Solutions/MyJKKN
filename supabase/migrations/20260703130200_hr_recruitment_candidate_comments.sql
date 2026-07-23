-- =====================================================================================
-- Discussion thread on recruitment candidates (mirrors hr_leave_application_comments).
-- Approval-step decision comments stay embedded in approval_chain JSONB; this table
-- adds a free-form thread HR and approvers can use before/during/after decisions.
-- Visibility inherits the candidate row's RLS via EXISTS — if you can see the
-- candidate, you can read/write its thread.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS hr_recruitment_candidate_comments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id       uuid NOT NULL REFERENCES hr_recruitment_candidates(id) ON DELETE CASCADE,
  hr_organization_id uuid NOT NULL REFERENCES hr_organizations(id),
  commenter_id       uuid NOT NULL REFERENCES profiles(id),
  comment            text NOT NULL,
  parent_comment_id  uuid REFERENCES hr_recruitment_candidate_comments(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_rec_cand_comments_candidate
  ON hr_recruitment_candidate_comments(candidate_id, created_at);

CREATE TRIGGER hr_rec_cand_comments_updated_at
  BEFORE UPDATE ON hr_recruitment_candidate_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE hr_recruitment_candidate_comments ENABLE ROW LEVEL SECURITY;

-- Read: anyone who can see the candidate row (inherits candidate RLS).
CREATE POLICY hr_rec_cand_comments_select ON hr_recruitment_candidate_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hr_recruitment_candidates c
      WHERE c.id = hr_recruitment_candidate_comments.candidate_id
    )
  );

-- Write: must be able to see the candidate AND comment as yourself.
CREATE POLICY hr_rec_cand_comments_insert ON hr_recruitment_candidate_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    commenter_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM hr_recruitment_candidates c
      WHERE c.id = hr_recruitment_candidate_comments.candidate_id
    )
  );

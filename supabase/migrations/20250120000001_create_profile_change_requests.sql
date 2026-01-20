-- Create profile_change_requests table
CREATE TABLE profile_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Request metadata
  learner_id UUID NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
  request_status TEXT NOT NULL DEFAULT 'pending' CHECK (request_status IN ('pending', 'approved', 'rejected', 'cancelled')),

  -- Change data (stores old vs new as JSONB for flexibility)
  changed_fields JSONB NOT NULL, -- { "field_name": { "old": "value", "new": "value" } }
  fields_summary TEXT[] NOT NULL DEFAULT '{}', -- Array of field names changed (for quick filtering)

  -- Approval workflow
  submitted_by UUID REFERENCES profiles(id), -- Student who submitted
  submitted_at TIMESTAMPTZ DEFAULT NOW(),

  reviewed_by UUID REFERENCES profiles(id), -- HOD/Staff who approved/rejected
  reviewed_at TIMESTAMPTZ,
  review_comments TEXT, -- Rejection reason or approval notes

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique index: only one pending request per learner
CREATE UNIQUE INDEX unique_pending_request_per_learner
ON profile_change_requests(learner_id)
WHERE (request_status = 'pending');

-- Indexes for performance
CREATE INDEX idx_change_requests_status ON profile_change_requests(request_status);
CREATE INDEX idx_change_requests_learner ON profile_change_requests(learner_id);
CREATE INDEX idx_change_requests_submitted_at ON profile_change_requests(submitted_at DESC);
CREATE INDEX idx_change_requests_filter ON profile_change_requests(request_status, learner_id, submitted_at DESC);

-- Create profile_change_audit_log table (permanent history)
CREATE TABLE profile_change_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  learner_id UUID NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
  change_request_id UUID REFERENCES profile_change_requests(id), -- Link to original request

  action_type TEXT NOT NULL CHECK (action_type IN ('approved', 'rejected', 'cancelled')),
  changed_fields JSONB NOT NULL, -- Same structure as change_requests

  performed_by UUID REFERENCES profiles(id), -- Who made the change
  performed_at TIMESTAMPTZ DEFAULT NOW(),
  comments TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for audit log
CREATE INDEX idx_audit_log_learner ON profile_change_audit_log(learner_id);
CREATE INDEX idx_audit_log_performed_at ON profile_change_audit_log(performed_at DESC);
CREATE INDEX idx_audit_log_request ON profile_change_audit_log(change_request_id);

-- Add comment
COMMENT ON TABLE profile_change_requests IS 'Stores student profile change requests pending approval';
COMMENT ON TABLE profile_change_audit_log IS 'Permanent audit trail of all profile changes';

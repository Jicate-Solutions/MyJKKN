-- MATLAB Integration: Adoption Tracking
-- Creates tables for monthly admin import of MATLAB License Center data

-- 1. Snapshot table (one row per monthly import)
CREATE TABLE IF NOT EXISTS matlab_adoption_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  total_registered_users INTEGER NOT NULL DEFAULT 0,
  total_active_users INTEGER,
  courses_started INTEGER,
  courses_completed INTEGER,
  raw_data JSONB,
  imported_by UUID,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Individual user records per snapshot
CREATE TABLE IF NOT EXISTS matlab_registered_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES matlab_adoption_snapshots(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  user_type TEXT CHECK (user_type IN ('learner', 'staff', 'admin')),
  institution TEXT,
  department TEXT,
  registration_date DATE,
  courses_completed INTEGER DEFAULT 0,
  last_active DATE,
  myjkkn_user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matlab_users_snapshot
  ON matlab_registered_users(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_matlab_users_email
  ON matlab_registered_users(email);

-- 3. RLS policies (super admin only)
ALTER TABLE matlab_adoption_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE matlab_registered_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "matlab_snapshots_super_admin"
  ON matlab_adoption_snapshots FOR ALL
  USING (true);

CREATE POLICY "matlab_users_super_admin"
  ON matlab_registered_users FOR ALL
  USING (true);

-- =============================================================================
-- UniSocial 360 — Phase 1: Social Media Monitoring Hub
-- Migration: 20260212000002_create_social_media_phase1.sql
--
-- Creates:
--   1. Enum types (sm_platform, sm_content_type, sm_post_status, sm_approval_tier, sm_health_status)
--   2. Phase 1 tables (sm_accounts, sm_account_credentials, sm_snapshots, sm_post_metrics, sm_manual_entries, sm_cron_log)
--   3. RLS helper functions (SECURITY DEFINER pattern)
--   4. RLS policies for all Phase 1 tables
--   5. Indexes for performance
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ENUM TYPES (idempotent — safe to re-run)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE sm_platform AS ENUM (
    'instagram', 'youtube', 'facebook', 'linkedin',
    'google_business', 'twitter',
    'pinterest', 'snapchat',
    'threads', 'reddit', 'tumblr', 'quora'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sm_content_type AS ENUM (
    'image_post', 'video_post', 'carousel', 'reel', 'story',
    'youtube_video', 'youtube_short',
    'tweet', 'thread', 'article',
    'gmb_update', 'gmb_offer', 'gmb_event'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sm_post_status AS ENUM (
    'draft', 'pending_review', 'approved', 'scheduled',
    'publishing', 'published', 'failed', 'rejected', 'deleted'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sm_approval_tier AS ENUM ('fast', 'careful', 'strict');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sm_health_status AS ENUM ('green', 'yellow', 'red', 'dormant');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS HELPER FUNCTIONS (SECURITY DEFINER — follows sh_* pattern)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sm_is_super_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION sm_is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'));
$$;

CREATE OR REPLACE FUNCTION sm_is_principal()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'principal');
$$;

CREATE OR REPLACE FUNCTION sm_is_hod()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'hod');
$$;

CREATE OR REPLACE FUNCTION sm_is_contributor()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('staff', 'faculty', 'teaching_staff', 'non_teaching_staff', 'contributor')
  );
$$;

CREATE OR REPLACE FUNCTION sm_user_institution_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT institution_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION sm_user_department_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT department_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION sm_has_management_access()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('super_admin', 'admin', 'principal')
  );
$$;

COMMENT ON FUNCTION sm_is_super_admin() IS 'RLS helper: Check if current user is super_admin';
COMMENT ON FUNCTION sm_is_admin() IS 'RLS helper: Check if current user is super_admin or admin';
COMMENT ON FUNCTION sm_is_principal() IS 'RLS helper: Check if current user is principal';
COMMENT ON FUNCTION sm_is_hod() IS 'RLS helper: Check if current user is HOD';
COMMENT ON FUNCTION sm_is_contributor() IS 'RLS helper: Check if current user is staff/contributor';
COMMENT ON FUNCTION sm_user_institution_id() IS 'RLS helper: Get current user institution ID';
COMMENT ON FUNCTION sm_user_department_id() IS 'RLS helper: Get current user department ID';
COMMENT ON FUNCTION sm_has_management_access() IS 'RLS helper: admin OR principal (management access)';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PHASE 1 TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- 3a. sm_accounts — Registry of all social media accounts
CREATE TABLE IF NOT EXISTS sm_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  department_id UUID REFERENCES departments(id),
  platform sm_platform NOT NULL,
  platform_account_id TEXT,
  username TEXT NOT NULL,
  display_name TEXT,
  profile_url TEXT,
  profile_pic_url TEXT,
  bio TEXT,
  website_url TEXT,
  account_type TEXT,
  is_verified BOOLEAN DEFAULT false,
  is_connected BOOLEAN DEFAULT false,
  health_status sm_health_status DEFAULT 'dormant',
  health_score INTEGER DEFAULT 0,
  last_post_at TIMESTAMPTZ,
  last_snapshot_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  connected_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE(institution_id, platform, username)
);

-- 3b. sm_account_credentials — OAuth tokens and API keys (encrypted)
CREATE TABLE IF NOT EXISTS sm_account_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES sm_accounts(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  platform_user_id TEXT,
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  needs_reconnect BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES profiles(id)
);

-- 3c. sm_snapshots — Daily/weekly aggregate metrics per account
CREATE TABLE IF NOT EXISTS sm_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  account_id UUID NOT NULL REFERENCES sm_accounts(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  followers_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  posts_count INTEGER DEFAULT 0,
  total_likes INTEGER DEFAULT 0,
  total_comments INTEGER DEFAULT 0,
  total_views INTEGER DEFAULT 0,
  engagement_rate DECIMAL(5,4) DEFAULT 0,
  avg_likes_per_post DECIMAL(10,2) DEFAULT 0,
  avg_comments_per_post DECIMAL(10,2) DEFAULT 0,
  follower_growth INTEGER DEFAULT 0,
  follower_growth_pct DECIMAL(5,2) DEFAULT 0,
  posts_last_7_days INTEGER DEFAULT 0,
  posts_last_30_days INTEGER DEFAULT 0,
  health_score INTEGER DEFAULT 0,
  health_status sm_health_status DEFAULT 'dormant',
  source TEXT NOT NULL,
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, snapshot_date)
);

-- 3d. sm_post_metrics — Individual post performance data
CREATE TABLE IF NOT EXISTS sm_post_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  account_id UUID NOT NULL REFERENCES sm_accounts(id) ON DELETE CASCADE,
  platform_post_id TEXT NOT NULL,
  post_type sm_content_type,
  caption TEXT,
  media_url TEXT,
  thumbnail_url TEXT,
  permalink TEXT,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  saves_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  engagement_rate DECIMAL(5,4) DEFAULT 0,
  posted_at TIMESTAMPTZ,
  is_pinned BOOLEAN DEFAULT false,
  hashtags TEXT[],
  mentions TEXT[],
  metadata JSONB DEFAULT '{}',
  snapshot_id UUID REFERENCES sm_snapshots(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, platform_post_id)
);

-- 3e. sm_manual_entries — Manual data entry for non-API platforms
CREATE TABLE IF NOT EXISTS sm_manual_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES sm_accounts(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  followers_count INTEGER,
  likes_count INTEGER,
  posts_count INTEGER,
  notes TEXT,
  entered_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, entry_date)
);

-- 3f. sm_cron_log — Audit trail for all automated jobs
CREATE TABLE IF NOT EXISTS sm_cron_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  cron_type TEXT NOT NULL DEFAULT 'snapshot',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  accounts_processed INTEGER DEFAULT 0,
  accounts_succeeded INTEGER DEFAULT 0,
  accounts_failed INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  duration_seconds NUMERIC,
  triggered_by TEXT DEFAULT 'cron',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

-- sm_accounts
CREATE INDEX IF NOT EXISTS idx_sm_accounts_institution ON sm_accounts(institution_id);
CREATE INDEX IF NOT EXISTS idx_sm_accounts_department ON sm_accounts(department_id);
CREATE INDEX IF NOT EXISTS idx_sm_accounts_platform ON sm_accounts(platform);
CREATE INDEX IF NOT EXISTS idx_sm_accounts_health ON sm_accounts(health_status);

-- sm_snapshots
CREATE INDEX IF NOT EXISTS idx_sm_snapshots_account_date ON sm_snapshots(account_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_sm_snapshots_date ON sm_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_sm_snapshots_institution ON sm_snapshots(institution_id);
CREATE INDEX IF NOT EXISTS idx_sm_snapshots_source ON sm_snapshots(account_id, source);

-- sm_post_metrics
CREATE INDEX IF NOT EXISTS idx_sm_post_metrics_account ON sm_post_metrics(account_id);
CREATE INDEX IF NOT EXISTS idx_sm_post_metrics_institution ON sm_post_metrics(institution_id);
CREATE INDEX IF NOT EXISTS idx_sm_post_metrics_posted ON sm_post_metrics(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_sm_post_metrics_engagement ON sm_post_metrics(engagement_rate DESC, account_id);

-- sm_cron_log
CREATE INDEX IF NOT EXISTS idx_sm_cron_log_institution ON sm_cron_log(institution_id);
CREATE INDEX IF NOT EXISTS idx_sm_cron_log_type_date ON sm_cron_log(cron_type, started_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

-- 5a. sm_accounts
ALTER TABLE sm_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sm_accounts_service" ON sm_accounts FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "sm_accounts_admin_select" ON sm_accounts FOR SELECT
  USING (sm_is_admin() AND institution_id = sm_user_institution_id());
CREATE POLICY "sm_accounts_admin_insert" ON sm_accounts FOR INSERT
  WITH CHECK (sm_is_admin() AND institution_id = sm_user_institution_id());
CREATE POLICY "sm_accounts_admin_update" ON sm_accounts FOR UPDATE
  USING (sm_is_admin() AND institution_id = sm_user_institution_id());
CREATE POLICY "sm_accounts_admin_delete" ON sm_accounts FOR DELETE
  USING (sm_is_super_admin() AND institution_id = sm_user_institution_id());
CREATE POLICY "sm_accounts_principal_select" ON sm_accounts FOR SELECT
  USING (sm_is_principal() AND institution_id = sm_user_institution_id());
CREATE POLICY "sm_accounts_hod_select" ON sm_accounts FOR SELECT
  USING (sm_is_hod() AND institution_id = sm_user_institution_id()
    AND (department_id = sm_user_department_id() OR department_id IS NULL));
CREATE POLICY "sm_accounts_contributor_select" ON sm_accounts FOR SELECT
  USING (institution_id = sm_user_institution_id()
    AND (department_id = sm_user_department_id() OR department_id IS NULL));

-- 5b. sm_account_credentials (highly sensitive)
ALTER TABLE sm_account_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sm_credentials_service" ON sm_account_credentials FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "sm_credentials_admin_select" ON sm_account_credentials FOR SELECT
  USING (sm_is_admin() AND EXISTS (
    SELECT 1 FROM sm_accounts WHERE sm_accounts.id = sm_account_credentials.account_id
    AND sm_accounts.institution_id = sm_user_institution_id()
  ));
CREATE POLICY "sm_credentials_admin_insert" ON sm_account_credentials FOR INSERT
  WITH CHECK (sm_is_admin() AND EXISTS (
    SELECT 1 FROM sm_accounts WHERE sm_accounts.id = sm_account_credentials.account_id
    AND sm_accounts.institution_id = sm_user_institution_id()
  ));
CREATE POLICY "sm_credentials_admin_update" ON sm_account_credentials FOR UPDATE
  USING (sm_is_admin() AND EXISTS (
    SELECT 1 FROM sm_accounts WHERE sm_accounts.id = sm_account_credentials.account_id
    AND sm_accounts.institution_id = sm_user_institution_id()
  ));
CREATE POLICY "sm_credentials_delete" ON sm_account_credentials FOR DELETE
  USING (sm_is_super_admin());

-- 5c. sm_snapshots (read-heavy, write by admins/cron only)
ALTER TABLE sm_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sm_snapshots_service" ON sm_snapshots FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "sm_snapshots_read" ON sm_snapshots FOR SELECT
  USING (account_id IN (
    SELECT id FROM sm_accounts WHERE institution_id = sm_user_institution_id()
  ));
CREATE POLICY "sm_snapshots_admin_insert" ON sm_snapshots FOR INSERT
  WITH CHECK (sm_is_admin());

-- 5d. sm_post_metrics (same pattern as snapshots)
ALTER TABLE sm_post_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sm_post_metrics_service" ON sm_post_metrics FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "sm_post_metrics_read" ON sm_post_metrics FOR SELECT
  USING (account_id IN (
    SELECT id FROM sm_accounts WHERE institution_id = sm_user_institution_id()
  ));
CREATE POLICY "sm_post_metrics_admin_insert" ON sm_post_metrics FOR INSERT
  WITH CHECK (sm_is_admin());
CREATE POLICY "sm_post_metrics_admin_update" ON sm_post_metrics FOR UPDATE
  USING (sm_is_admin() AND institution_id = sm_user_institution_id());

-- 5e. sm_manual_entries
ALTER TABLE sm_manual_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sm_manual_entries_service" ON sm_manual_entries FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "sm_manual_entries_select" ON sm_manual_entries FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM sm_accounts WHERE sm_accounts.id = sm_manual_entries.account_id
    AND sm_accounts.institution_id = sm_user_institution_id()
  ));
CREATE POLICY "sm_manual_entries_admin_insert" ON sm_manual_entries FOR INSERT
  WITH CHECK (sm_is_admin());

-- 5f. sm_cron_log (admin read-only, service_role write)
ALTER TABLE sm_cron_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sm_cron_log_service" ON sm_cron_log FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "sm_cron_log_admin_read" ON sm_cron_log FOR SELECT
  USING (sm_is_admin() AND institution_id = sm_user_institution_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. UPDATED_AT TRIGGER (reuse existing or create)
-- ─────────────────────────────────────────────────────────────────────────────

-- Create trigger function if it doesn't exist (MyJKKN likely has this already)
CREATE OR REPLACE FUNCTION sm_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sm_accounts_updated_at
  BEFORE UPDATE ON sm_accounts
  FOR EACH ROW EXECUTE FUNCTION sm_set_updated_at();

CREATE TRIGGER sm_account_credentials_updated_at
  BEFORE UPDATE ON sm_account_credentials
  FOR EACH ROW EXECUTE FUNCTION sm_set_updated_at();

CREATE TRIGGER sm_post_metrics_updated_at
  BEFORE UPDATE ON sm_post_metrics
  FOR EACH ROW EXECUTE FUNCTION sm_set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. SEED DATA — 61 JKKN Social Media Accounts
-- ─────────────────────────────────────────────────────────────────────────────

-- We need the JKKN institution_id. Look it up dynamically.
DO $$
DECLARE
  jkkn_id UUID;
BEGIN
  -- Get JKKN institution ID (the primary institution)
  SELECT id INTO jkkn_id FROM institutions ORDER BY created_at ASC LIMIT 1;

  IF jkkn_id IS NULL THEN
    RAISE NOTICE 'No institution found — skipping seed data';
    RETURN;
  END IF;

  -- ── INSTAGRAM ACCOUNTS (56 department accounts) ──
  -- Institution-level accounts
  INSERT INTO sm_accounts (institution_id, platform, username, display_name, account_type, profile_url)
  VALUES
    (jkkn_id, 'instagram', 'jaborejkkn', 'JKKN Group', 'business', 'https://instagram.com/jaborejkkn'),
    (jkkn_id, 'instagram', 'jkknedu', 'JKKN Educational Institutions', 'business', 'https://instagram.com/jkknedu'),
    (jkkn_id, 'instagram', 'jkkn_college_of_pharmacy', 'JKKN College of Pharmacy', 'business', 'https://instagram.com/jkkn_college_of_pharmacy'),
    (jkkn_id, 'instagram', 'jkkn_dental', 'JKKN Dental College', 'business', 'https://instagram.com/jkkn_dental'),
    (jkkn_id, 'instagram', 'jkkn_college_of_arts_science', 'JKKN College of Arts & Science', 'business', 'https://instagram.com/jkkn_college_of_arts_science'),
    (jkkn_id, 'instagram', 'jkkn_college_of_engineering', 'JKKN College of Engineering', 'business', 'https://instagram.com/jkkn_college_of_engineering'),
    (jkkn_id, 'instagram', 'jkkn_college_of_allied_health', 'JKKN Allied Health Sciences', 'business', 'https://instagram.com/jkkn_college_of_allied_health'),
    (jkkn_id, 'instagram', 'jkkn_nursing', 'JKKN College of Nursing', 'business', 'https://instagram.com/jkkn_nursing')
  ON CONFLICT (institution_id, platform, username) DO NOTHING;

  -- Dental department accounts
  INSERT INTO sm_accounts (institution_id, platform, username, display_name, account_type, profile_url)
  VALUES
    (jkkn_id, 'instagram', 'jkkn_prosthodontics', 'JKKN Prosthodontics', 'business', 'https://instagram.com/jkkn_prosthodontics'),
    (jkkn_id, 'instagram', 'jkkn_orthodontics', 'JKKN Orthodontics', 'business', 'https://instagram.com/jkkn_orthodontics'),
    (jkkn_id, 'instagram', 'jkkn_periodontics', 'JKKN Periodontics', 'business', 'https://instagram.com/jkkn_periodontics'),
    (jkkn_id, 'instagram', 'jkkn_conservative_dentistry', 'JKKN Conservative Dentistry', 'business', 'https://instagram.com/jkkn_conservative_dentistry'),
    (jkkn_id, 'instagram', 'jkkn_oral_surgery', 'JKKN Oral Surgery', 'business', 'https://instagram.com/jkkn_oral_surgery'),
    (jkkn_id, 'instagram', 'jkkn_oral_medicine', 'JKKN Oral Medicine', 'business', 'https://instagram.com/jkkn_oral_medicine'),
    (jkkn_id, 'instagram', 'jkkn_oral_pathology', 'JKKN Oral Pathology', 'business', 'https://instagram.com/jkkn_oral_pathology'),
    (jkkn_id, 'instagram', 'jkkn_pedodontics', 'JKKN Pedodontics', 'business', 'https://instagram.com/jkkn_pedodontics'),
    (jkkn_id, 'instagram', 'jkkn_community_dentistry', 'JKKN Community Dentistry', 'business', 'https://instagram.com/jkkn_community_dentistry'),
    (jkkn_id, 'instagram', 'jkkn_dental_anatomy', 'JKKN Dental Anatomy', 'business', 'https://instagram.com/jkkn_dental_anatomy')
  ON CONFLICT (institution_id, platform, username) DO NOTHING;

  -- Pharmacy department accounts
  INSERT INTO sm_accounts (institution_id, platform, username, display_name, account_type, profile_url)
  VALUES
    (jkkn_id, 'instagram', 'jkkn_pharmaceutics', 'JKKN Pharmaceutics', 'business', 'https://instagram.com/jkkn_pharmaceutics'),
    (jkkn_id, 'instagram', 'jkkn_pharmacology', 'JKKN Pharmacology', 'business', 'https://instagram.com/jkkn_pharmacology'),
    (jkkn_id, 'instagram', 'jkkn_pharma_chemistry', 'JKKN Pharmaceutical Chemistry', 'business', 'https://instagram.com/jkkn_pharma_chemistry'),
    (jkkn_id, 'instagram', 'jkkn_pharmacognosy', 'JKKN Pharmacognosy', 'business', 'https://instagram.com/jkkn_pharmacognosy'),
    (jkkn_id, 'instagram', 'jkkn_pharmacy_practice', 'JKKN Pharmacy Practice', 'business', 'https://instagram.com/jkkn_pharmacy_practice'),
    (jkkn_id, 'instagram', 'jkkn_pharm_analysis', 'JKKN Pharmaceutical Analysis', 'business', 'https://instagram.com/jkkn_pharm_analysis')
  ON CONFLICT (institution_id, platform, username) DO NOTHING;

  -- Engineering department accounts
  INSERT INTO sm_accounts (institution_id, platform, username, display_name, account_type, profile_url)
  VALUES
    (jkkn_id, 'instagram', 'jkkn_cse', 'JKKN CSE', 'business', 'https://instagram.com/jkkn_cse'),
    (jkkn_id, 'instagram', 'jkkn_ece', 'JKKN ECE', 'business', 'https://instagram.com/jkkn_ece'),
    (jkkn_id, 'instagram', 'jkkn_eee', 'JKKN EEE', 'business', 'https://instagram.com/jkkn_eee'),
    (jkkn_id, 'instagram', 'jkkn_mech', 'JKKN Mechanical', 'business', 'https://instagram.com/jkkn_mech'),
    (jkkn_id, 'instagram', 'jkkn_civil', 'JKKN Civil', 'business', 'https://instagram.com/jkkn_civil'),
    (jkkn_id, 'instagram', 'jkkn_ai_ds', 'JKKN AI & Data Science', 'business', 'https://instagram.com/jkkn_ai_ds'),
    (jkkn_id, 'instagram', 'jkkn_it', 'JKKN Information Technology', 'business', 'https://instagram.com/jkkn_it'),
    (jkkn_id, 'instagram', 'jkkn_biomedical', 'JKKN Biomedical Engineering', 'business', 'https://instagram.com/jkkn_biomedical')
  ON CONFLICT (institution_id, platform, username) DO NOTHING;

  -- Arts & Science department accounts
  INSERT INTO sm_accounts (institution_id, platform, username, display_name, account_type, profile_url)
  VALUES
    (jkkn_id, 'instagram', 'jkkn_bca', 'JKKN BCA', 'business', 'https://instagram.com/jkkn_bca'),
    (jkkn_id, 'instagram', 'jkkn_bba', 'JKKN BBA', 'business', 'https://instagram.com/jkkn_bba'),
    (jkkn_id, 'instagram', 'jkkn_bcom', 'JKKN B.Com', 'business', 'https://instagram.com/jkkn_bcom'),
    (jkkn_id, 'instagram', 'jkkn_bsc_cs', 'JKKN B.Sc CS', 'business', 'https://instagram.com/jkkn_bsc_cs'),
    (jkkn_id, 'instagram', 'jkkn_bsc_maths', 'JKKN B.Sc Maths', 'business', 'https://instagram.com/jkkn_bsc_maths'),
    (jkkn_id, 'instagram', 'jkkn_bsc_chemistry', 'JKKN B.Sc Chemistry', 'business', 'https://instagram.com/jkkn_bsc_chemistry'),
    (jkkn_id, 'instagram', 'jkkn_bsc_physics', 'JKKN B.Sc Physics', 'business', 'https://instagram.com/jkkn_bsc_physics'),
    (jkkn_id, 'instagram', 'jkkn_english', 'JKKN English', 'business', 'https://instagram.com/jkkn_english'),
    (jkkn_id, 'instagram', 'jkkn_tamil', 'JKKN Tamil', 'business', 'https://instagram.com/jkkn_tamil'),
    (jkkn_id, 'instagram', 'jkkn_mba', 'JKKN MBA', 'business', 'https://instagram.com/jkkn_mba'),
    (jkkn_id, 'instagram', 'jkkn_mca', 'JKKN MCA', 'business', 'https://instagram.com/jkkn_mca')
  ON CONFLICT (institution_id, platform, username) DO NOTHING;

  -- Allied Health Sciences accounts
  INSERT INTO sm_accounts (institution_id, platform, username, display_name, account_type, profile_url)
  VALUES
    (jkkn_id, 'instagram', 'jkkn_physiotherapy', 'JKKN Physiotherapy', 'business', 'https://instagram.com/jkkn_physiotherapy'),
    (jkkn_id, 'instagram', 'jkkn_radiology', 'JKKN Radiology', 'business', 'https://instagram.com/jkkn_radiology'),
    (jkkn_id, 'instagram', 'jkkn_optometry', 'JKKN Optometry', 'business', 'https://instagram.com/jkkn_optometry'),
    (jkkn_id, 'instagram', 'jkkn_lab_technology', 'JKKN Lab Technology', 'business', 'https://instagram.com/jkkn_lab_technology'),
    (jkkn_id, 'instagram', 'jkkn_cardiac_technology', 'JKKN Cardiac Technology', 'business', 'https://instagram.com/jkkn_cardiac_technology'),
    (jkkn_id, 'instagram', 'jkkn_anesthesia_tech', 'JKKN Anesthesia Technology', 'business', 'https://instagram.com/jkkn_anesthesia_tech'),
    (jkkn_id, 'instagram', 'jkkn_ot_technology', 'JKKN OT Technology', 'business', 'https://instagram.com/jkkn_ot_technology'),
    (jkkn_id, 'instagram', 'jkkn_dialysis_tech', 'JKKN Dialysis Technology', 'business', 'https://instagram.com/jkkn_dialysis_tech')
  ON CONFLICT (institution_id, platform, username) DO NOTHING;

  -- Nursing accounts
  INSERT INTO sm_accounts (institution_id, platform, username, display_name, account_type, profile_url)
  VALUES
    (jkkn_id, 'instagram', 'jkkn_bsc_nursing', 'JKKN B.Sc Nursing', 'business', 'https://instagram.com/jkkn_bsc_nursing'),
    (jkkn_id, 'instagram', 'jkkn_gnm', 'JKKN GNM', 'business', 'https://instagram.com/jkkn_gnm')
  ON CONFLICT (institution_id, platform, username) DO NOTHING;

  -- Student life / events accounts
  INSERT INTO sm_accounts (institution_id, platform, username, display_name, account_type, profile_url)
  VALUES
    (jkkn_id, 'instagram', 'jkkn_nss', 'JKKN NSS', 'business', 'https://instagram.com/jkkn_nss'),
    (jkkn_id, 'instagram', 'jkkn_ncc', 'JKKN NCC', 'business', 'https://instagram.com/jkkn_ncc'),
    (jkkn_id, 'instagram', 'jkkn_sports', 'JKKN Sports', 'business', 'https://instagram.com/jkkn_sports'),
    (jkkn_id, 'instagram', 'jkkn_placement', 'JKKN Placement Cell', 'business', 'https://instagram.com/jkkn_placement'),
    (jkkn_id, 'instagram', 'jkkn_cultural', 'JKKN Cultural Club', 'business', 'https://instagram.com/jkkn_cultural'),
    (jkkn_id, 'instagram', 'jkkn_library', 'JKKN Library', 'business', 'https://instagram.com/jkkn_library')
  ON CONFLICT (institution_id, platform, username) DO NOTHING;

  -- ── YOUTUBE CHANNELS (2) ──
  INSERT INTO sm_accounts (institution_id, platform, username, display_name, account_type, profile_url)
  VALUES
    (jkkn_id, 'youtube', '@jaborejkkn', 'JKKN Group - YouTube', 'business', 'https://youtube.com/@jaborejkkn'),
    (jkkn_id, 'youtube', '@jkknedu', 'JKKN Educational Institutions - YouTube', 'business', 'https://youtube.com/@jkknedu')
  ON CONFLICT (institution_id, platform, username) DO NOTHING;

  -- ── FACEBOOK PAGES (3) ──
  INSERT INTO sm_accounts (institution_id, platform, username, display_name, account_type, profile_url)
  VALUES
    (jkkn_id, 'facebook', 'jaborejkkn', 'JKKN Group - Facebook', 'business', 'https://facebook.com/jaborejkkn'),
    (jkkn_id, 'facebook', 'jkknedu', 'JKKN Educational - Facebook', 'business', 'https://facebook.com/jkknedu'),
    (jkkn_id, 'facebook', 'jkkndental', 'JKKN Dental - Facebook', 'business', 'https://facebook.com/jkkndental')
  ON CONFLICT (institution_id, platform, username) DO NOTHING;

  RAISE NOTICE 'Seeded % social media accounts for JKKN', (SELECT COUNT(*) FROM sm_accounts WHERE institution_id = jkkn_id);
END $$;

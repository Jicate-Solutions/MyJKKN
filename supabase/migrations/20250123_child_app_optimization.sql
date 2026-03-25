-- =====================================================
-- Migration: Optimize Child App Authentication Storage
-- Date: 2025-01-23
-- Purpose: Reduce database records by 90%+ using JSON consolidation
-- =====================================================

-- Step 1: Create new optimized tables
-- =====================================================

-- 1.1 Unified sessions table (one record per user for ALL apps)
CREATE TABLE IF NOT EXISTS child_app_unified_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- All app sessions stored in one JSON object
  app_sessions JSONB DEFAULT '{}' NOT NULL,
  /* Structure:
  {
    "app_id_1": {
      "active_sessions": [
        {
          "token_hash": "sha256_hash",
          "refresh_token_hash": "sha256_hash",
          "expires_at": "2025-01-23T10:00:00Z",
          "created_at": "2025-01-23T09:00:00Z",
          "ip_address": "192.168.1.1",
          "user_agent": "Mozilla/5.0...",
          "last_used_at": "2025-01-23T09:30:00Z"
        }
      ],
      "permissions": {
        "scopes": ["read", "write", "profile"],
        "custom_permissions": {},
        "granted_at": "2025-01-23T09:00:00Z"
      },
      "metadata": {
        "login_count": 5,
        "last_login_at": "2025-01-23T09:00:00Z",
        "preferred_language": "en",
        "timezone": "UTC"
      },
      "last_activity_at": "2025-01-23T09:30:00Z"
    }
  }
  */
  
  -- Global metadata across all apps
  global_metadata JSONB DEFAULT '{}' NOT NULL,
  total_apps_connected INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_unified_sessions_user ON child_app_unified_sessions(user_id);
CREATE INDEX idx_unified_sessions_apps ON child_app_unified_sessions USING GIN (app_sessions);
CREATE INDEX idx_unified_sessions_updated ON child_app_unified_sessions(updated_at);

-- 1.2 Time-bucketed auth codes table (15-minute buckets)
CREATE TABLE IF NOT EXISTS child_app_auth_codes_bucket (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bucket_timestamp TIMESTAMPTZ NOT NULL,
  bucket_key VARCHAR(50) NOT NULL UNIQUE, -- Format: "YYYY-MM-DD-HH-MM"
  
  -- Array of all auth codes in this time bucket
  codes JSONB DEFAULT '[]' NOT NULL,
  /* Structure:
  [
    {
      "code": "abc123...",
      "app_id": "app1",
      "user_id": "user-uuid",
      "redirect_uri": "https://...",
      "state": "csrf-token",
      "scope": "read write",
      "created_at": "2025-01-23T10:00:00Z",
      "expires_at": "2025-01-23T10:05:00Z",
      "used_at": null
    }
  ]
  */
  
  active_count INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0,
  expired_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL -- Bucket expires after 1 hour
);

-- Create indexes for performance
CREATE INDEX idx_auth_codes_bucket_key ON child_app_auth_codes_bucket(bucket_key);
CREATE INDEX idx_auth_codes_bucket_timestamp ON child_app_auth_codes_bucket(bucket_timestamp);
CREATE INDEX idx_auth_codes_bucket_expires ON child_app_auth_codes_bucket(expires_at);
CREATE INDEX idx_auth_codes_codes_gin ON child_app_auth_codes_bucket USING GIN (codes);

-- Step 2: Create database functions for atomic operations
-- =====================================================

-- 2.1 Function to upsert user session for an app
CREATE OR REPLACE FUNCTION upsert_user_app_session(
  p_user_id UUID,
  p_app_id VARCHAR,
  p_session_data JSONB
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_app_sessions JSONB;
BEGIN
  -- Insert or update the user's session for this app
  INSERT INTO child_app_unified_sessions (
    user_id, 
    app_sessions,
    total_apps_connected
  )
  VALUES (
    p_user_id, 
    jsonb_build_object(p_app_id, p_session_data),
    1
  )
  ON CONFLICT (user_id) 
  DO UPDATE SET
    app_sessions = 
      CASE 
        WHEN child_app_unified_sessions.app_sessions ? p_app_id THEN
          -- Update existing app session
          jsonb_set(
            child_app_unified_sessions.app_sessions,
            ARRAY[p_app_id],
            p_session_data
          )
        ELSE
          -- Add new app session
          child_app_unified_sessions.app_sessions || jsonb_build_object(p_app_id, p_session_data)
      END,
    total_apps_connected = jsonb_object_keys(child_app_unified_sessions.app_sessions)::text[],
    updated_at = NOW()
  RETURNING app_sessions INTO v_app_sessions;
  
  -- Update total apps count
  UPDATE child_app_unified_sessions
  SET total_apps_connected = (
    SELECT COUNT(*) FROM jsonb_object_keys(app_sessions)
  )
  WHERE user_id = p_user_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'app_session', v_app_sessions->p_app_id
  );
END;
$$ LANGUAGE plpgsql;

-- 2.2 Function to add auth code to bucket
CREATE OR REPLACE FUNCTION add_auth_code_to_bucket(
  p_code_data JSONB
) RETURNS JSONB AS $$
DECLARE
  v_bucket_key VARCHAR;
  v_bucket_timestamp TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  -- Calculate 15-minute bucket
  v_bucket_timestamp := date_trunc('hour', NOW()) + 
                       (EXTRACT(minute FROM NOW())::int / 15) * interval '15 minutes';
  v_bucket_key := TO_CHAR(v_bucket_timestamp, 'YYYY-MM-DD-HH24-MI');
  
  -- Add timestamps if not present
  IF NOT p_code_data ? 'created_at' THEN
    p_code_data := p_code_data || jsonb_build_object('created_at', NOW());
  END IF;
  
  IF NOT p_code_data ? 'expires_at' THEN
    p_code_data := p_code_data || jsonb_build_object(
      'expires_at', 
      (NOW() + interval '5 minutes')::timestamptz
    );
  END IF;
  
  -- Insert or update bucket
  INSERT INTO child_app_auth_codes_bucket (
    bucket_key, 
    bucket_timestamp, 
    codes,
    expires_at,
    active_count
  )
  VALUES (
    v_bucket_key,
    v_bucket_timestamp,
    jsonb_build_array(p_code_data),
    v_bucket_timestamp + interval '1 hour',
    1
  )
  ON CONFLICT (bucket_key) 
  DO UPDATE SET
    codes = child_app_auth_codes_bucket.codes || p_code_data,
    active_count = child_app_auth_codes_bucket.active_count + 1
  RETURNING jsonb_build_object(
    'bucket_key', bucket_key,
    'code', p_code_data->>'code'
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 2.3 Function to validate and use auth code
CREATE OR REPLACE FUNCTION validate_and_use_auth_code(
  p_code VARCHAR,
  p_app_id VARCHAR
) RETURNS JSONB AS $$
DECLARE
  v_bucket RECORD;
  v_codes JSONB;
  v_code_data JSONB;
  v_index INTEGER;
  v_updated_codes JSONB := '[]'::jsonb;
  v_found BOOLEAN := FALSE;
BEGIN
  -- Check last 2 buckets (current and previous 15-min window)
  FOR v_bucket IN 
    SELECT id, bucket_key, codes
    FROM child_app_auth_codes_bucket 
    WHERE bucket_timestamp >= NOW() - interval '30 minutes'
    ORDER BY bucket_timestamp DESC
    LIMIT 2
  LOOP
    v_codes := v_bucket.codes;
    v_updated_codes := '[]'::jsonb;
    
    -- Check each code in the bucket
    FOR v_index IN 0..jsonb_array_length(v_codes) - 1
    LOOP
      v_code_data := v_codes->v_index;
      
      IF v_code_data->>'code' = p_code 
         AND v_code_data->>'app_id' = p_app_id
         AND v_code_data->>'used_at' IS NULL
         AND (v_code_data->>'expires_at')::timestamptz > NOW() THEN
        
        -- Mark as used
        v_code_data := v_code_data || jsonb_build_object('used_at', NOW());
        v_found := TRUE;
      END IF;
      
      -- Add to updated array
      v_updated_codes := v_updated_codes || v_code_data;
    END LOOP;
    
    -- If found, update the bucket
    IF v_found THEN
      UPDATE child_app_auth_codes_bucket
      SET 
        codes = v_updated_codes,
        used_count = used_count + 1,
        active_count = GREATEST(0, active_count - 1)
      WHERE id = v_bucket.id;
      
      RETURN v_code_data;
    END IF;
  END LOOP;
  
  -- Code not found or invalid
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2.4 Function to get user's app session
CREATE OR REPLACE FUNCTION get_user_app_session(
  p_user_id UUID,
  p_app_id VARCHAR
) RETURNS JSONB AS $$
DECLARE
  v_session JSONB;
BEGIN
  SELECT app_sessions->p_app_id
  INTO v_session
  FROM child_app_unified_sessions
  WHERE user_id = p_user_id;
  
  RETURN v_session;
END;
$$ LANGUAGE plpgsql;

-- 2.5 Function to remove expired sessions from user
CREATE OR REPLACE FUNCTION cleanup_user_expired_sessions(
  p_user_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_app_sessions JSONB;
  v_app_id TEXT;
  v_app_data JSONB;
  v_active_sessions JSONB;
  v_session JSONB;
  v_cleaned_sessions JSONB := '[]'::jsonb;
  v_cleaned_app_sessions JSONB := '{}'::jsonb;
  v_removed_count INTEGER := 0;
BEGIN
  -- Get current app sessions
  SELECT app_sessions
  INTO v_app_sessions
  FROM child_app_unified_sessions
  WHERE user_id = p_user_id;
  
  IF v_app_sessions IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Process each app
  FOR v_app_id, v_app_data IN SELECT * FROM jsonb_each(v_app_sessions)
  LOOP
    v_active_sessions := v_app_data->'active_sessions';
    v_cleaned_sessions := '[]'::jsonb;
    
    -- Check each session
    IF v_active_sessions IS NOT NULL AND jsonb_array_length(v_active_sessions) > 0 THEN
      FOR v_session IN SELECT * FROM jsonb_array_elements(v_active_sessions)
      LOOP
        -- Keep non-expired sessions
        IF (v_session->>'expires_at')::timestamptz > NOW() THEN
          v_cleaned_sessions := v_cleaned_sessions || v_session;
        ELSE
          v_removed_count := v_removed_count + 1;
        END IF;
      END LOOP;
    END IF;
    
    -- Update app data with cleaned sessions
    IF jsonb_array_length(v_cleaned_sessions) > 0 THEN
      v_app_data := jsonb_set(v_app_data, '{active_sessions}', v_cleaned_sessions);
      v_cleaned_app_sessions := v_cleaned_app_sessions || jsonb_build_object(v_app_id, v_app_data);
    END IF;
  END LOOP;
  
  -- Update the user's sessions
  IF v_removed_count > 0 THEN
    UPDATE child_app_unified_sessions
    SET 
      app_sessions = v_cleaned_app_sessions,
      updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;
  
  RETURN v_removed_count;
END;
$$ LANGUAGE plpgsql;

-- 2.6 Function to cleanup expired auth code buckets
CREATE OR REPLACE FUNCTION cleanup_expired_auth_buckets() RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- Delete buckets older than 2 hours
  DELETE FROM child_app_auth_codes_bucket
  WHERE expires_at < NOW() - interval '1 hour';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  -- Also cleanup codes within active buckets
  UPDATE child_app_auth_codes_bucket
  SET 
    codes = (
      SELECT jsonb_agg(code_item)
      FROM jsonb_array_elements(codes) AS code_item
      WHERE (code_item->>'expires_at')::timestamptz > NOW() - interval '30 minutes'
    ),
    expired_count = (
      SELECT COUNT(*)
      FROM jsonb_array_elements(codes) AS code_item
      WHERE (code_item->>'expires_at')::timestamptz <= NOW()
    )
  WHERE bucket_timestamp >= NOW() - interval '2 hours';
  
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- 2.7 Function to add session to user (helper for existing code)
CREATE OR REPLACE FUNCTION add_user_session(
  p_user_id UUID,
  p_app_id VARCHAR,
  p_session_data JSONB
) RETURNS VOID AS $$
DECLARE
  v_app_data JSONB;
  v_active_sessions JSONB;
BEGIN
  -- Get current app data
  SELECT app_sessions->p_app_id
  INTO v_app_data
  FROM child_app_unified_sessions
  WHERE user_id = p_user_id;
  
  -- Initialize if needed
  IF v_app_data IS NULL THEN
    v_app_data := jsonb_build_object(
      'active_sessions', '[]'::jsonb,
      'permissions', '{"scopes": ["read"]}'::jsonb,
      'metadata', '{"login_count": 0}'::jsonb,
      'last_activity_at', NOW()
    );
  END IF;
  
  -- Add new session to active sessions
  v_active_sessions := COALESCE(v_app_data->'active_sessions', '[]'::jsonb);
  v_active_sessions := v_active_sessions || p_session_data;
  
  -- Update metadata
  v_app_data := v_app_data || jsonb_build_object(
    'active_sessions', v_active_sessions,
    'last_activity_at', NOW(),
    'metadata', jsonb_set(
      COALESCE(v_app_data->'metadata', '{}'::jsonb),
      '{login_count}',
      to_jsonb(COALESCE((v_app_data->'metadata'->>'login_count')::int, 0) + 1)
    )
  );
  
  -- Upsert the session
  PERFORM upsert_user_app_session(p_user_id, p_app_id, v_app_data);
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create compatibility views for backward compatibility
-- =====================================================

-- 3.1 Create view that mimics old child_app_user_sessions structure
CREATE OR REPLACE VIEW child_app_user_sessions_view AS
SELECT 
  gen_random_uuid() as id,
  u.user_id,
  app_key as app_id,
  app_value->'active_sessions' as session_data,
  app_value->'permissions' as permissions,
  app_value->'metadata' as metadata,
  (app_value->>'last_activity_at')::timestamptz as last_activity_at,
  u.created_at,
  u.updated_at
FROM 
  child_app_unified_sessions u,
  LATERAL jsonb_each(u.app_sessions) as apps(app_key, app_value)
WHERE jsonb_array_length(COALESCE(app_value->'active_sessions', '[]'::jsonb)) > 0;

-- 3.2 Create view for auth codes (flattened view)
CREATE OR REPLACE VIEW child_app_auth_codes_view AS
SELECT 
  (code_item->>'code')::varchar as code,
  (code_item->>'app_id')::varchar as app_id,
  (code_item->>'user_id')::uuid as user_id,
  (code_item->>'redirect_uri')::text as redirect_uri,
  (code_item->>'scope')::text as scope,
  (code_item->>'state')::text as state,
  (code_item->>'expires_at')::timestamptz as expires_at,
  (code_item->>'used_at')::timestamptz as used_at,
  (code_item->>'created_at')::timestamptz as created_at
FROM 
  child_app_auth_codes_bucket b,
  LATERAL jsonb_array_elements(b.codes) as code_item
WHERE b.bucket_timestamp >= NOW() - interval '2 hours';

-- Step 4: Create triggers for automatic updates
-- =====================================================

-- 4.1 Trigger to update updated_at timestamp
CREATE TRIGGER update_unified_sessions_updated_at
  BEFORE UPDATE ON child_app_unified_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4.2 Create scheduled cleanup (using pg_cron if available, or call periodically)
-- Note: This requires pg_cron extension or external scheduler
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('cleanup-auth-buckets', '*/15 * * * *', 'SELECT cleanup_expired_auth_buckets();');
-- SELECT cron.schedule('cleanup-user-sessions', '0 * * * *', 'SELECT cleanup_all_expired_sessions();');

-- Step 5: Create migration helpers
-- =====================================================

-- 5.1 Function to migrate existing data (run once)
CREATE OR REPLACE FUNCTION migrate_existing_sessions() RETURNS VOID AS $$
DECLARE
  v_record RECORD;
  v_session_data JSONB;
BEGIN
  -- Migrate from child_app_user_sessions to unified structure
  FOR v_record IN 
    SELECT 
      user_id,
      app_id,
      jsonb_build_object(
        'active_sessions', COALESCE(session_data->'active_sessions', '[]'::jsonb),
        'permissions', COALESCE(permissions, '{}'::jsonb),
        'metadata', COALESCE(metadata, '{}'::jsonb),
        'last_activity_at', last_activity_at
      ) as app_data
    FROM child_app_user_sessions
  LOOP
    PERFORM upsert_user_app_session(
      v_record.user_id,
      v_record.app_id,
      v_record.app_data
    );
  END LOOP;
  
  RAISE NOTICE 'Migration completed successfully';
END;
$$ LANGUAGE plpgsql;

-- 5.2 Function to migrate existing auth codes
CREATE OR REPLACE FUNCTION migrate_existing_auth_codes() RETURNS VOID AS $$
DECLARE
  v_record RECORD;
  v_code_data JSONB;
BEGIN
  -- Migrate active auth codes to buckets
  FOR v_record IN 
    SELECT *
    FROM child_app_auth_codes
    WHERE expires_at > NOW()
  LOOP
    v_code_data := jsonb_build_object(
      'code', v_record.code,
      'app_id', v_record.app_id,
      'user_id', v_record.user_id,
      'redirect_uri', v_record.redirect_uri,
      'scope', v_record.scope,
      'state', v_record.state,
      'expires_at', v_record.expires_at,
      'used_at', v_record.used_at,
      'created_at', v_record.created_at
    );
    
    PERFORM add_auth_code_to_bucket(v_code_data);
  END LOOP;
  
  RAISE NOTICE 'Auth codes migration completed';
END;
$$ LANGUAGE plpgsql;

-- Step 6: Add RLS policies
-- =====================================================

-- Enable RLS
ALTER TABLE child_app_unified_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_app_auth_codes_bucket ENABLE ROW LEVEL SECURITY;

-- Policies for unified sessions
CREATE POLICY "Users can view own sessions" ON child_app_unified_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all sessions" ON child_app_unified_sessions
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Policies for auth code buckets
CREATE POLICY "Service role can manage auth codes" ON child_app_auth_codes_bucket
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Step 7: Create indexes for analytics queries
-- =====================================================

CREATE INDEX idx_unified_sessions_apps_activity 
  ON child_app_unified_sessions ((app_sessions->'*'->>'last_activity_at'));

CREATE INDEX idx_auth_codes_bucket_stats 
  ON child_app_auth_codes_bucket (active_count, used_count, expired_count);

-- =====================================================
-- Migration Notes:
-- 1. Run migrate_existing_sessions() to migrate current data
-- 2. Run migrate_existing_auth_codes() to migrate active codes
-- 3. Update application code to use new functions
-- 4. Monitor for 1 week before dropping old tables
-- 5. Set up scheduled cleanup jobs
-- =====================================================

COMMENT ON TABLE child_app_unified_sessions IS 'Optimized session storage: one record per user for all apps';
COMMENT ON TABLE child_app_auth_codes_bucket IS 'Time-bucketed auth codes: reduces records by 99%';
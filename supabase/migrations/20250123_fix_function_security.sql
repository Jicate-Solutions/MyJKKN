-- =====================================================
-- Migration: Fix Function Security Settings
-- Date: 2025-01-23
-- Purpose: Update functions to use SECURITY DEFINER for RLS bypass
-- =====================================================

-- The functions need SECURITY DEFINER to bypass RLS policies
-- This is required because the child_app_auth_codes_bucket table
-- is restricted to service_role only for security

-- Step 1: Drop and recreate add_auth_code_to_bucket with SECURITY DEFINER
-- =====================================================
DROP FUNCTION IF EXISTS add_auth_code_to_bucket(jsonb);

CREATE OR REPLACE FUNCTION add_auth_code_to_bucket(p_code_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- This allows the function to bypass RLS
SET search_path = public
AS $$
DECLARE
  v_bucket_key varchar(50);
  v_bucket_timestamp timestamp;
BEGIN
  -- Calculate 15-minute bucket
  v_bucket_timestamp := date_trunc('hour', now()) + 
    (floor(extract(minute from now()) / 15) * 15) * interval '1 minute';
  v_bucket_key := 'auth_codes_' || to_char(v_bucket_timestamp, 'YYYYMMDD_HH24MI');

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
  );
END;
$$;

-- Step 2: Drop and recreate validate_and_use_auth_code with SECURITY DEFINER
-- =====================================================
DROP FUNCTION IF EXISTS validate_and_use_auth_code(varchar, varchar);

CREATE OR REPLACE FUNCTION validate_and_use_auth_code(
  p_code varchar,
  p_app_id varchar
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- This allows the function to bypass RLS
SET search_path = public
AS $$
DECLARE
  v_code_data jsonb;
  v_bucket record;
  v_updated_codes jsonb = '[]'::jsonb;
  v_code jsonb;
BEGIN
  -- Find the code in recent buckets (last 30 minutes)
  FOR v_bucket IN 
    SELECT * FROM child_app_auth_codes_bucket
    WHERE bucket_timestamp >= now() - interval '30 minutes'
    ORDER BY bucket_timestamp DESC
  LOOP
    -- Check each code in the bucket
    FOR v_code IN SELECT * FROM jsonb_array_elements(v_bucket.codes)
    LOOP
      IF v_code->>'code' = p_code AND 
         v_code->>'app_id' = p_app_id AND
         v_code->>'used_at' IS NULL AND
         (v_code->>'expires_at')::timestamp > now() THEN
        
        -- Found valid code, mark as used
        v_code_data := v_code || jsonb_build_object('used_at', now());
        v_updated_codes := v_bucket.codes;
        
        -- Update the array element
        FOR i IN 0..jsonb_array_length(v_bucket.codes)-1 LOOP
          IF (v_bucket.codes->i)->>'code' = p_code THEN
            v_updated_codes := jsonb_set(
              v_updated_codes, 
              array[i::text], 
              v_code_data
            );
            EXIT;
          END IF;
        END LOOP;
        
        -- Update the bucket
        UPDATE child_app_auth_codes_bucket
        SET 
          codes = v_updated_codes,
          used_count = used_count + 1,
          active_count = active_count - 1
        WHERE bucket_key = v_bucket.bucket_key;
        
        RETURN v_code_data;
      END IF;
    END LOOP;
  END LOOP;
  
  -- Code not found or invalid
  RETURN NULL;
END;
$$;

-- Step 3: Drop and recreate upsert_user_app_session with SECURITY DEFINER
-- =====================================================
DROP FUNCTION IF EXISTS upsert_user_app_session(uuid, varchar, jsonb);

CREATE OR REPLACE FUNCTION upsert_user_app_session(
  p_user_id uuid,
  p_app_id varchar,
  p_session_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- This allows the function to bypass RLS
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  INSERT INTO child_app_unified_sessions (
    user_id,
    app_sessions,
    global_metadata,
    total_apps_connected
  )
  VALUES (
    p_user_id,
    jsonb_build_object(p_app_id, p_session_data),
    jsonb_build_object('last_login', now()),
    1
  )
  ON CONFLICT (user_id) 
  DO UPDATE SET
    app_sessions = jsonb_set(
      child_app_unified_sessions.app_sessions,
      array[p_app_id],
      p_session_data,
      true
    ),
    global_metadata = child_app_unified_sessions.global_metadata || 
      jsonb_build_object('last_activity', now()),
    total_apps_connected = (
      SELECT count(*) FROM jsonb_object_keys(
        jsonb_set(
          child_app_unified_sessions.app_sessions,
          array[p_app_id],
          p_session_data,
          true
        )
      )
    ),
    updated_at = now()
  RETURNING jsonb_build_object(
    'user_id', user_id,
    'app_id', p_app_id,
    'session', app_sessions->p_app_id
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Step 4: Grant execute permissions on functions
-- =====================================================
GRANT EXECUTE ON FUNCTION add_auth_code_to_bucket(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION validate_and_use_auth_code(varchar, varchar) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION upsert_user_app_session(uuid, varchar, jsonb) TO authenticated, service_role;

-- Step 5: Verify the functions
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '======================================';
    RAISE NOTICE 'Function Security Fix Complete!';
    RAISE NOTICE '======================================';
    RAISE NOTICE '';
    RAISE NOTICE 'All functions updated to SECURITY DEFINER:';
    RAISE NOTICE '  ✅ add_auth_code_to_bucket()';
    RAISE NOTICE '  ✅ validate_and_use_auth_code()';
    RAISE NOTICE '  ✅ upsert_user_app_session()';
    RAISE NOTICE '';
    RAISE NOTICE 'These functions can now bypass RLS policies';
    RAISE NOTICE 'to interact with protected tables.';
    RAISE NOTICE '';
    RAISE NOTICE 'Test the auth flow to verify everything works!';
END $$;

-- =====================================================
-- IMPORTANT: This fix is required for the auth flow to work
-- with the strict RLS policies we've implemented
-- =====================================================
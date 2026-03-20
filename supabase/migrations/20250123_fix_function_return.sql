-- =====================================================
-- Migration: Fix Function Return Issue
-- Date: 2025-01-23
-- Purpose: Fix RETURNING clause in functions
-- =====================================================

-- Fix add_auth_code_to_bucket function
DROP FUNCTION IF EXISTS add_auth_code_to_bucket(jsonb);

CREATE OR REPLACE FUNCTION add_auth_code_to_bucket(p_code_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket_key varchar(50);
  v_bucket_timestamp timestamp;
  v_result jsonb;
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
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION add_auth_code_to_bucket(jsonb) TO authenticated, service_role;

-- Test the function
DO $$
DECLARE
  v_test_result jsonb;
BEGIN
  -- Test auth code generation
  v_test_result := add_auth_code_to_bucket(
    jsonb_build_object(
      'code', 'TEST_' || substr(gen_random_uuid()::text, 1, 8),
      'app_id', 'test_app_verify',
      'user_id', gen_random_uuid()::text,
      'redirect_uri', 'http://localhost:3000/callback',
      'scope', 'read',
      'state', 'test_state',
      'created_at', NOW()::text,
      'expires_at', (NOW() + INTERVAL '5 minutes')::text,
      'used_at', null
    )
  );
  
  IF v_test_result IS NOT NULL THEN
    RAISE NOTICE '✅ Auth code function working! Result: %', v_test_result;
  ELSE
    RAISE NOTICE '❌ Auth code function failed!';
  END IF;
END $$;
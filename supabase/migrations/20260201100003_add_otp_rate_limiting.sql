-- Add rate limiting for OTP requests
-- Updated: 2026-02-01 - Add columns for OTP rate limiting

-- Add rate limiting columns to parent_otp_verifications table
ALTER TABLE parent_otp_verifications
ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

-- Create index for rate limiting queries
CREATE INDEX IF NOT EXISTS idx_parent_otp_phone_blocked ON parent_otp_verifications(phone, blocked_until);

-- Update send_parent_otp function to include rate limiting
CREATE OR REPLACE FUNCTION send_parent_otp(
  p_phone TEXT,
  p_institution_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_otp TEXT;
  v_expires_at TIMESTAMPTZ;
  v_existing_record RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Check for existing record
  SELECT * INTO v_existing_record
  FROM parent_otp_verifications
  WHERE phone = p_phone
    AND institution_id = p_institution_id;

  -- Check if blocked
  IF v_existing_record.blocked_until IS NOT NULL AND v_existing_record.blocked_until > v_now THEN
    RAISE EXCEPTION 'Too many attempts. Please try again in % minutes',
      EXTRACT(EPOCH FROM (v_existing_record.blocked_until - v_now)) / 60;
  END IF;

  -- Check rate limiting (max 3 OTP requests per 5 minutes)
  IF v_existing_record.last_attempt_at IS NOT NULL
     AND v_existing_record.last_attempt_at > v_now - INTERVAL '5 minutes'
     AND v_existing_record.attempt_count >= 3 THEN

    -- Block for 15 minutes
    UPDATE parent_otp_verifications
    SET blocked_until = v_now + INTERVAL '15 minutes',
        attempt_count = 0
    WHERE phone = p_phone AND institution_id = p_institution_id;

    RAISE EXCEPTION 'Too many OTP requests. Please try again in 15 minutes';
  END IF;

  -- Reset attempt count if last attempt was more than 5 minutes ago
  IF v_existing_record.last_attempt_at IS NULL
     OR v_existing_record.last_attempt_at <= v_now - INTERVAL '5 minutes' THEN
    UPDATE parent_otp_verifications
    SET attempt_count = 0
    WHERE phone = p_phone AND institution_id = p_institution_id;
  END IF;

  -- Generate 6-digit OTP
  v_otp := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
  v_expires_at := v_now + INTERVAL '10 minutes';

  -- Insert or update OTP record
  INSERT INTO parent_otp_verifications (phone, otp, institution_id, expires_at, attempt_count, last_attempt_at)
  VALUES (p_phone, v_otp, p_institution_id, v_expires_at, 1, v_now)
  ON CONFLICT (phone, institution_id)
  DO UPDATE SET
    otp = v_otp,
    expires_at = v_expires_at,
    verified = FALSE,
    verified_at = NULL,
    attempt_count = parent_otp_verifications.attempt_count + 1,
    last_attempt_at = v_now,
    updated_at = v_now;

  -- Note: In production, integrate with SMS service here
  -- For now, return OTP in response (ONLY for development)
  RETURN jsonb_build_object(
    'success', TRUE,
    'expires_at', v_expires_at,
    'otp', CASE WHEN current_setting('app.environment', true) = 'development' THEN v_otp ELSE NULL END
  );
END;
$$;

-- Update verify_parent_otp function to include attempt limiting
CREATE OR REPLACE FUNCTION verify_parent_otp(
  p_phone TEXT,
  p_otp TEXT,
  p_institution_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_record RECORD;
  v_parent_id UUID;
  v_is_new BOOLEAN := FALSE;
  v_now TIMESTAMPTZ := NOW();
  v_verification_attempts INTEGER := 0;
BEGIN
  -- Get OTP record
  SELECT * INTO v_record
  FROM parent_otp_verifications
  WHERE phone = p_phone
    AND institution_id = p_institution_id;

  -- Check if OTP exists
  IF v_record IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'No OTP found for this phone number'
    );
  END IF;

  -- Check if blocked
  IF v_record.blocked_until IS NOT NULL AND v_record.blocked_until > v_now THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Too many failed attempts. Please try again later'
    );
  END IF;

  -- Track verification attempts (max 5 attempts per OTP)
  v_verification_attempts := COALESCE(
    (SELECT COUNT(*) FROM parent_activity_log
     WHERE activity_type = 'otp_verification_failed'
       AND created_at > v_record.updated_at
       AND description LIKE '%' || p_phone || '%'),
    0
  );

  IF v_verification_attempts >= 5 THEN
    -- Block for 30 minutes
    UPDATE parent_otp_verifications
    SET blocked_until = v_now + INTERVAL '30 minutes'
    WHERE phone = p_phone AND institution_id = p_institution_id;

    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Too many failed verification attempts. Please request a new OTP'
    );
  END IF;

  -- Check if OTP expired
  IF v_record.expires_at < v_now THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'OTP has expired. Please request a new one'
    );
  END IF;

  -- Check if already verified
  IF v_record.verified THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'OTP already used. Please request a new one'
    );
  END IF;

  -- Verify OTP
  IF v_record.otp != p_otp THEN
    -- Log failed attempt
    INSERT INTO parent_activity_log (parent_id, activity_type, description)
    VALUES (NULL, 'otp_verification_failed', 'Failed OTP verification for ' || p_phone);

    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Invalid OTP'
    );
  END IF;

  -- Mark OTP as verified
  UPDATE parent_otp_verifications
  SET verified = TRUE,
      verified_at = v_now,
      blocked_until = NULL,
      attempt_count = 0
  WHERE phone = p_phone AND institution_id = p_institution_id;

  -- Check if parent exists
  SELECT id INTO v_parent_id
  FROM parent_profiles
  WHERE phone = p_phone AND institution_id = p_institution_id;

  IF v_parent_id IS NULL THEN
    v_is_new := TRUE;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'parent_id', v_parent_id,
    'is_new', v_is_new,
    'message', 'OTP verified successfully'
  );
END;
$$;

-- Comment
COMMENT ON FUNCTION send_parent_otp IS 'Send OTP with rate limiting (max 3 requests per 5 minutes)';
COMMENT ON FUNCTION verify_parent_otp IS 'Verify OTP with attempt limiting (max 5 attempts per OTP)';

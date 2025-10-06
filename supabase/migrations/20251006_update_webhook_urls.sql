-- Migration: Update Webhook URLs to new auth server
-- Date: 2025-10-06
-- Description: Update all webhook functions to use new auth.jkkn.ai domain
-- Old URL: https://myjkkn-auth-server.vercel.app
-- New URL: https://auth.jkkn.ai

-- =====================================================
-- 1. Update sync_user_to_auth_server_webhook function
-- =====================================================
CREATE OR REPLACE FUNCTION public.sync_user_to_auth_server_webhook()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_payload jsonb;
  v_payload_text text;
  v_webhook_url text;
  v_api_key text;
  v_webhook_secret text;
  v_hmac_signature text;
  v_request_id bigint;
BEGIN
  -- Configuration - Updated to new auth.jkkn.ai domain
  v_webhook_url := 'https://auth.jkkn.ai/api/auth/sync-user';

  -- Retrieve secrets from Vault
  v_api_key := current_setting('app.auth_server_api_key', true);
  v_webhook_secret := current_setting('app.auth_server_webhook_secret', true);

  -- Fallback to Vault if settings not available
  IF v_api_key IS NULL THEN
    SELECT decrypted_secret INTO v_api_key
    FROM vault.decrypted_secrets
    WHERE name = 'auth_server_api_key'
    LIMIT 1;
  END IF;

  IF v_webhook_secret IS NULL THEN
    SELECT decrypted_secret INTO v_webhook_secret
    FROM vault.decrypted_secrets
    WHERE name = 'auth_server_webhook_secret'
    LIMIT 1;
  END IF;

  -- Validate secrets are available
  IF v_api_key IS NULL OR v_webhook_secret IS NULL THEN
    RAISE WARNING 'Missing auth_server_api_key or auth_server_webhook_secret in Vault';
    INSERT INTO public.webhook_logs (
      event_type,
      table_name,
      record_id,
      payload,
      error_message,
      created_at
    ) VALUES (
      TG_OP,
      'profiles',
      NEW.id,
      '{}'::jsonb,
      'Missing API key or webhook secret in Vault',
      NOW()
    );
    RETURN NEW;
  END IF;

  -- Build payload matching Auth Server /api/auth/sync-user schema
  v_payload := jsonb_build_object(
    'parent_user_id', NEW.id,
    'email', COALESCE(NEW.email, ''),
    'full_name', COALESCE(NEW.full_name, 'Unknown User'),
    'role', COALESCE(NEW.role, 'student'),
    'institution_id', NEW.institution_id,
    'phone_number', NEW.phone_number,
    'gender', NEW.gender,
    'designation', NEW.designation,
    'avatar_url', NEW.avatar_url,
    'profile_completed', COALESCE(NEW.profile_completed, false),
    'is_super_admin', COALESCE(NEW.is_super_admin, false),
    'department_id', NEW.department_id
  );

  -- Convert to text using jsonb::text which matches JSON.stringify() format
  -- This ensures compact JSON without extra spaces
  v_payload_text := v_payload::text;

  -- Generate HMAC-SHA256 signature
  -- Auth Server validates this to ensure webhook is authentic
  v_hmac_signature := encode(
    hmac(v_payload_text::bytea, v_webhook_secret::bytea, 'sha256'),
    'hex'
  );

  -- Send async HTTP POST via pg_net extension
  SELECT net.http_post(
    url := v_webhook_url,
    body := v_payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-api-key', v_api_key,
      'x-webhook-signature', v_hmac_signature
    ),
    timeout_milliseconds := 5000
  ) INTO v_request_id;

  -- Log webhook call for monitoring
  INSERT INTO public.webhook_logs (
    event_type,
    table_name,
    record_id,
    payload,
    created_at
  ) VALUES (
    TG_OP,
    'profiles',
    NEW.id,
    v_payload,
    NOW()
  );

  -- Log success notice
  RAISE NOTICE 'Webhook sent for user % (email: %, request_id: %)',
    NEW.id, NEW.email, v_request_id;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send webhook for user %: %', NEW.id, SQLERRM;

    INSERT INTO public.webhook_logs (
      event_type,
      table_name,
      record_id,
      payload,
      error_message,
      created_at
    ) VALUES (
      TG_OP,
      'profiles',
      NEW.id,
      v_payload,
      SQLERRM,
      NOW()
    );

    RETURN NEW;
END;
$function$;

-- =====================================================
-- 2. Update sync_application_to_auth_server_webhook function
-- =====================================================
CREATE OR REPLACE FUNCTION public.sync_application_to_auth_server_webhook()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_payload jsonb;
  v_payload_text text;
  v_webhook_url text;
  v_api_key text;
  v_webhook_secret text;
  v_hmac_signature text;
  v_request_id bigint;
BEGIN
  -- Only sync if uses_parent_auth is true and app_id is set
  IF NEW.uses_parent_auth = false OR NEW.app_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Configuration - Updated to new auth.jkkn.ai domain
  v_webhook_url := 'https://auth.jkkn.ai/api/auth/sync-application';

  -- Retrieve secrets from Vault
  SELECT decrypted_secret INTO v_api_key
  FROM vault.decrypted_secrets
  WHERE name = 'auth_server_api_key'
  LIMIT 1;

  SELECT decrypted_secret INTO v_webhook_secret
  FROM vault.decrypted_secrets
  WHERE name = 'auth_server_webhook_secret'
  LIMIT 1;

  -- Validate secrets are available
  IF v_api_key IS NULL OR v_webhook_secret IS NULL THEN
    RAISE WARNING 'Missing auth_server_api_key or auth_server_webhook_secret in Vault';
    INSERT INTO public.webhook_logs (
      event_type,
      table_name,
      record_id,
      payload,
      error_message,
      created_at
    ) VALUES (
      TG_OP,
      'applications',
      NEW.id,
      '{}'::jsonb,
      'Missing API key or webhook secret in Vault',
      NOW()
    );
    RETURN NEW;
  END IF;

  -- Build payload matching Auth Server /api/auth/sync-application schema
  v_payload := jsonb_build_object(
    'parent_app_id', NEW.id,
    'app_id', NEW.app_id,
    'name', NEW.name,
    'description', NEW.description,
    'api_key_hash', NEW.api_key_hash,
    'allowed_redirect_uris', NEW.allowed_redirect_uris,
    'allowed_scopes', COALESCE(NEW.allowed_scopes, ARRAY['read', 'write', 'profile']),
    'app_permissions', COALESCE(NEW.app_permissions, '[]'::jsonb),
    'uses_parent_auth', COALESCE(NEW.uses_parent_auth, true),
    'is_active', COALESCE(NEW.is_active, true),
    'rate_limit_requests', COALESCE(NEW.rate_limit_requests, 1000),
    'rate_limit_window_minutes', COALESCE(NEW.rate_limit_window_minutes, 60),
    'logo_url', NEW.icon_path,
    'primary_color', NULL
  );

  -- Convert to text for HMAC signature
  v_payload_text := v_payload::text;

  -- Generate HMAC-SHA256 signature
  v_hmac_signature := encode(
    hmac(
      convert_to(v_payload_text, 'UTF8'),
      convert_to(v_webhook_secret, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  -- Send async HTTP POST via pg_net extension
  SELECT net.http_post(
    url := v_webhook_url,
    body := v_payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-api-key', v_api_key,
      'x-webhook-signature', v_hmac_signature
    ),
    timeout_milliseconds := 5000
  ) INTO v_request_id;

  -- Log webhook call for monitoring
  INSERT INTO public.webhook_logs (
    event_type,
    table_name,
    record_id,
    payload,
    created_at
  ) VALUES (
    TG_OP,
    'applications',
    NEW.id,
    v_payload,
    NOW()
  );

  -- Log success notice
  RAISE NOTICE 'Application webhook sent for % (app_id: %, request_id: %)',
    NEW.id, NEW.app_id, v_request_id;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the database transaction
    RAISE WARNING 'Failed to send application webhook for %: %', NEW.id, SQLERRM;

    INSERT INTO public.webhook_logs (
      event_type,
      table_name,
      record_id,
      payload,
      error_message,
      created_at
    ) VALUES (
      TG_OP,
      'applications',
      NEW.id,
      v_payload,
      SQLERRM,
      NOW()
    );

    RETURN NEW;
END;
$function$;

-- =====================================================
-- 3. Update bulk_sync_user_to_auth_server function
-- =====================================================
CREATE OR REPLACE FUNCTION public.bulk_sync_user_to_auth_server(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_profile RECORD;
  v_payload jsonb;
  v_payload_text text;
  v_webhook_url text;
  v_api_key text;
  v_webhook_secret text;
  v_hmac_signature text;
  v_request_id bigint;
BEGIN
  -- Get user profile
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE WARNING 'User % not found', p_user_id;
    RETURN;
  END IF;

  -- Configuration - Updated to new auth.jkkn.ai domain
  v_webhook_url := 'https://auth.jkkn.ai/api/auth/sync-user';

  -- Retrieve secrets from Vault
  SELECT decrypted_secret INTO v_api_key
  FROM vault.decrypted_secrets
  WHERE name = 'auth_server_api_key'
  LIMIT 1;

  SELECT decrypted_secret INTO v_webhook_secret
  FROM vault.decrypted_secrets
  WHERE name = 'auth_server_webhook_secret'
  LIMIT 1;

  -- Validate secrets
  IF v_api_key IS NULL OR v_webhook_secret IS NULL THEN
    INSERT INTO public.webhook_logs (
      event_type,
      table_name,
      record_id,
      payload,
      error_message,
      created_at
    ) VALUES (
      'BULK_SYNC',
      'profiles',
      p_user_id,
      '{}'::jsonb,
      'Missing API key or webhook secret in Vault',
      NOW()
    );
    RETURN;
  END IF;

  -- Build payload
  v_payload := jsonb_build_object(
    'parent_user_id', v_profile.id,
    'email', COALESCE(v_profile.email, ''),
    'full_name', COALESCE(v_profile.full_name, 'Unknown User'),
    'role', COALESCE(v_profile.role, 'student'),
    'institution_id', v_profile.institution_id,
    'phone_number', v_profile.phone_number,
    'gender', v_profile.gender,
    'designation', v_profile.designation,
    'avatar_url', v_profile.avatar_url,
    'profile_completed', COALESCE(v_profile.profile_completed, false),
    'is_super_admin', COALESCE(v_profile.is_super_admin, false),
    'department_id', v_profile.department_id
  );

  v_payload_text := v_payload::text;

  -- Generate HMAC signature (with explicit casting to avoid bytea errors)
  v_hmac_signature := encode(
    hmac(
      convert_to(v_payload_text, 'UTF8'),
      convert_to(v_webhook_secret, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  -- Send webhook
  SELECT net.http_post(
    url := v_webhook_url,
    body := v_payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-api-key', v_api_key,
      'x-webhook-signature', v_hmac_signature
    ),
    timeout_milliseconds := 5000
  ) INTO v_request_id;

  -- Log webhook
  INSERT INTO public.webhook_logs (
    event_type,
    table_name,
    record_id,
    payload,
    created_at
  ) VALUES (
    'BULK_SYNC',
    'profiles',
    v_profile.id,
    v_payload,
    NOW()
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail
    INSERT INTO public.webhook_logs (
      event_type,
      table_name,
      record_id,
      payload,
      error_message,
      created_at
    ) VALUES (
      'BULK_SYNC',
      'profiles',
      p_user_id,
      v_payload,
      SQLERRM,
      NOW()
    );
END;
$function$;

-- =====================================================
-- 4. Update bulk_sync_applications_to_auth_server function
-- =====================================================
CREATE OR REPLACE FUNCTION public.bulk_sync_applications_to_auth_server()
 RETURNS TABLE(app_id text, app_name text, sync_status text, sync_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_app RECORD;
  v_webhook_url text;
  v_api_key text;
  v_webhook_secret text;
  v_payload jsonb;
  v_payload_text text;
  v_hmac_signature text;
  v_request_id bigint;
  v_synced_count int := 0;
  v_error_count int := 0;
BEGIN
  -- Configuration - Updated to new auth.jkkn.ai domain
  v_webhook_url := 'https://auth.jkkn.ai/api/auth/sync-application';

  -- Get secrets from Vault
  SELECT decrypted_secret INTO v_api_key
  FROM vault.decrypted_secrets
  WHERE name = 'auth_server_api_key'
  LIMIT 1;

  SELECT decrypted_secret INTO v_webhook_secret
  FROM vault.decrypted_secrets
  WHERE name = 'auth_server_webhook_secret'
  LIMIT 1;

  -- Validate secrets
  IF v_api_key IS NULL OR v_webhook_secret IS NULL THEN
    RAISE EXCEPTION 'Missing auth_server_api_key or auth_server_webhook_secret in Vault';
  END IF;

  -- Loop through all OAuth-enabled applications
  FOR v_app IN
    SELECT a.id, a.app_id, a.name, a.description, a.api_key_hash,
           a.allowed_redirect_uris, a.allowed_scopes, a.app_permissions,
           a.uses_parent_auth, a.is_active, a.rate_limit_requests,
           a.rate_limit_window_minutes, a.icon_path
    FROM public.applications a
    WHERE a.uses_parent_auth = true
      AND a.app_id IS NOT NULL
      AND a.api_key_hash IS NOT NULL
      AND array_length(a.allowed_redirect_uris, 1) > 0
    ORDER BY a.name
  LOOP
    BEGIN
      -- Build payload
      v_payload := jsonb_build_object(
        'parent_app_id', v_app.id,
        'app_id', v_app.app_id,
        'name', v_app.name,
        'description', v_app.description,
        'api_key_hash', v_app.api_key_hash,
        'allowed_redirect_uris', v_app.allowed_redirect_uris,
        'allowed_scopes', COALESCE(v_app.allowed_scopes, ARRAY['read', 'write', 'profile']),
        'app_permissions', COALESCE(v_app.app_permissions, '[]'::jsonb),
        'uses_parent_auth', COALESCE(v_app.uses_parent_auth, true),
        'is_active', COALESCE(v_app.is_active, true),
        'rate_limit_requests', COALESCE(v_app.rate_limit_requests, 1000),
        'rate_limit_window_minutes', COALESCE(v_app.rate_limit_window_minutes, 60),
        'logo_url', v_app.icon_path,
        'primary_color', NULL
      );

      v_payload_text := v_payload::text;

      -- Generate HMAC signature
      v_hmac_signature := encode(
        hmac(
          convert_to(v_payload_text, 'UTF8'),
          convert_to(v_webhook_secret, 'UTF8'),
          'sha256'
        ),
        'hex'
      );

      -- Send HTTP POST
      SELECT net.http_post(
        url := v_webhook_url,
        body := v_payload,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-api-key', v_api_key,
          'x-webhook-signature', v_hmac_signature
        ),
        timeout_milliseconds := 10000
      ) INTO v_request_id;

      -- Log webhook
      INSERT INTO public.webhook_logs (
        event_type, table_name, record_id, payload, created_at
      ) VALUES (
        'BULK_SYNC', 'applications', v_app.id, v_payload, NOW()
      );

      v_synced_count := v_synced_count + 1;

      -- Return success for this app
      app_id := v_app.app_id;
      app_name := v_app.name;
      sync_status := 'success';
      sync_message := format('Synced successfully (request_id: %s)', v_request_id);
      RETURN NEXT;

      -- Small delay to avoid rate limiting
      PERFORM pg_sleep(0.5);

    EXCEPTION
      WHEN OTHERS THEN
        v_error_count := v_error_count + 1;

        app_id := v_app.app_id;
        app_name := v_app.name;
        sync_status := 'error';
        sync_message := format('Error: %s', SQLERRM);
        RETURN NEXT;

        -- Log error
        INSERT INTO public.webhook_logs (
          event_type, table_name, record_id, payload, error_message, created_at
        ) VALUES (
          'BULK_SYNC', 'applications', v_app.id, v_payload, SQLERRM, NOW()
        );
    END;
  END LOOP;

  -- Return summary
  app_id := NULL;
  app_name := 'SUMMARY';
  sync_status := 'completed';
  sync_message := format('Total: %s synced, %s errors', v_synced_count, v_error_count);
  RETURN NEXT;

END;
$function$;

-- =====================================================
-- Verification
-- =====================================================
COMMENT ON FUNCTION public.sync_user_to_auth_server_webhook() IS
  'Updated 2025-10-06: Changed webhook URL from https://myjkkn-auth-server.vercel.app to https://auth.jkkn.ai';

COMMENT ON FUNCTION public.sync_application_to_auth_server_webhook() IS
  'Updated 2025-10-06: Changed webhook URL from https://myjkkn-auth-server.vercel.app to https://auth.jkkn.ai';

COMMENT ON FUNCTION public.bulk_sync_user_to_auth_server(uuid) IS
  'Updated 2025-10-06: Changed webhook URL from https://myjkkn-auth-server.vercel.app to https://auth.jkkn.ai';

COMMENT ON FUNCTION public.bulk_sync_applications_to_auth_server() IS
  'Updated 2025-10-06: Changed webhook URL from https://myjkkn-auth-server.vercel.app to https://auth.jkkn.ai';

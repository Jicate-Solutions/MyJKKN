import { NextRequest, NextResponse } from 'next/server';
import { 
  createServerSupabaseClient as createClient,
  createServiceRoleClient 
} from '@/lib/supabase/server';
import { jwtVerify } from 'jose';
import crypto from 'crypto';

/**
 * POST /api/auth/child-app/validate
 * Validate a child app token
 */
export async function POST(request: NextRequest) {
  let child_app_id: string | undefined;
  let token: string;

  try {
    // Validate API key from child app
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json(
        { valid: false, error: 'Missing API key' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    ({ token, child_app_id } = body);

    if (!token || !child_app_id) {
      return NextResponse.json(
        { valid: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Initialize Supabase clients
    const supabase = await createClient();
    const serviceClient = createServiceRoleClient();

    // Validate child app and API key using same method as token endpoint
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashedApiKey = hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    console.log('🔑 [Validate] API key validation:', {
      child_app_id,
      api_key_preview: apiKey.substring(0, 15) + '...',
      hash_preview: hashedApiKey.substring(0, 16) + '...'
    });

    // Use service role client to bypass RLS on applications table
    const { data: childApp, error: appError } = await serviceClient
      .from('applications')
      .select('*')
      .eq('app_id', child_app_id)
      .eq('api_key_hash', hashedApiKey)
      .eq('uses_parent_auth', true)
      .eq('is_active', true)
      .single();

    if (appError || !childApp) {
      console.error('❌ [Validate] Child app API key validation failed:', {
        error: appError,
        child_app_id,
        hash_used: hashedApiKey.substring(0, 16) + '...',
        error_details: appError?.message || 'No matching app found'
      });

      // Log failed attempt
      await supabase.rpc('log_child_app_access', {
        p_child_app_id: child_app_id,
        p_user_id: null,
        p_session_id: null,
        p_action: 'validate',
        p_status: 'failed',
        p_error_message: `Invalid API key or child app: ${
          appError?.message || 'No matching app'
        }`,
        p_ip_address:
          request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip'),
        p_user_agent: request.headers.get('user-agent')
      });

      return NextResponse.json(
        {
          valid: false,
          error: 'Invalid API key or child app',
          debug_info: appError?.message || 'No matching application found'
        },
        { status: 401 }
      );
    }

    console.log('✅ [Validate] Child app validated successfully:', {
      app_name: childApp.name,
      app_id: childApp.app_id,
      uses_parent_auth: childApp.uses_parent_auth
    });

    // Verify JWT token using jose library (same as token endpoint)
    let decodedToken: any;
    try {
      const secret = new TextEncoder().encode(
        process.env.JWT_SECRET || 'your-secret-key'
      );
      
      const { payload } = await jwtVerify(token, secret);
      decodedToken = payload;
      
      console.log('🔐 [Validate] Token decoded successfully:', {
        user_id: decodedToken.sub,
        app_id: decodedToken.app_id,
        email: decodedToken.email
      });
    } catch (error) {
      console.error('❌ [Validate] Token verification failed:', error);
      
      // Log failed validation
      await supabase.rpc('log_child_app_access', {
        p_child_app_id: child_app_id,
        p_user_id: null,
        p_session_id: null,
        p_action: 'validate',
        p_status: 'failed',
        p_error_message: `Invalid token: ${error instanceof Error ? error.message : 'Unknown error'}`,
        p_ip_address:
          request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip'),
        p_user_agent: request.headers.get('user-agent')
      });

      return NextResponse.json(
        { valid: false, error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Check if token is for the correct child app
    if (decodedToken.app_id !== child_app_id) {
      console.error('❌ [Validate] Token app_id mismatch:', {
        token_app_id: decodedToken.app_id,
        expected_app_id: child_app_id
      });
      return NextResponse.json(
        { valid: false, error: 'Token not valid for this application' },
        { status: 401 }
      );
    }

    // Generate token hash for comparison using crypto (more reliable than jwt-utils)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    console.log('🔍 [Validate] Looking for session:', {
      user_id: decodedToken.sub,
      app_id: child_app_id,
      token_hash_preview: tokenHash.substring(0, 10) + '...'
    });

    // Query the child_app_user_sessions table using service role client
    const { data: userSession, error: sessionError } = await serviceClient
      .from('child_app_user_sessions')
      .select('*')
      .eq('user_id', decodedToken.sub)
      .eq('app_id', child_app_id)
      .maybeSingle(); // Use maybeSingle() instead of single() to avoid PGRST116

    if (sessionError) {
      console.error('💥 [Validate] Session query error:', sessionError);
      await supabase.rpc('log_child_app_access', {
        p_child_app_id: child_app_id,
        p_user_id: decodedToken.sub,
        p_session_id: null,
        p_action: 'validate',
        p_status: 'failed',
        p_error_message: `Session query failed: ${sessionError.message}`,
        p_ip_address:
          request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip'),
        p_user_agent: request.headers.get('user-agent')
      });

      return NextResponse.json(
        {
          valid: false,
          error: 'Failed to query session',
          details: sessionError.message
        },
        { status: 500 }
      );
    }

    if (!userSession) {
      console.log(
        '❌ [Validate] No session found for user:',
        decodedToken.sub,
        'and app:',
        child_app_id
      );
      await supabase.rpc('log_child_app_access', {
        p_child_app_id: child_app_id,
        p_user_id: decodedToken.sub,
        p_session_id: null,
        p_action: 'validate',
        p_status: 'failed',
        p_error_message: 'No active session found',
        p_ip_address:
          request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip'),
        p_user_agent: request.headers.get('user-agent')
      });

      return NextResponse.json(
        { valid: false, error: 'No active session found' },
        { status: 401 }
      );
    }

    console.log('✅ [Validate] Found user session:', {
      id: userSession.id,
      has_session_data: !!userSession.session_data,
      active_sessions_count:
        userSession.session_data?.active_sessions?.length || 0
    });

    // Parse the JSON session data
    const sessionData = userSession.session_data || {};
    const activeSessions = sessionData.active_sessions || [];

    // Find the matching session by token hash
    const matchingSession = activeSessions.find((session: any) => {
      return session.token_hash === tokenHash;
    });

    if (!matchingSession) {
      console.log('❌ [Validate] No matching session found for token hash');
      console.log(
        'Available session hashes:',
        activeSessions.map((s: any) =>
          s.token_hash ? s.token_hash.substring(0, 10) + '...' : 'no hash'
        )
      );

      await supabase.rpc('log_child_app_access', {
        p_child_app_id: child_app_id,
        p_user_id: decodedToken.sub,
        p_session_id: null,
        p_action: 'validate',
        p_status: 'failed',
        p_error_message: 'Session token mismatch',
        p_ip_address:
          request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip'),
        p_user_agent: request.headers.get('user-agent')
      });

      return NextResponse.json(
        { valid: false, error: 'Session token mismatch' },
        { status: 401 }
      );
    }

    // Check if session is expired
    if (new Date(matchingSession.expires_at) < new Date()) {
      console.log(
        '⏰ [Validate] Session expired at:',
        matchingSession.expires_at
      );
      return NextResponse.json(
        { valid: false, error: 'Session expired' },
        { status: 401 }
      );
    }

    console.log('🎉 [Validate] Session validation successful!');

    // Get latest user profile data using service role client
    console.log('📋 [Validate] Fetching profile for user:', decodedToken.sub);
    
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('*')
      .eq('id', decodedToken.sub)
      .single();

    if (profileError || !profile) {
      console.error('❌ [Validate] Profile fetch failed:', {
        error: profileError,
        user_id: decodedToken.sub,
        profile_found: !!profile
      });
      return NextResponse.json(
        { valid: false, error: 'User profile not found' },
        { status: 404 }
      );
    }
    
    console.log('✅ [Validate] Profile fetched successfully:', {
      user_id: profile.id,
      email: profile.email,
      role: profile.role
    });

    // Check if user is still active
    if (!profile.is_active) {
      // Note: For JSON-based sessions, we don't need to update individual sessions
      // as the user profile check is sufficient for access control
      return NextResponse.json(
        { valid: false, error: 'User account is not active' },
        { status: 403 }
      );
    }

    // Get user-specific permissions for this child app using service role client
    const { data: userPermissions } = await serviceClient
      .from('user_child_app_permissions')
      .select('permissions')
      .eq('user_id', decodedToken.sub)
      .eq('child_app_id', child_app_id)
      .eq('is_active', true)
      .single();

    // Update last activity and session data with proper JSON structure
    const updatedSessionData = {
      ...sessionData,
      active_sessions: activeSessions.map((s: any) =>
        s.token_hash === tokenHash
          ? { ...s, last_used_at: new Date().toISOString() }
          : s
      )
    };

    await serviceClient
      .from('child_app_user_sessions')
      .update({
        last_activity_at: new Date().toISOString(),
        session_data: updatedSessionData
      })
      .eq('id', userSession.id);

    console.log('📝 [Validate] Updated session activity');

    // Log successful validation
    await supabase.rpc('log_child_app_access', {
      p_child_app_id: child_app_id,
      p_user_id: decodedToken.sub,
      p_session_id: userSession.id,
      p_action: 'validate',
      p_status: 'success',
      p_ip_address:
        request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip'),
      p_user_agent: request.headers.get('user-agent')
    });

    // Return validation response with updated user data
    console.log('✨ [Validate] Returning successful validation response');
    return NextResponse.json({
      valid: true,
      user: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        phone_number: profile.phone_number,
        role: profile.role,
        institution_id: profile.institution_id,
        is_super_admin: profile.is_super_admin,
        permissions: {
          ...(userPermissions?.permissions || {}),
          ...(userSession.permissions || {})
        },
        profile_completed: profile.profile_completed,
        avatar_url: profile.avatar_url,
        last_login: profile.last_login
      },
      session: {
        id: userSession.id,
        expires_at: matchingSession.expires_at,
        created_at: matchingSession.created_at,
        last_used_at:
          matchingSession.last_used_at || userSession.last_activity_at
      }
    });
  } catch (error) {
    console.error(
      '💥 [Validate] Unexpected error during token validation:',
      error
    );

    // Log critical validation errors
    try {
      const supabase = await createClient();
      await supabase.rpc('log_child_app_access', {
        p_child_app_id: child_app_id || 'unknown',
        p_user_id: null,
        p_session_id: null,
        p_action: 'validate',
        p_status: 'failed',
        p_error_message: `Critical error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        p_ip_address:
          request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip'),
        p_user_agent: request.headers.get('user-agent')
      });
    } catch (logError) {
      console.error('Failed to log critical validation error:', logError);
    }

    return NextResponse.json(
      {
        valid: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/auth/child-app/validate
 * Handle CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
      'Access-Control-Max-Age': '86400'
    }
  });
}

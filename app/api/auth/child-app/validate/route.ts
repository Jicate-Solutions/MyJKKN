import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';
import { verifyToken, hashToken } from '@/lib/auth/jwt-utils';
import { hashApiKey } from '@/lib/api-keys/api-key-service';

/**
 * POST /api/auth/child-app/validate
 * Validate a child app token
 */
export async function POST(request: NextRequest) {
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
    const { token, child_app_id } = body;

    if (!token || !child_app_id) {
      return NextResponse.json(
        { valid: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Initialize Supabase client
    const supabase = await createClient();

    // Validate child app and API key
    const hashedApiKey = await hashApiKey(apiKey);
    const { data: childApp, error: appError } = await supabase
      .from('applications')
      .select('*')
      .eq('app_id', child_app_id)
      .eq('api_key_hash', hashedApiKey)
      .eq('uses_parent_auth', true)
      .eq('is_active', true)
      .single();

    if (appError || !childApp) {
      console.error('Child app validation error:', appError);
      
      // Log failed attempt
      await supabase.rpc('log_child_app_access', {
        p_child_app_id: child_app_id,
        p_user_id: null,
        p_session_id: null,
        p_action: 'validate',
        p_status: 'failed',
        p_error_message: 'Invalid API key or child app',
        p_ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        p_user_agent: request.headers.get('user-agent'),
      });

      return NextResponse.json(
        { valid: false, error: 'Invalid API key or child app' },
        { status: 401 }
      );
    }

    // Verify JWT token
    const decodedToken = verifyToken(token, child_app_id);
    if (!decodedToken) {
      // Log failed validation
      await supabase.rpc('log_child_app_access', {
        p_child_app_id: child_app_id,
        p_user_id: null,
        p_session_id: null,
        p_action: 'validate',
        p_status: 'failed',
        p_error_message: 'Invalid token',
        p_ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        p_user_agent: request.headers.get('user-agent'),
      });

      return NextResponse.json(
        { valid: false, error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Check if token is for the correct child app
    if (decodedToken.child_app_id !== child_app_id) {
      return NextResponse.json(
        { valid: false, error: 'Token not valid for this application' },
        { status: 401 }
      );
    }

    // Check if session exists and is active
    const tokenHash = hashToken(token);
    const { data: session, error: sessionError } = await supabase
      .from('child_app_sessions')
      .select('*')
      .eq('user_id', decodedToken.user_id)
      .eq('child_app_id', child_app_id)
      .eq('access_token_hash', tokenHash)
      .eq('is_active', true)
      .single();

    if (sessionError || !session) {
      // Session might have been revoked
      await supabase.rpc('log_child_app_access', {
        p_child_app_id: child_app_id,
        p_user_id: decodedToken.user_id,
        p_session_id: null,
        p_action: 'validate',
        p_status: 'failed',
        p_error_message: 'Session not found or inactive',
        p_ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        p_user_agent: request.headers.get('user-agent'),
      });

      return NextResponse.json(
        { valid: false, error: 'Session not found or has been revoked' },
        { status: 401 }
      );
    }

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      // Mark session as inactive
      await supabase
        .from('child_app_sessions')
        .update({ is_active: false })
        .eq('id', session.id);

      return NextResponse.json(
        { valid: false, error: 'Token has expired' },
        { status: 401 }
      );
    }

    // Get latest user profile data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(`
        *,
        custom_roles (
          role_name,
          permissions
        )
      `)
      .eq('id', decodedToken.user_id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { valid: false, error: 'User profile not found' },
        { status: 404 }
      );
    }

    // Check if user is still active
    if (!profile.is_active) {
      // Revoke session
      await supabase
        .from('child_app_sessions')
        .update({ 
          is_active: false,
          revoked_at: new Date().toISOString(),
          revoke_reason: 'User account deactivated'
        })
        .eq('id', session.id);

      return NextResponse.json(
        { valid: false, error: 'User account is not active' },
        { status: 403 }
      );
    }

    // Get user-specific permissions for this child app
    const { data: userPermissions } = await supabase
      .from('user_child_app_permissions')
      .select('permissions')
      .eq('user_id', decodedToken.user_id)
      .eq('child_app_id', child_app_id)
      .eq('is_active', true)
      .single();

    // Update last used timestamp
    await supabase
      .from('child_app_sessions')
      .update({ 
        last_used_at: new Date().toISOString(),
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        user_agent: request.headers.get('user-agent'),
      })
      .eq('id', session.id);

    // Log successful validation
    await supabase.rpc('log_child_app_access', {
      p_child_app_id: child_app_id,
      p_user_id: decodedToken.user_id,
      p_session_id: session.id,
      p_action: 'validate',
      p_status: 'success',
      p_ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      p_user_agent: request.headers.get('user-agent'),
    });

    // Return validation response with updated user data
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
          ...(profile.custom_roles?.permissions || {}),
          ...(userPermissions?.permissions || {}),
        },
        profile_completed: profile.profile_completed,
        avatar_url: profile.avatar_url,
        last_login: profile.last_login,
      },
      session: {
        id: session.id,
        expires_at: session.expires_at,
        created_at: session.created_at,
        last_used_at: session.last_used_at,
      },
    });
  } catch (error) {
    console.error('Token validation error:', error);
    return NextResponse.json(
      { valid: false, error: 'Internal server error' },
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
      'Access-Control-Max-Age': '86400',
    },
  });
}
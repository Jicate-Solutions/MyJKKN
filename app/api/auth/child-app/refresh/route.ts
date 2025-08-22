import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';
import {
  verifyToken,
  generateTokenPair,
  hashToken,
  getTokenExpiryDate
} from '@/lib/auth/jwt-utils';

/**
 * POST /api/auth/child-app/refresh
 * Refresh access token using refresh token
 */
export async function POST(request: NextRequest) {
  try {
    // Validate API key from child app
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { refresh_token, child_app_id } = body;

    if (!refresh_token || !child_app_id) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Initialize Supabase client
    const supabase = await createClient();

    // Validate child app and API key using same method as token endpoint
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashedApiKey = hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

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
      return NextResponse.json(
        { error: 'Invalid API key or child app' },
        { status: 401 }
      );
    }

    // Verify refresh token
    const decodedToken = verifyToken(refresh_token, child_app_id);
    if (!decodedToken || decodedToken.token_type !== 'refresh') {
      await supabase.rpc('log_child_app_access', {
        p_child_app_id: child_app_id,
        p_user_id: null,
        p_session_id: null,
        p_action: 'token_refresh',
        p_status: 'failed',
        p_error_message: 'Invalid refresh token',
        p_ip_address:
          request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip'),
        p_user_agent: request.headers.get('user-agent')
      });

      return NextResponse.json(
        { error: 'Invalid refresh token' },
        { status: 401 }
      );
    }

    // Find the session with this refresh token
    const refreshTokenHash = hashToken(refresh_token);
    const { data: session, error: sessionError } = await supabase
      .from('child_app_sessions')
      .select('*')
      .eq('user_id', decodedToken.user_id)
      .eq('child_app_id', child_app_id)
      .eq('refresh_token_hash', refreshTokenHash)
      .eq('is_active', true)
      .single();

    if (sessionError || !session) {
      await supabase.rpc('log_child_app_access', {
        p_child_app_id: child_app_id,
        p_user_id: decodedToken.user_id,
        p_session_id: null,
        p_action: 'token_refresh',
        p_status: 'failed',
        p_error_message: 'Session not found or inactive',
        p_ip_address:
          request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip'),
        p_user_agent: request.headers.get('user-agent')
      });

      return NextResponse.json(
        { error: 'Session not found or has been revoked' },
        { status: 401 }
      );
    }

    // Check if refresh token is expired
    if (new Date(session.refresh_expires_at) < new Date()) {
      // Mark session as inactive
      await supabase
        .from('child_app_sessions')
        .update({
          is_active: false,
          revoked_at: new Date().toISOString(),
          revoke_reason: 'Refresh token expired'
        })
        .eq('id', session.id);

      return NextResponse.json(
        { error: 'Refresh token has expired' },
        { status: 401 }
      );
    }

    // Get user profile with latest data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(
        `
        *,
        custom_roles (
          role_name,
          permissions
        )
      `
      )
      .eq('id', decodedToken.user_id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    // Check if user is still active
    if (!profile.is_active) {
      await supabase
        .from('child_app_sessions')
        .update({
          is_active: false,
          revoked_at: new Date().toISOString(),
          revoke_reason: 'User account deactivated'
        })
        .eq('id', session.id);

      return NextResponse.json(
        { error: 'User account is not active' },
        { status: 403 }
      );
    }

    // Check if user's role is still allowed for this child app
    if (!childApp.allowed_roles.includes(profile.role)) {
      await supabase
        .from('child_app_sessions')
        .update({
          is_active: false,
          revoked_at: new Date().toISOString(),
          revoke_reason: 'User role no longer allowed'
        })
        .eq('id', session.id);

      return NextResponse.json(
        { error: 'User role not allowed for this application' },
        { status: 403 }
      );
    }

    // Get user-specific permissions
    const { data: userPermissions } = await supabase
      .from('user_child_app_permissions')
      .select('permissions')
      .eq('user_id', decodedToken.user_id)
      .eq('child_app_id', child_app_id)
      .eq('is_active', true)
      .single();

    // Generate new token pair with token rotation
    const newTokenVersion = (session.token_version || 1) + 1;
    const tokenPair = generateTokenPair({
      user_id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
      institution_id: profile.institution_id,
      permissions: {
        ...(profile.custom_roles?.permissions || {}),
        ...(userPermissions?.permissions || {})
      },
      scope: childApp.allowed_scopes,
      child_app_id,
      issued_by: 'myjkkn-parent'
    });

    // Update session with new tokens (token rotation)
    const { error: updateError } = await supabase
      .from('child_app_sessions')
      .update({
        access_token_hash: hashToken(tokenPair.accessToken),
        refresh_token_hash: hashToken(tokenPair.refreshToken),
        token_version: newTokenVersion,
        expires_at: getTokenExpiryDate(tokenPair.expiresIn),
        refresh_expires_at: getTokenExpiryDate(tokenPair.refreshExpiresIn),
        last_used_at: new Date().toISOString(),
        ip_address:
          request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip'),
        user_agent: request.headers.get('user-agent')
      })
      .eq('id', session.id);

    if (updateError) {
      console.error('Session update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to refresh token' },
        { status: 500 }
      );
    }

    // Log successful refresh
    await supabase.rpc('log_child_app_access', {
      p_child_app_id: child_app_id,
      p_user_id: profile.id,
      p_session_id: session.id,
      p_action: 'token_refresh',
      p_status: 'success',
      p_ip_address:
        request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip'),
      p_user_agent: request.headers.get('user-agent'),
      p_metadata: { token_version: newTokenVersion }
    });

    // Return new tokens
    return NextResponse.json({
      access_token: tokenPair.accessToken,
      refresh_token: tokenPair.refreshToken,
      token_type: 'Bearer',
      expires_in: tokenPair.expiresIn,
      user: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        role: profile.role,
        institution_id: profile.institution_id,
        permissions: {
          ...(profile.custom_roles?.permissions || {}),
          ...(userPermissions?.permissions || {})
        }
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/auth/child-app/refresh
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

// app/api/auth/child-app/authorize/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const appId = searchParams.get('app_id');
  const redirectUri = searchParams.get('redirect_uri');
  const responseType = searchParams.get('response_type');
  const scope = searchParams.get('scope');
  const state = searchParams.get('state');

  // Validate required parameters
  if (!appId || !redirectUri || responseType !== 'code') {
    return NextResponse.json(
      { error: 'Invalid request parameters' },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();

  try {
    // Check if user is authenticated
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (!session || sessionError) {
      // Store child app request in session/cookie
      const response = NextResponse.redirect(new URL('/auth/login', request.url));
      response.cookies.set('child_app_auth', JSON.stringify({
        app_id: appId,
        redirect_uri: redirectUri,
        scope,
        state
      }), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 5 // 5 minutes
      });
      return response;
    }

    // Verify the app exists and is active
    const { data: app, error: appError } = await supabase
      .from('applications')
      .select('*')
      .eq('app_id', appId)
      .eq('uses_parent_auth', true)
      .eq('is_active', true)
      .single();

    if (!app || appError) {
      return NextResponse.json(
        { error: 'Application not found or not authorized' },
        { status: 404 }
      );
    }

    // Verify redirect URI is allowed
    const allowedUris = app.allowed_redirect_uris || [];
    if (!allowedUris.includes(redirectUri)) {
      return NextResponse.json(
        { error: 'Redirect URI not allowed' },
        { status: 403 }
      );
    }

    // Check user role access
    const userRole = session.user.user_metadata?.role || 'user';
    const allowedRoles = app.roles_access || [];
    
    if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
      return NextResponse.json(
        { error: 'User does not have required role' },
        { status: 403 }
      );
    }

    // Generate authorization code
    const authCode = generateAuthCode();
    
    // Store auth code with session info using service role client
    const serviceClient = createServiceRoleClient();
    const { error: storeError } = await serviceClient
      .from('child_app_auth_codes')
      .insert({
        code: authCode,
        app_id: appId,
        user_id: session.user.id,
        redirect_uri: redirectUri,
        scope,
        expires_at: new Date(Date.now() + 60000).toISOString() // 1 minute expiry
      });

    if (storeError) {
      console.error('Error storing auth code:', storeError);
      return NextResponse.json(
        { error: 'Failed to generate authorization' },
        { status: 500 }
      );
    }

    // Redirect back to child app with authorization code
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.append('code', authCode);
    if (state) {
      callbackUrl.searchParams.append('state', state);
    }

    return NextResponse.redirect(callbackUrl);
  } catch (error) {
    console.error('Authorization error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { app_id, scope, redirect_uri, state } = body;

    // Validate required parameters
    if (!app_id || !redirect_uri) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // Check if user is authenticated
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (!session || sessionError) {
      return NextResponse.json(
        { error: 'unauthorized', error_description: 'User not authenticated' },
        { status: 401 }
      );
    }

    // Verify the app exists and is active
    const { data: app, error: appError } = await supabase
      .from('applications')
      .select('*')
      .eq('app_id', app_id)
      .eq('uses_parent_auth', true)
      .eq('is_active', true)
      .single();

    if (!app || appError) {
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'Application not found or not authorized' },
        { status: 404 }
      );
    }

    // Verify redirect URI is allowed
    const allowedUris = app.allowed_redirect_uris || [];
    if (!allowedUris.includes(redirect_uri)) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Redirect URI not allowed' },
        { status: 403 }
      );
    }

    // Generate authorization code
    const authCode = generateAuthCode();
    
    // Store auth code with session info using service role client
    const serviceClient = createServiceRoleClient();
    const { error: storeError } = await serviceClient
      .from('child_app_auth_codes')
      .insert({
        code: authCode,
        app_id: app_id,
        user_id: session.user.id,
        redirect_uri: redirect_uri,
        scope: scope || 'read',
        expires_at: new Date(Date.now() + 5 * 60000).toISOString() // 5 minutes expiry
      });

    if (storeError) {
      console.error('Error storing auth code:', storeError);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Failed to generate authorization' },
        { status: 500 }
      );
    }

    // Return the authorization code
    return NextResponse.json({
      code: authCode,
      state: state || ''
    });
  } catch (error) {
    console.error('Authorization error:', error);
    return NextResponse.json(
      { error: 'server_error', error_description: 'Internal server error' },
      { status: 500 }
    );
  }
}

function generateAuthCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 32; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
// app/api/auth/child-app/authorize-optimized/route.ts
// Optimized version using bucketed auth codes - reduces records by 99%

import { NextRequest, NextResponse } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';
import { OptimizedAuthCodesService } from '@/lib/services/child-app/optimized-auth-codes-service';

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
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (!session || sessionError) {
      // Redirect to consent page which will handle login
      const consentUrl = new URL('/auth/child-app/consent', request.url);
      consentUrl.searchParams.set('app_id', appId);
      consentUrl.searchParams.set('redirect_uri', redirectUri);
      consentUrl.searchParams.set('response_type', responseType);
      if (scope) consentUrl.searchParams.set('scope', scope);
      if (state) consentUrl.searchParams.set('state', state);
      
      return NextResponse.redirect(consentUrl);
    }

    // Verify the app exists and is active using service role client
    const serviceClient = createServiceRoleClient();
    const { data: app, error: appError } = await serviceClient
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

    // Get user role from profiles table
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (profileError || !userProfile) {
      console.error('Error fetching user profile:', profileError);
      return NextResponse.json(
        { error: 'Failed to fetch user profile' },
        { status: 500 }
      );
    }

    // Check user role access
    const userRole = userProfile.role || 'user';
    const allowedRoles = app.roles_access || [];

    if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
      console.log('Role access denied:', { userRole, allowedRoles });
      return NextResponse.json(
        { error: 'User does not have required role' },
        { status: 403 }
      );
    }

    // Generate authorization code using optimized service
    const result = await OptimizedAuthCodesService.generateAuthCode({
      appId,
      userId: session.user.id,
      redirectUri,
      scope: scope || undefined,
      state: state || undefined,
      expiresInMinutes: 5
    });

    if (!result.success || !result.code) {
      console.error('Error generating auth code:', result.error);
      return NextResponse.json(
        { error: 'Failed to generate authorization' },
        { status: 500 }
      );
    }

    console.log(`[Optimized] Auth code generated and stored in bucket: ${result.bucketKey}`);

    // Redirect back to child app with authorization code
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.append('code', result.code);
    if (state) {
      callbackUrl.searchParams.append('state', state);
    }

    // Trigger auto-cleanup if needed (async, don't wait)
    OptimizedAuthCodesService.autoCleanupIfNeeded().catch(console.error);

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
        {
          error: 'invalid_request',
          error_description: 'Missing required parameters'
        },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // Check if user is authenticated
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (!session || sessionError) {
      return NextResponse.json(
        { error: 'unauthorized', error_description: 'User not authenticated' },
        { status: 401 }
      );
    }

    // Verify the app exists and is active using service role client  
    const serviceClient = createServiceRoleClient();
    const { data: app, error: appError } = await serviceClient
      .from('applications')
      .select('*')
      .eq('app_id', app_id)
      .eq('uses_parent_auth', true)
      .eq('is_active', true)
      .single();

    if (!app || appError) {
      return NextResponse.json(
        {
          error: 'invalid_client',
          error_description: 'Application not found or not authorized'
        },
        { status: 404 }
      );
    }

    // Verify redirect URI is allowed
    const allowedUris = app.allowed_redirect_uris || [];
    if (!allowedUris.includes(redirect_uri)) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Redirect URI not allowed'
        },
        { status: 403 }
      );
    }

    // Generate authorization code using optimized service
    const result = await OptimizedAuthCodesService.generateAuthCode({
      appId: app_id,
      userId: session.user.id,
      redirectUri: redirect_uri,
      scope: scope || 'read',
      state,
      expiresInMinutes: 5
    });

    if (!result.success || !result.code) {
      console.error('Error generating auth code:', result.error);
      return NextResponse.json(
        {
          error: 'server_error',
          error_description: 'Failed to generate authorization'
        },
        { status: 500 }
      );
    }

    console.log(`[Optimized] Auth code generated for ${app_id}, bucket: ${result.bucketKey}`);

    // Return the authorization code
    return NextResponse.json({
      code: result.code,
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
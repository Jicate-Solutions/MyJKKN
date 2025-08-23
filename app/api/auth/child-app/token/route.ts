// app/api/auth/child-app/token-optimized/route.ts
// Optimized version using unified session storage

import { NextRequest, NextResponse } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';
import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';
import { OptimizedSessionManagerService } from '@/lib/services/child-app/optimized-session-manager-service';
import { OptimizedAuthCodesService } from '@/lib/services/child-app/optimized-auth-codes-service';
import { ChildAppAnalyticsService } from '@/lib/services/child-app/analytics-service';

// Add OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
}

export async function POST(request: NextRequest) {
  // Create CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  try {
    const body = await request.json();
    const {
      grant_type,
      code,
      app_id,
      api_key,
      redirect_uri,
      refresh_token,
      state
    } = body;

    // Use service role client for database operations
    const serviceClient = createServiceRoleClient();
    const supabase = await createServerSupabaseClient();

    // Validate app credentials
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
          error_description: 'Invalid app credentials'
        },
        { status: 401, headers: corsHeaders }
      );
    }

    // Verify API key
    if (api_key && app.api_key_hash) {
      const encoder = new TextEncoder();
      const data = encoder.encode(api_key);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const apiKeyHash = hashArray
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      if (apiKeyHash !== app.api_key_hash) {
        return NextResponse.json(
          { error: 'invalid_client', error_description: 'Invalid API key' },
          { status: 401, headers: corsHeaders }
        );
      }
    }

    if (grant_type === 'authorization_code') {
      // Validate and use the authorization code
      const validationResult = await OptimizedAuthCodesService.validateAuthCode({
        code,
        appId: app_id,
        redirectUri: redirect_uri
      });

      if (!validationResult.valid || !validationResult.codeData) {
        return NextResponse.json(
          {
            error: 'invalid_grant',
            error_description: validationResult.error || 'Invalid authorization code'
          },
          { status: 400, headers: corsHeaders }
        );
      }

      const authCode = validationResult.codeData;

      // Validate state parameter if provided
      if (state && authCode.state && state !== authCode.state) {
        console.warn('State parameter mismatch detected:', {
          app_id,
          user_id: authCode.user_id,
          provided_state: state,
          stored_state: authCode.state
        });

        return NextResponse.json(
          {
            error: 'invalid_request',
            error_description: 'State parameter mismatch - possible CSRF attack'
          },
          { status: 400, headers: corsHeaders }
        );
      }

      // Get user profile
      const { data: profile, error: profileError } = await serviceClient
        .from('profiles')
        .select('*')
        .eq('id', authCode.user_id)
        .single();

      if (!profile || profileError) {
        return NextResponse.json(
          {
            error: 'server_error',
            error_description: 'Failed to fetch user profile'
          },
          { status: 500, headers: corsHeaders }
        );
      }

      // Generate tokens
      const secret = new TextEncoder().encode(
        process.env.JWT_SECRET || 'your-secret-key'
      );

      const accessToken = await new SignJWT({
        sub: authCode.user_id,
        email: profile.email,
        role: profile.role,
        app_id: app_id,
        scope: authCode.scope || 'read write profile',
        institution_id: profile.institution_id
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(secret);

      const refreshTokenValue = await new SignJWT({
        sub: authCode.user_id,
        app_id: app_id,
        type: 'refresh'
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(secret);

      // Create user session using optimized service
      const sessionResult = await OptimizedSessionManagerService.createUserSession({
        userId: authCode.user_id,
        appId: app_id,
        accessToken,
        refreshToken: refreshTokenValue,
        expiresIn: 3600,
        scopes: (authCode.scope || 'read write profile').split(' '),
        ipAddress:
          request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip') ||
          undefined,
        userAgent: request.headers.get('user-agent') || undefined
      });

      if (!sessionResult.success) {
        console.warn('Failed to create session:', sessionResult.error);
      }

      // Log authentication success
      await ChildAppAnalyticsService.logAuth({
        appId: app_id,
        userId: authCode.user_id,
        action: 'login',
        status: 'success',
        ipAddress:
          request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip') ||
          undefined,
        userAgent: request.headers.get('user-agent') || undefined
      });

      // Update last auth activity
      await serviceClient
        .from('applications')
        .update({ last_auth_activity: new Date().toISOString() })
        .eq('id', app.id);

      // Trigger cleanup if needed (async, don't wait)
      OptimizedAuthCodesService.autoCleanupIfNeeded().catch(console.error);

      console.log(`[Optimized] Token generated for user ${authCode.user_id} on app ${app_id}`);

      return NextResponse.json(
        {
          access_token: accessToken,
          refresh_token: refreshTokenValue,
          token_type: 'Bearer',
          expires_in: 3600,
          scope: authCode.scope || 'read write profile',
          user: {
            id: authCode.user_id,
            email: profile.email,
            full_name: profile.full_name,
            role: profile.role,
            institution_id: profile.institution_id
          }
        },
        { headers: corsHeaders }
      );
    } else if (grant_type === 'refresh_token') {
      // Handle refresh token
      if (!refresh_token) {
        return NextResponse.json(
          {
            error: 'invalid_request',
            error_description: 'Refresh token required'
          },
          { status: 400, headers: corsHeaders }
        );
      }

      // Verify refresh token
      const secret = new TextEncoder().encode(
        process.env.JWT_SECRET || 'your-secret-key'
      );

      try {
        const { payload } = await jwtVerify(refresh_token, secret);

        if (payload.app_id !== app_id || payload.type !== 'refresh') {
          throw new Error('Invalid refresh token');
        }

        // Validate session exists using optimized service
        const sessionValidation = await OptimizedSessionManagerService.validateSession({
          userId: payload.sub as string,
          appId: app_id,
          accessToken: refresh_token // Using refresh token for validation
        });

        if (!sessionValidation.valid) {
          throw new Error('Session not found or expired');
        }

        // Get user profile
        const { data: profile, error: profileError } = await serviceClient
          .from('profiles')
          .select('*')
          .eq('id', payload.sub)
          .single();

        if (!profile || profileError) {
          throw new Error('User not found');
        }

        // Check if user is still active
        if (!profile.is_active) {
          return NextResponse.json(
            {
              error: 'invalid_grant',
              error_description: 'User account is inactive'
            },
            { status: 403, headers: corsHeaders }
          );
        }

        // Generate new access token
        const accessToken = await new SignJWT({
          sub: payload.sub,
          email: profile.email,
          role: profile.role,
          app_id: app_id,
          scope: 'read write profile',
          institution_id: profile.institution_id
        })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt()
          .setExpirationTime('1h')
          .sign(secret);

        // Update session with new access token
        const sessionResult = await OptimizedSessionManagerService.createUserSession({
          userId: payload.sub as string,
          appId: app_id,
          accessToken,
          refreshToken: refresh_token,
          expiresIn: 3600,
          scopes: ['read', 'write', 'profile'],
          ipAddress:
            request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip') ||
            undefined,
          userAgent: request.headers.get('user-agent') || undefined
        });

        if (!sessionResult.success) {
          console.warn('Failed to update session:', sessionResult.error);
        }

        // Log token refresh
        await ChildAppAnalyticsService.logAuth({
          appId: app_id,
          userId: payload.sub as string,
          action: 'token_refresh',
          status: 'success',
          ipAddress:
            request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip') ||
            undefined,
          userAgent: request.headers.get('user-agent') || undefined
        });

        return NextResponse.json(
          {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'read write profile'
          },
          { headers: corsHeaders }
        );
      } catch (error) {
        return NextResponse.json(
          {
            error: 'invalid_grant',
            error_description: 'Invalid refresh token'
          },
          { status: 400, headers: corsHeaders }
        );
      }
    } else {
      return NextResponse.json(
        {
          error: 'unsupported_grant_type',
          error_description: 'Grant type not supported'
        },
        { status: 400, headers: corsHeaders }
      );
    }
  } catch (error) {
    console.error('Token exchange error:', error);
    return NextResponse.json(
      { error: 'server_error', error_description: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
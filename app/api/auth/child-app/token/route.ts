// app/api/auth/child-app/token/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { grant_type, code, app_id, api_key, redirect_uri, refresh_token } = body;

    const supabase = await createServerSupabaseClient();

    // Validate app credentials
    const { data: app, error: appError } = await supabase
      .from('applications')
      .select('*')
      .eq('app_id', app_id)
      .eq('uses_parent_auth', true)
      .eq('is_active', true)
      .single();

    if (!app || appError) {
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'Invalid app credentials' },
        { status: 401 }
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
          { status: 401 }
        );
      }
    }

    if (grant_type === 'authorization_code') {
      // Exchange authorization code for tokens
      const { data: authCode, error: codeError } = await supabase
        .from('child_app_auth_codes')
        .select('*')
        .eq('code', code)
        .eq('app_id', app_id)
        .eq('redirect_uri', redirect_uri)
        .single();

      if (!authCode || codeError) {
        return NextResponse.json(
          { error: 'invalid_grant', error_description: 'Invalid authorization code' },
          { status: 400 }
        );
      }

      // Check if code is expired
      if (new Date(authCode.expires_at) < new Date()) {
        return NextResponse.json(
          { error: 'invalid_grant', error_description: 'Authorization code expired' },
          { status: 400 }
        );
      }

      // Check if code was already used
      if (authCode.used_at) {
        return NextResponse.json(
          { error: 'invalid_grant', error_description: 'Authorization code already used' },
          { status: 400 }
        );
      }

      // Mark code as used
      await supabase
        .from('child_app_auth_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('code', code);

      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authCode.user_id)
        .single();

      if (!profile || profileError) {
        return NextResponse.json(
          { error: 'server_error', error_description: 'Failed to fetch user profile' },
          { status: 500 }
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

      // Update last auth activity
      await supabase
        .from('applications')
        .update({ last_auth_activity: new Date().toISOString() })
        .eq('id', app.id);

      return NextResponse.json({
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
      });
    } else if (grant_type === 'refresh_token') {
      // Handle refresh token
      if (!refresh_token) {
        return NextResponse.json(
          { error: 'invalid_request', error_description: 'Refresh token required' },
          { status: 400 }
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

        // Get user profile
        const { data: profile, error: profileError } = await supabase
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
            { error: 'invalid_grant', error_description: 'User account is inactive' },
            { status: 403 }
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

        return NextResponse.json({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write profile'
        });
      } catch (error) {
        return NextResponse.json(
          { error: 'invalid_grant', error_description: 'Invalid refresh token' },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'unsupported_grant_type', error_description: 'Grant type not supported' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Token exchange error:', error);
    return NextResponse.json(
      { error: 'server_error', error_description: 'Internal server error' },
      { status: 500 }
    );
  }
}
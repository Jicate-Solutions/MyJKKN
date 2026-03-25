/**
 * LTI OIDC Login Initiation Endpoint
 * GET/POST /api/lti/auth - Handle OIDC login initiation from LTI tool
 *
 * This endpoint handles Step 1 of the LTI 1.3 OIDC flow when a tool
 * (MATLAB) initiates a login to the platform (MyJKKN).
 *
 * Flow:
 * 1. Tool sends login initiation request
 * 2. Platform validates request
 * 3. Platform creates authentication request
 * 4. Platform redirects to tool's authentication URL
 *
 * Created: 2026-01-12
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { LtiToolService } from '@/lib/services/lti/lti-tool-service';
import { LtiError } from '@/types/lti';

/**
 * Handle both GET and POST for OIDC login initiation
 */
async function handleOidcLogin(request: NextRequest) {
  try {
    // Parse parameters (from query string or form body)
    const url = new URL(request.url);
    const searchParams = url.searchParams;

    // Get parameters from query string (GET) or form body (POST)
    let params: Record<string, string>;
    if (request.method === 'POST') {
      const formData = await request.formData();
      params = Object.fromEntries(
        Array.from(formData.entries()).map(([key, value]) => [
          key,
          typeof value === 'string' ? value : value.name
        ])
      );
    } else {
      params = Object.fromEntries(searchParams);
    }

    // Required OIDC parameters
    const iss = params.iss; // Issuer (tool's identifier)
    const login_hint = params.login_hint; // User identifier hint
    const target_link_uri = params.target_link_uri; // Where to launch
    const lti_message_hint = params.lti_message_hint; // Optional context hint
    const client_id = params.client_id; // Tool's client ID

    // Validate required parameters
    if (!iss || !login_hint || !target_link_uri) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Missing required OIDC parameters: iss, login_hint, target_link_uri'
        },
        { status: 400 }
      );
    }

    // Find tool by client_id or issuer
    let tool;
    try {
      if (client_id) {
        tool = await LtiToolService.getToolByClientId(client_id);
      } else {
        // Try to find by launch URL if no client_id
        const tools = await LtiToolService.getAllTools(false);
        tool = tools.find(t => target_link_uri.startsWith(t.launch_url));

        if (!tool) {
          throw new Error('Tool not found');
        }
      }
    } catch (error) {
      return NextResponse.json(
        {
          error: 'TOOL_NOT_FOUND',
          message: 'No registered LTI tool found for this request'
        },
        { status: 404 }
      );
    }

    // Check if tool is active
    if (!tool.is_active) {
      return NextResponse.json(
        {
          error: 'TOOL_INACTIVE',
          message: 'This LTI tool is not currently active'
        },
        { status: 403 }
      );
    }

    // Check user authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      // User not authenticated - redirect to login
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('redirect_to', request.url);

      return NextResponse.redirect(loginUrl);
    }

    // Generate state parameter (CSRF protection)
    const state = crypto.randomUUID();

    // Generate nonce (replay protection)
    const nonce = crypto.randomUUID();

    // Store state and nonce in session/database for validation
    // For now, we'll use URL parameters (in production, use secure session storage)
    const stateData = {
      state,
      nonce,
      tool_id: tool.id,
      user_id: user.id,
      login_hint,
      lti_message_hint,
      created_at: Date.now()
    };

    // Build authentication request to tool's OIDC auth URL
    const authUrl = new URL(tool.oidc_auth_url);
    authUrl.searchParams.set('scope', 'openid');
    authUrl.searchParams.set('response_type', 'id_token');
    authUrl.searchParams.set('response_mode', 'form_post');
    authUrl.searchParams.set('client_id', tool.client_id);
    authUrl.searchParams.set('redirect_uri', tool.redirect_uri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);
    authUrl.searchParams.set('prompt', 'none');
    authUrl.searchParams.set('login_hint', login_hint);

    if (lti_message_hint) {
      authUrl.searchParams.set('lti_message_hint', lti_message_hint);
    }

    // In a real implementation, store stateData securely
    // For now, log it for debugging
    console.log('[LTI OIDC] Login initiation:', {
      tool: tool.name,
      user: user.id,
      state,
      redirect: authUrl.toString()
    });

    // Redirect to tool's authentication endpoint
    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    console.error('[LTI OIDC Auth] Error:', error);

    if (error instanceof LtiError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        error: 'OIDC_ERROR',
        message: 'Failed to process OIDC login initiation'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handleOidcLogin(request);
}

export async function POST(request: NextRequest) {
  return handleOidcLogin(request);
}

/**
 * LTI OAuth 2.0 Token Endpoint
 * POST /api/lti/token - Issue access tokens for LTI Advantage services
 *
 * This endpoint implements OAuth 2.0 Client Credentials Grant for:
 * - Assignment and Grade Services (AGS) - for grade passback
 * - Names and Roles Provisioning Service (NRPS) - for roster sync
 *
 * Flow:
 * 1. Tool (MATLAB) requests access token with specific scopes
 * 2. Platform validates tool credentials
 * 3. Platform issues JWT access token with requested scopes
 *
 * Created: 2026-01-12
 */

import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, importPKCS8 } from 'jose';
import { LtiToolService } from '@/lib/services/lti/lti-tool-service';
import { LtiError, LTI_ERROR_CODES } from '@/types/lti';

// LTI Advantage scopes
const VALID_SCOPES = [
  // Assignment and Grade Services (AGS)
  'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
  'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
  'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
  'https://purl.imsglobal.org/spec/lti-ags/scope/score',

  // Names and Roles Provisioning Service (NRPS)
  'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly'
];

/**
 * POST /api/lti/token
 * OAuth 2.0 Client Credentials Grant
 */
export async function POST(request: NextRequest) {
  try {
    // Parse form data (OAuth 2.0 uses application/x-www-form-urlencoded)
    const formData = await request.formData();
    const params = Object.fromEntries(formData);

    // Required OAuth 2.0 parameters
    const grant_type = params.grant_type;
    const client_assertion_type = params.client_assertion_type;
    const client_assertion = params.client_assertion;
    const scope = params.scope;

    // Validate grant type
    if (grant_type !== 'client_credentials') {
      return NextResponse.json(
        {
          error: 'unsupported_grant_type',
          error_description: 'Only client_credentials grant type is supported'
        },
        { status: 400 }
      );
    }

    // Validate client assertion type (JWT)
    if (
      client_assertion_type !==
      'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
    ) {
      return NextResponse.json(
        {
          error: 'invalid_client',
          error_description: 'Invalid client_assertion_type'
        },
        { status: 400 }
      );
    }

    if (!client_assertion) {
      return NextResponse.json(
        {
          error: 'invalid_client',
          error_description: 'client_assertion is required'
        },
        { status: 400 }
      );
    }

    // TODO: Validate client_assertion JWT
    // 1. Decode JWT
    // 2. Verify signature with tool's public key
    // 3. Validate claims (iss, sub, aud, exp)
    // For now, we'll extract the client_id from the assertion

    // Parse JWT to get client_id (simplified - should use jose library)
    const jwtParts = (client_assertion as string).split('.');
    if (jwtParts.length !== 3) {
      return NextResponse.json(
        {
          error: 'invalid_client',
          error_description: 'Invalid JWT format'
        },
        { status: 400 }
      );
    }

    const payload = JSON.parse(
      Buffer.from(jwtParts[1], 'base64url').toString()
    );
    const client_id = payload.sub || payload.iss;

    if (!client_id) {
      return NextResponse.json(
        {
          error: 'invalid_client',
          error_description: 'Could not determine client_id from assertion'
        },
        { status: 400 }
      );
    }

    // Find and validate tool
    let tool;
    try {
      tool = await LtiToolService.getToolByClientId(client_id);
    } catch (error) {
      return NextResponse.json(
        {
          error: 'invalid_client',
          error_description: 'Tool not found or not registered'
        },
        { status: 401 }
      );
    }

    if (!tool.is_active) {
      return NextResponse.json(
        {
          error: 'invalid_client',
          error_description: 'Tool is not active'
        },
        { status: 401 }
      );
    }

    // Validate and filter requested scopes
    const requestedScopes = scope ? (scope as string).split(' ') : [];
    const invalidScopes = requestedScopes.filter(s => !VALID_SCOPES.includes(s));

    if (invalidScopes.length > 0) {
      return NextResponse.json(
        {
          error: 'invalid_scope',
          error_description: `Invalid scopes: ${invalidScopes.join(', ')}`
        },
        { status: 400 }
      );
    }

    // Check tool capabilities
    const grantedScopes: string[] = [];

    // AGS scopes (grade passback)
    if (tool.supports_grade_passback) {
      const agsScopes = requestedScopes.filter(s =>
        s.startsWith('https://purl.imsglobal.org/spec/lti-ags/')
      );
      grantedScopes.push(...agsScopes);
    }

    // NRPS scopes (roster)
    if (tool.supports_names_roles) {
      const nrpsScopes = requestedScopes.filter(s =>
        s.startsWith('https://purl.imsglobal.org/spec/lti-nrps/')
      );
      grantedScopes.push(...nrpsScopes);
    }

    if (grantedScopes.length === 0 && requestedScopes.length > 0) {
      return NextResponse.json(
        {
          error: 'invalid_scope',
          error_description: 'Tool does not support requested scopes'
        },
        { status: 400 }
      );
    }

    // Generate access token (JWT)
    const privateKey = await importPKCS8(
      process.env.LTI_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      'RS256'
    );

    const now = Math.floor(Date.now() / 1000);
    const issuer = process.env.LTI_ISSUER || 'https://myjkkn.jkkn.ac.in';
    const keyId = process.env.LTI_KEY_ID || 'myjkkn-2026-key-001';

    const accessToken = await new SignJWT({
      sub: client_id,
      aud: tool.launch_url,
      scope: grantedScopes.join(' '),
      iat: now,
      exp: now + 3600 // 1 hour expiration
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: keyId })
      .setIssuer(issuer)
      .sign(privateKey);

    // Return OAuth 2.0 token response
    return NextResponse.json(
      {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: grantedScopes.join(' ')
      },
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          Pragma: 'no-cache'
        }
      }
    );
  } catch (error) {
    console.error('[LTI OAuth Token] Error:', error);

    if (error instanceof LtiError) {
      return NextResponse.json(
        { error: error.code, error_description: error.message },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        error: 'server_error',
        error_description: 'Failed to issue access token'
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/lti/token
 * Handle CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    }
  );
}

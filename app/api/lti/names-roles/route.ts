/**
 * LTI Names and Roles Provisioning Service (NRPS) Endpoint
 * GET /api/lti/names-roles - Provide student roster to external tools
 *
 * This endpoint implements the LTI Advantage NRPS specification for
 * sharing class rosters with external tools like MATLAB Grader.
 *
 * Flow:
 * 1. Faculty creates assignment in MATLAB
 * 2. MATLAB requests student roster for the course
 * 3. MyJKKN validates OAuth token and scope
 * 4. MyJKKN returns list of students with names, emails, roles
 * 5. MATLAB auto-enrolls students in the assignment
 *
 * Security:
 * - Validates OAuth 2.0 Bearer token from tool
 * - Verifies token has NRPS scope
 * - Checks tool is registered and active
 * - Institution-based filtering (RLS)
 *
 * Created: 2026-01-12
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, importSPKI } from 'jose';
import {
  LtiRosterService,
  type LtiNrpsResponse
} from '@/lib/services/lti/lti-roster-service';
import { LtiToolService } from '@/lib/services/lti/lti-tool-service';
import { LtiError, LTI_ERROR_CODES } from '@/types/lti';

/**
 * Verify OAuth token from tool
 */
async function verifyOAuthToken(authHeader: string | null): Promise<{
  clientId: string;
  scope: string[];
}> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new LtiError(
      LTI_ERROR_CODES.UNAUTHORIZED,
      'Missing or invalid Authorization header',
      401
    );
  }

  const token = authHeader.substring(7); // Remove "Bearer "

  try {
    // Import our platform's public key for verification
    const publicKey = await importSPKI(
      process.env.LTI_PUBLIC_KEY!.replace(/\\n/g, '\n'),
      'RS256'
    );

    // Verify JWT signature
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: process.env.LTI_ISSUER || 'https://jkkn.ai',
      algorithms: ['RS256']
    });

    // Extract client_id and scope
    const clientId = payload.sub as string;
    const scopeString = payload.scope as string;
    const scopes = scopeString ? scopeString.split(' ') : [];

    if (!clientId) {
      throw new LtiError(
        LTI_ERROR_CODES.INVALID_TOKEN,
        'Token missing client_id',
        401
      );
    }

    return { clientId, scope: scopes };
  } catch (error) {
    console.error('[LTI Names & Roles] Token verification failed:', error);
    throw new LtiError(
      LTI_ERROR_CODES.INVALID_TOKEN,
      'Invalid or expired access token',
      401
    );
  }
}

/**
 * Check if token has required NRPS scope
 */
function hasNrpsScope(scopes: string[]): boolean {
  const nrpsScope =
    'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly';
  return scopes.includes(nrpsScope);
}

/**
 * GET /api/lti/names-roles
 * Provide roster for a context
 */
export async function GET(request: NextRequest) {
  try {

    // 1. Verify OAuth token
    const authHeader = request.headers.get('Authorization');
    const { clientId, scope } = await verifyOAuthToken(authHeader);

    // 2. Check NRPS scope
    if (!hasNrpsScope(scope)) {
      return NextResponse.json(
        {
          error: 'insufficient_scope',
          error_description: 'Token does not have NRPS scope'
        },
        { status: 403 }
      );
    }

    // 3. Validate tool
    let tool;
    try {
      tool = await LtiToolService.getToolByClientId(clientId);
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
          error: 'tool_inactive',
          error_description: 'Tool is not active'
        },
        { status: 403 }
      );
    }

    if (!tool.supports_names_roles) {
      return NextResponse.json(
        {
          error: 'feature_not_supported',
          error_description: 'Tool does not support names and roles service'
        },
        { status: 403 }
      );
    }

    // 4. Parse context_id from query parameters
    const { searchParams } = new URL(request.url);
    const contextId = searchParams.get('context_id');

    if (!contextId) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Missing context_id parameter'
        },
        { status: 400 }
      );
    }

    // Parse context ID
    const { institutionId, programId, semesterId, sectionId } =
      LtiRosterService.parseContextId(contextId);

    if (!institutionId) {
      return NextResponse.json(
        {
          error: 'invalid_context',
          error_description: 'Invalid context_id format'
        },
        { status: 400 }
      );
    }

    // 5. Parse pagination parameters
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    // 6. Get roster
    const roster: LtiNrpsResponse = await LtiRosterService.getCompleteRoster({
      institutionId,
      programId,
      semesterId,
      sectionId,
      limit,
      offset
    });

    // 7. Return LTI NRPS format
    return NextResponse.json(
      {
        id: roster.id,
        context: roster.context,
        members: roster.members
      },
      {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
          Pragma: 'no-cache'
        }
      }
    );
  } catch (error) {
    console.error('[LTI Names & Roles] Error processing request:', error);

    if (error instanceof LtiError) {
      return NextResponse.json(
        {
          error: error.code,
          error_description: error.message
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        error: 'server_error',
        error_description: 'Failed to retrieve roster'
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/lti/names-roles
 * Handle CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    }
  );
}

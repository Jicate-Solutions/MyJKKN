/**
 * LTI Grade Passback Endpoint (AGS)
 * POST /api/lti/grades - Receive grades from external LTI tools
 *
 * This endpoint implements the LTI Advantage Assignment and Grade Services (AGS)
 * specification for receiving score updates from external tools like MATLAB Grader.
 *
 * Flow:
 * 1. Student completes assignment in MATLAB
 * 2. MATLAB auto-grades the submission
 * 3. MATLAB sends grade to this endpoint
 * 4. MyJKKN validates and stores the grade
 * 5. Grade appears in student's grade view
 *
 * Security:
 * - Validates OAuth 2.0 Bearer token from tool
 * - Verifies token has AGS scope
 * - Checks tool is registered and active
 * - Prevents duplicate grades (idempotency)
 *
 * Created: 2026-01-12
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, importSPKI } from 'jose';
import {
  LtiGradeService,
  type LtiGradePayload,
  type LtiGradeContext
} from '@/lib/services/lti/lti-grade-service';
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
    console.error('[LTI Grades] Token verification failed:', error);
    throw new LtiError(
      LTI_ERROR_CODES.INVALID_TOKEN,
      'Invalid or expired access token',
      401
    );
  }
}

/**
 * Check if token has required AGS scope
 */
function hasAgsScope(scopes: string[]): boolean {
  const agsScopes = [
    'https://purl.imsglobal.org/spec/lti-ags/scope/score',
    'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem'
  ];

  return scopes.some((scope) => agsScopes.includes(scope));
}

/**
 * Parse LTI AGS grade payload
 */
function parseGradePayload(body: any): LtiGradePayload {
  // LTI AGS uses these field names
  return {
    userId: body.userId || body.user_id,
    scoreGiven: body.scoreGiven ?? body.score_given,
    scoreMaximum: body.scoreMaximum ?? body.score_maximum ?? 100,
    comment: body.comment,
    timestamp: body.timestamp,
    activityProgress: body.activityProgress ?? body.activity_progress,
    gradingProgress: body.gradingProgress ?? body.grading_progress
  };
}

/**
 * POST /api/lti/grades
 * Receive grade from external tool (MATLAB)
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[LTI Grades] Received grade passback request');

    // 1. Verify OAuth token
    const authHeader = request.headers.get('Authorization');
    const { clientId, scope } = await verifyOAuthToken(authHeader);

    console.log('[LTI Grades] Token verified:', { clientId, scope });

    // 2. Check AGS scope
    if (!hasAgsScope(scope)) {
      return NextResponse.json(
        {
          error: 'insufficient_scope',
          error_description: 'Token does not have AGS scope'
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

    if (!tool.supports_grade_passback) {
      return NextResponse.json(
        {
          error: 'feature_not_supported',
          error_description: 'Tool does not support grade passback'
        },
        { status: 403 }
      );
    }

    // 4. Parse request body
    const body = await request.json();
    const gradePayload = parseGradePayload(body);

    // Extract resource link info
    const resourceLinkId =
      body.resourceLinkId ||
      body.resource_link_id ||
      body.lineItemId ||
      body.line_item_id;

    if (!resourceLinkId) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Missing resourceLinkId or lineItemId'
        },
        { status: 400 }
      );
    }

    const resourceLinkTitle =
      body.resourceLinkTitle ||
      body.resource_link_title ||
      body.lineItemLabel ||
      body.line_item_label;

    const context: LtiGradeContext = {
      toolId: tool.id,
      resourceLinkId,
      resourceLinkTitle,
      launchId: body.launchId || body.launch_id
    };

    console.log('[LTI Grades] Processing grade:', {
      userId: gradePayload.userId,
      score: `${gradePayload.scoreGiven}/${gradePayload.scoreMaximum}`,
      resourceLinkId
    });

    // 5. Process grade
    const result = await LtiGradeService.processGrade(gradePayload, context);

    // 6. Return success
    if (result.isDuplicate) {
      console.log('[LTI Grades] Duplicate grade, returning OK');
      return NextResponse.json(
        {
          success: true,
          message: 'Grade already recorded',
          gradeId: result.grade.id,
          duplicate: true
        },
        { status: 200 }
      );
    }

    console.log('[LTI Grades] Grade stored successfully:', {
      gradeId: result.grade.id,
      percentage: result.grade.score_percentage
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Grade recorded successfully',
        gradeId: result.grade.id,
        scorePercentage: result.grade.score_percentage
      },
      {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          Pragma: 'no-cache'
        }
      }
    );
  } catch (error) {
    console.error('[LTI Grades] Error processing grade:', error);

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
        error_description: 'Failed to process grade'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/lti/grades
 * List grades (for debugging/admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' },
        { status: 400 }
      );
    }

    const grades = await LtiGradeService.getGradesForUser(userId, {
      limit: 50
    });

    return NextResponse.json({
      success: true,
      data: grades,
      count: grades.length
    });
  } catch (error) {
    console.error('[LTI Grades GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch grades' },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/lti/grades
 * Handle CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    }
  );
}

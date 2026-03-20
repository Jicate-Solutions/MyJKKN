/**
 * LTI Launch API Endpoint
 * POST /api/lti/launch - Launch LTI 1.3 tool
 *
 * Generates JWT, records launch, returns auto-submit form
 *
 * Created: 2026-01-12
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { LtiLaunchService } from '@/lib/services/lti/lti-launch-service';
import { LtiError } from '@/types/lti';

/**
 * POST /api/lti/launch
 * Launch LTI tool with JWT generation
 *
 * Request body:
 * {
 *   toolId: string (required)
 *   resourceLinkId?: string
 *   resourceLinkTitle?: string
 *   resourceLinkDescription?: string
 *   launchType?: 'assignment' | 'resource' | 'deep_link' | 'content_selection'
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in to launch tools' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const {
      toolId,
      resourceLinkId,
      resourceLinkTitle,
      resourceLinkDescription,
      launchType = 'resource'
    } = body;

    if (!toolId) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'toolId is required' },
        { status: 400 }
      );
    }

    // Get user profile to determine role
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User profile not found' },
        { status: 404 }
      );
    }

    const userRole = profile.role;

    // Get institution access (use first institution for now)
    const { data: institutionAccess } = await supabase
      .from('user_institution_access')
      .select('institution_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!institutionAccess) {
      return NextResponse.json(
        {
          error: 'NO_INSTITUTION_ACCESS',
          message: 'User does not have access to any institution'
        },
        { status: 403 }
      );
    }

    const institutionId = institutionAccess.institution_id;

    // Get learner profile if user is a student
    let learnerProfileId: string | undefined;
    let programId: string | undefined;
    let semesterId: string | undefined;
    let sectionId: string | undefined;
    let academicYearId: string | undefined;

    if (userRole === 'student') {
      const { data: learner } = await supabase
        .from('learners_profiles')
        .select(`
          id,
          program_id,
          semester_id,
          section_id,
          academic_year_id,
          lifecycle_status
        `)
        .eq('user_id', user.id)
        .eq('institution_id', institutionId)
        .single();

      if (!learner) {
        return NextResponse.json(
          {
            error: 'LEARNER_NOT_FOUND',
            message: 'Student profile not found'
          },
          { status: 404 }
        );
      }

      if (learner.lifecycle_status !== 'active') {
        return NextResponse.json(
          {
            error: 'INACTIVE_ACCOUNT',
            message: 'Your student account is not active. Please contact administration.'
          },
          { status: 403 }
        );
      }

      learnerProfileId = learner.id;
      programId = learner.program_id;
      semesterId = learner.semester_id;
      sectionId = learner.section_id;
      academicYearId = learner.academic_year_id;
    }

    // Get IP address and user agent for tracking
    const ipAddress = request.headers.get('x-forwarded-for') ||
                      request.headers.get('x-real-ip') ||
                      'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Execute launch
    const launchResult = await LtiLaunchService.launch({
      toolId,
      userId: user.id,
      userRole,
      learnerProfileId,
      institutionId,
      programId,
      semesterId,
      sectionId,
      academicYearId,
      resourceLinkId,
      resourceLinkTitle,
      resourceLinkDescription,
      launchType: launchType as any,
      ipAddress,
      userAgent
    });

    // Return auto-submit HTML form
    return new NextResponse(launchResult.formHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
  } catch (error) {
    console.error('[LTI Launch API] Launch failed:', error);

    if (error instanceof LtiError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        error: 'LAUNCH_FAILED',
        message: 'Failed to launch tool. Please try again or contact support.'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/lti/launch
 * Alternative GET endpoint for simple launches (no resource link)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const toolId = searchParams.get('tool_id');

  if (!toolId) {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'tool_id query parameter is required' },
      { status: 400 }
    );
  }

  // Convert GET to POST request
  const postRequest = new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ toolId })
  });

  return POST(postRequest as NextRequest);
}

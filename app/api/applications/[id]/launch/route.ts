/**
 * Application Launch API
 * POST /api/applications/[id]/launch - Launch application by ID
 *
 * Convenience endpoint that determines integration type and launches accordingly
 *
 * Created: 2026-01-12
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/applications/[id]/launch
 * Launch application by ID (auto-detects integration type)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 16 async params)
    const { id } = await params;

    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in' },
        { status: 401 }
      );
    }

    // Fetch application
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('id, name, integration_type, lti_tool_id, url, is_active')
      .eq('id', id)
      .single();

    if (appError || !application) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Application not found' },
        { status: 404 }
      );
    }

    if (!application.is_active) {
      return NextResponse.json(
        { error: 'INACTIVE', message: 'Application is not active' },
        { status: 403 }
      );
    }

    // Handle based on integration type
    if (application.integration_type === 'lti_1.3') {
      // LTI 1.3 - forward to LTI launch endpoint
      if (!application.lti_tool_id) {
        return NextResponse.json(
          { error: 'CONFIGURATION_ERROR', message: 'LTI tool not configured' },
          { status: 500 }
        );
      }

      // Parse request body for optional parameters
      const body = await request.json().catch(() => ({}));

      // Forward to LTI launch endpoint
      const ltiRequest = new Request(new URL('/api/lti/launch', request.url), {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify({
          toolId: application.lti_tool_id,
          ...body
        })
      });

      // Import and call the LTI launch handler
      const { POST: ltiLaunchHandler } = await import('@/app/api/lti/launch/route');
      return ltiLaunchHandler(ltiRequest as NextRequest);
    } else if (application.integration_type === 'direct_link') {
      // Direct link - return URL for client-side redirect
      return NextResponse.json({
        success: true,
        redirect_type: 'direct_link',
        url: application.url
      });
    } else {
      // Other integration types - return URL
      return NextResponse.json({
        success: true,
        redirect_type: 'external',
        url: application.url
      });
    }
  } catch (error) {
    console.error('[Application Launch API] Error:', error);

    return NextResponse.json(
      {
        error: 'LAUNCH_FAILED',
        message: 'Failed to launch application. Please try again.'
      },
      { status: 500 }
    );
  }
}

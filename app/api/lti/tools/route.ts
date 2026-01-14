/**
 * LTI Tools API Routes
 * GET /api/lti/tools - List all LTI tools
 * POST /api/lti/tools - Create new LTI tool
 *
 * Created: 2026-01-12
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { LtiToolService } from '@/lib/services/lti/lti-tool-service';
import { LtiToolInsert, LtiError } from '@/types/lti';

/**
 * GET /api/lti/tools
 * List all LTI tools (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in to access this resource' },
        { status: 401 }
      );
    }

    // Check if user has admin role
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!profile || !['super_admin', 'administrator'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have permission to access this resource' },
        { status: 403 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('include_inactive') === 'true';

    // Fetch tools
    const tools = await LtiToolService.getAllTools(includeInactive);

    return NextResponse.json({
      success: true,
      data: tools,
      count: tools.length
    });
  } catch (error) {
    console.error('[LTI Tools API] GET error:', error);

    if (error instanceof LtiError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to fetch LTI tools' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/lti/tools
 * Create new LTI tool (admin only)
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
        { error: 'Unauthorized', message: 'You must be logged in to access this resource' },
        { status: 401 }
      );
    }

    // Check if user has admin role
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!profile || !['super_admin', 'administrator'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have permission to access this resource' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();

    // Validate tool configuration
    const validation = LtiToolService.validateToolConfig(body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Invalid tool configuration',
          errors: validation.errors
        },
        { status: 400 }
      );
    }

    // Create tool
    const toolData: LtiToolInsert = {
      name: body.name,
      tool_type: body.tool_type,
      client_id: body.client_id,
      deployment_id: body.deployment_id,
      platform_id: body.platform_id || 'https://myjkkn.jkkn.ac.in',
      launch_url: body.launch_url,
      public_keyset_url: body.public_keyset_url,
      oidc_auth_url: body.oidc_auth_url,
      redirect_uri: body.redirect_uri,
      supports_deep_linking: body.supports_deep_linking || false,
      supports_grade_passback: body.supports_grade_passback || false,
      supports_names_roles: body.supports_names_roles || false,
      is_active: body.is_active !== undefined ? body.is_active : true,
      license_expiry_date: body.license_expiry_date || null
    };

    const tool = await LtiToolService.createTool(toolData, user.id);

    return NextResponse.json(
      {
        success: true,
        message: 'LTI tool created successfully',
        data: tool
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[LTI Tools API] POST error:', error);

    if (error instanceof LtiError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to create LTI tool' },
      { status: 500 }
    );
  }
}

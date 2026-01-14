/**
 * LTI Tool API Routes (Individual Tool)
 * GET /api/lti/tools/[id] - Get tool by ID
 * PUT /api/lti/tools/[id] - Update tool
 * DELETE /api/lti/tools/[id] - Delete (deactivate) tool
 *
 * Created: 2026-01-12
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { LtiToolService } from '@/lib/services/lti/lti-tool-service';
import { LtiToolUpdate, LtiError } from '@/types/lti';

/**
 * GET /api/lti/tools/[id]
 * Get LTI tool by ID
 */
export async function GET(
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

    // Fetch tool
    const tool = await LtiToolService.getToolById(id);

    return NextResponse.json({
      success: true,
      data: tool
    });
  } catch (error) {
    console.error('[LTI Tool API] GET error:', error);

    if (error instanceof LtiError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to fetch LTI tool' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/lti/tools/[id]
 * Update LTI tool (admin only)
 */
export async function PUT(
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

    // Build update object
    const updates: LtiToolUpdate = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.tool_type !== undefined) updates.tool_type = body.tool_type;
    if (body.client_id !== undefined) updates.client_id = body.client_id;
    if (body.deployment_id !== undefined) updates.deployment_id = body.deployment_id;
    if (body.platform_id !== undefined) updates.platform_id = body.platform_id;
    if (body.launch_url !== undefined) updates.launch_url = body.launch_url;
    if (body.public_keyset_url !== undefined) updates.public_keyset_url = body.public_keyset_url;
    if (body.oidc_auth_url !== undefined) updates.oidc_auth_url = body.oidc_auth_url;
    if (body.redirect_uri !== undefined) updates.redirect_uri = body.redirect_uri;
    if (body.supports_deep_linking !== undefined) updates.supports_deep_linking = body.supports_deep_linking;
    if (body.supports_grade_passback !== undefined) updates.supports_grade_passback = body.supports_grade_passback;
    if (body.supports_names_roles !== undefined) updates.supports_names_roles = body.supports_names_roles;
    if (body.is_active !== undefined) updates.is_active = body.is_active;
    if (body.license_expiry_date !== undefined) updates.license_expiry_date = body.license_expiry_date;

    // Update tool
    const tool = await LtiToolService.updateTool(id, updates, user.id);

    return NextResponse.json({
      success: true,
      message: 'LTI tool updated successfully',
      data: tool
    });
  } catch (error) {
    console.error('[LTI Tool API] PUT error:', error);

    if (error instanceof LtiError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to update LTI tool' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/lti/tools/[id]
 * Delete (soft delete / deactivate) LTI tool (admin only)
 */
export async function DELETE(
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

    // Delete (soft delete) tool
    await LtiToolService.deleteTool(id, user.id);

    return NextResponse.json({
      success: true,
      message: 'LTI tool deleted successfully'
    });
  } catch (error) {
    console.error('[LTI Tool API] DELETE error:', error);

    if (error instanceof LtiError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to delete LTI tool' },
      { status: 500 }
    );
  }
}

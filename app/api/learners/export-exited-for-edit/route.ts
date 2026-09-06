export const dynamic = 'force-dynamic';

// ============================================
// EXPORT ACTIVE LEARNERS FOR EDIT API
// ============================================
// Created: 2025-01-22
// Updated: 2025-01-22 - Changed to work with ACTIVE learners, added degree and section filters
// Updated: 2026-08-01 - Typed reference columns + Excel dropdowns. The workbook
//   itself now lives in lib/services/bulk-learner-edit-workbook.ts: a route file
//   can only export HTTP handlers, which left the column list and validation
//   formulas untestable while they lived here.
// Purpose: Download active learners' data for bulk editing
// Endpoint: GET /api/learners/export-exited-for-edit
// Note: Despite endpoint name, this now works with ACTIVE learners
// Filters: Institution → Degree → Department → Program → Semester → Section
// ============================================

import { NextRequest, NextResponse , connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { BulkLearnerEditService } from '@/lib/services/bulk-learner-edit-service';
import { buildBulkEditWorkbook } from '@/lib/services/bulk-learner-edit-workbook';

/**
 * GET /api/learners/export-exited-for-edit
 * Download exited learners with current data for bulk editing
 */
export async function GET(request: NextRequest) {
  await connection();
  try {
    // 1. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized'
        },
        { status: 401 }
      );
    }

    // 2. Check permissions
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profileData) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch user profile'
        },
        { status: 500 }
      );
    }

    const profile = profileData as {
      id: string;
      role: string;
      is_super_admin: boolean | null;
      institution_id: string | null;
    };

    // Get user's role permissions
    const { data: roleData, error: roleError } = await supabase
      .from('custom_roles')
      .select('permissions')
      .eq('role_key', profile.role)
      .single();

    if (roleError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch role permissions'
        },
        { status: 500 }
      );
    }

    const rolePermissions = roleData as {
      permissions: Record<string, boolean>;
    } | null;

    // Check for bulk edit permission
    const permissions = rolePermissions?.permissions || {};
    const hasPermission =
      permissions['all'] === true ||
      permissions['learners.profiles.bulk_edit'] === true ||
      permissions['learners.edit'] === true ||
      profile.is_super_admin;

    if (!hasPermission) {
      return NextResponse.json(
        {
          success: false,
          error: 'You do not have permission to bulk edit active learners'
        },
        { status: 403 }
      );
    }

    // 3. Parse query parameters
    const { searchParams } = new URL(request.url);
    const includeComplete = searchParams.get('include_complete') === 'true';

    // 4. Get institution filter (non-super-admins can only see their institution)
    const institutionId = profile.is_super_admin
      ? searchParams.get('institution_id') || undefined
      : profile.institution_id || undefined;

    // Get additional filters
    const degreeId = searchParams.get('degree_id') || undefined;
    const departmentId = searchParams.get('department_id') || undefined;
    const programId = searchParams.get('program_id') || undefined;
    const semesterId = searchParams.get('semester_id') || undefined;
    const sectionId = searchParams.get('section_id') || undefined;

    console.log('[export-exited] Request parameters:', {
      includeComplete,
      institutionId,
      degreeId,
      departmentId,
      programId,
      semesterId,
      sectionId,
      isSuperAdmin: profile.is_super_admin,
      userInstitutionId: profile.institution_id
    });

    // 5. Export active learners + the reference candidate lists.
    //    Referrers are deliberately NOT institution-scoped: the leads module
    //    allows a referrer from any institution, and matching mirrors that.
    const [learners, referenceResolvers] = await Promise.all([
      BulkLearnerEditService.exportActiveForEdit(
        institutionId,
        includeComplete,
        degreeId,
        departmentId,
        programId,
        semesterId,
        sectionId
      ),
      BulkLearnerEditService.getReferenceLookups()
    ]);

    console.log('[export-active] Learners fetched:', learners.length);

    // Check if no data found
    if (learners.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No active learners found matching the criteria. Try enabling "Include Complete Profiles" or adjusting filters.'
        },
        { status: 404 }
      );
    }

    // 6. Generate Excel file
    const workbook = buildBulkEditWorkbook(learners, referenceResolvers);
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer as ArrayBuffer);

    // Set response headers for file download
    const filename = `active-learners-${new Date().toISOString().split('T')[0]}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString()
      }
    });

  } catch (error) {
    console.error('[api/learners/export-exited-for-edit] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An internal server error occurred.'
      },
      { status: 500 }
    );
  }
}

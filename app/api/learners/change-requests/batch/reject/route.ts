// ============================================
// BATCH REJECT CHANGE REQUESTS API
// ============================================
// Created: 2025-02-10
// Purpose: Bulk reject multiple student profile change requests
// Restricted to: super_admin, hod only
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 1. Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get user profile and verify role (supports multi-role)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, institution_id, department_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ message: 'User profile not found' }, { status: 404 });
    }

    // 3. Get effective roles (profiles.role + user_roles for multi-role support)
    const effectiveRoles = new Set<string>();
    if (profile.role) effectiveRoles.add(profile.role);

    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('custom_roles!inner(role_key)')
      .eq('user_id', user.id);

    if (userRoles) {
      userRoles.forEach((ur: any) => {
        if (ur.custom_roles?.role_key) effectiveRoles.add(ur.custom_roles.role_key);
      });
    }

    // Verify user has an allowed role — only super_admin and hod can bulk reject
    const allowedRoles = ['super_admin', 'hod'];
    const hasAllowedRole = allowedRoles.some((r) => effectiveRoles.has(r));
    if (!hasAllowedRole) {
      return NextResponse.json(
        { message: 'Insufficient permissions. Only Super Admin and HOD can perform bulk rejections.' },
        { status: 403 }
      );
    }

    // 4. Parse request body
    const body = await request.json();
    const { request_ids, review_comments } = body;

    // 5. Validate request_ids
    if (!Array.isArray(request_ids) || request_ids.length === 0) {
      return NextResponse.json(
        { message: 'request_ids must be a non-empty array' },
        { status: 400 }
      );
    }

    // 6. Validate rejection reason is required
    if (!review_comments || review_comments.trim().length === 0) {
      return NextResponse.json(
        { message: 'Rejection reason is required' },
        { status: 400 }
      );
    }

    // 7. Bulk reject
    const result = await LearnerProfileChangeService.bulkRejectRequests(
      request_ids,
      { review_comments },
      user.id
    );

    return NextResponse.json({
      success: true,
      message: `${result.succeeded.length} rejected, ${result.failed.length} failed`,
      succeeded: result.succeeded,
      failed: result.failed,
    });
  } catch (error: any) {
    console.error('[api/learners/change-requests/batch/reject] Error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Failed to bulk reject requests',
      },
      { status: 500 }
    );
  }
}

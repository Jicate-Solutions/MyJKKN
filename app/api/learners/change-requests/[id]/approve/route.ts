// ============================================
// APPROVE CHANGE REQUEST API
// ============================================
// Created: 2025-01-20
// Purpose: Approve student profile change request
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';
import { ApproveRequestDto } from '@/types/learner-profile-change';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Verify user has an allowed role (legacy or multi-role)
    const allowedRoles = ['super_admin', 'hod', 'staff'];
    const hasAllowedRole = allowedRoles.some((r) => effectiveRoles.has(r));
    if (!hasAllowedRole) {
      return NextResponse.json(
        { message: 'Insufficient permissions to approve requests' },
        { status: 403 }
      );
    }

    // 4. Parse request body
    const body: ApproveRequestDto = await request.json();

    // 5. Approve request (service will check permissions)
    const updatedRequest = await LearnerProfileChangeService.approveChangeRequest(
      id,
      body,
      user.id
    );

    return NextResponse.json({
      success: true,
      message: 'Request approved successfully',
      data: updatedRequest,
    });
  } catch (error: any) {
    console.error('[api/learners/change-requests/approve] Error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Failed to approve request',
      },
      { status: error.message?.includes('permission') ? 403 : 500 }
    );
  }
}

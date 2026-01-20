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

    // 2. Get user profile and verify role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, institution_id, department_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ message: 'User profile not found' }, { status: 404 });
    }

    // 3. Verify role is HOD, Staff, or Super Admin
    const allowedRoles = ['super_admin', 'hod', 'staff'];
    if (!allowedRoles.includes(profile.role)) {
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

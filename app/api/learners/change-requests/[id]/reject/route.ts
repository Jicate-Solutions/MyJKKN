// ============================================
// REJECT CHANGE REQUEST API
// ============================================
// Created: 2025-01-20
// Purpose: Reject student profile change request
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';
import { RejectRequestDto } from '@/types/learner-profile-change';

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
        { message: 'Insufficient permissions to reject requests' },
        { status: 403 }
      );
    }

    // 4. Parse request body
    const body: RejectRequestDto = await request.json();

    // 5. Validate rejection reason
    if (!body.review_comments || body.review_comments.trim().length === 0) {
      return NextResponse.json(
        { message: 'Rejection reason is required' },
        { status: 400 }
      );
    }

    // 6. Reject request (service will check permissions)
    const updatedRequest = await LearnerProfileChangeService.rejectChangeRequest(
      id,
      body,
      user.id
    );

    return NextResponse.json({
      success: true,
      message: 'Request rejected successfully',
      data: updatedRequest,
    });
  } catch (error: any) {
    console.error('[api/learners/change-requests/reject] Error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Failed to reject request',
      },
      { status: error.message?.includes('permission') ? 403 : 500 }
    );
  }
}

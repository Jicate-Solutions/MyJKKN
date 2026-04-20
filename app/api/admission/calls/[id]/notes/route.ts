export const dynamic = 'force-dynamic';

// app/api/admission/calls/[id]/notes/route.ts
// PUT /api/admission/calls/[id]/notes — Update post-call notes

import { NextRequest, NextResponse, connection } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { TelephonyService, type CallDisposition } from '@/lib/services/telephony/telephony-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Call ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      call_notes,
      call_disposition,
      follow_up_date,
      follow_up_at,
      call_outcome,
      prospect_sentiment,
      primary_objection,
      next_action,
    } = body;

    logger.info('admission/calls', 'Updating call notes', {
      callId: id,
      userId: user.id,
      disposition: call_disposition,
    });

    const supabase = createServiceRoleClient();

    // Verify user has access to this call's institution before allowing update
    const { data: callRecord } = await supabase
      .from('admission_call_logs')
      .select('institution_id')
      .eq('id', id)
      .single();

    if (!callRecord) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Call record not found' },
        { status: 404 }
      );
    }

    // Check authorization: super admin, global scope, or same institution
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, is_super_admin, role')
      .eq('id', user.id)
      .single();

    const isSuperAdmin = profile?.is_super_admin === true || profile?.role === 'super_admin';
    if (!isSuperAdmin && callRecord.institution_id !== profile?.institution_id) {
      const { data: userRolesData } = await supabase
        .from('user_roles')
        .select('role_id, custom_roles!inner(institution_scope)')
        .eq('user_id', user.id);

      const hasGlobalScope = (userRolesData || []).some(
        (ur: any) => ur.custom_roles?.institution_scope === 'all'
      );

      if (!hasGlobalScope) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'No access to this call record' },
          { status: 403 }
        );
      }
    }

    const updatedLog = await TelephonyService.updateCallNotes(id, {
      call_notes,
      call_disposition: call_disposition as CallDisposition,
      follow_up_date: follow_up_date || null,
      follow_up_at: follow_up_at || null,
      call_outcome: call_outcome || null,
      prospect_sentiment: prospect_sentiment || null,
      primary_objection: primary_objection || null,
      next_action: next_action || null,
      updated_by: user.id, // Track who updated the notes
    }, supabase);

    return NextResponse.json({
      success: true,
      data: updatedLog,
      message: 'Call notes updated successfully',
    });
  } catch (error) {
    logger.error('admission/calls', 'Update call notes error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';

// app/api/admission/counselors/[id]/route.ts
// GET    /api/admission/counselors/[id]?action=impact  → impact-preview (rows that will lose counselor link)
// DELETE /api/admission/counselors/[id]                → SOFT-DELETE (sets is_active=false, deactivated_at, deactivated_by)
//
// Soft-delete enforcement: the historical hard-DELETE done from counselor-list.tsx is replaced.
// Toggle/Remove become symmetric soft-state changes — both audited by admission_counselors_audit_log
// trigger (PR #516).

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET — impact preview for the confirmation dialog.
 * Returns row counts that will become orphaned counselor links if this counselor is deactivated/removed.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const userId = url.searchParams.get('user_id');

    if (action !== 'impact') {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'action=impact required' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc('fn_admission_counselor_impact_preview', {
      p_counselor_id: id.startsWith('role-') ? null : id,
      p_user_id: userId || null,
    });

    if (error) {
      logger.error('admission/counselors/[id]', 'Impact preview RPC failed', { error, id });
      return NextResponse.json(
        { error: 'RPC_ERROR', message: error.message },
        { status: 500 }
      );
    }

    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      assigned_leads: Number(row?.assigned_leads ?? 0),
      call_logs: Number(row?.call_logs ?? 0),
      callback_queue: Number(row?.callback_queue ?? 0),
      counselor_record_leads: Number(row?.counselor_record_leads ?? 0),
      counselor_full_name: row?.counselor_full_name ?? null,
      counselor_email: row?.counselor_email ?? null,
    });
  } catch (err) {
    logger.error('admission/counselors/[id]', 'GET unexpected error', err);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE — SOFT-DELETE.
 * Replaces the previous hard `DELETE FROM admission_counselors WHERE id = ?`.
 * Sets is_active=false, deactivated_at=now(), deactivated_by=auth.uid().
 * Audit log trigger (admission_counselors_audit_log, PR #516) fires automatically on UPDATE.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    // RLS will block unauthorized deletes via the standard admission.counselors.delete permission.
    const { data, error } = await supabase
      .from('admission_counselors')
      .update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivated_by: user.id,
      })
      .eq('id', id)
      .select('id, name, email, is_active, deactivated_at')
      .single();

    if (error) {
      logger.error('admission/counselors/[id]', 'Soft-delete failed', { error, id });
      return NextResponse.json(
        { error: 'DELETE_FAILED', message: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Counselor not found' },
        { status: 404 }
      );
    }

    logger.info('admission/counselors/[id]', 'Counselor soft-deleted', {
      counselor_id: id,
      actor: user.id,
    });

    return NextResponse.json({
      success: true,
      counselor: data,
      message: 'Counselor deactivated. Audit log entry recorded.',
    });
  } catch (err) {
    logger.error('admission/counselors/[id]', 'DELETE unexpected error', err);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

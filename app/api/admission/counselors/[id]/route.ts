export const dynamic = 'force-dynamic';

// app/api/admission/counselors/[id]/route.ts
// GET    /api/admission/counselors/[id]?action=impact  → impact-preview (rows that will lose counselor link)
// DELETE /api/admission/counselors/[id]                → SOFT-DELETE (sets is_active=false, deactivated_at, deactivated_by)
//
// Soft-delete enforcement: the historical hard-DELETE done from counselor-list.tsx is replaced.
// Toggle/Remove become symmetric soft-state changes — both audited by admission_counselors_audit_log
// trigger (PR #516).

import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthUser,
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
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
 * DELETE — HARD DELETE the admission_counselors row, with full cleanup.
 *
 * 2026-05-11: Switched from soft-delete (is_active=false) to hard delete
 * per user requirement: "remove counselor completely; only remove their
 * counselor role, not the user account." The auth user / profile is
 * never touched — only the admission_counselors row and its dependent
 * mappings disappear.
 *
 * Sequence (each step is independently retry-safe):
 *
 * 1. Resolve the counselor's user_id (admission_counselors → profiles).
 * 2. NULL out counselor_id + assigned_counselor_id + assigned_at on
 *    every lead currently linked. Lead rows survive; they just return
 *    to the unassigned pool.
 * 3. NULL out admission_lead_cascade_history.from_counselor_id and
 *    to_counselor_id where they reference this counselor. The history
 *    rows survive (audit trail preserved), but the FK reference is
 *    cleared — required because that FK is ON DELETE NO ACTION and
 *    would otherwise block the hard delete.
 * 4. DELETE the admission_counselors row. CASCADEd FKs auto-remove:
 *    admission_counselor_sources, admission_counselor_institutions,
 *    admission_counselor_schedules, admission_counselor_duty_log.
 *
 * Client (counselor-list.tsx performRemove) then independently removes
 * the counselor role_keys from user_roles and resets profile.role if it
 * was a counselor key. The auth user + profile stay intact.
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

    // Resolve the counselor's auth user_id. assigned_counselor_id has a
    // mixed-writer history — some paths store admission_counselors.id,
    // others store profiles.id (auth.uid()). To fully unassign, we need
    // to NULL out matches against BOTH IDs.
    const { data: counselorRow, error: lookupErr } = await supabase
      .from('admission_counselors')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle();

    if (lookupErr) {
      logger.error('admission/counselors/[id]', 'Lookup before delete failed', {
        error: lookupErr,
        id,
      });
      return NextResponse.json(
        { error: 'LOOKUP_FAILED', message: lookupErr.message },
        { status: 500 }
      );
    }

    if (!counselorRow) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Counselor not found' },
        { status: 404 }
      );
    }

    // Build the OR predicate for the lead unlink. Always match on
    // counselor_id; also match on assigned_counselor_id against both
    // possible identity columns.
    const matchIds: string[] = [id];
    if (counselorRow.user_id) matchIds.push(counselorRow.user_id);

    // Unassign by counselor_id first (cleanest match).
    const { count: leadsByCounselorId, error: clearAErr } = await supabase
      .from('admission_leads')
      .update(
        {
          counselor_id: null,
          assigned_counselor_id: null,
          assigned_at: null,
        },
        { count: 'exact' }
      )
      .eq('counselor_id', id);

    if (clearAErr) {
      logger.error('admission/counselors/[id]', 'Lead unlink by counselor_id failed', {
        error: clearAErr,
        id,
      });
      return NextResponse.json(
        { error: 'UNASSIGN_FAILED', message: clearAErr.message },
        { status: 500 }
      );
    }

    // Also catch leads that only had assigned_counselor_id set (no
    // counselor_id), matching either possible identity column. .in()
    // with a single-element array is fine if user_id is missing.
    let leadsByAssignedId = 0;
    if (matchIds.length > 0) {
      const { count, error: clearBErr } = await supabase
        .from('admission_leads')
        .update(
          {
            assigned_counselor_id: null,
            assigned_at: null,
          },
          { count: 'exact' }
        )
        .is('counselor_id', null)
        .in('assigned_counselor_id', matchIds);

      if (clearBErr) {
        logger.error(
          'admission/counselors/[id]',
          'Lead unlink by assigned_counselor_id failed',
          { error: clearBErr, id }
        );
        return NextResponse.json(
          { error: 'UNASSIGN_FAILED', message: clearBErr.message },
          { status: 500 }
        );
      }
      leadsByAssignedId = count ?? 0;
    }

    const totalUnassigned = (leadsByCounselorId ?? 0) + leadsByAssignedId;

    // RLS on admission_lead_cascade_history and the admission_counselors
    // DELETE policy are too tight for the cookie client to mutate (the
    // cascade-history table only allows reads for most roles, never
    // direct UPDATEs). Switch to the service-role client for the
    // destructive steps — we've already authenticated the caller at the
    // top of this handler, so RLS bypass is bounded to "after authz
    // gate, run the destructive ops as service role."
    //
    // Symptom that triggered this branch (2026-05-11): cascade-history
    // UPDATE silently affected 0 rows (no error, RLS denied), then the
    // counselor DELETE hit `23503 admission_lead_cascade_history_from
    // /to_counselor_id_fkey`. Service-role bypass is the documented
    // pattern for cross-schema/cross-table cleanup like this.
    const admin = createServiceRoleClient();

    // Cascade history FK is ON DELETE NO ACTION — clear references to this
    // counselor BEFORE the hard delete so the FK doesn't block. The history
    // rows survive (audit trail preserved); we just NULL the FK columns,
    // which are both nullable on admission_lead_cascade_history.
    const { error: clearFromErr } = await admin
      .from('admission_lead_cascade_history')
      .update({ from_counselor_id: null })
      .eq('from_counselor_id', id);
    if (clearFromErr) {
      logger.error(
        'admission/counselors/[id]',
        'Cascade-history from-link clear failed',
        { error: clearFromErr, id },
      );
      return NextResponse.json(
        { error: 'CASCADE_HISTORY_CLEAR_FAILED', message: clearFromErr.message },
        { status: 500 },
      );
    }

    const { error: clearToErr } = await admin
      .from('admission_lead_cascade_history')
      .update({ to_counselor_id: null })
      .eq('to_counselor_id', id);
    if (clearToErr) {
      logger.error(
        'admission/counselors/[id]',
        'Cascade-history to-link clear failed',
        { error: clearToErr, id },
      );
      return NextResponse.json(
        { error: 'CASCADE_HISTORY_CLEAR_FAILED', message: clearToErr.message },
        { status: 500 },
      );
    }

    // Hard-delete via service role. CASCADEd FKs auto-remove:
    //   admission_counselor_sources, admission_counselor_institutions,
    //   admission_counselor_schedules, admission_counselor_duty_log.
    // admission_leads.counselor_id is ON DELETE SET NULL (we already
    // explicitly nulled above, so this is a no-op for the leads we found).
    const { data, error } = await admin
      .from('admission_counselors')
      .delete()
      .eq('id', id)
      .select('id, name, email')
      .single();

    if (error) {
      logger.error('admission/counselors/[id]', 'Hard-delete failed', { error, id });
      return NextResponse.json(
        { error: 'DELETE_FAILED', message: error.message },
        { status: 500 },
      );
    }

    logger.info('admission/counselors/[id]', 'Counselor hard-deleted', {
      counselor_id: id,
      counselor_user_id: counselorRow.user_id,
      actor: user.id,
      leads_unassigned: totalUnassigned,
    });

    return NextResponse.json({
      success: true,
      counselor: data,
      leads_unassigned: totalUnassigned,
      message:
        totalUnassigned > 0
          ? `Counselor removed. ${totalUnassigned} lead${
              totalUnassigned === 1 ? '' : 's'
            } returned to the unassigned pool.`
          : 'Counselor removed. No assigned leads to unlink.',
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

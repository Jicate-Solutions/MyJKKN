import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { BosMeetingStatus, meetingNextStatusMap } from '@/types/bos';
import {
  resolveBosBoardScope,
  guardCompositionWrite,
  guardPrincipalApprovalOnly,
} from '@/lib/utils/bos/bos-access';
import { forkSyllabiOnMinutesApproval } from '@/lib/utils/bos/fork-syllabi-on-minutes-approval';

// ── PATCH /api/bos/meetings/[id]/status ──────────────────────────────────────
// Transitions a meeting to the next valid state in the state machine.
// Access:
//   - super-admin              → any transition
//   - principal (governor)     → status transitions only, within their institution
//   - composition members      → any transition for meetings in their composition
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const newStatus: BosMeetingStatus = body.status;

    // Service-role for both fetch + update — RLS on bos_meetings gates rows
    // by role_has_institution_access() which is not CAS-aware. Without this,
    // an SF principal trying to approve an Aided meeting 404s before authz
    // ever runs. Authorization is performed in-route below with CAS sibling
    // awareness layered in.
    const db = createServiceRoleClient();

    // Fetch current meeting — include institution + composition for the gate.
    const { data: meeting, error: fetchError } = await db
      .from('bos_meetings')
      .select('status, institutions_id, composition_id, meeting_type')
      .eq('id', id)
      .single();

    if (fetchError || !meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    // Authorization: principal carve-out runs first because guardCompositionWrite
    // unconditionally denies principals. Members must be in bos_members for
    // this composition. Super-admin passes through both.
    const scope = await resolveBosBoardScope(user.id);
    const meetingRow = meeting as { institutions_id: string | null; composition_id: string | null; status: string };

    // CAS-expand scope.allInstitutionIds before guardPrincipalApprovalOnly so
    // a SF principal can approve an Aided meeting (same counselling_code). The
    // expansion runs unconditionally — cheap when there's no sibling.
    if (!scope.isSuperAdmin && scope.institutionsId) {
      const expanded = new Set<string>(scope.allInstitutionIds);
      expanded.add(scope.institutionsId);
      const { data: inst } = await db
        .from('institutions')
        .select('counselling_code')
        .eq('id', scope.institutionsId)
        .maybeSingle();
      if (inst?.counselling_code) {
        const { data: siblings } = await db
          .from('institutions')
          .select('id')
          .eq('counselling_code', inst.counselling_code)
          .eq('is_active', true);
        for (const s of siblings ?? []) expanded.add((s as { id: string }).id);
      }
      // Mutate the scope object in place — the guards read this field.
      (scope as { allInstitutionIds: string[] }).allInstitutionIds = Array.from(expanded);
    }

    if (scope.isPrincipal) {
      const denyPrincipal = guardPrincipalApprovalOnly(scope, 'status', meetingRow.institutions_id);
      if (denyPrincipal) return NextResponse.json({ error: denyPrincipal }, { status: 403 });
    } else {
      const denyMember = guardCompositionWrite(scope, meetingRow.composition_id);
      if (denyMember) return NextResponse.json({ error: denyMember }, { status: 403 });
    }

    // Academic Council meetings run a shorter state machine (no principal
    // approval, no ratification) — pick the right transition map by meeting_type.
    const currentStatus = meeting.status as BosMeetingStatus;
    const allowedNext =
      meetingNextStatusMap((meeting as { meeting_type?: string | null }).meeting_type)[currentStatus];

    if (allowedNext !== newStatus) {
      return NextResponse.json(
        {
          error: `Invalid status transition: ${currentStatus} → ${newStatus}. Expected next: ${allowedNext ?? 'none (final state)'}`,
        },
        { status: 422 }
      );
    }

    // Pre-transition data guards. Submitting for Principal Approval without any
    // agenda items would leave the principal nothing to approve, so block the
    // transition here. Counted server-side (HEAD request) because the client's
    // agenda_item_count is denormalized and can be stale.
    if (newStatus === 'principal_approved') {
      const { count: agendaCount, error: agendaCountError } = await db
        .from('bos_agenda_items')
        .select('id', { count: 'exact', head: true })
        .eq('meeting_id', id);

      if (agendaCountError) throw agendaCountError;

      if (!agendaCount || agendaCount < 1) {
        return NextResponse.json(
          { error: 'Add at least one agenda item before submitting for Principal Approval.' },
          { status: 422 }
        );
      }
    }

    // Build update payload — include metadata timestamps per transition
    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === 'principal_approved') {
      updatePayload.principal_approved_at = body.principal_approved_at ?? new Date().toISOString();
      if (body.principal_approved_by) {
        updatePayload.principal_approved_by = body.principal_approved_by;
      }
    }

    if (newStatus === 'completed') {
      if (body.actual_date) updatePayload.actual_date = body.actual_date;
      if (body.actual_start_time) updatePayload.actual_start_time = body.actual_start_time;
      if (body.actual_end_time) updatePayload.actual_end_time = body.actual_end_time;
      if (body.quorum_met !== undefined) updatePayload.quorum_met = body.quorum_met;
    }

    if (newStatus === 'minutes_drafted') {
      updatePayload.minutes_drafted_at = new Date().toISOString();
      if (body.minutes_summary) updatePayload.minutes_summary = body.minutes_summary;
    }

    if (newStatus === 'minutes_approved') {
      updatePayload.minutes_approved_at = new Date().toISOString();
      if (body.minutes_approved_by) updatePayload.minutes_approved_by = body.minutes_approved_by;
    }

    if (newStatus === 'ratified') {
      updatePayload.ratified_by_ac = true;
      if (body.ratified_date) updatePayload.ratified_date = body.ratified_date;
    }

    const { data, error } = await db
      .from('bos_meetings')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    // ── Side effect: auto-fork referenced syllabi on minutes approval ──────
    // When a meeting transitions to `minutes_approved`, every syllabus listed
    // in minutes_content.changes_log gets duplicated into a fresh V2 (the
    // existing V1 stays in place with is_latest=false). The chairman then
    // edits V2 to apply the discussed changes. We attach the fork report to
    // the response so the UI can surface partial-success cases (e.g. one
    // syllabus failed to fork while others succeeded).
    //
    // Failures here do NOT roll back the status transition. The meeting IS
    // approved at this point; reverting the status because of a downstream
    // fork hiccup would leave the workflow stuck and confuse the user. They
    // can re-run the fork manually via the existing /api/bos/syllabus/[id]/
    // revise endpoint for the failed entries.
    let forkReport: ReturnType<typeof forkSyllabiOnMinutesApproval> extends Promise<infer R> ? R : never =
      { attempted: 0, forked: [], failed: [] };
    if (newStatus === 'minutes_approved') {
      try {
        forkReport = await forkSyllabiOnMinutesApproval(db, id, user.id);
      } catch (forkErr) {
        console.error('[bos/meetings/:id/status] auto-fork error:', forkErr);
        // Don't throw — the status transition already succeeded.
      }
    }

    return NextResponse.json({ ...data, _syllabusForkReport: forkReport });
  } catch (error) {
    console.error('[bos/meetings/:id/status] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to transition meeting status' }, { status: 500 });
  }
}

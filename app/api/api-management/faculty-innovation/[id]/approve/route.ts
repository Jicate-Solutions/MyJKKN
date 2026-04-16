// app/api/api-management/faculty-innovation/[id]/approve/route.ts
// POST: Execute an approval action on an initiative.
// Actions: approve, request_changes, reject (with optional reroute), defer.
// Session auth only (portal use).

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function OPTIONS() {
  return NextResponse.json({});
}

function getSessionClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return (cookieStore as any).get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
  try {
    const supabase = getSessionClient();
    const {
      data: { user },
    } = await (supabase as any).auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Next.js 15 params handling
    const params: any =
      'then' in (context.params as any)
        ? await (context.params as Promise<{ id: string }>)
        : (context.params as { id: string });
    const initiativeId = params.id;

    const body = await request.json();
    const { action, reason, defer_days, reroute_to } = body;

    if (!action || !['approve', 'request_changes', 'reject', 'defer'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Expected: approve, request_changes, reject, or defer' },
        { status: 400 }
      );
    }

    if (['request_changes', 'reject'].includes(action) && !reason && !reroute_to) {
      return NextResponse.json(
        { error: 'Reason is required for request_changes and reject actions' },
        { status: 400 }
      );
    }

    // Verify user has approval permission
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('role, institution_id, is_super_admin')
      .eq('id', user.id)
      .single();

    const isSuperAdmin = profile?.is_super_admin === true;
    const role = profile?.role ?? '';
    const isApprover =
      isSuperAdmin ||
      ['director', 'dean', 'ip_cell', 'ip cell', 'hod'].includes(role);

    if (!isApprover) {
      return NextResponse.json(
        { error: 'You do not have approval permissions' },
        { status: 403 }
      );
    }

    // Fetch the initiative
    const { data: initiative, error: fetchErr } = await (supabase as any)
      .from('faculty_initiatives')
      .select('*')
      .eq('id', initiativeId)
      .eq('is_active', true)
      .single();

    if (fetchErr || !initiative) {
      return NextResponse.json(
        { error: 'Initiative not found' },
        { status: 404 }
      );
    }

    // Execute the action based on type
    const nowISO = new Date().toISOString();
    let patch: Record<string, unknown> = {
      updated_by: user.id,
      last_status_change_at: nowISO,
      last_status_change_by: user.id,
    };

    if (action === 'approve') {
      patch.status = 'approved';
    } else if (action === 'reject') {
      if (reroute_to) {
        // Reroute instead of reject
        patch.approval_authority = reroute_to;
        // Don't change status
        delete patch.status;
      } else {
        patch.status = 'rejected';
      }
    } else if (action === 'defer') {
      // Defer doesn't change status — it's logged as audit only
      patch = { updated_by: user.id };
    }
    // request_changes also doesn't change status — stays under_review

    // For approve and reject, ensure proper transition through under_review
    if (
      (action === 'approve' || (action === 'reject' && !reroute_to)) &&
      initiative.status === 'submitted'
    ) {
      // First move to under_review
      await (supabase as any)
        .from('faculty_initiatives')
        .update({
          status: 'under_review',
          last_status_change_at: nowISO,
          last_status_change_by: user.id,
          updated_by: user.id,
        })
        .eq('id', initiativeId);
    }

    // Apply the final status change (if any)
    if (patch.status || patch.approval_authority) {
      const { data: updated, error: updateErr } = await (supabase as any)
        .from('faculty_initiatives')
        .update(patch)
        .eq('id', initiativeId)
        .select('*')
        .single();

      if (updateErr) throw updateErr;

      return NextResponse.json({ data: updated });
    }

    // For request_changes and defer, just log audit and return current state
    // Audit log entry
    await (supabase as any)
      .from('faculty_initiative_audit_log')
      .insert({
        initiative_id: initiativeId,
        action: action === 'defer' ? 'status_changed' : 'status_changed',
        actor_id: user.id,
        reason:
          action === 'defer'
            ? `Deferred for ${defer_days ?? 7} day(s). ${reason ?? ''}`
            : `Changes requested: ${reason}`,
        before_state: { status: initiative.status },
        after_state: {
          status: initiative.status,
          ...(action === 'defer' ? { deferred_days: defer_days ?? 7 } : {}),
        },
      });

    // Notification to inventor
    await (supabase as any)
      .from('faculty_innovation_notifications')
      .insert({
        user_id: initiative.inventor_id,
        initiative_id: initiativeId,
        event_type: action === 'defer' ? 'status_changed' : 'changes_requested',
        title:
          action === 'defer'
            ? `Review deferred for "${initiative.title}"`
            : `Changes requested for "${initiative.title}"`,
        body: reason ?? null,
        channels: ['in_app'],
      });

    return NextResponse.json({ data: initiative, action_logged: true });
  } catch (err: any) {
    console.error('[faculty-innovation/approve:POST]', err);
    return NextResponse.json(
      { error: err?.message ?? 'Internal server error' },
      { status: 500 }
    );
  }
}

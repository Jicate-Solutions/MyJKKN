export const dynamic = 'force-dynamic';

import { createHash } from 'node:crypto';
import { NextRequest, NextResponse, connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';
import type { PendingAction } from '@/types/notifications';

/**
 * GET /api/notifications/pulse
 *
 * One poll that replaces two. Every signed-in page used to poll
 * GET /api/notifications/acknowledge (AcknowledgmentGate) and the classic
 * dashboards additionally polled GET /api/notifications/pending-actions
 * (ActionItemsWidget), both every 60 s. This route runs the same two RPCs in
 * parallel and returns both results in one body.
 *
 * Unchanged data answers 304: the body (minus generated_at) is hashed into a
 * weak ETag; when the browser sends it back as If-None-Match the route replies
 * 304 with no body and the browser reuses its cached copy. Cache-Control is
 * `private, no-cache` — the browser MAY keep a copy but must revalidate every
 * time, which is exactly what makes fetch() send If-None-Match. Never public,
 * never s-maxage: the payload is per user.
 *
 * Pending actions are opt-in: get_pending_actions (service role, a five-table
 * function) runs only when the caller sends `?pending=1` — the dashboard
 * widget does, the acknowledgment gate on every other page does not — so the
 * Postgres cost stays where it was before this route existed.
 *
 * The two original routes stay in place for their other callers.
 */

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wantPending = request.nextUrl.searchParams.get('pending') === '1';

    // Service role for get_pending_actions, exactly as pending-actions/route.ts
    // does (the function reads across RLS); the user client for the
    // acknowledgment list, exactly as acknowledge/route.ts does.
    const [ackResult, pendingResult] = await Promise.all([
      supabase.rpc('get_unacknowledged_notifications', { p_user_id: user.id }),
      wantPending
        ? (createServiceRoleClient() as any).rpc('get_pending_actions', { p_user_id: user.id })
        : Promise.resolve({ data: null, error: null })
    ]);

    if (ackResult.error) {
      console.error('[notifications/pulse] get_unacknowledged_notifications error:', ackResult.error);
      return NextResponse.json(
        { error: 'Failed to fetch unacknowledged notifications' },
        { status: 500 }
      );
    }

    if (pendingResult.error) {
      console.error('[notifications/pulse] get_pending_actions error:', pendingResult.error);
      return NextResponse.json(
        { error: 'Failed to fetch pending actions' },
        { status: 500 }
      );
    }

    // --- unacknowledged: same mapping as acknowledge/route.ts GET ---
    const now = new Date();
    const unacknowledged = (ackResult.data || []).map((item: any) => {
      const sentAt = new Date(item.sent_at || item.created_at);
      const deadlineMs = (item.acknowledgment_deadline_hours || 4) * 60 * 60 * 1000;
      const deadlineAt = new Date(sentAt.getTime() + deadlineMs);

      return {
        id: item.id,
        notification_id: item.notification_id,
        title: item.title,
        body: item.body,
        priority: item.priority,
        category: item.category,
        url: item.url,
        created_by_name: item.created_by_name || 'System',
        sent_at: item.sent_at || item.created_at,
        deadline_at: deadlineAt.toISOString(),
        is_overdue: now > deadlineAt,
        metadata: item.metadata
      };
    });

    // --- pending: same counts as pending-actions/route.ts; null when not asked ---
    let pending: { actions: PendingAction[]; urgent_count: number; tracked_count: number } | null = null;
    if (wantPending) {
      const actions: PendingAction[] = pendingResult.data || [];
      pending = {
        actions,
        urgent_count: actions.filter((a) => a.action_type === 'urgent').length,
        tracked_count: actions.filter((a) => a.action_type === 'tracked').length
      };
    }

    const payload = { unacknowledged, pending };

    // Weak ETag over the data only — generated_at would change every call and
    // defeat the 304. Hashed over id-sorted copies: the hash must NOT depend on
    // RPC row order (both functions order by timestamp, which ties can
    // reshuffle); the response itself keeps the RPC order for display.
    const canonical = {
      unacknowledged: [...unacknowledged].sort(byId),
      pending: pending && { ...pending, actions: [...pending.actions].sort(byId) }
    };
    const etag = `W/"${createHash('sha1').update(JSON.stringify(canonical)).digest('hex')}"`;
    const headers = {
      ETag: etag,
      'Cache-Control': 'private, no-cache'
    };

    if (request.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers });
    }

    return NextResponse.json(
      { ...payload, generated_at: now.toISOString() },
      { headers }
    );
  } catch (error) {
    console.error('[notifications/pulse] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveParentScope, parentErrorResponse, type ParentScope } from '@/lib/utils/parent-access';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ParentNotification } from '@/types/parent-portal';

export const runtime = 'nodejs';

/**
 * Every pp_parent_accounts row in the family (per-learner account model), so the
 * notification bell shows items written to the logged-in child AND siblings —
 * not just the single session account.
 */
async function familyAccountIds(db: SupabaseClient, scope: ParentScope): Promise<string[]> {
  const { data } = await db
    .from('pp_parent_accounts')
    .select('id')
    .in('learner_profile_id', scope.learnerIds);
  return Array.from(new Set([scope.parentAccountId, ...((data ?? []).map((a) => a.id as string))]));
}

/** GET /api/parent/notifications — parent-scoped notification log. */
export async function GET(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServiceRoleClient();
    const accountIds = await familyAccountIds(db, scope);
    // The list is a capped page (100 most recent). The unread badge is a GLOBAL
    // figure across ALL of the family's notifications, so it must NOT be derived
    // from this page. `data.filter((n) => !n.isRead).length` topped out at 100
    // and understated any real backlog — and once the bell's "9+" cap was
    // removed it would have shown a false-exact number. It is now a real COUNT
    // over the same parent-account + is_read=false filter as the list.
    const [{ data: rows }, { count: unreadCount }] = await Promise.all([
      db
        .from('pp_notifications_log')
        .select('id, title, body, category, action_url, is_read, created_at')
        .in('parent_account_id', accountIds)
        .order('created_at', { ascending: false })
        .limit(100),
      db
        .from('pp_notifications_log')
        .select('id', { count: 'exact', head: true })
        .in('parent_account_id', accountIds)
        .eq('is_read', false),
    ]);

    const data: ParentNotification[] = (rows ?? []).map((r) => ({
      id: r.id,
      title: r.title ?? undefined,
      body: r.body ?? undefined,
      category: r.category ?? undefined,
      actionUrl: r.action_url ?? undefined,
      isRead: !!r.is_read,
      createdAt: r.created_at,
    }));
    const unread = unreadCount ?? 0;
    return NextResponse.json({ data, unread });
  } catch (err) {
    return parentErrorResponse(err);
  }
}

/** PATCH /api/parent/notifications — mark one ({id}) or all ({all:true}) read. */
export async function PATCH(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean };
    const db = createServiceRoleClient();
    const accountIds = await familyAccountIds(db, scope);
    let q = db
      .from('pp_notifications_log')
      .update({ is_read: true })
      .in('parent_account_id', accountIds);
    if (!body.all) {
      if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      q = q.eq('id', body.id);
    }
    await q;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return parentErrorResponse(err);
  }
}

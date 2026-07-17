export const dynamic = 'force-dynamic';

// app/api/notifications/[id]/route.ts
//
// ID CONTRACT (read this before touching any verb):
//   The `[id]` segment is a `user_notifications.id` — the CALLER'S per-user
//   delivery row, NOT a global `notifications.id`. Every verb in this route
//   targets that one id space and is scoped to the authenticated user
//   (`user_id = auth user`). The route's GET hands the client back
//   `.id = user_notifications.id`, so the same value round-trips into
//   PATCH (mark_read / archive / update) and DELETE.
//
//   Why not `notifications.id`? This is the per-user inbox item route. Global
//   notification management (edit content, hard-delete the notification for
//   every recipient) lives in `/api/admin/notifications/[id]`, which is
//   permission-gated. Keeping this route on `user_notifications.id`:
//     - matches what GET already returns (previously mark_read/GET used
//       user_notifications.id while archive/update/delete used notifications.id
//       — a mismatch where a single URL id could satisfy only half the verbs),
//     - scopes every write to the caller so no user can mutate another user's
//       (or every user's) row from this route.
//
// AUTH / CLIENT: all DB work runs through the cookie-scoped server client
//   (`createClient()` from '@/lib/supabase/server'), so queries execute as the
//   authenticated user and RLS applies. Previously the DB work was delegated to
//   notification-service.ts helpers that use a module-level BROWSER singleton
//   (`createClientSupabaseClient`), so server-side calls ran as `anon` — which
//   RLS on user_notifications denies (fn_notification_is_for_user has no anon
//   EXECUTE). That is why this route now issues its own queries inline instead
//   of calling the service helpers.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Same embedded join + column set the service's getNotification used, so the
// GET response shape is unchanged for any caller.
const NOTIFICATION_SELECT = `
  *,
  notification:notifications!user_notifications_notification_id_fkey!inner(
    id,
    title,
    body,
    url,
    action_config,
    icon,
    category,
    priority,
    metadata,
    created_at
  ),
  user:profiles!user_notifications_user_id_fkey(id, full_name, email)
`;

/**
 * Map a joined user_notifications row to the flat notification shape the UI
 * expects. Mirrors notification-service.ts getNotification()'s mapping so the
 * GET payload is byte-for-byte compatible, with one honest change: is_archived
 * now reflects the real user_notifications.archived_at column instead of a
 * hardcoded false.
 */
function mapNotificationRow(row: any) {
  const n = row.notification || {};
  return {
    id: row.id,
    user_id: row.user_id,
    notification_id: row.notification_id,
    title: n.title || '',
    message: n.body || '',
    type: n.metadata?.type || 'info',
    category: n.category || 'system',
    priority: n.priority || 'normal',
    status: row.read_at ? 'read' : 'unread',
    is_read: !!row.read_at,
    is_archived: !!row.archived_at,
    read_at: row.read_at,
    archived_at: row.archived_at ?? null,
    // Read the destination URL from action_config when notifications.url is
    // null (cron-generated dashboard digests) — same fallback as the service.
    action_url: n.url || n.action_config?.url || undefined,
    metadata: n.metadata,
    channels: ['in_app'],
    created_at: row.created_at,
    updated_at: row.created_at,
    user: row.user
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // id === user_notifications.id. RLS (as the authenticated user) already
    // scopes this to the caller's own rows; the explicit user_id compare below
    // preserves the original 403-on-non-owner behaviour for any row RLS still
    // lets through.
    const { data: row, error } = await supabase
      .from('user_notifications')
      .select(NOTIFICATION_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;

    if (!row) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }

    if ((row as any).user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ data: mapNotificationRow(row) });
  } catch (error: any) {
    console.error('Error fetching notification:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ownership gate. id === user_notifications.id. maybeSingle() returns null
    // when RLS hides a non-owned row (→ 404); the user_id compare returns 403
    // for a row that is somehow readable but not the caller's.
    const { data: owned, error: ownErr } = await supabase
      .from('user_notifications')
      .select('id, user_id, notification_id, read_at')
      .eq('id', id)
      .maybeSingle();

    if (ownErr) throw ownErr;
    if (!owned) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }
    if (owned.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // mark_read → set read_at on the caller's delivery row (real column). Same
    // table/column as the service's markAsRead, now authenticated + user-scoped.
    if (body.action === 'mark_read') {
      const { error } = await supabase
        .from('user_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    // archive → set archived_at on the caller's delivery row. Archive is
    // inherently per-user, so it belongs on user_notifications (the old service
    // path wrote archived_at/status to `notifications`, columns that do not
    // exist there — a phantom write). Requires the user_notifications.archived_at
    // migration returned in this change's manifest.
    if (body.action === 'archive') {
      const { error } = await (supabase.from('user_notifications') as any)
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    // Regular update: only the per-user delivery fields (read / archived) live
    // on this route. Global notification CONTENT edits (title/body/etc.) are an
    // admin capability and belong to /api/admin/notifications/[id]; editing them
    // here would mutate the notification for every recipient. Body flags map to
    // the real user_notifications columns.
    const updateData: Record<string, any> = {};
    if (body.is_read === true)
      updateData.read_at = body.read_at ?? new Date().toISOString();
    if (body.is_read === false) updateData.read_at = null;
    if (body.is_archived === true)
      updateData.archived_at = body.archived_at ?? new Date().toISOString();
    if (body.is_archived === false) updateData.archived_at = null;
    if (body.read_at !== undefined) updateData.read_at = body.read_at;
    if (body.archived_at !== undefined) updateData.archived_at = body.archived_at;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({
        data: mapNotificationRow(owned),
        message:
          'No user-scoped fields to update (notification content is managed via /api/admin/notifications/[id])'
      });
    }

    const { data: updated, error } = await (supabase.from(
      'user_notifications'
    ) as any)
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select(NOTIFICATION_SELECT)
      .single();

    if (error) throw error;

    return NextResponse.json({
      data: mapNotificationRow(updated),
      message: 'Notification updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating notification:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // id === user_notifications.id → delete the CALLER'S inbox row (remove from
    // my inbox). The old service path deleted the GLOBAL `notifications` row by
    // notifications.id, which (a) ran as anon and (b) would have removed the
    // notification for every recipient from a per-user route. Unifying on
    // user_notifications.id makes "delete this inbox item" a per-user delete.
    const { data: owned, error: ownErr } = await supabase
      .from('user_notifications')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle();

    if (ownErr) throw ownErr;
    if (!owned) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }
    if (owned.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('user_notifications')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting notification:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

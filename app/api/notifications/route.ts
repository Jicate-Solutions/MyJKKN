export const dynamic = 'force-dynamic';

// app/api/notifications/route.ts

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getNotifications,
  createNotification,
  bulkUpdateNotifications,
  markAllAsRead,
  deleteAllRead
} from '@/lib/services/notification/notification-service';
import { createNotificationSchema } from '@/types/notification';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;

    // Pagination: support both `?offset=` (explicit) and `?page=` (1-indexed)
    // contracts. hooks/use-notifications.ts sends `?page=N&limit=20` for
    // infinite scroll; without `page` translation, every loadMore() call
    // returned the SAME first 20 rows, so users never reached older items.
    // Bug found 2026-05-11 (BUG-003936): Director's month-old Announcements
    // existed in the DB but were unreachable because pagination was broken.
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    const pageParam = searchParams.get('page');
    const limit = limitParam ? parseInt(limitParam) : undefined;
    let offset: number | undefined = offsetParam
      ? parseInt(offsetParam)
      : undefined;
    if (offset === undefined && pageParam) {
      const page = Math.max(1, parseInt(pageParam) || 1);
      offset = (page - 1) * (limit ?? 20);
    }

    const filters = {
      user_id: user.id,
      type: (searchParams.get('type') as any) || undefined,
      category: (searchParams.get('category') as any) || undefined,
      priority: (searchParams.get('priority') as any) || undefined,
      status: (searchParams.get('status') as any) || undefined,
      is_read: searchParams.get('is_read')
        ? searchParams.get('is_read') === 'true'
        : undefined,
      is_archived: searchParams.get('is_archived')
        ? searchParams.get('is_archived') === 'true'
        : undefined,
      search: searchParams.get('search') || undefined,
      from_date: searchParams.get('from_date') || undefined,
      to_date: searchParams.get('to_date') || undefined,
      limit,
      offset
    };

    // Pass the route's cookie-scoped server client so the query runs as
    // `authenticated`. The service's module-level fallback is anon-keyed and
    // would trigger 500 "permission denied for function fn_notification_is_for_user"
    // when an RLS policy on user_notifications invokes that function.
    const notifications = await getNotifications(filters, supabase);

    // Response keys cover both consumer shapes:
    //   - `data` / `count` — original API contract (used by future server callers)
    //   - `notifications` / `unread_count` / `has_more` — what hooks/use-notifications.ts
    //     expects for the /notifications page list. Without these, the page renders
    //     "No notifications yet" even though the API returns rows. Bug found 2026-05-04.
    const effectiveLimit = limit ?? 20;
    return NextResponse.json({
      data: notifications,
      count: notifications.length,
      notifications,
      unread_count: notifications.filter((n) => !n.is_read).length,
      has_more: notifications.length === effectiveLimit
    });
  } catch (error: any) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Handle bulk operations
    if (body.action === 'bulk_update') {
      await bulkUpdateNotifications(body.data);
      return NextResponse.json({ success: true });
    }

    if (body.action === 'mark_all_read') {
      await markAllAsRead(user.id);
      return NextResponse.json({ success: true });
    }

    if (body.action === 'delete_all_read') {
      await deleteAllRead(user.id);
      return NextResponse.json({ success: true });
    }

    // Create notification
    const validatedData = createNotificationSchema.parse(body);
    const notification = await createNotification(validatedData as any);

    return NextResponse.json({
      data: notification,
      message: 'Notification created successfully'
    });
  } catch (error: any) {
    console.error('Error creating notification:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

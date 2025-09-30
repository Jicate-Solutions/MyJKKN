// app/api/notifications/route.ts

import { NextRequest, NextResponse } from 'next/server';
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
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
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
      limit: searchParams.get('limit')
        ? parseInt(searchParams.get('limit')!)
        : undefined,
      offset: searchParams.get('offset')
        ? parseInt(searchParams.get('offset')!)
        : undefined
    };

    const notifications = await getNotifications(filters);

    return NextResponse.json({
      data: notifications,
      count: notifications.length
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
    const notification = await createNotification(validatedData);

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

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/notifications/acknowledge
 *
 * Records explicit acknowledgment of a notification.
 * Unlike "read" (passive - just opened it), "acknowledge" is an
 * active confirmation that the user has seen and understood the content.
 *
 * This is the key differentiator from Google Chat's voluntary 🙏 reaction.
 * In MyJKKN, acknowledgment is system-enforced and permanently recorded.
 */
export async function POST(request: NextRequest) {
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

    const { notification_id } = await request.json();

    if (!notification_id) {
      return NextResponse.json(
        { error: 'notification_id is required' },
        { status: 400 }
      );
    }

    // Find the user_notification record
    const { data: userNotification, error: findError } = await supabase
      .from('user_notifications')
      .select('id, acknowledged_at, notification_id')
      .eq('notification_id', notification_id)
      .eq('user_id', user.id)
      .single();

    if (findError || !userNotification) {
      return NextResponse.json(
        { error: 'Notification not found for this user' },
        { status: 404 }
      );
    }

    // Already acknowledged — return success (idempotent)
    if (userNotification.acknowledged_at) {
      return NextResponse.json({
        message: 'Already acknowledged',
        acknowledged_at: userNotification.acknowledged_at
      });
    }

    const now = new Date().toISOString();

    // Record acknowledgment AND mark as read
    const { error: updateError } = await supabase
      .from('user_notifications')
      .update({
        acknowledged_at: now,
        read_at: now // Also mark as read if not already
      })
      .eq('id', userNotification.id);

    if (updateError) {
      console.error('Error recording acknowledgment:', updateError);
      return NextResponse.json(
        { error: 'Failed to record acknowledgment' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Notification acknowledged',
      acknowledged_at: now,
      notification_id
    });
  } catch (error) {
    console.error('Error in acknowledge endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/notifications/acknowledge
 *
 * Returns all unacknowledged notifications that require acknowledgment
 * for the current user. This powers the blocking modal.
 */
export async function GET() {
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

    // Find all unacknowledged notifications that require acknowledgment
    const { data, error } = await supabase
      .from('user_notifications')
      .select(`
        id,
        notification_id,
        read_at,
        acknowledged_at,
        created_at,
        notifications!inner (
          id,
          title,
          body,
          priority,
          category,
          url,
          requires_acknowledgment,
          acknowledgment_deadline_hours,
          sent_at,
          created_by,
          metadata
        )
      `)
      .eq('user_id', user.id)
      .is('acknowledged_at', null)
      .eq('notifications.requires_acknowledgment', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching unacknowledged notifications:', error);
      return NextResponse.json(
        { error: 'Failed to fetch unacknowledged notifications' },
        { status: 500 }
      );
    }

    // Get creator names for display
    const creatorIds = [...new Set(
      (data || [])
        .map((d: any) => d.notifications?.created_by)
        .filter(Boolean)
    )];

    let creatorMap: Record<string, string> = {};
    if (creatorIds.length > 0) {
      const { data: creators } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', creatorIds);

      if (creators) {
        creatorMap = Object.fromEntries(
          creators.map((c: any) => [c.id, c.full_name || c.email])
        );
      }
    }

    const now = new Date();
    const unacknowledged = (data || []).map((item: any) => {
      const n = item.notifications;
      const sentAt = new Date(n.sent_at || item.created_at);
      const deadlineMs = (n.acknowledgment_deadline_hours || 4) * 60 * 60 * 1000;
      const deadlineAt = new Date(sentAt.getTime() + deadlineMs);

      return {
        id: item.id,
        notification_id: item.notification_id,
        title: n.title,
        body: n.body,
        priority: n.priority,
        category: n.category,
        url: n.url,
        created_by_name: creatorMap[n.created_by] || 'System',
        sent_at: n.sent_at || item.created_at,
        deadline_at: deadlineAt.toISOString(),
        is_overdue: now > deadlineAt,
        metadata: n.metadata
      };
    });

    return NextResponse.json({
      unacknowledged,
      count: unacknowledged.length,
      has_pending: unacknowledged.length > 0
    });
  } catch (error) {
    console.error('Error in acknowledge GET endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

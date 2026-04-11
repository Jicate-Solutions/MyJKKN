import { NextRequest, NextResponse, connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';
import webpush from 'web-push';

// Configure web-push with VAPID keys
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@myjkkn.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export async function POST(request: NextRequest) {
  await connection();

  try {
    // Auth check: super_admin only
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        {
          status: 401,
          headers: { 'Cache-Control': 'private, no-store' }
        }
      );
    }

    const { data: userProfileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const userProfile = userProfileData as { role: string } | null;

    if (userProfile?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Insufficient permissions. Only super_admin can trigger reminders.' },
        {
          status: 403,
          headers: { 'Cache-Control': 'private, no-store' }
        }
      );
    }

    // Use service role client for all cross-user queries (bypasses RLS)
    const serviceClient = createServiceRoleClient();

    // Find all notifications that require acknowledgment AND were sent within the last 48 hours
    const fortyEightHoursAgo = new Date(
      Date.now() - 48 * 60 * 60 * 1000
    ).toISOString();

    const { data: notifications, error: notifError } = await serviceClient
      .from('notifications')
      .select('id, title, sent_at, acknowledgment_deadline_hours')
      .eq('requires_acknowledgment', true)
      .gte('sent_at', fortyEightHoursAgo)
      .not('sent_at', 'is', null);

    if (notifError) {
      console.error('[notifications/send-reminders] Error fetching notifications:', notifError);
      return NextResponse.json(
        { error: 'Failed to fetch notifications' },
        {
          status: 500,
          headers: { 'Cache-Control': 'private, no-store' }
        }
      );
    }

    if (!notifications || notifications.length === 0) {
      return NextResponse.json(
        {
          reminders_sent: 0,
          by_notification: [],
          message: 'No notifications requiring acknowledgment reminders found.'
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    const now = Date.now();
    let totalRemindersSent = 0;
    const byNotification: { title: string; reminder_count: number }[] = [];

    for (const notif of notifications) {
      const sentAt = new Date(notif.sent_at).getTime();
      const deadlineHours = notif.acknowledgment_deadline_hours || 24;
      const deadlineMs = sentAt + deadlineHours * 60 * 60 * 1000;
      const hoursUntilDeadline = (deadlineMs - now) / (60 * 60 * 1000);
      const hoursSinceDeadline = (now - deadlineMs) / (60 * 60 * 1000);

      // Determine reminder type
      let reminderType: '2h_warning' | 'overdue' | null = null;

      if (hoursUntilDeadline > 0 && hoursUntilDeadline <= 2) {
        // Deadline is within 2 hours
        reminderType = '2h_warning';
      } else if (hoursSinceDeadline > 0 && hoursSinceDeadline <= 24) {
        // Deadline passed but less than 24 hours ago
        reminderType = 'overdue';
      }

      if (!reminderType) {
        // Not in a reminder window — skip
        continue;
      }

      // Find users who have NOT acknowledged AND have NOT been escalated
      const { data: unacknowledged, error: unackError } = await serviceClient
        .from('user_notifications')
        .select('user_id')
        .eq('notification_id', notif.id)
        .is('acknowledged_at', null)
        .is('escalated_at', null);

      if (unackError) {
        console.error(
          `[notifications/send-reminders] Error fetching unacknowledged users for ${notif.id}:`,
          unackError
        );
        continue;
      }

      if (!unacknowledged || unacknowledged.length === 0) {
        continue;
      }

      const userIds = unacknowledged.map((u: any) => u.user_id);

      // Build push payload based on reminder type
      let pushTitle: string;
      let pushBody: string;

      if (reminderType === '2h_warning') {
        pushTitle = `\u23F0 Reminder: ${notif.title}`;
        pushBody =
          'You have 2 hours left to acknowledge this notification';
      } else {
        pushTitle = `\uD83D\uDEA8 OVERDUE: ${notif.title}`;
        pushBody =
          'You missed the acknowledgment deadline. Please acknowledge immediately.';
      }

      const pushPayload = JSON.stringify({
        title: pushTitle,
        body: pushBody,
        icon: '/icons/icon-192x192.png',
        url: '/notifications',
        data: {
          notification_id: notif.id,
          reminder_type: reminderType
        }
      });

      // Get push subscriptions for these users
      const { data: subscriptions, error: subError } = await serviceClient
        .from('push_subscriptions')
        .select('id, subscription, user_id')
        .in('user_id', userIds);

      if (subError) {
        console.error(
          `[notifications/send-reminders] Error fetching subscriptions for notification ${notif.id}:`,
          subError
        );
        continue;
      }

      if (!subscriptions || subscriptions.length === 0) {
        continue;
      }

      let reminderCount = 0;

      // Send push notifications in parallel
      const pushPromises = subscriptions.map(async (sub: any) => {
        try {
          await webpush.sendNotification(sub.subscription, pushPayload);
          reminderCount++;
        } catch (error: any) {
          // Remove expired/invalid subscriptions (410 Gone or 404 Not Found)
          if (error.statusCode === 410 || error.statusCode === 404) {
            console.warn(
              `[notifications/send-reminders] Removing stale subscription ${sub.id} for user ${sub.user_id}`
            );
            await serviceClient
              .from('push_subscriptions')
              .delete()
              .eq('id', sub.id);
          } else {
            console.error(
              `[notifications/send-reminders] Push failed for user ${sub.user_id}:`,
              error.statusCode || error.message
            );
          }
        }
      });

      await Promise.allSettled(pushPromises);

      if (reminderCount > 0) {
        totalRemindersSent += reminderCount;
        byNotification.push({
          title: notif.title,
          reminder_count: reminderCount
        });
      }
    }

    console.log(
      `[notifications/send-reminders] Sent ${totalRemindersSent} reminders across ${byNotification.length} notifications`
    );

    return NextResponse.json(
      {
        reminders_sent: totalRemindersSent,
        by_notification: byNotification
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('[notifications/send-reminders] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      {
        status: 500,
        headers: { 'Cache-Control': 'private, no-store' }
      }
    );
  }
}

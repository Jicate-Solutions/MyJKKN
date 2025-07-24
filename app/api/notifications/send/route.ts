import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import webpush from 'web-push';
import { CreateNotificationRequest } from '@/types/notifications';

// Configure web-push with VAPID keys
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@myjkkn.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Get the current user
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has permission to send notifications
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const { data: rolePermissions } = await supabase
      .from('custom_roles')
      .select('permissions')
      .eq('role_key', userProfile?.role)
      .single();

    const hasPermission =
      userProfile?.role === 'super_admin' ||
      rolePermissions?.permissions?.['notifications.create'] === true ||
      rolePermissions?.permissions?.['notifications.send'] === true;

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Parse the notification data
    const notificationData: CreateNotificationRequest = await request.json();

    if (!notificationData.title || !notificationData.body) {
      return NextResponse.json(
        { error: 'Title and body are required' },
        { status: 400 }
      );
    }

    // Create the notification record
    const { data: notification, error: notificationError } = await supabase
      .from('notifications')
      .insert({
        title: notificationData.title,
        body: notificationData.body,
        url: notificationData.url,
        icon: notificationData.icon,
        priority: notificationData.priority || 'normal',
        category: notificationData.category || 'general',
        expires_at: notificationData.expires_at,
        created_by: user.id,
        targeting: notificationData.targeting
      })
      .select()
      .single();

    if (notificationError) {
      console.error('Error creating notification:', notificationError);
      return NextResponse.json(
        { error: 'Failed to create notification' },
        { status: 500 }
      );
    }

    // Find target users based on criteria
    const targetUsers = await findTargetUsers(
      supabase,
      notificationData.targeting
    );

    if (targetUsers.length === 0) {
      return NextResponse.json(
        { error: 'No users found matching the targeting criteria' },
        { status: 400 }
      );
    }

    // Create user_notifications entries for all target users
    const userNotifications = targetUsers.map((userId) => ({
      user_id: userId,
      notification_id: notification.id
    }));

    const { error: userNotificationError } = await supabase
      .from('user_notifications')
      .insert(userNotifications);

    if (userNotificationError) {
      console.error(
        'Error creating user notifications:',
        userNotificationError
      );
      return NextResponse.json(
        { error: 'Failed to link notification to users' },
        { status: 500 }
      );
    }

    // Send web push notifications
    await sendWebPushNotifications(supabase, targetUsers, notification);

    return NextResponse.json({
      message: 'Notification sent successfully',
      notification_id: notification.id,
      target_users_count: targetUsers.length
    });
  } catch (error) {
    console.error('Error in send notification endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function findTargetUsers(
  supabase: any,
  targeting: any
): Promise<string[]> {
  // If no specific targeting criteria, return empty array (avoid sending to everyone)
  if (
    !targeting.institution_id &&
    !targeting.department_id &&
    !targeting.program_id &&
    !targeting.semester &&
    !targeting.section
  ) {
    return [];
  }

  // If only institution targeting, get all profiles for that institution
  if (
    targeting.institution_id &&
    !targeting.department_id &&
    !targeting.program_id &&
    !targeting.semester &&
    !targeting.section
  ) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('institution_id', targeting.institution_id);

    if (error) {
      console.error('Error finding target users by institution:', error);
      return [];
    }

    return data?.map((item: any) => item.id).filter(Boolean) || [];
  }

  // For department/program/semester/section targeting, use students table
  let query = supabase.from('students').select('college_email');

  if (targeting.institution_id) {
    query = query.eq('institution_id', targeting.institution_id);
  }
  if (targeting.department_id) {
    query = query.eq('department_id', targeting.department_id);
  }
  if (targeting.program_id) {
    query = query.eq('program_id', targeting.program_id);
  }
  if (targeting.semester) {
    query = query.eq('semester_id', targeting.semester);
  }
  if (targeting.section) {
    query = query.eq('section_id', targeting.section);
  }

  const { data: students, error: studentsError } = await query;

  if (studentsError) {
    console.error('Error finding target students:', studentsError);
    return [];
  }

  if (!students || students.length === 0) {
    return [];
  }

  // Get profile IDs for these students using their college emails
  const emails = students.map((s: any) => s.college_email).filter(Boolean);

  if (emails.length === 0) {
    return [];
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id')
    .in('email', emails);

  if (profilesError) {
    console.error('Error finding profiles for students:', profilesError);
    return [];
  }

  return profiles?.map((p: any) => p.id).filter(Boolean) || [];
}

async function sendWebPushNotifications(
  supabase: any,
  userIds: string[],
  notification: any
) {
  try {
    // Get push subscriptions for target users
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .in('user_id', userIds);

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No push subscriptions found for target users');
      return;
    }

    const pushPayload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      icon: notification.icon || '/icon-192x192.png',
      url: notification.url || '/',
      data: {
        notification_id: notification.id,
        priority: notification.priority
      }
    });

    // Send push notifications in parallel
    const pushPromises = subscriptions.map(async (sub: any) => {
      try {
        await webpush.sendNotification(sub.subscription, pushPayload);
      } catch (error: any) {
        console.error('Error sending push notification:', error);
        // Optionally remove invalid subscriptions
        if (error.statusCode === 410) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('subscription->endpoint', sub.subscription.endpoint);
        }
      }
    });

    await Promise.allSettled(pushPromises);
    console.log(
      `Sent push notifications to ${subscriptions.length} subscriptions`
    );
  } catch (error) {
    console.error('Error in sendWebPushNotifications:', error);
  }
}

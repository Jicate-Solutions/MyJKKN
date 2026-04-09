export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';
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
  await connection();
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
        targeting: notificationData.targeting,
        metadata: notificationData.metadata || {},
        requires_acknowledgment: notificationData.requires_acknowledgment || false,
        acknowledgment_deadline_hours: notificationData.acknowledgment_deadline_hours || 4
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
    const pushResult = await sendWebPushNotifications(
      targetUsers,
      notification
    );

    return NextResponse.json({
      message: 'Notification sent successfully',
      notification_id: notification.id,
      target_users_count: targetUsers.length,
      push_sent: pushResult.sent,
      push_failed: pushResult.failed,
      push_total_subscriptions: pushResult.total_subscriptions,
      push_delivery_details: pushResult.details
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
  // Check if only role targeting is specified
  const hasLocationTargeting =
    targeting.institution_id ||
    targeting.department_id ||
    targeting.program_id ||
    targeting.semester_id ||
    targeting.section_id;
  const hasRoleTargeting =
    targeting.target_roles && targeting.target_roles.length > 0;

  // If no specific targeting criteria, send to all users
  if (!hasLocationTargeting && !hasRoleTargeting) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_active', true);

    if (error) {
      console.error('Error finding all users:', error);
      return [];
    }

    return data?.map((item: any) => item.id).filter(Boolean) || [];
  }

  // If only role targeting (no location targeting)
  if (!hasLocationTargeting && hasRoleTargeting) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .in('role', targeting.target_roles)
      .eq('is_active', true);

    if (error) {
      console.error('Error finding users by role:', error);
      return [];
    }

    return data?.map((item: any) => item.id).filter(Boolean) || [];
  }

  // If only institution targeting, get all profiles for that institution
  if (
    targeting.institution_id &&
    !targeting.department_id &&
    !targeting.program_id &&
    !targeting.semester_id &&
    !targeting.section_id
  ) {
    let query = supabase
      .from('profiles')
      .select('id')
      .eq('institution_id', targeting.institution_id);

    // Add role filtering if specified
    if (hasRoleTargeting) {
      query = query.in('role', targeting.target_roles);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error finding target users by institution:', error);
      return [];
    }

    const userIds: string[] =
      data?.map((item: any) => item.id).filter(Boolean) || [];

    // Super admins have institution_id = null, so they're excluded by the
    // institution filter above. Always include them when super_admin is
    // in the target roles, since they oversee all institutions.
    if (
      hasRoleTargeting &&
      targeting.target_roles.includes('super_admin')
    ) {
      const { data: superAdmins } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'super_admin')
        .is('institution_id', null);

      if (superAdmins) {
        for (const sa of superAdmins) {
          if (sa.id && !userIds.includes(sa.id)) {
            userIds.push(sa.id);
          }
        }
      }
    }

    return userIds;
  }

  // For department/program/semester/section targeting, use students table
  let query = (supabase as any).from('learners_profiles').select('college_email');

  if (targeting.institution_id) {
    query = query.eq('institution_id', targeting.institution_id);
  }
  if (targeting.department_id) {
    query = query.eq('department_id', targeting.department_id);
  }
  if (targeting.program_id) {
    query = query.eq('program_id', targeting.program_id);
  }
  if (targeting.semester_id) {
    query = query.eq('semester_id', targeting.semester_id);
  }
  if (targeting.section_id) {
    query = query.eq('section_id', targeting.section_id);
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

  const userIds: string[] =
    profiles?.map((p: any) => p.id).filter(Boolean) || [];

  // Include super_admins when targeted (they have null institution_id)
  if (
    hasRoleTargeting &&
    targeting.target_roles.includes('super_admin')
  ) {
    const { data: superAdmins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'super_admin')
      .is('institution_id', null);

    if (superAdmins) {
      for (const sa of superAdmins) {
        if (sa.id && !userIds.includes(sa.id)) {
          userIds.push(sa.id);
        }
      }
    }
  }

  return userIds;
}

interface PushDeliveryDetail {
  user_id: string;
  email: string;
  role: string;
  status: 'delivered' | 'failed' | 'stale_removed';
  error?: string;
}

interface PushResult {
  sent: number;
  failed: number;
  total_subscriptions: number;
  details: PushDeliveryDetail[];
}

async function sendWebPushNotifications(
  userIds: string[],
  notification: any
): Promise<PushResult> {
  const emptyResult: PushResult = { sent: 0, failed: 0, total_subscriptions: 0, details: [] };

  try {
    // Check if VAPID keys are configured
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      console.warn('VAPID keys not configured - skipping push notifications');
      return emptyResult;
    }

    // Use service role client to bypass RLS — the "push_subscriptions_own" policy
    // only allows users to read their OWN subscriptions, so an admin's auth context
    // would return 0 rows when querying other users' subscriptions.
    const serviceClient = createServiceRoleClient();

    // Get push subscriptions for target users along with profile info
    const { data: subscriptions, error: subError } = await serviceClient
      .from('push_subscriptions')
      .select('id, subscription, user_id, profiles!inner(email, role)')
      .in('user_id', userIds);

    if (subError) {
      console.error('Error fetching push subscriptions:', subError);
      return emptyResult;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No push subscriptions found for target users');
      return emptyResult;
    }

    // Strip HTML from body for push notifications (plain text only)
    const plainBody = (notification.body || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const pushPayload = JSON.stringify({
      title: notification.title,
      body: plainBody,
      icon: notification.icon || '/icons/icon-192x192.png',
      url: notification.url || '/notifications',
      data: {
        notification_id: notification.id,
        priority: notification.priority,
        created_at: notification.created_at
      }
    });

    let sent = 0;
    let failed = 0;
    const details: PushDeliveryDetail[] = [];

    // Send push notifications in parallel
    const pushPromises = subscriptions.map(async (sub: any) => {
      const profile = sub.profiles || {};
      const email = profile.email || 'unknown';
      const role = profile.role || 'unknown';
      const endpointShort = sub.subscription?.endpoint
        ? sub.subscription.endpoint.slice(-20)
        : 'unknown';
      try {
        await webpush.sendNotification(sub.subscription, pushPayload);
        sent++;
        details.push({ user_id: sub.user_id, email, role, status: 'delivered' });
        console.log(
          `[Push OK] ${email} (${role}) endpoint=...${endpointShort}`
        );
      } catch (error: any) {
        failed++;
        const errorMsg = `${error.statusCode || 'N/A'}: ${error.message || 'unknown'}`;
        // Remove expired/invalid subscriptions (410 Gone or 404 Not Found)
        if (error.statusCode === 410 || error.statusCode === 404) {
          details.push({ user_id: sub.user_id, email, role, status: 'stale_removed', error: errorMsg });
          console.log(
            `[Push CLEANUP] ${email} (${role}) — stale subscription removed (${error.statusCode})`
          );
          await serviceClient
            .from('push_subscriptions')
            .delete()
            .eq('id', sub.id);
        } else {
          details.push({ user_id: sub.user_id, email, role, status: 'failed', error: errorMsg });
          console.error(
            `[Push FAIL] ${email} (${role}) endpoint=...${endpointShort} ${errorMsg}`
          );
        }
      }
    });

    await Promise.allSettled(pushPromises);
    // Single summary line with all results for easy log searching
    console.log(
      `[Push Summary] ${sent}/${subscriptions.length} delivered | ${details.map(d => `${d.email}:${d.status}`).join(', ')}`
    );

    return { sent, failed, total_subscriptions: subscriptions.length, details };
  } catch (error) {
    console.error('Error in sendWebPushNotifications:', error);
    return emptyResult;
  }
}

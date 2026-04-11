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

// Allowlist for notification.url / notification.icon. Relative paths are
// permitted (same-origin). Absolute URLs must hit a known JKKN host so an
// attacker can't plant a phishing link via a notification payload.
const NOTIFICATION_LINK_ALLOWLIST = new Set<string>([
  'jkkn.ac.in',
  'www.jkkn.ac.in',
  'myjkkn.com',
  'www.myjkkn.com',
  'app.jkkn.ac.in'
]);

function isAllowedNotificationLink(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) {
    return true; // empty / undefined is fine — no link set
  }
  // Relative paths are always same-origin.
  if (value.startsWith('/') && !value.startsWith('//')) {
    return true;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (NOTIFICATION_LINK_ALLOWLIST.has(host)) return true;
    // Allow any subdomain of jkkn.ac.in (e.g. marathon.jkkn.ac.in)
    if (host === 'jkkn.ac.in' || host.endsWith('.jkkn.ac.in')) return true;
    return false;
  } catch {
    return false;
  }
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

    // Validate notification.url and notification.icon — these render in the
    // OS push notification and open when clicked, so an attacker-controlled
    // URL = one-click phishing from an official JKKN notification. Restrict
    // to known-good hosts plus relative paths (same-origin).
    if (notificationData.url && !isAllowedNotificationLink(notificationData.url)) {
      return NextResponse.json(
        { error: 'notification url must be same-origin or an allowed host' },
        { status: 400 }
      );
    }
    if (notificationData.icon && !isAllowedNotificationLink(notificationData.icon)) {
      return NextResponse.json(
        { error: 'notification icon must be same-origin or an allowed host' },
        { status: 400 }
      );
    }

    // Find target users BEFORE creating the notification row so we don't
    // leave orphan "ghost notifications" in the table when targeting resolves
    // to zero users. This also lets us fail-closed when an audience-only
    // target fails to resolve.
    const targetingResult = await findTargetUsers(
      supabase,
      notificationData.targeting
    );

    const targetUsers = targetingResult.userIds;
    const failedAudiences = targetingResult.failedAudiences;

    if (targetUsers.length === 0) {
      return NextResponse.json(
        {
          error: 'No users found matching the targeting criteria',
          failed_audiences: failedAudiences.length ? failedAudiences : undefined
        },
        { status: 400 }
      );
    }

    // If any audience failed to resolve AND the admin asked for audience
    // targeting, fail-closed — silent partial delivery is worse than a clear
    // error. The admin can re-submit after investigating.
    if (
      failedAudiences.length > 0 &&
      notificationData.targeting?.audience_ids &&
      notificationData.targeting.audience_ids.length > 0
    ) {
      return NextResponse.json(
        {
          error:
            'One or more audiences failed to resolve. No notification was sent.',
          failed_audiences: failedAudiences
        },
        { status: 500 }
      );
    }

    // Create the notification record now that targeting is confirmed.
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

interface TargetingResult {
  userIds: string[];
  failedAudiences: string[];
}

async function findTargetUsers(
  supabase: any,
  targeting: any
): Promise<TargetingResult> {
  const failedAudiences: string[] = [];

  // Resolve saved audiences in parallel — sequential RPC calls on a request
  // path add up quickly and can exceed serverless timeouts.
  //
  // resolve_audience is SECURITY DEFINER and only granted to service_role,
  // so we must use the service client here — the authenticated session client
  // cannot execute it.
  const audienceUserIds = new Set<string>();
  const rawAudienceIds = Array.isArray(targeting?.audience_ids)
    ? (targeting.audience_ids as any[]).filter(
        (v): v is string => typeof v === 'string' && v.length > 0
      )
    : [];

  if (rawAudienceIds.length > 0) {
    const serviceClient = createServiceRoleClient();
    const resolveResults = await Promise.allSettled(
      rawAudienceIds.map((audienceId) =>
        (serviceClient as any)
          .rpc('resolve_audience', { p_audience_id: audienceId })
          .then((result: any) => ({ audienceId, ...result }))
      )
    );

    for (const r of resolveResults) {
      if (r.status !== 'fulfilled') {
        console.error('[notifications/send] resolve_audience threw:', r.reason);
        failedAudiences.push('unknown');
        continue;
      }
      const { audienceId, data, error } = r.value;
      if (error) {
        console.error(
          '[notifications/send] Failed to resolve audience:',
          audienceId,
          error
        );
        failedAudiences.push(audienceId);
        continue;
      }
      // Authoritative shape: { user_ids: string[], count: number }
      if (data?.user_ids && Array.isArray(data.user_ids)) {
        for (const uid of data.user_ids) {
          if (typeof uid === 'string' && uid) audienceUserIds.add(uid);
        }
      } else {
        console.warn(
          '[notifications/send] resolve_audience returned unexpected shape for',
          audienceId
        );
        failedAudiences.push(audienceId);
      }
    }
  }

  // Check if only role targeting is specified
  const hasLocationTargeting =
    targeting.institution_id ||
    targeting.department_id ||
    targeting.program_id ||
    targeting.semester_id ||
    targeting.section_id;
  const hasRoleTargeting =
    targeting.target_roles && targeting.target_roles.length > 0;
  const hasAudienceTargeting = audienceUserIds.size > 0;

  // If ONLY audiences are specified, return those directly
  if (hasAudienceTargeting && !hasLocationTargeting && !hasRoleTargeting) {
    return { userIds: Array.from(audienceUserIds), failedAudiences };
  }

  // If no specific targeting criteria, send to all users
  if (!hasLocationTargeting && !hasRoleTargeting && !hasAudienceTargeting) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_active', true);

    if (error) {
      console.error('Error finding all users:', error);
      return { userIds: [], failedAudiences };
    }

    return {
      userIds: data?.map((item: any) => item.id).filter(Boolean) || [],
      failedAudiences
    };
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
      return { userIds: [], failedAudiences };
    }

    const ids: string[] =
      data?.map((item: any) => item.id).filter(Boolean) || [];
    // Merge audience user_ids (deduplicated) — audience + role = union
    for (const uid of audienceUserIds) {
      if (!ids.includes(uid)) ids.push(uid);
    }
    return { userIds: ids, failedAudiences };
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
      return { userIds: [], failedAudiences };
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

    // Merge audience user_ids (deduplicated)
    for (const uid of audienceUserIds) {
      if (!userIds.includes(uid)) userIds.push(uid);
    }
    return { userIds, failedAudiences };
  }

  // For department/program/semester/section targeting, use students table.
  // NOTE: learners_profiles only holds students. If the caller specified
  // target_roles that DOES NOT include 'student', we should NOT pull student
  // rows here — branch 3 (role-only) already handled that case via profiles.
  // Historically this branch silently ignored target_roles, blasting every
  // student in the org unit regardless of role intent.
  const roleRequestedNonStudent =
    hasRoleTargeting &&
    !targeting.target_roles.includes('student') &&
    !targeting.target_roles.includes('all');

  let studentIds: string[] = [];

  if (!roleRequestedNonStudent) {
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
      return { userIds: [], failedAudiences };
    }

    if (students && students.length > 0) {
      const emails = students
        .map((s: any) => s.college_email)
        .filter(Boolean);

      if (emails.length > 0) {
        // Filter the profiles join by role when a role filter is in effect.
        // Previously this query ignored target_roles entirely, so "department
        // CSE + target_roles=['faculty']" returned all CSE students instead
        // of zero — exactly the wrong audience.
        let profileQuery = supabase
          .from('profiles')
          .select('id')
          .in('email', emails);

        if (hasRoleTargeting) {
          profileQuery = profileQuery.in('role', targeting.target_roles);
        }

        const { data: profiles, error: profilesError } = await profileQuery;

        if (profilesError) {
          console.error('Error finding profiles for students:', profilesError);
          return { userIds: [], failedAudiences };
        }

        studentIds =
          profiles?.map((p: any) => p.id).filter(Boolean) || [];
      }
    }
  }

  const userIds: string[] = [...studentIds];

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

  // Merge audience user_ids (deduplicated)
  for (const uid of audienceUserIds) {
    if (!userIds.includes(uid)) userIds.push(uid);
  }
  return { userIds, failedAudiences };
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

    const requiresAck = notification.requires_acknowledgment || false;
    const pushPayload = JSON.stringify({
      title: requiresAck
        ? `⚠️ ACTION REQUIRED: ${notification.title}`
        : notification.title,
      body: requiresAck
        ? `${plainBody}\n\nTap to acknowledge (mandatory)`
        : plainBody,
      icon: notification.icon || '/icons/icon-192x192.png',
      url: notification.url || '/notifications',
      requireInteraction: requiresAck,
      data: {
        notification_id: notification.id,
        priority: notification.priority,
        requires_acknowledgment: requiresAck,
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

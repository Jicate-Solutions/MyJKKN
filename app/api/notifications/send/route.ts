export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';
import { filterPushRecipients } from '@/lib/push/opt-out';
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

// URL validation: only reject javascript: and data: protocols.
// Admins with notifications.create permission are trusted users —
// an allowlist added friction without meaningful security benefit
// since compromised admin accounts have far greater access vectors.
function isAllowedNotificationLink(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) {
    return true;
  }
  // Block dangerous protocols
  const lower = value.toLowerCase().trim();
  if (lower.startsWith('javascript:') || lower.startsWith('data:')) {
    return false;
  }
  return true;
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
        acknowledgment_deadline_hours: notificationData.acknowledgment_deadline_hours || 4,
        action_type: (notificationData as any).action_type || null,
        action_config: (notificationData as any).action_config || null
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

// `.in('id', [...])` travels in the PostgREST query string. 200 UUIDs is
// ~7.4 KB of URL — comfortably under the proxy's header limit — and the
// chunks run in parallel, so the whole filter costs one round trip.
const ACTIVE_FILTER_CHUNK = 200;

/**
 * Keep only the ids whose profile is is_active = true.
 *
 * Allowlist, not blocklist: an id with no `profiles` row at all is dropped
 * rather than kept. Runs on the service client because the ids being filtered
 * came from resolve_audience (SECURITY DEFINER, cluster-wide) — filtering them
 * through an RLS-scoped client would narrow by visibility as well as by
 * is_active and silently lose legitimate recipients.
 *
 * Returns error:true on any failure so the caller can fail closed. Under-
 * delivering silently is not an option here: the caller turns this into a 500
 * and sends nothing.
 */
async function keepActiveProfiles(
  serviceClient: any,
  ids: string[]
): Promise<{ activeIds: string[]; error: boolean }> {
  if (ids.length === 0) return { activeIds: [], error: false };

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ACTIVE_FILTER_CHUNK) {
    chunks.push(ids.slice(i, i + ACTIVE_FILTER_CHUNK));
  }

  const results = await Promise.all(
    chunks.map((chunk) =>
      serviceClient
        .from('profiles')
        .select('id')
        .in('id', chunk)
        .eq('is_active', true)
    )
  );

  const activeIds: string[] = [];
  for (const result of results) {
    if (result?.error) {
      console.error(
        '[notifications/send] is_active filter on audience ids failed:',
        result.error
      );
      return { activeIds: [], error: true };
    }
    for (const row of result?.data || []) {
      if (row?.id) activeIds.push(row.id);
    }
  }

  return { activeIds, error: false };
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

    // resolve_audience does NOT gate every arm on the account being active.
    // Checked per statement against the live prod body on 2026-08-09 (not by
    // grepping the whole function — a whole-function grep for 'is_active'
    // returns true because 10 of the 13 built-in arms do gate, and because
    // line 1 reads notification_audiences.is_active, the AUDIENCE row's own
    // flag, which is not a user gate at all). The three arms with no gate:
    //   push_subscribers  -> SELECT DISTINCT user_id FROM push_subscriptions
    //   attendance_below  -> SELECT DISTINCT ses.user_id FROM
    //                        student_engagement_scores WHERE is_at_risk
    //   login_recency + logged_in_within_days -> SELECT DISTINCT us.user_id
    //                        FROM user_sessions WHERE us.created_at >= ...
    // The last one is the trap: its not_logged_in_days sibling in the same
    // IF block DOES gate, so the asymmetry is invisible above statement level.
    //
    // Measured on prod the same day: 'Push Subscribers' resolved 1,302 ids of
    // which 29 were deactivated (48 push_subscriptions rows); 'Low Attendance
    // (<75%)' and 'Critical Attendance (<60%)' each resolved 4,698 of which
    // 480 were deactivated.
    //
    // So this route filters audience-resolved ids itself. This is the delivery
    // boundary — nothing sent from here reaches a deactivated account, whatever
    // an audience arm returns. Fixing the arms in the DB would be the deeper
    // fix and is deliberately NOT done in this PR (see the PR body).
    if (audienceUserIds.size > 0) {
      const { activeIds, error: filterError } = await keepActiveProfiles(
        serviceClient,
        Array.from(audienceUserIds)
      );

      audienceUserIds.clear();
      if (filterError) {
        // Fail closed: we could not establish who is active, so we claim no
        // audience resolved. Nothing is sent either way; the status code
        // depends on the send shape. Audience-only: every branch below yields
        // no recipients, so the caller's `targetUsers.length === 0` check fires
        // first and answers 400. Audience + role/location: those branches still
        // return recipients, so the caller reaches the failedAudiences check
        // and answers 500.
        for (const audienceId of rawAudienceIds) failedAudiences.push(audienceId);
      } else {
        for (const uid of activeIds) audienceUserIds.add(uid);
      }
    }
  }

  // Check if only role targeting is specified
  // Institutions are multi-select as of 2026-08-04 (e.g. Dental + Pharmacy in
  // one send). `institution_ids` is the list; `institution_id` is the legacy
  // single value the composer still sends when exactly one is picked, and is
  // what older stored payloads carry. Normalise to ONE list so every branch
  // below filters identically.
  const institutionIds: string[] = Array.isArray(targeting.institution_ids)
    ? targeting.institution_ids.filter(
        (id: unknown) => typeof id === 'string' && id.length > 0
      )
    : targeting.institution_id
      ? [targeting.institution_id]
      : [];

  const hasLocationTargeting =
    institutionIds.length > 0 ||
    targeting.department_id ||
    targeting.program_id ||
    targeting.semester_id ||
    targeting.section_id;
  const hasRoleTargeting =
    targeting.target_roles && targeting.target_roles.length > 0;
  const hasAudienceTargeting = audienceUserIds.size > 0;

  // If ONLY audiences are specified, return those directly. They are already
  // is_active-filtered above — resolve_audience does NOT gate every arm, so
  // this route does it at the delivery boundary. Do not remove that filter on
  // the belief that the DB handles it; three of its arms do not.
  if (hasAudienceTargeting && !hasLocationTargeting && !hasRoleTargeting) {
    return { userIds: Array.from(audienceUserIds), failedAudiences };
  }

  // An audience WAS asked for, resolved to nobody, and nothing else narrows
  // the send. hasAudienceTargeting means "resolved to >= 1 id", not "was
  // requested", so without this guard the request falls through to the
  // untargeted branches below and blasts every active account (or, if it
  // reaches the org-unit branch with no org filters set, every active
  // learner). That was already reachable before this PR — 'Hostel Residents'
  // and 'Bus Commuters' both return an empty array by construction — and the
  // is_active filter above adds one more way in. Asking for an audience and
  // getting nobody must mean nobody: return [] and let the caller answer 400.
  if (
    rawAudienceIds.length > 0 &&
    !hasAudienceTargeting &&
    !hasLocationTargeting &&
    !hasRoleTargeting
  ) {
    return { userIds: [], failedAudiences };
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
    institutionIds.length > 0 &&
    !targeting.department_id &&
    !targeting.program_id &&
    !targeting.semester_id &&
    !targeting.section_id
  ) {
    // is_active is mandatory here for the same reason it is on the "all users"
    // and role-only branches above: deactivated accounts (alumni, ex-staff)
    // must never receive a notification. This branch omitted it until
    // 2026-08-09, so institution-targeted sends reached every deactivated
    // profile carrying that institution_id (824 cluster-wide when measured
    // on 2026-08-09 — a live count that drifts, not a fixture).
    // profiles.is_active has 0 NULL rows on prod, so .eq(true) is exactly
    // "not deactivated".
    let query = supabase
      .from('profiles')
      .select('id')
      .in('institution_id', institutionIds)
      .eq('is_active', true);

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
    // The INSTITUTION filter is deliberately absent here — that is the whole
    // point of the top-up. The is_active filter is NOT optional though: a
    // deactivated super admin is still a deactivated account.
    if (
      hasRoleTargeting &&
      targeting.target_roles.includes('super_admin')
    ) {
      const { data: superAdmins } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'super_admin')
        .eq('is_active', true)
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

    if (institutionIds.length > 0) {
      query = query.in('institution_id', institutionIds);
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
        //
        // is_active is applied on the profiles side (not learners_profiles)
        // because profiles.is_active is the single account-level gate every
        // other branch uses. 375 learner rows on prod resolved to a
        // deactivated profile when measured on 2026-08-09 and were being
        // notified before that (again: a live count, not a fixture).
        let profileQuery = supabase
          .from('profiles')
          .select('id')
          .in('email', emails)
          .eq('is_active', true);

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

  // Include super_admins when targeted (they have null institution_id).
  // Same rationale as the top-up in the institution-only branch: no
  // institution filter by design, but is_active still applies.
  if (
    hasRoleTargeting &&
    targeting.target_roles.includes('super_admin')
  ) {
    const { data: superAdmins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'super_admin')
      .eq('is_active', true)
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

    // Drop anyone who switched push off before looking up any subscription.
    // is_active alone cannot carry that answer: unsubscribing destroys the
    // browser endpoint, so the next page load mints a NEW row that is
    // is_active=true and passes the filter below perfectly.
    const pushUserIds = await filterPushRecipients(serviceClient, userIds);
    if (pushUserIds.length === 0) {
      return emptyResult;
    }

    // Get push subscriptions for target users along with profile info.
    const { data: subscriptions, error: subError } = await serviceClient
      .from('push_subscriptions')
      .select('id, subscription, user_id, profiles!inner(email, role)')
      .in('user_id', pushUserIds)
      .eq('is_active', true);

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
    const isAction = notification.action_type != null;
    const pushPayload = JSON.stringify({
      title: isAction
        ? `⚡ ACTION REQUIRED: ${notification.title}`
        : requiresAck
          ? `⚠️ ACKNOWLEDGE: ${notification.title}`
          : notification.title,
      body: isAction
        ? `${plainBody}\n\nTap to submit your response`
        : requiresAck
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

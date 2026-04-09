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

interface OverdueRow {
  un_id: string;
  user_id: string;
  notification_id: string;
  notification_title: string;
  full_name: string;
  email: string;
  role: string;
  institution_id: string | null;
  institution_name: string | null;
}

interface InstitutionGroup {
  institution_id: string;
  institution_name: string;
  notification_title: string;
  notification_id: string;
  users: { un_id: string; user_id: string; full_name: string; email: string; role: string }[];
}

export async function POST(request: NextRequest) {
  await connection();

  try {
    // --- Auth: super_admin only ---
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

    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const profile = profileData as { role: string } | null;

    if (profile?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden: super_admin only' },
        {
          status: 403,
          headers: { 'Cache-Control': 'private, no-store' }
        }
      );
    }

    // --- Find overdue unacknowledged notifications ---
    const serviceClient = createServiceRoleClient();
    const overdue: OverdueRow[] = [];

    // Step 1: Get all notifications that require acknowledgment
    const { data: ackNotifications, error: ackError } = await serviceClient
      .from('notifications')
      .select('id, title, sent_at, acknowledgment_deadline_hours')
      .eq('requires_acknowledgment', true);

    if (ackError) {
      console.error('[notifications/escalate] Failed to fetch ack notifications:', ackError);
      return NextResponse.json(
        { error: 'Failed to query notifications' },
        {
          status: 500,
          headers: { 'Cache-Control': 'private, no-store' }
        }
      );
    }

    if (!ackNotifications || ackNotifications.length === 0) {
      return NextResponse.json(
        {
          message: 'No notifications requiring acknowledgment found',
          escalated: 0,
          by_institution: {}
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    // Step 2: Filter to only overdue notifications (deadline has passed)
    const now = new Date();
    const overdueNotifications = ackNotifications.filter((n: any) => {
      if (!n.sent_at || !n.acknowledgment_deadline_hours) return false;
      const sentAt = new Date(n.sent_at);
      const deadlineMs = n.acknowledgment_deadline_hours * 60 * 60 * 1000;
      return now.getTime() > sentAt.getTime() + deadlineMs;
    });

    if (overdueNotifications.length === 0) {
      return NextResponse.json(
        {
          message: 'No overdue notifications found',
          escalated: 0,
          by_institution: {}
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    const overdueNotifIds = overdueNotifications.map((n: any) => n.id);

    // Step 3: Get unacknowledged, non-escalated user_notifications for these
    const { data: unackRows, error: unackError } = await serviceClient
      .from('user_notifications')
      .select('id, user_id, notification_id')
      .in('notification_id', overdueNotifIds)
      .is('acknowledged_at', null)
      .is('escalated_at', null);

    if (unackError) {
      console.error('[notifications/escalate] Failed to fetch unack user_notifications:', unackError);
      return NextResponse.json(
        { error: 'Failed to query user notifications' },
        {
          status: 500,
          headers: { 'Cache-Control': 'private, no-store' }
        }
      );
    }

    if (!unackRows || unackRows.length === 0) {
      return NextResponse.json(
        {
          message: 'All users have acknowledged or already been escalated',
          escalated: 0,
          by_institution: {}
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    // Step 4: Get profile info for these users
    const userIds = [...new Set(unackRows.map((r: any) => r.user_id))];
    const { data: profiles, error: profilesError } = await serviceClient
      .from('profiles')
      .select('id, full_name, email, role, institution_id')
      .in('id', userIds);

    if (profilesError) {
      console.error('[notifications/escalate] Failed to fetch profiles:', profilesError);
      return NextResponse.json(
        { error: 'Failed to query user profiles' },
        {
          status: 500,
          headers: { 'Cache-Control': 'private, no-store' }
        }
      );
    }

    // Step 5: Get institution names
    const institutionIds = [
      ...new Set(
        (profiles || [])
          .map((p: any) => p.institution_id)
          .filter(Boolean)
      )
    ];

    let institutionMap: Record<string, string> = {};
    if (institutionIds.length > 0) {
      const { data: institutions } = await serviceClient
        .from('institutions')
        .select('id, name')
        .in('id', institutionIds);

      if (institutions) {
        institutionMap = Object.fromEntries(
          institutions.map((inst: any) => [inst.id, inst.name])
        );
      }
    }

    // Build lookup maps
    const notifTitleMap: Record<string, string> = {};
    for (const n of overdueNotifications) {
      notifTitleMap[n.id] = (n as any).title;
    }

    const profileMap: Record<string, any> = {};
    for (const p of (profiles || [])) {
      profileMap[p.id] = p;
    }

    // Assemble the overdue array
    for (const row of unackRows) {
      const p = profileMap[row.user_id];
      if (!p) continue;

      overdue.push({
        un_id: row.id,
        user_id: row.user_id,
        notification_id: row.notification_id,
        notification_title: notifTitleMap[row.notification_id] || 'Unknown',
        full_name: p.full_name || 'Unknown',
        email: p.email || '',
        role: p.role || '',
        institution_id: p.institution_id,
        institution_name: p.institution_id
          ? institutionMap[p.institution_id] || 'Unknown Institution'
          : null
      });
    }

    if (overdue.length === 0) {
      return NextResponse.json(
        {
          message: 'No overdue unacknowledged notifications to escalate',
          escalated: 0,
          by_institution: {}
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    // --- Group by institution + notification ---
    const groupKey = (row: OverdueRow) =>
      `${row.institution_id || 'no-institution'}::${row.notification_id}`;

    const groups: Record<string, InstitutionGroup> = {};

    for (const row of overdue) {
      const key = groupKey(row);
      if (!groups[key]) {
        groups[key] = {
          institution_id: row.institution_id || 'no-institution',
          institution_name: row.institution_name || 'No Institution',
          notification_title: row.notification_title,
          notification_id: row.notification_id,
          users: []
        };
      }
      groups[key].users.push({
        un_id: row.un_id,
        user_id: row.user_id,
        full_name: row.full_name,
        email: row.email,
        role: row.role
      });
    }

    // --- Send escalation notifications to HODs/principals per institution ---
    const escalationSummary: Record<
      string,
      { institution_name: string; users_escalated: number; escalation_sent_to: number }
    > = {};
    const allEscalatedUnIds: string[] = [];

    for (const group of Object.values(groups)) {
      const userNames = group.users.map((u) => u.full_name).join(', ');
      const count = group.users.length;

      // Build escalation notification content
      const escalationTitle = `Acknowledgment Overdue: ${group.notification_title}`;
      const escalationBody = `<p><strong>${count} member${count > 1 ? 's' : ''}</strong> ha${count > 1 ? 've' : 's'}n't acknowledged the notification "${group.notification_title}".</p>`
        + `<p><strong>Names:</strong> ${userNames}</p>`
        + `<p>Please follow up with them to ensure compliance.</p>`;

      // Find HODs and principals for this institution
      let hodPrincipalIds: string[] = [];
      if (group.institution_id !== 'no-institution') {
        const { data: hodPrincipals } = await serviceClient
          .from('profiles')
          .select('id')
          .eq('institution_id', group.institution_id)
          .in('role', ['hod', 'principal', 'vice_principal', 'dean'])
          .eq('is_active', true);

        hodPrincipalIds = (hodPrincipals || []).map((p: any) => p.id);
      }

      // Also include super_admins
      const { data: superAdmins } = await serviceClient
        .from('profiles')
        .select('id')
        .eq('role', 'super_admin')
        .eq('is_active', true);

      const superAdminIds = (superAdmins || []).map((p: any) => p.id);
      const allEscalationTargets = [
        ...new Set([...hodPrincipalIds, ...superAdminIds])
      ];

      if (allEscalationTargets.length > 0) {
        // Create the escalation notification record
        const { data: escalationNotif, error: escNotifError } = await serviceClient
          .from('notifications')
          .insert({
            title: escalationTitle,
            body: escalationBody,
            priority: 'high',
            category: 'escalation',
            created_by: user.id,
            targeting: {
              institution_id: group.institution_id !== 'no-institution'
                ? group.institution_id
                : null,
              target_roles: ['hod', 'principal', 'vice_principal', 'dean', 'super_admin']
            },
            metadata: {
              escalation_source_notification_id: group.notification_id,
              non_compliant_count: count,
              non_compliant_user_ids: group.users.map((u) => u.user_id)
            }
          })
          .select()
          .single();

        if (escNotifError) {
          console.error(
            '[notifications/escalate] Failed to create escalation notification:',
            escNotifError
          );
          // Continue with other groups rather than failing entirely
          continue;
        }

        // Create user_notifications for each escalation target
        const escalationUserNotifs = allEscalationTargets.map((targetId) => ({
          user_id: targetId,
          notification_id: escalationNotif.id
        }));

        const { error: escUserNotifError } = await serviceClient
          .from('user_notifications')
          .insert(escalationUserNotifs);

        if (escUserNotifError) {
          console.error(
            '[notifications/escalate] Failed to create escalation user_notifications:',
            escUserNotifError
          );
        }

        // Send web push to escalation targets
        await sendEscalationPush(serviceClient, allEscalationTargets, escalationNotif);
      }

      // Collect all user_notification IDs to mark as escalated
      for (const u of group.users) {
        allEscalatedUnIds.push(u.un_id);
      }

      // Build summary for this institution
      const instKey = group.institution_id !== 'no-institution'
        ? group.institution_id
        : 'no-institution';

      if (!escalationSummary[instKey]) {
        escalationSummary[instKey] = {
          institution_name: group.institution_name,
          users_escalated: 0,
          escalation_sent_to: 0
        };
      }
      escalationSummary[instKey].users_escalated += count;
      escalationSummary[instKey].escalation_sent_to = allEscalationTargets.length;
    }

    // --- Mark original user_notifications as escalated ---
    if (allEscalatedUnIds.length > 0) {
      // Update in batches of 500 to avoid query size limits
      const batchSize = 500;
      for (let i = 0; i < allEscalatedUnIds.length; i += batchSize) {
        const batch = allEscalatedUnIds.slice(i, i + batchSize);
        const { error: updateError } = await serviceClient
          .from('user_notifications')
          .update({
            escalated_at: new Date().toISOString(),
            escalation_level: 1
          })
          .in('id', batch);

        if (updateError) {
          console.error(
            '[notifications/escalate] Failed to update escalated_at for batch:',
            updateError
          );
        }
      }
    }

    return NextResponse.json(
      {
        message: `Escalation complete: ${allEscalatedUnIds.length} user notification(s) escalated`,
        escalated: allEscalatedUnIds.length,
        by_institution: escalationSummary
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('[notifications/escalate] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      {
        status: 500,
        headers: { 'Cache-Control': 'private, no-store' }
      }
    );
  }
}

/**
 * Send web push notifications to escalation targets (HODs, principals, etc.)
 */
async function sendEscalationPush(
  serviceClient: any,
  targetUserIds: string[],
  notification: any
): Promise<void> {
  try {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return;
    }

    const { data: subscriptions } = await serviceClient
      .from('push_subscriptions')
      .select('id, subscription, user_id')
      .in('user_id', targetUserIds);

    if (!subscriptions || subscriptions.length === 0) return;

    // Strip HTML from body for push
    const plainBody = (notification.body || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li>/gi, '- ')
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
      icon: '/icons/icon-192x192.png',
      url: '/notifications',
      data: {
        notification_id: notification.id,
        priority: notification.priority
      }
    });

    const pushPromises = subscriptions.map(async (sub: any) => {
      try {
        await webpush.sendNotification(sub.subscription, pushPayload);
      } catch (err: any) {
        // Clean up stale subscriptions
        if (err.statusCode === 410 || err.statusCode === 404) {
          await serviceClient
            .from('push_subscriptions')
            .delete()
            .eq('id', sub.id);
        }
      }
    });

    await Promise.allSettled(pushPromises);
  } catch (error) {
    console.error('[notifications/escalate] Push notification error:', error);
  }
}

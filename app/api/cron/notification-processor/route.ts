export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { filterPushRecipients } from '@/lib/push/opt-out';
import webpush from 'web-push';

// Configure VAPID keys for push notifications
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@myjkkn.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // Auth: CRON_SECRET via `Authorization: Bearer <secret>` header (Vercel cron)
  // OR `?secret=` query param (manual runs). Vercel does NOT substitute
  // ${CRON_SECRET} in URL paths, so Bearer header is required for auto-fires.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[cron/notification-processor] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    console.warn('[cron/notification-processor] Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = createServiceRoleClient();
  const now = new Date();
  const results = {
    reminders_sent: 0,
    escalations_processed: 0,
    // 2026-09-16: the bug-feedback step
    bug_feedback_dropped: 0,
    bug_feedback_released: 0,
    bug_feedback_still_open_expired: 0,
    bug_feedback_still_open_closed: 0,
    bug_feedback_reminders: 0,
    errors: [] as string[],
  };

  try {
    // ----------------------------------------------------------------
    // Step 1: Find all mandatory notifications (with acknowledgment
    //         required) sent within the last 48 hours. We only look at
    //         recent notifications to keep the query bounded.
    // ----------------------------------------------------------------
    const cutoff48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

    const { data: mandatoryNotifs, error: notifError } = await serviceClient
      .from('notifications')
      .select('id, title, sent_at, acknowledgment_deadline_hours, requires_acknowledgment, targeting')
      .eq('requires_acknowledgment', true)
      .not('sent_at', 'is', null)
      .gte('sent_at', cutoff48h);

    if (notifError) {
      console.error('[cron/notification-processor] Error fetching mandatory notifications:', notifError);
      results.errors.push(`Failed to fetch mandatory notifications: ${notifError.message}`);
      return NextResponse.json({
        ...results,
        duration_ms: Date.now() - startTime,
      }, { status: 500 });
    }

    // 2026-09-16: no early return here any more — Step 3 (bug-feedback
    // questions) must run even on an hour with no mandatory notice.
    if (!mandatoryNotifs || mandatoryNotifs.length === 0) {
      console.log('[cron/notification-processor] No mandatory notifications to process');
    } else {
      console.log(`[cron/notification-processor] Found ${mandatoryNotifs.length} mandatory notification(s) to check`);
    }

    // ----------------------------------------------------------------
    // Step 2: Process each mandatory notification
    // ----------------------------------------------------------------
    for (const notif of mandatoryNotifs ?? []) {
      try {
        const sentAt = new Date(notif.sent_at);
        const deadlineHours = notif.acknowledgment_deadline_hours || 24;
        const deadlineTime = new Date(sentAt.getTime() + deadlineHours * 60 * 60 * 1000);
        const reminderTime = new Date(deadlineTime.getTime() - 2 * 60 * 60 * 1000);

        // ---- REMINDER: 2 hours before deadline ----
        // Only send reminders if we are within the 2-hour window before
        // deadline and the deadline has NOT yet passed.
        const isInReminderWindow = now >= reminderTime && now < deadlineTime;

        if (isInReminderWindow) {
          // Find users who haven't acknowledged and haven't been reminded yet.
          // We use escalation_level = 0 (or null) to indicate no reminder sent,
          // and set it to 1 after sending the reminder to prevent duplicates.
          const { data: unackedUsers, error: unackedError } = await serviceClient
            .from('user_notifications')
            .select('id, user_id')
            .eq('notification_id', notif.id)
            .is('acknowledged_at', null)
            .or('escalation_level.is.null,escalation_level.eq.0');

          if (unackedError) {
            console.error(`[cron/notification-processor] Error fetching unacked users for ${notif.id}:`, unackedError);
            results.errors.push(`Reminder fetch error for ${notif.id}: ${unackedError.message}`);
            continue;
          }

          if (unackedUsers && unackedUsers.length > 0) {
            console.log(`[cron/notification-processor] Sending reminders for "${notif.title}" to ${unackedUsers.length} user(s)`);

            // Send reminder push notifications
            const userIds = unackedUsers.map((u: any) => u.user_id);
            const remindersSent = await sendPushToUsers(
              serviceClient,
              userIds,
              {
                title: `Reminder: ${notif.title}`,
                body: 'This notification requires your acknowledgment. Deadline approaching in less than 2 hours.',
                icon: '/icons/icon-192x192.png',
                url: '/notifications',
                data: { notification_id: notif.id, type: 'reminder' },
              }
            );

            results.reminders_sent += remindersSent;

            // Mark these user_notifications as reminded (escalation_level = 1)
            // to prevent duplicate reminders on next cron run
            const userNotifIds = unackedUsers.map((u: any) => u.id);
            const { error: updateError } = await serviceClient
              .from('user_notifications')
              .update({ escalation_level: 1 })
              .in('id', userNotifIds);

            if (updateError) {
              console.error(`[cron/notification-processor] Error updating escalation_level for reminders:`, updateError);
              results.errors.push(`Reminder update error for ${notif.id}: ${updateError.message}`);
            }
          }
        }

        // ---- ESCALATION: past deadline ----
        if (now >= deadlineTime) {
          // Find users who haven't acknowledged AND haven't been escalated yet.
          // escalation_level < 2 means not yet escalated (0=nothing, 1=reminded).
          const { data: escalationUsers, error: escError } = await serviceClient
            .from('user_notifications')
            .select('id, user_id')
            .eq('notification_id', notif.id)
            .is('acknowledged_at', null)
            .or('escalation_level.is.null,escalation_level.lt.2');

          if (escError) {
            console.error(`[cron/notification-processor] Error fetching escalation users for ${notif.id}:`, escError);
            results.errors.push(`Escalation fetch error for ${notif.id}: ${escError.message}`);
            continue;
          }

          if (escalationUsers && escalationUsers.length > 0) {
            console.log(`[cron/notification-processor] Escalating "${notif.title}" - ${escalationUsers.length} user(s) past deadline`);

            // Mark as escalated (escalation_level = 2, escalated_at = now)
            const escUserNotifIds = escalationUsers.map((u: any) => u.id);
            const { error: escUpdateError } = await serviceClient
              .from('user_notifications')
              .update({
                escalation_level: 2,
                escalated_at: now.toISOString(),
              })
              .in('id', escUserNotifIds);

            if (escUpdateError) {
              console.error(`[cron/notification-processor] Error updating escalation for ${notif.id}:`, escUpdateError);
              results.errors.push(`Escalation update error for ${notif.id}: ${escUpdateError.message}`);
            }

            // Send escalation push to HODs (users with hod/principal/super_admin roles)
            const hodRoles = ['hod', 'principal', 'super_admin', 'dean'];
            const { data: hodProfiles, error: hodError } = await serviceClient
              .from('profiles')
              .select('id')
              .in('role', hodRoles)
              .eq('is_active', true);

            if (hodError) {
              console.error(`[cron/notification-processor] Error fetching HOD profiles:`, hodError);
              results.errors.push(`HOD fetch error: ${hodError.message}`);
            } else if (hodProfiles && hodProfiles.length > 0) {
              const hodIds = hodProfiles.map((p: any) => p.id);
              const escalationsSent = await sendPushToUsers(
                serviceClient,
                hodIds,
                {
                  title: `Escalation: ${notif.title}`,
                  body: `${escalationUsers.length} user(s) have not acknowledged this mandatory notification past the deadline.`,
                  icon: '/icons/icon-192x192.png',
                  url: '/notifications/admin',
                  data: { notification_id: notif.id, type: 'escalation' },
                }
              );

              results.escalations_processed += escalationsSent;
              console.log(`[cron/notification-processor] Escalation push sent to ${escalationsSent} HOD subscription(s)`);
            }
          }
        }
      } catch (notifProcessError) {
        const errMsg = notifProcessError instanceof Error ? notifProcessError.message : String(notifProcessError);
        console.error(`[cron/notification-processor] Error processing notification ${notif.id}:`, notifProcessError);
        results.errors.push(`Processing error for ${notif.id}: ${errMsg}`);
      }
    }

    // ----------------------------------------------------------------
    // Step 3 (2026-09-16): the reporter's "is this fixed for you?" questions.
    //   ruling 8 — drop rows whose reporter is gone/disabled (no signal)
    //   E4      — release questions queued by the 3-at-a-time cap
    //   ruling 3 — ONE push reminder at fix live + 14 days, never repeated
    //             (reminded_at stamps it). The blocking screen itself is the
    //             ask; this is only the nudge for someone who has not signed in.
    // ----------------------------------------------------------------
    try {
      const svc = serviceClient as any;
      const { data: dropRes, error: dropErr } = await svc.rpc('fn_bug_feedback_drop_gone_reporters');
      if (dropErr) {
        results.errors.push(`Bug-feedback drop sweep error: ${dropErr.message}`);
      } else {
        results.bug_feedback_dropped = Number(dropRes?.dropped ?? 0);
      }

      // Ruling 4 (18 Sep): a shown "is this still happening?" prompt left
      // unanswered for its 14 days closes its report, with a note.
      const { data: silenceRes, error: silenceErr } = await svc.rpc('fn_bug_still_open_expire');
      if (silenceErr) {
        results.errors.push(`Bug still-open silence sweep error: ${silenceErr.message}`);
      } else if (silenceRes?.success === false) {
        results.errors.push(`Bug still-open silence sweep refused: ${silenceRes?.error ?? 'unknown'}`);
      } else {
        results.bug_feedback_still_open_expired = Number(silenceRes?.expired ?? 0);
        results.bug_feedback_still_open_closed = Number(silenceRes?.closed ?? 0);
      }

      const { data: queuedReporters, error: queuedErr } = await svc
        .from('bug_fix_feedback_requests')
        .select('reporter_user_id')
        .eq('status', 'pending_send')
        .limit(200);
      if (queuedErr) {
        results.errors.push(`Bug-feedback queued fetch error: ${queuedErr.message}`);
      } else {
        const reporters = Array.from(new Set((queuedReporters ?? []).map((r: any) => r.reporter_user_id).filter(Boolean)));
        for (const reporterId of reporters) {
          const { data: released, error: relErr } = await svc.rpc('fn_bug_feedback_release_queued', {
            p_reporter_user_id: reporterId,
          });
          if (relErr) results.errors.push(`Bug-feedback release error for a reporter: ${relErr.message}`);
          else results.bug_feedback_released += Number(released ?? 0);
        }
      }

      const nowIso = now.toISOString();
      const { data: dueReminders, error: remErr } = await svc
        .from('bug_fix_feedback_requests')
        .select('id, reporter_user_id, bug_reports:bug_id (display_id)')
        .in('status', ['sent', 'delivered'])
        .lte('remind_at', nowIso)
        .is('reminded_at', null)
        .gt('expires_at', nowIso)
        .limit(200);
      if (remErr) {
        results.errors.push(`Bug-feedback reminder fetch error: ${remErr.message}`);
      } else if (dueReminders && dueReminders.length > 0) {
        for (const row of dueReminders as any[]) {
          const displayId = row.bug_reports?.display_id ?? 'a bug you reported';
          const sent = await sendPushToUsers(serviceClient, [row.reporter_user_id], {
            title: `Is ${displayId} fixed for you?`,
            body: 'A problem you reported was fixed two weeks ago. Sign in and tap Fixed or Not fixed — it takes one second and keeps the fixes honest.',
            icon: '/icons/icon-192x192.png',
            url: '/my-bug-reports',
            data: { request_id: row.id, type: 'bug_feedback_reminder' },
          });
          results.bug_feedback_reminders += sent;
          // Stamp regardless of push success: the reminder is offered once.
          // (No push subscription = nothing to remind through; the blocking
          // screen still asks on the next sign-in.)
          const { error: stampErr } = await svc
            .from('bug_fix_feedback_requests')
            .update({ reminded_at: nowIso, updated_at: nowIso })
            .eq('id', row.id)
            .is('reminded_at', null); // two overlapping runs may pick the same row; only one stamps it (deep review #10)
          if (stampErr) results.errors.push(`Bug-feedback reminder stamp error: ${stampErr.message}`);
        }
      }
    } catch (bugFeedbackError) {
      const errMsg = bugFeedbackError instanceof Error ? bugFeedbackError.message : String(bugFeedbackError);
      console.error('[cron/notification-processor] Bug-feedback step failed:', bugFeedbackError);
      results.errors.push(`Bug-feedback step error: ${errMsg}`);
    }

    console.log(`[cron/notification-processor] Complete. Reminders: ${results.reminders_sent}, Escalations: ${results.escalations_processed}, Bug-feedback reminders: ${results.bug_feedback_reminders}, Errors: ${results.errors.length}`);

    return NextResponse.json({
      ...results,
      notifications_checked: mandatoryNotifs?.length ?? 0,
      duration_ms: Date.now() - startTime,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[cron/notification-processor] Fatal error:', error);
    results.errors.push(`Fatal error: ${errMsg}`);
    return NextResponse.json({
      ...results,
      duration_ms: Date.now() - startTime,
    }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// Helper: Send push notifications to a list of user IDs
// Returns the number of successfully sent pushes
// ----------------------------------------------------------------
async function sendPushToUsers(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  userIds: string[],
  payload: {
    title: string;
    body: string;
    icon: string;
    url: string;
    data: Record<string, unknown>;
  }
): Promise<number> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn('[cron/notification-processor] VAPID keys not configured - skipping push');
    return 0;
  }

  if (userIds.length === 0) return 0;

  // Drop anyone who switched push off before looking up any subscription.
  // is_active alone cannot carry that answer: unsubscribing destroys the browser
  // endpoint, so the next page load mints a NEW row that is is_active=true and
  // passes the filter below perfectly.
  const pushUserIds = await filterPushRecipients(serviceClient, userIds);
  if (pushUserIds.length === 0) return 0;

  const { data: subscriptions, error: subError } = await serviceClient
    .from('push_subscriptions')
    .select('id, subscription, user_id')
    .in('user_id', pushUserIds)
    .eq('is_active', true);

  if (subError) {
    console.error('[cron/notification-processor] Error fetching push subscriptions:', subError);
    return 0;
  }

  if (!subscriptions || subscriptions.length === 0) {
    console.log('[cron/notification-processor] No push subscriptions found for target users');
    return 0;
  }

  const pushPayload = JSON.stringify(payload);
  let sent = 0;

  const pushPromises = subscriptions.map(async (sub: any) => {
    try {
      await webpush.sendNotification(sub.subscription, pushPayload);
      sent++;
    } catch (error: any) {
      // Remove stale subscriptions (410 Gone or 404 Not Found)
      if (error.statusCode === 410 || error.statusCode === 404) {
        console.log(`[cron/notification-processor] Removing stale subscription ${sub.id} (${error.statusCode})`);
        await serviceClient
          .from('push_subscriptions')
          .delete()
          .eq('id', sub.id);
      } else {
        console.error(`[cron/notification-processor] Push failed for subscription ${sub.id}:`, error.statusCode || error.message);
      }
    }
  });

  await Promise.allSettled(pushPromises);
  return sent;
}

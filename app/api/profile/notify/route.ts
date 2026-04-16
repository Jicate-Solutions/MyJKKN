export const dynamic = 'force-dynamic';

// app/api/profile/notify/route.ts
// Server route for dispatching in-app notifications on profile events.
// Auth: x-api-key (header) — internal service calls only.
//
// Events handled:
//   verification_submitted   → notify admin/verifier that a user needs review
//   verification_completed   → notify user that their verification was approved
//   profile_change_requested → notify approver that a change request is pending
//   profile_change_decided   → notify user of approve/reject decision
//
// Uses the core notifications + user_notifications tables (see
// supabase/migrations/20250930000007_create_notification_tables.sql).
// Never modifies types/notification.ts or notification service internals.

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { ProfileEventType, ProfileNotifyRequest, ProfileNotifyResponse } from '@/types/profile';

const VALID_API_KEY = process.env.PROFILE_NOTIFY_API_KEY;

// ─── Dispatch helper ──────────────────────────────────────────────────────────

/**
 * Insert one notification row and link it to all target users.
 * Matches the pattern from app/api/work-pulse/notify/route.ts.
 *
 * type     → must be one of: info | success | warning | error | reminder
 * category → must be one of: reservation | approval | maintenance | resource | system
 */
async function createNotification(
  supabase: ReturnType<typeof createServiceRoleClient>,
  title: string,
  message: string,
  userIds: string[],
  metadata: Record<string, unknown> = {},
  opts?: {
    notificationType?: string;
    category?: string;
    priority?: string;
    actionUrl?: string;
    actionLabel?: string;
  }
): Promise<number> {
  if (userIds.length === 0) return 0;

  const { data: notification, error } = await supabase
    .from('notifications')
    .insert({
      type: opts?.notificationType ?? 'info',
      category: opts?.category ?? 'approval',
      priority: opts?.priority ?? 'normal',
      title,
      message,
      metadata: { source: 'profile_notify', ...metadata },
      action_url: opts?.actionUrl,
      action_label: opts?.actionLabel,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[profile/notify] Failed to insert notification:', error);
    return 0;
  }

  if (!notification) return 0;

  const links = userIds.map((uid) => ({
    notification_id: notification.id,
    user_id: uid,
  }));

  const { error: linkError } = await supabase.from('user_notifications').insert(links);
  if (linkError) {
    console.error('[profile/notify] Failed to link notification to users:', linkError);
  }

  return userIds.length;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  await connection();

  // Auth: x-api-key only (internal/cron)
  const apiKey = request.headers.get('x-api-key');
  if (!VALID_API_KEY || apiKey !== VALID_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const eventType = searchParams.get('type') as ProfileEventType | null;

  if (!eventType) {
    return NextResponse.json({ error: 'Missing ?type= parameter' }, { status: 400 });
  }

  const validTypes: ProfileEventType[] = [
    'verification_submitted',
    'verification_completed',
    'profile_change_requested',
    'profile_change_decided',
  ];

  if (!validTypes.includes(eventType)) {
    return NextResponse.json(
      { error: `Unknown event type: ${eventType}. Valid: ${validTypes.join(', ')}` },
      { status: 400 }
    );
  }

  let body: ProfileNotifyRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.user_ids || body.user_ids.length === 0) {
    return NextResponse.json({ error: 'user_ids array is required and must not be empty' }, { status: 400 });
  }

  if (body.user_ids.length > 100) {
    return NextResponse.json({ error: 'user_ids must not exceed 100 per call' }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();

    switch (eventType) {
      case 'verification_submitted':
        return await handleVerificationSubmitted(supabase, body);
      case 'verification_completed':
        return await handleVerificationCompleted(supabase, body);
      case 'profile_change_requested':
        return await handleProfileChangeRequested(supabase, body);
      case 'profile_change_decided':
        return await handleProfileChangeDecided(supabase, body);
      default:
        return NextResponse.json({ error: `Unhandled event: ${eventType}` }, { status: 400 });
    }
  } catch (error) {
    console.error(`[profile/notify/${eventType}]`, error);
    return NextResponse.json(
      { error: 'Notification dispatch failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── Event Handlers ───────────────────────────────────────────────────────────

/**
 * Event: verification_submitted
 * User just submitted an identity/KYC/document verification.
 * Notify the admin/verifier user(s) that a submission awaits review.
 */
async function handleVerificationSubmitted(
  supabase: ReturnType<typeof createServiceRoleClient>,
  body: ProfileNotifyRequest
) {
  const actionUrl = body.learner_id
    ? `/learners/my-profile/status`
    : '/learners/profiles';

  const count = await createNotification(
    supabase,
    'Profile Verification Pending Review',
    'A learner has submitted a profile verification request. Please review and take action.',
    body.user_ids,
    {
      event_type: 'verification_submitted',
      request_id: body.request_id,
      learner_id: body.learner_id,
    },
    {
      notificationType: 'info',
      category: 'approval',
      priority: 'normal',
      actionUrl,
      actionLabel: 'Review Verification',
    }
  );

  const response: ProfileNotifyResponse = { notified: count, event: 'verification_submitted' };
  return NextResponse.json(response);
}

/**
 * Event: verification_completed
 * Admin approved the verification.
 * Notify the learner that their profile has been verified.
 */
async function handleVerificationCompleted(
  supabase: ReturnType<typeof createServiceRoleClient>,
  body: ProfileNotifyRequest
) {
  const actionUrl = body.learner_id
    ? `/learners/my-profile/status/${body.request_id ?? ''}`
    : '/learners/my-profile';

  const count = await createNotification(
    supabase,
    'Profile Verification Approved',
    'Your profile verification has been reviewed and approved. Your profile is now verified.',
    body.user_ids,
    {
      event_type: 'verification_completed',
      request_id: body.request_id,
      learner_id: body.learner_id,
    },
    {
      notificationType: 'success',
      category: 'approval',
      priority: 'normal',
      actionUrl,
      actionLabel: 'View Profile',
    }
  );

  const response: ProfileNotifyResponse = { notified: count, event: 'verification_completed' };
  return NextResponse.json(response);
}

/**
 * Event: profile_change_requested
 * User submitted a profile field change request (name, phone, photo, etc.).
 * Notify the approver(s) that a change request needs a decision.
 */
async function handleProfileChangeRequested(
  supabase: ReturnType<typeof createServiceRoleClient>,
  body: ProfileNotifyRequest
) {
  const fieldsSummary =
    body.fields_summary && body.fields_summary.length > 0
      ? body.fields_summary.join(', ')
      : 'profile fields';

  const actionUrl = body.request_id
    ? `/learners/my-profile/status/${body.request_id}`
    : '/learners/profiles';

  const count = await createNotification(
    supabase,
    'Profile Change Request Submitted',
    `A learner has requested changes to: ${fieldsSummary}. Please review and approve or reject.`,
    body.user_ids,
    {
      event_type: 'profile_change_requested',
      request_id: body.request_id,
      learner_id: body.learner_id,
      fields_summary: body.fields_summary,
    },
    {
      notificationType: 'info',
      category: 'approval',
      priority: 'normal',
      actionUrl,
      actionLabel: 'Review Request',
    }
  );

  const response: ProfileNotifyResponse = { notified: count, event: 'profile_change_requested' };
  return NextResponse.json(response);
}

/**
 * Event: profile_change_decided
 * Approver has made a decision (approved or rejected).
 * Notify the learner of the outcome.
 */
async function handleProfileChangeDecided(
  supabase: ReturnType<typeof createServiceRoleClient>,
  body: ProfileNotifyRequest
) {
  const decision = body.decision ?? 'approved';
  const isApproved = decision === 'approved';

  const title = isApproved
    ? 'Profile Change Request Approved'
    : 'Profile Change Request Rejected';

  const message = isApproved
    ? `Your profile change request has been approved. Your profile has been updated.`
    : `Your profile change request was rejected.${
        body.rejection_reason ? ` Reason: ${body.rejection_reason}` : ' Please contact your institution for details.'
      }`;

  const actionUrl = body.request_id
    ? `/learners/my-profile/status/${body.request_id}`
    : '/learners/my-profile';

  const count = await createNotification(
    supabase,
    title,
    message,
    body.user_ids,
    {
      event_type: 'profile_change_decided',
      request_id: body.request_id,
      learner_id: body.learner_id,
      decision,
      rejection_reason: body.rejection_reason,
    },
    {
      notificationType: isApproved ? 'success' : 'warning',
      category: 'approval',
      priority: isApproved ? 'normal' : 'high',
      actionUrl,
      actionLabel: 'View Details',
    }
  );

  const response: ProfileNotifyResponse = { notified: count, event: 'profile_change_decided' };
  return NextResponse.json(response);
}

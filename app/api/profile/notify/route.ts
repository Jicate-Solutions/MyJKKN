export const dynamic = 'force-dynamic';

// app/api/profile/notify/route.ts
// In-app notification dispatch for the profile module.
// Follows the x-api-key pattern from app/api/work-pulse/notify/route.ts.
//
// Phase 1 (MVP) — explicit-payload contract. Handlers accept user IDs in the
// body rather than querying unknown verification tables. This lets future
// integrators wire these events without assuming any particular schema.

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type {
  ProfileNotificationEventType,
  VerificationSubmittedPayload,
  VerificationCompletedPayload,
} from '@/types/profile';

const VALID_API_KEY = process.env.PROFILE_API_KEY;

/**
 * POST /api/profile/notify?type=<event_type>
 *
 * Auth: `x-api-key` header must equal `process.env.PROFILE_API_KEY`.
 * Body JSON — see @/types/profile for the exact shape per type.
 */
export async function POST(request: NextRequest) {
  await connection();

  const apiKey = request.headers.get('x-api-key');
  if (!VALID_API_KEY || apiKey !== VALID_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type') as ProfileNotificationEventType;

  if (!type) {
    return NextResponse.json({ error: 'Missing ?type= parameter' }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();
    const body = await request.json().catch(() => ({}));

    switch (type) {
      case 'verification_submitted':
        return await handleVerificationSubmitted(supabase, body as VerificationSubmittedPayload);
      case 'verification_completed':
        return await handleVerificationCompleted(supabase, body as VerificationCompletedPayload);
      default:
        return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }
  } catch (error) {
    console.error(`[profile/notify/${type}]`, error);
    return NextResponse.json(
      { error: 'Notification failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── Helper ─────────────────────────────────────────────────────────────

async function createNotification(
  supabase: ReturnType<typeof createServiceRoleClient>,
  title: string,
  body: string,
  userIds: string[],
  metadata: Record<string, unknown> = {}
): Promise<number> {
  if (userIds.length === 0) return 0;

  const { data: notification } = await supabase
    .from('notifications')
    .insert({
      type: 'profile',
      title,
      body,
      metadata: { source: 'profile_notify', ...metadata },
    })
    .select('id')
    .single();

  if (!notification) return 0;

  const links = userIds.map((uid) => ({
    notification_id: notification.id,
    user_id: uid,
  }));

  await supabase.from('user_notifications').insert(links);
  return userIds.length;
}

// ─── Handlers ───────────────────────────────────────────────────────────

async function handleVerificationSubmitted(
  supabase: ReturnType<typeof createServiceRoleClient>,
  body: VerificationSubmittedPayload
) {
  if (!body?.submitter_user_id || !body?.verifier_user_id) {
    return NextResponse.json(
      { error: 'Missing submitter_user_id or verifier_user_id' },
      { status: 400 }
    );
  }

  const vtype = body.verification_type || 'identity';
  const count = await createNotification(
    supabase,
    'New verification submitted',
    `A user has submitted ${vtype} verification for your review.`,
    [body.verifier_user_id],
    {
      submitter_user_id: body.submitter_user_id,
      verification_type: vtype,
      reference_id: body.reference_id,
    }
  );

  return NextResponse.json({ type: 'verification_submitted', notified: count });
}

async function handleVerificationCompleted(
  supabase: ReturnType<typeof createServiceRoleClient>,
  body: VerificationCompletedPayload
) {
  if (!body?.target_user_id || !body?.result) {
    return NextResponse.json(
      { error: 'Missing target_user_id or result' },
      { status: 400 }
    );
  }

  const vtype = body.verification_type || 'identity';
  const isApproved = body.result === 'approved';
  const title = isApproved ? 'Verification approved' : 'Verification needs attention';
  const reasonText = body.reason ? ` Reason: ${body.reason}.` : '';
  const message = isApproved
    ? `Your ${vtype} verification has been approved.`
    : `Your ${vtype} verification could not be approved.${reasonText}`;

  const count = await createNotification(
    supabase,
    title,
    message,
    [body.target_user_id],
    {
      result: body.result,
      verification_type: vtype,
      verifier_user_id: body.verifier_user_id,
      reason: body.reason,
    }
  );

  return NextResponse.json({ type: 'verification_completed', notified: count });
}

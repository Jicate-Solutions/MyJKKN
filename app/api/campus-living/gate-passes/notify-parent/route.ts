export const dynamic = 'force-dynamic';

/**
 * POST /api/campus-living/gate-passes/notify-parent
 *
 * Tells a learner's parent that the gate recorded a movement.
 *
 *   event: 'out'          → the learner has left campus on an approved pass
 *   event: 'late_return'  → the learner came back after their return time
 *
 * WHY THIS IS A SERVER ROUTE. The notifications INSERT policy is
 * `is_super_admin() OR is_admin(auth.uid())`. A gate_security user is
 * neither, so the guard's browser client cannot write a notification at all —
 * the insert is refused and (because createNotification's trailing .select()
 * calls fn_notification_is_for_user) the failure is not even legible. The
 * write therefore happens here under the service-role client, with the
 * caller's own permission checked first so the route is not an open relay.
 *
 * The gate write has ALREADY happened by the time this is called. Every
 * failure below is logged and swallowed into a 200-with-counts: a parent who
 * has no linked account must never make a gate look broken.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/services/notification/notification-service';
import {
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  NotificationType,
} from '@/types/notification';
import { logger } from '@/lib/utils/enhanced-logger';
import { formatClock, formatLateness, minutesLate } from '@/lib/services/campus-living/gate-scan-resolve';

const LOG = 'campus-living/gate-pass-notify';
const EDIT_PERMISSION = 'campus_living.gate_passes.edit';

type GateEvent = 'out' | 'late_return';

export async function POST(request: NextRequest) {
  // ── Caller must be signed in and hold the gate write permission ─────
  const session = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await session.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let allowed = false;
  try {
    const { data: isSuper } = await session.rpc('is_super_admin');
    if (isSuper === true) allowed = true;
  } catch {
    // fall through to the permission check
  }
  if (!allowed) {
    try {
      const { data, error } = await session.rpc('user_has_permission', {
        permission_name: EDIT_PERMISSION,
      });
      allowed = !error && data === true;
    } catch {
      allowed = false;
    }
  }
  if (!allowed) {
    return NextResponse.json(
      { error: 'You do not have permission to record gate movements.' },
      { status: 403 }
    );
  }

  // ── Input ───────────────────────────────────────────────────────────
  let body: { passId?: string; event?: GateEvent };
  try {
    body = (await request.json()) as { passId?: string; event?: GateEvent };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const passId = body.passId;
  const event: GateEvent = body.event === 'late_return' ? 'late_return' : 'out';
  if (!passId) {
    return NextResponse.json({ error: 'passId is required' }, { status: 400 });
  }

  const db = createServiceRoleClient();

  // ── The pass ────────────────────────────────────────────────────────
  const { data: passRow, error: passErr } = await db
    .from('hostel_gate_passes')
    .select('id, learner_id, destination, expected_return, actual_return, pass_number')
    .eq('id', passId)
    .maybeSingle();

  if (passErr || !passRow) {
    logger.error(LOG, 'gate pass not found for notification', { passId, error: passErr?.message });
    return NextResponse.json({ error: 'Gate pass not found' }, { status: 404 });
  }

  const pass = passRow as unknown as {
    id: string;
    learner_id: string;
    destination: string;
    expected_return: string;
    actual_return: string | null;
    pass_number: string;
  };

  // ── Who the learner is, for the message ─────────────────────────────
  const { data: learnerRow } = await db
    .from('profiles')
    .select('full_name')
    .eq('id', pass.learner_id)
    .maybeSingle();
  const learnerName = (learnerRow as { full_name: string | null } | null)?.full_name ?? 'Your ward';

  // ── Which accounts to notify ────────────────────────────────────────
  // parent_learner_links.learner_id is a profiles.id, matching
  // hostel_gate_passes.learner_id. parent_id -> parent_profiles.id ->
  // parent_profiles.user_id is the auth account a notification addresses.
  const { data: links } = await db
    .from('parent_learner_links')
    .select('parent_id')
    .eq('learner_id', pass.learner_id);

  const parentIds = ((links ?? []) as Array<{ parent_id: string | null }>)
    .map((l) => l.parent_id)
    .filter((v): v is string => Boolean(v));

  if (parentIds.length === 0) {
    logger.warn(LOG, 'no parent linked to learner — nothing to notify', {
      passId,
      learner_id: pass.learner_id,
    });
    return NextResponse.json({ ok: true, notified: 0, reason: 'no_parent_linked' });
  }

  const { data: parentProfiles } = await db
    .from('parent_profiles')
    .select('user_id')
    .in('id', parentIds);

  const userIds = Array.from(
    new Set(
      ((parentProfiles ?? []) as Array<{ user_id: string | null }>)
        .map((p) => p.user_id)
        .filter((v): v is string => Boolean(v))
    )
  );

  if (userIds.length === 0) {
    logger.warn(LOG, 'parent linked but has no login account', { passId });
    return NextResponse.json({ ok: true, notified: 0, reason: 'no_parent_account' });
  }

  // ── The message ─────────────────────────────────────────────────────
  const due = formatClock(pass.expected_return);
  const late = minutesLate(pass.expected_return, new Date(pass.actual_return ?? Date.now()));

  const title =
    event === 'out'
      ? `${learnerName} has left campus`
      : `${learnerName} returned late`;

  const message =
    event === 'out'
      ? `${learnerName} left the hostel gate for ${pass.destination}, due back by ${due}.`
      : `${learnerName} returned to the hostel — ${formatLateness(late)} against a ${due} return time.`;

  let notified = 0;
  for (const userId of userIds) {
    try {
      await createNotification(
        {
          user_id: userId,
          type: event === 'out' ? NotificationType.INFO : NotificationType.WARNING,
          category: NotificationCategory.SYSTEM,
          priority: event === 'out' ? NotificationPriority.NORMAL : NotificationPriority.HIGH,
          title,
          message,
          metadata: {
            reference_id: pass.id,
            reference_type: 'hostel_gate_pass',
            custom_data: {
              event,
              pass_number: pass.pass_number,
              destination: pass.destination,
              expected_return: pass.expected_return,
              late_by_minutes: event === 'late_return' ? late : 0,
            },
          },
          action_url: `/campus-living/gate-passes/${pass.id}`,
          action_label: 'View gate pass',
          channels: [NotificationChannel.IN_APP],
        },
        user.id,
        db
      );
      notified += 1;
    } catch (err) {
      // One parent failing must not stop the others, and must not 500 a gate
      // movement that has already been written.
      logger.error(LOG, 'parent notification failed', {
        passId,
        userId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // parent_notified is a fact about the exit, so only the exit sets it.
  if (event === 'out' && notified > 0) {
    const { error: flagErr } = await db
      .from('hostel_gate_passes')
      .update({ parent_notified: true })
      .eq('id', pass.id);
    if (flagErr) {
      logger.error(LOG, 'failed to flag parent_notified', { passId, error: flagErr.message });
    }
  }

  return NextResponse.json({ ok: true, notified });
}

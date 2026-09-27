// =====================================================================
// Walk-in agency claims — weekly note to the release owner and the Director
// =====================================================================
// Agency credits on walk-in enquiries are held out of the payment run until a
// human releases them (migration 20260909061500). Held = a
// consultant_lead_attributions row whose admission_leads.source is 'walk_in'
// and whose payout_cleared_at IS NULL. On 2026-09-27 352 were waiting, the
// oldest from 12 May, and none had ever been released.
//
// Director ruling 2026-09-27: the release owner (platform_policies
// admission.walkin_release.owner_user_id) and the people in
// admission.walkin_release.weekly_note_recipient_ids get one short note a week,
// by email AND by the in-app bell. Counts only — never a rupee amount.
//
// SCHEDULE: the AI-routine dispatcher (ai_routine_schedules row
// 'walkin-claims-weekly-note', Monday 09:15 IST, editable at /admin/ai-routines).
// NOT a vercel.json cron.
//
// ONCE A WEEK PER PERSON: each recipient's bell row carries
// notifications.idempotency_key walkin-claims-weekly-note:<ISO week>:<user>.
// The email is sent only when that row is freshly created, so a retry, a manual
// poke or a second dispatcher tick in the same week sends nothing. (Same gate as
// ai-tasks-sweep's runner-down alert; the Resend Idempotency-Key header is a
// provider-side backstop.)
//
// Auth: `Authorization: Bearer <CRON_SECRET>` only, constant-time. The
// dispatcher sends Bearer only.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import { resend } from '@/lib/resend';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  OWNER_POLICY_KEY,
  RECIPIENTS_POLICY_KEY,
  WALKIN_WORKLIST_PATH,
  buildWalkinClaimsNote,
  isoWeekKey,
  noteIdempotencyKey,
  resolveRecipients,
} from '@/lib/services/admission/walkin-claims-weekly-note';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const LOG_MODULE = 'admission';

function secretMatches(presented: string | null | undefined, secret: string): boolean {
  const a = Buffer.from(presented ?? '');
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isAuthorized(request: NextRequest, secret: string): boolean {
  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  return bearer !== null && secretMatches(bearer, secret);
}

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

async function readGlobalPolicy(svc: ServiceClient, key: string): Promise<unknown> {
  const { data, error } = await svc
    .from('platform_policies')
    .select('value')
    .eq('policy_key', key)
    .eq('scope_type', 'global')
    .is('scope_id', null)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(`policy ${key}: ${error.message}`);
  return (data as { value?: unknown } | null)?.value ?? null;
}

/** Walk-in attributions only: inner-join the enquiry and filter on its source. */
function walkinAttributions(svc: ServiceClient, columns: string, head = false) {
  return svc
    .from('consultant_lead_attributions')
    .select(`${columns}, admission_leads!inner(source)`, head ? { count: 'exact', head: true } : undefined)
    .eq('admission_leads.source', 'walk_in');
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !isAuthorized(request, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const svc = createServiceRoleClient();
  const now = new Date();
  const weekKey = isoWeekKey(now);

  // 1. Who gets it.
  let recipientsValue: unknown;
  let ownerValue: unknown;
  try {
    [recipientsValue, ownerValue] = await Promise.all([
      readGlobalPolicy(svc, RECIPIENTS_POLICY_KEY),
      readGlobalPolicy(svc, OWNER_POLICY_KEY),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(LOG_MODULE, '[walkin-claims-weekly-note] policy read failed', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  const recipients = resolveRecipients(recipientsValue, ownerValue);
  if (recipients.ownerMissing) {
    logger.warn(
      LOG_MODULE,
      `[walkin-claims-weekly-note] ${OWNER_POLICY_KEY} is missing or not a uuid — the release owner is skipped this week`,
    );
  }
  if (recipients.invalidEntries > 0) {
    logger.warn(
      LOG_MODULE,
      `[walkin-claims-weekly-note] ${recipients.invalidEntries} non-uuid entr(ies) ignored in ${RECIPIENTS_POLICY_KEY}`,
    );
  }
  if (recipients.userIds.length === 0) {
    logger.warn(LOG_MODULE, '[walkin-claims-weekly-note] no recipients configured — nothing sent');
    return NextResponse.json({
      ok: true,
      weekKey,
      sent: 0,
      reason: 'no recipients configured',
      ownerMissing: recipients.ownerMissing,
    });
  }

  // 2. The three numbers.
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [waitingRes, oldestRes, releasedRes] = await Promise.all([
    walkinAttributions(svc, 'id', true).is('payout_cleared_at', null),
    walkinAttributions(svc, 'created_at')
      .is('payout_cleared_at', null)
      .order('created_at', { ascending: true })
      .limit(1),
    walkinAttributions(svc, 'id', true).gte('payout_cleared_at', sevenDaysAgo),
  ]);
  const queryError = waitingRes.error ?? oldestRes.error ?? releasedRes.error;
  if (queryError) {
    logger.error(LOG_MODULE, '[walkin-claims-weekly-note] count query failed', queryError);
    return NextResponse.json({ ok: false, error: queryError.message }, { status: 500 });
  }
  const oldestRow = (oldestRes.data as unknown as Array<{ created_at: string | null }> | null)?.[0];
  const counts = {
    waiting: waitingRes.count ?? 0,
    oldestWaitingAt: oldestRow?.created_at ?? null,
    releasedLast7Days: releasedRes.count ?? 0,
  };
  const note = buildWalkinClaimsNote(counts);

  // 3. Email addresses for the email half.
  const { data: profiles, error: profilesError } = await svc
    .from('profiles')
    .select('id, email')
    .in('id', recipients.userIds);
  if (profilesError) {
    logger.warn(LOG_MODULE, '[walkin-claims-weekly-note] profile email lookup failed', profilesError);
  }
  const emailById = new Map<string, string>();
  for (const p of (profiles ?? []) as Array<{ id: string; email: string | null }>) {
    if (p.email && p.email.includes('@')) emailById.set(p.id, p.email);
  }
  const emailConfigured = Boolean(process.env.RESEND_API_KEY);

  // 4. One bell row per person per week; the email follows only a fresh row.
  const results: Array<Record<string, unknown>> = [];
  for (const userId of recipients.userIds) {
    const idempotencyKey = noteIdempotencyKey(weekKey, userId);
    try {
      const fanout = await fanoutNotification(svc, {
        title: note.subject,
        body: note.text,
        userIds: [userId],
        createdBy: userId,
        category: 'general',
        kind: 'work_item',
        priority: 'normal',
        idempotencyKey,
        url: WALKIN_WORKLIST_PATH,
        source: 'walkin-claims-weekly-note',
        metadata: { event: 'walkin_claims_weekly_note', week: weekKey, ...counts },
        // Weekly edition: expire just past next Monday so unread notes never stack.
        extraColumns: { expires_at: new Date(now.getTime() + 8 * 86_400_000).toISOString() },
      });

      if (fanout.skipped === 'idempotent') {
        results.push({ userId, bell: 'already-sent-this-week', email: 'skipped' });
        continue;
      }

      let email: string;
      const to = emailById.get(userId);
      if (!emailConfigured) {
        email = 'not-configured';
      } else if (!to) {
        email = 'no-address';
        logger.warn(LOG_MODULE, `[walkin-claims-weekly-note] no email address for ${userId}`);
      } else {
        try {
          const { error: sendError } = await resend.emails.send(
            { from: FROM_EMAIL, to, subject: note.subject, text: note.text, html: note.html },
            { headers: { 'Idempotency-Key': idempotencyKey } },
          );
          if (sendError) throw new Error(sendError.message);
          email = 'sent';
        } catch (emailErr) {
          email = 'failed';
          logger.error(LOG_MODULE, `[walkin-claims-weekly-note] email to ${userId} failed`, emailErr);
        }
      }
      results.push({ userId, bell: 'sent', email });
    } catch (err) {
      results.push({
        userId,
        bell: 'failed',
        email: 'skipped',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    weekKey,
    counts,
    subject: note.subject,
    ownerMissing: recipients.ownerMissing,
    recipients: recipients.userIds.length,
    results,
  });
}

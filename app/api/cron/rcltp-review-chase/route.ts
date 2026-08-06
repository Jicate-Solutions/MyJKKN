// =====================================================================
// RCLTP — one nightly chase for everything left unreviewed
// =====================================================================
// Director decisions 4 and 5 of 2026-07-28
// (specs/rcltp-access-decisions-2026-07-28.md), which together implement
// the Director's edge ruling 3 of 2026-07-25: ONE chasing system covering
// BOTH unapproved remedial reading plans AND unreviewed AI-drafted
// comprehension questions. Two half-systems is the exact failure that
// ruling exists to prevent, so one route sweeps both streams on one
// clock with one set of rules.
//
// WHAT IT DOES, PER ITEM, ONCE EACH IN ITS WHOLE LIFE
//   ~7 days untouched  → remind whoever may approve it, resolved by
//                        PERMISSION (never by role name).
//   ~14 days untouched → escalate to the head of that school, via the
//                        single resolver in lib/services/rcltp/notify-targets.ts.
//   …unless the escalation would land in an inbox the reminder already
//   reached, in which case it goes to system administrators instead
//   (decision 5). Overlap is detected by comparing resolved recipient ID
//   sets — today the head is the only person who can approve at the one
//   live school, so this fires, but the code never assumes that.
//
// NO NEW STATE. No table, no column, no migration. Ages come from
// created_at; "have we already said this?" is answered entirely by
// fanoutNotification's idempotencyKey, on which notifications carries a
// UNIQUE partial index. Run this route a hundred times in a day and each
// item still produces at most one reminder and at most one escalation.
//
// WHAT A FIRST RUN DOES. dueStage() returns exactly ONE stage per item
// and checks escalation first, so an item that is already three weeks old
// the first time this route ever runs receives the escalation alone — it
// never emits a backdated reminder and an escalation in the same breath.
// On the day this ships production holds one remedial plan at ~7 days
// (one reminder) and seven question drafts at ~5 days for a single
// passage (silent for another two nights), so the first live run sends
// exactly one message. CHASE_BATCH_CAP bounds any run that meets a larger
// backlog; nothing is dropped, because nothing is marked — the remainder
// is still due tomorrow.
//
// WHAT IT NEVER DOES. No AI call. It does not approve, edit, retire,
// re-draft or advance anything, and writes nothing except the
// notification rows fanoutNotification creates. Read-only over RCLTP data.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=`,
// constant-time, matching the sibling RCLTP cron. ?dry=1 reports what it
// WOULD send and sends nothing.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import {
  QUESTION_APPROVE_PERMISSIONS,
  REMEDIAL_PLAN_APPROVE_PERMISSIONS,
  buildChaseNotice,
  findPendingQuestionSets,
  findPendingRemedialPlans,
  resolveApprovers,
  resolveEscalationRecipients,
  type ChaseItem,
} from '@/lib/services/rcltp/review-chaser';

const SOURCE = 'rcltp-review-chase';
const CATEGORY = 'rcltp';

type Admin = ReturnType<typeof createServiceRoleClient>;

/** Constant-time secret compare — length mismatch short-circuits safely. */
function secretMatches(presented: string, secret: string): boolean {
  const a = Buffer.from(presented ?? '');
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface Outcome {
  item_id: string;
  stream: string;
  stage: string;
  age_days: number;
  pending: number;
  via: string;
  recipients: number;
  result: string;
}

/**
 * The reminder tier for an item, and — when the item has reached the
 * escalation line — decision 5's overlap test against that same tier.
 * The reminder set is always computed, even on the escalate path, because
 * it IS the "who has already been told" input decision 5 compares against.
 */
async function recipientsFor(
  admin: Admin,
  item: ChaseItem,
): Promise<{ userIds: string[]; via: string }> {
  const permissions =
    item.stream === 'questions'
      ? QUESTION_APPROVE_PERMISSIONS
      : REMEDIAL_PLAN_APPROVE_PERMISSIONS;

  const approvers = await resolveApprovers(admin, item.institutionId, permissions);
  if (item.stage === 'remind') {
    return { userIds: approvers, via: 'approvers' };
  }
  return resolveEscalationRecipients(admin, item.institutionId, approvers);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const querySecret = request.nextUrl.searchParams.get('secret') ?? '';
  if (!secretMatches(bearer, cronSecret) && !secretMatches(querySecret, cronSecret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const dry = request.nextUrl.searchParams.get('dry') === '1';
  const admin = createServiceRoleClient();
  const now = Date.now();

  const summary = {
    due: 0,
    reminded: 0,
    escalated: 0,
    already_sent: 0,
    no_recipients: 0,
    errors: 0,
  };
  const outcomes: Outcome[] = [];

  let items: ChaseItem[] = [];
  try {
    const [questions, plans] = await Promise.all([
      findPendingQuestionSets(admin, now),
      findPendingRemedialPlans(admin, now),
    ]);
    items = [...questions, ...plans];
  } catch (e) {
    console.error('[rcltp-review-chase] scan failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'scan failed' }, { status: 500 });
  }
  summary.due = items.length;

  for (const item of items) {
    try {
      const { userIds, via } = await recipientsFor(admin, item);
      const base = {
        item_id: item.itemId,
        stream: item.stream,
        stage: item.stage,
        age_days: item.ageDays,
        pending: item.pendingCount,
        via,
        recipients: userIds.length,
      };

      if (userIds.length === 0) {
        // Unreachable in practice — the escalation tier ends at system
        // administrators. Log loudly rather than swallow it: a silent
        // drop here is the exact failure decision 4 was taken to end.
        summary.no_recipients++;
        console.error('[rcltp-review-chase] no recipient resolved for', item.stream, item.itemId);
        outcomes.push({ ...base, result: 'no_recipients' });
        continue;
      }

      if (dry) {
        // Read-only, and deliberately more than a short-circuit: look the key
        // up so a dry run reports what the real run WOULD do, including
        // "nothing, this was already said". Without this, ?dry=1 could not
        // distinguish a fresh item from one already notified, and would be a
        // useless way to check the dedupe.
        const notice = buildChaseNotice(item);
        const { data: existing } = await admin
          .from('notifications')
          .select('id')
          .eq('idempotency_key', notice.idempotencyKey)
          .maybeSingle();
        if (existing?.id) {
          summary.already_sent++;
          outcomes.push({ ...base, result: 'already_sent' });
        } else {
          outcomes.push({ ...base, result: 'would_send' });
        }
        continue;
      }

      const notice = buildChaseNotice(item);
      const outcome = await fanoutNotification(admin, {
        title: notice.title,
        body: notice.body,
        url: notice.url,
        userIds,
        // A cron-emitted item a person must act on — 'work_item' keeps it
        // out of the /notifications/admin announcement surface.
        kind: 'work_item',
        priority: item.stage === 'escalate' ? 'high' : 'normal',
        category: CATEGORY,
        idempotencyKey: notice.idempotencyKey,
        metadata: { ...notice.metadata, recipient_path: via },
        source: SOURCE,
      });

      if (outcome.skipped === 'idempotent') {
        summary.already_sent++;
        outcomes.push({ ...base, result: 'already_sent' });
      } else if (outcome.notified > 0) {
        if (item.stage === 'escalate') summary.escalated++;
        else summary.reminded++;
        outcomes.push({ ...base, result: 'sent' });
      } else {
        summary.errors++;
        console.error(
          '[rcltp-review-chase] fanout delivered nothing:',
          item.itemId,
          outcome.skipped ?? 'no notification row returned',
        );
        outcomes.push({ ...base, result: 'delivered_nothing' });
      }
    } catch (e) {
      summary.errors++;
      console.error(
        '[rcltp-review-chase] item failed:',
        item.itemId,
        e instanceof Error ? e.message : e,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    dry_run: dry,
    ...summary,
    items: outcomes,
  });
}

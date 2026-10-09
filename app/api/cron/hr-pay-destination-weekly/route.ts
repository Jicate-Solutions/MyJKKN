export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * HR — weekly list of bank-account and paying-trust changes (Monday 08:17 IST
 * via the AI-routine dispatcher row 'hr-pay-destination-weekly').
 *
 * Director ruling, 1 Oct 2026: the HR head may change where a person's pay
 * goes, and every such change goes on a weekly list to the Director list.
 * The log is kept by triggers (hr_pay_destination_changes, migration
 * 20270614090000); this route sends one in-app notice to everyone on the
 * Director list, every Monday, even when nothing changed ("none" is an
 * answer, a silent week is not).
 *
 * Recipients come from the Director list itself
 * (platform.the_director_profile_ids), never from hard-coded addresses, so a
 * change to the list changes who gets this. An empty or unreadable list FAILS
 * the run (500), so the dispatcher's last_status shows it.
 *
 * Auth: CRON_SECRET as Authorization: Bearer only (what the dispatcher
 * sends), compared in constant time. No ?secret=: a secret in a query string
 * ends up in logs.
 */

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import {
  type PayDestinationChange,
  istWeekStart,
  totalChanges,
  weeklyNoticeBody,
  weeklyNoticeTitle,
} from '@/lib/hr/payroll/pay-destination-changes';

const DIRECTOR_LIST_KEY = 'platform.the_director_profile_ids';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();

  // Recipients: the Director list, read as the list itself.
  const { data: listRow, error: listErr } = await admin
    .from('platform_policies')
    .select('value, is_active')
    .eq('policy_key', DIRECTOR_LIST_KEY)
    .eq('scope_type', 'global')
    .is('scope_id', null)
    .maybeSingle();
  const ids: string[] =
    listRow && listRow.is_active === true && Array.isArray(listRow.value)
      ? (listRow.value as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];
  if (listErr || ids.length === 0) {
    return NextResponse.json(
      { ok: false, error: `Director list unreadable or empty: ${listErr?.message ?? 'no ids'}`, sent: 0 },
      { status: 500 },
    );
  }

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await (admin as any).rpc('fn_hr_pay_destination_changes', { p_since: since });
  if (error) {
    return NextResponse.json({ ok: false, error: `change list failed: ${error.message}`, sent: 0 }, { status: 500 });
  }
  const changes = (data ?? []) as PayDestinationChange[];
  // The list stops at 2,000 rows; the notice states the true count.
  const total = totalChanges(changes);

  const weekStart = istWeekStart();
  const outcome = await fanoutNotification(admin, {
    title: weeklyNoticeTitle(total),
    body: weeklyNoticeBody(changes, 6, total),
    userIds: ids,
    createdBy: ids[0],
    category: 'hr',
    kind: 'work_item',
    priority: total > 0 ? 'high' : 'normal',
    idempotencyKey: `hr-pay-destination-weekly:${weekStart}`,
    url: '/hr/payroll/salaries#pay-destination-changes',
    source: 'hr-pay-destination-weekly',
    metadata: { weekStart, count: total },
    // Weekly edition: expires just past the next Monday so editions never stack.
    extraColumns: { expires_at: new Date(Date.now() + 8 * 86_400_000).toISOString() },
  });

  return NextResponse.json({
    ok: true,
    weekStart,
    count: total,
    listed: changes.length,
    sent: outcome.notified,
    skipped: outcome.skipped ? 1 : 0,
  });
}

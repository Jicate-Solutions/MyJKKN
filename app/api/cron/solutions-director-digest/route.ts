export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Solutions Hub — weekly Director digest (Monday 08:07 IST via the AI-routine
 * dispatcher row 'solutions-director-digest'; the 15-min claim slot means it
 * fires in the 08:00–08:15 window).
 *
 * The hub reports itself: pipeline by stage, proposals (once that parallel
 * lane ships its table), client-linked project delivery, quiet clients,
 * payment totals and last-7-day communications — computed by the SAME
 * lib/solutions/digest.ts the /solutions/digest page uses, so the card and
 * the page can never disagree.
 *
 * Recipients: the Director (director@jkkn.ac.in) + Mohanraj V
 * (mohanraj_v@jkkn.ac.in), both resolved from profiles BY EMAIL at runtime —
 * never by hardcoded uuid: the previously circulated 18f56a8d… id is a
 * team-member record id from a different table, and notifications need
 * profiles.id (a silently wrong uuid delivers to nobody with no error).
 *
 * Idempotent per IST week (idempotency key embeds the Monday date), and the
 * card expires just past the next edition per the 2026-08-10 notification-
 * expiry ruling — weekly editions must not pile up unread.
 *
 * Auth: CRON_SECRET via Authorization: Bearer (what the dispatcher sends),
 * ?secret= or x-vercel-cron. NOT in vercel.json — crons there are capped at
 * the hard 100 limit.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { computeSolutionsDigest } from '@/lib/solutions/digest';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

const RECIPIENT_EMAILS = ['director@jkkn.ac.in', 'mohanraj_v@jkkn.ac.in'];

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true;
  if (req.nextUrl.searchParams.get('secret') === secret) return true;
  if (req.headers.get('x-vercel-cron')) return true;
  return false;
}

/** Monday (YYYY-MM-DD) of the current IST week — the edition's identity. */
function istWeekStart(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const dow = ist.getUTCDay(); // 0=Sun..6=Sat in shifted time = IST weekday
  const daysSinceMonday = (dow + 6) % 7;
  ist.setUTCDate(ist.getUTCDate() - daysSinceMonday);
  return ist.toISOString().slice(0, 10);
}

const fmtINR = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const digest = await computeSolutionsDigest(admin);

  // Resolve recipients by email — count failures instead of swallowing them.
  const { data: recipients, error: recErr } = await admin
    .from('profiles')
    .select('id, email')
    .in('email', RECIPIENT_EMAILS);
  if (recErr || !recipients?.length) {
    // Recipient lookup failing must FAIL the run so the dispatcher's
    // last_status shows it — not silently fan out to nobody.
    return NextResponse.json(
      { ok: false, error: `recipient lookup failed: ${recErr?.message ?? 'no profiles matched'}`, sent: 0 },
      { status: 500 },
    );
  }
  const unresolved = RECIPIENT_EMAILS.filter((e) => !recipients.some((r) => r.email === e));

  // createdBy convention for crons: the first super-admin profile.
  const { data: superAdmin } = await admin
    .from('profiles')
    .select('id')
    .eq('is_super_admin', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const won = digest.pipelineByStage['won'] ?? 0;
  const negotiation = digest.pipelineByStage['negotiation'] ?? 0;
  const proposalStage = digest.pipelineByStage['proposal'] ?? 0;
  const overdueMilestones = digest.clientProjects.reduce((a, p) => a + p.overdueMilestones, 0);
  const pendingPayments = digest.paymentsByStatus['pending'];

  const bodyParts = [
    `Pipeline ${digest.prospectCount} active (${proposalStage} proposal, ${negotiation} negotiation, ${won} won)`,
    `${digest.clientProjects.length} client-linked project${digest.clientProjects.length === 1 ? '' : 's'}${overdueMilestones ? ` · ${overdueMilestones} overdue milestone${overdueMilestones === 1 ? '' : 's'}` : ''}`,
    `${digest.quietClients.length} client${digest.quietClients.length === 1 ? '' : 's'} quiet >14d`,
    pendingPayments ? `${fmtINR(pendingPayments.amount)} pending (${pendingPayments.count})` : null,
    `${digest.commsLast7d} communication${digest.commsLast7d === 1 ? '' : 's'} this week`,
    digest.proposals.available ? `${digest.proposals.count} proposal${digest.proposals.count === 1 ? '' : 's'}` : null,
  ].filter(Boolean);

  const weekStart = istWeekStart();
  const outcome = await fanoutNotification(admin, {
    title: `📊 Solutions weekly digest — week of ${weekStart}`,
    body: bodyParts.join(' · '),
    userIds: recipients.map((r) => r.id),
    createdBy: superAdmin?.id,
    category: 'solutions',
    kind: 'work_item',
    priority: 'normal',
    idempotencyKey: `solutions-digest:${weekStart}`,
    url: '/solutions/digest',
    source: 'solutions-director-digest',
    metadata: { weekStart, sectionErrors: digest.errors },
    // Weekly edition: expire just past the next Monday so unread editions
    // never stack (8 days).
    extraColumns: { expires_at: new Date(Date.now() + 8 * 86_400_000).toISOString() },
  });

  return NextResponse.json({
    ok: true,
    sent: outcome.notified,
    skipped: outcome.skipped ? 1 : 0,
    count: digest.clientProjects.length,
    quietClients: digest.quietClients.length,
    unresolvedRecipients: unresolved.length,
    unresolved,
    sectionErrors: digest.errors,
    weekStart,
  });
}

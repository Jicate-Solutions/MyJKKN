// app/api/schools-network/visit-nudges/cron/route.ts
// ============================================================================
// GET /api/schools-network/visit-nudges/cron
//
// Daily nudge for assigned outreach coordinators. For every school that is
// (a) assigned, (b) nudge-eligible — slipping in the feeder ranking
// (cycle_delta < 0) OR not visited in 60+ days / never (BOTH triggers), and
// (c) not yet done (needs a logged visit AND a follow-up contribution), fire
// ONE in-app notification to the assigned coordinator via the canonical
// fanoutNotification two-write (notifications row + user_notifications fanout).
//
// De-dupe: the candidate RPC only returns schools whose last_nudged_at is NULL
// or older than the 7-day realert window; we stamp last_nudged_at after firing
// so a still-slipping school isn't re-nudged for another week. An
// idempotencyKey (school + date) is belt-and-suspenders against a same-day
// double-run.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` (Vercel cron) OR
//   `?secret=` (manual runs). Mirrors /api/cron/ai-tasks-sweep.
// ============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

const REALERT_DAYS = 7;
const WORKLIST_URL = '/admission/schools-network/worklist';

type Candidate = {
  school_id: string;
  school_name: string | null;
  assigned_to: string | null;
  cycle_delta: number | null;
  last_visit: string | null;
  reason: string;
};

function bodyFor(name: string, reason: string): string {
  const school = name || 'A school you own';
  switch (reason) {
    case 'slipping_and_overdue':
      return `${school} is slipping in the feeder ranking and hasn't had a visit in 60+ days. Log a visit and a follow-up contribution to close it out.`;
    case 'slipping':
      return `${school} is slipping in the feeder ranking. Plan a visit and log a follow-up contribution.`;
    default:
      return `${school} hasn't had a logged visit in 60+ days. Schedule a visit and log a follow-up contribution.`;
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const started = Date.now();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { data, error } = await admin.rpc('fn_schools_network_nudge_candidates', {
    p_realert_days: REALERT_DAYS,
  });
  if (error) {
    console.error('[visit-nudges] candidate query failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message, duration_ms: Date.now() - started },
      { status: 502 }
    );
  }

  const candidates = (Array.isArray(data) ? data : []) as Candidate[];
  let notified = 0;
  let skipped = 0;
  let failed = 0;
  let stamped = 0;
  let stampFailed = 0;

  for (const c of candidates) {
    if (!c.assigned_to) continue;
    try {
      const res = await fanoutNotification(admin, {
        title: 'A school you own needs a visit',
        body: bodyFor(c.school_name ?? '', c.reason),
        userIds: [c.assigned_to],
        createdBy: c.assigned_to,
        url: WORKLIST_URL,
        category: 'schools_network',
        kind: 'work_item',
        priority: c.reason === 'slipping_and_overdue' ? 'high' : 'normal',
        idempotencyKey: `sn_visit_nudge:${c.school_id}:${today}`,
        source: 'schools-network-visit-nudges',
        metadata: { school_id: c.school_id, reason: c.reason, cycle_delta: c.cycle_delta },
      });
      if (res.skipped === 'idempotent') skipped++;
      else notified++;
      // Stamp THIS school's realert window immediately, gated on ITS OWN send
      // succeeding. Per-candidate (not one bulk stamp at the end) so a single
      // stamp failure can't leave every other nudged school un-stamped and thus
      // re-nudged every run until the next successful bulk write.
      const { error: stampErr } = await admin
        .from('school_visit_assignments')
        .update({ last_nudged_at: new Date().toISOString() })
        .eq('school_id', c.school_id);
      if (stampErr) {
        stampFailed++;
        console.error(
          '[visit-nudges] last_nudged_at stamp failed for school',
          c.school_id,
          stampErr.message
        );
      } else {
        stamped++;
      }
    } catch (e) {
      // Genuine send failure → do NOT stamp, so the next run retries it.
      failed++;
      console.error(
        '[visit-nudges] fanout failed for school',
        c.school_id,
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  return NextResponse.json({
    // stampFailed>0 means some schools were notified but not stamped and will be
    // re-nudged next run — surface it as a non-ok run so it's visible in logs.
    ok: stampFailed === 0,
    data: {
      candidates: candidates.length,
      notified,
      skipped,
      failed,
      stamped,
      stampFailed,
      duration_ms: Date.now() - started,
    },
  });
}

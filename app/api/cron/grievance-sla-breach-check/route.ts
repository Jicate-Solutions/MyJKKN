// app/api/cron/grievance-sla-breach-check/route.ts
// ============================================================================
// PR-A6b — Hourly SLA breach checker.
//
// Scans grievance_tickets for rows whose sla_deadline is in the past and still
// haven't been flagged as breached. Sets sla_breached_at=NOW() and
// sla_status='breached' in bulk.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> OR ?secret= query param.
// Follows the pattern in app/api/cron/sync-inbound-calls/route.ts.
//
// Why Vercel cron (not pg_cron): MyJKKN convention — all scheduled jobs
// are HTTP endpoints at app/api/cron/* with CRON_SECRET auth, scheduled in
// vercel.json. pg_cron IS installed but the codebase uses Vercel cron.
// ============================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Auth: accept Bearer header OR ?secret= query (Vercel cron sends the header).
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');

  if (cronSecret) {
    const headerOk = authHeader === `Bearer ${cronSecret}`;
    const queryOk = querySecret === cronSecret;
    if (!headerOk && !queryOk) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createServiceRoleClient();

  try {
    // Two-phase approach:
    //  1. SELECT the breach-eligible tickets (to report counts per institution)
    //  2. UPDATE them in bulk
    const { data: eligible, error: selectError } = await supabase
      .from('grievance_tickets')
      .select('id, institution_id, ticket_number, sla_deadline')
      .in('status', ['open', 'in_progress', 'pending_info', 'reopened'])
      .is('sla_breached_at', null)
      .lt('sla_deadline', new Date().toISOString());

    if (selectError) {
      logger.error('grievance/cron/breach-check', 'Select failed', selectError);
      return NextResponse.json(
        { success: false, error: selectError.message },
        { status: 500 }
      );
    }

    const breachCount = eligible?.length ?? 0;

    if (breachCount === 0) {
      return NextResponse.json({
        success: true,
        breachedCount: 0,
        perInstitution: {},
        elapsedMs: Date.now() - startTime,
      });
    }

    const breachTs = new Date().toISOString();
    const breachIds = eligible!.map(t => t.id);

    const { error: updateError } = await supabase
      .from('grievance_tickets')
      .update({
        sla_breached_at: breachTs,
        sla_status: 'breached',
      })
      .in('id', breachIds);

    if (updateError) {
      logger.error('grievance/cron/breach-check', 'Update failed', updateError);
      return NextResponse.json(
        { success: false, error: updateError.message, breachedCount: 0 },
        { status: 500 }
      );
    }

    // Aggregate per-institution for the response
    const perInstitution: Record<string, number> = {};
    for (const t of eligible!) {
      perInstitution[t.institution_id] = (perInstitution[t.institution_id] ?? 0) + 1;
    }

    logger.warn('grievance/cron/breach-check', `Flagged ${breachCount} tickets as breached`, {
      perInstitution,
      sampleTickets: eligible!.slice(0, 5).map(t => t.ticket_number),
    });

    return NextResponse.json({
      success: true,
      breachedCount: breachCount,
      perInstitution,
      elapsedMs: Date.now() - startTime,
    });
  } catch (err) {
    logger.error('grievance/cron/breach-check', 'Unexpected error', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}

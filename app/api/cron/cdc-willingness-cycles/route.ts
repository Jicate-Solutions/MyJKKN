export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/cron/cdc-willingness-cycles
 *
 * Opens scheduled willingness cycles: every cdc_drive_willingness_cycles row
 * whose open_at has passed and whose notification is still pending gets its
 * one-per-cycle learner notification (bell + push). Cycles created with a
 * past open_at are dispatched inline by the API, so this only matters for
 * future-dated openings and reopenings.
 *
 * Auth: CRON_SECRET via ?secret= / Authorization: Bearer / x-vercel-cron
 * (matches the other crons).
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { dispatchDueCycles } from '@/lib/services/cdc/willingness-cycles';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.nextUrl.searchParams.get('secret') === secret) return true;
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true;
  if (req.headers.get('x-vercel-cron')) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const results = await dispatchDueCycles(createServiceRoleClient());
    return NextResponse.json({
      ok: true,
      dispatched: results.length,
      results: results.map((r) => ({
        cycle_no: r.cycle_no,
        notified: r.notify?.notified ?? 0,
        skipped: r.notify?.skipped ?? null,
        error: r.error ?? null,
      })),
    });
  } catch (err) {
    console.error('[cron/cdc-willingness-cycles] failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

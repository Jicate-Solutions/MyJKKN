// =====================================================================
// PDE Gaming-Defense Audit Cron — Tier 3, T3.4
// =====================================================================
// Nightly judgment-of-judgment sweep. Samples a configurable percentage
// (policy: `pde.governance.agency_gaming_defense.audit_sample_rate`,
// default 10%) of recently-validated `pde_demonstrations` and flags rows
// whose validator scoring diverges from the demonstration-weights policy
// beyond the suspect threshold.
//
// Service: `lib/services/pde-gaming-defense-service.ts`
// Storage: `sh_audit_logs` (action='pde.gaming_defense.flagged') — no
//          mutation of `pde_demonstrations` (informational flag only).
//
// Pattern reference: app/api/cron/ai-pulse-tick/route.ts (auth shape).
//
// Schedule: nightly via vercel.json (separate ops PR). Endpoint accepts
// Authorization: Bearer ${CRON_SECRET} OR ?secret=${CRON_SECRET}.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runGamingDefenseSweep } from '@/lib/services/pde-gaming-defense-service';

export async function GET(req: NextRequest) {
  // -- Auth: CRON_SECRET --------------------------------------------------
  const authHeader = req.headers.get('authorization') || '';
  const querySecret = req.nextUrl.searchParams.get('secret') || '';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 }
    );
  }

  const headerOk = authHeader === `Bearer ${cronSecret}`;
  const queryOk = querySecret === cronSecret;
  if (!headerOk && !queryOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  try {
    const metrics = await runGamingDefenseSweep(supabase);
    return NextResponse.json({ ok: true, metrics });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: 'Sweep failed', detail: message },
      { status: 500 }
    );
  }
}

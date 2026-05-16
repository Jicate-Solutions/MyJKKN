export const dynamic = 'force-dynamic';

// /api/cron/whatsapp-byow-bypass-detect
// Spec 3 H3.2: Weekly cron (Mondays 9am UTC). Runs the bypass detector and
// captures Sentry-warning for each flagged dept. Director's super_admin digest
// can later read the captured events; new digest surface is out-of-scope.
//
// Auth: Bearer CRON_SECRET (Vercel-provided in production).
// Spec: /Users/omm/PROJECTS/MyJKKN/specs/byow-platform-v2.md §8 H3.2

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { runBypassDetector } from '@/lib/services/whatsapp/whatsapp-bypass-detector';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  try {
    const supabase = getServiceClient();
    const summary = await runBypassDetector(supabase);

    // Sentry capture per flagged dept (warning level, not error — bypass is
    // a workflow signal, not a system fault). Director sees these in the
    // BYOW Sentry tag bucket alongside H1.4 stale alerts.
    for (const dept of summary.flagged) {
      Sentry.captureMessage(
        `BYOW bypass suspected: dept=${dept.department_id} ratio=${dept.ratio} (inbound=${dept.inbound_7d}, outbound=${dept.outbound_7d}) over 7d`,
        {
          level: 'warning',
          tags: { feature: 'byow', subtype: 'bypass_detected' },
          extra: dept,
        }
      );
    }

    const elapsedMs = Date.now() - start;
    return NextResponse.json({
      ok: true,
      elapsed_ms: elapsedMs,
      summary,
    });
  } catch (e) {
    Sentry.captureException(e, {
      tags: { feature: 'byow', subtype: 'bypass_detect_cron_failure' },
    });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 }
    );
  }
}

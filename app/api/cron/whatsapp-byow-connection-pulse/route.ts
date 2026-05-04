export const dynamic = 'force-dynamic';

// /api/cron/whatsapp-byow-connection-pulse
// Spec 3 H1.3: Every 5 min, pings each ready connection's Railway
// /clients/<client_id>/status endpoint, computes per-connection rolling health
// metrics from wa_personal_message_logs, detects stale connections, upserts
// wa_byow_connection_health, captures Sentry on newly-stale transitions (H1.4).
//
// Auth: Bearer CRON_SECRET (Vercel-provided in production).
// Spec: /Users/omm/PROJECTS/MyJKKN/specs/byow-platform-v2.md §8

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { runConnectionPulse } from '@/lib/services/whatsapp/whatsapp-connection-pulse';

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
    const summary = await runConnectionPulse(supabase);
    const elapsedMs = Date.now() - start;
    return NextResponse.json({
      ok: true,
      elapsed_ms: elapsedMs,
      summary,
    });
  } catch (e) {
    Sentry.captureException(e, {
      tags: { feature: 'byow', subtype: 'pulse_cron_failure' },
    });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 }
    );
  }
}

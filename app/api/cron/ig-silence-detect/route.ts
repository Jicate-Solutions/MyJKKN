export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/ig-silence-detect
 *
 * Daily silence-detect for connected Instagram accounts. Reads the
 * threshold from platform_policies (`ig.alert_dormant_after_days`,
 * default 30 days, same key as the existing seeded policy) and dispatches
 * an in-app notification per silent account (idempotent via
 * `notifications.idempotency_key`). Repeat alerts for a still-silent
 * account are rate-limited by `ig.silence_realert_days` (default 7):
 * first detection alerts immediately, then suppresses until N days after
 * that account's last silence alert. See lib/instagram/silence-detect.ts.
 *
 * Auth: Bearer CRON_SECRET (Vercel-injected). Registered in vercel.json
 * with the standard `?secret=${CRON_SECRET}` form.
 *
 * Mirrors the shape of /api/cron/ig-accounts-sync exactly — same auth
 * check, same svc() client, same JSON envelope. The 502 status code is
 * reserved for downstream DB failures; the 503 in the sibling route only
 * applies to a missing Meta token, which silence-detect does not need.
 */

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { runSilenceDetect } from '@/lib/instagram/silence-detect';

function svc(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  try {
    const outcome = await runSilenceDetect(svc());
    return NextResponse.json({
      success: true,
      data: { ...outcome, duration_ms: Date.now() - start },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ig-silence-detect] failed:', message);
    return NextResponse.json(
      {
        success: false,
        error: message,
        duration_ms: Date.now() - start,
      },
      { status: 502 }
    );
  }
}

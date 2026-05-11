export const dynamic = 'force-dynamic';

// /api/cron/whatsapp-byow-health
// Polls the Railway BYOW WhatsApp service /health endpoint every 15 min.
// On <wa_byow.health_failure_threshold> consecutive failures, auto-flips
// wa_byow.is_enabled to false and captures Sentry. Counter resets on first success.
// Spec: /Users/omm/PROJECTS/MyJKKN/specs/byow-whatsapp-revival.md (v4)

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import {
  getPolicyInt,
  getPolicyArray,
} from '@/lib/policies/get-policy';
import { POLICY_KEYS } from '@/lib/policies/keys';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceUrl = process.env.WHATSAPP_PERSONAL_SERVICE_URL;
  const apiKey = process.env.WHATSAPP_PERSONAL_API_KEY;
  if (!serviceUrl || !apiKey) {
    return NextResponse.json(
      { skipped: true, reason: 'BYOW env vars not set' },
      { status: 200 }
    );
  }

  const supabase = getServiceClient();
  const timeoutSec = await getPolicyInt(POLICY_KEYS.WA_BYOW_HEALTH_PROBE_TIMEOUT_SECONDS, 10);
  const threshold = await getPolicyInt(POLICY_KEYS.WA_BYOW_HEALTH_FAILURE_THRESHOLD, 3);
  const alertChannels = await getPolicyArray<string>(POLICY_KEYS.WA_BYOW_ALERT_CHANNELS, ['sentry']);

  // 1. Probe Railway /health
  const start = Date.now();
  let status: 'ok' | 'fail' = 'fail';
  let httpCode: number | null = null;
  let errorMsg: string | null = null;

  try {
    const resp = await fetch(`${serviceUrl}/health`, {
      headers: { 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(timeoutSec * 1000),
    });
    httpCode = resp.status;
    if (resp.ok) status = 'ok';
    else errorMsg = `HTTP ${resp.status}`;
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : 'unknown probe error';
  }

  const responseTimeMs = Date.now() - start;

  // 2. Compute consecutive failures since last success (server-side from log)
  const { data: recent } = await supabase
    .from('wa_byow_health_log')
    .select('status')
    .order('recorded_at', { ascending: false })
    .limit(50);

  let consecutiveFails = status === 'fail' ? 1 : 0;
  if (status === 'fail') {
    for (const row of recent ?? []) {
      if (row.status === 'fail') consecutiveFails++;
      else break;
    }
  }

  const shouldTrip = status === 'fail' && consecutiveFails >= threshold;

  // 3. Insert log row
  await supabase.from('wa_byow_health_log').insert({
    status,
    http_code: httpCode,
    response_time_ms: responseTimeMs,
    error_message: errorMsg,
    service_url: serviceUrl,
    triggered_disable: shouldTrip,
  });

  // 4. Auto-disable if threshold met
  if (shouldTrip) {
    await supabase
      .from('platform_policies')
      .update({ value: false })
      .eq('policy_key', POLICY_KEYS.WA_BYOW_IS_ENABLED)
      .eq('scope_type', 'global');

    if (alertChannels.includes('sentry')) {
      Sentry.captureMessage(
        `BYOW WhatsApp auto-disabled: ${consecutiveFails} consecutive health failures (threshold=${threshold})`,
        {
          level: 'error',
          tags: { feature: 'byow_whatsapp', event: 'auto_disable' },
          extra: { service_url: serviceUrl, last_error: errorMsg, response_time_ms: responseTimeMs },
        }
      );
    }
    // Email + WhatsApp alert channels deferred to follow-up PR (out of v4 scope).
  }

  return NextResponse.json({
    status,
    http_code: httpCode,
    response_time_ms: responseTimeMs,
    consecutive_fails: consecutiveFails,
    threshold,
    triggered_disable: shouldTrip,
    error: errorMsg,
  });
}

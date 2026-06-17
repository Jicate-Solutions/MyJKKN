// lib/services/meetings/meeting-webhook-dispatcher.ts
//
// MODULE 9 — webhook delivery worker. Driven by /api/cron/meeting-webhooks.
//
// dispatchDue(serviceClient, now):
//   1. Select up to BATCH pending deliveries whose scheduled_for has arrived,
//      joined to their (active) webhook for target_url + signing_secret.
//   2. For each: POST the stored payload to target_url with an
//      X-MyJKKN-Signature: sha256=<hmac> header (HMAC-SHA256 over the exact
//      JSON bytes), a short timeout, and a couple of standard headers.
//   3. Mark sent (2xx) or failed (everything else / network error / timeout),
//      stamping response_code + attempts (+ error on failure). A failed row
//      under the attempt cap is rescheduled with backoff so the next cron run
//      retries it; over the cap it stays 'failed' permanently.
//
// All network I/O lives here (NOT in the DB trigger) so a slow/dead receiver
// can never block or roll back a booking write — the trigger only enqueues.
//
// Auth model: callers hold a SERVICE-ROLE client (the cron route) which
// bypasses RLS — it must, since it dispatches across every host's webhooks.

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const LOG_PREFIX = '[meeting-webhook-dispatcher]';

const BATCH = 25; // deliveries processed per cron tick
const MAX_ATTEMPTS = 5; // give up after this many failed POSTs
const TIMEOUT_MS = 10_000; // per-POST timeout
// Backoff (minutes) indexed by the attempt that just failed (1-based-ish).
const BACKOFF_MINUTES = [1, 5, 15, 60, 180];

type Db = SupabaseClient;

interface DueRow {
  id: string;
  webhook_id: string;
  event: string;
  payload: Record<string, unknown>;
  attempts: number;
  meeting_webhooks: {
    target_url: string;
    signing_secret: string;
    is_active: boolean;
  } | null;
}

export interface DispatchSummary {
  picked: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
}

/** sha256 HMAC of `body` keyed by `secret`, hex-encoded, with the `sha256=` prefix. */
export function signPayload(secret: string, body: string): string {
  const mac = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  return `sha256=${mac}`;
}

function nextScheduledFor(attemptsAfter: number, now: Date): string {
  const idx = Math.min(attemptsAfter - 1, BACKOFF_MINUTES.length - 1);
  const minutes = BACKOFF_MINUTES[Math.max(0, idx)];
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

async function postOne(
  url: string,
  body: string,
  signature: string,
  event: string,
): Promise<{ ok: boolean; code: number | null; error: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MyJKKN-Webhooks/1.0',
        'X-MyJKKN-Event': event,
        'X-MyJKKN-Signature': signature,
      },
      body,
      signal: controller.signal,
    });
    const ok = res.status >= 200 && res.status < 300;
    return { ok, code: res.status, error: ok ? null : `HTTP ${res.status}` };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const isAbort = e instanceof Error && e.name === 'AbortError';
    return { ok: false, code: null, error: isAbort ? 'timeout' : message };
  } finally {
    clearTimeout(timer);
  }
}

export async function dispatchDue(
  supabase: Db,
  now: Date = new Date(),
): Promise<DispatchSummary> {
  const summary: DispatchSummary = { picked: 0, sent: 0, failed: 0, skipped: 0, errors: [] };

  // 1. Pull due pending deliveries with their webhook config (FK embed).
  const { data, error } = await supabase
    .from('meeting_webhook_deliveries')
    .select(
      'id, webhook_id, event, payload, attempts, meeting_webhooks!inner(target_url, signing_secret, is_active)',
    )
    .eq('status', 'pending')
    .lte('scheduled_for', now.toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(BATCH);

  if (error) {
    summary.errors.push(`select due failed: ${error.message}`);
    return summary;
  }

  const rows = (data ?? []) as unknown as DueRow[];
  summary.picked = rows.length;

  for (const row of rows) {
    const hook = row.meeting_webhooks;

    // Webhook deactivated since enqueue → don't deliver; close the row as
    // failed with a clear reason so the host can see why.
    if (!hook || hook.is_active === false) {
      await supabase
        .from('meeting_webhook_deliveries')
        .update({
          status: 'failed',
          error: 'webhook inactive',
          attempts: row.attempts + 1,
          sent_at: now.toISOString(),
        })
        .eq('id', row.id);
      summary.skipped += 1;
      continue;
    }

    // Stringify ONCE — the exact same bytes are both the request body and the
    // HMAC input, so the receiver can recompute the signature verbatim.
    const body = JSON.stringify(row.payload);
    const signature = signPayload(hook.signing_secret, body);

    const result = await postOne(hook.target_url, body, signature, row.event);
    const attemptsAfter = row.attempts + 1;

    if (result.ok) {
      await supabase
        .from('meeting_webhook_deliveries')
        .update({
          status: 'sent',
          attempts: attemptsAfter,
          response_code: result.code,
          error: null,
          sent_at: now.toISOString(),
        })
        .eq('id', row.id);
      summary.sent += 1;
      continue;
    }

    // Failure: retry under the cap (stay pending, push scheduled_for out with
    // backoff), else mark failed permanently.
    const giveUp = attemptsAfter >= MAX_ATTEMPTS;
    await supabase
      .from('meeting_webhook_deliveries')
      .update({
        status: giveUp ? 'failed' : 'pending',
        attempts: attemptsAfter,
        response_code: result.code,
        error: result.error,
        scheduled_for: giveUp ? undefined : nextScheduledFor(attemptsAfter, now),
        sent_at: giveUp ? now.toISOString() : null,
      })
      .eq('id', row.id);

    summary.failed += 1;
    if (result.error) summary.errors.push(`delivery ${row.id}: ${result.error}`);
  }

  console.warn(
    `${LOG_PREFIX} picked=${summary.picked} sent=${summary.sent} failed=${summary.failed} skipped=${summary.skipped}`,
  );
  return summary;
}

export const dynamic = 'force-dynamic';

// /api/cron/social-monthly-cadence
// Monthly dispatcher for the Department Instagram Monthly Cadence engine.
// Scheduled 0 7 1 * * — AFTER the 0 6 1 * * instagram-monthly-audit cron, so
// the fresh ig_monthly_audit rows exist when we re-measure.
//
// For each OPEN cadence whose clock has elapsed (an ig_monthly_audit row now
// exists for cadence_month + 1 month), it STAGES the cycle to 'awaiting_close':
// it writes the re-measure snapshot (reach one month on) + reach_delta, applying
// the metrics_source guard (verify-not-trust) so a silent graph->business_discovery
// token revert never fabricates a "reach collapsed" result. It does NOT write the
// learning or finalise — per the Director's locked decision the OWNER closes each
// cycle with a one-line learning (fn_social_cadence_close).
//
// Ships DARK: if social.cadence.enabled=false the dispatcher is a no-op.
//
// Auth: Bearer CRON_SECRET (Vercel-provided) OR ?secret=CRON_SECRET.
// Reach is read ONLY from ig_monthly_audit; feedback is never touched here.
// Per-cadence error isolation; each outcome logged to social_instagram_logs.

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return true;
  const qs = new URL(request.url).searchParams.get('secret');
  return qs === secret;
}

/** First-of-month (UTC) for a given date string or the current date. */
function firstOfMonthUTC(d?: string | null): string {
  const base = d ? new Date(d) : new Date();
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/** Add one calendar month to a first-of-month DATE string (UTC), return YYYY-MM-01. */
function addOneMonth(firstOfMonth: string): string {
  const d = new Date(`${firstOfMonth}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

async function logCadenceRun(
  supabase: SupabaseClient,
  args: {
    account_id: string | null;
    error_message?: string | null;
    meta: Record<string, unknown>;
  }
): Promise<void> {
  await supabase
    .from('social_instagram_logs')
    .insert({
      account_id: args.account_id,
      event_type: 'monthly_cadence',
      status: args.error_message ? 'error' : 'success',
      error_message: args.error_message ?? null,
      payload: args.meta,
    })
    .then(
      () => undefined,
      () => undefined // best-effort logging; never mask the original error
    );
}

interface OpenCadenceRow {
  id: string;
  account_id: string;
  cadence_month: string;
  baseline_reach: number | null;
  baseline_metrics_source: string | null;
}

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const supabase = getServiceClient();
  const currentMonth = firstOfMonthUTC();

  let staged = 0;
  let skipped = 0;
  let errorsCount = 0;
  const perCadenceErrors: Array<{ id: string; error: string }> = [];

  try {
    // Ships DARK: no-op unless social.cadence.enabled=true.
    const { data: enabledRow } = await supabase
      .from('platform_policies')
      .select('value')
      .eq('policy_key', 'social.cadence.enabled')
      .eq('scope_type', 'global')
      .maybeSingle();
    const enabled = (enabledRow as { value: unknown } | null)?.value === true;
    if (!enabled) {
      return NextResponse.json({
        success: true,
        skipped: 'disabled',
        message: 'social.cadence.enabled=false — dispatcher is a no-op (DARK).',
        duration_ms: Date.now() - start,
      });
    }

    // Candidate open cycles: opened at least one calendar month ago.
    const oneMonthAgo = (() => {
      const d = new Date(`${currentMonth}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - 1);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      return `${y}-${m}-01`;
    })();

    const { data: openRows, error: openErr } = await supabase
      .from('social_monthly_cadence')
      .select('id, account_id, cadence_month, baseline_reach, baseline_metrics_source')
      .eq('status', 'open')
      .lte('cadence_month', oneMonthAgo);
    if (openErr) throw openErr;

    const candidates = (openRows as OpenCadenceRow[]) ?? [];

    for (const c of candidates) {
      try {
        const remeasureMonth = addOneMonth(firstOfMonthUTC(c.cadence_month));

        // Re-measure reach ONLY from the canonical audit sink.
        const { data: auditRow } = await supabase
          .from('ig_monthly_audit')
          .select('total_reach')
          .eq('ig_account_id', c.account_id)
          .eq('audit_month', remeasureMonth)
          .maybeSingle();

        if (!auditRow) {
          // Clock not truly elapsed yet (no audit row for the re-measure month) — leave open.
          skipped++;
          continue;
        }
        const remeasureReach = Number((auditRow as { total_reach: number }).total_reach ?? 0);

        // Current metrics_source (verify-not-trust).
        const { data: acctRow } = await supabase
          .from('ig_accounts')
          .select('metrics_source')
          .eq('id', c.account_id)
          .maybeSingle();
        const currentSource = (acctRow as { metrics_source: string | null } | null)?.metrics_source ?? null;

        const baselineReach = c.baseline_reach ?? null;
        const baselineSource = c.baseline_metrics_source ?? null;

        // metrics_source guard — a silent graph->business_discovery revert (or a
        // 0 read against a >0 baseline on a non-graph source) yields a NULL delta,
        // never a fabricated "reach collapsed". The owner finalises at close.
        const guardTripped =
          (baselineSource === 'graph' && currentSource === 'business_discovery') ||
          ((baselineReach ?? 0) > 0 && remeasureReach === 0 && currentSource !== 'graph');
        const reachDelta = guardTripped ? null : remeasureReach - (baselineReach ?? 0);

        const { error: updErr } = await supabase
          .from('social_monthly_cadence')
          .update({
            remeasure_reach: remeasureReach,
            remeasure_month: remeasureMonth,
            remeasure_metrics_source: currentSource,
            reach_delta: reachDelta,
            status: 'awaiting_close',
            updated_at: new Date().toISOString(),
          })
          .eq('id', c.id)
          .eq('status', 'open'); // guard against a concurrent close
        if (updErr) throw updErr;

        await logCadenceRun(supabase, {
          account_id: c.account_id,
          meta: {
            cadence_id: c.id,
            cadence_month: c.cadence_month,
            remeasure_month: remeasureMonth,
            baseline_reach: baselineReach,
            remeasure_reach: remeasureReach,
            reach_delta: reachDelta,
            guard_tripped: guardTripped,
          },
        });

        staged++;
      } catch (e) {
        errorsCount++;
        const msg =
          e instanceof Error
            ? e.message
            : e && typeof e === 'object' && 'message' in e
              ? String((e as { message: unknown }).message)
              : 'unknown';
        perCadenceErrors.push({ id: c.id, error: msg });
        await logCadenceRun(supabase, {
          account_id: c.account_id,
          error_message: msg,
          meta: { cadence_id: c.id, cadence_month: c.cadence_month },
        });
        Sentry.captureException(e, {
          tags: { feature: 'social', event: 'monthly_cadence_stage_failure' },
          extra: { cadence_id: c.id },
        });
      }
    }

    return NextResponse.json({
      success: true,
      current_month: currentMonth,
      candidates: candidates.length,
      staged,
      skipped,
      errors_count: errorsCount,
      errors: perCadenceErrors,
      duration_ms: Date.now() - start,
    });
  } catch (e) {
    Sentry.captureException(e, {
      tags: { feature: 'social', event: 'monthly_cadence_fatal' },
    });
    return NextResponse.json(
      {
        success: false,
        staged,
        errors_count: errorsCount + 1,
        error: e instanceof Error ? e.message : 'unknown',
        duration_ms: Date.now() - start,
      },
      { status: 500 }
    );
  }
}

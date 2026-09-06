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
// Teeth: on a measurable re-measure it also sets the linked project's rag_status
// (green/amber/red vs the win threshold) — the canonical RAG the dormant
// project_at_risk auto-accountability rule reads to summon the HOD on a miss.
// That rule stays INACTIVE until the Director enables it in /meetings/triggers.
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
  institution_id: string;
  account_id: string;
  cadence_month: string;
  baseline_reach: number | null;
  baseline_metrics_source: string | null;
  project_id: string | null;
}

/**
 * Reach-vs-target -> project RAG (the teeth). Mirrors fn_social_cadence_close:
 * a hard miss is red (so the dormant project_at_risk rule would summon the HOD),
 * a soft miss amber, a win green. Returns null (leave RAG untouched) when the
 * cycle is unmeasurable (delta null) — never fabricate a "reach collapsed".
 */
function ragForDelta(
  delta: number | null,
  baseline: number | null,
  winPct: number
): 'green' | 'amber' | 'red' | null {
  if (delta === null) return null;
  const base = baseline ?? 0;
  if (base > 0) {
    const pct = (delta / base) * 100;
    if (pct >= Math.max(winPct, 1)) return 'green';
    if (pct > 0) return 'amber';
    return 'red';
  }
  return delta > 0 ? 'green' : 'amber';
}

/**
 * Reach-vs-target -> project percent_complete. Mirrors fn_social_cadence_close so
 * the cron and the close RPC never disagree on progress (round-2 LOW #9): both
 * write rag_status AND percent_complete on the same measured re-measure. Returns
 * null (leave progress untouched) when the cycle is unmeasurable (delta null).
 */
function progressForDelta(
  delta: number | null,
  baseline: number | null,
  winPct: number
): number | null {
  if (delta === null) return null;
  const base = baseline ?? 0;
  const win = Math.max(winPct, 1);
  if (base > 0) {
    const pct = (delta / base) * 100;
    const progress = (pct / win) * 100;
    return Math.min(100, Math.max(0, Math.round(progress * 100) / 100));
  }
  return delta > 0 ? 100 : 0;
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

    // Win threshold (config, fail-soft to 10%) — drives the project RAG teeth.
    const { data: winRow } = await supabase
      .from('platform_policies')
      .select('value')
      .eq('policy_key', 'social.cadence.win_delta_pct')
      .eq('scope_type', 'global')
      .maybeSingle();
    const winRaw = (winRow as { value: unknown } | null)?.value;
    const winDeltaPct = typeof winRaw === 'number' && Number.isFinite(winRaw) ? winRaw : 10;

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
      .select('id, institution_id, account_id, cadence_month, baseline_reach, baseline_metrics_source, project_id')
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

        // metrics_source guard — graph reach and business_discovery/NULL reach are
        // DIFFERENT scales, so any mismatch in graph-ness across the cycle yields a
        // NULL delta (covers a graph->business_discovery downgrade AND a
        // business_discovery/NULL->graph upgrade that would otherwise fabricate a
        // green win). Plus the collapse guard (a 0 read vs a >0 non-graph baseline).
        // Never a fabricated result; the owner finalises at close.
        const graphMismatch = (baselineSource === 'graph') !== (currentSource === 'graph');
        const guardTripped =
          graphMismatch ||
          ((baselineReach ?? 0) > 0 && remeasureReach === 0 && currentSource !== 'graph');
        const reachDelta = guardTripped ? null : remeasureReach - (baselineReach ?? 0);

        const { data: stagedRows, error: updErr } = await supabase
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
          .eq('status', 'open') // guard against a concurrent close
          .select('id');
        if (updErr) throw updErr;

        // If 0 rows staged, a concurrent close/unmeasurable already moved this
        // cycle — do NOT write the project RAG (it would clobber the close's
        // decision, e.g. overwrite an 'unmeasurable' outcome with a fake green).
        if (!stagedRows || stagedRows.length === 0) {
          skipped++;
          continue;
        }

        // Teeth: reflect the re-measure into the linked project's rag_status so
        // the DORMANT project_at_risk rule (fires on red) would summon the HOD.
        // Only when measurable; an unmeasurable re-measure leaves RAG untouched.
        // Institution-scoped (HIGH): the service-role write bypasses RLS — never
        // flip a project outside this cadence's institution.
        const newRag = ragForDelta(reachDelta, baselineReach, winDeltaPct);
        const newProgress = progressForDelta(reachDelta, baselineReach, winDeltaPct);
        // newRag and newProgress are both non-null exactly when the delta is
        // measurable, so inside this guard newProgress is a number (LOW #9: write
        // rag_status AND percent_complete together, matching fn_social_cadence_close).
        if (c.project_id && newRag && newProgress !== null) {
          const { error: ragErr } = await supabase
            .from('projects')
            .update({
              rag_status: newRag,
              percent_complete: newProgress,
              updated_at: new Date().toISOString(),
            })
            .eq('id', c.project_id)
            .eq('institution_id', c.institution_id);
          if (ragErr) throw ragErr;
        }

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
            project_id: c.project_id,
            project_rag: newRag,
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

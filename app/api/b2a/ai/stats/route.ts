/**
 * B2A — External AI door: per-app usage stats.
 *
 * GET /api/b2a/ai/stats?days=7
 *
 * Read-only aggregates over external ai_jobs rows (app_id IS NOT NULL) for the
 * reporter's AI cockpit (Phase 1.5). Same trusted-caller model as /api/b2a/ai/run:
 * the centralized bug reporter holds the single 'ai'-module key and renders these
 * numbers per app. Internal MyJKKN jobs (app_id IS NULL) are never included.
 *
 * Cost note: external jobs run ONLY on the ₹0 Max lane (no paid fallback exists
 * on this path — see fn_ai_enqueue_external), so cost is ₹0 by construction and
 * reported as such rather than joined from the ledger.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { corsHeaders } from '@/lib/api-keys/cors';

const MODULE_KEY = 'ai' as const;
const ENDPOINT = '/api/b2a/ai/stats';
const MAX_ROWS = 2000;
const RECENT_LIMIT = 25;

interface JobRow {
  id: string;
  app_id: string;
  job_type: string;
  status: string;
  requested_at: string;
  completed_at: string | null;
}

interface AppAgg {
  app_id: string;
  jobs: number;
  done: number;
  error: number;
  in_flight: number;
  avg_turnaround_secs: number | null;
  last_run: string | null;
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  const authResult = await authenticateApiKey(request, {
    requiredModule: MODULE_KEY,
    requireRead: true,
  });
  if ('error' in authResult) return authResult.error;
  const { context } = authResult;

  const rate = checkRateLimit(context.keyId);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'Retry-After': String(Math.ceil((rate.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    );
  }

  const { ipAddress, userAgent } = extractRequestMeta(request);
  const url = new URL(request.url);
  const daysRaw = Number(url.searchParams.get('days') ?? 7);
  const days = Number.isFinite(daysRaw) ? Math.min(90, Math.max(1, Math.floor(daysRaw))) : 7;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data, error } = await context.supabase
      .from('ai_jobs')
      .select('id, app_id, job_type, status, requested_at, completed_at')
      .not('app_id', 'is', null)
      .gte('requested_at', cutoff)
      .order('requested_at', { ascending: false })
      .limit(MAX_ROWS);
    if (error) throw error;

    const rows = (data ?? []) as JobRow[];

    // Aggregate per app in JS — external volume is bounded (quota + 90-day
    // retention), so MAX_ROWS covers it without a custom SQL function.
    const byApp = new Map<string, { agg: AppAgg; turnarounds: number[] }>();
    for (const r of rows) {
      let entry = byApp.get(r.app_id);
      if (!entry) {
        entry = {
          agg: {
            app_id: r.app_id,
            jobs: 0,
            done: 0,
            error: 0,
            in_flight: 0,
            avg_turnaround_secs: null,
            last_run: null,
          },
          turnarounds: [],
        };
        byApp.set(r.app_id, entry);
      }
      entry.agg.jobs += 1;
      if (r.status === 'done') entry.agg.done += 1;
      else if (r.status === 'error' || r.status === 'canceled') entry.agg.error += 1;
      else entry.agg.in_flight += 1;
      if (!entry.agg.last_run || r.requested_at > entry.agg.last_run) {
        entry.agg.last_run = r.requested_at;
      }
      if (r.status === 'done' && r.completed_at) {
        const secs =
          (new Date(r.completed_at).getTime() - new Date(r.requested_at).getTime()) / 1000;
        if (secs >= 0) entry.turnarounds.push(secs);
      }
    }

    const apps = [...byApp.values()]
      .map(({ agg, turnarounds }) => ({
        ...agg,
        avg_turnaround_secs: turnarounds.length
          ? Math.round(turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length)
          : null,
      }))
      .sort((a, b) => b.jobs - a.jobs);

    const totals = {
      jobs: rows.length,
      done: apps.reduce((a, x) => a + x.done, 0),
      error: apps.reduce((a, x) => a + x.error, 0),
      in_flight: apps.reduce((a, x) => a + x.in_flight, 0),
      cost_inr: 0, // ₹0 lane by construction — no paid path exists for external jobs
      truncated: rows.length === MAX_ROWS,
    };

    const recent = rows.slice(0, RECENT_LIMIT).map((r) => ({
      job_id: r.id,
      app_id: r.app_id,
      task: r.job_type,
      status: r.status,
      requested_at: r.requested_at,
      turnaround_secs:
        r.status === 'done' && r.completed_at
          ? Math.round(
              (new Date(r.completed_at).getTime() - new Date(r.requested_at).getTime()) / 1000
            )
          : null,
    }));

    logApiUsage({
      apiKeyId: context.keyId,
      endpoint: ENDPOINT,
      module: MODULE_KEY,
      institutionId: null,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      ipAddress,
      userAgent,
    });
    return NextResponse.json(
      { days, totals, apps, recent },
      { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logApiUsage({
      apiKeyId: context.keyId,
      endpoint: ENDPOINT,
      module: MODULE_KEY,
      institutionId: null,
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
      ipAddress,
      userAgent,
    });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: `Failed to compute AI stats: ${message}` } },
      { status: 500, headers: corsHeaders }
    );
  }
}

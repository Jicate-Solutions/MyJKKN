'use client';

// ============================================================================
// Queue health — the AI job queue as ONE thing.
// ============================================================================
// Every other control on this page is per-ROUTINE. This card is the queue: how
// deep it is, whether it is growing or draining, who is draining it, and what
// is failing.
//
// DELIBERATELY READ-ONLY. A "Requeue stale" button was designed and dropped:
// fn_ai_requeue_stale is granted to service_role only and carries no caller
// guard (it is cron-only by design), so exposing it would mean either a
// service-role bypass in the route — moving authorization out of the database,
// where every other control on this page keeps it — or a new wrapper RPC. And
// it would be redundant: the sweep already reclaims stale jobs every cycle, so
// a stuck job self-heals in ~5 minutes. The card says so instead.
//
// Direction is shown as arrivals-vs-completions, deliberately together. Depth
// alone invites a meaningless ETA: dividing 700 pending by 37/hour gives "19
// hours" only if nothing new arrives, and on 2026-07-26 ~300/hour were arriving
// the whole time. The pair is the honest signal.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, Layers, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';

const STUCK_HINT_MINUTES = 10;

type Queue = {
  read_at: string;
  depth: { pending: number; in_flight: number };
  last_hour: { arrived: number; done: number; errored: number };
  workers: { runner: string; last_claim: string; mins_ago: number }[];
  by_type: { job_type: string; pending: number; oldest: string }[];
  stuck: { id: string; job_type: string; runner: string | null; mins: number }[];
  error_shapes: { sample: string; n: number; latest: string }[];
};

function Tile({ label, value, tone, sub }: {
  label: string; value: string | number; tone?: 'good' | 'bad' | 'warn'; sub?: string;
}) {
  const toneCls =
    tone === 'bad' ? 'text-rose-600 dark:text-rose-400'
    : tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
    : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-foreground';
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${toneCls}`}>{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function QueueHealthCard() {
  const [q, setQ] = useState<Queue | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    try {
      const resp = await fetch('/api/admin/ai-routines/queue', { cache: 'no-store' });
      if (resp.status === 403) { setDenied(true); return; }
      if (!resp.ok) return;
      const json = await resp.json();
      if (json?.ok) setQ(json.queue as Queue);
    } catch {
      // silent — the card simply keeps its last reading
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (denied || (!loading && !q)) return null;
  if (loading || !q) {
    return <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Reading the job queue…</div>;
  }

  const { arrived, done, errored } = q.last_hour;
  const net = arrived - (done + errored);
  const failPct = done + errored > 0 ? Math.round((errored / (done + errored)) * 100) : 0;
  const readIst = new Date(q.read_at).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Job queue</h3>
          <span className="text-xs text-muted-foreground">read {readIst} IST · refreshes each minute</span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Waiting" value={q.depth.pending}
              tone={q.depth.pending > 200 ? 'warn' : undefined}
              sub={q.depth.in_flight ? `${q.depth.in_flight} running now` : 'nothing running'} />
        <Tile label="Arrived / hr" value={arrived} />
        <Tile label="Finished / hr" value={done} tone={done > 0 ? 'good' : 'warn'} />
        <Tile label="Failed / hr" value={errored} tone={errored > 0 ? 'bad' : 'good'}
              sub={done + errored > 0 ? `${failPct}% of attempts` : undefined} />
      </div>

      {/* Direction — the pair, never depth alone. */}
      <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5 text-sm">
        {net > 0
          ? <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          : <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />}
        <p className="text-muted-foreground">
          {net > 0 ? (
            <>
              <span className="font-medium text-amber-700 dark:text-amber-400">Growing</span> — {arrived} arrived
              against {done + errored} handled in the last hour (+{net}). The wait gets longer until whatever is
              placing work slows down, or the drain speeds up.
            </>
          ) : done > 0 ? (
            <>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">Draining</span> — {done + errored} handled
              against {arrived} arrived in the last hour.
              {arrived === 0 && q.depth.pending > 0
                ? ` Nothing new is arriving; about ${Math.ceil(q.depth.pending / Math.max(done, 1))}h left at this rate.`
                : ''}
            </>
          ) : (
            <><span className="font-medium">Idle</span> — nothing finished in the last hour.</>
          )}
        </p>
      </div>

      {/* Who is draining — liveness by real claims, not a heartbeat row. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-medium text-muted-foreground">Workers</span>
        {q.workers.length === 0 ? (
          <span className="text-rose-600 dark:text-rose-400">none has claimed in 24h</span>
        ) : q.workers.map((w) => (
          <span key={w.runner} className="inline-flex items-center gap-1.5">
            <Activity className={`h-3 w-3 ${w.mins_ago <= 20 ? 'text-emerald-500' : 'text-rose-500'}`} />
            <span className="font-mono">{w.runner}</span>
            <span className="text-muted-foreground">
              {w.mins_ago <= 20 ? `${w.mins_ago}m ago` : `silent ${w.mins_ago}m`}
            </span>
          </span>
        ))}
      </div>

      {/* What the backlog is made of — one dominant type means a finite backfill. */}
      {q.by_type.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Waiting by job</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-xs">
              <tbody>
                {q.by_type.slice(0, 5).map((t) => (
                  <tr key={t.job_type} className="border-b last:border-0">
                    <td className="py-1 pr-3 font-mono">{t.job_type}</td>
                    <td className="py-1 text-right tabular-nums">{t.pending}</td>
                    <td className="py-1 pl-3 text-right text-muted-foreground">
                      oldest {new Date(t.oldest).toLocaleTimeString('en-IN', {
                        timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stuck — a dead worker or a job past its timeout. */}
      {q.stuck.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
            <span className="font-semibold">{q.stuck.length} job(s) held over {STUCK_HINT_MINUTES} min</span>
            {' '}— longest {q.stuck[0].mins}m on <span className="font-mono">{q.stuck[0].runner ?? 'unknown'}</span>.
            Usually a worker that died mid-job. <span className="text-amber-700/80 dark:text-amber-400/80">
            No action needed: the sweep returns these to the queue automatically within about five minutes.
            If the same job keeps reappearing here, the worker is failing on it repeatedly.</span>
          </p>
        </div>
      )}

      {/* Failure SHAPES — a repeated identical message is a config ceiling. */}
      {q.error_shapes.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Failures, last 24h</p>
          {q.error_shapes.slice(0, 3).map((e) => (
            <p key={e.sample} className="text-xs text-muted-foreground">
              <span className="mr-2 inline-block min-w-[2rem] text-right font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                {e.n}×
              </span>
              <span className="font-mono">{e.sample}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

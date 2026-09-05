'use client';

// ============================================================================
// Queue health — the AI job queue as ONE thing.
// ============================================================================
// Every other control on this page is per-ROUTINE. This card is the queue: how
// deep it is, whether it is growing or draining, who is draining it, and what
// is failing.
//
// ONE action, and only one: "Run on my Mac" moves the oldest pending job of a
// type onto the 'mac' lane, where the local Mac drain (launchd agent
// ai.jkkn.maxlane.aijobs) picks it up instead of the Windows box. It is safe
// because fn_ai_claim already filters on lane, so this is routing, not a new
// mechanism — and fn_ai_job_set_lane refuses to move work to a Mac that has not
// claimed anything in 15 minutes, because a PENDING job on an unwatched lane
// never goes stale and would sit there forever.
//
// "Requeue stale" is still deliberately ABSENT. fn_ai_requeue_stale is granted
// to service_role only and carries no caller guard (cron-only by design), so
// exposing it would mean a service-role bypass in the route — moving
// authorization out of the database, where every other control on this page
// keeps it. And it would be redundant: the sweep reclaims stale jobs every
// cycle, so a stuck job self-heals in ~5 minutes. The card says so instead.
//
// Direction is shown as arrivals-vs-completions, deliberately together. Depth
// alone invites a meaningless ETA: dividing 700 pending by 37/hour gives "19
// hours" only if nothing new arrives, and on 2026-07-26 ~300/hour were arriving
// the whole time. The pair is the honest signal.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, Layers, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';

const STUCK_HINT_MINUTES = 10;

// A lane whose oldest job has sat PENDING (never claimed) this long has no
// worker polling it — the drain for it is down, not merely slow. Deliberately
// well past the 1-minute drain cadence + the ~5-minute requeue sweep, so a
// normal backlog never trips it.
//
// WHY THIS EXISTS (2026-07-29): lanes that "wait rather than pay" fail SILENTLY
// by design — voice-memo sentiment stops tagging and nothing visibly breaks, so
// a dead drain can go unnoticed for days. Depth alone cannot show it (a healthy
// queue is also deep); AGE of the oldest unclaimed job is the honest signal.
//
// The age itself is NOT computed here: fn_ai_queue_health returns lanes[].
// oldest_mins from the same snapshot as read_at, so the threshold is the only
// thing this file owns.
//
// THE THRESHOLD IS PER-LANE, because the lanes are drained by different KINDS
// of thing and one number cannot honestly describe both. Wait-to-claim measured
// over the last 7,051 jobs (2026-08-02), in minutes:
//
//   lane             n     p50   p90   p95   p99    over 15min
//   max          6,510       6   368   809  1188        22.9%
//   max-sentiment  416       0     1     2     2         0.0%
//   max-pde        105       0     0     0     1         0.0%
//   mac              3       0     1     1     1         0.0%
//   mac-test         3       0     1     1     1         0.0%
//
// Every lane except `max` is drained by an always-on poller and settles inside
// two minutes even at p99, so 15 minutes is already ~7x headroom and stays.
//
// `max` differs in kind: it is drained by an ATTENDED Claude session, which
// legitimately sleeps. Its distribution is bimodal — half of all jobs are
// claimed within 6 minutes, and the tail runs to 21 hours purely because a job
// queued at night waits for morning. A flat 15-minute rule labelled that
// "stalled" 22.9% of the time, so the banner cried wolf on nearly one job in
// four — which is how a warning stops being read at all, including on the day
// it is right. 720 minutes is the smallest round threshold that clears a full
// overnight gap: it flags 5.9%, a 4x cut in false alarms, while still catching
// a max lane that has genuinely been dead for over half a day.
const LANE_STALLED_MINUTES_BY_LANE: Record<string, number> = { max: 720 };
const LANE_STALLED_MINUTES_DEFAULT = 15;
const laneStallMinutes = (lane: string) =>
  LANE_STALLED_MINUTES_BY_LANE[lane] ?? LANE_STALLED_MINUTES_DEFAULT;

// A Mac runner that has not claimed within this window is treated as asleep and
// the button is disabled. Mirrors the same 15-minute test inside
// fn_ai_job_set_lane — the DB is the real gate; this only avoids offering a
// control that would be refused.
//
// Same 15 minutes as the DEFAULT lane-stall threshold above, but a DIFFERENT
// question, so they are deliberately separate constants rather than one shared
// value: lane-stall asks "has this lane's oldest job waited too long for
// anyone?", MAC_ALIVE asks "has this specific runner claimed anything
// recently?". Either threshold can move without the other — and the lane-stall
// side already has, for `max` only.
const MAC_ALIVE_MINUTES = 15;

type Queue = {
  read_at: string;
  depth: { pending: number; in_flight: number };
  last_hour: { arrived: number; done: number; errored: number };
  lanes: { lane: string; pending: number; oldest_mins: number }[];
  // Only genuine drainers appear here: fn_ai_queue_health filters out one-shot
  // identities (a single claim, silent over an hour), which previously rendered
  // as dead workers for 24h. `claims` is how many jobs it took in the window.
  workers: { runner: string; last_claim: string; mins_ago: number; claims?: number }[];
  by_type: {
    job_type: string; pending: number; oldest: string;
    oldest_id: string; lane: string | null;
  }[];
  stuck: { id: string; job_type: string; runner: string | null; mins: number }[];
  error_shapes: { sample: string; n: number; latest: string }[];
};

// fn_ai_queue_health does write `coalesce(lane, '(none)')`, but that fallback
// is unreachable: ai_jobs.lane is `text NOT NULL DEFAULT 'max'`, and 0 of the
// 7,051 jobs in production carry a NULL lane. An earlier revision of this file
// described the '(none)' case as a real operational hazard — a job invisible to
// every lane-specific worker — and that state is one the schema forbids. Do not
// re-add a branch for it here on the strength of the SQL's coalesce alone; if
// the column is ever made nullable, this is the place to revisit.
function laneLabel(lane: string) {
  return `${lane} lane`;
}

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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

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

  // Move ONE job between lanes. The failure text is surfaced verbatim rather
  // than flattened to "something went wrong": the RPC's refusals are the useful
  // part ("no Mac runner has claimed in the last 15 minutes", "job is not
  // pending"), and a silent no-op here would be exactly the dead control this
  // card exists to expose.
  const setLane = useCallback(async (jobId: string, lane: 'mac' | 'max') => {
    setBusyId(jobId);
    setNote(null);
    try {
      const resp = await fetch('/api/admin/ai-routines/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, lane }),
      });
      const json = await resp.json().catch(() => null);
      if (resp.ok) {
        setNote(`Sent ${json?.job?.job_type ?? 'job'} to the ${lane} lane.`);
        await load();
      } else {
        setNote(json?.error ?? `Request failed (${resp.status})`);
      }
    } catch {
      setNote('Request failed — could not reach the server.');
    } finally {
      setBusyId(null);
    }
  }, [load]);

  // The undo for "Run on my Mac". This exists so the move itself needs no
  // liveness precondition — gating the move on "has the Mac claimed recently"
  // deadlocks, because the Mac only ever claims work the move puts there.
  const returnAll = useCallback(async () => {
    setBusyId('return-all');
    setNote(null);
    try {
      const resp = await fetch('/api/admin/ai-routines/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'return-all' }),
      });
      const json = await resp.json().catch(() => null);
      if (resp.ok) {
        setNote(`Returned ${json?.returned?.returned ?? 0} job(s) to the Windows lane.`);
        await load();
      } else {
        setNote(json?.error ?? `Request failed (${resp.status})`);
      }
    } catch {
      setNote('Request failed — could not reach the server.');
    } finally {
      setBusyId(null);
    }
  }, [load]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (denied || (!loading && !q)) return null;
  if (loading || !q) {
    return <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Reading the job queue…</div>;
  }

  // A Mac runner counts as alive only if it CLAIMED recently. Liveness by real
  // claims, not a heartbeat row — heartbeats here have frozen while the lane ran.
  const macAlive = (q.workers ?? []).some(
    (w) => w.runner.startsWith('mac') && w.mins_ago <= MAC_ALIVE_MINUTES,
  );
  // The card can be deployed BEFORE its migration lands — that exact gap left
  // this card rendering an empty div for nine hours on 2026-07-26. Until
  // fn_ai_queue_health returns oldest_id, render no button at all rather than
  // one that posts `undefined`.
  const laneRoutingReady = (q.by_type ?? []).some((t) => typeof t.oldest_id === 'string');

  const { arrived, done, errored } = q.last_hour;
  const net = arrived - (done + errored);
  const failPct = done + errored > 0 ? Math.round((errored / (done + errored)) * 100) : 0;
  const readIst = new Date(q.read_at).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit',
  });

  // Lanes whose OLDEST pending job has aged past the stall threshold — nothing
  // has claimed it, so that lane's worker is down.
  //
  // Keyed on LANE, not job type, because a worker polls a lane: the lane is the
  // unit that can stop draining. Reporting per type turned one dead worker into
  // one bullet per type on that lane — up to 12 lines for a single root cause —
  // and could still MISS a stalled type, because by_type is capped at the 12
  // deepest types while lanes[] is UNCAPPED: fn_ai_queue_health groups it by
  // lane with no LIMIT, so every lane holding a pending job is present (5
  // distinct lanes exist in production today). oldest_mins is computed by
  // fn_ai_queue_health in the same snapshot as read_at, so there is no client
  // clock arithmetic here at all.
  //
  // The threshold is looked up PER LANE — see laneStallMinutes above. A flat
  // rule fired on 22.9% of `max` jobs that were merely waiting for an attended
  // runner to wake up.
  const stalledLanes = (q.lanes ?? [])
    .filter((l) => Number.isFinite(l.oldest_mins) && l.oldest_mins >= laneStallMinutes(l.lane))
    .sort((a, b) => b.oldest_mins - a.oldest_mins);

  // Which job types are sitting on a stalled lane — the detail per-lane would
  // otherwise lose. BEST-EFFORT ONLY, and never used to decide WHETHER to warn:
  // by_type[].lane is the lane of that type's first-claimable job, so a type
  // whose jobs straddle lanes is attributed to just one of them, and by_type is
  // capped at 12 types. The warning itself, its counts and its age all come
  // from lanes[] alone.
  const typesOnLane = (lane: string) =>
    (q.by_type ?? []).filter((t) => (t.lane ?? '(none)') === lane).map((t) => t.job_type);

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

      {/* Nothing is picking this up — a lane whose worker is down. Silent-failure
          lanes (the ones that wait rather than fall back to a paid provider)
          surface here or nowhere. */}
      {stalledLanes.length > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm dark:border-amber-900/60 dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <p className="font-medium text-amber-800 dark:text-amber-300">
              Nothing is picking this work up
            </p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {stalledLanes.map((l) => {
                const types = typesOnLane(l.lane);
                return (
                  <li key={l.lane} className="truncate">
                    <span className="font-medium text-foreground">{laneLabel(l.lane)}</span> — {l.pending} waiting,
                    oldest {l.oldest_mins} min unclaimed
                    {types.length > 0 ? (
                      <span className="text-xs">
                        {' · '}{types.slice(0, 4).join(', ')}
                        {types.length > 4 ? ` +${types.length - 4} more` : ''}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">
              A job waiting this long has never been claimed, so the worker for that lane is most likely
              stopped. Work is not lost — it resumes as soon as that worker is back.
            </p>
          </div>
        </div>
      ) : null}

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
                    {laneRoutingReady && (
                      <td className="py-1 pl-3 text-right">
                        {t.lane === 'mac' ? (
                          <button
                            type="button"
                            onClick={() => void setLane(t.oldest_id, 'max')}
                            disabled={busyId === t.oldest_id}
                            className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-50"
                            title="Hand this job back to the Windows box"
                          >
                            ↩ back to Windows
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void setLane(t.oldest_id, 'mac')}
                            disabled={busyId === t.oldest_id}
                            className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                            // NOT disabled when the Mac looks idle. Gating on
                            // that deadlocks: the Mac only claims work this
                            // button sends, so once it is quiet it could never
                            // be woken. Warn instead, and keep the undo nearby.
                            title={macAlive
                              ? 'Run the oldest job of this type on this Mac instead of the Windows box'
                              : `No Mac runner has claimed for ${MAC_ALIVE_MINUTES}+ minutes — it may be asleep. The job will wait on the Mac lane until it wakes; use "return all" to hand it back.`}
                          >
                            {busyId === t.oldest_id ? 'sending…' : '▶ Run on my Mac'}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Per-lane depth: a job parked on the Mac lane must never be able to
              hide. If the Mac sleeps, its pending count sits here in plain sight. */}
          {(q.lanes ?? []).length > 1 && (
            <p className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>Lanes — {(q.lanes ?? []).map((l) => `${l.lane}: ${l.pending}`).join(' · ')}</span>
              {(q.lanes ?? []).some((l) => l.lane === 'mac' && l.pending > 0) && (
                <button
                  type="button"
                  onClick={() => void returnAll()}
                  disabled={busyId === 'return-all'}
                  className="rounded border px-1.5 py-0.5 hover:bg-muted disabled:opacity-50"
                  title="Hand every job waiting on the Mac lane back to the Windows box"
                >
                  {busyId === 'return-all' ? 'returning…' : '↩ return all to Windows'}
                </button>
              )}
            </p>
          )}
          {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
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

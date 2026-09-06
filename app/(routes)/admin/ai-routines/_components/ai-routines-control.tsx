'use client';

// ============================================================================
// AI Routines control panel (client). Renders the static registry grouped by
// category, merged with each routine's EDITABLE schedule (day-of-week + time in
// IST) from the DB. Super_admin can: change when a routine runs (day/time),
// enable/disable it, and "Run now" the ones that are safe to fire on demand.
// Routines that message humans show WHY they can't be one-click-run here.
// ============================================================================

import { useEffect, useState } from 'react';
import { QueueHealthCard } from './queue-health-card';
import {
  Bot,
  Clock,
  Play,
  Loader2,
  Sparkles,
  Activity,
  ChevronDown,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  CalendarClock,
  PauseCircle,
  History,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { AI_ROUTINES, routinesByCategory, triggerableCount } from '@/lib/ai-routines/registry';
import { ROUTINE_CATEGORIES, type AIRoutine } from '@/lib/ai-routines/types';
import {
  useSchedules,
  ScheduleEditor,
  fmtTime,
  fmtDays,
  type ScheduleRow,
} from './schedule-editor';
import { ModelChip, useModelConfigMap, type ModelConfigEntry } from './model-chip';
import { useMaxLaneRequests, MaxLaneRunButton, MaxLaneNote, type MaxLaneRequest } from './max-lane';
import { CapChip, useCapPolicyMap } from './cap-chip';

const BRAND = '#0b6d41';

// Liveness strip for the Windows Max-lane box. Its poller stamps this
// ai_routine_schedules row every ~2 min ("alive (windows)"); the row has no
// registry entry, so without this strip the pulse is invisible to humans.
const HEARTBEAT_ROW_ID = 'maxlane:poller-heartbeat';
// 2-min pulse cadence → 10 silent minutes = 5 missed beats = engine down.
const HEARTBEAT_STALE_MINUTES = 10;

function fmtAge(ageMin: number): string {
  if (ageMin < 1) return 'under a minute';
  if (ageMin < 60) return `${ageMin}m`;
  if (ageMin < 24 * 60) return `${Math.floor(ageMin / 60)}h ${ageMin % 60}m`;
  return `${Math.floor(ageMin / (24 * 60))}d ${Math.floor((ageMin % (24 * 60)) / 60)}h`;
}

function WindowsEngineHeartbeat({ initial }: { initial?: ScheduleRow }) {
  // `initial` is read once (parent renders this only after schedules load);
  // afterwards the private poll below is the sole source of freshness.
  const [row, setRow] = useState<ScheduleRow | undefined>(initial);
  const [now, setNow] = useState(() => Date.now());

  // Keep the age honest while the tab stays open: tick the clock every 30s and
  // re-read the row every 60s with a private fetch (so the page-wide schedules
  // state never flickers into its loading text).
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    const poll = setInterval(async () => {
      try {
        const resp = await fetch('/api/admin/ai-routines/schedule', { cache: 'no-store' });
        const data = await resp.json();
        if (data.ok) {
          setRow((data.schedules as ScheduleRow[]).find((s) => s.routine_id === HEARTBEAT_ROW_ID));
          setNow(Date.now());
        }
      } catch {
        // network hiccup — keep the last known state; the age keeps ticking up
      }
    }, 60_000);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
    };
  }, []);

  if (!row || !row.last_fired_at) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-amber-800 dark:text-amber-300">
          <span className="font-semibold">Windows engine heartbeat not found</span> — the runner box has
          never reported a pulse. Its guardian may not be installed; Max-lane and overnight jobs may not run.
        </p>
      </div>
    );
  }

  const ageMin = Math.max(0, Math.floor((now - new Date(row.last_fired_at).getTime()) / 60_000));
  const alive = ageMin < HEARTBEAT_STALE_MINUTES;
  const lastPulseIst = new Date(row.last_fired_at).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (alive) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
        <Activity className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <p className="text-emerald-800 dark:text-emerald-300">
          <span className="font-semibold">Windows engine alive</span> — last pulse {fmtAge(ageMin)} ago
          <span className="text-emerald-700/70 dark:text-emerald-400/70">
            {' '}· beats every 2 min · runs the Max-lane night chain + overnight PR pipeline
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/40">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
      <p className="text-red-800 dark:text-red-300">
        <span className="font-semibold">Windows engine silent for {fmtAge(ageMin)}</span> — Max-lane and
        overnight jobs will not run until it is back. Last pulse: {lastPulseIst} IST. Check the runner box
        (Task Scheduler → poller) or ask the Windows Claude session.
      </p>
    </div>
  );
}

type RunState = { ok: boolean; summary: string } | undefined;

/** One row of the rolling 7-day run log (fn_ai_routine_run_history). */
type RunLogRow = { routine_id: string; lane: string; fired_at: string; status: string | null };

/** Group run-log rows by IST calendar day, newest day first, each day's runs newest first. */
function groupByIstDay(rows: RunLogRow[]): { day: string; runs: RunLogRow[] }[] {
  const fmtDay = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });
  const out: { day: string; runs: RunLogRow[] }[] = [];
  for (const row of rows) {
    const day = fmtDay(row.fired_at);
    const bucket = out.find((b) => b.day === day);
    if (bucket) bucket.runs.push(row);
    else out.push({ day, runs: [row] });
  }
  return out;
}

const fmtIstTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

function summarize(result: unknown): string {
  if (result == null) return 'done';
  if (typeof result === 'string') return result.slice(0, 240);
  try {
    const o = result as Record<string, unknown>;
    const keys = ['generated', 'candidates', 'eligible', 'skipped', 'notes', 'flags', 'sent', 'inserted', 'ok', 'week_of', 'elapsed_ms'];
    const parts = keys.filter((k) => k in o).map((k) => `${k}=${JSON.stringify(o[k])}`);
    return parts.length ? parts.join(' · ') : JSON.stringify(o).slice(0, 240);
  } catch {
    return 'done';
  }
}

// ---------------------------------------------------------------------------
// "Has not run when it said it would" detector.
//
// Every routine on this screen states its own schedule, and the dispatcher
// stamps last_fired_at each time it fires one. Until now the screen never
// compared the two, so a routine that quietly stopped firing looked exactly
// like one that fired on time — the row simply showed an older status line that
// nobody had a reason to re-read.
//
// This compares ELAPSED TIME against the longest gap the routine's own
// day-of-week pattern allows. It deliberately never asks "which calendar day
// should it have fired on": last_fired_at is UTC while minute_of_day is IST, so
// a 04:37 IST routine stamps a timestamp dated the PREVIOUS UTC day, and any
// day-matching rule has to get that conversion right to be correct. Comparing
// two absolute instants has no timezone in it at all, so there is nothing to
// get wrong.
//
// Note what this signal is and is not. It reports only WHEN the platform last
// fired the routine. It says nothing about whether the run did useful work —
// a routine's own output counts cannot support that claim (see the PR body),
// so this screen does not make it.
// ---------------------------------------------------------------------------

/** Slack past a routine's own longest scheduled gap before we call it overdue.
 *  Half a day: long enough that a late dispatcher tick or a long run never
 *  trips it, short enough that a missed daily slot surfaces the same day. */
const OVERDUE_GRACE_HOURS = 12;

/**
 * The longest gap, in hours, that a day-of-week pattern allows between two
 * consecutive runs. Every day → 24. Mon+Thu → 96 (Thu back round to Mon).
 * A single day → 168. Returns null when nothing is scheduled.
 */
export function maxScheduledGapHours(daysOfWeek: number[] | null | undefined): number | null {
  const days = [...new Set(daysOfWeek ?? [])]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b);
  if (days.length === 0) return null;
  let maxGapDays = 0;
  for (let i = 0; i < days.length; i++) {
    const next = days[(i + 1) % days.length];
    // The last entry wraps into next week; a lone day wraps onto itself (7).
    const gapDays = i === days.length - 1 ? 7 - days[i] + next : next - days[i];
    maxGapDays = Math.max(maxGapDays, gapDays);
  }
  return maxGapDays * 24;
}

export type RunFreshness =
  /** Fired longer ago than its own schedule allows, plus grace. */
  | { verdict: 'overdue'; hoursSince: number; expectedGapHours: number }
  /** Fired within the window its schedule allows. */
  | { verdict: 'on-time' }
  /** Paused, unscheduled, never fired, or not dispatcher-managed — say nothing. */
  | { verdict: 'unknown' };

/**
 * Pure classifier over a schedule row and the current instant. Exported (and
 * unit-tested) so the rule can be checked without rendering.
 */
export function classifyRunFreshness(
  schedule: ScheduleRow | undefined | null,
  nowMs: number,
): RunFreshness {
  // A paused routine is already badged "paused"; don't badge it twice. A row the
  // cloud dispatcher does not own (managed=false, e.g. the maxlane: twins) is
  // not its clock to keep, so its silence proves nothing here.
  if (!schedule || !schedule.enabled || !schedule.managed) return { verdict: 'unknown' };
  // Never fired at all is a different state with its own handling; leave it be.
  if (!schedule.last_fired_at) return { verdict: 'unknown' };

  const expectedGapHours = maxScheduledGapHours(schedule.days_of_week);
  if (expectedGapHours === null) return { verdict: 'unknown' };

  const firedMs = new Date(schedule.last_fired_at).getTime();
  if (!Number.isFinite(firedMs)) return { verdict: 'unknown' };

  const hoursSince = (nowMs - firedMs) / 3_600_000;
  // A future timestamp means a clock disagreement, not a late routine.
  if (hoursSince < 0) return { verdict: 'unknown' };

  if (hoursSince <= expectedGapHours + OVERDUE_GRACE_HOURS) return { verdict: 'on-time' };
  return { verdict: 'overdue', hoursSince, expectedGapHours };
}

/** "24 hours" / "4 days" — how often the routine is meant to run, in words. */
function fmtGap(hours: number): string {
  return hours < 48 ? `${hours} hours` : `${Math.round(hours / 24)} days`;
}

function TypeBadge({ type }: { type: AIRoutine['type'] }) {
  const map: Record<AIRoutine['type'], string> = {
    cron: 'Scheduled',
    endpoint: 'Endpoint',
    interactive: 'On-demand',
    service: 'Service',
  };
  return <Badge variant="outline" className="font-normal">{map[type]}</Badge>;
}

function RoutineRow({
  r,
  schedule,
  maxSchedule,
  configMap,
  capMap,
  maxRequest,
  onMaxQueued,
  onScheduleSaved,
  onCapSaved,
}: {
  r: AIRoutine;
  schedule?: ScheduleRow;
  /** Local Max-lane schedule (`maxlane:<id>` row, managed=false so the cloud
   *  dispatcher ignores it) — the Max-lane box's schedule-sync applies edits
   *  to its Task Scheduler within 15 min, same window as the dispatcher. */
  maxSchedule?: ScheduleRow;
  configMap: Map<string, ModelConfigEntry>;
  /** Live per-run cap values (platform_policies) for routines with a capPolicyKey. */
  capMap: Map<string, number>;
  maxRequest?: MaxLaneRequest;
  onMaxQueued: () => void;
  onScheduleSaved: (next: ScheduleRow) => void;
  onCapSaved: (key: string, value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingMax, setEditingMax] = useState(false);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<RunState>(undefined);
  const [histOpen, setHistOpen] = useState(false);
  const [hist, setHist] = useState<RunLogRow[] | null>(null);
  const [histLoading, setHistLoading] = useState(false);

  const runnable = r.type === 'cron' && r.safeToManualTrigger;
  // Evaluated at render. The threshold is measured in hours, so a clock that
  // only advances when the page re-renders is precise enough.
  const freshness = classifyRunFreshness(schedule, Date.now());

  async function toggleHistory() {
    const next = !histOpen;
    setHistOpen(next);
    if (next && hist === null) {
      setHistLoading(true);
      try {
        const resp = await fetch(
          `/api/admin/ai-routines/history?routineId=${encodeURIComponent(r.id)}`,
          { cache: 'no-store' },
        );
        const data = await resp.json();
        setHist(data.ok ? (data.runs as RunLogRow[]) : []);
      } catch {
        setHist([]);
      } finally {
        setHistLoading(false);
      }
    }
  }

  async function runNow() {
    setRunning(true);
    setLast(undefined);
    try {
      const resp = await fetch('/api/admin/ai-routines/trigger', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ routineId: r.id }),
      });
      const data = await resp.json();
      if (data.ok) {
        toast.success(`${r.name} ran — HTTP ${data.status} in ${data.elapsed_ms}ms`);
        setLast({ ok: true, summary: summarize(data.result) });
      } else {
        toast.error(`${r.name}: ${data.error ?? 'failed'}`);
        setLast({ ok: false, summary: data.error ?? `HTTP ${data.status ?? '?'}` });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'request failed';
      toast.error(`${r.name}: ${msg}`);
      setLast({ ok: false, summary: msg });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.name}</span>
              <TypeBadge type={r.type} />
              {r.callsClaude ? (
                <Badge variant="secondary" className="gap-1">
                  <Sparkles className="h-3 w-3" /> AI
                </Badge>
              ) : (
                <Badge variant="outline" className="font-normal text-muted-foreground">rules-based</Badge>
              )}
              <ModelChip featureKey={r.featureKey} configMap={configMap} />
              <CapChip capPolicyKey={r.capPolicyKey} capMap={capMap} onSaved={onCapSaved} />
              {schedule && !schedule.enabled ? (
                <Badge variant="outline" className="gap-1 border-amber-300 text-amber-600 dark:text-amber-400">
                  <PauseCircle className="h-3 w-3" /> paused
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">{r.whatItDoes}</p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-xs text-muted-foreground">
              {schedule ? (
                <span className="flex items-center gap-1">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {schedule.enabled ? (
                    <>
                      {fmtDays(schedule.days_of_week)} at{' '}
                      <span className="font-medium text-foreground">{fmtTime(schedule.minute_of_day)} IST</span>
                    </>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">paused</span>
                  )}
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {r.schedule}
                </span>
              )}
              {r.maxLane ? (
                // Renders nothing unless this routine's cloud cron provably
                // consults shouldDeferToMaxLane — see MaxLaneNote.
                <MaxLaneNote routineId={r.id} schedule={maxSchedule} />
              ) : !r.callsClaude ? (
                <span className="text-xs text-muted-foreground">
                  rules-based — no AI calls, so there&apos;s nothing to shift to the Max lane
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  live-response AI — it answers in the page, so it can&apos;t be queued to the Max lane
                </span>
              )}
              {schedule ? (
                <button type="button" onClick={() => setEditing((v) => !v)} className="text-[#0b6d41] hover:underline">
                  {editing ? 'Close' : 'Edit schedule'}
                </button>
              ) : null}
              {r.maxLane && maxSchedule ? (
                <span className="flex items-center gap-1">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Max lane:{' '}
                  {maxSchedule.enabled ? (
                    <>
                      {fmtDays(maxSchedule.days_of_week)} at{' '}
                      <span className="font-medium text-foreground">{fmtTime(maxSchedule.minute_of_day)} IST</span>
                    </>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">paused</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingMax((v) => !v)}
                    className="ml-1 text-[#0b6d41] hover:underline"
                  >
                    {editingMax ? 'Close' : 'Edit'}
                  </button>
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1 hover:text-foreground"
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                {open ? 'Hide details' : 'Details'}
              </button>
              {schedule?.last_status ? (
                <span className="text-muted-foreground/70">last run: {schedule.last_status}</span>
              ) : null}
              {freshness.verdict === 'overdue' && schedule ? (
                <span
                  className="flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400"
                  title={
                    `Needs a look. Scheduled ${fmtDays(schedule.days_of_week)} at ` +
                    `${fmtTime(schedule.minute_of_day)} IST, so it should run at least every ` +
                    `${fmtGap(freshness.expectedGapHours)}. The platform last recorded it firing ` +
                    `${fmtAge(Math.floor(freshness.hoursSince * 60))} ago. ` +
                    `This reports only WHEN it last ran — not whether that run did anything useful. ` +
                    `Open the 7-day history to see the pattern.`
                  }
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  needs attention — last ran {fmtAge(Math.floor(freshness.hoursSince * 60))} ago
                </span>
              ) : null}
              <button
                type="button"
                onClick={toggleHistory}
                className="flex items-center gap-1 hover:text-foreground"
              >
                <History className={`h-3.5 w-3.5 transition-transform ${histOpen ? 'text-foreground' : ''}`} />
                {histOpen ? 'Hide 7-day history' : '7-day history'}
              </button>
            </div>

            {histOpen ? (
              <div className="mt-1 rounded-md border bg-muted/30 p-2.5 text-xs">
                {histLoading ? (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> loading run history…
                  </span>
                ) : !hist || hist.length === 0 ? (
                  <span className="text-muted-foreground">
                    No runs recorded in the last 7 days. (History began when this feature went live —
                    a fresh routine simply hasn&apos;t fired yet.)
                  </span>
                ) : (
                  <div className="space-y-2">
                    {groupByIstDay(hist).map((day) => (
                      <div key={day.day}>
                        <div className="mb-1 font-medium text-foreground">
                          {day.day}
                          <span className="ml-1.5 font-normal text-muted-foreground/70">
                            {day.runs.length} {day.runs.length === 1 ? 'run' : 'runs'}
                          </span>
                        </div>
                        <ul className="space-y-0.5">
                          {day.runs.map((run, i) => (
                            <li key={`${run.fired_at}-${i}`} className="flex items-center gap-2">
                              <span className="tabular-nums text-muted-foreground">{fmtIstTime(run.fired_at)}</span>
                              <Badge
                                variant="outline"
                                className={`h-4 px-1.5 text-[10px] font-normal ${
                                  run.lane === 'max'
                                    ? 'border-violet-300 text-violet-600 dark:text-violet-400'
                                    : 'border-sky-300 text-sky-600 dark:text-sky-400'
                                }`}
                              >
                                {run.lane === 'max' ? 'Max lane' : 'cloud'}
                              </Badge>
                              <span className="min-w-0 truncate text-muted-foreground/80">
                                {run.status ?? '—'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {runnable ? (
              <Button size="sm" onClick={runNow} disabled={running} style={{ backgroundColor: BRAND }}>
                {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                Run now
              </Button>
            ) : r.type === 'cron' ? (
              <span className="flex items-center justify-end gap-1 text-xs text-amber-600 dark:text-amber-400">
                <ShieldAlert className="h-3.5 w-3.5" /> messages people
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">runs on its own screen</span>
            )}
            {r.maxLane ? (
              <MaxLaneRunButton
                routineId={r.id}
                routineName={r.name}
                request={maxRequest}
                onQueued={onMaxQueued}
              />
            ) : null}
          </div>
        </div>

        {editing && schedule ? (
          <ScheduleEditor
            schedule={schedule}
            onCancel={() => setEditing(false)}
            onSaved={(next) => {
              onScheduleSaved(next);
              setEditing(false);
            }}
          />
        ) : null}

        {editingMax && r.maxLane && maxSchedule ? (
          <ScheduleEditor
            schedule={maxSchedule}
            onCancel={() => setEditingMax(false)}
            onSaved={(next) => {
              onScheduleSaved(next);
              setEditingMax(false);
            }}
          />
        ) : null}

        {last && (
          <div
            className={`mt-3 flex items-start gap-1.5 rounded-md border p-2 text-xs ${
              last.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
            }`}
          >
            {last.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            <span className="break-words font-mono">{last.summary}</span>
          </div>
        )}

        {open && (
          <div className="mt-3 space-y-2 rounded-md bg-muted/40 p-3 text-xs">
            <DetailRow label="Trigger path" value={r.triggerPath || '—'} mono />
            <DetailRow label="Config knobs" value={r.configKnobs} mono />
            <DetailRow label="Side effects" value={r.sideEffects} />
            {r.notes ? <DetailRow label="Operator notes" value={r.notes} /> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className={`break-words text-foreground/80 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

export function AiRoutinesControl() {
  const { map, loading, error, setMap } = useSchedules();
  const configMap = useModelConfigMap();
  const { map: capMap, setValue: onCapSaved } = useCapPolicyMap(
    AI_ROUTINES.flatMap((r) => (r.capPolicyKey ? [r.capPolicyKey] : [])),
  );
  const { map: maxMap, refetch: refetchMax } = useMaxLaneRequests();
  const total = AI_ROUTINES.length;
  const runnable = triggerableCount();
  const aiCount = AI_ROUTINES.filter((r) => r.callsClaude).length;

  function onScheduleSaved(next: ScheduleRow) {
    setMap((prev) => {
      const m = new Map(prev);
      m.set(next.routine_id, next);
      return m;
    });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        {/* Liveness of the Windows Max-lane box — render only once schedules have
            loaded, so a slow fetch doesn't flash the "not found" warning. */}
        {!loading && <WindowsEngineHeartbeat initial={map.get(HEARTBEAT_ROW_ID)} />}
        {/* The banner above says the engine is alive; this says what it is FACING.
            Together they answer "is work moving?" — neither does alone. */}
        <QueueHealthCard />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" style={{ color: BRAND }} />
          <span className="text-sm">
            <span className="font-semibold text-foreground">{total}</span> AI routines
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" /> {aiCount} call Claude
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {/* count ROUTINES on a schedule, not rows — maxlane: rows are a second
              lane for the same routine and would inflate this (SDK review #1925) */}
          <CalendarClock className="h-4 w-4" />{' '}
          {[...map.keys()].filter((k) => !k.startsWith('maxlane:')).length} on an editable schedule
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Play className="h-4 w-4" /> {runnable} safe to run on demand
        </div>
        <p className="w-full text-xs text-muted-foreground">
          Change any scheduled routine&apos;s <strong>day and time</strong> with <strong>Edit schedule</strong> —
          takes effect on the next dispatcher tick, no redeploy. Green <strong>Run now</strong> fires immediately.
          Routines that message learners or staff show{' '}
          <span className="text-amber-600 dark:text-amber-400">messages people</span> and must be run from their own
          screen. All times are IST. To see whether each loop is actually{' '}
          <em>working</em> — measured outcomes, not just that it fired —{' '}
          <a
            href="/admin/loops"
            className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
          >
            open the Loop Control Tower →
          </a>
          {error ? <span className="ml-2 text-red-600">Schedules failed to load: {error}</span> : null}
          {loading ? <span className="ml-2">Loading schedules…</span> : null}
        </p>
        </div>
      </div>

      {ROUTINE_CATEGORIES.map((cat) => {
        const rows = routinesByCategory(cat.id);
        if (rows.length === 0) return null;
        return (
          <section key={cat.id} className="space-y-3">
            <div>
              <h2 className="text-base font-semibold">{cat.label}</h2>
              <p className="text-sm text-muted-foreground">{cat.blurb}</p>
            </div>
            <div className="space-y-2">
              {rows.map((r) => (
                <RoutineRow
                  key={r.id}
                  r={r}
                  schedule={map.get(r.id)}
                  maxSchedule={map.get(`maxlane:${r.id}`)}
                  configMap={configMap}
                  capMap={capMap}
                  maxRequest={maxMap.get(r.id)}
                  onMaxQueued={refetchMax}
                  onScheduleSaved={onScheduleSaved}
                  onCapSaved={onCapSaved}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

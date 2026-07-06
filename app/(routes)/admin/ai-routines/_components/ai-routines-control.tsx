'use client';

// ============================================================================
// AI Routines control panel (client). Renders the static registry grouped by
// category, merged with each routine's EDITABLE schedule (day-of-week + time in
// IST) from the DB. Super_admin can: change when a routine runs (day/time),
// enable/disable it, and "Run now" the ones that are safe to fire on demand.
// Routines that message humans show WHY they can't be one-click-run here.
// ============================================================================

import { useState } from 'react';
import {
  Bot,
  Clock,
  Play,
  Loader2,
  Sparkles,
  ChevronDown,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  CalendarClock,
  PauseCircle,
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

const BRAND = '#0b6d41';

type RunState = { ok: boolean; summary: string } | undefined;

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
  configMap,
  maxRequest,
  onMaxQueued,
  onScheduleSaved,
}: {
  r: AIRoutine;
  schedule?: ScheduleRow;
  configMap: Map<string, ModelConfigEntry>;
  maxRequest?: MaxLaneRequest;
  onMaxQueued: () => void;
  onScheduleSaved: (next: ScheduleRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<RunState>(undefined);

  const runnable = r.type === 'cron' && r.safeToManualTrigger;

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
              {r.maxLane ? <MaxLaneNote /> : null}
              {schedule ? (
                <button type="button" onClick={() => setEditing((v) => !v)} className="text-[#0b6d41] hover:underline">
                  {editing ? 'Close' : 'Edit schedule'}
                </button>
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
            </div>
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
          <CalendarClock className="h-4 w-4" /> {map.size} on an editable schedule
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Play className="h-4 w-4" /> {runnable} safe to run on demand
        </div>
        <p className="w-full text-xs text-muted-foreground">
          Change any scheduled routine&apos;s <strong>day and time</strong> with <strong>Edit schedule</strong> —
          takes effect on the next dispatcher tick, no redeploy. Green <strong>Run now</strong> fires immediately.
          Routines that message students or staff show{' '}
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
                  configMap={configMap}
                  maxRequest={maxMap.get(r.id)}
                  onMaxQueued={refetchMax}
                  onScheduleSaved={onScheduleSaved}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

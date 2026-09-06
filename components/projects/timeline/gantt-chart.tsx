'use client';

/**
 * Gantt chart (Feature F2) — the project timeline.
 *
 * Composes:
 *  - switchable day/week/month zoom (F2.1) via ZoomControls
 *  - one bar per task positioned on a day-resolution axis (F2.2)
 *  - phase grouping bands (F2.2) + milestone diamond lane (F2.3)
 *  - critical-path highlight (F2.5) from the pure critical-path util
 *  - weekend overlay (F2.4 — holidays are a documented TODO below)
 *  - drag-to-move with optimistic update + auto-cascade of `blocks` dependents
 *    (F2.6 / F2.8)
 *
 * ── SPEC-vs-REALITY (flagged) ────────────────────────────────────────────────
 *  • Baseline comparison (F2.7): project_tasks has NO baseline_start/baseline_end
 *    columns — only start_date/due_date. So TASK-level baseline ghost bars can't
 *    be drawn; a banner tells the user "no task baseline captured". MILESTONE
 *    baseline IS available (planned_date vs actual_date) and is rendered as a
 *    ghost diamond in milestone-marker.tsx. The projects table has a
 *    `baseline_snapshot` jsonb that a future PR could expand into per-task
 *    baselines; out of scope here.
 *  • Academic-calendar holiday overlay (F2.4): only weekends are shaded for V1.
 *    Holiday/non-working-day data isn't in the projects schema. TODO below.
 *  • Resize handles + dependency connector lines: V1 ships drag-to-move only.
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ProjectTask, ProjectPhase, ProjectMilestone, ProjectTaskDependency } from '@/types/projects';
import { useUpdateTask } from '@/hooks/projects/use-tasks';
import { computeCriticalPath } from './critical-path';
import {
  computeRange,
  dayCells,
  barGeometry,
  chartWidth,
  shiftDateString,
  ROW_LABEL_WIDTH,
  ROW_HEIGHT,
  PX_PER_DAY,
  type TimelineZoom,
} from './timeline-scale';
import { ZoomControls } from './zoom-controls';
import { GanttRow } from './gantt-row';
import { MilestoneMarker } from './milestone-marker';

// TODO(F2.4): replace `isWeekend`-only shading with the academic calendar.
// When a holidays/non-working-days source exists (e.g. an academic_calendar
// table or a platform_policy listing institution holidays), shade those days
// the same way and skip them when cascading/snapping dates.

interface GanttChartProps {
  tasks: ProjectTask[];
  phases: ProjectPhase[];
  milestones: ProjectMilestone[];
  dependencies: ProjectTaskDependency[];
  isLoading?: boolean;
}

const HEADER_HEIGHT = 40;
const MILESTONE_LANE_HEIGHT = 28;

export function GanttChart({
  tasks,
  phases,
  milestones,
  dependencies,
  isLoading,
}: GanttChartProps) {
  const [zoom, setZoom] = useState<TimelineZoom>('week');
  const updateTask = useUpdateTask();

  // Date window from every dated entity.
  const range = useMemo(
    () =>
      computeRange([
        ...tasks.flatMap((t) => [t.start_date, t.due_date]),
        ...phases.flatMap((p) => [p.start_date, p.due_date]),
        ...milestones.flatMap((m) => [m.planned_date, m.actual_date]),
      ]),
    [tasks, phases, milestones]
  );

  const critical = useMemo(
    () => computeCriticalPath(tasks, dependencies),
    [tasks, dependencies]
  );

  // task_id → ids it blocks (successors), for cascade-on-move.
  const successorsByTask = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const dep of dependencies) {
      if (dep.dependency_type !== 'blocks') continue;
      const list = map.get(dep.depends_on_task_id) ?? [];
      list.push(dep.task_id);
      map.set(dep.depends_on_task_id, list);
    }
    return map;
  }, [dependencies]);

  const taskById = useMemo(() => {
    const m = new Map<string, ProjectTask>();
    for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasks]);

  const cells = useMemo(() => dayCells(range, zoom), [range, zoom]);
  const axisWidth = chartWidth(range, zoom);

  /**
   * Persist a date shift for one task, then cascade the same shift to every
   * task it blocks (transitively). Optimistic UI comes free from useUpdateTask's
   * onSuccess invalidation; we fire the saves and surface one toast.
   */
  async function handleMoveDays(taskId: string, deltaDays: number) {
    if (deltaDays === 0) return;

    // Collect the moved task + all transitive `blocks` successors (BFS),
    // guarding against cycles with a visited set.
    const toShift = new Set<string>();
    const queue = [taskId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (toShift.has(id)) continue;
      toShift.add(id);
      for (const succ of successorsByTask.get(id) ?? []) {
        if (!toShift.has(succ)) queue.push(succ);
      }
    }

    try {
      await Promise.all(
        [...toShift].map((id) => {
          const t = taskById.get(id);
          if (!t) return Promise.resolve();
          const newStart = shiftDateString(t.start_date, deltaDays);
          const newDue = shiftDateString(t.due_date, deltaDays);
          return updateTask.mutateAsync({
            id,
            input: {
              ...(newStart !== null ? { start_date: newStart } : {}),
              ...(newDue !== null ? { due_date: newDue } : {}),
            },
          });
        })
      );
      const cascaded = toShift.size - 1;
      toast.success(
        cascaded > 0
          ? `Task moved — ${cascaded} dependent ${cascaded === 1 ? 'task' : 'tasks'} cascaded`
          : 'Task moved'
      );
    } catch (err) {
      toast.error(
        `Failed to move task: ${(err as Error)?.message ?? 'unknown error'}`
      );
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  const hasNothing =
    tasks.length === 0 && phases.length === 0 && milestones.length === 0;

  if (hasNothing) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed text-center">
        <p className="text-sm font-medium">No timeline data yet</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Add tasks with start and due dates, phases, or milestones to this
          project to see them on the Gantt timeline.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <LegendDot className="bg-sky-500" label="Task" />
            <LegendDot className="bg-red-500" label="Critical path" />
            <LegendDot className="bg-amber-500" label="Blocked" />
            <LegendDot className="rotate-45 bg-violet-500" label="Milestone" />
          </div>
          <ZoomControls value={zoom} onChange={setZoom} />
        </div>

        {/* Task-baseline gap banner (F2.7 spec-vs-reality flag). */}
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Task baseline comparison isn&apos;t available — the schema has no
            per-task baseline dates. Milestones show planned-vs-actual (ghost
            diamond) where both dates exist.
          </span>
        </div>

        {/* Scrollable chart */}
        <div className="overflow-x-auto rounded-lg border">
          <div style={{ width: ROW_LABEL_WIDTH + axisWidth, minWidth: '100%' }}>
            {/* Header axis */}
            <div
              className="sticky top-0 z-10 flex border-b bg-muted/40"
              style={{ height: HEADER_HEIGHT }}
            >
              <div
                className="shrink-0 border-r px-3 py-2 text-xs font-medium"
                style={{ width: ROW_LABEL_WIDTH }}
              >
                Task / phase
              </div>
              <div className="relative" style={{ width: axisWidth }}>
                {cells.map((cell, i) => {
                  const showLabel =
                    zoom === 'day'
                      ? true
                      : zoom === 'week'
                        ? cell.isWeekStart
                        : cell.isMonthStart;
                  if (!showLabel) return null;
                  return (
                    <div
                      key={i}
                      className="absolute top-0 h-full border-l border-border/50 px-1 text-[10px] text-muted-foreground"
                      style={{ left: cell.x }}
                    >
                      {format(cell.date, zoom === 'month' ? 'MMM yy' : 'd MMM')}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Body */}
            <div className="relative">
              {/* Weekend shading + gridlines behind everything (F2.4). */}
              <WeekendOverlay
                cells={cells}
                zoom={zoom}
                labelWidth={ROW_LABEL_WIDTH}
              />

              {/* Milestone lane */}
              {milestones.length > 0 && (
                <div
                  className="relative flex border-b bg-background/40"
                  style={{ height: MILESTONE_LANE_HEIGHT }}
                >
                  <div
                    className="shrink-0 border-r px-3 text-[11px] font-medium leading-7 text-muted-foreground"
                    style={{ width: ROW_LABEL_WIDTH }}
                  >
                    Milestones
                  </div>
                  <div className="relative" style={{ width: axisWidth }}>
                    {milestones.map((m) => (
                      <MilestoneMarker
                        key={m.id}
                        milestone={m}
                        range={range}
                        zoom={zoom}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Phase bands + their tasks */}
              {renderGrouped({
                tasks,
                phases,
                range,
                zoom,
                axisWidth,
                criticalIds: critical.criticalTaskIds,
                dragDisabled: updateTask.isPending,
                onMoveDays: handleMoveDays,
              })}
            </div>
          </div>
        </div>

        {critical.criticalTaskIds.size > 0 && (
          <p className="text-xs text-muted-foreground">
            Critical path: {critical.criticalTaskIds.size} task
            {critical.criticalTaskIds.size === 1 ? '' : 's'} ·{' '}
            {critical.criticalLengthDays} day
            {critical.criticalLengthDays === 1 ? '' : 's'} longest chain.
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('inline-block h-2.5 w-2.5 rounded-sm', className)} />
      {label}
    </span>
  );
}

function WeekendOverlay({
  cells,
  zoom,
  labelWidth,
}: {
  cells: ReturnType<typeof dayCells>;
  zoom: TimelineZoom;
  labelWidth: number;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0"
      style={{ left: labelWidth }}
      aria-hidden
    >
      {cells.map((cell, i) =>
        cell.isWeekend ? (
          <div
            key={i}
            className="absolute top-0 h-full bg-muted/40"
            style={{ left: cell.x, width: PX_PER_DAY[zoom] }}
          />
        ) : null
      )}
    </div>
  );
}

/**
 * Render tasks grouped under their phase as a band, with unphased tasks in a
 * trailing "Unphased" group. Each task is a GanttRow.
 */
function renderGrouped({
  tasks,
  phases,
  range,
  zoom,
  axisWidth,
  criticalIds,
  dragDisabled,
  onMoveDays,
}: {
  tasks: ProjectTask[];
  phases: ProjectPhase[];
  range: ReturnType<typeof computeRange>;
  zoom: TimelineZoom;
  axisWidth: number;
  criticalIds: Set<string>;
  dragDisabled: boolean;
  onMoveDays: (taskId: string, deltaDays: number) => void;
}) {
  const byPhase = new Map<string | null, ProjectTask[]>();
  for (const t of tasks) {
    const key = t.phase_id ?? null;
    const list = byPhase.get(key) ?? [];
    list.push(t);
    byPhase.set(key, list);
  }

  const groups: { phase: ProjectPhase | null; rows: ProjectTask[] }[] = [];
  for (const phase of phases) {
    groups.push({ phase, rows: byPhase.get(phase.id) ?? [] });
  }
  const unphased = byPhase.get(null) ?? [];
  if (unphased.length > 0) groups.push({ phase: null, rows: unphased });

  return groups.map((group, gi) => (
    <div key={group.phase?.id ?? `unphased-${gi}`}>
      {/* Phase band */}
      <PhaseBand
        phase={group.phase}
        range={range}
        zoom={zoom}
        axisWidth={axisWidth}
      />
      {group.rows.map((task) => (
        <div key={task.id} className="flex">
          <div
            className="flex shrink-0 items-center truncate border-r px-3 text-xs"
            style={{ width: ROW_LABEL_WIDTH, height: ROW_HEIGHT }}
            title={task.title}
          >
            <span className="truncate">{task.title}</span>
          </div>
          <div className="relative" style={{ width: axisWidth }}>
            <GanttRow
              task={task}
              range={range}
              zoom={zoom}
              isCritical={criticalIds.has(task.id)}
              dragDisabled={dragDisabled}
              onMoveDays={onMoveDays}
            />
          </div>
        </div>
      ))}
    </div>
  ));
}

function PhaseBand({
  phase,
  range,
  zoom,
  axisWidth,
}: {
  phase: ProjectPhase | null;
  range: ReturnType<typeof computeRange>;
  zoom: TimelineZoom;
  axisWidth: number;
}) {
  const geom = phase
    ? barGeometry(phase.start_date, phase.due_date, range, zoom)
    : null;
  return (
    <div className="flex border-b bg-muted/20" style={{ height: 24 }}>
      <div
        className="flex shrink-0 items-center border-r px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        style={{ width: ROW_LABEL_WIDTH }}
      >
        {phase ? phase.name : 'Unphased'}
      </div>
      <div className="relative" style={{ width: axisWidth }}>
        {geom && (
          <div
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-400/70"
            style={{ left: geom.x, width: geom.width }}
          />
        )}
      </div>
    </div>
  );
}

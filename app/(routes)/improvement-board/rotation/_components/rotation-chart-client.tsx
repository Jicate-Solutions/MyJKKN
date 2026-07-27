'use client';

/**
 * Team Rotation — rota chart (client).
 *
 * Renders the rotary chart for a chosen cycle: rows = teams, columns = periods,
 * each cell = the department that team occupies that period. The period whose
 * date window contains today is highlighted as "now". Viewable by any cohort
 * member (improvement.ideas.view); managers see manage links (teams / setup).
 *
 * PHASE 3 — cohort-generic: a cycle names the cohort it serves. The cohort lookup
 * is best-effort and NEVER blocks the page: a cycle list of zero still renders the
 * empty state, and a missing cohort backend just omits the label.
 *
 * TEAM OVERLAPS: two teams may legitimately share a department in the same period
 * (Director ruling — allow it, warn the operator). Detected off the slots already
 * loaded, then surfaced twice: an amber summary above the grid and an amber mark
 * on each affected cell. Warning only — nothing is disabled or blocked.
 *
 * Gating branches on the loading state FIRST so a viewer never sees a
 * denied-looking flash while permissions resolve, and a denied user gets an
 * explicit reason instead of a silent redirect (CLAUDE.md #27).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  ShieldAlert,
  CalendarRange,
  Users,
  Settings,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import {
  ImprovementService,
  type ImprovementArea,
} from '@/lib/services/improvement/improvement-service';
import {
  MbaRotationService,
  detectRotationOverlaps,
  type MbaRotationCycle,
  type MbaRotationSlot,
  type MbaTeam,
  type TeachingCohortOption,
} from '@/lib/services/mba-rotation/mba-rotation-service';
import { RotationOverlapWarning } from './rotation-overlap-warning';

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-5 w-96" />
      <Skeleton className="mt-4 h-64 w-full" />
    </div>
  );
}

function NoAccessPanel() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <ShieldAlert className="text-muted-foreground/50 h-10 w-10" />
        <div>
          <p className="font-medium">You don&apos;t have access to this page</p>
          <p className="text-muted-foreground text-sm">
            The team rotation is visible to MBA Associates and Improvement Board
            managers. Ask a manager if you need access.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/improvement-board">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to the Improvement Board
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-emerald-600 text-white hover:bg-emerald-700',
  paused: 'bg-amber-500 text-white hover:bg-amber-600',
  completed: 'bg-slate-500 text-white hover:bg-slate-600',
};

function fmt(dateStr: string): string {
  // ISO date → short local label; parse as UTC-midnight to avoid TZ drift.
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function RotationChartClient() {
  const { can, isLoading: permsLoading } = usePermissions();

  if (permsLoading) return <LoadingState />;
  if (!can('improvement.ideas.view')) return <NoAccessPanel />;

  return <RotationChart canManage={can('improvement.board.manage')} />;
}

function RotationChart({ canManage }: { canManage: boolean }) {
  const [loading, setLoading] = useState(true);
  const [cycles, setCycles] = useState<MbaRotationCycle[]>([]);
  const [areas, setAreas] = useState<ImprovementArea[]>([]);
  const [teams, setTeams] = useState<MbaTeam[]>([]);
  const [cycleId, setCycleId] = useState<string>('');
  const [slots, setSlots] = useState<MbaRotationSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [cohorts, setCohorts] = useState<TeachingCohortOption[]>([]);
  const [cohortsSupported, setCohortsSupported] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        // listCohortOptions() never throws; a rejection here would come only from
        // the three real loads, and must still leave the empty state renderable.
        const [nextCycles, nextAreas, nextTeams, cohortState] = await Promise.all([
          MbaRotationService.listCycles(),
          ImprovementService.listAreas(),
          MbaRotationService.listTeams(),
          MbaRotationService.listCohortOptions(),
        ]);
        if (!alive) return;
        setCycles(nextCycles);
        setAreas(nextAreas);
        setTeams(nextTeams);
        setCohorts(cohortState.options);
        setCohortsSupported(cohortState.supported);
        // Default to the first active cycle, else the newest.
        const active = nextCycles.find((c) => c.status === 'active');
        setCycleId(active?.id ?? nextCycles[0]?.id ?? '');
      } catch (err) {
        if (alive)
          toast.error(err instanceof Error ? err.message : 'Could not load the rotation.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const loadSlots = useCallback(async (id: string) => {
    if (!id) {
      setSlots([]);
      return;
    }
    setSlotsLoading(true);
    try {
      setSlots(await MbaRotationService.listSlots(id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load the rota.');
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSlots(cycleId);
  }, [cycleId, loadSlots]);

  const areaLabel = useMemo(() => {
    const m = new Map(areas.map((a) => [a.id, a.label]));
    return (id: string) => m.get(id) ?? 'Department';
  }, [areas]);

  const teamName = useMemo(() => {
    const m = new Map(teams.map((t) => [t.id, t.name]));
    return (id: string) => m.get(id) ?? 'Team';
  }, [teams]);

  const cohortLabel = useMemo(() => {
    const m = new Map(cohorts.map((c) => [c.cohort_key, c.display_name]));
    return (key: string) => m.get(key) ?? key;
  }, [cohorts]);

  // Build the grid: ordered periods (with windows) + ordered team ids +
  // cell[team][period] = area label.
  const grid = useMemo(() => {
    const periodMap = new Map<number, { start: string; end: string }>();
    const teamIds = new Set<string>();
    const cell = new Map<string, string>(); // `${teamId}:${periodIndex}` -> areaId
    for (const s of slots) {
      periodMap.set(s.period_index, { start: s.period_start, end: s.period_end });
      teamIds.add(s.team_id);
      cell.set(`${s.team_id}:${s.period_index}`, s.area_id);
    }
    const periods = Array.from(periodMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([index, w]) => ({ index, ...w }));

    // Order team rows by the loaded teams list (creation order) for stability.
    const orderedTeamIds = teams
      .map((t) => t.id)
      .filter((id) => teamIds.has(id))
      .concat(Array.from(teamIds).filter((id) => !teams.some((t) => t.id === id)));

    const today = new Date().toISOString().slice(0, 10);
    const currentPeriod = periods.find((p) => p.start <= today && today <= p.end)?.index ?? null;

    return { periods, teamIds: orderedTeamIds, cell, currentPeriod };
  }, [slots, teams]);

  // Two teams in the same department in the same period. Read off the slots the
  // grid already has — no extra query. Allowed by ruling, so this only warns.
  const overlaps = useMemo(() => detectRotationOverlaps(slots), [slots]);

  const selectedCycle = cycles.find((c) => c.id === cycleId) ?? null;

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href="/improvement-board">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Improvement Board
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <CalendarRange className="text-primary h-6 w-6" />
              Team Rotation
            </h1>
            <p className="text-muted-foreground mt-1">
              Which team is covering which department, period by period. Teams
              take turns across the departments over fixed 2&ndash;3 week periods.
            </p>
          </div>
          {canManage && (
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/improvement-board/rotation/teams">
                  <Users className="mr-1.5 h-4 w-4" />
                  Teams
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/improvement-board/rotation/config">
                  <Settings className="mr-1.5 h-4 w-4" />
                  Rotation setup
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      {cycles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <CalendarRange className="text-muted-foreground/50 h-10 w-10" />
            <div>
              <p className="font-medium">No rotation cycle yet</p>
              <p className="text-muted-foreground text-sm">
                {canManage
                  ? 'Create a rotation cycle in Rotation setup, build teams, then generate the rota.'
                  : 'A manager has not set up a rotation cycle yet. Check back soon.'}
              </p>
            </div>
            {canManage && (
              <Button variant="outline" asChild>
                <Link href="/improvement-board/rotation/config">
                  <Settings className="mr-2 h-4 w-4" />
                  Go to Rotation setup
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Cycle picker */}
          <div className="flex flex-wrap items-center gap-3">
            <Select value={cycleId} onValueChange={setCycleId}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Choose a cycle" />
              </SelectTrigger>
              <SelectContent>
                {cycles.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCycle && (
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <Badge className={STATUS_STYLE[selectedCycle.status] ?? ''}>
                  {selectedCycle.status}
                </Badge>
                {cohortsSupported && (
                  <>
                    <Badge variant="secondary">
                      {cohortLabel(selectedCycle.cohort_key)}
                    </Badge>
                    <span aria-hidden>·</span>
                  </>
                )}
                <span>{selectedCycle.period_weeks}-week periods</span>
                <span aria-hidden>·</span>
                <span>starts {fmt(selectedCycle.start_date)}</span>
                <span aria-hidden>·</span>
                <span>{selectedCycle.department_count} departments</span>
              </div>
            )}
          </div>

          {/* Doubled-up departments — informational only; renders nothing when clean */}
          {!slotsLoading && (
            <RotationOverlapWarning report={overlaps} areaLabel={areaLabel} />
          )}

          {/* Grid */}
          {slotsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : grid.periods.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground flex flex-col items-center gap-3 py-14 text-center text-sm">
                <RefreshCw className="text-muted-foreground/50 h-8 w-8" />
                <p>
                  This cycle has no rota yet.
                  {canManage ? ' Generate it from Rotation setup.' : ''}
                </p>
                {canManage && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/improvement-board/rotation/config">
                      <Settings className="mr-1.5 h-4 w-4" />
                      Rotation setup
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="border-b border-r p-3 text-left font-semibold">
                      Team
                    </th>
                    {grid.periods.map((p) => (
                      <th
                        key={p.index}
                        className={`min-w-[130px] border-b p-3 text-left font-semibold ${
                          p.index === grid.currentPeriod ? 'bg-emerald-50 dark:bg-emerald-950/40' : ''
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          Period {p.index + 1}
                          {p.index === grid.currentPeriod && (
                            <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                              NOW
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground text-xs font-normal">
                          {fmt(p.start)} &ndash; {fmt(p.end)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.teamIds.map((tid) => (
                    <tr key={tid} className="odd:bg-background even:bg-muted/20">
                      <td className="border-r p-3 font-medium">{teamName(tid)}</td>
                      {grid.periods.map((p) => {
                        const areaId = grid.cell.get(`${tid}:${p.index}`);
                        // Doubled up = another team holds this department this
                        // period. Amber overrides the "now" tint on the cell so
                        // the exception stays legible inside the current column.
                        const cellKey = areaId ? `${areaId}:${p.index}` : '';
                        const doubled = !!areaId && overlaps.cellKeys.has(cellKey);
                        const teamsHere = doubled
                          ? (overlaps.teamCountByCell.get(cellKey) ?? 2)
                          : 0;
                        const doubledTitle =
                          doubled && areaId
                            ? `${areaLabel(areaId)} has ${teamsHere} teams in period ${p.index + 1} — allowed, but check it is intentional.`
                            : undefined;
                        return (
                          <td
                            key={p.index}
                            title={doubledTitle}
                            className={`p-3 ${
                              doubled
                                ? 'bg-amber-50 ring-1 ring-inset ring-amber-300 dark:bg-amber-950/40 dark:ring-amber-800'
                                : p.index === grid.currentPeriod
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40'
                                  : ''
                            }`}
                          >
                            {areaId ? (
                              doubled ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">
                                  <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                                  {areaLabel(areaId)}
                                  <span className="font-normal opacity-80">
                                    · {teamsHere} teams
                                  </span>
                                </span>
                              ) : (
                                <span className="inline-flex rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                                  {areaLabel(areaId)}
                                </span>
                              )
                            ) : (
                              <span className="text-muted-foreground text-xs">&mdash;</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

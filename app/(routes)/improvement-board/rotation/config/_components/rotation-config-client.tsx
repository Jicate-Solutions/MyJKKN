'use client';

/**
 * Team Rotation — cycle setup (client).
 * Manager-only (improvement.board.manage). Create rotation cycles (cohort, period
 * length 2-3 weeks, start date, department set — all 14 by default), add
 * exam/holiday blackouts to skip, generate the rota, and move a cycle through
 * draft → active → paused/completed. The daily cron applies only ACTIVE cycles.
 *
 * PHASE 3 — cohort-generic: a cycle serves ONE cohort, chosen at creation, and
 * the generator round-robins only that cohort's active teams. The cohort is fixed
 * after creation so a live rota can never silently change who it covers. When the
 * Phase-3 migration is not applied yet the chooser is hidden and the module
 * behaves exactly as before (single MBA cohort).
 *
 * TEAM OVERLAPS: generating a rota may legitimately place two teams in the same
 * department in the same period (Director ruling — allow it, warn the operator).
 * After a successful generate the new rota is read back once and any doubled-up
 * departments are named in an amber note under the buttons. Warning only: nothing
 * is disabled, no save is blocked, and a failed check stays silent.
 *
 * Gating branches on the loading state FIRST (CLAUDE.md #27).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Settings,
  ShieldAlert,
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  RefreshCw,
  CalendarOff,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import {
  ImprovementService,
  type ImprovementArea,
} from '@/lib/services/improvement/improvement-service';
import {
  MbaRotationService,
  DEFAULT_COHORT_KEY,
  detectRotationOverlaps,
  type MbaRotationCycle,
  type MbaRotationCycleStatus,
  type MbaRotationOverlapReport,
  type TeachingCohortOption,
} from '@/lib/services/mba-rotation/mba-rotation-service';
import {
  RotationOverlapWarning,
  rotationOverlapHeadline,
} from '../../_components/rotation-overlap-warning';

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-emerald-600 text-white',
  paused: 'bg-amber-500 text-white',
  completed: 'bg-slate-500 text-white',
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-5 w-96" />
      <Skeleton className="mt-4 h-40 w-full" />
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
            Setting up rotation needs the &ldquo;Manage Improvement Board&rdquo;
            permission. Ask an Improvement Board manager if you need access.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/improvement-board/rotation">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to the rotation
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function RotationConfigClient() {
  const { can, isLoading: permsLoading } = usePermissions();

  if (permsLoading) return <LoadingState />;
  if (!can('improvement.board.manage')) return <NoAccessPanel />;

  return <RotationConfig />;
}

function RotationConfig() {
  const [loading, setLoading] = useState(true);
  const [areas, setAreas] = useState<ImprovementArea[]>([]);
  const [cycles, setCycles] = useState<MbaRotationCycle[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [cohorts, setCohorts] = useState<TeachingCohortOption[]>([]);
  const [cohortsSupported, setCohortsSupported] = useState(false);

  // Create form
  const [name, setName] = useState('');
  const [cohortKey, setCohortKey] = useState(DEFAULT_COHORT_KEY);
  const [periodWeeks, setPeriodWeeks] = useState('2');
  const [startDate, setStartDate] = useState(todayISO());
  const [pickedAreas, setPickedAreas] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const [nextAreas, nextCycles, cohortState] = await Promise.all([
      ImprovementService.listAreas(),
      MbaRotationService.listCycles(),
      MbaRotationService.listCohortOptions(),
    ]);
    setAreas(nextAreas);
    setCycles(nextCycles);
    setCohorts(cohortState.options);
    setCohortsSupported(cohortState.supported);
    setCohortKey((prev) =>
      cohortState.options.some((o) => o.cohort_key === prev)
        ? prev
        : (cohortState.options[0]?.cohort_key ?? DEFAULT_COHORT_KEY)
    );
    // Default: all departments picked for a new cycle.
    setPickedAreas((prev) => (prev.size === 0 ? new Set(nextAreas.map((a) => a.id)) : prev));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (err) {
        if (alive)
          toast.error(err instanceof Error ? err.message : 'Could not load setup.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const refreshCycles = useCallback(async () => {
    setCycles(await MbaRotationService.listCycles());
  }, []);

  const cohortLabel = useMemo(() => {
    const m = new Map(cohorts.map((c) => [c.cohort_key, c.display_name]));
    return (key: string) => m.get(key) ?? key;
  }, [cohorts]);

  const toggleArea = (id: string) =>
    setPickedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Give the cycle a name.');
      return;
    }
    if (pickedAreas.size === 0) {
      toast.error('Pick at least one department.');
      return;
    }
    setCreating(true);
    try {
      await MbaRotationService.createCycle({
        name,
        periodWeeks: Number(periodWeeks),
        startDate,
        areaIds: Array.from(pickedAreas),
        // Only sent when the Phase-3 column exists; else the DB default applies.
        cohortKey: cohortsSupported ? cohortKey : null,
      });
      setName('');
      setPickedAreas(new Set(areas.map((a) => a.id)));
      await refreshCycles();
      toast.success('Rotation cycle created (draft). Generate the rota to build the rows.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the cycle.');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href="/improvement-board/rotation">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Team Rotation
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Settings className="text-primary h-6 w-6" />
          Rotation Setup
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure how teams rotate through departments. Only active cycles are
          applied by the daily job.
        </p>
      </div>

      {/* Create cycle */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <p className="font-semibold">New rotation cycle</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <Label className="mb-1 block">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 2026 Odd-semester rotation"
              />
            </div>
            {cohortsSupported && (
              <div>
                <Label className="mb-1 block">Cohort</Label>
                <Select value={cohortKey} onValueChange={setCohortKey}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a cohort" />
                  </SelectTrigger>
                  <SelectContent>
                    {cohorts.map((c) => (
                      <SelectItem key={c.cohort_key} value={c.cohort_key}>
                        {c.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground mt-1 text-xs">
                  Only this cohort&apos;s teams are placed on the rota.
                </p>
              </div>
            )}
            <div>
              <Label className="mb-1 block">Period length</Label>
              <Select value={periodWeeks} onValueChange={setPeriodWeeks}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2 weeks</SelectItem>
                  <SelectItem value="3">3 weeks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block">Start date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Departments in this cycle</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-primary text-xs hover:underline"
                  onClick={() => setPickedAreas(new Set(areas.map((a) => a.id)))}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-muted-foreground text-xs hover:underline"
                  onClick={() => setPickedAreas(new Set())}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {areas.map((a) => {
                const on = pickedAreas.has(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleArea(a.id)}
                    className={`rounded-md border px-2.5 py-1.5 text-left text-xs transition ${
                      on
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create cycle
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cycles */}
      <div className="space-y-3">
        <p className="text-sm font-semibold">Cycles</p>
        {cycles.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground py-10 text-center text-sm">
              No cycles yet. Create one above.
            </CardContent>
          </Card>
        ) : (
          cycles.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 text-left"
                  onClick={() => setExpanded((e) => (e === c.id ? null : c.id))}
                >
                  <div className="flex items-center gap-2">
                    {expanded === c.id ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="font-semibold">{c.name}</span>
                    <Badge className={STATUS_STYLE[c.status] ?? ''}>{c.status}</Badge>
                    {cohortsSupported && (
                      <Badge variant="secondary" className="text-xs">
                        {cohortLabel(c.cohort_key)}
                      </Badge>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {c.period_weeks}-wk · {c.department_count} depts · {c.slot_count} slots
                  </span>
                </button>

                {expanded === c.id && (
                  <CycleEditor
                    cycle={c}
                    areas={areas}
                    cohortName={cohortsSupported ? cohortLabel(c.cohort_key) : null}
                    onChanged={refreshCycles}
                  />
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

// ── Per-cycle editor ─────────────────────────────────────────────────────────

function CycleEditor({
  cycle,
  areas,
  cohortName,
  onChanged,
}: {
  cycle: MbaRotationCycle;
  areas: ImprovementArea[];
  /** Display name of the cycle's cohort, or null when the backend predates Phase 3. */
  cohortName: string | null;
  onChanged: () => Promise<void> | void;
}) {
  const [depIds, setDepIds] = useState<Set<string>>(new Set());
  const [blackouts, setBlackouts] = useState<
    { id: string; display_name: string; start_date: string; end_date: string }[]
  >([]);
  const [periodWeeks, setPeriodWeeks] = useState(String(cycle.period_weeks));
  const [startDate, setStartDate] = useState(cycle.start_date);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Set after a generate that produced a doubled-up rota; null = nothing to say.
  const [overlaps, setOverlaps] = useState<MbaRotationOverlapReport | null>(null);

  const areaLabel = useMemo(() => {
    const m = new Map(areas.map((a) => [a.id, a.label]));
    return (id: string) => m.get(id) ?? 'Department';
  }, [areas]);

  // Blackout add form
  const [boName, setBoName] = useState('');
  const [boStart, setBoStart] = useState('');
  const [boEnd, setBoEnd] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [deps, bos] = await Promise.all([
        MbaRotationService.listDepartments(cycle.id),
        MbaRotationService.listBlackouts(cycle.id),
      ]);
      setDepIds(new Set(deps.map((d) => d.area_id)));
      setBlackouts(
        bos.map((b) => ({
          id: b.id,
          display_name: b.display_name,
          start_date: b.start_date,
          end_date: b.end_date,
        }))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load cycle detail.');
    } finally {
      setLoading(false);
    }
  }, [cycle.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleDep = (id: string) =>
    setDepIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const saveBasics = async () => {
    setBusy(true);
    try {
      await MbaRotationService.updateCycle(cycle.id, {
        period_weeks: Number(periodWeeks),
        start_date: startDate,
      });
      await MbaRotationService.setDepartments(cycle.id, Array.from(depIds));
      await onChanged();
      // The saved rota is now stale, so any overlap note about it is stale too.
      setOverlaps(null);
      toast.success('Saved. Regenerate the rota to apply the changes.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: MbaRotationCycleStatus) => {
    setBusy(true);
    try {
      await MbaRotationService.setCycleStatus(cycle.id, status);
      await onChanged();
      toast.success(`Cycle set ${status}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change status.');
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    setBusy(true);
    try {
      const r = await MbaRotationService.generateRota(cycle.id);
      await onChanged();
      setOverlaps(null);
      if (r.slots_created === 0) {
        toast.error(
          cohortName
            ? `No rota generated — this cycle needs at least one ACTIVE ${cohortName} team and one department.`
            : 'No rota generated — a cycle needs at least one active team and one department.'
        );
      } else {
        toast.success(
          `Rota built: ${r.periods} periods × ${r.teams} teams → ${r.slots_created} slots.`
        );
        // Read back ONLY the rota just built, to name the doubled-up departments
        // exactly rather than infer them. One query, on an explicit button press.
        // Two teams in one department is allowed, so a failure to check it must
        // never look like a failed generate — swallow and stay quiet.
        try {
          const report = detectRotationOverlaps(await MbaRotationService.listSlots(cycle.id));
          setOverlaps(report.hasOverlap ? report : null);
          if (report.hasOverlap) {
            toast(`Heads up: ${rotationOverlapHeadline(report)}. Allowed — see the note below.`, {
              icon: '⚠️',
            });
          }
        } catch {
          setOverlaps(null);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate the rota.');
    } finally {
      setBusy(false);
    }
  };

  const addBlackout = async () => {
    if (!boName.trim() || !boStart || !boEnd) {
      toast.error('Blackout needs a name, start and end date.');
      return;
    }
    if (boEnd < boStart) {
      toast.error('Blackout end must be on or after the start.');
      return;
    }
    setBusy(true);
    try {
      await MbaRotationService.addBlackout(cycle.id, {
        display_name: boName,
        start_date: boStart,
        end_date: boEnd,
      });
      setBoName('');
      setBoStart('');
      setBoEnd('');
      await load();
      toast.success('Blackout added. Regenerate the rota to skip it.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the blackout.');
    } finally {
      setBusy(false);
    }
  };

  const removeBlackout = async (id: string) => {
    setBusy(true);
    try {
      await MbaRotationService.removeBlackout(id);
      await load();
      toast.success('Blackout removed.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove the blackout.');
    } finally {
      setBusy(false);
    }
  };

  const deleteCycle = async () => {
    if (!window.confirm(`Delete cycle "${cycle.name}"? Its rota, departments and blackouts are removed.`))
      return;
    setBusy(true);
    try {
      await MbaRotationService.deleteCycle(cycle.id);
      await onChanged();
      toast.success('Cycle deleted.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the cycle.');
      setBusy(false);
    }
  };

  if (loading) {
    return <Skeleton className="mt-4 h-40 w-full" />;
  }

  return (
    <div className="mt-4 space-y-5 border-t pt-4">
      {/* Cohort — fixed after creation so a live rota never changes who it covers */}
      {cohortName && (
        <p className="text-muted-foreground text-xs">
          Cohort: <span className="text-foreground font-medium">{cohortName}</span> — set
          when the cycle was created and fixed from then on. Only this cohort&apos;s
          active teams are placed on the rota.
        </p>
      )}

      {/* Basics */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="mb-1 block">Period length</Label>
          <Select value={periodWeeks} onValueChange={setPeriodWeeks}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 weeks</SelectItem>
              <SelectItem value="3">3 weeks</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1 block">Start date</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
      </div>

      {/* Departments */}
      <div>
        <Label className="mb-2 block">Departments</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {areas.map((a) => {
            const on = depIds.has(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => toggleDep(a.id)}
                className={`rounded-md border px-2.5 py-1.5 text-left text-xs transition ${
                  on ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={saveBasics} disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
        <Button size="sm" variant="outline" onClick={generate} disabled={busy}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Generate rota
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/improvement-board/rotation">View rota</Link>
        </Button>
      </div>

      {/* Doubled-up departments in the rota just generated — warning only */}
      {overlaps && <RotationOverlapWarning report={overlaps} areaLabel={areaLabel} />}

      {/* Blackouts */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <CalendarOff className="h-4 w-4" />
          Exam / holiday blackouts
        </Label>
        <p className="text-muted-foreground text-xs">
          Periods that overlap a blackout are pushed past it when the rota is generated.
        </p>
        {blackouts.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {blackouts.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm"
              >
                <span>
                  <span className="font-medium">{b.display_name}</span>{' '}
                  <span className="text-muted-foreground text-xs">
                    {b.start_date} → {b.end_date}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeBlackout(b.id)}
                  disabled={busy}
                  aria-label={`Remove ${b.display_name}`}
                  className="text-destructive disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-4">
          <Input
            placeholder="Blackout name"
            value={boName}
            onChange={(e) => setBoName(e.target.value)}
            className="sm:col-span-2"
          />
          <Input type="date" value={boStart} onChange={(e) => setBoStart(e.target.value)} />
          <Input type="date" value={boEnd} onChange={(e) => setBoEnd(e.target.value)} />
        </div>
        <Button size="sm" variant="outline" onClick={addBlackout} disabled={busy}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add blackout
        </Button>
      </div>

      {/* Status + danger */}
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <span className="text-muted-foreground text-xs">Status:</span>
        {cycle.status !== 'active' && (
          <Button size="sm" variant="outline" onClick={() => setStatus('active')} disabled={busy}>
            Activate
          </Button>
        )}
        {cycle.status === 'active' && (
          <Button size="sm" variant="outline" onClick={() => setStatus('paused')} disabled={busy}>
            Pause
          </Button>
        )}
        {cycle.status !== 'completed' && (
          <Button size="sm" variant="outline" onClick={() => setStatus('completed')} disabled={busy}>
            Mark complete
          </Button>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={deleteCycle} disabled={busy}>
          <Trash2 className="mr-1.5 h-4 w-4 text-destructive" />
          Delete cycle
        </Button>
      </div>
    </div>
  );
}

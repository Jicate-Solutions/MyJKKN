'use client';

// ============================================================================
// AI Models Data Table — Director-facing AI feature config + usage view.
// Created: 2026-05-09. Plain-English UX (Director bar: PR #748).
//
// Shows every AI feature row with:
//   - Display name + description (plain English)
//   - Current provider + model
//   - Month-to-date cost (INR) + invocation count + success rate
//   - Last 24h cost
//   - Spend cap (INR/month) — null = no cap
//   - Edit button → AiModelEditDialog
//
// Grouped by category (admission, ai_pulse, etc).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import {
  Pencil,
  RefreshCw,
  AlertTriangle,
  Zap,
  Play,
  Plus,
  Settings2,
  Trash2,
  Power,
  PowerOff,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AiJobRunCard } from './ai-job-run-card';
import type { AiJobType } from './ai-job-types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getModelLabel } from '@/lib/services/platform/ai-providers';
import { AI_ROUTINES } from '@/lib/ai-routines/registry';
import type { AIRoutine } from '@/lib/ai-routines/types';

import { Switch } from '@/components/ui/switch';
import { AiModelEditDialog } from './ai-model-edit-dialog';
// UNIFICATION (2026-07-23): authoring (edit recipe/prompt + create job type)
// folds into this one console behind an "Advanced" menu — reuses the AI Studio
// edit dialog so no authoring capability is lost when the Studio tab retires.
import { AiJobTypeEditDialog } from './ai-job-type-edit-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
// Shared Max-lane plumbing (button + status hook) — source of truth lives with
// the AI Routines page; reused here so both pages queue via the same
// max_lane_requests flow (POST /api/admin/ai-routines/max-run).
import {
  MaxLaneRunButton,
  useMaxLaneRequests,
} from '@/app/(routes)/admin/ai-routines/_components/max-lane';
import type { ScheduleRow } from '@/app/(routes)/admin/ai-routines/_components/schedule-editor';

// Reverse cross-link: which /admin/ai-routines entries run on each feature row.
// Static registry data, computed once at module scope (no hooks involved).
const ROUTINES_BY_FEATURE: Map<string, AIRoutine[]> = (() => {
  const m = new Map<string, AIRoutine[]>();
  for (const r of AI_ROUTINES) {
    if (!r.featureKey) continue;
    const list = m.get(r.featureKey) ?? [];
    list.push(r);
    m.set(r.featureKey, list);
  }
  return m;
})();

const ROUTINE_TYPE_LABELS: Record<AIRoutine['type'], string> = {
  cron: 'Scheduled',
  endpoint: 'Endpoint',
  interactive: 'On-demand',
  service: 'Service',
};

// UNIFICATION (2026-07-23): the unified console sections by registry LANE
// (where a job runs + what it costs), not by category. Module-scope so the
// grouping memo keeps stable references.
const LANE_ORDER = ['max', 'api', 'either'] as const;
const LANE_LABEL: Record<string, string> = {
  max: 'Max lane · ₹0',
  api: 'API lane · paid',
  either: 'Either lane',
  // Dedicated Max sub-lane: still the ₹0 subscription worker, but isolated so
  // its runner cannot race the user-facing chat drain for claims.
  'max-pdf': 'Max lane · ₹0 · PDF reader',
};

/** Max lane or any dedicated Max sub-lane ('max-pdf', …) — all ₹0. */
const isMaxLaneValue = (lane?: string | null): boolean =>
  lane === 'max' || (typeof lane === 'string' && lane.startsWith('max-'));

// ---------------------------------------------------------------------------
// Max-lane schedule rows (`maxlane:<routine-id>` in ai_routine_schedules) —
// the REAL on/off switch for a routine's subscription-lane schedule. Edits go
// through the same POST the AI Routines page uses; the runner box's
// schedule-sync re-reads them within ~15 minutes.
// ---------------------------------------------------------------------------
function useMaxLaneSchedules() {
  const [map, setMap] = useState<Map<string, ScheduleRow>>(new Map());

  const load = useCallback(async () => {
    try {
      const resp = await fetch('/api/admin/ai-routines/schedule', { cache: 'no-store' });
      // 403/500 → switches simply don't render. Deliberate house style
      // (matches model-chip + max-lane hooks: "the page must never get
      // noisier because the config API is unreachable"); the WRITE path
      // (toggleMaxSchedule) does surface its errors via toast.
      // Deep-review 2026-07-11 finding #9 reviewed and declined on this basis.
      if (!resp.ok) return;
      const json = await resp.json();
      const rows: ScheduleRow[] = Array.isArray(json?.schedules) ? json.schedules : [];
      const m = new Map<string, ScheduleRow>();
      for (const r of rows) {
        if (typeof r?.routine_id === 'string' && r.routine_id.startsWith('maxlane:')) {
          m.set(r.routine_id, r);
        }
      }
      setMap(m);
    } catch {
      // silent — switches don't render
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { map, refetch: load };
}

function fmtIstTime(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} IST`;
}

/** Plain-English lane badge for one feature row. Absence of a badge = plain
 *  API feature with nothing special to say. */
function LaneBadge({ f, routines, scheduleMap }: {
  f: FeatureRow;
  routines: AIRoutine[];
  scheduleMap: Map<string, ScheduleRow>;
}) {
  // The API sends only derived flags here (never raw max_lane_user_ids — the
  // seat owner's user id stays server-side).
  const seatUserCount =
    typeof f.config_json?.seat_lane_user_count === 'number'
      ? f.config_json.seat_lane_user_count
      : 0;
  if (seatUserCount > 0) {
    return (
      <Badge variant="outline" className="mt-1 gap-1 border-[#0b6d41]/40 text-[11px] font-normal text-[#0b6d41]">
        <Zap className="h-3 w-3" /> Max for Director · API for others
      </Badge>
    );
  }
  const maxRoutine = routines.find((r) => r.maxLane);
  if (maxRoutine) {
    const sched = scheduleMap.get(`maxlane:${maxRoutine.id}`);
    if (sched?.enabled) {
      return (
        <Badge variant="outline" className="mt-1 gap-1 border-[#0b6d41]/40 text-[11px] font-normal text-[#0b6d41]">
          <Zap className="h-3 w-3" /> Max first · API backup
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="mt-1 gap-1 text-[11px] font-normal text-muted-foreground">
        <Zap className="h-3 w-3" /> Max on demand
      </Badge>
    );
  }
  return null;
}

interface FeatureRow {
  feature_key: string;
  display_name: string;
  description: string | null;
  category: string | null;
  provider: string;
  model_id: string;
  fallback_provider: string | null;
  fallback_model_id: string | null;
  monthly_spend_cap_inr: number | null;
  is_active: boolean;
  config_json: Record<string, unknown> | null;
  updated_at: string;
  updated_by: string | null;
  month_to_date_cost_inr: number;
  month_to_date_invocations: number;
  month_to_date_success_rate: number;
  last_24h_cost_inr: number;
  last_24h_invocations: number;
  // Config merge (2026-07-14): registry-sourced governance.
  lane?: string | null;
  runnable?: boolean;
  // UNIFICATION (2026-07-23): false → this registry job has no model yet
  // (provider/model_id are ''); render "Uses default model" + a "Set model" button.
  model_set?: boolean;
  // VISIBILITY (2026-07-25): the raw registry `enabled` gate. false → this job
  // is dormant (the Max/API drain will not claim or enqueue it). The service
  // read returns these rows so the Director can govern their model, but they
  // MUST be marked so they aren't mistaken for live ones.
  enabled?: boolean;
}

function formatInr(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '₹0';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function AiModelsDataTable() {
  const [features, setFeatures] = useState<FeatureRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingFeature, setEditingFeature] = useState<FeatureRow | null>(null);
  // Config merge (2026-07-14): the registry's job types power an inline Run
  // card on runnable features (reuses the AI Studio runner). Map keyed by
  // job_type === feature_key; empty until loaded / on failure (→ no Run button).
  const [runningFeature, setRunningFeature] = useState<FeatureRow | null>(null);
  const [jobTypeMap, setJobTypeMap] = useState<Map<string, AiJobType>>(new Map());
  // UNIFICATION (2026-07-23): authoring state — edit a job's recipe/prompt or
  // create a brand-new job type (folds in the retired AI Studio tab's powers).
  const [authoringJob, setAuthoringJob] = useState<AiJobType | null>(null);
  const [creatingJob, setCreatingJob] = useState(false);
  // Latest Max-lane request per routine_id (drives queued/running/done state
  // on the Run-on-Max buttons). Same hook the AI Routines page uses.
  const { map: maxMap, refetch: refetchMax } = useMaxLaneRequests();
  // maxlane:* schedule rows — power the "Scheduled on Max" switches.
  const { map: schedMap, refetch: refetchSched } = useMaxLaneSchedules();
  const [togglingSched, setTogglingSched] = useState<string | null>(null);

  const toggleMaxSchedule = useCallback(
    async (routineId: string, row: ScheduleRow, next: boolean) => {
      setTogglingSched(routineId);
      try {
        // Re-read the row FIRST: the upsert requires days/minute, and the
        // mount-time snapshot could be stale if the time was edited on the
        // routines page meanwhile — writing the old values back would be a
        // silent lost update (deep-review finding). Fresh-read failure falls
        // back to the snapshot rather than blocking the toggle.
        let current = row;
        try {
          const fresh = await fetch('/api/admin/ai-routines/schedule', { cache: 'no-store' });
          if (fresh.ok) {
            const fj = await fresh.json();
            const match = (Array.isArray(fj?.schedules) ? fj.schedules : []).find(
              (s: ScheduleRow) => s?.routine_id === row.routine_id,
            );
            if (match) current = match;
          }
        } catch {
          // keep snapshot
        }
        const resp = await fetch('/api/admin/ai-routines/schedule', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            routineId: current.routine_id,
            enabled: next,
            daysOfWeek: current.days_of_week,
            minuteOfDay: current.minute_of_day,
          }),
        });
        const json = await resp.json();
        if (!resp.ok || json?.ok === false) throw new Error(json?.error ?? `HTTP ${resp.status}`);
        toast.success(
          next
            ? 'Max schedule ON — the runner box picks this up within ~15 minutes'
            : 'Max schedule OFF — the API cron keeps covering this routine',
        );
        await refetchSched();
      } catch (e) {
        toast.error(`Could not update the Max schedule: ${e instanceof Error ? e.message : 'request failed'}`);
      } finally {
        setTogglingSched(null);
      }
    },
    [refetchSched],
  );

  const loadFeatures = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/ai-models', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setFeatures(json.data ?? []);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Couldn't reach the AI model config server. Try refreshing.";
      toast.error(msg);
      setFeatures([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeatures();
  }, [loadFeatures]);

  // Load the registry's job types so rows can open the Run card AND the
  // "Advanced" recipe editor. Best-effort — a failure just means no Run/Advanced
  // affordances render, never a broken page (matches the house style of the
  // other config fetches here). Exposed as a callback so an authoring save can
  // refresh the recipe map (UNIFICATION 2026-07-23).
  const loadJobTypes = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ai-job-types', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      const list: AiJobType[] = Array.isArray(json?.jobTypes) ? json.jobTypes : [];
      setJobTypeMap(new Map(list.map((jt) => [jt.job_type, jt])));
    } catch {
      // silent — no Run/Advanced affordances on failure
    }
  }, []);

  useEffect(() => {
    void loadJobTypes();
  }, [loadJobTypes]);

  // UNIFICATION (2026-07-23): enable/disable + delete a job type — ported from
  // the retired AI Studio list so those management powers survive behind each
  // row's Advanced menu. Writes go through the same ai-job-types admin API.
  const [jobBusyKey, setJobBusyKey] = useState<string | null>(null);

  const toggleJobEnabled = useCallback(
    async (jobType: string, title: string, next: boolean) => {
      setJobBusyKey(jobType);
      try {
        const res = await fetch(`/api/admin/ai-job-types/${encodeURIComponent(jobType)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: next }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error ?? `HTTP ${res.status}`);
        }
        toast.success(next ? `${title} enabled.` : `${title} disabled.`);
        await loadJobTypes();
        await loadFeatures();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not update.');
      } finally {
        setJobBusyKey(null);
      }
    },
    [loadJobTypes, loadFeatures],
  );

  const handleDeleteJob = useCallback(
    async (jobType: string, title: string) => {
      if (!window.confirm(`Delete job type "${title}" (${jobType})? This can't be undone.`)) return;
      setJobBusyKey(jobType);
      try {
        const res = await fetch(`/api/admin/ai-job-types/${encodeURIComponent(jobType)}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error ?? `HTTP ${res.status}`);
        }
        toast.success(`${title} deleted.`);
        await loadJobTypes();
        await loadFeatures();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not delete.');
      } finally {
        setJobBusyKey(null);
      }
    },
    [loadJobTypes, loadFeatures],
  );

  // UNIFICATION (2026-07-23): section by registry LANE (Max / API / Either),
  // not category — the Director governs by where a job runs and what it costs.
  // Max first (the ₹0 lane), then API (paid), then the rest. Rows
  // within a lane sort by category then display name for a stable read.
  const grouped = useMemo(() => {
    if (!features) return [];
    const map = new Map<string, FeatureRow[]>();
    for (const f of features) {
      const lane = f.lane || 'either';
      const list = map.get(lane) ?? [];
      list.push(f);
      map.set(lane, list);
    }
    for (const rows of map.values()) {
      rows.sort(
        (a, b) =>
          (a.category ?? '').localeCompare(b.category ?? '') ||
          a.display_name.localeCompare(b.display_name),
      );
    }
    const rank = (l: string) => {
      const i = LANE_ORDER.indexOf(l as (typeof LANE_ORDER)[number]);
      return i === -1 ? LANE_ORDER.length : i;
    };
    return Array.from(map.entries()).sort((a, b) => rank(a[0]) - rank(b[0]));
  }, [features]);

  const totalMtdCost = useMemo(() => {
    if (!features) return 0;
    return features.reduce((sum, f) => sum + f.month_to_date_cost_inr, 0);
  }, [features]);

  const totalMtdCalls = useMemo(() => {
    if (!features) return 0;
    return features.reduce((sum, f) => sum + f.month_to_date_invocations, 0);
  }, [features]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            One row per AI job in the registry, grouped by the lane it runs on. Pick
            its model, set a monthly spend cap, and watch the cost — every change is
            audited. Use{' '}
            <span className="font-medium text-foreground">Advanced</span> on a row to
            edit its recipe/prompt or run it on demand.
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Zap className="h-3.5 w-3.5" />
            Max-eligible features can run on the subscription lane; all other
            features run on the API by design.
          </p>
          <p className="text-xs text-muted-foreground">
            Month-to-date across all features:{' '}
            <span className="font-medium text-foreground">{formatInr(totalMtdCost)}</span>{' '}
            from <span className="font-medium text-foreground">{totalMtdCalls.toLocaleString('en-IN')}</span> invocations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadFeatures} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {/* UNIFICATION: create a new job type — folds in the retired AI Studio
              tab's "New job type" action. */}
          <Button size="sm" onClick={() => setCreatingJob(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New job type
          </Button>
        </div>
      </div>

      {loading && !features ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !features || features.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No AI features configured yet. The seed migration should populate 5 default rows
          on first apply.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([lane, rows]) => (
            <section key={lane}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium tracking-wide text-muted-foreground">
                {isMaxLaneValue(lane) && <Zap className="h-3.5 w-3.5 text-[#0b6d41]" />}
                <span className="uppercase">{LANE_LABEL[lane] ?? lane}</span>
                <span className="text-xs font-normal normal-case text-muted-foreground/70">
                  {rows.length} job{rows.length === 1 ? '' : 's'}
                </span>
              </h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[280px]">Feature</TableHead>
                      <TableHead>Current Model</TableHead>
                      <TableHead>Used by</TableHead>
                      <TableHead className="text-right">This month</TableHead>
                      <TableHead className="text-right">Last 24h</TableHead>
                      <TableHead className="text-right">Cap (INR/mo)</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((f) => {
                      const overCap =
                        f.monthly_spend_cap_inr !== null &&
                        f.month_to_date_cost_inr > f.monthly_spend_cap_inr;
                      const lowSuccess = f.month_to_date_invocations > 0 && f.month_to_date_success_rate < 0.9;
                      // VISIBILITY (2026-07-25): a dormant registry job (enabled=
                      // false). The service read returns it so its model stays
                      // governable, but it must be dimmed + badged so it isn't
                      // mistaken for a live one on the shared console.
                      const disabled = f.enabled === false;
                      return (
                        <TableRow
                          key={f.feature_key}
                          className={
                            [overCap ? 'bg-destructive/5' : '', disabled ? 'opacity-60' : '']
                              .filter(Boolean)
                              .join(' ') || undefined
                          }
                        >
                          <TableCell>
                            <div className="space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{f.display_name}</span>
                                {disabled && (
                                  <Badge
                                    variant="outline"
                                    className="gap-1 border-amber-500/50 bg-amber-50 text-[11px] font-medium text-amber-700 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-400"
                                    title="This job is disabled in the registry — the Max/API drain will not claim or enqueue it. Its model is still editable here."
                                  >
                                    <PowerOff className="h-3 w-3" />
                                    Disabled
                                  </Badge>
                                )}
                              </div>
                              {f.description && (
                                <div className="text-xs text-muted-foreground">{f.description}</div>
                              )}
                              <div className="text-xs text-muted-foreground/70 font-mono">
                                {f.feature_key}
                              </div>
                              {(() => {
                                const jt = jobTypeMap.get(f.feature_key);
                                if (!jt) return null;
                                return jt.loop_key ? (
                                  <Link
                                    href={`/admin/loops#loop-${jt.loop_key}`}
                                    title={`This job serves the ${jt.loop_key} loop — click to see it in the Loop Control Tower`}
                                  >
                                    <Badge
                                      variant="outline"
                                      className="mt-1 font-mono text-[11px] font-normal text-[#0b6d41] hover:underline"
                                    >
                                      {jt.loop_key}
                                    </Badge>
                                  </Link>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="mt-1 text-[11px] font-normal text-muted-foreground"
                                    title="Not yet claimed by any governance loop"
                                  >
                                    unclaimed
                                  </Badge>
                                );
                              })()}
                              {/* UNIFICATION: per-row lane badge removed — the
                                  console now sections by lane, so it was redundant. */}
                              {!f.is_active && (
                                <Badge variant="outline" className="mt-1">Inactive</Badge>
                              )}
                              <LaneBadge
                                f={f}
                                routines={ROUTINES_BY_FEATURE.get(f.feature_key) ?? []}
                                scheduleMap={schedMap}
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            {f.model_set === false || !f.model_id ? (
                              // UNIFICATION: a registry job with no model pinned —
                              // resolves to the built-in default. Governing it is a
                              // PR-2 follow-up (the PATCH path needs a config row).
                              <div className="space-y-0.5">
                                <div className="text-sm text-muted-foreground">Uses default model</div>
                                <div className="text-xs text-muted-foreground/70">
                                  No model pinned in the registry
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                <div className="text-sm">
                                  {getModelLabel(f.provider, f.model_id)}
                                </div>
                                <div className="text-xs text-muted-foreground font-mono">
                                  {f.provider} · {f.model_id}
                                </div>
                                {f.fallback_provider && f.fallback_model_id && (
                                  <div className="text-xs text-muted-foreground">
                                    Fallback: {f.fallback_provider} · {f.fallback_model_id}
                                  </div>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const usedBy = ROUTINES_BY_FEATURE.get(f.feature_key) ?? [];
                              if (usedBy.length === 0) {
                                return <span className="text-xs text-muted-foreground">—</span>;
                              }
                              return (
                                <div className="space-y-1.5">
                                  {usedBy.map((r) => (
                                    <div key={r.id} className="space-y-1">
                                      <div className="flex items-center gap-1.5">
                                        <Link
                                          href="/admin/ai-routines"
                                          className="text-xs hover:underline"
                                          title="See this routine on the AI Routines page"
                                        >
                                          {r.name}
                                        </Link>
                                        <Badge
                                          variant="outline"
                                          className="px-1 py-0 text-[10px] font-normal text-muted-foreground"
                                        >
                                          {ROUTINE_TYPE_LABELS[r.type]}
                                        </Badge>
                                      </div>
                                      {/* Run-on-Max ONLY where the routine has a Max-lane
                                          twin (registry maxLane flag). Non-eligible
                                          routines/features get nothing — the subscription
                                          seat cannot run interactive/product features. */}
                                      {r.maxLane ? (
                                        <div className="space-y-1">
                                          <div className="flex justify-start [&>div]:items-start">
                                            <MaxLaneRunButton
                                              routineId={r.id}
                                              routineName={r.name}
                                              request={maxMap.get(r.id)}
                                              onQueued={refetchMax}
                                            />
                                          </div>
                                          {(() => {
                                            // The REAL switch: on/off of this routine's
                                            // maxlane:* schedule row. Rows without one are
                                            // button-only twins (no schedule to toggle).
                                            const sched = schedMap.get(`maxlane:${r.id}`);
                                            if (!sched) return null;
                                            return (
                                              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                                <Switch
                                                  checked={sched.enabled}
                                                  disabled={togglingSched === r.id}
                                                  onCheckedChange={(next) => void toggleMaxSchedule(r.id, sched, next)}
                                                  aria-label={`Scheduled Max runs for ${r.name}`}
                                                  className="scale-75"
                                                />
                                                {sched.enabled
                                                  ? `On Max daily ${fmtIstTime(sched.minute_of_day)}`
                                                  : 'Max schedule off'}
                                              </label>
                                            );
                                          })()}
                                        </div>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="space-y-0.5">
                              <div className="font-medium">{formatInr(f.month_to_date_cost_inr)}</div>
                              <div className="text-xs text-muted-foreground">
                                {f.month_to_date_invocations.toLocaleString('en-IN')} calls
                              </div>
                              {f.month_to_date_invocations > 0 && (
                                <div className={`text-xs ${lowSuccess ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                  {formatPercent(f.month_to_date_success_rate)} success
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="space-y-0.5">
                              <div className="text-sm">{formatInr(f.last_24h_cost_inr)}</div>
                              <div className="text-xs text-muted-foreground">
                                {f.last_24h_invocations.toLocaleString('en-IN')} calls
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {f.monthly_spend_cap_inr === null ? (
                              <span className="text-sm text-muted-foreground">No cap</span>
                            ) : (
                              <div className="space-y-0.5">
                                <div className="text-sm">{formatInr(f.monthly_spend_cap_inr)}</div>
                                {overCap && (
                                  <div className="space-y-0.5 text-right">
                                    <div className="flex items-center justify-end gap-1 text-xs text-destructive">
                                      <AlertTriangle className="h-3 w-3" />
                                      Over cap
                                    </div>
                                    {/* Enforcement swaps anthropic rows to Haiku;
                                        a row ALREADY on Haiku has nothing to swap,
                                        so don't imply protection that isn't applied. */}
                                    {f.provider === 'anthropic' && f.model_id !== 'claude-haiku-4-5' && (
                                      <div className="text-[11px] text-muted-foreground">
                                        auto-running on Haiku until next month
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              {/* GOVERNANCE-FIRST: edit the model / spend cap inline.
                                  A model-less registry job gets a "Set model" button
                                  that governs it for the FIRST time — the PATCH now
                                  upserts an ai_model_config row (UNIFICATION follow-up). */}
                              {f.model_set === false ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1 text-xs"
                                  onClick={() => setEditingFeature(f)}
                                  aria-label={`Set a model for ${f.display_name}`}
                                  title="Pin a model for this job"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  Set model
                                </Button>
                              ) : (
                                f.model_id && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingFeature(f)}
                                    aria-label={`Edit model for ${f.display_name}`}
                                    title="Change model / spend cap"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )
                              )}
                              {/* AUTHORING + RUN tuck behind Advanced so the default
                                  row stays governance-focused (UNIFICATION 2026-07-23).
                                  Reuses the AI Studio recipe editor + runner. */}
                              {jobTypeMap.has(f.feature_key) && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      aria-label={`Advanced actions for ${f.display_name}`}
                                      title="Advanced — edit recipe / run"
                                    >
                                      <Settings2 className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => {
                                        const jt = jobTypeMap.get(f.feature_key);
                                        if (jt) setAuthoringJob(jt);
                                      }}
                                    >
                                      <Pencil className="mr-2 h-4 w-4" />
                                      Edit recipe &amp; prompt
                                    </DropdownMenuItem>
                                    {f.runnable && (
                                      <DropdownMenuItem onClick={() => setRunningFeature(f)}>
                                        <Play className="mr-2 h-4 w-4" />
                                        Run on demand
                                      </DropdownMenuItem>
                                    )}
                                    {(() => {
                                      const jt = jobTypeMap.get(f.feature_key);
                                      if (!jt) return null;
                                      return (
                                        <DropdownMenuItem
                                          disabled={jobBusyKey === f.feature_key}
                                          onClick={() =>
                                            void toggleJobEnabled(jt.job_type, jt.title, !jt.enabled)
                                          }
                                        >
                                          {jt.enabled ? (
                                            <>
                                              <PowerOff className="mr-2 h-4 w-4" />
                                              Disable job
                                            </>
                                          ) : (
                                            <>
                                              <Power className="mr-2 h-4 w-4" />
                                              Enable job
                                            </>
                                          )}
                                        </DropdownMenuItem>
                                      );
                                    })()}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      disabled={jobBusyKey === f.feature_key}
                                      onClick={() => {
                                        const jt = jobTypeMap.get(f.feature_key);
                                        if (jt) void handleDeleteJob(jt.job_type, jt.title);
                                      }}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete job type
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>
          ))}
        </div>
      )}

      <AiModelEditDialog
        open={!!editingFeature}
        onOpenChange={(open) => {
          if (!open) setEditingFeature(null);
        }}
        feature={editingFeature}
        onSaved={() => {
          setEditingFeature(null);
          loadFeatures();
        }}
      />

      {/* UNIFICATION (2026-07-23): authoring dialogs — edit an existing job's
          recipe/prompt, or create a brand-new job type. Reuses the AI Studio
          edit dialog so its powers survive the tab merge. On save, refresh BOTH
          the governance rows and the recipe map. */}
      <AiJobTypeEditDialog
        open={!!authoringJob}
        onOpenChange={(open) => {
          if (!open) setAuthoringJob(null);
        }}
        jobType={authoringJob}
        onSaved={() => {
          setAuthoringJob(null);
          void loadJobTypes();
          loadFeatures();
        }}
      />
      <AiJobTypeEditDialog
        open={creatingJob}
        onOpenChange={setCreatingJob}
        jobType={null}
        onSaved={() => {
          setCreatingJob(false);
          void loadJobTypes();
          loadFeatures();
        }}
      />

      {/* Config merge (2026-07-14): on-demand Run dialog — embeds the AI Studio
          run card for the selected runnable feature, so the AI Models page both
          governs the model AND runs the feature per the unified registry. */}
      <Dialog
        open={!!runningFeature}
        onOpenChange={(open) => {
          if (!open) setRunningFeature(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Run {runningFeature?.display_name ?? 'feature'} on demand
            </DialogTitle>
          </DialogHeader>
          {runningFeature && jobTypeMap.get(runningFeature.feature_key) && (
            <AiJobRunCard jobType={jobTypeMap.get(runningFeature.feature_key)!} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

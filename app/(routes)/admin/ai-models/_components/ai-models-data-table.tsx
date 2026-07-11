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
import { Pencil, RefreshCw, AlertTriangle, Zap } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
      if (!resp.ok) return; // 403/500 → switches simply don't render
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
  const seatOwnerIds = Array.isArray(f.config_json?.max_lane_user_ids)
    ? (f.config_json.max_lane_user_ids as unknown[])
    : [];
  if (seatOwnerIds.length > 0) {
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
  if (f.config_json?.lane === 'api_policy') {
    return (
      <Badge
        variant="outline"
        className="mt-1 text-[11px] font-normal text-muted-foreground"
        title="Serves students or other users live — Anthropic's terms don't allow a personal Max subscription to power it, so it stays on the paid API."
      >
        API only · policy
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
        const resp = await fetch('/api/admin/ai-routines/schedule', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            routineId: row.routine_id,
            enabled: next,
            daysOfWeek: row.days_of_week,
            minuteOfDay: row.minute_of_day,
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

  // Group by category for the table sectioning
  const grouped = useMemo(() => {
    if (!features) return [];
    const map = new Map<string, FeatureRow[]>();
    for (const f of features) {
      const cat = f.category ?? 'uncategorized';
      const list = map.get(cat) ?? [];
      list.push(f);
      map.set(cat, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
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
            One row per AI-powered MyJKKN feature. Pick which provider and model run it,
            set a monthly spend cap, and watch the cost. Every change is audited.
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
        <Button
          variant="outline"
          size="sm"
          onClick={loadFeatures}
          disabled={loading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
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
          {grouped.map(([category, rows]) => (
            <section key={category}>
              <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                {category}
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
                      return (
                        <TableRow key={f.feature_key} className={overCap ? 'bg-destructive/5' : undefined}>
                          <TableCell>
                            <div className="space-y-0.5">
                              <div className="font-medium">{f.display_name}</div>
                              {f.description && (
                                <div className="text-xs text-muted-foreground">{f.description}</div>
                              )}
                              <div className="text-xs text-muted-foreground/70 font-mono">
                                {f.feature_key}
                              </div>
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
                                  <div className="flex items-center justify-end gap-1 text-xs text-destructive">
                                    <AlertTriangle className="h-3 w-3" />
                                    Over cap
                                  </div>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingFeature(f)}
                              aria-label={`Edit ${f.display_name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
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
    </div>
  );
}

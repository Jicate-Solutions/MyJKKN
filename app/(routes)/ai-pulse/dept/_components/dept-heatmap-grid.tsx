// app/(routes)/ai-pulse/dept/_components/dept-heatmap-grid.tsx
// Created: 2026-06-11 — AI Pulse SOP §4 HOD oversight (department heatmap).
//
// Renders the per-department × per-cycle compliance grid produced by
// dept-heatmap-service. Cell + row coloring follows the
// consequence_tier_thresholds policy values surfaced by the service (read
// from ai_pulse_policies at runtime — never hardcoded here).
//
// Tooltips are plain-English Director's-view copy via native title
// attributes (CFT-friendly; no Radix Tooltip flake — see memory
// feedback_cft_radix_tab_and_state_setter_click_flake).

'use client';

import { CheckCircle2, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import {
  useDeptHeatmap,
  type ConsequenceTier,
  type ConsequenceTierThresholds,
  type HeatmapCell,
} from '@/lib/services/ai-pulse/dept-heatmap-service';

import { InterveneButton } from './intervene-button';

// ---------------------------------------------------------------------------
// Display vocabulary
// ---------------------------------------------------------------------------

const TIER_LABELS: Record<ConsequenceTier, string> = {
  ok: 'On track',
  nudge: 'Nudge due',
  hod_chat: 'HOD chat due',
  academic_flag: 'Academic flag',
};

const TIER_BADGE_CLASSES: Record<ConsequenceTier, string> = {
  ok: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  nudge: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  hod_chat: 'bg-orange-100 text-orange-800 border-orange-300',
  academic_flag: 'bg-red-100 text-red-800 border-red-300',
};

/**
 * Plain-English tier explanation for the row badge tooltip, e.g.
 * "2 missed weeks — a nudge is due; at 3 the HOD chat triggers."
 */
function tierTooltip(
  missCount: number,
  tier: ConsequenceTier,
  t: ConsequenceTierThresholds,
): string {
  const weeks = `${missCount} missed week${missCount === 1 ? '' : 's'}`;
  switch (tier) {
    case 'ok':
      return `${weeks} — on track. At ${t.nudge} missed week${t.nudge === 1 ? '' : 's'} a nudge is due.`;
    case 'nudge':
      return `${weeks} — a nudge is due; at ${t.hod_chat} the HOD chat triggers.`;
    case 'hod_chat':
      return `${weeks} — an HOD chat is due; at ${t.academic_flag} the academic flag triggers.`;
    case 'academic_flag':
      return `${weeks} — academic flag reached. This department needs a documented follow-up.`;
  }
}

/** Plain-English cell tooltip describing the three compliance signals. */
function cellTooltip(cell: HeatmapCell, cycleLabel: string): string {
  if (cell.is_miss) {
    return `${cycleLabel}: missed week — no engaged learner, no Domain-Sync submission, no Instagram post from this department.`;
  }
  const parts: string[] = [];
  parts.push(
    cell.attendance_count > 0
      ? `${cell.engaged_count} of ${cell.attendance_count} attendees fully engaged (${cell.engagement_pct}%)`
      : 'no live-session attendance recorded',
  );
  parts.push(
    cell.domain_sync_submitted
      ? 'Domain-Sync submitted'
      : 'Domain-Sync not submitted',
  );
  parts.push(
    cell.ig_published ? 'Instagram post published' : 'no Instagram post yet',
  );
  return `${cycleLabel}: ${parts.join(' · ')}.`;
}

/** Short IST date for the "last intervened {date}" hint (e.g. "16 Jun"). */
function formatInterventionDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
  });
}

function cellBgClass(cell: HeatmapCell): string {
  if (cell.is_miss) return 'bg-red-50 border-red-200';
  if (cell.engagement_pct >= 75 && cell.domain_sync_submitted && cell.ig_published) {
    return 'bg-emerald-50 border-emerald-200';
  }
  return 'bg-yellow-50 border-yellow-200';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeptHeatmapGrid() {
  const { data, isLoading, error } = useDeptHeatmap();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 py-6">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-red-600">
          Failed to load the heatmap: {error.message}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.cycles.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          No AI Pulse cycles found yet. The heatmap fills in once weekly
          cycles start running.
        </CardContent>
      </Card>
    );
  }

  const { cycles, rows, thresholds } = data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          Weekly compliance — last {cycles.length} cycle
          {cycles.length === 1 ? '' : 's'}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Each cell: engagement % · Domain-Sync · Instagram. Hover any cell or
          badge for the plain-English explanation. Departments with the most
          missed weeks are listed first.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-background p-2 text-left font-medium">
                  Department
                </th>
                {cycles.map((c) => (
                  <th
                    key={c.id}
                    className="p-2 text-center font-medium whitespace-nowrap"
                    title={c.name}
                  >
                    {c.demo_date ?? '—'}
                  </th>
                ))}
                <th className="p-2 text-center font-medium">Status</th>
                <th className="p-2 text-center font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.department_id} className="border-t">
                  <td className="sticky left-0 z-10 bg-background p-2 font-medium whitespace-nowrap">
                    {row.department_name}
                  </td>
                  {row.cells.map((cell, idx) => {
                    const cycleLabel =
                      cycles[idx]?.demo_date ?? cycles[idx]?.name ?? 'cycle';
                    return (
                      <td key={cell.cycle_id} className="p-1 align-middle">
                        <div
                          className={`mx-auto flex w-24 flex-col items-center gap-0.5 rounded border px-1.5 py-1 ${cellBgClass(cell)}`}
                          title={cellTooltip(cell, cycleLabel)}
                        >
                          <span className="text-xs font-semibold">
                            {cell.attendance_count > 0
                              ? `${cell.engagement_pct}%`
                              : '—'}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-0.5">
                              {cell.domain_sync_submitted ? (
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <XCircle className="h-3 w-3 text-red-400" />
                              )}
                              Sync
                            </span>
                            <span className="flex items-center gap-0.5">
                              {cell.ig_published ? (
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <XCircle className="h-3 w-3 text-red-400" />
                              )}
                              IG
                            </span>
                          </span>
                        </div>
                      </td>
                    );
                  })}
                  <td className="p-2 text-center">
                    <Badge
                      variant="outline"
                      className={TIER_BADGE_CLASSES[row.tier]}
                      title={tierTooltip(row.miss_count, row.tier, thresholds)}
                    >
                      {TIER_LABELS[row.tier]}
                      {row.miss_count > 0 ? ` (${row.miss_count})` : ''}
                    </Badge>
                  </td>
                  <td className="p-2 text-center">
                    <InterveneButton
                      departmentId={row.department_id}
                      departmentName={row.department_name}
                      missCount={row.miss_count}
                      tier={row.tier}
                      institutionId={row.institution_id}
                    />
                    {row.last_intervened_at ? (
                      <span
                        className="mt-1 block text-[10px] text-muted-foreground"
                        title={`An intervention was recorded on ${new Date(
                          row.last_intervened_at,
                        ).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST.`}
                      >
                        last intervened{' '}
                        {formatInterventionDate(row.last_intervened_at)}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            No active departments found.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

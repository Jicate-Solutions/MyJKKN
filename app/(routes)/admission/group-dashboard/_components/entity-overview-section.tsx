'use client';

// app/(routes)/admission/group-dashboard/_components/entity-overview-section.tsx
//
// One self-contained Overview block for a single organisation entity type
// (e.g. Institutions, then Schools). Renders its own KPI card strip, group
// lifecycle funnel, per-institution performance chart, and comparison table —
// all computed from just the rows belonging to this entity type.
//
// 2026-06-17: created so the Group Dashboard overview shows Institutions and
// Schools as two fully independent sections instead of one combined view.
// company / admin_office rows are already filtered out upstream in
// GroupDashboardService.getGroupDashboard.

import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { GroupFunnelChart, InstitutionPerformanceChart } from './overview-charts';
import { InstitutionComparisonTable } from './institution-comparison-table';
import { LifecycleKpiCards } from './lifecycle-kpi-cards';
import type {
  GroupDashboardData,
  InstitutionAdmissionSummary,
} from '@/types/admission-workflow-config';
import type { DrilldownMetric, DrilldownRole } from '@/lib/policies/dashboard-drilldown-keys';

/** Sum a subset of institution rows into the totals shape the charts/cards use. */
function computeTotals(
  rows: InstitutionAdmissionSummary[]
): GroupDashboardData['totals'] {
  const totals = rows.reduce(
    (acc, s) => ({
      total_leads: acc.total_leads + s.total_leads,
      total_applied: acc.total_applied + s.applied,
      total_enrolled: acc.total_enrolled + s.enrolled,
      total_rejected: acc.total_rejected + s.rejected,
      total_seats: acc.total_seats + s.total_seats,
      total_filled: acc.total_filled + s.filled_seats,
      total_enrolled_leads: acc.total_enrolled_leads + s.enrolled_leads,
      total_seat_filled_learners:
        acc.total_seat_filled_learners + s.seat_filled_learners,
      overall_fill_percentage: 0,
      total_enquiry: acc.total_enquiry + s.enquiry_count,
      total_enquiry_submitted:
        acc.total_enquiry_submitted + s.enquiry_submitted_count,
      total_account: acc.total_account + s.account_count,
      total_reserved: acc.total_reserved + s.reserved_count,
      total_admitted: acc.total_admitted + s.admitted_count,
      total_rejected_lifecycle:
        acc.total_rejected_lifecycle + s.rejected_lifecycle_count,
    }),
    {
      total_leads: 0, total_applied: 0, total_enrolled: 0, total_rejected: 0,
      total_seats: 0, total_filled: 0, total_enrolled_leads: 0,
      total_seat_filled_learners: 0, overall_fill_percentage: 0,
      total_enquiry: 0, total_enquiry_submitted: 0, total_account: 0,
      total_reserved: 0, total_admitted: 0, total_rejected_lifecycle: 0,
    }
  );
  totals.overall_fill_percentage =
    totals.total_seats > 0
      ? Math.round((totals.total_filled / totals.total_seats) * 100)
      : 0;
  return totals;
}

interface EntityOverviewSectionProps {
  title: string;
  /** Singular noun for the count badge, e.g. 'institution' / 'school'. */
  unitLabel: string;
  icon: LucideIcon;
  rows: InstitutionAdmissionSummary[];
  destinations: Partial<Record<DrilldownMetric, string | null>>;
  drilldownRole: DrilldownRole;
  selectedYear: number | null;
}

export function EntityOverviewSection({
  title,
  unitLabel,
  icon: Icon,
  rows,
  destinations,
  drilldownRole,
  selectedYear,
}: EntityOverviewSectionProps) {
  const totals = useMemo(() => computeTotals(rows), [rows]);
  const groupData = useMemo<GroupDashboardData>(
    () => ({ institutions: rows, totals }),
    [rows, totals]
  );
  const institutionIds = useMemo(() => rows.map((r) => r.institution_id), [rows]);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 border-b pb-2">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {rows.length} {rows.length === 1 ? unitLabel : `${unitLabel}s`}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No {title.toLowerCase()} data for this cohort.
        </p>
      ) : (
        <>
          <LifecycleKpiCards
            totals={totals}
            institutionIds={institutionIds}
            destinations={destinations}
            drilldownRole={drilldownRole}
            selectedYear={selectedYear}
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <GroupFunnelChart data={groupData} />
            <InstitutionPerformanceChart data={groupData} />
          </div>
          <InstitutionComparisonTable institutions={rows} />
        </>
      )}
    </section>
  );
}

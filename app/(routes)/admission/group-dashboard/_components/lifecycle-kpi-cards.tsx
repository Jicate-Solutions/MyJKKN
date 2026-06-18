'use client';

// app/(routes)/admission/group-dashboard/_components/lifecycle-kpi-cards.tsx
//
// Reusable 9-card lifecycle KPI strip. Rendered once per Overview section
// (Institutions, Schools) with that section's own totals + institution-id
// scope, so each section's cards drill down to only its own institutions.
//
// 2026-06-17: created when the Overview tab was split into per-entity-type
// sections. The card values mirror the page header strip's lifecycle path
// (the seat-tab seat-source override does not apply here — Overview always
// uses learners_profiles-sourced totals).

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TONES, LIFECYCLE_KPI_CARDS } from './kpi-config';
import type { GroupDashboardData } from '@/types/admission-workflow-config';
import type { DrilldownMetric, DrilldownRole } from '@/lib/policies/dashboard-drilldown-keys';
import { appendDashboardScope } from '@/lib/dashboard/drilldown-scope';

interface LifecycleKpiCardsProps {
  totals: GroupDashboardData['totals'];
  /** Institutions this section covers — drill-down links are scoped to these. */
  institutionIds: string[];
  /** Resolved drill-down destinations by metric (from platform_policies). */
  destinations: Partial<Record<DrilldownMetric, string | null>>;
  drilldownRole: DrilldownRole;
  selectedYear: number | null;
}

export function LifecycleKpiCards({
  totals,
  institutionIds,
  destinations,
  drilldownRole,
  selectedYear,
}: LifecycleKpiCardsProps) {
  const valueByMetric: Partial<Record<DrilldownMetric, string | number>> = {
    total_leads: totals.total_leads,
    enquiry: totals.total_enquiry,
    enquiry_submitted: totals.total_enquiry_submitted,
    account: totals.total_account,
    reserved: totals.total_reserved,
    admitted_active: totals.total_admitted,
    rejected_lifecycle: totals.total_rejected_lifecycle,
    total_seats: totals.total_seats || '—',
    fill_rate: totals.total_seats > 0 ? `${totals.overall_fill_percentage}%` : '—',
  };

  const nodes: ReactNode[] = [];
  for (const card of LIFECYCLE_KPI_CARDS) {
    const resolved = destinations[card.metric];
    const href = resolved
      ? appendDashboardScope(resolved, selectedYear, institutionIds)
      : null;
    const tone = TONES[card.tone];
    const Icon = card.icon;
    const cardInner = (
      <CardContent
        className={`flex h-full min-h-[120px] flex-col justify-between gap-2 bg-gradient-to-br ${tone.bg} p-3`}
        title={card.tooltip}
      >
        <div className="flex items-center justify-between">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone.disc} shadow-sm`}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
            {card.label}
          </p>
        </div>
        <div className="mt-auto">
          <p className={`text-2xl font-bold leading-tight ${tone.value} sm:text-3xl`}>
            {valueByMetric[card.metric]}
          </p>
          {card.tooltip && (
            <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground/70">
              {card.tooltip}
            </p>
          )}
        </div>
      </CardContent>
    );
    const cardClasses = `h-full overflow-hidden border-l-4 ${tone.accent}`;
    if (!href) {
      nodes.push(
        <Card key={card.label} className={cardClasses} aria-busy="true">
          {cardInner}
        </Card>
      );
    } else {
      nodes.push(
        <Link
          key={card.label}
          href={href}
          aria-label={`Drill down to ${card.label} (role: ${drilldownRole})`}
          className="block h-full rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Card
            className={`${cardClasses} cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-primary/20`}
          >
            {cardInner}
          </Card>
        </Link>
      );
    }
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-3">
      {nodes}
    </div>
  );
}

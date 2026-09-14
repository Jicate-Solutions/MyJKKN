// app/(routes)/resource-management/analytics-dashboard/_components/resource-analytics-export.ts
//
// What the Resource Analytics dashboard's "Export Report" button downloads:
// the "Top Performing Resources" table, with EVERY resource in the period
// rather than only the ten the card shows, in the same order.
//
// SCOPE — this file runs no query and imports no Supabase client. The page
// hands it `data.reservations.by_resource`, which useDashboardSummary() already
// loaded for the screen with the page's role-based filters (the viewer's own
// institution unless they may view all, the chosen period and institution) on
// the viewer's browser session, where row-level security applies.

import type { CsvColumn } from '@/lib/utils/csv-export';
import { formatCurrencyForCsv } from '@/lib/utils/csv-export';
import type { ResourceReservationAnalytics } from '@/types/analytics';

export interface RankedResource extends ResourceReservationAnalytics {
  rank: number;
}

/**
 * Most-reserved first, as the table sorts. Array.prototype.sort is stable, so
 * resources with the same count keep the order the table shows them in. The
 * input is copied, never sorted in place.
 */
export function rankResourcesForExport(
  rows: ResourceReservationAnalytics[]
): RankedResource[] {
  return [...rows]
    .sort((a, b) => b.reservation_count - a.reservation_count)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export const RESOURCE_ANALYTICS_EXPORT_COLUMNS: CsvColumn<RankedResource>[] = [
  { header: 'Rank', accessor: (row) => row.rank },
  { header: 'Resource Name', accessor: (row) => row.resource_name },
  { header: 'Reservations', accessor: (row) => row.reservation_count },
  { header: 'Hours Used', accessor: (row) => (row.total_hours || 0).toFixed(1) },
  {
    header: 'Utilization (%)',
    accessor: (row) => (row.utilization_rate || 0).toFixed(1)
  },
  { header: 'Revenue (₹)', accessor: (row) => formatCurrencyForCsv(row.revenue) }
];

/** e.g. "resource-analytics-last-30-days". */
export function resourceAnalyticsFilename(period: string): string {
  return `resource-analytics-${period.replace(/_/g, '-')}`;
}

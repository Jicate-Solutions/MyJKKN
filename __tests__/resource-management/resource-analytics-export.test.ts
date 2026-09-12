// @vitest-environment jsdom
// __tests__/resource-management/resource-analytics-export.test.ts
//
// The Resource Analytics "Export Report" button used to call console.log and
// nothing else (May jargon audit #954, item 15). These tests pin what it
// downloads now — the Top Performing Resources table in full — and that it
// downloads only what the dashboard already loaded for the viewer.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  RESOURCE_ANALYTICS_EXPORT_COLUMNS,
  rankResourcesForExport,
  resourceAnalyticsFilename
} from '@/app/(routes)/resource-management/analytics-dashboard/_components/resource-analytics-export';
import { downloadCsv } from '@/lib/utils/csv-export';
import type { ResourceReservationAnalytics } from '@/types/analytics';

function resource(
  id: string,
  reservation_count: number,
  overrides: Partial<ResourceReservationAnalytics> = {}
): ResourceReservationAnalytics {
  return {
    resource_id: id,
    resource_name: `Resource ${id}`,
    reservation_count,
    total_hours: 12.345,
    utilization_rate: 0,
    revenue: 1500,
    ...overrides
  };
}

describe('resource analytics export — rows and order', () => {
  it('lists every resource, most reserved first, not only the top ten the card shows', () => {
    const rows = Array.from({ length: 14 }, (_, i) => resource(`r${i}`, i));
    const ranked = rankResourcesForExport(rows);
    expect(ranked).toHaveLength(14);
    expect(ranked.map((r) => r.reservation_count)).toEqual([13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(ranked.map((r) => r.rank)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
  });

  it('keeps resources with the same count in the order the table shows them', () => {
    const ranked = rankResourcesForExport([resource('a', 2), resource('b', 5), resource('c', 2)]);
    expect(ranked.map((r) => r.resource_id)).toEqual(['b', 'a', 'c']);
  });

  it('does not reorder the dashboard data it was given', () => {
    const rows = [resource('a', 1), resource('b', 9)];
    rankResourcesForExport(rows);
    expect(rows.map((r) => r.resource_id)).toEqual(['a', 'b']);
  });
});

describe('resource analytics export — columns', () => {
  it('uses the table headers, with units in the header instead of each cell', () => {
    expect(RESOURCE_ANALYTICS_EXPORT_COLUMNS.map((c) => c.header)).toEqual([
      'Rank',
      'Resource Name',
      'Reservations',
      'Hours Used',
      'Utilization (%)',
      'Revenue (₹)'
    ]);
  });

  it('rounds hours and utilisation to one decimal, as the table does, and keeps revenue a plain number', () => {
    const [ranked] = rankResourcesForExport([
      resource('hall', 7, { resource_name: 'Seminar Hall A', total_hours: 12.345, utilization_rate: 71.26, revenue: 125000 })
    ]);
    expect(
      Object.fromEntries(RESOURCE_ANALYTICS_EXPORT_COLUMNS.map((c) => [c.header, c.accessor(ranked)]))
    ).toEqual({
      Rank: 1,
      'Resource Name': 'Seminar Hall A',
      Reservations: 7,
      'Hours Used': '12.3',
      'Utilization (%)': '71.3',
      'Revenue (₹)': '125000'
    });
  });

  it('names the file after the chosen period', () => {
    expect(resourceAnalyticsFilename('last_30_days')).toBe('resource-analytics-last-30-days');
  });
});

describe('resource analytics export — scope: only what the dashboard already loaded', () => {
  const page = readFileSync(
    join(process.cwd(), 'app/(routes)/resource-management/analytics-dashboard/page.tsx'),
    'utf8'
  );
  const exporter = readFileSync(
    join(
      process.cwd(),
      'app/(routes)/resource-management/analytics-dashboard/_components/resource-analytics-export.ts'
    ),
    'utf8'
  );

  it('the export helper cannot query anything: it imports only formatting and types', () => {
    const imported = [...exporter.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(new Set(imported)).toEqual(new Set(['@/lib/utils/csv-export', '@/types/analytics']));
    expect(exporter).not.toMatch(/SERVICE_ROLE|fetch\(|\.from\(/);
  });

  it('the page downloads the rows it loaded with its role-based filters', () => {
    expect(page).toMatch(/useAnalyticsFilters\(baseFilters\)/);
    expect(page).toMatch(/useDashboardSummary\(rbacFilters\)/);
    expect(page).toMatch(/rankResourcesForExport\(data\?\.reservations\?\.by_resource \?\? \[\]\)/);
    expect(page).not.toMatch(/Exporting analytics data/);
    expect(page).not.toMatch(/@\/lib\/supabase\/server|createServiceRoleClient/);
  });
});

describe('resource analytics export — the file the viewer receives', () => {
  it('downloads a CSV with the header row and one line per resource', async () => {
    let captured: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      captured = blob as Blob;
      return 'blob:resources';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    let filename = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      filename = this.download;
    });

    downloadCsv(
      rankResourcesForExport([resource('hall', 3, { resource_name: 'Seminar Hall, Block B' }), resource('bus', 8, { resource_name: 'Bus 4' })]),
      RESOURCE_ANALYTICS_EXPORT_COLUMNS,
      resourceAnalyticsFilename('this_month')
    );

    expect(filename).toMatch(/^resource-analytics-this-month-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = (await captured!.text()).replace(/^\uFEFF/, '').split('\n');
    expect(lines).toEqual([
      'Rank,Resource Name,Reservations,Hours Used,Utilization (%),Revenue (₹)',
      '1,Bus 4,8,12.3,0.0,1500',
      '2,"Seminar Hall, Block B",3,12.3,0.0,1500'
    ]);
  });
});

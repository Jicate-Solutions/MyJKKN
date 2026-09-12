// @vitest-environment jsdom
// __tests__/analytics/engagement-export.test.ts
//
// The Engagement Analytics "Export Data" button on /users/activity used to call
// console.log and nothing else (it was left unbuilt in #3433 because the data
// behind it was not held to the viewer's scope). These tests pin what it
// downloads now, the learner table for the current selection, and that it
// downloads only the rows the scoped route already returned to the page.
// The route side (principal: own institution, HOD: own department, 403
// otherwise) is pinned in engagement-routes-scope.test.ts.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  ENGAGEMENT_EXPORT_COLUMNS,
  engagementExportFilename,
  engagementRowsForExport
} from '@/app/(routes)/users/activity/_components/engagement-export';
import { downloadCsv } from '@/lib/utils/csv-export';
import type { StudentEngagement } from '@/types/analytics';

function learner(id: string, overrides: Partial<StudentEngagement> = {}): StudentEngagement {
  return {
    id: `score-${id}`,
    user_id: id,
    calculation_date: '2026-09-11',
    institution_id: 'inst-a',
    department_id: 'dept-a1',
    section_id: 'sec-a1',
    logins_last_7_days: 4,
    logins_last_30_days: 12,
    avg_session_duration_minutes: 12.6,
    total_time_spent_hours: 3,
    modules_accessed_count: 5,
    unique_modules_accessed: [],
    last_login_at: '2026-09-11T04:30:00.000Z',
    days_since_last_login: 0,
    section_avg_logins_7d: 3,
    section_avg_duration: 10,
    percentile_rank: 72,
    engagement_level: 'high',
    is_at_risk: false,
    risk_factors: [],
    created_at: '2026-09-11T00:00:00.000Z',
    updated_at: '2026-09-11T00:00:00.000Z',
    name: `Learner ${id}`,
    student_id: `roll-${id}`,
    section_name: 'Section A',
    ...overrides
  };
}

const row = (r: StudentEngagement) =>
  Object.fromEntries(ENGAGEMENT_EXPORT_COLUMNS.map((c) => [c.header, c.accessor(r)]));

describe('engagement export — columns', () => {
  it('uses the table columns, with units in the header, plus At Risk (the table shows it as an icon)', () => {
    expect(ENGAGEMENT_EXPORT_COLUMNS.map((c) => c.header)).toEqual([
      'Learner',
      'Learner ID',
      'Section',
      'Last Login',
      'Logins (7d)',
      'Avg Duration (min)',
      'Modules',
      'Percentile (%)',
      'Engagement',
      'At Risk'
    ]);
  });

  it('writes the values the table shows: rounded minutes, engagement label, yes/no', () => {
    const out = row(learner('1', { engagement_level: 'at_risk', is_at_risk: true }));
    expect(out).toMatchObject({
      Learner: 'Learner 1',
      'Learner ID': 'roll-1',
      Section: 'Section A',
      'Logins (7d)': 4,
      'Avg Duration (min)': 13,
      Modules: 5,
      'Percentile (%)': 72,
      Engagement: 'At Risk',
      'At Risk': 'Yes'
    });
    expect(out['Last Login']).toMatch(/^[A-Z][a-z]{2} \d{2}, \d{4} \d{2}:\d{2} (AM|PM)$/);
  });

  it('writes "Never" for no login and a blank, not "undefined", for missing values', () => {
    const out = row(
      learner('2', {
        last_login_at: undefined,
        avg_session_duration_minutes: 0,
        section_name: undefined,
        logins_last_7_days: undefined as unknown as number
      })
    );
    expect(out['Last Login']).toBe('Never');
    expect(out['Avg Duration (min)']).toBe('');
    expect(out.Section).toBeUndefined(); // downloadCsv writes undefined as an empty cell
    expect(out['Logins (7d)']).toBe(0);
  });

  it('names the file after the level', () => {
    expect(engagementExportFilename('department')).toBe('engagement-department');
  });
});

describe('engagement export — rows', () => {
  it('downloads every row the table holds, not only the page of 50 on screen, in the same order', () => {
    const rows = Array.from({ length: 120 }, (_, i) => learner(String(i), { percentile_rank: 120 - i }));
    const out = engagementRowsForExport(rows);
    expect(out).toHaveLength(120);
    expect(out.map((r) => r.user_id)).toEqual(rows.map((r) => r.user_id));
  });

  it('copies the rows and handles no data', () => {
    const rows = [learner('a'), learner('b')];
    const out = engagementRowsForExport(rows);
    expect(out).not.toBe(rows);
    expect(engagementRowsForExport(undefined)).toEqual([]);
    expect(engagementRowsForExport(null)).toEqual([]);
  });
});

describe('engagement export — scope: only the rows the scoped route returned', () => {
  const page = readFileSync(join(process.cwd(), 'app/(routes)/users/activity/page.tsx'), 'utf8');
  const exporter = readFileSync(
    join(process.cwd(), 'app/(routes)/users/activity/_components/engagement-export.ts'),
    'utf8'
  );

  it('the export helper cannot query anything: it imports only formatting and types', () => {
    const imported = [...exporter.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(new Set(imported)).toEqual(
      new Set(['date-fns', '@/lib/utils/csv-export', '@/types/analytics'])
    );
    expect(exporter).not.toMatch(/SERVICE_ROLE|createServiceRoleClient|fetch\(|\.from\(/);
  });

  it('the page downloads engagementMetrics.students, the rows useEngagementMetrics loaded for the selection', () => {
    expect(page).toMatch(/data: engagementMetrics,[\s\S]*?\} = useEngagementMetrics\(\{/);
    expect(page).toMatch(/engagementRowsForExport\(engagementMetrics\?\.students\)/);
    expect(page).toMatch(/onExport=\{handleExportEngagement\}/);
    expect(page).not.toMatch(/Export engagement data/);
    expect(page).not.toMatch(/@\/lib\/supabase\/server|createServiceRoleClient/);
  });

  it('useEngagementMetrics reads the scoped route, GET /api/analytics/engagement', () => {
    const hook = readFileSync(join(process.cwd(), 'hooks/analytics/use-engagement-metrics.ts'), 'utf8');
    expect(hook).toMatch(/fetch\(\s*`\/api\/analytics\/engagement\?\$\{params\.toString\(\)\}`/);
  });
});

describe('engagement export — the file the viewer receives', () => {
  it('downloads a CSV with the header row and one line per learner', async () => {
    let captured: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      captured = blob as Blob;
      return 'blob:engagement';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    let filename = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      filename = this.download;
    });

    downloadCsv(
      engagementRowsForExport([
        learner('1', { name: 'Anbu, Selvi', last_login_at: undefined }),
        learner('2', { name: '=cmd', engagement_level: 'low', avg_session_duration_minutes: 0 })
      ]),
      ENGAGEMENT_EXPORT_COLUMNS,
      engagementExportFilename('section')
    );

    expect(filename).toMatch(/^engagement-section-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = (await captured!.text()).replace(/^﻿/, '').split('\n');
    expect(lines[0]).toBe(
      'Learner,Learner ID,Section,Last Login,Logins (7d),Avg Duration (min),Modules,Percentile (%),Engagement,At Risk'
    );
    expect(lines[1]).toBe('"Anbu, Selvi",roll-1,Section A,Never,4,13,5,72,High,No');
    // Formula guard from the shared helper.
    expect(lines[2].startsWith("'=cmd,roll-2,Section A,")).toBe(true);
    expect(lines[2].endsWith(',4,,5,72,Low,No')).toBe(true);
    expect(lines).toHaveLength(3);
  });
});

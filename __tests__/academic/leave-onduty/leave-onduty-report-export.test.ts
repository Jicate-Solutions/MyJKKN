// @vitest-environment jsdom
// __tests__/academic/leave-onduty/leave-onduty-report-export.test.ts
//
// The Leave/OnDuty Reports "Export" button used to call console.log and nothing
// else (May jargon audit #954, item 12). These tests pin what it downloads now
// and that it downloads only the applications the page already loaded for the
// viewer — it runs no query of its own, so it cannot reach past what the
// statistics cards were counted from.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  LEAVE_ONDUTY_REPORT_EXPORT_COLUMNS,
  leaveOndutyReportFilename
} from '@/app/(routes)/academic/leave-onduty/reports/_components/leave-onduty-report-export';
import { downloadCsv } from '@/lib/utils/csv-export';
import type { LeaveOndutyApplication } from '@/types/leave-onduty';

function makeApplication(overrides: Partial<LeaveOndutyApplication> = {}): LeaveOndutyApplication {
  return {
    id: 'app-1',
    learner_id: 'learner-1',
    institution_id: 'inst-1',
    department_id: 'dept-1',
    semester_id: 'sem-1',
    section_id: 'sec-1',
    category: 'onduty',
    sub_category: 'event_participation',
    application_date: '2026-09-02',
    start_date: '2026-09-04',
    end_date: '2026-09-05',
    period_type: 'fullday',
    selected_periods: [],
    reason: 'Inter-college symposium, Salem',
    attachment_url: null,
    status: 'approved',
    current_step: 2,
    applicable_type: 'individual',
    sponsor_id: null,
    sponsor_approval_status: null,
    sponsor_comments: null,
    sponsor_action_at: null,
    created_at: '2026-09-02T06:30:00.000Z',
    updated_at: '2026-09-03T06:30:00.000Z',
    learner: {
      id: 'learner-1',
      first_name: 'Kavya',
      last_name: 'S',
      roll_number: '23CS041',
      register_number: '7123CS041',
      student_email: 'kavya@jkkn.ac.in'
    },
    institution: { id: 'inst-1', name: 'JKKN College of Engineering' },
    department: { id: 'dept-1', department_name: 'Computer Science' },
    semester: { id: 'sem-1', semester_name: 'Semester 5' },
    section: { id: 'sec-1', section_name: 'A' },
    ...overrides
  };
}

function row(app: LeaveOndutyApplication) {
  return Object.fromEntries(
    LEAVE_ONDUTY_REPORT_EXPORT_COLUMNS.map((col) => [col.header, col.accessor(app)])
  );
}

describe('leave/onduty report export — columns', () => {
  it('uses readable headers and the JKKN word Learner', () => {
    const headers = LEAVE_ONDUTY_REPORT_EXPORT_COLUMNS.map((c) => c.header);
    expect(headers).toEqual([
      'Applied On',
      'Learner',
      'Roll Number',
      'Register Number',
      'Institution',
      'Department',
      'Semester',
      'Section',
      'Category',
      'Type',
      'From',
      'To',
      'Period',
      'Status',
      'Reason',
      'Last Updated'
    ]);
    expect(headers.join(' ')).not.toMatch(/student/i);
  });

  it('maps an application to the words and date format the Leave/OnDuty screens use', () => {
    expect(row(makeApplication())).toEqual({
      'Applied On': 'Sep 02, 2026',
      Learner: 'Kavya S',
      'Roll Number': '23CS041',
      'Register Number': '7123CS041',
      Institution: 'JKKN College of Engineering',
      Department: 'Computer Science',
      Semester: 'Semester 5',
      Section: 'A',
      Category: 'On-Duty',
      Type: 'Event Participation',
      From: 'Sep 04, 2026',
      To: 'Sep 05, 2026',
      Period: 'Full Day',
      Status: 'Approved',
      Reason: 'Inter-college symposium, Salem',
      'Last Updated': 'Sep 03, 2026'
    });
  });

  it('labels leave, half days, period-wise and every status', () => {
    const values = row(
      makeApplication({ category: 'leave', sub_category: 'medical', period_type: 'forenoon', status: 'pending' })
    );
    expect(values.Category).toBe('Leave');
    expect(values.Type).toBe('Medical');
    expect(values.Period).toBe('Forenoon');
    expect(values.Status).toBe('Pending');
    expect(row(makeApplication({ period_type: 'afternoon' })).Period).toBe('Afternoon');
    expect(row(makeApplication({ period_type: 'periodwise' })).Period).toBe('Period-wise');
    expect(row(makeApplication({ status: 'rejected' })).Status).toBe('Rejected');
    expect(row(makeApplication({ status: 'cancelled' })).Status).toBe('Cancelled');
  });

  it('keeps a bare date on its own calendar day', () => {
    // "2026-09-01" read as UTC midnight shows 31 Aug west of Greenwich.
    expect(row(makeApplication({ start_date: '2026-09-01' })).From).toBe('Sep 01, 2026');
  });

  it('leaves a cell blank rather than printing "undefined" when a link is missing', () => {
    const values = row(
      makeApplication({ learner: undefined, department: undefined, semester: undefined, section: undefined, institution: undefined })
    );
    expect(values.Learner).toBe('');
    expect(values['Roll Number']).toBe('');
    expect(values.Department).toBe('');
    expect(values.Section).toBe('');
    expect(Object.values(values).join('|')).not.toMatch(/undefined|null/);
  });

  it('names the file after the chosen dates', () => {
    expect(leaveOndutyReportFilename(new Date(2026, 7, 1), new Date(2026, 8, 30))).toBe(
      'leave-onduty-report-2026-08-01-to-2026-09-30'
    );
  });
});

describe('leave/onduty report export — scope: only what the page already loaded', () => {
  const page = readFileSync(
    join(process.cwd(), 'app/(routes)/academic/leave-onduty/reports/page.tsx'),
    'utf8'
  );
  const exporter = readFileSync(
    join(
      process.cwd(),
      'app/(routes)/academic/leave-onduty/reports/_components/leave-onduty-report-export.ts'
    ),
    'utf8'
  );

  it('the export helper cannot query anything: it imports only formatting and types', () => {
    const imported = [...exporter.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(new Set(imported)).toEqual(
      new Set(['date-fns', '@/lib/utils/csv-export', '@/types/leave-onduty'])
    );
    expect(exporter).not.toMatch(/SERVICE_ROLE|fetch\(|\.from\(/);
  });

  it('the page downloads the same applications its statistics are counted from', () => {
    // One query on this page, filtered by the viewer's institution and dates…
    expect(page).toMatch(/useAllLeaveOndutyApplications\(filters\)/);
    expect(page).toMatch(/institution_id: profile\?\.institution_id/);
    // …and the export hands exactly that result to the download.
    expect(page).toMatch(/downloadCsv\(\s*applications,\s*LEAVE_ONDUTY_REPORT_EXPORT_COLUMNS/);
    expect(page).not.toMatch(/Export functionality coming soon/);
    expect(page).not.toMatch(/@\/lib\/supabase\/server|createServiceRoleClient/);
  });
});

describe('leave/onduty report export — the file the viewer receives', () => {
  it('downloads a CSV with one line per application and quotes text with commas', async () => {
    let captured: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      captured = blob as Blob;
      return 'blob:leave';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    let filename = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      filename = this.download;
    });

    downloadCsv(
      [makeApplication(), makeApplication({ id: 'app-2', category: 'leave', sub_category: 'casual' })],
      LEAVE_ONDUTY_REPORT_EXPORT_COLUMNS,
      leaveOndutyReportFilename(new Date(2026, 7, 1), new Date(2026, 8, 30))
    );

    expect(filename).toMatch(/^leave-onduty-report-2026-08-01-to-2026-09-30-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = (await captured!.text()).replace(/^\uFEFF/, '').split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0].startsWith('Applied On,Learner,Roll Number,')).toBe(true);
    expect(lines[1]).toBe(
      '"Sep 02, 2026",Kavya S,23CS041,7123CS041,JKKN College of Engineering,Computer Science,Semester 5,A,On-Duty,Event Participation,"Sep 04, 2026","Sep 05, 2026",Full Day,Approved,"Inter-college symposium, Salem","Sep 03, 2026"'
    );
    expect(lines[2]).toContain(',Leave,Casual,');
  });
});

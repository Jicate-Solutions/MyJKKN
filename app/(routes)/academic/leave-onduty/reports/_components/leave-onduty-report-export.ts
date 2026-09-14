// app/(routes)/academic/leave-onduty/reports/_components/leave-onduty-report-export.ts
//
// What the Leave/OnDuty Reports page's "Export" button downloads: every
// application behind the statistics on that page, one row each.
//
// SCOPE — this file runs no query and imports no Supabase client. The page
// hands it the `applications` array that useAllLeaveOndutyApplications(filters)
// already loaded for the screen — the viewer's own browser session (row-level
// security applies), the viewer's institution and the chosen date range. So
// the file holds exactly the rows the cards were counted from, nothing more.

import { format, parseISO } from 'date-fns';
import type { CsvColumn } from '@/lib/utils/csv-export';
import type { LeaveOndutyApplication } from '@/types/leave-onduty';

const PERIOD_LABELS: Record<string, string> = {
  fullday: 'Full Day',
  forenoon: 'Forenoon',
  afternoon: 'Afternoon',
  periodwise: 'Period-wise'
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled'
};

/**
 * Same date format the Leave/OnDuty approvals list uses. parseISO reads a bare
 * "2026-09-11" as that local day, so a date never slips to the day before.
 */
function formatDay(value: string | null | undefined): string {
  if (!value) return '';
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? value : format(date, 'MMM dd, yyyy');
}

/** "event_participation" -> "Event Participation". */
function formatType(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const LEAVE_ONDUTY_REPORT_EXPORT_COLUMNS: CsvColumn<LeaveOndutyApplication>[] = [
  { header: 'Applied On', accessor: (app) => formatDay(app.application_date) },
  {
    header: 'Learner',
    accessor: (app) =>
      [app.learner?.first_name, app.learner?.last_name].filter(Boolean).join(' ')
  },
  { header: 'Roll Number', accessor: (app) => app.learner?.roll_number || '' },
  { header: 'Register Number', accessor: (app) => app.learner?.register_number || '' },
  { header: 'Institution', accessor: (app) => app.institution?.name || '' },
  { header: 'Department', accessor: (app) => app.department?.department_name || '' },
  { header: 'Semester', accessor: (app) => app.semester?.semester_name || '' },
  { header: 'Section', accessor: (app) => app.section?.section_name || '' },
  {
    header: 'Category',
    accessor: (app) => (app.category === 'leave' ? 'Leave' : 'On-Duty')
  },
  { header: 'Type', accessor: (app) => formatType(app.sub_category) },
  { header: 'From', accessor: (app) => formatDay(app.start_date) },
  { header: 'To', accessor: (app) => formatDay(app.end_date) },
  {
    header: 'Period',
    accessor: (app) => PERIOD_LABELS[app.period_type] || formatType(app.period_type)
  },
  {
    header: 'Status',
    accessor: (app) => STATUS_LABELS[app.status] || formatType(app.status)
  },
  { header: 'Reason', accessor: (app) => app.reason || '' },
  { header: 'Last Updated', accessor: (app) => formatDay(app.updated_at) }
];

/** e.g. "leave-onduty-report-2026-08-01-to-2026-09-30". */
export function leaveOndutyReportFilename(dateFrom: Date, dateTo: Date): string {
  return `leave-onduty-report-${format(dateFrom, 'yyyy-MM-dd')}-to-${format(dateTo, 'yyyy-MM-dd')}`;
}

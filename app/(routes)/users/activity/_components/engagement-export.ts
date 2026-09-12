// app/(routes)/users/activity/_components/engagement-export.ts
//
// What the Engagement Analytics "Export Data" button downloads: the learner
// engagement table under the filters, every row it holds for the current
// selection (not only the page of 50 on screen), in the order it holds them
// (highest percentile first), with the table's columns.
//
// SCOPE — this file runs no query and imports no Supabase client. The page hands
// it `engagementMetrics.students`: the rows GET /api/analytics/engagement already
// returned for the selection on screen. That route refuses a selection outside
// the viewer's scope with a 403, and EngagementService.getMetrics() adds the
// viewer's scope to the query (principal: own institution; HOD: own
// department(s); sections they teach), so the file holds exactly the scoped
// rows the table shows.

import { format, isValid, parseISO } from 'date-fns';
import type { CsvColumn } from '@/lib/utils/csv-export';
import { ENGAGEMENT_LEVEL_CONFIG } from '@/types/analytics';
import type { OrganizationalLevel, StudentEngagement } from '@/types/analytics';

/** Last login as a date and time; "Never" as the table shows it. */
function formatLastLogin(value?: string): string {
  if (!value) return 'Never';
  const date = parseISO(value);
  return isValid(date) ? format(date, 'MMM dd, yyyy hh:mm a') : '';
}

export const ENGAGEMENT_EXPORT_COLUMNS: CsvColumn<StudentEngagement>[] = [
  { header: 'Learner', accessor: (row) => row.name },
  { header: 'Learner ID', accessor: (row) => row.student_id },
  { header: 'Section', accessor: (row) => row.section_name },
  { header: 'Last Login', accessor: (row) => formatLastLogin(row.last_login_at) },
  { header: 'Logins (7d)', accessor: (row) => row.logins_last_7_days || 0 },
  {
    header: 'Avg Duration (min)',
    accessor: (row) =>
      row.avg_session_duration_minutes ? Math.round(row.avg_session_duration_minutes) : ''
  },
  { header: 'Modules', accessor: (row) => row.modules_accessed_count || 0 },
  { header: 'Percentile (%)', accessor: (row) => row.percentile_rank || 0 },
  {
    header: 'Engagement',
    accessor: (row) => ENGAGEMENT_LEVEL_CONFIG[row.engagement_level]?.label ?? row.engagement_level
  },
  { header: 'At Risk', accessor: (row) => (row.is_at_risk ? 'Yes' : 'No') }
];

/** The rows to download: a copy of what the table holds, same order. */
export function engagementRowsForExport(
  students: StudentEngagement[] | null | undefined
): StudentEngagement[] {
  return [...(students ?? [])];
}

/** e.g. "engagement-department". downloadCsv adds the date. */
export function engagementExportFilename(level: OrganizationalLevel): string {
  return `engagement-${level}`;
}

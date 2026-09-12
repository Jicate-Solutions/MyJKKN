// app/(routes)/audit-trail/_components/audit-trail-export.ts
//
// What the Audit Trail page's "Export Logs" button downloads.
//
// SCOPE — why this export can never show a viewer more than the page does:
//  * Rows come from the same getAuditLogs() the timeline uses, called with the
//    filters object only and NO client argument. getAuditLogs() then uses the
//    browser Supabase client, i.e. the viewer's own signed-in session, so
//    row-level security on user_activity_logs decides what comes back, exactly
//    as it does for the timeline. There is no service-role path here.
//  * The page passes its own `filters` (search, action, module, severity) and
//    the service applies its 30-day window, so the export matches the screen.
//    Only limit/offset differ: the timeline shows the newest
//    AUDIT_LOG_DEFAULT_LIMIT entries, while the export pages through every
//    matching entry, up to the same ceiling the statistics cards use.

import { format } from 'date-fns';
import type { CsvColumn } from '@/lib/utils/csv-export';
import {
  getAuditLogs,
  AUDIT_STATS_MAX_ROWS
} from '@/lib/services/audit-trail/audit-service';
import type { AuditFilters, AuditLog } from '@/types/audit-trail';

/** Rows requested per round trip. PostgREST's own cap may return fewer. */
export const AUDIT_EXPORT_PAGE_SIZE = 1000;

/** Most rows one export will download — the same ceiling as the statistics. */
export const AUDIT_EXPORT_MAX_ROWS = AUDIT_STATS_MAX_ROWS;

export type AuditScreenFilters = Omit<AuditFilters, 'limit' | 'offset'>;

export interface AuditExportResult {
  logs: AuditLog[];
  /** True when more entries matched than AUDIT_EXPORT_MAX_ROWS. */
  reachedLimit: boolean;
}

function capitalise(value: string | null | undefined): string {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Columns, in the order and date format the timeline shows them. */
export const AUDIT_TRAIL_EXPORT_COLUMNS: CsvColumn<AuditLog>[] = [
  {
    header: 'Date',
    accessor: (log) => format(new Date(log.created_at), 'MMMM dd, yyyy')
  },
  {
    header: 'Time',
    accessor: (log) => format(new Date(log.created_at), 'hh:mm a')
  },
  { header: 'User', accessor: (log) => log.user?.full_name || 'System' },
  { header: 'Action', accessor: (log) => log.action },
  { header: 'Module', accessor: (log) => log.module },
  { header: 'Severity', accessor: (log) => capitalise(log.severity) },
  { header: 'Description', accessor: (log) => log.description },
  { header: 'Item', accessor: (log) => log.entity_name || '' },
  { header: 'IP Address', accessor: (log) => log.ip_address || '' }
];

/**
 * Collect every entry matching the screen's filters, newest first.
 *
 * Pages by the number of rows actually returned (not the requested size), so a
 * lower server-side row cap still reaches the end, and stops on an empty page.
 * The activity log is written continuously, so a new entry can push a row from
 * one page onto the next; rows are de-duplicated by id.
 */
export async function fetchAuditLogsForExport(
  screenFilters: AuditScreenFilters,
  fetchPage: (filters: AuditFilters) => Promise<AuditLog[]> = (filters) =>
    getAuditLogs(filters)
): Promise<AuditExportResult> {
  const logs: AuditLog[] = [];
  const seen = new Set<string>();
  let offset = 0;

  while (true) {
    const page = await fetchPage({
      ...screenFilters,
      limit: AUDIT_EXPORT_PAGE_SIZE,
      offset
    });
    if (page.length === 0) return { logs, reachedLimit: false };

    offset += page.length;
    for (const log of page) {
      if (seen.has(log.id)) continue;
      if (logs.length === AUDIT_EXPORT_MAX_ROWS) {
        return { logs, reachedLimit: true };
      }
      seen.add(log.id);
      logs.push(log);
    }
  }
}

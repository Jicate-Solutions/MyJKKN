// lib/services/audit-trail/audit-service.ts
//
// 2026-09-09: This service used to read and write `public.audit_logs`, a table
// that does not exist on production (`to_regclass('public.audit_logs')` is
// null; the migration `20250930000008_create_audit_trail_table.sql` was never
// applied and is absent from `supabase_migrations.schema_migrations`). Every
// query threw, so /audit-trail rendered an empty timeline and zeroed
// statistics, and `createAuditLog()` could never insert.
//
// The platform activity log DOES exist and is live: `public.user_activity_logs`
// (160,522 rows measured 2026-09-09, written continuously since 2025-06-21 by
// lib/utils/activity-logger-client.ts and the bulk-learner services, read by
// /users/activity, /billing/activities and the admin dashboard). Rather than
// create a second, empty audit table beside it, this service now projects the
// audit-trail shape onto that live table.
//
// Column mapping (user_activity_logs -> AuditLog):
//   id            -> id
//   user_id       -> user_id
//   action_type   -> action
//   resource_type -> entity_type AND module
//   resource_id   -> entity_id
//   resource_name -> entity_name
//   description   -> description
//   metadata      -> metadata (metadata.changes -> changes)
//   ip_address    -> ip_address
//   user_agent    -> user_agent
//   created_at    -> created_at
//
// Two deliberate consequences of that mapping, both visible to reviewers:
//
//  * `module` and `entity_type` both come from `resource_type`. The activity
//    log carries ONE taxonomy, not two, so inventing a second one would mean
//    fabricating a value. Filtering on either field therefore hits the same
//    column.
//  * `severity` is NOT stored by the activity log. It is DERIVED here from
//    `action_type` through `deriveSeverity()`, using the two literal sets
//    below. The derivation and the server-side severity filter share those
//    sets, so what the page lists and what the filter selects can never drift.
//    `createAuditLog()` still records the caller's severity in
//    `metadata.severity` so nothing is discarded, but the timeline shows the
//    derived class.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AuditLog,
  AuditFilters,
  CreateAuditLogDto,
  AuditStats,
  ActivityTimeline,
  AuditDiffField
} from '@/types/audit-trail';
import { AuditAction, AuditModule, AuditSeverity } from '@/types/audit-trail';

/** The live platform activity log. There is no `audit_logs` table. */
const ACTIVITY_TABLE = 'user_activity_logs';

const USER_EMBED = `user:profiles!user_activity_logs_user_id_fkey(id, full_name, email)`;

/**
 * Rows returned when the caller supplies no explicit limit. The activity log
 * holds six figures of rows; an unbounded select would ship all of them to the
 * browser.
 */
export const AUDIT_LOG_DEFAULT_LIMIT = 200;

/**
 * Days of history used when the caller supplies neither `from_date` nor
 * `to_date`. Keeps both the timeline and the statistics bounded and makes the
 * "Total Logs" figure mean something ("in this window") rather than "all time
 * but silently truncated".
 */
export const AUDIT_LOG_DEFAULT_WINDOW_DAYS = 30;

/**
 * Hard ceiling on the rows the statistics breakdowns aggregate over, so the
 * payload is deterministic no matter what PostgREST's own row cap is set to.
 * `total_logs` is always the exact count for the window; if a window ever holds
 * more rows than this, the breakdowns describe the most recent
 * AUDIT_STATS_MAX_ROWS of it. Measured 2026-09-09: a 30-day window on
 * production is 15,846 rows.
 */
export const AUDIT_STATS_MAX_ROWS = 20000;

/**
 * `action_type` values that describe a destructive or reversing action. Used
 * both to derive AuditSeverity.WARNING and to build the server-side filter for
 * it, so display and filtering agree by construction.
 */
export const WARNING_ACTION_TYPES: readonly string[] = [
  'delete',
  'user_delete',
  'user_deactivated',
  'deactivate',
  'archive',
  'reject',
  'cancel',
  'cancel_request',
  'cancel_approve',
  'cancel_withdraw',
  'role_revoke',
  'revoke'
];

/** `action_type` values that describe a failed operation -> AuditSeverity.ERROR. */
export const ERROR_ACTION_TYPES: readonly string[] = [
  'enquiry.fee_match_failed'
];

/** Row shape this service reads out of `user_activity_logs`. */
interface ActivityLogRow {
  id: string;
  user_id: string;
  action_type: string | null;
  resource_type: string | null;
  resource_id: string | null;
  resource_name: string | null;
  description: string | null;
  metadata: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  institution_id: string | null;
  created_at: string;
  user?: unknown;
}

type AnySupabaseClient = any;

let browserClient: AnySupabaseClient | undefined;

/**
 * Lazily resolve the Supabase client. Server callers (the /api/audit-logs route
 * handlers) pass their own request-scoped client so the query runs under the
 * caller's session and RLS applies to the right person; the browser singleton
 * is only built when no client is supplied.
 */
function resolveClient(client?: AnySupabaseClient): AnySupabaseClient {
  if (client) return client;
  if (!browserClient) browserClient = createClientSupabaseClient();
  return browserClient;
}

// ==================== MAPPING ====================

/**
 * Severity is derived, never read from a column — `user_activity_logs` has no
 * severity field. See the file header.
 */
export function deriveSeverity(actionType: string | null | undefined): AuditSeverity {
  const action = (actionType || '').toLowerCase();
  if (ERROR_ACTION_TYPES.includes(action)) return AuditSeverity.ERROR;
  if (WARNING_ACTION_TYPES.includes(action)) return AuditSeverity.WARNING;
  return AuditSeverity.INFO;
}

export function mapRowToAuditLog(row: ActivityLogRow): AuditLog {
  const metadata = (row.metadata || {}) as Record<string, any>;
  const resourceType = row.resource_type || 'system';

  return {
    id: row.id,
    user_id: row.user_id,
    action: (row.action_type || '') as AuditAction,
    // One taxonomy: the activity log's resource_type serves as both.
    module: resourceType as AuditModule,
    severity: deriveSeverity(row.action_type),
    entity_type: resourceType,
    entity_id: row.resource_id || undefined,
    entity_name: row.resource_name || undefined,
    description: row.description || '',
    changes: metadata.changes,
    metadata: {
      ...metadata,
      institution_id: metadata.institution_id ?? row.institution_id ?? undefined
    },
    ip_address: row.ip_address || undefined,
    user_agent: row.user_agent || undefined,
    created_at: row.created_at,
    user: row.user
  };
}

/** CreateAuditLogDto -> a `user_activity_logs` insert row. */
export function mapDtoToRow(dto: CreateAuditLogDto): Record<string, any> {
  return {
    user_id: dto.user_id,
    action_type: dto.action,
    resource_type: dto.entity_type,
    resource_id: dto.entity_id ?? null,
    resource_name: dto.entity_name ?? null,
    description: dto.description,
    ip_address: dto.ip_address ?? null,
    user_agent: dto.user_agent ?? null,
    institution_id: dto.metadata?.institution_id ?? null,
    metadata: {
      ...(dto.metadata || {}),
      // Kept on the record even though the timeline shows the derived class,
      // and because the activity log has no column for either.
      module: dto.module,
      severity: dto.severity || AuditSeverity.INFO,
      ...(dto.changes ? { changes: dto.changes } : {})
    }
  };
}

function defaultFromDate(): string {
  const from = new Date();
  from.setDate(from.getDate() - AUDIT_LOG_DEFAULT_WINDOW_DAYS);
  return from.toISOString();
}

/**
 * Apply every filter that maps to a column on `user_activity_logs`.
 * Returns `null` when the filter set can match nothing at all (severities the
 * derivation never produces), so callers can skip the round trip.
 */
function applyFilters(query: any, filters: AuditFilters): any | null {
  if (filters.user_id) query = query.eq('user_id', filters.user_id);
  if (filters.action) query = query.eq('action_type', filters.action);

  // module and entity_type are both resource_type. When both are supplied and
  // disagree the result is correctly empty.
  if (filters.module) query = query.eq('resource_type', filters.module);
  if (filters.entity_type) query = query.eq('resource_type', filters.entity_type);
  if (filters.entity_id) query = query.eq('resource_id', filters.entity_id);

  if (filters.severity) {
    const warningList = `(${WARNING_ACTION_TYPES.join(',')})`;
    const errorList = `(${ERROR_ACTION_TYPES.join(',')})`;
    switch (filters.severity) {
      case AuditSeverity.WARNING:
        query = query.in('action_type', WARNING_ACTION_TYPES as string[]);
        break;
      case AuditSeverity.ERROR:
        query = query.in('action_type', ERROR_ACTION_TYPES as string[]);
        break;
      case AuditSeverity.INFO:
        query = query
          .not('action_type', 'in', warningList)
          .not('action_type', 'in', errorList);
        break;
      default:
        // CRITICAL is never derived from an action type, so nothing can match.
        return null;
    }
  }

  if (filters.search) {
    query = query.or(
      `description.ilike.%${filters.search}%,resource_name.ilike.%${filters.search}%`
    );
  }

  query = query.gte('created_at', filters.from_date || defaultFromDate());
  if (filters.to_date) query = query.lte('created_at', filters.to_date);

  return query;
}

// ==================== AUDIT LOG CRUD ====================

export async function getAuditLogs(
  filters: AuditFilters = {},
  client?: AnySupabaseClient
): Promise<AuditLog[]> {
  const base = (resolveClient(client) as any)
    .from(ACTIVITY_TABLE)
    .select(`*, ${USER_EMBED}`)
    .order('created_at', { ascending: false });

  const filtered = applyFilters(base, filters);
  if (filtered === null) return [];

  const limit = filters.limit ?? AUDIT_LOG_DEFAULT_LIMIT;
  const offset = filters.offset ?? 0;
  const query = filtered.range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) throw error;
  return ((data || []) as ActivityLogRow[]).map(mapRowToAuditLog);
}

export async function getAuditLog(
  id: string,
  client?: AnySupabaseClient
): Promise<AuditLog | null> {
  const { data, error } = await (resolveClient(client) as any)
    .from(ACTIVITY_TABLE)
    .select(`*, ${USER_EMBED}`)
    .eq('id', id)
    // maybeSingle, not single: a row hidden by RLS or a bad id must surface as
    // "not found" (the route turns null into a 404), not as a thrown 500.
    .maybeSingle();

  if (error) throw error;
  return data ? mapRowToAuditLog(data as ActivityLogRow) : null;
}

export async function createAuditLog(
  dto: CreateAuditLogDto,
  client?: AnySupabaseClient
): Promise<AuditLog> {
  const { data, error } = await (resolveClient(client) as any)
    .from(ACTIVITY_TABLE)
    .insert(mapDtoToRow(dto))
    .select()
    .single();

  if (error) throw error;
  return mapRowToAuditLog(data as ActivityLogRow);
}

export async function deleteAuditLog(
  id: string,
  client?: AnySupabaseClient
): Promise<void> {
  // `.select()` on the delete so an RLS-suppressed delete (there is no DELETE
  // policy on user_activity_logs) reports failure instead of returning 204 and
  // letting the caller announce a deletion that never happened.
  const { data, error } = await (resolveClient(client) as any)
    .from(ACTIVITY_TABLE)
    .delete()
    .eq('id', id)
    .select('id');

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      'Activity log entry was not deleted (not found, or your role may not delete activity log entries).'
    );
  }
}

// ==================== STATISTICS ====================

export async function getAuditStats(
  filters: Omit<AuditFilters, 'limit' | 'offset'> = {},
  client?: AnySupabaseClient
): Promise<AuditStats> {
  const supabase = resolveClient(client);

  const stats: AuditStats = {
    total_logs: 0,
    by_action: [],
    by_module: [],
    by_severity: [],
    by_user: [],
    recent_activity: []
  };

  // Only the three columns the breakdowns need — no embed, no metadata — so a
  // month of activity stays a small payload.
  const base = (supabase as any)
    .from(ACTIVITY_TABLE)
    .select('action_type, resource_type, user_id', { count: 'exact' })
    .order('created_at', { ascending: false });

  const filtered = applyFilters(base, filters);
  if (filtered === null) return stats;

  const { data, error, count } = await filtered.limit(AUDIT_STATS_MAX_ROWS);
  if (error) throw error;

  const rows = (data || []) as Pick<
    ActivityLogRow,
    'action_type' | 'resource_type' | 'user_id'
  >[];

  stats.total_logs = count ?? rows.length;

  const actionMap = new Map<string, number>();
  const moduleMap = new Map<string, number>();
  const severityMap = new Map<string, number>();
  const userMap = new Map<string, number>();

  rows.forEach((row) => {
    const action = row.action_type || 'unknown';
    const module = row.resource_type || 'system';
    const severity = deriveSeverity(row.action_type);
    actionMap.set(action, (actionMap.get(action) || 0) + 1);
    moduleMap.set(module, (moduleMap.get(module) || 0) + 1);
    severityMap.set(severity, (severityMap.get(severity) || 0) + 1);
    if (row.user_id) userMap.set(row.user_id, (userMap.get(row.user_id) || 0) + 1);
  });

  stats.by_action = Array.from(actionMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([action, count]) => ({ action: action as AuditAction, count }));

  stats.by_module = Array.from(moduleMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([module, count]) => ({ module: module as AuditModule, count }));

  stats.by_severity = Array.from(severityMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([severity, count]) => ({ severity: severity as AuditSeverity, count }));

  const topUsers = Array.from(userMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Names for the top users only — one extra query instead of embedding the
  // profile on every row of the window.
  let names = new Map<string, string>();
  if (topUsers.length > 0) {
    const { data: profiles } = await (supabase as any)
      .from('profiles')
      .select('id, full_name')
      .in(
        'id',
        topUsers.map(([id]) => id)
      );
    names = new Map(
      ((profiles || []) as { id: string; full_name: string | null }[]).map((p) => [
        p.id,
        p.full_name || 'Unknown'
      ])
    );
  }

  stats.by_user = topUsers.map(([user_id, count]) => ({
    user_id,
    user_name: names.get(user_id) || 'Unknown',
    count
  }));

  stats.recent_activity = await getAuditLogs({ ...filters, limit: 10 }, client);

  return stats;
}

// ==================== ACTIVITY TIMELINE ====================

export async function getActivityTimeline(
  filters: Omit<AuditFilters, 'limit' | 'offset'> = {},
  client?: AnySupabaseClient
): Promise<ActivityTimeline[]> {
  const logs = await getAuditLogs(filters, client);

  // Group by date
  const dateMap = new Map<string, AuditLog[]>();
  logs.forEach((log) => {
    const date = new Date(log.created_at).toISOString().split('T')[0];
    if (!dateMap.has(date)) {
      dateMap.set(date, []);
    }
    dateMap.get(date)?.push(log);
  });

  // Convert to timeline array
  const timeline: ActivityTimeline[] = Array.from(dateMap.entries())
    .map(([date, logs]) => ({
      date,
      count: logs.length,
      logs: logs.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return timeline;
}

// ==================== ENTITY HISTORY ====================

export async function getEntityHistory(
  entityType: string,
  entityId: string,
  client?: AnySupabaseClient
): Promise<AuditLog[]> {
  return await getAuditLogs(
    {
      entity_type: entityType,
      entity_id: entityId
    },
    client
  );
}

export async function getUserActivity(
  userId: string,
  filters: Omit<AuditFilters, 'user_id'> = {},
  client?: AnySupabaseClient
): Promise<AuditLog[]> {
  return await getAuditLogs(
    {
      ...filters,
      user_id: userId
    },
    client
  );
}

// ==================== DIFF HELPERS ====================

export function computeDiff(
  before: Record<string, any>,
  after: Record<string, any>
): AuditDiffField[] {
  const diff: AuditDiffField[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  allKeys.forEach((key) => {
    const beforeValue = before[key];
    const afterValue = after[key];

    if (beforeValue === undefined && afterValue !== undefined) {
      // Field added
      diff.push({
        field: key,
        label: formatFieldName(key),
        before: null,
        after: afterValue,
        type: 'added'
      });
    } else if (beforeValue !== undefined && afterValue === undefined) {
      // Field removed
      diff.push({
        field: key,
        label: formatFieldName(key),
        before: beforeValue,
        after: null,
        type: 'removed'
      });
    } else if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      // Field changed
      diff.push({
        field: key,
        label: formatFieldName(key),
        before: beforeValue,
        after: afterValue,
        type: 'changed'
      });
    }
  });

  return diff;
}

function formatFieldName(field: string): string {
  return field
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ==================== PRE-BUILT AUDIT LOGGERS ====================

export async function logResourceCreated(
  userId: string,
  resourceId: string,
  resourceName: string,
  data: Record<string, any>
): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.CREATE,
    module: AuditModule.RESOURCE,
    severity: AuditSeverity.INFO,
    entity_type: 'resource',
    entity_id: resourceId,
    entity_name: resourceName,
    description: `Created resource "${resourceName}"`,
    changes: {
      after: data,
      fields_changed: Object.keys(data)
    },
    metadata: {
      resource_id: resourceId
    }
  });
}

export async function logResourceUpdated(
  userId: string,
  resourceId: string,
  resourceName: string,
  before: Record<string, any>,
  after: Record<string, any>
): Promise<AuditLog> {
  const diff = computeDiff(before, after);

  return await createAuditLog({
    user_id: userId,
    action: AuditAction.UPDATE,
    module: AuditModule.RESOURCE,
    severity: AuditSeverity.INFO,
    entity_type: 'resource',
    entity_id: resourceId,
    entity_name: resourceName,
    description: `Updated resource "${resourceName}" (${diff.length} fields changed)`,
    changes: {
      before,
      after,
      fields_changed: diff.map((d) => d.field)
    },
    metadata: {
      resource_id: resourceId
    }
  });
}

export async function logResourceDeleted(
  userId: string,
  resourceId: string,
  resourceName: string
): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.DELETE,
    module: AuditModule.RESOURCE,
    severity: AuditSeverity.WARNING,
    entity_type: 'resource',
    entity_id: resourceId,
    entity_name: resourceName,
    description: `Deleted resource "${resourceName}"`,
    metadata: {
      resource_id: resourceId
    }
  });
}

export async function logReservationApproved(
  userId: string,
  reservationId: string,
  resourceName: string
): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.APPROVE,
    module: AuditModule.APPROVAL,
    severity: AuditSeverity.INFO,
    entity_type: 'reservation',
    entity_id: reservationId,
    entity_name: `Reservation for ${resourceName}`,
    description: `Approved reservation for "${resourceName}"`,
    metadata: {
      reservation_id: reservationId
    }
  });
}

export async function logReservationRejected(
  userId: string,
  reservationId: string,
  resourceName: string,
  reason?: string
): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.REJECT,
    module: AuditModule.APPROVAL,
    severity: AuditSeverity.WARNING,
    entity_type: 'reservation',
    entity_id: reservationId,
    entity_name: `Reservation for ${resourceName}`,
    description: `Rejected reservation for "${resourceName}"${
      reason ? ` - Reason: ${reason}` : ''
    }`,
    metadata: {
      reservation_id: reservationId,
      custom_data: { rejection_reason: reason }
    }
  });
}

export async function logMaintenanceCompleted(
  userId: string,
  maintenanceId: string,
  resourceName: string,
  cost?: number
): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.COMPLETE,
    module: AuditModule.MAINTENANCE,
    severity: AuditSeverity.INFO,
    entity_type: 'maintenance',
    entity_id: maintenanceId,
    entity_name: `Maintenance for ${resourceName}`,
    description: `Completed maintenance for "${resourceName}"${
      cost ? ` (Cost: ₹${cost})` : ''
    }`,
    metadata: {
      maintenance_id: maintenanceId,
      custom_data: { cost }
    }
  });
}

export async function logUserLogin(
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.LOGIN,
    module: AuditModule.USER,
    severity: AuditSeverity.INFO,
    entity_type: 'user',
    entity_id: userId,
    description: 'User logged in',
    ip_address: ipAddress,
    user_agent: userAgent
  });
}

export async function logUserLogout(userId: string): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.LOGOUT,
    module: AuditModule.USER,
    severity: AuditSeverity.INFO,
    entity_type: 'user',
    entity_id: userId,
    description: 'User logged out'
  });
}

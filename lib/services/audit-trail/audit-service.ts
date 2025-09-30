// lib/services/audit-trail/audit-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';

const supabase = createClientSupabaseClient();
import type {
  AuditLog,
  AuditFilters,
  CreateAuditLogDto,
  AuditStats,
  ActivityTimeline,
  AuditDiffField
} from '@/types/audit-trail';
import { AuditAction, AuditModule, AuditSeverity } from '@/types/audit-trail';

// ==================== AUDIT LOG CRUD ====================

export async function getAuditLogs(
  filters: AuditFilters = {}
): Promise<AuditLog[]> {
  let query = supabase
    .from('audit_logs')
    .select(
      `
      *,
      user:profiles!audit_logs_user_id_fkey(id, full_name, email)
    `
    )
    .order('created_at', { ascending: false });

  if (filters.user_id) {
    query = query.eq('user_id', filters.user_id);
  }

  if (filters.action) {
    query = query.eq('action', filters.action);
  }

  if (filters.module) {
    query = query.eq('module', filters.module);
  }

  if (filters.severity) {
    query = query.eq('severity', filters.severity);
  }

  if (filters.entity_type) {
    query = query.eq('entity_type', filters.entity_type);
  }

  if (filters.entity_id) {
    query = query.eq('entity_id', filters.entity_id);
  }

  if (filters.search) {
    query = query.or(
      `description.ilike.%${filters.search}%,entity_name.ilike.%${filters.search}%`
    );
  }

  if (filters.from_date) {
    query = query.gte('created_at', filters.from_date);
  }

  if (filters.to_date) {
    query = query.lte('created_at', filters.to_date);
  }

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  if (filters.offset) {
    query = query.range(
      filters.offset,
      filters.offset + (filters.limit || 10) - 1
    );
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function getAuditLog(id: string): Promise<AuditLog | null> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select(
      `
      *,
      user:profiles!audit_logs_user_id_fkey(id, full_name, email)
    `
    )
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function createAuditLog(
  dto: CreateAuditLogDto
): Promise<AuditLog> {
  const auditData = {
    ...dto,
    severity: dto.severity || AuditSeverity.INFO
  };

  const { data, error } = await supabase
    .from('audit_logs')
    .insert(auditData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteAuditLog(id: string): Promise<void> {
  const { error } = await supabase.from('audit_logs').delete().eq('id', id);

  if (error) throw error;
}

// ==================== STATISTICS ====================

export async function getAuditStats(
  filters: Omit<AuditFilters, 'limit' | 'offset'> = {}
): Promise<AuditStats> {
  let query = supabase.from('audit_logs').select(`
    action,
    module,
    severity,
    user_id,
    user:profiles!audit_logs_user_id_fkey(id, full_name)
  `);

  if (filters.user_id) {
    query = query.eq('user_id', filters.user_id);
  }

  if (filters.from_date) {
    query = query.gte('created_at', filters.from_date);
  }

  if (filters.to_date) {
    query = query.lte('created_at', filters.to_date);
  }

  const { data: logs, error } = await query;

  if (error) throw error;

  const stats: AuditStats = {
    total_logs: logs?.length || 0,
    by_action: [],
    by_module: [],
    by_severity: [],
    by_user: [],
    recent_activity: []
  };

  // Group by action
  const actionMap = new Map<string, number>();
  logs?.forEach((log: any) => {
    actionMap.set(log.action, (actionMap.get(log.action) || 0) + 1);
  });
  stats.by_action = Array.from(actionMap.entries()).map(([action, count]) => ({
    action: action as AuditAction,
    count
  }));

  // Group by module
  const moduleMap = new Map<string, number>();
  logs?.forEach((log: any) => {
    moduleMap.set(log.module, (moduleMap.get(log.module) || 0) + 1);
  });
  stats.by_module = Array.from(moduleMap.entries()).map(([module, count]) => ({
    module: module as AuditModule,
    count
  }));

  // Group by severity
  const severityMap = new Map<string, number>();
  logs?.forEach((log: any) => {
    severityMap.set(log.severity, (severityMap.get(log.severity) || 0) + 1);
  });
  stats.by_severity = Array.from(severityMap.entries()).map(
    ([severity, count]) => ({
      severity: severity as AuditSeverity,
      count
    })
  );

  // Group by user
  const userMap = new Map<
    string,
    { user_id: string; user_name: string; count: number }
  >();
  logs?.forEach((log: any) => {
    const key = log.user_id;
    if (userMap.has(key)) {
      userMap.get(key)!.count++;
    } else {
      userMap.set(key, {
        user_id: log.user_id,
        user_name: log.user?.full_name || 'Unknown',
        count: 1
      });
    }
  });
  stats.by_user = Array.from(userMap.values());

  // Get recent activity (last 10)
  const recentLogs = await getAuditLogs({ ...filters, limit: 10 });
  stats.recent_activity = recentLogs;

  return stats;
}

// ==================== ACTIVITY TIMELINE ====================

export async function getActivityTimeline(
  filters: Omit<AuditFilters, 'limit' | 'offset'> = {}
): Promise<ActivityTimeline[]> {
  const logs = await getAuditLogs(filters);

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
  entityId: string
): Promise<AuditLog[]> {
  return await getAuditLogs({
    entity_type: entityType,
    entity_id: entityId
  });
}

export async function getUserActivity(
  userId: string,
  filters: Omit<AuditFilters, 'user_id'> = {}
): Promise<AuditLog[]> {
  return await getAuditLogs({
    ...filters,
    user_id: userId
  });
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

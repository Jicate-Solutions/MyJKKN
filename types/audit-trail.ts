// types/audit-trail.ts

import { z } from 'zod';

// ==================== ENUMS ====================

export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  VIEW = 'view',
  APPROVE = 'approve',
  REJECT = 'reject',
  CANCEL = 'cancel',
  CHECK_IN = 'check_in',
  CHECK_OUT = 'check_out',
  COMPLETE = 'complete',
  ARCHIVE = 'archive',
  RESTORE = 'restore',
  EXPORT = 'export',
  IMPORT = 'import',
  LOGIN = 'login',
  LOGOUT = 'logout'
}

export enum AuditModule {
  RESOURCE = 'resource',
  CATEGORY = 'category',
  RESERVATION = 'reservation',
  APPROVAL = 'approval',
  MAINTENANCE = 'maintenance',
  NOTIFICATION = 'notification',
  USER = 'user',
  SYSTEM = 'system'
}

export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

// ==================== INTERFACES ====================

export interface AuditLog {
  id: string;
  user_id: string;
  action: AuditAction;
  module: AuditModule;
  severity: AuditSeverity;
  entity_type: string;
  entity_id?: string;
  entity_name?: string;
  description: string;
  changes?: AuditChanges;
  metadata?: AuditMetadata;
  ip_address?: string;
  user_agent?: string;
  created_at: string;

  // Relations
  user?: any;
}

export interface AuditChanges {
  before?: Record<string, any>;
  after?: Record<string, any>;
  fields_changed?: string[];
}

export interface AuditMetadata {
  institution_id?: string;
  department_id?: string;
  resource_id?: string;
  reservation_id?: string;
  approval_id?: string;
  maintenance_id?: string;
  reference_id?: string;
  reference_type?: string;
  custom_data?: Record<string, any>;
}

// ==================== DTOs ====================

export interface CreateAuditLogDto {
  user_id: string;
  action: AuditAction;
  module: AuditModule;
  severity?: AuditSeverity;
  entity_type: string;
  entity_id?: string;
  entity_name?: string;
  description: string;
  changes?: AuditChanges;
  metadata?: AuditMetadata;
  ip_address?: string;
  user_agent?: string;
}

// ==================== FILTERS ====================

export interface AuditFilters {
  user_id?: string;
  action?: AuditAction;
  module?: AuditModule;
  severity?: AuditSeverity;
  entity_type?: string;
  entity_id?: string;
  search?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

// ==================== STATISTICS ====================

export interface AuditStats {
  total_logs: number;
  by_action: {
    action: AuditAction;
    count: number;
  }[];
  by_module: {
    module: AuditModule;
    count: number;
  }[];
  by_severity: {
    severity: AuditSeverity;
    count: number;
  }[];
  by_user: {
    user_id: string;
    user_name: string;
    count: number;
  }[];
  recent_activity: AuditLog[];
}

export interface ActivityTimeline {
  date: string;
  count: number;
  logs: AuditLog[];
}

// ==================== ZOD SCHEMAS ====================

export const createAuditLogSchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
  action: z.nativeEnum(AuditAction),
  module: z.nativeEnum(AuditModule),
  severity: z.nativeEnum(AuditSeverity).optional(),
  entity_type: z.string().min(1, 'Entity type is required'),
  entity_id: z.string().uuid().optional(),
  entity_name: z.string().optional(),
  description: z.string().min(3, 'Description must be at least 3 characters'),
  changes: z
    .object({
      before: z.record(z.any()).optional(),
      after: z.record(z.any()).optional(),
      fields_changed: z.array(z.string()).optional()
    })
    .optional(),
  metadata: z
    .object({
      institution_id: z.string().uuid().optional(),
      department_id: z.string().uuid().optional(),
      resource_id: z.string().uuid().optional(),
      reservation_id: z.string().uuid().optional(),
      approval_id: z.string().uuid().optional(),
      maintenance_id: z.string().uuid().optional(),
      reference_id: z.string().optional(),
      reference_type: z.string().optional(),
      custom_data: z.record(z.any()).optional()
    })
    .optional(),
  ip_address: z.string().optional(),
  user_agent: z.string().optional()
});

// ==================== HELPER TYPES ====================

export interface AuditDiffField {
  field: string;
  label: string;
  before: any;
  after: any;
  type: 'added' | 'removed' | 'changed';
}

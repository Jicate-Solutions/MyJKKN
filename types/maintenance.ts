// types/maintenance.ts
import { z } from 'zod';

// ==================== ENUMS ====================

export enum MaintenanceType {
  PREVENTIVE = 'preventive',
  CORRECTIVE = 'corrective',
  PREDICTIVE = 'predictive',
  EMERGENCY = 'emergency'
}

export enum MaintenanceStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  OVERDUE = 'overdue'
}

export enum MaintenancePriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4
}

// ==================== INTERFACES ====================

// Related entity types
export interface MaintenanceResource {
  id: string;
  name: string;
  resource_code: string;
  parent_category_id?: string;
  subcategory_id?: string;
}

export interface MaintenanceProfile {
  id: string;
  full_name: string;
  email: string;
  phone_number?: string;
}

export interface MaintenanceLog {
  id: string;
  resource_id: string;
  maintenance_type: MaintenanceType;
  title: string;
  description: string;
  scheduled_date: string;
  completed_date?: string;
  status: MaintenanceStatus;
  priority: MaintenancePriority;
  assigned_to_user_id?: string;
  cost?: number;
  notes?: string;
  attachments?: string[];
  created_by: string;
  created_at: string;
  updated_at: string;

  // Relations
  resource?: MaintenanceResource;
  assigned_to?: MaintenanceProfile;
  created_by_user?: MaintenanceProfile;
}

export interface MaintenanceSchedule {
  id: string;
  resource_id: string;
  maintenance_type: MaintenanceType;
  frequency_days: number; // How often maintenance occurs
  last_maintenance_date?: string;
  next_maintenance_date: string;
  is_active: boolean;
  reminder_days_before: number;
  assigned_to_user_id?: string;
  description?: string;
  estimated_cost?: number;
  created_at: string;
  updated_at: string;

  // Relations
  resource?: MaintenanceResource;
  assigned_to?: MaintenanceProfile;
}

export interface MaintenanceStats {
  total_maintenance: number;
  completed: number;
  pending: number;
  overdue: number;
  total_cost: number;
  avg_completion_time: number;
  by_type: {
    type: MaintenanceType;
    count: number;
  }[];
  by_status: {
    status: MaintenanceStatus;
    count: number;
  }[];
}

// ==================== DTOs ====================

export interface CreateMaintenanceLogDto {
  resource_id: string;
  maintenance_type: MaintenanceType;
  title: string;
  description: string;
  scheduled_date: string;
  priority: MaintenancePriority;
  assigned_to_user_id?: string;
  cost?: number;
  notes?: string;
  attachments?: string[];
}

export interface UpdateMaintenanceLogDto {
  maintenance_type?: MaintenanceType;
  title?: string;
  description?: string;
  scheduled_date?: string;
  completed_date?: string;
  status?: MaintenanceStatus;
  priority?: MaintenancePriority;
  assigned_to_user_id?: string;
  cost?: number;
  notes?: string;
  attachments?: string[];
}

export interface CreateMaintenanceScheduleDto {
  resource_id: string;
  maintenance_type: MaintenanceType;
  frequency_days: number;
  next_maintenance_date: string;
  reminder_days_before: number;
  assigned_to_user_id?: string;
  description?: string;
  estimated_cost?: number;
}

export interface UpdateMaintenanceScheduleDto {
  maintenance_type?: MaintenanceType;
  frequency_days?: number;
  next_maintenance_date?: string;
  is_active?: boolean;
  reminder_days_before?: number;
  assigned_to_user_id?: string;
  description?: string;
  estimated_cost?: number;
}

// ==================== FILTERS ====================

export interface MaintenanceLogFilters {
  resource_id?: string;
  maintenance_type?: MaintenanceType;
  status?: MaintenanceStatus;
  priority?: MaintenancePriority;
  assigned_to_user_id?: string;
  date_from?: string;
  date_to?: string;
  search_query?: string;
}

export interface MaintenanceScheduleFilters {
  resource_id?: string;
  maintenance_type?: MaintenanceType;
  is_active?: boolean;
  assigned_to_user_id?: string;
  overdue_only?: boolean;
}

// ==================== ZOD SCHEMAS ====================

export const createMaintenanceLogSchema = z.object({
  resource_id: z.string().uuid(),
  maintenance_type: z.nativeEnum(MaintenanceType),
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  scheduled_date: z.string(),
  priority: z
    .nativeEnum(MaintenancePriority)
    .default(MaintenancePriority.NORMAL),
  assigned_to_user_id: z.string().uuid().optional(),
  cost: z.number().min(0).optional(),
  notes: z.string().optional(),
  attachments: z.array(z.string()).optional()
});

export const createMaintenanceScheduleSchema = z.object({
  resource_id: z.string().uuid(),
  maintenance_type: z.nativeEnum(MaintenanceType),
  frequency_days: z.number().min(1, 'Frequency must be at least 1 day'),
  next_maintenance_date: z.string(),
  reminder_days_before: z.number().min(0).default(7),
  assigned_to_user_id: z.string().uuid().optional(),
  description: z.string().optional(),
  estimated_cost: z.number().min(0).optional()
});

// types/resource-management.ts

import { z } from 'zod';

// ===== ENUMS =====
export const CATEGORY_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ARCHIVED: 'archived'
} as const;

export const ATTRIBUTE_TYPE = {
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date',
  BOOLEAN: 'boolean',
  DROPDOWN: 'dropdown',
  TEXTAREA: 'textarea',
  EMAIL: 'email',
  URL: 'url'
} as const;

export const RESOURCE_STATUS = {
  AVAILABLE: 'available',
  OCCUPIED: 'occupied',
  MAINTENANCE: 'maintenance',
  OUT_OF_ORDER: 'out_of_order',
  RETIRED: 'retired'
} as const;

export const RESERVATION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  NO_SHOW: 'no_show'
} as const;

export const BOOKING_TYPE = {
  ALL_DAY: 'all_day',
  TIME_SLOTS: 'time_slots'
} as const;

export const APPROVAL_TYPE = {
  SEQUENTIAL: 'sequential',
  PARALLEL: 'parallel',
  CONDITIONAL: 'conditional'
} as const;

// ===== TYPE DEFINITIONS =====
export type CategoryStatus =
  (typeof CATEGORY_STATUS)[keyof typeof CATEGORY_STATUS];
export type AttributeType =
  (typeof ATTRIBUTE_TYPE)[keyof typeof ATTRIBUTE_TYPE];
export type ResourceStatus =
  (typeof RESOURCE_STATUS)[keyof typeof RESOURCE_STATUS];
export type ReservationStatus =
  (typeof RESERVATION_STATUS)[keyof typeof RESERVATION_STATUS];
export type BookingType = (typeof BOOKING_TYPE)[keyof typeof BOOKING_TYPE];
export type ApprovalType = (typeof APPROVAL_TYPE)[keyof typeof APPROVAL_TYPE];

// ===== CATEGORY MANAGEMENT INTERFACES =====

// Attribute Definition Interface
export interface AttributeDefinition {
  id: string;
  subcategory_id: string;
  attribute_key: string;
  attribute_type: AttributeType;
  is_required: boolean;
  is_multiple: boolean;
  default_value?: string;
  options?: string[]; // For dropdown type
  validation_rules?: Record<string, any>;
  display_order: number;
  description?: string;
  created_at: string;
  updated_at: string;
}

// Parent Category Interface
export interface ParentCategory {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  status: CategoryStatus;
  display_order: number;
  usage_count?: number;
  subcategories_count?: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;

  // Relations
  subcategories?: SubCategory[];
  created_by_user?: {
    id: string;
    full_name: string;
    email: string;
  };
  updated_by_user?: {
    id: string;
    full_name: string;
    email: string;
  };
}

// Sub Category Interface
export interface SubCategory {
  id: string;
  parent_category_id: string;
  name: string;
  description?: string;
  image_url?: string;
  status: CategoryStatus;
  display_order: number;
  inherit_parent_attributes: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;

  // Relations
  parent_category?: ParentCategory;
  attribute_definitions?: AttributeDefinition[];
  resources_count?: number;
  created_by_user?: {
    id: string;
    full_name: string;
    email: string;
  };
  updated_by_user?: {
    id: string;
    full_name: string;
    email: string;
  };
}

// Resource Interface
export interface Resource {
  id: string;
  name: string;
  description: string;
  parent_category_id: string;
  subcategory_id: string;
  institution_id: string;
  department_id?: string;
  building_number?: string;
  block_number?: string;
  room_number?: string;
  vendor_name?: string;
  vendor_email?: string;
  vendor_mobile?: string;
  vendor_address?: string;
  initial_stock_quantity: number;
  current_stock_quantity: number;
  caretaker_user_id?: string;
  purchase_date?: string;
  warranty_expiry_date?: string;
  maintenance_schedule?: string;
  status: ResourceStatus;
  booking_type: BookingType;
  booking_config: BookingConfiguration;
  approval_config: ApprovalConfiguration;
  reminder_config: ReminderConfiguration;
  access_roles: string[]; // Array of role IDs
  custom_attributes: Record<string, any>;
  qr_code?: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;

  // Relations
  parent_category?: ParentCategory;
  subcategory?: SubCategory;
  institution?: {
    id: string;
    name: string;
  };
  department?: {
    id: string;
    department_name: string;
  };
  caretaker?: {
    id: string;
    full_name: string;
    email: string;
    mobile?: string;
  };
  reservations?: Reservation[];
}

// Booking Configuration Interface
export interface BookingConfiguration {
  max_booking_duration?: number; // in hours
  advance_booking_limit?: number; // in days
  concurrent_booking_limit?: number;
  time_slots?: TimeSlot[];
  buffer_time?: number; // in minutes
  auto_approval_conditions?: Record<string, any>;
}

// Time Slot Interface
export interface TimeSlot {
  start_time: string; // HH:MM format
  end_time: string; // HH:MM format
  duration: number; // in minutes
  is_available: boolean;
}

// Approval Configuration Interface
export interface ApprovalConfiguration {
  approval_type: ApprovalType;
  approvers: ApproverConfig[];
  escalation_rules?: EscalationRule[];
  auto_approval_amount?: number;
}

// Approver Configuration Interface
export interface ApproverConfig {
  user_id: string;
  role_id?: string;
  order: number;
  is_required: boolean;
  can_delegate: boolean;
}

// Escalation Rule Interface
export interface EscalationRule {
  condition: string;
  escalate_to_user_id: string;
  escalate_after_hours: number;
}

// Reminder Configuration Interface
export interface ReminderConfiguration {
  reminder_frequency: number; // in hours
  reminder_recipients: string[]; // user IDs
  escalation_timeline: number; // in hours
  auto_cancellation_hours?: number;
}

// Reservation Interface
export interface Reservation {
  id: string;
  resource_id: string;
  user_id: string;
  purpose: string;
  start_date: string;
  end_date: string;
  start_time?: string;
  end_time?: string;
  status: ReservationStatus;
  approval_notes?: string;
  cancellation_reason?: string;
  no_show_notes?: string;
  created_at: string;
  updated_at: string;

  // Relations
  resource?: Resource;
  user?: {
    id: string;
    full_name: string;
    email: string;
  };
  approvals?: ReservationApproval[];
}

// Reservation Approval Interface
export interface ReservationApproval {
  id: string;
  reservation_id: string;
  approver_user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  notes?: string;
  approved_at?: string;
  created_at: string;

  // Relations
  approver?: {
    id: string;
    full_name: string;
    email: string;
  };
}

// ===== DTOs (Data Transfer Objects) =====

// Create Parent Category DTO
export interface CreateParentCategoryDto {
  name: string;
  description?: string;
  image_url?: string;
  status: CategoryStatus;
  display_order?: number;
}

// Update Parent Category DTO
export interface UpdateParentCategoryDto
  extends Partial<CreateParentCategoryDto> {
  updated_by?: string;
}

// Create Sub Category DTO
export interface CreateSubCategoryDto {
  parent_category_id: string;
  name: string;
  description?: string;
  image_url?: string;
  status: CategoryStatus;
  inherit_parent_attributes: boolean;
  display_order?: number;
  attribute_definitions?: CreateAttributeDefinitionDto[];
}

// Update Sub Category DTO
export interface UpdateSubCategoryDto extends Partial<CreateSubCategoryDto> {
  updated_by?: string;
}

// Create Attribute Definition DTO
export interface CreateAttributeDefinitionDto {
  attribute_key: string;
  attribute_type: AttributeType;
  is_required: boolean;
  is_multiple: boolean;
  default_value?: string;
  options?: string[];
  validation_rules?: Record<string, any>;
  display_order?: number;
  description?: string;
}

// Update Attribute Definition DTO
export interface UpdateAttributeDefinitionDto
  extends Partial<CreateAttributeDefinitionDto> {}

// Create Resource DTO
export interface CreateResourceDto {
  name: string;
  description: string;
  parent_category_id: string;
  subcategory_id: string;
  institution_id: string;
  department_id?: string;
  building_number?: string;
  block_number?: string;
  room_number?: string;
  vendor_name?: string;
  vendor_email?: string;
  vendor_mobile?: string;
  vendor_address?: string;
  initial_stock_quantity: number;
  caretaker_user_id?: string;
  purchase_date?: string;
  warranty_expiry_date?: string;
  maintenance_schedule?: string;
  status: ResourceStatus;
  booking_type: BookingType;
  booking_config: BookingConfiguration;
  approval_config: ApprovalConfiguration;
  reminder_config: ReminderConfiguration;
  access_roles: string[];
  custom_attributes: Record<string, any>;
}

// Update Resource DTO
export interface UpdateResourceDto extends Partial<CreateResourceDto> {
  current_stock_quantity?: number;
  updated_by?: string;
}

// Create Reservation DTO
export interface CreateReservationDto {
  resource_id: string;
  purpose: string;
  start_date: string;
  end_date: string;
  start_time?: string;
  end_time?: string;
}

// Update Reservation DTO
export interface UpdateReservationDto extends Partial<CreateReservationDto> {
  status?: ReservationStatus;
  approval_notes?: string;
  cancellation_reason?: string;
  no_show_notes?: string;
}

// ===== FILTER INTERFACES =====

// Parent Category Filters
export interface ParentCategoryFilters {
  search?: string;
  status?: CategoryStatus | 'all';
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'created_at' | 'usage_count';
  sortOrder?: 'asc' | 'desc';
}

// Sub Category Filters
export interface SubCategoryFilters {
  search?: string;
  parent_category_id?: string;
  status?: CategoryStatus;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'created_at' | 'parent_category_id';
  sortOrder?: 'asc' | 'desc';
}

// Resource Filters
export interface ResourceFilters {
  search?: string;
  parent_category_id?: string;
  subcategory_id?: string;
  institution_id?: string;
  department_id?: string;
  status?: ResourceStatus;
  booking_type?: BookingType;
  caretaker_user_id?: string;
  available_on?: string; // Date filter for availability
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'created_at' | 'status';
  sortOrder?: 'asc' | 'desc';
}

// Reservation Filters
export interface ReservationFilters {
  search?: string;
  resource_id?: string;
  user_id?: string;
  status?: ReservationStatus;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
  sortBy?: 'start_date' | 'created_at' | 'status';
  sortOrder?: 'asc' | 'desc';
}

// ===== RESPONSE INTERFACES =====

// List Response Interface
export interface ListResponse<T> {
  data: T[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Specific List Response Types
export type ParentCategoryListResponse = ListResponse<ParentCategory>;
export type SubCategoryListResponse = ListResponse<SubCategory>;
export type ResourceListResponse = ListResponse<Resource>;
export type ReservationListResponse = ListResponse<Reservation>;

// ===== VALIDATION SCHEMAS =====

// Parent Category Schema
export const parentCategorySchema = z.object({
  name: z
    .string()
    .min(1, 'Category name is required')
    .max(100, 'Name too long'),
  description: z.string().optional(),
  image_url: z.string().url().optional().or(z.literal('')),
  status: z.enum([
    CATEGORY_STATUS.ACTIVE,
    CATEGORY_STATUS.INACTIVE,
    CATEGORY_STATUS.ARCHIVED
  ]),
  display_order: z.number().min(0).optional()
});

// Sub Category Schema
export const subCategorySchema = z.object({
  parent_category_id: z.string().min(1, 'Parent category is required'),
  name: z
    .string()
    .min(1, 'Subcategory name is required')
    .max(100, 'Name too long'),
  description: z.string().optional(),
  image_url: z.string().url().optional().or(z.literal('')),
  status: z.enum([
    CATEGORY_STATUS.ACTIVE,
    CATEGORY_STATUS.INACTIVE,
    CATEGORY_STATUS.ARCHIVED
  ]),
  inherit_parent_attributes: z.boolean(),
  display_order: z.number().min(0).optional()
});

// Attribute Definition Schema
export const attributeDefinitionSchema = z.object({
  attribute_key: z
    .string()
    .min(1, 'Attribute key is required')
    .max(50, 'Key too long'),
  attribute_type: z.enum([
    ATTRIBUTE_TYPE.TEXT,
    ATTRIBUTE_TYPE.NUMBER,
    ATTRIBUTE_TYPE.DATE,
    ATTRIBUTE_TYPE.BOOLEAN,
    ATTRIBUTE_TYPE.DROPDOWN,
    ATTRIBUTE_TYPE.TEXTAREA,
    ATTRIBUTE_TYPE.EMAIL,
    ATTRIBUTE_TYPE.URL
  ]),
  is_required: z.boolean(),
  is_multiple: z.boolean(),
  default_value: z.string().optional(),
  options: z.array(z.string()).optional(),
  validation_rules: z.record(z.any()).optional(),
  display_order: z.number().min(0).optional(),
  description: z.string().optional()
});

// Resource Schema
export const resourceSchema = z.object({
  name: z
    .string()
    .min(1, 'Resource name is required')
    .max(200, 'Name too long'),
  description: z
    .string()
    .min(1, 'Description is required')
    .min(10, 'Description too short'),
  parent_category_id: z.string().min(1, 'Parent category is required'),
  subcategory_id: z.string().min(1, 'Subcategory is required'),
  institution_id: z.string().min(1, 'Institution is required'),
  department_id: z.string().optional(),
  building_number: z.string().optional(),
  block_number: z.string().optional(),
  room_number: z.string().optional(),
  vendor_name: z.string().optional(),
  vendor_email: z.string().email().optional().or(z.literal('')),
  vendor_mobile: z.string().optional(),
  vendor_address: z.string().optional(),
  initial_stock_quantity: z.number().min(1, 'Initial stock must be at least 1'),
  caretaker_user_id: z.string().optional(),
  purchase_date: z.string().optional(),
  warranty_expiry_date: z.string().optional(),
  maintenance_schedule: z.string().optional(),
  status: z.enum([
    RESOURCE_STATUS.AVAILABLE,
    RESOURCE_STATUS.OCCUPIED,
    RESOURCE_STATUS.MAINTENANCE,
    RESOURCE_STATUS.OUT_OF_ORDER,
    RESOURCE_STATUS.RETIRED
  ]),
  booking_type: z.enum([BOOKING_TYPE.ALL_DAY, BOOKING_TYPE.TIME_SLOTS]),
  access_roles: z.array(z.string()),
  custom_attributes: z.record(z.any())
});

// Reservation Schema
export const reservationSchema = z.object({
  resource_id: z.string().min(1, 'Resource is required'),
  purpose: z
    .string()
    .min(1, 'Purpose is required')
    .min(10, 'Purpose too short'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  start_time: z.string().optional(),
  end_time: z.string().optional()
});

// Export type definitions for form values
export type ParentCategoryFormValues = z.infer<typeof parentCategorySchema>;
export type SubCategoryFormValues = z.infer<typeof subCategorySchema>;
export type AttributeDefinitionFormValues = z.infer<
  typeof attributeDefinitionSchema
>;
export type ResourceFormValues = z.infer<typeof resourceSchema>;
export type ReservationFormValues = z.infer<typeof reservationSchema>;

// ===== UTILITY TYPES =====

// Bulk Operations
export interface BulkOperationResult {
  success: boolean;
  processedCount: number;
  errors: Array<{
    id: string;
    error: string;
  }>;
}

// Usage Statistics
export interface CategoryUsageStats {
  category_id: string;
  category_name: string;
  total_resources: number;
  active_resources: number;
  total_reservations: number;
  current_utilization_rate: number;
}

// Resource Availability
export interface ResourceAvailability {
  resource_id: string;
  date: string;
  time_slots: {
    start_time: string;
    end_time: string;
    is_available: boolean;
    reservation_id?: string;
  }[];
}

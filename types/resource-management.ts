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
  TIME_SLOTS: 'time_slots',
  NO_BOOKING: 'no_booking',
  // Legacy values for backward compatibility
  RESERVATION: 'reservation',
  WALK_IN: 'walk_in',
  BOTH: 'both'
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
  resource_code?: string;
  description: string;
  parent_category_id: string;
  subcategory_id: string;
  institution_id: string;
  department_id?: string;
  building_number?: string;
  block_number?: string;
  floor_number?: string;
  room_number?: string;
  location_notes?: string;
  vendor_name?: string;
  vendor_email?: string;
  vendor_contact?: string;
  vendor_mobile?: string;
  vendor_address?: string;
  initial_stock_quantity: number;
  current_stock_quantity: number;
  caretaker_user_ids?: string[]; // Support multiple caretakers
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
  image_urls?: string[];
  tags?: string[];
  usage_count?: number;
  reservation_count?: number;
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
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    designation?: string;
  };
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
  reservations?: Reservation[];
}

// ===== ENHANCED BOOKING AVAILABILITY CONFIGURATION =====

// Date Availability Configuration
export interface DateAvailabilityConfig {
  // Availability Mode
  mode: 'all_dates' | 'custom_dates' | 'weekly_pattern' | 'blackout_dates';

  // Custom Date Ranges
  custom_date_ranges?: DateRange[];

  // Weekly Pattern
  weekly_pattern?: {
    days_of_week: number[]; // 0 = Sunday, 6 = Saturday
    exclude_holidays: boolean;
  };

  // Blackout Dates
  blackout_dates?: BlackoutDate[];

  // Advanced
  advance_booking_limit?: number; // days
  same_day_booking?: boolean;
}

export interface DateRange {
  id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  label?: string;
  recurring?: {
    frequency: 'yearly' | 'monthly';
    pattern?: string;
  };
}

export interface BlackoutDate {
  id: string;
  date: string; // YYYY-MM-DD
  reason: string;
  override_roles?: string[]; // Can bypass blackout
}

// Time Slot Configuration
export interface TimeSlotConfig {
  // Operating Hours
  operating_hours: OperatingHours;

  // Slot Generation
  slot_generation: 'automatic' | 'custom';

  // Automatic Slots
  automatic_config?: {
    slot_duration: number; // minutes
    buffer_time: number; // minutes between slots
    break_times?: BreakTime[];
  };

  // Custom Slots
  custom_slots?: CustomTimeSlot[];

  // Day-Specific Schedules
  day_specific_schedules?: DaySchedule[];
}

export interface OperatingHours {
  default: {
    start: string; // HH:MM
    end: string; // HH:MM
  };
  timezone?: string;
}

export interface CustomTimeSlot {
  id: string;
  name: string; // e.g., "Morning Session"
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  max_capacity: number; // concurrent bookings
  days_of_week?: number[]; // which days this slot is available
  is_active: boolean;
}

export interface BreakTime {
  id: string;
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  reason?: string;
}

export interface DaySchedule {
  day_of_week: number; // 0-6
  operating_hours: {
    start: string;
    end: string;
  };
  custom_slots?: CustomTimeSlot[];
  is_closed?: boolean;
}

// Enhanced Booking Configuration
export interface EnhancedBookingConfiguration {
  // Enhanced fields
  date_availability?: DateAvailabilityConfig;
  time_slot_config?: TimeSlotConfig;

  // Legacy/existing fields (for backward compatibility)
  max_advance_days?: number;
  min_advance_hours?: number;
  max_duration_hours?: number;
  min_duration_hours?: number;
  max_bookings_per_user?: number;
  slot_duration?: number; // in minutes
  allow_overlap?: boolean;
  require_approval?: boolean;
  auto_cancel_no_show?: boolean;
  send_reminders?: boolean;
  operating_hours?: {
    start: string;
    end: string;
  };
  max_booking_duration?: number; // in hours
  advance_booking_limit?: number; // in days
  concurrent_booking_limit?: number;
  time_slots?: TimeSlot[];
  buffer_time?: number; // in minutes
  auto_approval_conditions?: Record<string, any>;
}

// Booking Configuration Interface (backward compatible alias)
export interface BookingConfiguration extends EnhancedBookingConfiguration {}

// Time Slot Interface
export interface TimeSlot {
  start_time: string; // HH:MM format
  end_time: string; // HH:MM format
  duration: number; // in minutes
  is_available: boolean;
}

// Approval Configuration Interface
export interface ApprovalConfiguration {
  enabled?: boolean;
  approval_type?: ApprovalType; // Sequential, Parallel, or Conditional
  approvers?: Array<{
    id: string; // Unique ID for this approver entry
    user_id?: string; // Specific user ID
    role_key?: string; // Or role key from custom_roles
    level: number; // Order/level in approval chain
    is_required: boolean; // Is this approver required?
    can_delegate?: boolean; // Can delegate to others?
  }>;
  auto_approve_hours?: number; // Auto-approve if no action after X hours
  escalation_hours?: number; // Escalate to next level after X hours
  escalation_rules?: Array<{
    from_level: number; // Escalate from this level
    to_user_id?: string; // Escalate to this user
    to_role_key?: string; // Or to this role
    condition?: string; // Condition for escalation
  }>;
  auto_approval_conditions?: Array<{
    condition_type: 'booking_hours' | 'resource_value' | 'user_role' | 'custom';
    operator: 'less_than' | 'greater_than' | 'equals' | 'contains';
    value: string | number;
    auto_approve: boolean; // Auto-approve or auto-reject
  }>;
  allow_parallel_approval?: boolean; // All approvers can approve at once
  notify_requester?: boolean; // Notify requester on status changes
  require_all_approvers?: boolean; // For parallel: require all or any?
}

// Legacy Approver Config (kept for backward compatibility)
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
  reminder_frequency?: number; // in hours
  reminder_recipients?: string[]; // user IDs or roles (requester, caretaker, approver)
  escalation_timeline?: number; // in hours
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
  resource_code?: string; // Auto-generated or custom resource code
  parent_category_id: string;
  subcategory_id: string;
  institution_id: string;
  department_id?: string;
  building_number?: string;
  block_number?: string;
  floor_number?: string;
  room_number?: string;
  location_notes?: string;
  // Vendor/Supplier fields - Structured
  vendor_name?: string;
  vendor_email?: string;
  vendor_mobile?: string;
  vendor_address_line1?: string;
  vendor_address_line2?: string;
  vendor_city?: string;
  vendor_state?: string;
  vendor_zip?: string;
  vendor_contract_details?: string;
  vendor_support_contact?: string;
  initial_stock_quantity: number;
  caretaker_user_ids?: string[]; // Support multiple caretakers
  purchase_date?: string;
  warranty_expiry_date?: string;
  maintenance_schedule?: string;
  // Lifecycle management fields
  depreciation_rate?: number; // Percentage per year
  current_value?: number; // Current calculated value
  disposal_date?: string; // Future disposal date
  status: ResourceStatus;
  booking_type: BookingType;
  booking_config: BookingConfiguration;
  approval_config: ApprovalConfiguration;
  reminder_config: ReminderConfiguration;
  access_roles: string[];
  custom_attributes: Record<string, any>;
  image_urls?: string[];
  tags?: string[];
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
  caretaker_user_ids?: string[]; // Filter by multiple caretakers
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
    .min(10, 'Description must be at least 10 characters'),
  parent_category_id: z.string().min(1, 'Parent category is required'),
  subcategory_id: z.string().min(1, 'Subcategory is required'),
  institution_id: z.string().min(1, 'Institution is required'),
  department_id: z.string().optional(),
  building_number: z.string().optional(),
  block_number: z.string().optional(),
  floor_number: z.string().optional(),
  room_number: z.string().optional(),
  location_notes: z.string().optional(),
  vendor_name: z.string().optional(),
  vendor_email: z.string().email().optional().or(z.literal('')),
  vendor_mobile: z.string().optional(),
  vendor_address_line1: z.string().optional(),
  vendor_address_line2: z.string().optional(),
  vendor_city: z.string().optional(),
  vendor_state: z.string().optional(),
  vendor_zip: z.string().optional(),
  vendor_contract_details: z.string().optional(),
  vendor_support_contact: z.string().optional(),
  initial_stock_quantity: z.number().min(1, 'Initial stock must be at least 1'),
  caretaker_user_ids: z.array(z.string()).optional(),
  purchase_date: z.string().optional(),
  warranty_expiry_date: z.string().optional(),
  maintenance_schedule: z.string().optional(),
  depreciation_rate: z.number().min(0).max(100).optional(),
  current_value: z.number().min(0).optional(),
  disposal_date: z.string().optional(),
  status: z.enum([
    RESOURCE_STATUS.AVAILABLE,
    RESOURCE_STATUS.OCCUPIED,
    RESOURCE_STATUS.MAINTENANCE,
    RESOURCE_STATUS.OUT_OF_ORDER,
    RESOURCE_STATUS.RETIRED
  ]),
  booking_type: z.enum([
    BOOKING_TYPE.RESERVATION,
    BOOKING_TYPE.WALK_IN,
    BOOKING_TYPE.BOTH
  ]),
  booking_config: z.record(z.any()).optional(),
  approval_config: z.record(z.any()).optional(),
  reminder_config: z.record(z.any()).optional(),
  access_roles: z.array(z.string()),
  custom_attributes: z.record(z.any()),
  image_urls: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional()
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

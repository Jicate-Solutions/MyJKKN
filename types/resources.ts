// types/resources.ts

// Resource Types
export type ResourceType = 'equipment' | 'facility' | 'vehicle' | 'other';
export type ResourceCondition = 'excellent' | 'good' | 'fair' | 'poor';
export type OwnerType = 'institution' | 'department' | 'program';
export type ReservationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'canceled'
  | 'completed';
export type RecurringPattern = 'daily' | 'weekly' | 'monthly' | null;

// Resource Specifications (flexible structure)
export interface ResourceSpecifications {
  [key: string]: string | number | boolean;
}

// Availability Schedule
export interface AvailabilitySchedule {
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
  saturday?: string;
  sunday?: string;
}

// Maintenance Schedule
export interface MaintenanceSchedule {
  last_maintenance_date?: string;
  next_maintenance_date?: string;
}

// Resource Module
export interface Resource {
  id: string;
  resource_name: string;
  resource_type: ResourceType;
  category_id: string;
  description?: string;
  institution_id: string;
  department_id?: string;
  building?: string;
  room?: string;
  specifications?: ResourceSpecifications;
  acquisition_date?: string;
  value?: number;
  condition: ResourceCondition;
  availability_schedule?: AvailabilitySchedule;
  is_shareable: boolean;
  sharing_restrictions?: string[];
  maintenance_schedule?: MaintenanceSchedule;
  owner_type: OwnerType;
  owner_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Include related data
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  department?: {
    id: string;
    department_code: string;
    department_name: string;
  };
  category?: {
    id: string;
    category_name: string;
  };
}

export interface CreateResourceDto {
  resource_name: string;
  resource_type: ResourceType;
  category_id: string;
  description?: string;
  institution_id: string;
  department_id?: string;
  building?: string;
  room?: string;
  specifications?: ResourceSpecifications;
  acquisition_date?: string;
  value?: number;
  condition: ResourceCondition;
  availability_schedule?: AvailabilitySchedule;
  is_shareable: boolean;
  sharing_restrictions?: string[];
  maintenance_schedule?: MaintenanceSchedule;
  owner_type: OwnerType;
  owner_id: string;
  is_active?: boolean;
}

export interface UpdateResourceDto extends Partial<CreateResourceDto> {}

export interface ResourceFilters {
  search?: string;
  institution_id?: string;
  department_id?: string;
  resource_type?: ResourceType;
  category_id?: string;
  condition?: ResourceCondition;
  is_shareable?: boolean;
  owner_type?: OwnerType;
  owner_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface ResourceListResponse {
  data: Resource[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Resource Category Module
export interface ResourceCategory {
  id: string;
  category_name: string;
  parent_category_id?: string;
  description?: string;
  attributes?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Include related data
  parent_category?: {
    id: string;
    category_name: string;
  };
  subcategories?: ResourceCategory[];
}

export interface CreateResourceCategoryDto {
  category_name: string;
  parent_category_id?: string;
  description?: string;
  attributes?: string[];
  is_active?: boolean;
}

export interface UpdateResourceCategoryDto
  extends Partial<CreateResourceCategoryDto> {}

export interface ResourceCategoryFilters {
  search?: string;
  parent_category_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface ResourceCategoryListResponse {
  data: ResourceCategory[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Reservation Module
export interface Reservation {
  id: string;
  resource_id: string;
  user_id: string;
  title: string;
  description?: string;
  start_datetime: string;
  end_datetime: string;
  status: ReservationStatus;
  purpose?: string;
  requester_institution_id: string;
  requester_department_id?: string;
  approver_id?: string;
  approval_datetime?: string;
  notes?: string;
  recurring_pattern?: RecurringPattern;
  created_at: string;
  updated_at: string;

  // Include related data
  resource?: {
    id: string;
    resource_name: string;
    resource_type: ResourceType;
  };
  user?: {
    id: string;
    name: string;
    email: string;
  };
  requester_institution?: {
    id: string;
    name: string;
  };
  requester_department?: {
    id: string;
    department_name: string;
  };
  approver?: {
    id: string;
    name: string;
  };
}

export interface CreateReservationDto {
  resource_id: string;
  user_id: string;
  title: string;
  description?: string;
  start_datetime: string;
  end_datetime: string;
  status?: ReservationStatus;
  purpose?: string;
  requester_institution_id: string;
  requester_department_id?: string;
  notes?: string;
  recurring_pattern?: RecurringPattern;
}

export interface UpdateReservationDto extends Partial<CreateReservationDto> {
  approver_id?: string;
  approval_datetime?: string;
  status?: ReservationStatus;
}

export interface ReservationFilters {
  search?: string;
  resource_id?: string;
  user_id?: string;
  status?: ReservationStatus;
  requester_institution_id?: string;
  requester_department_id?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
}

export interface ReservationListResponse {
  data: Reservation[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Sharing Policy Module
export interface PriorityLevels {
  owner_priority: number;
  same_institution_priority: number;
  other_institution_priority: number;
}

export interface PricingModel {
  internal_rate: number;
  external_rate: number;
  rate_unit: string;
}

export interface SharingPolicy {
  id: string;
  resource_type_id: string;
  institution_id?: string;
  priority_levels: PriorityLevels;
  approval_required: boolean;
  max_reservation_duration: number;
  advance_notice_required: number;
  cancellation_policy?: string;
  pricing_model?: PricingModel;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Include related data
  resource_type?: {
    id: string;
    category_name: string;
  };
  institution?: {
    id: string;
    name: string;
  };
}

export interface CreateSharingPolicyDto {
  resource_type_id: string;
  institution_id?: string;
  priority_levels: PriorityLevels;
  approval_required: boolean;
  max_reservation_duration: number;
  advance_notice_required: number;
  cancellation_policy?: string;
  pricing_model?: PricingModel;
  is_active?: boolean;
}

export interface UpdateSharingPolicyDto
  extends Partial<CreateSharingPolicyDto> {}

export interface SharingPolicyFilters {
  resource_type_id?: string;
  institution_id?: string;
  approval_required?: boolean;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface SharingPolicyListResponse {
  data: SharingPolicy[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Usage Report Module
export interface UsageMetrics {
  total_hours_used: number;
  utilization_percentage: number;
  reservation_count: number;
  unique_users: number;
  cross_institution_usage: number;
}

export interface UsageByEntity {
  [entity_id: string]: number;
}

export interface PeakUsageTimes {
  [time_slot: string]: number;
}

export interface UsageReport {
  id: string;
  resource_id: string;
  start_date: string;
  end_date: string;
  metrics: UsageMetrics;
  usage_by_institution: UsageByEntity;
  usage_by_department: UsageByEntity;
  peak_usage_times: PeakUsageTimes;
  created_at: string;

  // Include related data
  resource?: {
    id: string;
    resource_name: string;
  };
}

export interface GenerateUsageReportDto {
  resource_id: string;
  start_date: string;
  end_date: string;
}

export interface UsageReportFilters {
  resource_id?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
}

export interface UsageReportListResponse {
  data: UsageReport[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Resource Request Module
export type RequestPriority = 'low' | 'medium' | 'high';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'acquired';

export interface ResourceRequest {
  id: string;
  requester_id: string;
  resource_type: ResourceType;
  specifications?: ResourceSpecifications;
  justification: string;
  estimated_cost?: number;
  priority: RequestPriority;
  status: RequestStatus;
  approver_id?: string;
  approval_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;

  // Include related data
  requester?: {
    id: string;
    name: string;
    email: string;
  };
  approver?: {
    id: string;
    name: string;
  };
}

export interface CreateResourceRequestDto {
  requester_id: string;
  resource_type: ResourceType;
  specifications?: ResourceSpecifications;
  justification: string;
  estimated_cost?: number;
  priority: RequestPriority;
  status?: RequestStatus;
  notes?: string;
}

export interface UpdateResourceRequestDto
  extends Partial<CreateResourceRequestDto> {
  approver_id?: string;
  approval_date?: string;
  status?: RequestStatus;
}

export interface ResourceRequestFilters {
  search?: string;
  requester_id?: string;
  resource_type?: ResourceType;
  priority?: RequestPriority;
  status?: RequestStatus;
  page?: number;
  limit?: number;
}

export interface ResourceRequestListResponse {
  data: ResourceRequest[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

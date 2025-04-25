// types/digital-resources.ts

// Digital Resource Types
export type DigitalResourceType =
  | 'e-book'
  | 'journal'
  | 'software'
  | 'online-course'
  | 'streaming-media'
  | 'other';
export type AccessMethod =
  | 'direct-download'
  | 'web-portal'
  | 'license-key'
  | 'ip-restricted';
export type OwnerType = 'institution' | 'department' | 'program';
export type ReservationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'canceled'
  | 'completed';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'purchased';
export type RequestPriority = 'low' | 'medium' | 'high';

// Constants for runtime usage
export const DIGITAL_RESOURCE_TYPES = {
  EBOOK: 'e-book' as const,
  JOURNAL: 'journal' as const,
  SOFTWARE: 'software' as const,
  ONLINE_COURSE: 'online-course' as const,
  STREAMING_MEDIA: 'streaming-media' as const,
  OTHER: 'other' as const
};

export const ACCESS_METHODS = {
  DIRECT_DOWNLOAD: 'direct-download' as const,
  WEB_PORTAL: 'web-portal' as const,
  LICENSE_KEY: 'license-key' as const,
  IP_RESTRICTED: 'ip-restricted' as const
};

export const OWNER_TYPES = {
  INSTITUTION: 'institution' as const,
  DEPARTMENT: 'department' as const,
  PROGRAM: 'program' as const
};

export const RESERVATION_STATUSES = {
  PENDING: 'pending' as const,
  APPROVED: 'approved' as const,
  REJECTED: 'rejected' as const,
  CANCELED: 'canceled' as const,
  COMPLETED: 'completed' as const
};

export const REQUEST_STATUSES = {
  PENDING: 'pending' as const,
  APPROVED: 'approved' as const,
  REJECTED: 'rejected' as const,
  PURCHASED: 'purchased' as const
};

export const REQUEST_PRIORITIES = {
  LOW: 'low' as const,
  MEDIUM: 'medium' as const,
  HIGH: 'high' as const
};

// License Information
export interface LicenseInformation {
  allowed_users?: number;
  expiration_date?: string;
  usage_constraints?: string[];
}

// Access Availability
export interface AccessAvailability {
  time_restrictions?: string[];
  concurrency_limits?: number;
}

// Digital Resource Module
export interface DigitalResource {
  id: string;
  digital_resource_name: string;
  type: string;
  category_id: string;
  access_method: string;
  license_information: {
    allowed_users?: number;
    expiration_date?: string;
    usage_constraints?: string;
  };
  institution_id: string;
  department_id?: string;
  owner_type: string;
  owner_id: string;
  access_availability?: {
    time_restrictions?: boolean;
    concurrency_limits?: number;
  };
  sharing_restrictions?: string;
  maintenance_schedule?: {
    last_update?: string;
    next_update?: string;
  };
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Include related data
  category?: {
    id: string;
    category_name: string;
  };
  institution?: {
    id: string;
    name: string;
  };
  department?: {
    id: string;
    department_name: string;
  };
}

export interface DigitalResourceFilters {
  search?: string;
  category_id?: string;
  institution_id?: string;
  department_id?: string;
  type?: string;
  owner_type?: string;
  owner_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface DigitalResourceListResponse {
  data: DigitalResource[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Digital Resource Category Module
export interface DigitalResourceCategory {
  id: string;
  category_name: string;
  parent_category_id?: string;
  description?: string;
  attributes?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DigitalCategoryListResponse {
  data: DigitalResourceCategory[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Digital Reservation Module
export interface DigitalReservation {
  id: string;
  digital_resource_id: string;
  user_id: string;
  title: string;
  purpose?: string;
  reservation_start: string;
  reservation_end: string;
  status: 'pending' | 'approved' | 'rejected' | 'active' | 'completed';
  license_key?: string;
  approver_id?: string;
  approval_datetime?: string;
  is_recurring: boolean;
  created_at: string;
  updated_at: string;

  // Include related data
  digital_resource?: {
    id: string;
    digital_resource_name: string;
  };
  user?: {
    id: string;
    full_name: string;
    email: string;
  };
  approver?: {
    id: string;
    full_name: string;
  };
}

export interface CreateDigitalReservationDto {
  digital_resource_id: string;
  user_id: string;
  title: string;
  purpose?: string;
  reservation_start: string;
  reservation_end: string;
  is_recurring?: boolean;
}

export interface UpdateDigitalReservationDto
  extends Partial<CreateDigitalReservationDto> {
  status?: 'pending' | 'approved' | 'rejected' | 'active' | 'completed';
  license_key?: string;
  approver_id?: string;
  approval_datetime?: string;
}

export interface DigitalReservationFilters {
  digital_resource_id?: string;
  user_id?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'active' | 'completed';
  startDate?: string;
  endDate?: string;
  search?: string;
  isRecurring?: boolean;
  page?: number;
  limit?: number;
}

export interface DigitalReservationListResponse {
  data: DigitalReservation[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Digital Sharing Policy Module
export interface DigitalSharingPolicy {
  id: string;
  category_id: string;
  institution_id?: string;
  approval_required: boolean;
  max_concurrent_users?: number;
  advance_notice_required?: number;
  pricing_model?: {
    internal_rate: number;
    external_rate: number;
    rate_unit: string;
  };
  access_window?: {
    start_date?: string;
    end_date?: string;
  };
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Include related data
  category?: {
    id: string;
    category_name: string;
  };
  institution?: {
    id: string;
    name: string;
  };
}

export interface CreateDigitalSharingPolicyDto {
  category_id: string;
  institution_id?: string;
  approval_required: boolean;
  max_concurrent_users?: number;
  advance_notice_required?: number;
  pricing_model?: {
    internal_rate: number;
    external_rate: number;
    rate_unit: string;
  };
  access_window?: {
    start_date?: string;
    end_date?: string;
  };
  is_active?: boolean;
}

export interface UpdateDigitalSharingPolicyDto
  extends Partial<CreateDigitalSharingPolicyDto> {}

export interface DigitalSharingPolicyFilters {
  category_id?: string;
  institution_id?: string;
  approval_required?: boolean;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface DigitalSharingPolicyListResponse {
  data: DigitalSharingPolicy[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Digital Resource Usage Report Module
export interface DigitalUsageReport {
  id: string;
  digital_resource_id: string;
  digital_resource_name?: string;
  start_date: string;
  end_date: string;
  generated_at: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  report_type: 'standard' | 'detailed';
  error_message?: string;
  summary?: {
    total_views: number;
    total_downloads: number;
    unique_users: number;
    peak_usage_day?: string;
    peak_usage_count?: number;
  };
  created_at: string;
  updated_at: string;

  // Include related data
  digital_resource?: {
    id: string;
    digital_resource_name: string;
    provider?: string;
    type?: string;
  };
}

export interface GenerateDigitalUsageReportDto {
  digitalResourceId: string;
  startDate: Date | string;
  endDate: Date | string;
  reportType: 'standard' | 'detailed';
}

export interface DigitalUsageReportFilters {
  digital_resource_id?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  start_date?: string;
  end_date?: string;
  report_type?: 'standard' | 'detailed';
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface DigitalUsageReportListResponse {
  data: DigitalUsageReport[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Digital Resource Request Module
export interface DigitalResourceRequest {
  id: string;
  requester_id: string;
  digital_resource_type: DigitalResourceType;
  category_id?: string;
  justification: string;
  specifications?: Record<string, any>;
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
    id?: string;
    email: string;
    full_name?: string;
  };
  approver?: {
    id?: string;
    email: string;
    full_name?: string;
  };
  category?: {
    id: string;
    category_name: string;
  };
}

export interface CreateDigitalResourceRequestDto {
  requester_id: string;
  digital_resource_type: DigitalResourceType;
  category_id?: string;
  justification: string;
  specifications?: Record<string, any>;
  estimated_cost?: number;
  priority: RequestPriority;
  status?: RequestStatus;
  notes?: string;
}

export interface UpdateDigitalResourceRequestDto
  extends Partial<CreateDigitalResourceRequestDto> {
  approver_id?: string;
  approval_date?: string;
  status?: RequestStatus;
}

export interface DigitalResourceRequestFilters {
  search?: string;
  requester_id?: string;
  digital_resource_type?: DigitalResourceType;
  category_id?: string;
  priority?: RequestPriority;
  status?: RequestStatus;
  page?: number;
  limit?: number;
}

export interface DigitalResourceRequestListResponse {
  data: DigitalResourceRequest[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// types/applications.ts

// Base Application type
export interface Application {
  id: string;
  name: string;
  description: string;
  url: string;
  category: string;
  subcategory: string;
  integration_type: IntegrationType;
  authentication_method: AuthenticationMethod;
  display_order: number;
  is_active: boolean;
  tags: string[];
  access_permissions: string[];
  support_contact: SupportContact;
  supported_platforms: SupportedPlatform;
  application_type: ApplicationType;
  data_sensitivity_level: SensitivityLevel;
  api_endpoints?: ApiEndpoint[];
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// Stats interface
export interface ApplicationStats {
  total: number;
  active: number;
  internal: number;
  external: number;
}

// Support contact interface
export interface SupportContact {
  name: string;
  email: string;
  phone?: string;
}

// API Endpoint interface
export interface ApiEndpoint {
  name: string;
  endpoint: string;
  method: HttpMethod;
  description?: string;
}

// Enums for various application properties
export enum IntegrationType {
  DirectLink = 'Direct Link',
  Embedded = 'Embedded',
  APIIntegration = 'API Integration'
}

export enum AuthenticationMethod {
  SSO = 'SSO',
  SeparateLogin = 'Separate Login',
  NoAuthentication = 'No Authentication'
}

export enum SupportedPlatform {
  Web = 'Web',
  Mobile = 'Mobile',
  Both = 'Both'
}

export enum ApplicationType {
  Internal = 'Internal',
  External = 'External'
}

export enum SensitivityLevel {
  Public = 'Public',
  Internal = 'Internal',
  Confidential = 'Confidential',
  Restricted = 'Restricted'
}

export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH'
}

// Database types for Supabase
export interface Database {
  public: {
    Tables: {
      applications: {
        Row: Application;
        Insert: Omit<Application, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Application, 'id' | 'created_at' | 'updated_at'>>;
      };
    };
  };
}

// Form data type for creating/editing applications
export interface ApplicationFormData
  extends Omit<Application, 'id' | 'created_at' | 'updated_at' | 'created_by'> {
  id?: string;
}

// Response type for API calls
export interface ApplicationResponse {
  data: Application | null;
  error: Error | null;
}

// Filter options type
export interface ApplicationFilter {
  category?: string;
  type?: ApplicationType;
  platform?: SupportedPlatform;
  status?: boolean;
}

// Sort options type
export interface ApplicationSort {
  field: keyof Application;
  direction: 'asc' | 'desc';
}

// Stats calculation helper type
export interface StatsCalculation {
  applications: Application[];
  filter?: ApplicationFilter;
}

// Export data type
export interface ApplicationExportData {
  'Application Name': string;
  Description: string;
  URL: string;
  Category: string;
  Subcategory: string;
  'Integration Type': string;
  'Authentication Method': string;
  'Display Order': number;
  Status: string;
  Tags: string;
  'Access Permissions': string;
  'Support Contact': string;
  'Supported Platforms': string;
  'Application Type': string;
  'Data Sensitivity Level': string;
  'Created At': string;
  'Updated At': string;
}

// Constants
export const DEFAULT_SORT: ApplicationSort = {
  field: 'display_order',
  direction: 'asc'
};

export const DEFAULT_FILTER: ApplicationFilter = {};

export const DEFAULT_STATS: ApplicationStats = {
  total: 0,
  active: 0,
  internal: 0,
  external: 0
};

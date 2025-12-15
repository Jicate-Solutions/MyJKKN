// types/applications.ts

export type IntegrationType = 'direct_link' | 'embedded' | 'api';
export type AuthMethod = 'sso' | 'separate_login' | 'none';
export type PlatformType = 'web' | 'mobile' | 'both';
export type AppType = 'internal' | 'external';
export type SensitivityLevel = 'public' | 'restricted' | 'confidential';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

// New support contact interface
export interface SupportContact {
  name: string;
  email: string;
  phone: string | null;
}

// Enhanced API endpoint interface
export interface ApiEndpoint {
  name: string;
  url: string;
  method: HttpMethod;
  description: string | null;
  is_active: boolean;
}

export interface Application {
  id: string;
  name: string;
  url: string;
  description: string | null;
  category_id: string;
  category?: {
    id: string;
    name: string;
    description: string | null;
  };
  subcategory_id?: string | null;
  subcategory?: {
    id: string;
    name: string;
  };
  roles_access: string[];
  display_order: number;
  is_active: boolean;
  integration_type: IntegrationType;
  auth_method: AuthMethod;
  tags: string[];
  support_contact: SupportContact | null; // Changed to use SupportContact interface
  supported_platforms: PlatformType;
  api_endpoints: ApiEndpoint[]; // Using enhanced ApiEndpoint interface
  application_type: AppType;
  data_sensitivity: SensitivityLevel;
  icon_path: string | null; // New field for application icon
  screenshots: string[] | null; // New field for application screenshots
  created_by: string;
  created_at: string;
  updated_at: string;
  // Parent authentication fields (optional)
  // Note: Uses existing roles_access field for role-based permissions
  uses_parent_auth?: boolean;
  app_id?: string | null;
  api_key_hash?: string | null;
  allowed_redirect_uris?: string[] | null;
  allowed_scopes?: string[] | null;
  rate_limit_requests?: number;
  rate_limit_window_minutes?: number;
  last_auth_activity?: string | null;
  auth_enabled_at?: string | null;
  auth_enabled_by?: string | null;
}

export type CreateApplicationDTO = Omit<
  Application,
  'id' | 'created_by' | 'created_at' | 'updated_at'
>;

export type UpdateApplicationDTO = Partial<CreateApplicationDTO>;

// API Key types for Database
export interface ApiKeyPermissions {
  read: boolean;
  write: boolean;
}

export interface ApiKeyMetadata {
  role?: string;
  description?: string;
  [key: string]: unknown;
}

export interface ApiKey {
  id: string;
  name: string;
  key_value: string;
  created_by: string;
  expires_at: string | null;
  last_used_at: string | null;
  is_active: boolean;
  permissions: ApiKeyPermissions;
  metadata?: ApiKeyMetadata;
  created_at: string;
  updated_at: string;
}

// Database types for Supabase
export interface Database {
  public: {
    Tables: {
      applications: {
        Row: Application;
        Insert: CreateApplicationDTO;
        Update: UpdateApplicationDTO;
      };
      api_keys: {
        Row: ApiKey;
        Insert: Omit<ApiKey, 'id' | 'created_at' | 'updated_at' | 'last_used_at'>;
        Update: Partial<Omit<ApiKey, 'id' | 'created_at' | 'updated_at'>>;
      };
    };
  };
}

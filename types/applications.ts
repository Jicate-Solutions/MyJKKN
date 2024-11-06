// types/applications.ts

export type IntegrationType = 'direct_link' | 'embedded' | 'api';
export type AuthMethod = 'sso' | 'separate_login' | 'none';
export type PlatformType = 'web' | 'mobile' | 'both';
export type AppType = 'internal' | 'external';
export type SensitivityLevel = 'public' | 'restricted' | 'confidential';

export interface ApiEndpoint {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  description?: string;
}

export interface Application {
  id: string;
  name: string;
  url: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  roles_access: string[];
  display_order: number;
  is_active: boolean;
  integration_type: IntegrationType;
  auth_method: AuthMethod;
  tags: string[];
  support_contact: string | null;
  supported_platforms: PlatformType;
  api_endpoints: ApiEndpoint[];
  application_type: AppType;
  data_sensitivity: SensitivityLevel;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type CreateApplicationDTO = Omit<
  Application,
  'id' | 'created_by' | 'created_at' | 'updated_at'
>;

export type UpdateApplicationDTO = Partial<CreateApplicationDTO>;

// Database types for Supabase
export interface Database {
  public: {
    Tables: {
      applications: {
        Row: Application;
        Insert: CreateApplicationDTO;
        Update: UpdateApplicationDTO;
      };
    };
  };
}

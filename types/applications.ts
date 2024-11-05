// types/applications.ts

export interface ApplicationEndpoint {
  name: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  description?: string;
}

export interface SupportContact {
  name: string;
  email: string;
  phone?: string;
}

export interface Application {
  id: string;
  name: string;
  description: string;
  url: string;
  category: string;
  subcategory: string;
  integration_type: 'Direct Link' | 'Embedded' | 'API Integration';
  authentication_method: 'SSO' | 'Separate Login' | 'No Authentication';
  display_order: number;
  is_active: boolean;
  tags: string[];
  access_permissions: string[];
  support_contact: SupportContact;
  supported_platforms: 'Web' | 'Mobile' | 'Both';
  application_type: 'Internal' | 'External';
  data_sensitivity_level: 'Public' | 'Internal' | 'Confidential' | 'Restricted';
  api_endpoints: ApplicationEndpoint[];
  created_by?: string;
  created_at: string;
  updated_at: string;
}

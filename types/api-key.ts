// types/api-key.ts

export interface ApiKey {
  id: string;
  name: string;
  key_value: string;
  created_by: string;
  expires_at: string | null;
  last_used_at: string | null;
  is_active: boolean;
  permissions: string[];
  organization_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateApiKeyInput {
  name: string;
  isActive: boolean;
  permissions: string[];
  organizationId: string | null;
}

export interface UpdateApiKeyInput {
  name?: string;
  isActive?: boolean;
  permissions?: string[];
  organizationId?: string | null;
}

// For database definition
export interface Database {
  public: {
    Tables: {
      api_keys: {
        Row: ApiKey;
        Insert: Omit<
          ApiKey,
          | 'id'
          | 'created_at'
          | 'updated_at'
          | 'last_used_at'
          | 'created_by'
        > & {
          created_by?: string;
        };
        Update: Partial<Omit<ApiKey, 'id' | 'created_at' | 'updated_at'>>;
      };
    };
  };
}

// types/api-keys.ts

export interface ApiKeyPermissions {
  read: boolean;
  write: boolean;
}

export interface ApiKeyMetadata {
  role?: string;
  description?: string;
  [key: string]: any;
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

export interface CreateApiKeyInput {
  name: string;
  expires_at?: string | null;
  permissions?: ApiKeyPermissions;
  metadata?: ApiKeyMetadata;
}

export interface UpdateApiKeyInput {
  name?: string;
  is_active?: boolean;
  expires_at?: string | null;
  permissions?: ApiKeyPermissions;
  metadata?: ApiKeyMetadata;
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
          | 'key_value'
        > & {
          key_value?: string;
          created_by?: string;
        };
        Update: Partial<
          Omit<
            ApiKey,
            'id' | 'created_at' | 'updated_at' | 'key_value' | 'created_by'
          >
        >;
      };
    };
  };
}

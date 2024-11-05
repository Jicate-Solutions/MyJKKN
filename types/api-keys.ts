// types/api-keys.ts

export interface APIKeyPermissions {
  read: boolean;
  write: boolean;
}

export interface APIKey {
  id: string;
  name: string;
  key_value: string;
  user_id: string;
  created_by: string | null;
  permissions: APIKeyPermissions;
  scope: string[];
  expires_at: string | null;
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type APIKeyWithoutValue = Omit<APIKey, 'key_value'>;

export interface CreateAPIKeyRequest {
  name: string;
  expires_at?: string | null;
  permissions?: APIKeyPermissions;
  scope?: string[];
}

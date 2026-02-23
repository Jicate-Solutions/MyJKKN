import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Define ApiKey types here since there seems to be an issue with the import.
// key_value is intentionally excluded — it must never be returned to callers.
interface ApiKey {
  id: string;
  name: string;
  created_by: string;
  expires_at: string | null;
  last_used_at: string | null;
  is_active: boolean;
  permissions: string[] | { read: boolean; write: boolean };
  organization_id: string | null;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateApiKeyInput {
  name: string;
  isActive: boolean;
  permissions: string[] | { read: boolean; write: boolean };
  organizationId: string | null;
  institutionId?: string | null;
}

interface UpdateApiKeyInput {
  name?: string;
  isActive?: boolean;
  permissions?: string[] | { read: boolean; write: boolean };
  organizationId?: string | null;
}

// Function to hash API key
export async function hashApiKey(apiKey: string): Promise<string> {
  return createHash('sha256').update(apiKey).digest('hex');
}

export class ApiKeyService {
  // Use service role client per-call so this module works in server-only
  // contexts (API routes, server actions) and bypasses RLS for admin ops.
  private static getClient() {
    return createServiceRoleClient();
  }

  // Generate a random API key
  private static generateKeyValue(): string {
    const key = `jkkn_${uuidv4().replace(/-/g, '')}`;
    return key;
  }

  // Hash an API key for verification
  private static async hashKey(key: string): Promise<string> {
    return hashApiKey(key);
  }

  // Create a new API key
  static async createApiKey(
    input: CreateApiKeyInput
  ): Promise<{ key: ApiKey; plainTextKey: string } | null> {
    try {
      const plainTextKey = this.generateKeyValue();
      const hashedKey = await this.hashKey(plainTextKey);

      const { data: key, error } = await this.getClient()
        .from('api_keys')
        .insert({
          key_value: hashedKey,
          name: input.name,
          is_active: input.isActive,
          permissions: input.permissions,
          organization_id: input.organizationId,
          institution_id: input.institutionId ?? null,
        })
        .select('*')
        .single();

      if (error) {
        console.error('Error creating API key:', error);
        return null;
      }

      return {
        key,
        plainTextKey,
      };
    } catch (error) {
      console.error('Error in createApiKey:', error);
      return null;
    }
  }

  // Get all API keys
  // institutionId: when provided, filters to that tenant only.
  // When null/undefined, returns all keys (caller must ensure super_admin authorization).
  static async getApiKeys(institutionId?: string | null): Promise<ApiKey[]> {
    try {
      const query = this.getClient()
        .from('api_keys')
        .select('id, name, is_active, permissions, institution_id, organization_id, created_by, created_at, updated_at, last_used_at, expires_at')
        .order('created_at', { ascending: false });

      if (institutionId) {
        query.eq('institution_id', institutionId);
      }

      const { data: keys, error } = await query;

      if (error) {
        console.error('Error fetching API keys:', error);
        throw error;
      }

      return keys || [];
    } catch (error) {
      console.error('Error in getApiKeys:', error);
      return [];
    }
  }

  // Update an API key
  // institutionId: when provided, scoped to that tenant to prevent cross-tenant mutations.
  static async updateApiKey(
    id: string,
    input: UpdateApiKeyInput,
    institutionId?: string | null
  ): Promise<ApiKey | null> {
    try {
      const query = this.getClient()
        .from('api_keys')
        .update({
          name: input.name,
          is_active: input.isActive,
          permissions: input.permissions,
          organization_id: input.organizationId,
        })
        .eq('id', id);

      if (institutionId) {
        query.eq('institution_id', institutionId);
      }

      const { data: key, error } = await query.select('*').single();

      if (error) {
        console.error('Error updating API key:', error);
        throw error;
      }

      return key;
    } catch (error) {
      console.error('Error in updateApiKey:', error);
      return null;
    }
  }

  // Delete an API key
  // institutionId: when provided, scoped to that tenant to prevent cross-tenant deletions.
  static async deleteApiKey(id: string, institutionId?: string | null): Promise<boolean> {
    try {
      const query = this.getClient()
        .from('api_keys')
        .delete()
        .eq('id', id);

      if (institutionId) {
        query.eq('institution_id', institutionId);
      }

      const { error } = await query;

      if (error) {
        console.error('Error deleting API key:', error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Error in deleteApiKey:', error);
      return false;
    }
  }

  // Generate a test API key for development
  // institutionId must be supplied to scope the key to a specific tenant.
  static async generateTestApiKey(institutionId?: string | null): Promise<{ key: ApiKey; plainTextKey: string } | null> {
    try {
      const result = await this.createApiKey({
        name: 'Test API Key',
        isActive: true,
        permissions: ['read', 'write'],
        organizationId: null,
        institutionId: institutionId ?? null,
      });

      if (!result) {
        throw new Error('Failed to create test API key');
      }

      return result;
    } catch (error) {
      console.error('Error generating test API key:', error);
      return null;
    }
  }
}

import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// Define ApiKey types here since there seems to be an issue with the import
interface ApiKey {
  id: string;
  name: string;
  key_value: string;
  created_by: string;
  expires_at: string | null;
  last_used_at: string | null;
  is_active: boolean;
  permissions: string[] | { read: boolean; write: boolean };
  organization_id: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateApiKeyInput {
  name: string;
  isActive: boolean;
  permissions: string[] | { read: boolean; write: boolean };
  organizationId: string | null;
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
  private static supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

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

      const { data: key, error } = await this.supabase
        .from('api_keys')
        .insert({
          key_value: hashedKey,
          name: input.name,
          is_active: input.isActive,
          permissions: input.permissions,
          organization_id: input.organizationId,
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
  static async getApiKeys(): Promise<ApiKey[]> {
    try {
      const { data: keys, error } = await this.supabase
        .from('api_keys')
        .select('*')
        .order('created_at', { ascending: false });

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
  static async updateApiKey(
    id: string,
    input: UpdateApiKeyInput
  ): Promise<ApiKey | null> {
    try {
      const { data: key, error } = await this.supabase
        .from('api_keys')
        .update({
          name: input.name,
          is_active: input.isActive,
          permissions: input.permissions,
          organization_id: input.organizationId,
        })
        .eq('id', id)
        .select('*')
        .single();

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
  static async deleteApiKey(id: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('api_keys')
        .delete()
        .eq('id', id);

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

  // Verify an API key
  static async verifyApiKey(key: string): Promise<boolean> {
    try {
      const hashedKey = await this.hashKey(key);

      const { data: apiKey, error } = await this.supabase
        .from('api_keys')
        .select('*')
        .eq('key_value', hashedKey)
        .eq('is_active', true)
        .single();

      if (error || !apiKey) {
        console.error('API key verification failed:', error);
        return false;
      }

      // Check if the API key has expired
      if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
        console.error('API key has expired');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in verifyApiKey:', error);
      return false;
    }
  }

  // Generate a test API key for development
  static async generateTestApiKey(): Promise<{ key: ApiKey; plainTextKey: string } | null> {
    try {
      const result = await this.createApiKey({
        name: 'Test API Key',
        isActive: true,
        permissions: ['read', 'write'],
        organizationId: null,
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

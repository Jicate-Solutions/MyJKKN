// lib/api-keys/api-key-service.ts

import { createHash, randomBytes } from 'crypto';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { ApiKey, CreateApiKeyInput, UpdateApiKeyInput } from '@/types/api-keys';
import { toast } from 'react-hot-toast';

export class ApiKeyService {
  private static supabase = createClientComponentClient();

  // Generate a secure API key
  private static generateKeyValue(): string {
    const prefix = 'jk';
    const randomString = randomBytes(24).toString('hex');
    const timestamp = Date.now().toString(36);
    const key = `${prefix}_${randomString}_${timestamp}`;
    return key;
  }

  // Hash an API key for verification
  private static hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  // Create a new API key
  static async createApiKey(
    input: CreateApiKeyInput
  ): Promise<{ key: ApiKey; plainTextKey: string } | null> {
    try {
      const plainTextKey = this.generateKeyValue();
      const hashedKey = this.hashKey(plainTextKey);

      const { data: key, error } = await this.supabase
        .from('api_keys')
        .insert({
          name: input.name,
          key_value: hashedKey,
          expires_at: input.expires_at || null,
          permissions: input.permissions || { read: true, write: false }
        })
        .select()
        .single();

      if (error) throw error;

      if (!key) {
        throw new Error('Failed to create API key');
      }

      return {
        key,
        plainTextKey
      };
    } catch (error) {
      console.error('Error creating API key:', error);
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

      if (error) throw error;

      return keys || [];
    } catch (error) {
      console.error('Error fetching API keys:', error);
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
          is_active: input.is_active,
          expires_at: input.expires_at,
          permissions: input.permissions
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return key;
    } catch (error) {
      console.error('Error updating API key:', error);
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

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error deleting API key:', error);
      return false;
    }
  }

  // Verify an API key
  static async verifyApiKey(key: string): Promise<boolean> {
    try {
      const hashedKey = this.hashKey(key);

      const { data: apiKey, error } = await this.supabase
        .from('api_keys')
        .select('*')
        .eq('key_value', hashedKey)
        .eq('is_active', true)
        .single();

      if (error) return false;

      if (!apiKey) return false;

      // Check if key has expired
      if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
        return false;
      }

      // Update last used timestamp
      await this.supabase
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', apiKey.id);

      return true;
    } catch (error) {
      console.error('Error verifying API key:', error);
      return false;
    }
  }

  // Generate a test API key (for development/testing only)
  static async generateTestApiKey(): Promise<{
    key: ApiKey;
    plainTextKey: string;
  } | null> {
    try {
      const result = await this.createApiKey({
        name: 'Test API Key',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
        permissions: { read: true, write: false }
      });

      if (!result) {
        throw new Error('Failed to create test API key');
      }

      toast.success('Test API key created successfully');
      return result;
    } catch (error) {
      console.error('Error generating test API key:', error);
      toast.error('Failed to create test API key');
      return null;
    }
  }
}

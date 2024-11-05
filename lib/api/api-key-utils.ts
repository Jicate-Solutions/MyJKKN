// lib/api/api-key-utils.ts

import { createHash, randomBytes } from 'crypto';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { APIKey } from '@/types/api-keys';

const KEY_PREFIX = 'myjkkn';

export class APIKeyUtils {
  private static generateKeyValue(): string {
    const randomString = randomBytes(32).toString('hex');
    const hash = createHash('sha256').update(randomString).digest('hex');
    return `${KEY_PREFIX}_${hash}`;
  }

  static async createAPIKey(
    userId: string,
    name: string,
    permissions: any = { read: true, write: false },
    scope: string[] = [],
    expiresAt?: Date
  ): Promise<{ key: APIKey; plainTextKey: string }> {
    const supabase = createClientComponentClient();
    const keyValue = this.generateKeyValue();

    const { data: apiKey, error } = await supabase
      .from('api_keys')
      .insert({
        name,
        key_value: keyValue,
        user_id: userId,
        created_by: userId,
        permissions,
        scope,
        expires_at: expiresAt?.toISOString(),
        is_active: true
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create API key: ${error.message}`);
    }

    return {
      key: apiKey,
      plainTextKey: keyValue
    };
  }

  static async validateAPIKey(keyValue: string): Promise<APIKey | null> {
    const supabase = createClientComponentClient();

    const { data: apiKey, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_value', keyValue)
      .eq('is_active', true)
      .single();

    if (error || !apiKey) {
      return null;
    }

    // Check if key has expired
    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      await this.deactivateAPIKey(apiKey.id);
      return null;
    }

    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', apiKey.id);

    return apiKey;
  }

  static async logAPIKeyUsage(
    apiKeyId: string,
    endpoint: string,
    method: string,
    statusCode: number,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const supabase = createClientComponentClient();

    await supabase.from('api_key_logs').insert({
      api_key_id: apiKeyId,
      endpoint,
      method,
      status_code: statusCode,
      ip_address: ipAddress,
      user_agent: userAgent
    });
  }

  static async deactivateAPIKey(keyId: string): Promise<void> {
    const supabase = createClientComponentClient();

    await supabase
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', keyId);
  }
}

export const verifyAPIKey = async (
  req: Request,
  requiredPermissions: string[] = ['read']
): Promise<{ isValid: boolean; apiKey?: APIKey }> => {
  const apiKeyHeader = req.headers.get('x-api-key');

  if (!apiKeyHeader) {
    return { isValid: false };
  }

  const apiKey = await APIKeyUtils.validateAPIKey(apiKeyHeader);

  if (!apiKey) {
    return { isValid: false };
  }

  // Check permissions
  const hasRequiredPermissions = requiredPermissions.every(
    (permission) =>
      apiKey.permissions[permission as keyof typeof apiKey.permissions]
  );

  if (!hasRequiredPermissions) {
    return { isValid: false };
  }

  return { isValid: true, apiKey };
};

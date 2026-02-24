/**
 * API Key Authentication Higher-Order Function
 *
 * Extracts the inline auth pattern from api-management routes into
 * a reusable wrapper. Handles: Bearer token extraction, SHA256 hash
 * verification, expiry check, permission check, SERVICE_ROLE_KEY
 * client creation, and last_used_at update.
 *
 * Usage:
 * ```typescript
 * export const GET = withApiKeyAuth(async (request, auth) => {
 *   const { supabase, keyData, institutionId } = auth;
 *   // ... use supabase (SERVICE_ROLE_KEY) to query
 *   return paginatedResponse(data, count, page, limit);
 * }, { permission: 'read' });
 * ```
 */

import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { corsHeaders } from '@/lib/api-keys/cors';

export interface ApiKeyData {
  id: string;
  name: string;
  key_value: string;
  created_by: string;
  expires_at: string | null;
  last_used_at: string | null;
  is_active: boolean;
  permissions: { read?: boolean; write?: boolean } | string[];
  organization_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthResult {
  /** Supabase client with SERVICE_ROLE_KEY — bypasses RLS */
  supabase: ReturnType<typeof createServerClient>;
  /** Verified API key record */
  keyData: ApiKeyData;
  /** Institution ID from api_keys.organization_id (null if unscoped key) */
  institutionId: string | null;
}

export type AuthenticatedHandler = (
  request: NextRequest,
  auth: AuthResult,
  context?: { params?: Promise<Record<string, string>> }
) => Promise<NextResponse>;

interface AuthOptions {
  /** Required permission level — 'read' for GET, 'write' for POST/PATCH/DELETE */
  permission?: 'read' | 'write';
}

/**
 * Create a SERVICE_ROLE_KEY Supabase client that bypasses RLS.
 * Used by api-management routes where auth is handled at the API key level.
 */
function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get() { return undefined; },
        set() {},
        remove() {},
      },
    }
  );
}

/**
 * Check if API key has the required permission.
 * Supports both object format { read: true, write: true } and array format ['read', 'write'].
 */
function hasPermission(permissions: ApiKeyData['permissions'], required: 'read' | 'write'): boolean {
  if (Array.isArray(permissions)) {
    return permissions.includes(required);
  }
  if (typeof permissions === 'object' && permissions !== null) {
    return !!permissions[required];
  }
  return false;
}

/**
 * Wraps an API route handler with API key authentication.
 *
 * Performs:
 * 1. Bearer token extraction from Authorization header
 * 2. SHA256 hash → lookup in api_keys table
 * 3. Expiry check
 * 4. Permission check (read/write)
 * 5. SERVICE_ROLE_KEY Supabase client creation
 * 6. last_used_at timestamp update
 * 7. Error catching with CORS headers
 */
export function withApiKeyAuth(
  handler: AuthenticatedHandler,
  options?: AuthOptions
) {
  return async (
    request: NextRequest,
    context?: { params?: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    try {
      // 1. Extract Bearer token
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'API key is required in Authorization header' },
          { status: 401, headers: corsHeaders }
        );
      }

      const apiKey = authHeader.substring(7);
      const hashedKey = createHash('sha256').update(apiKey).digest('hex');

      // 2. Create service client and verify key
      const supabase = createServiceClient();

      const { data: keyData, error: keyError } = await (supabase as any)
        .from('api_keys')
        .select('*')
        .eq('key_value', hashedKey)
        .eq('is_active', true)
        .single();

      if (keyError || !keyData) {
        return NextResponse.json(
          { error: 'Invalid API key' },
          { status: 401, headers: corsHeaders }
        );
      }

      // 3. Check expiry
      if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
        return NextResponse.json(
          { error: 'API key has expired' },
          { status: 401, headers: corsHeaders }
        );
      }

      // 4. Check permission
      if (options?.permission && !hasPermission(keyData.permissions, options.permission)) {
        return NextResponse.json(
          { error: `API key does not have ${options.permission} permission` },
          { status: 403, headers: corsHeaders }
        );
      }

      // 5. Update last_used_at (fire-and-forget)
      (supabase as any)
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', keyData.id)
        .then(() => {});

      // 6. Call handler with auth context
      const auth: AuthResult = {
        supabase,
        keyData: keyData as ApiKeyData,
        institutionId: keyData.organization_id ?? null,
      };

      return await handler(request, auth, context);
    } catch (error) {
      console.error('[withApiKeyAuth] Error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500, headers: corsHeaders }
      );
    }
  };
}

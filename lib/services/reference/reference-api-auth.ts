// Application Hub API-key authentication for the external reference API.
// Mirrors app/api/api-management/* — Bearer <key> → sha256 → api_keys row
// (active, unexpired, permissions.read) — and logs every call to
// api_key_usage_logs. Server-side only (service-role client).

import { createHash } from 'crypto';
import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';

export interface ReferenceApiAuth {
  ok: boolean;
  status: number;
  error?: string;
  keyId?: string;
  supabase: ReturnType<typeof createServiceClient>;
}

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get() {
          return undefined;
        },
        set() {},
        remove() {},
      },
    }
  );
}

export async function authenticateReferenceApi(
  request: NextRequest
): Promise<ReferenceApiAuth> {
  const supabase = createServiceClient();

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      ok: false,
      status: 401,
      error: 'API key is required in Authorization header',
      supabase,
    };
  }

  const hashedKey = createHash('sha256')
    .update(authHeader.substring(7))
    .digest('hex');

  const { data: keyData, error: keyError } = await supabase
    .from('api_keys')
    .select('id, expires_at, permissions, is_active')
    .eq('key_value', hashedKey)
    .eq('is_active', true)
    .single();

  if (keyError || !keyData) {
    return { ok: false, status: 401, error: 'Invalid API key', supabase };
  }
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return { ok: false, status: 401, error: 'API key has expired', supabase };
  }
  const permissions = (keyData.permissions ?? {}) as { read?: boolean };
  if (permissions.read === false) {
    return {
      ok: false,
      status: 403,
      error: 'API key does not have read permission',
      supabase,
    };
  }

  return { ok: true, status: 200, keyId: keyData.id, supabase };
}

/** Fire-and-forget usage log (never blocks or fails the response). */
export async function logReferenceApiUsage(
  auth: ReferenceApiAuth,
  request: NextRequest,
  endpoint: string,
  statusCode: number,
  startedAtMs: number
): Promise<void> {
  if (!auth.keyId) return;
  try {
    await auth.supabase.from('api_key_usage_logs').insert({
      api_key_id: auth.keyId,
      endpoint,
      module: 'reference',
      status_code: statusCode,
      response_time_ms: Date.now() - startedAtMs,
      ip_address:
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      user_agent: request.headers.get('user-agent') ?? null,
    });
  } catch {
    // usage logging must never break the API response
  }
}

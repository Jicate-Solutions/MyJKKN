/**
 * Fire-and-forget audit logger for the B2A API Gateway.
 *
 * Writes to the `api_key_usage_logs` table using the service role client.
 * The exported `logApiUsage` function is synchronous — it initiates an async
 * Supabase insert but never blocks the caller.
 */

import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { ApiModule } from '@/lib/api-keys/authenticate';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  apiKeyId: string;
  endpoint: string;       // e.g. '/api/b2a/admission/analytics'
  module: ApiModule;      // e.g. 'admission'
  institutionId: string | null;
  statusCode: number;
  responseTimeMs: number;
  ipAddress: string | null;
  userAgent: string | null;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Fire-and-forget: inserts one row into `api_key_usage_logs`.
 * Returns `void` synchronously; the Supabase write runs in the background.
 */
export function logApiUsage(entry: AuditLogEntry): void {
  Promise.resolve()
    .then(async () => {
      const supabase = createServiceRoleClient();
      const { error } = await supabase.from('api_key_usage_logs').insert({
        api_key_id: entry.apiKeyId,
        endpoint: entry.endpoint,
        module: entry.module,
        institution_id: entry.institutionId,
        status_code: entry.statusCode,
        response_time_ms: entry.responseTimeMs,
        ip_address: entry.ipAddress,
        user_agent: entry.userAgent,
      });
      if (error) {
        console.warn('[api-keys/audit-logger] Failed to log API usage', {
          apiKeyId: entry.apiKeyId,
          error: error.message,
        });
      }
    })
    .catch((err: unknown) => {
      console.warn('[api-keys/audit-logger] Failed to log API usage', {
        apiKeyId: entry.apiKeyId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

// ─── Request metadata helper ─────────────────────────────────────────────────

/**
 * Extracts ip_address and user_agent from a NextRequest for audit logging.
 */
export function extractRequestMeta(request: NextRequest): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ipAddress =
    (forwarded && forwarded.length > 0 ? forwarded : null) ??
    request.headers.get('x-real-ip') ??
    null;
  const userAgent = request.headers.get('user-agent') ?? null;
  return { ipAddress, userAgent };
}

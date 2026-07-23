/**
 * B2A — Service Request (STUB).
 *
 * The handoff names a `requirement_requests` table that does not exist in
 * production as of 2026-05-16. Service-request and requirement modules in
 * VALID_MODULES were added for the Instasolver substrate work that hasn't
 * shipped its DDL yet. This route returns a stub so the module key remains
 * answerable in the API surface, with a clear reason.
 *
 * To unstub: create `requirement_requests` table (or whatever name the
 * Instasolver track lands on) and swap this for a standard list query.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { corsHeaders } from '@/lib/api-keys/cors';
import { getPaginationParams } from '@/lib/api-keys/query-helpers';

const MODULE_KEY = 'service_request' as const;
const ENDPOINT = '/api/b2a/service_request';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const authResult = await authenticateApiKey(request, { requiredModule: MODULE_KEY, requireRead: true });
  if ('error' in authResult) return authResult.error;
  const { context } = authResult;

  const rate = checkRateLimit(context.keyId);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      { status: 429, headers: { ...corsHeaders, 'Retry-After': String(Math.ceil((rate.resetAt.getTime() - Date.now()) / 1000)) } }
    );
  }

  const institutionId = resolveInstitutionId(context, request);
  const { page, limit } = getPaginationParams(new URL(request.url));
  const { ipAddress, userAgent } = extractRequestMeta(request);

  logApiUsage({ apiKeyId: context.keyId, endpoint: ENDPOINT, module: MODULE_KEY, institutionId, statusCode: 200, responseTimeMs: Date.now() - startTime, ipAddress, userAgent });
  return NextResponse.json(
    {
      data: [],
      meta: { page, limit, total: 0, totalPages: 0 },
      _stub: true,
      _stub_reason: 'Instasolver service_request schema not yet shipped. Target table: requirement_requests.',
    },
    { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } }
  );
}

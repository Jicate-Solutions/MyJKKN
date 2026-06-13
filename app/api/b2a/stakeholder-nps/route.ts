/**
 * B2A — Stakeholder NPS (STUB).
 * No dedicated NPS table found. Candidates for future wiring:
 *   - pde_reputation (limited columns; no NPS-specific shape)
 *   - feedback_responses (if exists)
 * Pending product/data decision before exposing real data.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { corsHeaders } from '@/lib/api-keys/cors';
import { getPaginationParams } from '@/lib/api-keys/query-helpers';

const MODULE_KEY = 'stakeholder-nps' as const;
const ENDPOINT = '/api/b2a/stakeholder-nps';

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
      _stub_reason: 'NPS survey schema not finalized. Candidates: pde_reputation, future feedback_responses.',
    },
    { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } }
  );
}

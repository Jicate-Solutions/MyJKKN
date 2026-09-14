/**
 * B2A — Service Request (STUB).
 *
 * This route was stubbed pending an InstaSolver table that will now never
 * exist. The 2026-09-14 decisions (specs/instasolver-2026-09-14.md) split the
 * old subdomain's three lanes across modules that already had a home:
 * complaints stay in grievance_tickets, broken things go to Campus Walk
 * project_tasks (I4), and purchases go to Procurement (I3/I5). There is no
 * `requirement_requests` table and no plan for one.
 *
 * The stub is kept so the `service_request` module key stays answerable in the
 * API surface with an honest reason rather than 404ing.
 *
 * To unstub: decide which of the three lanes this key should serve and swap
 * this for a list query against that module's own table.
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
      _stub_reason: 'InstaSolver has no service_request table. Complaints live in grievance_tickets, broken things in Campus Walk project_tasks, purchases in Procurement (specs/instasolver-2026-09-14.md).',
    },
    { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } }
  );
}

/**
 * B2A — Audit trail.
 * Backed by `sh_audit_logs` (the platform-wide audit table).
 * Filterable by module, severity, action, user_id, date range.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { corsHeaders } from '@/lib/api-keys/cors';
import { getPaginationParams, getDateRangeParams, isValidUuid } from '@/lib/api-keys/query-helpers';

const MODULE_KEY = 'audit-trail' as const;
const ENDPOINT = '/api/b2a/audit-trail';

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
  if (institutionId === null && context.institutionId !== null) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Institution mismatch with API key binding' } },
      { status: 403, headers: corsHeaders }
    );
  }

  const url = new URL(request.url);
  const { page, limit, from, to } = getPaginationParams(url);
  const { dateFrom, dateTo } = getDateRangeParams(url);
  const moduleParam = url.searchParams.get('module');
  const severity = url.searchParams.get('severity');
  const action = url.searchParams.get('action');
  const userId = url.searchParams.get('user_id');
  const { ipAddress, userAgent } = extractRequestMeta(request);

  try {
    let query = context.supabase
      .from('sh_audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (moduleParam) query = query.eq('module', moduleParam);
    if (severity) query = query.eq('severity', severity);
    if (action) query = query.eq('action', action);
    if (userId && isValidUuid(userId)) query = query.eq('user_id', userId);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo);

    const { data, error, count } = await query;
    if (error) throw error;

    logApiUsage({ apiKeyId: context.keyId, endpoint: ENDPOINT, module: MODULE_KEY, institutionId, statusCode: 200, responseTimeMs: Date.now() - startTime, ipAddress, userAgent });
    return NextResponse.json(
      { data: data ?? [], meta: { page, limit, total: count ?? 0, totalPages: count ? Math.ceil(count / limit) : 0 } },
      { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logApiUsage({ apiKeyId: context.keyId, endpoint: ENDPOINT, module: MODULE_KEY, institutionId, statusCode: 500, responseTimeMs: Date.now() - startTime, ipAddress, userAgent });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to list audit log', detail: message } },
      { status: 500, headers: corsHeaders }
    );
  }
}

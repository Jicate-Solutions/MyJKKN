/**
 * B2A — Bug reports.
 * Backed by `sh_bug_reports`. Note: table has no institution_id column at present;
 * scoping is applied via reported_by → profiles.institution_id when needed.
 * Audit log still records the requesting institutionId for traceability.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { corsHeaders } from '@/lib/api-keys/cors';
import { getPaginationParams } from '@/lib/api-keys/query-helpers';

const MODULE_KEY = 'bug-reports' as const;
const ENDPOINT = '/api/b2a/bug-reports';

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
  const status = url.searchParams.get('status');
  const severity = url.searchParams.get('severity');
  const { ipAddress, userAgent } = extractRequestMeta(request);

  try {
    let query = context.supabase
      .from('sh_bug_reports')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status) query = query.eq('status', status);
    if (severity) query = query.eq('severity', severity);

    const { data, error, count } = await query;
    if (error) throw error;

    logApiUsage({ apiKeyId: context.keyId, endpoint: ENDPOINT, module: MODULE_KEY, institutionId, statusCode: 200, responseTimeMs: Date.now() - startTime, ipAddress, userAgent });
    return NextResponse.json(
      {
        data: data ?? [],
        meta: { page, limit, total: count ?? 0, totalPages: count ? Math.ceil(count / limit) : 0 },
        _note: 'Bug reports are platform-wide; not institution-scoped at table level.',
      },
      { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logApiUsage({ apiKeyId: context.keyId, endpoint: ENDPOINT, module: MODULE_KEY, institutionId, statusCode: 500, responseTimeMs: Date.now() - startTime, ipAddress, userAgent });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to list bug reports', detail: message } },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * B2A Phase 5 — Decision log list + create.
 *
 * GET  /api/b2a/memory/decisions    List decisions (filter by modules_involved, decided_by, date range)
 * POST /api/b2a/memory/decisions    Log a decision
 *
 * Per HANDOFF-B2A-Transformation.md §7.2.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { corsHeaders } from '@/lib/api-keys/cors';
import { getPaginationParams, getDateRangeParams } from '@/lib/api-keys/query-helpers';

const VALID_DECIDED_BY = ['agent', 'human', 'human_via_agent'] as const;
type DecidedBy = typeof VALID_DECIDED_BY[number];

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// ─── GET — list decisions ───────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const endpoint = '/api/b2a/memory/decisions';

  const authResult = await authenticateApiKey(request, { requireRead: true });
  if ('error' in authResult) return authResult.error;
  const { context } = authResult;

  const rate = checkRateLimit(context.keyId);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      { status: 429, headers: corsHeaders }
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
  const decidedByParam = url.searchParams.get('decided_by');
  const modulesParam = url.searchParams.get('modules');
  const { page, limit, from, to } = getPaginationParams(url);
  const { dateFrom, dateTo } = getDateRangeParams(url);
  const { ipAddress, userAgent } = extractRequestMeta(request);

  try {
    let query = context.supabase
      .from('b2a_decision_log')
      .select('*', { count: 'exact' })
      .eq('api_key_id', context.keyId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (institutionId) query = query.eq('institution_id', institutionId);
    if (decidedByParam && VALID_DECIDED_BY.includes(decidedByParam as DecidedBy)) {
      query = query.eq('decided_by', decidedByParam);
    }
    if (modulesParam) {
      const modules = modulesParam.split(',').map((m) => m.trim()).filter(Boolean);
      if (modules.length > 0) query = query.overlaps('modules_involved', modules);
    }
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo);

    const { data, error, count } = await query;
    if (error) throw error;

    logApiUsage({
      apiKeyId: context.keyId, endpoint, module: 'morning-brief',
      institutionId, statusCode: 200,
      responseTimeMs: Date.now() - startTime, ipAddress, userAgent,
    });

    return NextResponse.json(
      {
        data: data ?? [],
        meta: { page, limit, total: count ?? 0, totalPages: count ? Math.ceil(count / limit) : 0 },
      },
      { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to list decisions', detail: message } },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ─── POST — log decision ────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const endpoint = '/api/b2a/memory/decisions';

  const authResult = await authenticateApiKey(request, { requireWrite: true });
  if ('error' in authResult) return authResult.error;
  const { context } = authResult;

  const rate = checkRateLimit(context.keyId);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      { status: 429, headers: corsHeaders }
    );
  }

  const institutionId = resolveInstitutionId(context, request);
  const { ipAddress, userAgent } = extractRequestMeta(request);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } },
      { status: 400, headers: corsHeaders }
    );
  }

  const { decision_title, context: ctxJson, options_considered, decision_made, rationale, modules_involved, decided_by } = body || {};

  if (typeof decision_title !== 'string' || decision_title.length < 1 || decision_title.length > 500) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'decision_title required (1-500 chars)' } },
      { status: 400, headers: corsHeaders }
    );
  }
  if (typeof decision_made !== 'string' || decision_made.length < 1) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'decision_made required' } },
      { status: 400, headers: corsHeaders }
    );
  }
  if (typeof rationale !== 'string' || rationale.length < 1) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'rationale required' } },
      { status: 400, headers: corsHeaders }
    );
  }
  if (!decided_by || !VALID_DECIDED_BY.includes(decided_by)) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: `decided_by must be one of: ${VALID_DECIDED_BY.join(', ')}` } },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const { data, error } = await context.supabase
      .from('b2a_decision_log')
      .insert({
        api_key_id: context.keyId,
        institution_id: institutionId,
        decision_title,
        context: ctxJson ?? {},
        options_considered: options_considered ?? [],
        decision_made,
        rationale,
        modules_involved: Array.isArray(modules_involved) ? modules_involved : [],
        decided_by,
      })
      .select('*')
      .single();

    if (error) throw error;

    logApiUsage({
      apiKeyId: context.keyId, endpoint, module: 'morning-brief',
      institutionId, statusCode: 201,
      responseTimeMs: Date.now() - startTime, ipAddress, userAgent,
    });

    return NextResponse.json({ data }, { status: 201, headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to log decision', detail: message } },
      { status: 500, headers: corsHeaders }
    );
  }
}

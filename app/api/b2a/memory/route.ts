/**
 * B2A Phase 5 — Agent Memory list + create.
 *
 * GET  /api/b2a/memory          List memories (filter by type, tags, importance, institutionId)
 * POST /api/b2a/memory          Create memory
 *
 * Per HANDOFF-B2A-Transformation.md §7.2.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { corsHeaders } from '@/lib/api-keys/cors';
import { getPaginationParams } from '@/lib/api-keys/query-helpers';

const VALID_MEMORY_TYPES = ['decision', 'observation', 'pattern', 'changelog', 'preference', 'context'] as const;
type MemoryType = typeof VALID_MEMORY_TYPES[number];

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// ─── GET — list memories ────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const endpoint = '/api/b2a/memory';

  const authResult = await authenticateApiKey(request, { requireRead: true });
  if ('error' in authResult) return authResult.error;
  const { context } = authResult;

  const rate = checkRateLimit(context.keyId);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'Retry-After': String(Math.ceil((rate.resetAt.getTime() - Date.now()) / 1000)),
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Remaining': '0',
        },
      }
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
  const typeParam = url.searchParams.get('type');
  const tagsParam = url.searchParams.get('tags');
  const minImportanceParam = url.searchParams.get('min_importance');
  const includeExpired = url.searchParams.get('include_expired') === 'true';
  const { page, limit, from, to } = getPaginationParams(url);

  const { ipAddress, userAgent } = extractRequestMeta(request);

  try {
    let query = context.supabase
      .from('b2a_agent_memories')
      .select('*', { count: 'exact' })
      .eq('api_key_id', context.keyId)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (institutionId) query = query.eq('institution_id', institutionId);
    if (typeParam && VALID_MEMORY_TYPES.includes(typeParam as MemoryType)) {
      query = query.eq('memory_type', typeParam);
    }
    if (tagsParam) {
      const tags = tagsParam.split(',').map((t) => t.trim()).filter(Boolean);
      if (tags.length > 0) query = query.contains('tags', tags);
    }
    if (minImportanceParam) {
      const n = parseInt(minImportanceParam, 10);
      if (!Number.isNaN(n)) query = query.gte('importance', n);
    }
    if (!includeExpired) {
      query = query.or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());
    }

    const { data, error, count } = await query;
    if (error) throw error;

    logApiUsage({
      apiKeyId: context.keyId,
      endpoint,
      module: 'morning-brief',
      institutionId,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      ipAddress,
      userAgent,
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
    logApiUsage({
      apiKeyId: context.keyId,
      endpoint,
      module: 'morning-brief',
      institutionId,
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
      ipAddress,
      userAgent,
    });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to list memories', detail: message } },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ─── POST — create memory ───────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const endpoint = '/api/b2a/memory';

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

  const { memory_type, title, content, tags, importance, expires_at } = body || {};

  if (!memory_type || !VALID_MEMORY_TYPES.includes(memory_type)) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: `memory_type required; one of: ${VALID_MEMORY_TYPES.join(', ')}` } },
      { status: 400, headers: corsHeaders }
    );
  }
  if (typeof title !== 'string' || title.length < 1 || title.length > 500) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'title required (1-500 chars)' } },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const { data, error } = await context.supabase
      .from('b2a_agent_memories')
      .insert({
        api_key_id: context.keyId,
        institution_id: institutionId,
        memory_type,
        title,
        content: content ?? {},
        tags: Array.isArray(tags) ? tags : [],
        importance: typeof importance === 'number' && importance >= 1 && importance <= 10 ? importance : 5,
        expires_at: expires_at ?? null,
      })
      .select('*')
      .single();

    if (error) throw error;

    logApiUsage({
      apiKeyId: context.keyId,
      endpoint,
      module: 'morning-brief',
      institutionId,
      statusCode: 201,
      responseTimeMs: Date.now() - startTime,
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ data }, { status: 201, headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logApiUsage({
      apiKeyId: context.keyId,
      endpoint,
      module: 'morning-brief',
      institutionId,
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
      ipAddress,
      userAgent,
    });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to create memory', detail: message } },
      { status: 500, headers: corsHeaders }
    );
  }
}

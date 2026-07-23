/**
 * B2A Phase 5 — Memory full-text search.
 *
 * GET /api/b2a/memory/search?q=<term>&type=<type>&tags=<csv>&limit=<n>
 *
 * Searches across `title` (ILIKE) and `content::text` (substring).
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const endpoint = '/api/b2a/memory/search';

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
  const q = url.searchParams.get('q')?.trim() ?? '';
  const typeParam = url.searchParams.get('type');
  const tagsParam = url.searchParams.get('tags');
  const { page, limit, from, to } = getPaginationParams(url);
  const { ipAddress, userAgent } = extractRequestMeta(request);

  if (q.length < 2) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Query param `q` must be at least 2 chars' } },
      { status: 400, headers: corsHeaders }
    );
  }
  // Escape SQL LIKE wildcards in user input to prevent over-matching
  const safeTerm = q.replace(/[%_\\]/g, (m) => '\\' + m);
  const likePattern = `%${safeTerm}%`;

  try {
    let query = context.supabase
      .from('b2a_agent_memories')
      .select('*', { count: 'exact' })
      .eq('api_key_id', context.keyId)
      // Match in title OR a textual representation of content
      .or(`title.ilike.${likePattern},content.cs.{"_search":"${safeTerm}"}`)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (institutionId) query = query.eq('institution_id', institutionId);
    if (typeParam && VALID_MEMORY_TYPES.includes(typeParam as MemoryType)) {
      query = query.eq('memory_type', typeParam);
    }
    if (tagsParam) {
      const tags = tagsParam.split(',').map((t) => t.trim()).filter(Boolean);
      if (tags.length > 0) query = query.overlaps('tags', tags);
    }

    let { data, error, count } = await query;
    if (error) {
      // Fallback: title-only ILIKE if the OR clause is malformed against jsonb shape
      const fallback = await context.supabase
        .from('b2a_agent_memories')
        .select('*', { count: 'exact' })
        .eq('api_key_id', context.keyId)
        .ilike('title', likePattern)
        .order('importance', { ascending: false })
        .range(from, to);
      data = fallback.data;
      count = fallback.count;
      if (fallback.error) throw fallback.error;
    }

    logApiUsage({
      apiKeyId: context.keyId, endpoint, module: 'morning-brief',
      institutionId, statusCode: 200,
      responseTimeMs: Date.now() - startTime, ipAddress, userAgent,
    });

    return NextResponse.json(
      {
        data: data ?? [],
        meta: {
          query: q,
          page, limit,
          total: count ?? 0,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      },
      { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Search failed', detail: message } },
      { status: 500, headers: corsHeaders }
    );
  }
}

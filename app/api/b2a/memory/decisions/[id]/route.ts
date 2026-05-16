/**
 * B2A Phase 5 — Decision log update (fill in outcome).
 *
 * PATCH /api/b2a/memory/decisions/:id    Update outcome / rationale / decision_made
 *
 * Per HANDOFF-B2A-Transformation.md §7.2 — decisions are logged when made,
 * then the `outcome` JSONB is filled in later when results materialize.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { corsHeaders } from '@/lib/api-keys/cors';
import { isValidUuid } from '@/lib/api-keys/query-helpers';

const UPDATABLE_FIELDS = [
  'outcome',
  'decision_made',
  'rationale',
  'context',
  'options_considered',
  'modules_involved',
] as const;

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const startTime = Date.now();
  const { id } = await params;
  const endpoint = `/api/b2a/memory/decisions/${id}`;

  if (!isValidUuid(id)) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Invalid decision id (must be UUID)' } },
      { status: 400, headers: corsHeaders }
    );
  }

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

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } },
      { status: 400, headers: corsHeaders }
    );
  }

  const updates: Record<string, any> = {};
  for (const key of UPDATABLE_FIELDS) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'No updatable fields provided' } },
      { status: 400, headers: corsHeaders }
    );
  }

  const { ipAddress, userAgent } = extractRequestMeta(request);

  try {
    const { data, error } = await context.supabase
      .from('b2a_decision_log')
      .update(updates)
      .eq('id', id)
      .eq('api_key_id', context.keyId)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Decision not found or not owned by this API key' } },
        { status: 404, headers: corsHeaders }
      );
    }

    logApiUsage({
      apiKeyId: context.keyId, endpoint, module: 'morning-brief',
      institutionId: data.institution_id, statusCode: 200,
      responseTimeMs: Date.now() - startTime, ipAddress, userAgent,
    });

    return NextResponse.json({ data }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to update decision', detail: message } },
      { status: 500, headers: corsHeaders }
    );
  }
}

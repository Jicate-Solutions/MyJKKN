/**
 * B2A Phase 5 — Single memory update + soft delete.
 *
 * PATCH  /api/b2a/memory/:id     Update memory (partial)
 * DELETE /api/b2a/memory/:id     Soft delete (set expires_at = now)
 *
 * Per HANDOFF-B2A-Transformation.md §7.2.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { corsHeaders } from '@/lib/api-keys/cors';
import { isValidUuid } from '@/lib/api-keys/query-helpers';

const VALID_MEMORY_TYPES = ['decision', 'observation', 'pattern', 'changelog', 'preference', 'context'] as const;
const UPDATABLE_FIELDS = ['memory_type', 'title', 'content', 'tags', 'importance', 'expires_at', 'superseded_by'] as const;

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const startTime = Date.now();
  const { id } = await params;
  const endpoint = `/api/b2a/memory/${id}`;

  if (!isValidUuid(id)) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Invalid memory id (must be UUID)' } },
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
  if (updates.memory_type && !VALID_MEMORY_TYPES.includes(updates.memory_type)) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: `memory_type must be one of: ${VALID_MEMORY_TYPES.join(', ')}` } },
      { status: 400, headers: corsHeaders }
    );
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
      .from('b2a_agent_memories')
      .update(updates)
      .eq('id', id)
      .eq('api_key_id', context.keyId)
      .select('*')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      logApiUsage({
        apiKeyId: context.keyId, endpoint, module: 'morning-brief',
        institutionId: null, statusCode: 404,
        responseTimeMs: Date.now() - startTime, ipAddress, userAgent,
      });
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Memory not found or not owned by this API key' } },
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
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to update memory', detail: message } },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const startTime = Date.now();
  const { id } = await params;
  const endpoint = `/api/b2a/memory/${id}`;

  if (!isValidUuid(id)) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Invalid memory id (must be UUID)' } },
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

  const { ipAddress, userAgent } = extractRequestMeta(request);

  try {
    // Soft delete: set expires_at to now
    const { data, error } = await context.supabase
      .from('b2a_agent_memories')
      .update({ expires_at: new Date().toISOString() })
      .eq('id', id)
      .eq('api_key_id', context.keyId)
      .select('id, expires_at')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Memory not found or not owned by this API key' } },
        { status: 404, headers: corsHeaders }
      );
    }

    logApiUsage({
      apiKeyId: context.keyId, endpoint, module: 'morning-brief',
      institutionId: null, statusCode: 200,
      responseTimeMs: Date.now() - startTime, ipAddress, userAgent,
    });

    return NextResponse.json(
      { data: { id: data.id, expires_at: data.expires_at, soft_deleted: true } },
      { headers: corsHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to delete memory', detail: message } },
      { status: 500, headers: corsHeaders }
    );
  }
}

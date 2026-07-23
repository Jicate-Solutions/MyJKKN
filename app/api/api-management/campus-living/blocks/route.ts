import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withAuth } from '@/lib/auth/with-auth';
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api-keys/response-helpers';
import { getPaginationParams, getStringParam , sanitizeBody } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/blocks
 * List hostel blocks with optional filters and occupancy data.
 *
 * hostel-rooms-v2 PR 2 (2026-05-26): hostel_blocks.institution_id dropped.
 * Institution scope flows through hostel_block_institutions junction.
 *
 * Query params: page, limit, hostel_type, status
 */
export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit, from, to } = getPaginationParams(url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const hostelType = getStringParam(url, 'hostel_type');
  const status = getStringParam(url, 'status');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: blockIds, error: jErr } = await (auth.supabase as any)
    .from('hostel_block_institutions')
    .select('block_id')
    .eq('institution_id', institutionId);
  if (jErr) throw jErr;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ids = ((blockIds ?? []) as any[]).map((r) => r.block_id);
  if (ids.length === 0) {
    return paginatedResponse([], 0, page, limit);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (auth.supabase as any)
    .from('hostel_blocks')
    .select('*', { count: 'exact' })
    .in('id', ids);

  if (hostelType) query = query.eq('hostel_type', hostelType);
  if (status) query = query.eq('status', status);

  query = query.range(from, to).order('name', { ascending: true });

  const { data, error, count } = await query;
  if (error) throw error;

  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { allowApiKey: true, requiredPermission: 'read' });

/**
 * POST /api/api-management/campus-living/blocks
 * Create a new hostel block + auto-grant access to the caller's institution
 * via hostel_block_institutions (is_primary=true).
 *
 * hostel-rooms-v2 PR 2 (2026-05-26): hostel_blocks.institution_id dropped.
 * The block is created network-wide; ownership flows through the junction.
 */
export const POST = withAuth(async (request, auth) => {
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const body = await request.json();
  const sanitized = sanitizeBody(body);
  // Strip institution_id from inbound payload — column no longer exists.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (sanitized as any).institution_id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (auth.supabase as any)
    .from('hostel_blocks')
    .insert(sanitized)
    .select()
    .single();

  if (error) throw error;

  // Auto-grant caller's institution as primary via the junction.
  if (data?.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: m2mError } = await (auth.supabase as any)
      .from('hostel_block_institutions')
      .insert({
        block_id: data.id,
        institution_id: institutionId,
        is_primary: true,
      });
    if (m2mError) {
      // Block exists but invisible to caller's institution; surface error
      // so the consumer can re-grant via the junction directly.
      throw m2mError;
    }
  }

  return createdResponse(data);
}, { allowApiKey: true, requiredPermission: 'write' });

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
 * Query params: page, limit, hostel_type, status
 */
export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit, from, to } = getPaginationParams(url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const hostelType = getStringParam(url, 'hostel_type');
  const status = getStringParam(url, 'status');

  let query = (auth.supabase as any)
    .from('hostel_blocks')
    .select('*', { count: 'exact' })
    .eq('institution_id', institutionId);

  if (hostelType) query = query.eq('hostel_type', hostelType);
  if (status) query = query.eq('status', status);

  query = query.range(from, to).order('name', { ascending: true });

  const { data, error, count } = await query;
  if (error) throw error;

  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { allowApiKey: true, requiredPermission: 'read' });

/**
 * POST /api/api-management/campus-living/blocks
 * Create a new hostel block.
 *
 * Mirrors the PR #746 pattern from `lib/services/campus-living/hostel-block-service.ts`:
 * after inserting into `hostel_blocks`, also write the matching row to
 * `hostel_block_institutions` with `is_primary=true`. Without the junction row,
 * non-super-admin readers cannot see the block (the junction-aware
 * `role_has_hostel_block_scope()` RLS helper returns false). The two writes
 * are NOT in a transaction (PostgREST limitation); if the M2M insert fails,
 * the block exists but is RLS-invisible. We surface that failure as 500
 * and rely on the audit-doc backfill SQL for recovery.
 */
export const POST = withAuth(async (request, auth) => {
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const body = await request.json();

  const { data, error } = await (auth.supabase as any)
    .from('hostel_blocks')
    .insert({ ...sanitizeBody(body), institution_id: institutionId })
    .select()
    .single();

  if (error) throw error;

  // Mirror to M2M with is_primary=true (PR #746 pattern).
  if (data?.id && data?.institution_id) {
    const { error: m2mError } = await (auth.supabase as any)
      .from('hostel_block_institutions')
      .insert({
        block_id: data.id,
        institution_id: data.institution_id,
        is_primary: true,
      });
    if (m2mError) {
      // Block already exists in hostel_blocks at this point. We surface the
      // error so the API consumer knows the create failed end-to-end; the
      // orphan parent row is recoverable via the backfill SQL in
      // .claude/scratch/m2m-audit-2026-05-10.md §5.1.
      throw m2mError;
    }
  }

  return createdResponse(data);
}, { allowApiKey: true, requiredPermission: 'write' });

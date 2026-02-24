import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { paginatedResponse, errorResponse, successApiResponse } from '@/lib/api-keys/response-helpers';
import { getPaginationParams, getStringParam, getUuidParam } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/onboarding
 * List onboarding checklists.
 * Query params: page, limit, learner_id, status, block_id
 */
export const GET = withApiKeyAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit, from, to } = getPaginationParams(url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const learnerId = getUuidParam(url, 'learner_id');
  const status = getStringParam(url, 'status');

  let query = (auth.supabase as any)
    .from('hostel_onboarding_checklists')
    .select('*', { count: 'exact' })
    .eq('institution_id', institutionId);

  if (learnerId) query = query.eq('learner_id', learnerId);
  if (status) query = query.eq('status', status);

  query = query.range(from, to).order('created_at', { ascending: false });

  const { data, error, count } = await query;
  if (error) throw error;

  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { permission: 'read' });

/**
 * PATCH /api/api-management/campus-living/onboarding
 * Bulk update onboarding checklist items.
 * Body: { id: string, updates: Record<string, any> }
 */
export const PATCH = withApiKeyAuth(async (request, auth) => {
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) return errorResponse('Checklist ID is required', 400);
  delete updates.institution_id;

  const { data, error } = await (auth.supabase as any)
    .from('hostel_onboarding_checklists')
    .update(updates)
    .eq('id', id)
    .eq('institution_id', institutionId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return errorResponse('Checklist not found', 404);
    throw error;
  }

  return successApiResponse(data);
}, { permission: 'write' });

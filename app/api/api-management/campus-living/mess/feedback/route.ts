import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api-keys/response-helpers';
import { getPaginationParams, getStringParam, getUuidParam, getDateRangeParams } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/mess/feedback
 * List mess feedback entries.
 * Query params: page, limit, learner_id, meal_type, is_complaint, date_from, date_to
 */
export const GET = withApiKeyAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit, from, to } = getPaginationParams(url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const learnerId = getUuidParam(url, 'learner_id');
  const mealType = getStringParam(url, 'meal_type');
  const isComplaint = getStringParam(url, 'is_complaint');
  const catererId = getUuidParam(url, 'caterer_id');
  const { dateFrom, dateTo } = getDateRangeParams(url);

  let query = (auth.supabase as any)
    .from('mess_feedback')
    .select('*', { count: 'exact' })
    .eq('institution_id', institutionId);

  if (learnerId) query = query.eq('learner_id', learnerId);
  if (mealType) query = query.eq('meal_type', mealType);
  if (isComplaint) query = query.eq('is_complaint', isComplaint === 'true');
  if (catererId) query = query.eq('caterer_id', catererId);
  if (dateFrom) query = query.gte('date', dateFrom);
  if (dateTo) query = query.lte('date', dateTo);

  query = query.range(from, to).order('created_at', { ascending: false });
  const { data, error, count } = await query;
  if (error) throw error;
  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { permission: 'read' });

/**
 * POST /api/api-management/campus-living/mess/feedback
 * Submit mess feedback.
 */
export const POST = withApiKeyAuth(async (request, auth) => {
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);
  const body = await request.json();
  const { data, error } = await (auth.supabase as any)
    .from('mess_feedback')
    .insert({ ...body, institution_id: institutionId })
    .select().single();
  if (error) throw error;
  return createdResponse(data);
}, { permission: 'write' });

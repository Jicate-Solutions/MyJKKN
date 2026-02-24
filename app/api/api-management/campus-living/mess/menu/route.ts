import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { paginatedResponse, errorResponse, successApiResponse } from '@/lib/api-keys/response-helpers';
import { getPaginationParams, getStringParam, getUuidParam } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/mess/menu
 * List mess menus.
 * Query params: page, limit, block_id, meal_type, week_start_date, status, current (true = this week only)
 */
export const GET = withApiKeyAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit, from, to } = getPaginationParams(url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const blockId = getUuidParam(url, 'block_id');
  const mealType = getStringParam(url, 'meal_type');
  const weekStartDate = getStringParam(url, 'week_start_date');
  const status = getStringParam(url, 'status');
  const current = getStringParam(url, 'current');

  let query = (auth.supabase as any)
    .from('mess_menus')
    .select('*', { count: 'exact' })
    .eq('institution_id', institutionId);

  if (blockId) query = query.eq('block_id', blockId);
  if (mealType) query = query.eq('meal_type', mealType);
  if (weekStartDate) query = query.eq('week_start_date', weekStartDate);
  if (status) query = query.eq('status', status);
  if (current === 'true') {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    query = query.eq('week_start_date', monday.toISOString().split('T')[0]);
  }

  query = query.range(from, to).order('week_start_date', { ascending: false }).order('day_of_week').order('meal_type');
  const { data, error, count } = await query;
  if (error) throw error;
  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { permission: 'read' });

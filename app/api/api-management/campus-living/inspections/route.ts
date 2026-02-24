import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api-keys/response-helpers';
import { getPaginationParams, getStringParam, getUuidParam, getDateRangeParams } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

export const GET = withApiKeyAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit, from, to } = getPaginationParams(url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const status = getStringParam(url, 'status');
  const inspectionType = getStringParam(url, 'inspection_type');
  const blockId = getUuidParam(url, 'block_id');
  const { dateFrom, dateTo } = getDateRangeParams(url);

  let query = (auth.supabase as any)
    .from('hostel_inspections')
    .select('*', { count: 'exact' })
    .eq('institution_id', institutionId);

  if (status) query = query.eq('status', status);
  if (inspectionType) query = query.eq('inspection_type', inspectionType);
  if (blockId) query = query.eq('block_id', blockId);
  if (dateFrom) query = query.gte('scheduled_date', dateFrom);
  if (dateTo) query = query.lte('scheduled_date', dateTo);

  query = query.range(from, to).order('scheduled_date', { ascending: false });
  const { data, error, count } = await query;
  if (error) throw error;
  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { permission: 'read' });

export const POST = withApiKeyAuth(async (request, auth) => {
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);
  const body = await request.json();
  const { data, error } = await (auth.supabase as any)
    .from('hostel_inspections')
    .insert({ ...body, institution_id: institutionId })
    .select().single();
  if (error) throw error;
  return createdResponse(data);
}, { permission: 'write' });

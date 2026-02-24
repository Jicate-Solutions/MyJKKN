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
  const priority = getStringParam(url, 'priority');
  const category = getStringParam(url, 'category');
  const blockId = getUuidParam(url, 'block_id');
  const slaStatus = getStringParam(url, 'sla_status');
  const { dateFrom, dateTo } = getDateRangeParams(url);

  let query = (auth.supabase as any)
    .from('hostel_maintenance_requests')
    .select('*', { count: 'exact' })
    .eq('institution_id', institutionId);

  if (status) query = query.eq('status', status);
  if (priority) query = query.eq('priority', priority);
  if (category) query = query.eq('category', category);
  if (blockId) query = query.eq('block_id', blockId);
  if (slaStatus) query = query.eq('sla_status', slaStatus);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo);

  query = query.range(from, to).order('created_at', { ascending: false });
  const { data, error, count } = await query;
  if (error) throw error;
  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { permission: 'read' });

export const POST = withApiKeyAuth(async (request, auth) => {
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);
  const body = await request.json();
  const { data, error } = await (auth.supabase as any)
    .from('hostel_maintenance_requests')
    .insert({ ...body, institution_id: institutionId })
    .select().single();
  if (error) throw error;
  return createdResponse(data);
}, { permission: 'write' });

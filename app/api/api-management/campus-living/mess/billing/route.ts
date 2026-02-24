import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { paginatedResponse, errorResponse, successApiResponse } from '@/lib/api-keys/response-helpers';
import { getPaginationParams, getStringParam, getUuidParam } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/mess/billing
 * List mess billing data.
 * Query params: type (periods|student), page, limit, status, learner_id, billing_period_id, payment_status
 */
export const GET = withApiKeyAuth(async (request, auth) => {
  const url = new URL(request.url);
  const { page, limit, from, to } = getPaginationParams(url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const type = getStringParam(url, 'type') || 'periods';

  if (type === 'student') {
    const learnerId = getUuidParam(url, 'learner_id');
    const billingPeriodId = getUuidParam(url, 'billing_period_id');
    const paymentStatus = getStringParam(url, 'payment_status');

    let query = (auth.supabase as any)
      .from('mess_student_billing')
      .select('*', { count: 'exact' })
      .eq('institution_id', institutionId);

    if (learnerId) query = query.eq('learner_id', learnerId);
    if (billingPeriodId) query = query.eq('billing_period_id', billingPeriodId);
    if (paymentStatus) query = query.eq('payment_status', paymentStatus);

    query = query.range(from, to).order('created_at', { ascending: false });
    const { data, error, count } = await query;
    if (error) throw error;
    return paginatedResponse(data ?? [], count ?? 0, page, limit);
  }

  // Default: billing periods
  const status = getStringParam(url, 'status');
  const catererId = getUuidParam(url, 'caterer_id');

  let query = (auth.supabase as any)
    .from('mess_billing_periods')
    .select('*', { count: 'exact' })
    .eq('institution_id', institutionId);

  if (status) query = query.eq('status', status);
  if (catererId) query = query.eq('caterer_id', catererId);

  query = query.range(from, to).order('start_date', { ascending: false });
  const { data, error, count } = await query;
  if (error) throw error;
  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { permission: 'read' });

import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withAuth } from '@/lib/auth/with-auth';
import { paginatedResponse, errorResponse } from '@/lib/api-keys/response-helpers';
import { getPaginationParams, getStringParam, getUuidParam, getDateRangeParams } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/cleaning
 * List resident cleaning bookings, and the cleaning-type catalog.
 *
 * REPOINTED 2026-09-07 when the housekeeping module was rebuilt
 * (migration 20260907090100). The old backing tables are gone:
 *   hostel_cleaning_tasks     -> hostel_cleaning_bookings
 *   hostel_cleaning_schedules -> no successor. The recurring block-sweep plan
 *                                concept was removed entirely; the nearest
 *                                equivalent is the cleaning-type catalog, so
 *                                `type=schedules` now serves that and is kept
 *                                only as a compatibility alias.
 *
 * Response shape necessarily changed with the schema — a booking is not a
 * generated task. Consumers reading `date`/`cleaning_type` should move to
 * `booking_date`/`type_name`.
 *
 * Query params: page, limit, type (bookings|types|schedules|tasks),
 *               status, block_id, room_id, cleaning_type, date_from, date_to
 */
export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const { page, limit, from, to } = getPaginationParams(url);
  // 'tasks' and 'schedules' are the pre-rebuild names, kept so existing API
  // keys do not start 400ing.
  const type = getStringParam(url, 'type') || 'bookings';

  if (type === 'types' || type === 'schedules') {
    const isActive = getStringParam(url, 'is_active');

    let query = (auth.supabase as any)
      .from('hostel_cleaning_types')
      .select('*, categories:hostel_cleaning_type_categories(category_id)', { count: 'exact' })
      .eq('institution_id', institutionId);

    if (isActive) query = query.eq('is_active', isActive === 'true');

    query = query.range(from, to).order('sort_order', { ascending: true });
    const { data, error, count } = await query;
    if (error) throw error;
    return paginatedResponse(data ?? [], count ?? 0, page, limit);
  }

  // Default: bookings
  const status = getStringParam(url, 'status');
  const blockId = getUuidParam(url, 'block_id');
  const roomId = getUuidParam(url, 'room_id');
  const cleaningType = getStringParam(url, 'cleaning_type');
  const { dateFrom, dateTo } = getDateRangeParams(url);

  let query = (auth.supabase as any)
    .from('hostel_cleaning_bookings')
    .select('*', { count: 'exact' })
    .eq('institution_id', institutionId);

  if (status) query = query.eq('status', status);
  if (blockId) query = query.eq('block_id', blockId);
  if (roomId) query = query.eq('room_id', roomId);
  // type_name is the snapshot taken at booking time, so historical rows keep
  // the name the type had when the job was booked.
  if (cleaningType) query = query.eq('type_name', cleaningType);
  if (dateFrom) query = query.gte('booking_date', dateFrom);
  if (dateTo) query = query.lte('booking_date', dateTo);

  query = query.range(from, to).order('booking_date', { ascending: false });
  const { data, error, count } = await query;
  if (error) throw error;
  return paginatedResponse(data ?? [], count ?? 0, page, limit);
}, { allowApiKey: true, requiredPermission: 'read' });

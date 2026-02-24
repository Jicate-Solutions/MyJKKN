import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { successApiResponse, errorResponse } from '@/lib/api-keys/response-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

export const GET = withApiKeyAuth(async (request, auth, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) return errorResponse('Learner ID is required', 400);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const { data, error } = await (auth.supabase as any)
    .from('hostel_allocations')
    .select(`
      id, learner_id, block_id, room_id, bed_id, status,
      check_in_date, check_out_date, academic_year, created_at,
      hostel_blocks(id, name, code),
      hostel_rooms(id, room_number),
      hostel_beds(id, bed_number)
    `)
    .eq('learner_id', id)
    .eq('institution_id', institutionId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!data || data.length === 0) return errorResponse('No allocations found for this learner', 404);
  return successApiResponse(data);
}, { permission: 'read' });

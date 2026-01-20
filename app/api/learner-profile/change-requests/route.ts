// app/api/learner-profile/change-requests/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';
import { createClient } from '@/lib/supabase/server';
import { CreateChangeRequestDto, ChangeRequestStatus } from '@/types/learner-profile-change';

/**
 * GET /api/learner-profile/change-requests
 * List change requests with filters
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get filters from query params
    const searchParams = request.nextUrl.searchParams;
    const statusParam = searchParams.get('status') || 'pending';
    const filters = {
      status: statusParam as ChangeRequestStatus,
      institution_id: searchParams.get('institution_id') || undefined,
      department_id: searchParams.get('department_id') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '20'),
    };

    const result = await LearnerProfileChangeService.getPendingRequests(filters);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error fetching change requests:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch change requests' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/learner-profile/change-requests
 * Create new change request
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CreateChangeRequestDto = await request.json();

    // Validate required fields
    if (!body.learner_id || !body.changed_fields || !body.fields_summary) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify student owns this learner profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('learner_id, role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'student' || profile.learner_id !== body.learner_id) {
      return NextResponse.json(
        { error: 'You can only submit requests for your own profile' },
        { status: 403 }
      );
    }

    const result = await LearnerProfileChangeService.createChangeRequest(body, user.id);

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error('[API] Error creating change request:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create change request' },
      { status: 500 }
    );
  }
}

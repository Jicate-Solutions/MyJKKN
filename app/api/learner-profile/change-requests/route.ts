export const dynamic = 'force-dynamic';

// app/api/learner-profile/change-requests/route.ts
import { NextRequest, NextResponse, connection } from 'next/server';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CreateChangeRequestDto, ChangeRequestStatus } from '@/types/learner-profile-change';
import { ProfileNotificationService } from '@/lib/services/profile/notification-service';

/**
 * GET /api/learner-profile/change-requests
 * List change requests with filters
 */
export async function GET(request: NextRequest) {
  await connection();
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
  await connection();
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

    // ── Notification: profile_change_requested ─────────────────────────────
    // Fire-and-forget: find HOD/admin users at the learner's institution and
    // notify them that a change request is pending review.
    // Errors are swallowed — notification failure must not block the response.
    (async () => {
      try {
        const svc = createServiceRoleClient();

        // Get the learner's institution_id for scoping
        const { data: learnerRow } = await svc
          .from('learners_profiles')
          .select('institution_id')
          .eq('id', body.learner_id)
          .single();

        const institutionId = learnerRow?.institution_id;
        if (!institutionId) return;

        // Find active HOD + admin users at this institution
        const { data: approvers } = await svc
          .from('profiles')
          .select('id')
          .eq('institution_id', institutionId)
          .in('role', ['super_admin', 'admin', 'hod', 'administrator'])
          .eq('is_active', true);

        const approverIds = (approvers ?? []).map((p: { id: string }) => p.id);
        if (approverIds.length === 0) return;

        await ProfileNotificationService.changeRequested(approverIds, {
          requestId: result.id,
          learnerId: body.learner_id,
          fieldsSummary: body.fields_summary,
        });
      } catch (notifyErr) {
        console.warn('[API] profile_change_requested notification failed (non-fatal):', notifyErr);
      }
    })();
    // ── End notification ───────────────────────────────────────────────────

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error('[API] Error creating change request:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create change request' },
      { status: 500 }
    );
  }
}

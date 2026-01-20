// app/api/learner-profile/change-requests/[id]/reject/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';
import { createClient } from '@/lib/supabase/server';
import { RejectRequestDto } from '@/types/learner-profile-change';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body: RejectRequestDto = await request.json();

    // Validate rejection reason
    if (!body.review_comments || body.review_comments.trim().length === 0) {
      return NextResponse.json(
        { error: 'Rejection reason is required' },
        { status: 400 }
      );
    }

    const result = await LearnerProfileChangeService.rejectChangeRequest(
      id,
      body,
      user.id
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error rejecting request:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reject request' },
      { status: 500 }
    );
  }
}

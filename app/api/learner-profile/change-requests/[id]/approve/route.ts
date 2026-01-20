// app/api/learner-profile/change-requests/[id]/approve/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';
import { createClient } from '@/lib/supabase/server';
import { ApproveRequestDto } from '@/types/learner-profile-change';

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
    const body: ApproveRequestDto = await request.json();

    const result = await LearnerProfileChangeService.approveChangeRequest(
      id,
      body,
      user.id
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error approving request:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to approve request' },
      { status: 500 }
    );
  }
}

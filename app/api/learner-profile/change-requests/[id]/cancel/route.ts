// app/api/learner-profile/change-requests/[id]/cancel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await LearnerProfileChangeService.cancelChangeRequest(
      params.id,
      user.id
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error cancelling request:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to cancel request' },
      { status: 500 }
    );
  }
}

// app/api/learner-profile/change-requests/pending/[learnerId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ learnerId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { learnerId } = await params;
    const result = await LearnerProfileChangeService.getPendingChangeRequest(learnerId);

    if (!result) {
      return NextResponse.json({ error: 'No pending request found' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error fetching pending request:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch pending request' },
      { status: 500 }
    );
  }
}

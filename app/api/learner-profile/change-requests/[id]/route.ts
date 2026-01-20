// app/api/learner-profile/change-requests/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';
import { createClient } from '@/lib/supabase/server';

export async function GET(
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
    const result = await LearnerProfileChangeService.getChangeRequest(id);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error fetching change request:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch change request' },
      { status: 404 }
    );
  }
}

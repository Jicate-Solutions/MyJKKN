// app/api/solutions/departments/nominations/[id]/reject/route.ts
// API route to reject a pending department nomination

import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { DepartmentTrackerService } from '@/lib/services/solutions/department-tracker-service';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { review_notes } = body;

    if (!review_notes) {
      return NextResponse.json(
        { error: 'review_notes is required when rejecting a nomination' },
        { status: 400 }
      );
    }

    await DepartmentTrackerService.rejectNomination(
      id,
      session.user.id,
      review_notes
    );

    return NextResponse.json({
      success: true,
      message: 'Nomination rejected',
    });
  } catch (error) {
    console.error('[API] Error in POST /api/solutions/departments/nominations/[id]/reject:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// app/api/solutions/departments/nominations/[id]/approve/route.ts
// API route to approve a pending department nomination

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
    const body = await request.json().catch(() => ({}));
    const reviewNotes = body.review_notes || undefined;

    const newDepartmentId = await DepartmentTrackerService.approveNomination(
      id,
      session.user.id,
      reviewNotes
    );

    return NextResponse.json({
      success: true,
      solution_department_id: newDepartmentId,
      message: 'Nomination approved successfully',
    });
  } catch (error) {
    console.error('[API] Error in POST /api/solutions/departments/nominations/[id]/approve:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

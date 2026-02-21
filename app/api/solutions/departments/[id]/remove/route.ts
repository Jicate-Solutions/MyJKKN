// app/api/solutions/departments/[id]/remove/route.ts
// API route to soft-remove (deactivate) a solution department

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
    const { reason } = body;

    if (!reason) {
      return NextResponse.json(
        { error: 'reason is required for removing a department' },
        { status: 400 }
      );
    }

    await DepartmentTrackerService.removeDepartment(
      id,
      reason,
      session.user.id
    );

    return NextResponse.json({
      success: true,
      message: 'Department deactivated successfully',
    });
  } catch (error) {
    console.error('[API] Error in POST /api/solutions/departments/[id]/remove:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

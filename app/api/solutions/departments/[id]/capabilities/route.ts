// app/api/solutions/departments/[id]/capabilities/route.ts
// API route to update capabilities for a solution department

import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { DepartmentTrackerService } from '@/lib/services/solutions/department-tracker-service';

export async function PATCH(
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
    const { capabilities } = body;

    if (!Array.isArray(capabilities)) {
      return NextResponse.json(
        { error: 'capabilities must be an array of strings' },
        { status: 400 }
      );
    }

    await DepartmentTrackerService.updateCapabilities(id, capabilities);

    return NextResponse.json({
      success: true,
      message: 'Capabilities updated successfully',
    });
  } catch (error) {
    console.error('[API] Error in PATCH /api/solutions/departments/[id]/capabilities:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

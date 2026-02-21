// app/api/solutions/departments/eligible/route.ts
// API route to get departments eligible for Solutions Hub

import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { DepartmentTrackerService } from '@/lib/services/solutions/department-tracker-service';

export async function GET() {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const eligible = await DepartmentTrackerService.getEligibleDepartments();

    return NextResponse.json(eligible);
  } catch (error) {
    console.error('[API] Error in GET /api/solutions/departments/eligible:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

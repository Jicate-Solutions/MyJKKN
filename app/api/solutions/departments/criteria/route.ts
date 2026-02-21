// app/api/solutions/departments/criteria/route.ts
// API route to get eligibility criteria rules

import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { DepartmentTrackerService } from '@/lib/services/solutions/department-tracker-service';

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active_only') !== 'false';

    const criteria = await DepartmentTrackerService.getEligibilityCriteria(activeOnly);

    return NextResponse.json(criteria);
  } catch (error) {
    console.error('[API] Error in GET /api/solutions/departments/criteria:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

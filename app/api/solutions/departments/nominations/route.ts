// app/api/solutions/departments/nominations/route.ts
// API routes for department nominations - list and create

import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { DepartmentTrackerService } from '@/lib/services/solutions/department-tracker-service';
import type { NominationStatus } from '@/lib/services/solutions/department-tracker-service';

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as NominationStatus | null;

    const nominations = await DepartmentTrackerService.getNominations(
      status || undefined
    );

    return NextResponse.json(nominations);
  } catch (error) {
    console.error('[API] Error in GET /api/solutions/departments/nominations:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const { department_id, institution_id, nomination_reason, suggested_capabilities } = body;

    if (!department_id || !institution_id || !nomination_reason) {
      return NextResponse.json(
        { error: 'department_id, institution_id, and nomination_reason are required' },
        { status: 400 }
      );
    }

    const nomination = await DepartmentTrackerService.nominateDepartment({
      department_id,
      institution_id,
      nomination_reason,
      suggested_capabilities: suggested_capabilities || [],
      nominated_by: session.user.id,
    });

    return NextResponse.json(nomination, { status: 201 });
  } catch (error) {
    console.error('[API] Error in POST /api/solutions/departments/nominations:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

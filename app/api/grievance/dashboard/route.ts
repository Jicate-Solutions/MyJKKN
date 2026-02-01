// app/api/grievance/dashboard/route.ts
// F004: Grievance Ticketing System - Dashboard API

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { GrievanceService } from '@/lib/services/grievance/grievance-service';
import { getAuthSession } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');
    const reportType = searchParams.get('type') || 'stats'; // stats | sla
    const dateFrom = searchParams.get('date_from') || undefined;
    const dateTo = searchParams.get('date_to') || undefined;

    if (!institutionId) {
      return NextResponse.json(
        { error: 'Institution ID is required' },
        { status: 400 }
      );
    }

    let data;
    if (reportType === 'sla') {
      data = await GrievanceService.getSLAReport(institutionId, dateFrom, dateTo);
    } else {
      data = await GrievanceService.getDashboardStats(institutionId);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in GET /api/grievance/dashboard:', error);

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

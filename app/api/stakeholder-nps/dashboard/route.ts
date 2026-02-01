import { NextResponse } from 'next/server';
import { NPSService } from '@/lib/services/stakeholder-nps/nps-service';
import { getAuthSession } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');

    if (!institutionId) {
      return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 });
    }

    const dashboard = await NPSService.getDashboardData(institutionId);

    return NextResponse.json(dashboard);
  } catch (error) {
    console.error('[stakeholder-nps] Error in GET /api/stakeholder-nps/dashboard:', error);

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

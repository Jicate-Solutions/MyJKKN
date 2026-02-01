import { NextResponse } from 'next/server';
import { MaturityAssessmentService } from '@/lib/services/maturity-assessment/maturity-assessment-service';
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
      return NextResponse.json(
        { error: 'institution_id is required' },
        { status: 400 }
      );
    }

    const dashboard = await MaturityAssessmentService.getDashboard(institutionId);

    return NextResponse.json(dashboard);
  } catch (error) {
    console.error('[GET /api/maturity-assessment/dashboard] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

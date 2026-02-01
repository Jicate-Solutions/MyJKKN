import { NextResponse } from 'next/server';
import { MaturityAssessmentService } from '@/lib/services/maturity-assessment/maturity-assessment-service';
import { getAuthSession, getEnhancedUserProfile } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check user role - only admins can approve
    const { profile } = await getEnhancedUserProfile();
    if (!profile || !['super_admin', 'admin', 'principal', 'hod'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to approve assessments' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Verify assessment exists and is in submitted status
    const existing = await MaturityAssessmentService.getAssessmentById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    if (existing.status !== 'submitted') {
      return NextResponse.json(
        { error: 'Only submitted assessments can be approved' },
        { status: 400 }
      );
    }

    const assessment = await MaturityAssessmentService.approveAssessment(
      id,
      profile.id
    );

    return NextResponse.json(assessment);
  } catch (error) {
    console.error('[POST /api/maturity-assessment/assessments/[id]/approve] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

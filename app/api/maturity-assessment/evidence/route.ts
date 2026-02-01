import { z } from 'zod';
import { NextResponse } from 'next/server';
import { MaturityAssessmentService } from '@/lib/services/maturity-assessment/maturity-assessment-service';
import { getAuthSession } from '@/lib/supabase/server';
import { createEvidenceSchema } from '@/lib/validations/maturity-assessment';

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const assessmentId = searchParams.get('assessment_id');

    if (!assessmentId) {
      return NextResponse.json(
        { error: 'assessment_id is required' },
        { status: 400 }
      );
    }

    const evidence = await MaturityAssessmentService.getEvidence(assessmentId);

    return NextResponse.json(evidence);
  } catch (error) {
    console.error('[GET /api/maturity-assessment/evidence] Error:', error);
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

    const json = await request.json();
    const validatedData = createEvidenceSchema.parse(json);

    const evidence = await MaturityAssessmentService.createEvidence(validatedData as any);

    return NextResponse.json(evidence, { status: 201 });
  } catch (error) {
    console.error('[POST /api/maturity-assessment/evidence] Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await MaturityAssessmentService.deleteEvidence(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/maturity-assessment/evidence] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

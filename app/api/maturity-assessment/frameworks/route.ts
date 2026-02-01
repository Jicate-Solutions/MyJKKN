import { z } from 'zod';
import { NextResponse } from 'next/server';
import { MaturityAssessmentService } from '@/lib/services/maturity-assessment/maturity-assessment-service';
import { getAuthSession } from '@/lib/supabase/server';
import { createFrameworkSchema } from '@/lib/validations/maturity-assessment';

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

    const framework = await MaturityAssessmentService.getFramework(institutionId);

    return NextResponse.json(framework);
  } catch (error) {
    console.error('[GET /api/maturity-assessment/frameworks] Error:', error);
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
    const validatedData = createFrameworkSchema.parse(json);

    const framework = await MaturityAssessmentService.createFramework(validatedData as any);

    return NextResponse.json(framework, { status: 201 });
  } catch (error) {
    console.error('[POST /api/maturity-assessment/frameworks] Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message.includes('unique')) {
      return NextResponse.json(
        { error: 'A framework already exists for this institution' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

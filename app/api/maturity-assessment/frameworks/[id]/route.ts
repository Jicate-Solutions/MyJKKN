import { z } from 'zod';
import { NextResponse } from 'next/server';
import { MaturityAssessmentService } from '@/lib/services/maturity-assessment/maturity-assessment-service';
import { getAuthSession } from '@/lib/supabase/server';
import { updateFrameworkSchema } from '@/lib/validations/maturity-assessment';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const framework = await MaturityAssessmentService.getFrameworkById(id);

    if (!framework) {
      return NextResponse.json({ error: 'Framework not found' }, { status: 404 });
    }

    return NextResponse.json(framework);
  } catch (error) {
    console.error('[GET /api/maturity-assessment/frameworks/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const json = await request.json();
    const validatedData = updateFrameworkSchema.parse(json);

    const framework = await MaturityAssessmentService.updateFramework(id, validatedData as any);

    return NextResponse.json(framework);
  } catch (error) {
    console.error('[PATCH /api/maturity-assessment/frameworks/[id]] Error:', error);

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

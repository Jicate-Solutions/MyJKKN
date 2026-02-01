import { z } from 'zod';
import { NextResponse } from 'next/server';
import { MaturityAssessmentService } from '@/lib/services/maturity-assessment/maturity-assessment-service';
import { getAuthSession, getEnhancedUserProfile } from '@/lib/supabase/server';
import { updateProgressItemSchema } from '@/lib/validations/maturity-assessment';

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
    const progressItem = await MaturityAssessmentService.getProgressItemById(id);

    if (!progressItem) {
      return NextResponse.json({ error: 'Progress item not found' }, { status: 404 });
    }

    return NextResponse.json(progressItem);
  } catch (error) {
    console.error('[GET /api/maturity-assessment/progress/[id]] Error:', error);
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
    const validatedData = updateProgressItemSchema.parse(json);

    const progressItem = await MaturityAssessmentService.updateProgressItem(id, validatedData as any);

    return NextResponse.json(progressItem);
  } catch (error) {
    console.error('[PATCH /api/maturity-assessment/progress/[id]] Error:', error);

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

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check user role
    const { profile } = await getEnhancedUserProfile();
    if (!profile || !['super_admin', 'admin', 'principal', 'hod'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    await MaturityAssessmentService.deleteProgressItem(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/maturity-assessment/progress/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

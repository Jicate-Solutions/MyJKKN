import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/lib/supabase/server';
import { ProcessExcellenceService } from '@/lib/services/process-excellence/process-excellence-service';

const querySchema = z.object({
  institution_id: z.string().uuid('Institution ID is required')
});

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
        { error: 'Institution ID is required' },
        { status: 400 }
      );
    }

    const validatedParams = querySchema.parse({ institution_id: institutionId });

    const supabase = await createClient();
    const dashboard = await ProcessExcellenceService.getDashboard(
      validatedParams.institution_id,
      supabase
    );

    return NextResponse.json(dashboard);
  } catch (error) {
    console.error('[process-excellence/dashboard] GET Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

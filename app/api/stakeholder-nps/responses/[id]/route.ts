import { NextResponse } from 'next/server';
import { NPSService } from '@/lib/services/stakeholder-nps/nps-service';
import { getAuthSession } from '@/lib/supabase/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: 'Response ID is required' }, { status: 400 });
    }

    const response = await NPSService.getResponse(id);

    return NextResponse.json(response);
  } catch (error) {
    console.error('[stakeholder-nps] Error in GET /api/stakeholder-nps/responses/[id]:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'Response not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

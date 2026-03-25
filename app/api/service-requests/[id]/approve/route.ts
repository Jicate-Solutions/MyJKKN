import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthSession } from '@/lib/supabase/server';
import { ServiceRequestApprovalService } from '@/lib/services/service-requests/service-request-approval-service';
import { processApprovalSchema, type ProcessApprovalDto } from '@/types/service-request';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await request.json();
    const validated = processApprovalSchema.parse(json) as ProcessApprovalDto;

    await ServiceRequestApprovalService.processApproval(
      id,
      validated,
      session.user.id
    );

    return NextResponse.json({ message: 'Approval processed successfully' });
  } catch (error) {
    console.error('[service-requests] POST approve error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.message.includes('not awaiting') || error.message.includes('Only users with role')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

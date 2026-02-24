import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { ServiceRequestService } from '@/lib/services/service-requests/service-request-service';

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

    const json = await request.json().catch(() => ({}));
    const reason: string = (typeof json.reason === 'string' && json.reason.trim())
      ? json.reason.trim()
      : 'Cancelled by requester';

    const result = await ServiceRequestService.cancelRequest(
      id,
      session.user.id,
      reason
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('[service-requests] POST cancel error:', error);

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
      }
      if (error.message.includes('cannot be cancelled')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { getAuthSession, createServerSupabaseClient } from '@/lib/supabase/server';
import { recordFeatureUse, FEATURE_KEYS } from '@/lib/usage/record';
import { ServiceRequestService } from '@/lib/services/service-requests/service-request-service';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await ServiceRequestService.submitRequest(id, session.user.id);
    // Adoption loop: the draft / returned path to a raised request.
    await recordFeatureUse(
      await createServerSupabaseClient(),
      FEATURE_KEYS.SERVICE_REQUESTS_RAISE
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error('[service-requests] POST submit error:', error);

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
      }
      if (error.message.includes('Only draft')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

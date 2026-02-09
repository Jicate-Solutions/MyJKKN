import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { ServiceRequestApprovalService } from '@/lib/services/service-requests/service-request-approval-service';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's role
    const supabase = await createServerSupabaseClient();
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const count = await ServiceRequestApprovalService.getPendingApprovalCount(
      profile.role
    );

    return NextResponse.json({ count });
  } catch (error) {
    console.error('[service-requests/approvals/count] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

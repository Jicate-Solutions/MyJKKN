import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { ServiceRequestApprovalService } from '@/lib/services/service-requests/service-request-approval-service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ServiceRequestFilters } from '@/types/service-request';

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const filters: ServiceRequestFilters = {
      institution_id: searchParams.get('institution_id') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20,
    };

    const result = await ServiceRequestApprovalService.getPendingApprovalsForUser(
      profile.role,
      filters
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('[service-requests/approvals] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

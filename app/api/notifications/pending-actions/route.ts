import { NextResponse } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';
import type { PendingAction } from '@/types/notifications';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    // Get the current user
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use service role client to call the RPC function (bypasses RLS)
    const serviceClient = createServiceRoleClient();

    const { data, error } = await (serviceClient as any).rpc(
      'get_pending_actions',
      { p_user_id: user.id }
    );

    if (error) {
      console.error('[notifications/pending-actions] RPC error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch pending actions' },
        { status: 500 }
      );
    }

    const actions: PendingAction[] = data || [];

    const urgent_count = actions.filter(
      (a) => a.action_type === 'urgent'
    ).length;
    const tracked_count = actions.filter(
      (a) => a.action_type === 'tracked'
    ).length;

    return NextResponse.json(
      { actions, urgent_count, tracked_count },
      {
        headers: {
          'Cache-Control': 'private, no-store'
        }
      }
    );
  } catch (error) {
    console.error('[notifications/pending-actions] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

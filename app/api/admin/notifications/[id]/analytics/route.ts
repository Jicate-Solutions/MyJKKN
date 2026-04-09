export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/admin/notifications/[id]/analytics
 *
 * Returns comprehensive communication reach analytics:
 * - Summary (total, read, acknowledged, percentages)
 * - Institution-wise breakdown with read/ack rates
 * - Role-wise breakdown
 * - Timeline (reads per hour)
 * - Recent readers list (last 50)
 * - Not-read list (first 100, searchable via query param)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin permission
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id: notificationId } = await params;

    // Use DB function — bypasses PostgREST column cache issues
    const { data: analytics, error } = await supabase
      .rpc('get_notification_analytics', { p_notification_id: notificationId });

    if (error) {
      console.error('Error fetching notification analytics:', error);
      return NextResponse.json(
        { error: 'Failed to fetch analytics' },
        { status: 500 }
      );
    }

    return NextResponse.json(analytics, {
      headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' }
    });
  } catch (error) {
    console.error('Error in notification analytics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

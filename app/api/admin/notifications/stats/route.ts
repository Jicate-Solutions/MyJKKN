import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_request, auth) => {
  try {
    const supabase = auth.supabase;

    // Permission gate is enforced in the wrapper (notifications.view).

    // Get total notifications sent
    const { count: totalSent } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true });

    // Get unique users reached (distinct user_ids from user_notifications)
    // Supabase JS client doesn't support COUNT(DISTINCT), so we fetch user_ids and deduplicate
    const { data: userIdRows } = await supabase
      .from('user_notifications')
      .select('user_id');

    const uniqueUserIds = new Set(userIdRows?.map((row: { user_id: string }) => row.user_id));
    const uniqueUsersReached = uniqueUserIds.size;

    // Get total delivered row count (exact) for the read-percentage denominator.
    // Must be an exact count over the SAME population as totalRead. A bare
    // .select() array (userIdRows above) is capped by PostgREST at db-max-rows
    // (~1000), so using its length undercounts the denominator and can push the
    // ratio above 100% (observed 278% on prod = 2780 read / 1000 capped).
    const { count: totalDelivered } = await supabase
      .from('user_notifications')
      .select('*', { count: 'exact', head: true });

    // Get read notifications count
    const { count: totalRead } = await supabase
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .not('read_at', 'is', null);

    // Get acknowledged notifications count
    const { count: totalAcknowledged } = await supabase
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .not('acknowledged_at', 'is', null);

    // Calculate read percentage. Numerator and denominator are both exact counts
    // over the same user_notifications population, so the ratio can never exceed
    // 100%. Math.min is a defensive clamp.
    const readPercentage = totalDelivered
      ? Math.min(100, Math.round(((totalRead || 0) / totalDelivered) * 100))
      : 0;

    return NextResponse.json(
      {
        total_sent: totalSent || 0,
        total_read: totalRead || 0,
        read_percentage: readPercentage,
        target_users: uniqueUsersReached,
        acknowledged: totalAcknowledged || 0
      },
      {
        headers: {
          'Cache-Control': 'private, no-store'
        }
      }
    );
  } catch (error) {
    console.error('Error fetching notification stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}, { allowApiKey: false, requirePermission: 'notifications.view' });

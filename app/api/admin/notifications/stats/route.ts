import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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

    // Check permissions (same as notifications list)
    const { data: userProfileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const userProfile = userProfileData as { role: string } | null;

    const { data: rolePermissionsData } = await supabase
      .from('custom_roles')
      .select('permissions')
      .eq('role_key', userProfile?.role || '')
      .single();

    const rolePermissions = rolePermissionsData as { permissions: Record<string, boolean> } | null;

    const hasPermission =
      userProfile?.role === 'super_admin' ||
      rolePermissions?.permissions?.['notifications.view'] === true ||
      rolePermissions?.permissions?.['notifications.view.all'] === true;

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

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

    // Get total row count for read percentage calculation
    const totalNotificationRows = userIdRows?.length || 0;

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

    // Calculate read percentage based on total notification rows (not unique users)
    const readPercentage = totalNotificationRows
      ? Math.round(((totalRead || 0) / totalNotificationRows) * 100)
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
}

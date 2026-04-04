export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  await connection();
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

    // Get total user_notifications (target users across all notifications)
    const { count: totalTargetUsers } = await supabase
      .from('user_notifications')
      .select('*', { count: 'exact', head: true });

    // Get read notifications count
    const { count: totalRead } = await supabase
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .not('read_at', 'is', null);

    // Calculate read percentage
    const readPercentage = totalTargetUsers
      ? Math.round(((totalRead || 0) / totalTargetUsers) * 100)
      : 0;

    return NextResponse.json({
      total_sent: totalSent || 0,
      total_read: totalRead || 0,
      read_percentage: readPercentage,
      target_users: totalTargetUsers || 0
    });
  } catch (error) {
    console.error('Error fetching notification stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

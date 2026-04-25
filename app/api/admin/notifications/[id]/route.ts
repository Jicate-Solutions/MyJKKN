export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id } = await params;
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

    // Permission gate — canonical MyJKKN pattern: is_super_admin / is_admin / user_has_permission.
    // Matches the standardized RLS policy pattern (see CLAUDE.md "Role Management & Dynamic
    // Permission System"). Adding a new role here is a 1-row DB grant in Role Management,
    // not a route.ts edit + deploy.
    const [superAdminRes, adminRes, viewPermRes, viewAllPermRes] = await Promise.all([
      (supabase as any).rpc('is_super_admin'),
      (supabase as any).rpc('is_admin'),
      (supabase as any).rpc('user_has_permission', { permission_name: 'notifications.view' }),
      (supabase as any).rpc('user_has_permission', { permission_name: 'notifications.view.all' })
    ]);

    const hasPermission =
      superAdminRes.data === true ||
      adminRes.data === true ||
      viewPermRes.data === true ||
      viewAllPermRes.data === true;

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Fetch the notification with creator profile
    const { data: notification, error } = await supabase
      .from('notifications')
      .select(
        `
        id,
        title,
        body,
        url,
        icon,
        priority,
        category,
        sent_at,
        expires_at,
        targeting,
        created_by,
        created_at,
        creator:profiles!created_by(
          full_name,
          email
        )
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return NextResponse.json(
          { error: 'Notification not found' },
          { status: 404 }
        );
      }
      console.error('Error fetching notification:', error);
      return NextResponse.json(
        { error: 'Failed to fetch notification' },
        { status: 500 }
      );
    }

    // Type assertion for notification data
    const notificationData = notification as {
      id: string;
      title: string;
      body: string;
      url?: string;
      icon?: string;
      priority: string;
      category?: string;
      sent_at?: string;
      expires_at?: string;
      targeting: Record<string, string | null>;
      created_by: string;
      created_at: string;
      creator: { full_name?: string; email?: string } | null;
    };

    // --- Fetch target names ---
    const targetingWithNames = { ...notificationData.targeting };
    const promises = [];

    if (notificationData.targeting.institution_id) {
      promises.push(
        supabase
          .from('institutions')
          .select('name')
          .eq('id', notificationData.targeting.institution_id)
          .single()
          .then(({ data }) => {
            const instData = data as { name: string } | null;
            if (instData) (targetingWithNames as any).institution_name = instData.name;
          })
      );
    }

    if (notificationData.targeting.department_id) {
      promises.push(
        supabase
          .from('departments')
          .select('department_name')
          .eq('id', notificationData.targeting.department_id)
          .single()
          .then(({ data }) => {
            const deptData = data as { department_name: string } | null;
            if (deptData)
              (targetingWithNames as any).department_name =
                deptData.department_name;
          })
      );
    }

    if (notificationData.targeting.program_id) {
      promises.push(
        supabase
          .from('programs')
          .select('program_name')
          .eq('id', notificationData.targeting.program_id)
          .single()
          .then(({ data }) => {
            const progData = data as { program_name: string } | null;
            if (progData)
              (targetingWithNames as any).program_name = progData.program_name;
          })
      );
    }

    await Promise.all(promises);
    // --- End fetch target names ---

    // Get delivery statistics
    const { count: totalRecipients } = await supabase
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('notification_id', id);

    const { count: readCount } = await supabase
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('notification_id', id)
      .not('read_at', 'is', null);

    // Add delivery stats to the notification
    const notificationWithDetails = {
      ...notificationData,
      targeting: targetingWithNames,
      delivery_stats: {
        total_recipients: totalRecipients || 0,
        delivered: totalRecipients || 0, // Assume all are delivered for now
        read: readCount || 0
      }
    };

    return NextResponse.json(notificationWithDetails);
  } catch (error) {
    console.error('Error in notification details endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id } = await params;

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

    // Permission gate — canonical MyJKKN pattern: is_super_admin / is_admin / user_has_permission.
    // Matches the standardized RLS policy pattern (see CLAUDE.md "Role Management & Dynamic
    // Permission System"). `notifications.delete.all` is NOT a declared key in
    // lib/constants/permissions.ts — gate on `notifications.delete` only (the existing key).
    const [superAdminRes, adminRes, deletePermRes] = await Promise.all([
      (supabase as any).rpc('is_super_admin'),
      (supabase as any).rpc('is_admin'),
      (supabase as any).rpc('user_has_permission', { permission_name: 'notifications.delete' })
    ]);

    const hasPermission =
      superAdminRes.data === true ||
      adminRes.data === true ||
      deletePermRes.data === true;

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Delete the notification
    const { error: deleteError } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting notification:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete notification' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Error in notification delete endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

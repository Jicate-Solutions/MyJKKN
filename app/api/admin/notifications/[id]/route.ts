import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // Check permissions (same as notifications list)
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const { data: rolePermissions } = await supabase
      .from('custom_roles')
      .select('permissions')
      .eq('role_key', userProfile?.role)
      .single();

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

    // --- Fetch target names ---
    const targetingWithNames = { ...notification.targeting };
    const promises = [];

    if (notification.targeting.institution_id) {
      promises.push(
        supabase
          .from('institutions')
          .select('name')
          .eq('id', notification.targeting.institution_id)
          .single()
          .then(({ data }) => {
            if (data) (targetingWithNames as any).institution_name = data.name;
          })
      );
    }

    if (notification.targeting.department_id) {
      promises.push(
        supabase
          .from('departments')
          .select('department_name')
          .eq('id', notification.targeting.department_id)
          .single()
          .then(({ data }) => {
            if (data)
              (targetingWithNames as any).department_name =
                data.department_name;
          })
      );
    }

    if (notification.targeting.program_id) {
      promises.push(
        supabase
          .from('programs')
          .select('program_name')
          .eq('id', notification.targeting.program_id)
          .single()
          .then(({ data }) => {
            if (data)
              (targetingWithNames as any).program_name = data.program_name;
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
      ...notification,
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

    // Check permissions (same as notifications list)
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const { data: rolePermissions } = await supabase
      .from('custom_roles')
      .select('permissions')
      .eq('role_key', userProfile?.role)
      .single();

    const hasPermission =
      userProfile?.role === 'super_admin' ||
      rolePermissions?.permissions?.['notifications.delete'] === true ||
      rolePermissions?.permissions?.['notifications.delete.all'] === true;

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

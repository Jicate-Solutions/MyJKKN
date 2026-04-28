export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';

export const GET = withAuth(async (request, auth, context) => {
  await connection();
  const params = (await context?.params) as { id?: string } | undefined;
  const id = params?.id;
  try {
    if (!id) {
      return NextResponse.json({ error: 'Notification id is required' }, { status: 400 });
    }
    const supabase = auth.supabase;

    // Permission gate is enforced in the wrapper (notifications.view).

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
}, { allowApiKey: false, requirePermission: 'notifications.view' });

export const DELETE = withAuth(async (_request, auth, context) => {
  await connection();
  const params = (await context?.params) as { id?: string } | undefined;
  const id = params?.id;

  try {
    if (!id) {
      return NextResponse.json({ error: 'Notification id is required' }, { status: 400 });
    }
    const supabase = auth.supabase;

    // Permission gate is enforced in the wrapper (notifications.delete).

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
}, { allowApiKey: false, requirePermission: 'notifications.delete' });

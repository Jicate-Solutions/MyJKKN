import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
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

    // Parse the request body
    const body = await request.json();
    const { notification_ids, mark_all = false } = body;

    if (!mark_all && (!notification_ids || !Array.isArray(notification_ids))) {
      return NextResponse.json(
        { error: 'notification_ids array is required when mark_all is false' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null); // Only update unread notifications

    // If not marking all, filter by notification IDs
    if (!mark_all) {
      query = query.in('notification_id', notification_ids);
    }

    const { data, error } = await query.select();

    if (error) {
      console.error('Error marking notifications as read:', error);
      return NextResponse.json(
        { error: 'Failed to mark notifications as read' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: mark_all
        ? 'All notifications marked as read'
        : `${data?.length || 0} notifications marked as read`,
      updated_count: data?.length || 0
    });
  } catch (error) {
    console.error('Error in mark notifications as read endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

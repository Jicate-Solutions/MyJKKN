import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
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

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const unreadOnly = searchParams.get('unread_only') === 'true';

    const offset = (page - 1) * limit;

    // Use raw SQL query to ensure proper join
    const { data: notifications, error } = await supabase.rpc(
      'get_user_notifications',
      {
        p_user_id: user.id,
        p_offset: offset,
        p_limit: limit,
        p_unread_only: unreadOnly
      }
    );

    if (error) {
      console.error('Error fetching notifications:', error);
      return NextResponse.json(
        { error: 'Failed to fetch notifications' },
        { status: 500 }
      );
    }

    // Get unread count
    const { count: unreadCount, error: countError } = await supabase
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null);

    if (countError) {
      console.error('Error fetching unread count:', countError);
    }

    return NextResponse.json({
      notifications,
      unread_count: unreadCount || 0,
      page,
      limit,
      has_more: notifications.length === limit
    });
  } catch (error) {
    console.error('Error in notifications endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}



import { NextRequest, NextResponse , connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';
import type { NotificationWithStats } from '@/types/notification';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();

    // Verify authentication
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has permission to manage notifications
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
      rolePermissions?.permissions?.['notifications.create'] === true ||
      rolePermissions?.permissions?.['notifications.send'] === true ||
      rolePermissions?.permissions?.['notifications.manage'] === true;

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sort_by') || 'created_at';
    const sortOrder = searchParams.get('sort_order') || 'desc';

    // Use service role client to bypass RLS on user_notifications
    // so we can count across all users
    const serviceClient = createServiceRoleClient();

    // Build query for notifications with nested user_notifications
    let query = serviceClient
      .from('notifications')
      .select(
        `
        id,
        title,
        body,
        priority,
        category,
        created_at,
        updated_at,
        created_by,
        creator:profiles!fk_notifications_created_by(full_name),
        user_notifications(id, read_at)
      `,
        { count: 'exact' }
      );

    // Apply search filter
    if (search) {
      query = query.or(`title.ilike.%${search}%,body.ilike.%${search}%`);
    }

    // Apply sorting
    const ascending = sortOrder === 'asc';
    query = query.order(sortBy as any, { ascending });

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching notifications for manage:', error);
      return NextResponse.json(
        { error: 'Failed to fetch notifications' },
        { status: 500 }
      );
    }

    // Map to NotificationWithStats
    const notifications: NotificationWithStats[] = (data || []).map(
      (n: any) => ({
        id: n.id,
        title: n.title || '',
        body: n.body || '',
        priority: n.priority || 'normal',
        category: n.category || 'general',
        created_at: n.created_at,
        updated_at: n.updated_at,
        created_by: n.created_by,
        created_by_name: n.creator?.full_name || '',
        sent_to_count: n.user_notifications?.length || 0,
        read_by_count:
          n.user_notifications?.filter((un: any) => un.read_at != null)
            .length || 0
      })
    );

    const totalItems = count || 0;
    const totalPages = Math.ceil(totalItems / limit);

    return NextResponse.json({
      success: true,
      data: notifications,
      pagination: {
        page,
        limit,
        total_pages: totalPages,
        total_items: totalItems
      }
    });
  } catch (error) {
    console.error('Error in manage notifications endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

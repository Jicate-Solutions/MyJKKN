export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    // Verify authentication
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Permission gate — canonical MyJKKN pattern: is_super_admin / is_admin / user_has_permission.
    // Matches the standardized RLS policy pattern (see CLAUDE.md "Role Management & Dynamic
    // Permission System"). `notifications.manage` is NOT a declared key in
    // lib/constants/permissions.ts — gate on `notifications.create` OR `notifications.send`
    // OR `notifications.edit` (the closest declared keys for edit semantics).
    const [superAdminRes, adminRes, createPermRes, sendPermRes, editPermRes] = await Promise.all([
      (supabase as any).rpc('is_super_admin'),
      (supabase as any).rpc('is_admin'),
      (supabase as any).rpc('user_has_permission', { permission_name: 'notifications.create' }),
      (supabase as any).rpc('user_has_permission', { permission_name: 'notifications.send' }),
      (supabase as any).rpc('user_has_permission', { permission_name: 'notifications.edit' })
    ]);

    const hasPermission =
      superAdminRes.data === true ||
      adminRes.data === true ||
      createPermRes.data === true ||
      sendPermRes.data === true ||
      editPermRes.data === true;

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Only allow updating specific fields
    const allowedFields: Record<string, any> = {};
    if (body.title !== undefined) allowedFields.title = body.title;
    if (body.body !== undefined) allowedFields.body = body.body;
    if (body.priority !== undefined) allowedFields.priority = body.priority;
    if (body.category !== undefined) allowedFields.category = body.category;

    if (Object.keys(allowedFields).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Use service role to bypass RLS for updating
    const serviceClient = createServiceRoleClient();

    const { data, error } = await serviceClient
      .from('notifications')
      .update(allowedFields)
      .eq('id', id)
      .select('id, title, body, priority, category, updated_at')
      .single();

    if (error) {
      console.error('Error updating notification:', error);
      return NextResponse.json(
        { error: 'Failed to update notification' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error in PATCH notification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    // Verify authentication
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = createServiceRoleClient();

    const { data, error } = await serviceClient
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
        targeting,
        created_at,
        updated_at,
        created_by,
        creator:profiles!fk_notifications_created_by(full_name),
        user_notifications(id, read_at)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching notification:', error);
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        sent_to_count: data.user_notifications?.length || 0,
        read_by_count:
          data.user_notifications?.filter((un: any) => un.read_at != null)
            .length || 0
      }
    });
  } catch (error) {
    console.error('Error in GET notification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

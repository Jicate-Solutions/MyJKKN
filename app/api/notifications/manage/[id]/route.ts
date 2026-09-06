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

    // Authorization gate — dynamic, multi-role-aware permission check.
    // user_has_permission() and is_super_admin() are SECURITY DEFINER RPCs that
    // merge permissions across ALL of a user's assigned roles (user_roles) with
    // the super-admin bypass built in, so multi-role admins are not wrongly
    // blocked by the legacy single profiles.role field. Editing a notification
    // is gated on the same permissions that allow creating/sending them, so no
    // role that could edit before loses access.
    const [isSuperAdmin, canCreate, canSend, canManage] = await Promise.all([
      (supabase as any).rpc('is_super_admin'),
      (supabase as any).rpc('user_has_permission', {
        permission_name: 'notifications.create'
      }),
      (supabase as any).rpc('user_has_permission', {
        permission_name: 'notifications.send'
      }),
      (supabase as any).rpc('user_has_permission', {
        permission_name: 'notifications.manage'
      })
    ]);

    const hasPermission =
      isSuperAdmin?.data === true ||
      canCreate?.data === true ||
      canSend?.data === true ||
      canManage?.data === true;

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

    // Authorization gate — this route reads ANY notification by id via the
    // service-role client (which bypasses RLS), so without an explicit gate any
    // authenticated user could read any notification (IDOR). Require the
    // notifications.view permission. user_has_permission()/is_super_admin() are
    // SECURITY DEFINER RPCs that merge across all assigned roles with the
    // super-admin bypass built in, matching the sibling notification admin
    // routes' intent while remaining multi-role aware.
    const [isSuperAdmin, canView] = await Promise.all([
      (supabase as any).rpc('is_super_admin'),
      (supabase as any).rpc('user_has_permission', {
        permission_name: 'notifications.view'
      })
    ]);

    if (isSuperAdmin?.data !== true && canView?.data !== true) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
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

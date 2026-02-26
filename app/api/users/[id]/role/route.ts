// app/api/users/[id]/role/route.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Database, SYSTEM_ROLES } from '@/types/auth';
import { logActivity, ActivityTemplates } from '@/lib/utils/activity-logger';
import { RESOURCE_TYPES } from '@/types/activity';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await params;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: any) {
          cookieStore.set(name, '', { ...options, maxAge: 0 });
        }
      }
    }
  );

  try {
    const body = await request.json();

    // Support two call shapes:
    //   Legacy:  { role: 'store_admin' }
    //   Multi:   { roles: ['student', 'store_admin'], primaryRole: 'student' }
    const roles: string[] = body.roles ?? (body.role ? [body.role] : []);
    const role: string = body.primaryRole ?? body.role ?? '';

    if (!role || roles.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Role is required'
        },
        { status: 400 }
      );
    }

    if (!roles.includes(role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'primaryRole must be one of the assigned roles'
        },
        { status: 400 }
      );
    }

    // Get current session
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (!user || userError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized'
        },
        { status: 401 }
      );
    }

    // Verify super admin role
    const { data: currentUser, error: currentUserError } = await supabase
      .from('profiles')
      .select('role, full_name, institution_id')
      .eq('id', user.id)
      .single();

    if (currentUserError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to verify user permissions'
        },
        { status: 500 }
      );
    }

    if (
      currentUser.role !== SYSTEM_ROLES.SUPER_ADMIN &&
      currentUser.role !== SYSTEM_ROLES.ADMINISTRATOR
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Only super admins and administrators can update roles'
        },
        { status: 403 }
      );
    }

    // Verify the role exists in custom_roles table and get its ID
    const { data: validRole, error: validRoleError } = await supabase
      .from('custom_roles')
      .select('id, role_key')
      .eq('role_key', role)
      .single();

    if (validRoleError || !validRole) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid role: ${role}`
        },
        { status: 400 }
      );
    }

    // Service role client bypasses RLS — required for cross-user profile lookups
    // (profiles RLS only allows users to see their own row via anon key)
    const serviceClient = createServiceRoleClient();

    // Check target user using service client to bypass profiles RLS
    const { data: targetUser, error: targetUserError } = await (
      serviceClient.from('profiles') as any
    )
      .select('role, full_name, email')
      .eq('id', userId)
      .single();

    if (targetUserError) {
      return NextResponse.json(
        {
          success: false,
          error: 'User not found'
        },
        { status: 404 }
      );
    }

    // Special check: Prevent modifying another super admin's role
    if (
      targetUser.role === SYSTEM_ROLES.SUPER_ADMIN &&
      role !== SYSTEM_ROLES.SUPER_ADMIN
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot modify another super admin's role"
        },
        { status: 403 }
      );
    }

    // Update the user's role using service role client to bypass RLS

    const { data: updatedUser, error: updateError } = await (
      serviceClient.from('profiles') as any
    )
      .update({
        role,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to update role: ${updateError.message}`
        },
        { status: 500 }
      );
    }

    // Sync user_roles table — supports both single-role (legacy) and multi-role assignment.
    // Strategy: resolve all role IDs first, then replace the user's entire role set atomically.
    try {
      // Resolve all role keys to their IDs (validRole.id covers the primary; fetch the rest)
      const allRoleIds: { role_key: string; id: string }[] = [
        { role_key: role, id: validRole.id }
      ];

      if (roles.length > 1) {
        const secondaryKeys = roles.filter((r) => r !== role);
        const { data: secondaryRoles, error: secondaryError } = await (
          serviceClient.from('custom_roles') as any
        )
          .select('id, role_key')
          .in('role_key', secondaryKeys);

        if (secondaryError) {
          console.error('Error resolving secondary role IDs:', secondaryError);
        } else if (secondaryRoles) {
          for (const sr of secondaryRoles as { id: string; role_key: string }[]) {
            allRoleIds.push({ role_key: sr.role_key, id: sr.id });
          }
        }
      }

      // Delete ALL existing role assignments for this user, then re-insert cleanly.
      // This is safer than patching individual rows (avoids stale secondary roles lingering).
      const { error: deleteError } = await (
        serviceClient.from('user_roles') as any
      )
        .delete()
        .eq('user_id', userId);

      if (deleteError) {
        console.error('Error clearing user_roles:', deleteError);
      } else {
        const assignments = allRoleIds.map(({ id: roleId, role_key }) => ({
          user_id: userId,
          role_id: roleId,
          is_primary: role_key === role,
          assigned_by: user.id
        }));

        const { error: insertError } = await (
          serviceClient.from('user_roles') as any
        ).insert(assignments);

        if (insertError) {
          console.error('Error inserting user_roles:', insertError);
        }
      }
    } catch (rolesSyncError) {
      // Log but don't fail the request — profiles.role is already updated
      console.error('Error syncing user_roles table:', rolesSyncError);
    }

    // Log the role change activity
    const actorName = currentUser?.full_name || 'Unknown';
    const targetName = targetUser?.full_name || 'Unknown';
    const oldRole = targetUser?.role || 'Unknown';
    const newRole = role;

    const template = ActivityTemplates.roleChanged(
      actorName,
      targetName,
      oldRole,
      newRole
    );

    await logActivity({
      userId: user.id,
      actionType: template.actionType,
      resourceType: template.resourceType,
      resourceId: userId,
      resourceName: targetName,
      description: template.description,
      request,
      metadata: {
        target_user_id: userId,
        target_email: targetUser?.email,
        old_role: oldRole,
        new_role: newRole,
        changed_by_role: currentUser?.role
      },
      institutionId: currentUser?.institution_id,
      statusCode: 200
    });

    return NextResponse.json({
      success: true,
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error'
      },
      { status: 500 }
    );
  }
}

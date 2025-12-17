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
    const { role } = await request.json();

    if (!role) {
      return NextResponse.json(
        {
          success: false,
          error: 'Role is required'
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

    // Check target user
    const { data: targetUser, error: targetUserError } = await supabase
      .from('profiles')
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
    // Use service role client for admin operations to bypass RLS
    const serviceClient = createServiceRoleClient();

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

    // IMPORTANT: Also update the user_roles table for permissions to work correctly
    // The user_roles table is the source of truth for permissions
    try {
      // Check if user has any existing role assignments
      const { data: existingRoles, error: existingRolesError } = await (
        serviceClient.from('user_roles') as any
      )
        .select('id, role_id, is_primary')
        .eq('user_id', userId);

      if (existingRolesError) {
        console.error('Error checking existing roles:', existingRolesError);
      }

      if (existingRoles && existingRoles.length > 0) {
        // User has existing roles - update the primary role to the new one
        const primaryRole = existingRoles.find((r: any) => r.is_primary);

        if (primaryRole) {
          // Update the primary role entry to point to the new role
          const { error: updateRoleError } = await (
            serviceClient.from('user_roles') as any
          )
            .update({ role_id: validRole.id })
            .eq('id', primaryRole.id);

          if (updateRoleError) {
            console.error('Error updating user_roles:', updateRoleError);
          }
        } else {
          // No primary role found - update the first one and mark as primary
          const { error: updateRoleError } = await (
            serviceClient.from('user_roles') as any
          )
            .update({ role_id: validRole.id, is_primary: true })
            .eq('id', existingRoles[0].id);

          if (updateRoleError) {
            console.error('Error updating user_roles:', updateRoleError);
          }
        }
      } else {
        // User has no role assignments - create one
        const { error: insertRoleError } = await (
          serviceClient.from('user_roles') as any
        ).insert({
          user_id: userId,
          role_id: validRole.id,
          is_primary: true
        });

        if (insertRoleError) {
          console.error('Error inserting user_roles:', insertRoleError);
        }
      }
    } catch (rolesSyncError) {
      // Log but don't fail the request - profiles.role is already updated
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

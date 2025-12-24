/**
 * User Roles Management API
 *
 * Endpoints for managing user role assignments (multi-role support)
 *
 * @created 2025-11-28
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Database } from '@/types/auth';
import { createClient } from '@supabase/supabase-js';

// Create admin client for role management
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * GET /api/users/[id]/roles
 * Get all roles assigned to a user
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    // Check authentication
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user roles with role details using the RPC function
    const { data: roles, error: rolesError } = await (supabase as any).rpc(
      'get_user_roles_with_details',
      { p_user_id: userId }
    );

    if (rolesError) {
      console.error('Error fetching user roles:', rolesError);
      return NextResponse.json(
        { error: 'Failed to fetch user roles' },
        { status: 500 }
      );
    }

    // Also get merged permissions
    const { data: permissions, error: permError } = await (supabase as any).rpc(
      'get_user_merged_permissions',
      { p_user_id: userId }
    );

    return NextResponse.json({
      success: true,
      data: {
        roles: roles || [],
        primary_role: roles?.find((r: any) => r.is_primary) || roles?.[0] || null,
        merged_permissions: permissions || {}
      }
    });
  } catch (error) {
    console.error('Error in GET /api/users/[id]/roles:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/users/[id]/roles
 * Assign roles to a user (replaces existing roles)
 *
 * Body: { role_ids: string[], primary_role_id?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;
    const body = await request.json();
    const { role_ids, primary_role_id } = body;

    if (!role_ids || !Array.isArray(role_ids) || role_ids.length === 0) {
      return NextResponse.json(
        { error: 'role_ids array is required and must not be empty' },
        { status: 400 }
      );
    }

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

    // Check authentication
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has permission to manage users
    const { data: currentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !['super_admin', 'administrator'].includes(currentProfile?.role || '')
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions to manage user roles' },
        { status: 403 }
      );
    }

    // Determine primary role
    const effectivePrimaryRoleId = primary_role_id || role_ids[0];

    if (primary_role_id && !role_ids.includes(primary_role_id)) {
      return NextResponse.json(
        { error: 'primary_role_id must be one of the role_ids' },
        { status: 400 }
      );
    }

    // Delete existing role assignments
    const { error: deleteError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.error('Error deleting existing roles:', deleteError);
      return NextResponse.json(
        { error: 'Failed to update user roles' },
        { status: 500 }
      );
    }

    // Create new role assignments
    const roleAssignments = role_ids.map((roleId: string) => ({
      user_id: userId,
      role_id: roleId,
      is_primary: roleId === effectivePrimaryRoleId,
      assigned_by: user.id
    }));

    const { error: insertError } = await supabaseAdmin
      .from('user_roles')
      .insert(roleAssignments);

    if (insertError) {
      console.error('Error inserting new roles:', insertError);
      return NextResponse.json(
        { error: 'Failed to assign roles' },
        { status: 500 }
      );
    }

    // Fetch the newly assigned roles
    const { data: newRoles } = await supabaseAdmin.rpc(
      'get_user_roles_with_details',
      { p_user_id: userId }
    );

    return NextResponse.json({
      success: true,
      message: `Successfully assigned ${role_ids.length} role(s) to user`,
      data: {
        roles: newRoles || [],
        primary_role_id: effectivePrimaryRoleId
      }
    });
  } catch (error) {
    console.error('Error in POST /api/users/[id]/roles:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users/[id]/roles
 * Remove a specific role from a user
 *
 * Query: ?role_id=xxx
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;
    const url = new URL(request.url);
    const roleId = url.searchParams.get('role_id');

    if (!roleId) {
      return NextResponse.json(
        { error: 'role_id query parameter is required' },
        { status: 400 }
      );
    }

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

    // Check authentication
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has permission to manage users
    const { data: currentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !['super_admin', 'administrator'].includes(currentProfile?.role || '')
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions to manage user roles' },
        { status: 403 }
      );
    }

    // Check how many roles the user currently has
    const { count, error: countError } = await supabaseAdmin
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) {
      return NextResponse.json(
        { error: 'Failed to check user roles' },
        { status: 500 }
      );
    }

    if (count && count <= 1) {
      return NextResponse.json(
        { error: 'Cannot remove the last role. Users must have at least one role.' },
        { status: 400 }
      );
    }

    // Check if this is the primary role
    const { data: roleToRemove, error: fetchError } = await supabaseAdmin
      .from('user_roles')
      .select('is_primary')
      .eq('user_id', userId)
      .eq('role_id', roleId)
      .single();

    if (fetchError) {
      return NextResponse.json(
        { error: 'Role not found for this user' },
        { status: 404 }
      );
    }

    // Delete the role assignment
    const { error: deleteError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('role_id', roleId);

    if (deleteError) {
      console.error('Error deleting role:', deleteError);
      return NextResponse.json(
        { error: 'Failed to remove role' },
        { status: 500 }
      );
    }

    // If we removed the primary role, set another role as primary
    if (roleToRemove?.is_primary) {
      const { data: remainingRoles } = await supabaseAdmin
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .order('assigned_at', { ascending: true })
        .limit(1);

      if (remainingRoles && remainingRoles.length > 0) {
        await supabaseAdmin
          .from('user_roles')
          .update({ is_primary: true })
          .eq('id', remainingRoles[0].id);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Role removed successfully'
    });
  } catch (error) {
    console.error('Error in DELETE /api/users/[id]/roles:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/users/[id]/roles
 * Update primary role for a user
 *
 * Body: { primary_role_id: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;
    const body = await request.json();
    const { primary_role_id } = body;

    if (!primary_role_id) {
      return NextResponse.json(
        { error: 'primary_role_id is required' },
        { status: 400 }
      );
    }

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

    // Check authentication
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has permission to manage users
    const { data: currentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !['super_admin', 'administrator'].includes(currentProfile?.role || '')
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions to manage user roles' },
        { status: 403 }
      );
    }

    // Verify the role is assigned to this user
    const { data: existingRole, error: checkError } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('role_id', primary_role_id)
      .single();

    if (checkError || !existingRole) {
      return NextResponse.json(
        { error: 'This role is not assigned to the user' },
        { status: 400 }
      );
    }

    // Unset all primary flags for this user
    await supabaseAdmin
      .from('user_roles')
      .update({ is_primary: false })
      .eq('user_id', userId);

    // Set the new primary role
    const { error: updateError } = await supabaseAdmin
      .from('user_roles')
      .update({ is_primary: true })
      .eq('user_id', userId)
      .eq('role_id', primary_role_id);

    if (updateError) {
      console.error('Error updating primary role:', updateError);
      return NextResponse.json(
        { error: 'Failed to update primary role' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Primary role updated successfully'
    });
  } catch (error) {
    console.error('Error in PATCH /api/users/[id]/roles:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

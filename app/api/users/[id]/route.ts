import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Database } from '@/types/auth';
import { createClient } from '@supabase/supabase-js';
import { UpdateUserRequest } from '@/types/users';
import { logActivity, ActivityTemplates } from '@/lib/utils/activity-logger';
import { RESOURCE_TYPES } from '@/types/activity';

// Create admin client for user management
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

    // Get current user for authorization
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get current user's profile to check permissions
    const { data: currentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return NextResponse.json(
        { error: 'Error fetching user profile' },
        { status: 500 }
      );
    }

    // Check permissions: users can view their own profile, or admins can view any profile
    const canView =
      user.id === userId || // User viewing their own profile
      ['super_admin', 'administrator'].includes(currentProfile.role); // Admin roles

    if (!canView) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view this user' },
        { status: 403 }
      );
    }

    // Get user by ID with institution data
    const { data: userData, error } = await supabase
      .from('profiles')
      .select(
        `
        *,
        institutions (
          id,
          name,
          category,
          institution_type,
          website,
          email,
          phone,
          city,
          state,
          country
        )
      `
      )
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user:', error);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If user has a department_id, fetch department data separately
    let departmentData = null;
    if (userData.department_id) {
      const { data: dept, error: deptError } = await supabase
        .from('departments')
        .select('id, department_name, department_code')
        .eq('id', userData.department_id)
        .single();

      if (deptError) {
        console.error('Department fetch error:', deptError);
      } else if (dept) {
        departmentData = dept;
      } else {
      }
    } else {
    }

    // Combine the data
    const data = {
      ...userData,
      departments: departmentData
    };

    return NextResponse.json(
      {
        success: true,
        data,
        message: 'User fetched successfully'
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in user fetch API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;
    const body: UpdateUserRequest = await request.json();

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

    // Get current user for authorization
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError) {
      console.error('PATCH Auth error:', userError);
      return NextResponse.json(
        { error: 'Authentication failed', details: userError.message },
        { status: 401 }
      );
    }

    if (!user) {
      console.error('PATCH No user found in session');
      return NextResponse.json(
        { error: 'No authenticated user' },
        { status: 401 }
      );
    }

    // Get current user's profile to check permissions
    const { data: currentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role, full_name, institution_id')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('PATCH Error fetching current user profile:', profileError);
      return NextResponse.json(
        { error: 'Error fetching user profile' },
        { status: 500 }
      );
    }

    // Check permissions: users can edit their own profile, or admins can edit any profile
    const canEdit =
      user.id === userId || // User editing their own profile
      ['super_admin', 'administrator'].includes(currentProfile.role); // Admin roles

    if (!canEdit) {
      return NextResponse.json(
        { error: 'Insufficient permissions to edit this user' },
        { status: 403 }
      );
    }

    // Get target user's original data for activity logging
    const { data: originalTargetUser } = await supabase
      .from('profiles')
      .select('role, full_name, email, phone_number, institution_id, is_active')
      .eq('id', userId)
      .single();

    // If editing someone else's profile, check additional restrictions
    if (user.id !== userId) {
      // Only super_admin can edit other super_admin profiles
      if (
        originalTargetUser?.role === 'super_admin' &&
        currentProfile.role !== 'super_admin'
      ) {
        return NextResponse.json(
          { error: 'Only super admins can edit other super admin profiles' },
          { status: 403 }
        );
      }
    }

    // Prepare update data, only include non-undefined fields
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (body.email !== undefined) updateData.email = body.email;
    if (body.full_name !== undefined) updateData.full_name = body.full_name;
    if (body.phone_number !== undefined) updateData.phone_number = body.phone_number;
    if (body.role !== undefined) updateData.role = body.role;
    if (body.institution_id !== undefined) updateData.institution_id = body.institution_id;
    if (body.department_id !== undefined) updateData.department_id = body.department_id;
    if (body.designation !== undefined) updateData.designation = body.designation;
    if (body.bio !== undefined) updateData.bio = body.bio;
    if (body.gender !== undefined) updateData.gender = body.gender;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.profile_complete !== undefined) updateData.profile_completed = body.profile_complete;

    // Update the user profile - use admin client for cross-user updates
    const updateClient = user.id === userId ? supabase : supabaseAdmin;
    const { data, error } = await updateClient
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating user:', error);
      return NextResponse.json(
        { error: 'Failed to update user' },
        { status: 500 }
      );
    }

    // Handle multi-role updates if role_ids is provided
    let updatedRoleIds: string[] | undefined;
    if (body.role_ids !== undefined && Array.isArray(body.role_ids)) {
      try {
        // Delete existing role assignments
        await supabaseAdmin
          .from('user_roles')
          .delete()
          .eq('user_id', userId);

        if (body.role_ids.length > 0) {
          const effectivePrimaryRoleId = body.primary_role_id || body.role_ids[0];

          const roleAssignments = body.role_ids.map((roleId: string) => ({
            user_id: userId,
            role_id: roleId,
            is_primary: roleId === effectivePrimaryRoleId,
            assigned_by: user.id
          }));

          const { error: roleAssignError } = await supabaseAdmin
            .from('user_roles')
            .insert(roleAssignments);

          if (roleAssignError) {
            console.error('Error updating user roles:', roleAssignError);
          } else {
            updatedRoleIds = body.role_ids;
          }
        }
      } catch (roleError) {
        console.error('Error updating user roles:', roleError);
        // Don't fail the whole request - log warning and continue
      }
    }

    // Log the user update activity
    const actorName = currentProfile?.full_name || 'Unknown';
    const targetName =
      originalTargetUser?.full_name || body.full_name || 'Unknown';

    // Track what fields changed
    const changes: string[] = [];
    if (originalTargetUser?.full_name !== body.full_name) changes.push('name');
    if (originalTargetUser?.email !== body.email) changes.push('email');
    if (originalTargetUser?.role !== body.role) changes.push('role');
    if (originalTargetUser?.phone_number !== body.phone_number)
      changes.push('phone');
    if (originalTargetUser?.institution_id !== body.institution_id)
      changes.push('institution');
    if (originalTargetUser?.is_active !== body.is_active)
      changes.push('account_status');
    if (updatedRoleIds !== undefined) changes.push('roles');

    if (changes.length > 0) {
      const template = ActivityTemplates.userUpdated(
        actorName,
        targetName,
        changes
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
          changes_made: changes,
          original_data: originalTargetUser,
          new_data: {
            full_name: body.full_name,
            email: body.email,
            role: body.role,
            phone_number: body.phone_number,
            institution_id: body.institution_id,
            is_active: body.is_active
          },
          is_self_edit: user.id === userId,
          editor_role: currentProfile?.role
        },
        institutionId: currentProfile?.institution_id,
        statusCode: 200
      });
    }

    return NextResponse.json(
      {
        success: true,
        data,
        message: 'User updated successfully'
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in user update API:', error);
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
  try {
    // Ensure params is properly handled
    const { id } = await params;

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

    // Check if user has permission to delete users (super_admin or administrator)
    const { data: currentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role, full_name, institution_id')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !['super_admin', 'administrator', 'hod'].includes(currentProfile.role)
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions to delete users' },
        { status: 403 }
      );
    }

    // Check if trying to delete a super admin (only super admins can delete other super admins)
    const { data: targetUser } = await supabase
      .from('profiles')
      .select('role, full_name, email, institution_id')
      .eq('id', id)
      .single();

    if (
      targetUser?.role === 'super_admin' &&
      currentProfile.role !== 'super_admin'
    ) {
      return NextResponse.json(
        { error: 'Only super admins can delete other super admins' },
        { status: 403 }
      );
    }

    // HOD role restrictions
    if (currentProfile.role === 'hod') {
      // HOD can only delete users from their own institution
      if (targetUser?.institution_id !== currentProfile.institution_id) {
        return NextResponse.json(
          { error: 'HOD users can only delete users from their own institution' },
          { status: 403 }
        );
      }

      // HOD can only delete faculty and staff roles
      if (!['faculty', 'staff'].includes(targetUser?.role || '')) {
        return NextResponse.json(
          { error: 'HOD users can only delete faculty or staff users' },
          { status: 403 }
        );
      }
    }

    // First, check if this profile email matches any staff records and delete them
    // Note: Staff records are linked to profiles through email matching, not foreign key
    let staffRecords: { id: string; institution_email: string }[] | null = null;

    // Get the profile email to find matching staff records
    const { data: profileData, error: profileFetchError } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', id)
      .single();

    if (!profileFetchError && profileData?.email) {

      const { data: staffData, error: staffQueryError } = await supabaseAdmin
        .from('staff')
        .select('id, institution_email')
        .eq('institution_email', profileData.email);

      staffRecords = staffData;

      if (staffQueryError) {
        console.error('Error checking for staff records:', staffQueryError);
      } else {
      }
    } else {
      if (profileFetchError) {
        console.error('Profile fetch error:', profileFetchError);
      }
    }

    if (staffRecords && staffRecords.length > 0) {

      // Delete staff records that reference this profile
      for (const staffRecord of staffRecords) {
        const { error: staffDeleteError } = await supabaseAdmin
          .from('staff')
          .delete()
          .eq('id', staffRecord.id);

        if (staffDeleteError) {
          console.error(`Error deleting staff record ${staffRecord.id}:`, staffDeleteError);
          return NextResponse.json(
            {
              error: 'Failed to delete associated staff records',
              details: staffDeleteError.message
            },
            { status: 500 }
          );
        } else {
        }
      }
    }

    // Now delete from auth.users table (this will cascade to profiles if properly configured)
    const { error: authDeleteError } =
      await supabaseAdmin.auth.admin.deleteUser(id);

    if (authDeleteError) {
      console.error('Error deleting auth user:', authDeleteError);
      // Check if the user doesn't exist in auth (might already be deleted)
      if (authDeleteError.message.includes('User not found')) {
      } else {
        return NextResponse.json(
          {
            error: 'Failed to delete user authentication data',
            details: authDeleteError.message
          },
          { status: 500 }
        );
      }
    }

    // Then delete from profiles table (in case auth deletion didn't cascade properly)
    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', id);

    if (profileDeleteError) {
      console.error('Error deleting profile:', profileDeleteError);
      // Only return error if it's not a "row not found" error
      if (!profileDeleteError.message.includes('No rows found') && 
          !profileDeleteError.message.includes('0 rows affected')) {
        return NextResponse.json(
          {
            error: 'Failed to delete user profile',
            details: profileDeleteError.message
          },
          { status: 500 }
        );
      }
    }

    // Log the user deletion activity
    const actorName = currentProfile?.full_name || 'Unknown';
    const targetName = targetUser?.full_name || 'Unknown';
    const template = ActivityTemplates.userDeleted(actorName, targetName);

    await logActivity({
      userId: user.id,
      actionType: template.actionType,
      resourceType: template.resourceType,
      resourceId: id,
      resourceName: targetName,
      description: template.description,
      request,
      metadata: {
        target_user_id: id,
        target_email: targetUser?.email,
        target_role: targetUser?.role,
        deleted_by_role: currentProfile?.role,
        staff_records_deleted: staffRecords?.length || 0,
        staff_record_ids: staffRecords?.map(s => s.id) || []
      },
      institutionId: currentProfile?.institution_id,
      statusCode: 200
    });

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

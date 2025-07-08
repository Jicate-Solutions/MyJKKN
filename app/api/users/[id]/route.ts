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
    const supabase = createServerClient<Database>(
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
    const { data, error } = await supabase
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
    const supabase = createServerClient<Database>(
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

    console.log('PATCH Authenticated user:', user.id, 'editing user:', userId);

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

    console.log('PATCH Current user role:', currentProfile.role);

    // Check permissions: users can edit their own profile, or admins can edit any profile
    const canEdit =
      user.id === userId || // User editing their own profile
      ['super_admin', 'administrator'].includes(currentProfile.role); // Admin roles

    console.log(
      'PATCH Can edit:',
      canEdit,
      'self-edit:',
      user.id === userId,
      'admin role:',
      ['super_admin', 'administrator'].includes(currentProfile.role)
    );

    if (!canEdit) {
      return NextResponse.json(
        { error: 'Insufficient permissions to edit this user' },
        { status: 403 }
      );
    }

    // Get target user's original data for activity logging
    const { data: originalTargetUser } = await supabase
      .from('profiles')
      .select('role, full_name, email, phone_number, institution_id')
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

    // Update the user profile
    const { data, error } = await supabase
      .from('profiles')
      .update({
        email: body.email,
        full_name: body.full_name,
        phone_number: body.phone_number,
        role: body.role,
        institution_id: body.institution_id,
        designation: body.designation,
        bio: body.bio,
        gender: body.gender,
        profile_completed: body.profile_complete,
        updated_at: new Date().toISOString()
      })
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
            institution_id: body.institution_id
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
    const supabase = createServerClient<Database>(
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
      !['super_admin', 'administrator'].includes(currentProfile.role)
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions to delete users' },
        { status: 403 }
      );
    }

    // Check if trying to delete a super admin (only super admins can delete other super admins)
    const { data: targetUser } = await supabase
      .from('profiles')
      .select('role, full_name, email')
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

    // First delete from profiles table (otherwise foreign key constraints might fail)
    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', id);

    if (profileDeleteError) {
      console.error('Error deleting profile:', profileDeleteError);
      return NextResponse.json(
        {
          error: 'Failed to delete user profile',
          details: profileDeleteError.message
        },
        { status: 500 }
      );
    }

    // Then delete from auth.users table
    const { error: authDeleteError } =
      await supabaseAdmin.auth.admin.deleteUser(id);

    if (authDeleteError) {
      console.error('Error deleting auth user:', authDeleteError);
      return NextResponse.json(
        {
          error: 'Failed to delete user authentication data',
          details: authDeleteError.message
        },
        { status: 500 }
      );
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
        deleted_by_role: currentProfile?.role
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

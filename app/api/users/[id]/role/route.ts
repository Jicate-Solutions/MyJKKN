// app/api/users/[id]/role/route.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Database, SYSTEM_ROLES } from '@/types/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();
    if (!session || sessionError) {
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
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (currentUserError || currentUser.role !== SYSTEM_ROLES.SUPER_ADMIN) {
      return NextResponse.json(
        {
          success: false,
          error: 'Only super admins can update roles'
        },
        { status: 403 }
      );
    }

    // Verify the role exists in custom_roles table
    const { data: validRole, error: validRoleError } = await supabase
      .from('custom_roles')
      .select('role_key')
      .eq('role_key', role)
      .single();

    if (validRoleError || !validRole) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid role'
        },
        { status: 400 }
      );
    }

    // Check target user
    const { data: targetUser, error: targetUserError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', params.id)
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

    // Update the user's role
    const { data: updatedUser, error: updateError } = await supabase
      .from('profiles')
      .update({
        role,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to update role'
        },
        { status: 500 }
      );
    }

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

// app/api/users/[id]/role/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

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

    if (currentUserError || currentUser.role !== 'super_admin') {
      return NextResponse.json(
        {
          success: false,
          error: 'Only super admins can update roles'
        },
        { status: 403 }
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

    // Prevent modifying super admin roles
    if (targetUser.role === 'super_admin' && role !== 'super_admin') {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot modify another super admin's role"
        },
        { status: 403 }
      );
    }

    // Update role
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
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      user: updatedUser
    });
  } catch (error) {
    console.error('Role update error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error'
      },
      { status: 500 }
    );
  }
}

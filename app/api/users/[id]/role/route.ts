// app/api/users/[id]/role/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({
    cookies: async () => await cookies()
  });

  try {
    // Log the received data
    console.log('Received role update request for user:', params.id);

    const { role } = await request.json();
    console.log('New role:', role);

    if (!role) {
      return NextResponse.json({ error: 'Role is required' }, { status: 400 });
    }

    // 1. Check authentication
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Session error:', sessionError);
      return NextResponse.json(
        { error: 'Authentication error' },
        { status: 401 }
      );
    }

    if (!session) {
      return NextResponse.json({ error: 'No active session' }, { status: 401 });
    }

    // 2. Verify current user's role
    const { data: currentUser, error: currentUserError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (currentUserError) {
      console.error('Current user query error:', currentUserError);
      return NextResponse.json(
        { error: 'Error fetching current user' },
        { status: 500 }
      );
    }

    if (currentUser.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only super admins can update roles' },
        { status: 403 }
      );
    }

    // 3. Verify target user exists
    const { data: targetUser, error: targetUserError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', params.id)
      .single();

    if (targetUserError) {
      console.error('Target user query error:', targetUserError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 4. Prevent modifying other super admins
    if (targetUser.role === 'super_admin' && role !== 'super_admin') {
      return NextResponse.json(
        { error: "Cannot modify another super admin's role" },
        { status: 403 }
      );
    }

    // 5. Update the role
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
      console.error('Role update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update role' },
        { status: 500 }
      );
    }

    // Log successful update
    console.log('Successfully updated role for user:', params.id);

    return NextResponse.json({
      success: true,
      user: updatedUser
    });
  } catch (error) {
    console.error('Role update error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error },
      { status: 500 }
    );
  }
}

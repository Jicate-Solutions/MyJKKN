import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

async function checkAdminAccess(supabase: any) {
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return false;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  return ['super_admin', 'administrator'].includes(profile?.role || '');
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check admin access
    const isAdmin = await checkAdminAccess(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: user, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error in GET /api/users/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check admin access
    const isAdmin = await checkAdminAccess(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // If trying to change role to super_admin, require super_admin access
    if (body.role === 'super_admin') {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session?.user.id)
        .single();

      if (adminProfile?.role !== 'super_admin') {
        return NextResponse.json(
          { error: 'Only super admins can assign super admin role' },
          { status: 403 }
        );
      }
    }

    const { data: user, error } = await supabase
      .from('profiles')
      .update({
        ...body,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error in PATCH /api/users/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check admin access
    const isAdmin = await checkAdminAccess(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user exists and get their role
    const { data: userToDelete } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', params.id)
      .single();

    if (userToDelete?.role === 'super_admin') {
      // Check if requester is super_admin
      const {
        data: { session }
      } = await supabase.auth.getSession();

      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session?.user.id)
        .single();

      if (adminProfile?.role !== 'super_admin') {
        return NextResponse.json(
          { error: 'Only super admins can delete super admin users' },
          { status: 403 }
        );
      }
    }

    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', params.id);

    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error in DELETE /api/users/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

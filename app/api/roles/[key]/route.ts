import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { SYSTEM_ROLES } from '@/types/auth';
import { Database } from '@/types/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key: roleKey } = await params;

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
    // Check authentication and authorization
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is super_admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    if (profileError || profile.role !== SYSTEM_ROLES.SUPER_ADMIN) {
      return NextResponse.json(
        { error: 'Only super admins can manage roles' },
        { status: 403 }
      );
    }

    // Get the specific role
    const { data: role, error: roleError } = await supabase
      .from('custom_roles')
      .select('*')
      .eq('role_key', roleKey)
      .single();

    if (roleError) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    return NextResponse.json(role);
  } catch (error) {
    console.error(`Error fetching role ${roleKey}:`, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key: roleKey } = await params;

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
    // Check authentication and authorization
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is super_admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    if (profileError || profile.role !== SYSTEM_ROLES.SUPER_ADMIN) {
      return NextResponse.json(
        { error: 'Only super admins can manage roles' },
        { status: 403 }
      );
    }

    // Check if role exists and is not a system role
    const { data: existingRole, error: roleError } = await supabase
      .from('custom_roles')
      .select('is_system_role')
      .eq('role_key', roleKey)
      .single();

    if (roleError) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // Parse request body
    const updates = await request.json();
    const { role_name, description, permissions } = updates;

    // Validate update data
    if (!role_name && !description && !permissions) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Prevent modifying role_key for system roles
    if (existingRole.is_system_role && updates.role_key) {
      return NextResponse.json(
        { error: 'Cannot change key for system roles' },
        { status: 403 }
      );
    }

    // Update the role
    const { data: updatedRole, error: updateError } = await supabase
      .from('custom_roles')
      .update({
        role_name: role_name,
        description: description,
        permissions: permissions
      })
      .eq('role_key', roleKey)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update role' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedRole);
  } catch (error) {
    console.error(`Error updating role ${roleKey}:`, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key: roleKey } = await params;

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
    // Check authentication and authorization
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is super_admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    if (profileError || profile.role !== SYSTEM_ROLES.SUPER_ADMIN) {
      return NextResponse.json(
        { error: 'Only super admins can manage roles' },
        { status: 403 }
      );
    }

    // Check if role exists and is not a system role
    const { data: existingRole, error: roleError } = await supabase
      .from('custom_roles')
      .select('is_system_role')
      .eq('role_key', roleKey)
      .single();

    if (roleError) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // Prevent deleting system roles
    if (existingRole.is_system_role) {
      return NextResponse.json(
        { error: 'Cannot delete system roles' },
        { status: 403 }
      );
    }

    // Check if any users have this role
    const { count, error: countError } = await supabase
      .from('profiles')
      .select('id', { count: 'exact' })
      .eq('role', roleKey);

    if (countError) {
      return NextResponse.json(
        { error: 'Failed to check if role is in use' },
        { status: 500 }
      );
    }

    if (count && count > 0) {
      return NextResponse.json(
        { error: `Cannot delete role that is assigned to ${count} users` },
        { status: 409 }
      );
    }

    // Delete the role
    const { error: deleteError } = await supabase
      .from('custom_roles')
      .delete()
      .eq('role_key', roleKey);

    if (deleteError) {
      return NextResponse.json(
        { error: 'Failed to delete role' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Error deleting role ${roleKey}:`, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

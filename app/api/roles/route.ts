import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { SYSTEM_ROLES } from '@/types/auth';

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  try {
    // Check authentication and authorization
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is super_admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', data.user.id)
      .single() as { data: { role: string; is_super_admin?: boolean } | null; error: any };

    const isSuperAdminUser =
      profile?.role === SYSTEM_ROLES.SUPER_ADMIN || profile?.is_super_admin === true;

    if (profileError || !profile || !isSuperAdminUser) {
      return NextResponse.json(
        { error: 'Only super admins can manage roles' },
        { status: 403 }
      );
    }

    // Get all roles
    const { data: roles, error: rolesError } = await supabase
      .from('custom_roles')
      .select('*')
      .order('role_name');

    if (rolesError) {
      return NextResponse.json(
        { error: 'Failed to fetch roles' },
        { status: 500 }
      );
    }

    return NextResponse.json(roles);
  } catch (error) {
    console.error('Error handling roles request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  try {
    // Check authentication and authorization
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is super_admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', data.user.id)
      .single() as { data: { role: string; is_super_admin?: boolean } | null; error: any };

    const isSuperAdminUser =
      profile?.role === SYSTEM_ROLES.SUPER_ADMIN || profile?.is_super_admin === true;

    if (profileError || !profile || !isSuperAdminUser) {
      return NextResponse.json(
        { error: 'Only super admins can manage roles' },
        { status: 403 }
      );
    }

    // Parse request body
    const { role_key, role_name, description, permissions } =
      await request.json();

    // Validate required fields
    if (!role_key || !role_name) {
      return NextResponse.json(
        { error: 'Role key and name are required' },
        { status: 400 }
      );
    }

    // Check if role_key already exists
    const { data: existingRole, error: existingRoleError } = await supabase
      .from('custom_roles')
      .select('id')
      .eq('role_key', role_key)
      .maybeSingle();

    if (existingRoleError) {
      return NextResponse.json(
        { error: 'Failed to check for existing role' },
        { status: 500 }
      );
    }

    if (existingRole) {
      return NextResponse.json(
        { error: 'A role with this key already exists' },
        { status: 409 }
      );
    }

    // Create the new role
    const { data: newRole, error: createError } = await supabase
      .from('custom_roles')
      .insert([
        {
          role_key,
          role_name,
          description,
          permissions: permissions || {},
          is_system_role: false,
          created_by: data.user.id
        }
      ] as any)
      .select()
      .single();

    if (createError) {
      return NextResponse.json(
        { error: 'Failed to create role' },
        { status: 500 }
      );
    }

    return NextResponse.json(newRole, { status: 201 });
  } catch (error) {
    console.error('Error creating role:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse , connection } from 'next/server';
import { SYSTEM_ROLES } from '@/types/auth';

export async function GET(request: NextRequest) {
  await connection();
  const supabase = createClientSupabaseClient();

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
      .single() as { data: { role: string } | null; error: any };

    if (profileError || !profile || profile.role !== SYSTEM_ROLES.SUPER_ADMIN) {
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
  await connection();
  const supabase = createClientSupabaseClient();

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
      .single() as { data: { role: string } | null; error: any };

    if (profileError || !profile || profile.role !== SYSTEM_ROLES.SUPER_ADMIN) {
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

    // Create the new role.
    //
    // `instasolver.view` is seeded TRUE by default, and it is the only key that
    // is. Decision I1 (specs/instasolver-2026-09-14.md) is "everyone with a
    // login can file", and migration 20261212120000 delivers that for the roles
    // that exist on apply-day — but a one-off UPDATE cannot reach a role created
    // tomorrow. Without this line, every role minted after apply-day would be
    // the one role in the platform with no front door for a leaking tap, and
    // nothing would report it: the key's absence looks identical to a role that
    // was never meant to have it.
    //
    // Spread LAST so the caller still wins: a Role Management payload that sends
    // `{'instasolver.view': false}` turns it off. This is a default, not a floor.
    // The key unlocks the chooser at /instasolver and nothing else — every lane
    // behind it re-checks its own key server-side — so defaulting it open widens
    // no data surface.
    const { data: newRole, error: createError } = await supabase
      .from('custom_roles')
      .insert([
        {
          role_key,
          role_name,
          description,
          permissions: { 'instasolver.view': true, ...(permissions || {}) },
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

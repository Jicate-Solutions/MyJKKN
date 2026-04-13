export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse , connection } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  await connection();
  try {
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

    // Authenticate caller
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify caller is super_admin or administrator
    const { data: callerProfile, error: callerProfileError } = await supabase
      .from('profiles')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (
      callerProfileError ||
      !['super_admin', 'administrator'].includes(callerProfile?.role || '')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Validate userId param
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required parameter: userId' },
        { status: 400 }
      );
    }

    // Fetch target user profile
    const { data: targetProfile, error: targetProfileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, is_super_admin, is_active, last_login, avatar_url, institution_id')
      .eq('id', userId)
      .single();

    if (targetProfileError || !targetProfile) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // If caller is administrator (not super_admin), verify target is in same institution
    if (
      callerProfile.role === 'administrator' &&
      targetProfile.institution_id !== callerProfile.institution_id
    ) {
      return NextResponse.json(
        { error: 'Forbidden: user belongs to a different institution' },
        { status: 403 }
      );
    }

    // Fetch user_roles with joined custom_roles
    const { data: userRoles, error: userRolesError } = await supabase
      .from('user_roles')
      .select('id, role_id, is_primary, assigned_at, assigned_by, custom_roles!inner(role_key, role_name, permissions)')
      .eq('user_id', userId)
      .order('is_primary', { ascending: false });

    // Handle case where user_roles query fails (e.g. table doesn't exist yet)
    // or returns null — treat as orphan
    const validRoles = (userRoles || []).filter(
      (r: any) => r.custom_roles !== null
    );

    const isOrphan = validRoles.length === 0;

    // Build assignedRoles array
    const assignedRoles = validRoles.map((r: any) => ({
      roleKey: r.custom_roles.role_key,
      roleName: r.custom_roles.role_name,
      isPrimary: r.is_primary || false,
      assignedAt: r.assigned_at,
      assignedBy: r.assigned_by
    }));

    // Determine primary role
    const primaryEntry = validRoles.find((r: any) => r.is_primary === true);
    const primaryRole = primaryEntry
      ? (primaryEntry as any).custom_roles.role_key
      : null;

    // Check mismatch between primary role and legacy profile.role
    const isMismatch = primaryRole !== null && primaryRole !== targetProfile.role;

    // Determine super admin status
    const isSuperAdmin =
      targetProfile.is_super_admin === true ||
      targetProfile.role === 'super_admin';

    // Merge permissions with union/OR logic
    const mergedPermissions: Record<string, boolean> = {};
    const permissionSources: Record<string, string[]> = {};

    if (!isOrphan) {
      // Merge from all assigned roles
      for (const role of validRoles) {
        const permissions = (role as any).custom_roles.permissions;
        if (permissions && typeof permissions === 'object') {
          for (const [key, value] of Object.entries(permissions)) {
            if (value === true) {
              mergedPermissions[key] = true;
              if (!permissionSources[key]) {
                permissionSources[key] = [];
              }
              permissionSources[key].push((role as any).custom_roles.role_key);
            } else if (!(key in mergedPermissions)) {
              // Only set false if not already true from another role
              mergedPermissions[key] = false;
            }
          }
        }
      }
    } else {
      // Orphan fallback: look up custom_roles by profile.role
      const { data: fallbackRole } = await supabase
        .from('custom_roles')
        .select('role_key, permissions')
        .eq('role_key', targetProfile.role)
        .single();

      if (fallbackRole?.permissions && typeof fallbackRole.permissions === 'object') {
        for (const [key, value] of Object.entries(fallbackRole.permissions)) {
          if (value === true) {
            mergedPermissions[key] = true;
            permissionSources[key] = [`${fallbackRole.role_key} (legacy)`];
          } else {
            mergedPermissions[key] = false;
          }
        }
      }
    }

    // Fetch institution access
    const { data: institutionAccess } = await supabase
      .from('user_institution_access')
      .select('id, institution_id, access_type, is_active, granted_by, granted_at, institutions!inner(name)')
      .eq('user_id', userId);

    const institutionAccessFormatted = (institutionAccess || []).map((ia: any) => ({
      institutionId: ia.institution_id,
      institutionName: ia.institutions?.name || 'Unknown',
      accessType: ia.access_type,
      isActive: ia.is_active,
      grantedAt: ia.granted_at
    }));

    // Build response
    const response = {
      user: {
        id: targetProfile.id,
        email: targetProfile.email,
        fullName: targetProfile.full_name,
        avatarUrl: targetProfile.avatar_url,
        role: targetProfile.role,
        isSuperAdmin,
        isActive: targetProfile.is_active,
        lastLogin: targetProfile.last_login,
        institutionId: targetProfile.institution_id
      },
      isOrphan,
      legacyRole: targetProfile.role,
      assignedRoles,
      primaryRole,
      isMismatch,
      isSuperAdmin,
      mergedPermissions,
      permissionSources,
      institutionAccess: institutionAccessFormatted
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in GET /api/users/permissions-audit/resolve:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

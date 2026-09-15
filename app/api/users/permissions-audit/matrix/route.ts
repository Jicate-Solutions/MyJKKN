export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { PERMISSION_CATEGORIES } from '@/lib/constants/permissions';
import {
  collectPermissionKeys,
  getPermissionValue,
  getRoleUserCounts
} from '@/lib/permissions-audit/role-user-counts';

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

    // Auth check
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Super admin only
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 1. Fetch all custom roles
    const { data: customRoles, error: rolesError } = await supabase
      .from('custom_roles')
      .select('id, role_key, role_name, permissions, is_system_role')
      .order('role_name');

    if (rolesError) {
      console.error('[permissions-audit/matrix] Error fetching roles:', rolesError);
      return NextResponse.json({ error: 'Failed to fetch roles' }, { status: 500 });
    }

    if (!customRoles || customRoles.length === 0) {
      return NextResponse.json({ roles: [], roleMeta: {}, matrix: {} });
    }

    // 2. Count users per role. The union of user_roles and legacy
    // profiles.role lives in lib/permissions-audit/role-user-counts.ts so this
    // endpoint and /page-access cannot report different counts for one role —
    // they are rendered side by side in the same tab.
    const roleUserCounts = await getRoleUserCounts(
      supabase,
      new Set(customRoles.map((r) => r.role_key))
    );

    // 3. Collect all unique permission keys and build role list + meta.
    // Seed with the canonical permission catalog so modules declared in
    // PERMISSION_CATEGORIES (e.g. ims.*) appear in the matrix even before
    // any role has set those keys in JSONB. Then merge in any extra keys
    // observed in custom_roles.permissions to preserve legacy/orphan keys.
    const roles: string[] = [];
    const roleMeta: Record<string, {
      name: string;
      userCount: number;
      isSystem: boolean;
    }> = {};
    const allPermissionKeys = new Set<string>(
      PERMISSION_CATEGORIES.flatMap((cat) => cat.permissions.map((p) => p.key))
    );

    for (const role of customRoles) {
      roles.push(role.role_key);
      roleMeta[role.role_key] = {
        name: role.role_name,
        userCount: roleUserCounts[role.role_key] || 0,
        isSystem: role.is_system_role ?? false
      };

      // Collect permission keys from this role's permissions object
      const perms = role.permissions as Record<string, any> | null;
      if (perms && typeof perms === 'object') {
        collectPermissionKeys(perms, '', allPermissionKeys);
      }
    }

    // 4. Build matrix: for each permission key, for each role, is it true?
    const matrix: Record<string, Record<string, boolean>> = {};

    for (const permKey of allPermissionKeys) {
      matrix[permKey] = {};
      for (const role of customRoles) {
        const perms = role.permissions as Record<string, any> | null;
        matrix[permKey][role.role_key] = perms ? getPermissionValue(perms, permKey) : false;
      }
    }

    return NextResponse.json({ roles, roleMeta, matrix });
  } catch (error) {
    console.error('Error in GET /api/users/permissions-audit/matrix:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

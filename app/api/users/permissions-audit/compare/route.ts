export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
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

    // Parse query params
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const left = url.searchParams.get('left');
    const right = url.searchParams.get('right');

    // Validate params
    if (type !== 'roles') {
      return NextResponse.json(
        { error: 'For user comparison, call /resolve for each user separately' },
        { status: 400 }
      );
    }

    if (!left || !right) {
      return NextResponse.json(
        { error: 'Both left and right role_key params are required' },
        { status: 400 }
      );
    }

    // Fetch both roles
    const { data: roles, error: rolesError } = await supabase
      .from('custom_roles')
      .select('role_key, role_name, permissions')
      .in('role_key', [left, right]);

    if (rolesError) {
      console.error('[permissions-audit/compare] Error fetching roles:', rolesError);
      return NextResponse.json({ error: 'Failed to fetch roles' }, { status: 500 });
    }

    const leftRole = roles?.find(r => r.role_key === left);
    const rightRole = roles?.find(r => r.role_key === right);

    if (!leftRole) {
      return NextResponse.json(
        { error: `Role not found: ${left}` },
        { status: 404 }
      );
    }

    if (!rightRole) {
      return NextResponse.json(
        { error: `Role not found: ${right}` },
        { status: 404 }
      );
    }

    // Collect all permission keys from both roles
    const allKeys = new Set<string>();
    const leftPerms = leftRole.permissions as Record<string, any> | null;
    const rightPerms = rightRole.permissions as Record<string, any> | null;

    if (leftPerms && typeof leftPerms === 'object') {
      collectPermissionKeys(leftPerms, '', allKeys);
    }
    if (rightPerms && typeof rightPerms === 'object') {
      collectPermissionKeys(rightPerms, '', allKeys);
    }

    // Build comparison
    const comparison: Record<string, {
      left: boolean;
      right: boolean;
      status: 'both' | 'left_only' | 'right_only' | 'neither';
    }> = {};

    for (const key of allKeys) {
      const leftHas = leftPerms ? getPermissionValue(leftPerms, key) : false;
      const rightHas = rightPerms ? getPermissionValue(rightPerms, key) : false;

      let status: 'both' | 'left_only' | 'right_only' | 'neither';
      if (leftHas && rightHas) {
        status = 'both';
      } else if (leftHas) {
        status = 'left_only';
      } else if (rightHas) {
        status = 'right_only';
      } else {
        status = 'neither';
      }

      comparison[key] = { left: leftHas, right: rightHas, status };
    }

    return NextResponse.json({
      type: 'roles',
      left: { roleKey: leftRole.role_key, roleName: leftRole.role_name },
      right: { roleKey: rightRole.role_key, roleName: rightRole.role_name },
      comparison
    });
  } catch (error) {
    console.error('Error in GET /api/users/permissions-audit/compare:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Recursively collect all permission keys from a nested permissions object.
 */
function collectPermissionKeys(
  obj: Record<string, any>,
  prefix: string,
  keys: Set<string>
): void {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'boolean') {
      keys.add(fullKey);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      collectPermissionKeys(value, fullKey, keys);
    }
  }
}

/**
 * Get a permission value from a nested object using dot-notation key.
 */
function getPermissionValue(obj: Record<string, any>, dotKey: string): boolean {
  const parts = dotKey.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return false;
    }
    current = current[part];
  }
  return current === true;
}

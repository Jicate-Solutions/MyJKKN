export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { PERMISSION_CATEGORIES } from '@/lib/constants/permissions';

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

    // Get query params
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'full_matrix';
    const format = searchParams.get('format') || 'excel';

    // Fetch all custom roles
    const { data: customRoles, error: rolesError } = await supabase
      .from('custom_roles')
      .select('id, role_key, role_name, permissions, is_system_role')
      .order('role_name');

    if (rolesError) {
      console.error('[permissions-audit/export] Error fetching roles:', rolesError);
      return NextResponse.json({ error: 'Failed to fetch roles' }, { status: 500 });
    }

    // Fetch RLS policies via service_role RPC
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: rlsPolicies, error: rlsError } = await serviceClient.rpc('get_rls_policies');

    if (rlsError) {
      console.error('[permissions-audit/export] Error fetching RLS policies:', rlsError);
      return NextResponse.json(
        { error: 'Failed to fetch RLS policies. Ensure the get_rls_policies() database function exists.' },
        { status: 500 }
      );
    }

    const roles = customRoles ?? [];
    const policies = (rlsPolicies ?? []) as Array<{
      tablename: string;
      policyname: string;
      cmd: string;
      qual: string | null;
      with_check: string | null;
    }>;

    // Collect all unique permission keys across all roles, sorted.
    // Seed with the canonical permission catalog so modules declared in
    // PERMISSION_CATEGORIES (e.g. ims.*) appear in exports even before
    // any role has set those keys in JSONB. Then merge in any extra keys
    // observed in custom_roles.permissions to preserve legacy/orphan keys.
    const allPermissionKeys = new Set<string>(
      PERMISSION_CATEGORIES.flatMap((cat) => cat.permissions.map((p) => p.key))
    );
    for (const role of roles) {
      const perms = role.permissions as Record<string, any> | null;
      if (perms && typeof perms === 'object') {
        collectPermissionKeys(perms, '', allPermissionKeys);
      }
    }
    const sortedPermKeys = Array.from(allPermissionKeys).sort();

    // If format=json, return raw JSON
    if (format === 'json') {
      const jsonData = {
        exportDate: new Date().toISOString(),
        type,
        roles: roles.map((r) => ({
          roleKey: r.role_key,
          roleName: r.role_name,
          isSystemRole: r.is_system_role ?? false,
          permissions: r.permissions
        })),
        permissionKeys: sortedPermKeys,
        policies: policies.map((p) => ({
          table: p.tablename,
          policyName: p.policyname,
          operation: p.cmd,
          usingExpression: p.qual,
          withCheck: p.with_check
        }))
      };

      const jsonBlob = JSON.stringify(jsonData, null, 2);
      const today = new Date().toISOString().split('T')[0];

      return new NextResponse(jsonBlob, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="permissions-audit-${today}.json"`
        }
      });
    }

    // format=excel: generate 3-sheet workbook
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Permission Matrix ─────────────────────────────────────────
    const roleNames = roles.map((r) => r.role_name);
    const matrixHeader = ['Permission', ...roleNames];
    const matrixRows: (string | number)[][] = [matrixHeader];

    for (const permKey of sortedPermKeys) {
      const row: (string | number)[] = [permKey];
      for (const role of roles) {
        const perms = role.permissions as Record<string, any> | null;
        const hasPermission = perms ? getPermissionValue(perms, permKey) : false;
        row.push(hasPermission ? 'YES' : 'NO');
      }
      matrixRows.push(row);
    }

    const matrixSheet = XLSX.utils.aoa_to_sheet(matrixRows);
    XLSX.utils.book_append_sheet(wb, matrixSheet, 'Permission Matrix');

    // ── Sheet 2: RLS Policies ──────────────────────────────────────────────
    const policyHeader = ['Table', 'Policy Name', 'Operation', 'USING Expression', 'WITH CHECK'];
    const policyRows: (string | null)[][] = [policyHeader];

    for (const p of policies) {
      policyRows.push([
        p.tablename,
        p.policyname,
        p.cmd,
        p.qual,
        p.with_check
      ]);
    }

    const policySheet = XLSX.utils.aoa_to_sheet(policyRows);
    XLSX.utils.book_append_sheet(wb, policySheet, 'RLS Policies');

    // ── Sheet 3: Roles Summary ─────────────────────────────────────────────
    const summaryHeader = ['Role Key', 'Role Name', 'System Role', 'Permissions Granted', 'Total Permissions'];
    const summaryRows: (string | number)[][] = [summaryHeader];
    const totalPermissions = sortedPermKeys.length;

    for (const role of roles) {
      const perms = role.permissions as Record<string, any> | null;
      let grantedCount = 0;
      if (perms) {
        for (const permKey of sortedPermKeys) {
          if (getPermissionValue(perms, permKey)) {
            grantedCount++;
          }
        }
      }

      summaryRows.push([
        role.role_key,
        role.role_name,
        (role.is_system_role ?? false) ? 'Yes' : 'No',
        grantedCount,
        totalPermissions
      ]);
    }

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Roles Summary');

    // Write workbook to buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const today = new Date().toISOString().split('T')[0];

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="permissions-audit-${today}.xlsx"`
      }
    });
  } catch (error) {
    console.error('Error in GET /api/users/permissions-audit/export:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Recursively collect all permission keys from a nested permissions object.
 * Keys are flattened with dot notation: e.g. { users: { view: true } } -> "users.view"
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

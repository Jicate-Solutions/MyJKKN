export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';

import { parseRlsExpression, wouldPolicyGrantAccess } from '@/lib/utils/rls-expression-parser';
import { getModuleForTable, getAllModuleNames } from '@/lib/constants/table-module-map';
import { PERMISSION_CATEGORIES } from '@/lib/constants/permissions';
import { MENU_PERMISSIONS } from '@/lib/sidebarMenuLink';
import type {
  UnifiedAccessResponse,
  ModuleAccess,
  CrudAccess,
  TableAccess,
  RouteAccess,
  ConflictItem,
  RlsPolicy
} from '@/types/permissions-audit';

// ── Module display name -> PERMISSION_CATEGORIES key mapping ──

const MODULE_TO_CATEGORY_KEY: Record<string, string> = {
  Users: 'users',
  Organization: 'organizations',
  Learners: 'learners',
  Academic: 'academic',
  Staff: 'staff',
  Billing: 'billing',
  Resources: 'resources',
  'Service Requests': 'service_requests',
  Admission: 'admission',
  Notifications: 'notifications',
  System: 'system',
  'Bug Reports': 'system',
  Events: 'events',
  VAC: 'vac',
  Privileges: 'academic',
  'Lifecycle Analytics': 'admin',
};

// ── Route prefix -> module mapping ──

const ROUTE_PREFIX_TO_MODULE: [string, string][] = [
  ['/admin/bug-reports', 'Bug Reports'],
  ['/admin/notifications', 'Notifications'],
  ['/admin/lifecycle', 'Lifecycle Analytics'],
  ['/admin/lti', 'System'],
  ['/users', 'Users'],
  ['/organizations', 'Organization'],
  ['/learners', 'Learners'],
  ['/academic', 'Academic'],
  ['/staff', 'Staff'],
  ['/billing', 'Billing'],
  ['/resource-management', 'Resources'],
  ['/service-requests', 'Service Requests'],
  ['/admission', 'Admission'],
  ['/system', 'System'],
  ['/work-pulse', 'System'],
  ['/vac', 'VAC'],
  ['/events', 'Events'],
  ['/documents', 'Documents'],
  ['/profile', 'Users'],
];

const ALL_OPERATIONS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

function getModuleForRoute(route: string): string | null {
  for (const [prefix, mod] of ROUTE_PREFIX_TO_MODULE) {
    if (route.startsWith(prefix)) {
      return mod;
    }
  }
  return null;
}

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

    // Super admin check
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      (profile?.is_super_admin !== true && profile?.role !== 'super_admin')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Validate query params ──
    const { searchParams } = new URL(request.url);
    const roleKey = searchParams.get('roleKey');

    if (!roleKey) {
      return NextResponse.json(
        { error: 'Missing required query parameter: roleKey' },
        { status: 400 }
      );
    }

    // ── Service role client for system catalog access ──
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ── Fetch all data in parallel ──
    const [customRoleResult, policiesResult, userCountResult] = await Promise.all([
      supabase
        .from('custom_roles')
        .select('id, role_key, role_name, permissions, is_system_role')
        .eq('role_key', roleKey)
        .single(),
      serviceClient.rpc('get_rls_policies'),
      supabase
        .from('user_roles')
        .select('id, custom_roles!inner(role_key)')
        .eq('custom_roles.role_key', roleKey)
    ]);

    // Validate custom role
    if (customRoleResult.error || !customRoleResult.data) {
      return NextResponse.json(
        { error: `Role not found: ${roleKey}` },
        { status: 404 }
      );
    }

    const customRole = customRoleResult.data;
    const rolePermissions: Record<string, boolean> = (customRole.permissions as Record<string, boolean>) || {};
    const userCount = userCountResult.data?.length ?? 0;

    // Parse RLS policies
    const rawPolicies = policiesResult.data ?? [];
    interface RawPolicy {
      table_name: string;
      policy_name: string;
      command: string;
      using_expression: string | null;
      with_check_expression: string | null;
      permissive: string;
    }

    const parsedPolicies: (RlsPolicy & { permissive: boolean })[] = (rawPolicies as RawPolicy[]).map(
      (p: RawPolicy) => ({
        tableName: p.table_name,
        policyName: p.policy_name,
        command: p.command,
        usingExpression: p.using_expression,
        withCheckExpression: p.with_check_expression,
        parsed: parseRlsExpression(p.using_expression ?? p.with_check_expression),
        module: getModuleForTable(p.table_name),
        permissive: p.permissive !== 'RESTRICTIVE',
      })
    );

    // ── Group policies by module ──
    const policiesByModule: Record<string, (RlsPolicy & { permissive: boolean })[]> = {};
    for (const policy of parsedPolicies) {
      if (!policiesByModule[policy.module]) {
        policiesByModule[policy.module] = [];
      }
      policiesByModule[policy.module].push(policy);
    }

    // ── Group routes by module ──
    const routesByModule: Record<string, { route: string; permission: string }[]> = {};
    for (const [route, permission] of Object.entries(MENU_PERMISSIONS)) {
      const mod = getModuleForRoute(route);
      if (mod) {
        if (!routesByModule[mod]) {
          routesByModule[mod] = [];
        }
        routesByModule[mod].push({ route, permission });
      }
    }

    // ── Build module access data ──
    const allModules = getAllModuleNames();
    const modules: ModuleAccess[] = [];

    for (const moduleName of allModules) {
      // ── A. Code Permissions ──
      const categoryKey = MODULE_TO_CATEGORY_KEY[moduleName];
      const matchingCategories = categoryKey
        ? PERMISSION_CATEGORIES.filter((cat) => cat.key === categoryKey)
        : [];

      const codePermissionDetails: { key: string; granted: boolean }[] = [];
      let hasCreate = false;
      let hasRead = false;
      let hasUpdate = false;
      let hasDelete = false;

      for (const category of matchingCategories) {
        for (const perm of category.permissions) {
          const granted = rolePermissions[perm.key] === true;
          codePermissionDetails.push({ key: perm.key, granted });

          if (granted) {
            const keyLower = perm.key.toLowerCase();
            if (keyLower.includes('.create') || keyLower.includes('.bulk_create')) hasCreate = true;
            if (keyLower.includes('.view') || keyLower.includes('.dashboard')) hasRead = true;
            if (keyLower.includes('.edit') || keyLower.includes('.update') || keyLower.includes('.bulk_edit')) hasUpdate = true;
            if (keyLower.includes('.delete')) hasDelete = true;
          }
        }
      }

      const codePermissions: CrudAccess = {
        create: codePermissionDetails.length > 0 ? hasCreate : null,
        read: codePermissionDetails.length > 0 ? hasRead : null,
        update: codePermissionDetails.length > 0 ? hasUpdate : null,
        delete: codePermissionDetails.length > 0 ? hasDelete : null,
      };

      // ── B. Table Access (RLS) ──
      const modulePolicies = policiesByModule[moduleName] ?? [];

      // Group policies by table
      const policiesByTable: Record<string, (RlsPolicy & { permissive: boolean })[]> = {};
      for (const policy of modulePolicies) {
        if (!policiesByTable[policy.tableName]) {
          policiesByTable[policy.tableName] = [];
        }
        policiesByTable[policy.tableName].push(policy);
      }

      const tableAccess: TableAccess[] = [];
      for (const [tableName, tablePolicies] of Object.entries(policiesByTable)) {
        const crud: CrudAccess = {
          create: null,
          read: null,
          update: null,
          delete: null,
        };
        let deterministic = true;

        for (const policy of tablePolicies) {
          const commands =
            policy.command === 'ALL'
              ? ALL_OPERATIONS
              : [policy.command];

          const accessResult = wouldPolicyGrantAccess(
            policy.parsed,
            roleKey,
            rolePermissions
          );

          for (const cmd of commands) {
            const crudKey = cmdToCrudKey(cmd);
            if (!crudKey) continue;

            if (accessResult === null) {
              // Indeterminate - only set if not already determined
              if (crud[crudKey] === null) {
                deterministic = false;
              }
            } else if (policy.permissive && accessResult === true) {
              // PERMISSIVE: any granting policy = access granted
              crud[crudKey] = true;
            } else if (!policy.permissive && accessResult === false) {
              // RESTRICTIVE: any denying policy = access denied
              crud[crudKey] = false;
              deterministic = true;
            }
          }
        }

        tableAccess.push({
          tableName,
          crud,
          policies: tablePolicies.map(({ permissive: _p, ...rest }) => rest),
          deterministic,
        });
      }

      // ── C. Navigation Routes ──
      const moduleRoutes = routesByModule[moduleName] ?? [];
      const routeAccess: RouteAccess[] = moduleRoutes.map((r) => ({
        route: r.route,
        requiredPermission: r.permission,
        hasPermission: rolePermissions[r.permission] === true,
      }));

      // ── D. Conflict Detection ──
      const conflicts: ConflictItem[] = [];
      const crudOps: (keyof CrudAccess)[] = ['create', 'read', 'update', 'delete'];

      for (const op of crudOps) {
        const codeGrants = codePermissions[op] === true;

        if (codeGrants && tableAccess.length > 0) {
          // Check if any table in this module grants this operation via RLS
          const anyTableGrants = tableAccess.some((t) => t.crud[op] === true);
          const anyTableHasPoliciesForOp = tableAccess.some((t) => {
            const cmdForOp = crudKeyToCmd(op);
            return t.policies.some(
              (p) => p.command === cmdForOp || p.command === 'ALL'
            );
          });

          if (!anyTableGrants && anyTableHasPoliciesForOp) {
            conflicts.push({
              type: 'code_grants_rls_blocks',
              description: `Code permissions grant ${op} access but no RLS policy on any table in "${moduleName}" grants this role the ${op} operation.`,
              module: moduleName,
              target: op,
              severity: 'warning',
            });
          }

          if (!anyTableHasPoliciesForOp && tableAccess.length > 0) {
            conflicts.push({
              type: 'no_rls_policy',
              description: `Code permissions grant ${op} but no RLS policy covers the ${crudKeyToCmd(op)} operation for tables in "${moduleName}".`,
              module: moduleName,
              target: op,
              severity: 'info',
            });
          }
        }
      }

      // Filter out modules with zero presence
      const hasCodePermissions = codePermissionDetails.length > 0;
      const hasTables = tableAccess.length > 0;
      const hasRoutes = routeAccess.length > 0;

      if (!hasCodePermissions && !hasTables && !hasRoutes) {
        continue;
      }

      modules.push({
        moduleName,
        codePermissions,
        codePermissionDetails,
        tableAccess,
        routeAccess,
        conflicts,
        isConsistent: conflicts.length === 0,
      });
    }

    const totalConflicts = modules.reduce((sum, m) => sum + m.conflicts.length, 0);

    const response: UnifiedAccessResponse = {
      role: {
        roleKey: customRole.role_key,
        roleName: customRole.role_name,
        userCount,
        isSystem: customRole.is_system_role ?? false,
      },
      modules,
      totalConflicts,
      computedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[permissions-audit/unified] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ── Helpers ──

function cmdToCrudKey(cmd: string): keyof CrudAccess | null {
  switch (cmd.toUpperCase().trim()) {
    case 'INSERT':
      return 'create';
    case 'SELECT':
      return 'read';
    case 'UPDATE':
      return 'update';
    case 'DELETE':
      return 'delete';
    default:
      return null;
  }
}

function crudKeyToCmd(key: keyof CrudAccess): string {
  switch (key) {
    case 'create':
      return 'INSERT';
    case 'read':
      return 'SELECT';
    case 'update':
      return 'UPDATE';
    case 'delete':
      return 'DELETE';
  }
}

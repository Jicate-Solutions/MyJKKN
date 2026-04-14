export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';

import { parseRlsExpression } from '@/lib/utils/rls-expression-parser';
import { getModuleForTable, getSubModuleForTable } from '@/lib/constants/table-module-map';
import type { RlsAuditResponse, RlsPolicy } from '@/types/permissions-audit';

const ALL_OPERATIONS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

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

    // Service role client for pg_policies system catalog access
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Fetch policies and RLS-enabled tables in parallel
    const [policiesResult, rlsTablesResult] = await Promise.all([
      serviceClient.rpc('get_rls_policies'),
      serviceClient.rpc('get_tables_with_rls')
    ]);

    if (policiesResult.error) {
      console.error('[permissions-audit/rls-policies] Error fetching RLS policies:', policiesResult.error);
      return NextResponse.json(
        {
          error: 'Failed to fetch RLS policies. Ensure the get_rls_policies() database function exists. ' +
            'See supabase/setup/02_functions.sql for the required function definition.'
        },
        { status: 500 }
      );
    }

    if (rlsTablesResult.error) {
      console.error('[permissions-audit/rls-policies] Error fetching RLS tables:', rlsTablesResult.error);
      return NextResponse.json(
        {
          error: 'Failed to fetch RLS-enabled tables. Ensure the get_tables_with_rls() database function exists. ' +
            'See supabase/setup/02_functions.sql for the required function definition.'
        },
        { status: 500 }
      );
    }

    const rawPolicies = policiesResult.data as Array<{
      tablename: string;
      policyname: string;
      cmd: string;
      qual: string | null;
      with_check: string | null;
    }>;

    const rlsEnabledTables = new Set<string>(
      (rlsTablesResult.data as Array<{ tablename: string }>).map((t) => t.tablename)
    );

    // Group policies by table
    const tableMap = new Map<
      string,
      { policies: RlsPolicy[]; coveredOps: Set<string> }
    >();

    for (const raw of rawPolicies) {
      const tableName = raw.tablename;
      const module = getModuleForTable(tableName);
      const subModule = getSubModuleForTable(tableName);
      const parsed = parseRlsExpression(raw.qual ?? raw.with_check ?? null);

      const policy: RlsPolicy = {
        tableName,
        policyName: raw.policyname,
        command: raw.cmd,
        usingExpression: raw.qual ?? null,
        withCheckExpression: raw.with_check ?? null,
        parsed,
        module,
        subModule
      };

      if (!tableMap.has(tableName)) {
        tableMap.set(tableName, { policies: [], coveredOps: new Set() });
      }

      const entry = tableMap.get(tableName)!;
      entry.policies.push(policy);

      // Track which operations are covered
      if (raw.cmd === 'ALL') {
        ALL_OPERATIONS.forEach((op) => entry.coveredOps.add(op));
      } else {
        entry.coveredOps.add(raw.cmd);
      }
    }

    // Add RLS-enabled tables that have zero policies
    for (const tableName of rlsEnabledTables) {
      if (!tableMap.has(tableName)) {
        tableMap.set(tableName, { policies: [], coveredOps: new Set() });
      }
    }

    // Build response tables array
    const modulesSet = new Set<string>();
    let unmappedCount = 0;
    let tablesWithoutPolicies = 0;
    let totalPolicies = 0;

    const tables: RlsAuditResponse['tables'] = [];

    for (const [tableName, entry] of tableMap) {
      const module = entry.policies.length > 0
        ? entry.policies[0].module
        : getModuleForTable(tableName);
      const subModule = entry.policies.length > 0
        ? entry.policies[0].subModule
        : getSubModuleForTable(tableName);

      const missingOperations = ALL_OPERATIONS.filter(
        (op) => !entry.coveredOps.has(op)
      );

      modulesSet.add(module);
      if (module === 'Other') unmappedCount++;
      if (entry.policies.length === 0) tablesWithoutPolicies++;
      totalPolicies += entry.policies.length;

      tables.push({
        tableName,
        module,
        subModule,
        policies: entry.policies,
        missingOperations,
        hasRls: rlsEnabledTables.has(tableName)
      });
    }

    // Sort by module then table name
    tables.sort((a, b) => {
      const moduleCmp = a.module.localeCompare(b.module);
      if (moduleCmp !== 0) return moduleCmp;
      return a.tableName.localeCompare(b.tableName);
    });

    const response: RlsAuditResponse = {
      tables,
      stats: {
        totalTables: tables.length,
        totalPolicies,
        totalModules: modulesSet.size,
        unmappedTables: unmappedCount,
        tablesWithoutPolicies
      }
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in GET /api/users/permissions-audit/rls-policies:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

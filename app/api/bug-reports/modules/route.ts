import { NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET() {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Admin-only: module breakdown is an internal analytics endpoint
    // (unlike /stats which uses RLS to scope results per user)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !profile ||
      !['admin', 'super_admin', 'administrator'].includes(profile.role)
    ) {
      return NextResponse.json(
        { error: 'Admin permissions required' },
        { status: 403 }
      );
    }

    const adminSupabase = createAdminClient();

    // Fetch both module_name and sub_module_name to build nested counts
    const { data, error } = await (adminSupabase as any)
      .from('bug_reports')
      .select('module_name, sub_module_name')
      .not('module_name', 'is', null);

    if (error) throw error;

    // Build nested structure: module → { count, subModules: { name → count } }
    const moduleMap: Record<
      string,
      { count: number; subModules: Record<string, number> }
    > = {};

    for (const row of data ?? []) {
      const m = (row.module_name as string) ?? 'other';
      const s = row.sub_module_name as string | null;

      if (!moduleMap[m]) moduleMap[m] = { count: 0, subModules: {} };
      moduleMap[m].count += 1;

      if (s) {
        moduleMap[m].subModules[s] = (moduleMap[m].subModules[s] ?? 0) + 1;
      }
    }

    const modules = Object.entries(moduleMap)
      .map(([name, { count, subModules }]) => ({
        name,
        count,
        subModules: Object.entries(subModules)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
      }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ modules });
  } catch (error) {
    logger.error('bug-reports/modules', 'Failed to fetch module list', error);
    return NextResponse.json(
      { error: 'Failed to fetch modules' },
      { status: 500 }
    );
  }
}

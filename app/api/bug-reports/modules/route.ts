import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET() {
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

    // adminSupabase is typed to the generated schema — tables not in generated
    // types require an `as any` cast. This is the project-wide pattern.
    const { data, error } = await (adminSupabase as any)
      .from('bug_reports')
      .select('module_name')
      .not('module_name', 'is', null);

    if (error) throw error;

    // Count occurrences per module
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const m = (row.module_name as string) ?? 'other';
      counts[m] = (counts[m] ?? 0) + 1;
    }

    const modules = Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
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

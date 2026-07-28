export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * GET /api/bug-reports/[id]/duplicates
 *
 * Two modes (admin-only, same role gate as status updates):
 *
 * 1. Default — list the reports parked as duplicates of this bug
 *    (duplicate_of = id), newest first.
 *
 * 2. ?mode=candidates[&q=...] — list bugs that could serve as the canonical
 *    for this bug: open (new/seen/in_progress), not itself a duplicate, not
 *    this bug. Without q, scoped to the same module (where duplicates
 *    overwhelmingly live); with q, searches display_id + description
 *    across all modules.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id: reportId } = await params;

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

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !profile ||
      (!(profile as any).is_super_admin && !['super_admin', 'administrator', 'ceo'].includes(profile.role))
    ) {
      return NextResponse.json(
        { error: 'Admin permissions required' },
        { status: 403 }
      );
    }

    const adminSupabase = createAdminClient();
    const mode = request.nextUrl.searchParams.get('mode');

    if (mode === 'candidates') {
      const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';

      const { data: source, error: sourceError } = await (
        adminSupabase.from('bug_reports') as any
      )
        .select('id, module_name')
        .eq('id', reportId)
        .maybeSingle();

      if (sourceError || !source) {
        return NextResponse.json(
          { error: 'Bug report not found' },
          { status: 404 }
        );
      }

      let query = (adminSupabase.from('bug_reports_with_details') as any)
        .select(
          'id, display_id, description, status, module_name, sub_module_name, created_at, reporter_name, duplicate_count'
        )
        .in('status', ['new', 'seen', 'in_progress'])
        .is('duplicate_of', null)
        .neq('id', reportId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (q) {
        query = query.or(`display_id.ilike.%${q}%,description.ilike.%${q}%`);
      } else if (source.module_name) {
        query = query.eq('module_name', source.module_name);
      }

      const { data: candidates, error: candidatesError } = await query;
      if (candidatesError) throw candidatesError;

      return NextResponse.json({ data: candidates ?? [] });
    }

    // Default mode: reports parked under this bug
    const { data: duplicates, error: duplicatesError } = await (
      adminSupabase.from('bug_reports_with_details') as any
    )
      .select(
        'id, display_id, description, status, created_at, reporter_name, resolved_at'
      )
      .eq('duplicate_of', reportId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (duplicatesError) throw duplicatesError;

    return NextResponse.json({ data: duplicates ?? [] });
  } catch (error) {
    logger.error('bug-reports/api', `Error in duplicates route for ${reportId}`, error);
    return NextResponse.json(
      { error: 'Failed to fetch duplicate information' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess } from '@/lib/utils/bos/bos-access';

// ── GET /api/bos/boards ───────────────────────────────────────────────────────
// Returns boards for a given institution from the local bos_boards table.
// Super-admin may query any institution; others are locked to their own.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);
    const { searchParams } = new URL(request.url);
    const institutionsId = searchParams.get('institutionsId');

    let query = supabase
      .from('bos_boards')
      .select('id, board_code, board_name, board_type, institutions_id, is_active')
      .eq('is_active', true)
      .order('board_name');

    if (scope.isSuperAdmin) {
      // Super-admin may pass an explicit institution filter
      if (institutionsId) query = query.eq('institutions_id', institutionsId);
    } else if (scope.allInstitutionIds.length > 1) {
      // CAS: include both Aided and Self-Financing institution boards
      query = query.in('institutions_id', scope.allInstitutionIds);
    } else if (scope.institutionsId) {
      query = query.eq('institutions_id', scope.institutionsId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[GET /api/bos/boards]', error);
      return NextResponse.json({ error: 'Failed to fetch boards' }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [], count: data?.length ?? 0 });
  } catch (error) {
    console.error('[GET /api/bos/boards]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

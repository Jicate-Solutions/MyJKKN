import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess } from '@/lib/utils/bos/bos-access';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);

    const { searchParams } = new URL(request.url);

    // CAS-aware institution scoping (matches the pattern used in
    // /api/bos/compositions GET):
    //   • super-admin → trust client-supplied ids
    //   • non-admin   → accept client list, but validate each id against the
    //                   user's own scope (allInstitutionIds covers CAS siblings)
    //   • fallback    → use scope.allInstitutionIds when client passes nothing
    // Accepts `institutionsId` (single, legacy) or `institutionsIds` (csv).
    let ids: string[] = [];
    const csv = searchParams.get('institutionsIds');
    const single = searchParams.get('institutionsId');
    const clientIds = csv
      ? csv.split(',').filter(Boolean)
      : single
        ? [single]
        : [];

    if (scope.isSuperAdmin) {
      ids = clientIds;
    } else {
      const allowed = new Set([
        ...(scope.institutionsId ? [scope.institutionsId] : []),
        ...scope.allInstitutionIds,
      ]);
      ids = clientIds.filter((id) => allowed.has(id));
      if (ids.length === 0) {
        ids = scope.allInstitutionIds.length > 0
          ? scope.allInstitutionIds
          : scope.institutionsId
            ? [scope.institutionsId]
            : [];
      }
    }

    let query = supabase
      .from('bos_regulation_taxonomies')
      .select('id, regulation_id, board_id, taxonomy_type, institutions_id, created_at, updated_at');

    if (ids.length === 1) {
      query = query.eq('institutions_id', ids[0]);
    } else if (ids.length > 1) {
      query = query.in('institutions_id', ids);
    }

    // Optional board filter. When a specific board is requested, return only that
    // board's rows; when 'null' (or omitted) the caller wants the regulation-wide
    // assignments (board_id IS NULL). Absent param => return all grains.
    const boardId = searchParams.get('boardId');
    if (boardId === 'null') {
      query = query.is('board_id', null);
    } else if (boardId) {
      query = query.eq('board_id', boardId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[GET /api/bos/taxonomy] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch taxonomy assignments' }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('[GET /api/bos/taxonomy] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

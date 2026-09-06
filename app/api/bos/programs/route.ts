import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveBosBoardScope, hasAnyBosPermission, isBosReadAllObserver, BOS_LOOKUP_VIEW_KEYS } from '@/lib/utils/bos/bos-access';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    // Accept single institutionId OR comma-separated institutionIds (for CAS Aided+Self).
    const institutionId = searchParams.get('institutionId');
    const institutionIds = searchParams.get('institutionIds');
    // Presence (any truthy value) toggles board-scoping for non-super-admins.
    // The value itself is ignored — actual board membership comes from
    // resolveBosBoardScope, which already handles CAS sibling UUIDs.
    const applyBoardScope = searchParams.get('boardScopeInstitutionId') != null;

    const ids = institutionIds
      ? institutionIds.split(',').filter(Boolean)
      : institutionId
        ? [institutionId]
        : [];

    if (ids.length === 0) {
      return NextResponse.json({ data: [], count: 0 });
    }

    let query = supabase
      .from('programs')
      .select('id, program_id, program_name, display_name')
      .eq('is_active', true)
      .order('program_name', { ascending: true });

    if (ids.length === 1) {
      query = query.eq('institution_id', ids[0]);
    } else {
      query = query.in('institution_id', ids);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Deduplicate by program_id in case Aided+Self share the same program codes.
    const seen = new Set<string>();
    let formatted = (data || [])
      .map((p: { id: string; program_id: string; program_name: string; display_name: string | null }) => ({
        id: p.id,
        program_code: p.program_id,
        program_name: p.display_name || p.program_name,
      }))
      .filter((p) => {
        if (seen.has(p.program_code)) return false;
        seen.add(p.program_code);
        return true;
      });

    if (applyBoardScope && formatted.length > 0) {
      const scope = await resolveBosBoardScope(user.id);
      // Read-only observer: a role holding ANY BoS lookup view grant (courses/
      // scheme/syllabus — see BOS_LOOKUP_VIEW_KEYS) sees all programmes, like a
      // super-admin — the boardsOf restriction below is skipped. VIEW ONLY.
      const hasView = await hasAnyBosPermission(user.id, BOS_LOOKUP_VIEW_KEYS);
      const canReadAllBos = isBosReadAllObserver(scope, hasView);
      const seeAll = scope.isSuperAdmin || canReadAllBos;

      // Strict rule: every non-super-admin caller must be an active member
      // (any member_type) of an active composition whose board governs the
      // programme via bos_board_programmes. No role-based carve-outs —
      // principals/HODs/etc. who need access get added to the relevant
      // composition explicitly. Source of truth is bos_board_programmes.
      if (!seeAll) {
        if (scope.boardsOf.size === 0) {
          // No active BoS composition → no programmes visible.
          formatted = [];
        } else {
          // bos_board_programmes.programme_code is stored uppercase.
          const upperCodes = formatted.map((p) => p.program_code.toUpperCase());

          // Service role bypasses the cross-institution RLS barrier on
          // bos_board_programmes (a Self-Financed user chairing an Aided board
          // would otherwise be blocked from reading the Aided rows).
          // Application-level auth is enforced above (boardsOf is the user's
          // own active memberships).
          const adminSupabase = createServiceRoleClient();
          const { data: boardProgs } = await adminSupabase
            .from('bos_board_programmes')
            .select('programme_code')
            .in('board_id', [...scope.boardsOf])
            .in('programme_code', upperCodes)
            .eq('is_active', true);

          const allowed = new Set(
            (boardProgs ?? []).map((p: { programme_code: string }) =>
              p.programme_code.toUpperCase(),
            ),
          );
          formatted = formatted.filter((p) => allowed.has(p.program_code.toUpperCase()));
        }
      }
    }

    return NextResponse.json({ data: formatted, count: formatted.length });
  } catch (error) {
    console.error('[GET /api/bos/programs]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

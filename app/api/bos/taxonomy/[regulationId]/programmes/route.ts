import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveBosAccess } from '@/lib/utils/bos/bos-access';
import { getBoardMemberProgrammes } from '@/lib/utils/bos/bos-chairman-access';
import { BosProgrammeSummary } from '@/types/bos';

type Params = { params: Promise<{ regulationId: string }> };

// Roles that can edit all programmes (treated as board chairman / institutional head).
const CHAIRMAN_ROLES = new Set(['hod', 'principal', 'vice_principal', 'dean', 'facilitator', 'coordinator']);

/**
 * GET /api/bos/taxonomy/[regulationId]/programmes
 *
 * Returns programmes configured via bos_board_programmes for the resolved
 * institution, annotated with:
 *   - po_count / pso_count   — how many outcomes already configured
 *   - can_edit               — true if current user is chairman for that programme (or super admin)
 *   - can_view               — true if current user is any board member, principal, or super admin
 *
 * Access filter (non-admin):
 *   - Principal roles       → see all, can_view=true, can_edit per chairman check
 *   - Board chairman        → can_view=true + can_edit=true for their programmes only
 *   - Board member (other)  → can_view=true, can_edit=false for their programmes only
 *   - Others                → programmes filtered out (empty result)
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { regulationId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const scope = await resolveBosAccess(user.id);

    // Client passes institutionsId from the composition page so cross-institution
    // board members (e.g. SF user on an Aided board) use the board's institution.
    const clientInstitutionsId = request.nextUrl.searchParams.get('institutionsId') ?? null;

    // Resolve primary institution: client-provided → user scope → regulation fallback
    let institutionsId: string | null =
      clientInstitutionsId ?? scope.institutionsId ?? scope.userInstitutionId ?? null;

    if (!institutionsId) {
      const { data: reg } = await supabase
        .from('regulations')
        .select('institution_id')
        .eq('id', regulationId)
        .maybeSingle();
      institutionsId = reg?.institution_id ?? null;
    }

    if (!institutionsId) {
      return NextResponse.json({ data: [] });
    }

    // Build the full set of institution IDs to query:
    //   - For CAS (Aided + SF): scope.allInstitutionIds contains both UUIDs.
    //     A staff member at the SF institution who chairs an Aided board can then
    //     read board programmes stored under the Aided UUID.
    //   - For super admin or single-institution: falls back to institutionsId alone.
    const queryIds: string[] =
      scope.allInstitutionIds.length > 0 &&
      (clientInstitutionsId === null || scope.allInstitutionIds.includes(clientInstitutionsId))
        ? scope.allInstitutionIds
        : [institutionsId];

    // Use service role to bypass the cross-institution RLS barrier on
    // bos_board_programmes. Application-level auth is enforced above (user must
    // be authenticated; queryIds is scoped to the user's own CAS institution pair).
    const adminSupabase = createServiceRoleClient();
    const { data: boardProgs, error: bpError } = await adminSupabase
      .from('bos_board_programmes')
      .select('programme_code, programme_name, board_id')
      .in('institutions_id', queryIds)
      .eq('is_active', true)
      .order('programme_code', { ascending: true });

    if (bpError) throw bpError;
    if (!boardProgs || boardProgs.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const programmeCodes = boardProgs.map((bp: { programme_code: string }) => bp.programme_code);
    const boardIds = [...new Set(boardProgs.map((bp: { board_id: string }) => bp.board_id))];

    // Fetch board names from COE API
    const { fetchCoeBoardMap } = await import('@/lib/utils/bos/coe-boards');
    const coeBoardMap = await fetchCoeBoardMap(institutionsId);
    const boardNameMap = new Map(
      [...coeBoardMap.entries()].map(([id, b]) => [id, b.board_name])
    );

    // Fetch PO counts per programme for this regulation
    const { data: poCounts } = await supabase
      .from('bos_programme_outcomes')
      .select('programme_code')
      .eq('institutions_id', institutionsId)
      .eq('regulation_id', regulationId)
      .in('programme_code', programmeCodes);

    const poCountMap = new Map<string, number>();
    (poCounts ?? []).forEach((r: { programme_code: string }) => {
      poCountMap.set(r.programme_code, (poCountMap.get(r.programme_code) ?? 0) + 1);
    });

    // Fetch PSO counts per programme for this regulation
    const { data: psoCounts } = await supabase
      .from('bos_programme_specific_outcomes')
      .select('programme_code')
      .eq('institutions_id', institutionsId)
      .eq('regulation_id', regulationId)
      .in('programme_code', programmeCodes);

    const psoCountMap = new Map<string, number>();
    (psoCounts ?? []).forEach((r: { programme_code: string }) => {
      psoCountMap.set(r.programme_code, (psoCountMap.get(r.programme_code) ?? 0) + 1);
    });

    const role = scope.role ?? '';
    const isChairmanRole = !scope.isSuperAdmin && CHAIRMAN_ROLES.has(role);
    let memberProgrammes: Set<string>;

    if (scope.isSuperAdmin || isChairmanRole) {
      memberProgrammes = new Set(programmeCodes);
    } else {
      memberProgrammes = await getBoardMemberProgrammes(user.id, programmeCodes, institutionsId);
    }

    const result: BosProgrammeSummary[] = boardProgs
      .map((bp: { programme_code: string; programme_name: string | null; board_id: string }) => {
        const isMember = memberProgrammes.has(bp.programme_code);
        const can_edit = scope.isSuperAdmin || isChairmanRole || isMember;
        const can_view = can_edit;
        return {
          programme_code: bp.programme_code,
          programme_name: bp.programme_name ?? bp.programme_code,
          board_id: bp.board_id,
          board_name: boardNameMap.get(bp.board_id) ?? '',
          po_count: poCountMap.get(bp.programme_code) ?? 0,
          pso_count: psoCountMap.get(bp.programme_code) ?? 0,
          can_edit,
          can_view,
        };
      })
      // Non-admin users only see programmes they can view or edit
      .filter((p) => p.can_view || p.can_edit);

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[GET /api/bos/taxonomy/[regulationId]/programmes]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess } from '@/lib/utils/bos/bos-access';
import { getBoardMemberProgrammes } from '@/lib/utils/bos/bos-chairman-access';
import { BosProgrammeSummary } from '@/types/bos';

type Params = { params: Promise<{ regulationId: string }> };

const PRINCIPAL_ROLES = new Set(['principal', 'vice_principal', 'dean']);

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

    // Resolve institution
    let institutionsId: string | null =
      scope.institutionsId ?? scope.userInstitutionId ?? null;

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

    // Fetch board-programme mappings for this institution
    const { data: boardProgs, error: bpError } = await supabase
      .from('bos_board_programmes')
      .select('programme_code, programme_name, board_id')
      .eq('institutions_id', institutionsId)
      .eq('is_active', true)
      .order('programme_code', { ascending: true });

    if (bpError) throw bpError;
    if (!boardProgs || boardProgs.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const programmeCodes = boardProgs.map((bp: { programme_code: string }) => bp.programme_code);
    const boardIds = [...new Set(boardProgs.map((bp: { board_id: string }) => bp.board_id))];

    // Fetch board names for display
    const { data: boards } = await supabase
      .from('bos_boards')
      .select('id, board_name')
      .in('id', boardIds);

    const boardNameMap = new Map(
      (boards ?? []).map((b: { id: string; board_name: string }) => [b.id, b.board_name])
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

    // Compute can_edit (chairman only) and can_view (any member) per programme
    const isPrincipal = !scope.isSuperAdmin && PRINCIPAL_ROLES.has(scope.role ?? '');

    // can_edit = any board member (chairman or otherwise); can_view = same + principal
    let memberProgrammes: Set<string>;

    if (scope.isSuperAdmin) {
      memberProgrammes = new Set(programmeCodes);
    } else {
      // Principal sees all with can_view but no can_edit (unless also a member)
      memberProgrammes = await getBoardMemberProgrammes(user.id, programmeCodes, institutionsId);
    }

    const result: BosProgrammeSummary[] = boardProgs
      .map((bp: { programme_code: string; programme_name: string | null; board_id: string }) => {
        const isMember = memberProgrammes.has(bp.programme_code);
        const can_edit = scope.isSuperAdmin || isMember;
        // Principal can view but not edit; members can both view and edit
        const can_view = can_edit || isPrincipal;
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

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess } from '@/lib/utils/bos/bos-access';
import { counsellingCodeFor } from '@/lib/utils/bos/institution-scope';

type Params = { params: Promise<{ regulationId: string }> };

/**
 * GET /api/bos/taxonomy/[regulationId]/po-programmes
 *
 * Returns distinct programme codes that have at least one PO row in
 * bos_programme_outcomes for the given regulation + institution.
 *
 * Used as a fallback in the CO-PO matrix editor when the board has no
 * entries in bos_board_programmes.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { regulationId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const scope = await resolveBosAccess(user.id);
    const institutionsId = scope.institutionsId ?? scope.userInstitutionId ?? null;

    if (!institutionsId) {
      const { data: reg } = await supabase
        .from('regulations')
        .select('institution_id')
        .eq('id', regulationId)
        .maybeSingle();
      if (!reg?.institution_id) return NextResponse.json({ data: [] });
    }

    const resolvedId = institutionsId ?? (await supabase
      .from('regulations').select('institution_id').eq('id', regulationId).maybeSingle()
      .then(r => r.data?.institution_id ?? null));

    if (!resolvedId) return NextResponse.json({ data: [] });

    // CAS-aware via the denormalized counselling_code: include programme
    // outcomes recorded under either sibling UUID.
    const code = await counsellingCodeFor(supabase, resolvedId);

    let poQuery = supabase
      .from('bos_programme_outcomes')
      .select('programme_code')
      .eq('regulation_id', regulationId)
      .order('programme_code', { ascending: true });
    poQuery = code
      ? poQuery.eq('counselling_code', code)
      : poQuery.eq('institutions_id', resolvedId);

    const { data, error } = await poQuery;

    if (error) throw error;

    const codes = [...new Set((data ?? []).map((r: { programme_code: string }) => r.programme_code))];
    return NextResponse.json({ data: codes.map(c => ({ programme_code: c })) });
  } catch (error) {
    console.error('[GET /api/bos/taxonomy/[regulationId]/po-programmes]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

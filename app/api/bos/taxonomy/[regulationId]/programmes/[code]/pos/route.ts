import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess } from '@/lib/utils/bos/bos-access';
import { isMemberForProgramme } from '@/lib/utils/bos/bos-chairman-access';
import { BosProgrammeOutcome } from '@/types/bos';

type Params = { params: Promise<{ regulationId: string; code: string }> };

/** Resolve institutionsId using the same fallback chain as the taxonomy route. */
async function resolveInstitution(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: Awaited<ReturnType<typeof resolveBosAccess>>,
  regulationId: string
): Promise<string | null> {
  let id: string | null = scope.institutionsId ?? scope.userInstitutionId ?? null;
  if (!id) {
    const { data: reg } = await supabase
      .from('regulations')
      .select('institution_id')
      .eq('id', regulationId)
      .maybeSingle();
    id = reg?.institution_id ?? null;
  }
  return id;
}

/**
 * GET /api/bos/taxonomy/[regulationId]/programmes/[code]/pos
 * Returns all POs for this regulation + programme, ordered by sort_order.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { regulationId, code: programmeCode } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const scope = await resolveBosAccess(user.id);
    const institutionsId = await resolveInstitution(supabase, scope, regulationId);
    if (!institutionsId) return NextResponse.json({ data: [] });

    const { data, error } = await supabase
      .from('bos_programme_outcomes')
      .select('*')
      .eq('institutions_id', institutionsId)
      .eq('regulation_id', regulationId)
      .eq('programme_code', programmeCode.toUpperCase())
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('[GET /api/bos/taxonomy/[regulationId]/programmes/[code]/pos]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/bos/taxonomy/[regulationId]/programmes/[code]/pos
 * Batch-replace all POs for this regulation + programme.
 * Chairman or super-admin only.
 *
 * Body: { pos: Array<{ po_code: string; description: string }> }
 *
 * Strategy: DELETE existing rows then INSERT new ones (atomic via sequential ops).
 * po_code is auto-assigned client-side (PO1, PO2…); sort_order mirrors array index.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { regulationId, code: programmeCode } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const scope = await resolveBosAccess(user.id);
    const institutionsId = await resolveInstitution(supabase, scope, regulationId);

    if (!institutionsId) {
      return NextResponse.json({ error: 'Cannot determine institution' }, { status: 400 });
    }

    // Board member guard — any member (chairman or otherwise) can write; super-admin bypasses
    if (!scope.isSuperAdmin) {
      const canEdit = await isMemberForProgramme(user.id, programmeCode.toUpperCase(), institutionsId);
      if (!canEdit) {
        return NextResponse.json(
          { error: 'Only board members can update Programme Outcomes' },
          { status: 403 }
        );
      }
    }

    const body = (await request.json()) as {
      pos: Array<{ po_code: string; description?: string }>;
    };

    if (!Array.isArray(body.pos)) {
      return NextResponse.json({ error: 'pos array is required' }, { status: 400 });
    }

    const upperCode = programmeCode.toUpperCase();

    // Delete existing POs for this programme + regulation
    const { error: deleteError } = await supabase
      .from('bos_programme_outcomes')
      .delete()
      .eq('institutions_id', institutionsId)
      .eq('regulation_id', regulationId)
      .eq('programme_code', upperCode);

    if (deleteError) throw deleteError;

    // Insert new POs (skip if empty)
    let inserted: BosProgrammeOutcome[] = [];
    if (body.pos.length > 0) {
      const rows = body.pos.map((po, idx) => ({
        institutions_id: institutionsId,
        regulation_id: regulationId,
        programme_code: upperCode,
        po_code: po.po_code.trim(),
        description: po.description?.trim() ?? null,
        sort_order: idx + 1,
        created_by: user.id,
        updated_by: user.id,
      }));

      const { data: insertedData, error: insertError } = await supabase
        .from('bos_programme_outcomes')
        .insert(rows)
        .select();

      if (insertError) throw insertError;
      inserted = insertedData ?? [];
    }

    return NextResponse.json({ data: inserted });
  } catch (error) {
    console.error('[POST /api/bos/taxonomy/[regulationId]/programmes/[code]/pos]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

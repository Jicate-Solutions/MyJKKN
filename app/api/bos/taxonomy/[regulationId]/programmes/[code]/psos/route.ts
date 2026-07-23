import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveBosAccess } from '@/lib/utils/bos/bos-access';
import { resolveCasRegulationIds } from '@/lib/utils/bos/institution-scope';
import { isMemberForProgramme } from '@/lib/utils/bos/bos-chairman-access';
import { BosProgrammeSpecificOutcome } from '@/types/bos';

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
 * GET /api/bos/taxonomy/[regulationId]/programmes/[code]/psos
 * Returns all PSOs for this regulation + programme, ordered by sort_order.
 *
 * Query parameters:
 * - institutionsIds (optional CSV): For CAS, pass both UUIDs (Aided,Self-Financing)
 *   to search across both. If omitted, resolves from user's scope.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { regulationId, code: programmeCode } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const scope = await resolveBosAccess(user.id);

    // CAS-aware institution filtering: accept CSV from client, validate against scope
    const { searchParams } = new URL(request.url);
    const csv = searchParams.get('institutionsIds');
    const clientIds = csv ? csv.split(',').filter(Boolean) : [];

    let filterIds: string[] = [];
    if (scope.isSuperAdmin && clientIds.length > 0) {
      filterIds = clientIds;
    } else {
      // Non-admin: validate client IDs against their scope, or use scope's full institutional set
      const allowed = new Set([
        ...(scope.institutionsId ? [scope.institutionsId] : []),
        ...scope.allInstitutionIds,
      ]);
      filterIds = clientIds.filter(id => allowed.has(id));
      if (filterIds.length === 0) {
        // No client IDs or they failed validation; use scope's full set
        filterIds = scope.allInstitutionIds.length > 0
          ? scope.allInstitutionIds
          : scope.institutionsId
            ? [scope.institutionsId]
            : [];
      }
    }

    // Fallback: if still empty, resolve from regulation
    if (filterIds.length === 0) {
      const institutionsId = await resolveInstitution(supabase, scope, regulationId);
      if (!institutionsId) return NextResponse.json({ data: [] });
      filterIds = [institutionsId];
    }

    // Service-role for the SELECT (route does CAS-aware authz via filterIds) —
    // PSOs may live under the CAS Aided sibling that RLS hides from the Self
    // context. Same precedent as the POS route + /api/bos/compositions.
    const db = createServiceRoleClient();
    // CAS-aware: PSOs may live under either sibling regulation of the same code.
    const regIds = await resolveCasRegulationIds(db, regulationId);
    let query = db
      .from('bos_programme_specific_outcomes')
      .select('*')
      .in('regulation_id', regIds)
      .eq('programme_code', programmeCode.toUpperCase());

    if (filterIds.length === 1) {
      query = query.eq('institutions_id', filterIds[0]);
    } else if (filterIds.length > 1) {
      query = query.in('institutions_id', filterIds);
    }

    query = query.order('sort_order', { ascending: true });

    const { data, error } = await query;

    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('[GET /api/bos/taxonomy/[regulationId]/programmes/[code]/psos]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/bos/taxonomy/[regulationId]/programmes/[code]/psos
 * Batch-replace all PSOs for this regulation + programme.
 * Chairman or super-admin only.
 *
 * Body: { psos: Array<{ pso_code: string; description?: string }> }
 *
 * Strategy: DELETE existing rows then INSERT new ones (atomic via sequential ops).
 * pso_code is auto-assigned client-side (PSO1, PSO2…); sort_order mirrors array index.
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
          { error: 'Only board members can update Programme Specific Outcomes' },
          { status: 403 }
        );
      }
    }

    const body = (await request.json()) as {
      psos: Array<{ pso_code: string; description?: string }>;
    };

    if (!Array.isArray(body.psos)) {
      return NextResponse.json({ error: 'psos array is required' }, { status: 400 });
    }

    const upperCode = programmeCode.toUpperCase();

    // Delete existing PSOs for this programme + regulation
    const { error: deleteError } = await supabase
      .from('bos_programme_specific_outcomes')
      .delete()
      .eq('institutions_id', institutionsId)
      .eq('regulation_id', regulationId)
      .eq('programme_code', upperCode);

    if (deleteError) throw deleteError;

    // Insert new PSOs (skip if empty)
    let inserted: BosProgrammeSpecificOutcome[] = [];
    if (body.psos.length > 0) {
      const rows = body.psos.map((pso, idx) => ({
        institutions_id: institutionsId,
        regulation_id: regulationId,
        programme_code: upperCode,
        pso_code: pso.pso_code.trim(),
        description: pso.description?.trim() ?? null,
        sort_order: idx + 1,
        created_by: user.id,
        updated_by: user.id,
      }));

      const { data: insertedData, error: insertError } = await supabase
        .from('bos_programme_specific_outcomes')
        .insert(rows)
        .select();

      if (insertError) throw insertError;
      inserted = insertedData ?? [];
    }

    return NextResponse.json({ data: inserted });
  } catch (error) {
    console.error('[POST /api/bos/taxonomy/[regulationId]/programmes/[code]/psos]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

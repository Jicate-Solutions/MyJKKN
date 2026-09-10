import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveBosAccess, resolveBosBoardScope } from '@/lib/utils/bos/bos-access';
import { resolveCasRegulationIds } from '@/lib/utils/bos/institution-scope';
import {
  canWriteProgrammeOutcomes,
  resolveProgrammeOutcomeTarget,
  sortOutcomeRows,
  syncOutcomeSet,
} from '@/lib/utils/bos/programme-outcomes';
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
 *
 * Query parameters:
 * - institutionsIds (optional CSV): For CAS, pass both UUIDs (Aided,Self-Financing)
 *   to search across both. If omitted, resolves from user's scope.
 * - includeInactive=1: also return soft-deactivated rows (is_active=false).
 *   Default returns ACTIVE rows only — consumers (syllabus CO-PO editor,
 *   compositions Outcomes tab) must not offer a deactivated outcome.
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
    const includeInactive = searchParams.get('includeInactive') === '1';

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

    // Service-role for the SELECT: bos_programme_outcomes RLS gates on
    // role_has_institution_access(institutions_id), and the POs may live under
    // the CAS Aided sibling while the caller's context is the Self sibling — RLS
    // hides the cross-sibling rows. filterIds above is the CAS-aware authz (a
    // non-admin's client ids are validated against their scope), so service-role
    // is safe. Same precedent as /api/bos/compositions, /meetings, /lookup/*.
    const db = createServiceRoleClient();
    // CAS-aware: POs may be entered under either sibling regulation of the same
    // code (Aided/SF), so query across both.
    const regIds = await resolveCasRegulationIds(db, regulationId);
    let query = db
      .from('bos_programme_outcomes')
      .select('*')
      .in('regulation_id', regIds)
      .eq('programme_code', programmeCode.toUpperCase());
    if (!includeInactive) query = query.eq('is_active', true);

    if (filterIds.length === 1) {
      query = query.eq('institutions_id', filterIds[0]);
    } else if (filterIds.length > 1) {
      query = query.in('institutions_id', filterIds);
    }

    query = query.order('sort_order', { ascending: true });

    const { data, error } = await query;

    if (error) throw error;
    return NextResponse.json({ data: sortOutcomeRows((data ?? []) as BosProgrammeOutcome[], 'po') });
  } catch (error) {
    console.error('[GET /api/bos/taxonomy/[regulationId]/programmes/[code]/pos]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/bos/taxonomy/[regulationId]/programmes/[code]/pos
 * Batch "replace" of the Programme Outcomes for this regulation + programme.
 *
 * Body: { pos: Array<{ po_code: string; description: string }> }
 *
 * NO DELETES (single source of truth shared with /bos/po-pso): each incoming
 * code is upserted (description / order updated, row reactivated); active
 * rows whose code is no longer present are soft-deactivated (is_active=false).
 * Authorization = canWriteProgrammeOutcomes: super-admin, principal of the
 * institution, HOD of the programme's department, or any member of a board
 * governing the programme. Writes run service-role after that check.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { regulationId, code: programmeCode } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const scope = await resolveBosBoardScope(user.id);
    const institutionsId = await resolveInstitution(supabase, scope, regulationId);

    if (!institutionsId) {
      return NextResponse.json({ error: 'Cannot determine institution' }, { status: 400 });
    }

    const body = (await request.json()) as {
      pos: Array<{ po_code: string; description?: string }>;
    };

    if (!Array.isArray(body.pos)) {
      return NextResponse.json({ error: 'pos array is required' }, { status: 400 });
    }

    const db = createServiceRoleClient();
    const target = await resolveProgrammeOutcomeTarget(db, {
      institutionsId,
      regulationId,
      programmeCode,
    });
    if (!target) {
      return NextResponse.json({ error: 'Cannot determine institution' }, { status: 400 });
    }

    if (!(await canWriteProgrammeOutcomes(scope, user.id, target))) {
      return NextResponse.json(
        { error: 'Only board members, the HOD or the principal can update Programme Outcomes' },
        { status: 403 }
      );
    }

    const saved = await syncOutcomeSet<BosProgrammeOutcome>(
      db,
      target,
      'po',
      body.pos.map((r) => ({ code: r.po_code, description: r.description })),
      user.id
    );

    return NextResponse.json({ data: saved });
  } catch (error) {
    console.error('[POST /api/bos/taxonomy/[regulationId]/programmes/[code]/pos]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

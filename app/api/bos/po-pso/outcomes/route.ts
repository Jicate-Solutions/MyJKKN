import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  resolveBosBoardScope,
  hasAnyBosPermission,
  isBosReadAllObserver,
  BOS_LOOKUP_VIEW_KEYS,
} from '@/lib/utils/bos/bos-access';
import {
  canReadProgrammeOutcomes,
  canWriteProgrammeOutcomes,
  createOutcome,
  listOutcomes,
  resolveProgrammeOutcomeTarget,
  updateOutcome,
  type OutcomeKind,
} from '@/lib/utils/bos/programme-outcomes';
import type { BosProgrammeOutcome, BosProgrammeSpecificOutcome } from '@/types/bos';

/**
 * /api/bos/po-pso/outcomes — HOD row-level PO / PSO maintenance.
 *
 * Backed by bos_programme_outcomes / bos_programme_specific_outcomes — the
 * SAME rows the /bos/compositions Outcomes tab and the syllabus CO-PO editor
 * read. Nothing is ever deleted: "Deactivate" flips is_active.
 *
 * GET   ?institutionsId&regulationId&programmeCode[&includeInactive=1]
 *       → { pos, psos, can_edit, programme }
 * POST  { institutions_id, regulation_id, programme_code, kind, description }
 *       → creates the next code (PO<n+1> / PSO<n+1>)
 * PATCH { institutions_id, regulation_id, programme_code, kind, id,
 *         description?, is_active? }
 */

function parseKind(v: unknown): OutcomeKind | null {
  return v === 'po' || v === 'pso' ? v : null;
}

async function authorize(
  request: NextRequest,
  body: { institutions_id?: string; regulation_id?: string; programme_code?: string }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  if (!body.institutions_id || !body.regulation_id || !body.programme_code) {
    return {
      error: NextResponse.json(
        { error: 'institutions_id, regulation_id and programme_code are required' },
        { status: 400 }
      ),
    };
  }

  const scope = await resolveBosBoardScope(user.id);
  const db = createServiceRoleClient();
  const target = await resolveProgrammeOutcomeTarget(db, {
    institutionsId: body.institutions_id,
    regulationId: body.regulation_id,
    programmeCode: body.programme_code,
  });
  if (!target) return { error: NextResponse.json({ error: 'Unknown institution' }, { status: 400 }) };

  if (!(await canWriteProgrammeOutcomes(scope, user.id, target))) {
    return {
      error: NextResponse.json(
        { error: 'Only the HOD of this programme, the principal, or its board members can update PO/PSO' },
        { status: 403 }
      ),
    };
  }
  return { user, db, target };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sp = request.nextUrl.searchParams;
    const institutionsId = sp.get('institutionsId');
    const regulationId = sp.get('regulationId');
    const programmeCode = sp.get('programmeCode');
    const includeInactive = sp.get('includeInactive') === '1';
    if (!institutionsId || !regulationId || !programmeCode) {
      return NextResponse.json(
        { error: 'institutionsId, regulationId and programmeCode are required' },
        { status: 400 }
      );
    }

    const scope = await resolveBosBoardScope(user.id);
    const hasView = await hasAnyBosPermission(user.id, BOS_LOOKUP_VIEW_KEYS);
    const seeAll = scope.isSuperAdmin || isBosReadAllObserver(scope, hasView);

    // Service-role SELECT — CAS sibling rows may be hidden from the caller's
    // RLS context; canReadProgrammeOutcomes is the CAS-aware authz.
    const db = createServiceRoleClient();
    const target = await resolveProgrammeOutcomeTarget(db, { institutionsId, regulationId, programmeCode });
    if (!target) return NextResponse.json({ data: { pos: [], psos: [], can_edit: false, programme: null } });

    if (!(await canReadProgrammeOutcomes(supabase, scope, target, seeAll))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [pos, psos, canEdit] = await Promise.all([
      listOutcomes<BosProgrammeOutcome>(db, target, 'po', { includeInactive }),
      listOutcomes<BosProgrammeSpecificOutcome>(db, target, 'pso', { includeInactive }),
      canWriteProgrammeOutcomes(scope, user.id, target),
    ]);

    return NextResponse.json({
      data: { pos, psos, can_edit: canEdit, programme: target.programme },
    });
  } catch (error) {
    console.error('[GET /api/bos/po-pso/outcomes]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      institutions_id?: string; regulation_id?: string; programme_code?: string;
      kind?: string; description?: string; code?: string;
    };
    const kind = parseKind(body.kind);
    if (!kind) return NextResponse.json({ error: "kind must be 'po' or 'pso'" }, { status: 400 });
    const description = (body.description ?? '').trim();
    if (!description) return NextResponse.json({ error: 'description is required' }, { status: 400 });

    const auth = await authorize(request, body);
    if ('error' in auth) return auth.error;

    const row = await createOutcome(auth.db, auth.target, kind, { description, code: body.code }, auth.user.id);
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/bos/po-pso/outcomes]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      institutions_id?: string; regulation_id?: string; programme_code?: string;
      kind?: string; id?: string; description?: string; is_active?: boolean;
    };
    const kind = parseKind(body.kind);
    if (!kind) return NextResponse.json({ error: "kind must be 'po' or 'pso'" }, { status: 400 });
    if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    if (body.description === undefined && body.is_active === undefined) {
      return NextResponse.json({ error: 'description or is_active is required' }, { status: 400 });
    }
    if (body.description !== undefined && !body.description.trim()) {
      return NextResponse.json({ error: 'description cannot be empty' }, { status: 400 });
    }

    const auth = await authorize(request, body);
    if ('error' in auth) return auth.error;

    const row = await updateOutcome(
      auth.db,
      auth.target,
      kind,
      body.id,
      { description: body.description, is_active: body.is_active },
      auth.user.id
    );
    if (!row) return NextResponse.json({ error: 'Outcome not found in this programme' }, { status: 404 });
    return NextResponse.json({ data: row });
  } catch (error) {
    console.error('[PATCH /api/bos/po-pso/outcomes]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

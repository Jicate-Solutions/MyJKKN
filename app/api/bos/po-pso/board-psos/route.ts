import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveBosBoardScope, hasBosPermission, isBosReadAllObserver } from '@/lib/utils/bos/bos-access';
import { intersectBosScope, resolveCasRegulationIds } from '@/lib/utils/bos/institution-scope';
import {
  resolvePoPsoTarget,
  canWriteBoardPsos,
} from '@/lib/utils/bos/po-pso-access';
import type { BosBoardPso } from '@/types/bos';

/**
 * GET /api/bos/po-pso/board-psos?institutionsId=<uuid>&regulationId=<uuid>
 *
 * All board-level PSO override rows for the institution + regulation
 * (both CAS-expanded). The client groups rows by board_id; a board with
 * zero rows inherits the master PSO set (bos_master_psos).
 *
 * Returns { data: BosBoardPso[] }.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const requestedId = searchParams.get('institutionsId');
    const regulationId = searchParams.get('regulationId');
    if (!requestedId || !regulationId) {
      return NextResponse.json(
        { error: 'institutionsId and regulationId are required' },
        { status: 400 }
      );
    }

    const scope = await resolveBosBoardScope(user.id);

    // Read-only observer: holds the courses view grant but sits on no board —
    // may READ every board's PSO overrides (write paths below stay guarded).
    const hasView = await hasBosPermission(user.id, 'academic.bos-courses.view');
    const canReadAllBos = isBosReadAllObserver(scope, hasView);
    const seeAll = scope.isSuperAdmin || canReadAllBos;

    const db = createServiceRoleClient();
    const target = await resolvePoPsoTarget(db, requestedId);
    if (!target) return NextResponse.json({ data: [] });

    if (!seeAll) {
      const allowed = await intersectBosScope(supabase, scope, target.ids);
      const memberAllowed = target.ids.some((id) => scope.institutionsOf.has(id));
      if (allowed.length === 0 && !memberAllowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const regIds = await resolveCasRegulationIds(db, regulationId);

    const { data, error } = await db
      .from('bos_board_psos')
      .select('*')
      .in('institutions_id', target.ids)
      .in('regulation_id', regIds)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ data: (data ?? []) as BosBoardPso[] });
  } catch (error) {
    console.error('[GET /api/bos/po-pso/board-psos]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/bos/po-pso/board-psos
 *
 * Batch-replace the PSO override for one board + regulation.
 * Body: {
 *   institutions_id: string,
 *   regulation_id: string,
 *   board_id: string,
 *   board_code?: string,
 *   board_name?: string,
 *   psos: Array<{ pso_code: string; description?: string }>,
 * }
 * An empty psos array removes the override (board reverts to master).
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as {
      institutions_id?: string;
      regulation_id?: string;
      board_id?: string;
      board_code?: string;
      board_name?: string;
      psos?: Array<{ pso_code: string; description?: string }>;
    };

    if (!body.institutions_id || !body.board_id || !body.regulation_id) {
      return NextResponse.json(
        { error: 'institutions_id, regulation_id and board_id are required' },
        { status: 400 }
      );
    }
    if (!Array.isArray(body.psos)) {
      return NextResponse.json({ error: 'psos array is required' }, { status: 400 });
    }

    const scope = await resolveBosBoardScope(user.id);
    const db = createServiceRoleClient();
    const target = await resolvePoPsoTarget(db, body.institutions_id);
    if (!target) {
      return NextResponse.json({ error: 'Unknown institution' }, { status: 400 });
    }

    if (!canWriteBoardPsos(scope, body.board_id, target.ids)) {
      return NextResponse.json(
        { error: 'Only members of this board can customize its PSOs' },
        { status: 403 }
      );
    }

    const regIds = await resolveCasRegulationIds(db, body.regulation_id);

    const { error: delErr } = await db
      .from('bos_board_psos')
      .delete()
      .eq('board_id', body.board_id)
      .in('institutions_id', target.ids)
      .in('regulation_id', regIds);
    if (delErr) throw delErr;

    let inserted: BosBoardPso[] = [];
    if (body.psos.length > 0) {
      const rows = body.psos.map((pso, idx) => ({
        board_id: body.board_id,
        institutions_id: target.canonicalId,
        regulation_id: body.regulation_id,
        board_code: body.board_code?.trim() || null,
        board_name: body.board_name?.trim() || null,
        pso_code: pso.pso_code.trim(),
        description: pso.description?.trim() ?? null,
        sort_order: idx + 1,
        created_by: user.id,
        updated_by: user.id,
      }));
      const { data, error: insErr } = await db
        .from('bos_board_psos')
        .insert(rows)
        .select();
      if (insErr) throw insErr;
      inserted = (data ?? []) as BosBoardPso[];
    }

    return NextResponse.json({ data: inserted });
  } catch (error) {
    console.error('[PUT /api/bos/po-pso/board-psos]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/bos/po-pso/board-psos?institutionsId=<uuid>&regulationId=<uuid>&boardId=<uuid>
 *
 * Removes a board's PSO override for the regulation — the board reverts to
 * inheriting the institution master PSO set.
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const requestedId = searchParams.get('institutionsId');
    const regulationId = searchParams.get('regulationId');
    const boardId = searchParams.get('boardId');
    if (!requestedId || !boardId || !regulationId) {
      return NextResponse.json(
        { error: 'institutionsId, regulationId and boardId are required' },
        { status: 400 }
      );
    }

    const scope = await resolveBosBoardScope(user.id);
    const db = createServiceRoleClient();
    const target = await resolvePoPsoTarget(db, requestedId);
    if (!target) {
      return NextResponse.json({ error: 'Unknown institution' }, { status: 400 });
    }

    if (!canWriteBoardPsos(scope, boardId, target.ids)) {
      return NextResponse.json(
        { error: 'Only members of this board can reset its PSOs' },
        { status: 403 }
      );
    }

    const regIds = await resolveCasRegulationIds(db, regulationId);

    const { error } = await db
      .from('bos_board_psos')
      .delete()
      .eq('board_id', boardId)
      .in('institutions_id', target.ids)
      .in('regulation_id', regIds);
    if (error) throw error;

    return NextResponse.json({ data: { reset: true } });
  } catch (error) {
    console.error('[DELETE /api/bos/po-pso/board-psos]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

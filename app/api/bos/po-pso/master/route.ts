import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveBosBoardScope, hasBosPermission, isBosReadAllObserver } from '@/lib/utils/bos/bos-access';
import { intersectBosScope, resolveCasRegulationIds } from '@/lib/utils/bos/institution-scope';
import {
  resolvePoPsoTarget,
  canWriteMasterOutcomes,
} from '@/lib/utils/bos/po-pso-access';
import type { BosMasterPo, BosMasterPso } from '@/types/bos';

/**
 * GET /api/bos/po-pso/master?institutionsId=<uuid>&regulationId=<uuid>
 *
 * Institution + regulation master PO + default PSO sets. POs are COMMON to
 * every board of the institution; PSOs here are the defaults boards inherit
 * unless they have rows in bos_board_psos. Each regulation (R-2024, R-2026…)
 * carries its own sets.
 *
 * institutionsId may be a MyJKKN UUID or a COE UUID (super-admin institution
 * dropdown options carry COE ids) — resolvePoPsoTarget bridges both spaces.
 * regulationId is CAS-expanded via resolveCasRegulationIds (data may live
 * under the sibling regulation of the same code).
 *
 * Returns { pos, psos, can_edit }.
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
    // may READ every institution's PO/PSO sets (can_edit stays false below).
    const hasView = await hasBosPermission(user.id, 'academic.bos-courses.view');
    const canReadAllBos = isBosReadAllObserver(scope, hasView);
    const seeAll = scope.isSuperAdmin || canReadAllBos;

    // Service-role for the SELECT — CAS sibling rows may be hidden from the
    // caller's RLS context (same precedent as the taxonomy pos/psos routes).
    const db = createServiceRoleClient();
    const target = await resolvePoPsoTarget(db, requestedId);
    if (!target) return NextResponse.json({ data: { pos: [], psos: [], can_edit: false } });

    // Non-admin read guard: target must intersect the caller's CAS-expanded scope.
    if (!seeAll) {
      const allowed = await intersectBosScope(supabase, scope, target.ids);
      // Board membership can span institutions beyond the profile's home
      // institution — accept either scope source.
      const memberAllowed = target.ids.some((id) => scope.institutionsOf.has(id));
      if (allowed.length === 0 && !memberAllowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // CAS-aware: the set may live under the sibling regulation of the same code.
    const regIds = await resolveCasRegulationIds(db, regulationId);

    const [posRes, psosRes] = await Promise.all([
      db
        .from('bos_master_pos')
        .select('*')
        .in('institutions_id', target.ids)
        .in('regulation_id', regIds)
        .order('sort_order', { ascending: true }),
      db
        .from('bos_master_psos')
        .select('*')
        .in('institutions_id', target.ids)
        .in('regulation_id', regIds)
        .order('sort_order', { ascending: true }),
    ]);

    if (posRes.error) throw posRes.error;
    if (psosRes.error) throw psosRes.error;

    return NextResponse.json({
      data: {
        pos: (posRes.data ?? []) as BosMasterPo[],
        psos: (psosRes.data ?? []) as BosMasterPso[],
        can_edit: canWriteMasterOutcomes(scope, target.ids),
      },
    });
  } catch (error) {
    console.error('[GET /api/bos/po-pso/master]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/bos/po-pso/master
 *
 * Batch-replace the master PO and/or PSO set for an institution + regulation.
 * Body: {
 *   institutions_id: string,
 *   regulation_id: string,
 *   pos?:  Array<{ po_code: string; description?: string }>,
 *   psos?: Array<{ pso_code: string; description?: string }>,
 * }
 * Only the arrays present in the body are replaced, so the UI can save the
 * PO and PSO editors independently.
 *
 * Deletes span the full CAS sibling set (one canonical set per CAS pair);
 * inserts go under the canonical MyJKKN id.
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as {
      institutions_id?: string;
      regulation_id?: string;
      pos?: Array<{ po_code: string; description?: string }>;
      psos?: Array<{ pso_code: string; description?: string }>;
    };

    if (!body.institutions_id || !body.regulation_id) {
      return NextResponse.json(
        { error: 'institutions_id and regulation_id are required' },
        { status: 400 }
      );
    }
    if (body.pos === undefined && body.psos === undefined) {
      return NextResponse.json({ error: 'pos or psos array is required' }, { status: 400 });
    }
    if ((body.pos && !Array.isArray(body.pos)) || (body.psos && !Array.isArray(body.psos))) {
      return NextResponse.json({ error: 'pos/psos must be arrays' }, { status: 400 });
    }

    const scope = await resolveBosBoardScope(user.id);
    const db = createServiceRoleClient();
    const target = await resolvePoPsoTarget(db, body.institutions_id);
    if (!target) {
      return NextResponse.json({ error: 'Unknown institution' }, { status: 400 });
    }

    if (!canWriteMasterOutcomes(scope, target.ids)) {
      return NextResponse.json(
        { error: 'Only board members of this institution can update the master PO/PSO sets' },
        { status: 403 }
      );
    }

    // Deletes span the CAS sibling regulations so one canonical set exists
    // per (CAS pair, regulation code); inserts go under the passed regulation.
    const regIds = await resolveCasRegulationIds(db, body.regulation_id);

    const result: { pos?: BosMasterPo[]; psos?: BosMasterPso[] } = {};

    if (body.pos !== undefined) {
      const { error: delErr } = await db
        .from('bos_master_pos')
        .delete()
        .in('institutions_id', target.ids)
        .in('regulation_id', regIds);
      if (delErr) throw delErr;

      if (body.pos.length > 0) {
        const rows = body.pos.map((po, idx) => ({
          institutions_id: target.canonicalId,
          regulation_id: body.regulation_id,
          po_code: po.po_code.trim(),
          description: po.description?.trim() ?? null,
          sort_order: idx + 1,
          created_by: user.id,
          updated_by: user.id,
        }));
        const { data, error: insErr } = await db
          .from('bos_master_pos')
          .insert(rows)
          .select();
        if (insErr) throw insErr;
        result.pos = (data ?? []) as BosMasterPo[];
      } else {
        result.pos = [];
      }
    }

    if (body.psos !== undefined) {
      const { error: delErr } = await db
        .from('bos_master_psos')
        .delete()
        .in('institutions_id', target.ids)
        .in('regulation_id', regIds);
      if (delErr) throw delErr;

      if (body.psos.length > 0) {
        const rows = body.psos.map((pso, idx) => ({
          institutions_id: target.canonicalId,
          regulation_id: body.regulation_id,
          pso_code: pso.pso_code.trim(),
          description: pso.description?.trim() ?? null,
          sort_order: idx + 1,
          created_by: user.id,
          updated_by: user.id,
        }));
        const { data, error: insErr } = await db
          .from('bos_master_psos')
          .insert(rows)
          .select();
        if (insErr) throw insErr;
        result.psos = (data ?? []) as BosMasterPso[];
      } else {
        result.psos = [];
      }
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[PUT /api/bos/po-pso/master]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  resolveBosBoardScope,
  hasAnyBosPermission,
  BOS_LOOKUP_VIEW_KEYS,
} from '@/lib/utils/bos/bos-access';
import {
  canReadProgrammeOutcomes,
  canWriteProgrammeOutcomes,
  isPoPsoReadAll,
  resolveProgrammeOutcomeTarget,
  sanitizeLevels,
} from '@/lib/utils/bos/programme-outcomes';
import { loadCourseMappingRows } from '@/lib/utils/bos/po-pso-course-mappings';
import type { BosCourseOutcomeMapping } from '@/types/bos';

/**
 * /api/bos/po-pso/course-mappings — HOD course × PO/PSO matrix.
 *
 * GET ?institutionsId&regulationId&programmeCode
 *   → { courses: CourseMappingRow[], can_edit }
 *   Row assembly lives in lib/utils/bos/po-pso-course-mappings.ts (shared
 *   with the PO/PSO PDF export).
 *
 * PUT { institutions_id, regulation_id, programme_code,
 *       rows: [{ course_code, course_name?, course_id?, po_levels, pso_levels }] }
 *   → upserts explicit rows (never deletes).
 */

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sp = request.nextUrl.searchParams;
    const institutionsId = sp.get('institutionsId');
    const regulationId = sp.get('regulationId');
    const programmeCode = sp.get('programmeCode');
    if (!institutionsId || !regulationId || !programmeCode) {
      return NextResponse.json(
        { error: 'institutionsId, regulationId and programmeCode are required' },
        { status: 400 }
      );
    }

    const scope = await resolveBosBoardScope(user.id);
    const hasView = await hasAnyBosPermission(user.id, BOS_LOOKUP_VIEW_KEYS);
    const seeAll = isPoPsoReadAll(scope, hasView);

    const db = createServiceRoleClient();
    const target = await resolveProgrammeOutcomeTarget(
      db,
      { institutionsId, regulationId, programmeCode },
      { preferDepartmentIds: scope.hodDepartmentIds }
    );
    if (!target) return NextResponse.json({ data: { courses: [], can_edit: false } });

    if (!(await canReadProgrammeOutcomes(supabase, scope, target, seeAll))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [courses, canEdit] = await Promise.all([
      loadCourseMappingRows(db, target),
      canWriteProgrammeOutcomes(scope, user.id, target),
    ]);

    return NextResponse.json({ data: { courses, can_edit: canEdit } });
  } catch (error) {
    console.error('[GET /api/bos/po-pso/course-mappings]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as {
      institutions_id?: string; regulation_id?: string; programme_code?: string;
      rows?: Array<{
        course_code: string; course_name?: string | null; course_id?: string | null;
        po_levels?: Record<string, unknown>; pso_levels?: Record<string, unknown>;
      }>;
    };
    if (!body.institutions_id || !body.regulation_id || !body.programme_code) {
      return NextResponse.json(
        { error: 'institutions_id, regulation_id and programme_code are required' },
        { status: 400 }
      );
    }
    if (!Array.isArray(body.rows)) {
      return NextResponse.json({ error: 'rows array is required' }, { status: 400 });
    }

    const scope = await resolveBosBoardScope(user.id);
    const db = createServiceRoleClient();
    const target = await resolveProgrammeOutcomeTarget(
      db,
      {
        institutionsId: body.institutions_id,
        regulationId: body.regulation_id,
        programmeCode: body.programme_code,
      },
      { preferDepartmentIds: scope.hodDepartmentIds }
    );
    if (!target) return NextResponse.json({ error: 'Unknown institution' }, { status: 400 });

    if (!(await canWriteProgrammeOutcomes(scope, user.id, target))) {
      return NextResponse.json(
        { error: 'Only the HOD of this programme, the principal, or its board members can update the mapping' },
        { status: 403 }
      );
    }

    // Existing rows across the CAS sibling set — update in place (the unique
    // key includes institutions_id, so a sibling-owned row must not be
    // re-inserted under the canonical id).
    const { data: existing, error: exErr } = await db
      .from('bos_course_outcome_mappings')
      .select('id, course_code')
      .in('institutions_id', target.ids)
      .in('regulation_id', target.regIds)
      .eq('programme_code', target.programmeCode);
    if (exErr) throw exErr;
    const existingByCode = new Map<string, string>();
    for (const r of (existing ?? []) as { id: string; course_code: string }[]) {
      existingByCode.set(r.course_code.toUpperCase(), r.id);
    }

    const saved: BosCourseOutcomeMapping[] = [];
    const inserts: Record<string, unknown>[] = [];
    for (const row of body.rows) {
      const code = (row.course_code ?? '').trim();
      if (!code) continue;
      const patch = {
        course_name: row.course_name?.trim() || null,
        course_id: row.course_id ?? null,
        po_levels: sanitizeLevels(row.po_levels),
        pso_levels: sanitizeLevels(row.pso_levels),
        is_active: true,
        updated_by: user.id,
      };
      const id = existingByCode.get(code.toUpperCase());
      if (id) {
        const { data, error } = await db
          .from('bos_course_outcome_mappings')
          .update(patch)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        saved.push(data as BosCourseOutcomeMapping);
      } else {
        inserts.push({
          institutions_id: target.canonicalId,
          regulation_id: target.regulationId,
          programme_code: target.programmeCode,
          programme_id: target.programme?.id ?? null,
          department_id: target.programme?.department_id ?? null,
          course_code: code,
          created_by: user.id,
          ...patch,
        });
      }
    }
    if (inserts.length > 0) {
      const { data, error } = await db.from('bos_course_outcome_mappings').insert(inserts).select();
      if (error) throw error;
      saved.push(...((data ?? []) as BosCourseOutcomeMapping[]));
    }

    return NextResponse.json({ data: saved });
  } catch (error) {
    console.error('[PUT /api/bos/po-pso/course-mappings]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

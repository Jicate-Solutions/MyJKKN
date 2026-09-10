import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  resolveBosBoardScope,
  hasAnyBosPermission,
  isBosReadAllObserver,
  BOS_LOOKUP_VIEW_KEYS,
} from '@/lib/utils/bos/bos-access';
import { fetchCoeBoardMaps } from '@/lib/utils/bos/coe-boards';
import {
  canReadProgrammeOutcomes,
  canWriteProgrammeOutcomes,
  deriveCourseLevels,
  resolveProgrammeOutcomeTarget,
  sanitizeLevels,
  type CorrelationLevel,
  type ProgrammeOutcomeTarget,
} from '@/lib/utils/bos/programme-outcomes';
import type { BosCourseOutcomeMapping } from '@/types/bos';

/**
 * /api/bos/po-pso/course-mappings — HOD course × PO/PSO matrix.
 *
 * GET ?institutionsId&regulationId&programmeCode
 *   → { courses: CourseMappingRow[], can_edit }
 *   Courses = union of (a) the programme's latest syllabi (boards governing
 *   the programme via bos_board_programmes, plus the board whose board_code
 *   equals the programme code — the engineering convention) and (b) explicit
 *   rows in bos_course_outcome_mappings. A course without an explicit row
 *   carries levels DERIVED from its syllabus CO-PO matrix (source='syllabus').
 *
 * PUT { institutions_id, regulation_id, programme_code,
 *       rows: [{ course_code, course_name?, course_id?, po_levels, pso_levels }] }
 *   → upserts explicit rows (never deletes).
 */

export interface CourseMappingRow {
  course_code: string;
  course_name: string;
  course_id: string | null;
  semester: number | null;
  syllabus_id: string | null;
  mapping_id: string | null;
  source: 'explicit' | 'syllabus' | 'none';
  po_levels: Record<string, CorrelationLevel>;
  pso_levels: Record<string, CorrelationLevel>;
}

async function boardIdsForProgramme(
  db: ReturnType<typeof createServiceRoleClient>,
  target: ProgrammeOutcomeTarget
): Promise<string[]> {
  const ids = new Set<string>();
  const { data } = await db
    .from('bos_board_programmes')
    .select('board_id')
    .in('institutions_id', target.ids)
    .eq('programme_code', target.programmeCode)
    .eq('is_active', true);
  for (const r of (data ?? []) as { board_id: string }[]) ids.add(r.board_id);

  // Engineering convention: the board's code IS the programme code.
  const boards = await fetchCoeBoardMaps(target.ids);
  for (const [id, b] of boards) {
    if ((b.board_code ?? '').toUpperCase() === target.programmeCode) ids.add(id);
  }
  return [...ids];
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
    if (!institutionsId || !regulationId || !programmeCode) {
      return NextResponse.json(
        { error: 'institutionsId, regulationId and programmeCode are required' },
        { status: 400 }
      );
    }

    const scope = await resolveBosBoardScope(user.id);
    const hasView = await hasAnyBosPermission(user.id, BOS_LOOKUP_VIEW_KEYS);
    const seeAll = scope.isSuperAdmin || isBosReadAllObserver(scope, hasView);

    const db = createServiceRoleClient();
    const target = await resolveProgrammeOutcomeTarget(db, { institutionsId, regulationId, programmeCode });
    if (!target) return NextResponse.json({ data: { courses: [], can_edit: false } });

    if (!(await canReadProgrammeOutcomes(supabase, scope, target, seeAll))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const boardIds = await boardIdsForProgramme(db, target);

    const [syllabiRes, explicitRes, canEdit] = await Promise.all([
      boardIds.length > 0
        ? db
            .from('bos_course_syllabi')
            .select('id, course_id, course_code, course_name, semester, po_mappings, created_at')
            .in('institutions_id', target.ids)
            .in('board_id', boardIds)
            .in('regulation_id', target.regIds)
            .eq('is_latest', true)
            .eq('is_archived', false)
            .order('semester', { ascending: true, nullsFirst: false })
            .order('course_code', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      db
        .from('bos_course_outcome_mappings')
        .select('*')
        .in('institutions_id', target.ids)
        .in('regulation_id', target.regIds)
        .eq('programme_code', target.programmeCode)
        .eq('is_active', true),
      canWriteProgrammeOutcomes(scope, user.id, target),
    ]);
    if (syllabiRes.error) throw syllabiRes.error;
    if (explicitRes.error) throw explicitRes.error;

    const explicitByCode = new Map<string, BosCourseOutcomeMapping>();
    for (const m of (explicitRes.data ?? []) as BosCourseOutcomeMapping[]) {
      explicitByCode.set(m.course_code.toUpperCase(), m);
    }

    const rows = new Map<string, CourseMappingRow>();
    type SyllabusLite = {
      id: string; course_id: string | null; course_code: string; course_name: string;
      semester: number | null; po_mappings: unknown;
    };
    for (const s of (syllabiRes.data ?? []) as SyllabusLite[]) {
      const key = s.course_code.toUpperCase();
      if (rows.has(key)) continue; // first (lowest semester) wins
      const explicit = explicitByCode.get(key);
      const derived = deriveCourseLevels(s.po_mappings as never);
      rows.set(key, {
        course_code: s.course_code,
        course_name: explicit?.course_name || s.course_name,
        course_id: s.course_id ?? explicit?.course_id ?? null,
        semester: s.semester,
        syllabus_id: s.id,
        mapping_id: explicit?.id ?? null,
        source: explicit ? 'explicit' : (Object.keys(derived.po).length + Object.keys(derived.pso).length > 0 ? 'syllabus' : 'none'),
        po_levels: explicit ? sanitizeLevels(explicit.po_levels) : derived.po,
        pso_levels: explicit ? sanitizeLevels(explicit.pso_levels) : derived.pso,
      });
    }
    // Explicit rows for courses that have no syllabus (yet).
    for (const [key, m] of explicitByCode) {
      if (rows.has(key)) continue;
      rows.set(key, {
        course_code: m.course_code,
        course_name: m.course_name ?? '',
        course_id: m.course_id ?? null,
        semester: null,
        syllabus_id: null,
        mapping_id: m.id,
        source: 'explicit',
        po_levels: sanitizeLevels(m.po_levels),
        pso_levels: sanitizeLevels(m.pso_levels),
      });
    }

    return NextResponse.json({ data: { courses: [...rows.values()], can_edit: canEdit } });
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
    const target = await resolveProgrammeOutcomeTarget(db, {
      institutionsId: body.institutions_id,
      regulationId: body.regulation_id,
      programmeCode: body.programme_code,
    });
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

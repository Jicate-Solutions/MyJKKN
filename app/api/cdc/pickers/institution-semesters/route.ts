export const dynamic = 'force-dynamic';

/**
 * GET /api/cdc/pickers/institution-semesters?institution_ids=<uuid>,<uuid>
 *
 * Option source for the drive form's per-institution semester picker. Returns,
 * for each requested institution, the distinct semester ORDERS that exist in
 * its `semesters` master (with a display label), so the CDC admin picks real
 * semesters ("Semester 5") rather than typing numbers.
 *
 * WHY service-role: same RLS gap as /api/cdc/pickers/semesters — a CDC
 * coordinator holds cdc.* but not organization/academic perms, so the RLS
 * client returns 0 semester rows.
 *
 * WHY NO institution-scope filter here (unlike the other CDC pickers): a
 * campus drive is multi-college by design and the institution list the admin
 * picks from is already visible to every signed-in user (institutions_select
 * RLS). This route returns only semester ORDER numbers + labels — no learner
 * or staff data — so narrowing it to the caller's own college would just make
 * the picker silently empty for the other colleges on the drive.
 * Gate: cdc.drives.create OR cdc.drives.edit (the callers of this picker).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export interface InstitutionSemesterOption {
  order: number;
  label: string;
  /** Number of program-level semester rows collapsed into this order. */
  programs: number;
}

/**
 * One degree type's semester range within an institution ("UG → 1–8",
 * "PG → 1–4"), read from the same `semesters` master. All degrees of the same
 * degrees.degree_type are merged into one group.
 */
export interface InstitutionDegreeSemesters {
  /** Upper-cased degree_type ("UG", "PG"), or the degree name when untyped. */
  key: string;
  label: string;
  /** Upper-cased degrees.degree_type (null when not set). */
  degree_type: string | null;
  /** Programs whose semester rows fall under this degree. */
  program_ids: string[];
  orders: number[];
}

export interface InstitutionSemestersResponse {
  institutions: Record<string, InstitutionSemesterOption[]>;
  /** Degree-wise semester groups per institution. */
  degrees: Record<string, InstitutionDegreeSemesters[]>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await createClient();
  const {
    data: { user },
    error: authError,
  } = await session.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const [{ data: canCreate }, { data: canEdit }] = await Promise.all([
    session.rpc('user_has_permission', { permission_name: 'cdc.drives.create' }),
    session.rpc('user_has_permission', { permission_name: 'cdc.drives.edit' }),
  ]);
  if (canCreate !== true && canEdit !== true) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ids = (request.nextUrl.searchParams.get('institution_ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s))
    .slice(0, 50);
  if (ids.length === 0) {
    return NextResponse.json({ institutions: {}, degrees: {} } satisfies InstitutionSemestersResponse);
  }

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('semesters')
      .select('institution_id, degree_id, program_id, semester_order, semester_name')
      .in('institution_id', ids)
      .eq('is_active', true)
      .not('semester_order', 'is', null)
      .limit(5000);
    if (error) {
      console.error('[cdc/pickers/institution-semesters] query failed:', error.message);
      return NextResponse.json({ error: 'Failed to load semesters' }, { status: 500 });
    }

    const rows = (data ?? []) as Array<{
      institution_id: string;
      degree_id: string | null;
      program_id: string | null;
      semester_order: number | null;
      semester_name: string | null;
    }>;

    const degreeIds = Array.from(new Set(rows.map((r) => r.degree_id).filter((d): d is string => !!d)));
    const degreeMeta = new Map<string, { label: string; type: string | null; order: number }>();
    if (degreeIds.length > 0) {
      const { data: degs, error: degErr } = await supabase
        .from('degrees')
        .select('id, degree_name, display_name, degree_type, degree_order')
        .in('id', degreeIds);
      if (degErr) {
        console.error('[cdc/pickers/institution-semesters] degrees query failed:', degErr.message);
      }
      for (const d of (degs ?? []) as Array<{ id: string; degree_name: string | null; display_name: string | null; degree_type: string | null; degree_order: number | null }>) {
        degreeMeta.set(d.id, {
          label: (d.display_name || d.degree_name || '').trim() || 'Other',
          type: d.degree_type?.trim() || null,
          order: d.degree_order ?? 9999,
        });
      }
    }

    // institution -> degree TYPE (UG / PG …) -> group. Grouping by type, not by
    // degree name, puts B.E. + B.Tech in one "UG" block and M.E. + MBA in "PG".
    // A degree with no type falls back to its own name.
    const TYPE_LABEL: Record<string, string> = { UG: 'Undergraduate (UG)', PG: 'Postgraduate (PG)' };
    const degByInst = new Map<string, Map<string, { label: string; type: string | null; sort: number; programs: Set<string>; orders: Set<number> }>>();
    for (const row of rows) {
      if (row.semester_order == null) continue;
      const meta = row.degree_id ? degreeMeta.get(row.degree_id) : undefined;
      const type = meta?.type ? meta.type.toUpperCase() : null;
      const key = type ?? (meta?.label ?? 'Other').toUpperCase();
      const label = type ? TYPE_LABEL[type] ?? type : meta?.label ?? 'Other';
      const inst = degByInst.get(row.institution_id) ?? new Map();
      const g = inst.get(key) ?? { label, type, sort: meta?.order ?? 9999, programs: new Set<string>(), orders: new Set<number>() };
      g.sort = Math.min(g.sort, meta?.order ?? 9999);
      if (row.program_id) g.programs.add(row.program_id);
      g.orders.add(row.semester_order);
      inst.set(key, g);
      degByInst.set(row.institution_id, inst);
    }

    const byInst = new Map<string, Map<number, { label: string; programs: number }>>();
    for (const row of rows) {
      if (row.semester_order == null) continue;
      const inst = byInst.get(row.institution_id) ?? new Map();
      const existing = inst.get(row.semester_order);
      const cleaned = (row.semester_name ?? '').trim();
      if (existing) {
        existing.programs += 1;
      } else {
        inst.set(row.semester_order, {
          label: cleaned || `Semester ${row.semester_order}`,
          programs: 1,
        });
      }
      byInst.set(row.institution_id, inst);
    }

    const institutions: Record<string, InstitutionSemesterOption[]> = {};
    for (const id of ids) {
      const inst = byInst.get(id);
      institutions[id] = inst
        ? Array.from(inst.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([order, v]) => ({
              order,
              // Labels differ across programs ("Semester 5", "5 Year"); the
              // order number is the stable identity, so show it prominently.
              label: /^\s*semester\s*\d+\s*$/i.test(v.label) ? `Semester ${order}` : `Semester ${order} · ${v.label}`,
              programs: v.programs,
            }))
        : [];
    }

    // UG before PG, then degree_order, then name.
    const typeRank = (t: string | null) => (t?.toUpperCase() === 'UG' ? 0 : t?.toUpperCase() === 'PG' ? 1 : 2);
    const degrees: Record<string, InstitutionDegreeSemesters[]> = {};
    for (const id of ids) {
      const inst = degByInst.get(id);
      degrees[id] = inst
        ? Array.from(inst.entries())
            .sort(([, a], [, b]) => typeRank(a.type) - typeRank(b.type) || a.sort - b.sort || a.label.localeCompare(b.label))
            .map(([key, g]) => ({
              key,
              label: g.label,
              degree_type: g.type,
              program_ids: Array.from(g.programs),
              orders: Array.from(g.orders).sort((a, b) => a - b),
            }))
        : [];
    }

    return NextResponse.json(
      { institutions, degrees } satisfies InstitutionSemestersResponse,
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[cdc/pickers/institution-semesters] error:', err);
    return NextResponse.json({ error: 'Failed to load semesters' }, { status: 500 });
  }
}

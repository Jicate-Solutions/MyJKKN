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

export interface InstitutionSemestersResponse {
  institutions: Record<string, InstitutionSemesterOption[]>;
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
    return NextResponse.json({ institutions: {} } satisfies InstitutionSemestersResponse);
  }

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('semesters')
      .select('institution_id, semester_order, semester_name')
      .in('institution_id', ids)
      .eq('is_active', true)
      .not('semester_order', 'is', null)
      .limit(5000);
    if (error) {
      console.error('[cdc/pickers/institution-semesters] query failed:', error.message);
      return NextResponse.json({ error: 'Failed to load semesters' }, { status: 500 });
    }

    const byInst = new Map<string, Map<number, { label: string; programs: number }>>();
    for (const row of (data ?? []) as Array<{ institution_id: string; semester_order: number | null; semester_name: string | null }>) {
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

    return NextResponse.json(
      { institutions } satisfies InstitutionSemestersResponse,
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[cdc/pickers/institution-semesters] error:', err);
    return NextResponse.json({ error: 'Failed to load semesters' }, { status: 500 });
  }
}

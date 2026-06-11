/**
 * PDE Curriculum Connector — VAC course picker feed.
 * ============================================================================
 *
 * GET /api/pde/curriculum/vac-courses
 *
 * Returns active vac_courses for the CALLER's institution — the VAC lane of
 * the dual-lane demonstration picker. Course-level only: vac_courses has no
 * CLO structure (spec edge disposition), so no CLO checklist on this lane.
 * Own-institution scoping is enforced by fn_pde_list_vac_courses (SECURITY
 * DEFINER — plain vac_courses RLS requires a user_institution_access row,
 * which ordinary learners don't have).
 */

export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listVacCourses } from '@/lib/services/pde-curriculum-service';

export async function GET() {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await listVacCourses();
    return NextResponse.json({ data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

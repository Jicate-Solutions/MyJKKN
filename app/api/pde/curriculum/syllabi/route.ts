/**
 * PDE Curriculum Connector — BoS syllabus picker feed.
 * ============================================================================
 *
 * GET /api/pde/curriculum/syllabi
 *
 * Returns approved BoS syllabi (is_latest AND NOT is_archived) for the
 * CALLER's institution — the BoS lane of the dual-lane demonstration picker.
 * The Director-locked "own institution only" scope (spec §4.9) is enforced at
 * the DB layer by fn_pde_list_approved_syllabi (SECURITY DEFINER — plain RLS
 * on bos_course_syllabi requires BoS board membership, which learners never
 * have). Accounts with no institution (platform-level) get an empty lane.
 *
 * Response: { data: BosSyllabusOption[], clo_tag_cap: number }
 * clo_tag_cap rides along so the form needs no second policy round-trip.
 */

export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCloTagCap, listApprovedSyllabi } from '@/lib/services/pde-curriculum-service';

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

    const [data, cap] = await Promise.all([listApprovedSyllabi(), getCloTagCap()]);
    return NextResponse.json({ data, clo_tag_cap: cap });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

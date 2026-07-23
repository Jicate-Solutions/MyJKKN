/**
 * PDE Curriculum Connector — CLO/PO attainment from validated evidence.
 * ============================================================================
 *
 * GET /api/pde/curriculum/attainment[?institution_id=<uuid>]
 *   → full picture: per-syllabus-version CLO sections + weighted PO/PSO
 *     roll-up (CurriculumAttainmentResult).
 *
 * GET /api/pde/curriculum/attainment?syllabus_id=<uuid>
 *   → single syllabus version (SyllabusAttainment).
 *
 * Math: spec §7. Denominator = participating learners (learners with ≥1
 * non-draft, non-withdrawn demonstration on the syllabus) — UIs must label
 * percentages "of participating learners". Attainment reads
 * clo_refs_confirmed only (validator-confirmed; accreditor-defensible).
 *
 * Auth mirrors /api/pde/accreditation-evidence/[body]: authenticated; RLS on
 * pde_demonstrations narrows non-admin callers to their institution.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  computeCLOAttainment,
  computePOAttainment,
} from '@/lib/services/pde-curriculum-service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const syllabusId = request.nextUrl.searchParams.get('syllabus_id');
    if (syllabusId) {
      if (!UUID_RE.test(syllabusId)) {
        return NextResponse.json({ error: 'syllabus_id must be a uuid' }, { status: 400 });
      }
      const data = await computeCLOAttainment(syllabusId);
      if (!data) {
        return NextResponse.json({ error: 'Syllabus not found' }, { status: 404 });
      }
      return NextResponse.json({ data });
    }

    const institutionId = request.nextUrl.searchParams.get('institution_id');
    if (institutionId && !UUID_RE.test(institutionId)) {
      return NextResponse.json({ error: 'institution_id must be a uuid' }, { status: 400 });
    }

    const data = await computePOAttainment(institutionId);
    return NextResponse.json({ data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

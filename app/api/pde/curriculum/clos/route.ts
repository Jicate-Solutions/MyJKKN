/**
 * PDE Curriculum Connector — CLO checklist feed.
 * ============================================================================
 *
 * GET /api/pde/curriculum/clos?syllabus_id=<uuid>
 *
 * Returns the parsed CLO list for one BoS syllabus version
 * (course_learning_outcomes.clos[] — shape probed live 2026-06-11) plus the
 * clo_tag_cap so the checklist can cap selections without a second call.
 * RLS on bos_course_syllabi governs visibility.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCloTagCap, getSyllabusCLOs } from '@/lib/services/pde-curriculum-service';

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
    if (!syllabusId || !UUID_RE.test(syllabusId)) {
      return NextResponse.json({ error: 'syllabus_id (uuid) is required' }, { status: 400 });
    }

    const [result, cap] = await Promise.all([
      getSyllabusCLOs(syllabusId),
      getCloTagCap(),
    ]);
    if (!result) {
      return NextResponse.json({ error: 'Syllabus not found' }, { status: 404 });
    }

    return NextResponse.json({ data: result, clo_tag_cap: cap });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

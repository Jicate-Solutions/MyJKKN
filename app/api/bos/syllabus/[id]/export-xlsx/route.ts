import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess, readableInstitutionIds } from '@/lib/utils/bos/bos-access';
import { buildSyllabusWorkbook } from '@/lib/utils/bos/syllabus-xlsx';
import type { BosCourseSyllabus } from '@/types/bos';

<<<<<<< Updated upstream
export const runtime = 'nodejs';

/**
 * GET /api/bos/syllabus/[id]/export-xlsx — stream a single syllabus as a
 * multi-sheet XLSX file matching the import template.
 */
=======
/**
 * GET /api/bos/syllabus/[id]/export-xlsx
 *
 * Fetch a single syllabus and stream it as a multi-sheet XLSX file matching
 * the import template. Round-trip safe: download → edit → re-import.
 */
export const runtime = 'nodejs';

>>>>>>> Stashed changes
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
<<<<<<< Updated upstream
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
=======
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
>>>>>>> Stashed changes

    const { id } = await params;
    if (!id || typeof id !== 'string' || id.includes('undefined')) {
      return NextResponse.json({ error: 'Invalid syllabus ID' }, { status: 400 });
    }

    const scope = await resolveBosAccess(user.id);

    let query = supabase.from('bos_course_syllabi').select('*').eq('id', id);

    // CAS-aware filter — see syllabus/[id]/route.ts for rationale.
    const allowedIds = readableInstitutionIds(scope);
    if (allowedIds !== null) {
      if (allowedIds.length === 0) {
        return NextResponse.json({ error: 'Syllabus not found' }, { status: 404 });
      }
      query = allowedIds.length === 1
        ? query.eq('institutions_id', allowedIds[0])
        : query.in('institutions_id', allowedIds);
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? 'Syllabus not found' },
        { status: 404 },
      );
    }

    const syllabus = data as BosCourseSyllabus;
    const buffer = await buildSyllabusWorkbook(syllabus);

<<<<<<< Updated upstream
=======
    // Filename: courseCode-courseName.xlsx (filesystem-safe)
>>>>>>> Stashed changes
    const safe = `${syllabus.course_code ?? 'syllabus'}-${(syllabus.course_name ?? '').slice(0, 40)}`
      .replace(/[^a-zA-Z0-9\-_]+/g, '_')
      .replace(/^_+|_+$/g, '');

    return new NextResponse(buffer, {
      status: 200,
      headers: {
<<<<<<< Updated upstream
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
=======
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
>>>>>>> Stashed changes
        'Content-Disposition': `attachment; filename="${safe || 'syllabus'}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('XLSX export error:', error);
<<<<<<< Updated upstream
    return NextResponse.json({ error: 'Failed to export syllabus' }, { status: 500 });
=======
    return NextResponse.json(
      { error: 'Failed to export syllabus' },
      { status: 500 },
    );
>>>>>>> Stashed changes
  }
}

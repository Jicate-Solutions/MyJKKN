import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess, applyInstitutionScope } from '@/lib/utils/bos/bos-access';
import { BosCourseSyllabus, BosSyllabusHistory } from '@/types/bos';

/**
 * GET /api/bos/syllabi/history/[code]
 *
 * Fetch full version history of a course by course code.
 * Returns: current version, previous version, and all versions.
 *
 * Query parameters:
 * - institutionsId (override for super admin)
 * - regulationId (filter by specific regulation)
 *
 * Response:
 * {
 *   current: BosCourseSyllabus,
 *   previous?: BosCourseSyllabus,
 *   allVersions: BosCourseSyllabus[]
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    // Step 1: Authenticate user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Step 2: Resolve institution scope
    const scope = await resolveBosAccess(user.id);

    // Step 3: Parse query parameters
    const { searchParams } = new URL(request.url);
    const institutionsId = searchParams.get('institutionsId') || undefined;
    const regulationId = searchParams.get('regulationId') || undefined;

    // Step 4: Apply institution scope
    const scopedInstitutionsId = applyInstitutionScope(scope, institutionsId);

    if (!scopedInstitutionsId) {
      return NextResponse.json(
        { error: 'Unable to determine institution scope' },
        { status: 403 }
      );
    }

    // Step 5: Build query for all versions of this course code
    let query = supabase
      .from('bos_course_syllabi')
      .select('*')
      .eq('institutions_id', scopedInstitutionsId)
      .eq('course_code', params.code)
      .order('version_number', { ascending: false });

    if (regulationId) {
      query = query.eq('regulation_id', regulationId);
    }

    // Step 6: Execute query
    const { data: allVersions, error } = await query;

    if (error) {
      console.error('[GET /api/bos/syllabi/history/[code]] Query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch history' },
        { status: 500 }
      );
    }

    if (!allVersions || allVersions.length === 0) {
      return NextResponse.json(
        { error: 'No versions found for the specified course code' },
        { status: 404 }
      );
    }

    // Step 7: Find current (latest) and previous versions
    const current = allVersions.find(v => v.is_latest === true) as BosCourseSyllabus | undefined;
    const previous = allVersions.find((v, idx) => idx > 0 && v.is_latest === false) as BosCourseSyllabus | undefined;

    if (!current) {
      return NextResponse.json(
        { error: 'No current version found' },
        { status: 404 }
      );
    }

    // Step 8: Format response
    const response: BosSyllabusHistory = {
      current,
      previous: previous || null,
      allVersions: allVersions as BosCourseSyllabus[],
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[GET /api/bos/syllabi/history/[code]] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

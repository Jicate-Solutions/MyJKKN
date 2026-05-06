import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess, applyInstitutionScope } from '@/lib/utils/bos/bos-access';

/**
 * POST /api/bos/syllabi/compare
 *
 * Compare two versions of a syllabus.
 * Returns: diff summary and list of changed fields.
 *
 * Body:
 * {
 *   syllabus_id_1: UUID,
 *   syllabus_id_2: UUID
 * }
 *
 * Response:
 * {
 *   changed_fields: string[],
 *   diff_summary: string,
 *   syllabus_1: BosCourseSyllabus,
 *   syllabus_2: BosCourseSyllabus
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Step 1: Authenticate user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Step 2: Resolve institution scope
    const scope = await resolveBosAccess(user.id);

    // Step 3: Parse request body
    const body = await request.json() as {
      syllabus_id_1: string;
      syllabus_id_2: string;
    };

    if (!body.syllabus_id_1 || !body.syllabus_id_2) {
      return NextResponse.json(
        { error: 'Missing required fields: syllabus_id_1, syllabus_id_2' },
        { status: 400 }
      );
    }

    // Step 4: Fetch both syllabi
    let query1 = supabase
      .from('bos_course_syllabi')
      .select('*')
      .eq('id', body.syllabus_id_1);

    if (!scope.isSuperAdmin) {
      query1 = query1.eq('institutions_id', scope.institutionId);
    }

    let query2 = supabase
      .from('bos_course_syllabi')
      .select('*')
      .eq('id', body.syllabus_id_2);

    if (!scope.isSuperAdmin) {
      query2 = query2.eq('institutions_id', scope.institutionId);
    }

    const [{ data: syllabus1, error: error1 }, { data: syllabus2, error: error2 }] = await Promise.all([
      query1.maybeSingle(),
      query2.maybeSingle(),
    ]);

    if (error1 || error2) {
      console.error('[POST /api/bos/syllabi/compare] Fetch error:', error1 || error2);
      return NextResponse.json(
        { error: 'Failed to fetch syllabi for comparison' },
        { status: 500 }
      );
    }

    if (!syllabus1 || !syllabus2) {
      return NextResponse.json(
        { error: 'One or both syllabi not found' },
        { status: 404 }
      );
    }

    // Step 5: Compare syllabi
    const changedFields: string[] = [];
    const fieldComparisons: Record<string, { before: unknown; after: unknown }> = {};

    const comparableFields = [
      'course_name',
      'course_credits',
      'stream',
      'course_objectives',
      'course_learning_outcomes',
      'course_content',
      'textbooks',
      'web_resources',
      'pedagogy',
      'po_mappings',
      'notes',
    ];

    for (const field of comparableFields) {
      const val1 = (syllabus1 as Record<string, unknown>)[field];
      const val2 = (syllabus2 as Record<string, unknown>)[field];

      // Deep comparison for JSON fields
      const isEqual = JSON.stringify(val1) === JSON.stringify(val2);

      if (!isEqual) {
        changedFields.push(field);
        fieldComparisons[field] = { before: val1, after: val2 };
      }
    }

    // Step 6: Generate diff summary
    let diffSummary = '';
    if (changedFields.length === 0) {
      diffSummary = 'No changes found between these two versions.';
    } else {
      diffSummary = `${changedFields.length} field(s) changed:\n${changedFields.join(', ')}`;
    }

    // Step 7: Format response
    const response = {
      changed_fields: changedFields,
      diff_summary: diffSummary,
      changes: fieldComparisons,
      syllabus_1: syllabus1,
      syllabus_2: syllabus2,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[POST /api/bos/syllabi/compare] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

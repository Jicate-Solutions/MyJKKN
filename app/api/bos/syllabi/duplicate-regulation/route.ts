import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess, guardInstitutionWrite } from '@/lib/utils/bos/bos-access';
import { BosCourseSyllabus, BosSyllabusDuplicateRequest } from '@/types/bos';

/**
 * POST /api/bos/syllabi/duplicate-regulation
 *
 * Duplicate multiple courses from one regulation to another.
 * Scenario: R-2024 courses (24UGTA01-04) → R-2025 courses (25UGTA01-04)
 *
 * Body:
 * {
 *   institutions_id: UUID,
 *   source_regulation_id: UUID,
 *   target_regulation_id: UUID,
 *   courses: [
 *     { source_course_code: "24UGTA01", target_course_code: "25UGTA01" },
 *     { source_course_code: "24UGTA02", target_course_code: "25UGTA02" }
 *   ]
 * }
 *
 * Returns: Array of newly created syllabi
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
    const body = (await request.json()) as BosSyllabusDuplicateRequest;

    // Step 4: Validate required fields
    if (!body.institutions_id || !body.source_regulation_id || !body.target_regulation_id || !body.courses || body.courses.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: institutions_id, source_regulation_id, target_regulation_id, courses' },
        { status: 400 }
      );
    }

    // Step 5: Guard institution write
    const writeError = guardInstitutionWrite(scope, body.institutions_id);
    if (writeError) {
      return NextResponse.json({ error: writeError }, { status: 403 });
    }

    // Step 6: Fetch all source syllabi
    const { data: sourceSyllabi, error: fetchError } = await supabase
      .from('bos_course_syllabi')
      .select('*')
      .eq('institutions_id', body.institutions_id)
      .eq('regulation_id', body.source_regulation_id)
      .eq('is_latest', true)
      .in('course_code', body.courses.map(c => c.source_course_code));

    if (fetchError) {
      console.error('[POST /api/bos/syllabi/duplicate-regulation] Fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch source syllabi' },
        { status: 500 }
      );
    }

    if (!sourceSyllabi || sourceSyllabi.length === 0) {
      return NextResponse.json(
        { error: 'No source syllabi found for the specified courses' },
        { status: 404 }
      );
    }

    // Step 7: Create mapping from source course code to target course code
    const courseCodeMap = new Map(
      body.courses.map(c => [c.source_course_code, c.target_course_code])
    );

    // Step 8: Prepare new syllabi for insertion
    const newSyllabi = sourceSyllabi.map(source => ({
      institutions_id: body.institutions_id,
      board_id: source.board_id,
      regulation_id: body.target_regulation_id,
      course_code: courseCodeMap.get(source.course_code) || source.course_code,
      course_name: source.course_name,
      course_credits: source.course_credits,
      stream: source.stream,
      version_number: 1, // Reset to v1 for new regulation
      is_latest: true,
      is_archived: false,
      revised_from_syllabus_id: null,
      course_objectives: source.course_objectives,
      course_learning_outcomes: source.course_learning_outcomes,
      course_content: source.course_content,
      textbooks: source.textbooks,
      web_resources: source.web_resources,
      pedagogy: source.pedagogy,
      po_mappings: source.po_mappings,
      notes: source.notes,
      created_by: user.id,
    }));

    // Step 9: Insert new syllabi
    const { data: inserted, error: insertError } = await supabase
      .from('bos_course_syllabi')
      .insert(newSyllabi)
      .select();

    if (insertError) {
      console.error('[POST /api/bos/syllabi/duplicate-regulation] Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to duplicate courses' },
        { status: 500 }
      );
    }

    return NextResponse.json(inserted as BosCourseSyllabus[], { status: 201 });
  } catch (error) {
    console.error('[POST /api/bos/syllabi/duplicate-regulation] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess, guardInstitutionWrite } from '@/lib/utils/bos/bos-access';
import { BosCourseSyllabus } from '@/types/bos';

/**
 * POST /api/bos/syllabi/[id]/revise
 *
 * Create a new revision of an existing course within the same regulation.
 * Scenario: 24UGTA01 (v1) → 24UGTA01 (v2)
 *
 * This endpoint:
 * 1. Marks the old version as is_latest=false
 * 2. Creates a new version with version_number incremented
 * 3. Sets revised_from_syllabus_id to track lineage
 * 4. Returns the newly created revision
 *
 * Body:
 * {
 *   updated_content: {
 *     course_name?: string,
 *     course_credits?: number,
 *     course_objectives?: JSONB,
 *     course_learning_outcomes?: JSONB,
 *     course_content?: JSONB,
 *     textbooks?: JSONB,
 *     web_resources?: JSONB,
 *     pedagogy?: JSONB,
 *     po_mappings?: JSONB,
 *     notes?: string
 *   },
 *   revision_notes?: string (e.g., "Updated per board feedback")
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    // Step 3: Parse request body
    const body = await request.json() as {
      updated_content: Record<string, unknown>;
      revision_notes?: string;
    };

    // Step 4: Fetch current syllabus
    const { data: currentSyllabus, error: fetchError } = await supabase
      .from('bos_course_syllabi')
      .select('*')
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) {
      console.error('[POST /api/bos/syllabi/[id]/revise] Fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch syllabus' },
        { status: 500 }
      );
    }

    if (!currentSyllabus) {
      return NextResponse.json(
        { error: 'Syllabus not found' },
        { status: 404 }
      );
    }

    // Step 5: Guard institution write
    const writeError = guardInstitutionWrite(scope, currentSyllabus.institutions_id);
    if (writeError) {
      return NextResponse.json({ error: writeError }, { status: 403 });
    }

    // Step 6: Check if this is already a non-latest version
    if (!currentSyllabus.is_latest) {
      return NextResponse.json(
        { error: 'Cannot revise a non-latest version. Please revise the current latest version.' },
        { status: 409 }
      );
    }

    // Step 7: Update old version to mark as non-latest
    const { error: updateOldError } = await supabase
      .from('bos_course_syllabi')
      .update({
        is_latest: false,
        last_modified_by: user.id,
        last_modified_at: new Date().toISOString(),
      })
      .eq('id', params.id);

    if (updateOldError) {
      console.error('[POST /api/bos/syllabi/[id]/revise] Update old error:', updateOldError);
      return NextResponse.json(
        { error: 'Failed to update previous version' },
        { status: 500 }
      );
    }

    // Step 8: Create new revision
    const newVersion = {
      institutions_id: currentSyllabus.institutions_id,
      board_id: currentSyllabus.board_id,
      regulation_id: currentSyllabus.regulation_id,
      course_code: currentSyllabus.course_code,
      course_name: body.updated_content.course_name ?? currentSyllabus.course_name,
      course_credits: body.updated_content.course_credits ?? currentSyllabus.course_credits,
      stream: currentSyllabus.stream,
      version_number: (currentSyllabus.version_number || 1) + 1,
      is_latest: true,
      is_archived: false,
      revised_from_syllabus_id: currentSyllabus.id,
      course_objectives: body.updated_content.course_objectives ?? currentSyllabus.course_objectives,
      course_learning_outcomes: body.updated_content.course_learning_outcomes ?? currentSyllabus.course_learning_outcomes,
      course_content: body.updated_content.course_content ?? currentSyllabus.course_content,
      textbooks: body.updated_content.textbooks ?? currentSyllabus.textbooks,
      web_resources: body.updated_content.web_resources ?? currentSyllabus.web_resources,
      pedagogy: body.updated_content.pedagogy ?? currentSyllabus.pedagogy,
      po_mappings: body.updated_content.po_mappings ?? currentSyllabus.po_mappings,
      notes: body.updated_content.notes ?? currentSyllabus.notes,
      created_by: user.id,
    };

    // Add revision notes if provided
    if (body.revision_notes) {
      newVersion.notes = `${body.revision_notes}\n\n--- Previous version notes ---\n${newVersion.notes || ''}`.trim();
    }

    // Step 9: Insert new revision
    const { data: newRevision, error: insertError } = await supabase
      .from('bos_course_syllabi')
      .insert(newVersion)
      .select()
      .single();

    if (insertError) {
      console.error('[POST /api/bos/syllabi/[id]/revise] Insert error:', insertError);
      // Attempt to revert the is_latest flag on the old version
      await supabase
        .from('bos_course_syllabi')
        .update({ is_latest: true })
        .eq('id', params.id)
        .catch(err => console.error('Failed to revert is_latest:', err));

      return NextResponse.json(
        { error: 'Failed to create revision' },
        { status: 500 }
      );
    }

    return NextResponse.json(newRevision as BosCourseSyllabus, { status: 201 });
  } catch (error) {
    console.error('[POST /api/bos/syllabi/[id]/revise] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

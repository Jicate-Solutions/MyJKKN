import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess, applyInstitutionScope, guardInstitutionWrite } from '@/lib/utils/bos/bos-access';
import { BosCourseSyllabus, UpdateBosSyllabusDto } from '@/types/bos';

/**
 * GET /api/bos/syllabi/[id]
 *
 * Fetch a single syllabus by ID with all content.
 * User must have read access to the syllabus's institution.
 */
export async function GET(
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

    // Step 3: Fetch syllabus
    let query = supabase
      .from('bos_course_syllabi')
      .select('*')
      .eq('id', params.id);

    // Apply institution scope if not super admin
    if (!scope.isSuperAdmin) {
      query = query.eq('institutions_id', scope.institutionId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error('[GET /api/bos/syllabi/[id]] Query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch syllabus' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Syllabus not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(data as BosCourseSyllabus);
  } catch (error) {
    console.error('[GET /api/bos/syllabi/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/bos/syllabi/[id]
 *
 * Update syllabus content.
 * Cannot modify: id, institutions_id, regulation_id, course_code, version_number, is_latest, is_archived.
 * User must have write access to the syllabus's institution.
 *
 * Body:
 * {
 *   course_name?: string,
 *   course_credits?: number,
 *   stream?: string,
 *   course_objectives?: JSONB,
 *   course_learning_outcomes?: JSONB,
 *   course_content?: JSONB,
 *   textbooks?: JSONB,
 *   web_resources?: JSONB,
 *   pedagogy?: JSONB,
 *   po_mappings?: JSONB,
 *   notes?: string
 * }
 */
export async function PUT(
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

    // Step 3: Fetch existing syllabus to check permissions
    const { data: existingSyllabus, error: fetchError } = await supabase
      .from('bos_course_syllabi')
      .select('id, institutions_id')
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) {
      console.error('[PUT /api/bos/syllabi/[id]] Fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch syllabus' },
        { status: 500 }
      );
    }

    if (!existingSyllabus) {
      return NextResponse.json(
        { error: 'Syllabus not found' },
        { status: 404 }
      );
    }

    // Step 4: Guard institution write
    const writeError = guardInstitutionWrite(scope, existingSyllabus.institutions_id);
    if (writeError) {
      return NextResponse.json({ error: writeError }, { status: 403 });
    }

    // Step 5: Parse request body
    const body = (await request.json()) as UpdateBosSyllabusDto;

    // Step 6: Update syllabus (only content fields allowed)
    const { data: updated, error: updateError } = await supabase
      .from('bos_course_syllabi')
      .update({
        course_name: body.course_name,
        course_credits: body.course_credits,
        stream: body.stream,
        course_objectives: body.course_objectives,
        course_learning_outcomes: body.course_learning_outcomes,
        course_content: body.course_content,
        textbooks: body.textbooks,
        web_resources: body.web_resources,
        pedagogy: body.pedagogy,
        po_mappings: body.po_mappings,
        notes: body.notes,
        last_modified_by: user.id,
        last_modified_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single();

    if (updateError) {
      console.error('[PUT /api/bos/syllabi/[id]] Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update syllabus' },
        { status: 500 }
      );
    }

    return NextResponse.json(updated as BosCourseSyllabus);
  } catch (error) {
    console.error('[PUT /api/bos/syllabi/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/bos/syllabi/[id]
 *
 * Soft delete a syllabus (set is_archived=true).
 * User must have write access to the syllabus's institution.
 */
export async function DELETE(
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

    // Step 3: Fetch existing syllabus to check permissions
    const { data: existingSyllabus, error: fetchError } = await supabase
      .from('bos_course_syllabi')
      .select('id, institutions_id')
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) {
      console.error('[DELETE /api/bos/syllabi/[id]] Fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch syllabus' },
        { status: 500 }
      );
    }

    if (!existingSyllabus) {
      return NextResponse.json(
        { error: 'Syllabus not found' },
        { status: 404 }
      );
    }

    // Step 4: Guard institution write
    const writeError = guardInstitutionWrite(scope, existingSyllabus.institutions_id);
    if (writeError) {
      return NextResponse.json({ error: writeError }, { status: 403 });
    }

    // Step 5: Soft delete (archive)
    const { error: deleteError } = await supabase
      .from('bos_course_syllabi')
      .update({
        is_archived: true,
        last_modified_by: user.id,
        last_modified_at: new Date().toISOString(),
      })
      .eq('id', params.id);

    if (deleteError) {
      console.error('[DELETE /api/bos/syllabi/[id]] Delete error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete syllabus' },
        { status: 500 }
      );
    }

    return NextResponse.json(null, { status: 204 });
  } catch (error) {
    console.error('[DELETE /api/bos/syllabi/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

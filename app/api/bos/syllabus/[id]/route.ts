import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  resolveBosAccess,
  resolveBosBoardScope,
  guardInstitutionWrite,
  guardSyllabusEdit,
} from '@/lib/utils/bos/bos-access';
import { BosCourseSyllabus, UpdateBosSyllabusDto } from '@/types/bos';

/**
 * GET /api/bos/syllabus/[id]
 *
 * Fetch a single syllabus by ID with all content.
 * User must have read access to the syllabus's institution.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Step 1: Authenticate user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Debug logging
    console.log('[GET /api/bos/syllabus/[id]] Raw params:', { id, typeof: typeof id });

    // Validate UUID format
    if (!id || typeof id !== 'string' || id === 'undefined' || id.includes('undefined')) {
      console.error('[GET /api/bos/syllabus/[id]] Invalid ID:', { id });
      return NextResponse.json(
        { error: 'Invalid syllabus ID' },
        { status: 400 }
      );
    }

    // Step 2: Resolve institution scope
    const scope = await resolveBosAccess(user.id);

    // Step 3: Fetch syllabus
    console.log('[GET /api/bos/syllabus/[id]] About to query with id:', id);
    let query = supabase
      .from('bos_course_syllabi')
      .select('*')
      .eq('id', id);

    // Apply institution scope if not super admin
    if (!scope.isSuperAdmin) {
      query = query.eq('institutions_id', scope.institutionsId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error('[GET /api/bos/syllabus/[id]] Query error:', error);
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
    console.error('[GET /api/bos/syllabus/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/bos/syllabus/[id]
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Step 1: Authenticate user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Validate UUID format
    if (!id || typeof id !== 'string' || id === 'undefined') {
      return NextResponse.json(
        { error: 'Invalid syllabus ID' },
        { status: 400 }
      );
    }

    // Step 2: Resolve board-aware scope
    const scope = await resolveBosBoardScope(user.id);

    // Step 3: Fetch existing syllabus — need board_id + created_by for the
    // creator/chairman edit gate, plus institutions_id for the institution backstop.
    const { data: existingSyllabus, error: fetchError } = await supabase
      .from('bos_course_syllabi')
      .select('id, institutions_id, board_id, created_by')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error('[PUT /api/bos/syllabus/[id]] Fetch error:', fetchError);
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

    // Step 4: Institution backstop (catches cross-institution edits even if
    // the syllabus edit guard below would technically allow it).
    const institutionDeny = guardInstitutionWrite(scope, existingSyllabus.institutions_id);
    if (institutionDeny) {
      return NextResponse.json({ error: institutionDeny }, { status: 403 });
    }

    // Step 4b: Creator / chairman / super-admin gate (spec: only the author or
    // the board chairman can edit a published syllabus — members are view-only).
    const editDeny = guardSyllabusEdit(
      scope,
      { board_id: existingSyllabus.board_id, created_by: existingSyllabus.created_by },
      user.id,
    );
    if (editDeny) return NextResponse.json({ error: editDeny }, { status: 403 });

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
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[PUT /api/bos/syllabus/[id]] Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update syllabus' },
        { status: 500 }
      );
    }

    return NextResponse.json(updated as BosCourseSyllabus);
  } catch (error) {
    console.error('[PUT /api/bos/syllabus/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/bos/syllabus/[id]
 *
 * Soft delete a syllabus (set is_archived=true).
 * User must have write access to the syllabus's institution.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Step 1: Authenticate user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Validate UUID format
    if (!id || typeof id !== 'string' || id === 'undefined') {
      return NextResponse.json(
        { error: 'Invalid syllabus ID' },
        { status: 400 }
      );
    }

    // Step 2: Resolve board-aware scope
    const scope = await resolveBosBoardScope(user.id);

    // Step 3: Fetch existing syllabus
    const { data: existingSyllabus, error: fetchError } = await supabase
      .from('bos_course_syllabi')
      .select('id, institutions_id, board_id, created_by')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error('[DELETE /api/bos/syllabus/[id]] Fetch error:', fetchError);
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

    // Step 4: Institution backstop + creator/chairman gate
    const institutionDeny = guardInstitutionWrite(scope, existingSyllabus.institutions_id);
    if (institutionDeny) {
      return NextResponse.json({ error: institutionDeny }, { status: 403 });
    }
    const editDeny = guardSyllabusEdit(
      scope,
      { board_id: existingSyllabus.board_id, created_by: existingSyllabus.created_by },
      user.id,
    );
    if (editDeny) return NextResponse.json({ error: editDeny }, { status: 403 });

    // Step 5: Soft delete (archive). Use .select() so we can detect RLS
    // returning zero rows (which Supabase doesn't surface as an error). The
    // bos_course_syllabi_update RLS policy gates by 'academic.bos-syllabus.edit'
    // permission + creator/chairman check, so a user with only the 'delete'
    // permission would silently update 0 rows here.
    const { data: updatedRows, error: deleteError } = await supabase
      .from('bos_course_syllabi')
      .update({
        is_archived: true,
        last_modified_by: user.id,
        last_modified_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id');

    if (deleteError) {
      console.error('[DELETE /api/bos/syllabus/[id]] Delete error:', deleteError);
      return NextResponse.json(
        {
          error: 'Failed to delete syllabus',
          details: deleteError.message,
          code: deleteError.code,
          hint: deleteError.hint,
        },
        { status: 500 }
      );
    }

    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        {
          error:
            'Delete blocked by row-level security. You need the academic.bos-syllabus.edit permission (the soft-delete is implemented as an UPDATE) and must be the syllabus creator or the board chairman.',
        },
        { status: 403 }
      );
    }

    return NextResponse.json(null, { status: 204 });
  } catch (error) {
    console.error('[DELETE /api/bos/syllabus/[id]] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Internal server error', details: msg },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  resolveBosBoardScope,
  guardInstitutionWrite,
  guardSyllabusEdit,
  readableInstitutionIds,
  hasBosPermission,
  isBosReadAllObserver,
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

    // Step 2: Resolve board-membership scope.
    // Policy (2026-07-23, reverses 2026-07-16): the read-all observer tier IS
    // applied — any holder of academic.bos-syllabus.view may read any syllabus,
    // VIEW ONLY (PUT/DELETE below keep their own guards). Board-scoping now
    // only applies to users who reach this route WITHOUT the view grant.
    const scope = await resolveBosBoardScope(user.id);
    const hasView = await hasBosPermission(user.id, 'academic.bos-syllabus.view');
    const seeAll = scope.isSuperAdmin || isBosReadAllObserver(scope, hasView);
    const boardIds = Array.from(scope.boardsOf);
    if (!seeAll && boardIds.length === 0) {
      return NextResponse.json({ error: 'Syllabus not found' }, { status: 404 });
    }

    // Step 3: Fetch syllabus. Read via service-role, with the institution +
    // board_id filters below AS the authorization (route-level board-scoping,
    // matching PUT/DELETE) — avoids depending on the bos_course_syllabi SELECT
    // RLS policy, which errors for board members.
    console.log('[GET /api/bos/syllabus/[id]] About to query with id:', id);
    const readDb = createServiceRoleClient();
    let query = readDb
      .from('bos_course_syllabi')
      .select('*')
      .eq('id', id);

    // CAS-aware institution scope. For Arts & Science colleges the user's
    // profile.institution_id points to one of two MyJKKN UUIDs (Aided or
    // Self) but syllabi may be stored under the sibling UUID â€” so we filter
    // by the full allInstitutionIds list, never a single UUID.
    // seeAll (super-admin or view-grant observer) lifts the institution filter.
    const allowedIds = readableInstitutionIds(scope, seeAll);
    if (allowedIds !== null) {
      if (allowedIds.length === 0) {
        return NextResponse.json({ error: 'Syllabus not found' }, { status: 404 });
      }
      query = allowedIds.length === 1
        ? query.eq('institutions_id', allowedIds[0])
        : query.in('institutions_id', allowedIds);
    }

    // Board scope: non-super-admin may only read syllabi of boards they sit on.
    if (!seeAll) {
      query = query.in('board_id', boardIds);
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

    // Step 3: Fetch existing syllabus â€” need board_id + created_by for the
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
    // the board chairman can edit a published syllabus â€” members are view-only).
    const editDeny = guardSyllabusEdit(
      scope,
      { board_id: existingSyllabus.board_id, created_by: existingSyllabus.created_by },
      user.id,
    );
    if (editDeny) return NextResponse.json({ error: editDeny }, { status: 403 });

    // Step 5: Parse request body
    const body = (await request.json()) as UpdateBosSyllabusDto;

    // Step 6: Update syllabus (only content fields allowed).
    // Service-role for the write: the bos_course_syllabi_update RLS policy
    // additionally requires the 'academic.bos-syllabus.edit' role-permission
    // grant, which drifts out of sync with composition membership — a board
    // member editing their own syllabus would silently update 0 rows and
    // .single() would surface it as a 500. Authorization is fully enforced
    // above via guardInstitutionWrite + guardSyllabusEdit (creator/chairman/
    // super-admin), matching the meetings-status and TA/DA precedent.
    const writeDb = createServiceRoleClient();
    const { data: updated, error: updateError } = await writeDb
      .from('bos_course_syllabi')
      .update({
        course_name: body.course_name,
        course_credits: body.course_credits,
        stream: body.stream,
        // NAAC-2024 coverage tags (metrics 1.4 / 1.6). undefined keys are
        // dropped by supabase-js, so requests that omit them leave the row as-is.
        is_skill_based: body.is_skill_based,
        is_iks: body.is_iks,
        course_objectives: body.course_objectives,
        course_learning_outcomes: body.course_learning_outcomes,
        course_content: body.course_content,
        textbooks: body.textbooks,
        web_resources: body.web_resources,
        pedagogy: body.pedagogy,
        po_mappings: body.po_mappings,
        assessment_structure: body.assessment_structure,
        concept_applications: body.concept_applications,
        assessment_pattern: body.assessment_pattern,
        capstone_project: body.capstone_project,
        capstone_rubric: body.capstone_rubric,
        llc_conference: body.llc_conference,
        // Pharmacy / AHS academic-model fields (types/bos.ts AcademicModel).
        // academic_model is set at creation and normally unchanged, but the form
        // round-trips it so it stays consistent; the rest are model-specific.
        academic_model: body.academic_model,
        semester: body.semester,
        academic_year: body.academic_year,
        scope: body.scope,
        exam_scheme: body.exam_scheme,
        internship_postings: body.internship_postings,
        ahs_content: body.ahs_content,
        // Nursing (inc_nursing) fields.
        course_description: body.course_description,
        nursing_workload: body.nursing_workload,
        clinical_outline: body.clinical_outline,
        competency_mappings: body.competency_mappings,
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

    // Step 4: Delete is restricted to SUPER-ADMIN ONLY (policy 2026-07-16). The
    // syllabus creator and board chairman may edit/clone but NOT delete.
    if (!scope.isSuperAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: only a super admin can delete a syllabus' },
        { status: 403 }
      );
    }

    // Step 5: Soft delete (archive). Authorization is fully enforced above
    // (super-admin only), so write via service-role — the bos_course_syllabi_update
    // RLS policy gates on the edit permission + creator/chairman, which a
    // super-admin may not satisfy; matches the PUT route's service-role precedent.
    const writeDb = createServiceRoleClient();
    const { data: updatedRows, error: deleteError } = await writeDb
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
        { error: 'Syllabus not found' },
        { status: 404 }
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
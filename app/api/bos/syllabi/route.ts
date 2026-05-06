import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess, applyInstitutionScope, guardInstitutionWrite } from '@/lib/utils/bos/bos-access';
import { BosCourseSyllabus, BosSyllabusListResponse, CreateBosSyllabusDto } from '@/types/bos';

/**
 * GET /api/bos/syllabi
 *
 * Fetch all syllabi for the authenticated user's institution.
 * Supports filtering by board, regulation, course code, stream, version status.
 * Returns paginated results (default 50 per page).
 *
 * Query parameters:
 * - institutionsId (override for super admin)
 * - boardId
 * - regulationId
 * - courseCode
 * - stream (e.g., "Engineering", "Pharmacy")
 * - isLatest (true/false, default: true)
 * - isArchived (true/false, default: false)
 * - search (searches course_code, course_name)
 * - page (default: 1)
 * - limit (default: 50)
 * - sortBy (default: "course_code")
 * - sortOrder (asc/desc, default: asc)
 */
export async function GET(request: NextRequest) {
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
    const boardId = searchParams.get('boardId') || undefined;
    const regulationId = searchParams.get('regulationId') || undefined;
    const courseCode = searchParams.get('courseCode') || undefined;
    const stream = searchParams.get('stream') || undefined;
    const isLatest = searchParams.get('isLatest') !== 'false';
    const isArchived = searchParams.get('isArchived') === 'true';
    const search = searchParams.get('search') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const sortBy = searchParams.get('sortBy') || 'course_code';
    const sortOrder = (searchParams.get('sortOrder') || 'asc') as 'asc' | 'desc';

    // Step 4: Apply institution scope
    const scopedInstitutionsId = applyInstitutionScope(scope, institutionsId);

    if (!scopedInstitutionsId) {
      return NextResponse.json(
        {
          error: scope.isSuperAdmin
            ? 'No institution specified for access'
            : 'Your account is not associated with an institution. Contact your administrator to assign an institution to your profile.'
        },
        { status: 403 }
      );
    }

    // Step 5: Build query
    let query = supabase
      .from('bos_course_syllabi')
      .select('*', { count: 'exact' })
      .eq('institutions_id', scopedInstitutionsId);

    // Apply filters
    if (boardId) query = query.eq('board_id', boardId);
    if (regulationId) query = query.eq('regulation_id', regulationId);
    if (courseCode) query = query.eq('course_code', courseCode);
    if (stream) query = query.eq('stream', stream);
    if (isLatest) query = query.eq('is_latest', true);
    if (isArchived !== undefined) query = query.eq('is_archived', isArchived);

    // Search filter
    if (search) {
      query = query.or(
        `course_code.ilike.%${search}%,course_name.ilike.%${search}%`
      );
    }

    // Sorting
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Pagination
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    // Step 6: Execute query
    const { data, count, error } = await query;

    if (error) {
      console.error('[GET /api/bos/syllabi] Query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch syllabi' },
        { status: 500 }
      );
    }

    // Step 7: Format response
    const response: BosSyllabusListResponse = {
      data: (data as BosCourseSyllabus[]) || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[GET /api/bos/syllabi] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bos/syllabi
 *
 * Create a new syllabus (draft version).
 * Only authenticated users can create.
 * Designer creates their own syllabi; Chairman can create for any course.
 *
 * Body:
 * {
 *   institutions_id: UUID,
 *   board_id: UUID,
 *   regulation_id: UUID,
 *   course_code: string,
 *   course_name: string,
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
    const body = (await request.json()) as CreateBosSyllabusDto;

    // Step 4: Validate required fields
    if (!body.course_code || !body.course_name || !body.institutions_id) {
      return NextResponse.json(
        { error: 'Missing required fields: course_code, course_name, institutions_id' },
        { status: 400 }
      );
    }

    // Step 5: Guard institution write
    const writeError = guardInstitutionWrite(scope, body.institutions_id);
    if (writeError) {
      return NextResponse.json({ error: writeError }, { status: 403 });
    }

    // Step 6: Check for duplicate course code + regulation
    if (body.regulation_id) {
      const { data: existing } = await supabase
        .from('bos_course_syllabi')
        .select('id')
        .eq('regulation_id', body.regulation_id)
        .eq('course_code', body.course_code)
        .eq('is_latest', true)
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          { error: `Course ${body.course_code} already exists in this regulation. Use revise endpoint to create a new version.` },
          { status: 409 }
        );
      }
    }

    // Step 7: Insert new syllabus (draft version)
    const { data: newSyllabus, error: insertError } = await supabase
      .from('bos_course_syllabi')
      .insert({
        ...body,
        board_id: body.board_id || null, // Allow null if not provided
        created_by: user.id,
        version_number: 1,
        is_latest: true,
        is_archived: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[POST /api/bos/syllabi] Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to create syllabus' },
        { status: 500 }
      );
    }

    return NextResponse.json(newSyllabus, { status: 201 });
  } catch (error) {
    console.error('[POST /api/bos/syllabi] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess, guardInstitutionWrite } from '@/lib/utils/bos/bos-access';
import {
  findCourseCodeConflict,
  courseCodeConflictMessage,
  courseCodeConflictMessageFor,
  UNIQUE_VIOLATION,
} from '@/lib/utils/bos/course-code-conflict';
import { BosCourseSyllabus } from '@/types/bos';

/**
 * POST /api/bos/syllabus/[id]/clone
 *
 * Clone an existing syllabus into a fresh v1 row. The client only sends the
 * Basic Info fields (institution / composition / board / regulation / course
 * code + name / hours / credits / stream / notes); EVERY content section
 * (objectives, learning outcomes, content, textbooks, web resources, pedagogy,
 * PO mappings) is copied server-side from the source row so the popup never has
 * to round-trip large JSONB blobs.
 *
 * Mirrors the reference clone SQL:
 *   - version_number = 1, is_latest = true, is_archived = false
 *   - revised_from_syllabus_id = <source id>   (provenance)
 *   - counselling_code is auto-stamped by the bos_set_counselling_code trigger
 *
 * Body (all UUIDs unless noted):
 * {
 *   institutions_id, board_id, regulation_id, composition_id, course_id,
 *   course_code (string), course_name (string), course_credits (number),
 *   total_hours (number), contact_hours (number), stream (string), notes (string)
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Next 16: params is async and must be awaited before access.
    const { id } = await params;

    // Step 1: Authenticate
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Step 2: Resolve institution scope
    const scope = await resolveBosAccess(user.id);

    // Step 3: Parse body (Basic Info only)
    const body = await request.json() as Partial<BosCourseSyllabus>;

    // Step 4: Validate required Basic Info
    if (!body.institutions_id || !body.course_code || !body.course_name || !body.regulation_id) {
      return NextResponse.json(
        { error: 'Missing required fields: institutions_id, regulation_id, course_code, course_name' },
        { status: 400 }
      );
    }

    // Step 5: Guard write access on the TARGET institution
    const writeError = guardInstitutionWrite(scope, body.institutions_id);
    if (writeError) {
      return NextResponse.json({ error: writeError }, { status: 403 });
    }

    // Step 6: Fetch the source syllabus (content lives here)
    const { data: source, error: fetchError } = await supabase
      .from('bos_course_syllabi')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error('[POST /api/bos/syllabus/[id]/clone] Fetch error:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch source syllabus' }, { status: 500 });
    }
    if (!source) {
      return NextResponse.json({ error: 'Source syllabus not found' }, { status: 404 });
    }

    // Step 7: Block a colliding course_code + regulation (same rule as create).
    // The clone also lands at version 1, so archived and superseded rows block
    // it too — checking is_latest alone let those through into a mute 500.
    const conflict = await findCourseCodeConflict(body.regulation_id, body.course_code);

    if (conflict) {
      return NextResponse.json(
        { error: courseCodeConflictMessage(body.course_code, conflict) },
        { status: 409 }
      );
    }

    // Step 8: Build the clone — Basic Info from the body, content from the source.
    const src = source as BosCourseSyllabus & { institution_code?: string | null };
    const newRow = {
      // ── Basic Info (client-chosen; fall back to source) ──
      institutions_id: body.institutions_id,
      board_id: body.board_id ?? source.board_id,
      regulation_id: body.regulation_id,
      composition_id: body.composition_id ?? source.composition_id,
      course_id: body.course_id ?? source.course_id,
      course_code: body.course_code,
      course_name: body.course_name,
      course_credits: body.course_credits ?? source.course_credits,
      total_hours: body.total_hours ?? source.total_hours,
      contact_hours: body.contact_hours ?? source.contact_hours,
      stream: body.stream ?? source.stream,
      notes: body.notes ?? source.notes,
      // ── Content (copied verbatim from the source) ──
      course_objectives: source.course_objectives,
      course_learning_outcomes: source.course_learning_outcomes,
      course_content: source.course_content,
      textbooks: source.textbooks,
      web_resources: source.web_resources,
      pedagogy: source.pedagogy,
      po_mappings: source.po_mappings,
      assessment_structure: source.assessment_structure,
      concept_applications: source.concept_applications,
      assessment_pattern: source.assessment_pattern,
      capstone_project: source.capstone_project,
      capstone_rubric: source.capstone_rubric,
      llc_conference: source.llc_conference,
      // ── Denormalized legacy column (counselling_code is set by trigger) ──
      institution_code: src.institution_code ?? null,
      // ── Version / lineage ──
      version_number: 1,
      is_latest: true,
      is_archived: false,
      revised_from_syllabus_id: source.id,
      created_by: user.id,
    };

    // Step 9: Insert
    const { data: inserted, error: insertError } = await supabase
      .from('bos_course_syllabi')
      .insert(newRow)
      .select()
      .single();

    if (insertError) {
      console.error('[POST /api/bos/syllabus/[id]/clone] Insert error:', insertError);
      if (insertError.code === UNIQUE_VIOLATION) {
        return NextResponse.json(
          { error: await courseCodeConflictMessageFor(body.regulation_id, body.course_code) },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Failed to clone syllabus' }, { status: 500 });
    }

    return NextResponse.json(inserted as BosCourseSyllabus, { status: 201 });
  } catch (error) {
    console.error('[POST /api/bos/syllabus/[id]/clone] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

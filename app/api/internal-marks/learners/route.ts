import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  resolveInternalMarksAccess,
  resolveEffectiveInstitutionId,
} from '@/lib/utils/internal-marks/internal-marks-access';
import type { LearnerForMarkEntry } from '@/types/internal-marks';

// ── GET /api/internal-marks/learners ────────────────────────────────────────
// Fetches learners from MyJKKN's own database for the mark entry grid.
// These are NOT fetched from COE — MyJKKN is the source of truth for learner data.
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Resolve access scope
    const scope = await resolveInternalMarksAccess(user.id);
    const { searchParams } = new URL(request.url);

    const clientInstitutionId = searchParams.get('institutionId');
    const programId = searchParams.get('programId');
    const semesterId = searchParams.get('semesterId');
    const sectionId = searchParams.get('sectionId');

    const institutionId = resolveEffectiveInstitutionId(
      scope,
      clientInstitutionId
    );

    if (!institutionId) {
      return NextResponse.json(
        { error: 'Institution ID is required' },
        { status: 400 }
      );
    }

    if (!programId || !semesterId) {
      return NextResponse.json(
        { error: 'Program ID and Semester ID are required' },
        { status: 400 }
      );
    }

    // 3. Query learners from MyJKKN database
    let query = supabase
      .from('learners_profiles')
      .select('id, register_number, roll_number, first_name, last_name, section_id')
      .eq('institution_id', institutionId)
      .eq('program_id', programId)
      .eq('semester_id', semesterId)
      .eq('lifecycle_status', 'active')
      .order('register_number', { ascending: true });

    if (sectionId) {
      query = query.eq('section_id', sectionId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[internal-marks/learners] DB error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch learners' },
        { status: 500 }
      );
    }

    // 4. Transform to LearnerForMarkEntry shape
    const learners: LearnerForMarkEntry[] = (data ?? []).map((row) => ({
      id: row.id,
      register_number: row.register_number ?? '',
      roll_number: row.roll_number ?? undefined,
      name: [row.first_name, row.last_name].filter(Boolean).join(' '),
      exam_registration_id: '',
      course_offering_id: '',
    }));

    return NextResponse.json({
      data: learners,
      metadata: { total: learners.length },
    });
  } catch (error) {
    console.error('[internal-marks/learners] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch learners' },
      { status: 500 }
    );
  }
}

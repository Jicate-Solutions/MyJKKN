/**
 * GET /api/learners/my-marks/cia-settings
 *
 * Returns CIA Settings the calling student can see, scoped by:
 *   - examination_session_id (required) — comes from one of their registrations
 *   - program_code (required)            — comes from same registration
 *
 * The student's register_number is verified server-side: if they query a
 * (session, program) they don't actually have a registration for, this 403s.
 *
 * Response is the standard CiaSettings[] (re-exported as MyMarksCiaSetting in
 * the type layer to make intent explicit).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { resolveCoeInstitutionId } from '@/lib/utils/internal-marks/internal-marks-access';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import type { CiaSettings } from '@/types/internal-marks';

interface CoeRegistrationRow {
  stu_register_no: string;
  program_code: string;
  examination_session_id?: string;
  is_regular: boolean;
  registration_status: string;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const validation = await StudentValidationService.validateStudentAccess(user.id);
    if (!validation.allowed) {
      return NextResponse.json(
        { error: 'Forbidden', reason: validation.reason },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const examSessionId = searchParams.get('examSessionId');
    const programCode = searchParams.get('programCode');

    if (!examSessionId || !programCode) {
      return NextResponse.json(
        { error: 'examSessionId and programCode are required' },
        { status: 400 }
      );
    }

    const adminClient = createServiceRoleClient();
    const { data: profile } = await adminClient
      .from('profiles')
      .select('learner_id, role')
      .eq('id', user.id)
      .single();

    if (!profile?.learner_id || profile.role !== 'student') {
      return NextResponse.json(
        { error: 'Student profile not found' },
        { status: 404 }
      );
    }

    const { data: learner } = await adminClient
      .from('learners_profiles')
      .select('register_number, institution_id')
      .eq('id', profile.learner_id)
      .single();

    const registerNumber = learner?.register_number;
    const institutionId = learner?.institution_id;

    if (!registerNumber || !institutionId) {
      return NextResponse.json(
        { error: 'Student profile incomplete' },
        { status: 422 }
      );
    }

    const coeInstitutionId = await resolveCoeInstitutionId(institutionId);
    if (!coeInstitutionId) {
      return NextResponse.json(
        { error: 'Institution not mapped in COE' },
        { status: 404 }
      );
    }

    // Verify the student is actually registered for this (session, program).
    const client = CoeRestClient.create();
    const regsRaw = await client.get<{ data: CoeRegistrationRow[] } | CoeRegistrationRow[]>(
      '/api/v1/registrations',
      {
        institutions_id: coeInstitutionId,
        examination_session_id: examSessionId,
        program_code: programCode,
        limit: '5000',
        is_regular: 'true',
      }
    );
    const regs = Array.isArray(regsRaw) ? regsRaw : regsRaw.data ?? [];
    const isRegistered = regs.some(
      (r) =>
        r.stu_register_no === registerNumber &&
        r.registration_status === 'Approved'
    );
    if (!isRegistered) {
      return NextResponse.json(
        { error: 'Forbidden: not registered for this session/program' },
        { status: 403 }
      );
    }

    const data = await client.get<CiaSettings[]>('/api/v1/cia-settings', {
      institutions_id: coeInstitutionId,
      examination_session_id: examSessionId,
      program_code: programCode,
    });

    // Only show active settings to students.
    const activeOnly = (data ?? []).filter((s) => s.is_active !== false);

    return NextResponse.json({ data: activeOnly });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error('[my-marks/cia-settings] error:', error);
    return NextResponse.json(
      { error: 'Failed to load assessment settings' },
      { status: 500 }
    );
  }
}

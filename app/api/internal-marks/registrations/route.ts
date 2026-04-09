import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import {
  resolveInternalMarksAccess,
  resolveEffectiveInstitutionId,
  resolveCoeInstitutionId,
} from '@/lib/utils/internal-marks/internal-marks-access';

// ── GET /api/internal-marks/registrations ───────────────────────────────────
// Fetches exam registrations from COE.
// NOTE: COE's program_code filter must work server-side for correct results.
//       If COE returns all programs, client-side filtering handles it as fallback.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveInternalMarksAccess(user.id);
    const { searchParams } = new URL(request.url);
    const institutionId = resolveEffectiveInstitutionId(scope, searchParams.get('institutionId'));
    const examSessionId = searchParams.get('examSessionId');
    const programCode = searchParams.get('programCode');
    const courseCode = searchParams.get('courseCode');

    if (!institutionId || !examSessionId) {
      return NextResponse.json(
        { error: 'institutionId and examSessionId are required' },
        { status: 400 }
      );
    }

    const coeInstitutionId = await resolveCoeInstitutionId(institutionId);
    if (!coeInstitutionId) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    const client = CoeRestClient.create();
    const params: Record<string, string | undefined> = {
      institutions_id: coeInstitutionId,
      examination_session_id: examSessionId,
      limit: '5000',
      is_regular: 'true',
    };
    if (programCode) params.program_code = programCode;
    if (courseCode) params.course_code = courseCode;

    const result = await client.get<{ data: unknown[] } | unknown[]>(
      '/api/v1/registrations',
      params
    );

    const records = Array.isArray(result)
      ? result
      : (result as { data: unknown[] }).data ?? [];

    // Filter students by user's MyJKKN institution
    // COE returns Aided+SF combined — only show students belonging to user's institution
    // Approach: get ALL register numbers for user's institution, then filter registrations
    if (institutionId && records.length > 0) {
      // Use service-role client to bypass RLS (user may not be in user_institution_access)
      const serviceClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );

      const { data: myStudents } = await serviceClient
        .from('learners_profiles')
        .select('register_number')
        .eq('institution_id', institutionId)
        .not('register_number', 'is', null);

      if (myStudents) {
        const myRegNos = new Set(myStudents.map((s) => s.register_number));
        const filtered = (records as Array<{ stu_register_no: string }>).filter(
          (r) => myRegNos.has(r.stu_register_no)
        );
        return NextResponse.json({ data: filtered });
      }
    }

    return NextResponse.json({ data: records });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[internal-marks/registrations] error:', error);
    return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 });
  }
}

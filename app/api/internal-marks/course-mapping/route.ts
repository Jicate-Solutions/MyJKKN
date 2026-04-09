import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import {
  resolveInternalMarksAccess,
  resolveEffectiveInstitutionId,
  resolveCoeInstitutionId,
} from '@/lib/utils/internal-marks/internal-marks-access';

// ── GET /api/internal-marks/course-mapping ──────────────────────────────────
// Proxies COE's /api/v1/course-mapping endpoint.
// Used to populate Semester + Course dropdowns (scoped to selected program).
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
    const programCode = searchParams.get('programCode');

    if (!institutionId || !programCode) {
      return NextResponse.json(
        { error: 'institutionId and programCode are required' },
        { status: 400 }
      );
    }

    const coeInstitutionId = await resolveCoeInstitutionId(institutionId);
    if (!coeInstitutionId) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    const client = CoeRestClient.create();
    const result = await client.get<{ data: unknown[] } | unknown[]>(
      '/api/v1/course-mapping',
      {
        institutions_id: coeInstitutionId,
        program_code: programCode,
        limit: '500',
      }
    );

    const records = Array.isArray(result)
      ? result
      : (result as { data: unknown[] }).data ?? [];

    return NextResponse.json({ data: records });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[internal-marks/course-mapping] error:', error);
    return NextResponse.json({ error: 'Failed to fetch course mapping' }, { status: 500 });
  }
}

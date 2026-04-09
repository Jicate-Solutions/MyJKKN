import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import {
  resolveInternalMarksAccess,
  resolveEffectiveInstitutionId,
  resolveCoeInstitutionId,
} from '@/lib/utils/internal-marks/internal-marks-access';

// ── GET /api/internal-marks/exam-sessions ───────────────────────────────────
// Client sends MyJKKN institutionId → server resolves to COE UUID → fetches exam sessions.
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

    if (!institutionId) {
      return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 });
    }

    // Resolve MyJKKN UUID → COE UUID
    const coeInstitutionId = await resolveCoeInstitutionId(institutionId);
    if (!coeInstitutionId) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    // Fetch exam sessions using COE institution UUID
    const client = CoeRestClient.create();
    const data = await client.get<unknown[]>('/api/v1/examination-sessions', {
      institutions_id: coeInstitutionId,
    });

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[internal-marks/exam-sessions] error:', error);
    return NextResponse.json({ error: 'Failed to fetch exam sessions' }, { status: 500 });
  }
}

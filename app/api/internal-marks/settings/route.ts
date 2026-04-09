import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import {
  resolveInternalMarksAccess,
  resolveEffectiveInstitutionId,
  resolveCoeInstitutionId,
} from '@/lib/utils/internal-marks/internal-marks-access';
import type { CiaSettings } from '@/types/internal-marks';

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

    if (!institutionId || !examSessionId) {
      return NextResponse.json({ error: 'institutionId and examSessionId are required' }, { status: 400 });
    }

    const coeInstitutionId = await resolveCoeInstitutionId(institutionId);
    if (!coeInstitutionId) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    const client = CoeRestClient.create();
    const params: Record<string, string | undefined> = {
      institutions_id: coeInstitutionId,
      examination_session_id: examSessionId,
    };
    if (programCode) params.program_code = programCode;

    const data = await client.get<CiaSettings[]>('/api/v1/cia-settings', params);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    console.error('[internal-marks/settings] error:', error);
    return NextResponse.json({ error: 'Failed to fetch CIA settings' }, { status: 500 });
  }
}

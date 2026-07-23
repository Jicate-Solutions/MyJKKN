import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import {
  resolveInternalMarksAccess,
  resolveEffectiveInstitutionId,
  resolveCoeInstitutionCode,
} from '@/lib/utils/internal-marks/internal-marks-access';
import type { IaPaperTemplate } from '@/types/ia-question-paper';

/**
 * /api/question-papers/templates — read-only proxy to COE /api/v1/ia/paper-templates.
 * Used by the authoring page to show which template a paper will scaffold from
 * (and to let an admin pick one explicitly at generate time). Templates are
 * DESIGNED in the COE app; MyJKKN only reads them here.
 */
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

    const scope = await resolveInternalMarksAccess(user.id);
    const { searchParams } = new URL(request.url);
    const institutionId = resolveEffectiveInstitutionId(
      scope,
      searchParams.get('institutionId')
    );
    if (!institutionId) {
      return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 });
    }

    const institutionCode = await resolveCoeInstitutionCode(institutionId);
    if (!institutionCode) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    const params: Record<string, string> = {
      institution_code: institutionCode,
      exam_scope: searchParams.get('exam_scope') ?? 'cia',
    };
    const status = searchParams.get('status');
    if (status) params.status = status;

    const client = CoeRestClient.create();
    const coe = await client.get<{ data: IaPaperTemplate[] }>('/api/v1/ia/paper-templates', params);
    return NextResponse.json({ data: coe?.data ?? [] });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[question-papers/templates] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

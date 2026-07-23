import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import {
  resolveInternalMarksAccess,
  resolveCoeInstitutionCode,
  resolveCoeInstitutionById,
  type InternalMarksAccessScope,
} from '@/lib/utils/internal-marks/internal-marks-access';
import type { IaQuestionPaperDetail } from '@/types/ia-question-paper';

/**
 * /api/question-papers/[id]/pdf — streams the COE-rendered A5 question-paper PDF.
 *
 * The COE endpoint returns raw application/pdf bytes (not JSON), so we bypass
 * CoeRestClient's JSON client and fetch directly with the same API-key headers.
 * A CAS-aware scope guard runs first via CoeRestClient so cross-institution ids
 * are rejected before we fetch the binary.
 */

async function guardPaperScope(
  scope: InternalMarksAccessScope,
  coePaperInstitutionsId: string | null | undefined
): Promise<boolean> {
  if (scope.isSuperAdmin) return true;
  if (!scope.institutionId || !coePaperInstitutionsId) return false;
  const [userCode, paperInst] = await Promise.all([
    resolveCoeInstitutionCode(scope.institutionId),
    resolveCoeInstitutionById(coePaperInstitutionsId),
  ]);
  return (
    !!userCode &&
    !!paperInst &&
    userCode.toUpperCase() === paperInst.institution_code.toUpperCase()
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const scope = await resolveInternalMarksAccess(user.id);

    // Scope guard via the JSON client (cheap, cached) before pulling the binary.
    const client = CoeRestClient.create();
    const coe = await client.get<{ data: IaQuestionPaperDetail }>(`/api/v1/ia/question-papers/${id}`);
    if (!coe?.data || !(await guardPaperScope(scope, coe.data.institutions_id))) {
      return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 });
    }

    const baseUrl = process.env.COE_API_URL;
    const keyId = process.env.COE_API_KEY_ID;
    const secret = process.env.COE_API_SECRET;
    if (!baseUrl || !keyId || !secret) {
      return NextResponse.json({ error: 'COE API is not configured' }, { status: 500 });
    }

    const res = await fetch(`${baseUrl}/api/v1/ia/question-papers/${id}/pdf`, {
      headers: { 'X-API-Key-Id': keyId, 'X-API-Secret': secret },
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `COE PDF export failed (${res.status})` },
        { status: res.status }
      );
    }

    const buffer = await res.arrayBuffer();
    const filename =
      res.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1] ??
      `question-paper-${id}.pdf`;
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[question-papers/:id/pdf] GET error:', error);
    return NextResponse.json({ error: 'Failed to export PDF' }, { status: 500 });
  }
}

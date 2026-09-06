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
 * /api/question-papers/[id] — proxy to COE /api/v1/ia/question-papers/{id}.
 * GET (detail + questions + template parts + CO master), PUT (save/status/meta), DELETE.
 *
 * Because the COE endpoint only enforces the app API-key's institution set (not the
 * individual MyJKKN user), we re-guard here: a non-super-admin may only touch a paper
 * whose COE institution matches their own — CAS-safe, since SF+Aided collapse to one
 * COE institution_code.
 */

/** Verify the paper's COE institution belongs to the user's scope (CAS-aware). */
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

    const client = CoeRestClient.create();
    const coe = await client.get<{ data: IaQuestionPaperDetail }>(`/api/v1/ia/question-papers/${id}`);
    const data = coe?.data;

    if (!data || !(await guardPaperScope(scope, data.institutions_id))) {
      return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[question-papers/:id] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch question paper' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
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
    const body = await request.json();

    const client = CoeRestClient.create();

    // Guard: load the paper's institution first, verify the caller may write it.
    const existing = await client.get<{ data: IaQuestionPaperDetail }>(`/api/v1/ia/question-papers/${id}`);
    if (!existing?.data || !(await guardPaperScope(scope, existing.data.institutions_id))) {
      return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 });
    }

    // Stamp the MyJKKN user for approver provenance on status transitions.
    const coe = await client.put<{ data: IaQuestionPaperDetail }>(
      `/api/v1/ia/question-papers/${id}`,
      { ...body, author_id: user.id }
    );
    return NextResponse.json({ data: coe?.data });
  } catch (error) {
    if (error instanceof CoeApiError) {
      // COE's save route answers coded rejections as
      //   { error: "WOULD_CLEAR" | "CONFLICT" | "SUB_MARKS" | "INCOMPLETE" | "AUTHORED",
      //     message: "<the sentence to show the author>" }
      // CoeApiError.message resolves to `error` first, which for those is the bare
      // code — forward BOTH so the client can branch on the code and still print a
      // sentence. Uncoded failures keep the plain shape.
      const body = error.body ?? {};
      const code = typeof body.error === 'string' ? body.error : undefined;
      const readable = typeof body.message === 'string' ? body.message : undefined;
      return NextResponse.json(
        {
          error: code ?? error.message,
          ...(readable ? { message: readable } : {}),
          details: error.details,
        },
        { status: error.status }
      );
    }
    console.error('[question-papers/:id] PUT error:', error);
    return NextResponse.json({ error: 'Failed to save question paper' }, { status: 500 });
  }
}

export async function DELETE(
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

    const client = CoeRestClient.create();
    const existing = await client.get<{ data: IaQuestionPaperDetail }>(`/api/v1/ia/question-papers/${id}`);
    if (!existing?.data || !(await guardPaperScope(scope, existing.data.institutions_id))) {
      return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 });
    }

    await client.delete(`/api/v1/ia/question-papers/${id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[question-papers/:id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete question paper' }, { status: 500 });
  }
}

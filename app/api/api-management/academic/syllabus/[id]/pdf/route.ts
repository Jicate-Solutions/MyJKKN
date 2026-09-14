export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse, connection } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import {
  apiError,
  auditSyllabusApi,
  authorizeSyllabusApi,
  parsePdfOptions,
  respondWithSyllabusPdf,
} from '@/lib/services/bos/syllabus-api';
import { findSyllabusById, isUuid, keyMayRead } from '@/lib/services/bos/syllabus-lookup';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/api-management/academic/syllabus/{id}/pdf
 *
 * Stream the PDF for one syllabus id (as returned by ../syllabus).
 * Query: format, include_mappings, include_references, include_pedagogy,
 * disposition, include_archived=true. Honors If-None-Match → 304.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const startedAt = Date.now();

  const auth = await authorizeSyllabusApi(request);
  if ('response' in auth) return auth.response;
  const { ctx } = auth;

  try {
    const { id } = await params;
    if (!isUuid(id)) {
      auditSyllabusApi(request, ctx, 400, startedAt);
      return apiError('VALIDATION', 'Learning pathway id must be a uuid', 400);
    }

    const search = new URL(request.url).searchParams;
    const pdfOpts = parsePdfOptions(search);
    if (pdfOpts instanceof NextResponse) {
      auditSyllabusApi(request, ctx, 400, startedAt);
      return pdfOpts;
    }

    const doc = await findSyllabusById(ctx.supabase, id, search.get('include_archived') === 'true');
    if (!doc || !keyMayRead(ctx.institutionId, doc)) {
      auditSyllabusApi(request, ctx, 404, startedAt);
      return apiError('NOT_FOUND', 'Learning pathway not found', 404);
    }

    const res = await respondWithSyllabusPdf(request, ctx, doc, pdfOpts);
    auditSyllabusApi(request, ctx, res.status, startedAt);
    return res;
  } catch (error) {
    console.error('[GET /api/api-management/academic/syllabus/[id]/pdf] Error:', error);
    auditSyllabusApi(request, ctx, 500, startedAt);
    return apiError('INTERNAL', 'Internal server error', 500);
  }
}

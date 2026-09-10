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
import {
  findSyllabi,
  keyMayRead,
  parseSyllabusLookupQuery,
} from '@/lib/services/bos/syllabus-lookup';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/api-management/academic/syllabus/pdf
 *
 * One-shot: resolve exactly one syllabus by course and stream its PDF.
 * Query: the lookup params of ../syllabus plus
 *   format=official|meeting_summary|obe|v35 (default official)
 *   include_mappings / include_references / include_pedagogy (default true)
 *   disposition=inline|attachment (default inline)
 *
 * 409 AMBIGUOUS (with candidate ids) when more than one row matches — pass
 * regulation_id or version, or call ../syllabus/{id}/pdf.
 */
export async function GET(request: NextRequest) {
  await connection();
  const startedAt = Date.now();

  const auth = await authorizeSyllabusApi(request);
  if ('response' in auth) return auth.response;
  const { ctx } = auth;

  try {
    const params = new URL(request.url).searchParams;
    const parsed = parseSyllabusLookupQuery(params);
    if ('message' in parsed) {
      auditSyllabusApi(request, ctx, 400, startedAt);
      return apiError('VALIDATION', parsed.message, 400);
    }
    const pdfOpts = parsePdfOptions(params);
    if (pdfOpts instanceof NextResponse) {
      auditSyllabusApi(request, ctx, 400, startedAt);
      return pdfOpts;
    }

    const rows = (await findSyllabi(ctx.supabase, parsed.query)).filter((r) =>
      keyMayRead(ctx.institutionId, r),
    );

    if (rows.length === 0) {
      auditSyllabusApi(request, ctx, 404, startedAt);
      return apiError('NOT_FOUND', 'No learning pathway matches the given course', 404);
    }
    if (rows.length > 1) {
      auditSyllabusApi(request, ctx, 409, startedAt);
      return apiError(
        'AMBIGUOUS',
        'More than one learning pathway matches; narrow with regulation_id or version, or use /syllabus/{id}/pdf',
        409,
        {
          candidates: rows.map((r) => ({
            id: r.id,
            regulation_id: r.regulation_id ?? null,
            institution_id: r.institutions_id,
            version_number: r.version_number,
            last_modified_at: r.last_modified_at ?? null,
          })),
        },
      );
    }

    const res = await respondWithSyllabusPdf(request, ctx, rows[0], pdfOpts);
    auditSyllabusApi(request, ctx, res.status, startedAt);
    return res;
  } catch (error) {
    console.error('[GET /api/api-management/academic/syllabus/pdf] Error:', error);
    auditSyllabusApi(request, ctx, 500, startedAt);
    return apiError('INTERNAL', 'Internal server error', 500);
  }
}

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import {
  apiError,
  auditSyllabusApi,
  authorizeSyllabusApi,
} from '@/lib/services/bos/syllabus-api';
import {
  findSyllabi,
  keyMayRead,
  parseSyllabusLookupQuery,
  toSyllabusApiMeta,
} from '@/lib/services/bos/syllabus-lookup';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/api-management/academic/syllabus
 *
 * Resolve BoS course syllabi for an external caller (COE) and describe which
 * PDF formats each one can render.
 *
 * Query (one key form required):
 *   course_id=<COE course uuid>                      — preferred
 *   course_code=<code>&institution_id=<uuid>         — fallback
 * Optional: regulation_id, version, include_archived=true
 *
 * Response: { data: SyllabusApiMeta[], count }
 */
export async function GET(request: NextRequest) {
  await connection();
  const startedAt = Date.now();

  const auth = await authorizeSyllabusApi(request);
  if ('response' in auth) return auth.response;
  const { ctx } = auth;

  try {
    const parsed = parseSyllabusLookupQuery(new URL(request.url).searchParams);
    if ('message' in parsed) {
      auditSyllabusApi(request, ctx, 400, startedAt);
      return apiError('VALIDATION', parsed.message, 400);
    }

    const rows = (await findSyllabi(ctx.supabase, parsed.query)).filter((r) =>
      keyMayRead(ctx.institutionId, r),
    );

    if (rows.length === 0) {
      auditSyllabusApi(request, ctx, 404, startedAt);
      return apiError('NOT_FOUND', 'No learning pathway matches the given course', 404);
    }

    auditSyllabusApi(request, ctx, 200, startedAt);
    return NextResponse.json(
      { data: rows.map(toSyllabusApiMeta), count: rows.length },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error('[GET /api/api-management/academic/syllabus] Error:', error);
    auditSyllabusApi(request, ctx, 500, startedAt);
    return apiError('INTERNAL', 'Internal server error', 500);
  }
}

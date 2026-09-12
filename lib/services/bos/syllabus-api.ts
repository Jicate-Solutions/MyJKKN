// lib/services/bos/syllabus-api.ts
//
// Shared plumbing for the API-key syllabus routes
// (app/api/api-management/academic/syllabus/*): auth + rate limit + audit,
// error envelope, and the PDF responder used by both the one-shot and by-id
// PDF routes.

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, type ApiKeyContext } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { corsHeaders } from '@/lib/api-keys/cors';
import { courseDisplayFor } from '@/lib/utils/bos/coe-course-display';
import {
  buildSyllabusHtml,
  isSyllabusPdfFormat,
  supportedFormats,
  type SyllabusPdfFormat,
} from '@/lib/utils/bos/syllabus-pdf-html';
import { renderSyllabusPdf, SyllabusRendererUnavailableError } from '@/lib/pdf/syllabus-pdf';
import { syllabusEtag, syllabusPdfFilename } from '@/lib/services/bos/syllabus-lookup';
import { isEngineeringSyllabus, buildEngineeringSyllabusPdf } from '@/lib/services/bos/syllabus-engineering-pdf';
import type { BosCourseSyllabus } from '@/types/bos';

const MODULE = 'academic' as const;

export type SyllabusApiErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'AMBIGUOUS'
  | 'UNSUPPORTED_FORMAT'
  | 'RATE_LIMITED'
  | 'RENDERER_UNAVAILABLE'
  | 'INTERNAL';

export function apiError(
  code: SyllabusApiErrorCode,
  message: string,
  status: number,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: { code, message, ...(extra ?? {}) } }, { status, headers: corsHeaders });
}

export type SyllabusApiAuth = { ok: true; ctx: ApiKeyContext } | { ok: false; response: NextResponse };

/** Bearer key with `academic` read access, then the per-key sliding-window limit. */
export async function authorizeSyllabusApi(request: NextRequest): Promise<SyllabusApiAuth> {
  const auth = await authenticateApiKey(request, { requiredModule: MODULE });
  if ('error' in auth) return { ok: false, response: auth.error };

  const limit = checkRateLimit(auth.context.keyId);
  if (!limit.allowed) {
    const retryAfter = Math.max(1, Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000));
    const res = apiError('RATE_LIMITED', 'Rate limit exceeded', 429);
    res.headers.set('Retry-After', String(retryAfter));
    return { ok: false, response: res };
  }
  return { ok: true, ctx: auth.context };
}

/** Fire-and-forget usage row; never throws. */
export function auditSyllabusApi(
  request: NextRequest,
  ctx: ApiKeyContext,
  statusCode: number,
  startedAt: number,
): void {
  const { ipAddress, userAgent } = extractRequestMeta(request);
  logApiUsage({
    apiKeyId: ctx.keyId,
    endpoint: new URL(request.url).pathname,
    module: MODULE,
    institutionId: ctx.institutionId,
    statusCode,
    responseTimeMs: Date.now() - startedAt,
    ipAddress,
    userAgent,
  });
}

export interface PdfRequestOptions {
  format: SyllabusPdfFormat;
  includeMappings: boolean;
  includeReferences: boolean;
  includePedagogy: boolean;
  disposition: 'inline' | 'attachment';
}

export function parsePdfOptions(params: URLSearchParams): PdfRequestOptions | NextResponse {
  const formatRaw = params.get('format') ?? 'official';
  if (!isSyllabusPdfFormat(formatRaw)) {
    return apiError('VALIDATION', `format must be one of official, meeting_summary, obe, v35 (got "${formatRaw}")`, 400);
  }
  const dispositionRaw = params.get('disposition') ?? 'inline';
  if (dispositionRaw !== 'inline' && dispositionRaw !== 'attachment') {
    return apiError('VALIDATION', 'disposition must be inline or attachment', 400);
  }
  return {
    format: formatRaw,
    includeMappings: params.get('include_mappings') !== 'false',
    includeReferences: params.get('include_references') !== 'false',
    includePedagogy: params.get('include_pedagogy') !== 'false',
    disposition: dispositionRaw,
  };
}

/**
 * Render and return the PDF for one resolved doc.
 * 304 on ETag match (no Chromium launch), 422 when the model cannot render the
 * requested format, 503 when the renderer is down.
 */
export async function respondWithSyllabusPdf(
  request: NextRequest,
  ctx: ApiKeyContext,
  doc: BosCourseSyllabus,
  opts: PdfRequestOptions,
): Promise<NextResponse> {
  const formats = supportedFormats(doc);
  if (!formats.includes(opts.format)) {
    return apiError(
      'UNSUPPORTED_FORMAT',
      `Format "${opts.format}" is not available for this learning pathway (academic_model=${doc.academic_model ?? 'anna_univ'})`,
      422,
      { supported_formats: formats },
    );
  }

  const etag = syllabusEtag(doc, opts.format);
  const baseHeaders: Record<string, string> = {
    ...corsHeaders,
    ETag: etag,
    'Cache-Control': 'private, max-age=3600',
    'X-Syllabus-Id': doc.id,
    'X-Syllabus-Version': String(doc.version_number),
    'X-Academic-Model': doc.academic_model ?? 'anna_univ',
  };
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: baseHeaders });
  }

  // Live COE course code/name (rename-safe); falls back to the stored snapshot.
  const display = await courseDisplayFor(doc);
  const forPdf: BosCourseSyllabus = { ...doc, course_code: display.course_code, course_name: display.course_name };

  // Letterhead + running footer context. Each lookup is best-effort: a missing
  // row only drops that line from the document, never the document itself.
  const [{ data: inst }, { data: reg }] = await Promise.all([
    ctx.supabase
      .from('institutions')
      .select('name, display_name, city, state, institution_type, accredited_by')
      .eq('id', doc.institutions_id)
      .maybeSingle(),
    doc.regulation_id
      ? ctx.supabase.from('regulations').select('regulation_code').eq('id', doc.regulation_id).maybeSingle()
      : Promise.resolve({ data: null as { regulation_code?: string | null } | null }),
  ]);
  const instRow = inst as { name?: string; display_name?: string | null; city?: string | null; state?: string | null; institution_type?: string | null; accredited_by?: string | null } | null;
  const institutionName = (instRow?.display_name || instRow?.name || undefined) ?? undefined;

  // Engineering (CET) syllabi: the college's own jsPDF document — the same one
  // the BoS screen downloads (letterhead, L-T-P-C, units with periods, CO–PO
  // matrix, sign-off) — so the COE receives the syllabus the college prints.
  // Its own ETag suffix, so a client holding the old HTML-layout ETag is not
  // answered 304 with a stale document.
  if (opts.format === 'official' && isEngineeringSyllabus(forPdf, institutionName)) {
    const engEtag = etag.replace(/"$/, ':engineering"');
    const engHeaders = { ...baseHeaders, ETag: engEtag, 'X-Syllabus-Layout': 'engineering' };
    if (request.headers.get('if-none-match') === engEtag) {
      return new NextResponse(null, { status: 304, headers: engHeaders });
    }
    try {
      const bytes = await buildEngineeringSyllabusPdf(ctx.supabase, forPdf);
      const filename = syllabusPdfFilename(forPdf.course_code, opts.format, forPdf.version_number);
      return new NextResponse(new Uint8Array(bytes), {
        status: 200,
        headers: {
          ...engHeaders,
          'Content-Type': 'application/pdf',
          'Content-Length': String(bytes.byteLength),
          'Content-Disposition': `${opts.disposition}; filename="${filename}"`,
        },
      });
    } catch (err) {
      // Never a blank answer: fall through to the HTML layout and say why.
      console.warn('[syllabus-api] engineering PDF failed, falling back to the HTML layout:', err);
    }
  }

  const html = buildSyllabusHtml(forPdf, opts.format, {
    includeMappings: opts.includeMappings,
    includeReferences: opts.includeReferences,
    includePedagogy: opts.includePedagogy,
    institutionName,
    institution: institutionName
      ? { name: institutionName, city: instRow?.city, state: instRow?.state, institutionType: instRow?.institution_type, accreditedBy: instRow?.accredited_by }
      : undefined,
    regulationCode: (reg as { regulation_code?: string | null } | null)?.regulation_code ?? null,
    forPrint: true,
  });

  let pdf: Buffer;
  try {
    pdf = await renderSyllabusPdf(html, {
      footerText: [forPdf.course_code, forPdf.course_name, institutionName].filter(Boolean).join(' · '),
    });
  } catch (err) {
    if (err instanceof SyllabusRendererUnavailableError) {
      return apiError('RENDERER_UNAVAILABLE', 'PDF renderer is unavailable, retry shortly', 503);
    }
    throw err;
  }

  const filename = syllabusPdfFilename(forPdf.course_code, opts.format, forPdf.version_number);
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      ...baseHeaders,
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdf.byteLength),
      'Content-Disposition': `${opts.disposition}; filename="${filename}"`,
    },
  });
}

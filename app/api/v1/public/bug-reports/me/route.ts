/**
 * GET /api/v1/public/bug-reports/me — the widget's "My bugs" list.
 *
 * Same request and response as the central reporter's route
 * (Jicate-Solutions/BugReporter app/api/v1/public/bug-reports/me/route.ts):
 *   - header `X-API-Key: <bug-intake key>`
 *   - query: reporter_email (REQUIRED), page, limit (max 100), status,
 *     category, search, sort_by (created_at | resolved_at | status),
 *     sort_order (asc | desc)
 *   - 200 `{ success: true, data: { bug_reports, pagination } }`
 *
 * The key establishes WHICH APP; it cannot establish WHICH PERSON. So the
 * list is always scoped to both the key's app and the given reporter, and a
 * request without a reporter is refused rather than answered with the whole
 * app's list (the leak the central reporter fixed). The reporter's email is a
 * claim, so every bug comes back in the minimal view (minimalBug).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  BUG_STATUSES,
  REPORTER_BUG_SELECT,
  SORTABLE_FIELDS,
  intakeCorsHeaders,
  minimalBug,
  normalizeReporterEmail,
  sanitizeSearch,
} from '@/lib/bug-reports/sibling-intake';
import {
  auditIntakeRead,
  authenticateIntakeKey,
  intakeFail,
  intakeOk,
} from '@/lib/bug-reports/sibling-intake-auth';

const ENDPOINT = '/api/v1/public/bug-reports/me';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: intakeCorsHeaders });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const { ipAddress, userAgent } = extractRequestMeta(request);

  const auth = await authenticateIntakeKey(request, {
    rateLimitBucket: 'bug-intake-read',
    rateLimitedMessage: 'Too many requests. Please try again in a minute.',
    ipAddress,
  });
  if ('response' in auth) return auth.response;
  const { app, supabase, keyId } = auth;
  const audit = (statusCode: number) =>
    auditIntakeRead({ keyId, endpoint: ENDPOINT, statusCode, startTime, ipAddress, userAgent });

  const { searchParams } = new URL(request.url);
  const reporterEmail = normalizeReporterEmail(searchParams.get('reporter_email'));
  if (!reporterEmail) {
    audit(400);
    return intakeFail(
      'VALIDATION_ERROR',
      'reporter_email is required. This endpoint returns only the bugs submitted by that reporter.',
      400
    );
  }

  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
  const status = searchParams.get('status');
  const category = searchParams.get('category');
  const sortBy = searchParams.get('sort_by') || 'created_at';
  const sortOrder = searchParams.get('sort_order') === 'asc' ? 'asc' : 'desc';

  if (!(SORTABLE_FIELDS as readonly string[]).includes(sortBy)) {
    audit(400);
    return intakeFail(
      'VALIDATION_ERROR',
      `Invalid sort_by parameter. Allowed values: ${SORTABLE_FIELDS.join(', ')}`,
      400
    );
  }
  if (status && !(BUG_STATUSES as readonly string[]).includes(status)) {
    audit(400);
    return intakeFail(
      'VALIDATION_ERROR',
      `Invalid status filter. Allowed values: ${BUG_STATUSES.join(', ')}`,
      400
    );
  }

  // Scoped by app AND reporter, always. metadata.reporter_email is stored
  // lower-cased by the POST.
  let query = supabase
    .from('bug_reports')
    .select(REPORTER_BUG_SELECT, { count: 'exact' })
    .eq('application_id', app.id)
    .eq('metadata->>reporter_email', reporterEmail);

  if (status) query = query.eq('status', status);
  if (category) query = query.eq('category', category);
  const search = sanitizeSearch(searchParams.get('search'));
  if (search) {
    query = query.or(
      [
        `description.ilike.*${search}*`,
        `display_id.ilike.*${search}*`,
        `metadata->>title.ilike.*${search}*`,
      ].join(',')
    );
  }

  const from = (page - 1) * limit;
  const { data, error, count } = await query
    .order(sortBy, { ascending: sortOrder === 'asc' })
    .range(from, from + limit - 1);

  if (error) {
    logger.error('bug-reports/intake', 'Reporter list query failed', error);
    audit(500);
    return intakeFail('INTERNAL_ERROR', 'Failed to fetch bug reports', 500);
  }

  const total = count ?? 0;
  audit(200);
  return intakeOk({
    bug_reports: ((data ?? []) as unknown as Record<string, unknown>[]).map(minimalBug),
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  });
}

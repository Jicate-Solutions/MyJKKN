/**
 * GET /api/v1/public/bug-reports/[id] — one bug in the widget's "My bugs".
 *
 * Served from this static file: proxy.ts rewrites /api/v1/public/bug-reports/<id>
 * to /api/v1/public/bug-reports/item?id=<id> (lib/bug-reports/sibling-intake-rewrites.ts),
 * because a [id] route file costs two of Vercel's 2048 routes. The SDK's URL is unchanged.
 *
 * Same request and response as the central reporter's route
 * (Jicate-Solutions/BugReporter app/api/v1/public/bug-reports/[id]/route.ts):
 *   - header `X-API-Key: <bug-intake key>`
 *   - query: reporter_email (REQUIRED), include_messages (default true)
 *   - 200 `{ success: true, data: { bug_report, messages? } }`
 *   - 404 BUG_REPORT_NOT_FOUND, identical for "no such bug", "another app's
 *     bug" and "another reporter's bug"
 *
 * The bug comes back in the minimal view only (minimalBug): the reporter's
 * email is a claim, not a proof. The central PATCH (reporter notes) is not
 * offered here; see /messages.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  intakeCorsHeaders,
  minimalBug,
  normalizeReporterEmail,
} from '@/lib/bug-reports/sibling-intake';
import {
  auditIntakeRead,
  authenticateIntakeKey,
  intakeFail,
  intakeOk,
} from '@/lib/bug-reports/sibling-intake-auth';
import { fetchReporterMessages, findReporterBug } from '@/lib/bug-reports/sibling-intake-reads';

const ENDPOINT = '/api/v1/public/bug-reports/[id]';

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
  const id = searchParams.get('id') ?? '';
  const includeMessages = searchParams.get('include_messages') !== 'false';
  const reporterEmail = normalizeReporterEmail(searchParams.get('reporter_email'));
  if (!reporterEmail) {
    audit(400);
    return intakeFail('VALIDATION_ERROR', 'reporter_email is required.', 400);
  }

  if (!id) {
    audit(404);
    return intakeFail('BUG_REPORT_NOT_FOUND', 'Bug report not found', 404);
  }

  const { bug, error } = await findReporterBug(supabase, id, app.id, reporterEmail);
  if (error) {
    logger.error('bug-reports/intake', 'Reporter bug lookup failed', error);
    audit(500);
    return intakeFail('INTERNAL_ERROR', 'Failed to fetch bug report', 500);
  }
  if (!bug) {
    audit(404);
    return intakeFail('BUG_REPORT_NOT_FOUND', 'Bug report not found', 404);
  }

  let messages: Record<string, unknown>[] | undefined;
  if (includeMessages) {
    const result = await fetchReporterMessages(supabase, bug);
    if (result.error) {
      // Same as the central route: the bug is still worth showing.
      logger.warn('bug-reports/intake', 'Reporter messages fetch failed', result.error);
    }
    messages = result.messages;
  }

  audit(200);
  return intakeOk({ bug_report: minimalBug(bug), messages });
}

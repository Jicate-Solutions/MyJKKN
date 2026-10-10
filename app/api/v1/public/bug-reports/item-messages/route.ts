/**
 * /api/v1/public/bug-reports/[id]/messages — the reporter's conversation on
 * their own bug, for the widget's "My bugs" drawer.
 *
 * Served from this static file: proxy.ts rewrites /api/v1/public/bug-reports/<id>/messages
 * to /api/v1/public/bug-reports/item-messages?id=<id> (lib/bug-reports/sibling-intake-rewrites.ts),
 * because a [id] route file costs two of Vercel's 2048 routes. The SDK's URL is unchanged.
 *
 * GET: same request and response as the central reporter's route
 * (Jicate-Solutions/BugReporter app/api/v1/public/bug-reports/[id]/messages):
 *   - header `X-API-Key: <bug-intake key>`, query reporter_email (REQUIRED)
 *   - 200 `{ success: true, data: { messages } }`, 404 BUG_REPORT_NOT_FOUND
 *     when the bug is not this app's AND this reporter's
 *   Read from MyJKKN's bug_report_messages, internal and deleted messages
 *   left out, each author reduced to 'reporter' or 'team'.
 *
 * POST: 501 NOT_IMPLEMENTED. bug_report_messages.sender_user_id is NOT NULL
 * and the table has no column for an author without a MyJKKN account. Writing
 * the message as the profile the claimed email matched would let anyone who
 * knows a colleague's email post in that colleague's name, because the key is
 * public and the email unverified. Reporter replies need an author column
 * (author_kind / author_email, as the central reporter has) — a schema change
 * left for when the HELD intake migration is reviewed.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { logger } from '@/lib/utils/enhanced-logger';
import { intakeCorsHeaders, normalizeReporterEmail } from '@/lib/bug-reports/sibling-intake';
import {
  auditIntakeRead,
  authenticateIntakeKey,
  intakeFail,
  intakeOk,
} from '@/lib/bug-reports/sibling-intake-auth';
import { fetchReporterMessages, findReporterBug } from '@/lib/bug-reports/sibling-intake-reads';

const ENDPOINT = '/api/v1/public/bug-reports/[id]/messages';

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
    return intakeFail('INTERNAL_ERROR', 'Failed to fetch messages', 500);
  }
  if (!bug) {
    audit(404);
    return intakeFail('BUG_REPORT_NOT_FOUND', 'Bug report not found', 404);
  }

  const result = await fetchReporterMessages(supabase, bug);
  if (result.error) {
    logger.error('bug-reports/intake', 'Reporter messages fetch failed', result.error);
    audit(500);
    return intakeFail('INTERNAL_ERROR', 'Failed to fetch messages', 500);
  }

  audit(200);
  return intakeOk({ messages: result.messages });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const { ipAddress, userAgent } = extractRequestMeta(request);

  // Wrong, admin and personal keys are still refused first, and the caller is
  // still rate-limited, so this route answers nothing more than it must.
  const auth = await authenticateIntakeKey(request, {
    rateLimitBucket: 'bug-intake-read',
    rateLimitedMessage: 'Too many requests. Please try again in a minute.',
    ipAddress,
  });
  if ('response' in auth) return auth.response;

  auditIntakeRead({ keyId: auth.keyId, endpoint: ENDPOINT, statusCode: 501, startTime, ipAddress, userAgent });
  return intakeFail(
    'NOT_IMPLEMENTED',
    'Replies from the app are not available yet. The JKKN team will reply here when they pick up your bug.',
    501
  );
}

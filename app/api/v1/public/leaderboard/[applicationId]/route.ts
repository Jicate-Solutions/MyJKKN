/**
 * GET /api/v1/public/leaderboard/[applicationId] — the SDK's leaderboard tab,
 * for the college apps that file bugs into MyJKKN with a bug-intake key.
 *
 * MyJKKN runs no leaderboard for the college apps, so this answers the
 * central reporter's "switched off" shape and nothing else:
 *   200 `{ success: true, data: { enabled: false, leaderboard: [], period, message } }`
 * The SDK then shows "Leaderboard is disabled" instead of an error.
 *
 * The path id is not compared with the key's app (the central route 403s on
 * a mismatch): the apps were configured with the central reporter's
 * application id, which is not a sibling_apps id, and nothing is returned
 * either way. The key is still checked and the caller rate-limited.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { intakeCorsHeaders } from '@/lib/bug-reports/sibling-intake';
import {
  auditIntakeRead,
  authenticateIntakeKey,
  intakeFail,
  intakeOk,
} from '@/lib/bug-reports/sibling-intake-auth';

const ENDPOINT = '/api/v1/public/leaderboard/[applicationId]';
const PERIODS = ['all-time', 'weekly', 'monthly'];

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
  const audit = (statusCode: number) =>
    auditIntakeRead({ keyId: auth.keyId, endpoint: ENDPOINT, statusCode, startTime, ipAddress, userAgent });

  const period = new URL(request.url).searchParams.get('period') || 'all-time';
  if (!PERIODS.includes(period)) {
    audit(400);
    return intakeFail('VALIDATION_ERROR', 'Invalid period. Must be one of: all-time, weekly, monthly', 400);
  }

  audit(200);
  return intakeOk({
    enabled: false,
    leaderboard: [],
    period,
    message: 'There is no bug leaderboard for this app.',
  });
}

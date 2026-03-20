import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { createServiceRoleClient } from '@/lib/supabase/server';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Step 1: Authenticate
  const authResult = await authenticateApiKey(request, { requiredModule: 'attendance' });
  if ('error' in authResult) return authResult.error;
  const { context } = authResult;

  // Step 2: Rate limit
  const rateLimitResult = checkRateLimit(context.keyId);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' } },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString(),
          'Retry-After': String(Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    );
  }

  // Step 3: Resolve institution scope
  const institutionId = resolveInstitutionId(context, request);

  // Step 4: Extract request meta ONCE — used in audit log regardless of outcome
  const { ipAddress, userAgent } = extractRequestMeta(request);

  // Parse and validate query params
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  if (!from || !to) {
    logApiUsage({
      apiKeyId: context.keyId,
      endpoint: '/api/b2a/attendance/trend',
      module: 'attendance',
      institutionId,
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
      ipAddress,
      userAgent,
    });
    return NextResponse.json(
      { error: { code: 'MISSING_PARAMS', message: 'Both ?from and ?to query parameters are required (YYYY-MM-DD).' } },
      { status: 400 }
    );
  }

  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    logApiUsage({
      apiKeyId: context.keyId,
      endpoint: '/api/b2a/attendance/trend',
      module: 'attendance',
      institutionId,
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
      ipAddress,
      userAgent,
    });
    return NextResponse.json(
      { error: { code: 'INVALID_DATE', message: 'Invalid date format. Use YYYY-MM-DD for both ?from and ?to.' } },
      { status: 400 }
    );
  }

  if (from > to) {
    logApiUsage({
      apiKeyId: context.keyId,
      endpoint: '/api/b2a/attendance/trend',
      module: 'attendance',
      institutionId,
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
      ipAddress,
      userAgent,
    });
    return NextResponse.json(
      { error: { code: 'INVALID_DATE_RANGE', message: '?from must not be after ?to.' } },
      { status: 400 }
    );
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 90) {
    logApiUsage({
      apiKeyId: context.keyId,
      endpoint: '/api/b2a/attendance/trend',
      module: 'attendance',
      institutionId,
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
      ipAddress,
      userAgent,
    });
    return NextResponse.json(
      { error: { code: 'RANGE_TOO_WIDE', message: 'Date range cannot exceed 90 days. Use ?from=YYYY-MM-DD&to=YYYY-MM-DD within a 90-day window.' } },
      { status: 400 }
    );
  }

  // Step 5: Fetch data
  let trend: Record<string, number> = {};
  let statusCode = 200;
  let errorResponse: NextResponse | null = null;

  try {
    const supabase = createServiceRoleClient();

    let query = supabase
      .from('student_attendance')
      .select('attendance_date')
      .gte('attendance_date', from)
      .lte('attendance_date', to)
      .order('attendance_date', { ascending: true });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    query = query.limit(10000); // Safety cap: max 10K rows. Use DB aggregation for larger ranges.

    const { data, error } = await query;

    if (error) {
      statusCode = 500;
      errorResponse = NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch attendance trend data.' } },
        { status: 500 }
      );
    } else {
      trend = (data ?? []).reduce<Record<string, number>>((acc, row) => {
        const d = row.attendance_date as string;
        acc[d] = (acc[d] ?? 0) + 1;
        return acc;
      }, {});
    }
  } catch {
    statusCode = 500;
    errorResponse = NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch attendance trend data.' } },
      { status: 500 }
    );
  }

  // Step 6: Single audit log call — always fires, success AND error paths
  logApiUsage({
    apiKeyId: context.keyId,
    endpoint: '/api/b2a/attendance/trend',
    module: 'attendance',
    institutionId,
    statusCode,
    responseTimeMs: Date.now() - startTime,
    ipAddress,
    userAgent,
  });

  // Step 7: Return error or success
  if (errorResponse) return errorResponse;

  return NextResponse.json(
    {
      success: true,
      data: { from, to, trend },
    },
    {
      status: 200,
      headers: {
        'X-RateLimit-Limit': '60',
        'X-RateLimit-Remaining': String(rateLimitResult.remaining),
        'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString(),
        'Cache-Control': 'no-store',
      },
    }
  );
}

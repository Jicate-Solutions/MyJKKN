import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Step 1: Authenticate
  const authResult = await authenticateApiKey(request, { requiredModule: 'okr' });
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

  // Step 3: Resolve institution scope (resolved for audit log context; not applied to check-ins table)
  const institutionId = resolveInstitutionId(context, request);

  // Step 4: Extract request meta ONCE — used in audit log regardless of outcome
  const { ipAddress, userAgent } = extractRequestMeta(request);

  // Parse and validate query params
  const url = new URL(request.url);
  const yearParam = url.searchParams.get('year');
  const weekParam = url.searchParams.get('week');

  // year is required
  if (!yearParam) {
    logApiUsage({
      apiKeyId: context.keyId,
      endpoint: '/api/b2a/okr/compliance',
      module: 'okr',
      institutionId,
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
      ipAddress,
      userAgent,
    });
    return NextResponse.json(
      { error: { code: 'MISSING_PARAM', message: 'year parameter is required.' } },
      { status: 400 }
    );
  }

  const year = parseInt(yearParam, 10);
  if (isNaN(year) || year < 2000 || year > 2100) {
    logApiUsage({
      apiKeyId: context.keyId,
      endpoint: '/api/b2a/okr/compliance',
      module: 'okr',
      institutionId,
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
      ipAddress,
      userAgent,
    });
    return NextResponse.json(
      { error: { code: 'INVALID_PARAM', message: 'year must be an integer between 2000 and 2100.' } },
      { status: 400 }
    );
  }

  // week is optional; if provided must be 1–53
  let week: number | null = null;
  if (weekParam !== null) {
    const parsedWeek = parseInt(weekParam, 10);
    if (isNaN(parsedWeek) || parsedWeek < 1 || parsedWeek > 53) {
      logApiUsage({
        apiKeyId: context.keyId,
        endpoint: '/api/b2a/okr/compliance',
        module: 'okr',
        institutionId,
        statusCode: 400,
        responseTimeMs: Date.now() - startTime,
        ipAddress,
        userAgent,
      });
      return NextResponse.json(
        { error: { code: 'INVALID_PARAM', message: 'week must be an integer between 1 and 53.' } },
        { status: 400 }
      );
    }
    week = parsedWeek;
  }

  // Step 5: Fetch aggregate counts in parallel
  // NOTE: okr_check_ins has NO institution_id column — do NOT apply institution scoping
  type ComplianceData = {
    year: number;
    week: number | null;
    summary: {
      total: number;
      completed: number;
      overdue: number;
      blockersRaised: number;
      complianceRate: number;
    };
  };

  let complianceData: ComplianceData | null = null;
  let statusCode = 200;
  let errorResponse: NextResponse | null = null;

  try {
    const supabase = createServiceRoleClient();

    // Query 1: Total check-ins for the period
    const totalQuery = (() => {
      let q = supabase
        .from('okr_check_ins')
        .select('id', { count: 'exact', head: true })
        .eq('year', year);
      if (week !== null) q = q.eq('week_number', week);
      return q;
    })();

    // Query 2: Completed check-ins
    const completedQuery = (() => {
      let q = supabase
        .from('okr_check_ins')
        .select('id', { count: 'exact', head: true })
        .eq('year', year)
        .eq('is_completed', true);
      if (week !== null) q = q.eq('week_number', week);
      return q;
    })();

    // Query 3: Overdue check-ins
    const overdueQuery = (() => {
      let q = supabase
        .from('okr_check_ins')
        .select('id', { count: 'exact', head: true })
        .eq('year', year)
        .eq('is_overdue', true);
      if (week !== null) q = q.eq('week_number', week);
      return q;
    })();

    // Query 4: Blocker-flagged check-ins
    const blockerQuery = (() => {
      let q = supabase
        .from('okr_check_ins')
        .select('id', { count: 'exact', head: true })
        .eq('year', year)
        .eq('blocker_flagged', true);
      if (week !== null) q = q.eq('week_number', week);
      return q;
    })();

    const [
      totalResult,
      completedResult,
      overdueResult,
      blockerResult,
    ] = await Promise.all([
      totalQuery,
      completedQuery,
      overdueQuery,
      blockerQuery,
    ]);

    // Check ALL 4 results for errors
    const firstError = [totalResult, completedResult, overdueResult, blockerResult]
      .find(r => r.error)?.error;

    if (firstError) {
      statusCode = 500;
      errorResponse = NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch OKR compliance data.' } },
        { status: 500 }
      );
    } else {
      const total = totalResult.count ?? 0;
      const completed = completedResult.count ?? 0;
      const overdue = overdueResult.count ?? 0;
      const blockersRaised = blockerResult.count ?? 0;

      const complianceRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

      complianceData = {
        year,
        week,
        summary: {
          total,
          completed,
          overdue,
          blockersRaised,
          complianceRate,
        },
      };
    }
  } catch {
    statusCode = 500;
    errorResponse = NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch OKR compliance data.' } },
      { status: 500 }
    );
  }

  // Step 6: Single audit log call — always fires, success AND error paths
  logApiUsage({
    apiKeyId: context.keyId,
    endpoint: '/api/b2a/okr/compliance',
    module: 'okr',
    institutionId,
    statusCode,
    responseTimeMs: Date.now() - startTime,
    ipAddress,
    userAgent,
  });

  // Step 7: Return error or success
  if (errorResponse) return errorResponse;

  return NextResponse.json(
    { success: true, data: complianceData! },
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

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Step 1: Authenticate
  const authResult = await authenticateApiKey(request, { requiredModule: 'grievance' });
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

  // Step 5: Fetch aggregate counts in parallel — one query per status
  type DashboardData = {
    byStatus: {
      draft: number;
      submitted: number;
      in_review: number;
      approved: number;
      rejected: number;
      returned: number;
      fulfilled: number;
      closed: number;
      cancelled: number;
    };
    summary: {
      total: number;
      active: number;
      completed: number;
      resolutionRate: number;
    };
  };

  let dashboardData: DashboardData | null = null;
  let statusCode = 200;
  let errorResponse: NextResponse | null = null;

  try {
    const supabase = createServiceRoleClient();

    const makeCountQuery = (status: string) => {
      let q = supabase
        .from('service_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', status);
      if (institutionId !== null) {
        q = q.eq('institution_id', institutionId);
      }
      return q;
    };

    const [
      draftResult,
      submittedResult,
      inReviewResult,
      approvedResult,
      rejectedResult,
      returnedResult,
      fulfilledResult,
      closedResult,
      cancelledResult,
    ] = await Promise.all([
      makeCountQuery('draft'),
      makeCountQuery('submitted'),
      makeCountQuery('in_review'),
      makeCountQuery('approved'),
      makeCountQuery('rejected'),
      makeCountQuery('returned'),
      makeCountQuery('fulfilled'),
      makeCountQuery('closed'),
      makeCountQuery('cancelled'),
    ]);

    // Check ALL 9 results for errors
    const firstError = [
      draftResult,
      submittedResult,
      inReviewResult,
      approvedResult,
      rejectedResult,
      returnedResult,
      fulfilledResult,
      closedResult,
      cancelledResult,
    ].find(r => r.error)?.error;

    if (firstError) {
      statusCode = 500;
      errorResponse = NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch grievance dashboard data.' } },
        { status: 500 }
      );
    } else {
      const draft = draftResult.count ?? 0;
      const submitted = submittedResult.count ?? 0;
      const in_review = inReviewResult.count ?? 0;
      const approved = approvedResult.count ?? 0;
      const rejected = rejectedResult.count ?? 0;
      const returned = returnedResult.count ?? 0;
      const fulfilled = fulfilledResult.count ?? 0;
      const closed = closedResult.count ?? 0;
      const cancelled = cancelledResult.count ?? 0;

      const total = draft + submitted + in_review + approved + rejected + returned + fulfilled + closed + cancelled;
      const active = submitted + in_review;
      const completed = approved + fulfilled + closed;
      const resolutionRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

      dashboardData = {
        byStatus: {
          draft,
          submitted,
          in_review,
          approved,
          rejected,
          returned,
          fulfilled,
          closed,
          cancelled,
        },
        summary: {
          total,
          active,
          completed,
          resolutionRate,
        },
      };
    }
  } catch {
    statusCode = 500;
    errorResponse = NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch grievance dashboard data.' } },
      { status: 500 }
    );
  }

  // Step 6: Single audit log call — always fires, success AND error paths
  logApiUsage({
    apiKeyId: context.keyId,
    endpoint: '/api/b2a/grievance/dashboard',
    module: 'grievance',
    institutionId,
    statusCode,
    responseTimeMs: Date.now() - startTime,
    ipAddress,
    userAgent,
  });

  // Step 7: Return error or success
  if (errorResponse) return errorResponse;

  return NextResponse.json(
    { success: true, data: dashboardData! },
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

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Step 1: Authenticate
  const authResult = await authenticateApiKey(request, { requiredModule: 'admission' });
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

  // Step 5: Fetch aggregate stats
  type StatsData = {
    total: number;
    byStatus: { pending: number; approved: number; enrolled: number; rejected: number };
    conversionRate: number;
  };

  let statsData: StatsData | null = null;
  let statusCode = 200;
  let errorResponse: NextResponse | null = null;

  try {
    const supabase = createServiceRoleClient();

    const buildQuery = (statusFilter?: string) => {
      let q = supabase
        .from('admissions')
        .select('id', { count: 'exact', head: true });

      if (institutionId) {
        q = q.eq('institution_id', institutionId);
      }

      if (statusFilter) {
        q = q.eq('status', statusFilter);
      }

      return q;
    };

    const [totalResult, pendingResult, approvedResult, enrolledResult, rejectedResult] =
      await Promise.all([
        buildQuery(),
        buildQuery('pending'),
        buildQuery('approved'),
        buildQuery('enrolled'),
        buildQuery('rejected'),
      ]);

    const firstError = [totalResult, pendingResult, approvedResult, enrolledResult, rejectedResult]
      .find(r => r.error)?.error;

    if (firstError) {
      statusCode = 500;
      errorResponse = NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch admission stats.' } },
        { status: 500 }
      );
    } else {
      const total = totalResult.count ?? 0;
      const pending = pendingResult.count ?? 0;
      const approved = approvedResult.count ?? 0;
      const enrolled = enrolledResult.count ?? 0;
      const rejected = rejectedResult.count ?? 0;

      const conversionRate = total > 0 ? Math.round((enrolled / total) * 1000) / 10 : 0;

      statsData = {
        total,
        byStatus: { pending, approved, enrolled, rejected },
        conversionRate,
      };
    }
  } catch {
    statusCode = 500;
    errorResponse = NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch admission stats.' } },
      { status: 500 }
    );
  }

  // Step 6: Single audit log call — always fires, success AND error paths
  logApiUsage({
    apiKeyId: context.keyId,
    endpoint: '/api/b2a/admission/stats',
    module: 'admission',
    institutionId,
    statusCode,
    responseTimeMs: Date.now() - startTime,
    ipAddress,
    userAgent,
  });

  // Step 7: Return error or success
  if (errorResponse) return errorResponse;

  return NextResponse.json(
    { success: true, data: statsData! },
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

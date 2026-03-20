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

  // Step 3: Resolve institution scope
  const institutionId = resolveInstitutionId(context, request);

  // Step 4: Extract request meta ONCE — used in audit log regardless of outcome
  const { ipAddress, userAgent } = extractRequestMeta(request);

  // Step 5: Fetch aggregate data in parallel
  type StatsData = {
    byStatus: {
      draft: number;
      active: number;
      completed: number;
      archived: number;
    };
    summary: {
      total: number;
      completionRate: number;
      avgProgress: number;
    };
  };

  let statsData: StatsData | null = null;
  let statusCode = 200;
  let errorResponse: NextResponse | null = null;

  try {
    const supabase = createServiceRoleClient();

    // Query 1: Count of draft objectives
    const draftCountQuery = (() => {
      let q = supabase
        .from('okr_objectives')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'draft');
      if (institutionId) q = q.eq('institution_id', institutionId);
      return q;
    })();

    // Query 2: Count of active objectives
    const activeCountQuery = (() => {
      let q = supabase
        .from('okr_objectives')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');
      if (institutionId) q = q.eq('institution_id', institutionId);
      return q;
    })();

    // Query 3: Count of completed objectives
    const completedCountQuery = (() => {
      let q = supabase
        .from('okr_objectives')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed');
      if (institutionId) q = q.eq('institution_id', institutionId);
      return q;
    })();

    // Query 4: Count of archived objectives
    const archivedCountQuery = (() => {
      let q = supabase
        .from('okr_objectives')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'archived');
      if (institutionId) q = q.eq('institution_id', institutionId);
      return q;
    })();

    // Query 5: overall_progress values for active objectives (to compute average in JS)
    const progressQuery = (() => {
      let q = supabase
        .from('okr_objectives')
        .select('overall_progress')
        .eq('status', 'active')
        .limit(5000);
      if (institutionId) q = q.eq('institution_id', institutionId);
      return q;
    })();

    const [
      draftResult,
      activeResult,
      completedResult,
      archivedResult,
      progressResult,
    ] = await Promise.all([
      draftCountQuery,
      activeCountQuery,
      completedCountQuery,
      archivedCountQuery,
      progressQuery,
    ]);

    // Check ALL 5 results for errors
    const firstError = [draftResult, activeResult, completedResult, archivedResult, progressResult]
      .find(r => r.error)?.error;

    if (firstError) {
      statusCode = 500;
      errorResponse = NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch OKR statistics.' } },
        { status: 500 }
      );
    } else {
      const draft = draftResult.count ?? 0;
      const active = activeResult.count ?? 0;
      const completed = completedResult.count ?? 0;
      const archived = archivedResult.count ?? 0;

      const total = draft + active + completed + archived;
      const completionRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

      // Compute average progress from active objectives — typeof guard required
      const values = (progressResult.data ?? [])
        .map(r => r.overall_progress)
        .filter((v): v is number => typeof v === 'number');
      const avgProgress =
        values.length > 0
          ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
          : 0;

      statsData = {
        byStatus: {
          draft,
          active,
          completed,
          archived,
        },
        summary: {
          total,
          completionRate,
          avgProgress,
        },
      };
    }
  } catch {
    statusCode = 500;
    errorResponse = NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch OKR statistics.' } },
      { status: 500 }
    );
  }

  // Step 6: Single audit log call — always fires, success AND error paths
  logApiUsage({
    apiKeyId: context.keyId,
    endpoint: '/api/b2a/okr/stats',
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

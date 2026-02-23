import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { createServiceRoleClient } from '@/lib/supabase/server';

const VALID_STATUSES = ['draft', 'active', 'completed', 'archived'] as const;
type OkrObjectiveStatus = typeof VALID_STATUSES[number];

const VALID_TIERS = ['tier_1', 'tier_2', 'tier_3'] as const;
type OkrObjectiveTier = typeof VALID_TIERS[number];

const VALID_CYCLE_TYPES = ['annual', 'quarterly', 'semester'] as const;
type OkrObjectiveCycleType = typeof VALID_CYCLE_TYPES[number];

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

  // Parse query params
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20));
  const statusParam = url.searchParams.get('status');
  const tierParam = url.searchParams.get('tier');
  const cycleTypeParam = url.searchParams.get('cycle_type');
  const offset = (page - 1) * limit;

  // Validate status param — invalid values silently ignored (no filter applied)
  const status: OkrObjectiveStatus | null =
    statusParam && (VALID_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as OkrObjectiveStatus)
      : null;

  // Validate tier param — invalid values silently ignored
  const tier: OkrObjectiveTier | null =
    tierParam && (VALID_TIERS as readonly string[]).includes(tierParam)
      ? (tierParam as OkrObjectiveTier)
      : null;

  // Validate cycle_type param — invalid values silently ignored
  const cycleType: OkrObjectiveCycleType | null =
    cycleTypeParam && (VALID_CYCLE_TYPES as readonly string[]).includes(cycleTypeParam)
      ? (cycleTypeParam as OkrObjectiveCycleType)
      : null;

  // Step 5: Fetch data
  type OkrObjectiveRow = {
    id: string;
    title: string;
    description: string | null;
    tier: string;
    level: string;
    owner_id: string;
    institution_id: string | null;
    department_id: string | null;
    cycle_type: string;
    start_date: string;
    end_date: string;
    status: string;
    overall_progress: number;
    created_by: string;
    approved_by: string | null;
    approved_at: string | null;
    created_at: string;
    updated_at: string;
  };

  let items: OkrObjectiveRow[] = [];
  let total = 0;
  let statusCode = 200;
  let errorResponse: NextResponse | null = null;

  try {
    const supabase = createServiceRoleClient();

    let query = supabase
      .from('okr_objectives')
      .select(
        'id, title, description, tier, level, owner_id, institution_id, department_id, ' +
        'cycle_type, start_date, end_date, status, overall_progress, created_by, ' +
        'approved_by, approved_at, created_at, updated_at',
        { count: 'exact' }
      );

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (tier) {
      query = query.eq('tier', tier);
    }

    if (cycleType) {
      query = query.eq('cycle_type', cycleType);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      statusCode = 500;
      errorResponse = NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch OKR objectives.' } },
        { status: 500 }
      );
    } else {
      items = (data ?? []) as unknown as OkrObjectiveRow[]; // required: Supabase infers GenericStringError[] with multiple chained .eq() calls
      total = count ?? 0;
    }
  } catch {
    statusCode = 500;
    errorResponse = NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch OKR objectives.' } },
      { status: 500 }
    );
  }

  // Step 6: Single audit log call — always fires, success AND error paths
  logApiUsage({
    apiKeyId: context.keyId,
    endpoint: '/api/b2a/okr/objectives',
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
    {
      success: true,
      data: {
        items,
        total,
        page,
        limit,
        hasMore: offset + items.length < total,
      },
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

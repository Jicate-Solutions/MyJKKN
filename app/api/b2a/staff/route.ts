import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { createServiceRoleClient } from '@/lib/supabase/server';

type StaffRow = {
  id: string;
  staff_id: string | null;
  first_name: string;
  last_name: string;
  gender: string;
  designation: string;
  role_type: string | null;
  institution_id: string;
  department_id: string;
  category_id: string;
  institution_email: string;
  email: string;
  is_active: boolean | null;
  date_of_joining: string;
  created_at: string;
  updated_at: string;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Step 1: Authenticate
  const authResult = await authenticateApiKey(request, { requiredModule: 'staff' });
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
  const isActiveParam = url.searchParams.get('is_active');
  const departmentId = url.searchParams.get('department_id');
  const designation = url.searchParams.get('designation');
  const offset = (page - 1) * limit;

  // Convert is_active to boolean — silently ignore any value that is not 'true' or 'false'
  const isActive: boolean | null =
    isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : null;

  // Step 5: Fetch data
  let items: StaffRow[] = [];
  let total = 0;
  let statusCode = 200;
  let errorResponse: NextResponse | null = null;

  try {
    const supabase = createServiceRoleClient();

    let query = supabase
      .from('staff')
      .select(
        'id, staff_id, first_name, last_name, gender, designation, role_type, ' +
        'institution_id, department_id, category_id, institution_email, email, ' +
        'is_active, date_of_joining, created_at, updated_at',
        { count: 'exact' }
      );

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    if (isActive !== null) {
      query = query.eq('is_active', isActive);
    }

    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }

    if (designation) {
      query = query.ilike('designation', `%${designation}%`);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      statusCode = 500;
      errorResponse = NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch staff records.' } },
        { status: 500 }
      );
    } else {
      items = (data ?? []) as unknown as StaffRow[]; // required: Supabase infers GenericStringError[] with multiple chained .eq() calls
      total = count ?? 0;
    }
  } catch {
    statusCode = 500;
    errorResponse = NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch staff records.' } },
      { status: 500 }
    );
  }

  // Step 6: Single audit log call — always fires, success AND error paths
  logApiUsage({
    apiKeyId: context.keyId,
    endpoint: '/api/b2a/staff',
    module: 'staff',
    institutionId,
    statusCode,
    responseTimeMs: Date.now() - startTime,
    ipAddress,
    userAgent,
  });

  // Return error or success
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

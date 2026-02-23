import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { createServiceRoleClient } from '@/lib/supabase/server';

const VALID_LIFECYCLE_STATUSES = [
  'enquiry',
  'pending',
  'approved',
  'rejected',
  'waitlisted',
  'active',
  'inactive',
  'exited',
  'graduated',
  'alumni',
] as const;

type LearnerRow = {
  id: string;
  application_id: string | null;
  lifecycle_status: string;
  first_name: string;
  last_name: string | null;
  gender: string;
  institution_id: string | null;
  degree_id: string | null;
  department_id: string | null;
  program_id: string | null;
  semester_id: string | null;
  section_id: string | null;
  academic_year_id: string | null;
  batch_id: string | null;
  roll_number: string | null;
  register_number: string | null;
  college_email: string | null;
  student_email: string;
  is_profile_complete: boolean;
  admission_year: number | null;
  created_at: string;
  updated_at: string;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Step 1: Authenticate
  const authResult = await authenticateApiKey(request, { requiredModule: 'learners' });
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
  const lifecycleStatusParam = url.searchParams.get('lifecycle_status');
  const departmentId = url.searchParams.get('department_id');
  const semesterId = url.searchParams.get('semester_id');
  const offset = (page - 1) * limit;

  // Validate lifecycle_status against allowlist — silently ignore invalid values
  const lifecycleStatus: string | null =
    lifecycleStatusParam &&
    (VALID_LIFECYCLE_STATUSES as readonly string[]).includes(lifecycleStatusParam)
      ? lifecycleStatusParam
      : null;

  // Step 5: Fetch data
  let items: LearnerRow[] = [];
  let total = 0;
  let statusCode = 200;
  let errorResponse: NextResponse | null = null;

  try {
    const supabase = createServiceRoleClient();

    let query = supabase
      .from('learners_profiles')
      .select(
        'id, application_id, lifecycle_status, first_name, last_name, gender, ' +
        'institution_id, degree_id, department_id, program_id, semester_id, section_id, ' +
        'academic_year_id, batch_id, roll_number, register_number, college_email, ' +
        'student_email, is_profile_complete, admission_year, created_at, updated_at',
        { count: 'exact' }
      );

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    if (lifecycleStatus) {
      query = query.eq('lifecycle_status', lifecycleStatus);
    }

    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }

    if (semesterId) {
      query = query.eq('semester_id', semesterId);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      statusCode = 500;
      errorResponse = NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch learner records.' } },
        { status: 500 }
      );
    } else {
      items = (data ?? []) as unknown as LearnerRow[]; // required: Supabase infers GenericStringError[] with multiple chained .eq() calls
      total = count ?? 0;
    }
  } catch {
    statusCode = 500;
    errorResponse = NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch learner records.' } },
      { status: 500 }
    );
  }

  // Step 6: Single audit log call — always fires, success AND error paths
  logApiUsage({
    apiKeyId: context.keyId,
    endpoint: '/api/b2a/learners',
    module: 'learners',
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

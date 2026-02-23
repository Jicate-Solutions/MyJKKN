import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { createServiceRoleClient } from '@/lib/supabase/server';

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

  // Today's date
  const today = new Date().toISOString().split('T')[0];

  // Step 5: Fetch data
  type SectionRow = {
    id: string;
    section_name: string;
    semester_id: string | null;
    program_id: string | null;
    department_id: string | null;
    degree_id: string | null;
    institution_id: string;
  };

  let pendingSections: SectionRow[] = [];
  let statusCode = 200;
  let errorResponse: NextResponse | null = null;

  try {
    const supabase = createServiceRoleClient();

    // Fetch in parallel: sections that already have attendance today + all active sections
    let markedQuery = supabase
      .from('student_attendance')
      .select('section_id')
      .eq('attendance_date', today);

    let sectionsQuery = supabase
      .from('sections')
      .select('id, section_name, semester_id, program_id, department_id, degree_id, institution_id')
      .eq('is_active', true);

    if (institutionId) {
      markedQuery = markedQuery.eq('institution_id', institutionId);
      sectionsQuery = sectionsQuery.eq('institution_id', institutionId);
    }

    markedQuery = markedQuery.limit(5000); // Cap: single-day attendance records per institution
    sectionsQuery = sectionsQuery.limit(2000); // Cap: active sections per institution

    const [markedResult, sectionsResult] = await Promise.all([markedQuery, sectionsQuery]);

    const failedResult = [markedResult, sectionsResult].find((r) => r.error);
    if (failedResult?.error) {
      statusCode = 500;
      errorResponse = NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch pending attendance data.' } },
        { status: 500 }
      );
    } else {
      const markedSectionIds = new Set(
        (markedResult.data ?? []).map((r) => r.section_id as string)
      );

      pendingSections = ((sectionsResult.data ?? []) as SectionRow[]).filter(
        (s) => !markedSectionIds.has(s.id)
      );
    }
  } catch {
    statusCode = 500;
    errorResponse = NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch pending attendance data.' } },
      { status: 500 }
    );
  }

  // Step 6: Single audit log call — always fires, success AND error paths
  logApiUsage({
    apiKeyId: context.keyId,
    endpoint: '/api/b2a/attendance/pending',
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
      data: {
        date: today,
        pendingCount: pendingSections.length,
        sections: pendingSections,
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

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

  const { id } = await params;

  // Validate UUID format — Postgres throws 22P02 on invalid UUIDs, which maps to 500
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(id)) {
    logApiUsage({
      apiKeyId: context.keyId,
      endpoint: `/api/b2a/admission/${id}`,
      module: 'admission',
      institutionId,
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
      ipAddress,
      userAgent,
    });
    return NextResponse.json(
      { error: { code: 'INVALID_ID', message: 'Invalid record ID format.' } },
      { status: 400 }
    );
  }

  // Step 5: Fetch single record
  interface AdmissionDetail {
    id: string;
    first_name: string | null;
    last_name: string | null;
    student_email: string | null;
    student_mobile: string | null;
    status: string | null;
    application_id: string | null;
    father_name: string | null;
    father_occupation: string | null;
    father_mobile: string | null;
    mother_name: string | null;
    mother_occupation: string | null;
    mother_mobile: string | null;
    date_of_birth: string | null;
    gender: string | null;
    religion: string | null;
    community: string | null;
    caste: string | null;
    annual_income: string | null;
    last_school: string | null;
    board_of_study: string | null;
    quota: string | null;
    category: string | null;
    entry_type: string | null;
    permanent_address_street: string | null;
    permanent_address_taluk: string | null;
    permanent_address_district: string | null;
    permanent_address_pin_code: string | null;
    permanent_address_state: string | null;
    accommodation_type: string | null;
    hostel_type: string | null;
    reference_type: string | null;
    reference_name: string | null;
    reference_contact: string | null;
    counseling_applied: boolean | null;
    counseling_number: string | null;
    first_graduate: boolean | null;
    degree_id: string | null;
    department_id: string | null;
    program_id: string | null;
    institution_id: string | null;
    created_at: string;
    updated_at: string | null;
  }

  let record: AdmissionDetail | null = null;
  let statusCode = 200;
  let errorResponse: NextResponse | null = null;

  try {
    const supabase = createServiceRoleClient();

    let query = supabase
      .from('admissions')
      .select(
        'id, first_name, last_name, student_email, student_mobile, status, application_id, ' +
        'father_name, father_occupation, father_mobile, mother_name, mother_occupation, mother_mobile, ' +
        'date_of_birth, gender, religion, community, caste, annual_income, ' +
        'last_school, board_of_study, quota, category, entry_type, ' +
        'permanent_address_street, permanent_address_taluk, permanent_address_district, ' +
        'permanent_address_pin_code, permanent_address_state, ' +
        'accommodation_type, hostel_type, reference_type, reference_name, reference_contact, ' +
        'counseling_applied, counseling_number, first_graduate, ' +
        'degree_id, department_id, program_id, institution_id, ' +
        'created_at, updated_at'
      )
      .eq('id', id);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        statusCode = 404;
        errorResponse = NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Admission record not found.' } },
          { status: 404 }
        );
      } else {
        statusCode = 500;
        errorResponse = NextResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch admission record.' } },
          { status: 500 }
        );
      }
    } else {
      record = data as unknown as AdmissionDetail;
    }
  } catch {
    statusCode = 500;
    errorResponse = NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch admission record.' } },
      { status: 500 }
    );
  }

  // Step 6: Single audit log call — always fires, success AND error paths
  logApiUsage({
    apiKeyId: context.keyId,
    endpoint: `/api/b2a/admission/${id}`,
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
    { success: true, data: record! },
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

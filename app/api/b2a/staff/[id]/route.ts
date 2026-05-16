export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { createServiceRoleClient } from '@/lib/supabase/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

  const { id } = await params;

  // Validate UUID format — Postgres throws 22P02 on invalid UUIDs, which maps to 500
  if (!UUID_REGEX.test(id)) {
    logApiUsage({
      apiKeyId: context.keyId,
      endpoint: `/api/b2a/staff/${id}`,
      module: 'staff',
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
  // Detail endpoint returns the full staff record, including the 29 extended-profile
  // columns. Whether they are MEANINGFUL is signalled by:
  //   • has_extended_profile (per-staff opt-in, set on save)
  //   • category.shows_extended_profile (category-level default that controls
  //     visibility of the extended-profile toggle in the staff form)
  // Consumers should treat extended-profile columns as semantically null when both
  // flags are false. JSONB columns default to '[]' in the DB so they are NEVER
  // null on the wire — read them as empty arrays.
  // Embedded reference objects — every *_id on the row is paired with its named
  // entity so consumers can render labels without extra lookups. The role embed
  // exposes role_name (display label) alongside role_key (permission slug).
  interface StaffCategoryEmbed {
    id: string;
    category_name: string;
    is_teaching: boolean;
    shows_extended_profile: boolean;
  }

  interface StaffInstitutionEmbed {
    id: string;
    name: string;
    counselling_code: string | null;
  }

  interface StaffDepartmentEmbed {
    id: string;
    department_name: string;
  }

  interface StaffRoleEmbed {
    id: string;
    role_key: string;
    role_name: string;
    description: string | null;
    is_system_role: boolean | null;
  }

  interface StaffDetail {
    id: string;
    staff_id: string | null;
    first_name: string;
    last_name: string;
    gender: string;
    date_of_birth: string;
    marital_status: string;
    blood_group: string | null;
    email: string;
    phone: string;
    institution_email: string;
    profile_picture: string | null;
    address: string | null;
    state: string | null;
    district: string | null;
    pincode: string | null;
    date_of_joining: string;
    designation: string;
    category_id: string;
    institution_id: string;
    department_id: string;
    profile_id: string | null;
    role_type: string | null;
    // role_key — fine-grained custom_roles key (e.g. 'hod', 'principal', 'admission_counselor').
    // Drives permission-aware integrations.
    role_key: string | null;
    is_active: boolean | null;
    facilitator_certification: Record<string, unknown> | null;
    outcome_metrics: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;

    // Embedded named entities — paired with the *_id columns above.
    category: StaffCategoryEmbed | null;
    institution: StaffInstitutionEmbed | null;
    department: StaffDepartmentEmbed | null;
    role: StaffRoleEmbed | null;

    // Extended faculty profile (gated by has_extended_profile + category.shows_extended_profile).
    has_extended_profile: boolean;
    slug: string | null;
    status: 'draft' | 'published';
    display_order: number;
    experience_years: number;
    research_papers: number;
    phd_scholars: number;
    awards_won: number;
    pg_dissertations_guided: number;
    ug_projects_guided: number;
    qualification_summary: string | null;
    professional_summary: string | null;
    mentoring_description: string | null;
    google_scholar_url: string | null;
    researchgate_url: string | null;
    orcid_url: string | null;
    badges: unknown[];
    qualifications: unknown[];
    specialisations: unknown[];
    experience_entries: unknown[];
    research_focus_areas: unknown[];
    publications: unknown[];
    funded_projects: unknown[];
    certifications: unknown[];
    awards: unknown[];
    memberships: unknown[];
    phd_scholars_list: unknown[];
    faqs: unknown[];
    achievements: unknown[];
  }

  let record: StaffDetail | null = null;
  let statusCode = 200;
  let errorResponse: NextResponse | null = null;

  try {
    const supabase = createServiceRoleClient();

    let query = supabase
      .from('staff')
      .select(
        // Core profile + base-table flags
        'id, staff_id, first_name, last_name, gender, date_of_birth, marital_status, blood_group, ' +
        'email, phone, institution_email, profile_picture, address, state, district, pincode, ' +
        'date_of_joining, designation, category_id, institution_id, department_id, profile_id, ' +
        'role_type, role_key, is_active, facilitator_certification, outcome_metrics, created_at, updated_at, ' +
        // Embedded named entities — pair every *_id with its display label.
        'category:employment_categories(id, category_name, is_teaching, shows_extended_profile), ' +
        'institution:institutions(id, name, counselling_code), ' +
        'department:departments(id, department_name), ' +
        'role:custom_roles!role_key(id, role_key, role_name, description, is_system_role), ' +
        // Extended faculty profile (29 columns) — see migration 20260503100001
        'has_extended_profile, slug, status, display_order, ' +
        'experience_years, research_papers, phd_scholars, awards_won, ' +
        'pg_dissertations_guided, ug_projects_guided, ' +
        'qualification_summary, professional_summary, mentoring_description, ' +
        'google_scholar_url, researchgate_url, orcid_url, ' +
        'badges, qualifications, specialisations, experience_entries, ' +
        'research_focus_areas, publications, funded_projects, certifications, ' +
        'awards, memberships, phd_scholars_list, faqs, achievements'
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
          { error: { code: 'NOT_FOUND', message: 'Staff record not found.' } },
          { status: 404 }
        );
      } else {
        statusCode = 500;
        errorResponse = NextResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch staff record.' } },
          { status: 500 }
        );
      }
    } else {
      record = data as unknown as StaffDetail;
    }
  } catch {
    statusCode = 500;
    errorResponse = NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch staff record.' } },
      { status: 500 }
    );
  }

  // Step 6: Single audit log call — always fires, success AND error paths
  logApiUsage({
    apiKeyId: context.keyId,
    endpoint: `/api/b2a/staff/${id}`,
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

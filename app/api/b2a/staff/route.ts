export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse , connection } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Embedded reference objects — every *_id column on the row is paired with the
// matching named entity so consumers don't need a second round-trip to resolve
// names. Keep these embeds shallow: only id + display fields, no permissions or
// privileged columns from custom_roles.
type StaffCategoryEmbed = {
  id: string;
  category_name: string;
  is_teaching: boolean;
  shows_extended_profile: boolean;
} | null;

type StaffInstitutionEmbed = {
  id: string;
  name: string;
  counselling_code: string | null;
} | null;

type StaffDepartmentEmbed = {
  id: string;
  department_name: string;
} | null;

type StaffRoleEmbed = {
  id: string;
  role_key: string;
  role_name: string;
  description: string | null;
  is_system_role: boolean | null;
} | null;

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
  has_extended_profile: boolean | null;
  // Role taxonomy:
  //   role_type — high-level grouping (faculty/admin/support/management)
  //   role_key  — fine-grained custom_roles key driving permissions
  role_key: string | null;
  date_of_joining: string;
  created_at: string;
  updated_at: string;
  category: StaffCategoryEmbed;
  institution: StaffInstitutionEmbed;
  department: StaffDepartmentEmbed;
  role: StaffRoleEmbed;
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
  const categoryId = url.searchParams.get('category_id');
  const hasExtendedParam = url.searchParams.get('has_extended_profile');
  // Role-based filters — see docs at /application-hub/api-guidelines (Staff API).
  const roleType = url.searchParams.get('role_type');
  const roleKey = url.searchParams.get('role_key');
  const offset = (page - 1) * limit;

  // Convert is_active to boolean — silently ignore any value that is not 'true' or 'false'
  const isActive: boolean | null =
    isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : null;
  const hasExtendedProfile: boolean | null =
    hasExtendedParam === 'true' ? true : hasExtendedParam === 'false' ? false : null;

  // Step 5: Fetch data
  let items: StaffRow[] = [];
  let total = 0;
  let statusCode = 200;
  let errorResponse: NextResponse | null = null;

  try {
    const supabase = createServiceRoleClient();

    // Embed the category metadata so consumers can tell whether the extended
    // profile (23 additional fields) is meaningful for this row without a
    // second round-trip to /api/b2a/employment-categories. has_extended_profile
    // is the per-staff opt-in flag; category.shows_extended_profile is the
    // category-level default that controls visibility in the staff form.
    let query = supabase
      .from('staff')
      .select(
        'id, staff_id, first_name, last_name, gender, designation, role_type, role_key, ' +
        'institution_id, department_id, category_id, institution_email, email, ' +
        'is_active, has_extended_profile, date_of_joining, created_at, updated_at, ' +
        // Name embeds — every *_id column above is paired with its named entity
        // so consuming applications can render labels without extra lookups.
        'category:employment_categories(id, category_name, is_teaching, shows_extended_profile), ' +
        'institution:institutions(id, name, counselling_code), ' +
        'department:departments(id, department_name), ' +
        'role:custom_roles!role_key(id, role_key, role_name, description, is_system_role)',
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

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    if (hasExtendedProfile !== null) {
      query = query.eq('has_extended_profile', hasExtendedProfile);
    }

    if (roleType) {
      query = query.eq('role_type', roleType);
    }

    if (roleKey) {
      query = query.eq('role_key', roleKey);
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

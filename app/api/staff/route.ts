export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse , connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { CookieOptions } from '@supabase/ssr';
import { getStaffScope } from '@/lib/services/staff/staff-scope';
import { generateSyntheticEmail } from '@/lib/services/staff/synthetic-email';


// Create admin client for database operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    }
  }
);

// GET endpoint for fetching staff (bypasses RLS for performance)
export async function GET(request: NextRequest) {
  await connection();
  try {
    const response = NextResponse.next();

    // Create authenticated client with cookies
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            try {
              cookieStore.set(name, value, options);
            } catch (error) {
              // Handle cookie errors
            }
          },
          remove(name: string, options: CookieOptions) {
            try {
              cookieStore.set(name, '', { ...options, maxAge: 0 });
            } catch (error) {
              // Handle cookie errors
            }
          }
        }
      }
    );

    // Check authentication
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile to check permissions
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_super_admin, role, institution_id')
      .eq('id', session.user.id)
      .single();

    if (profileError) {
      return NextResponse.json(
        { error: 'Failed to check user permissions' },
        { status: 500 }
      );
    }

    const isSuperAdmin = userProfile?.is_super_admin || userProfile?.role === 'super_admin';

    // Resolve staff module scope via SECURITY DEFINER RPC.
    // Defence-in-depth: RLS on public.staff already filters at the DB layer
    // (Batch A), but the admin-client read path bypasses RLS for performance,
    // so we MUST replicate the scope rules here. Use the cookie-authenticated
    // `supabase` client so auth.uid() resolves correctly inside the RPC.
    const scope = isSuperAdmin
      ? ('all_institutions' as const)
      : await getStaffScope(supabase, session.user.id);

    // Cross-institution teaching assignment mode (2026-07-06): the staff-planning
    // "Other institutions" picker. A caller holding academic.staff.planning.edit
    // may list ACTIVE staff of ANY institution — but only through this explicit
    // param and with a reduced column set, so the general staff-records read
    // path keeps its module-scope contract.
    const forTeachingAssignment =
      request.nextUrl.searchParams.get('for_teaching_assignment') === 'true';
    let teachingAssignmentAllowed = false;
    if (forTeachingAssignment) {
      if (isSuperAdmin) {
        teachingAssignmentAllowed = true;
      } else {
        const { data: canEditPlans, error: planPermError } = await supabase.rpc(
          'user_has_permission',
          { permission_name: 'academic.staff.planning.edit' }
        );
        teachingAssignmentAllowed = !planPermError && canEditPlans === true;
      }
      if (!teachingAssignmentAllowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    if (scope === 'none' && !teachingAssignmentAllowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.log('[/api/staff] User access check:', {
      userId: session.user.id,
      email: session.user.email,
      isSuperAdmin,
      scope,
      profileInstitutionId: userProfile?.institution_id
    });

    // Get accessible institution IDs (skip if super admin)
    let accessibleInstitutionIds: string[] = [];

    if (!isSuperAdmin) {
      // Primary access: User's own institution (from profiles.institution_id)
      if (userProfile?.institution_id) {
        accessibleInstitutionIds.push(userProfile.institution_id);
        console.log('[/api/staff] Added primary institution:', userProfile.institution_id);

        // CAS expansion: For Arts & Science colleges the COE keeps one
        // institution mapping to BOTH the Aided and Self-Financing MyJKKN
        // UUIDs. A user whose profile.institution_id is the Aided UUID
        // should still see Self-Financed staff (and vice versa), since BOS
        // workflows like the Principal/Chairman picker need to find a
        // unique Principal across both arms. Resolve sibling UUIDs via the
        // shared COE-backed institution resolver (10-min cached).
        try {
          const { resolveInstitutionContext } = await import(
            '@/lib/utils/institutions/institution-resolver'
          );
          // Pass the cookie-authenticated SSR client (not supabaseAdmin) —
          // the resolver's signature expects that type, and the
          // institutions lookup it does is RLS-readable for any signed-in
          // user, so no admin escalation is required here.
          const ctx = await resolveInstitutionContext(
            userProfile.institution_id,
            supabase
          );
          if (ctx?.myjkkn_institution_ids?.length) {
            accessibleInstitutionIds = [
              ...new Set([...accessibleInstitutionIds, ...ctx.myjkkn_institution_ids]),
            ];
            console.log(
              '[/api/staff] Added CAS sibling UUIDs via institution resolver:',
              ctx.myjkkn_institution_ids
            );
          }
        } catch (err) {
          // COE unavailable — fall back to counselling_code join on Supabase.
          console.warn('[/api/staff] COE institution resolver failed; falling back to counselling_code:', err);
          const { data: inst } = await supabaseAdmin
            .from('institutions')
            .select('counselling_code')
            .eq('id', userProfile.institution_id)
            .single();
          if (inst?.counselling_code) {
            const { data: siblings } = await supabaseAdmin
              .from('institutions')
              .select('id')
              .eq('counselling_code', inst.counselling_code)
              .eq('is_active', true);
            if (siblings?.length) {
              const ids = siblings.map((s: { id: string }) => s.id);
              accessibleInstitutionIds = [
                ...new Set([...accessibleInstitutionIds, ...ids]),
              ];
              console.log('[/api/staff] Added CAS sibling UUIDs via counselling_code fallback:', ids);
            }
          }
        }
      }

      // Additional access: Institutions granted via user_institution_access (for billing module)
      const { data: additionalAccess } = await supabaseAdmin
        .from('user_institution_access')
        .select('institution_id')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      if (additionalAccess && additionalAccess.length > 0) {
        // Add additional institutions (avoiding duplicates)
        const additionalIds = additionalAccess.map((a) => a.institution_id);
        accessibleInstitutionIds = [...new Set([...accessibleInstitutionIds, ...additionalIds])];
        console.log('[/api/staff] Added additional institutions from user_institution_access:', additionalIds.length);
      }

      console.log('[/api/staff] Total accessible institutions:', accessibleInstitutionIds.length);

      // User must have at least their primary institution — UNLESS they're
      // own_records scope, where the filter keys on profile_id and the
      // institution list is irrelevant.
      if (
        accessibleInstitutionIds.length === 0 &&
        scope !== 'own_records' &&
        !teachingAssignmentAllowed
      ) {
        console.warn('[/api/staff] User has no institution access');
        return NextResponse.json(
          { error: 'No institution access' },
          { status: 403 }
        );
      }
    } else {
      console.log('[/api/staff] Super admin - skipping institution filtering');
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const institutionId = searchParams.get('institution_id');
    // institution_ids: comma-separated list for CAS (Aided + SF combined lookup)
    const institutionIdsRaw = searchParams.get('institution_ids');
    const institutionIds = institutionIdsRaw
      ? institutionIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : null;
    const search = searchParams.get('search');
    const categoryId = searchParams.get('category_id');
    const categoryName = searchParams.get('category_name');
    const departmentId = searchParams.get('department_id');
    const roleKey = searchParams.get('role_key');
    const isActive = searchParams.get('isActive');
    // 2026-05-15: 'true' / 'false' filter for view-only staff visibility.
    const loginEnabledParam = searchParams.get('login_enabled');
    const limit = parseInt(searchParams.get('limit') || '100');
    const page = parseInt(searchParams.get('page') || '1');

    // Teaching-assignment mode requires an explicit target institution — this
    // path must never turn into an unscoped all-staff directory listing.
    if (teachingAssignmentAllowed && !institutionId) {
      return NextResponse.json(
        { error: 'institution_id is required for teaching assignment lookup' },
        { status: 400 }
      );
    }

    // Build query using admin client (bypasses RLS).
    // Teaching-assignment mode returns a reduced column set (picker fields
    // only) — it is an assignment picker, not a staff-records read.
    let query = teachingAssignmentAllowed
      ? supabaseAdmin.from('staff').select(
          `
        id, first_name, last_name, designation, institution_email, institution_id, department_id, is_active,
        institution:institutions!staff_institution_id_fkey(id, name, counselling_code),
        department:departments(id, department_name)
      `,
          { count: 'exact' }
        )
      : supabaseAdmin.from('staff').select(
          `
        *,
        category:employment_categories(id, category_name, is_teaching, shows_extended_profile),
        institution:institutions!staff_institution_id_fkey(id, name, counselling_code),
        department:departments(id, department_name),
        role:custom_roles!role_key(id, role_key, role_name, description, is_system_role)
      `,
          { count: 'exact' }
        );

    // Scope branch — replaces the legacy `role === 'faculty'` self-only
    // shortcut. Source of truth is custom_roles.module_scopes->>'staff'
    // resolved by get_user_module_scope() (Batch A).
    if (teachingAssignmentAllowed) {
      // Cross-institution teaching assignment: skip the module-scope row filter —
      // the target institution filter below + forced is_active narrow the rows,
      // and the permission gate above authorized the lookup.
      query = query.eq('is_active', true);
    } else if (scope === 'own_records') {
      // Faculty / own-records roles: only their own staff row, keyed on
      // staff.profile_id (uuid, 100% populated, links to auth.uid()).
      query = query.eq('profile_id', session.user.id);
      console.log('[/api/staff] own_records filter applied for:', session.user.id);
    } else if (scope === 'own_institution') {
      if (accessibleInstitutionIds.length > 0) {
        query = query.in('institution_id', accessibleInstitutionIds);
      } else {
        // No institutions in scope = empty result (mirrors prior 403 guard
        // upstream, but the caller has already passed permission gates).
        return NextResponse.json({
          data: [],
          metadata: { total: 0, page: 1, limit: 0, totalPages: 0 }
        });
      }
    }
    // scope === 'all_institutions' (super admin or cross-scope role) =>
    // no row filter.

    // Apply filters
    if (institutionIds && institutionIds.length > 0) {
      query = query.in('institution_id', institutionIds);
    } else if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,staff_id.ilike.%${search}%`
      );
    }

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    if (categoryName) {
      const { data: matchingCats } = await supabaseAdmin
        .from('employment_categories')
        .select('id')
        .ilike('category_name', categoryName);
      if (matchingCats?.length) {
        query = query.in('category_id', matchingCats.map((c) => c.id));
      } else {
        return NextResponse.json({ data: [], metadata: { total: 0, page: 1, limit: 0, totalPages: 0 } });
      }
    }

    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }

    if (roleKey) {
      query = query.eq('role_key', roleKey);
    }

    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true');
    }

    if (loginEnabledParam === 'true') {
      query = query.eq('login_enabled', true);
    } else if (loginEnabledParam === 'false') {
      query = query.eq('login_enabled', false);
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to).order('created_at', { ascending: false });

    // Execute query
    const { data: staff, error, count } = await query;

    if (error) {
      console.error('Error fetching staff:', error);
      return NextResponse.json(
        { error: 'Failed to fetch staff' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: staff || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0
      }
    });
  } catch (error) {
    console.error('Error in GET /api/staff:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  await connection();
  try {
    const response = NextResponse.next();

    // Create authenticated client with cookies
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            const cookies = new Map(
              request.headers
                .get('cookie')
                ?.split(';')
                .map((c) => {
                  const [key, ...rest] = c.trim().split('=');
                  return [key, rest.join('=')];
                })
            );
            return cookies.get(name) ?? '';
          },
          set(name: string, value: string, options: CookieOptions) {
            response.cookies.set({
              name,
              value,
              ...options
            });
          },
          remove(name: string, options: CookieOptions) {
            response.cookies.set({
              name,
              value: '',
              ...options,
              maxAge: 0
            });
          }
        }
      }
    );

    const json = await request.json();

    // 2026-05-15: view-only / labour staff support. When login_enabled=false
    // and emails are missing/blank, generate deterministic synthetic emails
    // server-side as defence-in-depth — direct API callers (curl, scripts,
    // bulk uploads bypassing the client service) get the same auto-generation
    // behaviour as the client-side StaffService.createStaff.
    if (json.login_enabled === false) {
      if (!json.email || String(json.email).trim() === '') {
        json.email = generateSyntheticEmail('personal', json.staff_id, json.phone);
      }
      if (!json.institution_email || String(json.institution_email).trim() === '') {
        json.institution_email = generateSyntheticEmail('institution', json.staff_id, json.phone);
      }
    }

    // Validate required fields. Email is required ONLY for login-enabled
    // staff (the synthetic-email block above already populated emails for
    // view-only staff).
    if (!json.first_name || !json.last_name) {
      return NextResponse.json(
        { error: 'Missing required fields: first_name, last_name' },
        { status: 400 }
      );
    }
    if (json.login_enabled !== false && !json.email) {
      return NextResponse.json(
        { error: 'Email is required for login-enabled staff' },
        { status: 400 }
      );
    }

    // First check if the current user is authorized to create staff
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: currentUser, error: userError } = await supabase
      .from('profiles')
      .select('role, institution_id, full_name, is_super_admin')
      .eq('id', session.user.id)
      .single();

    if (userError || !currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Permission check: ask the database via user_has_permission() instead
    // of hardcoding role names. This honours dynamic Role Management grants
    // for any custom role that was given staff.create.
    let canCreateStaff = !!currentUser.is_super_admin;
    if (!canCreateStaff) {
      const { data: permResult } = await supabase.rpc('user_has_permission', {
        permission_name: 'staff.create'
      });
      canCreateStaff = !!permResult;
    }

    if (!canCreateStaff) {
      return NextResponse.json(
        { error: 'Insufficient permissions to create staff' },
        { status: 403 }
      );
    }

    console.log('Creating staff via API route for user:', currentUser.role);

    // Normalize empty staff_id to null (matches the staff_staff_id_not_empty
    // DB CHECK and lets the UNIQUE index treat blanks as distinct NULLs).
    if (json.staff_id === '') json.staff_id = null;

    // Check if staff_id already exists if provided
    if (json.staff_id) {
      const { data: existing } = await supabaseAdmin
        .from('staff')
        .select('id')
        .eq('staff_id', json.staff_id)
        .single();

      if (existing) {
        return NextResponse.json(
          { error: 'Staff ID already exists' },
          { status: 409 }
        );
      }
    }

    // Create the staff record using admin client
    const { data: staff, error: createError } = await supabaseAdmin
      .from('staff')
      .insert([
        {
          ...json,
          created_by: session.user.id,
          updated_by: session.user.id
        }
      ])
      .select()
      .single();

    if (createError) {
      console.error('Error creating staff via API route:', createError);
      return NextResponse.json(
        {
          error: 'Failed to create staff record',
          details: createError.message
        },
        { status: 500 }
      );
    }

    console.log('Staff created successfully via API route:', staff.id);

    // Mirror the staff's role_key into user_roles for the synced profile.
    // Done here (service_role) rather than browser-side so non-super-admin
    // callers don't get blocked by the user_roles INSERT RLS policy, which
    // requires roles.create (HOD/administrator/etc. only have staff.create).
    // Non-fatal: profile.role still carries the string, so auth can work;
    // user_roles can be resynced later. See 2026-04-22 fix notes.
    let roleAssignmentApplied = false;
    if (staff?.profile_id && staff?.role_key) {
      const { data: roleRow, error: roleLookupError } = await supabaseAdmin
        .from('custom_roles')
        .select('id')
        .eq('role_key', staff.role_key)
        .maybeSingle();

      if (roleLookupError) {
        console.warn(
          '[/api/staff] custom_roles lookup failed for role_key=',
          staff.role_key,
          roleLookupError
        );
      } else if (roleRow?.id) {
        // Delete any stale assignments first (idempotent; matches
        // UserRolesService.assignRoles semantics).
        const { error: deleteError } = await supabaseAdmin
          .from('user_roles')
          .delete()
          .eq('user_id', staff.profile_id);
        if (deleteError) {
          console.warn(
            '[/api/staff] user_roles pre-delete failed (continuing):',
            deleteError
          );
        }

        const { error: insertError } = await supabaseAdmin
          .from('user_roles')
          .insert({
            user_id: staff.profile_id,
            role_id: roleRow.id,
            is_primary: true,
            assigned_by: session.user.id
          });

        if (insertError) {
          console.warn(
            '[/api/staff] user_roles insert failed (non-fatal):',
            insertError
          );
        } else {
          roleAssignmentApplied = true;
          console.log(
            '[/api/staff] user_roles assigned for profile',
            staff.profile_id
          );
        }
      } else {
        console.warn(
          '[/api/staff] No custom_role found for role_key=',
          staff.role_key
        );
      }
    }

    // Signal to the browser that server-side role assignment succeeded so it
    // can skip its own (RLS-blocked-for-non-admins) assignRoles call.
    return NextResponse.json({ ...staff, _role_assignment_applied: roleAssignmentApplied });
  } catch (error) {
    console.error('Error in POST /api/staff:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

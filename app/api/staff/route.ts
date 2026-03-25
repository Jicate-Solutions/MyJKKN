import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { CookieOptions } from '@supabase/ssr';


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

    console.log('[/api/staff] User access check:', {
      userId: session.user.id,
      email: session.user.email,
      isSuperAdmin,
      profileInstitutionId: userProfile?.institution_id
    });

    // Get accessible institution IDs (skip if super admin)
    let accessibleInstitutionIds: string[] = [];

    if (!isSuperAdmin) {
      // Primary access: User's own institution (from profiles.institution_id)
      if (userProfile?.institution_id) {
        accessibleInstitutionIds.push(userProfile.institution_id);
        console.log('[/api/staff] Added primary institution:', userProfile.institution_id);
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

      // User must have at least their primary institution
      if (accessibleInstitutionIds.length === 0) {
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
    const search = searchParams.get('search');
    const categoryId = searchParams.get('category_id');
    const departmentId = searchParams.get('department_id');
    const isActive = searchParams.get('isActive');
    const limit = parseInt(searchParams.get('limit') || '100');
    const page = parseInt(searchParams.get('page') || '1');

    // Build query using admin client (bypasses RLS)
    let query = supabaseAdmin.from('staff').select(
      `
        *,
        category:employment_categories(id, category_name),
        institution:institutions(id, name, counselling_code),
        department:departments(id, department_name)
      `,
      { count: 'exact' }
    );

    // Faculty users can only view their own staff record
    if (!isSuperAdmin && userProfile?.role === 'faculty') {
      query = query.eq('institution_email', session.user.email);
      console.log('[/api/staff] Faculty self-only filter applied for:', session.user.email);
    }
    // Filter by user's institution access (skip if super admin or faculty)
    else if (!isSuperAdmin && accessibleInstitutionIds.length > 0) {
      query = query.in('institution_id', accessibleInstitutionIds);
    }

    // Apply filters
    if (institutionId) {
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

    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }

    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true');
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

    // Validate required fields
    if (!json.first_name || !json.last_name || !json.email) {
      return NextResponse.json(
        { error: 'Missing required fields: first_name, last_name, email' },
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

    // Allow super_admin, administrator, faculty, and HOD to create staff
    const canCreateStaff =
      currentUser.is_super_admin ||
      ['super_admin', 'administrator', 'faculty', 'hod'].includes(currentUser.role);

    if (!canCreateStaff) {
      return NextResponse.json(
        { error: 'Insufficient permissions to create staff' },
        { status: 403 }
      );
    }

    console.log('Creating staff via API route for user:', currentUser.role);

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

    return NextResponse.json(staff);
  } catch (error) {
    console.error('Error in POST /api/staff:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

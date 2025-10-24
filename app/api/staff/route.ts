import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Database } from '@/types/supabase';
import { createClient } from '@supabase/supabase-js';
import type { CookieOptions } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

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

    // Get user's institution access
    const { data: userAccess, error: accessError } = await supabaseAdmin
      .from('user_institution_access')
      .select('institution_id, access_type')
      .eq('user_id', session.user.id)
      .eq('is_active', true);

    if (accessError) {
      return NextResponse.json(
        { error: 'Failed to check permissions' },
        { status: 500 }
      );
    }

    if (!userAccess || userAccess.length === 0) {
      return NextResponse.json(
        { error: 'No institution access' },
        { status: 403 }
      );
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

    // Filter by user's institution access
    const accessibleInstitutionIds = userAccess.map((a) => a.institution_id);
    query = query.in('institution_id', accessibleInstitutionIds);

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

    // Allow super_admin, administrator, and faculty to create staff
    const canCreateStaff =
      currentUser.is_super_admin ||
      ['super_admin', 'administrator', 'faculty'].includes(currentUser.role);

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

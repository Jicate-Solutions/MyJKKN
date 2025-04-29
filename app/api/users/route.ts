import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Database } from '@/types/supabase';
import { createClient } from '@supabase/supabase-js';
import type { CookieOptions } from '@supabase/ssr';
import { CreateUserRequest } from '@/types/users';

export const dynamic = 'force-dynamic';

// Create admin client for user management
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

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
    const { email, full_name, role, phone_number, password } =
      json as CreateUserRequest;

    // Validate required fields
    if (!email || !full_name || !role || !password) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // First check if email exists in auth
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    const authUser = authUsers.users.find((user) => user.email === email);

    // If auth user exists, check and clean up both auth and profile
    if (authUser) {
      // Delete profile if exists
      const { error: profileDeleteError } = await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('email', email);

      if (profileDeleteError) {
        console.error('Profile deletion error:', profileDeleteError);
      }

      // Delete auth user
      const { error: authDeleteError } =
        await supabaseAdmin.auth.admin.deleteUser(authUser.id);

      if (authDeleteError) {
        console.error('Auth user deletion error:', authDeleteError);
      }
    }

    // Then check if email exists in profiles
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (profile) {
      return NextResponse.json(
        {
          error: 'Email is already registered',
          details: 'A user with this email already exists in the system'
        },
        { status: 409 }
      );
    }

    // First check if the current user is an admin
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: currentUser, error: userError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (userError || !currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['super_admin', 'administrator'].includes(currentUser.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Validate role
    const validRoles = ['super_admin', 'administrator', 'faculty', 'student'];

    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role specified' },
        { status: 400 }
      );
    }

    // Only super_admin can create other super_admins
    if (role === 'super_admin' && currentUser?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only super admins can create other super admins' },
        { status: 403 }
      );
    }

    // Create auth user with admin client
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
          role,
          phone_number
        }
      });

    if (authError) {
      console.error('Auth error details:', authError);
      console.error('Auth error message:', authError.message);
      console.error('Auth error status:', authError.status);

      // Check for specific error related to disabled email provider
      if (authError.message.includes('provider')) {
        return NextResponse.json(
          {
            error: 'Authentication provider error',
            details:
              'Email provider may be disabled in Supabase. Please enable email provider in Supabase Authentication settings.',
            message: authError.message
          },
          { status: authError.status || 500 }
        );
      }

      return NextResponse.json(
        { error: authError.message },
        { status: authError.status || 500 }
      );
    }

    // Create profile with admin client
    const profileData = {
      id: authData.user.id,
      email,
      full_name,
      role,
      phone_number,
      is_active: true,
      profile_completed: 'false',
      updated_at: new Date().toISOString()
    };

    console.log('Attempting to create profile with data:', profileData);

    try {
      // Replace the double-check and insert with an upsert.
      // This will update the profile if one already exists (e.g. from the trigger)
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .upsert(profileData, { onConflict: 'email' }) // perform an upsert on email
        .select()
        .single();

      if (error) {
        // If upsert fails, delete the auth user and return error
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        console.error('Profile upsert error:', error);
        return NextResponse.json(
          {
            error: 'Failed to create user profile',
            details: error.message,
            code: error.code
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        data,
        message: 'User created successfully'
      });
    } catch (error) {
      // Clean up auth user if profile upsert fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      console.error('Error in profile upsert:', error);
      return NextResponse.json(
        {
          error: 'Failed to create user profile',
          details: error instanceof Error ? error.message : 'Unknown error',
          code: error instanceof Error ? error.cause : 'UNKNOWN'
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in POST /api/users:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    // Check if user is admin
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !['super_admin', 'administrator'].includes(profile?.role || '')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get query parameters
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const role = url.searchParams.get('role');
    const institution = url.searchParams.get('institution');
    const search = url.searchParams.get('search');

    // Build query
    let query = supabase.from('profiles').select('*', { count: 'exact' });

    // Apply filters
    if (role) {
      query = query.eq('role', role);
    }

    if (institution) {
      query = query.eq('institution', institution);
    }

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to).order('created_at', { ascending: false });

    // Execute query
    const { data: users, error: usersError, count } = await query;

    if (usersError) throw usersError;

    return NextResponse.json({
      data: users,
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0
      }
    });
  } catch (error) {
    console.error('Error in GET /api/users:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

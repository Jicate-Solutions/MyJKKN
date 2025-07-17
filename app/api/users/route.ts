import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Database } from '@/types/supabase';
import { createClient } from '@supabase/supabase-js';
import type { CookieOptions } from '@supabase/ssr';
import { CreateUserRequest } from '@/types/users';
import { logActivity, ActivityTemplates } from '@/lib/utils/activity-logger';
import { RESOURCE_TYPES } from '@/types/activity';

export const dynamic = 'force-dynamic';

// Create admin client for user management
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
    const { email, full_name, role, phone_number, password, institution_id } =
      json as CreateUserRequest;

    // Validate required fields
    if (!email || !full_name || !role || !password) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Handle existing vs new auth users
    let userId: string;
    let existingAuthUser = false;

    // First check if email exists in auth
    const {
      data: { users: existingAuthUsers }
    } = await supabaseAdmin.auth.admin.listUsers();
    const foundAuthUser = existingAuthUsers.find(
      (user) => user.email === email
    );

    if (foundAuthUser) {
      console.log(
        `Auth user with email ${email} already exists. Using existing user ID.`
      );
      userId = foundAuthUser.id;
      existingAuthUser = true;
    } else {
      // Only create a new auth user if one doesn't already exist
      const { data: authCreationResponse, error: authCreationError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name,
            role
          }
        });

      if (authCreationError) {
        // If there's an error here, it's a real problem
        return NextResponse.json(
          { error: authCreationError.message },
          { status: 500 }
        );
      }
      userId = authCreationResponse.user.id;
    }

    // Check if email exists in profiles table
    const { data: existingProfile, error: profileCheckError } =
      await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle(); // Use maybeSingle to avoid error when no row is found

    if (existingProfile) {
      return NextResponse.json(
        {
          error: `User with email ${email} already exists in profiles.`,
          details: 'A profile with this email already exists in the system.'
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
      .select('role, institution_id, full_name')
      .eq('id', session.user.id)
      .single();

    if (userError || !currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Allow super_admin, administrator, and faculty to create users
    if (
      !['super_admin', 'administrator', 'faculty'].includes(currentUser.role)
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Role-specific restrictions
    if (currentUser.role === 'faculty') {
      // Faculty can only create faculty role accounts
      if (role !== 'faculty') {
        return NextResponse.json(
          { error: 'Faculty users can only create other faculty accounts' },
          { status: 403 }
        );
      }

      // Faculty must provide institution_id and it must match their own
      if (!institution_id || institution_id !== currentUser.institution_id) {
        return NextResponse.json(
          {
            error:
              'Faculty users can only create accounts for their own institution'
          },
          { status: 403 }
        );
      }
    }

    // Validate role against database roles
    const { data: validRoleData, error: roleError } = await supabaseAdmin
      .from('custom_roles')
      .select('role_key, is_system_role')
      .eq('role_key', role)
      .single();

    let validRole = validRoleData;

    if (roleError) {
      // If custom_roles table doesn't exist or there's an error, fallback to basic validation
      const basicValidRoles = [
        'super_admin',
        'administrator',
        'faculty',
        'student'
      ];
      if (!basicValidRoles.includes(role)) {
        return NextResponse.json(
          { error: 'Invalid role specified. Please select a valid role.' },
          { status: 400 }
        );
      }
      // Create a mock validRole for basic roles
      validRole = {
        role_key: role,
        is_system_role: ['super_admin', 'administrator'].includes(role)
      };
    }

    if (!validRole) {
      return NextResponse.json(
        { error: 'Invalid role specified. Please select a valid role.' },
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

    // Additional permission checks for system roles
    if (validRole.is_system_role && currentUser?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only super admins can assign system roles' },
        { status: 403 }
      );
    }

    // Now, call the RPC function to create the profile
    const { data: profileData, error: rpcError } = await supabaseAdmin.rpc(
      'create_user_profile',
      {
        user_id: userId,
        user_email: email,
        user_full_name: full_name,
        user_role: role,
        user_phone_number: phone_number,
        user_institution_id: institution_id
      }
    );

    if (rpcError) {
      console.error('Error creating profile via RPC:', rpcError);
      // If the profile creation fails, we need to clean up the auth user we might have just created
      if (!existingAuthUser && userId) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      }

      // Check for specific foreign key violation error (institution_id)
      if (
        rpcError.message.includes('foreign key constraint') &&
        rpcError.message.includes('profiles_institution_id_fkey')
      ) {
        return NextResponse.json(
          {
            error: 'Invalid institution ID provided.',
            details: rpcError.message
          },
          { status: 400 }
        );
      }

      // Check for unique constraint violation or custom profile exists error
      if (
        rpcError.message.includes('unique constraint') ||
        rpcError.message.includes('Profile with email') ||
        rpcError.code === '23505' || // unique_violation error code
        rpcError.message.includes('profiles_pkey') ||
        rpcError.message.includes('profiles_email_key')
      ) {
        return NextResponse.json(
          {
            error: `A user with this email address has already been registered`,
            details: rpcError.message
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          error: rpcError.message,
          details: rpcError.details,
          code: rpcError.code,
          hint: rpcError.hint
        },
        { status: 500 } // Use 500 for other RPC errors
      );
    }

    // Log activity
    const template = ActivityTemplates.userCreated(
      currentUser?.full_name || 'Unknown',
      email,
      role
    );

    await logActivity({
      userId: session.user.id,
      actionType: template.actionType,
      resourceType: template.resourceType,
      resourceId: userId,
      resourceName: full_name,
      description: template.description,
      request: request as NextRequest,
      metadata: {
        target_user_id: userId,
        target_email: email,
        target_role: role,
        created_by_role: currentUser?.role
      },
      institutionId: currentUser?.institution_id,
      statusCode: 201
    });

    return NextResponse.json({
      message: 'User and profile created successfully',
      userId: userId
    });
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
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !['super_admin', 'administrator', 'faculty'].includes(profile?.role || '')
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

    // Faculty users can only see profiles from their own institution
    if (profile.role === 'faculty' && profile.institution_id) {
      query = query.eq('institution_id', profile.institution_id);
    }

    // Apply filters
    if (role) {
      query = query.eq('role', role);
    }

    if (institution) {
      query = query.eq('institution_id', institution);
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

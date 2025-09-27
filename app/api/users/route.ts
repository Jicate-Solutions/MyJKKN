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
    },
    // Ensure service role bypasses RLS
    realtime: {
      params: {
        eventsPerSecond: 10
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
    const {
      email,
      full_name,
      role,
      phone_number,
      institution_id,
      department_id
    } = json as CreateUserRequest;

    // Validate required fields (no password needed for OAuth-only system)
    if (!email || !full_name || !role) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // First check if the current user is authorized to create users
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

    // Allow super_admin, administrator, faculty, and hod to create users
    if (
      !['super_admin', 'administrator', 'faculty', 'hod'].includes(currentUser.role)
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

    if (currentUser.role === 'hod') {
      // HOD can create faculty and staff role accounts
      if (!['faculty', 'staff'].includes(role)) {
        return NextResponse.json(
          { error: 'HOD users can only create faculty or staff accounts' },
          { status: 403 }
        );
      }

      // HOD must provide institution_id and it must match their own
      if (!institution_id || institution_id !== currentUser.institution_id) {
        return NextResponse.json(
          {
            error:
              'HOD users can only create accounts for their own institution'
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
        'hod', // Added hod role
        'student',
        'driver', // Added driver role
        'accounts', // Added accounts role
        'guest', // Added guest role
        'staff', // Added staff role
        'test' // Added test role
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
    if (validRole.is_system_role) {
      // Super admin can assign any system role
      if (currentUser?.role === 'super_admin') {
        // No restrictions for super admin
      }
      // Administrator can assign most system roles (except super_admin)
      else if (currentUser?.role === 'administrator') {
        if (role === 'super_admin') {
          return NextResponse.json(
            { error: 'Only super admins can create other super admins' },
            { status: 403 }
          );
        }
      }
      // HOD can only assign faculty and staff system roles
      else if (currentUser?.role === 'hod') {
        if (!['faculty', 'staff'].includes(role)) {
          return NextResponse.json(
            { error: 'HOD users can only assign faculty or staff system roles' },
            { status: 403 }
          );
        }
      }
      // All other users cannot assign system roles
      else {
        console.log(
          `User ${currentUser.role} attempted to assign system role ${role}`
        );
        return NextResponse.json(
          { error: 'Only super admins, administrators, and HOD can assign system roles' },
          { status: 403 }
        );
      }
    }

    // Log successful role validation for custom roles
    if (!validRole.is_system_role) {
      console.log(
        `Allowing ${currentUser.role} to create user with custom role: ${role}`
      );
    }

    // For Google OAuth only system, we pre-register profiles
    // The profile will be linked to Google auth when the user logs in

    // Check if a profile with this email already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .single();

    if (existingProfile) {
      return NextResponse.json(
        {
          error: `A user with email ${email} already exists.`,
          details: 'This email is already registered in the system.'
        },
        { status: 409 }
      );
    }

    // Generate a proper UUID for pre-registration
    // We'll use crypto.randomUUID() to create a valid UUID
    const placeholderId = crypto.randomUUID();

    console.log('Creating pre-registered profile for Google OAuth:', {
      placeholder_id: placeholderId,
      email: email,
      full_name: full_name,
      role: role
    });

    // Debug: Check service role configuration
    console.log(
      'Service role key exists:',
      !!process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);

    // Test admin client authentication
    const { data: authTest, error: authError } =
      await supabaseAdmin.auth.getSession();
    console.log('Admin client auth test:', { authTest: !!authTest, authError });

    // Use the secure function to create pre-registered profile
    console.log('Creating profile using secure function...');

    const { data: newProfile, error: createError } = await supabase.rpc(
      'create_preregistered_profile',
      {
        profile_id: placeholderId,
        profile_email: email,
        profile_full_name: full_name,
        profile_role: role,
        profile_phone: phone_number,
        profile_institution_id: institution_id,
        profile_department_id: department_id
      }
    );

    if (createError) {
      console.error('Error creating pre-registered profile:', createError);

      // Check for specific errors
      if (createError.message.includes('duplicate key')) {
        return NextResponse.json(
          {
            error: 'A user with this email already exists',
            details: createError.message
          },
          { status: 409 }
        );
      }

      if (
        createError.message.includes('foreign key constraint') &&
        createError.message.includes('institution_id')
      ) {
        return NextResponse.json(
          {
            error: 'Invalid institution ID provided',
            details: createError.message
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          error: 'Failed to create user profile',
          details: createError.message
        },
        { status: 500 }
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
      resourceId: placeholderId,
      resourceName: full_name,
      description: template.description,
      request: request as NextRequest,
      metadata: {
        target_user_id: placeholderId,
        target_email: email,
        target_role: role,
        created_by_role: currentUser?.role,
        pre_registered: true,
        auth_method: 'google_oauth_pending'
      },
      institutionId: currentUser?.institution_id,
      statusCode: 201
    });

    return NextResponse.json({
      message:
        'User pre-registered successfully. They can now login with Google using this email.',
      data: {
        id: placeholderId,
        email: email,
        full_name: full_name,
        role: role,
        status: 'pending_google_login'
      }
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
      !['super_admin', 'administrator', 'faculty', 'hod'].includes(profile?.role || '')
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

    // Build query - include all users (both regular and pre-registered)
    let query = supabase
      .from('profiles')
      .select('*', { count: 'exact' });
      // Note: Pre-registered users will show with is_pre_registered: true

    // Faculty and HOD users can only see profiles from their own institution
    if ((profile.role === 'faculty' || profile.role === 'hod') && profile.institution_id) {
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

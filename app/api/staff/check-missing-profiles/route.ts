import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
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
        {
          error: 'Only super admin and administrator can check missing profiles'
        },
        { status: 403 }
      );
    }

    // Get all staff with emails
    const { data: allStaff, error: staffError } = await supabaseAdmin
      .from('staff')
      .select(
        `
        id,
        first_name,
        last_name,
        institution_email,
        phone,
        institution_id
      `
      )
      .not('institution_email', 'is', null)
      .not('institution_email', 'eq', '');

    if (staffError) {
      throw staffError;
    }

    // Get existing profiles
    const { data: existingProfiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('email, id')
      .in(
        'email',
        allStaff.map((s) => s.institution_email)
      );

    if (profilesError) {
      throw profilesError;
    }

    // Get existing auth users
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthEmails = new Set(
      authUsers.users.map((user) => user.email)
    );

    const existingProfileEmails = new Set(existingProfiles.map((p) => p.email));

    const staffWithProfiles = allStaff.filter((staff) =>
      existingProfileEmails.has(staff.institution_email)
    );

    const staffWithoutProfiles = allStaff.filter(
      (staff) => !existingProfileEmails.has(staff.institution_email)
    );

    const staffWithAuthButNoProfile = staffWithoutProfiles.filter((staff) =>
      existingAuthEmails.has(staff.institution_email)
    );

    const staffWithoutAuthOrProfile = staffWithoutProfiles.filter(
      (staff) => !existingAuthEmails.has(staff.institution_email)
    );

    return NextResponse.json({
      success: true,
      summary: {
        total_staff: allStaff.length,
        with_profiles: staffWithProfiles.length,
        without_profiles: staffWithoutProfiles.length,
        with_auth_but_no_profile: staffWithAuthButNoProfile.length,
        without_auth_or_profile: staffWithoutAuthOrProfile.length
      },
      details: {
        staff_with_profiles: staffWithProfiles.map((s) => ({
          name: `${s.first_name} ${s.last_name}`.trim(),
          email: s.institution_email
        })),
        staff_without_profiles: staffWithoutProfiles.map((s) => ({
          name: `${s.first_name} ${s.last_name}`.trim(),
          email: s.institution_email,
          has_auth_user: existingAuthEmails.has(s.institution_email)
        }))
      }
    });
  } catch (error) {
    console.error('Error in check-missing-profiles:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

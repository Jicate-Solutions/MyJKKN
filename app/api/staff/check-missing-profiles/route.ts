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
        institution_id,
        department_id,
        gender,
        designation
      `
      )
      .not('institution_email', 'is', null)
      .not('institution_email', 'eq', '');

    if (staffError) {
      throw staffError;
    }

    // Get existing profiles with all relevant fields
    const { data: existingProfiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('email, id, role, institution_id, department_id, gender, phone_number, designation')
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

    // Create a map of profiles by email for easy lookup
    const profilesByEmail = new Map(
      existingProfiles.map((p) => [p.email, p])
    );

    // Categorize staff based on profile status
    const staffWithCompleteProfiles = [];
    const staffWithIncompleteProfiles = [];
    const staffWithoutProfiles = [];

    for (const staff of allStaff) {
      const profile = profilesByEmail.get(staff.institution_email);

      if (!profile) {
        // No profile exists at all
        staffWithoutProfiles.push(staff);
      } else {
        // Profile exists, check if it's complete and correct
        // Accept faculty and elevated roles as valid (case-insensitive)
        const validRoles = [
          'faculty',
          'hod',
          'principal',
          'dean',
          'administrator',
          'super_admin',
          'accounts',
          'admission',
          'digital_coordinator'
        ];
        const hasValidRole = validRoles.includes(profile.role?.toLowerCase());
        const hasInstitutionId = profile.institution_id === staff.institution_id;
        const hasDepartmentId = profile.department_id === staff.department_id;
        const hasCorrectGender = profile.gender === staff.gender;
        const hasCorrectPhone = profile.phone_number === staff.phone;
        const hasCorrectDesignation = profile.designation === staff.designation;

        if (
          hasValidRole &&
          hasInstitutionId &&
          hasDepartmentId &&
          hasCorrectGender &&
          hasCorrectPhone &&
          hasCorrectDesignation
        ) {
          // Profile is complete and correct
          staffWithCompleteProfiles.push(staff);
        } else {
          // Profile exists but has incorrect/incomplete data
          staffWithIncompleteProfiles.push({
            ...staff,
            current_role: profile.role,
            current_institution_id: profile.institution_id,
            current_department_id: profile.department_id,
            current_gender: profile.gender,
            current_phone_number: profile.phone_number,
            current_designation: profile.designation,
            has_valid_role: hasValidRole // Track if role is already valid
          });
        }
      }
    }

    const staffWithAuthButNoProfile = staffWithoutProfiles.filter((staff) =>
      existingAuthEmails.has(staff.institution_email)
    );

    const staffWithoutAuthOrProfile = staffWithoutProfiles.filter(
      (staff) => !existingAuthEmails.has(staff.institution_email)
    );

    // Total needing sync = profiles missing + profiles incomplete
    const totalNeedingSync =
      staffWithoutProfiles.length + staffWithIncompleteProfiles.length;

    return NextResponse.json({
      success: true,
      summary: {
        total_staff: allStaff.length,
        with_complete_profiles: staffWithCompleteProfiles.length,
        with_incomplete_profiles: staffWithIncompleteProfiles.length,
        without_profiles: staffWithoutProfiles.length,
        total_needing_sync: totalNeedingSync,
        with_auth_but_no_profile: staffWithAuthButNoProfile.length,
        without_auth_or_profile: staffWithoutAuthOrProfile.length
      },
      details: {
        staff_with_complete_profiles: staffWithCompleteProfiles.map((s) => ({
          name: `${s.first_name} ${s.last_name}`.trim(),
          email: s.institution_email
        })),
        staff_with_incomplete_profiles: staffWithIncompleteProfiles.map((s) => ({
          staff_id: s.id,
          name: `${s.first_name} ${s.last_name}`.trim(),
          email: s.institution_email,
          changes: {
            role: {
              current: s.current_role,
              new: s.has_valid_role ? s.current_role : 'faculty', // Keep valid roles (faculty/HOD)
              changed: !s.has_valid_role // Only flag as changed if role is invalid
            },
            institution_id: {
              current: s.current_institution_id,
              new: s.institution_id,
              changed: s.current_institution_id !== s.institution_id
            },
            department_id: {
              current: s.current_department_id,
              new: s.department_id,
              changed: s.current_department_id !== s.department_id
            },
            gender: {
              current: s.current_gender,
              new: s.gender,
              changed: s.current_gender !== s.gender
            },
            phone_number: {
              current: s.current_phone_number,
              new: s.phone,
              changed: s.current_phone_number !== s.phone
            },
            designation: {
              current: s.current_designation,
              new: s.designation,
              changed: s.current_designation !== s.designation
            }
          },
          issues: {
            wrong_role: !s.has_valid_role, // Only flag if role is not faculty or HOD
            missing_institution: !s.current_institution_id,
            missing_department: !s.current_department_id,
            wrong_gender: s.current_gender !== s.gender,
            wrong_phone: s.current_phone_number !== s.phone,
            wrong_designation: s.current_designation !== s.designation
          }
        })),
        staff_without_profiles: staffWithoutProfiles.map((s) => ({
          staff_id: s.id,
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

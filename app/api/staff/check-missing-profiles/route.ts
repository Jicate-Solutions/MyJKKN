export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse , connection } from 'next/server';
import { createClient } from '@supabase/supabase-js';


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
  await connection();
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

    // Get all staff with emails. Include role_key — it's the authoritative role
    // from bulk upload / manual create. profiles.role must match staff.role_key.
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
        designation,
        role_key
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

    // Role sync rule (updated 2026-04-16):
    // Compare staff.role_key against the user's PRIMARY user_roles.role_key —
    // that's the authoritative source per the dynamic permission system.
    // profiles.role is a legacy cache synced by sync_primary_role_trigger, and
    // drifted vs primary user_role in ~46 users across the DB. For users with
    // no user_roles rows at all (~90 legacy users), fall back to profiles.role.
    const profileIds = existingProfiles.map((p) => p.id);
    const { data: primaryUserRolesRaw } =
      profileIds.length > 0
        ? await supabaseAdmin
            .from('user_roles')
            .select('user_id, custom_roles!inner(role_key)')
            .in('user_id', profileIds)
            .eq('is_primary', true)
        : { data: [] as any[] };
    const primaryRoleByUserId = new Map<string, string>();
    for (const ur of primaryUserRolesRaw || []) {
      const roleKey = (ur as any).custom_roles?.role_key;
      if (roleKey) primaryRoleByUserId.set((ur as any).user_id, roleKey);
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
        // Profile exists — check each field for mismatches against the staff record.
        // Role rule: compare staff.role_key against the user's PRIMARY
        // user_roles.role_key (authoritative). Fall back to profiles.role only
        // for legacy users with no user_roles entries.
        const staffRoleKey = (staff as any).role_key as string | null | undefined;
        const primaryRoleKey = primaryRoleByUserId.get(profile.id);
        const effectiveCurrentRole = primaryRoleKey || profile.role || '';
        const roleMatches = !staffRoleKey
          ? true
          : effectiveCurrentRole.toLowerCase() === staffRoleKey.toLowerCase();
        const targetRole = staffRoleKey || effectiveCurrentRole;
        const hasInstitutionId = profile.institution_id === staff.institution_id;
        const hasDepartmentId = profile.department_id === staff.department_id;
        const hasCorrectGender = profile.gender === staff.gender;
        const hasCorrectPhone = profile.phone_number === staff.phone;
        const hasCorrectDesignation = profile.designation === staff.designation;

        if (
          roleMatches &&
          hasInstitutionId &&
          hasDepartmentId &&
          hasCorrectGender &&
          hasCorrectPhone &&
          hasCorrectDesignation
        ) {
          // Profile is complete and correct
          staffWithCompleteProfiles.push(staff);
        } else {
          // Profile exists but has incorrect/incomplete data.
          // current_role reflects the authoritative source (primary user_role
          // when available), so the preview UI shows what truly drives access.
          staffWithIncompleteProfiles.push({
            ...staff,
            current_role: effectiveCurrentRole,
            current_institution_id: profile.institution_id,
            current_department_id: profile.department_id,
            current_gender: profile.gender,
            current_phone_number: profile.phone_number,
            current_designation: profile.designation,
            role_matches: roleMatches,
            target_role: targetRole
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
              new: s.target_role, // staff.role_key if set, else preserve current
              changed: !s.role_matches
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
            wrong_role: !s.role_matches,
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

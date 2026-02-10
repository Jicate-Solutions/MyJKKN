import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
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

// Type for staff with profile_id
interface StaffWithProfileId {
  id: string;
  first_name: string;
  last_name: string;
  institution_email: string;
  phone: string;
  institution_id: string;
  department_id: string;
  gender: string;
  designation: string;
  profile_id: string;
}

// Function to generate temporary password
function generateTemporaryPassword(): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = 'Staff_';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password + '!';
}

export async function POST(request: Request) {
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
          error:
            'Only super admin and administrator can create missing profiles'
        },
        { status: 403 }
      );
    }

    // Get selected staff IDs from request body (optional - if not provided, sync all)
    const body = await request.json().catch(() => ({}));
    const selectedStaffIds: string[] | undefined = body.staff_ids;

    // Get all staff with institution emails
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

    // Get existing profiles with all fields to check if they need updates
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

    // Create a map of profiles by email
    const profilesByEmail = new Map(
      existingProfiles.map((p) => [p.email, p])
    );

    // Categorize staff into: needs new profile, needs profile update
    const staffNeedingNewProfiles: any[] = [];
    const staffNeedingProfileUpdates: StaffWithProfileId[] = [];

    for (const staff of allStaff) {
      const profile = profilesByEmail.get(staff.institution_email);

      if (!profile) {
        // No profile exists - needs creation
        staffNeedingNewProfiles.push(staff);
      } else {
        // Profile exists - check if it needs updates
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
          !hasValidRole ||
          !hasInstitutionId ||
          !hasDepartmentId ||
          !hasCorrectGender ||
          !hasCorrectPhone ||
          !hasCorrectDesignation
        ) {
          // Profile needs updates
          staffNeedingProfileUpdates.push({
            ...staff,
            profile_id: profile.id,
            current_role: profile.role,
            has_valid_role: hasValidRole
          } as StaffWithProfileId & {
            current_role: string;
            has_valid_role: boolean;
          });
        }
      }
    }

    // Filter by selected staff IDs if provided
    let filteredStaffNeedingNewProfiles: any[] = staffNeedingNewProfiles;
    let filteredStaffNeedingProfileUpdates: StaffWithProfileId[] =
      staffNeedingProfileUpdates;

    if (selectedStaffIds && selectedStaffIds.length > 0) {
      const selectedIdsSet = new Set(selectedStaffIds);
      filteredStaffNeedingNewProfiles = staffNeedingNewProfiles.filter((s) =>
        selectedIdsSet.has(s.id)
      );
      filteredStaffNeedingProfileUpdates = staffNeedingProfileUpdates.filter(
        (s) => selectedIdsSet.has(s.id)
      );

    }

    const results = [];
    const errors = [];
    let createdCount = 0;
    let updatedCount = 0;

    // Process staff needing profile UPDATES first
    for (const staff of filteredStaffNeedingProfileUpdates) {
      try {
        const fullName = `${staff.first_name} ${staff.last_name}`.trim();

        // Type assertion to ensure profile_id exists
        const profileId = (staff as any).profile_id;

        if (!profileId) {
          throw new Error(`Profile ID not found for ${staff.institution_email}`);
        }

        // Determine role to set: Keep valid roles, otherwise set to faculty
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
        const currentRole = (staff as any).current_role;
        const hasValidRole = (staff as any).has_valid_role;
        const roleToSet = hasValidRole ? currentRole : 'faculty';

        // Build update object - only include role if it needs to be changed
        const updateData: any = {
          institution_id: staff.institution_id,
          department_id: staff.department_id,
          full_name: fullName,
          phone_number: staff.phone,
          gender: staff.gender,
          designation: staff.designation,
          updated_at: new Date().toISOString()
        };

        // Only update role if it's not already valid (faculty or HOD)
        if (!hasValidRole) {
          updateData.role = 'faculty';
        }

        // Update existing profile with correct data
        const { data: updatedProfile, error: updateError } = await supabaseAdmin
          .from('profiles')
          .update(updateData)
          .eq('id', profileId)
          .select()
          .single();

        if (updateError) {
          console.error(
            `Profile update error for ${staff.institution_email}:`,
            updateError
          );
          throw updateError;
        }

        updatedCount++;

        results.push({
          staff_id: staff.id,
          email: staff.institution_email,
          full_name: fullName,
          user_id: staff.profile_id,
          action: 'updated',
          temp_password: 'Profile updated - existing auth',
          success: true
        });
      } catch (error) {
        console.error(
          `Error updating profile for ${staff.institution_email}:`,
          error
        );

        errors.push({
          staff_id: staff.id,
          email: staff.institution_email,
          full_name: `${staff.first_name} ${staff.last_name}`.trim(),
          error: error instanceof Error ? error.message : 'Unknown error',
          success: false
        });
      }
    }

    // Process staff needing NEW profiles
    for (const staff of filteredStaffNeedingNewProfiles) {
      try {
        const fullName = `${staff.first_name} ${staff.last_name}`.trim();

        // Double-check if profile already exists (real-time check)
        const { data: existingProfileCheck } = await supabaseAdmin
          .from('profiles')
          .select('id, email, role, institution_id, department_id, gender, phone_number, designation')
          .eq('email', staff.institution_email)
          .maybeSingle();

        if (existingProfileCheck) {
          // Profile exists, check if it needs updates
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
          const hasValidRole = validRoles.includes(
            existingProfileCheck.role?.toLowerCase()
          );

          const needsUpdate =
            !hasValidRole ||
            existingProfileCheck.institution_id !== staff.institution_id ||
            existingProfileCheck.department_id !== staff.department_id ||
            existingProfileCheck.gender !== staff.gender ||
            existingProfileCheck.phone_number !== staff.phone ||
            existingProfileCheck.designation !== staff.designation;

          if (needsUpdate) {
            // Build update object
            const updateData: any = {
              institution_id: staff.institution_id,
              department_id: staff.department_id,
              full_name: fullName,
              phone_number: staff.phone,
              gender: staff.gender,
              designation: staff.designation,
              updated_at: new Date().toISOString()
            };

            // Only update role if it's not already valid (faculty or HOD)
            if (!hasValidRole) {
              updateData.role = 'faculty';
            }

            // Update the profile
            const { error: updateError } = await supabaseAdmin
              .from('profiles')
              .update(updateData)
              .eq('id', existingProfileCheck.id);

            if (updateError) throw updateError;

            updatedCount++;

            results.push({
              staff_id: staff.id,
              email: staff.institution_email,
              full_name: fullName,
              user_id: existingProfileCheck.id,
              action: 'updated',
              temp_password: 'Profile updated',
              success: true
            });
          } else {
            results.push({
              staff_id: staff.id,
              email: staff.institution_email,
              full_name: fullName,
              user_id: existingProfileCheck.id,
              action: 'skipped',
              temp_password: 'Profile already correct',
              success: true
            });
          }
          continue;
        }

        // Generate a placeholder UUID for profile creation
        const profileId = crypto.randomUUID();

        // Create new profile
        const { data: profileData, error: profileError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: profileId,
            email: staff.institution_email,
            full_name: fullName,
            role: 'faculty',
            phone_number: staff.phone,
            institution_id: staff.institution_id,
            department_id: staff.department_id,
            gender: staff.gender,
            designation: staff.designation,
            is_active: true,
            profile_completed: false,
            is_pre_registered: true
          })
          .select()
          .single();

        if (profileError) {
          console.error(
            `Profile insert error for ${staff.institution_email}:`,
            profileError
          );
          throw profileError;
        }

        createdCount++;

        results.push({
          staff_id: staff.id,
          email: staff.institution_email,
          full_name: fullName,
          user_id: profileId,
          action: 'created',
          temp_password: 'OAuth-only system - no password needed',
          success: true
        });
      } catch (error) {
        console.error(
          `Error creating profile for ${staff.institution_email}:`,
          error
        );

        errors.push({
          staff_id: staff.id,
          email: staff.institution_email,
          full_name: `${staff.first_name} ${staff.last_name}`.trim(),
          error: error instanceof Error ? error.message : 'Unknown error',
          success: false
        });
      }
    }

    const totalProcessed =
      filteredStaffNeedingNewProfiles.length +
      filteredStaffNeedingProfileUpdates.length;

    return NextResponse.json({
      success: true,
      message: `Processed ${totalProcessed} staff members (${createdCount} created, ${updatedCount} updated)`,
      results: {
        total_processed: totalProcessed,
        successful: results.length,
        failed: errors.length,
        created_count: createdCount,
        updated_count: updatedCount,
        created_profiles: results,
        errors: errors
      }
    });
  } catch (error) {
    console.error('Error in create-missing-profiles:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

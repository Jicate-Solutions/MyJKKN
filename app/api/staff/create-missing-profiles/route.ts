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

/**
 * Sync the user's primary user_roles assignment to match targetRoleKey.
 * - Demotes the existing primary (if different).
 * - Promotes an existing non-primary row for the target role, or inserts a new one.
 * - Returns whether anything was changed and whether a fallback to profiles.role
 *   is needed (when the user has NO user_roles at all — rare legacy case).
 *
 * The sync_primary_role_trigger on user_roles will cascade profiles.role
 * automatically after this runs.
 */
async function syncPrimaryUserRole(
  userId: string,
  targetRoleKey: string
): Promise<{ changed: boolean; hadNoUserRoles: boolean; error?: string }> {
  // Resolve custom_roles.id for the target role_key.
  const { data: targetRole } = await supabaseAdmin
    .from('custom_roles')
    .select('id')
    .eq('role_key', targetRoleKey)
    .maybeSingle();

  if (!targetRole) {
    return {
      changed: false,
      hadNoUserRoles: false,
      error: `custom_roles.role_key '${targetRoleKey}' does not exist`
    };
  }

  // Does the user have ANY user_roles rows?
  const { data: anyUserRoles } = await supabaseAdmin
    .from('user_roles')
    .select('id, role_id, is_primary')
    .eq('user_id', userId);

  if (!anyUserRoles || anyUserRoles.length === 0) {
    // Legacy user with no user_roles. Insert a fresh primary.
    const { error: insertError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: userId,
        role_id: (targetRole as any).id,
        is_primary: true
      });
    if (insertError) {
      return { changed: false, hadNoUserRoles: true, error: insertError.message };
    }
    return { changed: true, hadNoUserRoles: true };
  }

  const currentPrimary = anyUserRoles.find((r: any) => r.is_primary === true);
  if (currentPrimary && (currentPrimary as any).role_id === (targetRole as any).id) {
    // Already correct.
    return { changed: false, hadNoUserRoles: false };
  }

  // Demote existing primary (if any), respecting the partial unique index on (user_id) WHERE is_primary.
  if (currentPrimary) {
    await supabaseAdmin
      .from('user_roles')
      .update({ is_primary: false })
      .eq('id', (currentPrimary as any).id);
  }

  // Promote an existing row for targetRole, or insert a new one.
  const existingRow = anyUserRoles.find(
    (r: any) => r.role_id === (targetRole as any).id
  );
  if (existingRow) {
    await supabaseAdmin
      .from('user_roles')
      .update({ is_primary: true })
      .eq('id', (existingRow as any).id);
  } else {
    await supabaseAdmin.from('user_roles').insert({
      user_id: userId,
      role_id: (targetRole as any).id,
      is_primary: true
    });
  }

  return { changed: true, hadNoUserRoles: false };
}

export async function POST(request: Request) {
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
          error:
            'Only super admin and administrator can create missing profiles'
        },
        { status: 403 }
      );
    }

    // Get selected staff IDs from request body (optional - if not provided, sync all)
    const body = await request.json().catch(() => ({}));
    const selectedStaffIds: string[] | undefined = body.staff_ids;

    // Get all staff with institution emails + role_key (authoritative role source).
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

    // Role sync rule (updated 2026-04-16):
    // Compare and sync against the user's PRIMARY user_roles.role_key —
    // that's the authoritative source per the dynamic permission system.
    // For legacy users with no user_roles, fall back to profiles.role.
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
        // Profile exists - check if it needs updates.
        // Compare against PRIMARY user_roles (authoritative), fall back to
        // profiles.role for legacy users with no user_roles entries.
        const staffRoleKey = (staff as any).role_key as string | null | undefined;
        const primaryRoleKey = primaryRoleByUserId.get(profile.id);
        const effectiveCurrentRole = primaryRoleKey || profile.role || '';
        const roleMatches = !staffRoleKey
          ? true
          : effectiveCurrentRole.toLowerCase() === staffRoleKey.toLowerCase();
        const hasInstitutionId = profile.institution_id === staff.institution_id;
        const hasDepartmentId = profile.department_id === staff.department_id;
        const hasCorrectGender = profile.gender === staff.gender;
        const hasCorrectPhone = profile.phone_number === staff.phone;
        const hasCorrectDesignation = profile.designation === staff.designation;

        if (
          !roleMatches ||
          !hasInstitutionId ||
          !hasDepartmentId ||
          !hasCorrectGender ||
          !hasCorrectPhone ||
          !hasCorrectDesignation
        ) {
          // Profile needs updates. current_role reflects authoritative source.
          staffNeedingProfileUpdates.push({
            ...staff,
            profile_id: profile.id,
            current_role: effectiveCurrentRole,
            role_matches: roleMatches,
            target_role: staffRoleKey || effectiveCurrentRole
          } as StaffWithProfileId & {
            current_role: string;
            role_matches: boolean;
            target_role: string;
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

      console.log(
        `Processing only ${selectedStaffIds.length} selected staff members`
      );
    }

    console.log(
      `Found ${filteredStaffNeedingNewProfiles.length} staff members needing NEW profiles`
    );
    console.log(
      `Found ${filteredStaffNeedingProfileUpdates.length} staff members needing profile UPDATES`
    );
    console.log(
      `Total profiles to process: ${filteredStaffNeedingNewProfiles.length + filteredStaffNeedingProfileUpdates.length}`
    );

    const results = [];
    const errors = [];
    let createdCount = 0;
    let updatedCount = 0;

    // Process staff needing profile UPDATES first
    for (const staff of filteredStaffNeedingProfileUpdates) {
      try {
        const fullName = `${staff.first_name} ${staff.last_name}`.trim();

        console.log(
          `Updating profile for: ${fullName} (${staff.institution_email})`
        );
        console.log(`Profile ID to update: ${staff.profile_id}`);
        console.log(`Staff ID: ${staff.id}`);

        // Type assertion to ensure profile_id exists
        const profileId = (staff as any).profile_id;

        if (!profileId) {
          throw new Error(`Profile ID not found for ${staff.institution_email}`);
        }

        // Role sync rule: if staff.role_key is set and differs from profile.role,
        // update profile.role to staff.role_key. Otherwise leave role alone.
        // Never force to 'faculty' — that was the old bug that silently downgraded
        // hr_admin / coe / system_admin / cao / ceo and other non-allowlist roles.
        const currentRole = (staff as any).current_role;
        const roleMatches = (staff as any).role_matches;
        const targetRole = (staff as any).target_role;

        console.log(`Attempting update with values:`, {
          current_role: currentRole,
          target_role: targetRole,
          role_changed: !roleMatches,
          institution_id: staff.institution_id,
          department_id: staff.department_id,
          gender: staff.gender,
          designation: staff.designation,
          profile_id: profileId
        });

        const updateData: any = {
          institution_id: staff.institution_id,
          department_id: staff.department_id,
          full_name: fullName,
          phone_number: staff.phone,
          gender: staff.gender,
          designation: staff.designation,
          updated_at: new Date().toISOString()
        };

        // Role sync now targets the authoritative layer (user_roles primary).
        // The sync_primary_role_trigger cascades profiles.role automatically.
        // We do NOT write profiles.role directly here — doing both can race the trigger.
        if (!roleMatches && targetRole) {
          const roleSync = await syncPrimaryUserRole(profileId, targetRole);
          if (roleSync.error) {
            console.warn(
              `[create-missing-profiles] user_roles sync warning for ${staff.institution_email}: ${roleSync.error}`
            );
          }
          console.log(
            `[create-missing-profiles] Synced primary user_role → ${targetRole} (changed=${roleSync.changed}, hadNoUserRoles=${roleSync.hadNoUserRoles})`
          );
        }

        // Update existing profile with non-role fields.
        const { data: updatedProfile, error: updateError } = await supabaseAdmin
          .from('profiles')
          .update(updateData)
          .eq('id', profileId)
          .select()
          .single();

        console.log(`Update result:`, { updatedProfile, updateError });

        if (updateError) {
          console.error(
            `Profile update error for ${staff.institution_email}:`,
            updateError
          );
          throw updateError;
        }

        console.log(`Successfully updated profile for: ${fullName}`);
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

        console.log(`Creating profile for: ${fullName} (${staff.institution_email})`);

        // Double-check if profile already exists (real-time check)
        const { data: existingProfileCheck } = await supabaseAdmin
          .from('profiles')
          .select('id, email, role, institution_id, department_id, gender, phone_number, designation')
          .eq('email', staff.institution_email)
          .maybeSingle();

        if (existingProfileCheck) {
          // Profile exists — same role-sync logic as the primary path.
          const staffRoleKey = (staff as any).role_key as string | null | undefined;
          const profileRole = (existingProfileCheck.role || '').toLowerCase();
          const roleMatches = !staffRoleKey
            ? true
            : profileRole === staffRoleKey.toLowerCase();
          const targetRole = staffRoleKey || existingProfileCheck.role;

          const needsUpdate =
            !roleMatches ||
            existingProfileCheck.institution_id !== staff.institution_id ||
            existingProfileCheck.department_id !== staff.department_id ||
            existingProfileCheck.gender !== staff.gender ||
            existingProfileCheck.phone_number !== staff.phone ||
            existingProfileCheck.designation !== staff.designation;

          if (needsUpdate) {
            const updateData: any = {
              institution_id: staff.institution_id,
              department_id: staff.department_id,
              full_name: fullName,
              phone_number: staff.phone,
              gender: staff.gender,
              designation: staff.designation,
              updated_at: new Date().toISOString()
            };

            // Sync role at the user_roles layer (authoritative). Trigger cascades profiles.role.
            if (!roleMatches && targetRole) {
              const roleSync = await syncPrimaryUserRole(
                existingProfileCheck.id,
                targetRole
              );
              if (roleSync.error) {
                console.warn(
                  `[create-missing-profiles] user_roles sync warning for ${staff.institution_email}: ${roleSync.error}`
                );
              }
            }

            // Update the profile (non-role fields).
            const { error: updateError } = await supabaseAdmin
              .from('profiles')
              .update(updateData)
              .eq('id', existingProfileCheck.id);

            if (updateError) throw updateError;

            console.log(`Updated existing profile for ${staff.institution_email}`);
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
            console.log(
              `Profile already correct for ${staff.institution_email}, skipping`
            );
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
        console.log(`Creating new profile with ID: ${profileId}`);

        // Create new profile. Use staff.role_key as the authoritative role source.
        // Fallback to 'faculty' only if role_key is genuinely missing (shouldn't happen
        // post the 2026-04-16 bulk upload fix that plumbs role_key through).
        const newProfileRole = (staff as any).role_key || 'faculty';
        const { data: profileData, error: profileError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: profileId,
            email: staff.institution_email,
            full_name: fullName,
            role: newProfileRole,
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

        // Create the authoritative user_roles primary assignment for the new
        // profile so permission lookups work correctly from day one.
        if ((staff as any).role_key) {
          const roleSync = await syncPrimaryUserRole(
            profileId,
            (staff as any).role_key
          );
          if (roleSync.error) {
            console.warn(
              `[create-missing-profiles] user_roles seed warning for ${staff.institution_email}: ${roleSync.error}`
            );
          }
        }

        console.log(`Successfully created profile for: ${fullName}`);
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

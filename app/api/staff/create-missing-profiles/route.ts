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

export async function POST() {
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

    // Get staff without profiles
    const { data: staffWithoutProfiles, error: staffError } =
      await supabaseAdmin
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

    // Get existing profiles to avoid duplicates
    const { data: existingProfiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('email, id')
      .in(
        'email',
        staffWithoutProfiles.map((s) => s.institution_email)
      );

    if (profilesError) {
      throw profilesError;
    }

    // Since we can't access auth.users table, only check profiles
    // We'll create profiles for staff that don't have them, and let Google OAuth handle auth
    const existingProfileEmails = new Set(existingProfiles.map((p) => p.email));
    const staffNeedingProfiles = staffWithoutProfiles.filter(
      (staff) => !existingProfileEmails.has(staff.institution_email)
    );

    console.log(
      `Found ${staffNeedingProfiles.length} staff members needing profiles`
    );
    console.log(`Existing profiles: ${existingProfileEmails.size}`);

    const results = [];
    const errors = [];

    // Process each staff member
    for (const staff of staffNeedingProfiles) {
      try {
        const fullName = `${staff.first_name} ${staff.last_name}`.trim();

        console.log(`Processing: ${fullName} (${staff.institution_email})`);

        // Double-check if profile already exists (real-time check)
        const { data: existingProfileCheck } = await supabaseAdmin
          .from('profiles')
          .select('id, email')
          .eq('email', staff.institution_email)
          .maybeSingle();

        if (existingProfileCheck) {
          console.log(
            `Profile already exists for ${staff.institution_email}, skipping`
          );
          results.push({
            staff_id: staff.id,
            email: staff.institution_email,
            full_name: fullName,
            user_id: existingProfileCheck.id,
            temp_password: 'Profile already existed',
            auth_user_existed: true,
            success: true
          });
          continue; // Skip to next staff member
        }

        // Generate a placeholder UUID for profile creation
        // In OAuth-only system, profiles can exist without auth users initially
        const profileId = crypto.randomUUID();
        console.log(`Creating profile with placeholder ID: ${profileId}`);

        // Create profile with placeholder ID for OAuth-only system
        console.log(`Creating profile for user: ${profileId}`);

        // Use insert with generated UUID and set is_pre_registered = true
        const { data: profileData, error: profileError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: profileId,
            email: staff.institution_email,
            full_name: fullName,
            role: 'faculty',
            phone_number: staff.phone,
            institution_id: staff.institution_id,
            is_active: true,
            profile_completed: 'false',
            is_pre_registered: true // Set to true to bypass auth user validation
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

        console.log(`Successfully created/updated profile for: ${fullName}`);

        results.push({
          staff_id: staff.id,
          email: staff.institution_email,
          full_name: fullName,
          user_id: profileId,
          temp_password: 'OAuth-only system - no password needed',
          auth_user_existed: false,
          success: true
        });
      } catch (error) {
        console.error(
          `Error creating profile for ${staff.institution_email}:`,
          error
        );

        // Handle specific duplicate key errors
        if (error && typeof error === 'object' && 'code' in error) {
          const dbError = error as any;
          if (
            dbError.code === '23505' &&
            dbError.message?.includes('profiles_pkey')
          ) {
            // This profile already exists, let's check if we can retrieve it
            try {
              const { data: existingProfile } = await supabaseAdmin
                .from('profiles')
                .select('*')
                .eq('email', staff.institution_email)
                .single();

              if (existingProfile) {
                console.log(
                  `Found existing profile for ${staff.institution_email}, marking as success`
                );
                results.push({
                  staff_id: staff.id,
                  email: staff.institution_email,
                  full_name: `${staff.first_name} ${staff.last_name}`.trim(),
                  user_id: existingProfile.id,
                  temp_password: 'Profile already existed',
                  auth_user_existed: true,
                  success: true
                });
                continue; // Skip to next staff member
              }
            } catch (retrieveError) {
              console.error(
                `Could not retrieve existing profile for ${staff.institution_email}:`,
                retrieveError
              );
            }
          }
        }

        errors.push({
          staff_id: staff.id,
          email: staff.institution_email,
          full_name: `${staff.first_name} ${staff.last_name}`.trim(),
          error: error instanceof Error ? error.message : 'Unknown error',
          success: false
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${staffNeedingProfiles.length} staff members`,
      results: {
        total_processed: staffNeedingProfiles.length,
        successful: results.length,
        failed: errors.length,
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

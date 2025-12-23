import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { Profile } from '@/types/auth';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

// Create server client for use in server components and API routes
// Note: Database type removed to avoid type errors with incomplete type definitions
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch (error) {
            console.error('Error setting cookies:', error);
          }
        }
      }
    }
  );
}

// Alias for backward compatibility
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch (error) {
            console.error('Error setting cookies:', error);
          }
        }
      }
    }
  );
}

// Create service role client for administrative operations
export function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase service role credentials');
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

// Helper to get authenticated user - uses getUser for secure authentication
export async function getAuthUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, error: error || new Error('No user found') };
  }

  return { user, error: null };
}

// Helper to get enhanced user profile with student status (server-side)
export async function getEnhancedUserProfile(): Promise<{
  profile: Profile | null;
  error: Error | null;
}> {
  try {
    const supabase = await createServerSupabaseClient();

    // Get authenticated user
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!userData.user) {
      return { profile: null, error: new Error('No authenticated user') };
    }

    // Get user profile
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select(
        `
        *,
        institutions (
          id,
          name,
          category,
          institution_type,
          website,
          email,
          phone,
          city,
          state,
          country
        )
      `
      )
      .eq('id', userData.user.id)
      .single();

    if (profileError) throw profileError;

    // If user is a student, fetch their student record and status
    if (profileData && profileData.role === 'student') {
      try {
        const { data: studentData, error: studentError } = await supabase
          .from('learners_profiles')
          .select('id, status, is_profile_complete')
          .eq('college_email', profileData.email)
          .single();

        if (!studentError && studentData) {
          // Enhance profile with student information
          profileData.student_id = studentData.id;
          profileData.student_status = studentData.status;
          profileData.student_profile_complete =
            studentData.is_profile_complete;
        } else {
          // Student record not found or error - set defaults
          profileData.student_id = null;
          profileData.student_status = null;
          profileData.student_profile_complete = null;
        }
      } catch (studentFetchError) {
        // Log but don't fail the entire request if student fetch fails
        console.warn('Failed to fetch student status:', studentFetchError);
        profileData.student_id = null;
        profileData.student_status = null;
        profileData.student_profile_complete = null;
      }
    }

    return { profile: profileData, error: null };
  } catch (error) {
    return {
      profile: null,
      error: error instanceof Error ? error : new Error('Unknown error')
    };
  }
}

// Helper to get authenticated session
// DEPRECATED: For security reasons, use getAuthUser() instead
export async function getAuthSession() {
  // Using getUser for better security
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { session: null, error: error || new Error('No user found') };
  }

  // For backward compatibility, we return a session-like object
  return {
    session: {
      user,
      access_token: 'deprecated' // Note: don't use this access_token
    },
    error: null
  };
}

// DEPRECATED: For security reasons, use getAuthUser() instead
export async function getSession() {
  const supabase = await createServerSupabaseClient();
  try {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return null;

    // For backward compatibility only
    return {
      user,
      access_token: 'deprecated' // Note: don't use this access_token
    };
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

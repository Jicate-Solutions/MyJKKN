import { Database } from '@/types/supabase';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Create server client for use in server components
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
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

// Helper to get authenticated session
// Note: For server components, prefer getAuthUser() for security
export async function getAuthSession() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error || !session) {
    return { session: null, error: error || new Error('No session found') };
  }

  return { session, error: null };
}

export async function getSession() {
  const supabase = await createServerSupabaseClient();
  try {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return null;

    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}
import { createBrowserClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

// Define a type alias for the browser client
export type TypedSupabaseClient = SupabaseClient<Database>;

// Client-side singleton instance with proper database typing
let clientInstance: SupabaseClient<Database>;

// Admin singleton instance with proper database typing
let adminInstance: SupabaseClient<Database>;

export function createClientSupabaseClient(): TypedSupabaseClient {
  if (!clientInstance) {
    // Type assertion needed: createBrowserClient returns a compatible but slightly different type
    clientInstance = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          // Increase session refresh threshold to prevent frequent auth checks
          flowType: 'pkce'
        },
        db: {
          schema: 'public'
        },
        global: {
          headers: {
            'Prefer': 'count=exact'
          }
        }
      }
    ) as unknown as SupabaseClient<Database>;
  }
  return clientInstance as TypedSupabaseClient;
}

export function createAdminClient() {
  // In the browser, there is no such thing as an "admin" client — the service
  // role key must never ship to the client. Previously, this function fell
  // back to the anon key in browser contexts, which created a second
  // GoTrueClient pointed at the same localStorage as createClientSupabaseClient
  // and triggered the "Multiple GoTrueClient instances detected" warning.
  // Returning the regular browser singleton is both safer (honest about the
  // actual privileges available) and eliminates the auth-storage collision.
  if (typeof window !== 'undefined') {
    return createClientSupabaseClient();
  }

  if (!adminInstance) {
    const authKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !authKey) {
      throw new Error('Missing Supabase credentials');
    }

    adminInstance = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      authKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }
  return adminInstance;
}

// Helper to get the appropriate client based on context
export function getSupabaseClient(options?: { admin?: boolean }) {
  if (options?.admin) {
    return createAdminClient();
  }
  return createClientSupabaseClient();
}

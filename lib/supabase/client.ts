import { createBrowserClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

// Client-side singleton instance
// Note: Database type removed to avoid type errors with incomplete type definitions
let clientInstance: ReturnType<typeof createBrowserClient>;

// Admin singleton instance
let adminInstance: ReturnType<typeof createClient>;

export function createClientSupabaseClient() {
  if (!clientInstance) {
    clientInstance = createBrowserClient(
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
    );
  }
  return clientInstance;
}

export function createAdminClient() {
  if (!adminInstance) {
    // For client-side components, fall back to anon key
    const isClient = typeof window !== 'undefined';
    const authKey = isClient
      ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      : process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !authKey) {
      throw new Error('Missing Supabase credentials');
    }

    adminInstance = createClient(
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

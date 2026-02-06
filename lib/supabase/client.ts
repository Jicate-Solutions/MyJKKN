import { createBrowserClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

// Define a type alias for the browser client
export type TypedSupabaseClient = SupabaseClient<Database>;

// Admin singleton instance with proper database typing
let adminInstance: SupabaseClient<Database>;

export function createClientSupabaseClient(): TypedSupabaseClient {
  // Let @supabase/ssr v0.6.1 handle cookies internally with its built-in
  // browser cookie adapter. No custom cookie handlers needed.
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ) as unknown as TypedSupabaseClient;
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

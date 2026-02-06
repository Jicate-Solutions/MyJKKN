import { createBrowserClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

// Define a type alias for the browser client
export type TypedSupabaseClient = SupabaseClient<Database>;

// Browser client singleton instance with proper database typing
// This ensures only ONE auth state listener is active across the entire app
let browserInstance: TypedSupabaseClient | null = null;

// Admin singleton instance with proper database typing
let adminInstance: SupabaseClient<Database>;

export function createClientSupabaseClient(): TypedSupabaseClient {
  // Return existing singleton if available
  // This prevents multiple auth state subscriptions and memory leaks
  if (browserInstance) {
    return browserInstance;
  }

  // Validate environment variables with clear error messages
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase environment variables. ' +
      'Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.'
    );
  }

  // Create singleton instance
  // Let @supabase/ssr v0.6.1 handle cookies internally with its built-in
  // browser cookie adapter. No custom cookie handlers needed.
  // The createBrowserClient<Database> return type is compatible with
  // SupabaseClient<Database> - both implement the same interface.
  browserInstance = createBrowserClient<Database>(
    supabaseUrl,
    supabaseKey
  ) as TypedSupabaseClient;

  return browserInstance;
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

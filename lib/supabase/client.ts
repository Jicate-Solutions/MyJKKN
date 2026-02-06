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
  ) as unknown as TypedSupabaseClient;

  return browserInstance;
}

export function createAdminClient() {
  if (!adminInstance) {
    // SECURITY FIX: More reliable runtime detection
    // typeof window check can be bypassed by webpack polyfills/plugins
    // Check for Node.js-specific properties instead
    const isServerRuntime = typeof process.env.SUPABASE_SERVICE_ROLE_KEY !== 'undefined';

    // Additional safety: verify we're in Node.js environment (not browser/edge)
    const isNodeEnvironment = typeof process !== 'undefined' &&
                              process.versions != null &&
                              process.versions.node != null;

    // Only use service role key if:
    // 1. Service role key exists (server environment)
    // 2. We're in Node.js runtime (not edge/browser)
    // 3. Window is NOT defined (extra safety check)
    const canUseServiceKey = isServerRuntime &&
                             isNodeEnvironment &&
                             typeof window === 'undefined';

    const authKey = canUseServiceKey
      ? process.env.SUPABASE_SERVICE_ROLE_KEY!
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !authKey) {
      throw new Error('Missing Supabase credentials');
    }

    // Log which key is being used (redacted) for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('[Supabase Admin Client] Using:', canUseServiceKey ? 'SERVICE_ROLE (server)' : 'ANON_KEY (client/edge)');
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

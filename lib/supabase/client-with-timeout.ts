import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/supabase';
import { refreshBlipSafeFetch } from './refresh-blip-fetch';

// Create a Supabase client with extended timeout for complex queries
export function createClientSupabaseClientWithTimeout(timeoutMs: number = 30000) {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          // Set a longer timeout for complex queries
          'x-client-info': `supabase-js-timeout/${timeoutMs}`
        },
        // Same browser-client singleton and cookies as client.ts: keep the login
        // on a temporary token-refresh error. See refresh-blip-fetch.ts.
        fetch: refreshBlipSafeFetch
      },
      db: {
        schema: 'public'
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    }
  );
}
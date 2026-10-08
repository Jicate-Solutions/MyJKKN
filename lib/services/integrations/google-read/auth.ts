// lib/services/integrations/google-read/auth.ts
//
// Who is calling? Two ways in, one answer: the caller's OWN Supabase identity.
//
//   1. Authorization: Bearer <the person's Supabase access token> — how the
//      assistant's answering computers call these endpoints on the person's
//      behalf. Validated with auth.getUser(token); the returned client carries
//      the same token, so every database call runs AS that person (RLS and
//      auth.uid() apply).
//   2. The normal cookie session — a signed-in browser.
//
// A Bearer header that does not validate is a 401. It never falls back to the
// cookie: a request that names an identity and fails must not quietly act as a
// different one.
//
// There is deliberately no way to name another person. Nothing here reads a
// user id from the request body or the query string.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { createClient as createCookieClient } from '@/lib/supabase/server';

export interface GoogleReadCaller {
  supabase: SupabaseClient;
  userId: string;
  via: 'bearer' | 'cookie';
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header.trim());
  return match ? match[1] : '';
}

/** The caller, or null when they are not signed in / the token is not valid. */
export async function resolveGoogleReadCaller(request: Request): Promise<GoogleReadCaller | null> {
  const token = bearerToken(request);

  if (token !== null) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!token || !url || !anonKey) return null;

    const supabase = createSupabaseJsClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return { supabase, userId: data.user.id, via: 'bearer' };
  }

  const supabase = (await createCookieClient()) as unknown as SupabaseClient;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) return null;
  return { supabase, userId: data.user.id, via: 'cookie' };
}

/**
 * May this person use the AI Assistant at all? Same triad as every RLS policy:
 * super admin, admin, or the ai_query.view permission. The tool catalog names
 * the same key; checking it here too means a caller that skips the catalog
 * still cannot get in.
 */
export async function canUseAssistant(supabase: SupabaseClient): Promise<boolean> {
  const [sa, admin, perm] = await Promise.all([
    supabase.rpc('is_super_admin'),
    supabase.rpc('is_admin'),
    supabase.rpc('user_has_permission', { permission_name: 'ai_query.view' }),
  ]);
  return sa.data === true || admin.data === true || perm.data === true;
}

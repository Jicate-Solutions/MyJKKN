/**
 * Client-safe variant of get-policy.ts — uses the BROWSER supabase client so
 * the call is safe to bundle into client components / TanStack hooks.
 *
 * Why this exists
 * ---------------
 * The original `lib/policies/get-policy.ts` imports `next/headers` (via
 * `lib/supabase/server.ts`) which Next.js 16 forbids in any module that ends
 * up in the client bundle. PR #617 added `getPolicyInt` to several services
 * (audit-discovery, analytics-engagement, etc.) that ARE bundled into client
 * components — webpack rejected the resulting bundle (caught 2026-04-29).
 *
 * Resolution semantics
 * --------------------
 * Identical RPC (`fn_get_policy` SECURITY DEFINER) — only the supabase client
 * differs. User-scoped lookups still work because the browser client carries
 * the auth cookie. Server callers should keep using `get-policy.ts`; client
 * callers should use this file.
 *
 * When to use which
 * -----------------
 *   - API routes / server actions / cron / RSC →  `@/lib/policies/get-policy`
 *   - Client components / TanStack hooks / client services →  this file
 *
 * Phase 1.5a (2026-04-29): canonical runtime-config substrate, client-side fork.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { PolicyKey } from './keys';

const supabase = createClientSupabaseClient();

export async function getPolicy<T = unknown>(
  key: PolicyKey,
  scopeId?: string | null
): Promise<T | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('fn_get_policy', {
    p_key: key,
    p_scope_id: scopeId ?? null,
  });
  if (error) {
    console.error(`[get-policy-client] RPC failed for ${key}`, error);
    return null;
  }
  return data as T;
}

export async function getPolicyInt(
  key: PolicyKey,
  defaultValue: number,
  scopeId?: string | null
): Promise<number> {
  const v = await getPolicy<number>(key, scopeId);
  return typeof v === 'number' ? v : defaultValue;
}

export async function getPolicyString(
  key: PolicyKey,
  defaultValue: string,
  scopeId?: string | null
): Promise<string> {
  const v = await getPolicy<string>(key, scopeId);
  return typeof v === 'string' ? v : defaultValue;
}

export async function getPolicyBool(
  key: PolicyKey,
  defaultValue: boolean,
  scopeId?: string | null
): Promise<boolean> {
  const v = await getPolicy<boolean>(key, scopeId);
  return typeof v === 'boolean' ? v : defaultValue;
}

export async function getPolicyArray<T = string>(
  key: PolicyKey,
  defaultValue: T[],
  scopeId?: string | null
): Promise<T[]> {
  const v = await getPolicy<T[]>(key, scopeId);
  return Array.isArray(v) ? v : defaultValue;
}

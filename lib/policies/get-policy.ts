import { createClient } from '@/lib/supabase/server';
import type { PolicyKey } from './keys';

/**
 * Read a policy value via fn_get_policy RPC.
 *
 * Resolution priority (server-side): user > institution > role > global.
 * Returns null on RPC error or missing policy. Callers should provide a
 * default via the type-safe helpers below.
 *
 * Phase 1.5a (2026-04-29): canonical runtime-config substrate.
 */
export async function getPolicy<T = unknown>(
  key: PolicyKey,
  scopeId?: string | null
): Promise<T | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_get_policy', {
    p_key: key,
    p_scope_id: scopeId ?? null,
  });
  if (error) {
    console.error(`[get-policy] RPC failed for ${key}`, error);
    return null;
  }
  return data as T;
}

/** Read an integer policy with default. */
export async function getPolicyInt(
  key: PolicyKey,
  defaultValue: number,
  scopeId?: string | null
): Promise<number> {
  const v = await getPolicy<number>(key, scopeId);
  return typeof v === 'number' ? v : defaultValue;
}

/** Read a string/enum policy with default. */
export async function getPolicyString(
  key: PolicyKey,
  defaultValue: string,
  scopeId?: string | null
): Promise<string> {
  const v = await getPolicy<string>(key, scopeId);
  return typeof v === 'string' ? v : defaultValue;
}

/** Read a boolean policy with default. */
export async function getPolicyBool(
  key: PolicyKey,
  defaultValue: boolean,
  scopeId?: string | null
): Promise<boolean> {
  const v = await getPolicy<boolean>(key, scopeId);
  return typeof v === 'boolean' ? v : defaultValue;
}

/** Read an array policy with default. */
export async function getPolicyArray<T = string>(
  key: PolicyKey,
  defaultValue: T[],
  scopeId?: string | null
): Promise<T[]> {
  const v = await getPolicy<T[]>(key, scopeId);
  return Array.isArray(v) ? v : defaultValue;
}

// lib/services/instasolver/shared.ts
//
// Plumbing shared by the InstaSolver services. The services run in the browser
// under the caller's own session, so RLS is the boundary — never a filter
// applied here. instasolver_* tables are not in the generated Database type,
// hence the `any` client (same convention as lib/services/procurement).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { ListMetadata } from '@/types/instasolver';
import { PAGE_SIZE } from '@/lib/instasolver/constants';

export type Db = any;

export function db(): Db {
  return createClientSupabaseClient() as any;
}

/**
 * Throw the database's own message. The guards in migration 20270510090100
 * word every refusal for the person reading it ("Set a priority before
 * assigning this issue"), so it is shown as-is rather than replaced with a
 * generic "something went wrong" (rule #27: a refusal is spoken, never silent).
 */
export function unwrap<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error) {
    const err = new Error(result.error.message || 'The request could not be completed');
    (err as Error & { code?: string }).code = result.error.code;
    throw err;
  }
  return result.data;
}

export async function currentUserId(client: Db = db()): Promise<string> {
  const {
    data: { user }
  } = await client.auth.getUser();
  if (!user) throw new Error('You are not signed in');
  return user.id as string;
}

export function pageRange(page = 1, limit = PAGE_SIZE): { from: number; to: number; page: number; limit: number } {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const safePage = Math.max(page, 1);
  const from = (safePage - 1) * safeLimit;
  return { from, to: from + safeLimit - 1, page: safePage, limit: safeLimit };
}

export function pageMetadata(total: number | null, page: number, limit: number): ListMetadata {
  const t = total ?? 0;
  return { total: t, page, limit, totalPages: Math.max(1, Math.ceil(t / limit)) };
}

/** Strip characters that would break a PostgREST `or=` expression. */
export function sanitiseSearch(term: string | undefined): string {
  return (term ?? '').replace(/[,()*%\\]/g, ' ').trim().slice(0, 80);
}

export const PERSON_COLUMNS = 'id, full_name, avatar_url';

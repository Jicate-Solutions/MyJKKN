// app/api/foundation/onemark/sources/_shared.ts
//
// Helpers shared by the source routes. Not a route (no HTTP verb exported) —
// Next.js ignores it.
//
// ONE CLIENT, ON PURPOSE. Every read and write here goes through the SESSION
// client, so `onemark_item_sources`' own RLS decides: any signed-in person may
// READ the list (the pickers need it), and only a holder of
// `foundation.items.manage` may write it. Nothing in this lane ever touches a
// question's answer, so the service-role client is not needed and is not used.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OneMarkSourceRow } from '@/lib/services/onemark/sources-service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyClient = SupabaseClient<any, any, any>;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SOURCE_COLUMNS = 'key, label, description, is_system, is_active, sort_order, updated_at';

export interface SourceGate {
  userId: string;
  /** foundation.items.manage — may add, rename, re-order and retire. */
  canManage: boolean;
}

/** Who is asking, and may they change the list.
 *
 *  An RPC FAILURE is thrown, never read as "no": a permission check that timed
 *  out must surface as a 500, so a 403 keeps meaning what it says (CLAUDE.md
 *  #27 — a refusal is explicit, never a silent redirect or a quiet empty list). */
export async function sourceGate(supabase: AnyClient): Promise<SourceGate | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const res = await supabase.rpc('user_has_permission', {
    permission_name: 'foundation.items.manage',
  });
  if (res.error) throw new Error(`Permission check failed: ${res.error.message}`);
  return { userId: user.id, canManage: res.data === true };
}

export async function loadSources(supabase: AnyClient): Promise<OneMarkSourceRow[]> {
  const { data, error } = await supabase
    .from('onemark_item_sources')
    .select(SOURCE_COLUMNS)
    .order('sort_order')
    .order('label');
  if (error) throw error;
  return (data ?? []) as unknown as OneMarkSourceRow[];
}

export interface ItemSourceRow {
  source_key: string | null;
  is_active: boolean;
}

/** Every question's (origin, live?) pair, paged past PostgREST's 1,000-row cap.
 *  Counting in the browser rather than with a grouped query keeps this on the
 *  session client — a `group by` would need a view or an RPC, and this lane
 *  writes no SQL. The bank is in the hundreds; the page size is the guard. */
export async function loadItemSourceCounts(
  supabase: AnyClient,
  examDefinitionId?: string,
): Promise<ItemSourceRow[]> {
  const PAGE = 1000;
  const out: ItemSourceRow[] = [];
  for (let from = 0; from < 50_000; from += PAGE) {
    let q = supabase.from('fp_items').select('source_key, is_active').range(from, from + PAGE - 1);
    if (examDefinitionId) q = q.eq('exam_definition_id', examDefinitionId);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as unknown as ItemSourceRow[];
    for (const r of rows) out.push({ source_key: r.source_key ?? null, is_active: r.is_active === true });
    if (rows.length < PAGE) break;
  }
  return out;
}

/** The two Class-12 subject rows, for the pickers on the tagging screen. */
export async function loadOneMarkExams(
  supabase: AnyClient,
  examKeys: readonly string[],
): Promise<Array<{ id: string; config_key: string; display_name: string }>> {
  const { data, error } = await supabase
    .from('exam_definitions')
    .select('id, config_key, display_name, sort_order')
    .in('config_key', examKeys as string[])
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map((e: { id: string; config_key: string; display_name: string }) => ({
    id: e.id,
    config_key: e.config_key,
    display_name: e.display_name,
  }));
}

/** A Postgres error that means "Lane S3's migration has not been applied yet".
 *  The screens turn this into "not set up yet", which is the truth, instead of
 *  a red error that reads like the feature is broken. */
export function isMissingObject(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === '42883' || error.code === 'PGRST202') return true;
  return /could not find the (function|table)|does not exist|schema cache/i.test(error.message ?? '');
}

/** A Postgres permission refusal raised by an RPC's own gate. */
export function isForbidden(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42501' || /not authorized/i.test(error.message ?? '');
}

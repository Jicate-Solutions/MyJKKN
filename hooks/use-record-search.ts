'use client';

// Command-palette RECORD search — learners, staff, admission leads, courses.
//
// Distinct from usePageSearch(), which fuzzy-matches the static route manifest
// client-side. Page titles are not secret, so that search can run in the
// browser; RECORDS are, so this one runs entirely in the database behind
// fn_global_record_search() (SECURITY INVOKER), where each table's own RLS
// decides what comes back — a row the caller cannot SELECT cannot be
// returned. The function's user_has_permission() check is a short-circuit and
// a group label, NOT the boundary, and it deliberately no longer calls
// role_has_institution_access(): a second, simpler institution rule competing
// with the policy RLS actually applies is what leaked lead phone numbers on
// 2026-09-12. Nothing here filters for security — the client is not a gate.
//
// Migrations, in order (the LAST one is the live definition):
//   20261201090000  created it — SECURITY DEFINER, the defect
//   20261201100000  re-issued as SECURITY INVOKER — the fix
//   20261201140000  + departments, programmes, institutions
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { isRecordEntity, type RecordHit } from '@/lib/navigation/record-search';

/** Matches the RPC's 2-character floor; below this the function returns zero rows. */
export const RECORD_SEARCH_MIN_CHARS = 2;

const DEBOUNCE_MS = 250;

/** Raw row shape from fn_global_record_search (snake_case, straight from PostgREST). */
interface RawRecordRow {
  entity: string | null;
  record_id: string | null;
  title: string | null;
  subtitle: string | null;
  institution_name: string | null;
  match_rank: number | null;
}

function toHits(rows: RawRecordRow[]): RecordHit[] {
  const hits: RecordHit[] = [];
  for (const row of rows) {
    // Skip anything this build cannot route. A future migration may add an
    // entity before the frontend knows about it; rendering an unroutable row
    // would give the user a result that goes nowhere.
    if (!isRecordEntity(row.entity) || !row.record_id) continue;
    const title = (row.title ?? '').trim();
    if (!title) continue;
    hits.push({
      entity: row.entity,
      recordId: row.record_id,
      title,
      subtitle: row.subtitle?.trim() || null,
      institutionName: row.institution_name?.trim() || null,
      matchRank: row.match_rank ?? 1,
    });
  }
  return hits;
}

/** Debounce a fast-changing input so each keystroke does not hit the database. */
function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

interface UseRecordSearchReturn {
  hits: RecordHit[];
  isFetching: boolean;
  /** True when the RPC failed — the palette shows a quiet notice, never a crash. */
  isError: boolean;
  /** True while the user's typing has not yet settled into a request. */
  isDebouncing: boolean;
}

/**
 * Search records matching `query`, scoped server-side to what the caller may see.
 *
 * @param query   Raw palette input (debounced internally).
 * @param enabled Pass the palette's open state — no requests while it is closed.
 */
export function useRecordSearch(query: string, enabled: boolean): UseRecordSearchReturn {
  const trimmed = query.trim();
  const debounced = useDebounced(trimmed, DEBOUNCE_MS);
  const longEnough = trimmed.length >= RECORD_SEARCH_MIN_CHARS;
  const active = enabled && debounced.length >= RECORD_SEARCH_MIN_CHARS;

  const { data, isFetching, isError } = useQuery({
    queryKey: ['global-record-search', debounced],
    enabled: active,
    // Records change often enough that a long cache would show stale names,
    // but a palette is reopened constantly — 30s keeps repeat opens instant.
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<RecordHit[]> => {
      const supabase = createClientSupabaseClient();
      // fn_global_record_search is newer than types/supabase.ts, so the rpc()
      // overload does not know it yet. The cast is confined to this one call
      // and the result is narrowed immediately by toHits().
      const { data: rows, error } = await (supabase as any).rpc('fn_global_record_search', {
        p_query: debounced,
        p_limit_per_entity: 5,
      });
      if (error) throw error;
      return toHits((rows ?? []) as RawRecordRow[]);
    },
  });

  return {
    hits: data ?? [],
    isFetching: active && isFetching,
    isError,
    // Compare against `trimmed`, not `active` — while the debounce is pending
    // `debounced` still holds the PREVIOUS value, so keying off `active` would
    // report "not debouncing" for the first two characters the user types.
    isDebouncing: enabled && longEnough && debounced !== trimmed,
  };
}

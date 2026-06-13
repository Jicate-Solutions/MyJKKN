'use client';

// URL ↔ state sync for the residents filter row. Per /myjkkn-module Q4
// (URL query params for shareability + survives refresh).
//
// Conflict reconciliation per /assumption-thrash Round 3 #2: if block_id is
// set to a block NOT in the selected institution, auto-clear block_id and
// keep institution selection. The reconciliation is owned by the page that
// has the full block list (this hook just reports the conflict).

import { useCallback, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { UNASSIGNED_BLOCK, type BlockFilterValue } from '@/types/campus-living';

export interface ResidentsFilterUrlState {
  q: string;
  institution: string | null;
  year: number | null;
  gender: 'Male' | 'Female' | 'Other' | null;
  block: BlockFilterValue | null;
  detail: string | null;
}

const EMPTY: ResidentsFilterUrlState = {
  q: '',
  institution: null,
  year: null,
  gender: null,
  block: null,
  detail: null,
};

function parseYear(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : null;
}

function parseGender(v: string | null): ResidentsFilterUrlState['gender'] {
  if (v === 'Male' || v === 'Female' || v === 'Other') return v;
  return null;
}

function parseBlock(v: string | null): BlockFilterValue | null {
  if (!v) return null;
  if (v === UNASSIGNED_BLOCK) return UNASSIGNED_BLOCK;
  // shape-check uuid-ish (avoid pushing arbitrary garbage)
  if (/^[0-9a-f-]{32,40}$/i.test(v)) return v;
  return null;
}

export function useResidentsFilterUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const state: ResidentsFilterUrlState = useMemo(
    () => ({
      q: params.get('q') ?? '',
      institution: params.get('institution') || null,
      year: parseYear(params.get('year')),
      gender: parseGender(params.get('gender')),
      block: parseBlock(params.get('block')),
      detail: params.get('detail') || null,
    }),
    [params],
  );

  const writeUrl = useCallback(
    (next: Partial<ResidentsFilterUrlState>) => {
      const merged: ResidentsFilterUrlState = { ...state, ...next };
      const sp = new URLSearchParams();
      if (merged.q) sp.set('q', merged.q);
      if (merged.institution) sp.set('institution', merged.institution);
      if (merged.year !== null) sp.set('year', String(merged.year));
      if (merged.gender) sp.set('gender', merged.gender);
      if (merged.block) sp.set('block', merged.block);
      if (merged.detail) sp.set('detail', merged.detail);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, state],
  );

  const clearAllFilters = useCallback(() => {
    writeUrl({
      q: '',
      institution: null,
      year: null,
      gender: null,
      block: null,
    });
  }, [writeUrl]);

  // Active filter count (excludes search box + detail param — search has its
  // own visual state, detail is a drawer concern).
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (state.institution) n++;
    if (state.year !== null) n++;
    if (state.gender) n++;
    if (state.block) n++;
    return n;
  }, [state]);

  return { state, setState: writeUrl, clearAllFilters, activeFilterCount, EMPTY };
}

// Reconciliation helper: call from the consumer page once the block list is
// available. If the current block_id belongs to no institution overlapping
// the selected institution, auto-clear block_id (keep institution).
//
// hostel-rooms-v2 PR 2 (2026-05-26): hostel_blocks.institution_id dropped;
// blocks now relate to colleges N:M via hostel_block_institutions. blockMap
// value carries the SET of granted institutions per block.
export function useReconcileBlockInstitution(
  state: ResidentsFilterUrlState,
  setState: (next: Partial<ResidentsFilterUrlState>) => void,
  blockMap: Map<string, { institution_ids: string[] }> | null,
) {
  useEffect(() => {
    if (!blockMap) return;
    if (!state.block || state.block === UNASSIGNED_BLOCK) return;
    if (!state.institution) return;
    const block = blockMap.get(state.block);
    if (block && !block.institution_ids.includes(state.institution)) {
      setState({ block: null });
    }
  }, [state.block, state.institution, blockMap, setState]);
}

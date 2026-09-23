'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  BillingAuditFilters,
  BillingAuditFindingFilter
} from '@/types/campus-living-billing-audit';

/**
 * Filters live in the URL so a KPI card on Analytics can deep-link into the
 * Learner Audit list it counted, and so a filtered view survives reload and
 * can be shared. Keys are deliberately distinct from the shared DataTable's
 * own URL state (page / pageSize / search / sortBy / sortOrder /
 * columnVisibility), which lives on the same route.
 */
const KEYS = {
  institution_id: 'institution_id',
  academic_year_id: 'academic_year_id',
  block_id: 'block_id',
  room_category_id: 'room_category_id',
  program_id: 'program_id',
  gender: 'gender',
  allocated_only: 'allocated_only',
  finding: 'finding'
} as const;

export function parseFilters(sp: URLSearchParams): BillingAuditFilters {
  const inst = sp.get(KEYS.institution_id);
  return {
    institution_ids: inst ? [inst] : null,
    academic_year_id: sp.get(KEYS.academic_year_id) || null,
    block_id: sp.get(KEYS.block_id) || null,
    room_category_id: sp.get(KEYS.room_category_id) || null,
    program_id: sp.get(KEYS.program_id) || null,
    gender: sp.get(KEYS.gender) || null,
    allocated_only: sp.get(KEYS.allocated_only) === '1',
    finding: (sp.get(KEYS.finding) as BillingAuditFindingFilter | null) || 'all'
  };
}

/** Serialise the scope part of the filters (everything except `finding`) so a
 *  link into the learners page carries the same population. */
export function toScopeQuery(f: BillingAuditFilters): string {
  const sp = new URLSearchParams();
  const inst = f.institution_ids?.[0];
  if (inst) sp.set(KEYS.institution_id, inst);
  if (f.academic_year_id) sp.set(KEYS.academic_year_id, f.academic_year_id);
  if (f.block_id) sp.set(KEYS.block_id, f.block_id);
  if (f.room_category_id) sp.set(KEYS.room_category_id, f.room_category_id);
  if (f.program_id) sp.set(KEYS.program_id, f.program_id);
  if (f.gender) sp.set(KEYS.gender, f.gender);
  if (f.allocated_only) sp.set(KEYS.allocated_only, '1');
  return sp.toString();
}

export function useBillingAuditFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);

  const onChange = useCallback(
    (patch: Partial<BillingAuditFilters>) => {
      const next = { ...filters, ...patch };
      const sp = new URLSearchParams(searchParams.toString());
      // Rewrite only our keys; leave the DataTable's page/search/sort alone —
      // except page, which must reset when the population changes or a
      // narrowed result set strands the user on a page that no longer exists
      // (an empty grid on an audit screen reads as "no problems").
      for (const k of Object.values(KEYS)) sp.delete(k);
      const scope = new URLSearchParams(toScopeQuery(next));
      scope.forEach((v, k) => sp.set(k, v));
      if (next.finding && next.finding !== 'all') sp.set(KEYS.finding, next.finding);
      sp.delete('page');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [filters, pathname, router, searchParams]
  );

  const scopeQuery = useMemo(() => toScopeQuery(filters), [filters]);

  return { filters, onChange, scopeQuery };
}

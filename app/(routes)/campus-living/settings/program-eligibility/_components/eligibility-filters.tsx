'use client';

// Advanced filter panel for the Category Eligibility tab. All rows are loaded
// client-side (useEligibility(null) lists every institution), so this filters
// the in-memory list — no server round-trip per filter change. Options are
// derived from the loaded rows, so a value can never match nothing.

import { useMemo } from 'react';
import type { ProgramEligibilityRow } from '@/types/program-eligibility';
import { formatFeeBand } from './format';
import {
  distinctOptions,
  FilterRow,
  FiltersPopover,
  type Option,
} from '@/components/campus-living/filter-panel';

// program_id === null means "institution default"; an empty quota_ids means
// "any quota". Both need explicit filter options, so they get sentinels.
const SCOPE_DEFAULT = '__default__';
const QUOTA_ANY = '__any_quota__';

export interface EligibilityAdvancedFilters {
  institution_id: string | null;
  scope: string | null; // SCOPE_DEFAULT | program_id
  quota: string | null; // QUOTA_ANY | quota_id
  hostel_type: string | null;
  room_category_id: string | null;
  mess_category_id: string | null;
  status: 'allowed' | 'disabled' | null;
}

export const EMPTY_ELIGIBILITY_FILTERS: EligibilityAdvancedFilters = {
  institution_id: null,
  scope: null,
  quota: null,
  hostel_type: null,
  room_category_id: null,
  mess_category_id: null,
  status: null,
};

export function countActiveEligibilityFilters(
  f: EligibilityAdvancedFilters
): number {
  return Object.values(f).filter((v) => v !== null).length;
}

// Single source of truth for the predicate so the page (which applies it) and
// the panel (which sets it) can't drift. null filter values mean "Any".
export function eligibilityMatchesFilters(
  row: ProgramEligibilityRow,
  f: EligibilityAdvancedFilters,
  search: string
): boolean {
  if (f.institution_id && row.institution_id !== f.institution_id) return false;
  if (f.scope) {
    const match =
      f.scope === SCOPE_DEFAULT
        ? row.program_id === null
        : row.program_id === f.scope;
    if (!match) return false;
  }
  if (f.quota) {
    const ids = row.quota_ids ?? [];
    const match = f.quota === QUOTA_ANY ? ids.length === 0 : ids.includes(f.quota);
    if (!match) return false;
  }
  if (f.hostel_type && row.hostel_type !== f.hostel_type) return false;
  if (f.room_category_id && row.room_category_id !== f.room_category_id)
    return false;
  if (f.mess_category_id && row.mess_category_id !== f.mess_category_id)
    return false;
  if (f.status && (row.is_active ? 'allowed' : 'disabled') !== f.status)
    return false;

  const q = search.trim().toLowerCase();
  if (q) {
    const haystack = [
      row.institution_name,
      row.program_name ?? 'All programs default',
      row.quota_names.length ? row.quota_names.join(' ') : 'Any quota',
      row.room_category_name,
      row.mess_category_name,
      formatFeeBand(row.fee_min, row.fee_max),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

const HOSTEL_TYPE_LABELS: Record<string, string> = {
  boys: 'Boys',
  girls: 'Girls',
  both: 'Both',
};

export function EligibilityFiltersPanel({
  rows,
  value,
  onChange,
}: {
  rows: ProgramEligibilityRow[];
  value: EligibilityAdvancedFilters;
  onChange: (next: EligibilityAdvancedFilters) => void;
}) {
  const institutionOptions = useMemo(
    () =>
      distinctOptions(rows, (r) => ({
        value: r.institution_id,
        label: r.institution_name,
      })),
    [rows]
  );

  const scopeOptions = useMemo<Option[]>(() => {
    const programs = distinctOptions(rows, (r) => ({
      value: r.program_id,
      label: r.program_name,
    }));
    return rows.some((r) => r.program_id === null)
      ? [{ value: SCOPE_DEFAULT, label: 'All programs — default' }, ...programs]
      : programs;
  }, [rows]);

  const quotaOptions = useMemo<Option[]>(() => {
    const byId = new Map<string, string>();
    let hasAny = false;
    for (const r of rows) {
      const ids = r.quota_ids ?? [];
      if (ids.length === 0) hasAny = true;
      ids.forEach((id, i) => {
        if (!byId.has(id)) byId.set(id, r.quota_names[i] ?? id);
      });
    }
    const quotas: Option[] = Array.from(byId, ([value, label]) => ({ value, label }));
    return hasAny ? [{ value: QUOTA_ANY, label: 'Any quota' }, ...quotas] : quotas;
  }, [rows]);

  const hostelTypeOptions = useMemo(
    () =>
      distinctOptions(rows, (r) => ({
        value: r.hostel_type,
        label: HOSTEL_TYPE_LABELS[r.hostel_type] ?? r.hostel_type,
      })),
    [rows]
  );

  const roomCategoryOptions = useMemo(
    () =>
      distinctOptions(rows, (r) => ({
        value: r.room_category_id,
        label: r.room_category_name,
      })),
    [rows]
  );

  const messCategoryOptions = useMemo(
    () =>
      distinctOptions(rows, (r) => ({
        value: r.mess_category_id,
        label: r.mess_category_name,
      })),
    [rows]
  );

  const set = (patch: Partial<EligibilityAdvancedFilters>) =>
    onChange({ ...value, ...patch });

  return (
    <FiltersPopover
      activeCount={countActiveEligibilityFilters(value)}
      onClear={() => onChange(EMPTY_ELIGIBILITY_FILTERS)}
    >
      {institutionOptions.length > 0 && (
        <FilterRow
          label='Institution'
          value={value.institution_id}
          options={institutionOptions}
          onChange={(v) => set({ institution_id: v })}
        />
      )}
      {scopeOptions.length > 0 && (
        <FilterRow
          label='Scope'
          value={value.scope}
          options={scopeOptions}
          onChange={(v) => set({ scope: v })}
        />
      )}
      {quotaOptions.length > 0 && (
        <FilterRow
          label='Quota'
          value={value.quota}
          options={quotaOptions}
          onChange={(v) => set({ quota: v })}
        />
      )}
      {hostelTypeOptions.length > 0 && (
        <FilterRow
          label='Hostel Type'
          value={value.hostel_type}
          options={hostelTypeOptions}
          onChange={(v) => set({ hostel_type: v })}
        />
      )}
      {roomCategoryOptions.length > 0 && (
        <FilterRow
          label='Room Category'
          value={value.room_category_id}
          options={roomCategoryOptions}
          onChange={(v) => set({ room_category_id: v })}
        />
      )}
      {messCategoryOptions.length > 0 && (
        <FilterRow
          label='Mess Category'
          value={value.mess_category_id}
          options={messCategoryOptions}
          onChange={(v) => set({ mess_category_id: v })}
        />
      )}
      <FilterRow
        label='Status'
        value={value.status}
        options={[
          { value: 'allowed', label: 'Allowed' },
          { value: 'disabled', label: 'Disabled' },
        ]}
        onChange={(v) =>
          set({ status: v as EligibilityAdvancedFilters['status'] })
        }
      />
    </FiltersPopover>
  );
}

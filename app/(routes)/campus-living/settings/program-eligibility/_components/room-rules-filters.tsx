'use client';

// Advanced filter panel for the Physical Rooms tab. Rules are loaded
// client-side across all institutions (useRoomEligibilityRules(null)), so this
// filters the in-memory list. Options are derived from the loaded rules, so a
// value can never match nothing.

import { useMemo } from 'react';
import type { RoomEligibilityRuleRow } from '@/types/room-eligibility';
import {
  distinctOptions,
  FilterRow,
  FiltersPopover,
  type Option,
} from '@/components/campus-living/filter-panel';

// floor === null means the rule covers the whole block (any floor).
const FLOOR_WHOLE_BLOCK = '__whole_block__';

export interface RoomRuleAdvancedFilters {
  institution_id: string | null;
  block_id: string | null;
  floor: string | null; // FLOOR_WHOLE_BLOCK | String(floor)
  degree_id: string | null;
  department_id: string | null;
  program_id: string | null;
  semester_id: string | null;
  status: 'active' | 'inactive' | null;
}

export const EMPTY_ROOM_RULE_FILTERS: RoomRuleAdvancedFilters = {
  institution_id: null,
  block_id: null,
  floor: null,
  degree_id: null,
  department_id: null,
  program_id: null,
  semester_id: null,
  status: null,
};

export function countActiveRoomRuleFilters(
  f: RoomRuleAdvancedFilters
): number {
  return Object.values(f).filter((v) => v !== null).length;
}

// Single source of truth for the predicate so the table (which applies it) and
// the panel (which sets it) can't drift. null filter values mean "Any".
export function roomRuleMatchesFilters(
  r: RoomEligibilityRuleRow,
  f: RoomRuleAdvancedFilters,
  search: string
): boolean {
  if (f.institution_id && r.institution_id !== f.institution_id) return false;
  if (f.block_id && r.block_id !== f.block_id) return false;
  if (f.floor) {
    const match =
      f.floor === FLOOR_WHOLE_BLOCK
        ? r.floor === null
        : String(r.floor) === f.floor;
    if (!match) return false;
  }
  if (f.degree_id && r.degree_id !== f.degree_id) return false;
  if (f.department_id && r.department_id !== f.department_id) return false;
  if (f.program_id && r.program_id !== f.program_id) return false;
  // A rule may name several semesters — filtering by one means "rules that
  // include this semester", so it's membership, not equality.
  if (f.semester_id && !(r.semester_ids ?? []).includes(f.semester_id))
    return false;
  if (f.status && (r.is_active ? 'active' : 'inactive') !== f.status)
    return false;

  const q = search.trim().toLowerCase();
  if (q) {
    const haystack = [
      r.institution_name,
      r.block_name,
      r.rule_name,
      r.degree_name,
      r.department_name,
      r.program_name,
      ...(r.semester_names ?? []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

const floorLabel = (floor: number) =>
  floor === 0 ? 'Ground floor' : `Floor ${floor}`;

export function RoomRulesFiltersPanel({
  rows,
  value,
  onChange,
}: {
  rows: RoomEligibilityRuleRow[];
  value: RoomRuleAdvancedFilters;
  onChange: (next: RoomRuleAdvancedFilters) => void;
}) {
  const institutionOptions = useMemo(
    () =>
      distinctOptions(rows, (r) => ({
        value: r.institution_id,
        label: r.institution_name,
      })),
    [rows]
  );

  const blockOptions = useMemo(
    () =>
      distinctOptions(rows, (r) => ({
        value: r.block_id,
        label: r.block_name,
      })),
    [rows]
  );

  // Floors sort numerically (label sort would put "Floor 10" before "Floor 2").
  const floorOptions = useMemo<Option[]>(() => {
    const floors = Array.from(
      new Set(rows.map((r) => r.floor).filter((v): v is number => v !== null))
    ).sort((a, b) => a - b);
    const opts = floors.map((fl) => ({
      value: String(fl),
      label: floorLabel(fl),
    }));
    return rows.some((r) => r.floor === null)
      ? [{ value: FLOOR_WHOLE_BLOCK, label: 'Whole block' }, ...opts]
      : opts;
  }, [rows]);

  const degreeOptions = useMemo(
    () =>
      distinctOptions(rows, (r) => ({
        value: r.degree_id,
        label: r.degree_name,
      })),
    [rows]
  );

  const departmentOptions = useMemo(
    () =>
      distinctOptions(rows, (r) => ({
        value: r.department_id,
        label: r.department_name,
      })),
    [rows]
  );

  const programOptions = useMemo(
    () =>
      distinctOptions(rows, (r) => ({
        value: r.program_id,
        label: r.program_name,
      })),
    [rows]
  );

  // distinctOptions reads ONE value per row, but a rule carries a whole list of
  // semesters — so flatten the index-aligned (id, name) pairs across every rule
  // first, then dedupe. Sorted by label for the dropdown; the rules' own fill
  // order is irrelevant here.
  const semesterOptions = useMemo<Option[]>(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      (r.semester_ids ?? []).forEach((id, i) => {
        if (id && !m.has(id)) m.set(id, r.semester_names?.[i] ?? 'Unknown semester');
      });
    }
    return Array.from(m, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [rows]);

  const set = (patch: Partial<RoomRuleAdvancedFilters>) =>
    onChange({ ...value, ...patch });

  return (
    <FiltersPopover
      activeCount={countActiveRoomRuleFilters(value)}
      onClear={() => onChange(EMPTY_ROOM_RULE_FILTERS)}
    >
      {institutionOptions.length > 0 && (
        <FilterRow
          label='Institution'
          value={value.institution_id}
          options={institutionOptions}
          onChange={(v) => set({ institution_id: v })}
        />
      )}
      {blockOptions.length > 0 && (
        <FilterRow
          label='Block'
          value={value.block_id}
          options={blockOptions}
          onChange={(v) => set({ block_id: v })}
        />
      )}
      {floorOptions.length > 0 && (
        <FilterRow
          label='Floor'
          value={value.floor}
          options={floorOptions}
          onChange={(v) => set({ floor: v })}
        />
      )}
      {degreeOptions.length > 0 && (
        <FilterRow
          label='Degree'
          value={value.degree_id}
          options={degreeOptions}
          onChange={(v) => set({ degree_id: v })}
        />
      )}
      {departmentOptions.length > 0 && (
        <FilterRow
          label='Department'
          value={value.department_id}
          options={departmentOptions}
          onChange={(v) => set({ department_id: v })}
        />
      )}
      {programOptions.length > 0 && (
        <FilterRow
          label='Program'
          value={value.program_id}
          options={programOptions}
          onChange={(v) => set({ program_id: v })}
        />
      )}
      {semesterOptions.length > 0 && (
        <FilterRow
          label='Semester'
          value={value.semester_id}
          options={semesterOptions}
          onChange={(v) => set({ semester_id: v })}
        />
      )}
      <FilterRow
        label='Status'
        value={value.status}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ]}
        onChange={(v) =>
          set({ status: v as RoomRuleAdvancedFilters['status'] })
        }
      />
    </FiltersPopover>
  );
}

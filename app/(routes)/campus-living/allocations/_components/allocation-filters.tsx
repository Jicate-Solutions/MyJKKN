'use client';

// Advanced filter panel for the Allocations list. The page loads its full
// allocation set client-side (useHostelAllocations), with each row's learner
// academic record embedded (learner.academic). Options are derived from the
// loaded rows, so a value can never match nothing.

import { useMemo } from 'react';
import {
  distinctOptions,
  FilterRow,
  FiltersPopover,
} from '@/components/campus-living/filter-panel';

export interface AllocationAdvancedFilters {
  institution_id: string | null;
  program_id: string | null;
  semester_id: string | null;
  room_category_id: string | null;
  mess_category_id: string | null;
}

export const EMPTY_ALLOCATION_FILTERS: AllocationAdvancedFilters = {
  institution_id: null,
  program_id: null,
  semester_id: null,
  room_category_id: null,
  mess_category_id: null,
};

export function countActiveAllocationFilters(
  f: AllocationAdvancedFilters
): number {
  return Object.values(f).filter((v) => v !== null).length;
}

// Academic record embedded on each allocation row (left joins — any level
// can be null for rows whose profile has no linked learner record).
const academic = (a: any) => a?.learner?.academic ?? null;

// Single source of truth for the predicate so the page (which applies it)
// and the panel (which sets it) can't drift. null filter values mean "Any".
export function allocationMatchesFilters(
  a: any,
  f: AllocationAdvancedFilters
): boolean {
  const ac = academic(a);
  if (f.institution_id && ac?.institution_id !== f.institution_id) return false;
  if (f.program_id && ac?.program_id !== f.program_id) return false;
  if (f.semester_id && ac?.semester_id !== f.semester_id) return false;
  if (f.room_category_id && ac?.hostel_category_id !== f.room_category_id)
    return false;
  if (f.mess_category_id && ac?.mess_category_id !== f.mess_category_id)
    return false;
  return true;
}

export function AllocationFiltersPanel({
  rows,
  value,
  onChange,
}: {
  rows: any[];
  value: AllocationAdvancedFilters;
  onChange: (next: AllocationAdvancedFilters) => void;
}) {
  const institutionOptions = useMemo(
    () =>
      distinctOptions(rows, (a) => ({
        value: academic(a)?.institution_id,
        label: academic(a)?.institution?.name,
      })),
    [rows]
  );

  const programOptions = useMemo(
    () =>
      distinctOptions(rows, (a) => ({
        value: academic(a)?.program_id,
        label: academic(a)?.program?.program_name,
      })),
    [rows]
  );

  const semesterOptions = useMemo(
    () =>
      distinctOptions(rows, (a) => ({
        value: academic(a)?.semester_id,
        label: academic(a)?.semester?.semester_name,
      })),
    [rows]
  );

  const roomCategoryOptions = useMemo(
    () =>
      distinctOptions(rows, (a) => ({
        value: academic(a)?.hostel_category_id,
        label: academic(a)?.room_category?.name,
      })),
    [rows]
  );

  const messCategoryOptions = useMemo(
    () =>
      distinctOptions(rows, (a) => ({
        value: academic(a)?.mess_category_id,
        label: academic(a)?.mess_category?.name,
      })),
    [rows]
  );

  const set = (patch: Partial<AllocationAdvancedFilters>) =>
    onChange({ ...value, ...patch });

  return (
    <FiltersPopover
      activeCount={countActiveAllocationFilters(value)}
      onClear={() => onChange(EMPTY_ALLOCATION_FILTERS)}
    >
      {institutionOptions.length > 0 && (
        <FilterRow
          label='Institution'
          value={value.institution_id}
          options={institutionOptions}
          onChange={(v) => set({ institution_id: v })}
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
      {institutionOptions.length === 0 &&
        programOptions.length === 0 &&
        semesterOptions.length === 0 &&
        roomCategoryOptions.length === 0 &&
        messCategoryOptions.length === 0 && (
          <p className='text-xs text-muted-foreground'>
            No academic data available on the loaded allocations.
          </p>
        )}
    </FiltersPopover>
  );
}

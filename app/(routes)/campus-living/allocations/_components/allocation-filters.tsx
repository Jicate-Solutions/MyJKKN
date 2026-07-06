'use client';

// Advanced filter panel for the Allocations list. The page loads its full
// allocation set client-side (useHostelAllocations), with each row's learner
// academic record embedded (learner.academic). Options are derived from the
// loaded rows, so a value can never match nothing.

import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { distinctOptions } from '@/components/campus-living/filter-panel';

export interface AllocationAdvancedFilters {
  institution_id: string | null;
  program_id: string | null;
  semester_id: string | null;
  room_category_id: string | null;
  room_id: string | null;
  mess_category_id: string | null;
}

export const EMPTY_ALLOCATION_FILTERS: AllocationAdvancedFilters = {
  institution_id: null,
  program_id: null,
  semester_id: null,
  room_category_id: null,
  room_id: null,
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
  if (f.room_id && a?.room_id !== f.room_id) return false;
  if (f.mess_category_id && ac?.mess_category_id !== f.mess_category_id)
    return false;
  return true;
}

// Academic (Institution/Program/Semester/Room+Mess category) filter selects,
// rendered as full-size grid cells for the Allocations "Advanced Filters"
// collapsible panel (profiles-style layout). Returns a Fragment — NOT a wrapper
// div — so each select becomes a direct child of the parent grid, lining up
// with the page-rendered Type/Block/Floor cascade. Options are derived from the
// loaded rows, so a value can never match nothing; a select with no options
// just doesn't render. Filtering is instant, so there's no per-control "Any"
// sentinel beyond the "All …" item that maps back to null.
export function AllocationAcademicFilterSelects({
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

  // Rooms cascade one level below Room Category: with a category picked, only
  // rooms holding an allocation of that category are offered. Room numbers
  // repeat across blocks, so labels carry the block name whenever the current
  // scope spans more than one block (no block selected upstream).
  const roomOptions = useMemo(() => {
    const scoped = value.room_category_id
      ? rows.filter(
          (a) => academic(a)?.hostel_category_id === value.room_category_id
        )
      : rows;
    const multiBlock =
      new Set(scoped.map((a) => a?.hostel_blocks?.name).filter(Boolean)).size >
      1;
    return distinctOptions(scoped, (a) => {
      const num = a?.hostel_rooms?.room_number;
      if (!num) return { value: null, label: null };
      const block = a?.hostel_blocks?.name;
      return {
        value: a?.room_id,
        label: multiBlock && block ? `${block} · Room ${num}` : `Room ${num}`,
      };
    });
  }, [rows, value.room_category_id]);

  const set = (patch: Partial<AllocationAdvancedFilters>) =>
    onChange({ ...value, ...patch });

  return (
    <>
      {institutionOptions.length > 0 && (
        <Select
          value={value.institution_id ?? 'all'}
          onValueChange={(v) => set({ institution_id: v === 'all' ? null : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder='All Institutions' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Institutions</SelectItem>
            {institutionOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {programOptions.length > 0 && (
        <Select
          value={value.program_id ?? 'all'}
          onValueChange={(v) => set({ program_id: v === 'all' ? null : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder='All Programs' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Programs</SelectItem>
            {programOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {semesterOptions.length > 0 && (
        <Select
          value={value.semester_id ?? 'all'}
          onValueChange={(v) => set({ semester_id: v === 'all' ? null : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder='All Semesters' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Semesters</SelectItem>
            {semesterOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {roomCategoryOptions.length > 0 && (
        <Select
          value={value.room_category_id ?? 'all'}
          onValueChange={(v) =>
            // Room options are scoped under the category, so a category change
            // invalidates the current room pick — clear it in the same update.
            set({ room_category_id: v === 'all' ? null : v, room_id: null })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='All Room Categories' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Room Categories</SelectItem>
            {roomCategoryOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {roomOptions.length > 0 && (
        <Select
          value={value.room_id ?? 'all'}
          onValueChange={(v) => set({ room_id: v === 'all' ? null : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder='All Rooms' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Rooms</SelectItem>
            {roomOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {messCategoryOptions.length > 0 && (
        <Select
          value={value.mess_category_id ?? 'all'}
          onValueChange={(v) => set({ mess_category_id: v === 'all' ? null : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder='All Mess Categories' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Mess Categories</SelectItem>
            {messCategoryOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </>
  );
}

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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
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
  // Compared by name, not id — room categories are institution-scoped, same
  // reasoning as mess_category_id below (the option list is deduped by name).
  if (f.room_category_id && ac?.room_category?.name !== f.room_category_id)
    return false;
  if (f.room_id && a?.room_id !== f.room_id) return false;
  // Compared by name, not id — mess categories are institution-scoped, so
  // "Classic" at one institution and "Classic" at another are different rows
  // with the same name. The filter option list is deduped by name (see
  // messCategoryOptions below), so it must match the same way here.
  if (f.mess_category_id && ac?.mess_category?.name !== f.mess_category_id)
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

  // Every downstream select is scoped to the chosen institution, so a
  // super-admin viewing all institutions doesn't see programs/semesters/room
  // and mess categories that belong to institutions other than the one picked.
  const instScoped = useMemo(
    () =>
      value.institution_id
        ? rows.filter((a) => academic(a)?.institution_id === value.institution_id)
        : rows,
    [rows, value.institution_id]
  );

  const programOptions = useMemo(
    () =>
      distinctOptions(instScoped, (a) => ({
        value: academic(a)?.program_id,
        label: academic(a)?.program?.program_name,
      })),
    [instScoped]
  );

  // Semesters further cascade under the chosen program (still within the
  // institution scope).
  const progScoped = useMemo(
    () =>
      value.program_id
        ? instScoped.filter((a) => academic(a)?.program_id === value.program_id)
        : instScoped,
    [instScoped, value.program_id]
  );

  const semesterOptions = useMemo(
    () =>
      distinctOptions(progScoped, (a) => ({
        value: academic(a)?.semester_id,
        label: academic(a)?.semester?.semester_name,
      })),
    [progScoped]
  );

  // Deduped by name, not id — room categories are institution-scoped, so
  // viewing "All Institutions" can surface e.g. two separate "Classic Room"
  // rows (one per institution). Same fix as messCategoryOptions below.
  const roomCategoryOptions = useMemo(
    () =>
      distinctOptions(instScoped, (a) => ({
        value: academic(a)?.room_category?.name,
        label: academic(a)?.room_category?.name,
      })),
    [instScoped]
  );

  // Deduped by name, not id — mess categories are institution-scoped, so
  // viewing "All Institutions" can surface e.g. two separate "Classic" rows
  // (one per institution). distinctOptions dedupes on `value`, so using the
  // id there let both through as "duplicates" with the same label.
  const messCategoryOptions = useMemo(
    () =>
      distinctOptions(instScoped, (a) => ({
        value: academic(a)?.mess_category?.name,
        label: academic(a)?.mess_category?.name,
      })),
    [instScoped]
  );

  // Rooms cascade one level below Room Category: with a category picked, only
  // rooms holding an allocation of that category are offered. Room numbers
  // repeat across blocks, so labels carry the block name whenever the current
  // scope spans more than one block (no block selected upstream).
  const roomOptions = useMemo(() => {
    const scoped = value.room_category_id
      ? instScoped.filter(
          (a) => academic(a)?.room_category?.name === value.room_category_id
        )
      : instScoped;
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
  }, [instScoped, value.room_category_id]);

  const set = (patch: Partial<AllocationAdvancedFilters>) =>
    onChange({ ...value, ...patch });

  return (
    <>
      {institutionOptions.length > 0 && (
        <Select
          value={value.institution_id ?? 'all'}
          onValueChange={(v) =>
            // Program/semester/category/room/mess picks are all scoped under
            // the institution, so switching it invalidates the current ones.
            set({
              institution_id: v === 'all' ? null : v,
              program_id: null,
              semester_id: null,
              room_category_id: null,
              room_id: null,
              mess_category_id: null,
            })
          }
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
          onValueChange={(v) =>
            // Semester options cascade under the chosen program.
            set({ program_id: v === 'all' ? null : v, semester_id: null })
          }
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

// ─── Shared physical (Type→Block→Floor) + academic cascade ───────────────────
// Extracted from the Allocations page so BOTH the "Allocated" tab and the new
// "All" (combined) tab render one identical filter panel. `rows` is the set the
// options are derived from (the allocated rows, each with hostel_blocks /
// hostel_rooms / learner.academic embedded), so a value can never match nothing.

const getJoined = (row: any, relation: string, field: string): string =>
  row?.[relation]?.[field] ?? '';
const floorLabel = (f: number) => (f === 0 ? 'Ground floor' : `Floor ${f}`);

export interface AllocationCascadeValue {
  hostelType: string; // 'all' | a hostel_type
  gender: string; // 'all' | 'male' | 'female' (the learner's gender)
  block: string; // 'all' | a block name
  floor: string; // 'all' | a floor as a string
  advanced: AllocationAdvancedFilters;
}

export const EMPTY_ALLOCATION_CASCADE: AllocationCascadeValue = {
  hostelType: 'all',
  gender: 'all',
  block: 'all',
  floor: 'all',
  advanced: EMPTY_ALLOCATION_FILTERS,
};

// The gender-segregated hostel types. An unplaced learner has no block (so no
// hostel_type), but DOES have a gender — and boys/girls ARE a gender — so a
// boys/girls Type filter can still match unplaced candidates via their gender.
// Every other type (mixed, staff, working_women, …) has no clean gender rule,
// so unplaced learners can't be scoped under it here.
const HOSTEL_TYPE_GENDER: Record<string, string> = { boys: 'male', girls: 'female' };

// Whether one UNPLACED candidate passes the cascade. Institution and the
// boys/girls Type (mapped to gender) are the ONLY dimensions that apply to a
// learner with no room yet; any Block/Floor/Room or Program/Semester/Room-Mess
// category filter describes a physical/academic placement they don't have, so it
// excludes them. This keeps the combined "All" tab's placed + unplaced counts
// reconcilable under a Type filter (e.g. Dental: 38 boys + 12 unplaced-male,
// 133 girls + 78 unplaced-female, = 261 total).
export function candidateMatchesCascade(
  c: { gender?: string | null; institution_id?: string | null },
  v: AllocationCascadeValue
): boolean {
  if (v.advanced.institution_id && c.institution_id !== v.advanced.institution_id) return false;
  // Gender applies to both populations (candidates carry it directly).
  if (v.gender !== 'all' && (c.gender ?? '').toLowerCase() !== v.gender) return false;
  if (v.block !== 'all' || v.floor !== 'all') return false;
  const a = v.advanced;
  if (a.program_id || a.semester_id || a.room_category_id || a.room_id || a.mess_category_id)
    return false;
  if (v.hostelType !== 'all') {
    const g = HOSTEL_TYPE_GENDER[v.hostelType];
    if (!g || (c.gender ?? '').toLowerCase() !== g) return false;
  }
  return true;
}

// Predicate for one ALLOCATED row against the full Type→Block→Floor + academic
// cascade. Single source of truth so every consumer applies the same rules the
// panel offers.
export function allocationMatchesCascade(a: any, v: AllocationCascadeValue): boolean {
  if (v.hostelType !== 'all' && getJoined(a, 'hostel_blocks', 'hostel_type') !== v.hostelType)
    return false;
  if (v.gender !== 'all' && (a?.learner?.academic?.gender ?? '').toLowerCase() !== v.gender)
    return false;
  if (v.block !== 'all' && getJoined(a, 'hostel_blocks', 'name') !== v.block) return false;
  if (v.floor !== 'all' && String(a?.hostel_rooms?.floor ?? '') !== v.floor) return false;
  if (!allocationMatchesFilters(a, v.advanced)) return false;
  return true;
}

// The full "Advanced Filters" collapsible panel: Type → Block → Floor cascade
// followed by the academic (Institution/Program/Semester/Room+Mess category)
// selects. All options derive from `rows`, and each upstream change invalidates
// the now-stale scoped picks below it.
export function AllocationCascadeFilters({
  rows,
  value,
  onChange,
  open,
  onOpenChange,
}: {
  rows: any[];
  value: AllocationCascadeValue;
  onChange: (next: AllocationCascadeValue) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Type → Block map, derived from the loaded rows so a value can never match
  // nothing. Block name maps to its hostel_type.
  const blockMeta = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of rows) {
      const name = getJoined(a, 'hostel_blocks', 'name');
      if (name && !m.has(name)) m.set(name, getJoined(a, 'hostel_blocks', 'hostel_type'));
    }
    return m;
  }, [rows]);

  const hostelTypes = useMemo(
    () => [...new Set([...blockMeta.values()].filter(Boolean))].sort(),
    [blockMeta]
  );

  const blockNames = useMemo(
    () =>
      [...blockMeta.keys()]
        .filter((n) => value.hostelType === 'all' || blockMeta.get(n) === value.hostelType)
        .sort((a, b) => a.localeCompare(b)),
    [blockMeta, value.hostelType]
  );

  const floorOptions = useMemo(() => {
    if (value.block === 'all') return [] as number[];
    const set = new Set<number>();
    for (const a of rows) {
      if (getJoined(a, 'hostel_blocks', 'name') !== value.block) continue;
      const f = a?.hostel_rooms?.floor;
      if (f != null) set.add(f as number);
    }
    return [...set].sort((x, y) => x - y);
  }, [rows, value.block]);

  // Rows narrowed by the physical Type → Block → Floor cascade — the academic
  // selects derive ALL their options from this set, so picking a block (which
  // implies gender via hostel_type) hierarchically narrows them.
  const scopedRows = useMemo(
    () =>
      rows.filter((a) => {
        if (value.hostelType !== 'all' && getJoined(a, 'hostel_blocks', 'hostel_type') !== value.hostelType)
          return false;
        if (value.block !== 'all' && getJoined(a, 'hostel_blocks', 'name') !== value.block) return false;
        if (value.floor !== 'all' && String(a?.hostel_rooms?.floor ?? '') !== value.floor) return false;
        return true;
      }),
    [rows, value.hostelType, value.block, value.floor]
  );

  // Upstream cascade changes invalidate the scoped academic picks: a new
  // type/block offers different categories/rooms; a new floor different rooms.
  const clearScoped = (adv: AllocationAdvancedFilters, roomOnly = false): AllocationAdvancedFilters =>
    roomOnly
      ? { ...adv, room_id: null }
      : { ...adv, room_category_id: null, room_id: null, mess_category_id: null };

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          Advanced Filters
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {hostelTypes.length > 1 && (
            <Select
              value={value.hostelType}
              onValueChange={(v) =>
                onChange({
                  ...value,
                  hostelType: v,
                  block: 'all',
                  floor: 'all',
                  advanced: clearScoped(value.advanced),
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {hostelTypes.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* Gender — static options (always available, unlike the row-derived
              Type dropdown), filtering by the learner's own gender across both
              placed rows and unplaced candidates. */}
          <Select value={value.gender} onValueChange={(g) => onChange({ ...value, gender: g })}>
            <SelectTrigger>
              <SelectValue placeholder="All Genders" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Genders</SelectItem>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={value.block}
            onValueChange={(v) =>
              onChange({ ...value, block: v, floor: 'all', advanced: clearScoped(value.advanced) })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All Blocks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Blocks</SelectItem>
              {blockNames.map((bn) => (
                <SelectItem key={bn} value={bn}>
                  {bn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {value.block !== 'all' && floorOptions.length > 0 && (
            <Select
              value={value.floor}
              onValueChange={(v) =>
                onChange({ ...value, floor: v, advanced: clearScoped(value.advanced, true) })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All Floors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Floors</SelectItem>
                {floorOptions.map((f) => (
                  <SelectItem key={f} value={String(f)}>
                    {floorLabel(f)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <AllocationAcademicFilterSelects
            rows={scopedRows}
            value={value.advanced}
            onChange={(advanced) => onChange({ ...value, advanced })}
          />
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onChange(EMPTY_ALLOCATION_CASCADE)}>
            <RotateCcw className="mr-2 h-4 w-4" /> Clear All Filters
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

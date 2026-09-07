'use client';

/**
 * Advanced filters for Common Holidays & Events.
 *
 * THE PREDICATE LIVES HERE AND IS EXPORTED, so the panel's option counts and
 * the table apply the same one. Two screens in this repo already learned what
 * happens otherwise — salary-filters.tsx and the allocations audit panel both
 * carry the same note, because a dropdown that counted against the unfiltered
 * array while the table ANDed the filters advertised "(104)" above an empty
 * table.
 *
 * Option counts are FACETED: an option's count is measured against the OTHER
 * active filters, and a zero is rendered rather than hidden so a stale
 * selection keeps its label in the trigger instead of vanishing.
 *
 * SCOPE IS THE TRAP ON THIS TABLE. `scope_institution_ids IS NULL` does not
 * mean "unscoped" — it means "applies to EVERY institution", and 24 of the 59
 * live rows are that. So the institution filter is APPLIES-TO: picking a
 * college returns the common holidays plus the ones scoped to it, i.e. the days
 * that college actually observes. `@>`-style containment would have hidden
 * exactly the entries the user was looking for.
 */

import { useMemo } from 'react';
import moment from 'moment';
import { ChevronDown, ChevronUp, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CalendarCategory, CalendarEntry, CalendarEntryKind } from '@/types/calendar';

export interface HolidayFilterState {
  kind: 'all' | CalendarEntryKind;
  /** 'all' | 'none' (no category recorded) | a category uuid */
  categoryId: string;
  scope: 'all' | 'common' | 'specific';
  /** 'all' | an institution uuid — APPLIES-TO, see the file header. */
  institutionId: string;
  blocksAttendance: 'all' | 'yes' | 'no';
  status: 'all' | 'active' | 'inactive';
  duration: 'all' | 'single' | 'multi';
  /** 'all' | 'YYYY' */
  year: string;
}

export const EMPTY_HOLIDAY_FILTERS: HolidayFilterState = {
  kind: 'all',
  categoryId: 'all',
  scope: 'all',
  institutionId: 'all',
  blocksAttendance: 'all',
  status: 'all',
  duration: 'all',
  year: 'all',
};

/**
 * All-day entries are stored as UTC day boundaries, so every date here is read
 * with moment.utc. Reading them locally shifts an IST date back by one day —
 * the off-by-one that already bit the calendar grid's all-day rendering.
 */
const utcDay = (iso: string) => moment.utc(iso).format('YYYY-MM-DD');
const utcYear = (iso: string) => moment.utc(iso).year();

export function isMultiDay(e: CalendarEntry): boolean {
  return utcDay(e.start_at) !== utcDay(e.end_at);
}

/** Inclusive day count, so a single-day entry reads as 1 rather than 0. */
export function dayCount(e: CalendarEntry): number {
  return moment.utc(utcDay(e.end_at)).diff(moment.utc(utcDay(e.start_at)), 'days') + 1;
}

export function isCommonScope(e: CalendarEntry): boolean {
  return !e.scope_institution_ids || e.scope_institution_ids.length === 0;
}

/**
 * blocks_attendance is only meaningful on a holiday — the column renders '—'
 * for the other kinds, and the create form forces the flag to false for them.
 * The filter reads it the same way so "Blocks: No" can't surface an event whose
 * stored flag happens to be true.
 */
function blocksAttendance(e: CalendarEntry): boolean {
  return e.kind === 'holiday' ? e.blocks_attendance : false;
}

/** Single source of truth for "is this entry in scope", shared by panel and table. */
export function matchesHolidayFilters(e: CalendarEntry, f: HolidayFilterState): boolean {
  if (f.kind !== 'all' && e.kind !== f.kind) return false;

  if (f.categoryId === 'none' && e.category_id !== null) return false;
  if (f.categoryId !== 'all' && f.categoryId !== 'none' && e.category_id !== f.categoryId) {
    return false;
  }

  const common = isCommonScope(e);
  if (f.scope === 'common' && !common) return false;
  if (f.scope === 'specific' && common) return false;

  // APPLIES-TO, not containment: a common entry applies to every institution.
  if (f.institutionId !== 'all') {
    if (!common && !e.scope_institution_ids?.includes(f.institutionId)) return false;
  }

  if (f.blocksAttendance === 'yes' && !blocksAttendance(e)) return false;
  if (f.blocksAttendance === 'no' && blocksAttendance(e)) return false;

  if (f.status === 'active' && !e.is_active) return false;
  if (f.status === 'inactive' && e.is_active) return false;

  if (f.duration === 'multi' && !isMultiDay(e)) return false;
  if (f.duration === 'single' && isMultiDay(e)) return false;

  // OVERLAP, not start-year equality — an entry running 31 Dec → 2 Jan belongs
  // to both years, and dropping it from one of them looks like data loss.
  if (f.year !== 'all') {
    const y = Number(f.year);
    if (utcYear(e.start_at) > y || utcYear(e.end_at) < y) return false;
  }

  return true;
}

export function countActiveHolidayFilters(f: HolidayFilterState): number {
  return (Object.keys(EMPTY_HOLIDAY_FILTERS) as Array<keyof HolidayFilterState>).filter(
    (k) => f[k] !== EMPTY_HOLIDAY_FILTERS[k]
  ).length;
}

/** Human-readable chips for the "showing N of M" line and the PDF subtitle. */
export function holidayFilterLabels(
  f: HolidayFilterState,
  categories: CalendarCategory[],
  institutions: { id: string; name: string }[]
): string[] {
  const out: string[] = [];
  if (f.kind !== 'all') out.push(`Kind: ${f.kind}`);
  if (f.categoryId === 'none') out.push('Category: none');
  else if (f.categoryId !== 'all') {
    out.push(`Category: ${categories.find((c) => c.id === f.categoryId)?.name ?? f.categoryId}`);
  }
  if (f.scope !== 'all') out.push(f.scope === 'common' ? 'Common only' : 'Institution-specific');
  if (f.institutionId !== 'all') {
    out.push(
      `Applies to: ${institutions.find((i) => i.id === f.institutionId)?.name ?? f.institutionId}`
    );
  }
  if (f.blocksAttendance !== 'all') out.push(`Blocks attendance: ${f.blocksAttendance}`);
  if (f.status !== 'all') out.push(`Status: ${f.status}`);
  if (f.duration !== 'all') out.push(f.duration === 'multi' ? 'Multi-day' : 'Single-day');
  if (f.year !== 'all') out.push(`Year: ${f.year}`);
  return out;
}

// ── Panel ────────────────────────────────────────────────────────────────

interface Option {
  value: string;
  label: string;
  count: number;
}

export function HolidayAdvancedFilters({
  rows,
  value,
  onChange,
  categories,
  institutions,
  open,
  onOpenChange,
}: {
  /** ALL entries, unfiltered — the faceted counts derive from these. */
  rows: CalendarEntry[];
  value: HolidayFilterState;
  onChange: (next: HolidayFilterState) => void;
  categories: CalendarCategory[];
  institutions: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  /**
   * Count rows that pass every filter EXCEPT the one being drawn, with the
   * candidate value substituted in. That is what makes each number the answer
   * to "how many would I get if I picked this", rather than a global tally that
   * disagrees with the table.
   */
  const facet = useMemo(
    () => (patch: Partial<HolidayFilterState>) =>
      rows.filter((r) => matchesHolidayFilters(r, { ...value, ...patch })).length,
    [rows, value]
  );

  const kindOptions = useMemo<Option[]>(() => {
    const present = new Set(rows.map((r) => r.kind));
    return (['holiday', 'event', 'meeting'] as CalendarEntryKind[])
      .filter((k) => present.has(k))
      .map((k) => ({
        value: k,
        label: k.charAt(0).toUpperCase() + k.slice(1),
        count: facet({ kind: k }),
      }));
  }, [rows, facet]);

  const categoryOptions = useMemo<Option[]>(() => {
    const used = new Set(rows.map((r) => r.category_id).filter(Boolean) as string[]);
    const opts = categories
      .filter((c) => used.has(c.id))
      .map((c) => ({ value: c.id, label: c.name, count: facet({ categoryId: c.id }) }));
    if (rows.some((r) => r.category_id === null)) {
      opts.push({ value: 'none', label: 'No category', count: facet({ categoryId: 'none' }) });
    }
    return opts;
  }, [rows, categories, facet]);

  /**
   * Only institutions that actually appear in a scope array are listed. The
   * full accessible-institution list would offer dozens of choices that every
   * return the same 24 common rows, which reads as a broken filter.
   */
  const institutionOptions = useMemo<Option[]>(() => {
    const used = new Set<string>();
    for (const r of rows) for (const id of r.scope_institution_ids ?? []) used.add(id);
    return institutions
      .filter((i) => used.has(i.id))
      .map((i) => ({ value: i.id, label: i.name, count: facet({ institutionId: i.id }) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, institutions, facet]);

  const yearOptions = useMemo<Option[]>(() => {
    const years = new Set<number>();
    for (const r of rows) {
      for (let y = utcYear(r.start_at); y <= utcYear(r.end_at); y++) years.add(y);
    }
    return [...years]
      .sort((a, b) => a - b)
      .map((y) => ({ value: String(y), label: String(y), count: facet({ year: String(y) }) }));
  }, [rows, facet]);

  const activeCount = countActiveHolidayFilters(value);
  const set = (patch: Partial<HolidayFilterState>) => onChange({ ...value, ...patch });

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <Button variant='outline' className='w-full justify-between'>
          <span className='flex items-center gap-2'>
            Advanced Filters
            {/* A span, not <Badge> — Badge renders a <div>, invalid inside the
                trigger's <button>. */}
            {activeCount > 0 && (
              <span className='inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-secondary px-1.5 text-xs font-semibold text-secondary-foreground'>
                {activeCount}
              </span>
            )}
          </span>
          {open ? <ChevronUp className='h-4 w-4' /> : <ChevronDown className='h-4 w-4' />}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className='space-y-4 pt-4'>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {kindOptions.length > 0 && (
            <FilterSelect
              label='Kind'
              value={value.kind}
              allLabel='All kinds'
              allCount={facet({ kind: 'all' })}
              options={kindOptions}
              onValueChange={(v) => set({ kind: v as HolidayFilterState['kind'] })}
            />
          )}

          {categoryOptions.length > 0 && (
            <FilterSelect
              label='Category'
              value={value.categoryId}
              allLabel='All categories'
              allCount={facet({ categoryId: 'all' })}
              options={categoryOptions}
              onValueChange={(v) => set({ categoryId: v })}
            />
          )}

          <FilterSelect
            label='Scope'
            value={value.scope}
            allLabel='All scopes'
            allCount={facet({ scope: 'all' })}
            options={[
              { value: 'common', label: 'Common (all institutions)', count: facet({ scope: 'common' }) },
              { value: 'specific', label: 'Institution-specific', count: facet({ scope: 'specific' }) },
            ]}
            onValueChange={(v) => set({ scope: v as HolidayFilterState['scope'] })}
          />

          {institutionOptions.length > 0 && (
            <FilterSelect
              label='Applies to institution'
              value={value.institutionId}
              allLabel='Any institution'
              allCount={facet({ institutionId: 'all' })}
              options={institutionOptions}
              onValueChange={(v) => set({ institutionId: v })}
              hint='Includes common entries'
            />
          )}

          <FilterSelect
            label='Blocks attendance'
            value={value.blocksAttendance}
            allLabel='Any'
            allCount={facet({ blocksAttendance: 'all' })}
            options={[
              { value: 'yes', label: 'Yes', count: facet({ blocksAttendance: 'yes' }) },
              { value: 'no', label: 'No', count: facet({ blocksAttendance: 'no' }) },
            ]}
            onValueChange={(v) =>
              set({ blocksAttendance: v as HolidayFilterState['blocksAttendance'] })
            }
          />

          <FilterSelect
            label='Status'
            value={value.status}
            allLabel='All statuses'
            allCount={facet({ status: 'all' })}
            options={[
              { value: 'active', label: 'Active', count: facet({ status: 'active' }) },
              { value: 'inactive', label: 'Inactive', count: facet({ status: 'inactive' }) },
            ]}
            onValueChange={(v) => set({ status: v as HolidayFilterState['status'] })}
          />

          <FilterSelect
            label='Duration'
            value={value.duration}
            allLabel='Any length'
            allCount={facet({ duration: 'all' })}
            options={[
              { value: 'single', label: 'Single day', count: facet({ duration: 'single' }) },
              { value: 'multi', label: 'Multi-day', count: facet({ duration: 'multi' }) },
            ]}
            onValueChange={(v) => set({ duration: v as HolidayFilterState['duration'] })}
          />

          {yearOptions.length > 0 && (
            <FilterSelect
              label='Year'
              value={value.year}
              allLabel='All years'
              allCount={facet({ year: 'all' })}
              options={yearOptions}
              onValueChange={(v) => set({ year: v })}
            />
          )}
        </div>

        {activeCount > 0 && (
          <Button
            variant='ghost'
            size='sm'
            onClick={() => onChange(EMPTY_HOLIDAY_FILTERS)}
            className='h-8'
          >
            <X className='mr-2 h-3.5 w-3.5' />
            Clear all filters
          </Button>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function FilterSelect({
  label,
  hint,
  value,
  allLabel,
  allCount,
  options,
  onValueChange,
}: {
  label: string;
  hint?: string;
  value: string;
  allLabel: string;
  allCount: number;
  options: Option[];
  onValueChange: (v: string) => void;
}) {
  return (
    <div className='space-y-1.5'>
      <Label className='text-xs text-muted-foreground'>
        {label}
        {hint && <span className='ml-1 font-normal opacity-70'>· {hint}</span>}
      </Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>
            {allLabel} ({allCount})
          </SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label} ({o.count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

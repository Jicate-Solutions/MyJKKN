'use client';

// Advanced, collapsible filter panel for the Induction DataTable.
//
// The whole induction list is already loaded client-side (useInductions — five
// rows in production, and it is bounded by the number of colleges), so this
// filters the in-memory list: no server round-trip per filter change and no
// second query key to keep in sync.
//
// Follows RoomFiltersPanel (campus-living blocks/[id]/rooms) deliberately —
// same Popover + count badge + "Clear all" shape, same "options are derived from
// the rows actually present" rule, so an operator can never pick a value that
// matches nothing.
//
// COORDINATOR IS A FILTER, NOT A COLUMN. The Coordinators column was removed
// from the table; this is where that data earns its place. "Which inductions
// does Renuka run?" and "which inductions still have nobody appointed?" are the
// two questions people actually ask of it, and both are filters.

import { useMemo, useState } from 'react';
import { Filter } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EVENT_STATUS_LABELS } from '@/types/events';
import type { EventStatus } from '@/types/events';
import type { InductionListRow } from '@/lib/services/induction/induction-service';

export interface InductionAdvancedFilters {
  institution: string | null;
  status: string | null;
  /** A coordinator's user_id — matched against the row's appointed coordinators. */
  coordinator: string | null;
  /** Whether the induction has anyone appointed at all. */
  staffing: 'assigned' | 'unassigned' | null;
  /** Where the induction sits relative to today. */
  timing: 'upcoming' | 'running' | 'finished' | null;
}

export const EMPTY_INDUCTION_FILTERS: InductionAdvancedFilters = {
  institution: null,
  status: null,
  coordinator: null,
  staffing: null,
  timing: null,
};

export function countActiveInductionFilters(f: InductionAdvancedFilters): number {
  return Object.values(f).filter((v) => v !== null).length;
}

/**
 * Start-of-day in local time. Comparing raw timestamps would call an induction
 * that starts later today "upcoming" in the morning and "running" after lunch;
 * an induction is a day-granularity programme on every other surface, so the
 * day boundary is the honest one.
 */
const dayStart = (value: string | null): number | null => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/**
 * Single source of truth for the predicate so the page (which applies it) and
 * the panel (which sets it) can't drift. Returns true when the induction passes
 * every active (non-null) filter — null means "Any" and is ignored.
 */
export function inductionMatchesFilters(
  row: InductionListRow,
  f: InductionAdvancedFilters,
  /** Passed in rather than read from the clock, so one sweep of the list is
   *  judged against a single "today" even as it crosses midnight. */
  today: number
): boolean {
  if (f.institution && (row.institution_name ?? '') !== f.institution) return false;
  if (f.status && (row.status ?? 'draft') !== f.status) return false;
  if (f.coordinator && !row.coordinators.some((c) => c.user_id === f.coordinator)) return false;

  if (f.staffing) {
    const assigned = row.coordinators.length > 0;
    if (f.staffing === 'assigned' && !assigned) return false;
    if (f.staffing === 'unassigned' && assigned) return false;
  }

  if (f.timing) {
    const start = dayStart(row.start_date);
    const end = dayStart(row.end_date) ?? start;
    // A row with no usable start date can't be placed on a timeline. Excluding
    // it is the honest answer to "show me what's running" — it is not evidence
    // that it is.
    if (start === null) return false;
    if (f.timing === 'upcoming' && !(start > today)) return false;
    if (f.timing === 'running' && !(start <= today && (end ?? start) >= today)) return false;
    if (f.timing === 'finished' && !((end ?? start) < today)) return false;
  }

  return true;
}

// Radix Select forbids an empty-string item value, so "Any" uses a sentinel
// that maps back to null.
const ANY = '__any__';

interface Option {
  value: string;
  label: string;
}

function FilterRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: Option[];
  onChange: (next: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select value={value ?? ANY} onValueChange={(v) => onChange(v === ANY ? null : v)}>
        <SelectTrigger className="h-8">
          <SelectValue placeholder="Any" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function InductionFiltersPanel({
  inductions,
  value,
  onChange,
}: {
  inductions: InductionListRow[];
  value: InductionAdvancedFilters;
  onChange: (next: InductionAdvancedFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveInductionFilters(value);

  const institutionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of inductions) if (r.institution_name) set.add(r.institution_name);
    return Array.from(set)
      .map((v) => ({ value: v, label: v }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [inductions]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of inductions) set.add(r.status ?? 'draft');
    return Array.from(set)
      .map((v) => ({ value: v, label: EVENT_STATUS_LABELS[v as EventStatus] ?? v }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [inductions]);

  // Keyed by user_id, not name: two staff can share a display name, and the
  // predicate matches on the id for exactly that reason.
  const coordinatorOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const r of inductions) for (const c of r.coordinators) byId.set(c.user_id, c.full_name);
    return Array.from(byId, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [inductions]);

  const set = (patch: Partial<InductionAdvancedFilters>) => onChange({ ...value, ...patch });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-0.5 h-5 min-w-5 justify-center px-1 text-xs"
            >
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Filters</span>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => onChange(EMPTY_INDUCTION_FILTERS)}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          {institutionOptions.length > 1 && (
            <FilterRow
              label="College"
              value={value.institution}
              options={institutionOptions}
              onChange={(v) => set({ institution: v })}
            />
          )}
          {statusOptions.length > 1 && (
            <FilterRow
              label="Status"
              value={value.status}
              options={statusOptions}
              onChange={(v) => set({ status: v })}
            />
          )}
          {coordinatorOptions.length > 0 && (
            <FilterRow
              label="Coordinator"
              value={value.coordinator}
              options={coordinatorOptions}
              onChange={(v) => set({ coordinator: v })}
            />
          )}
          <FilterRow
            label="Staffing"
            value={value.staffing}
            options={[
              { value: 'assigned', label: 'Has a coordinator' },
              { value: 'unassigned', label: 'Nobody appointed' },
            ]}
            onChange={(v) => set({ staffing: v as InductionAdvancedFilters['staffing'] })}
          />
          <FilterRow
            label="Timing"
            value={value.timing}
            options={[
              { value: 'upcoming', label: 'Not started yet' },
              { value: 'running', label: 'Running now' },
              { value: 'finished', label: 'Finished' },
            ]}
            onChange={(v) => set({ timing: v as InductionAdvancedFilters['timing'] })}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

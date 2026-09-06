'use client';

/**
 * Filter bar for the Staff Balances tab.
 *
 * Mirrors the /staff/list filter set — department, employment category,
 * teaching flag, role — plus designation, gender and a balance-attention
 * facet that only makes sense on this screen.
 *
 * TWO FILTERS FROM /staff/list ARE DELIBERATELY ABSENT:
 *  * Status (active/inactive). v_hr_leave_balance_src joins staff with
 *    `AND s.is_active`, so an inactive person cannot reach this tab at all.
 *    The caption says so rather than offering a control that changes nothing.
 *  * Institution. It is the tab's primary selector, one level up — the column
 *    set is per-institution, so it cannot be a filter here.
 *
 * Every option count is contextual: computed against the rows that pass the
 * OTHER active filters. See staff-balance-filters.ts for why that is not
 * optional.
 */

import { useMemo, useState } from 'react';
import { ChevronDown, Filter, Search, SlidersHorizontal, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { HRStaffBalanceRow } from '@/types/hr-leave-staff-balances';

import { FLAG_META } from './balance-flags';
import {
  ANY,
  EMPTY_FILTERS,
  FACET_PROJECTIONS,
  FILTER_LABELS,
  activeFilterKeys,
  buildFacet,
  countWith,
  type AttentionFilter,
  type StaffBalanceFilterKey,
  type StaffBalanceFilters,
  type TeachingFilter,
} from './staff-balance-filters';

interface Props {
  /** UNFILTERED rows — the facets need the full set to build their universe. */
  rows: HRStaffBalanceRow[];
  filters: StaffBalanceFilters;
  onChange: (patch: Partial<StaffBalanceFilters>, key: StaffBalanceFilterKey) => void;
  onReset: () => void;
}

/** Facets that render as a searchable combobox, in panel order. */
const LIST_FACETS: Array<{ key: keyof typeof FACET_PROJECTIONS; label: string; all: string }> = [
  { key: 'departmentId', label: 'Department', all: 'All departments' },
  { key: 'categoryId', label: 'Employment category', all: 'All categories' },
  { key: 'designation', label: 'Designation', all: 'All designations' },
  { key: 'roleKey', label: 'Role', all: 'All roles' },
  { key: 'gender', label: 'Gender', all: 'Any gender' },
];

const ATTENTION_OPTIONS: Array<{ value: AttentionFilter; label: string; hint?: string }> = [
  { value: 'all', label: 'Everyone' },
  { value: 'any', label: 'Needs attention' },
  { value: 'no_row', label: FLAG_META.no_row.label, hint: FLAG_META.no_row.hint },
  { value: 'negative', label: FLAG_META.negative.label, hint: FLAG_META.negative.hint },
  { value: 'overdrawn', label: FLAG_META.overdrawn.label, hint: FLAG_META.overdrawn.hint },
  { value: 'off_policy', label: FLAG_META.off_policy.label, hint: FLAG_META.off_policy.hint },
  {
    value: 'sto_exhausted',
    label: FLAG_META.sto_exhausted.label,
    hint: FLAG_META.sto_exhausted.hint,
  },
];

const TEACHING_OPTIONS: Array<{ value: TeachingFilter; label: string }> = [
  { value: 'all', label: 'Teaching and non-teaching' },
  { value: 'teaching', label: 'Teaching' },
  { value: 'non_teaching', label: 'Non-teaching' },
];

export function StaffBalanceFilterBar({ rows, filters, onChange, onReset }: Props) {
  const [open, setOpen] = useState(false);

  const active = useMemo(() => activeFilterKeys(filters), [filters]);
  const activeCount = active.length;

  // One facet per combobox, each counted with its own key excluded.
  const facets = useMemo(
    () =>
      Object.fromEntries(
        LIST_FACETS.map(({ key }) => [
          key,
          buildFacet(rows, filters, key, FACET_PROJECTIONS[key]),
        ])
      ) as Record<keyof typeof FACET_PROJECTIONS, ReturnType<typeof buildFacet>>,
    [rows, filters]
  );

  const teachingCounts = useMemo(
    () =>
      Object.fromEntries(
        TEACHING_OPTIONS.map((o) => [o.value, countWith(rows, filters, 'teaching', o.value)])
      ) as Record<TeachingFilter, number>,
    [rows, filters]
  );

  const attentionCounts = useMemo(
    () =>
      Object.fromEntries(
        ATTENTION_OPTIONS.map((o) => [o.value, countWith(rows, filters, 'attention', o.value)])
      ) as Record<AttentionFilter, number>,
    [rows, filters]
  );

  /** Chip text for one active filter — what the user actually picked. */
  const chipValue = (key: StaffBalanceFilterKey): string => {
    if (key === 'search') return `"${filters.search.trim()}"`;
    if (key === 'teaching') {
      return TEACHING_OPTIONS.find((o) => o.value === filters.teaching)?.label ?? '';
    }
    if (key === 'attention') {
      return ATTENTION_OPTIONS.find((o) => o.value === filters.attention)?.label ?? '';
    }
    const facet = facets[key as keyof typeof FACET_PROJECTIONS];
    return facet?.find((o) => o.value === filters[key])?.label ?? '';
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <Label className="text-xs text-muted-foreground">Search</Label>
          <div className="relative mt-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={filters.search}
              onChange={(e) => onChange({ search: e.target.value }, 'search')}
              placeholder="Name, employee ID, designation, department or email"
              className="pl-8"
            />
          </div>
        </div>

        {/* Kept out of the collapsed panel on purpose. This was a one-click
            toggle before the panel existed, and the count is the tab's main
            standing signal — burying both behind a disclosure would make the
            screen quieter than it was. */}
        <Button
          variant={filters.attention === 'any' ? 'secondary' : 'outline'}
          size="sm"
          aria-pressed={filters.attention === 'any'}
          onClick={() =>
            onChange(
              { attention: filters.attention === 'any' ? 'all' : 'any' },
              'attention'
            )
          }
          className="mb-1"
        >
          <Filter className="mr-2 h-4 w-4" />
          Needs attention
          <Badge variant="outline" className="ml-2 font-normal">
            {attentionCounts.any}
          </Badge>
        </Button>

        <Button
          variant={activeCount > 0 ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mb-1"
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <Badge variant="outline" className="ml-2 font-normal">
              {activeCount}
            </Badge>
          )}
          <ChevronDown
            className={cn('ml-2 h-4 w-4 transition-transform', open && 'rotate-180')}
          />
        </Button>
      </div>

      {open && (
        <div className="rounded-md border bg-muted/30 p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {LIST_FACETS.map(({ key, label, all }) => (
              <div key={key}>
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <SearchableSelect
                  className="mt-1 w-full"
                  value={filters[key]}
                  onValueChange={(v) => onChange({ [key]: v } as Partial<StaffBalanceFilters>, key)}
                  placeholder={all}
                  searchPlaceholder={`Search ${label.toLowerCase()}…`}
                  options={[
                    { value: ANY, label: all },
                    // A zero-count option stays listed on purpose: it keeps a
                    // selected value labelled, and the (0) IS the explanation
                    // for an empty table.
                    ...facets[key].map((o) => ({
                      value: o.value,
                      label: `${o.label} (${o.count})`,
                    })),
                  ]}
                />
              </div>
            ))}

            <div>
              <Label className="text-xs text-muted-foreground">Teaching</Label>
              <Select
                value={filters.teaching}
                onValueChange={(v) => onChange({ teaching: v as TeachingFilter }, 'teaching')}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEACHING_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                      <span className="ml-1 text-muted-foreground">
                        ({teachingCounts[o.value]})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Balance state</Label>
              <Select
                value={filters.attention}
                onValueChange={(v) => onChange({ attention: v as AttentionFilter }, 'attention')}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ATTENTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} title={o.hint}>
                      {o.label}
                      <span className="ml-1 text-muted-foreground">
                        ({attentionCounts[o.value]})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Not a control: an Active/Inactive filter would do nothing here. */}
          <p className="mt-3 text-xs text-muted-foreground">
            Only active staff appear — the balance view excludes inactive records, so
            there is no status filter.
          </p>
        </div>
      )}

      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {active.map((key) => (
            <Badge key={key} variant="secondary" className="gap-1 font-normal">
              <span className="text-muted-foreground">{FILTER_LABELS[key]}:</span>
              {chipValue(key)}
              <button
                type="button"
                aria-label={`Clear ${FILTER_LABELS[key]} filter`}
                className="ml-0.5 rounded-sm hover:bg-background/60"
                onClick={() =>
                  onChange({ [key]: EMPTY_FILTERS[key] } as Partial<StaffBalanceFilters>, key)
                }
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onReset}>
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}

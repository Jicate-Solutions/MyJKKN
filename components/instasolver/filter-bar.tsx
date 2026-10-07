'use client';

// Compact list filters — ported from the standalone InstaSolver
// (components/filter-bar.tsx).
//
//   · desktop — the search box and one pill per filter on a single row. An
//     unset filter reads "Status ▾"; a set one turns green and reads
//     "Status: Assigned", with its own ✕.
//   · phone — the search box and a "Filters (n)" button that opens a bottom
//     sheet; whatever is set shows underneath as removable pills, so an
//     active filter is never hidden inside the sheet.
//   · pinned — filters that arrive from a link rather than a menu (a
//     dashboard card's "Unassigned", "Fix disputed") show as green pills with
//     their own ✕, and Clear all removes them too.

import type { ReactNode } from 'react';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/** The "no filter" value. */
export const ANY = 'all';

export interface FilterDef {
  key: string;
  label: string;
  /** The current value, or ANY. */
  value: string;
  options: { value: string; label: string }[];
  /** The first menu entry, e.g. "Any status". */
  anyLabel: string;
  onChange: (value: string) => void;
}

export interface PinnedFilter {
  key: string;
  label: string;
  onClear: () => void;
}

export function FilterBar({
  search,
  filters,
  onClearAll,
  hasActive,
  busy,
  pinned = []
}: {
  /** The search input; rendered once and shared by both layouts. */
  search: ReactNode;
  filters: FilterDef[];
  onClearAll: () => void;
  /** Includes the search term, so "Clear all" also shows for a search alone. */
  hasActive: boolean;
  busy?: boolean;
  pinned?: PinnedFilter[];
}) {
  const active = filters.filter((f) => f.value !== ANY);
  const pins = pinned.map((pin) => <PinnedChip key={pin.key} pin={pin} />);

  return (
    <section className="flex flex-wrap items-center gap-2" aria-busy={busy}>
      <div className="min-w-0 flex-1 sm:min-w-64 sm:max-w-sm">{search}</div>

      {/* Phone: one button; the filters open in a bottom sheet. */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" className="h-9 gap-1.5 rounded-full sm:hidden">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filters
            {active.length + pinned.length > 0 ? (
              <span className="rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground">
                {active.length + pinned.length}
              </span>
            ) : null}
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Narrow the list. Changes apply straight away.</SheetDescription>
          </SheetHeader>
          <div className="space-y-2 pb-6 pt-4">
            {filters.map((f) => (
              <FilterChip key={f.key} filter={f} block />
            ))}
            {hasActive ? (
              <Button variant="ghost" className="w-full" onClick={onClearAll}>
                Clear all
              </Button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop: the pills in the same row as the search. */}
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        {pins}
        {filters.map((f) => (
          <FilterChip key={f.key} filter={f} />
        ))}
      </div>

      {/* Phone: what is set, visible and removable without opening the sheet. */}
      {active.length + pinned.length > 0 ? (
        <div className="flex basis-full flex-wrap gap-2 sm:hidden">
          {pins}
          {active.map((f) => (
            <FilterChip key={f.key} filter={f} />
          ))}
        </div>
      ) : null}

      {hasActive ? (
        <Button variant="ghost" size="sm" className="hidden text-muted-foreground sm:inline-flex" onClick={onClearAll}>
          Clear all
        </Button>
      ) : null}
    </section>
  );
}

function PinnedChip({ pin }: { pin: PinnedFilter }) {
  return (
    <div className="inline-flex h-9 items-center rounded-full border border-primary/40 bg-primary/10 pl-3.5 text-sm font-medium text-primary">
      <span className="max-w-52 truncate">{pin.label}</span>
      <button
        type="button"
        aria-label={`Clear the ${pin.label.toLowerCase()} filter`}
        onClick={pin.onClear}
        className="mx-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full outline-none hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

function FilterChip({ filter, block = false }: { filter: FilterDef; block?: boolean }) {
  const isActive = filter.value !== ANY;
  const selected = filter.options.find((o) => o.value === filter.value)?.label;

  return (
    <div
      className={cn(
        'inline-flex h-9 items-center rounded-full border text-sm transition-colors',
        isActive ? 'border-primary/40 bg-primary/10 text-primary' : 'bg-background hover:bg-muted/60',
        block && 'flex w-full'
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-full min-w-0 items-center gap-1.5 rounded-full pl-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive ? 'pr-1' : 'pr-3',
              block && 'flex-1 justify-between'
            )}
          >
            <span className={cn('truncate', block ? 'max-w-none' : 'max-w-52')}>
              {isActive ? (
                <>
                  <span className="font-medium">{filter.label}:</span> {selected ?? filter.value}
                </>
              ) : (
                filter.label
              )}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 min-w-56 overflow-y-auto">
          <DropdownMenuRadioGroup value={filter.value} onValueChange={filter.onChange}>
            <DropdownMenuRadioItem value={ANY}>{filter.anyLabel}</DropdownMenuRadioItem>
            <DropdownMenuSeparator />
            {filter.options.map((o) => (
              <DropdownMenuRadioItem key={o.value} value={o.value}>
                {o.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {isActive ? (
        <button
          type="button"
          aria-label={`Clear ${filter.label.toLowerCase()} filter`}
          onClick={() => filter.onChange(ANY)}
          className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full outline-none hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

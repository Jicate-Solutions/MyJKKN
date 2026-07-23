'use client';

// Shared building blocks for campus-living advanced filter popovers
// (Program Eligibility tabs, Allocations list — same idiom as
// blocks/[id]/rooms room-filters-panel). Consumers load their full row set
// client-side, so filtering is in-memory and dropdown options are derived
// from the rows actually present.

import { useState, type ReactNode } from 'react';
import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Radix Select forbids an empty-string item value, so "Any" uses a sentinel
// that maps back to null.
export const ANY = '__any__';

export interface Option {
  value: string;
  label: string;
}

// Distinct, label-sorted {value, label} pairs present in the loaded rows.
// Rows where either part is missing are skipped (nulls get explicit sentinel
// options added by the caller where "null" has a meaning of its own).
export function distinctOptions<T>(
  rows: T[],
  pick: (row: T) => {
    value: string | null | undefined;
    label: string | null | undefined;
  }
): Option[] {
  const map = new Map<string, string>();
  for (const r of rows) {
    const { value, label } = pick(r);
    if (value && label && !map.has(value)) map.set(value, label);
  }
  return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
}

export function FilterRow({
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
    <div className='grid grid-cols-[6.5rem_1fr] items-center gap-2'>
      <span className='text-xs font-medium text-muted-foreground'>{label}</span>
      <Select
        value={value ?? ANY}
        onValueChange={(v) => onChange(v === ANY ? null : v)}
      >
        <SelectTrigger className='h-8'>
          <SelectValue placeholder='Any' />
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

export function FiltersPopover({
  activeCount,
  onClear,
  children,
}: {
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant='outline' size='sm' className='gap-1.5'>
          <Filter className='h-4 w-4' />
          <span className='hidden sm:inline'>Filters</span>
          {activeCount > 0 && (
            <Badge
              variant='secondary'
              className='ml-0.5 h-5 min-w-5 justify-center px-1 text-xs'
            >
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-80 space-y-3'>
        <div className='flex items-center justify-between'>
          <span className='text-sm font-semibold'>Filters</span>
          {activeCount > 0 && (
            <button
              type='button'
              onClick={onClear}
              className='text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline'
            >
              Clear all
            </button>
          )}
        </div>
        <div className='space-y-2.5'>{children}</div>
      </PopoverContent>
    </Popover>
  );
}

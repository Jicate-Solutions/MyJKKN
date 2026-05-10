'use client';

// Toggle chips for short fixed-list filters on the Learners tab. Mix-style
// per /myjkkn-module Q1 (Year + Gender as chips, Institution + Block as
// dropdowns). Hardcoded value lists per /assumption-thrash Round 2 #4.

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ChipOption<T extends string | number | null> {
  value: T;
  label: string;
}

interface FilterChipsProps<T extends string | number | null> {
  label: string;
  options: ChipOption<T>[];
  value: T | null;
  onChange: (next: T | null) => void;
  className?: string;
}

export function FilterChips<T extends string | number | null>({
  label,
  options,
  value,
  onChange,
  className,
}: FilterChipsProps<T>) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className='text-xs font-medium text-muted-foreground w-16 sm:w-auto'>
        {label}:
      </span>
      <div className='flex flex-wrap gap-2'>
        {options.map((opt) => {
          const isActive = value === opt.value;
          return (
            <button
              key={String(opt.value)}
              type='button'
              onClick={() => onChange(isActive ? null : opt.value)}
              aria-pressed={isActive}
              className='outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md'
            >
              <Badge
                variant={isActive ? 'default' : 'outline'}
                className={cn(
                  'cursor-pointer transition-colors px-3 py-1 text-xs',
                  !isActive && 'hover:bg-muted',
                )}
              >
                {opt.label}
              </Badge>
            </button>
          );
        })}
        {value !== null && (
          <button
            type='button'
            onClick={() => onChange(null)}
            className='text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline'
          >
            All
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Year option helpers ───────────────────────────────────────────────
// YEAR_OPTIONS_FALLBACK: static [1..4] used while the dynamic query loads or
// if the view returns 0 rows (prevents empty chip row on first paint).
export const YEAR_OPTIONS_FALLBACK: ChipOption<number>[] = [
  { value: 1, label: 'Year 1' },
  { value: 2, label: 'Year 2' },
  { value: 3, label: 'Year 3' },
  { value: 4, label: 'Year 4' },
];

// Backward-compat re-export — callers that import YEAR_OPTIONS keep working.
export const YEAR_OPTIONS = YEAR_OPTIONS_FALLBACK;

// buildYearOptions: converts a dynamic year list (e.g. [1,2,3,4,5,6]) from
// LearnerHosteliteService.listAvailableYears into chip options.
export function buildYearOptions(years: number[]): ChipOption<number>[] {
  return years.map((y) => ({ value: y, label: `Year ${y}` }));
}

// ─── Other hardcoded value lists ──────────────────────────────────────

export const GENDER_OPTIONS: ChipOption<'Male' | 'Female' | 'Other'>[] = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Other', label: 'Other' },
];

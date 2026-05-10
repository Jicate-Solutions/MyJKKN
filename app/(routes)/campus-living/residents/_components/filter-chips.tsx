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

// ─── Hardcoded value lists ─────────────────────────────────────────────
// Per /assumption-thrash Round 2 #4. Year [1..4], Gender [Male/Female/Other].

export const YEAR_OPTIONS: ChipOption<number>[] = [
  { value: 1, label: 'Year 1' },
  { value: 2, label: 'Year 2' },
  { value: 3, label: 'Year 3' },
  { value: 4, label: 'Year 4' },
];

export const GENDER_OPTIONS: ChipOption<'Male' | 'Female' | 'Other'>[] = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Other', label: 'Other' },
];

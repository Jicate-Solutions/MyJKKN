'use client';

/**
 * One box that searches everything.
 *
 * REPLACED (2026-08-28) a five-input "Advanced Search" popover with per-field
 * checkboxes and case-sensitive / exact-match toggles. Two things were wrong
 * with it beyond the clutter:
 *
 *   - its defaults had staffId and designation switched OFF, so typing a staff
 *     ID found nothing until you opened the popover and ticked a box;
 *   - it made you decide WHICH field you were searching before you searched,
 *     which is the one thing a person looking for a colleague does not know or
 *     care about.
 *
 * Now every column is searched at once, and multiple words narrow the result
 * rather than breaking it — see buildStaffSearchTokenGroups.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function StaffSearchInput({
  value,
  onValueChange,
  onSearch,
  placeholder = 'Search by name, staff ID, email, phone or designation…',
}: {
  /** Owned by the page, so the empty state's "Clear Search" can reset it too. */
  value: string;
  onValueChange: (next: string) => void;
  /** Debounced. Must be referentially stable (useCallback), or it re-fires. */
  onSearch: (query: string) => void;
  placeholder?: string;
}) {
  // Remembers what we last handed upstream, so the debounce cannot emit the
  // same query twice — including the empty string on mount, which would
  // otherwise rebuild the filter object and trigger a pointless first fetch.
  const lastEmitted = useRef<string>('');

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = value.trim();
      if (next === lastEmitted.current) return;
      lastEmitted.current = next;
      onSearch(next);
    }, 300);

    return () => clearTimeout(timer);
  }, [value, onSearch]);

  const clear = useCallback(() => {
    onValueChange('');
  }, [onValueChange]);

  return (
    <div className='relative'>
      <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
      <Input
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        className='pl-9 pr-9'
        aria-label='Search employees'
      />
      {value && (
        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={clear}
          className='absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2'
          aria-label='Clear search'
        >
          <X className='h-4 w-4' />
        </Button>
      )}
    </div>
  );
}

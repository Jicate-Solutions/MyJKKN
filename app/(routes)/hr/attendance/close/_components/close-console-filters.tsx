'use client';

/**
 * Status filter for the month-close console.
 *
 * The counts are FACETED against the same rows the table renders, so an option
 * can never advertise a number the table will not deliver — the failure the
 * payer-directory screen shipped with, where "JKKN Main Office (104)" sat above
 * an empty table.
 *
 * Options are listed in WORKING ORDER rather than alphabetically, matching the
 * table's default sort: ready first, no-data last.
 */

import { useMemo } from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AttendancePeriodConsoleRow } from '@/lib/services/hr/attendance/attendance-period-service';

import { CLOSE_STATE_LABEL, closeStateOf, type CloseState } from './close-console-columns';
import type { CloseStateFilter } from './close-console-table';

/** Working order — the same order the table sorts by when unsorted. */
const ORDER: CloseState[] = ['ready', 'review', 'closed', 'nodata'];

interface Props {
  rows: AttendancePeriodConsoleRow[];
  value: CloseStateFilter;
  onChange: (next: CloseStateFilter) => void;
}

export function CloseConsoleFilters({ rows, value, onChange }: Props) {
  const counts = useMemo(() => {
    const c: Record<CloseState, number> = { ready: 0, review: 0, closed: 0, nodata: 0 };
    for (const r of rows) c[closeStateOf(r)] += 1;
    return c;
  }, [rows]);

  return (
    <div className='mb-3 flex flex-wrap items-center gap-2'>
      <Select value={value} onValueChange={(v) => onChange(v as CloseStateFilter)}>
        <SelectTrigger className='h-9 w-full sm:w-[240px]' aria-label='Filter by status'>
          <SelectValue placeholder='All statuses' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>All institutions ({rows.length})</SelectItem>
          {ORDER.map((s) => (
            <SelectItem key={s} value={s}>
              {CLOSE_STATE_LABEL[s]} ({counts[s]})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value !== 'all' && (
        <Button variant='ghost' size='sm' className='h-9' onClick={() => onChange('all')}>
          <X className='mr-1.5 h-3.5 w-3.5' />
          Clear
        </Button>
      )}
    </div>
  );
}

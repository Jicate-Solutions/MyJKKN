'use client';

/**
 * Shared Period + date-range toolbar for every Time Off tab.
 *
 * Dates are handled as local YYYY-MM-DD strings throughout, never as ISO
 * timestamps. hr_leave_applications.start_date/end_date are DATE columns, and
 * converting a naive local date through toISOString() shifts it by the
 * UTC offset — in IST that silently moves a request a day earlier.
 */

import { useMemo } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type PeriodPreset =
  | 'all' | 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'custom';

export interface PeriodRange {
  preset: PeriodPreset;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

const PRESET_LABELS: Record<PeriodPreset, string> = {
  all: 'All time',
  this_month: 'This Month',
  last_month: 'Last Month',
  this_quarter: 'This Quarter',
  this_year: 'This Year',
  custom: 'Custom',
};

/** Local-date formatting. Deliberately not toISOString() — see file header. */
function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function rangeForPreset(preset: PeriodPreset, now = new Date()): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case 'last_month':
      return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
    case 'this_quarter': {
      const qStart = Math.floor(m / 3) * 3;
      return { from: ymd(new Date(y, qStart, 1)), to: ymd(new Date(y, qStart + 3, 0)) };
    }
    case 'this_year':
      return { from: ymd(new Date(y, 0, 1)), to: ymd(new Date(y, 11, 31)) };
    case 'this_month':
    case 'custom':
    default:
      return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };
  }
}

export function defaultPeriod(): PeriodRange {
  return { preset: 'this_month', ...rangeForPreset('this_month') };
}

/**
 * Default for request lists and the approval queue.
 *
 * Deliberately NOT 'this_month': a request dated next month would be hidden
 * from both its owner and its approver until they noticed the filter. A queue
 * defaults to showing everything; narrowing is an explicit act.
 */
export function allTimePeriod(): PeriodRange {
  return { preset: 'all', ...rangeForPreset('this_year') };
}

export function PeriodFilter({
  value,
  onChange,
  onRefresh,
  isRefreshing,
  action,
  className,
}: {
  value: PeriodRange;
  onChange: (next: PeriodRange) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  /** Primary action, e.g. the Apply button. */
  action?: React.ReactNode;
  className?: string;
}) {
  const presets = useMemo(
    () => Object.keys(PRESET_LABELS) as PeriodPreset[],
    []
  );

  const setPreset = (preset: PeriodPreset) => {
    if (preset === 'custom' || preset === 'all') {
      onChange({ ...value, preset });
      return;
    }
    onChange({ preset, ...rangeForPreset(preset) });
  };

  // Editing either date implies a custom range — otherwise the label would
  // keep claiming "This Month" while showing different dates.
  const setBound = (key: 'from' | 'to', v: string) =>
    onChange({ ...value, preset: 'custom', [key]: v });

  return (
    <div className={cn('flex flex-wrap items-end gap-3', className)}>
      <div className="min-w-[160px]">
        <Label className="text-xs text-muted-foreground">Period</Label>
        <Select value={value.preset} onValueChange={(v) => setPreset(v as PeriodPreset)}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {presets.map((p) => (
              <SelectItem key={p} value={p}>{PRESET_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex w-full items-end gap-2 rounded-md border px-3 py-2 sm:w-auto">
        <CalendarDays className="mb-2 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 sm:flex-none">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input
            type="date"
            value={value.from}
            disabled={value.preset === 'all'}
            onChange={(e) => setBound('from', e.target.value)}
            className="mt-1 h-8 w-full border-0 p-0 shadow-none focus-visible:ring-0 sm:w-[150px]"
          />
        </div>
        <span className="mb-2 text-muted-foreground">–</span>
        <div className="min-w-0 flex-1 sm:flex-none">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input
            type="date"
            value={value.to}
            min={value.from}
            disabled={value.preset === 'all'}
            onChange={(e) => setBound('to', e.target.value)}
            className="mt-1 h-8 w-full border-0 p-0 shadow-none focus-visible:ring-0 sm:w-[150px]"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {action}
        {onRefresh && (
          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Refresh"
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
          </Button>
        )}
      </div>
    </div>
  );
}

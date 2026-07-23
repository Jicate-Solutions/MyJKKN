'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  CALENDAR_SOURCE_META,
  type CalendarEventSource,
  type CalendarSourceFilter,
} from '@/types/campus-living/calendar';

interface FilterBarProps {
  filter: CalendarSourceFilter;
  counts: Record<string, number>;
  onChange: (next: CalendarSourceFilter) => void;
}

const SOURCES: CalendarEventSource[] = ['leave', 'gate-pass', 'maintenance', 'mess', 'incident'];

/**
 * Horizontal checkbox row, one per event source. Counts come from the
 * aggregator hook — they reflect raw event counts, not date-occupancy.
 */
export function FilterBar({ filter, counts, onChange }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Event type filters">
      {SOURCES.map((source) => {
        const meta = CALENDAR_SOURCE_META[source];
        const checked = filter[source];
        const count = counts[source] ?? 0;
        const id = `cal-filter-${source}`;
        return (
          <Label
            key={source}
            htmlFor={id}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 cursor-pointer transition-colors',
              checked ? meta.chipClass : 'bg-muted/40 border-border text-muted-foreground',
            )}
          >
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={(v) => onChange({ ...filter, [source]: Boolean(v) })}
            />
            <span className={cn('inline-block h-2 w-2 rounded-full', meta.dotClass)} />
            <span className="text-sm font-medium">{meta.label}</span>
            <span className="text-xs opacity-70">({count})</span>
          </Label>
        );
      })}
    </div>
  );
}

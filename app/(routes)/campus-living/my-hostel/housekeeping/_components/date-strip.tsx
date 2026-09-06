'use client';

// Horizontally scrollable date chips (today → +advance_days). Segmented
// buttons, NOT Radix Tabs (CFT click-flake memory — spec decision #5).
// The advance window is policy-driven (fn_get_policy_int in page.tsx).

import { dateChipParts } from './booking-utils';

interface Props {
  dates: string[];
  selected: string;
  onSelect: (iso: string) => void;
}

export function DateStrip({ dates, selected, onSelect }: Props) {
  return (
    <div className='flex gap-2 overflow-x-auto pb-1 -mx-1 px-1'>
      {dates.map((iso, i) => {
        const { weekday, day, month } = dateChipParts(iso);
        const active = iso === selected;
        return (
          <button
            key={iso}
            type='button'
            onClick={() => onSelect(iso)}
            aria-pressed={active}
            className={`flex flex-col items-center rounded-lg border px-3 py-2 min-w-[64px] shrink-0 transition-colors ${
              active
                ? 'border-primary bg-primary/10 text-primary'
                : 'hover:bg-muted text-foreground'
            }`}
          >
            <span className='text-[11px] uppercase text-muted-foreground'>
              {i === 0 ? 'Today' : weekday}
            </span>
            <span className='text-lg font-semibold leading-tight'>{day}</span>
            <span className='text-[11px] text-muted-foreground'>{month}</span>
          </button>
        );
      })}
    </div>
  );
}

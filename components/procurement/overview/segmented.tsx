'use client';

import { cn } from '@/lib/utils';

/**
 * A pill switch ("Final approval | Held up | By college") with optional counts.
 * Real buttons with aria-pressed, so it works by keyboard and screen reader.
 */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  size = 'md',
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string; count?: number; warn?: boolean }>;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-xl bg-muted p-[3px]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3.5 text-[13px] font-semibold text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              size === 'sm' ? 'min-h-8 px-3' : 'min-h-[38px]',
              on && 'bg-background text-foreground shadow-[0_1px_3px_rgba(16,24,40,.14)]'
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span
                className={cn(
                  'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums',
                  on ? (o.warn ? 'bg-secondary text-secondary-foreground' : 'bg-primary text-white') : 'bg-border text-foreground/70'
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

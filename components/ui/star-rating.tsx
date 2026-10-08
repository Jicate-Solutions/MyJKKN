'use client';

// Shared 1–5 star rating input + read-only display.
// Lifted from the events feedback RatingInput (components/events/feedback/feedback-question-input.tsx)
// so procurement ratings and event feedback behave the same way.

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

const SIZE = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-7 w-7',
} as const;

interface StarRatingProps {
  value: number;
  onChange: (next: number) => void;
  /** Number of stars (≤ 5). */
  scale?: number;
  disabled?: boolean;
  size?: keyof typeof SIZE;
  /** Show "4 / 5" after the stars once a value is chosen. */
  showValue?: boolean;
  /** Accessible name for the group, e.g. "Rate this delivery". */
  label?: string;
}

/**
 * Clicking the currently selected star CLEARS it (back to 0), so a mis-tap on an
 * optional rating can be undone instead of only ever going up.
 */
export function StarRating({
  value,
  onChange,
  scale = 5,
  disabled,
  size = 'md',
  showValue = false,
  label,
}: StarRatingProps) {
  const points = Array.from({ length: scale }, (_, i) => i + 1);
  return (
    <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={label}>
      {points.map((point) => {
        const exact = value === point;
        return (
          <button
            key={point}
            type="button"
            role="radio"
            aria-checked={exact}
            aria-label={`${point} out of ${scale}`}
            disabled={disabled}
            onClick={() => onChange(exact ? 0 : point)}
            className="rounded p-0.5 transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Star
              className={cn(
                SIZE[size],
                value >= point ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'
              )}
            />
          </button>
        );
      })}
      {showValue && value > 0 && (
        <span className="ml-1.5 text-sm text-muted-foreground">
          {value} / {scale}
        </span>
      )}
    </div>
  );
}

/** Read-only "★ 4.2 (6)" — one star + number, compact enough for a table cell or badge. */
export function StarDisplay({
  value,
  count,
  className,
}: {
  value: number;
  count?: number;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm tabular-nums', className)}>
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
      <span>{value.toFixed(1)}</span>
      {count != null && <span className="text-muted-foreground">({count})</span>}
      <span className="sr-only">out of 5{count != null ? `, ${count} ratings` : ''}</span>
    </span>
  );
}

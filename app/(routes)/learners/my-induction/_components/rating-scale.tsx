'use client';

// Shared 1–5 value scale (Poor…Excellent), brand #0b6d41. Extracted verbatim from
// session-rating-card.tsx so the fresher's own-phone form AND the coordinator/
// volunteer kiosk dialog render the identical scale. Presentational + controlled:
// the parent owns `value` and is notified via `onChange`.
const BRAND = '#0b6d41';

export const VALUE_SCALE: { value: number; label: string }[] = [
  { value: 1, label: 'Poor' },
  { value: 2, label: 'Fair' },
  { value: 3, label: 'Okay' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Excellent' },
];

interface RatingScaleProps {
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** 'md' (default) matches the own-phone card; 'sm' is denser for per-row lists. */
  size?: 'sm' | 'md';
}

export function RatingScale({ value, onChange, disabled = false, size = 'md' }: RatingScaleProps) {
  return (
    <div className="flex gap-2">
      {VALUE_SCALE.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            aria-pressed={selected}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 rounded-md border px-1 ${
              size === 'sm' ? 'py-1' : 'py-2'
            } text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/40 disabled:cursor-not-allowed disabled:opacity-50 ${
              selected
                ? 'border-[#0b6d41] bg-[#0b6d41] text-white'
                : 'border-input bg-background hover:bg-muted'
            }`}
          >
            <span className={`${size === 'sm' ? 'text-sm' : 'text-base'} font-semibold leading-none`}>
              {opt.value}
            </span>
            <span className={selected ? 'text-white/90' : 'text-muted-foreground'}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export { BRAND as RATING_BRAND };

'use client';

// Vendor score badge: "B · 76" with the 8-part breakdown on tap/click.
// New (grey) until MIN_GRNS_FOR_GRADE deliveries; D shows as red "Watch".

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { GRADE_LABEL, MIN_GRNS_FOR_GRADE, type Grade, type VendorScore } from '@/lib/procurement/vendor-score';

const TONE: Record<Grade | 'new', string> = {
  A: 'border-emerald-600/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  B: 'border-sky-600/40 bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
  C: 'border-amber-600/40 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  D: 'border-red-600/50 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300',
  new: 'border-border bg-muted text-muted-foreground',
};

export function VendorScoreBadge({
  score,
  vendorName,
  className,
}: {
  score: VendorScore | undefined;
  vendorName?: string;
  className?: string;
}) {
  if (!score) return null;
  const tone = score.grade ? TONE[score.grade] : TONE.new;
  const text = score.grade
    ? score.grade === 'D'
      ? `Watch · ${score.score}`
      : `${score.grade} · ${score.score}`
    : 'New';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Vendor score${vendorName ? ` for ${vendorName}` : ''}: ${text}`}
          className={cn(
            'inline-flex shrink-0 items-center rounded-full border px-1.5 py-px text-[10px] font-semibold leading-4 tabular-nums',
            tone,
            className
          )}
        >
          {text}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3 text-sm" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold">
          {vendorName ?? 'Vendor'}
          {score.grade && <span className="font-normal text-muted-foreground"> · {GRADE_LABEL[score.grade]}</span>}
        </p>
        <p className="mb-2 text-xs text-muted-foreground">
          {score.isNew
            ? `${score.grnCount} of ${MIN_GRNS_FOR_GRADE} deliveries needed for a grade`
            : `${score.grnCount} deliveries in the last 12 months`}
          {score.score != null && ` · score ${score.score}/100`}
        </p>
        <ul className="space-y-1">
          {score.parts.map((p) => (
            <li key={p.key} className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-2 text-xs">
              <span className="truncate">{p.label}</span>
              <span className="text-right tabular-nums text-muted-foreground">
                {p.value == null ? '—' : `${Math.round(p.value * 100)}%`}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">— = no data yet (left out of the score).</p>
      </PopoverContent>
    </Popover>
  );
}

// components/session-feedback/understanding-band.tsx
// ---------------------------------------------------------------------------
// Anti-gaming display for the class-understanding signal.
//
// Director decision (2026-07-06): facilitators AND leadership see a qualitative
// BAND (Strong / Mixed / Low) + a colour bar — never the raw average. A printed
// average is a target to teach to (Goodhart's law); the band conveys the signal
// without handing anyone a number to optimise. "No exceptions" = every
// human-facing surface, leadership included.
//
// Bands mirror the AI generators' own thresholds (understandingBandWord in the
// SCF routes): < 3 Low · < 4.0 Mixed · >= 4.0 Strong — so what a teacher SEES and
// what the AI SAYS use one vocabulary.
//   Recalibrated 2026-07-24 (Director interview): Strong was >= 4.5, but per-session
//   avg is 4.12 and 83% of individual answers are 4-5, so >= 4.5 mislabelled ~84% of
//   genuinely-fine sessions as "Mixed". Strong now starts at 4.0. This is a display
//   band ONLY — the cron's separate STANDOUT_THRESHOLD (4.5), which gates success-vs-
//   improvement note generation, is deliberately NOT moved.
// The backend still records the numeric average for the loop's own measurement; only
// the DISPLAY is qualitative.
// ---------------------------------------------------------------------------
import { Badge } from '@/components/ui/badge';

export type UnderstandingLevel = 'low' | 'mixed' | 'strong' | 'none';

/** Canonical band for an understanding average (1-5). Mirrors understandingBandWord. */
export function understandingLevel(avg: number | null | undefined): UnderstandingLevel {
  if (avg === null || avg === undefined || Number.isNaN(Number(avg))) return 'none';
  const a = Number(avg);
  if (a < 3) return 'low';
  if (a < 4.0) return 'mixed';
  return 'strong';
}

const WORD: Record<UnderstandingLevel, string> = {
  low: 'Low',
  mixed: 'Mixed',
  strong: 'Strong',
  none: '—',
};

const BADGE: Record<UnderstandingLevel, string> = {
  low: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300',
  mixed: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300',
  strong: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/50 dark:text-green-300',
  none: 'bg-muted text-muted-foreground border-border',
};

const BAR: Record<UnderstandingLevel, string> = {
  low: 'bg-red-500',
  mixed: 'bg-amber-500',
  strong: 'bg-green-500',
  none: 'bg-muted-foreground/30',
};

/**
 * Word + a fixed-width colour bar. The bar is BAND-coloured, NOT proportional to
 * the average, so it never visually re-encodes the hidden number. Use this
 * everywhere the class-understanding signal is shown to a human.
 */
export function UnderstandingBand({
  avg,
  className = '',
}: {
  avg: number | null | undefined;
  className?: string;
}) {
  const level = understandingLevel(avg);
  // <div>, not <span>: Badge renders a <div>, and a span may not contain a div
  // (invalid HTML5 phrasing-content nesting). inline-flex keeps it visually inline.
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <Badge variant="outline" className={`font-medium ${BADGE[level]}`}>
        {WORD[level]}
      </Badge>
      <span
        className="h-2 w-8 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`Understanding: ${WORD[level]}`}
      >
        <span className={`block h-full w-full rounded-full ${BAR[level]}`} />
      </span>
    </div>
  );
}

/** Compact variant — just the word badge, no bar. For tight table cells. */
export function UnderstandingBadge({ avg }: { avg: number | null | undefined }) {
  const level = understandingLevel(avg);
  return (
    <Badge variant="outline" className={`font-medium ${BADGE[level]}`}>
      {WORD[level]}
    </Badge>
  );
}

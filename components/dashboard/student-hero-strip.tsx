/**
 * Dashboard v2 — Student/Learner Hero Strip (4 KPI tiles)
 *
 * Server component. Consumes StudentMetrics from getStudentMetrics().
 * Tiles: (1) My Attendance (2) Fee Balance (3) Today's Classes (4) Upcoming Deadlines
 *
 * JKKN terminology: Students are referred to as "Learners".
 *
 * Styling kept parallel to hero-strip.tsx and counselor-hero-strip.tsx
 * (helpers duplicated by design — per agent scope, hero-strip.tsx must remain untouched).
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §5 + §8
 */

import Link from 'next/link';
import {
  StudentMetrics,
  StudentBand,
  formatInrAmount
} from '@/lib/services/dashboard/student-metrics-service';

type TileColor = StudentBand | 'neutral';

const TILE_COLOR_CLASS: Record<TileColor, string> = {
  green:
    'border-emerald-400/40 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-100',
  amber:
    'border-amber-400/40 bg-amber-50/60 dark:bg-amber-950/30 text-amber-950 dark:text-amber-100',
  red: 'border-rose-400/40 bg-rose-50/60 dark:bg-rose-950/30 text-rose-950 dark:text-rose-100',
  neutral:
    'border-neutral-200 bg-white/90 dark:bg-neutral-900/80 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100'
};

const BAND_DOT: Record<TileColor, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
  neutral: 'bg-neutral-400'
};

type HeroTileProps = {
  label: string;
  value: React.ReactNode;
  subtitle: string;
  hint?: string;
  color: TileColor;
  href?: string;
  footer?: React.ReactNode;
};

function HeroTile({
  label,
  value,
  subtitle,
  hint,
  color,
  href,
  footer
}: HeroTileProps) {
  const Wrapper: React.ElementType = href ? Link : 'div';
  const wrapperProps = href ? { href } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`group relative rounded-2xl border ${TILE_COLOR_CLASS[color]} p-5 backdrop-blur-sm transition-all duration-200 ${href ? 'hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500' : ''}`}
    >
      <div className='flex items-center justify-between'>
        <span className='text-xs font-medium uppercase tracking-wider opacity-75'>
          {label}
        </span>
        <span
          className={`h-2 w-2 rounded-full ${BAND_DOT[color]}`}
          aria-hidden
        />
      </div>
      <div className='mt-3 text-4xl font-bold tabular-nums leading-none'>
        {value}
      </div>
      <div className='mt-2 text-xs opacity-70 line-clamp-2'>{subtitle}</div>
      {hint && <div className='mt-1 text-[11px] opacity-60'>{hint}</div>}
      {footer && (
        <div className='mt-4 pt-3 border-t border-current/10 text-[11px] opacity-80'>
          {footer}
        </div>
      )}
    </Wrapper>
  );
}

// ============================================================================
// Tile builders per student metric
// ============================================================================
function attendanceTile(metrics: StudentMetrics): HeroTileProps {
  const { pct_semester, present, total, band } = metrics.attendance;
  const hasData = total > 0;
  return {
    label: 'My Attendance',
    value: hasData ? `${pct_semester}%` : '--',
    subtitle: hasData
      ? `${present} present out of ${total} classes this semester`
      : 'No attendance data available yet',
    hint: hasData
      ? pct_semester < 75
        ? 'Below 75% — exam eligibility at risk'
        : pct_semester >= 90
          ? 'Excellent attendance record'
          : 'On track for exam eligibility'
      : undefined,
    color: hasData ? band : 'neutral'
  };
}

function feesTile(metrics: StudentMetrics): HeroTileProps {
  const { balance_due, next_due_date } = metrics.fees;
  const hasBalance = balance_due > 0;
  const color: TileColor = hasBalance ? 'red' : 'green';
  return {
    label: 'Fee Balance',
    value: hasBalance ? (
      <span>
        <span className='text-lg align-top'>&#8377;</span>
        {formatInrAmount(balance_due)}
      </span>
    ) : (
      'Paid'
    ),
    subtitle: hasBalance
      ? 'Total outstanding fee balance'
      : 'All fees are up to date',
    hint: hasBalance && next_due_date
      ? `Next due: ${new Date(next_due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : undefined,
    color
  };
}

function timetableTile(metrics: StudentMetrics): HeroTileProps {
  const { classes, total } = metrics.timetable_today;
  const hasClasses = total > 0;
  // Find next class (first class with start_time > now)
  let nextHint: string | undefined;
  if (hasClasses && classes.length > 0) {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    for (const cls of classes) {
      if (cls.start_time && cls.start_time !== '99:99') {
        const [h, m] = cls.start_time.split(':').map(Number);
        if (h * 60 + m > nowMinutes) {
          nextHint = `Next: ${cls.course} at ${cls.time.split('-')[0]}`;
          break;
        }
      }
    }
    if (!nextHint) {
      nextHint = 'All classes completed for today';
    }
  }

  return {
    label: "Today's Classes",
    value: hasClasses ? total : '--',
    subtitle: hasClasses
      ? `${total} class${total === 1 ? '' : 'es'} scheduled today`
      : 'No classes scheduled today',
    hint: nextHint,
    color: 'neutral',
    footer: hasClasses && classes.length > 0 ? (
      <div className='space-y-1'>
        {classes.slice(0, 3).map((cls, i) => (
          <div key={i} className='flex items-center justify-between text-[10px]'>
            <span className='font-medium truncate max-w-[60%]'>{cls.course}</span>
            <span className='opacity-70'>{cls.time.split('-')[0]}</span>
          </div>
        ))}
        {classes.length > 3 && (
          <div className='text-[9px] opacity-50'>+{classes.length - 3} more</div>
        )}
      </div>
    ) : undefined
  };
}

function deadlinesTile(metrics: StudentMetrics): HeroTileProps {
  const { upcoming, count } = metrics.deadlines;
  // Check if any deadline is within 3 days
  const now = new Date();
  const threeDaysOut = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const urgent = upcoming.filter(
    (d) => new Date(d.due) <= threeDaysOut
  ).length;

  let color: TileColor = 'neutral';
  if (urgent > 0) color = 'amber';
  if (count === 0) color = 'green';

  return {
    label: 'Upcoming Deadlines',
    value: count,
    subtitle:
      count === 0
        ? 'No upcoming deadlines in the next 30 days'
        : `${count} deadline${count === 1 ? '' : 's'} coming up`,
    hint: urgent > 0 ? `${urgent} due within 3 days` : undefined,
    color,
    footer: count > 0 && upcoming.length > 0 ? (
      <div className='space-y-1'>
        {upcoming.slice(0, 3).map((d, i) => (
          <div key={i} className='flex items-center justify-between text-[10px]'>
            <span className='truncate max-w-[60%]'>{d.title}</span>
            <span className='opacity-70'>
              {new Date(d.due).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
          </div>
        ))}
      </div>
    ) : undefined
  };
}

// ============================================================================
// Public component
// ============================================================================
type StudentHeroStripProps = {
  metrics: StudentMetrics;
};

export function StudentHeroStrip({ metrics }: StudentHeroStripProps) {
  const tiles: HeroTileProps[] = [
    attendanceTile(metrics),
    feesTile(metrics),
    timetableTile(metrics),
    deadlinesTile(metrics)
  ];

  return (
    <section aria-label='Learner dashboard hero KPIs'>
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4'>
        {tiles.map((tile) => (
          <HeroTile key={tile.label} {...tile} />
        ))}
      </div>
    </section>
  );
}

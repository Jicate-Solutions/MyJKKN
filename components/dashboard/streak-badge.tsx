/**
 * Streak Badge — "4/4 leads in SLA today  3-day streak"
 *
 * Compact pill rendered between hero strip and institution chips.
 * Visible to Director + Counselor personas only (spec §4.3).
 *
 * Server component — data fetched at request time via getStreak().
 */

import { getStreak } from '@/lib/services/dashboard/streak-service';

export async function StreakBadge() {
  const streak = await getStreak();

  // Nothing to show if no streak and already on track with 100% today
  const showBadge = streak.current_streak > 0 || streak.today_status === 'broken';
  if (!showBadge) return null;

  const isBroken = streak.today_status === 'broken';
  const pct = Math.round(streak.today_compliance_pct);

  return (
    <div
      className={`
        inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium
        border transition-colors
        ${
          isBroken
            ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
            : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
        }
      `}
    >
      {/* Fire emoji for active streak */}
      {!isBroken && streak.current_streak > 0 && (
        <span className='text-sm' role='img' aria-label='fire'>
          {'\uD83D\uDD25'}
        </span>
      )}

      {/* Today's compliance */}
      <span>
        {pct}% SLA today
      </span>

      {/* Streak count */}
      {streak.current_streak > 0 && (
        <>
          <span className='text-neutral-300 dark:text-neutral-600'>|</span>
          <span className='font-semibold'>
            {streak.current_streak}-day streak
          </span>
        </>
      )}

      {/* Broken indicator */}
      {isBroken && (
        <>
          <span className='text-neutral-300 dark:text-neutral-600'>|</span>
          <span className='text-red-600 dark:text-red-400'>streak broken</span>
        </>
      )}

      {/* Best streak reference */}
      {streak.best_streak > streak.current_streak && streak.best_streak > 1 && (
        <span className='text-[10px] text-neutral-400 dark:text-neutral-500'>
          (best: {streak.best_streak}d)
        </span>
      )}
    </div>
  );
}

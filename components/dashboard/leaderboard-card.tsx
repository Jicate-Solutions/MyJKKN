/**
 * Dashboard v2 — Leaderboard Card (SLA Daily + Conversion Monthly)
 *
 * Server component. Renders rank, avatar, name, metric, institution chip.
 * Top-3 get gold/silver/bronze ring (Round 4.13 spec reward).
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §7.6
 */

import {
  LeaderboardResult,
  LeaderboardRow,
  initialsFromName,
  formatMinutes
} from '@/lib/services/dashboard/leaderboard-service';

type LeaderboardKind = 'sla_daily' | 'conversion_monthly';

type LeaderboardCardProps = {
  kind: LeaderboardKind;
  result: LeaderboardResult;
};

// ============================================================================
// Rank badge — gold/silver/bronze for top-3, neutral otherwise
// ============================================================================
function RankBadge({ rank }: { rank: number }) {
  const cls =
    rank === 1
      ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-md shadow-amber-500/30'
      : rank === 2
        ? 'bg-gradient-to-br from-neutral-300 to-neutral-400 text-neutral-900 shadow-md shadow-neutral-400/30'
        : rank === 3
          ? 'bg-gradient-to-br from-amber-700 to-amber-900 text-white shadow-md shadow-amber-800/30'
          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400';
  return (
    <span
      className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold tabular-nums ${cls}`}
      aria-label={`Rank ${rank}`}
    >
      {rank}
    </span>
  );
}

// ============================================================================
// Avatar with top-3 medal ring
// ============================================================================
function Avatar({ row, rank }: { row: LeaderboardRow; rank: number }) {
  const ringClass =
    rank === 1
      ? 'ring-2 ring-amber-500 ring-offset-2 ring-offset-white dark:ring-offset-neutral-900'
      : rank === 2
        ? 'ring-2 ring-neutral-400 ring-offset-2 ring-offset-white dark:ring-offset-neutral-900'
        : rank === 3
          ? 'ring-2 ring-amber-700 ring-offset-2 ring-offset-white dark:ring-offset-neutral-900'
          : '';
  if (row.avatar_url) {
    // Using <img> instead of next/image to avoid domain allow-list friction in Day 4
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={row.avatar_url}
        alt={row.full_name ?? ''}
        className={`w-8 h-8 rounded-full object-cover ${ringClass}`}
      />
    );
  }
  return (
    <span
      className={`w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-sky-500 text-white text-xs font-semibold flex items-center justify-center ${ringClass}`}
      aria-hidden
    >
      {initialsFromName(row.full_name)}
    </span>
  );
}

// ============================================================================
// Single row
// ============================================================================
function LeaderboardRowLine({
  row,
  kind
}: {
  row: LeaderboardRow;
  kind: LeaderboardKind;
}) {
  return (
    <li className='flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors'>
      <RankBadge rank={row.rank_global} />
      <Avatar row={row} rank={row.rank_global} />
      <div className='flex-1 min-w-0'>
        <div className='text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate'>
          {row.full_name ?? '—'}
        </div>
        <div className='text-[11px] text-neutral-500 truncate'>
          {row.institution_name ?? 'Unassigned'} · {row.lead_count} leads
        </div>
      </div>
      <div className='text-right'>
        {kind === 'sla_daily' ? (
          <>
            <div className='text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-100'>
              {formatMinutes(row.median_minutes_to_first_touch)}
            </div>
            <div className='text-[11px] tabular-nums text-neutral-500'>
              {row.compliance_pct?.toFixed(0) ?? '—'}% SLA
            </div>
          </>
        ) : (
          <>
            <div className='text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-100'>
              {row.conversion_pct?.toFixed(1) ?? '—'}%
            </div>
            <div className='text-[11px] tabular-nums text-neutral-500'>
              {row.converted_count ?? 0} conv
            </div>
          </>
        )}
      </div>
    </li>
  );
}

// ============================================================================
// Card
// ============================================================================
export function LeaderboardCard({ kind, result }: LeaderboardCardProps) {
  const title =
    kind === 'sla_daily' ? 'Daily SLA Leaderboard' : 'Monthly Conversion Leaderboard';
  const subtitle =
    kind === 'sla_daily'
      ? 'Median minutes to first touch · today · min 5 leads'
      : 'Lead-to-admission % · last 30 days · min 10 leads';
  const emptyCopy =
    kind === 'sla_daily'
      ? 'No counselor has handled ≥5 hot leads yet today. Leaderboard populates as the day progresses.'
      : 'No counselor has handled ≥10 leads in the last 30 days. Leaderboard populates as volume accrues.';

  return (
    <section className='rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm'>
      <header className='flex items-center justify-between p-4 sm:p-5 border-b border-neutral-200 dark:border-neutral-800'>
        <div>
          <h2 className='text-sm font-semibold text-neutral-900 dark:text-neutral-100'>
            {title}
          </h2>
          <p className='text-xs text-neutral-500 mt-0.5'>{subtitle}</p>
        </div>
        <span
          className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded-full ${
            kind === 'sla_daily'
              ? 'bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300'
              : 'bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
          }`}
        >
          {kind === 'sla_daily' ? 'Refreshes · 5 min' : 'Refreshes · daily'}
        </span>
      </header>

      {result.rows.length === 0 ? (
        <div className='p-8 text-center'>
          <div className='text-3xl mb-2'>🏁</div>
          <div className='text-sm font-medium text-neutral-900 dark:text-neutral-100'>
            Leaderboard empty
          </div>
          <div className='mt-2 text-xs text-neutral-500 max-w-sm mx-auto leading-relaxed'>
            {emptyCopy}
          </div>
        </div>
      ) : (
        <ol className='p-2 space-y-1'>
          {result.rows.map((row) => (
            <LeaderboardRowLine key={row.counselor_id} row={row} kind={kind} />
          ))}
        </ol>
      )}

      {result.rows.length > 0 && (
        <footer className='px-4 sm:px-5 py-2 border-t border-neutral-100 dark:border-neutral-800 text-[11px] text-neutral-500'>
          Showing {result.rows.length} of {result.total} ranked counselors
        </footer>
      )}
    </section>
  );
}

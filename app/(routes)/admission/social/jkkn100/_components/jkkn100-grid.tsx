'use client';

/**
 * The JKKN100 scoreboard grid: accounts down the side, day tags across the
 * top (Day 40 first, which is also the earliest date), one cell per
 * account × day.
 *
 *   YES      green, with minutes after the day's anchor reel
 *   NO       red
 *   COLLAB   indigo — on that day's hand-set collab list, so no own copy is
 *            expected; says so as well when it uploaded one anyway
 *   UNKNOWN  amber "?" on a dashed muted chip; the reason is in the cell's
 *            title (hover) and in its accessible name
 *
 * Every status carries a word or symbol as well as a colour. Each column head
 * carries the date the tag fixes, and says on its face when that day had to be
 * timed from the earliest post instead of the chosen anchor account.
 */

import {
  jkkn100IstDate,
  JKKN100_UNKNOWN_REASON_TEXT,
  JKKN100_WINDOW_MINUTES,
  type Jkkn100AccountRow,
  type Jkkn100Cell,
  type Jkkn100Day,
  type Jkkn100Scoreboard,
} from '@/lib/services/social/jkkn100-scoreboard';

const IST: Intl.DateTimeFormatOptions = {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
};

export function formatIst(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString('en-IN', IST) : '';
}

/** A plain `YYYY-MM-DD` as "9 Nov" — no clock, no timezone shift. */
export function formatDayDate(date: string | null): string {
  if (!date) return '';
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' });
}

const IST_TIME: Intl.DateTimeFormatOptions = {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
};

/** Just the clock time in India — the column head already gives the date. */
export function formatIstTime(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleTimeString('en-IN', IST_TIME) : '';
}

export function formatMinutes(m: number | null): string {
  if (m === null) return '';
  if (m === 0) return '0m';
  return m > 0 ? `+${m}m` : `−${Math.abs(m)}m`;
}

export function runnerLabel(row: Pick<Jkkn100AccountRow, 'runner_id' | 'runner_name'>): string {
  if (row.runner_name) return row.runner_name;
  return row.runner_id ? 'Team member (name not readable)' : 'Nobody named yet';
}

function offDateNote(cell: Jkkn100Cell): string {
  return cell.posted_on_date
    ? ` It went out on ${formatDayDate(cell.posted_on_date)}, not the date the tag gives.`
    : '';
}

function cellTitle(row: Jkkn100AccountRow, day: Jkkn100Day, cell: Jkkn100Cell): string {
  const who = row.username ? `@${row.username}` : 'This account';
  if (cell.status === 'collab') {
    const base = `${who} is in the ${day.tag} collab, so no copy of its own is expected.`;
    if (!cell.also_posted) return base;
    return `${base} It uploaded one anyway, at ${formatIst(cell.posted_at)} (${formatMinutes(cell.minutes_after_anchor)} against the anchor reel).${offDateNote(cell)}`;
  }
  if (cell.status === 'yes') {
    const m = cell.minutes_after_anchor ?? 0;
    const when =
      m === 0
        ? 'at the same minute as the anchor reel'
        : m > 0
          ? `${m} minute${m === 1 ? '' : 's'} after the anchor reel`
          : `${Math.abs(m)} minute${m === -1 ? '' : 's'} before the anchor reel`;
    const late = m > JKKN100_WINDOW_MINUTES ? ' (outside the one-hour window)' : '';
    return `${who} posted ${day.tag} ${when}${late}, at ${formatIst(cell.posted_at)}.${offDateNote(cell)}`;
  }
  if (cell.status === 'no') {
    return `${who} has no post carrying ${day.tag}, and we checked after the hour closed.`;
  }
  return `${day.tag}: unknown. ${cell.reason ? JKKN100_UNKNOWN_REASON_TEXT[cell.reason] : ''}`.trim();
}

function Cell({ row, day }: { row: Jkkn100AccountRow; day: Jkkn100Day }) {
  const cell = row.cells[day.day];
  if (!cell) return <td data-day={day.day} className="px-2 py-1.5" />;
  const title = cellTitle(row, day, cell);
  const offDate = cell.posted_on_date ? (
    <span className="text-[10px] font-normal text-amber-700 dark:text-amber-400">
      {formatDayDate(cell.posted_on_date)}
    </span>
  ) : null;

  if (cell.status === 'collab') {
    return (
      <td data-day={day.day} className="px-1 py-1 text-center">
        <span
          title={title}
          aria-label={title}
          data-status="collab"
          className="inline-flex min-w-[3.5rem] flex-col items-center rounded-md border border-indigo-300 bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
        >
          <span>Collab</span>
          {cell.also_posted ? (
            <span className="tabular-nums text-[10px] font-normal">
              + own {formatMinutes(cell.minutes_after_anchor)}
            </span>
          ) : null}
          {offDate}
        </span>
      </td>
    );
  }
  if (cell.status === 'yes') {
    const late = (cell.minutes_after_anchor ?? 0) > JKKN100_WINDOW_MINUTES;
    return (
      <td data-day={day.day} className="px-1 py-1 text-center">
        <span
          title={title}
          aria-label={title}
          data-status="yes"
          className="inline-flex min-w-[3.5rem] flex-col items-center rounded-md border border-border bg-background px-1.5 py-0.5 text-xs font-medium text-green-700 dark:text-emerald-400"
        >
          <span>Yes</span>
          <span className={`tabular-nums ${late ? 'text-amber-700 dark:text-amber-400' : ''}`}>
            {formatMinutes(cell.minutes_after_anchor)}
          </span>
          {offDate}
        </span>
      </td>
    );
  }
  if (cell.status === 'no') {
    return (
      <td data-day={day.day} className="px-1 py-1 text-center">
        <span
          title={title}
          aria-label={title}
          data-status="no"
          className="inline-flex min-w-[3.5rem] justify-center rounded-md border border-border bg-background px-1.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400"
        >
          No
        </span>
      </td>
    );
  }
  return (
    <td data-day={day.day} className="px-1 py-1 text-center">
      <span
        title={title}
        aria-label={title}
        data-status="unknown"
        className="inline-flex min-w-[3.5rem] justify-center rounded-md border border-dashed border-border bg-muted px-1.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400"
      >
        ? Unknown
      </span>
    </td>
  );
}

export function Jkkn100Grid({ board }: { board: Jkkn100Scoreboard }) {
  // The badge only means something when an anchor account was asked for: with
  // no anchor every day is timed from its own earliest post by design.
  const anchorAsked = Boolean(board.anchor_username);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th
              scope="col"
              className="sticky left-0 z-10 min-w-[13rem] bg-muted px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Account
            </th>
            {board.days.map((day) => {
              const fellBack = anchorAsked && day.anchor_source !== 'anchor_account';
              return (
                <th
                  key={day.day}
                  scope="col"
                  data-day={day.day}
                  data-anchor-source={day.anchor_source}
                  className="px-1 py-2 text-center text-xs font-medium text-muted-foreground"
                  title={`${day.tag} is ${formatDayDate(day.date)} (${day.date}). Anchor: ${day.anchor_username ? '@' + day.anchor_username : 'unknown account'} at ${formatIst(day.anchor_posted_at)} (${day.anchor_source === 'anchor_account' ? 'the chosen anchor account' : 'the earliest post of the day'}).`}
                >
                  <div className="font-semibold text-foreground">Day {String(day.day).padStart(2, '0')}</div>
                  <div className="whitespace-nowrap font-semibold text-foreground">{formatDayDate(day.date)}</div>
                  <div className="whitespace-nowrap">
                    {/* The date is on the line above, so the anchor normally
                        needs only its time — unless it went out on another
                        date, which has to show. */}
                    {jkkn100IstDate(day.anchor_posted_at) === day.date
                      ? formatIstTime(day.anchor_posted_at)
                      : formatIst(day.anchor_posted_at)}
                  </div>
                  {fellBack ? (
                    <div
                      data-badge="earliest-post"
                      className="mx-auto mt-1 max-w-[6rem] rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-[10px] font-normal leading-tight text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    >
                      timed from earliest post
                    </div>
                  ) : null}
                </th>
              );
            })}
            <th scope="col" className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">
              Yes
            </th>
            <th scope="col" className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">
              No
            </th>
            <th scope="col" className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">
              Collab
            </th>
            <th scope="col" className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">
              Unknown
            </th>
            <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
              Median
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {board.accounts.map((row) => (
            <tr key={row.account_id} data-account={row.username ?? row.account_id}>
              <th
                scope="row"
                className="sticky left-0 z-10 bg-background px-3 py-1.5 text-left align-middle font-normal"
              >
                <div className="text-sm font-medium text-foreground">
                  {row.username ? `@${row.username}` : row.account_id}
                </div>
                <div className={`text-xs ${row.runner_name ? 'text-muted-foreground' : 'italic text-muted-foreground'}`}>
                  {runnerLabel(row)}
                </div>
              </th>
              {board.days.map((day) => (
                <Cell key={day.day} row={row} day={day} />
              ))}
              <td className="px-2 py-1.5 text-right tabular-nums text-green-700 dark:text-emerald-400">
                {row.totals.yes}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-red-600 dark:text-red-400">{row.totals.no}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-indigo-700 dark:text-indigo-300">
                {row.totals.collab}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-amber-700 dark:text-amber-400">
                {row.totals.unknown}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                {row.totals.median_minutes === null ? '—' : formatMinutes(row.totals.median_minutes)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/50" data-row="day-totals">
            <th
              scope="row"
              className="sticky left-0 z-10 bg-muted px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Day totals
            </th>
            {board.days.map((day) => (
              <td key={day.day} data-day={day.day} className="px-1 py-2 text-center text-xs tabular-nums">
                <div className="text-green-700 dark:text-emerald-400">{day.totals.yes} yes</div>
                <div className="text-red-600 dark:text-red-400">{day.totals.no} no</div>
                <div className="text-indigo-700 dark:text-indigo-300">{day.totals.collab} collab</div>
                <div className="text-amber-700 dark:text-amber-400">{day.totals.unknown} ?</div>
                <div className="text-muted-foreground">
                  {day.totals.median_minutes === null ? '—' : formatMinutes(day.totals.median_minutes)}
                </div>
              </td>
            ))}
            <td colSpan={5} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

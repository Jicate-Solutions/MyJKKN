/**
 * JKKN100 Founders Day reel countdown — the Monday scoreboard.
 *
 * Director's decisions 2026-10-08: one 30-second reel a day for 40 days, up to
 * Founders Day on 18 November 2026. The day tag counts the days LEFT, so the
 * tag fixes the date: #JKKN100Day40 on 9 October 2026, down to #JKKN100Day01 on
 * 17 November 2026.
 *
 * Three things the Director settled, which this file encodes:
 *
 *   1. The anchor account is @jkkninstitutions — he uploads there first. When it
 *      carries no tagged post for a day, that day is timed from the earliest
 *      tagged post of the day instead, and `anchor_source` says so.
 *   2. Each reel also goes out as a collab with 3–5 of the big college pages.
 *      A collab is authored by the anchor account, so Instagram never lists it
 *      on the partner's own media edge and our collector cannot see it. Those
 *      partners are NOT supposed to upload a copy, so they get their own state,
 *      COLLAB, set by hand per day. A collab partner is never reported as NO.
 *   3. A tagged post whose own date is not the tag's date still counts, and
 *      carries a note saying which date it went out on.
 *
 * Why an own copy and a caption tag at all: Instagram's media edge only lists
 * posts an account AUTHORED, and our collector reads exactly that, storing the
 * caption on first read. So a native repost never shows up, and a tag edited in
 * afterwards is never seen — the tag has to be in the caption at upload.
 *
 * This file is pure (no I/O) so the rules are unit-tested in one place:
 *
 *   For each day tag that at least one post carries:
 *     ANCHOR = the earliest post with that tag from `anchorUsername` (when given
 *              and it posted that day), else the earliest post with that tag
 *              from ANY account. `anchor_source` says which.
 *
 *   For each account × day, in this order:
 *     1. COLLAB   — the account is on that day's hand-set collab list. Its own
 *                   copy, if it made one anyway, is still reported alongside.
 *     2. YES      — the account has a post with that tag. Minutes = its
 *                   earliest such post minus the anchor time (negative if it
 *                   went out before the anchor; the anchor account itself is 0).
 *                   Evidence wins: a post we hold is YES even on an account we
 *                   cannot normally read.
 *     3. UNKNOWN  — we cannot know it is missing, in this order:
 *                     disconnected             status = 'disconnected'
 *                     public_only              metrics_source business_discovery
 *                     source_unknown           no reading method recorded
 *                     not_polled_since_window  last_polled_at is null, or
 *                                              earlier than anchor + 60 min
 *     4. NO       — readable, looked at after the hour closed, no tagged post.
 *
 *   A public-only account is never reported as NO.
 *
 * Days are listed oldest first — Day 40 leftmost, Day 01 last — which is also
 * chronological, because the tag counts down as the dates go up.
 */

export const JKKN100_TAG_RE = /#JKKN100Day(\d{1,2})(?!\d)/gi;
export const JKKN100_FIRST_DAY = 40;
export const JKKN100_LAST_DAY = 1;
/** Founders Day. Day N is this date minus N days. */
export const JKKN100_FOUNDERS_DAY = '2026-11-18';
/** Read window for the scoreboard route (posts before this are ignored). */
export const JKKN100_DEFAULT_SINCE = '2026-10-01';
/** The account the Director uploads from first (his own decision, 2026-10-08). */
export const JKKN100_DEFAULT_ANCHOR = 'jkkninstitutions';
export const JKKN100_PAGE_SIZE = 1000;
/** 71 accounts × 40 days = 2,840 tagged posts at most; 5 pages leaves room. */
export const JKKN100_MAX_PAGES = 5;
/** The hour every account has to upload its copy in. */
export const JKKN100_WINDOW_MINUTES = 60;
/** Reading methods whose poller stores every post's caption in ig_posts. */
export const JKKN100_READABLE_SOURCES = ['graph', 'instagram_login'] as const;
/** Longest ?collab= we will parse at all. */
export const JKKN100_COLLAB_MAX_LENGTH = 2000;

const READABLE_SOURCES = new Set<string>(JKKN100_READABLE_SOURCES);
const FOUNDERS_DAY_MS = Date.UTC(2026, 10, 18);
/** India has a fixed +05:30 and no daylight saving, so a constant is exact. */
const IST_OFFSET_MINUTES = 330;
const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;

export type Jkkn100Status = 'yes' | 'no' | 'unknown' | 'collab';
export type Jkkn100UnknownReason =
  | 'public_only'
  | 'source_unknown'
  | 'disconnected'
  | 'not_polled_since_window';
export type Jkkn100AnchorSource = 'anchor_account' | 'earliest_any';

export const JKKN100_UNKNOWN_REASON_TEXT: Record<Jkkn100UnknownReason, string> = {
  public_only:
    'Public-only account: we read its public profile, not every post it makes, so a missing copy cannot be confirmed.',
  source_unknown:
    'No reading method recorded for this account, so we cannot say whether a copy is missing.',
  disconnected: 'Disconnected: this account is no longer linked, so we cannot read its posts.',
  not_polled_since_window:
    'Not checked since the hour closed: we have not read this account after the one-hour window ended.',
};

export interface Jkkn100Account {
  id: string;
  username: string | null;
  institution_id?: string | null;
  department_id?: string | null;
  status: string | null;
  metrics_source: string | null;
  last_polled_at: string | null;
  connected_by?: string | null;
  connected_by_name?: string | null;
}

export interface Jkkn100Post {
  id: string;
  account_id: string;
  caption: string | null;
  posted_at: string;
  permalink?: string | null;
  media_type?: string | null;
}

export interface Jkkn100Options {
  anchorUsername?: string | null;
  /** Day number → the usernames in that day's collab, as `?collab=` gave them. */
  collab?: Record<number, string[]>;
}

export interface Jkkn100Cell {
  day: number;
  status: Jkkn100Status;
  minutes_after_anchor: number | null;
  posted_at: string | null;
  /** The post's own India date, set only when it is not the tag's date. */
  posted_on_date: string | null;
  permalink: string | null;
  reason: Jkkn100UnknownReason | null;
  /** A collab partner that uploaded its own tagged copy as well. */
  also_posted: boolean;
}

export interface Jkkn100Totals {
  yes: number;
  no: number;
  unknown: number;
  /** Cells on that day's hand-set collab list. */
  collab: number;
  /** YES cells on time: no later than 60 minutes after the anchor (early counts). */
  within_hour: number;
  /** Median minutes after the anchor over YES cells; null when none. */
  median_minutes: number | null;
}

export interface Jkkn100Day {
  day: number;
  tag: string;
  /** The date the tag fixes: Founders Day minus `day` days (YYYY-MM-DD). */
  date: string;
  anchor_account_id: string;
  anchor_username: string | null;
  anchor_posted_at: string;
  anchor_permalink: string | null;
  anchor_source: Jkkn100AnchorSource;
  totals: Jkkn100Totals;
}

export interface Jkkn100AccountRow {
  account_id: string;
  username: string | null;
  institution_id: string | null;
  department_id: string | null;
  status: string | null;
  metrics_source: string | null;
  last_polled_at: string | null;
  runner_id: string | null;
  runner_name: string | null;
  /** Keyed by day number, only for days present in `days`. */
  cells: Record<number, Jkkn100Cell>;
  totals: Jkkn100Totals;
}

export interface Jkkn100Scoreboard {
  /** Oldest day first: Day 40 first, Day 01 last — which is chronological. */
  days: Jkkn100Day[];
  accounts: Jkkn100AccountRow[];
  anchor_username: string | null;
  /** The collab lists that were applied, day number → usernames. */
  collab: Record<number, string[]>;
  /** Anything in the collab list we could not act on, in plain words. */
  warnings: string[];
  tagged_post_count: number;
}

/** Day number (1–40) of the first valid #JKKN100DayNN tag, else null. */
export function parseJkkn100Day(caption: string | null | undefined): number | null {
  if (!caption) return null;
  const re = new RegExp(JKKN100_TAG_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(caption)) !== null) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n >= JKKN100_LAST_DAY && n <= JKKN100_FIRST_DAY) return n;
  }
  return null;
}

export function jkkn100Tag(day: number): string {
  return `#JKKN100Day${String(day).padStart(2, '0')}`;
}

/** The date a day tag fixes: Founders Day minus that many days (YYYY-MM-DD). */
export function jkkn100DayDate(day: number): string {
  return new Date(FOUNDERS_DAY_MS - day * 86_400_000).toISOString().slice(0, 10);
}

/** The India (IST, +05:30) calendar date of an instant, or null if unreadable. */
export function jkkn100IstDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

export interface Jkkn100Collab {
  /** Day number → usernames, lower case, deduplicated, sorted. */
  byDay: Record<number, string[]>;
  /** Parts of the input we could not use, in plain words. */
  warnings: string[];
}

/**
 * Reads `40:handle1,handle2;39:handle3` — the day number, a colon, then the
 * usernames of that day's collab partners. A leading @ is fine and case does
 * not matter. Anything it cannot use comes back in `warnings`, never silently
 * dropped: a day outside 1–40, a part with no colon, a username with
 * characters Instagram does not allow.
 */
export function parseJkkn100Collab(raw: string | null | undefined): Jkkn100Collab {
  const acc = new Map<number, Set<string>>();
  const warnings: string[] = [];
  if (raw && raw.trim()) {
    for (const segment of raw.split(';')) {
      const part = segment.trim();
      if (!part) continue;
      const colon = part.indexOf(':');
      if (colon < 0) {
        warnings.push(`"${part}" is not a day and a list of accounts, like 40:handle1,handle2.`);
        continue;
      }
      const dayText = part.slice(0, colon).trim().replace(/^day\s*/i, '');
      const day = Number(dayText);
      if (
        !/^\d{1,2}$/.test(dayText) ||
        !Number.isInteger(day) ||
        day < JKKN100_LAST_DAY ||
        day > JKKN100_FIRST_DAY
      ) {
        warnings.push(`"${part.slice(0, colon).trim()}" is not a day number between 1 and 40.`);
        continue;
      }
      const names = acc.get(day) ?? new Set<string>();
      for (const token of part.slice(colon + 1).split(',')) {
        const name = token.trim().replace(/^@/, '').toLowerCase();
        if (!name) continue;
        if (!USERNAME_RE.test(name)) {
          warnings.push(
            `"${token.trim()}" is not an Instagram username, so Day ${String(day).padStart(2, '0')} left it out.`
          );
          continue;
        }
        names.add(name);
      }
      if (names.size > 0) acc.set(day, names);
    }
  }
  const byDay: Record<number, string[]> = {};
  for (const day of [...acc.keys()].sort((a, b) => b - a)) {
    byDay[day] = [...acc.get(day)!].sort();
  }
  return { byDay, warnings };
}

/** The `?collab=` text for a set of lists, so a link carries them. */
export function formatJkkn100Collab(byDay: Record<number, string[]>): string {
  return Object.keys(byDay)
    .map(Number)
    .filter((day) => Number.isInteger(day) && (byDay[day] ?? []).length > 0)
    .sort((a, b) => b - a)
    .map((day) => `${String(day).padStart(2, '0')}:${byDay[day]!.join(',')}`)
    .join(';');
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

function totalsOf(cells: Jkkn100Cell[]): Jkkn100Totals {
  const yesMinutes = cells
    .filter((c) => c.status === 'yes' && c.minutes_after_anchor !== null)
    .map((c) => c.minutes_after_anchor as number);
  return {
    yes: cells.filter((c) => c.status === 'yes').length,
    no: cells.filter((c) => c.status === 'no').length,
    unknown: cells.filter((c) => c.status === 'unknown').length,
    collab: cells.filter((c) => c.status === 'collab').length,
    within_hour: yesMinutes.filter((m) => m <= JKKN100_WINDOW_MINUTES).length,
    median_minutes: median(yesMinutes),
  };
}

/** Why an account cannot be read for a day, or null when it can. */
export function jkkn100UnknownReason(
  account: Jkkn100Account,
  anchorMs: number
): Jkkn100UnknownReason | null {
  if (account.status === 'disconnected') return 'disconnected';
  const source = account.metrics_source;
  if (source === 'business_discovery') return 'public_only';
  if (!READABLE_SOURCES.has(source ?? '')) return 'source_unknown';
  const polled = ms(account.last_polled_at);
  if (polled === null || polled < anchorMs + JKKN100_WINDOW_MINUTES * 60_000) {
    return 'not_polled_since_window';
  }
  return null;
}

function earlier(a: { ms: number; post: Jkkn100Post }, b: { ms: number; post: Jkkn100Post }) {
  if (a.ms !== b.ms) return a.ms < b.ms;
  return a.post.id < b.post.id;
}

/** The post's own India date when it is not the one the tag fixes, else null. */
function offDate(postedAt: string, day: number): string | null {
  const actual = jkkn100IstDate(postedAt);
  return actual && actual !== jkkn100DayDate(day) ? actual : null;
}

export function buildJkkn100Scoreboard(
  accounts: Jkkn100Account[],
  posts: Jkkn100Post[],
  options: Jkkn100Options = {}
): Jkkn100Scoreboard {
  const anchorName = options.anchorUsername?.trim().replace(/^@/, '').toLowerCase() || null;
  const byId = new Map(accounts.map((a) => [a.id, a]));

  const collabByDay = new Map<number, Set<string>>();
  for (const [dayText, names] of Object.entries(options.collab ?? {})) {
    const day = Number(dayText);
    if (!Number.isInteger(day)) continue;
    const set = new Set((names ?? []).map((n) => n.trim().replace(/^@/, '').toLowerCase()).filter(Boolean));
    if (set.size > 0) collabByDay.set(day, set);
  }

  // Earliest tagged post per (day, account). Posts from accounts we do not
  // hold are ignored: they could never be shown in a row.
  const earliest = new Map<number, Map<string, { ms: number; post: Jkkn100Post }>>();
  let taggedCount = 0;
  for (const post of posts) {
    if (!byId.has(post.account_id)) continue;
    const day = parseJkkn100Day(post.caption);
    if (day === null) continue;
    const t = ms(post.posted_at);
    if (t === null) continue;
    taggedCount += 1;
    let perAccount = earliest.get(day);
    if (!perAccount) {
      perAccount = new Map();
      earliest.set(day, perAccount);
    }
    const cand = { ms: t, post };
    const prev = perAccount.get(post.account_id);
    if (!prev || earlier(cand, prev)) perAccount.set(post.account_id, cand);
  }

  // Anchor per day. When more than one account row carries the anchor username,
  // the earliest of their tagged posts sets the clock.
  const anchors: Array<{ day: number; ms: number; post: Jkkn100Post; source: Jkkn100AnchorSource }> = [];
  for (const [day, perAccount] of earliest) {
    let chosen: { ms: number; post: Jkkn100Post } | null = null;
    let source: Jkkn100AnchorSource = 'earliest_any';
    if (anchorName) {
      for (const [accountId, entry] of perAccount) {
        if ((byId.get(accountId)?.username ?? '').toLowerCase() !== anchorName) continue;
        if (!chosen || earlier(entry, chosen)) chosen = entry;
        source = 'anchor_account';
      }
    }
    if (!chosen) {
      source = 'earliest_any';
      for (const entry of perAccount.values()) {
        if (!chosen || earlier(entry, chosen)) chosen = entry;
      }
    }
    if (chosen) anchors.push({ day, ms: chosen.ms, post: chosen.post, source });
  }
  // Oldest day first. The tag counts DOWN as the dates go up, so Day 40 first
  // is both the highest tag and the earliest date.
  anchors.sort((a, b) => b.day - a.day);

  const cellsByDay = new Map<number, Jkkn100Cell[]>();
  const rows: Jkkn100AccountRow[] = accounts.map((account) => {
    const username = (account.username ?? '').toLowerCase();
    const cells: Record<number, Jkkn100Cell> = {};
    for (const anchor of anchors) {
      const own = earliest.get(anchor.day)?.get(account.id);
      const inCollab = username !== '' && (collabByDay.get(anchor.day)?.has(username) ?? false);
      let cell: Jkkn100Cell;
      if (inCollab) {
        // Hand-set and therefore ground truth: a collab partner is never NO,
        // and never hidden behind an UNKNOWN we could not have resolved.
        cell = {
          day: anchor.day,
          status: 'collab',
          minutes_after_anchor: own ? Math.round((own.ms - anchor.ms) / 60_000) : null,
          posted_at: own?.post.posted_at ?? null,
          posted_on_date: own ? offDate(own.post.posted_at, anchor.day) : null,
          permalink: own?.post.permalink ?? null,
          reason: null,
          also_posted: Boolean(own),
        };
      } else if (own) {
        cell = {
          day: anchor.day,
          status: 'yes',
          minutes_after_anchor: Math.round((own.ms - anchor.ms) / 60_000),
          posted_at: own.post.posted_at,
          posted_on_date: offDate(own.post.posted_at, anchor.day),
          permalink: own.post.permalink ?? null,
          reason: null,
          also_posted: false,
        };
      } else {
        const reason = jkkn100UnknownReason(account, anchor.ms);
        cell = {
          day: anchor.day,
          status: reason ? 'unknown' : 'no',
          minutes_after_anchor: null,
          posted_at: null,
          posted_on_date: null,
          permalink: null,
          reason,
          also_posted: false,
        };
      }
      cells[anchor.day] = cell;
      const list = cellsByDay.get(anchor.day) ?? [];
      list.push(cell);
      cellsByDay.set(anchor.day, list);
    }
    return {
      account_id: account.id,
      username: account.username,
      institution_id: account.institution_id ?? null,
      department_id: account.department_id ?? null,
      status: account.status,
      metrics_source: account.metrics_source,
      last_polled_at: account.last_polled_at,
      runner_id: account.connected_by ?? null,
      runner_name: account.connected_by_name ?? null,
      cells,
      totals: totalsOf(Object.values(cells)),
    };
  });

  rows.sort((a, b) => (a.username ?? '').localeCompare(b.username ?? ''));

  const days: Jkkn100Day[] = anchors.map((anchor) => ({
    day: anchor.day,
    tag: jkkn100Tag(anchor.day),
    date: jkkn100DayDate(anchor.day),
    anchor_account_id: anchor.post.account_id,
    anchor_username: byId.get(anchor.post.account_id)?.username ?? null,
    anchor_posted_at: anchor.post.posted_at,
    anchor_permalink: anchor.post.permalink ?? null,
    anchor_source: anchor.source,
    totals: totalsOf(cellsByDay.get(anchor.day) ?? []),
  }));

  // A collab list we could not act on has to say so, or it looks applied.
  const known = new Set(
    accounts.map((a) => (a.username ?? '').toLowerCase()).filter((u) => u !== '')
  );
  const dayNumbers = new Set(anchors.map((a) => a.day));
  const warnings: string[] = [];
  const collab: Record<number, string[]> = {};
  for (const day of [...collabByDay.keys()].sort((a, b) => b - a)) {
    const names = [...collabByDay.get(day)!].sort();
    collab[day] = names;
    const label = `Day ${String(day).padStart(2, '0')}`;
    for (const name of names) {
      if (!known.has(name)) {
        warnings.push(`${label}: @${name} is not one of the accounts on this board, so it was left out.`);
      }
    }
    if (!dayNumbers.has(day)) {
      warnings.push(
        `${label}: no post carries ${jkkn100Tag(day)} yet, so this day is not on the board and its collab list is not shown.`
      );
    }
  }

  return {
    days,
    accounts: rows,
    anchor_username: anchorName,
    collab,
    warnings,
    tagged_post_count: taggedCount,
  };
}

function csvField(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? '' : String(v);
  // A text value starting with = + - @ (or a tab / CR) runs as a formula when
  // the CSV is opened in Excel or Sheets — a team member's name is free text.
  // Numbers (minutes can be negative) are left as numbers.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function cellNote(cell: Jkkn100Cell): string {
  const parts: string[] = [];
  if (cell.reason) parts.push(JKKN100_UNKNOWN_REASON_TEXT[cell.reason]);
  if (cell.status === 'collab') {
    parts.push(
      cell.also_posted
        ? 'In the day collab, and uploaded its own copy as well.'
        : 'In the day collab, so no own copy is expected.'
    );
  }
  if (cell.posted_on_date) parts.push(`Posted on ${cell.posted_on_date}, not the date the tag gives.`);
  return parts.join(' ');
}

/**
 * One line per account × day — the same data the grid shows, for a
 * spreadsheet. Runner name falls back to "Nobody named yet".
 */
export function jkkn100ScoreboardCsv(board: Jkkn100Scoreboard): string {
  const header = [
    'account',
    'runs_this_account',
    'day_tag',
    'day_date',
    'status',
    'minutes_after_anchor',
    'posted_at',
    'posted_on_date',
    'note',
    'anchor_account',
    'anchor_posted_at',
    'anchor_choice',
    'permalink',
  ];
  const lines = [header.join(',')];
  for (const row of board.accounts) {
    for (const day of board.days) {
      const cell = row.cells[day.day];
      if (!cell) continue;
      lines.push(
        [
          row.username ? `@${row.username}` : row.account_id,
          row.runner_name || (row.runner_id ? 'Team member (name not readable)' : 'Nobody named yet'),
          day.tag,
          day.date,
          cell.status.toUpperCase(),
          cell.minutes_after_anchor,
          cell.posted_at,
          cell.posted_on_date,
          cellNote(cell),
          day.anchor_username ? `@${day.anchor_username}` : day.anchor_account_id,
          day.anchor_posted_at,
          day.anchor_source === 'anchor_account' ? 'chosen anchor account' : 'earliest post of the day',
          cell.permalink,
        ]
          .map(csvField)
          .join(',')
      );
    }
  }
  return lines.join('\n') + '\n';
}

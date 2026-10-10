'use client';

/**
 * The JKKN100 scoreboard page body: filters, the collab editor, the note, the
 * stat tiles, the grid and the CSV download. Fetches
 * GET /api/social/jkkn100/scoreboard. The page wraps it in the permission
 * guard, the layout and a Suspense boundary (useSearchParams needs one).
 *
 * The URL is the shareable state: `?since=`, `?anchor=` and `?collab=` are
 * read on first render and written back on every change, so the Monday link
 * reopens exactly this board — the hand-set collab lists included.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, Info, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatJkkn100Collab,
  jkkn100ScoreboardCsv,
  parseJkkn100Collab,
  JKKN100_DEFAULT_ANCHOR,
  JKKN100_DEFAULT_SINCE,
  type Jkkn100Scoreboard,
} from '@/lib/services/social/jkkn100-scoreboard';
import { Jkkn100Grid, formatDayDate } from './jkkn100-grid';

type BoardData = Jkkn100Scoreboard & { since: string; generated_at: string };

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="space-y-1 rounded-xl border border-border bg-background p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function downloadCsv(board: BoardData) {
  const blob = new Blob([jkkn100ScoreboardCsv(board)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jkkn100-scoreboard-${board.generated_at.slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** How long the page waits for the scoreboard before showing an error. */
export const SCOREBOARD_FETCH_TIMEOUT_MS = 25_000;

export function Jkkn100ScoreboardBody() {
  const searchParams = useSearchParams();

  // Seeded from the link once. After that this state is the source of truth and
  // the URL follows it, so typing in the editor never fights a re-render.
  const [since, setSince] = useState(() => searchParams.get('since')?.trim() || JKKN100_DEFAULT_SINCE);
  const [anchor, setAnchor] = useState(() =>
    searchParams.has('anchor') ? (searchParams.get('anchor') ?? '').trim() : JKKN100_DEFAULT_ANCHOR
  );
  const [collab, setCollab] = useState<Record<number, string[]>>(
    () => parseJkkn100Collab(searchParams.get('collab')).byDay
  );
  // What the link's own collab text could not be used for. The fetch sends the
  // tidied-up lists, so the route never sees the bad part and cannot warn about
  // it — the page has to say so itself or the typo disappears without a word.
  const [linkProblems] = useState<string[]>(
    () => parseJkkn100Collab(searchParams.get('collab')).warnings
  );
  const [editDay, setEditDay] = useState('');
  const [editText, setEditText] = useState('');
  const [editProblems, setEditProblems] = useState<string[]>([]);

  // One piece of state for the answer, tagged with the request it answers. The
  // board is loading exactly while that tag is behind the current request, so
  // nothing has to be set the moment the effect starts.
  const [result, setResult] = useState<{ key: string; data: BoardData | null; error: string | null }>({
    key: '',
    data: null,
    error: null,
  });
  const [reloadKey, setReloadKey] = useState(0);

  const collabParam = useMemo(() => formatJkkn100Collab(collab), [collab]);
  const requestKey = `${since}|${anchor}|${collabParam}|${reloadKey}`;
  const loading = result.key !== requestKey;
  const data = result.data;
  const error = result.error;

  // Keep the address bar in step, without a navigation: this page never needs
  // to re-render from the URL, only to be copyable out of it.
  useEffect(() => {
    const qs = new URLSearchParams({ since, anchor });
    if (collabParam) qs.set('collab', collabParam);
    window.history.replaceState(null, '', `${window.location.pathname}?${qs.toString()}`);
  }, [since, anchor, collabParam]);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ since, anchor });
    if (collabParam) qs.set('collab', collabParam);
    // A request that never answers must not leave the board loading for ever.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SCOREBOARD_FETCH_TIMEOUT_MS);
    fetch(`/api/social/jkkn100/scoreboard?${qs.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json.success) {
          setResult({
            key: requestKey,
            data: null,
            error: json.error ?? `Could not load the scoreboard (HTTP ${res.status}).`,
          });
        } else {
          setResult({ key: requestKey, data: json.data as BoardData, error: null });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setResult({
          key: requestKey,
          data: null,
          error: controller.signal.aborted
            ? 'The scoreboard took too long to load. Check your connection and press Refresh.'
            : e instanceof Error
              ? e.message
              : 'Network error',
        });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [requestKey, since, anchor, collabParam]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const pickDay = useCallback(
    (value: string) => {
      setEditDay(value);
      setEditProblems([]);
      const day = Number(value);
      setEditText(Number.isInteger(day) ? (collab[day] ?? []).join(', ') : '');
    },
    [collab]
  );

  const applyDay = useCallback(() => {
    const day = Number(editDay);
    if (!Number.isInteger(day) || day < 1) {
      setEditProblems(['Choose a day first.']);
      return;
    }
    const parsed = parseJkkn100Collab(`${day}:${editText}`);
    setEditProblems(parsed.warnings);
    setCollab((prev) => {
      const next = { ...prev };
      const names = parsed.byDay[day] ?? [];
      if (names.length === 0) delete next[day];
      else next[day] = names;
      return next;
    });
  }, [editDay, editText]);

  // Both at once: what arrived broken in the link, and what the editor just
  // refused. Either way it is shown, never dropped.
  const collabProblems = [...linkProblems, ...editProblems.filter((w) => !linkProblems.includes(w))];

  const usernames = (data?.accounts ?? []).map((a) => a.username).filter((u): u is string => !!u);

  const totalYes = data?.days.reduce((s, d) => s + d.totals.yes, 0) ?? 0;
  const totalWithinHour = data?.days.reduce((s, d) => s + d.totals.within_hour, 0) ?? 0;
  const totalUnknown = data?.days.reduce((s, d) => s + d.totals.unknown, 0) ?? 0;
  const totalCollab = data?.days.reduce((s, d) => s + d.totals.collab, 0) ?? 0;
  const fallbackDays = data?.anchor_username
    ? data.days.filter((d) => d.anchor_source !== 'anchor_account').length
    : 0;
  const offDateCells =
    data?.accounts.reduce(
      (s, row) => s + Object.values(row.cells).filter((c) => c.posted_on_date).length,
      0
    ) ?? 0;
  const collabDays = Object.keys(collab)
    .map(Number)
    .sort((a, b) => b - a);

  return (
    <div className="mt-6 space-y-6">
      <p className="text-sm text-muted-foreground">
        One reel a day for 40 days, up to Founders Day on 18 November 2026. The tag counts the days left,
        so it fixes the date: #JKKN100Day40 is 9 October 2026, down to #JKKN100Day01 on 17 November. Each
        tracked account uploads its own copy within an hour, with that day&rsquo;s tag in the caption.
      </p>
      <p className="text-sm text-muted-foreground">
        The tag has to be in the caption <strong>when the reel is uploaded</strong>. We store the caption
        the first time we read a post, so a tag added afterwards is never seen.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="block text-xs font-medium text-muted-foreground">Anchor account</span>
          <select
            aria-label="Anchor account"
            value={anchor}
            onChange={(e) => setAnchor(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Earliest post of each day</option>
            {anchor && !usernames.includes(anchor) ? <option value={anchor}>@{anchor}</option> : null}
            {usernames.map((u) => (
              <option key={u} value={u}>
                @{u}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-xs font-medium text-muted-foreground">Posts since</span>
          <Input
            type="date"
            aria-label="Posts since"
            value={since}
            onChange={(e) => e.target.value && setSince(e.target.value)}
            className="h-9 w-40"
          />
        </label>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => data && downloadCsv(data)}
          disabled={!data || data.days.length === 0}
        >
          <Download className="mr-1.5 h-4 w-4" />
          Download CSV
        </Button>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4" data-panel="collab-editor">
        <div>
          <p className="text-sm font-medium text-foreground">Collab partners</p>
          <p className="text-xs text-muted-foreground">
            The pages in a day&rsquo;s collab are not expected to upload their own copy, so they read Collab
            for that day instead of No. Set them per day; the list rides in this page&rsquo;s link.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-sm">
            <span className="block text-xs font-medium text-muted-foreground">Day</span>
            <select
              aria-label="Collab day"
              value={editDay}
              onChange={(e) => pickDay(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Choose a day</option>
              {(data?.days ?? []).map((d) => (
                <option key={d.day} value={String(d.day)}>
                  Day {String(d.day).padStart(2, '0')} — {formatDayDate(d.date)}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[18rem] flex-1 space-y-1 text-sm">
            <span className="block text-xs font-medium text-muted-foreground">
              Partner accounts, separated by commas
            </span>
            <Input
              aria-label="Collab partner accounts"
              placeholder="jkkn_dental, jkkn_pharmacy"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="h-9"
            />
          </label>
          <Button variant="outline" size="sm" onClick={applyDay} disabled={!editDay}>
            Apply to this day
          </Button>
        </div>
        {collabProblems.length > 0 ? (
          <ul
            data-collab-problems
            className="list-inside list-disc text-xs text-amber-700 dark:text-amber-400"
          >
            {collabProblems.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
        {collabDays.length > 0 ? (
          <p className="text-xs text-muted-foreground" data-collab-summary>
            In the link:{' '}
            {collabDays
              .map((d) => `Day ${String(d).padStart(2, '0')} — ${(collab[d] ?? []).map((n) => '@' + n).join(', ')}`)
              .join(' · ')}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground" data-collab-summary>
            No collab partners set yet, so every account is expected to upload its own copy.
          </p>
        )}
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          {/* The space after a line-leading </strong> is dropped by the app's
              JSX transform, so it has to be written out. */}
          <strong>Collab</strong>{' '}is set by hand above, because a collab reel belongs to the account
          that authored it and never appears on the partner&rsquo;s own posts for us to read.{' '}
          <strong>Unknown</strong>{' '}means we cannot tell &mdash; a public-only account, a disconnected
          account, one with no reading method recorded, or one we have not read since the hour closed.
          Hover a cell for the reason.
        </AlertDescription>
      </Alert>

      {loading && !data ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Days so far" value={data.days.length} hint={`Tagged posts since ${data.since}`} />
            <Stat label="Accounts tracked" value={data.accounts.length} />
            <Stat
              label="Copies posted"
              value={totalYes}
              hint={`${totalWithinHour} on time (no later than 60 min after the anchor)`}
            />
            <Stat label="In a collab" value={totalCollab} hint="No own copy expected on these days" />
            <Stat label="Unknown" value={totalUnknown} hint="Cells we cannot confirm either way" />
          </div>

          {data.warnings.length > 0 ? (
            <Alert>
              <AlertDescription>
                <ul className="list-inside list-disc space-y-0.5 text-sm">
                  {data.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          {fallbackDays > 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              @{data.anchor_username} has no tagged post on {fallbackDays} day{fallbackDays === 1 ? '' : 's'}; those
              days are timed from the earliest post of the day instead, and say so in the column head.
            </p>
          ) : null}

          {offDateCells > 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {offDateCells} post{offDateCells === 1 ? '' : 's'} went out on a different date from the one its
              tag gives. They still count; the cell and the CSV carry the real date.
            </p>
          ) : null}

          {data.accounts.length === 0 ? (
            <div className="rounded-xl border border-border bg-background p-6 text-sm text-muted-foreground shadow-sm">
              No Instagram accounts are visible to your role. Ask an administrator for access to the
              institutions whose accounts you need to see.
            </div>
          ) : data.days.length === 0 ? (
            <div className="rounded-xl border border-border bg-background p-6 text-sm text-muted-foreground shadow-sm">
              No post carrying a #JKKN100Day tag since {data.since} yet. The board fills in as soon as the first
              tagged reel is read (accounts are read about every 15 minutes).
            </div>
          ) : (
            <Jkkn100Grid board={data} />
          )}
        </>
      ) : null}
    </div>
  );
}

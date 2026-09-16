'use client';

/**
 * What's New — MyJKKN's product changelog.
 *
 * Every entry is a real change shipped to production, in the words of the person
 * who shipped it, credited to them. The list is generated from git history by
 * scripts/generate-changelog.mjs, so it needs no writing and cannot go stale.
 *
 * Role scoping: the reader sees changes to the parts of MyJKKN they work in.
 * That is decided by `canSeeModule` against the same permission namespaces the
 * rest of the app uses — this screen invents no access rules of its own.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Wrench,
  Gauge,
  ShieldCheck,
  Search,
  ArrowRight,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useChangelog } from '@/lib/changelog/use-changelog';
import { HighlightsStrip } from '@/components/changelog/highlights-strip';
import { usePermissions } from '@/hooks/use-permissions';
import { KIND_LABEL, type ChangeKind, type ChangelogEntry } from '@/lib/changelog/types';
import { CATEGORY_BLURB, groupByCategory, type ChangeCategory } from '@/lib/changelog/categories';
import { formatEntryTime } from '@/lib/changelog/entry-time';
import { chooseEntryLink } from '@/lib/changelog/entry-link.mjs';
import { routeMatcher } from '@/lib/auth/route-matcher';
import { isPageAccessible } from '@/lib/navigation/permission-filter';

const PAGE = 60;

/**
 * May THIS reader open that path? The canonical answer, not a new one.
 *
 * Two existing pieces, composed exactly as RoutePermissionGuard composes them
 * (components/auth/route-permission-guard.tsx) and as the sidebar does:
 *
 *   1. routeMatcher.match(path)?.permission — the permission MENU_PERMISSIONS
 *      declares for that route, wildcard-aware so a [id] segment still matches.
 *   2. isPageAccessible(...)                — the access rule itself: admin
 *      bypass, the sentinel wall, the named per-route unions, then the key.
 *
 * WHY NOT THE MIDDLEWARE'S RULE. proxy.ts consults MENU_PERMISSIONS only for
 * CUSTOM primary roles; every built-in role (faculty, hod, principal, staff…)
 * is waved through every permission-mapped route and the PAGE refuses them
 * client-side. A route-level test alone would therefore answer "yes, they can
 * open it" for precisely the roles observed hitting the wall on production —
 * a faculty member on /admission/consultants/attribution-orphans. isPageAccessible
 * has no such role carve-out: it reads the key for everyone, which is why it is
 * the rule this page must ask.
 *
 * FAIL-OPEN ON AN UNMAPPED PATH IS THE CANONICAL BEHAVIOUR, not an oversight
 * here. A route with no MENU_PERMISSIONS entry is allowed by isPageAccessible,
 * by RoutePermissionGuard, and by the nav — "no permission field = visible to
 * all authenticated users". Making this one surface stricter than all three
 * would hide working links, which is the opposite complaint.
 *
 * IT DECIDES THE LINK, NEVER THE ACCESS. Nothing here grants anything: the
 * target page runs its own guard, and the data behind it runs RLS. The worst a
 * bug in this function can do is show or withhold a link.
 */
function readerCanOpen(
  path: string,
  permissions: Record<string, boolean>,
  isSuperAdmin: boolean,
  userRole: string
): boolean {
  return isPageAccessible(path, routeMatcher.match(path)?.permission, permissions, isSuperAdmin, userRole);
}

/** Contributor pills shown before the "+N more" button, below `sm`. */
const PHONE_CONTRIBUTORS = 5;

const KIND_STYLE: Record<ChangeKind, { icon: typeof Sparkles; chip: string }> = {
  new: {
    icon: Sparkles,
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/20',
  },
  fixed: {
    icon: Wrench,
    chip: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-400/20',
  },
  faster: {
    icon: Gauge,
    chip: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/20',
  },
  security: {
    icon: ShieldCheck,
    chip: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-400/20',
  },
};

function formatDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Whole days between a YYYY-MM-DD stamp and today, computed in UTC so it never
 * shifts by one at a timezone boundary.
 */
function daysSince(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const then = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((today - then) / 86_400_000));
}

/** "today" / "yesterday" / "N days ago" — a number alone reads as noise. */
function ageLabel(days: number) {
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** idle → starting → started | failed. There is no "done": see below. */
type RefreshPhase = 'idle' | 'starting' | 'started' | 'failed';

/**
 * "Check for new changes" — super admins only.
 *
 * It sits under the "Updated <date> · N days ago" line because that is the line
 * a reader uses to judge whether the page is current; the fix belongs next to
 * the complaint.
 *
 * WHAT IT HONESTLY CLAIMS. The button asks GitHub to run the job that rebuilds
 * the changelog (POST /api/whats-new/refresh) and returns as soon as GitHub has
 * QUEUED it — a minute or two before any new entry exists. So the success state
 * says the update is running, never that the page is up to date, and the page is
 * deliberately NOT re-fetched on success: re-fetching would redraw the same list
 * and read as "nothing new shipped", which would be a lie about the state of the
 * world rather than about the button.
 *
 * Its own component so that WhatsNewView keeps its existing hooks and early
 * returns untouched. usePermissions is a React Query hook and useChangelog
 * already calls it, so this second call is served from the same cache entry.
 */
function RefreshChangelogButton() {
  const { isSuperAdmin } = usePermissions();
  const [phase, setPhase] = useState<RefreshPhase>('idle');
  const [message, setMessage] = useState('');
  // A ref, not the phase: setPhase is async, so two activations inside one tick
  // (a double-click, or Enter held down) would both see phase === 'idle' and
  // both POST. The ref flips synchronously, so the second one returns.
  const inFlight = useRef(false);

  async function start() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase('starting');
    setMessage('');
    try {
      const res = await fetch('/api/whats-new/refresh', { method: 'POST' });
      const data: { ok?: boolean; message?: string; error?: string } | null = await res
        .json()
        .catch(() => null);
      if (res.ok && data?.ok) {
        setPhase('started');
        setMessage(
          data.message ??
            'Update started. It usually takes a minute or two — the newest changes appear once it finishes.'
        );
      } else {
        // The route explains every refusal in words (missing credential, not a
        // super admin, workflow not on main). Show that sentence, not a code.
        setPhase('failed');
        setMessage(data?.error ?? `The update could not be started (HTTP ${res.status}).`);
      }
    } catch {
      setPhase('failed');
      setMessage('The update could not be started — the request did not reach the server.');
    } finally {
      inFlight.current = false;
    }
  }

  // Hooks first, then the gate: everyone else sees no control at all. This is a
  // display rule on top of a server-side check — the route refuses a non-super
  // admin with a 403 that says why, whether or not this button was ever drawn.
  if (!isSuperAdmin) return null;

  const busy = phase === 'starting';

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={start}
        disabled={busy}
        aria-busy={busy}
        className="max-w-full"
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
        )}
        {busy ? 'Starting…' : 'Check for new changes'}
      </Button>
      {/* Always in the DOM, empty when idle: a live region inserted at the same
          moment its text arrives is not reliably announced. max-w-prose keeps
          the sentence readable; it wraps rather than widening at 375px. */}
      <p
        role="status"
        aria-live="polite"
        className={cn(
          'max-w-prose text-center text-xs',
          phase === 'failed' ? 'text-rose-700 dark:text-rose-400' : 'text-muted-foreground'
        )}
      >
        {message}
      </p>
    </div>
  );
}

export function WhatsNewView() {
  const {
    meta,
    entries,
    visibleModules,
    isLoading,
    error,
    hasArchive,
    loadingArchive,
    archiveError,
    loadArchive,
  } = useChangelog();

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ChangeKind | 'all'>('all');
  const [moduleSlug, setModuleSlug] = useState('all');
  /**
   * Null rather than an 'all' sentinel like the two above, because a
   * contributor's name is free text out of git — there is no value this filter
   * can reserve for "everyone" that a real person could not also be called.
   */
  const [author, setAuthor] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [allContributors, setAllContributors] = useState(false);

  /**
   * The reader's own "may I open that?" test, bound once per permission change.
   *
   * usePermissions is a React Query hook and useChangelog above already calls
   * it, so this is the same cache entry rather than a second fetch. The list
   * below is never rendered while permissions are still resolving — useChangelog
   * folds permsLoading into its own isLoading — so this cannot decide a link on
   * an empty permission map and then quietly change its mind.
   */
  const { permissions, isSuperAdmin, userProfile } = usePermissions();
  const canOpen = useMemo(() => {
    const role = userProfile?.role ?? '';
    return (path: string) => readerCanOpen(path, permissions, isSuperAdmin, role);
  }, [permissions, isSuperAdmin, userProfile?.role]);

  /**
   * A SEARCH MUST REACH THE WHOLE HISTORY, so typing one pulls the archive in.
   *
   * THE BUG THIS FIXES, measured against production on 2026-09-16. The page
   * paints the last 90 days — 2,538 of 5,079 entries — and the older 2,541 load
   * only when the reader clicks for them. `filtered` below has always filtered
   * whatever `entries` currently holds, so a search silently answered from half
   * the changelog: "Instagram" returned 7 of its 19 matches, with nothing on
   * screen to suggest the other 12 existed. A confident wrong answer is worse
   * than no search box, because the reader has no reason to doubt it.
   *
   * ONLY A TYPED SEARCH earns the extra ~320 KB. Not first paint, and not the
   * kind or area filters: those name a slice the reader is already looking at,
   * while a search is a question about everything.
   *
   * ONE LOAD PER SESSION, not one per keystroke. `wantsWholeHistory` is a
   * boolean, so it flips false→true on the first character and stays true for
   * the rest of the word: this effect runs once, not eight times. The 300 ms
   * wait is for the other case — a character typed and immediately deleted
   * flips it back, the cleanup cancels the timer, and nothing is fetched.
   * `hasArchive` goes false once the archive is in, which disarms this for
   * good; the hook's own in-flight latch covers the window in between.
   *
   * A FAILURE IS NOT RETRIED HERE. It leaves `hasArchive` true and every
   * dependency unchanged, so this effect does not re-run — no retry loop
   * against a failing route while the reader keeps typing. The notice below
   * says results may be incomplete and offers the retry as a deliberate tap.
   */
  const wantsWholeHistory = query.trim().length > 0;

  useEffect(() => {
    if (!wantsWholeHistory || !hasArchive) return;
    const t = setTimeout(loadArchive, 300);
    return () => clearTimeout(t);
  }, [wantsWholeHistory, hasArchive, loadArchive]);

  /**
   * Module labels, lower-cased once, for the search below.
   *
   * Per-entry rather than per-render work: `filtered` re-runs on every
   * keystroke over every loaded entry, and re-lower-casing 67 labels five
   * thousand times a character is work with a known answer.
   */
  const moduleLabels = useMemo(() => {
    const out = new Map<string, string>();
    if (meta) {
      for (const [slug, m] of Object.entries(meta.modules)) out.set(slug, m.label.toLowerCase());
    }
    return out;
  }, [meta]);

  const filtered = useMemo(() => {
    if (!entries) return [];
    const q = query.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (kind === 'all' || e.t === kind) &&
        (moduleSlug === 'all' || e.m === moduleSlug) &&
        // Exact, because the chips are built by tallying this same field —
        // picking a name can only ever select the rows that minted it.
        (!author || e.a === author) &&
        // The module's label is searched as well as the subject and the author,
        // because it is PRINTED ON EVERY ROW. "Social" sits above thirteen of
        // the Instagram changes; a reader who types the word they can see and
        // gets nothing has been told, wrongly, that there is nothing there.
        (!q ||
          e.s.toLowerCase().includes(q) ||
          e.a.toLowerCase().includes(q) ||
          (moduleLabels.get(e.m)?.includes(q) ?? false))
    );
  }, [entries, query, kind, moduleSlug, author, moduleLabels]);

  /**
   * One section per day, and within a day one group per Keep a Changelog
   * category, in that document's order (Director, 2026-09-12, citing
   * keepachangelog.com/en/1.1.0: a changelog is "for humans, not machines").
   *
   * Grouping happens AFTER the `shown` slice, deliberately. Grouping first and
   * slicing afterwards would make "Show more" reveal entries in the middle of
   * groups already on screen rather than at the end of the list, which reads as
   * the page reshuffling itself.
   *
   * The order entries arrive in is git's own, newest first; groupByCategory
   * preserves it inside each group, so only the grouping is new — nothing is
   * re-sorted.
   */
  const days = useMemo(() => {
    const out: { day: string; items: ChangelogEntry[] }[] = [];
    for (const e of filtered.slice(0, shown)) {
      const last = out[out.length - 1];
      if (last && last.day === e.d) last.items.push(e);
      else out.push({ day: e.d, items: [e] });
    }
    return out.map(({ day, items }) => ({
      day,
      groups: groupByCategory(items, (e) => e.t),
    }));
  }, [filtered, shown]);

  // Contributors, counted across what THIS reader can see — so the credits
  // match the list underneath them rather than a total they cannot verify.
  //
  // OVER `entries`, NOT `filtered`, AND THAT IS NOW LOAD-BEARING. Since the
  // names became a filter, a count that moved with the other filters would
  // promise a number and then show a different one. Tallying the unfiltered set
  // keeps the chip honest: pick a name on its own and you get exactly the rows
  // it advertises. It is also why an empty list with a name picked can only
  // mean the OTHER filters emptied it, which is what the empty card says.
  const contributors = useMemo(() => {
    if (!entries) return [];
    const tally = new Map<string, number>();
    for (const e of entries) tally.set(e.a, (tally.get(e.a) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const moduleOptions = useMemo(() => {
    if (!meta || !visibleModules) return [];
    return [...visibleModules]
      .map((slug) => ({ slug, label: meta.modules[slug]?.label ?? slug }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [meta, visibleModules]);

  if (error) {
    return (
      <Card>
        {/* The fetch resolves after mount, so this card appears dynamically —
            role="alert" is heard. text-amber-600 needs its dark counterpart. */}
        <CardContent className="flex items-start gap-3 py-6" role="alert">
          <AlertCircle
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
          <div>
            <p className="font-medium">{error}</p>
            <p className="text-sm text-muted-foreground">
              Nothing is wrong with your account — the changelog file did not load.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !meta) {
    return (
      <div className="space-y-4" aria-busy="true">
        <span className="sr-only" role="status">
          Loading changes…
        </span>
        <Skeleton className="h-24 w-full rounded-xl" />
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const activeModule = moduleSlug === 'all' ? null : meta.modules[moduleSlug];

  /**
   * What the search is doing about the older half, in one sentence or none.
   *
   * Only while a search is typed: the kind and area filters never reach for the
   * archive, so a notice about it under them would describe something that is
   * not happening. Null the rest of the time, which is also every state where
   * the answer on screen IS final.
   */
  const searchStillLoading = wantsWholeHistory && loadingArchive;

  const searchNotice = !wantsWholeHistory
    ? null
    : loadingArchive
      ? 'Still searching the earlier changes — more results may appear.'
      : archiveError
        ? 'Earlier changes could not be searched, so some results may be missing.'
        : null;

  return (
    <div className="space-y-6">
      {/* Summary — what this reader is looking at, and who built it. */}
      <Card className="overflow-hidden">
        <CardContent className="p-5 sm:p-6">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              {entries?.length.toLocaleString('en-IN')}
            </span>{' '}
            {entries?.length === 1 ? 'change' : 'changes'} to the{' '}
            <span className="font-semibold text-foreground">{visibleModules?.size}</span> parts of
            MyJKKN you work in
            {meta.first && <> · since {formatDay(meta.first)}</>}
          </p>

          {contributors.length > 0 && (
            /*
              Phones see the top few names, everything else sees all of them.
              Measured at 375px: 11 pills wrapped to 296px — most of the first
              screen was credits, before a single change. Five pills plus the
              "+N more" button is 144px. Nothing changes at sm and up, where
              the strip was always two rows.
            */
            <div
              className="mt-4 flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Filter by who built it"
            >
              <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Built by
              </span>
              {contributors.map(([name, count], i) => {
                const picked = author === name;
                return (
                  /*
                    A button, not the <span> it used to be: the credits were the
                    only list of people on the page and tapping one did nothing.

                    SAME GEOMETRY AS BEFORE — py-1 around a 20px avatar is 30px
                    tall, which is also what the kind toggles below measure, so
                    the row does not grow and the first change does not move
                    down the phone screen.

                    aria-pressed, like that toggle group, because this is one
                    value being switched on and off rather than navigation; a
                    screen reader then hears the state instead of inferring it
                    from the fill.
                  */
                  <button
                    key={name}
                    type="button"
                    aria-pressed={picked}
                    onClick={() => {
                      setAuthor(picked ? null : name);
                      setShown(PAGE);
                    }}
                    className={cn(
                      'max-w-full items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      picked
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-muted/40 hover:bg-muted',
                      i >= PHONE_CONTRIBUTORS && !allContributors
                        ? 'hidden sm:inline-flex'
                        : 'inline-flex'
                    )}
                    title={`${count.toLocaleString('en-IN')} changes`}
                  >
                    {/* Initials repeat the name that follows — decorative to AT.
                        Inverted when picked: bg-primary on a bg-primary chip is
                        the same colour twice and the circle vanishes. */}
                    <span
                      className={cn(
                        'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-bold',
                        picked
                          ? 'bg-primary-foreground text-primary'
                          : 'bg-primary text-primary-foreground'
                      )}
                      aria-hidden="true"
                    >
                      {initials(name)}
                    </span>
                    <span className="min-w-0 truncate font-medium">{name}</span>
                    {/* The bare number only reads as a count because of where it
                        sits. Say so for a screen reader. */}
                    {/* /90 AND NOT LOWER, MEASURED RATHER THAN EYEBALLED. The
                        count is dimmed so it stays secondary to the name, but
                        --primary is a dark green (150 78% 26%) in BOTH themes,
                        and white dimmed onto it runs out of contrast fast:
                        /70 = 3.64:1 and /80 = 4.26:1 both miss the 4.5:1 that
                        12px text needs, /90 = 4.94:1 clears it. Tailwind has no
                        /85 step, so /90 is the dimmest legal setting here. */}
                    <span
                      className={cn(
                        'shrink-0 tabular-nums',
                        picked ? 'text-primary-foreground/90' : 'text-muted-foreground'
                      )}
                      aria-hidden="true"
                    >
                      {count}
                    </span>
                    {/*
                      THIS SPACE IS LOAD-BEARING, AND IT HAS TO SIT OUT HERE.

                      A <span> has no accessible name, so the chip these used to
                      be was read out part by part. A button's name is its
                      contents JOINED, and inline parts join with nothing
                      between them, so the name computed as "Boobalan2 changes"
                      and was announced as one word.

                      A space inside the sr-only span does not fix it — each
                      part is trimmed before it is joined. Only a text node that
                      is a direct child of the button survives. Both behaviours
                      measured against dom-accessibility-api, which is what
                      Testing Library resolves names through and what Chrome
                      does here too.

                      It costs nothing on screen: a whitespace-only text node in
                      a flex container is not rendered as a flex item.
                    */}{' '}
                    <span className="sr-only">
                      {count.toLocaleString('en-IN')} {count === 1 ? 'change' : 'changes'}
                    </span>
                  </button>
                );
              })}
              {contributors.length > PHONE_CONTRIBUTORS && !allContributors && (
                <button
                  type="button"
                  onClick={() => setAllContributors(true)}
                  className="rounded-full border border-dashed px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
                >
                  +{contributors.length - PHONE_CONTRIBUTORS} more
                  <span className="sr-only"> contributors</span>
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/*
        This week's highlights, above the plain list and above the filters.

        Above the LIST because the list answers "what changed" and this answers
        "what it means for me and what I can now do" — the two questions the
        Director asked for on 2026-09-12. Above the FILTERS because the filters
        below govern the plain list only; a strip sitting under them would read
        as filtered when it is not.

        It renders NOTHING at all when no highlight has been approved for this
        week, while it is loading, and if its fetch fails — no heading, no empty
        box. So the page below is exactly the page that ships today until
        somebody approves a write-up. Passing meta.modules rather than letting
        it fetch its own labels keeps one module dictionary on the page.
      */}
      <HighlightsStrip modules={meta.modules} />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Search changes…"
            className="pl-9"
            aria-label="Search changes"
          />
        </div>
        <Select
          value={moduleSlug}
          onValueChange={(v) => {
            setModuleSlug(v);
            setShown(PAGE);
          }}
        >
          <SelectTrigger className="sm:w-56" aria-label="Filter by area">
            <SelectValue placeholder="All areas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All areas</SelectItem>
            {moduleOptions.map((m) => (
              <SelectItem key={m.slug} value={m.slug}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Five toggles over one value — a group of aria-pressed buttons, so a
          screen reader hears which one is on rather than inferring it from the
          green fill. py-1.5 puts the tap target at 30px: over the 24px WCAG
          2.5.8 floor, still under Apple's 44px comfort size. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by kind of change">
        {(['all', 'new', 'fixed', 'faster', 'security'] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              setShown(PAGE);
            }}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              kind === k
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted'
            )}
          >
            {k === 'all' ? 'Everything' : KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {/* The same rule as every row link below: offered only if this reader can
          actually open it. A module the reader may read NEWS about is not
          automatically a module whose landing page their role opens — Billing
          news reaches anyone holding any `billing.*` key, while /billing itself
          carries its own MENU_PERMISSIONS entry. */}
      {activeModule?.href && canOpen(activeModule.href) && (
        <Link
          href={activeModule.href}
          className="inline-flex items-center gap-1.5 rounded-sm py-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Open {activeModule.label}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}

      {/*
        A LIST THAT IS STILL GROWING HAS TO SAY SO.

        The load above takes a second or two, and for that second the reader is
        looking at a list that is about to get longer. Letting it grow in
        silence would be the same lie the half-searched list was — an answer
        that turns out not to have been the answer — so the page says plainly
        that it is not finished, and says plainly when it could not finish.

        IT TALKS ABOUT RESULTS, NOT A COUNT, because the count is not on screen:
        the running total lives only in the screen-reader region below. An
        earlier draft read "this count will grow", which names something a
        sighted reader cannot see.

        VISIBLE HERE, ANNOUNCED BELOW. This element is conditional, and a live
        region inserted at the moment its text arrives is not reliably read out
        (the same finding as the refresh button's status line). So the words are
        also written into the always-mounted region underneath, and this copy is
        aria-hidden so nobody hears it twice. The retry lives where it already
        lived — the button at the foot of the list, which renders throughout a
        search and reads "Try again" once the archive has failed.
      */}
      {searchNotice && (
        <p
          aria-hidden="true"
          className={cn(
            'flex items-start gap-2 text-sm',
            archiveError ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground'
          )}
        >
          {loadingArchive ? (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{searchNotice}</span>
        </p>
      )}

      {/* Filtering swaps the list out with nothing said. Announce the new
          count, politely, so a screen-reader user knows the search took. */}
      <p className="sr-only" role="status" aria-live="polite">
        {searchNotice ? `${searchNotice} ` : ''}
        {filtered.length.toLocaleString('en-IN')}{' '}
        {filtered.length === 1 ? 'change' : 'changes'} shown
      </p>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            {/*
              "NO CHANGES MATCH THAT" IS A VERDICT, and mid-load it is the wrong
              one — this is the defect at its sharpest. A reader searching a word
              that appears only in the older half sees an empty list before the
              archive lands; telling them nothing matched, while the line above
              says more results may appear, is the page contradicting itself and
              sending them away just before the answer arrives.
            */}
            <p className="font-medium">
              {searchStillLoading
                ? 'Still looking…'
                : meta.total === 0
                  ? 'The changelog has not been built yet'
                  : 'No changes match that'}
            </p>
            {/* An empty table and an over-narrow filter look identical to a reader,
                and blaming their search for a list that was simply never synced sends
                them hunting for a mistake they did not make. The first deploy after
                the move to the database hits this for real, until the sync runs. */}
            {/* A name picked can never empty the list on its own — the chip is
                minted by tallying these same entries, so it always has at least
                the changes it advertises. An empty list with a name picked
                therefore means the OTHER filters emptied it, and saying only
                "try a different area" would send the reader past the filter
                that is actually in the way. */}
            <p className="mt-1 text-sm text-muted-foreground">
              {searchStillLoading
                ? 'Nothing in the last 90 days matches. The earlier changes are still loading.'
                : meta.total === 0
                ? 'No changes have been loaded yet. This fills in the first time the changelog syncs.'
                : author
                  ? `${author} has changes, but none that also match the other filters. Select their name again to see everyone.`
                  : 'Try a different area, or clear the search.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        /*
          max-lg:pr-14 IS THE PHONE-OVERLAP FIX FOR THE TEXT, and it is spatial
          for the same reason the link's `basis-full` wrapper below is: three
          floating controls stack `fixed right-4`, 48px wide, on every
          authenticated page, so the column owns x ∈ [329, 377] on a 393px
          screen for the bottom ~316px of it, at every scroll offset. Moving the
          link (#3761) cleared the one CONTROL on the row; the words did not
          move. A card here spans the full content width (px-4 → [16, 377]) and
          pads by 12px, so a title that wraps runs to x = 364 — 35px inside the
          column. Verified live on production 2026-09-15 as a super admin: the
          share button sat on top of "…uses to" at the end of a title
          (.screenshots/wn2-superadmin-phone-link.png).

          56px of right padding on this wrapper ends the cards at x = 321 and
          their text at x = 308: 21px clear of the column, and the card border
          itself stops 8px short of the buttons rather than touching them.

          ON THE WRAPPER, NOT THE CARD, for a cascade reason: the card's
          `sm:p-4` is a padding SHORTHAND that Tailwind emits AFTER every
          `max-lg:` utility, so a `max-lg:pr-14` on the <li> would be silently
          overwritten between 640px and 1023px and read as working on a phone
          only. Measured with the project's own Tailwind 3.4 CLI.

          max-lg rather than max-sm because the column has the same geometry at
          every width below `lg` (bottom-nav-safe-* slots): at 640–1023px the
          page's px-8 still leaves the text 16px under the buttons. From `lg`
          the sidebar takes the left 288px and the stack drops to the corner
          (`lg:bottom-4/20/36`), which is the same trade every page makes.
        */
        <div className="space-y-8 max-lg:pr-14">
          {days.map(({ day, groups }) => (
            <section key={day}>
              {/*
                top-14, not top-0: the app's Navbar is `sticky top-0 z-30` over
                an h-14 (56px) bar, so a date header parked at top-0 stops
                underneath it and is never seen. Verified against
                components/Navbar/Navbar.tsx and admin-panel-layout.tsx's
                min-h-[calc(100vh-56px)]. z-10 keeps it below the navbar, which
                is what we want — it should slide under, not over.
              */}
              <h2 className="sticky top-14 z-10 -mx-1 bg-background/95 px-1 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                {formatDay(day)}
              </h2>
              {groups.map(({ category, label, items }) => (
                <div key={category} className="mt-3 first:mt-1">
                  {/*
                    NOT sticky. Only one thing on this page may pin itself under
                    the navbar; a second sticky heading would stack on top of the
                    date and eat the first row of every group on a phone.
                  */}
                  <h3 className="flex flex-wrap items-baseline gap-x-2 px-1 text-sm font-semibold text-foreground">
                    {label}
                    <span className="text-xs font-normal text-muted-foreground">
                      {CATEGORY_BLURB[category as ChangeCategory]}
                    </span>
                  </h3>
                  <ul className="mt-1 space-y-2">
                    {items.map((e) => {
                      const style = KIND_STYLE[e.t];
                      const Icon = style.icon;
                      const mod = meta.modules[e.m];
                      /*
                        WHERE THIS CHANGE HAPPENED — the whole point of the row
                        being clickable at all.

                        Until this existed the page rendered exactly ONE link,
                        the module's href above the timeline, and only once the
                        reader had already filtered to that module. Scrolling
                        the list, nothing was clickable: a row said "colleges
                        genuinely over the limit will now correctly show as red
                        or amber" and left the reader to go and find it
                        (Director, 2026-09-13).

                        Three states, in order, and the third is a real one:
                          • `e.l` — the screen the commit actually changed,
                            derived from its page files. ~26% of entries.
                          • the module's own href — honest for a change that
                            touched a migration, a service or a shared
                            component, which is ~70% of them.
                          • nothing. `platform` and `cohort-programmes` have no
                            href, so those ~4% render no link rather than a dead
                            `#`. An anchor that goes nowhere is worse than plain
                            text: it takes focus, it takes a tap, and it teaches
                            the reader that the links on this page do not work.

                        The two are worded differently on purpose — "Open this
                        page" means we know the exact screen, "Open Billing"
                        means we know the area. A reader can tell which promise
                        is being made before spending a tap on it.

                        EACH CANDIDATE IS TESTED AGAINST THIS READER before it
                        is offered — chooseEntryLink + canOpen, above. The
                        previous version checked nothing, on the reasoning that
                        fn_changelog_visible_modules() had already narrowed the
                        rows to modules the reader can reach. That reasoning is
                        true and insufficient: module visibility is decided by
                        permission NAMESPACE, while `e.l` is derived from the
                        files a commit touched, and a commit filed under one
                        module routinely edits a screen gated by another
                        module's key. Observed on production 2026-09-14 — a
                        learner and a holder of the `faculty` role both followed
                        a link from here into an access-denied card. The
                        Director's ruling of 2026-09-13 (edge case 3) is that
                        such a link is HIDDEN for them: no dead ends. So an
                        unreachable exact screen falls back to the module, an
                        unreachable module falls back to nothing, and the
                        fallback is re-tested rather than assumed.
                      */
                      const link = chooseEntryLink(e.l, mod?.href, mod?.label ?? '', canOpen);
                      // Read in Asia/Kolkata, the same clock `e.d` was written in,
                      // so the time on the row and the date above it are two
                      // readings of one instant and cannot name different days.
                      const time = formatEntryTime(e.at);
                      return (
                        <li
                          key={e.h}
                          className="rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40 sm:p-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset',
                                style.chip
                              )}
                            >
                              <Icon className="h-3 w-3" aria-hidden="true" />
                              {KIND_LABEL[e.t]}
                            </span>
                            {mod && (
                              <span className="min-w-0 break-words text-xs font-medium text-muted-foreground">
                                {mod.label}
                              </span>
                            )}
                            {e.b === 1 && (
                              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                                Breaking
                              </span>
                            )}
                          </div>
                          {/* Measured at 375px: today's longest token (57 chars,
                              a route glob) wraps on its own — slashes and commas
                              are break opportunities. A snake_case identifier is
                              not: a 49-char `fn_…` name overflowed the card by
                              17px, and main's overflow-x-clip would have cut it
                              off silently. Real subjects carry such names up to
                              36 chars today, so this is a near miss, not a
                              hypothetical. */}
                          <p className="mt-1.5 break-words text-sm leading-relaxed text-foreground">
                            {e.s}
                          </p>
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            {/* The time of day, under the header that names the
                                day. Absent on every row the sync has not re-read
                                since the timestamp column was added, in which case
                                the date header alone stands — which is exactly what
                                this page showed before. */}
                            {time && (
                              <time dateTime={e.at} className="shrink-0 tabular-nums">
                                <span className="sr-only">shipped at </span>
                                {time}
                              </time>
                            )}
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <span
                                className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-muted text-[8px] font-bold text-foreground/70"
                                aria-hidden="true"
                              >
                                {initials(e.a)}
                              </span>
                              <span className="break-words font-medium text-foreground/80">{e.a}</span>
                            </span>
                            {e.p && (
                              <span className="font-mono">
                                <span className="sr-only">pull request </span>#{e.p}
                              </span>
                            )}
                            {link && (
                              /*
                                Last in the metadata trail and styled like it —
                                this is a list people scan, and sixty buttons
                                would be sixty things competing with the words
                                that say what changed. It wraps to its own line
                                on a phone, which is where the tap target wants
                                to be anyway.

                                The sr-only subject is not decoration: sixty
                                links all named "Open this page" are
                                indistinguishable in a screen reader's link
                                list. Naming each one after its own change makes
                                the list navigable.

                                THE `basis-full` WRAPPER IS THE PHONE-OVERLAP
                                FIX, and it is spatial rather than cosmetic.
                                Three floating controls stack at `right-4` on
                                every authenticated page — the bug reporter
                                (bottom-nav-safe-2), the Director handover
                                (-safe-3) and the work pulse (-safe-4), 48px
                                each — so the column owns x ∈ [329, 377] on a
                                393px screen for the bottom ~316px of it. Left
                                to flow at the END of this metadata line, the
                                link packed at the right edge whenever the time,
                                the contributor's name and the PR number left
                                room: measured at 393px with the project's own
                                compiled Tailwind, a row credited to "Boobalan
                                Subramanian" put the link at x ∈ [278, 353] —
                                24px inside the column, with the buttons sitting
                                on top of the one control the row exists to
                                offer. The wrapper puts it on its own line at
                                x ∈ [29, 104]: clear of the column at EVERY
                                scroll offset, which bottom padding cannot
                                promise, since a fixed element crosses every row
                                of a scrolling list.

                                WHY A WRAPPER RATHER THAN `basis-full` ON THE
                                ANCHOR. Both break the line, but flex-basis is a
                                SIZE: on the anchor it stretched the link's box
                                to the full card width (measured x ∈ [29, 364]),
                                pushing its right end back under the buttons —
                                an invisible tap target that the FABs win anyway.
                                `max-w-fit` shrinks the box but then no longer
                                forces the break. A wrapper separates the two
                                jobs: the span takes the line, the anchor keeps
                                its 75px. `sm:basis-auto` restores the inline
                                layout above the breakpoint, where no floating
                                column overlaps the content.
                              */
                              <span className="basis-full sm:basis-auto">
                                <Link
                                  href={link.href}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  {link.label}
                                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                                  <span className="sr-only">: {e.s}</span>
                                </Link>
                              </span>
                            )}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      {/* pb-nav-safe below lg: the mobile BottomNav is `fixed bottom-0` over a
          76px strip plus the iOS home-indicator inset, and ContentLayout's pb-8
          (32px) is not enough to clear it — the last row of a list this long sits
          permanently underneath. The `nav-safe` token is the repository's own
          measurement of that strip (tailwind.config.ts); lg:pb-4 restores the
          original spacing above the breakpoint, where the nav does not exist. */}
      <div className="flex flex-col items-center gap-3 pb-nav-safe lg:pb-4">
        {shown < filtered.length && (
          <Button
            variant="outline"
            className="max-w-full"
            onClick={() => setShown((s) => s + PAGE)}
          >
            Show more ({(filtered.length - shown).toLocaleString('en-IN')} left)
          </Button>
        )}
        {shown >= filtered.length && hasArchive && (
          <>
            {/* Reported HERE, beside the control that failed, rather than as the
                whole page. Everything above this line loaded and is still
                usable; only the older entries are missing. role="alert" because
                it appears after a click, and text-amber-600 needs its dark
                counterpart to stay legible in both themes. */}
            {archiveError && (
              <p
                role="alert"
                className="flex items-start gap-2 text-center text-sm text-amber-600 dark:text-amber-500"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{archiveError} The changes above are unaffected.</span>
              </p>
            )}
            <Button
              variant="outline"
              className="h-auto max-w-full whitespace-normal py-2 text-center"
              onClick={loadArchive}
              disabled={loadingArchive}
              aria-busy={loadingArchive}
            >
              {loadingArchive && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {archiveError
                ? 'Try again'
                : `Show changes before ${formatDay(meta.recentFrom)}`}
            </Button>
          </>
        )}
        {/* The age is shown ALWAYS, not only when it is bad (Director, 2026-09-06).
            The list can stop moving while still looking perfectly healthy, and a
            plain date gives a reader no way to tell. Past a week we say so outright
            rather than leaving them to do the arithmetic.

            `generatedAt` is empty until the first sync has ever run — the route
            falls back to '' when changelog_sync holds no row. Rendering that
            unguarded produced "Updated Invalid Date · NaN days ago", which is how
            the very first deploy after the move to the database would have looked. */}
        {meta.generatedAt ? (
          <p className="text-center text-xs text-muted-foreground">
            Updated {formatDay(meta.generatedAt)} ·{' '}
            <span
              className={cn(
                daysSince(meta.generatedAt) >= 7 && 'font-medium text-amber-700 dark:text-amber-400'
              )}
            >
              {ageLabel(daysSince(meta.generatedAt))}
            </span>
            {daysSince(meta.generatedAt) >= 7 && (
              <> — newer changes have shipped but are not shown here yet.</>
            )}
          </p>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            Never updated — the changelog has not synced yet.
          </p>
        )}
        {/* Directly under the age line: that line is where a reader decides the
            page is stale, so the one control that can do something about it
            belongs there. Renders for super admins only. */}
        <RefreshChangelogButton />
        <p className="text-center text-xs text-muted-foreground">
          Changes you cannot see belong to parts of MyJKKN you do not have access to.
        </p>
      </div>
    </div>
  );
}

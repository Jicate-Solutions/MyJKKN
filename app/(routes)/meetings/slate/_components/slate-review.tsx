'use client';

// app/(routes)/meetings/slate/_components/slate-review.tsx
//
// "Review the proposed month" — piece 4a of the Monthly Slate spec.
//
// READ ONLY by design. The only write on this screen is Generate/Regenerate,
// which proposes a DRAFT and books nothing. Approve, Reschedule, Drop and
// Try-again are piece 4b and deliberately absent — a half-built Approve button
// is worse than no Approve button.
//
// THE RULE THAT SHAPED THIS SCREEN
// "A silently missing meeting is the worst failure this system can have."
// So the warnings are a PERMANENT banner pinned above the month, never a toast:
// a toast is gone in four seconds and an EAO who blinked would approve a month
// with a meeting quietly missing from it. The banner also carries a standing
// "still needs a time" list that does not go away until every meeting has one.
//
// FOUR VIEWS, because the EAO reads the month four different ways (Director's
// decision, all four required): by college, by date, by series, and as a
// calendar grid. The choice is remembered in localStorage only — it is a
// per-person display preference, not data anyone else needs.

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CalendarRange,
  Grid3x3,
  Loader2,
  Repeat,
  RefreshCw,
  Video,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { generateSlate, type SlateContext } from '../actions';
import type { SlateItem, StoredSlate } from '@/lib/services/meetings/monthly-slate-service';

const CAMPUS_TZ = 'Asia/Kolkata';
const VIEW_STORAGE_KEY = 'meetings.slate.view';

type ViewMode = 'college' | 'date' | 'series' | 'calendar';

const VIEWS: ReadonlyArray<{ key: ViewMode; label: string; icon: typeof Building2 }> = [
  { key: 'college', label: 'By college', icon: Building2 },
  { key: 'date', label: 'By date', icon: CalendarDays },
  { key: 'series', label: 'By series', icon: Repeat },
  { key: 'calendar', label: 'Calendar', icon: Grid3x3 },
];

// ── Formatting (campus time throughout — a meeting is at a campus clock time) ─

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CAMPUS_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function fmtDateLong(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CAMPUS_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
}

/** "YYYY-MM-DD" in campus time — the key every by-date grouping uses. */
function campusDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CAMPUS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'long' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

function fmtGeneratedAt(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CAMPUS_TZ,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

// ── Small presentational pieces ──────────────────────────────────────────────

function SectionCard({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="text-xs text-muted-foreground">
            {count} {count === 1 ? 'meeting' : 'meetings'}
          </span>
        </div>
        <div className="space-y-1.5">{children}</div>
      </CardContent>
    </Card>
  );
}

function MeetingRow({
  item,
  institutionName,
  showDate = true,
  showSeries = true,
  showCollege = true,
}: {
  item: SlateItem;
  institutionName: string;
  showDate?: boolean;
  showSeries?: boolean;
  showCollege?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 text-sm">
      {showDate && item.startsAt ? (
        <span className="font-medium tabular-nums">{fmtDateLong(item.startsAt)}</span>
      ) : null}
      {item.startsAt ? (
        <span className="tabular-nums text-muted-foreground">
          {fmtTime(item.startsAt)}
          {item.endsAt ? `–${fmtTime(item.endsAt)}` : ''}
        </span>
      ) : null}
      {showSeries ? <span className="min-w-0 truncate">{item.seriesName}</span> : null}
      {showCollege ? (
        <span className="min-w-0 truncate text-muted-foreground">{institutionName}</span>
      ) : null}
      {item.mode === 'online' ? (
        <Badge variant="outline" className="gap-1 text-amber-700 dark:text-amber-400">
          <Video className="h-3 w-3" aria-hidden />
          Online
        </Badge>
      ) : null}
    </div>
  );
}

// ── The screen ───────────────────────────────────────────────────────────────

export function SlateReview({ initial }: { initial: SlateContext }) {
  const [month, setMonth] = useState(initial.month);
  const [slate, setSlate] = useState<StoredSlate | null>(initial.slate);
  const [view, setView] = useState<ViewMode>('college');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // A display preference, remembered per browser. Wrapped because storage
  // throws in a private window and a crashed read must not take the page down.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved && VIEWS.some((v) => v.key === saved)) setView(saved as ViewMode);
    } catch {
      /* no stored preference is a perfectly normal state */
    }
  }, []);

  const chooseView = useCallback((next: ViewMode) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* the view still changed; only the memory of it is lost */
    }
  }, []);

  const institutionName = useCallback(
    (id: string | null) => {
      if (!id) return 'Every college';
      return initial.institutions.find((i) => i.id === id)?.name ?? 'Unknown college';
    },
    [initial.institutions],
  );

  const onGenerate = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await generateSlate(month);
      if (result.success) {
        setSlate(result.data ?? null);
      } else {
        setError(result.error ?? 'Could not propose the month.');
      }
    });
  }, [month]);

  const items = slate?.items ?? [];
  const placed = useMemo(
    () => items.filter((i) => i.startsAt && i.status !== 'unplaceable'),
    [items],
  );
  const unplaceable = useMemo(() => items.filter((i) => i.status === 'unplaceable'), [items]);
  const online = useMemo(() => placed.filter((i) => i.mode === 'online'), [placed]);

  // ── Empty states, in the order a real EAO hits them ───────────────────────

  if (initial.activeSeriesCount === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Repeat className="h-8 w-8 text-muted-foreground/50" aria-hidden />
          <h3 className="text-sm font-medium">There are no recurring series yet</h3>
          <p className="max-w-md text-xs text-muted-foreground">
            A month is proposed from the meetings that repeat — IQAC, the reviews, the
            weekly series. None are configured yet, so there is nothing to lay out.
            Add them once on Recurring Series and this screen will have a month to
            propose.
          </p>
          <Link href="/meetings/series" className="mt-2 inline-flex">
            <Button size="sm">
              <Repeat className="mr-1.5 h-4 w-4" aria-hidden />
              Set up recurring series
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Month picker + generate. Stacks at 400px. */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-end sm:justify-between sm:p-4">
          <div className="min-w-0 space-y-1">
            <label htmlFor="slate-month" className="text-xs font-medium text-muted-foreground">
              Month to review
            </label>
            <Input
              id="slate-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full sm:w-48"
            />
            {slate ? (
              <p className="text-[11px] text-muted-foreground">
                Proposed {fmtGeneratedAt(slate.generatedAt)}
                {slate.status === 'approved' ? ' · approved' : ' · draft'}
              </p>
            ) : null}
          </div>
          <Button onClick={onGenerate} disabled={pending} className="w-full sm:w-auto">
            {pending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
            )}
            {slate ? 'Propose again' : 'Propose this month'}
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-2 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
            <p className="min-w-0 text-red-600 dark:text-red-400">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      {!slate ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CalendarRange className="h-8 w-8 text-muted-foreground/50" aria-hidden />
            <h3 className="text-sm font-medium">
              {monthLabel(month)} has not been proposed yet
            </h3>
            <p className="max-w-md text-xs text-muted-foreground">
              Press &ldquo;Propose this month&rdquo; and every configured series will be
              laid against the real availability of everyone required. Nothing is
              booked and nobody is invited — it is a draft you can regenerate as often
              as you like.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <WarningBanner
            unplaceable={unplaceable}
            online={online}
            institutionName={institutionName}
          />

          {/* View switcher. Wraps rather than scrolls at 400px. */}
          <nav aria-label="How to read the month" className="flex flex-wrap gap-1">
            {VIEWS.map((v) => {
              const Icon = v.icon;
              const isActive = v.key === view;
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => chooseView(v.key)}
                  aria-pressed={isActive}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                    isActive
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {v.label}
                </button>
              );
            })}
          </nav>

          {placed.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <AlertTriangle className="h-8 w-8 text-amber-600 dark:text-amber-400" aria-hidden />
                <h3 className="text-sm font-medium">
                  Not one meeting could be placed in {monthLabel(month)}
                </h3>
                <p className="max-w-md text-xs text-muted-foreground">
                  Every meeting is listed in the warnings above with the reason it could
                  not be placed. This usually means nobody&apos;s working hours are
                  recorded yet, or the whole month is blocked.
                </p>
              </CardContent>
            </Card>
          ) : view === 'college' ? (
            <ByCollege items={placed} institutionName={institutionName} />
          ) : view === 'date' ? (
            <ByDate items={placed} institutionName={institutionName} />
          ) : view === 'series' ? (
            <BySeries items={placed} institutionName={institutionName} />
          ) : (
            <CalendarGrid month={month} items={placed} institutionName={institutionName} />
          )}
        </>
      )}
    </div>
  );
}

// ── The permanent banner ─────────────────────────────────────────────────────

/**
 * Pinned above the month, always rendered once a slate exists — including when
 * everything is fine, which is the only way "nothing is wrong" is a statement
 * the EAO can trust rather than an absence they have to interpret.
 */
function WarningBanner({
  unplaceable,
  online,
  institutionName,
}: {
  unplaceable: SlateItem[];
  online: SlateItem[];
  institutionName: (id: string | null) => string;
}) {
  const clean = unplaceable.length === 0 && online.length === 0;

  if (clean) {
    return (
      <Card className="border-green-600/30">
        <CardContent className="flex items-start gap-2 p-3 text-sm sm:p-4">
          <CalendarRange className="mt-0.5 h-4 w-4 shrink-0 text-green-700 dark:text-emerald-400" aria-hidden />
          <p className="min-w-0 text-green-700 dark:text-emerald-400">
            Every meeting in this month has a time, and every one is in person.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(unplaceable.length > 0 ? 'border-red-600/40' : 'border-amber-600/40')}>
      <CardContent className="space-y-3 p-3 sm:p-4">
        {unplaceable.length > 0 ? (
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              {unplaceable.length}{' '}
              {unplaceable.length === 1 ? 'meeting has' : 'meetings have'} no time in this
              month
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              These are not missing — they are listed here so nothing is lost. They stay
              on this list until each one has a time.
            </p>
            <ul className="mt-2 space-y-1.5">
              {unplaceable.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md border border-red-600/30 bg-red-50/60 px-2.5 py-2 text-xs dark:bg-red-950/20"
                >
                  <p className="font-medium">
                    {item.seriesName}
                    <span className="font-normal text-muted-foreground">
                      {' · '}
                      {institutionName(item.institutionId)}
                      {item.occurrence > 1 ? ` · meeting ${item.occurrence}` : ''}
                    </span>
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    {item.unplaceableDetail ?? 'No reason was recorded.'}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {online.length > 0 ? (
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400">
              <Video className="h-4 w-4 shrink-0" aria-hidden />
              {online.length} {online.length === 1 ? 'meeting was' : 'meetings were'}
              {' '}flipped to online
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              A week someone is away turns a meeting online rather than losing it.
              Confirm each of these is meant to be online.
            </p>
            <ul className="mt-2 space-y-1.5">
              {online.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md border border-amber-600/30 bg-amber-50/60 px-2.5 py-2 text-xs dark:bg-amber-950/20"
                >
                  <p className="font-medium">
                    {item.seriesName}
                    <span className="font-normal text-muted-foreground">
                      {' · '}
                      {institutionName(item.institutionId)}
                      {item.startsAt ? ` · ${fmtDateLong(item.startsAt)} ${fmtTime(item.startsAt)}` : ''}
                    </span>
                  </p>
                  {item.onlineBecause ? (
                    <p className="mt-0.5 text-muted-foreground">{item.onlineBecause}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── The four views ───────────────────────────────────────────────────────────

type ViewProps = {
  items: SlateItem[];
  institutionName: (id: string | null) => string;
};

function groupBy(items: SlateItem[], key: (i: SlateItem) => string): Array<[string, SlateItem[]]> {
  const map = new Map<string, SlateItem[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return [...map.entries()];
}

function byStart(a: SlateItem, b: SlateItem): number {
  return (a.startsAt ?? '').localeCompare(b.startsAt ?? '');
}

function ByCollege({ items, institutionName }: ViewProps) {
  const groups = useMemo(
    () =>
      groupBy(items, (i) => i.institutionId ?? 'none')
        .map(([id, list]) => [institutionName(id === 'none' ? null : id), [...list].sort(byStart)] as const)
        .sort((a, b) => a[0].localeCompare(b[0])),
    [items, institutionName],
  );

  return (
    <div className="space-y-3">
      {groups.map(([name, list]) => (
        <SectionCard key={name} title={name} count={list.length}>
          {list.map((item) => (
            <MeetingRow
              key={item.id}
              item={item}
              institutionName={name}
              showCollege={false}
            />
          ))}
        </SectionCard>
      ))}
    </div>
  );
}

function ByDate({ items, institutionName }: ViewProps) {
  const groups = useMemo(
    () =>
      groupBy(items, (i) => (i.startsAt ? campusDate(i.startsAt) : 'none'))
        .map(([date, list]) => [date, [...list].sort(byStart)] as const)
        .sort((a, b) => a[0].localeCompare(b[0])),
    [items],
  );

  return (
    <div className="space-y-3">
      {groups.map(([date, list]) => (
        <SectionCard
          key={date}
          title={list[0].startsAt ? fmtDateLong(list[0].startsAt) : date}
          count={list.length}
        >
          {list.map((item) => (
            <MeetingRow
              key={item.id}
              item={item}
              institutionName={institutionName(item.institutionId)}
              showDate={false}
            />
          ))}
        </SectionCard>
      ))}
    </div>
  );
}

function BySeries({ items, institutionName }: ViewProps) {
  const groups = useMemo(
    () =>
      groupBy(items, (i) => i.seriesName)
        .map(([name, list]) => [name, [...list].sort(byStart)] as const)
        .sort((a, b) => a[0].localeCompare(b[0])),
    [items],
  );

  return (
    <div className="space-y-3">
      {groups.map(([name, list]) => (
        <SectionCard key={name} title={name} count={list.length}>
          {list.map((item) => (
            <MeetingRow
              key={item.id}
              item={item}
              institutionName={institutionName(item.institutionId)}
              showSeries={false}
            />
          ))}
        </SectionCard>
      ))}
    </div>
  );
}

/**
 * The month as a grid.
 *
 * Weeks start on Monday, which is how a campus week is read here. At 400px the
 * seven columns stay — a calendar that reflows to one column is a list, and the
 * whole point of this view is the shape of the month — so the cells get small
 * and the grid scrolls sideways inside its own container rather than pushing the
 * page wide.
 */
function CalendarGrid({
  month,
  items,
  institutionName,
}: ViewProps & { month: string }) {
  const [year, monthNum] = month.split('-').map(Number);
  const byDate = useMemo(
    () =>
      new Map(
        groupBy(items, (i) => (i.startsAt ? campusDate(i.startsAt) : 'none')).map(
          ([date, list]) => [date, [...list].sort(byStart)] as const,
        ),
      ),
    [items],
  );

  const first = new Date(Date.UTC(year, monthNum - 1, 1));
  const daysInThisMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  // getUTCDay(): 0 = Sunday. Shift so Monday is column 0.
  const leadingBlanks = (first.getUTCDay() + 6) % 7;

  const cells: Array<{ date: string | null; day: number | null }> = [];
  for (let i = 0; i < leadingBlanks; i += 1) cells.push({ date: null, day: null });
  for (let d = 1; d <= daysInThisMonth; d += 1) {
    cells.push({
      date: `${month}-${String(d).padStart(2, '0')}`,
      day: d,
    });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, day: null });

  return (
    <Card>
      <CardContent className="p-2 sm:p-4">
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="grid grid-cols-7 gap-1 pb-1">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div key={d} className="px-1 text-[11px] font-medium text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, idx) => {
                const dayItems = cell.date ? (byDate.get(cell.date) ?? []) : [];
                return (
                  <div
                    key={cell.date ?? `blank-${idx}`}
                    className={cn(
                      'min-h-[74px] rounded-md border p-1',
                      cell.date ? 'border-border bg-muted/20' : 'border-transparent',
                    )}
                  >
                    {cell.day ? (
                      <div className="text-[11px] font-medium tabular-nums text-muted-foreground">
                        {cell.day}
                      </div>
                    ) : null}
                    <div className="mt-0.5 space-y-0.5">
                      {dayItems.map((item) => (
                        <div
                          key={item.id}
                          title={`${item.seriesName} · ${institutionName(item.institutionId)}`}
                          className={cn(
                            'truncate rounded px-1 py-0.5 text-[10px] leading-tight',
                            item.mode === 'online'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                              : 'bg-primary/10 text-primary',
                          )}
                        >
                          {item.startsAt ? `${fmtTime(item.startsAt)} ` : ''}
                          {item.seriesName}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

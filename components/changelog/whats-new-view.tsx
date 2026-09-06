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

import { useMemo, useState } from 'react';
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
import { KIND_LABEL, type ChangeKind, type ChangelogEntry } from '@/lib/changelog/types';

const PAGE = 60;

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

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
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
    loadArchive,
  } = useChangelog();

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ChangeKind | 'all'>('all');
  const [moduleSlug, setModuleSlug] = useState('all');
  const [shown, setShown] = useState(PAGE);

  const filtered = useMemo(() => {
    if (!entries) return [];
    const q = query.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (kind === 'all' || e.t === kind) &&
        (moduleSlug === 'all' || e.m === moduleSlug) &&
        (!q || e.s.toLowerCase().includes(q) || e.a.toLowerCase().includes(q))
    );
  }, [entries, query, kind, moduleSlug]);

  const days = useMemo(() => {
    const out: { day: string; items: ChangelogEntry[] }[] = [];
    for (const e of filtered.slice(0, shown)) {
      const last = out[out.length - 1];
      if (last && last.day === e.d) last.items.push(e);
      else out.push({ day: e.d, items: [e] });
    }
    return out;
  }, [filtered, shown]);

  // Contributors, counted across what THIS reader can see — so the credits
  // match the list underneath them rather than a total they cannot verify.
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
        <CardContent className="flex items-start gap-3 py-6">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
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
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const activeModule = moduleSlug === 'all' ? null : meta.modules[moduleSlug];

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
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Built by
              </span>
              {contributors.map(([name, count]) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-1 pr-2.5 text-xs"
                  title={`${count.toLocaleString('en-IN')} changes`}
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                    {initials(name)}
                  </span>
                  <span className="font-medium">{name}</span>
                  <span className="tabular-nums text-muted-foreground">{count}</span>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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

      <div className="flex flex-wrap gap-2">
        {(['all', 'new', 'fixed', 'faster', 'security'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setShown(PAGE);
            }}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              kind === k
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted'
            )}
          >
            {k === 'all' ? 'Everything' : KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {activeModule?.href && (
        <Link
          href={activeModule.href}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Open {activeModule.label}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}

      {/* Timeline */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium">No changes match that</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different area, or clear the search.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {days.map(({ day, items }) => (
            <section key={day}>
              <h2 className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                {formatDay(day)}
              </h2>
              <ul className="mt-1 space-y-2">
                {items.map((e) => {
                  const style = KIND_STYLE[e.t];
                  const Icon = style.icon;
                  const mod = meta.modules[e.m];
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
                          <Icon className="h-3 w-3" />
                          {KIND_LABEL[e.t]}
                        </span>
                        {mod && (
                          <span className="text-xs font-medium text-muted-foreground">
                            {mod.label}
                          </span>
                        )}
                        {e.b === 1 && (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                            Breaking
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-foreground">{e.s}</p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="grid h-4 w-4 place-items-center rounded-full bg-muted text-[8px] font-bold text-muted-foreground">
                            {initials(e.a)}
                          </span>
                          <span className="font-medium text-foreground/80">{e.a}</span>
                        </span>
                        {e.p && <span className="font-mono">#{e.p}</span>}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="flex flex-col items-center gap-3 pb-4">
        {shown < filtered.length && (
          <Button variant="outline" onClick={() => setShown((s) => s + PAGE)}>
            Show more ({(filtered.length - shown).toLocaleString('en-IN')} left)
          </Button>
        )}
        {shown >= filtered.length && hasArchive && (
          <Button variant="outline" onClick={loadArchive} disabled={loadingArchive}>
            {loadingArchive && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Show changes before {formatDay(meta.recentFrom)}
          </Button>
        )}
        <p className="text-center text-xs text-muted-foreground">
          Updated {formatDay(meta.generatedAt)}. Changes you cannot see belong to parts of MyJKKN
          you do not have access to.
        </p>
      </div>
    </div>
  );
}

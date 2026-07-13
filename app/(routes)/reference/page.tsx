'use client';

// app/(routes)/reference/page.tsx
// Reference / Masters hub — every master-data catalog on one page with live
// counts (Smile Care model). Cards are registry-driven (reference_catalogs):
// generic  → browse + inline add/edit here
// linked   → count card linking to the module's own editor
// readonly → browse only
//
// Built for scale (~100 catalogs): a sticky index rail (live search + group
// jump pills + mode filter) keeps any catalog two keystrokes away. "/" focuses
// the search from anywhere on the page.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { BookOpenText, ExternalLink, Pencil, Plus, Search, X } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { cn } from '@/lib/utils';
import {
  ReferenceCatalogService,
  type ReferenceCatalogCard,
  type ReferenceEditorMode,
} from '@/lib/services/reference/reference-catalog-service';

type ModeFilter = 'all' | ReferenceEditorMode;

const MODE_META: Record<
  ReferenceEditorMode,
  { chip: string; icon: typeof Pencil }
> = {
  generic: { chip: 'Edit here', icon: Pencil },
  readonly: { chip: 'Browse', icon: BookOpenText },
  linked: { chip: 'In module', icon: ExternalLink },
};

function groupAnchor(groupName: string): string {
  return 'grp-' + groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function CatalogCard({ card }: { card: ReferenceCatalogCard }) {
  const mode = MODE_META[card.editor_mode];
  const ModeIcon = mode.icon;
  const browseHref =
    card.editor_mode === 'linked'
      ? (card.external_route ?? '#')
      : `/reference/${card.catalog_key}`;

  return (
    <Card className="group relative h-full transition-shadow hover:shadow-md hover:border-primary/40">
      <Link href={browseHref} className="block">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-tight">{card.display_name}</p>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <ModeIcon className="h-3 w-3" />
              {mode.chip}
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums leading-none">
            {card.total_count === null ? '—' : card.total_count.toLocaleString()}
          </p>
          <p className="mt-1 min-h-4 text-xs text-muted-foreground">
            {card.total_count !== null &&
            card.active_count !== null &&
            card.active_count < card.total_count
              ? `${card.active_count.toLocaleString()} active`
              : ' '}
          </p>
        </CardContent>
      </Link>
      {card.editor_mode === 'generic' && (
        <div className="border-t px-2 py-1.5">
          <Button asChild variant="ghost" size="sm" className="h-7 w-full justify-start text-xs">
            <Link href={`/reference/${card.catalog_key}?new=1`}>
              <Plus className="mr-1 h-3 w-3" />
              Add entry
            </Link>
          </Button>
        </div>
      )}
    </Card>
  );
}

export default function ReferenceHubPage() {
  const [cards, setCards] = useState<ReferenceCatalogCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    ReferenceCatalogService.getCards()
      .then((data) => {
        if (!cancelled) setCards(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // "/" focuses search from anywhere on the page
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return cards.filter((c) => {
      if (modeFilter !== 'all' && c.editor_mode !== modeFilter) return false;
      if (!q) return true;
      return (
        c.display_name.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q) ||
        c.group_name.toLowerCase().includes(q)
      );
    });
  }, [cards, filter, modeFilter]);

  const groups = useMemo(() => {
    const map = new Map<string, ReferenceCatalogCard[]>();
    for (const card of visible) {
      const list = map.get(card.group_name) ?? [];
      list.push(card);
      map.set(card.group_name, list);
    }
    return Array.from(map.entries());
  }, [visible]);

  const totalEntries = useMemo(
    () => cards.reduce((sum, c) => sum + (c.total_count ?? 0), 0),
    [cards]
  );
  const groupCount = new Set(cards.map((c) => c.group_name)).size;
  const filtering = filter.trim() !== '' || modeFilter !== 'all';

  return (
    <PermissionGuard module="reference.catalogs" action="view">
      <ContentLayout title="Reference / Masters">
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Master-data catalogs that drive forms and workflows across MyJKKN.
            </p>
            {!loading && (
              <p className="text-xs tabular-nums text-muted-foreground">
                {cards.length} catalogs · {groupCount} groups ·{' '}
                {totalEntries.toLocaleString()} entries
              </p>
            )}
          </div>

          {/* Index rail: search + mode filter + group jump pills */}
          <div className="sticky top-16 z-10 -mx-1 space-y-2 rounded-lg border bg-background/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-56 flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  placeholder="Find a catalog…  (press / to search)"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="pl-8 pr-8"
                />
                {filter && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setFilter('')}
                    className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1" role="group" aria-label="Filter by edit mode">
                {(
                  [
                    ['all', 'All'],
                    ['generic', 'Edit here'],
                    ['readonly', 'Browse'],
                    ['linked', 'In module'],
                  ] as [ModeFilter, string][]
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    variant={modeFilter === value ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8"
                    onClick={() => setModeFilter(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            {groups.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {groups.map(([groupName, groupCards]) => (
                  <button
                    key={groupName}
                    type="button"
                    onClick={() =>
                      document
                        .getElementById(groupAnchor(groupName))
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                      'text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground'
                    )}
                  >
                    {groupName}
                    <span className="rounded-full bg-muted px-1.5 tabular-nums">
                      {groupCards.length}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {loadError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {loadError}
            </div>
          )}

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              No catalogs match{filter ? ` “${filter.trim()}”` : ' this filter'}.
              <Button
                variant="link"
                size="sm"
                className="ml-1 h-auto p-0"
                onClick={() => {
                  setFilter('');
                  setModeFilter('all');
                }}
              >
                Clear filters to see all {cards.length}.
              </Button>
            </div>
          ) : (
            groups.map(([groupName, groupCards]) => (
              <section
                key={groupName}
                id={groupAnchor(groupName)}
                className="scroll-mt-40 space-y-3"
              >
                <div className="flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {groupName}
                  </h2>
                  <span className="text-xs tabular-nums text-muted-foreground/70">
                    {groupCards.length}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {groupCards.map((card) => (
                    <CatalogCard key={card.catalog_key} card={card} />
                  ))}
                </div>
              </section>
            ))
          )}

          {filtering && groups.length > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              Showing {visible.length} of {cards.length} catalogs
            </p>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

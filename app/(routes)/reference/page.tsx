'use client';

// app/(routes)/reference/page.tsx
// Reference / Masters hub — every master-data catalog on one page with live
// counts (Smile Care model). Cards are registry-driven (reference_catalogs):
// generic  → browse + inline add/edit here
// linked   → count card linking to the module's own editor
// readonly → browse only

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ExternalLink, Plus, Search } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  ReferenceCatalogService,
  type ReferenceCatalogCard,
} from '@/lib/services/reference/reference-catalog-service';

function CatalogCard({ card }: { card: ReferenceCatalogCard }) {
  const browseHref =
    card.editor_mode === 'linked'
      ? (card.external_route ?? '#')
      : `/reference/${card.catalog_key}`;

  return (
    <div className="flex flex-col gap-2">
      <Link href={browseHref} className="block group">
        <Card className="h-full transition-shadow group-hover:shadow-md group-hover:border-primary/40">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-muted-foreground">{card.display_name}</p>
              {card.editor_mode === 'linked' ? (
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              )}
            </div>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              {card.total_count === null ? '—' : card.total_count.toLocaleString()}
            </p>
            <div className="mt-1 flex items-center gap-2 min-h-5">
              {card.total_count !== null &&
                card.active_count !== null &&
                card.active_count < card.total_count && (
                  <span className="text-xs text-muted-foreground">
                    {card.active_count.toLocaleString()} active
                  </span>
                )}
              {card.editor_mode === 'readonly' && (
                <Badge variant="outline" className="text-[10px]">
                  Read-only
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>
      {card.editor_mode === 'generic' && (
        <Button asChild variant="outline" size="sm" className="w-fit">
          <Link href={`/reference/${card.catalog_key}?new=1`}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add entry
          </Link>
        </Button>
      )}
    </div>
  );
}

export default function ReferenceHubPage() {
  const [cards, setCards] = useState<ReferenceCatalogCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

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

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const visible = q
      ? cards.filter(
          (c) =>
            c.display_name.toLowerCase().includes(q) ||
            (c.description ?? '').toLowerCase().includes(q) ||
            c.group_name.toLowerCase().includes(q)
        )
      : cards;
    const map = new Map<string, ReferenceCatalogCard[]>();
    for (const card of visible) {
      const list = map.get(card.group_name) ?? [];
      list.push(card);
      map.set(card.group_name, list);
    }
    return Array.from(map.entries());
  }, [cards, filter]);

  return (
    <PermissionGuard module="reference.catalogs" action="view">
      <ContentLayout title="Reference / Masters">
        <div className="space-y-6">
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            Master-data catalogs that drive forms and workflows across MyJKKN.
            Pick a catalog to browse its entries. Simple catalogs can be edited
            right here; catalogs marked with an outward arrow are managed in
            their own module.
          </div>

          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter catalogs…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-8"
            />
          </div>

          {loadError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {loadError}
            </div>
          )}

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : (
            groups.map(([groupName, groupCards]) => (
              <section key={groupName} className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {groupName}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {groupCards.map((card) => (
                    <CatalogCard key={card.catalog_key} card={card} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

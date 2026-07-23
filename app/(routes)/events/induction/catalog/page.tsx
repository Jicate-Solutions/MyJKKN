'use client';

// Induction Session Catalog — the curated cross-college "best sessions" library.
// Coordinators planning a new induction browse every session topic the group's
// colleges have run, ranked by fresher value rating (where a live run was captured
// via the no-smartphone feedback) then by cross-college adoption. Seeded from 6
// historical programmes (2024-25) in 20260630220000_induction_session_catalog.sql;
// scores fill in automatically as future inductions run with feedback.
//
// Reachable from the /events/induction landing ("Session catalog" button); the route
// is allowlisted in scripts/check-nav-reachability.ts as a link-from-parent page.
import { useEffect, useMemo, useState, useCallback } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { InductionService, type InductionTopicCatalogEntry } from '@/lib/services/induction/induction-service';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Library, Search, Star, Building2, ArrowUpDown, AlertTriangle, Loader2 } from 'lucide-react';

type SortMode = 'rated' | 'adopted';

// A score only drives the "Top rated" sort once it has this many ratings (matches
// the RPC's server-side confidence floor) — a 1-vote 5.0 shouldn't top a 202-vote 4.1.
const MIN_CONFIDENT_RATINGS = 5;

export default function InductionCatalogPage() {
  const [all, setAll] = useState<InductionTopicCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('rated');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAll(await InductionService.getTopicCatalog());
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // theme chips with counts (derived from the full set)
  const themes = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of all) m.set(t.theme, (m.get(t.theme) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [all]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = all.filter(
      (t) =>
        (!theme || t.theme === theme) &&
        (!q || t.canonical_title.toLowerCase().includes(q) || t.theme.toLowerCase().includes(q))
    );
    rows = [...rows].sort((a, b) => {
      if (sort === 'adopted') {
        if (b.adoption !== a.adoption) return b.adoption - a.adoption;
        return (b.value_score ?? -1) - (a.value_score ?? -1);
      }
      // 'rated': confident score (>= MIN_CONFIDENT_RATINGS) desc, then adoption. A
      // thin-sample score doesn't drive the sort — mirrors the RPC's server-side floor.
      const conf = (t: InductionTopicCatalogEntry) =>
        t.value_score != null && t.score_responses >= MIN_CONFIDENT_RATINGS ? t.value_score : -1;
      const av = conf(a), bv = conf(b);
      if (bv !== av) return bv - av;
      return b.adoption - a.adoption;
    });
    return rows;
  }, [all, theme, search, sort]);

  const ratedCount = all.filter((t) => t.value_score != null).length;

  return (
    <ContentLayout title="Session Catalog">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Induction', href: '/events/induction' },
          { label: 'Session Catalog' },
        ]}
      />

      <div className="space-y-5 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1 flex items-center gap-2">
            <Library className="h-6 w-6 text-primary" /> Induction Session Catalog
          </h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Every induction session topic your colleges have run, in one place. Reuse what works —
            ranked by fresher value rating where a live run was captured, then by how many colleges
            have adopted it. {all.length} topics · {ratedCount} rated so far.
          </p>
        </div>

        {/* search + sort */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search topics…"
              className="pl-8"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSort((s) => (s === 'rated' ? 'adopted' : 'rated'))}
          >
            <ArrowUpDown className="h-4 w-4 mr-1.5" />
            {sort === 'rated' ? 'Top rated' : 'Most adopted'}
          </Button>
        </div>

        {/* theme chips */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={theme === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTheme(null)}
          >
            All <span className="ml-1.5 opacity-70">{all.length}</span>
          </Button>
          {themes.map(([t, n]) => (
            <Button
              key={t}
              variant={theme === t ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme((cur) => (cur === t ? null : t))}
            >
              {t} <span className="ml-1.5 opacity-70">{n}</span>
            </Button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading catalog…
          </p>
        ) : error ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" /> Couldn&apos;t load the catalog
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button size="sm" variant="outline" onClick={load}>Retry</Button>
            </CardContent>
          </Card>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">No topics match.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((t) => (
              <Card key={t.topic_id} className="h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm leading-snug">{t.canonical_title}</CardTitle>
                    {t.value_score == null ? (
                      <Badge className="shrink-0" variant="secondary">not yet rated</Badge>
                    ) : t.score_responses >= MIN_CONFIDENT_RATINGS ? (
                      <Badge className="shrink-0 gap-1" variant="default">
                        <Star className="h-3 w-3 fill-current" />
                        {Number(t.value_score).toFixed(1)}
                      </Badge>
                    ) : (
                      <Badge
                        className="shrink-0 gap-1"
                        variant="outline"
                        title="Early signal — fewer than 5 ratings"
                      >
                        <Star className="h-3 w-3" />
                        {Number(t.value_score).toFixed(1)} <span className="opacity-70">early</span>
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  <Badge variant="outline" className="text-[11px] font-normal">{t.theme}</Badge>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    {t.adoption} college{t.adoption === 1 ? '' : 's'}
                    {t.colleges?.length ? ` · ${t.colleges.join(', ')}` : ''}
                    {t.years ? ` · ${t.years}` : ''}
                  </div>
                  {t.value_score != null && (
                    <p className="text-[11px] text-muted-foreground">
                      {t.score_responses} fresher{t.score_responses === 1 ? '' : 's'} rated across {t.runs_rated} run
                      {t.runs_rated === 1 ? '' : 's'}
                    </p>
                  )}
                  {t.needs_review && (
                    <p className="text-[11px] text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> needs review
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}

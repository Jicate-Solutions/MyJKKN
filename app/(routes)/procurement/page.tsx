'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertBox } from '@/components/ui/alert-box';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { InstitutionFilter } from '@/components/procurement/institution-filter';
import { usePermissions } from '@/hooks/use-permissions';
import { useProcurementOverviewCounts } from '@/hooks/procurement/use-overview-counts';
import { CircleAlert, Plus, ChevronRight } from 'lucide-react';

/**
 * Procurement is a strict chain: a request must precede an RFQ, which must precede
 * a purchase order, which must precede a goods receipt. Each status bar below is one
 * gate in that chain; its number is how many documents sit there, split by college.
 *
 * The page lists no documents itself. Clicking a bar opens the tab that holds those
 * documents, already filtered to that status and college (`listHref` + ?institution=).
 * `permission` is the key that opens the gate, so "Needs you" only shows on bars the
 * viewer can act on (null = Super Admin only).
 */
const GATES: ReadonlyArray<{
  gate: number;
  name: string;
  waiting: string;
  permission: string | null;
  listHref: string;
}> = [
  {
    gate: 1,
    name: 'Request approval',
    waiting: 'requests awaiting approval',
    permission: 'request_approve',
    listHref: '/procurement/requests?status=submitted',
  },
  {
    gate: 2,
    name: 'Quotations',
    waiting: 'approved, ready for quotations',
    permission: 'rfq_manage',
    listHref: '/procurement/requests?status=approved',
  },
  {
    gate: 3,
    name: 'Super Admin approval',
    waiting: 'vendor choice to approve',
    permission: null,
    listHref: '/procurement/rfqs?status=pending_award_approval',
  },
  {
    gate: 4,
    name: 'Purchase orders',
    waiting: 'awaiting delivery',
    permission: 'grn_create',
    listHref: '/procurement/purchase-orders?status=approved',
  },
  {
    gate: 5,
    name: 'Goods received',
    waiting: 'awaiting verification',
    permission: 'grn_verify',
    listHref: '/procurement/grn?status=pending_verification',
  },
];

type View = 'pending' | 'updated' | 'recent';
const VIEWS: ReadonlyArray<{ value: View; label: string; explain: string }> = [
  { value: 'pending', label: 'Pending', explain: 'Documents waiting at each step right now.' },
  { value: 'updated', label: 'Updated', explain: 'Documents that reached each step in the last 7 days.' },
  { value: 'recent', label: 'Recent', explain: 'Documents raised in the last 7 days, by the step they are at now.' },
];

// One colour per college, assigned by name so a college keeps its colour across views.
const COLLEGE_COLOURS = [
  'bg-emerald-600',
  'bg-sky-600',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-indigo-500',
  'bg-lime-600',
  'bg-orange-500',
  'bg-fuchsia-500',
];

export default function ProcurementHome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canAccess, isSuperAdmin } = usePermissions();
  const { data: rows = [], isLoading, isError } = useProcurementOverviewCounts(7);

  // Filters live in the address so Back and shared links keep them.
  const college = searchParams.get('institution') ?? 'all';
  const viewParam = searchParams.get('view');
  const view: View = viewParam === 'updated' || viewParam === 'recent' ? viewParam : 'pending';
  const setParam = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `/procurement?${qs}` : '/procurement', { scroll: false });
  };

  const canCreateRequest = isSuperAdmin || canAccess('procurement', 'request_create');

  const colleges = useMemo(() => {
    const byId = new Map<string, string>();
    for (const r of rows) byId.set(r.institution_id, r.institution_name);
    return [...byId.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name], i) => ({ id, name, colour: COLLEGE_COLOURS[i % COLLEGE_COLOURS.length] }));
  }, [rows]);

  const bars = useMemo(() => {
    const visible = rows.filter((r) => college === 'all' || r.institution_id === college);
    const built = GATES.map((g) => {
      const parts = colleges
        .map((c) => ({
          ...c,
          count: visible
            .filter((r) => r.gate === g.gate && r.institution_id === c.id)
            .reduce((sum, r) => sum + r[view], 0),
        }))
        .filter((p) => p.count > 0);
      return {
        ...g,
        parts,
        total: parts.reduce((sum, p) => sum + p.count, 0),
        mine: isSuperAdmin || (g.permission !== null && canAccess('procurement', g.permission)),
      };
    });
    const max = Math.max(1, ...built.map((b) => b.total));
    return { built, max };
  }, [rows, colleges, college, view, isSuperAdmin, canAccess]);

  const legend = colleges.filter((c) => bars.built.some((b) => b.parts.some((p) => p.id === c.id)));
  const explain = VIEWS.find((v) => v.value === view)?.explain;

  return (
    <ContentLayout title="Procurement">
      <div className="space-y-4">
        {isError && (
          <AlertBox type="error" message="The status counts could not be loaded. Refresh the page to try again." />
        )}

        <Card>
          <CardContent className="space-y-5 p-4 sm:p-6">
            {/* ── Filters ─────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-end gap-4">
              <InstitutionFilter
                className="w-full space-y-1 sm:w-[280px] [&_label]:text-xs [&_label]:text-muted-foreground"
                label="College"
                allLabel="All colleges"
                value={college}
                onChange={(id) => setParam('institution', id, 'all')}
              />
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Show</p>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={view}
                  onValueChange={(v) => v && setParam('view', v, 'pending')}
                  aria-label="Which documents to count"
                >
                  {VIEWS.map((v) => (
                    <ToggleGroupItem key={v.value} value={v.value} className="px-4">
                      {v.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              {/* No page heading above: the breadcrumb and tab bar already say "Procurement". */}
              {canCreateRequest && (
                <Button
                  className="ml-auto"
                  onClick={() =>
                    router.push(
                      college !== 'all'
                        ? `/procurement/requests/new?institution=${college}`
                        : '/procurement/requests/new'
                    )
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New request
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{explain}</p>

            {/* ── Status bars ─────────────────────────────────────────── */}
            <div className="space-y-2">
              {bars.built.map((bar) => {
                const needsYou = view === 'pending' && bar.mine && bar.total > 0;
                const href = `${bar.listHref}&institution=${college}`;
                return (
                  <button
                    key={bar.gate}
                    type="button"
                    onClick={() => router.push(href)}
                    aria-label={`${bar.name}: ${bar.total}. Open the list.`}
                    className="grid w-full grid-cols-[28px_1fr_48px_16px] items-center gap-x-3 gap-y-2 rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[28px_minmax(170px,230px)_56px_1fr_16px] sm:gap-x-4"
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background text-xs font-semibold tabular-nums text-muted-foreground">
                      {bar.gate}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-tight">{bar.name}</span>
                      <span className="block text-xs text-muted-foreground">{bar.waiting}</span>
                      {needsYou && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                          <CircleAlert className="h-3 w-3" />
                          Needs you
                        </span>
                      )}
                    </span>
                    <span
                      className={`text-right text-3xl font-semibold tabular-nums ${
                        isLoading ? 'text-muted-foreground/40' : needsYou ? 'text-amber-600 dark:text-amber-400' : ''
                      }`}
                    >
                      {isLoading ? '—' : bar.total}
                    </span>
                    <span className="col-span-2 col-start-2 row-start-2 flex h-3 overflow-hidden rounded bg-muted sm:col-span-1 sm:col-start-auto sm:row-start-auto">
                      {bar.parts.map((p) => (
                        <span
                          key={p.id}
                          title={`${p.name}: ${p.count}`}
                          className={`h-full border-l-2 border-background first:border-l-0 ${p.colour}`}
                          style={{ width: `${(p.count / bars.max) * 100}%` }}
                        />
                      ))}
                    </span>
                    <ChevronRight className="col-start-4 row-start-1 h-4 w-4 text-muted-foreground sm:col-start-auto sm:row-start-auto" aria-hidden />
                  </button>
                );
              })}
            </div>

            {legend.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {legend.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1.5">
                    <span className={`h-2.5 w-2.5 rounded-sm ${c.colour}`} aria-hidden />
                    {c.name}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

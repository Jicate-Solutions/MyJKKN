'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { AlertBox } from '@/components/ui/alert-box';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { InstitutionFilter } from '@/components/procurement/institution-filter';
import { usePermissions } from '@/hooks/use-permissions';
import { useProcurementOverviewCounts } from '@/hooks/procurement/use-overview-counts';
import { Plus, ChevronRight } from 'lucide-react';

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
    name: 'Item approval',
    waiting: 'requests awaiting item approval',
    permission: 'request_approve',
    listHref: '/procurement/requests?stage=submitted',
  },
  {
    gate: 2,
    name: 'Quotes',
    waiting: 'approved, collecting quotes',
    permission: 'rfq_manage',
    listHref: '/procurement/requests?stage=getting_quotes',
  },
  {
    gate: 3,
    name: 'Final approval',
    waiting: 'vendor choice for the Super Admin',
    permission: null,
    listHref: '/procurement/requests?stage=with_super_admin',
  },
  {
    gate: 4,
    name: 'Ordered',
    waiting: 'awaiting delivery',
    permission: 'grn_create',
    listHref: '/procurement/requests?stage=ordered',
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

  const needsYou = view === 'pending' ? bars.built.filter((b) => b.mine && b.total > 0) : [];

  return (
    <ContentLayout title="Procurement">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        {isError && (
          <AlertBox type="error" message="The status counts could not be loaded. Refresh the page to try again." />
        )}

        {/* ── Title, college, New request ─────────────────────────────── */}
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Procurement</h1>
            <p className="text-sm text-muted-foreground">What is waiting at each step, and what needs you.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <InstitutionFilter
              className="w-full sm:w-60 [&_button]:h-10"
              label={null}
              allLabel="All colleges"
              value={college}
              onChange={(id) => setParam('institution', id, 'all')}
            />
            {canCreateRequest && (
              <Button
                className="h-10"
                onClick={() =>
                  router.push(
                    college !== 'all' ? `/procurement/requests/new?institution=${college}` : '/procurement/requests/new'
                  )
                }
              >
                <Plus className="mr-1.5 h-4 w-4" />
                New request
              </Button>
            )}
          </div>
        </header>

        {/* ── Needs you: only the steps this person acts on, as big tappable cards ── */}
        {needsYou.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Needs you</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {needsYou.map((bar) => (
                <button
                  key={bar.gate}
                  type="button"
                  onClick={() => router.push(`${bar.listHref}&institution=${college}`)}
                  className="flex flex-col items-start gap-0.5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-left transition-colors hover:border-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-amber-800 dark:bg-amber-950/40"
                >
                  <span className="text-3xl font-bold tabular-nums">{bar.total}</span>
                  <span className="font-semibold">{bar.name}</span>
                  <span className="text-xs text-muted-foreground">{bar.waiting}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Every step: one row each, the bar split by college ─────────── */}
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
            <h2 className="text-base font-semibold">Where purchases are</h2>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={view}
              onValueChange={(v) => v && setParam('view', v, 'pending')}
              aria-label="Which purchases to count"
            >
              {VIEWS.map((v) => (
                <ToggleGroupItem key={v.value} value={v.value} className="px-3 text-xs">
                  {v.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <ul>
            {bars.built.map((bar) => (
              <li key={bar.gate} className="border-b last:border-b-0">
                <button
                  type="button"
                  onClick={() => router.push(`${bar.listHref}&institution=${college}`)}
                  aria-label={`${bar.name}: ${bar.total}. Open the list.`}
                  className="grid w-full grid-cols-[minmax(0,1fr)_48px_16px] items-center gap-x-4 gap-y-1.5 px-5 py-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[180px_minmax(0,1fr)_48px_16px]"
                >
                  <span className="text-sm font-semibold">{bar.name}</span>
                  <span className="col-span-3 row-start-2 flex h-2.5 overflow-hidden rounded-full bg-muted sm:col-span-1 sm:row-start-auto">
                    {bar.parts.map((p) => (
                      <span
                        key={p.id}
                        title={`${p.name}: ${p.count}`}
                        className={`h-full border-l-2 border-background first:border-l-0 ${p.colour}`}
                        style={{ width: `${(p.count / bars.max) * 100}%` }}
                      />
                    ))}
                  </span>
                  <span className={`text-right text-lg font-bold tabular-nums ${isLoading ? 'text-muted-foreground/40' : ''}`}>
                    {isLoading ? '—' : bar.total}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t px-5 py-3 text-xs text-muted-foreground">
            <span>{explain}</span>
            {legend.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${c.colour}`} aria-hidden />
                {c.name}
              </span>
            ))}
          </div>
        </section>
      </div>
    </ContentLayout>
  );
}

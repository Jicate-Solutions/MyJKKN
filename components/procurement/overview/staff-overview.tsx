'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { useProcurementOverviewCounts } from '@/hooks/procurement/use-overview-counts';
import {
  useProcurementOverviewWaiting,
  daysSince,
  type ProcurementWaitingRow,
} from '@/hooks/procurement/use-overview-waiting';
import { displayRequestNumber } from '@/lib/procurement/display-number';
import { AlertBox } from '@/components/ui/alert-box';
import { ResponsiveList } from '@/components/procurement/responsive-list';
import { BeatLoader } from 'react-spinners';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * The staff Overview (Super Admin, approvers, store): where every purchase is, what
 * waits for this person, and what is held up.
 *
 * Numbers per step come from procurement_overview_counts (Pending / Updated / Recent);
 * the rows behind them — and so "oldest N days", the "Needs you" queue and the held-up
 * list — from procurement_overview_waiting. Age = days since the purchase reached its
 * current step, not since it was raised.
 */

const GATES: ReadonlyArray<{
  gate: number;
  name: string;
  who: string;
  /** Who acts at this step; null = Super Admin only. */
  permissions: string[] | null;
  action: string;
  listHref: string;
}> = [
  { gate: 1, name: 'Item approval', who: 'Approver checks the items', permissions: ['request_approve'], action: 'Review items', listHref: '/procurement/requests?stage=submitted' },
  { gate: 2, name: 'Quotes', who: 'Store collects vendor quotes', permissions: ['rfq_manage', 'quotation_manage'], action: 'Add quotes', listHref: '/procurement/requests?stage=getting_quotes' },
  { gate: 3, name: 'Final approval', who: 'Super Admin approves vendor & price', permissions: null, action: 'Review & approve', listHref: '/procurement/requests?stage=with_super_admin' },
  { gate: 4, name: 'Ordered', who: 'Waiting for the goods', permissions: ['grn_create'], action: 'Record delivery', listHref: '/procurement/requests?stage=ordered' },
  { gate: 5, name: 'Delivered', who: 'Store checks goods into stock', permissions: ['grn_verify'], action: 'Check delivery', listHref: '/procurement/grn?status=pending_verification' },
];
const GATE_NAME: Record<number, string> = { 0: 'Sent back to requester', ...Object.fromEntries(GATES.map((g) => [g.gate, g.name])) };
const GATE_ACTOR: Record<number, string> = { 0: 'Requester', 1: 'Approver', 2: 'Store', 3: 'Super Admin', 4: 'Vendor / Store', 5: 'Store verifier' };

export type View = 'pending' | 'updated' | 'recent';
/** Pending / Updated / Recent — the switch sits in the page header (app/(routes)/procurement/page.tsx). */
export const VIEWS: ReadonlyArray<{ value: View; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'updated', label: 'Updated' },
  { value: 'recent', label: 'Recent' },
];
type Mode = 'mine' | 'held' | 'colleges';
const HELD_UP_DAYS = 30;

const money = (n: number | null) =>
  n == null ? null : `₹ ${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
/** A renegotiated order's new prices wait at step 3 too, but are decided on the order card. */
const isPriceRevision = (r: ProcurementWaitingRow) => r.gate === 3 && !!r.detail?.startsWith('Price revision');
const purchaseHref = (r: ProcurementWaitingRow) =>
  `/procurement/requests/${r.request_id}${
    isPriceRevision(r) || r.gate >= 4 ? '#orders' : r.gate === 3 || r.gate === 2 ? '#quotes' : ''
  }`;

export function StaffOverview({ toolbarRight }: { toolbarRight?: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canAccess, isSuperAdmin } = usePermissions();
  const counts = useProcurementOverviewCounts(7);
  const waiting = useProcurementOverviewWaiting();
  // A step picked in the strip filters the table below it on this same page.
  const [step, setStep] = useState(0);

  // Filters live in the address so Back and shared links keep them.
  const college = searchParams.get('institution') ?? 'all';
  const viewParam = searchParams.get('view');
  const view: View = viewParam === 'updated' || viewParam === 'recent' ? viewParam : 'pending';
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value == null) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `/procurement?${qs}` : '/procurement', { scroll: false });
  };

  const actsAt = (gate: number) => {
    const g = GATES.find((x) => x.gate === gate);
    if (!g) return false;
    if (isSuperAdmin) return true;
    return g.permissions !== null && g.permissions.some((p) => canAccess('procurement', p));
  };

  const inCollege = <T extends { institution_id: string }>(rows: T[]) =>
    college === 'all' ? rows : rows.filter((r) => r.institution_id === college);
  const countRows = inCollege(counts.data ?? []);
  const waitRows = inCollege(waiting.data ?? []);

  const stages = (() => {
    const built = GATES.map((g) => {
      const rows = waitRows.filter((r) => r.gate === g.gate);
      return {
        ...g,
        count: countRows.filter((r) => r.gate === g.gate).reduce((n, r) => n + r[view], 0),
        oldest: rows.length ? Math.max(...rows.map((r) => daysSince(r.waiting_since))) : null,
        you: actsAt(g.gate),
      };
    });
    const pendingOf = (gate: number) => countRows.filter((r) => r.gate === gate).reduce((n, r) => n + r.pending, 0);
    const slowest = [...GATES].sort((a, b) => pendingOf(b.gate) - pendingOf(a.gate))[0];
    return { built, slowestGate: pendingOf(slowest.gate) > 0 ? slowest.gate : null, slowestCount: pendingOf(slowest.gate) };
  })();

  // The Super Admin's queue is final approval; everyone else's is the steps they act on.
  const myGates = isSuperAdmin ? [3] : GATES.filter((g) => actsAt(g.gate)).map((g) => g.gate);
  const needsYou = waitRows.filter((r) => myGates.includes(r.gate));
  const heldUp = waitRows
    .filter((r) => daysSince(r.waiting_since) >= HELD_UP_DAYS)
    .sort((a, b) => daysSince(b.waiting_since) - daysSince(a.waiting_since));

  const colleges = (() => {
    const byId = new Map<string, { id: string; name: string; g: number[]; oldest: number }>();
    for (const r of countRows) {
      const c = byId.get(r.institution_id) ?? { id: r.institution_id, name: r.institution_name, g: [0, 0, 0, 0, 0], oldest: 0 };
      c.g[r.gate - 1] += r.pending;
      byId.set(r.institution_id, c);
    }
    for (const r of waitRows) {
      const c = byId.get(r.institution_id);
      if (c) c.oldest = Math.max(c.oldest, daysSince(r.waiting_since));
    }
    const list = [...byId.values()].map((c) => ({ ...c, total: c.g.reduce((a, b) => a + b, 0) }));
    const max = Math.max(1, ...list.map((c) => c.total));
    return list.sort((a, b) => b.total - a.total).map((c) => ({ ...c, pct: Math.round((c.total / max) * 100) }));
  })();

  const modeParam = searchParams.get('mode') as Mode | null;
  const mode: Mode = modeParam ?? (needsYou.length > 0 || heldUp.length === 0 ? 'mine' : 'held');

  const loading = counts.isLoading || waiting.isLoading;

  const stepRows = step
    ? waitRows.filter((r) => r.gate === step).sort((x, y) => daysSince(y.waiting_since) - daysSince(x.waiting_since))
    : null;
  const list = stepRows ?? (mode === 'mine' ? needsYou : mode === 'held' ? heldUp : null);
  const stepName = step ? GATE_NAME[step] : null;

  const columns = [
    {
      key: 'purchase',
      header: 'Purchase',
      mobile: 'title' as const,
      className: 'max-w-[320px]',
      cell: (r: ProcurementWaitingRow) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.label}</p>
          <p className="truncate text-xs text-muted-foreground">
            {displayRequestNumber(r.request_number)}
            {r.vendor_names ? ` · ${r.vendor_names}` : ''}
            {r.quote_count != null ? ` · ${r.quote_count === 0 ? 'no quotes yet' : `${r.quote_count} quote${r.quote_count === 1 ? '' : 's'}`}` : ''}
            {r.detail ? ` · ${r.detail}` : ''}
          </p>
        </div>
      ),
    },
    { key: 'college', header: 'College', className: 'max-w-[220px] truncate', cell: (r: ProcurementWaitingRow) => r.institution_name },
    {
      key: 'step',
      header: 'Step',
      mobile: 'badge' as const,
      className: 'whitespace-nowrap',
      cell: (r: ProcurementWaitingRow) => (
        <span className="inline-flex items-center rounded-full border border-primary px-2 py-0.5 text-xs font-medium text-primary">
          {GATE_NAME[r.gate]}
        </span>
      ),
    },
    { key: 'waiting', header: 'Waiting on', className: 'whitespace-nowrap', cell: (r: ProcurementWaitingRow) => GATE_ACTOR[r.gate] },
    {
      key: 'amount',
      header: 'Amount',
      className: 'whitespace-nowrap text-right tabular-nums',
      cell: (r: ProcurementWaitingRow) => money(r.chosen_total) ?? '—',
    },
    {
      key: 'days',
      header: 'Days',
      className: 'whitespace-nowrap text-right tabular-nums',
      cell: (r: ProcurementWaitingRow) => {
        const age = daysSince(r.waiting_since);
        return <span className={age >= 60 ? 'font-semibold text-destructive' : undefined}>{age}d</span>;
      },
    },
    {
      key: 'act',
      header: '',
      mobile: 'hidden' as const,
      className: 'text-right',
      cell: (r: ProcurementWaitingRow) => {
        const mineRow = isSuperAdmin ? r.gate === 3 : actsAt(r.gate);
        const g = GATES.find((x) => x.gate === r.gate);
        return (
          <span
            className={cn(
              'inline-flex h-8 items-center rounded-md px-3 text-xs',
              mineRow ? 'bg-primary font-semibold text-primary-foreground' : 'font-medium text-muted-foreground'
            )}
          >
            {mineRow ? (isPriceRevision(r) ? 'Review new prices' : g?.action ?? 'Open') : 'Open'}
          </span>
        );
      },
    },
  ];

  const panels: Array<{ value: Mode; label: string; count: number }> = [
    { value: 'mine', label: 'Waiting for you', count: needsYou.length },
    { value: 'held', label: `Held up ${HELD_UP_DAYS}+ days`, count: heldUp.length },
    { value: 'colleges', label: 'By college', count: colleges.length },
  ];

  return (
    <div className="space-y-5">
      {(counts.isError || waiting.isError) && (
        <AlertBox type="error" message="Some procurement figures could not be loaded. Refresh the page to try again." />
      )}

      {/* One toolbar row: which panel · what the step counts show · college · New request last */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Which panel, as a dropdown like the Status filter on Requests and
            Quotations. A picked step strip below overrides it until cleared. */}
        <Select
          value={step ? '' : mode}
          onValueChange={(v) => {
            setStep(0);
            setParam('mode', v);
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-56" aria-label="Show">
            <SelectValue placeholder="Pick a view" />
          </SelectTrigger>
          <SelectContent>
            {panels.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label} ({t.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={view} onValueChange={(v) => setParam('view', v === 'pending' ? null : v)}>
          <SelectTrigger className="h-9 w-full sm:w-56" aria-label="What the step counts show">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending now</SelectItem>
            <SelectItem value="updated">Moved in the last 7 days</SelectItem>
            <SelectItem value="recent">Raised in the last 7 days</SelectItem>
          </SelectContent>
        </Select>
        <div className="w-full sm:ml-auto sm:w-auto">{toolbarRight}</div>
      </div>

      {/* ── Steps: one connected strip; a step filters the table below ───── */}
      <section aria-label="Purchases at each step" className="overflow-hidden rounded-xl border bg-background shadow">
        {/* 5 tiles: the last spans two cells on 2- and 3-column grids so no cell sits empty. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1 [&>*]:border-l [&>*]:border-t [&>*:first-child]:border-l-0 lg:[&>*]:border-t-0">
          {stages.built.map((s) => {
            const mineStep = isSuperAdmin ? s.gate === 3 : s.you;
            const on = step === s.gate;
            const hot = view === 'pending' && s.oldest != null && s.oldest >= HELD_UP_DAYS;
            return (
              <button
                key={s.gate}
                type="button"
                aria-pressed={on}
                title={s.who}
                onClick={() => setStep(on ? 0 : s.gate)}
                className={cn(
                  'flex min-w-0 flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  on && 'bg-muted shadow-[inset_0_-2px_0_hsl(var(--primary))]'
                )}
              >
                <span className="flex flex-wrap items-center gap-x-1.5 text-sm font-medium text-muted-foreground">
                  {s.name}
                  {mineStep && <span className="text-xs font-semibold text-primary">Your step</span>}
                </span>
                <span className={cn('text-2xl font-semibold tabular-nums', loading && 'text-muted-foreground/40')}>
                  {loading ? '—' : s.count}
                </span>
                <span className={cn('text-xs', hot ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                  {view === 'pending' && s.oldest != null ? `oldest ${s.oldest}d` : '\u00a0'}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── One table ───────────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-xl border bg-background shadow">
        {/* Only a picked step needs a bar here: the chip that clears it. */}
        {step ? (
          <div className="border-b px-4 py-2">
            <button
              type="button"
              onClick={() => setStep(0)}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-muted px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Step: {stepName} <span aria-hidden>×</span>
              <span className="sr-only">Clear step filter</span>
            </button>
          </div>
        ) : null}

        {list !== null ? (
          list.length === 0 ? (
            loading ? (
              <div className="flex justify-center py-12">
                <BeatLoader color="hsl(var(--primary))" size={10} />
              </div>
            ) : (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              {step
                  ? 'Nothing is at this step.'
                  : mode === 'mine'
                    ? `Nothing is waiting for ${isSuperAdmin ? 'your final approval' : 'you'} right now.`
                    : `Nothing has waited ${HELD_UP_DAYS}+ days at one step.`}
            </p>
            )
          ) : (
            <ResponsiveList
              rows={list}
              getRowKey={(r) => `${r.gate}-${r.request_id}-${r.detail ?? ''}`}
              onRowClick={(r) => router.push(purchaseHref(r))}
              rowLabel={(r) => `Open ${r.label} ${displayRequestNumber(r.request_number)}`}
              columns={columns}
            />
          )
        ) : (
          <ResponsiveList
            rows={colleges}
            getRowKey={(c) => c.id}
            onRowClick={(c) => setParam('institution', c.id)}
            rowLabel={(c) => `Show ${c.name}`}
            columns={[
              { key: 'college', header: 'College', mobile: 'title', className: 'font-medium', cell: (c) => c.name },
              ...GATES.map((g, i) => ({
                key: `g${g.gate}`,
                header: g.name,
                className: 'text-right tabular-nums',
                cell: (c: (typeof colleges)[number]) => (
                  <span className={cn(c.g[i] === 0 && 'text-muted-foreground/50')}>{c.g[i]}</span>
                ),
              })),
              {
                key: 'oldest',
                header: 'Oldest',
                className: 'text-right tabular-nums',
                cell: (c) => (
                  <span className={c.oldest >= HELD_UP_DAYS ? 'font-semibold text-destructive' : 'text-muted-foreground'}>
                    {c.oldest}d
                  </span>
                ),
              },
              {
                key: 'open',
                header: 'Open',
                mobile: 'badge',
                className: 'w-[22%]',
                cell: (c) => (
                  <span className="flex items-center gap-2.5 tabular-nums">
                    <span className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-muted md:block">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${c.pct}%` }} />
                    </span>
                    <span className="min-w-[22px] text-right font-semibold">{c.total}</span>
                  </span>
                ),
              },
            ]}
          />
        )}

        {list !== null && list.length > 0 && (
          <div className="flex justify-end border-t px-4 py-2">
            <Link
              href={step ? `${GATES.find((g) => g.gate === step)?.listHref}&institution=${college}` : '/procurement/requests'}
              className="inline-flex items-center text-sm font-medium text-primary hover:underline"
            >
              {step ? 'Open all in this step' : 'All requests'} <ChevronRight className="ml-0.5 h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

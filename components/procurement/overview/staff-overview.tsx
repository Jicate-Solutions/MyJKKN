'use client';

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
import { Segmented } from './segmented';

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
export const VIEWS: ReadonlyArray<{ value: View; label: string; explain: string }> = [
  { value: 'pending', label: 'Pending', explain: 'Purchases sitting at each step right now. Select a step to open its list.' },
  { value: 'updated', label: 'Updated', explain: 'Purchases that reached each step in the last 7 days.' },
  { value: 'recent', label: 'Recent', explain: 'Purchases raised in the last 7 days, shown at the step they are at now.' },
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

export function StaffOverview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canAccess, isSuperAdmin } = usePermissions();
  const counts = useProcurementOverviewCounts(7);
  const waiting = useProcurementOverviewWaiting();

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
  return (
    <div className="space-y-6">
      {(counts.isError || waiting.isError) && (
        <AlertBox type="error" message="Some procurement figures could not be loaded. Refresh the page to try again." />
      )}

      {/* ── Steps ─────────────────────────────────────────────────────── */}
      <section aria-label="Purchases at each step" className="space-y-2.5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stages.built.map((s) => {
            const highlightYou = isSuperAdmin ? s.gate === 3 : s.you;
            const isSlow = view === 'pending' && s.gate === stages.slowestGate && !highlightYou;
            return (
              <Link
                key={s.gate}
                href={`${s.listHref}&institution=${college}`}
                className={cn(
                  'flex flex-col gap-1 rounded-2xl bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,.06),0_4px_14px_rgba(16,24,40,.07)] transition hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(16,24,40,.08),0_12px_28px_rgba(16,24,40,.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  highlightYou && 'bg-primary/10 ring-2 ring-primary',
                  isSlow && 'bg-secondary/20 ring-1 ring-secondary'
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold">{s.name}</span>
                  {highlightYou && (
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-white">YOU</span>
                  )}
                  {isSlow && (
                    <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-secondary-foreground">SLOWEST</span>
                  )}
                </span>
                <span className="flex items-baseline gap-2">
                  <span className={cn('text-3xl font-extrabold tabular-nums', loading && 'text-muted-foreground/40')}>
                    {loading ? '—' : s.count}
                  </span>
                  {view === 'pending' && s.oldest != null && (
                    <span className={cn('text-xs font-semibold', s.oldest >= HELD_UP_DAYS ? 'text-foreground' : 'text-muted-foreground')}>
                      oldest {s.oldest}d
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{s.who}</span>
              </Link>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{VIEWS.find((v) => v.value === view)?.explain}</p>
      </section>

      {/* ── One panel, three modes ───────────────────────────────────── */}
      <section className="overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgba(16,24,40,.06),0_4px_14px_rgba(16,24,40,.07)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <Segmented
            label="Show"
            value={mode}
            onChange={(m) => setParam('mode', m)}
            options={[
              { value: 'mine', label: isSuperAdmin ? 'Final approval' : 'Needs you', count: needsYou.length },
              { value: 'held', label: `Held up ${HELD_UP_DAYS}+ days`, count: heldUp.length, warn: true },
              { value: 'colleges', label: 'By college', count: colleges.length },
            ]}
          />
          <span className="text-xs text-muted-foreground">
            {mode === 'mine'
              ? isSuperAdmin
                ? 'Vendor chosen and quotes compared by the store.'
                : 'Purchases at the steps you act on, oldest first.'
              : mode === 'held'
                ? 'Oldest first — days at the current step.'
                : 'Open purchases per college and step.'}
          </span>
        </div>

        {mode === 'mine' &&
          (needsYou.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {loading ? 'Loading…' : `Nothing is waiting for ${isSuperAdmin ? 'your final approval' : 'you'} right now.`}
            </p>
          ) : (
            <div className="flex flex-col gap-2.5 bg-muted/30 p-3">
              {needsYou.map((r) => {
                const age = daysSince(r.waiting_since);
                const g = GATES.find((x) => x.gate === r.gate);
                return (
                  <article
                    key={`${r.gate}-${r.request_id}-${r.detail ?? ''}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,.06),0_4px_14px_rgba(16,24,40,.07)]"
                  >
                    <div className="min-w-0 flex-[1_1_300px] space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[15px] font-bold">{r.label}</h3>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[11px] font-bold',
                            age >= 3 ? 'bg-secondary/20 text-foreground' : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'}`}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {displayRequestNumber(r.request_number)} · {r.institution_name}
                        {r.requester_name ? ` · ${r.requester_name}` : ''}
                        {!isSuperAdmin && ` · ${GATE_NAME[r.gate]}`}
                      </p>
                      {(r.vendor_names || r.quote_count != null || r.detail) && (
                        <p className="text-xs">
                          {r.vendor_names && <b>{r.vendor_names}</b>}
                          {r.quote_count != null && (
                            <span className="text-muted-foreground">
                              {r.vendor_names ? ' — ' : ''}
                              {r.quote_count} quote{r.quote_count === 1 ? '' : 's'}
                            </span>
                          )}
                          {r.detail && <span className="text-muted-foreground">{r.vendor_names || r.quote_count != null ? ' · ' : ''}{r.detail}</span>}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {money(r.chosen_total) && (
                        <span className="min-w-[96px] text-right text-[17px] font-extrabold tabular-nums">{money(r.chosen_total)}</span>
                      )}
                      <Link
                        href={purchaseHref(r)}
                        className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {isPriceRevision(r) ? 'Review new prices' : g?.action ?? 'Open'}
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ))}

        {mode === 'held' &&
          (heldUp.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {loading ? 'Loading…' : `Nothing has waited ${HELD_UP_DAYS}+ days at one step.`}
            </p>
          ) : (
            <ul>
              {heldUp.map((r) => {
                const age = daysSince(r.waiting_since);
                return (
                  <li key={`${r.gate}-${r.request_id}-${r.detail ?? ''}`} className="border-t first:border-t-0">
                    <Link
                      href={purchaseHref(r)}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-4 py-3 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_170px_130px_56px]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{r.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {displayRequestNumber(r.request_number)} · {r.institution_name}
                        </span>
                      </span>
                      <span className="col-start-1 text-xs sm:col-start-auto sm:text-sm">
                        {GATE_NAME[r.gate]}
                        {r.gate === 2 && r.quote_count != null && (
                          <span className="text-muted-foreground"> — {r.quote_count === 0 ? 'no quotes yet' : `${r.quote_count} in`}</span>
                        )}
                      </span>
                      <span className="hidden text-sm text-muted-foreground sm:block">{GATE_ACTOR[r.gate]}</span>
                      <span
                        className={cn(
                          'row-start-1 text-right text-sm font-extrabold tabular-nums sm:row-start-auto',
                          age >= 60 ? 'text-destructive' : 'text-foreground'
                        )}
                      >
                        {age}d
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ))}

        {mode === 'colleges' && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-bold">College</th>
                  {GATES.map((g) => (
                    <th key={g.gate} scope="col" className="px-2 py-2.5 text-right font-bold">
                      {g.name}
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-2.5 text-right font-bold">Oldest</th>
                  <th scope="col" className="w-[22%] px-4 py-2.5 font-bold">Open</th>
                </tr>
              </thead>
              <tbody>
                {colleges.map((c) => (
                  <tr key={c.id} className="border-t tabular-nums hover:bg-muted/40">
                    <th scope="row" className="px-4 py-3 text-left font-semibold">
                      <button type="button" className="text-left hover:underline" onClick={() => setParam('institution', c.id)}>
                        {c.name}
                      </button>
                    </th>
                    {c.g.map((n, i) => (
                      <td key={i} className={cn('px-2 py-3 text-right', n === 0 && 'text-muted-foreground/50')}>
                        {n}
                      </td>
                    ))}
                    <td className="px-2 py-3 text-right text-muted-foreground">{c.oldest}d</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2.5">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${c.pct}%` }} />
                        </span>
                        <span className="min-w-[22px] text-right font-bold">{c.total}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {mode !== 'colleges' && (mode === 'mine' ? needsYou.length : heldUp.length) > 0 && (
          <div className="flex justify-end border-t px-4 py-2.5">
            <Link href="/procurement/requests" className="inline-flex items-center text-sm font-semibold text-primary hover:underline">
              All requests <ChevronRight className="ml-0.5 h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

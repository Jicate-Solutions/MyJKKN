'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertBox } from '@/components/ui/alert-box';
import { PageHeader } from '@/components/procurement/page-header';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { usePurchaseRequests } from '@/hooks/procurement/use-purchase-requests';
import { useRfqs } from '@/hooks/procurement/use-rfqs';
import { usePurchaseOrders } from '@/hooks/procurement/use-purchase-orders';
import { useGrns } from '@/hooks/procurement/use-grns';
import { formatDateDMY } from '@/lib/utils/date-format';
import { displayRequestNumber } from '@/lib/procurement/display-number';
import { CircleAlert, CheckCircle2, Plus, ChevronRight } from 'lucide-react';

/**
 * Procurement is a strict chain: a request must precede an RFQ, which must precede
 * a purchase order, which must precede a goods receipt. The rail below renders that
 * chain literally — the step numbers and the connecting line encode a real ordering
 * constraint rather than decorating four unrelated tiles.
 *
 * Each gate holds documents that cannot move until somebody acts. `permission` is the
 * key that opens that gate, so the page can show a viewer which waits are *theirs*.
 * Since the simplified flow (docs/procurement/simplified-flow-spec.md) there is one
 * money sign-off — gate 2, the Super Admin's approval of the chosen vendors — and the
 * other gates are the store's own work: quote, receive, verify.
 */
const GATES: ReadonlyArray<{
  step: number;
  name: string;
  waiting: string;
  /** Permission key that opens this gate; null = Super Admin only. */
  permission: string | null;
  href: string;
  /** Appended to `${href}/${id}` for the "Waiting for you" link. */
  itemSuffix?: string;
  docLabel: string;
}> = [
  {
    step: 1,
    name: 'Request approval',
    waiting: 'awaiting approval',
    permission: 'request_approve',
    href: '/procurement/requests',
    docLabel: 'Request to approve',
  },
  {
    step: 2,
    name: 'Quotations',
    waiting: 'ready for quotations',
    permission: 'rfq_manage',
    href: '/procurement/requests',
    docLabel: 'Request to quote',
  },
  {
    step: 3,
    name: 'Super Admin approval',
    waiting: 'awaiting approval',
    permission: null,
    href: '/procurement/rfqs',
    itemSuffix: '/quotations',
    docLabel: 'Vendor choice',
  },
  {
    step: 4,
    name: 'Purchase orders',
    waiting: 'awaiting delivery',
    permission: 'grn_create',
    href: '/procurement/purchase-orders',
    docLabel: 'Purchase order',
  },
  {
    step: 5,
    name: 'Goods received',
    waiting: 'awaiting verification',
    permission: 'grn_verify',
    href: '/procurement/grn',
    docLabel: 'Delivery record',
  },
];

interface WaitingDoc {
  id: string;
  number: string;
  docLabel: string;
  createdAt: string | null;
  href: string;
}

export default function ProcurementHome() {
  const router = useRouter();
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const institutionId = profile?.institution_id ?? undefined;

  // One query per gate. `limit: 5` is deliberate — metadata.total drives the rail
  // count and the same rows fill the "Waiting for you" list, so the list costs
  // nothing extra.
  const prQ = usePurchaseRequests({ institution_id: institutionId, status: 'submitted', limit: 5 });
  const approvedQ = usePurchaseRequests({ institution_id: institutionId, status: 'approved', limit: 5 });
  const rfqQ = useRfqs({ institution_id: institutionId, status: 'pending_award_approval', limit: 5 });
  const poQ = usePurchaseOrders({ institution_id: institutionId, status: 'approved', limit: 5 });
  const grnQ = useGrns({ institution_id: institutionId, status: 'pending_verification', limit: 5 });

  const canCreateRequest = isSuperAdmin || canAccess('procurement', 'request_create');
  const loading = prQ.isLoading || approvedQ.isLoading || rfqQ.isLoading || poQ.isLoading || grnQ.isLoading;
  const failed = prQ.isError || approvedQ.isError || rfqQ.isError || poQ.isError || grnQ.isError;

  const gates = useMemo(() => {
    const queries = [prQ, approvedQ, rfqQ, poQ, grnQ];
    return GATES.map((gate, i) => {
      const q = queries[i];
      const response = q.data as { data?: unknown[]; metadata?: { total?: number } } | undefined;
      return {
        ...gate,
        count: response?.metadata?.total ?? 0,
        // "Needs you" is a claim about the viewer, so it is only ever shown to
        // someone who actually holds the key to that gate.
        mine: isSuperAdmin || (gate.permission !== null && canAccess('procurement', gate.permission)),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prQ.data, approvedQ.data, rfqQ.data, poQ.data, grnQ.data, isSuperAdmin, canAccess]);

  const waitingForYou = useMemo<WaitingDoc[]>(() => {
    const rows: WaitingDoc[] = [];
    const push = (
      list: Record<string, unknown>[] | undefined,
      numberKey: string,
      gateIndex: number
    ) => {
      if (!gates[gateIndex]?.mine) return;
      for (const r of list ?? []) {
        rows.push({
          id: String(r.id),
          number: numberKey === 'request_number' ? displayRequestNumber(String(r[numberKey] ?? '')) || '—' : String(r[numberKey] ?? '—'),
          docLabel: GATES[gateIndex].docLabel,
          createdAt: (r.created_at as string) ?? null,
          href: `${GATES[gateIndex].href}/${r.id}${GATES[gateIndex].itemSuffix ?? ''}`,
        });
      }
    };
    push(prQ.data?.data as unknown as Record<string, unknown>[], 'request_number', 0);
    push(approvedQ.data?.data as unknown as Record<string, unknown>[], 'request_number', 1);
    push(rfqQ.data?.data as unknown as Record<string, unknown>[], 'rfq_number', 2);
    push(poQ.data?.data as unknown as Record<string, unknown>[], 'po_number', 3);
    push(grnQ.data?.data as unknown as Record<string, unknown>[], 'grn_number', 4);
    return rows.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  }, [prQ.data, approvedQ.data, rfqQ.data, poQ.data, grnQ.data, gates]);

  const totalWaiting = gates.reduce((sum, g) => sum + (g.mine ? g.count : 0), 0);

  return (
    <ContentLayout title="Procurement">
      <div className="space-y-6 sm:space-y-8">
        <PageHeader
          title="Procurement"
          description="Requests through to goods on the shelf."
          actions={
            canCreateRequest && (
              <Button onClick={() => router.push('/procurement/requests/new')}>
                <Plus className="mr-2 h-4 w-4" />
                New request
              </Button>
            )
          }
        />

        {failed && (
          <AlertBox
            type="error"
            message="Some pipeline counts could not be loaded. Figures below may be incomplete."
          />
        )}

        {/* ── The rail ──────────────────────────────────────────────────────
            Stations are deliberately uncoloured. The only accent on this page is
            the amber "needs you" state, and it always carries an icon and a word
            so it never depends on colour alone. */}
        <section aria-label="Procurement pipeline">
          <div className="relative">
            {/* The chain itself. Runs between the centres of the first and last
                step markers (5 equal columns → centres at 10% and 90%). */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-[10%] right-[10%] top-4 hidden h-px bg-border lg:block"
            />
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5 lg:gap-0">
              {gates.map((gate) => {
                const needsYou = gate.mine && gate.count > 0;
                return (
                  <button
                    key={gate.name}
                    type="button"
                    onClick={() => router.push(gate.href)}
                    className="group relative flex flex-col items-start rounded-lg border p-4 text-left transition-colors hover:border-primary hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:mx-2 lg:items-center lg:border-0 lg:bg-transparent lg:p-0 lg:pt-0 lg:hover:bg-transparent"
                  >
                    <span className="z-10 inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background text-sm font-semibold tabular-nums text-muted-foreground">
                      {gate.step}
                    </span>

                    <span className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {gate.name}
                    </span>

                    <span
                      className={`mt-1 text-4xl font-semibold tabular-nums ${
                        loading ? 'text-muted-foreground/40' : needsYou ? 'text-amber-600 dark:text-amber-400' : ''
                      }`}
                    >
                      {loading ? '—' : gate.count}
                    </span>

                    <span className="text-xs text-muted-foreground lg:text-center">
                      {gate.waiting}
                    </span>

                    {needsYou && (
                      <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        <CircleAlert className="h-3 w-3" />
                        Needs you
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── What the viewer can actually act on ───────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Waiting for you{totalWaiting > 0 ? ` (${totalWaiting})` : ''}
            </CardTitle>
            <p className="hidden text-sm text-muted-foreground sm:block">
              Documents parked at a gate you can open.
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-6 text-sm text-muted-foreground">Checking the pipeline…</p>
            ) : waitingForYou.length === 0 ? (
              // An empty screen is an invitation, not a dead end — and here it is
              // genuinely good news, so it should not read as a failure.
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-medium">Nothing is waiting on you</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {canCreateRequest
                    ? 'Raise a request to start something moving — use "New request" above.'
                    : 'Approvals you are responsible for will appear here.'}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {waitingForYou.map((doc) => (
                  <button
                    key={`${doc.docLabel}-${doc.id}`}
                    type="button"
                    onClick={() => router.push(doc.href)}
                    className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{doc.number}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {doc.docLabel}
                        {doc.createdAt ? ` · raised ${formatDateDMY(doc.createdAt)}` : ''}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

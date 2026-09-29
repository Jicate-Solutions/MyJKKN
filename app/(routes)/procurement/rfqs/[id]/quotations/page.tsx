'use client';

import { useMemo, useState } from 'react';
import { buildComparisonRows } from '@/lib/services/procurement/quotation-service';
import { useRouter, useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useRfq,
  useSubmitAward,
  useApproveAward,
  useSendBackAward,
} from '@/hooks/procurement/use-rfqs';
import {
  useQuotationsForRfq,
  useDeleteQuotation,
  useAwardLine,
  useUnawardLine,
} from '@/hooks/procurement/use-quotations';
import { AlertBox } from '@/components/ui/alert-box';
import { usePurchaseOrders } from '@/hooks/procurement/use-purchase-orders';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/procurement/status-badge';
import { RFQ_STATUS_CONFIG } from '@/types/procurement';
import type { ComparisonRow } from '@/types/procurement';
import {
  ArrowLeft,
  Trash2,
  FileText,
  ExternalLink,
  Sparkles,
  Send,
  Check,
  Undo2,
  Upload,
  Wand2,
  Circle,
  CheckCircle2,
  PenLine,
} from 'lucide-react';
import { QuotationChatPanel } from '@/components/procurement/quotation-chat-panel';
import { BulkQuotationUpload } from '@/components/procurement/bulk-quotation-upload';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';
import { cn } from '@/lib/utils';

/**
 * The quotation workspace — one screen, three numbered steps:
 *
 *   ① Compare & choose     ONE table: items down, vendors across (the paper
 *                          "comparative statement"); click a price to choose it;
 *                          the quotation details (total/L1, delivery, terms, PDF)
 *                          sit under the items — no separate vendor cards
 *   ② Send for approval    sticky bar: how many items are chosen, the total, one button
 *
 * The Super Admin sees the same screen with the decision card on top. The request's
 * full progress tracker lives on the request page only, not here.
 */

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function SectionTitle({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
        {n}
      </span>
      <div>
        <CardTitle className="text-base">{title}</CardTitle>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export default function RfqQuotationsPage() {
  const router = useRouter();
  const params = useParams();
  const rfqId = params.id as string;
  const { canAccess, isSuperAdmin } = usePermissions();
  const canEditQuotes = isSuperAdmin || canAccess('procurement', 'quotation_manage');

  const { data: rfq, isLoading: rfqLoading, isError: rfqError } = useRfq(rfqId);
  const { data: quotations = [], isLoading: quotesLoading, isError: quotesError } = useQuotationsForRfq(rfqId);
  const comparison = useMemo(
    () => buildComparisonRows(rfq?.items ?? [], quotations),
    [rfq?.items, quotations]
  );

  const deleteQuotation = useDeleteQuotation(rfqId);
  const awardLine = useAwardLine(rfqId);
  const unawardLine = useUnawardLine(rfqId);
  const submitAward = useSubmitAward();
  const approveAward = useApproveAward();
  const sendBack = useSendBackAward();
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [sendBackReason, setSendBackReason] = useState('');
  const [pdfQuote, setPdfQuote] = useState<{ fileId: string; name: string } | null>(null);
  const [choosingAll, setChoosingAll] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  // Orders created by the Super Admin's approval — linked directly, because the
  // orders list opens on the viewer's own institution and may not show them.
  const { data: ordersResp } = usePurchaseOrders({ rfq_id: rfqId, limit: 20 });
  const orders = ordersResp?.data ?? [];

  const chosenCount = comparison.filter((r) => r.quotes.some((q) => q.awarded)).length;

  // Vendors become the comparison columns, in the order their quotes came in.
  const vendorColumns = useMemo(
    () =>
      quotations.map((q) => ({
        supplierId: q.supplier_id,
        name: q.supplier?.name ?? 'Vendor',
      })),
    [quotations]
  );

  const livePrices = useMemo(
    () =>
      Object.fromEntries(
        quotations.flatMap((q) => q.items.map((it) => [it.id, it.unit_price === null ? null : Number(it.unit_price)])),
      ) as Record<string, number | null>,
    [quotations]
  );
  const awardedIds = useMemo(
    () => new Set(quotations.flatMap((q) => q.items.filter((it) => it.awarded).map((it) => it.id))),
    [quotations]
  );

  // Chosen vendors with their totals — what the Super Admin is actually approving.
  const awardSummary = useMemo(() => {
    const byVendor = new Map<string, { name: string; total: number; lines: number }>();
    for (const row of comparison) {
      for (const qt of row.quotes) {
        if (!qt.awarded || qt.unit_price === null) continue;
        const cur = byVendor.get(qt.supplier_id) ?? { name: qt.supplier_name, total: 0, lines: 0 };
        cur.total += Number(qt.unit_price) * Number(qt.quantity ?? row.quantity);
        cur.lines += 1;
        byVendor.set(qt.supplier_id, cur);
      }
    }
    const vendors = [...byVendor.values()];
    return { vendors, grandTotal: vendors.reduce((sum, v) => sum + v.total, 0) };
  }, [comparison]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errorMessage(e, 'Action failed'));
    }
  };

  const handleApprove = async () => {
    try {
      const pos = await approveAward.mutateAsync(rfqId);
      toast.success(pos.length ? `Approved — ${pos.length} order${pos.length === 1 ? '' : 's'} created` : 'Approved');
      if (pos.length === 1) router.push(`/procurement/purchase-orders/${pos[0].id}`);
    } catch (e) {
      toast.error(errorMessage(e, 'Approval failed'));
    }
  };

  /** Pick the cheapest quoted price on every item that isn't already on its cheapest. */
  const chooseLowestForAll = async () => {
    setChoosingAll(true);
    try {
      let changed = 0;
      for (const row of comparison) {
        if (row.lowest_price === null) continue;
        const current = row.quotes.find((q) => q.awarded);
        if (current && current.unit_price === row.lowest_price) continue;
        const cheapest = row.quotes.find((q) => q.unit_price === row.lowest_price);
        if (!cheapest) continue;
        await awardLine.mutateAsync({ rfqItemId: row.rfq_item_id, quotationItemId: cheapest.quotation_item_id });
        changed++;
      }
      toast.success(changed ? `Chose the lowest price on ${changed} item${changed === 1 ? '' : 's'}` : 'Already on the lowest prices');
    } catch (e) {
      toast.error(errorMessage(e, 'Could not choose all'));
    } finally {
      setChoosingAll(false);
    }
  };

  if (rfqLoading) {
    return (
      <ContentLayout title="Quotations">
        <div className="flex items-center justify-center py-16">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }
  if (rfqError || !rfq) {
    return (
      <ContentLayout title="Quotations">
        <div className="py-12">
          <AlertBox type="error" message="Failed to load this quotation. Please try again." />
        </div>
      </ContentLayout>
    );
  }

  // Once sent to the Super Admin the table is frozen (a DB trigger enforces it too),
  // so the approver signs off exactly what they see.
  const isLocked = ['pending_award_approval', 'awarded', 'closed', 'cancelled'].includes(rfq.status);
  const canManage = canEditQuotes && !isLocked;
  const awaitingApproval = rfq.status === 'pending_award_approval';
  const unchosenCount = comparison.length - chosenCount;
  const addQuotation = () => router.push(`/procurement/rfqs/${rfqId}/quotations/new`);
  const quotedSupplierIds = new Set(quotations.map((q) => q.supplier_id));

  // Per vendor: what everything they quoted would cost, and how many items they quoted.
  const vendorTotals = new Map<string, { total: number; count: number }>();
  for (const row of comparison) {
    for (const qt of row.quotes) {
      if (qt.unit_price === null) continue;
      const t = vendorTotals.get(qt.supplier_id) ?? { total: 0, count: 0 };
      t.total += Number(qt.unit_price) * Number(qt.quantity ?? row.quantity);
      t.count += 1;
      vendorTotals.set(qt.supplier_id, t);
    }
  }

  const cellFor = (row: ComparisonRow, supplierId: string) => row.quotes.find((q) => q.supplier_id === supplierId);

  // Vendor ranking, the way purchase committees read it: L1 = lowest total. Vendors
  // who quoted every item rank first; a partial quote can look cheap only because
  // it left items out, so it ranks after them.
  const ranked = vendorColumns
    .map((v) => {
      const t = vendorTotals.get(v.supplierId) ?? { total: 0, count: 0 };
      const q = quotations.find((x) => x.supplier_id === v.supplierId);
      return {
        ...v,
        total: t.total,
        count: t.count,
        full: t.count === comparison.length,
        delivery: q?.delivery_time_days ?? null,
        terms: q?.payment_terms ?? null,
      };
    })
    .sort((a, b) => Number(b.full) - Number(a.full) || a.total - b.total);
  const bestTotal = ranked.find((r) => r.full)?.total ?? ranked[0]?.total ?? 0;
  const rankOf = new Map(
    ranked.map((v, i) => {
      const isL1 = i === 0 && v.full && ranked.length > 1;
      const diff = v.total - bestTotal;
      const note = ranked.length < 2
        ? null
        : isL1
          ? 'Lowest total'
          : !v.full
            ? `Quoted ${v.count} of ${comparison.length} items`
            : `+${rupees(diff)} (${bestTotal > 0 ? Math.round((diff / bestTotal) * 100) : 0}% more)`;
      return [v.supplierId, { label: v.full ? `L${i + 1}` : 'Partial', isL1, note }] as const;
    })
  );
  const deliveries = ranked.map((r) => r.delivery).filter((d): d is number => d != null);
  const fastest = deliveries.length > 1 ? Math.min(...deliveries) : null;

  // A price 5× away from the others on the same item is almost always a misread
  // (a total read as a unit price, a missing zero) — say so next to it.
  const priceWarning = (row: ComparisonRow, price: number): string | null => {
    const prices = row.quotes.filter((q) => q.unit_price !== null).map((q) => Number(q.unit_price));
    if (prices.length < 2) return null;
    const others = prices.filter((p) => p !== price);
    if (!others.length) return null;
    const ref = others.reduce((a, b) => a + b, 0) / others.length;
    if (price * 5 < ref) return 'Far lower than others — check the quote';
    if (price > ref * 5) return 'Far higher than others — check the quote';
    return null;
  };

  return (
    <ContentLayout title={`${rfq.rfq_number} — Quotations`}>
      <div className="space-y-4 sm:space-y-6">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="sm" aria-label="Back to purchase" onClick={() => router.push('/procurement/rfqs')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Quotations</h2>
                <StatusBadge status={rfq.status} config={RFQ_STATUS_CONFIG} />
              </div>
              <p className="text-muted-foreground">
                {rfq.rfq_number}
                {rfq.source_request?.request_number ? ` · for request ${rfq.source_request.request_number}` : ''}
                {` · ${comparison.length} item${comparison.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
          {rfq.status === 'awarded' && orders.length > 0 && (
            <div className="flex shrink-0 flex-wrap gap-2">
              {orders.map((o) => (
                <Button key={o.id} size="sm" onClick={() => router.push(`/procurement/purchase-orders/${o.id}`)}>
                  Open order {o.po_number}
                </Button>
              ))}
            </div>
          )}
        </div>

        {rfq.award_rejection_reason && !isLocked && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-medium">The Super Admin sent this back.</p>
            <p className="mt-1">Reason: {rfq.award_rejection_reason}</p>
          </div>
        )}

        {/* ── Super Admin decision ──────────────────────────────────────── */}
        {awaitingApproval && (
          <Card className="border-amber-300">
            <CardHeader>
              <CardTitle className="text-base">
                Waiting for Super Admin approval
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1 text-sm">
                {awardSummary.vendors.map((v) => (
                  <div key={v.name} className="flex justify-between gap-2">
                    <span>
                      {v.name}{' '}
                      <span className="text-muted-foreground">· {v.lines} item{v.lines === 1 ? '' : 's'}</span>
                    </span>
                    <span className="font-medium">{rupees(v.total)}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-2 border-t pt-1 font-semibold">
                  <span>Total</span>
                  <span>{rupees(awardSummary.grandTotal)}</span>
                </div>
                {unchosenCount > 0 && (
                  <p className="text-xs text-amber-700">
                    {unchosenCount} item{unchosenCount === 1 ? ' has' : 's have'} no vendor chosen and will not be ordered.
                  </p>
                )}
              </div>
              {awaitingApproval && isSuperAdmin && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={handleApprove} disabled={approveAward.isPending}>
                    <Check className="mr-2 h-4 w-4" />
                    {approveAward.isPending ? 'Approving…' : 'Approve & create order'}
                  </Button>
                  <Button variant="outline" onClick={() => setSendBackOpen(true)}>
                    <Undo2 className="mr-2 h-4 w-4" />
                    Send back
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── ① Quotations & comparison — ONE table ─────────────────────────
            Items first, then the details rows underneath (total + L1/L2 rank,
            delivery, payment terms, reference, PDF) — the paper comparative
            statement layout. No separate vendor cards: every fact appears once. */}
        <Card>
          <CardHeader className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <SectionTitle
              n={1}
              title={`Compare & choose${quotations.length ? ` · ${quotations.length} quotation${quotations.length === 1 ? '' : 's'}` : ''}`}
            />
            {quotations.length > 0 && (
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {canManage && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
                      <Upload className="mr-1.5 h-4 w-4" />
                      Upload PDFs
                    </Button>
                    <Button size="sm" variant="ghost" title="Type a quotation in by hand" aria-label="Type a quotation in by hand" onClick={addQuotation}>
                      <PenLine className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={chooseLowestForAll} disabled={choosingAll}>
                      <Wand2 className="mr-1.5 h-4 w-4" />
                      {choosingAll ? 'Choosing…' : 'Lowest for all'}
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" onClick={() => setChatOpen(true)}>
                  <Sparkles className="mr-1.5 h-4 w-4" />
                  Ask AI
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            {quotesLoading ? (
              <div className="flex justify-center py-8">
                <BeatLoader color="hsl(var(--primary))" size={8} />
              </div>
            ) : quotesError ? (
              <AlertBox type="error" message="Failed to load quotations. Please try again." />
            ) : quotations.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-8 text-center">
                <p className="font-medium">No quotations yet</p>
                {canManage && (
                  <div className="flex flex-col items-center gap-2 sm:flex-row">
                    <Button onClick={() => setUploadOpen(true)}>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload quotation PDFs
                    </Button>
                    <Button variant="ghost" onClick={addQuotation}>
                      <PenLine className="mr-2 h-4 w-4" />
                      Type one in
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left">
                        <th className="sticky left-0 z-10 min-w-[150px] bg-muted/50 px-3 py-2 font-medium">Item</th>
                        {vendorColumns.map((v) => {
                          const rk = rankOf.get(v.supplierId);
                          const q = quotations.find((x) => x.supplier_id === v.supplierId);
                          return (
                            <th key={v.supplierId} className="min-w-[140px] px-3 py-2 font-medium">
                              <span className="flex items-center gap-1.5">
                                {rk && (
                                  <span
                                    className={cn(
                                      'rounded px-1 text-[10px] font-bold',
                                      rk.isL1 ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'
                                    )}
                                  >
                                    {rk.label}
                                  </span>
                                )}
                                <span className="truncate" title={v.name}>
                                  {v.name}
                                </span>
                                {q?.document_file_id ? (
                                  <button
                                    type="button"
                                    title="View quotation PDF"
                                    aria-label={`View ${v.name} quotation PDF`}
                                    className="text-muted-foreground hover:text-primary"
                                    onClick={() => setPdfQuote({ fileId: q.document_file_id!, name: v.name })}
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                  </button>
                                ) : q?.document_url ? (
                                  <a
                                    href={q.document_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Open quotation PDF"
                                    aria-label={`Open ${v.name} quotation PDF`}
                                    className="text-muted-foreground hover:text-primary"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                ) : null}
                                {canManage && q && (
                                  <button
                                    type="button"
                                    title="Remove this quotation"
                                    aria-label={`Remove ${v.name} quotation`}
                                    className="ml-auto text-muted-foreground hover:text-destructive"
                                    onClick={() => run(() => deleteQuotation.mutateAsync(q.id), 'Quotation removed')}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </span>
                            </th>
                          );
                        })}
                        <th className="min-w-[140px] border-l bg-green-50/60 px-3 py-2 font-medium dark:bg-green-950/20">
                          Your choice
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.map((row) => (
                        <tr key={row.rfq_item_id} className="border-b">
                          <td className="sticky left-0 z-10 bg-background px-3 py-2 align-top">
                            <span className="font-medium">{row.item_name}</span>
                            <span className="text-xs text-muted-foreground"> × {row.quantity}</span>
                          </td>
                          {vendorColumns.map((v) => {
                            const qt = cellFor(row, v.supplierId);
                            if (!qt || qt.unit_price === null) {
                              return (
                                <td key={v.supplierId} className="px-3 py-2 align-top text-xs text-muted-foreground">
                                  —
                                </td>
                              );
                            }
                            const qty = Number(qt.quantity ?? row.quantity);
                            const isLowest = qt.unit_price === row.lowest_price;
                            const warning = priceWarning(row, Number(qt.unit_price));
                            const offered = [qt.manufacturer, qt.quality_grade, row.is_chemical ? qt.concentration : null, qt.other_specs]
                              .filter(Boolean)
                              .join(' · ');
                            const toggle = () =>
                              qt.awarded
                                ? run(() => unawardLine.mutateAsync(row.rfq_item_id), 'Choice cleared')
                                : run(
                                    () => awardLine.mutateAsync({ rfqItemId: row.rfq_item_id, quotationItemId: qt.quotation_item_id }),
                                    `Chose ${qt.supplier_name}`
                                  );
                            return (
                              <td key={v.supplierId} className="p-1 align-top">
                                <button
                                  type="button"
                                  disabled={!canManage}
                                  onClick={toggle}
                                  aria-pressed={qt.awarded}
                                  title={offered || undefined}
                                  className={cn(
                                    'w-full rounded-md border px-2 py-1.5 text-left transition-colors',
                                    qt.awarded
                                      ? 'border-green-600 bg-green-50 dark:bg-green-950/40'
                                      : 'border-transparent',
                                    canManage && !qt.awarded && 'hover:border-primary',
                                    !canManage && 'cursor-default'
                                  )}
                                >
                                  <span className="flex items-center gap-1.5">
                                    {qt.awarded ? (
                                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-700" />
                                    ) : (
                                      canManage && <Circle className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                                    )}
                                    <span className="font-semibold">{rupees(Number(qt.unit_price))}</span>
                                    {isLowest && <span className="text-[10px] font-semibold text-green-700">LOWEST</span>}
                                  </span>
                                  {qty > 1 && (
                                    <span className="block pl-5 text-xs text-muted-foreground">
                                      {rupees(Number(qt.unit_price) * qty)}
                                    </span>
                                  )}
                                  {warning && (
                                    <span className="block pl-5 text-[11px] font-medium text-red-700" title={warning}>
                                      ⚠ Check price
                                    </span>
                                  )}
                                </button>
                              </td>
                            );
                          })}
                          {(() => {
                            const chosen = row.quotes.find((q) => q.awarded);
                            if (!chosen || chosen.unit_price === null) {
                              return (
                                <td className="border-l bg-green-50/60 px-3 py-2 align-top text-xs text-amber-700 dark:bg-green-950/20">
                                  Not chosen
                                </td>
                              );
                            }
                            const qty = Number(chosen.quantity ?? row.quantity);
                            return (
                              <td className="border-l bg-green-50/60 px-3 py-2 align-top dark:bg-green-950/20">
                                <span className="block truncate font-medium text-green-800 dark:text-green-300">
                                  {chosen.supplier_name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {rupees(Number(chosen.unit_price) * qty)}
                                </span>
                                {chosen.unit_price !== row.lowest_price && (
                                  <span className="block text-[11px] text-amber-700">not the lowest</span>
                                )}
                              </td>
                            );
                          })()}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="text-xs">
                      <tr className="bg-muted/30">
                        <td className="sticky left-0 z-10 bg-muted/30 px-3 py-2 font-medium">Total</td>
                        {vendorColumns.map((v) => {
                          const t = vendorTotals.get(v.supplierId);
                          const rk = rankOf.get(v.supplierId);
                          return (
                            <td key={v.supplierId} className="px-3 py-2">
                              <span className={cn('text-sm font-semibold', rk?.isL1 && 'text-green-700')}>
                                {t ? rupees(t.total) : '—'}
                              </span>
                              {rk?.note && !rk.isL1 && <span className="block text-muted-foreground">{rk.note}</span>}
                            </td>
                          );
                        })}
                        <td className="border-l bg-green-50/60 px-3 py-2 dark:bg-green-950/20">
                          <span className="text-sm font-semibold">{rupees(awardSummary.grandTotal)}</span>
                        </td>
                      </tr>
                      <tr className="border-t">
                        <td className="sticky left-0 z-10 bg-background px-3 py-2 text-muted-foreground">Delivery · Payment</td>
                        {vendorColumns.map((v) => {
                          const q = quotations.find((x) => x.supplier_id === v.supplierId);
                          const parts = [
                            q?.delivery_time_days != null ? `${q.delivery_time_days} days` : null,
                            q?.payment_terms || null,
                          ].filter(Boolean);
                          return (
                            <td
                              key={v.supplierId}
                              className={cn(
                                'max-w-[200px] truncate px-3 py-2 text-muted-foreground',
                                q?.delivery_time_days != null && q.delivery_time_days === fastest && 'text-blue-700'
                              )}
                              title={parts.join(' · ')}
                            >
                              {parts.join(' · ') || '—'}
                            </td>
                          );
                        })}
                        <td className="border-l bg-green-50/60 dark:bg-green-950/20" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {quotations.length === 1 && canManage && (
                  <p className="text-xs text-amber-700">Add 2–3 quotations to compare.</p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── ② Send for approval — always in reach at the bottom ──────────── */}
        {canManage && quotations.length > 0 && (
          <div className="sticky bottom-3 z-20 rounded-lg border bg-background/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85">
            <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 text-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  2
                </span>
                <div>
                  <p className="font-medium">
                    {chosenCount} of {comparison.length} item{comparison.length === 1 ? '' : 's'} chosen
                    {awardSummary.grandTotal > 0 ? ` · Total ${rupees(awardSummary.grandTotal)}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {chosenCount === 0
                      ? 'Choose a vendor for each item to continue.'
                      : unchosenCount > 0
                        ? `${unchosenCount} item${unchosenCount === 1 ? '' : 's'} without a vendor will not be ordered.`
                        : 'All items chosen — send to the Super Admin for approval.'}
                  </p>
                </div>
              </div>
              <Button
                className="shrink-0"
                disabled={chosenCount === 0 || submitAward.isPending}
                onClick={() => run(() => submitAward.mutateAsync(rfqId), 'Sent to Super Admin for approval')}
              >
                <Send className="mr-2 h-4 w-4" />
                {submitAward.isPending ? 'Sending…' : 'Send to Super Admin'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {canManage && (
        <BulkQuotationUpload
          rfq={rfq}
          quotedSupplierIds={quotedSupplierIds}
          open={uploadOpen}
          onOpenChange={setUploadOpen}
        />
      )}

      {/* Quotation PDF preview */}
      <Dialog open={!!pdfQuote} onOpenChange={(o) => !o && setPdfQuote(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Quotation — {pdfQuote?.name}</DialogTitle>
          </DialogHeader>
          {pdfQuote && (
            <iframe
              src={`https://drive.google.com/file/d/${pdfQuote.fileId}/preview`}
              title={`Quotation PDF — ${pdfQuote.name}`}
              className="h-[70vh] w-full rounded-md border"
            />
          )}
        </DialogContent>
      </Dialog>

      {quotations.length > 0 && (
        <QuotationChatPanel
          open={chatOpen}
          onOpenChange={setChatOpen}
          rfqId={rfqId}
          rfqNumber={rfq.rfq_number}
          canApply={canManage}
          lockedReason={
            isLocked
              ? awaitingApproval
                ? 'This quotation is waiting for Super Admin approval, so choices are locked.'
                : `This quotation is already ${rfq.status}, so choices are no longer changed from here.`
              : null
          }
          livePrices={livePrices}
          awardedIds={awardedIds}
        />
      )}
      <Dialog open={sendBackOpen} onOpenChange={setSendBackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send back {rfq.rfq_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="send-back-reason">What needs to change?</Label>
            <Textarea
              id="send-back-reason"
              value={sendBackReason}
              onChange={(e) => setSendBackReason(e.target.value)}
              placeholder="e.g. Get one more quotation, or choose the cheaper vendor for item 2."
              className="min-h-[100px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setSendBackOpen(false)}>
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={!sendBackReason.trim() || sendBack.isPending}
              onClick={async () => {
                try {
                  await sendBack.mutateAsync({ rfqId, reason: sendBackReason });
                  toast.success('Sent back to the store keeper');
                  setSendBackOpen(false);
                  setSendBackReason('');
                } catch (e) {
                  toast.error(errorMessage(e, 'Could not send back'));
                }
              }}
            >
              <Undo2 className="mr-2 h-4 w-4" />
              Send back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}

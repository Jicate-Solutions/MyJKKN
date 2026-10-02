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
  ArrowRight,
  Trash2,
  FileText,
  ExternalLink,
  Sparkles,
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
import { displayRequestNumber } from '@/lib/procurement/display-number';

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

  const fullQuoteTotals = vendorColumns
    .map((v) => vendorTotals.get(v.supplierId))
    .filter((t): t is { total: number; count: number } => !!t && t.count === comparison.length)
    .map((t) => t.total);
  const savingVsSingle =
    fullQuoteTotals.length && unchosenCount === 0 ? Math.min(...fullQuoteTotals) - awardSummary.grandTotal : 0;

  const cellFor = (row: ComparisonRow, supplierId: string) => row.quotes.find((q) => q.supplier_id === supplierId);

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
    <ContentLayout title={`Quotations — ${displayRequestNumber(rfq.source_request?.request_number) || rfq.rfq_number}`}>
      <div className="space-y-4 sm:space-y-6">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="sm" aria-label="Back to quotations" onClick={() => router.push('/procurement/rfqs')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">Compare quotations</h2>
                <StatusBadge status={rfq.status} config={RFQ_STATUS_CONFIG} />
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {displayRequestNumber(rfq.source_request?.request_number) || rfq.rfq_number}
                {' · '}
                {comparison.map((r) => r.item_name).join(', ')}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {rfq.status === 'awarded' &&
              orders.map((o) => (
                <Button key={o.id} size="sm" onClick={() => router.push(`/procurement/purchase-orders/${o.id}`)}>
                  Open PO {o.po_number}
                </Button>
              ))}
            {canManage && quotations.length > 0 && (
              <>
                <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
                  <Upload className="mr-1.5 h-4 w-4" />
                  Add quotations
                </Button>
                <Button size="sm" variant="ghost" title="Type a quotation in by hand" aria-label="Type a quotation in by hand" onClick={addQuotation}>
                  <PenLine className="h-4 w-4" />
                </Button>
              </>
            )}
            {quotations.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setChatOpen(true)}>
                <Sparkles className="mr-1.5 h-4 w-4" />
                Ask AI
              </Button>
            )}
          </div>
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

        {/* ── The comparison: vendors across, items down. Each vendor's total and
            terms sit in its column header; no separate footer rows. ──────── */}
        <Card className="overflow-hidden">
          <CardContent className="space-y-2 p-0">
            {quotesLoading ? (
              <div className="flex justify-center py-8">
                <BeatLoader color="hsl(var(--primary))" size={8} />
              </div>
            ) : quotesError ? (
              <AlertBox type="error" message="Failed to load quotations. Please try again." />
            ) : quotations.length === 0 ? (
              <div className="m-4 flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-8 text-center">
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
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left align-bottom">
                        <th className="sticky left-0 z-10 min-w-[170px] bg-background px-3 py-3 font-normal">
                          <span className="block text-xs text-muted-foreground">{canManage ? 'Click a price to choose it' : 'Item'}</span>
                          {canManage && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-1.5 h-7 border-dashed border-primary px-2 text-xs text-primary"
                              onClick={chooseLowestForAll}
                              disabled={choosingAll}
                            >
                              <Wand2 className="mr-1 h-3.5 w-3.5" />
                              {choosingAll ? 'Choosing…' : 'Choose lowest for every item'}
                            </Button>
                          )}
                        </th>
                        {vendorColumns.map((v) => {
                          const t = vendorTotals.get(v.supplierId);
                          const q = quotations.find((x) => x.supplier_id === v.supplierId);
                          const all = !!t && t.count === comparison.length;
                          const terms = [
                            all ? `all ${comparison.length} item${comparison.length === 1 ? '' : 's'}` : `${t?.count ?? 0} of ${comparison.length} items`,
                            q?.delivery_time_days != null ? `${q.delivery_time_days} days` : null,
                            q?.payment_terms || null,
                          ].filter(Boolean);
                          return (
                            <th key={v.supplierId} className="min-w-[170px] border-l px-3 py-3 font-normal">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate text-sm font-semibold" title={v.name}>
                                  {v.name}
                                </span>
                                <span className="ml-auto flex shrink-0 items-center gap-1.5">
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
                                      className="text-muted-foreground hover:text-destructive"
                                      onClick={() => run(() => deleteQuotation.mutateAsync(q.id), 'Quotation removed')}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </span>
                              </span>
                              <span className="mt-1 block text-lg font-bold tabular-nums">{t ? rupees(t.total) : '—'}</span>
                              <span
                                className={cn('block truncate text-xs', all ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400')}
                                title={terms.join(' · ')}
                              >
                                {terms.join(' · ')}
                              </span>
                            </th>
                          );
                        })}
                        <th className="min-w-[170px] border-l border-green-200 bg-green-50/70 px-3 py-3 font-normal dark:border-green-900 dark:bg-green-950/20">
                          <span className="block text-sm font-semibold text-green-800 dark:text-green-300">Your choice</span>
                          <span className="mt-1 block text-lg font-bold tabular-nums">
                            {rupees(awardSummary.grandTotal)}
                            {awardSummary.vendors.length > 0 && (
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                · {awardSummary.vendors.length} vendor{awardSummary.vendors.length === 1 ? '' : 's'}
                              </span>
                            )}
                          </span>
                          {savingVsSingle > 0 && (
                            <span className="block text-xs text-green-700 dark:text-green-400">
                              {rupees(savingVsSingle)} less than buying all from one vendor
                            </span>
                          )}
                          {/* The decision is made in this column, so it is sent from here too. */}
                          {canManage ? (
                            <div className="mt-2 space-y-1">
                              {unchosenCount > 0 && (
                                <span className="block text-xs font-medium text-amber-700 dark:text-amber-400">
                                  {chosenCount} of {comparison.length} items chosen
                                </span>
                              )}
                              <Button
                                size="sm"
                                className="h-7 px-2.5 text-xs"
                                title="One purchase order per vendor is created when the Super Admin approves"
                                disabled={chosenCount === 0 || submitAward.isPending}
                                onClick={() => run(() => submitAward.mutateAsync(rfqId), 'Sent to Super Admin for approval')}
                              >
                                {submitAward.isPending ? 'Sending…' : 'Send for approval'}
                                <ArrowRight className="ml-1 h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : awaitingApproval ? (
                            <span className="mt-2 block text-xs font-medium text-amber-700 dark:text-amber-400">
                              Sent · waiting for Super Admin
                            </span>
                          ) : null}
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
                  </table>
                </div>
                {quotations.length === 1 && canManage && (
                  <p className="px-4 pb-3 text-xs text-amber-700">Add another quotation to compare prices.</p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Phones only: the table scrolls sideways there, so keep the action in reach ── */}
        {canManage && quotations.length > 0 && (
          <div className="sticky bottom-3 z-20 rounded-lg border bg-background/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden">
            <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <p>
                  <b>
                    {unchosenCount === 0
                      ? `All ${comparison.length} item${comparison.length === 1 ? '' : 's'} chosen`
                      : `${chosenCount} of ${comparison.length} items chosen`}
                  </b>
                  {awardSummary.vendors.length > 0 &&
                    ` · ${awardSummary.vendors.length} vendor${awardSummary.vendors.length === 1 ? '' : 's'}`}
                  {awardSummary.grandTotal > 0 && (
                    <>
                      {' · '}
                      <b className="tabular-nums">{rupees(awardSummary.grandTotal)}</b>
                    </>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {chosenCount === 0
                    ? 'Choose a vendor for each item to continue.'
                    : unchosenCount > 0
                      ? `${unchosenCount} item${unchosenCount === 1 ? '' : 's'} without a vendor will not be ordered.`
                      : 'One purchase order per vendor is created when the Super Admin approves.'}
                </p>
              </div>
              <Button
                className="shrink-0"
                disabled={chosenCount === 0 || submitAward.isPending}
                onClick={() => run(() => submitAward.mutateAsync(rfqId), 'Sent to Super Admin for approval')}
              >
                {submitAward.isPending ? 'Sending…' : 'Send for approval'}
                <ArrowRight className="ml-1.5 h-4 w-4" />
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
            <DialogTitle>Send back {displayRequestNumber(rfq.source_request?.request_number) || rfq.rfq_number}</DialogTitle>
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

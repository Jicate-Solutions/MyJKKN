'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { buildComparisonRows } from '@/lib/services/procurement/quotation-service';
import { usePermissions } from '@/hooks/use-permissions';
import { useRfq, useSubmitAward, useApproveAward, useSendBackAward } from '@/hooks/procurement/use-rfqs';
import {
  useQuotationsForRfq,
  useDeleteQuotation,
  useAwardLine,
  useUnawardLine,
} from '@/hooks/procurement/use-quotations';
import { AlertBox } from '@/components/ui/alert-box';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { ComparisonRow } from '@/types/procurement';
import {
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
  ShieldCheck,
  MoreHorizontal,
} from 'lucide-react';
import { QuotationChatPanel } from '@/components/procurement/quotation-chat-panel';
import { BulkQuotationUpload } from '@/components/procurement/bulk-quotation-upload';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';
import { cn } from '@/lib/utils';
import { priceWarning, trustedLowest } from '@/lib/procurement/price-checks';

/**
 * Quotes for one purchase, shown inside the purchase page — no page of its own.
 *
 *   • items down, vendors across (the paper "comparative statement"); click a price
 *     to choose it; each vendor's total, terms and PDF sit in its column header
 *   • one bottom bar: how many items are chosen, the total, "Send for final approval"
 *   • sign-off 2: the Super Admin approves the chosen vendors and prices right here
 */

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function QuotesSection({ rfqId, onApproved }: { rfqId: string; onApproved?: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canEditQuotes = isSuperAdmin || canAccess('procurement', 'quotation_manage');

  const { data: rfq, isLoading: rfqLoading, isError: rfqError } = useRfq(rfqId);
  const { data: quotations = [], isLoading: quotesLoading, isError: quotesError } = useQuotationsForRfq(rfqId);
  const comparison = useMemo(() => buildComparisonRows(rfq?.items ?? [], quotations), [rfq?.items, quotations]);

  const deleteQuotation = useDeleteQuotation(rfqId);
  const awardLine = useAwardLine(rfqId);
  const unawardLine = useUnawardLine(rfqId);
  const submitAward = useSubmitAward();
  const approveAward = useApproveAward();
  const sendBack = useSendBackAward();
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [sendBackReason, setSendBackReason] = useState('');
  const [pdfQuote, setPdfQuote] = useState<{ fileId: string; name: string } | null>(null);
  const [removeQuote, setRemoveQuote] = useState<{ id: string; name: string } | null>(null);
  const [choosingAll, setChoosingAll] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  // The upload buttons open the file picker straight away; the review window only
  // appears once PDFs are chosen (no empty "drop files here" window in between).
  const pickerRef = useRef<HTMLInputElement>(null);
  const [pickedFiles, setPickedFiles] = useState<File[] | null>(null);
  const pickPdfs = () => pickerRef.current?.click();

  const chosenCount = comparison.filter((r) => r.quotes.some((q) => q.awarded)).length;

  // Vendors become the comparison columns, in the order their quotes came in.
  const vendorColumns = useMemo(
    () => quotations.map((q) => ({ supplierId: q.supplier_id, name: q.supplier?.name ?? 'Vendor' })),
    [quotations]
  );

  const livePrices = useMemo(
    () =>
      Object.fromEntries(
        quotations.flatMap((q) => q.items.map((it) => [it.id, it.unit_price === null ? null : Number(it.unit_price)]))
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
    } finally {
      // The purchase page's progress line reads the same documents.
      void queryClient.invalidateQueries({ queryKey: ['procurement-journey'] });
    }
  };

  const handleApprove = async () => {
    try {
      const pos = await approveAward.mutateAsync(rfqId);
      toast.success(pos.length ? `Approved — ${pos.length} order${pos.length === 1 ? '' : 's'} created` : 'Approved');
      onApproved?.();
    } catch (e) {
      toast.error(errorMessage(e, 'Approval failed'));
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['procurement-journey'] });
      void queryClient.invalidateQueries({ queryKey: ['procurement-purchase-orders'] });
    }
  };

  /** The trusted price for one item: cheapest that isn't a ₹0.01-style placeholder. */
  const bestFor = (row: ComparisonRow) =>
    trustedLowest(
      row.quotes
        .filter((q) => q.unit_price !== null)
        .map((q) => ({ ...q, price: Number(q.unit_price) }))
    );

  /** Pick the cheapest trusted price on every item that isn't already on it. */
  const chooseLowestForAll = async () => {
    setChoosingAll(true);
    try {
      let changed = 0;
      for (const row of comparison) {
        const best = bestFor(row);
        if (!best) continue;
        const current = row.quotes.find((q) => q.awarded);
        if (current && current.quotation_item_id === best.quotation_item_id) continue;
        await awardLine.mutateAsync({ rfqItemId: row.rfq_item_id, quotationItemId: best.quotation_item_id });
        changed++;
      }
      toast.success(changed ? `Chose the lowest price on ${changed} item${changed === 1 ? '' : 's'}` : 'Already on the lowest prices');
    } catch (e) {
      toast.error(errorMessage(e, 'Could not choose all'));
    } finally {
      setChoosingAll(false);
      void queryClient.invalidateQueries({ queryKey: ['procurement-journey'] });
    }
  };

  if (rfqLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <BeatLoader color="hsl(var(--primary))" size={8} />
      </div>
    );
  }
  if (rfqError || !rfq) {
    return <AlertBox type="error" message="Failed to load the quotes for this purchase. Please try again." />;
  }

  // Once sent to the Super Admin the table is frozen (a DB trigger enforces it too),
  // so the approver signs off exactly what they see.
  const isLocked = ['pending_award_approval', 'awarded', 'closed', 'cancelled'].includes(rfq.status);
  const canManage = canEditQuotes && !isLocked;
  const awaitingApproval = rfq.status === 'pending_award_approval';
  const unchosenCount = comparison.length - chosenCount;
  const typeQuote = () => router.push(`/procurement/rfqs/${rfqId}/quotations/new`);
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

  const sendForApproval = () => run(() => submitAward.mutateAsync(rfqId), 'Sent to the Super Admin for final approval');

  return (
    <div className="space-y-3">
      {rfq.award_rejection_reason && !isLocked && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-medium">The Super Admin sent this back.</p>
          <p className="mt-1">Reason: {rfq.award_rejection_reason}</p>
        </div>
      )}

      {/* ── Sign-off 2: ONE card — what is being approved, and the Super Admin's
          buttons at its bottom. The full comparison follows below it. ── */}
      {awaitingApproval && (
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="px-5 pb-2 pt-4">
            {isSuperAdmin ? (
              <>
                <h2 className="text-lg font-semibold">Approve the chosen vendors?</h2>
              </>
            ) : (
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <ShieldCheck className="h-4 w-4 text-amber-600" />
                Waiting for the Super Admin&apos;s final approval
              </h2>
            )}
          </div>
          <ul className="px-5">
            {comparison.map((row) => {
              const chosen = row.quotes.find((q) => q.awarded && q.unit_price !== null);
              const best = bestFor(row);
              const qty = Number(chosen?.quantity ?? row.quantity);
              const quotedCount = row.quotes.filter((q) => q.unit_price !== null).length;
              const above = chosen && best ? Number(chosen.unit_price) - best.price : 0;
              return (
                <li key={row.rfq_item_id} className="flex items-center gap-3 border-t py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {row.item_name} <span className="font-normal text-muted-foreground">× {row.quantity}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {chosen ? (
                        <>
                          {chosen.supplier_name} · {rupees(Number(chosen.unit_price))} each ·{' '}
                          {above > 0 ? (
                            <span className="text-amber-700">{rupees(above)} above lowest</span>
                          ) : (
                            <span className="text-green-700 dark:text-green-400">lowest{quotedCount > 1 ? ` of ${quotedCount}` : ''}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-amber-700">No vendor chosen — will not be ordered</span>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">{chosen ? rupees(Number(chosen.unit_price) * qty) : '—'}</span>
                </li>
              );
            })}
            <li className="flex items-center justify-between gap-3 border-t py-3 text-sm font-semibold">
              <span>
                Total · {awardSummary.vendors.length} order{awardSummary.vendors.length === 1 ? '' : 's'}
              </span>
              <span className="tabular-nums">{rupees(awardSummary.grandTotal)}</span>
            </li>
          </ul>
          <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-4">
            {savingVsSingle > 0 && (
              <span className="mr-auto text-xs text-green-700 dark:text-green-400">
                {rupees(savingVsSingle)} less than buying all from one vendor
              </span>
            )}
            {isSuperAdmin && (
              <>
                <Button variant="ghost" className="min-h-11" onClick={() => setSendBackOpen(true)}>
                  <Undo2 className="mr-2 h-4 w-4" />
                  Send back
                </Button>
                <Button className="min-h-11 px-6" onClick={handleApprove} disabled={approveAward.isPending}>
                  <Check className="mr-2 h-4 w-4" />
                  {approveAward.isPending ? 'Approving…' : 'Approve & order'}
                </Button>
              </>
            )}
          </div>
        </section>
      )}

      {/* ── ONE card: header with a small "Add quote PDFs" button, the comparison
          (vendors across, items down), and the send button at the bottom. ── */}
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            {canManage ? (
              <>
                <h2 className="text-lg font-semibold">
                  {quotations.length ? 'Compare quotes and pick vendors' : 'Collect vendor quotes'}
                </h2>
              </>
            ) : (
              <h2 className="text-base font-semibold">Quotes</h2>
            )}
          </div>
          <div className="flex items-center gap-1">
            {canManage && quotations.length > 0 && (
              <Button size="sm" variant="secondary" className="h-10" onClick={pickPdfs}>
                <Upload className="mr-1.5 h-4 w-4" />
                Add quote PDFs
              </Button>
            )}
            {(canManage || quotations.length > 0) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-10 w-10" aria-label="More ways to add or check quotes">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canManage && (
                    <DropdownMenuItem onClick={typeQuote}>
                      <PenLine className="mr-2 h-4 w-4" />
                      Type prices (or use Excel)
                    </DropdownMenuItem>
                  )}
                  {quotations.length > 0 && (
                    <DropdownMenuItem onClick={() => setChatOpen(true)}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Ask AI about these quotes
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <div className="border-t">
          {quotesLoading ? (
            <div className="flex justify-center py-8">
              <BeatLoader color="hsl(var(--primary))" size={8} />
            </div>
          ) : quotesError ? (
            <AlertBox type="error" message="Failed to load quotations. Please try again." />
          ) : quotations.length === 0 ? (
            <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-8 text-center">
              {canManage ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Upload the vendors&apos; quotation PDFs — the AI reads the prices for you.
                  </p>
                  <Button className="h-11 px-6" onClick={pickPdfs}>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload quote PDFs
                  </Button>
                  <button type="button" className="text-sm text-primary underline-offset-4 hover:underline" onClick={typeQuote}>
                    or type the prices
                  </button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">The store is collecting vendor quotes.</p>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left align-bottom">
                      <th className="sticky left-0 z-10 min-w-[170px] bg-background px-3 py-3 font-normal">
                        <span className="block text-xs text-muted-foreground">
                          {canManage ? 'Click a price to choose it' : 'Item'}
                        </span>
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
                          all
                            ? `all ${comparison.length} item${comparison.length === 1 ? '' : 's'}`
                            : `${t?.count ?? 0} of ${comparison.length} items`,
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
                                    title="Remove this quote"
                                    aria-label={`Remove ${v.name} quote`}
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() => setRemoveQuote({ id: q.id, name: v.name })}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </span>
                            </span>
                            <span className="mt-1 block text-lg font-bold tabular-nums">{t ? rupees(t.total) : '—'}</span>
                            <span
                              className={cn(
                                'block truncate text-xs',
                                all ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400'
                              )}
                              title={terms.join(' · ')}
                            >
                              {terms.join(' · ')}
                            </span>
                          </th>
                        );
                      })}
                      <th className="min-w-[160px] border-l border-green-200 bg-green-50/70 px-3 py-3 font-normal dark:border-green-900 dark:bg-green-950/20">
                        <span className="block text-sm font-semibold text-green-800 dark:text-green-300">Your choice</span>
                        <span className="mt-1 block text-lg font-bold tabular-nums">{rupees(awardSummary.grandTotal)}</span>
                        {savingVsSingle > 0 && (
                          <span className="block text-xs text-green-700 dark:text-green-400">
                            {rupees(savingVsSingle)} less than buying all from one vendor
                          </span>
                        )}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.map((row) => {
                      const best = bestFor(row);
                      return (
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
                            const price = Number(qt.unit_price);
                            const qty = Number(qt.quantity ?? row.quantity);
                            const isLowest = best?.quotation_item_id === qt.quotation_item_id;
                            const others = row.quotes
                              .filter((o) => o !== qt && o.unit_price !== null)
                              .map((o) => Number(o.unit_price));
                            const warning = priceWarning(price, others);
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
                                    qt.awarded ? 'border-green-600 bg-green-50 dark:bg-green-950/40' : 'border-transparent',
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
                                    <span className="font-semibold">{rupees(price)}</span>
                                    {isLowest && <span className="text-[10px] font-semibold text-green-700">LOWEST</span>}
                                  </span>
                                  {qty > 1 && (
                                    <span className="block pl-5 text-xs text-muted-foreground">{rupees(price * qty)}</span>
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
                                <span className="text-xs text-muted-foreground">{rupees(Number(chosen.unit_price) * qty)}</span>
                                {best && chosen.quotation_item_id !== best.quotation_item_id && (
                                  <span className="block text-[11px] text-amber-700">not the lowest</span>
                                )}
                              </td>
                            );
                          })()}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {quotations.length === 1 && canManage && (
                <p className="px-4 py-3 text-xs text-amber-700">Add another vendor&apos;s quote to compare prices.</p>
              )}
            </>
          )}
        </div>
        {canManage && quotations.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4">
            <div className="text-sm">
              <b>
                {unchosenCount === 0
                  ? `All ${comparison.length} item${comparison.length === 1 ? '' : 's'} chosen`
                  : `${chosenCount} of ${comparison.length} chosen`}
              </b>
              {awardSummary.grandTotal > 0 && <span className="tabular-nums"> · {rupees(awardSummary.grandTotal)}</span>}
              {unchosenCount > 0 && chosenCount > 0 && (
                <span className="block text-xs text-muted-foreground">Items without a vendor will not be ordered.</span>
              )}
            </div>
            <Button className="h-11 px-6" disabled={chosenCount === 0 || submitAward.isPending} onClick={sendForApproval}>
              {submitAward.isPending ? 'Sending…' : 'Send for final approval'}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        )}
      </section>

      <input
        ref={pickerRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const chosen = e.target.files ? [...e.target.files] : [];
          e.target.value = '';
          if (!chosen.length) return;
          setPickedFiles(chosen);
          setUploadOpen(true);
        }}
      />
      {canManage && (
        <BulkQuotationUpload
          rfq={rfq}
          quotedSupplierIds={quotedSupplierIds}
          files={pickedFiles}
          onFilesTaken={() => setPickedFiles(null)}
          open={uploadOpen}
          onOpenChange={(o) => {
            setUploadOpen(o);
            if (!o) void queryClient.invalidateQueries({ queryKey: ['procurement-journey'] });
          }}
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

      {/* Removing a quote throws away its prices and any choice made on it — ask first. */}
      <AlertDialog open={!!removeQuote} onOpenChange={(o) => !o && setRemoveQuote(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeQuote?.name}&apos;s quote?</AlertDialogTitle>
            <AlertDialogDescription>
              Its prices and any item chosen from it are removed. You can upload it again afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const q = removeQuote;
                setRemoveQuote(null);
                if (q) void run(() => deleteQuotation.mutateAsync(q.id), 'Quote removed');
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {quotations.length > 0 && (
        <QuotationChatPanel
          open={chatOpen}
          onOpenChange={setChatOpen}
          rfqId={rfqId}
          rfqNumber={rfq.source_request?.request_number || rfq.rfq_number}
          canApply={canEditQuotes}
          lockedReason={
            isLocked
              ? awaitingApproval
                ? 'These quotes are waiting for the Super Admin’s final approval, so choices are locked.'
                : 'This purchase is past the quotes stage, so choices are no longer changed from here.'
              : null
          }
          livePrices={livePrices}
          awardedIds={awardedIds}
        />
      )}

      <Dialog open={sendBackOpen} onOpenChange={setSendBackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send back to the store</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="send-back-reason">What needs to change?</Label>
            <Textarea
              id="send-back-reason"
              value={sendBackReason}
              onChange={(e) => setSendBackReason(e.target.value)}
              placeholder="e.g. Get one more quote, or choose the cheaper vendor for item 2."
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
    </div>
  );
}

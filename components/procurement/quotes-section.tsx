'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { buildComparisonRows } from '@/lib/services/procurement/quotation-service';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useApproveStep, useDecideStep, useRequestApprovals } from '@/hooks/procurement/use-approval-chains';
import { useRfq, useSubmitAward, useApproveAward, useSendBackAward } from '@/hooks/procurement/use-rfqs';
import {
  useQuotationsForRfq,
  useDeleteQuotation,
  useAwardLine,
  useUnawardLine,
} from '@/hooks/procurement/use-quotations';
import { AlertBox } from '@/components/ui/alert-box';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
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
  FilePen,
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
  MoreHorizontal,
  ChevronRight,
} from 'lucide-react';
import { QuotationChatPanel } from '@/components/procurement/quotation-chat-panel';
import { BulkQuotationUpload } from '@/components/procurement/bulk-quotation-upload';
import { VendorScoreBadge } from '@/components/procurement/vendor-score-badge';
import { useVendorScores } from '@/hooks/procurement/use-ratings';
import { ProcurementRfqService } from '@/lib/services/procurement/rfq-service';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';
import { cn } from '@/lib/utils';
import { ReviseQuoteSheet } from '@/components/procurement/renegotiate-sheet';
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

export function QuotesSection({
  rfqId,
  requestId,
  onApproved,
  itemApproval,
  finalApprover,
}: {
  rfqId: string;
  /** The purchase request — its category's Final approval list decides who approves here. */
  requestId?: string;
  onApproved?: () => void;
  /** "name on date" of sign-off 1, shown among the final-approval checks. */
  itemApproval?: string | null;
  /**
   * Who gives the final approval, from the category's Final approval steps
   * ("A → B"). Those steps are only copied onto the request when it is sent,
   * so before that this is the only way to name them. Null = Super Admin.
   */
  finalApprover?: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canAccess, isSuperAdmin } = usePermissions();
  const { profile } = useAuth();
  // Final approval: the category's set approvers when it has them, else the Super Admin.
  const { data: approvals = [] } = useRequestApprovals(requestId);
  const finalStep = approvals.find((a) => a.stage === 'final' && a.status === 'pending') ?? null;
  const canFinalApprove = finalStep ? isSuperAdmin || finalStep.approver_ids.includes(profile?.id ?? '') : isSuperAdmin;
  const approveStep = useApproveStep();
  const decideStep = useDecideStep();
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
  // A vendor's revised quotation (e.g. the Super Admin asked for the final discounted rate).
  const [reviseQuote, setReviseQuote] = useState<{ id: string; name: string } | null>(null);
  const [choosingAll, setChoosingAll] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  // Big comparisons (50 items × 5 vendors): narrow the rows, and fold the table away
  // once the choice is sent for final approval.
  const [rowFilter, setRowFilter] = useState<'all' | 'not_lowest' | 'missing'>('all');
  const [rowSearch, setRowSearch] = useState('');
  const [showAllQuotes, setShowAllQuotes] = useState(false);
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
  // Vendor score from past deliveries + ratings (the rating feedback loop).
  const { data: vendorScores } = useVendorScores(vendorColumns.map((v) => v.supplierId));
  // Choosing a Watch-grade vendor needs a reason the approver can read.
  const [watchOpen, setWatchOpen] = useState(false);
  const [watchReason, setWatchReason] = useState('');
  const [savingWatch, setSavingWatch] = useState(false);

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
    if (finalStep && requestId) {
      try {
        const result = await approveStep.mutateAsync({ requestId });
        toast.success(result === 'next' ? 'Approved — sent to the next approver' : 'Approved — orders created');
        if (result === 'approved') onApproved?.();
      } catch (e) {
        toast.error(errorMessage(e, 'Approval failed'));
      }
      return;
    }
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

  const autoKey = useRef('');
  useEffect(() => {
    const editable =
      !!rfq &&
      (isSuperAdmin || canAccess('procurement', 'quotation_manage')) &&
      !['pending_award_approval', 'awarded', 'closed', 'cancelled'].includes(rfq.status);
    if (!editable || quotesLoading || choosingAll || !quotations.length) return;
    const todo = comparison
      .filter((row) => !row.quotes.some((q) => q.awarded))
      .map((row) => ({ row, best: bestFor(row) }))
      .filter((x) => x.best);
    const key = quotations.map((q) => q.id).sort().join(',');
    if (!todo.length || autoKey.current === key) return;
    autoKey.current = key;
    void (async () => {
      try {
        for (const { row, best } of todo) {
          await awardLine.mutateAsync({ rfqItemId: row.rfq_item_id, quotationItemId: best!.quotation_item_id });
        }
      } catch {
        /* the person can still choose by hand */
      } finally {
        void queryClient.invalidateQueries({ queryKey: ['procurement-journey'] });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparison, quotations, quotesLoading, rfq?.status]);

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

  const wrapQuotes = (node: React.ReactNode) =>
    isLocked ? (
      <Sheet open={showAllQuotes} onOpenChange={setShowAllQuotes}>
        <SheetContent
          side="right"
          className={`flex w-full flex-col gap-0 p-0 ${
            vendorColumns.length >= 3 ? 'sm:max-w-5xl' : vendorColumns.length === 2 ? 'sm:max-w-2xl' : 'sm:max-w-md'
          }`}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Quote comparison</SheetTitle>
            <SheetDescription>Every vendor&apos;s price for every item.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{node}</div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3">
            <span className="text-sm text-muted-foreground">
              {awardSummary.grandTotal > 0 && (
                <>
                  Chosen <b className="tabular-nums text-foreground">{rupees(awardSummary.grandTotal)}</b>
                  {savingVsSingle > 0 ? ` · ${rupees(savingVsSingle)} less than one vendor` : ''}
                </>
              )}
            </span>
            <Button variant="outline" className="h-10" onClick={() => setShowAllQuotes(false)}>
              {awaitingApproval ? 'Back to approval' : 'Close'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    ) : (
      node
    );

  // Chosen vendors graded D (Watch). Their names go in the reason prompt.
  const watchVendors = [...new Set(comparison.flatMap((r) => r.quotes.filter((q) => q.awarded).map((q) => q.supplier_id)))]
    .filter((sid) => vendorScores?.get(sid)?.grade === 'D')
    .map((sid) => vendorColumns.find((v) => v.supplierId === sid)?.name ?? 'Vendor');

  const submitWithReason = async (reason: string | null) => {
    setSavingWatch(true);
    try {
      // Clear a stale reason too, so the approver never reads one for a vendor no longer chosen.
      if (reason !== null || rfq.award_watch_reason) await ProcurementRfqService.setAwardWatchReason(rfqId, reason);
      await run(() => submitAward.mutateAsync(rfqId), 'Sent for final approval');
      setWatchOpen(false);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the reason'));
    } finally {
      setSavingWatch(false);
    }
  };
  const sendForApproval = () => (watchVendors.length > 0 ? setWatchOpen(true) : void submitWithReason(null));

  return (
    <div className="space-y-3">
      {rfq.award_rejection_reason && !isLocked && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          <p className="font-medium">The Super Admin sent this back.</p>
          <p className="mt-1">Reason: {rfq.award_rejection_reason}</p>
        </div>
      )}

      {/* ── Sign-off 2 as a receipt: items under each vendor, every amount in one
          right-hand column ending in the total; only exceptions are called out;
          one place to decide. ── */}
      {awaitingApproval &&
        (() => {
          type Line = { id: string; name: string; qty: number; each: number; above: number; was: number | null };
          const groups = new Map<string, { name: string; total: number; lines: Line[] }>();
          const aboveLowest: Line[] = [];
          const noQuote: string[] = [];
          for (const row of comparison) {
            const chosen = row.quotes.find((q) => q.awarded && q.unit_price !== null);
            if (!chosen) {
              noQuote.push(row.item_name);
              continue;
            }
            const best = bestFor(row);
            const each = Number(chosen.unit_price);
            const qty = Number(chosen.quantity ?? row.quantity);
            const was =
              chosen.previous_unit_price != null && Number(chosen.previous_unit_price) !== each
                ? Number(chosen.previous_unit_price)
                : null;
            const line = { id: row.rfq_item_id, name: row.item_name, qty, each, above: best ? each - best.price : 0, was };
            if (line.above > 0) aboveLowest.push(line);
            const g = groups.get(chosen.supplier_id) ?? { name: chosen.supplier_name, total: 0, lines: [] };
            g.total += each * qty;
            g.lines.push(line);
            groups.set(chosen.supplier_id, g);
          }
          const vendors = [...groups.entries()];
          const several = vendors.length > 1;
          const itemCount = comparison.length - noQuote.length;
          const names = (list: string[]) => (list.length > 3 ? `${list.slice(0, 3).join(' · ')} +${list.length - 3} more` : list.join(' · '));
          const AMT = 'grid grid-cols-[minmax(0,1fr)_7.5rem] items-baseline gap-3';
          const lineRow = (l: Line) => (
            <div key={l.id} className={`${AMT} text-sm`}>
              <span className="min-w-0 truncate">
                {l.name}{' '}
                <span className="text-muted-foreground">
                  · {l.qty} ×{' '}
                  {l.was != null && <s className="mr-1">{rupees(l.was)}</s>}
                  {rupees(l.each)}
                </span>
                {l.was != null && <span className="text-primary"> revised</span>}
                {l.above > 0 && <span className="text-foreground"> +{rupees(l.above)}</span>}
              </span>
              <span className="text-right tabular-nums">{rupees(l.each * l.qty)}</span>
            </div>
          );
          const pdfLink = (id: string, name: string) => {
            const q = quotations.find((x) => x.supplier_id === id);
            return q?.document_file_id ? (
              <button type="button" className="text-xs font-normal text-primary hover:underline" onClick={() => setPdfQuote({ fileId: q.document_file_id!, name })}>
                Quote PDF
              </button>
            ) : null;
          };
          return (
            <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="px-6 pb-3 pt-5">
                <h2 className="text-lg font-semibold">
                  {canFinalApprove
                    ? 'Approve this purchase?'
                    : finalStep
                      ? `Waiting for ${finalStep.label}’s final approval`
                      : 'Waiting for the Super Admin’s final approval'}
                </h2>
              </div>

              <div className="px-6">
                {vendors.map(([id, g]) =>
                  several ? (
                    <details key={id} className="group border-t">
                      <summary className="grid cursor-pointer list-none grid-cols-[1rem_minmax(0,1fr)_7.5rem] items-baseline gap-2.5 py-3">
                        <ChevronRight className="h-4 w-4 self-center text-muted-foreground transition-transform group-open:rotate-90" />
                        <span className="min-w-0 truncate text-[13px] font-bold uppercase tracking-wide">
                          {g.name}{' '}
                          <span className="font-normal normal-case tracking-normal text-muted-foreground">
                            · {g.lines.length} item{g.lines.length === 1 ? '' : 's'}
                          </span>{' '}
                          <VendorScoreBadge score={vendorScores?.get(id)} vendorName={g.name} className="normal-case tracking-normal" />
                        </span>
                        <span className="text-right font-semibold tabular-nums">{rupees(g.total)}</span>
                      </summary>
                      <div className="max-h-72 space-y-1.5 overflow-y-auto pb-3 pl-[1.625rem]">
                        {g.lines.map(lineRow)}
                        {pdfLink(id, g.name)}
                      </div>
                    </details>
                  ) : (
                    <div key={id} className="border-t">
                      <div className="flex items-baseline justify-between gap-3 pb-1.5 pt-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-[13px] font-bold uppercase tracking-wide">{g.name}</span>
                          <VendorScoreBadge score={vendorScores?.get(id)} vendorName={g.name} />
                        </span>
                        {pdfLink(id, g.name)}
                      </div>
                      <div className="max-h-72 space-y-1.5 overflow-y-auto pb-3">{g.lines.map(lineRow)}</div>
                    </div>
                  )
                )}
                <div className={`${several ? 'grid grid-cols-[1rem_minmax(0,1fr)_7.5rem] gap-2.5' : AMT} border-t-2 border-foreground py-3 text-base font-bold`}>
                  {several && <span />}
                  <span>
                    Total · {vendors.length} order{vendors.length === 1 ? '' : 's'}
                    {several || itemCount > 1 ? ` · ${itemCount} items` : ''}
                  </span>
                  <span className="text-right tabular-nums">{rupees(awardSummary.grandTotal)}</span>
                </div>
              </div>

              {/* exceptions only — nothing here when everything is normal */}
              {rfq.award_watch_reason && (
                <div className="mx-6 mb-3 rounded-xl border border-red-600/40 bg-red-50 px-3 py-2.5 text-[13px] text-red-900 dark:bg-red-950/40 dark:text-red-200">
                  <b>Vendor on Watch chosen</b> — {rfq.award_watch_reason}
                </div>
              )}
              {(vendorColumns.length === 1 || aboveLowest.length > 0 || noQuote.length > 0) && (
                <div className="mx-6 mb-4 space-y-1 rounded-xl bg-secondary/20 px-3 py-2.5 text-[13px] text-foreground">
                  {vendorColumns.length === 1 && (
                    <p>
                      <b>Only 1 vendor quoted</b> — there was no other price to compare against.
                    </p>
                  )}
                  {aboveLowest.length > 0 && (
                    <p>
                      <b>
                        {aboveLowest.length} item{aboveLowest.length === 1 ? '' : 's'} above the lowest price
                      </b>{' '}
                      — {names(aboveLowest.map((l) => `${l.name} +${rupees(l.above)}`))}
                    </p>
                  )}
                  {noQuote.length > 0 && (
                    <p>
                      <b>
                        {noQuote.length} item{noQuote.length === 1 ? '' : 's'} had no quote
                      </b>{' '}
                      — {names(noQuote)} — won&apos;t be ordered
                    </p>
                  )}
                </div>
              )}

              {(canFinalApprove || vendorColumns.length > 1) && (
                <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/40 px-6 py-3">
                  {vendorColumns.length > 1 && (
                    <button type="button" className="mr-auto text-sm text-primary hover:underline" onClick={() => setShowAllQuotes(true)}>
                      Compare all quotes
                    </button>
                  )}
                  {canFinalApprove && (
                    <>
                      <Button variant="outline" className="h-10 px-4" onClick={() => setSendBackOpen(true)}>
                        Send back
                      </Button>
                      <Button className="h-10 px-5" onClick={handleApprove} disabled={approveAward.isPending || approveStep.isPending}>
                        <Check className="mr-1.5 h-4 w-4" />
                        {approveAward.isPending || approveStep.isPending ? 'Approving…' : several ? `Approve ${vendors.length} orders` : 'Approve & order'}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </section>
          );
        })()}

      {/* ── ONE card: header with a small "Add quote PDFs" button, the comparison
          (vendors across, items down), and the send button at the bottom. ── */}
      {isLocked && !awaitingApproval && quotations.length > 0 && (
        <button
          type="button"
          className="text-sm text-primary hover:underline"
          onClick={() => setShowAllQuotes(true)}
        >
          See the quotes ({vendorColumns.length} vendor{vendorColumns.length === 1 ? '' : 's'})
        </button>
      )}
      {wrapQuotes(
      <section className={isLocked ? 'min-h-full bg-card' : 'overflow-hidden rounded-2xl border bg-card shadow-sm'}>
        <div className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${isLocked ? 'pr-14' : ''}`}>
          <div>
            {canManage ? (
              <>
                <h2 className="text-lg font-semibold">
                  {quotations.length ? 'Compare quotes and pick vendors' : 'Collect vendor quotes'}
                </h2>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">{vendorColumns.length === 1 ? 'The quote' : 'Compare quotes'}</h2>
                <p className="text-xs text-muted-foreground">
                  {vendorColumns.length} vendor{vendorColumns.length === 1 ? '' : 's'} · {comparison.length} item
                  {comparison.length === 1 ? '' : 's'}
                  {vendorColumns.length > 1 && (
                    <>
                      {' · '}
                      <span className="text-primary">green = chosen</span>
                    </>
                  )}
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            {canManage && quotations.length > 0 && (
              <Button size="sm" variant="outline" className="h-10" onClick={pickPdfs}>
                <Upload className="mr-1.5 h-4 w-4" />
                Add quote PDFs
              </Button>
            )}
            {!canManage && quotations.length > 1 && (
              <Button size="sm" variant="outline" className="h-10" onClick={() => setChatOpen(true)}>
                <Sparkles className="mr-1.5 h-4 w-4" />
                Ask AI
              </Button>
            )}
            {canManage && (
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
                  {canManage && quotations.length > 1 && (
                    <DropdownMenuItem onClick={chooseLowestForAll} disabled={choosingAll}>
                      <Wand2 className="mr-2 h-4 w-4" />
                      Reset to the lowest prices
                    </DropdownMenuItem>
                  )}
                  {canManage && quotations.length > 0 && (
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
          ) : isLocked && vendorColumns.length === 1 ? (
            (() => {
              const q = quotations[0];
              const v = vendorColumns[0];
              const terms = [
                q.vendor_quote_number ? `Quote ${q.vendor_quote_number}` : null,
                q.delivery_time_days != null ? `${q.delivery_time_days} days delivery` : null,
                q.payment_terms || null,
              ].filter(Boolean);
              return (
                <div>
                  <div className="flex items-start justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold">
                        {v.name}
                        <VendorScoreBadge score={vendorScores?.get(v.supplierId)} vendorName={v.name} />
                      </p>
                      {terms.length > 0 && <p className="text-xs text-muted-foreground">{terms.join(' · ')}</p>}
                    </div>
                    {q.document_file_id ? (
                      <Button size="sm" variant="outline" onClick={() => setPdfQuote({ fileId: q.document_file_id!, name: v.name })}>
                        <FileText className="mr-1.5 h-4 w-4" />
                        Quote PDF
                      </Button>
                    ) : q.document_url ? (
                      <Button size="sm" variant="outline" asChild>
                        <a href={q.document_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-1.5 h-4 w-4" />
                          Quote PDF
                        </a>
                      </Button>
                    ) : null}
                  </div>
                  <ul className="border-t">
                    {comparison.map((row) => {
                      const qt = cellFor(row, v.supplierId);
                      const price = qt?.unit_price != null ? Number(qt.unit_price) : null;
                      const qty = Number(qt?.quantity ?? row.quantity);
                      return (
                        <li key={row.rfq_item_id} className="flex items-center gap-3 border-b px-5 py-3 text-sm">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{row.item_name}</span>
                            <span className="text-xs text-muted-foreground">
                              {price != null ? `${qty} × ${rupees(price)}` : 'Not quoted'}
                            </span>
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums">{price != null ? rupees(price * qty) : '—'}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="flex items-center justify-between px-5 py-3 text-sm font-semibold">
                    <span>Total</span>
                    <span className="tabular-nums">{rupees(vendorTotals.get(v.supplierId)?.total ?? 0)}</span>
                  </div>
                  <p className="px-5 pb-4 text-xs text-muted-foreground">Only one vendor quoted, so there is nothing to compare against.</p>
                </div>
              );
            })()
          ) : (
            <>
              {comparison.length > 8 && (
                <div className="flex flex-wrap items-center gap-2 border-b px-5 py-2.5">
                  {(
                    [
                      ['all', `All ${comparison.length}`],
                      [
                        'not_lowest',
                        `Above lowest ${
                          comparison.filter((row) => {
                            const chosen = row.quotes.find((q) => q.awarded);
                            const best = bestFor(row);
                            return !!chosen && !!best && chosen.quotation_item_id !== best.quotation_item_id;
                          }).length
                        }`,
                      ],
                      ['missing', `No quote ${comparison.filter((row) => !row.quotes.some((q) => q.unit_price !== null)).length}`],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={rowFilter === value}
                      onClick={() => setRowFilter(value)}
                      className={cn(
                        'h-8 rounded-full border px-3 text-xs',
                        rowFilter === value ? 'border-foreground bg-foreground text-background' : 'hover:border-foreground/40'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                  <Input
                    value={rowSearch}
                    onChange={(e) => setRowSearch(e.target.value)}
                    placeholder="Find an item"
                    aria-label="Find an item"
                    className="ml-auto h-8 w-full text-xs sm:w-48"
                  />
                </div>
              )}
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="sticky left-0 top-0 z-30 w-48 min-w-[160px] max-w-[220px] border-b bg-muted px-5 py-2.5 align-middle text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Item
                      </th>
                      {vendorColumns.map((v) => {
                        const t = vendorTotals.get(v.supplierId);
                        const q = quotations.find((x) => x.supplier_id === v.supplierId);
                        const all = !!t && t.count === comparison.length;
                        const terms = [
                          all ? null : `${t?.count ?? 0} of ${comparison.length} items`,
                          q?.delivery_time_days != null ? `${q.delivery_time_days} days` : null,
                          q?.payment_terms || null,
                        ].filter(Boolean);
                        return (
                          <th key={v.supplierId} className="sticky top-0 z-20 min-w-[150px] border-b border-l bg-muted px-4 py-2.5 align-middle font-normal">
                            <span className="flex items-center gap-2">
                              <span className="min-w-0 truncate text-sm font-semibold" title={v.name}>
                                {v.name}
                              </span>
                              <VendorScoreBadge score={vendorScores?.get(v.supplierId)} vendorName={v.name} />
                              <span className="ml-auto flex shrink-0 items-center gap-1.5 text-muted-foreground">
                                {q?.document_file_id ? (
                                  <button
                                    type="button"
                                    title="View quotation PDF"
                                    aria-label={`View ${v.name} quotation PDF`}
                                    className="hover:text-primary"
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
                                    className="hover:text-primary"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                ) : null}
                                {canManage && q && (
                                  <button
                                    type="button"
                                    title="Remove this quote"
                                    aria-label={`Remove ${v.name} quote`}
                                    className="hover:text-destructive"
                                    onClick={() => setRemoveQuote({ id: q.id, name: v.name })}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </span>
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              <b className="tabular-nums text-foreground">{t ? rupees(t.total) : '—'}</b> total
                              {terms.length ? ` · ${terms.join(' · ')}` : ''}
                              {q?.revision_no ? (
                                <span
                                  className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary"
                                  title={q.revision_reason ?? undefined}
                                >
                                  REVISED{q.revision_no > 1 ? ` ×${q.revision_no}` : ''}
                                </span>
                              ) : null}
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {comparison
                      .filter((row) => {
                        if (rowSearch.trim() && !row.item_name.toLowerCase().includes(rowSearch.trim().toLowerCase())) return false;
                        if (rowFilter === 'missing') return !row.quotes.some((q) => q.unit_price !== null);
                        if (rowFilter === 'not_lowest') {
                          const chosen = row.quotes.find((q) => q.awarded);
                          const best = bestFor(row);
                          return !!chosen && !!best && chosen.quotation_item_id !== best.quotation_item_id;
                        }
                        return true;
                      })
                      .map((row) => {
                      const best = bestFor(row);
                      return (
                        <tr key={row.rfq_item_id}>
                          <td className="sticky left-0 z-10 w-48 min-w-[160px] max-w-[220px] border-b bg-background px-5 py-2 align-middle">
                            <span className="block truncate font-medium" title={row.item_name}>
                              {row.item_name}
                            </span>
                            <span className="text-xs text-muted-foreground">× {row.quantity}</span>
                          </td>
                          {vendorColumns.map((v) => {
                            const qt = cellFor(row, v.supplierId);
                            if (!qt || qt.unit_price === null) {
                              return (
                                <td key={v.supplierId} className="border-b border-l px-4 py-2 align-middle text-xs text-muted-foreground">
                                  Not quoted
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
                              <td key={v.supplierId} className="border-b border-l p-0 align-middle">
                                <button
                                  type="button"
                                  disabled={!canManage}
                                  onClick={toggle}
                                  aria-pressed={qt.awarded}
                                  title={offered || undefined}
                                  className={cn(
                                    'flex w-full items-center gap-2 px-4 py-2 text-left transition-colors',
                                    qt.awarded ? 'bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]' : '',
                                    canManage && !qt.awarded && 'hover:bg-muted/60',
                                    !canManage && 'cursor-default'
                                  )}
                                >
                                  {qt.awarded ? (
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                                  ) : (
                                    canManage && <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                                  )}
                                  <span className="min-w-0">
                                    {qt.previous_unit_price != null && Number(qt.previous_unit_price) !== price && (
                                      <span className="mr-1 text-xs tabular-nums text-muted-foreground line-through">
                                        {rupees(Number(qt.previous_unit_price))}
                                      </span>
                                    )}
                                    <span className="font-semibold tabular-nums">{rupees(price)}</span>
                                    <span className="text-xs text-muted-foreground"> each</span>
                                    {isLowest && vendorColumns.length > 1 && (
                                      <span className="ml-1.5 text-[10px] font-semibold text-primary">LOWEST</span>
                                    )}
                                    {warning && (
                                      <span className="block text-[11px] font-medium text-destructive" title={warning}>
                                        ⚠ Check price
                                      </span>
                                    )}
                                  </span>
                                  {qty > 1 && (
                                    <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{rupees(price * qty)}</span>
                                  )}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </>
          )}
        </div>
        {canManage && quotations.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
            {/* Only what the table above doesn't already say. */}
            <div className="min-w-0 text-sm">
              <span className="block text-muted-foreground">
                Final approval by{' '}
                <span className="font-medium text-foreground">
                  {finalStep?.label ?? finalApprover ?? 'Super Admin'}
                </span>
              </span>
              {awardSummary.vendors.length > 1 && (
                <span className="block">
                  <b className="tabular-nums">{rupees(awardSummary.grandTotal)}</b>{' '}
                  <span className="text-muted-foreground">from {awardSummary.vendors.length} vendors</span>
                  {savingVsSingle > 0 && (
                    <span className="text-primary"> · {rupees(savingVsSingle)} less than one vendor</span>
                  )}
                </span>
              )}
              {unchosenCount > 0 && chosenCount > 0 && (
                <span className="block text-xs text-foreground">
                  {unchosenCount} item{unchosenCount === 1 ? '' : 's'} not chosen won&apos;t be ordered
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* A vendor's revised quotation (e.g. the Super Admin asked for the final
                  discounted rate). One chosen vendor: open it straight away; else pick. */}
              {(() => {
                const chosenIds = new Set(
                  comparison.flatMap((row) => row.quotes.filter((qt) => qt.awarded).map((qt) => qt.supplier_id))
                );
                const chosenQuotes = quotations.filter((q) => chosenIds.has(q.supplier_id));
                const direct = chosenQuotes.length === 1 ? chosenQuotes[0] : quotations.length === 1 ? quotations[0] : null;
                const open = (q: (typeof quotations)[number]) => setReviseQuote({ id: q.id, name: q.supplier?.name ?? 'Vendor' });
                return direct ? (
                  <Button variant="outline" className="h-11" onClick={() => open(direct)}>
                    <FilePen className="mr-1.5 h-4 w-4" />
                    Revised quotation
                  </Button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="h-11">
                        <FilePen className="mr-1.5 h-4 w-4" />
                        Revised quotation
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {[...chosenQuotes, ...quotations.filter((q) => !chosenIds.has(q.supplier_id))].map((q) => (
                        <DropdownMenuItem key={q.id} onClick={() => open(q)}>
                          {q.supplier?.name ?? 'Vendor'}
                          {chosenIds.has(q.supplier_id) && <span className="ml-2 text-xs text-primary">chosen</span>}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              })()}
              <Button className="h-11 px-6" disabled={chosenCount === 0 || submitAward.isPending} onClick={sendForApproval}>
                {submitAward.isPending ? 'Sending…' : 'Send for final approval'}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </section>
      )}

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

      <Dialog open={watchOpen} onOpenChange={(o) => !savingWatch && setWatchOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vendor on Watch</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {watchVendors.join(', ')} {watchVendors.length === 1 ? 'has' : 'have'} a poor record on past deliveries
            (late, short or rejected items, or low ratings). Say why you are still choosing{' '}
            {watchVendors.length === 1 ? 'this vendor' : 'these vendors'} — the approver will see it.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="watch-reason">Reason</Label>
            <Textarea
              id="watch-reason"
              value={watchReason}
              onChange={(e) => setWatchReason(e.target.value)}
              placeholder="e.g. Only vendor with this brand; delivery issues were resolved in August"
              rows={3}
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWatchOpen(false)} disabled={savingWatch}>
              Back
            </Button>
            <Button
              disabled={watchReason.trim().length < 5 || savingWatch}
              onClick={() => void submitWithReason(watchReason.trim())}
            >
              {savingWatch ? 'Sending…' : 'Send for final approval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  if (finalStep && requestId) {
                    await decideStep.mutateAsync({ requestId, decision: 'return', reason: sendBackReason });
                  } else {
                    await sendBack.mutateAsync({ rfqId, reason: sendBackReason });
                  }
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
      {reviseQuote && (() => {
        const q = quotations.find((x) => x.id === reviseQuote.id);
        return q && rfq ? (
          <ReviseQuoteSheet
            quotation={q}
            rfqItems={rfq.items}
            vendorName={reviseQuote.name}
            open
            onOpenChange={(o) => !o && setReviseQuote(null)}
          />
        ) : null;
      })()}
    </div>
  );
}

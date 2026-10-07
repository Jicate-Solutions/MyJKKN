'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { FileUp, Loader2, Pencil, Sparkles, AlertTriangle } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/utils/supabase-error';
import { formatDateDMY } from '@/lib/utils/date-format';
import { readQuotationPdf } from '@/lib/procurement/read-quotation-pdf';
import { comparePacks, isMeasuredUnit, parsePack, requestedPack } from '@/lib/procurement/pack-size';
import { useProposePoRevision } from '@/hooks/procurement/use-purchase-orders';
import { useReviseQuotation } from '@/hooks/procurement/use-quotations';
import type { PoWithItems, QuotationWithItems, ProcurementRfqItem } from '@/types/procurement';

/**
 * A vendor's revised quotation — upload it and the AI does the rest.
 *
 * The store only drops the PDF. The AI reads every price (same reader and pack-size
 * check as the quotes section), the quotation number, date, validity, delivery and
 * payment terms. What it read is shown as a short summary to glance at; editing is
 * one click away but never required. No PDF? Prices can be typed instead.
 *
 *   ReviseQuoteSheet   before the order — updates that vendor's quote in place
 *   RenegotiateSheet   after the order — proposes new prices for the Super Admin
 */

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export interface RevisedLine {
  /** PO item id or quotation item id — what the save sends back. */
  id: string;
  rfqItemId: string | null;
  name: string;
  spec: string | null;
  quantity: number;
  unitLabel: string | null;
  oldPrice: number;
}

export interface RevisedPrices {
  lines: Array<{ id: string; unit_price: number }>;
  reason: string;
  quote: {
    vendor_quote_number?: string | null;
    quote_date?: string | null;
    validity_date?: string | null;
    delivery_time_days?: number | null;
    payment_terms?: string | null;
  };
}

function RevisedPricesSheet({
  open,
  onOpenChange,
  title,
  description,
  rfqId,
  lines: items,
  submitLabel,
  noteLabel,
  defaultReason,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  rfqId: string | null;
  lines: RevisedLine[];
  submitLabel: string;
  noteLabel: string;
  /** Used when nobody writes a note — the history still says what happened. */
  defaultReason: (quoteNo: string) => string;
  saving: boolean;
  /** Resolve with the success message to close the sheet; throw to keep it open. */
  onSave: (v: RevisedPrices) => Promise<string>;
}) {
  const [stage, setStage] = useState<'upload' | 'reading' | 'review'>('upload');
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [quoteNo, setQuoteNo] = useState('');
  const [quoteDate, setQuoteDate] = useState('');
  const [validity, setValidity] = useState('');
  const [deliveryDays, setDeliveryDays] = useState('');
  const [payment, setPayment] = useState('');
  const [note, setNote] = useState('');
  const [editPrices, setEditPrices] = useState(false);
  const [editDetails, setEditDetails] = useState(false);

  const priceOf = (id: string, old: number) => {
    const raw = prices[id];
    return raw === undefined || raw === '' ? old : Number(raw);
  };
  const oldTotal = items.reduce((n, it) => n + it.oldPrice * it.quantity, 0);
  const newTotal = items.reduce((n, it) => n + priceOf(it.id, it.oldPrice) * it.quantity, 0);
  const changed = items.filter((it) => priceOf(it.id, it.oldPrice) !== it.oldPrice);
  const bad = items.some((it) => !(priceOf(it.id, it.oldPrice) > 0));
  const termsChanged = !!(deliveryDays || payment || quoteNo || quoteDate || validity);
  const flagged = items.filter((it) => notes[it.id]);
  // Lines the AI was unsure about are always editable; the rest only on request.
  const editable = (id: string) => editPrices || !!notes[id];

  const readPdf = async (file: File) => {
    if (file.type && file.type !== 'application/pdf') {
      toast.error('Please upload the quotation as a PDF.');
      return;
    }
    if (!rfqId) {
      toast.error('There is no quotation request to match the PDF against — enter the prices instead.');
      setStage('review');
      setEditPrices(true);
      return;
    }
    setFileName(file.name);
    setStage('reading');
    try {
      const result = await readQuotationPdf(file, {
        id: rfqId,
        items: items
          .filter((it) => it.rfqItemId)
          .map((it) => ({
            id: it.rfqItemId as string,
            item_name: it.name,
            item_spec: it.spec,
            quantity: it.quantity,
            unit_label: it.unitLabel,
          })),
      });
      const nextPrices: Record<string, string> = {};
      const nextNotes: Record<string, string> = {};
      let matched = 0;
      for (const it of items) {
        const line = result.lines?.find((l) => l.rfq_item_id && l.rfq_item_id === it.rfqItemId);
        if (line?.unit_price == null) {
          nextNotes[it.id] = 'Not found in the PDF — enter the price, or leave it unchanged';
          continue;
        }
        // Same pack-size rule as the quotes section: a 100 ml price for a 500 ml ask is scaled.
        const check = comparePacks(requestedPack({ item_name: it.name, item_spec: it.spec }), parsePack(line.pack), {
          soldByMeasure: isMeasuredUnit(it.unitLabel),
        });
        let price = Number(line.unit_price);
        if (check.kind === 'scaled') {
          price = Math.round(price * check.factor * 100) / 100;
        } else if (check.kind === 'mismatch') {
          nextNotes[it.id] = `${check.reason} — check this price`;
        } else if (line.uncertain) {
          nextNotes[it.id] = 'The AI was not sure this is the same item — check it';
        }
        nextPrices[it.id] = String(price);
        matched++;
      }
      setPrices(nextPrices);
      setNotes(nextNotes);
      setQuoteNo(result.quote_number ?? '');
      setQuoteDate(result.quote_date ?? '');
      setValidity(result.validity_date ?? '');
      setDeliveryDays(result.delivery_days != null ? String(result.delivery_days) : '');
      setPayment(result.payment_terms ?? '');
      setStage('review');
      if (!matched) toast.error('No prices found in this PDF — enter them below');
    } catch (e) {
      toast.error(errorMessage(e, 'Could not read the PDF — try again, or enter the prices'));
      setStage('upload');
    }
  };

  const reset = () => {
    setStage('upload');
    setFileName(null);
    setPrices({});
    setNotes({});
    setQuoteNo('');
    setQuoteDate('');
    setValidity('');
    setDeliveryDays('');
    setPayment('');
    setEditPrices(false);
    setEditDetails(false);
  };

  const submit = async () => {
    try {
      const ok = await onSave({
        lines: items.map((it) => ({ id: it.id, unit_price: priceOf(it.id, it.oldPrice) })),
        reason: note.trim() || defaultReason(quoteNo),
        quote: {
          vendor_quote_number: quoteNo || null,
          quote_date: quoteDate || null,
          validity_date: validity || null,
          delivery_time_days: deliveryDays ? Number(deliveryDays) : null,
          payment_terms: payment || null,
        },
      });
      toast.success(ok);
      reset();
      setNote('');
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the new prices'));
    }
  };

  const details: Array<[string, string]> = (
    [
      ['Quotation no.', quoteNo],
      ['Date', quoteDate ? formatDateDMY(quoteDate) : ''],
      ['Valid till', validity ? formatDateDMY(validity) : ''],
      ['Delivery', deliveryDays ? `${deliveryDays} days` : ''],
      ['Payment', payment],
    ] as Array<[string, string]>
  ).filter(([, v]) => v);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-4 text-left">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 px-6 py-5">
          {stage === 'upload' && (
            <>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void readPdf(f);
                }}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors hover:border-primary hover:bg-primary/5',
                  dragging && 'border-primary bg-primary/5'
                )}
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <FileUp className="h-7 w-7" />
                </span>
                <span className="text-base font-bold">Upload the revised quotation</span>
                <span className="max-w-sm text-sm text-muted-foreground">
                  Drop the vendor&apos;s PDF here or click to choose it. The AI reads the prices, quotation number, date,
                  validity, delivery and payment terms.
                </span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void readPdf(f);
                    e.target.value = '';
                  }}
                />
              </label>
              <p className="text-center text-xs text-muted-foreground">
                No PDF?{' '}
                <button
                  type="button"
                  className="font-semibold text-primary hover:underline"
                  onClick={() => {
                    setStage('review');
                    setEditPrices(true);
                    setEditDetails(true);
                  }}
                >
                  Enter the new prices
                </button>
              </p>
            </>
          )}

          {stage === 'reading' && (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted/40 px-6 py-14 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-base font-bold">Reading {fileName}…</span>
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> Prices, quotation number, date, validity, delivery and
                payment terms
              </span>
            </div>
          )}

          {stage === 'review' && (
            <>
              {/* What was read, and from where */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  <span className="truncate">{fileName ? `Read from ${fileName}` : 'Entered by hand'}</span>
                </span>
                <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={reset}>
                  {fileName ? 'Upload a different PDF' : 'Upload a PDF instead'}
                </button>
              </div>

              {/* Total: the one number that matters */}
              <div className="rounded-2xl bg-primary/5 px-5 py-4 ring-1 ring-primary/20">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">New total</p>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-3 text-2xl font-extrabold tabular-nums">
                  {rupees(newTotal)}
                  {newTotal !== oldTotal && (
                    <>
                      <span className="text-base font-normal text-muted-foreground line-through">{rupees(oldTotal)}</span>
                      <span className={cn('text-sm font-bold', newTotal < oldTotal ? 'text-primary' : 'text-destructive')}>
                        {newTotal < oldTotal ? 'saves ' : 'costs '}
                        {rupees(Math.abs(newTotal - oldTotal))} {newTotal < oldTotal ? '' : 'more'}
                      </span>
                    </>
                  )}
                </p>
              </div>

              {flagged.length > 0 && (
                <p className="flex items-start gap-2 rounded-xl bg-secondary/20 px-3 py-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {flagged.length} price{flagged.length === 1 ? '' : 's'} to check — marked below.
                </p>
              )}

              {/* Prices */}
              <section className="rounded-xl border">
                <div className="flex items-center justify-between border-b px-4 py-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Prices</span>
                  {!editPrices && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      onClick={() => setEditPrices(true)}
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                  )}
                </div>
                {items.map((it) => {
                  const old = it.oldPrice;
                  const now = priceOf(it.id, old);
                  const diff = now !== old;
                  return (
                    <div key={it.id} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{it.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          × {it.quantity}
                          {it.unitLabel ? ` ${it.unitLabel}` : ''}
                        </span>
                        {notes[it.id] && <span className="block text-xs font-semibold text-foreground">⚠ {notes[it.id]}</span>}
                      </span>
                      {diff && <span className="text-sm tabular-nums text-muted-foreground line-through">{rupees(old)}</span>}
                      {editable(it.id) ? (
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          aria-label={`New price for ${it.name}`}
                          className={cn('h-9 w-28 text-right tabular-nums', diff && 'border-primary bg-primary/10')}
                          value={prices[it.id] ?? String(old)}
                          onChange={(e) => setPrices((m) => ({ ...m, [it.id]: e.target.value }))}
                        />
                      ) : (
                        <span className={cn('w-28 text-right text-sm font-bold tabular-nums', !diff && 'font-normal text-muted-foreground')}>
                          {diff ? rupees(now) : 'unchanged'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </section>

              {/* Quotation details */}
              <section className="rounded-xl border">
                <div className="flex items-center justify-between border-b px-4 py-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Quotation details</span>
                  {!editDetails && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      onClick={() => setEditDetails(true)}
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                  )}
                </div>
                {editDetails ? (
                  <div className="grid gap-3 p-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="rq-no">Quotation no.</Label>
                      <Input id="rq-no" value={quoteNo} onChange={(e) => setQuoteNo(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rq-date">Date</Label>
                      <Input id="rq-date" type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rq-valid">Valid till</Label>
                      <Input id="rq-valid" type="date" value={validity} onChange={(e) => setValidity(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rq-days">Delivery (days)</Label>
                      <Input
                        id="rq-days"
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={deliveryDays}
                        onChange={(e) => setDeliveryDays(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="rq-pay">Payment terms</Label>
                      <Input id="rq-pay" value={payment} onChange={(e) => setPayment(e.target.value)} />
                    </div>
                  </div>
                ) : details.length ? (
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 px-4 py-3 text-sm">
                    {details.map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="min-w-0 truncate font-medium">{v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="px-4 py-3 text-sm text-muted-foreground">Nothing else found — the old terms stay.</p>
                )}
              </section>

              <div className="space-y-1.5">
                <Label htmlFor="rq-note" className="text-muted-foreground">
                  {noteLabel}
                </Label>
                <Textarea
                  id="rq-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="min-h-[64px]"
                  placeholder={defaultReason(quoteNo)}
                />
              </div>
            </>
          )}
        </div>

        {stage === 'review' && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/40 px-6 py-3">
            <span className="text-xs text-muted-foreground">
              {bad
                ? 'Every price must be more than 0.'
                : changed.length
                  ? `${changed.length} price${changed.length === 1 ? '' : 's'} changed`
                  : termsChanged
                    ? 'Prices unchanged · terms updated'
                    : 'Nothing changed yet.'}
            </span>
            <Button
              className="h-10 px-5"
              disabled={bad || !(changed.length || termsChanged) || saving}
              onClick={() => void submit()}
            >
              {saving ? 'Saving…' : submitLabel}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** After the order: propose new prices; the order changes once the Super Admin approves. */
export function RenegotiateSheet({
  po,
  open,
  onOpenChange,
}: {
  po: PoWithItems;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const propose = useProposePoRevision();
  const vendor = po.supplier?.name ?? 'the vendor';
  return (
    <RevisedPricesSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Renegotiate ${po.po_number}`}
      description={`New prices from ${vendor}. The order keeps its number and changes only after the Super Admin approves.`}
      rfqId={po.rfq_id}
      lines={po.items.map((it) => ({
        id: it.id,
        rfqItemId: it.rfq_item_id,
        name: it.item_name,
        spec: it.item_spec,
        quantity: Number(it.ordered_quantity),
        unitLabel: it.unit_label,
        oldPrice: Number(it.unit_price),
      }))}
      submitLabel="Send for Super Admin approval"
      noteLabel="Note for the Super Admin (optional)"
      defaultReason={(no) => `Revised quotation${no ? ` ${no}` : ''} from ${vendor}`}
      saving={propose.isPending}
      onSave={async (v) => {
        await propose.mutateAsync({
          poId: po.id,
          lines: v.lines.map((l) => ({ po_item_id: l.id, unit_price: l.unit_price })),
          reason: v.reason,
          quote: v.quote,
        });
        return 'Sent to the Super Admin — the order changes once they approve';
      }}
    />
  );
}

/** Before the order: the vendor's revised quote replaces their prices (old ones kept). */
export function ReviseQuoteSheet({
  quotation,
  rfqItems,
  vendorName,
  open,
  onOpenChange,
}: {
  quotation: QuotationWithItems;
  rfqItems: ProcurementRfqItem[];
  vendorName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const revise = useReviseQuotation(quotation.rfq_id);
  const lines: RevisedLine[] = quotation.items
    .filter((qi) => qi.unit_price != null)
    .map((qi) => {
      const ri = rfqItems.find((r) => r.id === qi.rfq_item_id);
      return {
        id: qi.id,
        rfqItemId: qi.rfq_item_id,
        name: ri?.item_name ?? 'Item',
        spec: ri?.item_spec ?? null,
        quantity: Number(qi.quantity ?? ri?.quantity ?? 1),
        unitLabel: ri?.unit_label ?? null,
        oldPrice: Number(qi.unit_price),
      };
    });
  return (
    <RevisedPricesSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Revised quotation — ${vendorName}`}
      description="Upload the new quotation. The old prices stay visible to the Super Admin next to the new ones."
      rfqId={quotation.rfq_id}
      lines={lines}
      submitLabel="Save revised quotation"
      noteLabel="Note (optional)"
      defaultReason={(no) => `Revised quotation${no ? ` ${no}` : ''} from ${vendorName}`}
      saving={revise.isPending}
      onSave={async (v) => {
        await revise.mutateAsync({
          quotationId: quotation.id,
          lines: v.lines.map((l) => ({ quotation_item_id: l.id, unit_price: l.unit_price })),
          reason: v.reason,
          quote: v.quote,
        });
        return 'Revised quotation saved';
      }}
    />
  );
}

'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePurchaseOrder } from '@/hooks/procurement/use-purchase-orders';
import { useCreateGrn } from '@/hooks/procurement/use-grns';
import { matchLine } from '@/lib/services/procurement/three-way-match';
import { GRN_MATCH_CONFIG, type GrnLineInput } from '@/types/procurement';
import { StatusBadge } from '@/components/procurement/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';

// One editable row of the receiving form. Seeded from a PO line; the receiver fills
// in what actually arrived. ordered_remaining = PO ordered − already received.
interface LineDraft extends GrnLineInput {
  item_name: string;
  ordered_remaining: number;
  unit_label: string | null;
  po_unit_price: number | null;
}

export default function NewGrnPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const poId = searchParams.get('po') || '';
  const { profile } = useAuth();

  const { data: po, isLoading } = usePurchaseOrder(poId);
  const createGrn = useCreateGrn();

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[] | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // What the receiver EXPECTS on this invoice. Declared before the check runs, so the
  // comparison is measured against their intent instead of a hardcoded threshold. These
  // drive the live badges below and ride along on the AI read request.
  const [expectOpen, setExpectOpen] = useState(false);
  const [tolerancePct, setTolerancePct] = useState('0');
  const [requireBatchExpiry, setRequireBatchExpiry] = useState(false);
  const [maxInvoiceAgeDays, setMaxInvoiceAgeDays] = useState('');
  const [watchFor, setWatchFor] = useState('');

  const tolerance = Math.min(100, Math.max(0, Number(tolerancePct) || 0));
  const expectations = {
    tolerance_pct: tolerance || null,
    require_batch_expiry: requireBatchExpiry,
    max_invoice_age_days: Number(maxInvoiceAgeDays) || null,
    watch_for: watchFor.trim() || null,
  };
  /** True when the receiver has actually set something — drives the "on" hint on the toggle. */
  const hasExpectations =
    tolerance > 0 || requireBatchExpiry || !!expectations.max_invoice_age_days || !!expectations.watch_for;

  // Seed drafts once the PO loads. Default received = full outstanding qty, all accepted.
  const drafts = useMemo<LineDraft[]>(() => {
    if (lines) return lines;
    if (!po) return [];
    return po.items.map((it) => {
      const remaining = Number(it.ordered_quantity) - Number(it.received_quantity ?? 0);
      return {
        po_item_id: it.id,
        item_name: it.item_name,
        ordered_remaining: remaining,
        unit_label: it.unit_label,
        po_unit_price: Number(it.unit_price) || null,
        invoice_quantity: remaining,
        received_quantity: remaining,
        accepted_quantity: remaining,
        rejected_quantity: 0,
        missing_quantity: 0,
        rejection_reason: null,
        replacement_required: false,
        batch_number: null,
        expiry_date: null,
        manufacturing_date: null,
        cost: null,
      };
    });
  }, [po, lines]);

  const update = (idx: number, patch: Partial<LineDraft>) => {
    setLines((prev) => {
      const base = prev ?? drafts;
      return base.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    });
  };

  const num = (v: string) => (v === '' ? 0 : Number(v));

  if (!poId) {
    return (
      <ContentLayout title="Receive Goods">
        <p className="text-muted-foreground py-12 text-center">
          Open a Purchase Order and choose “Create GRN” to receive against it.
        </p>
      </ContentLayout>
    );
  }
  if (isLoading) {
    return (
      <ContentLayout title="Receive Goods">
        <div className="flex items-center justify-center py-16">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }
  if (!po) {
    return (
      <ContentLayout title="Receive Goods">
        <p className="text-muted-foreground py-12 text-center">Purchase order not found.</p>
      </ContentLayout>
    );
  }

  // Check the invoice date against what the receiver expects. A WARNING only — the goods are
  // already at the dock, so an odd date must never block recording what arrived. It exists to
  // catch a back-dated or stale bill before it is accepted, not to stop receipt.
  const poDate = po.created_at?.slice(0, 10) ?? null;
  const invoiceAgeDays =
    invoiceDate && !Number.isNaN(Date.parse(invoiceDate))
      ? Math.floor((Date.now() - Date.parse(invoiceDate)) / 86_400_000)
      : null;
  const invoiceDateWarning: string | null = !invoiceDate
    ? null
    : poDate && invoiceDate < poDate
      ? `This invoice is dated before the purchase order (${poDate}) — check you have the right bill.`
      : expectations.max_invoice_age_days &&
          invoiceAgeDays != null &&
          invoiceAgeDays > expectations.max_invoice_age_days
        ? `This invoice is ${invoiceAgeDays} days old — you expected one within ${expectations.max_invoice_age_days} days.`
        : null;

  /** A line the receiver's traceability rule leaves incomplete. */
  const missingTrace = (l: LineDraft) =>
    requireBatchExpiry &&
    Number(l.accepted_quantity) > 0 &&
    (!l.batch_number?.trim() || !l.expiry_date);

  // One-glance verdict, so the receiver doesn't have to scan every badge to know whether this
  // delivery met what they declared. Recomputes on every keystroke, same inputs as the badges.
  const scored = drafts.map((l) => ({
    flagged: matchLine({
      orderedRemaining: l.ordered_remaining,
      invoiceQty: l.invoice_quantity,
      receivedQty: Number(l.received_quantity),
      poUnitPrice: l.po_unit_price,
      invoiceUnitPrice: l.cost != null && Number(l.cost) > 0 ? Number(l.cost) : null,
      tolerancePct: tolerance,
    }).mismatch_flag,
    trace: missingTrace(l),
  }));
  const flaggedCount = scored.filter((s) => s.flagged).length;
  const traceGapCount = scored.filter((s) => s.trace).length;
  const cleanCount = scored.filter((s) => !s.flagged && !s.trace).length;

  // Read the uploaded invoice PDF via Claude and pre-fill the header + line fields.
  const handleReadInvoice = async () => {
    if (!invoiceFile || !po) return;
    setReading(true);
    try {
      const fd = new FormData();
      fd.append('file', invoiceFile);
      fd.append('items', JSON.stringify(po.items.map((i) => ({ id: i.id, item_name: i.item_name }))));
      // The reader is told what this receiver expects, so the extraction is checked against
      // their intent rather than read in a vacuum.
      fd.append('expectations', JSON.stringify(expectations));
      const res = await fetch('/api/procurement/grn/extract-invoice', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Invoice reading failed');

      const { header, lines: extracted, matched, unmatched } = json as {
        header: { invoice_number: string | null; invoice_date: string | null; invoice_total: number | null };
        lines: Array<{
          po_item_id: string | null;
          quantity: number;
          unit_price: number;
          batch_number: string | null;
          expiry_date: string | null;
          manufacturing_date: string | null;
        }>;
        matched: number;
        unmatched: string[];
      };

      if (header?.invoice_number) setInvoiceNumber(header.invoice_number);
      if (header?.invoice_date) setInvoiceDate(header.invoice_date);
      if (header?.invoice_total != null) setInvoiceAmount(String(header.invoice_total));

      const byPo = new Map(extracted.filter((l) => l.po_item_id).map((l) => [l.po_item_id as string, l]));
      setLines((prev) => {
        const base = prev ?? drafts;
        return base.map((l) => {
          const ex = byPo.get(l.po_item_id);
          if (!ex) return l;
          const qty = Number(ex.quantity) || 0;
          return {
            ...l,
            invoice_quantity: qty,
            received_quantity: qty,
            accepted_quantity: qty,
            rejected_quantity: 0,
            batch_number: ex.batch_number ?? l.batch_number,
            expiry_date: ex.expiry_date ?? l.expiry_date,
            manufacturing_date: ex.manufacturing_date ?? l.manufacturing_date,
            cost: ex.unit_price ?? l.cost,
          };
        });
      });

      toast.success(
        `Read ${matched} of ${po.items.length} line${matched === 1 ? '' : 's'} — review before confirming` +
          (unmatched?.length ? ` · ${unmatched.length} unmatched` : '')
      );
    } catch (e) {
      toast.error(errorMessage(e, 'Could not read the invoice'));
    } finally {
      setReading(false);
    }
  };

  const submit = async () => {
    const payload = drafts
      .filter((l) => Number(l.received_quantity) > 0)
      .map((l) => ({
        po_item_id: l.po_item_id,
        invoice_quantity: l.invoice_quantity,
        received_quantity: Number(l.received_quantity),
        accepted_quantity: Number(l.accepted_quantity),
        rejected_quantity: Number(l.rejected_quantity),
        missing_quantity: Number(l.missing_quantity ?? 0),
        rejection_reason: l.rejection_reason,
        replacement_required: l.replacement_required,
        batch_number: l.batch_number,
        expiry_date: l.expiry_date,
        manufacturing_date: l.manufacturing_date,
        cost: l.cost ?? null,
      }));

    if (payload.length === 0) {
      toast.error('Enter a received quantity for at least one line.');
      return;
    }

    // Supplier invoice is mandatory — the GRN records goods received against a billed
    // invoice, and the three-way match needs it to compare against.
    if (!invoiceNumber.trim()) {
      toast.error('Invoice number is required.');
      return;
    }
    if (!invoiceDate) {
      toast.error('Invoice date is required.');
      return;
    }

    // The receiver asked for full traceability — hold the receipt until every accepted line
    // carries batch + expiry. Opt-in, so this only ever fires when they switched it on.
    if (requireBatchExpiry) {
      const incomplete = drafts.filter((l) => Number(l.received_quantity) > 0 && missingTrace(l));
      if (incomplete.length) {
        toast.error(
          `Batch no. and expiry are required on every line — ${incomplete.length} still incomplete.`
        );
        return;
      }
    }

    try {
      // Persist the invoice document to Drive (best-effort record on the GRN).
      let invoice_document_url: string | null = null;
      if (invoiceFile) {
        setUploading(true);
        const fd = new FormData();
        fd.append('file', invoiceFile);
        fd.append('institutionId', po.institution_id);
        fd.append('poNumber', po.po_number);
        const res = await fetch('/api/procurement/grn/upload', { method: 'POST', body: fd });
        setUploading(false);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Invoice upload failed');
        }
        const { attachment } = await res.json();
        invoice_document_url = attachment.url;
      }

      const grn = await createGrn.mutateAsync({
        input: {
          purchase_order_id: po.id,
          invoice_number: invoiceNumber || null,
          invoice_date: invoiceDate || null,
          invoice_amount: invoiceAmount ? Number(invoiceAmount) : null,
          invoice_document_url,
          notes: notes || null,
          expectations,
          lines: payload,
        },
        userId: profile!.id,
      });
      toast.success(`GRN ${grn.grn_number} created — pending verification.`);
      router.push(`/procurement/grn/${grn.id}`);
    } catch (e) {
      setUploading(false);
      toast.error(errorMessage(e, 'Failed to create GRN'));
    }
  };

  return (
    <ContentLayout title="Receive Goods">
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Back to purchase order"
            onClick={() => router.push(`/procurement/purchase-orders/${po.id}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Receive against {po.po_number}</h2>
            <p className="text-muted-foreground">{po.supplier?.name ?? po.supplier_id}</p>
          </div>
        </div>

        {/* Invoice header + AI reading */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Supplier invoice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Upload the invoice PDF and let AI pre-fill the receiving details. */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <Label className="text-xs">Invoice document (PDF)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="file"
                  accept=".pdf,image/*"
                  className="max-w-xs"
                  onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
                />
                {invoiceFile?.type === 'application/pdf' && (
                  <Button type="button" variant="secondary" size="sm" onClick={handleReadInvoice} disabled={reading}>
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    {reading ? 'Reading invoice…' : 'Read invoice (AI)'}
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                AI reads the invoice and fills quantity, unit cost, batch no. &amp; expiry below —
                review and adjust before confirming. The file is stored on the GRN.
              </p>
            </div>

            {/*
              Tell the check what "correct" means BEFORE it runs. These are this receipt's
              expectations — they re-score the badges below as you type, and are sent to the
              AI reader so it is checking against your intent, not a fixed threshold.
            */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <button
                type="button"
                onClick={() => setExpectOpen((v) => !v)}
                aria-expanded={expectOpen}
                className="flex w-full items-center gap-2 text-left"
              >
                {expectOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">What you expect on this invoice</span>
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                  {hasExpectations ? 'Set — checks below use it' : 'Optional · exact match'}
                </span>
              </button>

              {expectOpen && (
                <div className="space-y-3 pt-1">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Allowed variance (%)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.5"
                        value={tolerancePct}
                        onChange={(e) => setTolerancePct(e.target.value)}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        A price or quantity gap this small is expected, not a mismatch. 0 = exact.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Invoice dated within (days)</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="No limit"
                        value={maxInvoiceAgeDays}
                        onChange={(e) => setMaxInvoiceAgeDays(e.target.value)}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Warns on a stale or back-dated bill. Never blocks the receipt.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Traceability</Label>
                      <div className="flex items-center gap-2 pt-2">
                        <Switch
                          checked={requireBatchExpiry}
                          onCheckedChange={setRequireBatchExpiry}
                          aria-label="Require batch number and expiry on every line"
                        />
                        <Label className="text-xs text-muted-foreground">
                          Require batch &amp; expiry
                        </Label>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Applies to every accepted line, not just chemicals. Blocks the receipt
                        until filled.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">What should we watch for?</Label>
                    <Textarea
                      rows={2}
                      placeholder="e.g. this vendor bills freight on a separate line — check the total excludes it"
                      value={watchFor}
                      onChange={(e) => setWatchFor(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Passed to the AI reader as your instruction, and kept on the GRN for the
                      verifier.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Invoice number <span className="text-destructive">*</span></Label>
                <Input
                  required
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  aria-invalid={!invoiceNumber.trim()}
                />
              </div>
              <div className="space-y-1">
                <Label>Invoice date <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  required
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  aria-invalid={!invoiceDate}
                />
                {invoiceDateWarning && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-500">
                    {invoiceDateWarning}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Invoice amount (₹)</Label>
                <Input
                  type="number"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Line-by-line receiving */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items received</CardTitle>
            <p className="text-sm text-muted-foreground">
              For each line: <b>Invoice qty</b> is what the supplier billed, <b>Received</b> is what
              you physically counted. Split what arrived into <b>Accepted</b> (goes into stock) and
              <b> Rejected</b> (does not, and can be replaced later) — together these must not exceed
              Received. A gap between Invoice qty and Received is flagged as a mismatch.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {drafts.map((l, idx) => {
              const match = matchLine({
                orderedRemaining: l.ordered_remaining,
                invoiceQty: l.invoice_quantity,
                receivedQty: Number(l.received_quantity),
                poUnitPrice: l.po_unit_price,
                invoiceUnitPrice: l.cost != null && Number(l.cost) > 0 ? Number(l.cost) : null,
                tolerancePct: tolerance,
              });
              const overSplit =
                Number(l.accepted_quantity) + Number(l.rejected_quantity) >
                Number(l.received_quantity) + 0.001;
              const traceGap = missingTrace(l);
              return (
                <div key={l.po_item_id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{l.item_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Outstanding on PO: {l.ordered_remaining} {l.unit_label || ''}
                      </p>
                    </div>
                    <StatusBadge status={match.match_status} config={GRN_MATCH_CONFIG} />
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    <div className="space-y-1">
                      <Label className="text-xs">Invoice qty</Label>
                      <Input
                        type="number"
                        value={l.invoice_quantity ?? ''}
                        onChange={(e) => update(idx, { invoice_quantity: num(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Received</Label>
                      <Input
                        type="number"
                        value={l.received_quantity}
                        onChange={(e) => update(idx, { received_quantity: num(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Accepted</Label>
                      <Input
                        type="number"
                        value={l.accepted_quantity}
                        onChange={(e) => update(idx, { accepted_quantity: num(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Rejected</Label>
                      <Input
                        type="number"
                        value={l.rejected_quantity}
                        onChange={(e) => update(idx, { rejected_quantity: num(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Missing</Label>
                      <Input
                        type="number"
                        value={l.missing_quantity ?? ''}
                        onChange={(e) => update(idx, { missing_quantity: num(e.target.value) })}
                      />
                    </div>
                  </div>

                  {overSplit && (
                    <p className="text-xs text-destructive">
                      Accepted + rejected exceeds received quantity.
                    </p>
                  )}

                  {/* Batch tracking — required for chemicals at verification */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs">
                        Batch no.{' '}
                        <span className="text-muted-foreground">
                          {requireBatchExpiry ? '(required)' : '(chemicals)'}
                        </span>
                      </Label>
                      <Input
                        value={l.batch_number ?? ''}
                        onChange={(e) => update(idx, { batch_number: e.target.value || null })}
                        aria-invalid={traceGap && !l.batch_number?.trim()}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">
                        Expiry date{' '}
                        <span className="text-muted-foreground">
                          {requireBatchExpiry ? '(required)' : '(chemicals)'}
                        </span>
                      </Label>
                      <Input
                        type="date"
                        value={l.expiry_date ?? ''}
                        onChange={(e) => update(idx, { expiry_date: e.target.value || null })}
                        aria-invalid={traceGap && !l.expiry_date}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Mfg date</Label>
                      <Input
                        type="date"
                        value={l.manufacturing_date ?? ''}
                        onChange={(e) => update(idx, { manufacturing_date: e.target.value || null })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Unit cost (₹)</Label>
                      <Input
                        type="number"
                        value={l.cost ?? ''}
                        onChange={(e) => update(idx, { cost: e.target.value === '' ? null : Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  {Number(l.rejected_quantity) > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">Rejection reason</Label>
                        <Input
                          value={l.rejection_reason ?? ''}
                          onChange={(e) => update(idx, { rejection_reason: e.target.value || null })}
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm pb-2">
                        <Checkbox
                          checked={l.replacement_required ?? false}
                          onCheckedChange={(v) => update(idx, { replacement_required: !!v })}
                        />
                        Request replacement for rejected qty
                      </label>
                    </div>
                  )}

                  {traceGap && (
                    <p className="text-xs text-destructive">
                      You required batch &amp; expiry on every line — this one is incomplete.
                    </p>
                  )}

                  {match.reason && (
                    <p className="text-xs text-muted-foreground">{match.reason}</p>
                  )}
                </div>
              );
            })}

            {/* Roll-up against the declared expectations — the answer to "are we good?" */}
            {drafts.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <span className="font-medium">
                  {cleanCount} of {drafts.length} line{drafts.length === 1 ? '' : 's'} meet what you
                  expect
                </span>
                {(flaggedCount > 0 || traceGapCount > 0) && (
                  <span className="text-muted-foreground">
                    {flaggedCount > 0 &&
                      ` · ${flaggedCount} flagged${tolerance > 0 ? ` beyond ±${tolerance}%` : ''}`}
                    {traceGapCount > 0 && ` · ${traceGapCount} missing batch/expiry`}
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Nothing reaches inventory yet. The receipt is saved for verification — a Super Admin
            checks it against the order and the invoice, and only then does accepted stock post.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => router.push(`/procurement/purchase-orders/${po.id}`)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={createGrn.isPending || uploading}>
              {uploading ? 'Uploading invoice…' : createGrn.isPending ? 'Creating…' : 'Create GRN'}
            </Button>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}

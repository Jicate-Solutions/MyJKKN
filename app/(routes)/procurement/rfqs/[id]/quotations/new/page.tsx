'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useRfq, useVendorsForSelect } from '@/hooks/procurement/use-rfqs';
import {
  useQuotationsForRfq,
  useCreateQuotation,
  useCreateVendor,
} from '@/hooks/procurement/use-quotations';
import { downloadQuotationTemplate, parseQuotationFile } from '@/lib/procurement/quotation-import';
import type { CreateQuotationItemDto } from '@/types/procurement';
import { AlertBox } from '@/components/ui/alert-box';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Download, Upload, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';

interface QuotedSpec {
  manufacturer: string;
  quality_grade: string;
  concentration: string;
  other_specs: string;
}
const EMPTY_SPEC: QuotedSpec = { manufacturer: '', quality_grade: '', concentration: '', other_specs: '' };

/** How the AI-read price for a line should be presented until a human confirms it. */
type AiMark = 'ai' | 'uncertain';

/** One line as returned by the ₹0 Max-lane PDF reader. */
interface ExtractedLine {
  rfq_item_id: string | null;
  item_name?: string | null;
  unit_price?: number | null;
  uncertain?: boolean;
  manufacturer?: string | null;
  quality_grade?: string | null;
  concentration?: string | null;
  other_specs?: string | null;
}
interface ExtractResult {
  from_scan?: boolean;
  lines?: ExtractedLine[];
  unmatched_note?: string | null;
}

// Poll cadence while the page is open. The uploader is ALSO notified when the
// read finishes, so leaving the page loses nothing.
const EXTRACT_POLL_MS = 4_000;
// If the job is still unclaimed after this, the runner box is presumed offline
// and we stop waiting rather than spin forever.
const EXTRACT_UNCLAIMED_GIVE_UP_MS = 90_000;

/**
 * Flag prices that sit far outside the rest of the quotation.
 *
 * The classic AI-extraction failure is reading the invoice's *Total* row as one
 * line's unit price — e.g. ₹45,000 among a set averaging ₹500. Comparing each
 * price against the MEDIAN (not the mean) keeps one such wild value from
 * dragging the baseline up and hiding itself. Needs at least 3 prices before a
 * median means anything.
 */
function detectPriceOutliers(byItem: Record<string, number>): Record<string, boolean> {
  const values = Object.values(byItem)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (values.length < 3) return {};
  const median = values[Math.floor(values.length / 2)];
  if (!median || median <= 0) return {};
  const flagged: Record<string, boolean> = {};
  for (const [id, v] of Object.entries(byItem)) {
    if (!Number.isFinite(v) || v <= 0) continue;
    if (v > median * 10 || v < median / 10) flagged[id] = true;
  }
  return flagged;
}

export default function NewQuotationPage() {
  const router = useRouter();
  const params = useParams();
  const rfqId = params.id as string;
  const backHref = `/procurement/rfqs/${rfqId}/quotations`;
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || canAccess('procurement', 'quotation_manage');

  const { data: rfq, isLoading: rfqLoading, isError: rfqError } = useRfq(rfqId);
  const { data: quotations = [] } = useQuotationsForRfq(rfqId);
  // All active suppliers in the RFQ's OWN institution (not the viewer's profile
  // institution) — this is the pool a quotation's vendor is chosen/created from.
  const { data: allVendors = [] } = useVendorsForSelect(rfq?.institution_id || undefined);
  const createQuotation = useCreateQuotation();
  const createVendor = useCreateVendor();

  const [vendorMode, setVendorMode] = useState<'existing' | 'new'>('existing');
  const [vendorId, setVendorId] = useState('');
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorCode, setNewVendorCode] = useState('');
  const [newVendorEmail, setNewVendorEmail] = useState('');
  const [quoteNumber, setQuoteNumber] = useState('');
  const [deliveryDays, setDeliveryDays] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [notQuoted, setNotQuoted] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [specs, setSpecs] = useState<Record<string, QuotedSpec>>({});
  const [openSpecs, setOpenSpecs] = useState<Record<string, boolean>>({});
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  // ── ₹0 Max-lane PDF read ──────────────────────────────────────────────────
  // The read happens off-page: we enqueue, poll while the page is open, and the
  // uploader is notified when it finishes.
  const [extractJobId, setExtractJobId] = useState<string | null>(null);
  // Which price fields the AI filled, and how confident it was. Cleared per
  // field the moment a human edits it — that edit IS the confirmation.
  const [aiFilled, setAiFilled] = useState<Record<string, AiMark>>({});
  const [aiFromScan, setAiFromScan] = useState(false);
  const [aiOutliers, setAiOutliers] = useState<Record<string, boolean>>({});
  // Live mirror of `prices` for applyExtraction to consult. A ref (not a dep)
  // deliberately: reading prices through the closure would either go stale or,
  // if added to deps, restart the poll timer on every keystroke.
  const pricesRef = useRef<Record<string, string>>({});

  // Institution suppliers that haven't already quoted on this RFQ.
  const quotedSupplierIds = useMemo(
    () => new Set(quotations.map((q) => q.supplier_id)),
    [quotations]
  );
  const availableVendors = useMemo(
    () => allVendors.filter((v) => !quotedSupplierIds.has(v.id)),
    [allVendors, quotedSupplierIds]
  );

  const handleSave = async () => {
    if (!rfq || !profile?.id) return;
    const institutionId = rfq.institution_id; // quotation belongs to the RFQ's institution
    if (vendorMode === 'existing' && !vendorId) {
      toast.error('Select a vendor, or switch to “New vendor”.');
      return;
    }
    if (vendorMode === 'new' && !newVendorName.trim()) {
      toast.error('Enter the new vendor’s name.');
      return;
    }
    const items: CreateQuotationItemDto[] = rfq.items.map((it) => {
      const spec = specs[it.id];
      return {
        rfq_item_id: it.id,
        unit_price: notQuoted[it.id] ? null : Number(prices[it.id] || 0),
        quantity: quantities[it.id] ? Number(quantities[it.id]) : it.quantity,
        manufacturer: spec?.manufacturer.trim() || null,
        quality_grade: spec?.quality_grade.trim() || null,
        concentration: spec?.concentration.trim() || null,
        other_specs: spec?.other_specs.trim() || null,
      };
    });
    if (items.some((i) => i.unit_price !== null && !(i.unit_price > 0))) {
      toast.error('Enter a unit price for every quoted item, or mark it “Not quoted”.');
      return;
    }
    if (items.every((i) => i.unit_price === null)) {
      toast.error('Mark at least one item as quoted.');
      return;
    }

    setSaving(true);
    try {
      // Resolve the vendor — create it inline if the admin entered a new one.
      let supplierId = vendorId;
      if (vendorMode === 'new') {
        const created = await createVendor.mutateAsync({
          institution_id: institutionId,
          name: newVendorName,
          code: newVendorCode || null,
          email: newVendorEmail || null,
        });
        supplierId = created.id;
      }

      // Optional document upload to Drive.
      let document_url: string | null = null;
      let document_file_id: string | null = null;
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('institutionId', institutionId);
        fd.append('rfqNumber', rfq.rfq_number);
        const res = await fetch('/api/procurement/quotations/upload', { method: 'POST', body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Document upload failed');
        }
        const { attachment } = await res.json();
        document_url = attachment.url;
        document_file_id = attachment.driveFileId;
      }

      await createQuotation.mutateAsync({
        dto: {
          institution_id: institutionId,
          rfq_id: rfq.id,
          supplier_id: supplierId,
          vendor_quote_number: quoteNumber || null,
          delivery_time_days: deliveryDays ? Number(deliveryDays) : null,
          payment_terms: paymentTerms || null,
          document_url,
          document_file_id,
          items,
        },
        userId: profile.id,
      });
      toast.success('Quotation added');
      router.push(backHref);
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to add quotation'));
    } finally {
      setSaving(false);
    }
  };

  // Parse a filled CSV/Excel price sheet into the per-item price fields (editable after).
  const handleImportPrices = async (f: File | null) => {
    if (!f || !rfq) return;
    try {
      const { prices: parsed, matched, unmatched } = await parseQuotationFile(f, rfq.items);
      if (matched === 0) {
        toast.error('No matching item prices found — download and use the template.');
        return;
      }
      setPrices((prev) => {
        const next = { ...prev };
        for (const [id, price] of Object.entries(parsed)) next[id] = String(price);
        return next;
      });
      toast.success(
        `Imported ${matched} of ${rfq.items.length} price${matched === 1 ? '' : 's'}` +
          (unmatched.length ? ` · ${unmatched.length} row(s) unmatched` : '')
      );
    } catch (e) {
      toast.error(errorMessage(e, 'Could not read the file'));
    }
  };

  // Fill the form from a finished ₹0 Max-lane read. Nothing is auto-committed:
  // every value lands in an editable field, visibly marked as AI-filled until a
  // human touches it.
  const applyExtraction = useCallback(
    (result: ExtractResult | null | undefined) => {
      const lines = Array.isArray(result?.lines) ? result!.lines! : [];
      const filledPrices: Record<string, string> = {};
      const numericPrices: Record<string, number> = {};
      const marks: Record<string, AiMark> = {};
      const filledSpecs: Record<string, QuotedSpec> = {};

      let keptTyped = 0;
      for (const line of lines) {
        const id = line?.rfq_item_id;
        const price = typeof line?.unit_price === 'number' ? line.unit_price : NaN;
        // A line the reader could not confidently price is skipped entirely
        // rather than written as 0 — a wrong price is worse than a blank one.
        if (!id || !Number.isFinite(price) || price <= 0) continue;
        // The read is asynchronous, so the person may well have typed prices
        // while waiting. A human-entered price ALWAYS wins over an AI-read one —
        // silently replacing what someone typed is exactly the money error the
        // AI-highlighting is meant to prevent.
        if ((pricesRef.current[id] ?? '').trim() !== '') {
          keptTyped += 1;
          continue;
        }
        filledPrices[id] = String(price);
        numericPrices[id] = price;
        marks[id] = line.uncertain ? 'uncertain' : 'ai';
        filledSpecs[id] = {
          manufacturer: line.manufacturer ?? '',
          quality_grade: line.quality_grade ?? '',
          concentration: line.concentration ?? '',
          other_specs: line.other_specs ?? '',
        };
      }

      const matched = Object.keys(filledPrices).length;
      if (!matched) {
        if (keptTyped) {
          toast.info('Every price the AI read was already filled in — your typed prices were kept.');
        } else {
          toast.error('No prices could be read from the PDF. Enter them manually or use the template.');
        }
        return;
      }

      setPrices((prev) => ({ ...prev, ...filledPrices }));
      setSpecs((prev) => {
        const next = { ...prev };
        for (const [id, s] of Object.entries(filledSpecs)) {
          next[id] = {
            manufacturer: s.manufacturer || next[id]?.manufacturer || '',
            quality_grade: s.quality_grade || next[id]?.quality_grade || '',
            concentration: s.concentration || next[id]?.concentration || '',
            other_specs: s.other_specs || next[id]?.other_specs || '',
          };
        }
        return next;
      });
      setAiFilled(marks);
      setAiFromScan(!!result?.from_scan);
      setAiOutliers(detectPriceOutliers(numericPrices));

      const uncertainCount = Object.values(marks).filter((m) => m === 'uncertain').length;
      toast.success(
        `AI read ${matched} price${matched === 1 ? '' : 's'} — review before saving` +
          (uncertainCount ? ` · ${uncertainCount} uncertain match${uncertainCount === 1 ? '' : 'es'}` : '') +
          (keptTyped ? ` · kept ${keptTyped} price${keptTyped === 1 ? '' : 's'} you typed` : ''),
      );
    },
    [],
  );

  // Keep the ref in step with the state it mirrors.
  useEffect(() => {
    pricesRef.current = prices;
  }, [prices]);

  // Hand the vendor PDF to the ₹0 Max lane. This does NOT wait for the answer —
  // it starts the read and returns; the uploader is notified when it lands.
  const handleExtractPdf = async () => {
    if (!file || !rfq) return;
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('rfq_id', rfq.id);
      fd.append('items', JSON.stringify(rfq.items.map((it) => ({ id: it.id, item_name: it.item_name }))));
      const res = await fetch('/api/procurement/quotations/extract-pdf', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Extraction failed');

      // Lane unavailable — the server says WHICH state (not set up here, switched
      // off, no permission, cap reached), so show its message rather than a
      // generic one. The quotation is still completable by hand either way.
      if (json.unavailable) {
        toast.error(json.error || 'AI PDF reading is unavailable — please enter the prices manually.');
        return;
      }
      // This exact PDF was already read for this RFQ — reuse rather than re-read.
      if (json.reused && json.result) {
        applyExtraction(json.result as ExtractResult);
        toast.info('Reused an earlier reading of this same PDF.');
        return;
      }
      if (typeof json.job_id !== 'string') throw new Error('Could not start the AI reading.');

      setExtractJobId(json.job_id);
      toast.success("Reading the PDF in the background — you'll be notified when the prices are ready.");
    } catch (e) {
      toast.error(errorMessage(e, 'Could not read the PDF'));
    } finally {
      setExtracting(false);
    }
  };

  // Poll the read while this page stays open. Leaving is safe — the notification
  // brings the uploader back, and the prices are re-fetched on the next attempt.
  useEffect(() => {
    if (!extractJobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/procurement/quotations/extract-pdf/status?job_id=${encodeURIComponent(extractJobId)}`,
        );
        const json = await res.json();
        if (cancelled) return;

        if (json.status === 'done') {
          applyExtraction(json.result as ExtractResult);
          setExtractJobId(null);
          return;
        }
        if (json.status === 'error' || json.status === 'canceled' || json.status === 'not_found') {
          toast.error('AI could not read the PDF — please enter the prices manually.');
          setExtractJobId(null);
          return;
        }
        // Never picked up: the job was accepted but no reader claimed it, so the
        // runner box is presumed offline. Say that, rather than "unavailable right
        // now" — the queue took the work; nothing is running to do it.
        if (json.status === 'pending' && Date.now() - startedAt > EXTRACT_UNCLAIMED_GIVE_UP_MS) {
          toast.error('No AI reader picked up the PDF — it is not running. Please enter the prices manually.');
          setExtractJobId(null);
          return;
        }
      } catch {
        // Transient network error — keep polling.
      }
      if (!cancelled) timer = setTimeout(tick, EXTRACT_POLL_MS);
    };

    timer = setTimeout(tick, EXTRACT_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [extractJobId, applyExtraction]);

  if (rfqLoading) {
    return (
      <ContentLayout title="Add Quotation">
        <div className="flex items-center justify-center py-16">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }
  if (rfqError) {
    return (
      <ContentLayout title="Add Quotation">
        <div className="py-12">
          <AlertBox type="error" message="Failed to load this RFQ. Please try again." />
        </div>
      </ContentLayout>
    );
  }
  if (!rfq) {
    return (
      <ContentLayout title="Add Quotation">
        <p className="text-muted-foreground py-12 text-center">RFQ not found.</p>
      </ContentLayout>
    );
  }
  if (!canManage) {
    return (
      <ContentLayout title="Add Quotation">
        <div className="py-12">
          <AlertBox type="error" message="You do not have permission to capture quotations." />
        </div>
      </ContentLayout>
    );
  }

  const quotedCount = rfq.items.filter(
    (it) => !notQuoted[it.id] && Number(prices[it.id] || 0) > 0
  ).length;
  const quoteTotal = rfq.items.reduce((sum, it) => {
    if (notQuoted[it.id]) return sum;
    const price = Number(prices[it.id] || 0);
    const qty = quantities[it.id] ? Number(quantities[it.id]) : it.quantity;
    return sum + (price > 0 ? price * qty : 0);
  }, 0);

  return (
    <ContentLayout title="Add Vendor Quotation">
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Back to quotations"
            onClick={() => router.push(backHref)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight">Add Vendor Quotation</h2>
            <p className="text-muted-foreground">
              {rfq.rfq_number} · {rfq.items.length} item{rfq.items.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {/* ── Step 1: who quoted ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vendor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>Vendor</Label>
                <div className="ml-auto inline-flex rounded-md border p-0.5 text-xs">
                  <button
                    type="button"
                    className={`px-2 py-0.5 rounded ${vendorMode === 'existing' ? 'bg-primary text-primary-foreground' : ''}`}
                    onClick={() => setVendorMode('existing')}
                  >
                    Existing
                  </button>
                  <button
                    type="button"
                    className={`px-2 py-0.5 rounded ${vendorMode === 'new' ? 'bg-primary text-primary-foreground' : ''}`}
                    onClick={() => setVendorMode('new')}
                  >
                    + New vendor
                  </button>
                </div>
              </div>
              {vendorMode === 'existing' ? (
                <Select value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={availableVendors.length ? 'Select vendor…' : 'No registered vendors — add a new one'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableVendors.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        No registered vendors. Switch to “+ New vendor”.
                      </div>
                    ) : (
                      availableVendors.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                          {v.code ? ` (${v.code})` : ''}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input
                    placeholder="Vendor name *"
                    value={newVendorName}
                    onChange={(e) => setNewVendorName(e.target.value)}
                  />
                  <Input
                    placeholder="Code (optional)"
                    value={newVendorCode}
                    onChange={(e) => setNewVendorCode(e.target.value)}
                  />
                  <Input
                    type="email"
                    placeholder="Email (optional)"
                    value={newVendorEmail}
                    onChange={(e) => setNewVendorEmail(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Vendor quote #</Label>
                <Input value={quoteNumber} onChange={(e) => setQuoteNumber(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-1">
                <Label>Delivery (days)</Label>
                <Input
                  type="number"
                  value={deliveryDays}
                  onChange={(e) => setDeliveryDays(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1">
                <Label>Payment terms</Label>
                <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Optional" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Step 2: what they charged ──────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Item prices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Every way of filling the prices, grouped ABOVE the fields they fill.
                The attach-PDF control used to sit below the price list, so the
                AI button appeared after the values it populates. */}
            <div className="rounded-md border bg-muted/40 p-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadQuotationTemplate(rfq.rfq_number, rfq.items)}
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Download template
                </Button>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-accent">
                  <Upload className="h-3.5 w-3.5" />
                  Import CSV/Excel
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      handleImportPrices(e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                </label>
                <span className="text-xs text-muted-foreground">or type the prices below</span>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Vendor&apos;s quotation document (optional)</Label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    type="file"
                    accept=".pdf,image/*,.xlsx,.xls,.csv"
                    className="sm:max-w-sm"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  {file?.type === 'application/pdf' && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleExtractPdf}
                      disabled={extracting}
                    >
                      <Sparkles className="mr-1 h-3.5 w-3.5" />
                      {extracting ? 'Reading PDF…' : 'Read prices from PDF (AI)'}
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Attach a PDF and the AI can fill the prices below for you to review. Anything you
                  have already typed is always kept.
                </p>
              </div>

              {extractJobId && (
                <p className="rounded-md border border-dashed bg-background px-2 py-1.5 text-[11px] text-muted-foreground">
                  Reading the PDF in the background — you can leave this page, we&apos;ll notify you
                  when the prices are ready.
                </p>
              )}
              {aiFromScan && (
                <p className="rounded-md border border-amber-400 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  This came from a scanned image, not a digital PDF — please double-check every
                  price before saving.
                </p>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Item</th>
                    <th className="py-2 pr-3 font-medium w-40">Unit price</th>
                    <th className="py-2 pr-3 font-medium w-28">Qty offered</th>
                    <th className="py-2 pr-3 font-medium w-32">Line total</th>
                    <th className="py-2 font-medium w-36">Not quoted</th>
                  </tr>
                </thead>
                <tbody>
                  {rfq.items.map((it) => {
                    const entered = Number(prices[it.id] || 0);
                    const isNotQuoted = !!notQuoted[it.id];
                    const spec = specs[it.id] ?? EMPTY_SPEC;
                    const aiMark = aiFilled[it.id];
                    const isOutlier = !!aiOutliers[it.id];
                    const offeredQty = quantities[it.id] ? Number(quantities[it.id]) : it.quantity;
                    const specsOpen = !!openSpecs[it.id];
                    // A human editing the field IS the confirmation — drop the mark.
                    const clearAiMark = () =>
                      setAiFilled((p) => {
                        if (!p[it.id]) return p;
                        const next = { ...p };
                        delete next[it.id];
                        return next;
                      });
                    const updateSpec = (field: keyof QuotedSpec, value: string) =>
                      setSpecs((p) => ({ ...p, [it.id]: { ...(p[it.id] ?? EMPTY_SPEC), [field]: value } }));
                    return (
                      <Fragment key={it.id}>
                        <tr className="border-b align-top">
                          <td className="py-2 pr-3">
                            <p className="font-medium">{it.item_name}</p>
                            <p className="text-xs text-muted-foreground">
                              asked for {it.quantity} {it.unit_label || ''}
                              {it.item_spec ? ` · ${it.item_spec}` : ''}
                            </p>
                            <button
                              type="button"
                              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => setOpenSpecs((p) => ({ ...p, [it.id]: !p[it.id] }))}
                              aria-expanded={specsOpen}
                            >
                              {specsOpen ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                              What the vendor offered
                            </button>
                          </td>
                          <td className="py-2 pr-3">
                            <Input
                              type="number"
                              min={0}
                              placeholder="0.00"
                              aria-label={`Unit price for ${it.item_name}`}
                              disabled={isNotQuoted}
                              className={
                                aiMark && !isNotQuoted
                                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30'
                                  : undefined
                              }
                              value={isNotQuoted ? '' : prices[it.id] ?? ''}
                              onChange={(e) => {
                                setPrices((p) => ({ ...p, [it.id]: e.target.value }));
                                clearAiMark();
                              }}
                            />
                            {aiMark && !isNotQuoted && (
                              <p className="mt-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                {aiMark === 'uncertain'
                                  ? 'AI guess — confirm this is the right item'
                                  : 'AI-filled — check before saving'}
                              </p>
                            )}
                            {isOutlier && !isNotQuoted && (
                              <p className="mt-0.5 text-[11px] font-medium text-destructive">
                                Unusual price for this quotation — please verify
                              </p>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            <Input
                              type="number"
                              min={0}
                              placeholder="Qty"
                              aria-label={`Quantity offered for ${it.item_name}`}
                              disabled={isNotQuoted}
                              value={isNotQuoted ? '' : quantities[it.id] ?? String(it.quantity)}
                              onChange={(e) => setQuantities((p) => ({ ...p, [it.id]: e.target.value }))}
                            />
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {!isNotQuoted && entered > 0
                              ? `₹${(entered * offeredQty).toLocaleString()}`
                              : '—'}
                          </td>
                          <td className="py-2">
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Checkbox
                                checked={isNotQuoted}
                                onCheckedChange={(v) => {
                                  const checked = !!v;
                                  setNotQuoted((p) => ({ ...p, [it.id]: checked }));
                                  if (checked) setPrices((p) => ({ ...p, [it.id]: '' }));
                                }}
                              />
                              Not quoted
                            </label>
                          </td>
                        </tr>
                        {specsOpen && !isNotQuoted && (
                          <tr className="border-b bg-muted/30">
                            <td colSpan={5} className="px-3 py-3">
                              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="space-y-1">
                                  <Label className="text-[11px]">Manufacturer</Label>
                                  <Input
                                    className="h-8 text-xs"
                                    value={spec.manufacturer}
                                    onChange={(e) => updateSpec('manufacturer', e.target.value)}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[11px]">Quality / grade</Label>
                                  <Input
                                    className="h-8 text-xs"
                                    value={spec.quality_grade}
                                    onChange={(e) => updateSpec('quality_grade', e.target.value)}
                                  />
                                </div>
                                {it.is_chemical && (
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Concentration</Label>
                                    <Input
                                      className="h-8 text-xs"
                                      value={spec.concentration}
                                      onChange={(e) => updateSpec('concentration', e.target.value)}
                                    />
                                  </div>
                                )}
                                <div className="space-y-1">
                                  <Label className="text-[11px]">Other specs</Label>
                                  <Input
                                    className="h-8 text-xs"
                                    value={spec.other_specs}
                                    onChange={(e) => updateSpec('other_specs', e.target.value)}
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
              <span className="text-muted-foreground">
                {quotedCount} of {rfq.items.length} item{rfq.items.length === 1 ? '' : 's'} priced
              </span>
              <span className="font-medium">
                Quotation total ₹{quoteTotal.toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => router.push(backHref)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save quotation'}
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}

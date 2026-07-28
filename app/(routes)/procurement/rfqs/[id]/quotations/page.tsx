'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildComparisonRows } from '@/lib/services/procurement/quotation-service';
import { useRouter, useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useRfq, useVendorsForSelect } from '@/hooks/procurement/use-rfqs';
import {
  useQuotationsForRfq,
  useCreateQuotation,
  useCreateVendor,
  useDeleteQuotation,
  useAwardLine,
  useUnawardLine,
} from '@/hooks/procurement/use-quotations';
import { useGeneratePOsFromRfq } from '@/hooks/procurement/use-purchase-orders';
import { downloadQuotationTemplate, parseQuotationFile } from '@/lib/procurement/quotation-import';
import type { CreateQuotationItemDto } from '@/types/procurement';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, Plus, Trash2, FileText, Award, X, ExternalLink, Download, Upload, Sparkles } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';

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

export default function RfqQuotationsPage() {
  const router = useRouter();
  const params = useParams();
  const rfqId = params.id as string;
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || canAccess('procurement', 'quotation_manage');

  const { data: rfq, isLoading: rfqLoading } = useRfq(rfqId);
  const { data: quotations = [], isLoading: quotesLoading } = useQuotationsForRfq(rfqId);
  // Derive the comparison client-side from the RFQ items + quotations already loaded,
  // instead of a second server round-trip (useComparison re-fetched the same quotations).
  const comparison = useMemo(
    () => buildComparisonRows(rfq?.items ?? [], quotations),
    [rfq?.items, quotations]
  );
  const compLoading = rfqLoading || quotesLoading;
  // All active suppliers in the RFQ's OWN institution (not the viewer's profile
  // institution) — this is the pool a quotation's vendor is chosen/created from.
  const { data: allVendors = [] } = useVendorsForSelect(rfq?.institution_id || undefined);
  const createQuotation = useCreateQuotation();
  const createVendor = useCreateVendor();
  const deleteQuotation = useDeleteQuotation(rfqId);
  const awardLine = useAwardLine(rfqId);
  const unawardLine = useUnawardLine(rfqId);
  const generatePOs = useGeneratePOsFromRfq();
  const canGeneratePO = isSuperAdmin || canAccess('procurement', 'po_create');
  const hasAwarded = comparison.some((r) => r.quotes.some((q) => q.awarded));

  const handleGeneratePOs = async () => {
    if (!profile?.id) return;
    try {
      const pos = await generatePOs.mutateAsync({ rfqId, userId: profile.id });
      toast.success(`Generated ${pos.length} purchase order${pos.length === 1 ? '' : 's'}`);
      router.push('/procurement/purchase-orders');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate POs');
    }
  };

  const [addOpen, setAddOpen] = useState(false);
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
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
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
  // Which quotation PDFs are expanded inline (keyed by quotation id). Iframes are
  // only mounted for open entries so we don't load every vendor's PDF at once.
  const [openPdfs, setOpenPdfs] = useState<Record<string, boolean>>({});
  const togglePdf = (id: string) => setOpenPdfs((p) => ({ ...p, [id]: !p[id] }));

  // Institution suppliers that haven't already quoted on this RFQ.
  const quotedSupplierIds = new Set(quotations.map((q) => q.supplier_id));
  const availableVendors = useMemo(
    () => allVendors.filter((v) => !quotedSupplierIds.has(v.id)),
    [allVendors, quotations] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const resetForm = () => {
    setVendorMode('existing');
    setVendorId('');
    setNewVendorName('');
    setNewVendorCode('');
    setNewVendorEmail('');
    setQuoteNumber('');
    setDeliveryDays('');
    setPaymentTerms('');
    setPrices({});
    setNotQuoted({});
    setQuantities({});
    setSpecs({});
    setFile(null);
    setExtractJobId(null);
    setAiFilled({});
    setAiFromScan(false);
    setAiOutliers({});
  };

  const handleAdd = async () => {
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
        setUploading(true);
        const fd = new FormData();
        fd.append('file', file);
        fd.append('institutionId', institutionId);
        fd.append('rfqNumber', rfq.rfq_number);
        const res = await fetch('/api/procurement/quotations/upload', { method: 'POST', body: fd });
        setUploading(false);
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
      setAddOpen(false);
      resetForm();
    } catch (e) {
      setUploading(false);
      toast.error(e instanceof Error ? e.message : 'Failed to add quotation');
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
      toast.error(e instanceof Error ? e.message : 'Could not read the file');
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

      // Lane unavailable (switched off, no permission, cap reached, box offline)
      // — the quotation is still completable by hand.
      if (json.unavailable) {
        toast.error(json.error || 'AI reading is unavailable — please enter the prices manually.');
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
      toast.error(e instanceof Error ? e.message : 'Could not read the PDF');
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
        // Never picked up: the runner box is presumed offline. Stop waiting and
        // tell the truth rather than spinning indefinitely.
        if (json.status === 'pending' && Date.now() - startedAt > EXTRACT_UNCLAIMED_GIVE_UP_MS) {
          toast.error('AI reading is unavailable right now — please enter the prices manually.');
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

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
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
  if (!rfq) {
    return (
      <ContentLayout title="Quotations">
        <p className="text-muted-foreground py-12 text-center">RFQ not found.</p>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`${rfq.rfq_number} — Quotations`}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push(`/procurement/rfqs/${rfqId}`)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Quotations & Comparison</h2>
              <p className="text-muted-foreground">{rfq.rfq_number}</p>
            </div>
          </div>
          {canManage && (
            <Button className="shrink-0" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Quotation
            </Button>
          )}
        </div>

        {/* Received quotations */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Received Quotations ({quotations.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {quotations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No quotations captured yet.</p>
            ) : (
              <div className="space-y-2">
                {quotations.map((q) => (
                  <div key={q.id} className="rounded-md border">
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{q.supplier?.name ?? q.supplier_id}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {q.vendor_quote_number ? `Ref ${q.vendor_quote_number} · ` : ''}
                          Total ₹{Number(q.total_amount ?? 0).toLocaleString()}
                          {q.delivery_time_days ? ` · ${q.delivery_time_days}d delivery` : ''}
                          {q.payment_terms ? ` · ${q.payment_terms}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {q.document_file_id ? (
                          <Button variant="ghost" size="sm" onClick={() => togglePdf(q.id)}>
                            <FileText className="h-4 w-4 mr-1" />
                            {openPdfs[q.id] ? 'Hide PDF' : 'View PDF'}
                          </Button>
                        ) : q.document_url ? (
                          <a href={q.document_url} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm">
                              <FileText className="h-4 w-4" />
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </Button>
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">No PDF</span>
                        )}
                        {q.document_file_id && q.document_url && (
                          <a href={q.document_url} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </a>
                        )}
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => run(() => deleteQuotation.mutateAsync(q.id), 'Quotation removed')}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {q.document_file_id && openPdfs[q.id] && (
                      <div className="px-3 pb-3">
                        <iframe
                          src={`https://drive.google.com/file/d/${q.document_file_id}/preview`}
                          title={`Quotation PDF — ${q.supplier?.name ?? q.supplier_id}`}
                          className="w-full rounded-md border"
                          style={{ height: 500 }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Item-wise comparison */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Item-wise Comparison</CardTitle>
            {canGeneratePO && hasAwarded && (
              <Button onClick={handleGeneratePOs} disabled={generatePOs.isPending}>
                {generatePOs.isPending ? 'Generating...' : 'Generate Purchase Orders'}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {compLoading ? (
              <div className="flex justify-center py-8">
                <BeatLoader color="hsl(var(--primary))" size={8} />
              </div>
            ) : comparison.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to compare yet.</p>
            ) : (
              <div className="space-y-4">
                {comparison.map((row) => (
                  <div key={row.rfq_item_id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium text-sm">{row.item_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.quantity} {row.unit_label || ''} {row.item_spec ? `· ${row.item_spec}` : ''}
                        </p>
                      </div>
                    </div>
                    {row.quotes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No quotes for this item.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-xs text-muted-foreground">
                              <th className="py-1 pr-2 font-medium">Vendor</th>
                              <th className="py-1 pr-2 font-medium">Price</th>
                              <th className="py-1 pr-2 font-medium">Manufacturer</th>
                              <th className="py-1 pr-2 font-medium">Quality</th>
                              <th className="py-1 pr-2 font-medium">Qty offered</th>
                              {row.is_chemical && (
                                <th className="py-1 pr-2 font-medium">Concentration</th>
                              )}
                              <th className="py-1 pr-2 font-medium">Other specs</th>
                              <th className="py-1 pr-2 font-medium">Delivery</th>
                              <th className="py-1 pr-2 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.quotes.map((qt) => {
                              const isNotQuoted = qt.unit_price === null;
                              const isLowest = !isNotQuoted && qt.unit_price === row.lowest_price;
                              return (
                                <tr
                                  key={qt.quotation_item_id}
                                  className={`border-b last:border-b-0 ${
                                    qt.awarded
                                      ? 'bg-green-500/10'
                                      : isLowest
                                      ? 'bg-blue-400/10'
                                      : ''
                                  }`}
                                >
                                  <td className="py-1.5 pr-2 font-medium">{qt.supplier_name}</td>
                                  <td className="py-1.5 pr-2">
                                    {isNotQuoted ? (
                                      <span className="italic text-muted-foreground">Not quoted</span>
                                    ) : (
                                      <>
                                        ₹{Number(qt.unit_price).toLocaleString()}
                                        {isLowest && !qt.awarded && (
                                          <Badge variant="secondary" className="ml-1 text-[10px]">
                                            Lowest
                                          </Badge>
                                        )}
                                      </>
                                    )}
                                  </td>
                                  <td className="py-1.5 pr-2 text-muted-foreground">
                                    {qt.manufacturer || '—'}
                                  </td>
                                  <td className="py-1.5 pr-2 text-muted-foreground">
                                    {qt.quality_grade || '—'}
                                  </td>
                                  <td className="py-1.5 pr-2 text-muted-foreground">
                                    {qt.quantity ?? '—'}
                                  </td>
                                  {row.is_chemical && (
                                    <td className="py-1.5 pr-2 text-muted-foreground">
                                      {qt.concentration || '—'}
                                    </td>
                                  )}
                                  <td className="py-1.5 pr-2 text-muted-foreground">
                                    {qt.other_specs || '—'}
                                  </td>
                                  <td className="py-1.5 pr-2 text-muted-foreground">
                                    {qt.delivery_time_days != null ? `${qt.delivery_time_days}d` : '—'}
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    {qt.awarded ? (
                                      <span className="flex items-center gap-1 text-green-600">
                                        <Award className="h-3.5 w-3.5" /> Awarded
                                        {canManage && (
                                          <button
                                            className="ml-1"
                                            onClick={() =>
                                              run(
                                                () => unawardLine.mutateAsync(row.rfq_item_id),
                                                'Award cleared'
                                              )
                                            }
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        )}
                                      </span>
                                    ) : (
                                      canManage &&
                                      !isNotQuoted && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 px-2"
                                          onClick={() =>
                                            run(
                                              () =>
                                                awardLine.mutateAsync({
                                                  rfqItemId: row.rfq_item_id,
                                                  quotationItemId: qt.quotation_item_id,
                                                }),
                                              `Awarded to ${qt.supplier_name}`
                                            )
                                          }
                                        >
                                          Award
                                        </Button>
                                      )
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add quotation dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => (o ? setAddOpen(true) : (setAddOpen(false), resetForm()))}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Vendor Quotation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Vendor: pick an existing supplier or create one inline (no need to
                pre-register vendors on the RFQ first). */}
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

            <div className="grid gap-4 sm:grid-cols-2">
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

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Unit prices</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => downloadQuotationTemplate(rfq.rfq_number, rfq.items)}
                  >
                    <Download className="mr-1 h-3.5 w-3.5" />
                    Template
                  </Button>
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
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
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Download the template, fill the <code>unit_price</code> column, and import it —
                or type prices below. A vendor PDF can be attached as reference under
                “Quotation document”.
              </p>
              {extractJobId && (
                <p className="rounded-md border border-dashed px-2 py-1.5 text-[11px] text-muted-foreground">
                  Reading the PDF in the background — you can close this page, we&apos;ll notify you
                  when the prices are ready.
                </p>
              )}
              {aiFromScan && (
                <p className="rounded-md border border-amber-400 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  This came from a scanned image, not a digital PDF — please double-check every
                  price before saving.
                </p>
              )}
              {rfq.items.map((it) => {
                const entered = Number(prices[it.id] || 0);
                const isNotQuoted = !!notQuoted[it.id];
                const spec = specs[it.id] ?? EMPTY_SPEC;
                const aiMark = aiFilled[it.id];
                const isOutlier = !!aiOutliers[it.id];
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
                  <div key={it.id} className="space-y-1.5 border-b pb-2 last:border-b-0">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                      <div className="min-w-0 flex-1 text-sm">
                        {it.item_name}
                        <span className="text-muted-foreground">
                          {' '}
                          ({it.quantity} {it.unit_label || ''})
                        </span>
                      </div>
                      <div className="w-full sm:w-36">
                        <Input
                          type="number"
                          min={0}
                          placeholder="Unit price"
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
                        {entered > 0 && !isNotQuoted && (
                          <p className="mt-0.5 text-right text-[11px] text-muted-foreground">
                            = ₹{(entered * it.quantity).toLocaleString()} total
                          </p>
                        )}
                      </div>
                      <div className="w-full sm:w-24">
                        <Input
                          type="number"
                          min={0}
                          placeholder="Qty offered"
                          disabled={isNotQuoted}
                          value={isNotQuoted ? '' : quantities[it.id] ?? String(it.quantity)}
                          onChange={(e) => setQuantities((p) => ({ ...p, [it.id]: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pl-0">
                      <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <Checkbox
                          checked={isNotQuoted}
                          onCheckedChange={(v) => {
                            const checked = !!v;
                            setNotQuoted((p) => ({ ...p, [it.id]: checked }));
                            if (checked) setPrices((p) => ({ ...p, [it.id]: '' }));
                          }}
                        />
                        Not quoted by this vendor
                      </label>
                    </div>
                    {!isNotQuoted && (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Input
                          placeholder="Manufacturer"
                          className="h-7 text-xs"
                          value={spec.manufacturer}
                          onChange={(e) => updateSpec('manufacturer', e.target.value)}
                        />
                        <Input
                          placeholder="Quality / grade"
                          className="h-7 text-xs"
                          value={spec.quality_grade}
                          onChange={(e) => updateSpec('quality_grade', e.target.value)}
                        />
                        {it.is_chemical && (
                          <Input
                            placeholder="Concentration"
                            className="h-7 text-xs"
                            value={spec.concentration}
                            onChange={(e) => updateSpec('concentration', e.target.value)}
                          />
                        )}
                        <Input
                          placeholder="Other specs (optional)"
                          className="h-7 text-xs"
                          value={spec.other_specs}
                          onChange={(e) => updateSpec('other_specs', e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-1">
              <Label>Quotation document (optional)</Label>
              <Input
                type="file"
                accept=".pdf,image/*,.xlsx,.xls,.csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file?.type === 'application/pdf' && (
                <div className="flex items-center gap-2 pt-1">
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
                  <span className="text-[11px] text-muted-foreground">
                    Fills the prices above for you to review.
                  </span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={createQuotation.isPending || createVendor.isPending || uploading}
            >
              {uploading
                ? 'Uploading...'
                : createVendor.isPending
                  ? 'Creating vendor...'
                  : createQuotation.isPending
                    ? 'Saving...'
                    : 'Save quotation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}

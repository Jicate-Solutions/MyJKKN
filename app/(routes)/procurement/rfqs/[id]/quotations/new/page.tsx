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
import { matchVendor, normalizeGstin, type VendorMatchKey } from '@/lib/procurement/vendor-match';
import type { CreateQuotationItemDto } from '@/types/procurement';
import { cn } from '@/lib/utils';
import { displayRequestNumber } from '@/lib/procurement/display-number';
import { AlertBox } from '@/components/ui/alert-box';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DetailHeader } from '@/components/procurement/detail-header';
import { FormActionBar } from '@/components/procurement/form-action-bar';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, Upload, Sparkles } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';
import { extractItemOf } from '@/lib/procurement/read-quotation-pdf';
import { packOrUnit } from '@/lib/procurement/pack-size';

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
  gst_percent?: number | null;
  hsn?: string | null;
}
interface ExtractResult {
  from_scan?: boolean;
  lines?: ExtractedLine[];
  unmatched_note?: string | null;
  // Quotation header — present on direct (version 2) reads.
  vendor?: {
    name?: string | null;
    gstin?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    contact_person?: string | null;
  } | null;
  quote_number?: string | null;
  delivery_days?: number | null;
  payment_terms?: string | null;
  warranty?: string | null;
}

const MATCHED_BY: Record<VendorMatchKey, string> = { gstin: 'GSTIN', phone: 'phone number', name: 'name' };

// Poll cadence while the page is open.
const EXTRACT_POLL_MS = 2_000;
// The ₹0 office AI machine gets this long to pick the read up. After that the
// page stops waiting on it and reads the PDF directly with the Claude API
// (Haiku — the cheapest model), so the person sees prices in seconds instead of
// being told to wait for a notification.
// 2026-10-09: 10s -> 30s (Director). The Windows max-pdf runner is live and
// claims in ~5s; 30s gives it room on a slow minute before we pay.
const EXTRACT_DIRECT_AFTER_MS = 30_000;
// A runner that took the job but never finished: stop spinning eventually.
const EXTRACT_GIVE_UP_MS = 180_000;

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
  const [newVendorGstin, setNewVendorGstin] = useState('');
  const [newVendorPhone, setNewVendorPhone] = useState('');
  const [newVendorAddress, setNewVendorAddress] = useState('');
  const [newVendorContact, setNewVendorContact] = useState('');
  // What the AI did with the vendor section, shown until the person changes it.
  const [vendorNote, setVendorNote] = useState<string | null>(null);
  const [quoteNumber, setQuoteNumber] = useState('');
  const [deliveryDays, setDeliveryDays] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  // Read off the PDF and carried to the PO, so nobody types them on the order page.
  const [warranty, setWarranty] = useState('');
  const [taxes, setTaxes] = useState<Record<string, { gst_percent: number | null; hsn: string | null }>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [specs, setSpecs] = useState<Record<string, QuotedSpec>>({});
  const [openSpecs, setOpenSpecs] = useState<Record<string, boolean>>({});
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  // ── AI PDF read ───────────────────────────────────────────────────────────
  // Enqueued on the ₹0 Max lane and followed while the page is open; if no
  // office runner picks it up quickly, the page switches to a direct paid read.
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

  // Live mirror for applyHeader (same reason as pricesRef: a stable callback
  // that still sees what the person has chosen or typed by the time a read lands).
  const vendorCtxRef = useRef({ vendorMode, vendorId, newVendorName, allVendors, quotedSupplierIds });
  useEffect(() => {
    vendorCtxRef.current = { vendorMode, vendorId, newVendorName, allVendors, quotedSupplierIds };
  }, [vendorMode, vendorId, newVendorName, allVendors, quotedSupplierIds]);

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
        // An empty price means this vendor did not quote the item.
        unit_price: Number(prices[it.id] || 0) > 0 ? Number(prices[it.id]) : null,
        quantity: it.quantity,
        manufacturer: spec?.manufacturer.trim() || null,
        quality_grade: spec?.quality_grade.trim() || null,
        concentration: spec?.concentration.trim() || null,
        other_specs: spec?.other_specs.trim() || null,
        gst_percent: taxes[it.id]?.gst_percent ?? null,
        hsn: taxes[it.id]?.hsn ?? null,
      };
    });
    if (items.every((i) => i.unit_price === null)) {
      toast.error('Enter at least one price — leave the rest empty if the vendor did not quote them.');
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
          gstin: newVendorGstin || null,
          phone: newVendorPhone || null,
          address: newVendorAddress || null,
          contact_person: newVendorContact || null,
          payment_terms: paymentTerms || null,
        });
        supplierId = created.id;
        // The vendor now exists. If anything below fails, a retry must reuse it
        // rather than create the same vendor a second time.
        setVendorMode('existing');
        setVendorId(created.id);
      }

      // Optional document upload to Drive. The document is a nice-to-have: a
      // failed or unconfigured upload must not throw away the prices someone
      // just entered, so the quotation is saved without it and they are told.
      let document_url: string | null = null;
      let document_file_id: string | null = null;
      let attachWarning: string | null = null;
      if (file) {
        try {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('institutionId', institutionId);
          fd.append('rfqNumber', rfq.rfq_number);
          const res = await fetch('/api/procurement/quotations/upload', { method: 'POST', body: fd });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body?.attachment) {
            attachWarning = body?.error || 'Document upload failed';
          } else {
            document_url = body.attachment.url;
            document_file_id = body.attachment.driveFileId;
          }
        } catch {
          attachWarning = 'Document upload failed';
        }
      }

      await createQuotation.mutateAsync({
        dto: {
          institution_id: institutionId,
          rfq_id: rfq.id,
          supplier_id: supplierId,
          vendor_quote_number: quoteNumber || null,
          delivery_time_days: deliveryDays ? Number(deliveryDays) : null,
          payment_terms: paymentTerms || null,
          warranty: warranty || null,
          document_url,
          document_file_id,
          items,
        },
        userId: profile.id,
      });
      if (attachWarning) {
        toast.warning(`Quotation added, but the document was not attached: ${attachWarning}`);
      } else {
        toast.success('Quotation added');
      }
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
  // Fill the vendor and terms from the quotation header. Blanks only: a vendor
  // someone already picked or typed, and any term already entered, are kept.
  const applyHeader = useCallback((result: ExtractResult | null | undefined) => {
    if (!result) return;
    const fill = (value: string | null | undefined) => (prev: string) =>
      prev.trim() || !value ? prev : value;
    setQuoteNumber(fill(result.quote_number));
    setDeliveryDays(fill(result.delivery_days ? String(result.delivery_days) : null));
    setPaymentTerms(fill(result.payment_terms));
    setWarranty(fill(result.warranty));

    const v = result.vendor;
    if (!v) return;
    const ctx = vendorCtxRef.current;
    const alreadyChosen =
      (ctx.vendorMode === 'existing' && !!ctx.vendorId) ||
      (ctx.vendorMode === 'new' && !!ctx.newVendorName.trim());
    if (alreadyChosen) return;

    const match = matchVendor(v, ctx.allVendors);
    if (match) {
      if (ctx.quotedSupplierIds.has(match.vendor.id)) {
        setVendorNote(`${match.vendor.name} has already submitted a quotation here.`);
        toast.warning(`${match.vendor.name} has already quoted here.`);
        return;
      }
      setVendorMode('existing');
      setVendorId(match.vendor.id);
      setVendorNote(
        `Selected ${match.vendor.name} — matched from the PDF by ${MATCHED_BY[match.by]}. Check before saving.`,
      );
      return;
    }

    if (!v.name) return;
    setVendorMode('new');
    setNewVendorName(v.name);
    setNewVendorGstin(normalizeGstin(v.gstin) ?? v.gstin ?? '');
    setNewVendorPhone(v.phone ?? '');
    setNewVendorEmail(v.email ?? '');
    setNewVendorAddress(v.address ?? '');
    setNewVendorContact(v.contact_person ?? '');
    setVendorNote(
      `${v.name} is not a registered vendor yet. Their details were filled from the PDF — saving adds them as a new vendor.`,
    );
  }, []);

  const applyExtraction = useCallback(
    (result: ExtractResult | null | undefined) => {
      applyHeader(result);
      const lines = Array.isArray(result?.lines) ? result!.lines! : [];
      const filledPrices: Record<string, string> = {};
      const numericPrices: Record<string, number> = {};
      const marks: Record<string, AiMark> = {};
      const filledSpecs: Record<string, QuotedSpec> = {};
      const filledTaxes: Record<string, { gst_percent: number | null; hsn: string | null }> = {};

      let keptTyped = 0;
      // A set asked for as one item ("Computer × 5") comes back as its parts, all
      // tagged to that item: one of each part per set, so the unit price is their sum.
      const partsOf: Record<string, string[]> = {};
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
        const part = `${line.item_name || 'Unnamed line'} ₹${price.toLocaleString('en-IN')}`;
        if (partsOf[id]) {
          // Always a person's call: the AI may equally have tagged two alternative
          // offers for one item, which must not be added up.
          partsOf[id].push(part);
          numericPrices[id] += price;
          filledPrices[id] = String(numericPrices[id]);
          marks[id] = 'uncertain';
          filledSpecs[id] = {
            manufacturer: '',
            quality_grade: '',
            concentration: '',
            other_specs: `Set of ${partsOf[id].length} parts: ${partsOf[id].join('; ')}`,
          };
          continue;
        }
        partsOf[id] = [part];
        filledTaxes[id] = {
          gst_percent: typeof line.gst_percent === 'number' ? line.gst_percent : null,
          hsn: line.hsn || null,
        };
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
      setTaxes((prev) => ({ ...prev, ...filledTaxes }));
      setAiFromScan(!!result?.from_scan);
      setAiOutliers(detectPriceOutliers(numericPrices));

      const uncertainCount = Object.values(marks).filter((m) => m === 'uncertain').length;
      toast.success(
        `AI read ${matched} price${matched === 1 ? '' : 's'} — review before saving` +
          (uncertainCount ? ` · ${uncertainCount} uncertain match${uncertainCount === 1 ? '' : 'es'}` : '') +
          (keptTyped ? ` · kept ${keptTyped} price${keptTyped === 1 ? '' : 's'} you typed` : ''),
      );
    },
    [applyHeader],
  );

  // Keep the ref in step with the state it mirrors.
  useEffect(() => {
    pricesRef.current = prices;
  }, [prices]);

  // Hand the vendor PDF to the ₹0 Max lane. This starts the read and returns;
  // the effect below follows it (and takes over directly if nobody picks it up).
  const handleExtractPdf = async () => {
    if (!file || !rfq) return;
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('rfq_id', rfq.id);
      fd.append('items', JSON.stringify(rfq.items.map(extractItemOf)));
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
      // Read right away (no office runner serving the lane) — prices are here.
      if (json.direct && json.result) {
        applyExtraction(json.result as ExtractResult);
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
    } catch (e) {
      toast.error(errorMessage(e, 'Could not read the PDF'));
    } finally {
      setExtracting(false);
    }
  };

  // Choosing a PDF starts the AI read straight away — no second button to find.
  const autoReadFor = useRef<File | null>(null);
  useEffect(() => {
    if (file && file.type === 'application/pdf' && autoReadFor.current !== file) {
      autoReadFor.current = file;
      void handleExtractPdf();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Seconds shown on the progress line while a read is running.
  const [extractElapsed, setExtractElapsed] = useState(0);
  const readInProgress = extracting || !!extractJobId;
  useEffect(() => {
    if (!readInProgress) return;
    const startedAt = Date.now();
    const id = setInterval(() => setExtractElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => {
      clearInterval(id);
      setExtractElapsed(0);
    };
  }, [readInProgress]);

  // Follow the read while this page is open: the ₹0 lane first, then — if no
  // office runner has picked it up within EXTRACT_DIRECT_AFTER_MS — a direct
  // paid read. The direct call is awaited inside the tick, so polling pauses
  // while it runs and the result can never be applied twice.
  useEffect(() => {
    if (!extractJobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let directTried = false;
    const startedAt = Date.now();

    const finish = (result: ExtractResult | null | undefined) => {
      applyExtraction(result);
      setExtractJobId(null);
    };
    const giveUp = (message: string) => {
      toast.error(message);
      setExtractJobId(null);
    };

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/procurement/quotations/extract-pdf/status?job_id=${encodeURIComponent(extractJobId)}`,
        );
        const json = await res.json();
        if (cancelled) return;

        if (json.status === 'done') return finish(json.result as ExtractResult);
        if (json.status === 'error' || json.status === 'canceled' || json.status === 'not_found') {
          return giveUp('AI could not read the PDF — please enter the prices manually.');
        }

        if (json.status === 'pending' && !directTried && Date.now() - startedAt > EXTRACT_DIRECT_AFTER_MS) {
          directTried = true;
          const dres = await fetch('/api/procurement/quotations/extract-pdf/direct', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_id: extractJobId }),
          });
          const djson = await dres.json().catch(() => ({}));
          if (cancelled) return;
          if (djson.status === 'done') return finish(djson.result as ExtractResult);
          if (djson.error) return giveUp(djson.error);
          // 'claimed' / 'running': an office runner took it after all — keep polling.
        }

        if (Date.now() - startedAt > EXTRACT_GIVE_UP_MS) {
          return giveUp('The AI reading is taking too long — please enter the prices manually.');
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
      <ContentLayout title="Add quote">
        <div className="flex items-center justify-center py-16">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }
  if (rfqError) {
    return (
      <ContentLayout title="Add quote">
        <div className="py-12">
          <AlertBox type="error" message="Failed to load this purchase's quotes. Please try again." />
        </div>
      </ContentLayout>
    );
  }
  if (!rfq) {
    return (
      <ContentLayout title="Add quote">
        <p className="text-muted-foreground py-12 text-center">Purchase not found.</p>
      </ContentLayout>
    );
  }
  if (!canManage) {
    return (
      <ContentLayout title="Add quote">
        <div className="py-12">
          <AlertBox type="error" message="You do not have permission to capture quotations." />
        </div>
      </ContentLayout>
    );
  }

  const quoteTotal = rfq.items.reduce((sum, it) => {
    const price = Number(prices[it.id] || 0);
    return sum + (price > 0 ? price * Number(it.quantity) : 0);
  }, 0);

  const requestNo = displayRequestNumber(rfq.source_request?.request_number);

  // Phones: the item takes the full first line, price and total share the second.
  const COLS = 'grid grid-cols-2 items-center gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_128px_104px] sm:gap-y-0';
  const terms = [
    quoteNumber ? `Quote ${quoteNumber}` : null,
    deliveryDays ? `${deliveryDays} days delivery` : null,
    paymentTerms || null,
  ].filter(Boolean);

  return (
    <ContentLayout title="Add quote">
      <div className="w-full space-y-5">
      <div className="mx-auto w-full max-w-xl space-y-5">
        <DetailHeader
          backLabel="Back to the purchase"
          onBack={() => router.push(backHref)}
          title="Add quote"
          meta={`${requestNo ? `${requestNo} · ` : ''}${rfq.items.length} item${rfq.items.length === 1 ? '' : 's'}`}
        />

        <section className="overflow-hidden rounded-xl border bg-background shadow">
          {/* ── Vendor ─────────────────────────────────────────────────── */}
          <div className="space-y-1.5 px-5 pt-5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-semibold">Vendor</Label>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => {
                  setVendorMode(vendorMode === 'existing' ? 'new' : 'existing');
                  setVendorNote(null);
                }}
              >
                {vendorMode === 'existing' ? '+ New vendor' : 'Choose a registered vendor'}
              </button>
            </div>
            {vendorMode === 'existing' ? (
              <Select
                value={vendorId}
                onValueChange={(v) => {
                  setVendorId(v);
                  setVendorNote(null);
                }}
              >
                <SelectTrigger className="h-10 sm:h-9">
                  <SelectValue placeholder={availableVendors.length ? 'Choose a vendor…' : 'No registered vendors — add a new one'} />
                </SelectTrigger>
                <SelectContent>
                  {availableVendors.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No registered vendors yet.</div>
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
              <>
                <Input className="h-10 sm:h-9" placeholder="Vendor's name" value={newVendorName} onChange={(e) => setNewVendorName(e.target.value)} />
                <details className="text-xs">
                  <summary className="cursor-pointer text-primary">More vendor details (optional)</summary>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Input className="h-9 text-sm" placeholder="GSTIN" value={newVendorGstin} onChange={(e) => setNewVendorGstin(e.target.value)} />
                    <Input className="h-9 text-sm" placeholder="Phone" value={newVendorPhone} onChange={(e) => setNewVendorPhone(e.target.value)} />
                    <Input className="h-9 text-sm" type="email" placeholder="Email" value={newVendorEmail} onChange={(e) => setNewVendorEmail(e.target.value)} />
                    <Input className="h-9 text-sm" placeholder="Contact person" value={newVendorContact} onChange={(e) => setNewVendorContact(e.target.value)} />
                    <Input className="col-span-2 h-9 text-sm" placeholder="Address" value={newVendorAddress} onChange={(e) => setNewVendorAddress(e.target.value)} />
                  </div>
                </details>
              </>
            )}
            {vendorNote && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                {vendorNote}
              </p>
            )}
            {/* Quote terms: the AI read fills these from the PDF, but they were read-only
                text, so a wrong or missing value could not be fixed. Now typed or corrected here. */}
            <details className="text-xs" open={terms.length > 0 || undefined}>
              <summary className="cursor-pointer text-primary">
                {terms.length > 0 ? terms.join(' · ') : 'Quote terms (optional)'}
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Input className="h-9 text-sm" aria-label="Vendor's quote number" placeholder="Quote no." value={quoteNumber} onChange={(e) => setQuoteNumber(e.target.value)} />
                <Input className="h-9 text-sm" aria-label="Delivery in days" type="number" min={0} inputMode="numeric" placeholder="Delivery (days)" value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} />
                <Input className="h-9 text-sm" aria-label="Payment terms" placeholder="Payment terms" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
                <Input className="h-9 text-sm" aria-label="Warranty" placeholder="Warranty" value={warranty} onChange={(e) => setWarranty(e.target.value)} />
              </div>
            </details>
          </div>

          {/* ── Fill the prices from a file (optional) ─────────────────────── */}
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-y bg-muted/40 px-5 py-2.5 text-xs">
            <label className={cn('inline-flex cursor-pointer items-center gap-1.5 font-semibold text-primary hover:underline focus-within:underline', readInProgress && 'pointer-events-none opacity-60')}>
              <Upload className="h-3.5 w-3.5" />
              {file ? 'Use a different PDF' : 'Read prices from the PDF'}
              <input
                type="file"
                accept=".pdf"
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
            </label>
            <span className="text-muted-foreground">·</span>
            <label className="cursor-pointer text-muted-foreground hover:text-foreground focus-within:text-foreground focus-within:underline">
              Import Excel
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="sr-only"
                onChange={(e) => {
                  handleImportPrices(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
            </label>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => downloadQuotationTemplate(rfq.rfq_number, rfq.items)}
            >
              <Download className="h-3.5 w-3.5" />
              Template
            </button>
            {file && (
              <span className="basis-full truncate text-muted-foreground">
                {file.name}
                {file.type === 'application/pdf' && !readInProgress && (
                  <>
                    {' · '}
                    <button type="button" className="text-primary hover:underline" onClick={handleExtractPdf}>
                      Read again
                    </button>
                  </>
                )}
                {' · '}
                <button type="button" className="hover:text-foreground" onClick={() => setFile(null)}>
                  Remove
                </button>
              </span>
            )}
            {readInProgress && (
              <span role="status" aria-live="polite" className="flex basis-full items-center gap-2 text-muted-foreground">
                <BeatLoader color="hsl(var(--primary))" size={5} />
                Reading prices from the PDF… <span className="tabular-nums">{extractElapsed}s</span>
              </span>
            )}
            {aiFromScan && <span className="basis-full text-foreground">Read from a scanned image — check every price.</span>}
          </div>

          {/* ── Prices: item | price / unit | total ────────────────────────── */}
          <div className={`${COLS} hidden bg-muted/50 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid`}>
            <span>Item</span>
            <span className="text-right">Price / unit</span>
            <span className="text-right">Total</span>
          </div>
          {rfq.items.map((it) => {
            const entered = Number(prices[it.id] || 0);
            const spec = specs[it.id] ?? EMPTY_SPEC;
            const aiMark = aiFilled[it.id];
            const isOutlier = !!aiOutliers[it.id];
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
                <div className={cn(COLS, 'border-t px-5 py-3', aiMark === 'uncertain' && 'bg-secondary/20')}>
                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    <p className="text-sm font-semibold sm:truncate">
                      {it.item_name}{' '}
                      <span className="font-normal text-muted-foreground">
                        × {Number(it.quantity)}
                        {packOrUnit(it) ? ` ${packOrUnit(it)}` : ''}
                      </span>
                    </p>
                    <p className="truncate text-xs">
                      {isOutlier ? (
                        <span className="font-medium text-destructive">Unusual price — check it</span>
                      ) : aiMark === 'uncertain' ? (
                        <span className="text-foreground">AI not sure this is the right item — check</span>
                      ) : aiMark ? (
                        <span className="text-primary">✓ Read from the PDF</span>
                      ) : (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => setOpenSpecs((p) => ({ ...p, [it.id]: !p[it.id] }))}
                          aria-expanded={specsOpen}
                        >
                          {specsOpen ? 'Hide details' : '+ Brand or details'}
                        </button>
                      )}
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    placeholder="Not quoted"
                    aria-label={`Price per unit for ${it.item_name}`}
                    className={cn('h-9 text-right tabular-nums', aiMark && 'border-secondary')}
                    value={prices[it.id] ?? ''}
                    onChange={(e) => {
                      setPrices((p) => ({ ...p, [it.id]: e.target.value }));
                      clearAiMark();
                    }}
                  />
                  <span className={`text-right text-sm tabular-nums ${entered > 0 ? 'font-semibold' : 'text-muted-foreground'}`}>
                    {entered > 0 ? `₹${(entered * Number(it.quantity)).toLocaleString('en-IN')}` : '—'}
                  </span>
                </div>
                {specsOpen && (
                  <div className="grid gap-2 bg-muted/30 px-5 pb-3 sm:grid-cols-2">
                    <Input className="h-9 text-sm" placeholder="Brand / manufacturer" value={spec.manufacturer} onChange={(e) => updateSpec('manufacturer', e.target.value)} />
                    <Input className="h-9 text-sm" placeholder="Quality / grade" value={spec.quality_grade} onChange={(e) => updateSpec('quality_grade', e.target.value)} />
                    {it.is_chemical && (
                      <Input className="h-9 text-sm" placeholder="Concentration" value={spec.concentration} onChange={(e) => updateSpec('concentration', e.target.value)} />
                    )}
                    <Input className="h-9 text-sm" placeholder="Other details" value={spec.other_specs} onChange={(e) => updateSpec('other_specs', e.target.value)} />
                  </div>
                )}
              </Fragment>
            );
          })}

        </section>
      </div>

        <FormActionBar
          status={
            <span className="text-sm text-foreground">
              Total <b className="tabular-nums">₹{quoteTotal.toLocaleString('en-IN')}</b>
            </span>
          }
        >
          <Button variant="ghost" className="h-11 sm:h-9" onClick={() => router.push(backHref)} disabled={saving}>
            Cancel
          </Button>
          <Button className="h-11 px-5 sm:h-9" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save quote'}
          </Button>
        </FormActionBar>
      </div>
    </ContentLayout>
  );
}

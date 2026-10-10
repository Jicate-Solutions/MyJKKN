'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { usePurchaseOrder } from '@/hooks/procurement/use-purchase-orders';
import { useCreateGrn } from '@/hooks/procurement/use-grns';
import { matchLine } from '@/lib/services/procurement/three-way-match';
import {
  expiredLineBlocks,
  expiryState,
  findDuplicateGrns,
  INVOICE_NUMBER_FORMAT_MESSAGE,
  invoiceAgeCheck,
  invoiceNumberFormatOk,
  lateReasonMissing,
  isReusableInvoiceRead,
  localToday,
  mergeInvoiceRead,
  nextInvoicePollStep,
  READ_FAILED_NOTICE,
  type ReadInvoiceLine,
} from '@/lib/services/procurement/invoice-checks';
import { ProcurementGrnService, type SupplierInvoiceGrn } from '@/lib/services/procurement/grn-service';
import { getPolicyInt } from '@/lib/policies/get-policy-client';
import { POLICY_KEYS } from '@/lib/policies/keys';
import { formatDateDMY } from '@/lib/utils/date-format';
import { GRN_MATCH_CONFIG, type GrnLineInput } from '@/types/procurement';
import { DetailHeader } from '@/components/procurement/detail-header';
import { DuplicateInvoiceCompare } from '@/components/procurement/duplicate-invoice-compare';
import { FormActionBar } from '@/components/procurement/form-action-bar';
import { StatusBadge } from '@/components/procurement/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
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
import { ChevronDown, ChevronRight, RotateCcw, Sparkles } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';
import { cn } from '@/lib/utils';

// One editable row of the receiving form. Seeded from a PO line; the receiver fills
// in what actually arrived. ordered_remaining = PO ordered − already received.
interface LineDraft extends GrnLineInput {
  item_name: string;
  ordered_remaining: number;
  unit_label: string | null;
  po_unit_price: number | null;
}

/** What the ₹0 Max-lane invoice reader returns (result contract, spec from PR #4289). */
interface InvoiceReadResult {
  from_scan?: boolean;
  invoice?: {
    invoice_number?: string | null;
    invoice_date?: string | null;
    invoice_amount?: number | null;
    supplier_name_on_invoice?: string | null;
  } | null;
  lines?: ReadInvoiceLine[];
  unmatched_note?: string | null;
}

/** How an AI-read value is presented until a person edits (= confirms) it. */
type AiMark = 'ai' | 'uncertain';

// Poll cadence while the form is open.
const EXTRACT_POLL_MS = 2_000;
// Nobody claimed the job in this long: the office AI machine is off or busy. Same
// window the other Max-lane features use. The job is left alone so a late read can
// still notify the uploader.
const EXTRACT_UNCLAIMED_MS = 120_000;
// A runner took the job but never finished: stop spinning eventually.
const EXTRACT_GIVE_UP_MS = 180_000;
/** In-code fallback for procurement.invoice.near_expiry_days (platform_policies). */
const NEAR_EXPIRY_DEFAULT_DAYS = 30;

const LATE_RESULT_HINT =
  ' If it is read later you will be notified — choosing the same PDF again then fills the form from it.';

export interface GrnFormProps {
  poId: string;
  /** Called with the new delivery record's id once it is saved. */
  onSaved: (grnId: string) => void;
  /** Back / Cancel. Omitted = no back link and no Cancel button. */
  onCancel?: () => void;
  /** Drops the big page header so the form fits a side sheet. */
  compact?: boolean;
  /** Reports whether the receiver has typed anything, so a container can guard against losing it. */
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * The "Record delivery" (goods receipt) form against one purchase order. Used full-page at
 * /procurement/grn/new?po=… and inside RecordDeliverySheet on the purchase page.
 */
export function GrnForm({ poId, onSaved, onCancel, compact, onDirtyChange }: GrnFormProps) {
  const { profile } = useAuth();

  const { data: po, isLoading } = usePurchaseOrder(poId);
  const createGrn = useCreateGrn();

  const [invoiceNumber, setInvoiceNumber] = useState('');
  // Required fields turn red only after a first Record, not on an untouched form.
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[] | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // ── AI invoice read (₹0 Max lane) ─────────────────────────────────────────
  // Enqueued and followed while the form is open. There is no paid fallback for
  // invoices: if the office AI machine does not pick it up, the person types it in.
  const [extractJobId, setExtractJobId] = useState<string | null>(null);
  // E3 (Director 2026-10-10 afternoon): a reading of THIS file has been filled in, so
  // "Read again" is offered. Cleared when another file is picked.
  const [readFilled, setReadFilled] = useState(false);
  // A plain notice (never an error toast) when AI reading is not available.
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  // Which fields the AI filled — keys 'invoice_number' | 'invoice_date' |
  // 'invoice_amount' | 'line:<po_item_id>'. Cleared the moment a person edits one.
  const [aiFilled, setAiFilled] = useState<Record<string, AiMark>>({});
  const [aiFromScan, setAiFromScan] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  // I3: invoice lines that are not on this order. Shown, never added to the receipt.
  const [notOrdered, setNotOrdered] = useState<ReadInvoiceLine[]>([]);
  // Invoice lines billed a second time against an order line already filled from the
  // invoice. Shown so their quantity is never silently dropped; never added either.
  const [alsoBilled, setAlsoBilled] = useState<ReadInvoiceLine[]>([]);
  // Deep-panel M1: which picked file a read belongs to. Bumped every time a file is
  // picked; a read started for an earlier file (its POST answer, its queued job, its
  // late result) is dropped instead of filling the form from the wrong invoice.
  const fileGen = useRef(0);
  const jobGen = useRef(0);
  // Order lines the person has edited. A late AI result never overwrites them.
  const touchedLines = useRef<Set<string>>(new Set());
  // I4: why an invoice older than the receiver's limit is being accepted.
  const [lateReason, setLateReason] = useState('');
  // I1: earlier receipts with the same invoice number from this supplier.
  const [duplicateOf, setDuplicateOf] = useState<SupplierInvoiceGrn[] | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  // I2 near-expiry window — a platform_policies setting, not a constant.
  const { data: nearExpiryDays = NEAR_EXPIRY_DEFAULT_DAYS } = useQuery({
    queryKey: ['platform-policy', POLICY_KEYS.PROCUREMENT_INVOICE_NEAR_EXPIRY_DAYS],
    queryFn: () =>
      getPolicyInt(POLICY_KEYS.PROCUREMENT_INVOICE_NEAR_EXPIRY_DAYS, NEAR_EXPIRY_DEFAULT_DAYS),
    staleTime: 10 * 60_000,
  });

  const clearAiMark = (key: string) =>
    setAiFilled((p) => {
      if (!p[key]) return p;
      const next = { ...p };
      delete next[key];
      return next;
    });

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

  const dirty =
    lines !== null ||
    !!invoiceNumber ||
    !!invoiceDate ||
    !!invoiceAmount ||
    !!notes ||
    !!invoiceFile ||
    hasExpectations;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

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
        serial_numbers: null,
        cost: null,
      };
    });
  }, [po, lines]);

  const update = (idx: number, patch: Partial<LineDraft>) => {
    const id = drafts[idx]?.po_item_id;
    if (id) {
      clearAiMark(`line:${id}`);
      touchedLines.current.add(id);
    }
    setLines((prev) => {
      const base = prev ?? drafts;
      return base.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    });
  };

  // Fill the form from a finished read. Every value lands in an editable field, marked
  // as AI-filled until a person edits it. Whether a line is ordered, expired or a
  // duplicate is decided by invoice-checks.ts, never by the model. What the person
  // typed always wins over the read — see mergeInvoiceRead.
  const applyExtraction = useCallback(
    (result: InvoiceReadResult | null | undefined) => {
      if (!po) return;
      const r = result ?? {};
      const m = mergeInvoiceRead({
        header: { invoice_number: invoiceNumber, invoice_date: invoiceDate, invoice_amount: invoiceAmount },
        aiMarked: aiFilled,
        lines: drafts,
        touched: touchedLines.current,
        invoice: r.invoice,
        readLines: r.lines,
      });
      if (m.header.invoice_number != null) setInvoiceNumber(m.header.invoice_number);
      if (m.header.invoice_date != null) setInvoiceDate(m.header.invoice_date);
      if (m.header.invoice_amount != null) setInvoiceAmount(m.header.invoice_amount);
      setLines(m.lines);
      setAiFilled(m.marks);
      setNotOrdered(m.notOrdered);
      setAlsoBilled(m.duplicates);
      setAiFromScan(r.from_scan === true);
      setAiNote([r.unmatched_note?.trim(), ...m.unreadable].filter(Boolean).join(' · ') || null);
      setAiNotice(null);

      const matched = m.matched;
      toast.success(
        `Read ${matched} of ${po.items.length} line${matched === 1 ? '' : 's'} — check every AI-marked value before recording` +
          (m.notOrdered.length ? ` · ${m.notOrdered.length} not on this order` : '') +
          (m.duplicates.length ? ` · ${m.duplicates.length} billed again on a line` : '') +
          (m.kept ? ` · kept ${m.kept} value${m.kept === 1 ? '' : 's'} you typed` : '')
      );
    },
    [po, drafts, aiFilled, invoiceNumber, invoiceDate, invoiceAmount]
  );
  // The poll below reads the latest applyExtraction through a ref, so typing in the
  // form does not restart its timers.
  const applyRef = useRef(applyExtraction);
  useEffect(() => {
    applyRef.current = applyExtraction;
  }, [applyExtraction]);

  // Follow the read while the form is open. pending past EXTRACT_UNCLAIMED_MS = the
  // office machine is not serving the lane: tell the person to type it in and stop
  // waiting, but leave the job queued so a late read still notifies them.
  useEffect(() => {
    if (!extractJobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();
    let lastStatus: string | null = null;

    const stop = (notice: string | null) => {
      if (notice) setAiNotice(notice);
      setExtractJobId(null);
    };

    const tick = async () => {
      if (cancelled) return;
      // M1: a job started for a file that is no longer selected is never applied.
      if (jobGen.current !== fileGen.current) return stop(null);
      let status: string | null = null;
      let result: unknown;
      try {
        const res = await fetch(
          `/api/procurement/grn/extract-invoice/status?job_id=${encodeURIComponent(extractJobId)}`
        );
        const json = await res.json();
        if (typeof json?.status === 'string') {
          status = json.status;
          result = json.result;
        }
      } catch {
        // Transient network error — judged below like any other check, so the give-up
        // windows still run.
      }
      if (cancelled || jobGen.current !== fileGen.current) return;
      if (status) lastStatus = status;

      // M2: decided OUTSIDE the try, so nothing a check returns or throws can make the
      // form poll forever. A malformed finished read stops with the "type it in" notice.
      const step = nextInvoicePollStep({
        status,
        result,
        lastStatus,
        waitedMs: Date.now() - startedAt,
        unclaimedMs: EXTRACT_UNCLAIMED_MS,
        giveUpMs: EXTRACT_GIVE_UP_MS,
      });
      if (step.kind === 'apply') {
        try {
          applyRef.current(result as InvoiceReadResult);
          setReadFilled(true);
          return stop(null);
        } catch (e) {
          console.error('[procurement grn-form] could not apply the invoice read:', e);
          return stop(READ_FAILED_NOTICE);
        }
      }
      if (step.kind === 'stop') return stop(step.notice + (step.late ? LATE_RESULT_HINT : ''));
      if (!cancelled) timer = setTimeout(tick, EXTRACT_POLL_MS);
    };

    timer = setTimeout(tick, EXTRACT_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [extractJobId]);

  const num = (v: string) => (v === '' ? 0 : Number(v));

  // Resize a line's serial-number slots to match its current accepted quantity,
  // keeping whatever the receiver already typed for the slots that still exist.
  const resizeSerials = (existing: string[], count: number): string[] =>
    Array.from({ length: Math.max(0, count) }, (_, i) => existing[i] ?? '');

  const setSerialTracking = (idx: number, on: boolean, acceptedQty: number) =>
    update(idx, { serial_numbers: on ? resizeSerials([], acceptedQty) : null });

  const setSerialAt = (idx: number, unit: number, value: string) => {
    setLines((prev) => {
      const base = prev ?? drafts;
      return base.map((l, i) => {
        if (i !== idx || !l.serial_numbers) return l;
        const next = [...l.serial_numbers];
        next[unit] = value;
        return { ...l, serial_numbers: next };
      });
    });
  };

  if (!poId) {
    return (
      <p className="text-muted-foreground py-12 text-center">
        Open an order and choose “Record delivery” to receive against it.
      </p>
    );
  }
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <BeatLoader color="hsl(var(--primary))" size={10} />
      </div>
    );
  }
  if (!po) {
    return <p className="text-muted-foreground py-12 text-center">Purchase order not found.</p>;
  }

  // Check the invoice date against what the receiver expects. A WARNING only — the goods are
  // already at the dock, so an odd date must never block recording what arrived. It exists to
  // catch a back-dated or stale bill before it is accepted, not to stop receipt.
  const poDate = po.created_at?.slice(0, 10) ?? null;
  const today = localToday();
  // I4 — older than the receiver's limit: warn AND require a reason (invoice-checks.ts).
  const invoiceAge = invoiceAgeCheck(invoiceDate || null, today, expectations.max_invoice_age_days);
  const invoiceDateWarning: string | null = !invoiceDate
    ? null
    : poDate && invoiceDate < poDate
      ? `This invoice is dated before the order (${poDate}) — check you have the right bill.`
      : invoiceAge.tooOld
        ? `This invoice is ${invoiceAge.ageDays} days old — you expected one within ${expectations.max_invoice_age_days} days.`
        : null;
  const needsLateReason = invoiceAge.tooOld;
  const lateReasonGap = lateReasonMissing(
    invoiceDate || null,
    today,
    expectations.max_invoice_age_days,
    lateReason
  );
  // I2 — expired goods being accepted block the save.
  const expiredCount = drafts.filter((l) => expiredLineBlocks(l, today)).length;

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

  // Hand the invoice PDF to the ₹0 Max lane. This starts the read and returns; the
  // effect above follows it. "Not available" is a notice, not an error.
  // E3: { readAgain: true } asks the server for a FRESH read of the same PDF, skipping the
  // stored-result reuse for this request only. Same free lane; still deduped while queued;
  // a switched-off lane still answers with the plain "type it in" notice.
  const handleReadInvoice = async ({ readAgain = false }: { readAgain?: boolean } = {}) => {
    if (!invoiceFile || !po) return;
    // M1: if another file is picked while this request is out, its answer is dropped.
    const gen = fileGen.current;
    const stale = () => gen !== fileGen.current;
    setReading(true);
    setAiNotice(null);
    try {
      const fd = new FormData();
      fd.append('file', invoiceFile);
      fd.append('po_id', po.id);
      if (readAgain) fd.append('read_again', '1');
      fd.append(
        'items',
        JSON.stringify(
          po.items.map((i) => ({
            id: i.id,
            item_name: i.item_name,
            item_spec: i.item_spec,
            ordered_quantity: i.ordered_quantity,
            unit_label: i.unit_label,
          }))
        )
      );
      // The reader is told what this receiver expects (watch-for, batch/expiry hunt).
      fd.append('expectations', JSON.stringify(expectations));
      const res = await fetch('/api/procurement/grn/extract-invoice', { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (stale()) return;
      if (!res.ok) throw new Error(json.error || 'Invoice reading failed');

      if (json.unavailable) {
        setAiNotice(json.error || 'AI invoice reading is not available — please type the invoice details in.');
        return;
      }
      if (json.reused && isReusableInvoiceRead(json.result)) {
        applyExtraction(json.result as InvoiceReadResult);
        setReadFilled(true);
        toast.info('Reused an earlier reading of this same invoice PDF. Use “Read again” for a fresh one.');
        return;
      }
      if (typeof json.job_id !== 'string') throw new Error('Could not start the AI reading.');
      jobGen.current = gen;
      setExtractJobId(json.job_id);
    } catch (e) {
      if (!stale()) toast.error(errorMessage(e, 'Could not read the invoice'));
    } finally {
      if (!stale()) setReading(false);
    }
  };

  const submit = async (opts: { heldDuplicate?: boolean } = {}) => {
    setTriedSubmit(true);
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
        serial_numbers: l.serial_numbers,
        cost: l.cost ?? null,
      }));

    if (payload.length === 0) {
      toast.error('Enter a received quantity for at least one line.');
      return;
    }

    // Serial tracking, once switched on for a line, must name every accepted unit —
    // a partial list would post units nobody can trace back to a physical asset.
    const serialGaps = drafts.filter(
      (l) =>
        l.serial_numbers !== null &&
        (l.serial_numbers.length !== Number(l.accepted_quantity) ||
          l.serial_numbers.some((s) => !s.trim()))
    );
    if (serialGaps.length) {
      toast.error(
        `Enter a serial number for every accepted unit — ${serialGaps.length} line(s) incomplete.`
      );
      return;
    }

    // Supplier invoice is mandatory — the GRN records goods received against a billed
    // invoice, and the three-way match needs it to compare against.
    const invoiceNo = invoiceNumber.trim();
    if (!invoiceNo) {
      toast.error('Invoice number is required.');
      return;
    }
    // D3 (Director 2026-10-10): letters, digits, "-" and "/" only — retyped, never
    // silently cleaned (an AI-read number with a space fails here too).
    if (!invoiceNumberFormatOk(invoiceNo)) {
      toast.error(INVOICE_NUMBER_FORMAT_MESSAGE);
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

    // I2 — expired goods cannot be accepted into stock.
    if (expiredCount) {
      toast.error(
        `${expiredCount} line(s) have already expired — reject them or correct the expiry date.`
      );
      return;
    }

    // I4 — an invoice older than the limit you set needs a reason.
    if (lateReasonGap) {
      toast.error('Say why this old invoice is being accepted.');
      return;
    }

    // I1 — the same invoice number from this supplier already recorded: stop and show
    // the earlier one. The person may still record it, on hold (Director: held save) —
    // verify is refused until a verifier other than them confirms it is different.
    if (!opts.heldDuplicate) {
      setCheckingDuplicate(true);
      try {
        const earlier = findDuplicateGrns(
          await ProcurementGrnService.getSupplierInvoiceGrns(po.supplier_id),
          po.supplier_id,
          invoiceNo
        );
        if (earlier.length) {
          setDuplicateOf(earlier);
          return;
        }
      } catch {
        // The lookup failed. Saving is still safe: the receipt page and the verify guard
        // run the same check before anything goes into stock.
      } finally {
        setCheckingDuplicate(false);
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
          invoice_number: invoiceNo,
          invoice_date: invoiceDate || null,
          invoice_amount: invoiceAmount ? Number(invoiceAmount) : null,
          invoice_document_url,
          notes: notes || null,
          expectations,
          late_invoice_reason: needsLateReason ? lateReason.trim() || null : null,
          lines: payload,
        },
        userId: profile!.id,
      });
      toast.success(
        opts.heldDuplicate
          ? `Delivery record ${grn.grn_number} saved on hold — a verifier must confirm the invoice number before stock is added.`
          : `Delivery record ${grn.grn_number} created — pending verification.`
      );
      onDirtyChange?.(false);
      onSaved(grn.id);
    } catch (e) {
      setUploading(false);
      toast.error(errorMessage(e, 'Failed to record delivery'));
    }
  };

  return (
    <div className={compact ? 'space-y-4' : 'w-full space-y-5'}>
      {compact ? (
        <div className="pr-8">
          <p className="font-semibold">Record delivery · Order {po.po_number}</p>
          <p className="text-sm text-muted-foreground">{po.supplier?.name ?? po.supplier_id}</p>
        </div>
      ) : (
        <DetailHeader
          backLabel="Back to the order"
          onBack={() => onCancel?.()}
          title="Record delivery"
          meta={`Order ${po.po_number} · ${po.supplier?.name ?? po.supplier_id}`}
        />
      )}

      {/* Invoice header + AI reading */}
      <section className="overflow-hidden rounded-xl border bg-background shadow">
        <h2 className="border-b px-5 py-3 text-base font-semibold">Supplier invoice</h2>
        <div className="space-y-4 p-5">
          {/* Upload the invoice PDF and let AI pre-fill the receiving details. */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <Label className="text-xs">Invoice document (PDF)</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="file"
                accept=".pdf,image/*"
                className="w-full max-w-xs sm:w-auto"
                onChange={(e) => {
                  // M1: a new file starts a new read. Whatever was being read, or was
                  // found on the previous file, belongs to that file — drop it. Values
                  // already on the form stay, still marked as AI-read until edited.
                  fileGen.current += 1;
                  setInvoiceFile(e.target.files?.[0] ?? null);
                  setReadFilled(false);
                  setReading(false);
                  setExtractJobId(null);
                  setAiNotice(null);
                  setNotOrdered([]);
                  setAlsoBilled([]);
                }}
              />
              {invoiceFile?.type === 'application/pdf' && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-10 sm:h-9"
                  onClick={() => handleReadInvoice()}
                  disabled={reading || !!extractJobId}
                >
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  {reading || extractJobId ? 'Reading invoice…' : 'Read invoice (AI)'}
                </Button>
              )}
              {invoiceFile?.type === 'application/pdf' && readFilled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 sm:h-9"
                  onClick={() => handleReadInvoice({ readAgain: true })}
                  disabled={reading || !!extractJobId}
                  title="Read this same PDF again instead of reusing the earlier reading"
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Read again
                </Button>
              )}
            </div>
            {extractJobId && (
              <p role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-muted-foreground">
                <BeatLoader color="hsl(var(--primary))" size={5} />
                The office AI machine is reading this invoice. Keep typing if you like — you will
                also be notified when it is done.
              </p>
            )}
            {aiNotice && (
              <p role="status" className="text-xs text-foreground">
                {aiNotice}
              </p>
            )}
            {aiFromScan && (
              <p className="text-xs text-foreground">Read from a scanned image — check every number.</p>
            )}
            {aiNote && <p className="text-xs text-muted-foreground">AI note: {aiNote}</p>}
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
                    <p className="hidden text-[11px] text-muted-foreground sm:block">
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
                    <p className="hidden text-[11px] text-muted-foreground sm:block">
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
                    <p className="hidden text-[11px] text-muted-foreground sm:block">
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
                  <p className="hidden text-[11px] text-muted-foreground sm:block">
                    Passed to the AI reader as your instruction, and kept on the delivery record
                    for the verifier.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="grn-invoice-no" className="text-xs font-semibold">
                Invoice number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="grn-invoice-no"
                required
                value={invoiceNumber}
                onChange={(e) => {
                  setInvoiceNumber(e.target.value);
                  clearAiMark('invoice_number');
                }}
                aria-invalid={
                  (triedSubmit && !invoiceNumber.trim()) ||
                  (!!invoiceNumber.trim() && !invoiceNumberFormatOk(invoiceNumber.trim()))
                }
                className={cn('h-9', aiFilled.invoice_number && 'border-secondary')}
              />
              {aiFilled.invoice_number && <AiTag />}
              {triedSubmit && !invoiceNumber.trim() && <p className="text-xs text-destructive">Required.</p>}
              {!!invoiceNumber.trim() && !invoiceNumberFormatOk(invoiceNumber.trim()) && (
                <p className="text-xs text-destructive">{INVOICE_NUMBER_FORMAT_MESSAGE}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="grn-invoice-date" className="text-xs font-semibold">
                Invoice date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="grn-invoice-date"
                type="date"
                required
                value={invoiceDate}
                onChange={(e) => {
                  setInvoiceDate(e.target.value);
                  clearAiMark('invoice_date');
                }}
                aria-invalid={triedSubmit && !invoiceDate}
                className={cn('h-9', aiFilled.invoice_date && 'border-secondary')}
              />
              {aiFilled.invoice_date && <AiTag />}
              {triedSubmit && !invoiceDate && <p className="text-xs text-destructive">Required.</p>}
              {invoiceDateWarning && (
                <p className="text-[11px] text-foreground">
                  {invoiceDateWarning}
                </p>
              )}
              {needsLateReason && (
                <div className="space-y-1 pt-1">
                  <Label htmlFor="grn-late-reason" className="text-xs font-semibold">
                    Why is this old invoice being accepted? <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="grn-late-reason"
                    rows={2}
                    value={lateReason}
                    onChange={(e) => setLateReason(e.target.value)}
                    aria-invalid={triedSubmit && lateReasonGap}
                  />
                  {triedSubmit && lateReasonGap && <p className="text-xs text-destructive">Required.</p>}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="grn-invoice-amount" className="text-xs font-semibold">Invoice amount (₹)</Label>
              <Input
                id="grn-invoice-amount"
                className={cn('h-9', aiFilled.invoice_amount && 'border-secondary')}
                type="number"
                value={invoiceAmount}
                onChange={(e) => {
                  setInvoiceAmount(e.target.value);
                  clearAiMark('invoice_amount');
                }}
              />
              {aiFilled.invoice_amount && <AiTag />}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="grn-notes" className="text-xs font-semibold">Notes</Label>
            <Textarea id="grn-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
      </section>

      {/* Line-by-line receiving */}
      <section className="overflow-hidden rounded-xl border bg-background shadow">
        <h2 className="border-b px-5 py-3 text-base font-semibold">Items received</h2>
        <div className="space-y-4 p-5">
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
            const aiMark = aiFilled[`line:${l.po_item_id}`];
            const expiry = expiryState(l.expiry_date, today, nearExpiryDays);
            const expiredBlocks = expiredLineBlocks(l, today);
            return (
              <div
                key={l.po_item_id}
                className={cn(
                  'rounded-lg border p-4 space-y-3',
                  aiMark && 'border-secondary',
                  aiMark === 'uncertain' && 'bg-secondary/20'
                )}
              >
                <div className="flex items-center justify-between gap-2 sm:gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{l.item_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Outstanding on order: {l.ordered_remaining} {l.unit_label || ''}
                    </p>
                    {aiMark && (
                      <p className="text-xs">
                        {aiMark === 'uncertain' ? (
                          <span className="text-foreground">AI not sure this is the right line — check</span>
                        ) : (
                          <span className="text-primary">AI · read from the invoice — check before recording</span>
                        )}
                      </p>
                    )}
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
                      onChange={(e) => {
                        const qty = num(e.target.value);
                        update(idx, {
                          accepted_quantity: qty,
                          serial_numbers: l.serial_numbers ? resizeSerials(l.serial_numbers, qty) : null,
                        });
                      }}
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

                {/* Serial number capture — Resource Management assets only (e.g. laptops).
                    Optional per line: the receiver decides at the dock, since a brand-new
                    item has no real category yet to derive this from automatically. */}
                {po.domain === 'resource_mgmt' && (
                  <div className="space-y-2 rounded-md border border-dashed p-3">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={l.serial_numbers !== null}
                        onCheckedChange={(v) =>
                          setSerialTracking(idx, !!v, Number(l.accepted_quantity) || 0)
                        }
                      />
                      Track individual serial numbers for this line
                    </label>
                    {l.serial_numbers !== null && (
                      <>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                          {l.serial_numbers.map((s, unit) => (
                            <Input
                              key={unit}
                              placeholder={`Unit ${unit + 1} serial no.`}
                              value={s}
                              onChange={(e) => setSerialAt(idx, unit, e.target.value)}
                              aria-invalid={!s.trim()}
                            />
                          ))}
                        </div>
                        {l.serial_numbers.length === 0 && (
                          <p className="hidden text-xs text-muted-foreground sm:block">
                            Set an accepted quantity above to enter serial numbers.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

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

                {expiredBlocks ? (
                  <p className="text-xs text-destructive">
                    Expired on {formatDateDMY(l.expiry_date)} — expired goods cannot be accepted. Reject
                    them or correct the expiry date.
                  </p>
                ) : expiry === 'expired' ? (
                  <p className="text-xs text-muted-foreground">
                    Expired on {formatDateDMY(l.expiry_date)} — recorded as rejected.
                  </p>
                ) : expiry === 'near_expiry' ? (
                  <p className="text-xs text-foreground">
                    Expires on {formatDateDMY(l.expiry_date)} — within {nearExpiryDays} days.
                  </p>
                ) : null}

                {match.reason && (
                  <p className="text-xs text-muted-foreground">{match.reason}</p>
                )}
              </div>
            );
          })}

          {/* I3 — on the invoice but never ordered. Shown for the record; never added. */}
          {notOrdered.length > 0 && (
            <div className="rounded-lg border border-dashed p-3 space-y-2">
              <p className="text-sm font-medium">
                Not ordered — on the invoice but not on this order ({notOrdered.length})
              </p>
              <p className="text-xs text-muted-foreground">
                These are not added to the delivery. Raise them with the supplier if they were billed.
              </p>
              <ul className="space-y-1 text-sm">
                {notOrdered.map((l, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2">
                    <span className="min-w-0 break-words">{l.item_name || 'Unnamed line'}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {l.invoice_quantity != null ? `× ${l.invoice_quantity}` : ''}
                      {l.invoice_unit_price != null
                        ? ` @ ₹${Number(l.invoice_unit_price).toLocaleString('en-IN')}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Billed twice against one order line — only the first filled the form. */}
          {alsoBilled.length > 0 && (
            <div className="rounded-lg border border-dashed p-3 space-y-2">
              <p className="text-sm font-medium">
                Also billed against a line above ({alsoBilled.length})
              </p>
              <p className="text-xs text-muted-foreground">
                The invoice bills these again on an order line that was already filled from its
                first entry. They are not added — check that line&apos;s quantity and batch and
                change them yourself if these also arrived.
              </p>
              <ul className="space-y-1 text-sm">
                {alsoBilled.map((l, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2">
                    <span className="min-w-0 break-words">
                      {l.item_name || 'Unnamed line'}
                      {(() => {
                        const onPo = po?.items.find((it) => it.id === l.po_item_id)?.item_name;
                        return onPo ? ` → ${onPo}` : '';
                      })()}
                      {l.batch_number ? ` · batch ${l.batch_number}` : ''}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {l.invoice_quantity != null ? `× ${l.invoice_quantity}` : ''}
                      {l.invoice_unit_price != null
                        ? ` @ ₹${Number(l.invoice_unit_price).toLocaleString('en-IN')}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
        </div>
      </section>

      {compact ? (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {onCancel && (
            <Button variant="ghost" className="w-full sm:w-auto" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button className="w-full sm:w-auto" onClick={() => void submit()} disabled={createGrn.isPending || uploading || checkingDuplicate}>
            {uploading ? 'Uploading invoice…' : createGrn.isPending ? 'Creating…' : 'Record delivery'}
          </Button>
        </div>
      ) : (
        <FormActionBar status="Stock is added only after the delivery is checked.">
          {onCancel && (
            <Button variant="ghost" className="h-11 sm:h-9" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button className="h-11 px-5 sm:h-9" onClick={() => void submit()} disabled={createGrn.isPending || uploading || checkingDuplicate}>
            {uploading ? 'Uploading invoice…' : createGrn.isPending ? 'Creating…' : 'Record delivery'}
          </Button>
        </FormActionBar>
      )}

      {/* I1 — same invoice number from this supplier: stop and show the earlier one. */}
      <AlertDialog open={!!duplicateOf} onOpenChange={(o) => !o && setDuplicateOf(null)}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>This invoice number is already recorded</AlertDialogTitle>
            <AlertDialogDescription>
              {po.supplier?.name ?? 'This supplier'} has already billed invoice “{invoiceNumber}” on an
              earlier delivery. Check whether this is the same bill.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <DuplicateInvoiceCompare
            earlier={duplicateOf ?? []}
            current={{
              invoice_number: invoiceNumber || null,
              invoice_date: invoiceDate || null,
              invoice_amount: invoiceAmount || null,
            }}
          />
          <p className="text-sm text-muted-foreground">
            If this really is a different invoice, you can still record the delivery. It is saved
            on hold: nothing goes into stock until a verifier — not you — opens it, compares the
            two and confirms they are different invoices.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back and check</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDuplicateOf(null);
                void submit({ heldDuplicate: true });
              }}
            >
              Record on hold
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Marks a value the AI filled, until a person edits it. */
function AiTag() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-primary">
      <Sparkles className="h-3 w-3" /> AI · check
    </span>
  );
}

/**
 * GrnForm in a wide right-hand sheet, so a delivery is recorded without leaving the purchase.
 * Closing with unsaved input asks first instead of silently dropping it.
 */
export function RecordDeliverySheet({
  poId,
  open,
  onOpenChange,
  onSaved,
}: {
  poId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (grnId: string) => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const close = () => {
    setDirty(false);
    setConfirmDiscard(false);
    onOpenChange(false);
  };
  const requestClose = () => (dirty ? setConfirmDiscard(true) : close());

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => (o ? onOpenChange(true) : requestClose())}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetTitle className="sr-only">Record delivery</SheetTitle>
          <SheetDescription className="sr-only">
            Record what arrived against this purchase order.
          </SheetDescription>
          {open && (
            <GrnForm
              compact
              poId={poId}
              onDirtyChange={setDirty}
              onCancel={requestClose}
              onSaved={(id) => {
                close();
                onSaved?.(id);
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this delivery?</AlertDialogTitle>
            <AlertDialogDescription>
              What you have entered has not been saved and will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={close}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

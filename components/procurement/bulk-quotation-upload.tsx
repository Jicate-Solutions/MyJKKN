'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, X, Loader2, Plus, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { useVendorsForSelect } from '@/hooks/procurement/use-rfqs';
import { useCreateQuotation, useCreateVendor } from '@/hooks/procurement/use-quotations';
import { ProcurementQuotationService } from '@/lib/services/procurement/quotation-service';
import { readQuotationPdf, type ExtractResult } from '@/lib/procurement/read-quotation-pdf';
import { matchVendor, normalizeGstin } from '@/lib/procurement/vendor-match';
import { namesShareAWord } from '@/lib/procurement/item-name-match';
import { errorMessage } from '@/lib/utils/supabase-error';
import { cn } from '@/lib/utils';
import type { RfqWithDetails } from '@/types/procurement';

/**
 * Upload several vendor quotation PDFs at once. The AI reads each one; the person
 * then checks one vendor at a time.
 *
 * The review is built around what was ASKED FOR, not around the PDF: for every
 * requested item the question is "what did this vendor quote for it?", answered by
 * picking the line(s) the AI read from the PDF (pre-picked where the AI matched
 * them), typing a price, or "not in this quote". A set asked for as one item
 * ("Computer × 5") is often quoted as its parts — CPU, RAM, monitor… — so one item
 * may take several lines, and its unit price is their sum. Lines the vendor quoted
 * that nobody asked for are simply ignored. Nothing is saved until Save.
 */

type RowStatus = 'reading' | 'ready' | 'failed' | 'saving' | 'saved';

/** One priced line the AI read from the PDF. */
interface ReadLine {
  idx: number;
  name: string;
  price: number;
  manufacturer: string;
  quality_grade: string;
  concentration: string;
  other_specs: string;
}

/**
 * The answer for one requested item. undefined = not answered yet.
 * `idxs` holds one line for a plain item, or every part of a set (never empty).
 */
type Choice =
  | { kind: 'line'; idxs: number[]; confirmed: boolean }
  | { kind: 'custom'; price: string }
  | { kind: 'none' };

interface Row {
  key: string;
  file: File;
  status: RowStatus;
  error?: string;
  vendorId: string; // existing vendor id, or '' when creating a new vendor
  newVendor: { name: string; gstin: string; phone: string; email: string; address: string; contact: string };
  vendorNote?: string;
  quoteNumber: string;
  deliveryDays: string;
  paymentTerms: string;
  lines: ReadLine[];
  choices: Record<string, Choice | undefined>;
}

const READ_CONCURRENCY = 3;
const NEW_VENDOR = '__new__';
const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const emptyVendor = () => ({ name: '', gstin: '', phone: '', email: '', address: '', contact: '' });
const linesOf = (r: Row, c: Choice | undefined): ReadLine[] =>
  c?.kind === 'line' ? r.lines.filter((l) => c.idxs.includes(l.idx)) : [];
/** Lines already given to some requested item. */
const usedIdxs = (choices: Row['choices']) =>
  new Set(Object.values(choices).flatMap((c) => (c?.kind === 'line' ? c.idxs : [])));

export function BulkQuotationUpload({
  rfq,
  quotedSupplierIds,
  open,
  onOpenChange,
  files,
  onFilesTaken,
}: {
  rfq: RfqWithDetails;
  quotedSupplierIds: Set<string>;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** PDFs the page already picked (its button opens the file picker directly). */
  files?: File[] | null;
  onFilesTaken?: () => void;
}) {
  const { profile } = useAuth();
  const { data: allVendors = [] } = useVendorsForSelect(rfq.institution_id);
  const createQuotation = useCreateQuotation();
  const createVendor = useCreateVendor();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Reads finish asynchronously; the ref lets them match against the current list.
  const vendorsRef = useRef(allVendors);
  useEffect(() => {
    vendorsRef.current = allVendors;
  }, [allVendors]);

  const patch = (key: string, p: Partial<Row> | ((r: Row) => Partial<Row>)) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...(typeof p === 'function' ? p(r) : p) } : r)));

  const setChoice = (key: string, itemId: string, choice: Choice) =>
    patch(key, (r) => ({ choices: { ...r.choices, [itemId]: choice } }));

  const applyResult = (key: string, result: ExtractResult) => {
    const lines: ReadLine[] = [];
    const choices: Row['choices'] = {};
    for (const [idx, line] of (result.lines ?? []).entries()) {
      const price = typeof line.unit_price === 'number' ? line.unit_price : NaN;
      if (!Number.isFinite(price) || price <= 0) continue;
      lines.push({
        idx,
        name: line.item_name || 'Unnamed line',
        price,
        manufacturer: line.manufacturer ?? '',
        quality_grade: line.quality_grade ?? '',
        concentration: line.concentration ?? '',
        other_specs: line.other_specs ?? '',
      });
      // The AI's own match pre-picks the line; an unsure match still needs a look.
      if (line.rfq_item_id) {
        // Shown as a match only when the AI was sure AND the names share a word —
        // "Keyboard" ← "POE INJECTOR 48V" stays an AI guess for a person to check,
        // whichever reader (office runner, direct, cached) produced it.
        const asked = rfq.items.find((it) => it.id === line.rfq_item_id)?.item_name ?? '';
        const sure = !line.uncertain && namesShareAWord(asked, line.item_name || '');
        const prev = choices[line.rfq_item_id];
        // Several lines for one item = the parts of a set. Their sum becomes the
        // price, so a person always looks once — the AI may equally have tagged
        // two alternative offers for the same item, which must not be added up.
        choices[line.rfq_item_id] =
          prev?.kind === 'line'
            ? { kind: 'line', idxs: [...prev.idxs, idx], confirmed: false }
            : { kind: 'line', idxs: [idx], confirmed: sure };
      }
    }

    // Items the AI left unmatched: suggest the first quote line that shares a word
    // with the item's name — as a guess to confirm, never as a match.
    const usedIdx = usedIdxs(choices);
    for (const it of rfq.items) {
      if (choices[it.id]) continue;
      const hit = lines.find((l) => !usedIdx.has(l.idx) && namesShareAWord(it.item_name, l.name));
      if (hit) {
        choices[it.id] = { kind: 'line', idxs: [hit.idx], confirmed: false };
        usedIdx.add(hit.idx);
      }
    }

    let vendorId = '';
    let vendorNote: string | undefined;
    const newVendor = emptyVendor();
    const v = result.vendor;
    if (v) {
      const match = matchVendor(v, vendorsRef.current);
      if (match) {
        vendorId = match.vendor.id;
        vendorNote = `found by ${match.by === 'gstin' ? 'GSTIN' : match.by}`;
      } else if (v.name) {
        newVendor.name = v.name;
        newVendor.gstin = normalizeGstin(v.gstin) ?? v.gstin ?? '';
        newVendor.phone = v.phone ?? '';
        newVendor.email = v.email ?? '';
        newVendor.address = v.address ?? '';
        newVendor.contact = v.contact_person ?? '';
        vendorNote = 'new vendor — will be added';
      }
    }
    patch(key, {
      status: 'ready',
      lines,
      choices,
      vendorId,
      newVendor,
      vendorNote,
      quoteNumber: result.quote_number ?? '',
      deliveryDays: result.delivery_days ? String(result.delivery_days) : '',
      paymentTerms: result.payment_terms ?? '',
    });
  };

  const addFiles = (files: FileList | File[] | null) => {
    if (!files?.length) return;
    const pdfs = [...files].filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length < files.length) toast.warning('Only PDF files can be read — other files were skipped.');
    if (!pdfs.length) return;
    const fresh: Row[] = pdfs.map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      file,
      status: 'reading',
      vendorId: '',
      newVendor: emptyVendor(),
      quoteNumber: '',
      deliveryDays: '',
      paymentTerms: '',
      lines: [],
      choices: {},
    }));
    setRows((prev) => [...prev, ...fresh]);
    setSelectedKey((k) => k ?? fresh[0].key);

    // Read a few at a time so a stack of PDFs doesn't flood the reader.
    const queue = [...fresh];
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        try {
          applyResult(next.key, await readQuotationPdf(next.file, rfq));
        } catch (e) {
          patch(next.key, { status: 'failed', error: errorMessage(e, 'AI could not read this PDF') });
        }
      }
    };
    for (let i = 0; i < Math.min(READ_CONCURRENCY, fresh.length); i++) void worker();
  };

  // Files chosen on the page arrive here; read them as if dropped in.
  useEffect(() => {
    if (open && files?.length) {
      addFiles(files);
      onFilesTaken?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, files]);



  const priceOf = (r: Row, itemId: string): number | null => {
    const c = r.choices[itemId];
    if (!c || c.kind === 'none') return null;
    if (c.kind === 'custom') return Number(c.price) > 0 ? Number(c.price) : null;
    // One of each part per set: the set's unit price is the parts' unit prices added up.
    const parts = linesOf(r, c);
    return parts.length ? parts.reduce((s, l) => s + l.price, 0) : null;
  };

  /** Items still waiting for an answer: unanswered, an unconfirmed AI guess, or a blank typed price. */
  // The one thing that needs a person: an AI match it was unsure of. A price left
  // empty is simply "not quoted by this vendor" — no separate choice to make.
  const toCheck = (r: Row) =>
    rfq.items.filter((it) => {
      const c = r.choices[it.id];
      return c?.kind === 'line' && !c.confirmed;
    }).length;

  // Per-PDF status, computed live — drives the left list, the footer and Save.
  const statusOf = useMemo(() => {
    const out: Record<string, { label: string; tone: 'ok' | 'warn' | 'busy' | 'done'; blocker: string | null }> = {};
    const seen = new Map<string, string>();
    for (const r of rows) {
      if (r.status === 'reading') { out[r.key] = { label: 'Reading…', tone: 'busy', blocker: 'reading' }; continue; }
      if (r.status === 'saving') { out[r.key] = { label: 'Saving…', tone: 'busy', blocker: 'saving' }; continue; }
      if (r.status === 'saved') { out[r.key] = { label: 'Saved', tone: 'done', blocker: 'saved' }; continue; }
      const pending = toCheck(r);
      const priced = rfq.items.filter((it) => priceOf(r, it.id) !== null).length;
      let blocker: string | null = null;
      let label = 'Ready';
      if (!r.vendorId && !r.newVendor.name.trim()) { blocker = 'Choose or add the vendor'; label = 'Add vendor'; }
      else if (r.vendorId && quotedSupplierIds.has(r.vendorId)) { blocker = 'This vendor has already quoted'; label = 'Already quoted'; }
      else if (pending > 0) { blocker = `${pending} item${pending === 1 ? '' : 's'} to check`; label = `${pending} to check`; }
      else if (priced === 0) { blocker = 'No price for any item'; label = 'No prices'; }
      const vendorKey = r.vendorId || `new:${r.newVendor.name.trim().toLowerCase()}`;
      if (!blocker && seen.has(vendorKey)) { blocker = `Same vendor as ${seen.get(vendorKey)}`; label = 'Duplicate'; }
      if (!blocker) seen.set(vendorKey, r.file.name);
      out[r.key] = { label, tone: blocker ? 'warn' : 'ok', blocker };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, rfq.items, quotedSupplierIds]);

  const savable = rows.filter((r) => statusOf[r.key]?.tone === 'ok');
  const stillReading = rows.some((r) => r.status === 'reading');
  const selected = rows.find((r) => r.key === selectedKey) ?? rows.find((r) => r.status !== 'saved') ?? null;

  // One object URL per shown PDF, released when it changes (not one per render).
  const selectedFile = selected?.file ?? null;
  const pdfUrl = useMemo(() => (selectedFile ? URL.createObjectURL(selectedFile) : null), [selectedFile]);
  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  const vendorName = (r: Row) =>
    r.vendorId ? allVendors.find((v) => v.id === r.vendorId)?.name ?? 'Vendor' : r.newVendor.name.trim() || 'Vendor not found';

  const saveAll = async () => {
    if (!profile?.id) return;
    setSaving(true);
    let ok = 0;
    const pdfJobs: Array<{ quotationId: string; file: File }> = [];
    const savedKeys = new Set<string>();
    for (const r of savable) {
      patch(r.key, { status: 'saving' });
      try {
        let supplierId = r.vendorId;
        if (!supplierId) {
          const created = await createVendor.mutateAsync({
            institution_id: rfq.institution_id,
            name: r.newVendor.name.trim(),
            code: null,
            email: r.newVendor.email || null,
            gstin: r.newVendor.gstin || null,
            phone: r.newVendor.phone || null,
            address: r.newVendor.address || null,
            contact_person: r.newVendor.contact || null,
            payment_terms: r.paymentTerms || null,
          });
          supplierId = created.id;
          patch(r.key, { vendorId: created.id }); // a retry must not create it twice
        }

        const created = await createQuotation.mutateAsync({
          dto: {
            institution_id: rfq.institution_id,
            rfq_id: rfq.id,
            supplier_id: supplierId,
            vendor_quote_number: r.quoteNumber || null,
            delivery_time_days: r.deliveryDays ? Number(r.deliveryDays) : null,
            payment_terms: r.paymentTerms || null,
            document_url: null,
            document_file_id: null,
            items: rfq.items.map((it) => {
              const parts = linesOf(r, r.choices[it.id]);
              const line = parts.length === 1 ? parts[0] : undefined;
              return {
                rfq_item_id: it.id,
                unit_price: priceOf(r, it.id), // null = not quoted
                quantity: it.quantity,
                manufacturer: line?.manufacturer || null,
                quality_grade: line?.quality_grade || null,
                concentration: line?.concentration || null,
                // A set keeps its breakdown, so the comparison still shows what the price buys.
                other_specs:
                  parts.length > 1
                    ? `Set of ${parts.length} parts: ${parts.map((p) => `${p.name} ${rupees(p.price)}`).join('; ')}`
                    : line?.other_specs || null,
              };
            }),
          },
          userId: profile.id,
        });
        patch(r.key, { status: 'saved' });
        savedKeys.add(r.key);
        ok++;
        pdfJobs.push({ quotationId: created.id, file: r.file });
      } catch (e) {
        patch(r.key, { status: 'ready', error: errorMessage(e, 'Could not save') });
      }
    }
    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ['procurement-vendors-select', rfq.institution_id] });
    if (ok) toast.success(`${ok} quotation${ok === 1 ? '' : 's'} saved`);
    // Attach the PDFs to Drive in the background — the prices are already saved.
    void attachPdfs(pdfJobs);
    // Side effects stay out of the setRows updater: React runs updaters during
    // render, and closing the dialog there updates the parent page mid-render.
    const left = rows.filter((r) => r.status !== 'saved' && !savedKeys.has(r.key));
    setRows((prev) => prev.filter((r) => r.status !== 'saved'));
    if (left.length === 0) {
      setSelectedKey(null);
      onOpenChange(false);
    } else {
      setSelectedKey(left[0].key);
    }
  };

  const attachPdfs = async (jobs: Array<{ quotationId: string; file: File }>) => {
    if (!jobs.length) return;
    const results = await Promise.all(
      jobs.map(async (j) => {
        try {
          const fd = new FormData();
          fd.append('file', j.file);
          fd.append('institutionId', rfq.institution_id);
          fd.append('rfqNumber', rfq.rfq_number);
          const res = await fetch('/api/procurement/quotations/upload', { method: 'POST', body: fd });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body?.attachment) return false;
          await ProcurementQuotationService.attachQuotationDocument(
            j.quotationId,
            body.attachment.url,
            body.attachment.driveFileId
          );
          return true;
        } catch {
          return false;
        }
      })
    );
    queryClient.invalidateQueries({ queryKey: ['procurement-quotations', rfq.id] });
    const failed = results.filter((x) => !x).length;
    if (failed) toast.warning(`${failed} PDF${failed === 1 ? ' was' : 's were'} not attached (file storage failed) — the prices are saved.`);
  };

  const close = (o: boolean) => {
    if (!o && (saving || stillReading)) return;
    if (!o) {
      setRows([]);
      setSelectedKey(null);
    }
    onOpenChange(o);
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf,.pdf"
      multiple
      className="hidden"
      onChange={(e) => {
        addFiles(e.target.files);
        e.target.value = '';
      }}
    />
  );


  const many = rows.length > 1;
  const COLS = 'grid grid-cols-[minmax(0,1fr)_104px_88px_28px] items-center gap-2.5 sm:grid-cols-[minmax(0,1fr)_120px_100px_28px] sm:gap-3';
  const totalOf = (r: Row) => rfq.items.reduce((sum, it) => sum + (priceOf(r, it.id) ?? 0) * Number(it.quantity), 0);
  const titleOf = (r: Row) =>
    r.status === 'reading' ? 'Reading the quote…' : r.vendorId || r.newVendor.name.trim() ? `Quote from ${vendorName(r)}` : 'Add quote';

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className={`flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-2xl p-0 ${
          many ? 'max-w-3xl' : rows.length === 1 ? 'max-w-xl' : 'max-w-md'
        }`}
      >
        {fileInput}

        {rows.length === 0 ? (
          <>
            <DialogHeader className="px-6 pb-2 pt-5">
              <DialogTitle className="text-lg">Add quotes</DialogTitle>
              <DialogDescription>Choose the vendors&apos; quotation PDFs — the AI reads each one.</DialogDescription>
            </DialogHeader>
            <div className="p-6 pt-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  addFiles(e.dataTransfer.files);
                }}
                className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors hover:border-primary"
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="font-medium">Choose PDFs</span>
                <span className="text-xs text-muted-foreground">or drop them here · several at once</span>
              </button>
            </div>
          </>
        ) : (
          <>
            {/* ── Header: whose quote, which file, View PDF ───────────────── */}
            <DialogHeader className="space-y-0.5 border-b px-6 pb-3 pt-5 pr-12 text-left">
              <DialogTitle className="text-lg">
                {many ? (
                  <>
                    Add quotes <span className="text-sm font-normal text-muted-foreground">· {rows.length} PDFs</span>
                  </>
                ) : (
                  titleOf(rows[0])
                )}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-x-2 text-[13px]">
                {!many && selected && (
                  <>
                    <span className="truncate">{selected.file.name}</span>
                    {selected.vendorNote && selected.vendorId && (
                      <span className="text-green-700 dark:text-green-400">· ✓ vendor {selected.vendorNote}</span>
                    )}
                    {pdfUrl && (
                      <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        · View PDF
                      </a>
                    )}
                  </>
                )}
                <button
                  type="button"
                  className="text-primary hover:underline disabled:opacity-50"
                  onClick={() => inputRef.current?.click()}
                  disabled={saving}
                >
                  {many ? '+ More PDFs' : '· + Another PDF'}
                </button>
              </DialogDescription>
            </DialogHeader>

            <div className={`grid min-h-0 flex-1 overflow-hidden ${many ? 'grid-cols-[180px_minmax(0,1fr)] sm:grid-cols-[200px_minmax(0,1fr)]' : 'grid-cols-1'}`}>
              {/* ── Vendor rail (several PDFs): name + one status word ─────── */}
              {many && (
                <nav aria-label="Quotes" className="flex flex-col gap-1 overflow-y-auto border-r bg-muted/40 p-2">
                  {rows.map((r) => {
                    const st = statusOf[r.key];
                    const isSel = selected?.key === r.key;
                    const dot =
                      st?.tone === 'ok' ? 'text-green-700 dark:text-green-400' : st?.tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground';
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => setSelectedKey(r.key)}
                        className={cn(
                          'flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                          isSel ? 'border-primary bg-background' : 'border-transparent hover:bg-background/70'
                        )}
                      >
                        <span className="truncate text-sm font-semibold" title={r.file.name}>
                          {r.status === 'reading' ? r.file.name : vendorName(r)}
                        </span>
                        <span className={`flex items-center gap-1 text-xs ${dot}`}>
                          {st?.tone === 'busy' ? <Loader2 className="h-3 w-3 animate-spin" /> : '●'} {st?.label}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              )}

              {/* ── The selected quote ─────────────────────────────────────── */}
              <div className="min-h-0 overflow-y-auto">
                {!selected ? null : selected.status === 'reading' ? (
                  <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    Reading {selected.file.name}…
                  </div>
                ) : (
                  <>
                    {many && (
                      <div className="px-5 pt-4">
                        <p className="font-semibold">{vendorName(selected)}</p>
                        <p className="text-xs text-muted-foreground">
                          {selected.file.name}
                          {pdfUrl && (
                            <>
                              {' · '}
                              <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                View PDF
                              </a>
                            </>
                          )}
                          {' · '}
                          <button
                            type="button"
                            className="hover:text-foreground"
                            onClick={() => {
                              setRows((prev) => prev.filter((x) => x.key !== selected.key));
                              setSelectedKey(null);
                            }}
                          >
                            Remove
                          </button>
                        </p>
                      </div>
                    )}

                    {selected.error && (
                      <p className="mx-5 mt-4 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        {selected.error}
                      </p>
                    )}

                    {/* Vendor (asked only when not recognised). Quote no., delivery and payment
                        are not asked — when the AI reads them they are saved and shown here. */}
                    <div className="space-y-3 px-5 pt-4 empty:hidden">
                      {(!selected.vendorId || quotedSupplierIds.has(selected.vendorId)) && (
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">Vendor</span>
                          <div className="flex flex-wrap gap-2">
                            <Select
                              value={selected.vendorId || NEW_VENDOR}
                              onValueChange={(val) => patch(selected.key, { vendorId: val === NEW_VENDOR ? '' : val, vendorNote: undefined })}
                              disabled={selected.status === 'saving'}
                            >
                              <SelectTrigger className="h-9 min-w-0 flex-1 sm:max-w-56" aria-label="Vendor">
                                <SelectValue placeholder="Choose a vendor…" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NEW_VENDOR}>+ New vendor</SelectItem>
                                {allVendors.map((v) => (
                                  <SelectItem key={v.id} value={v.id} disabled={quotedSupplierIds.has(v.id)}>
                                    {v.name}
                                    {quotedSupplierIds.has(v.id) ? ' (already quoted)' : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {!selected.vendorId && (
                              <Input
                                className="h-9 min-w-0 flex-1"
                                placeholder="New vendor's name"
                                aria-label="New vendor's name"
                                value={selected.newVendor.name}
                                onChange={(e) =>
                                  patch(selected.key, (row) => ({ newVendor: { ...row.newVendor, name: e.target.value } }))
                                }
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {(selected.quoteNumber || selected.deliveryDays || selected.paymentTerms) && (
                      <p className="px-5 pt-3 text-xs text-muted-foreground">
                        {[
                          selected.quoteNumber ? `Quote ${selected.quoteNumber}` : null,
                          selected.deliveryDays ? `${selected.deliveryDays} days delivery` : null,
                          selected.paymentTerms || null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}

                    {/* Items: ONE aligned grid — item | price / unit | total */}
                    <div className="mt-4 border-t">
                      <div className={`${COLS} bg-muted/50 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground`}>
                        <span>Item</span>
                        <span className="text-right">Price / unit</span>
                        <span className="text-right">Total</span>
                        <span />
                      </div>
                      {rfq.items.map((it) => {
                        const c = selected.choices[it.id];
                        const price = priceOf(selected, it.id);
                        const parts = linesOf(selected, c);
                        const isSet = parts.length > 1;
                        const unsure = c?.kind === 'line' && !c.confirmed;
                        const unanswered = !c;
                        const notQuoted = c?.kind === 'none';
                        const amber = unsure;
                        const qty = Number(it.quantity);
                        const lineValue = c ? (c.kind === 'line' ? (isSet ? '' : `line:${c.idxs[0]}`) : c.kind) : '';
                        const onPick = (v: string) => {
                          if (v === 'none') setChoice(selected.key, it.id, { kind: 'none' });
                          else if (v === 'custom') setChoice(selected.key, it.id, { kind: 'custom', price: price != null ? String(price) : '' });
                          else setChoice(selected.key, it.id, { kind: 'line', idxs: [Number(v.slice(5))], confirmed: true });
                        };
                        const setParts = (idxs: number[]) =>
                          setChoice(selected.key, it.id, idxs.length ? { kind: 'line', idxs, confirmed: true } : { kind: 'none' });
                        const taken = usedIdxs(selected.choices);
                        const addable = c?.kind === 'line' ? selected.lines.filter((l) => !taken.has(l.idx)) : [];
                        // Typing in the price box always wins over what the AI read.
                        const typed = (v: string) => setChoice(selected.key, it.id, { kind: 'custom', price: v });
                        // Every row ends in the same small menu: pick another line from the PDF,
                        // or mark the item not quoted / quoted again.
                        const rowMenu = selected.lines.length === 0 ? <span /> : (
                          <Select value={lineValue} onValueChange={onPick} disabled={selected.status === 'saving'}>
                            <SelectTrigger
                              className="h-7 w-7 justify-center border-0 p-0 text-muted-foreground shadow-none hover:bg-muted focus:ring-0 [&>svg:last-child]:hidden"
                              aria-label={`More for ${it.item_name}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </SelectTrigger>
                            <SelectContent align="end" className="max-w-[520px]">
                              {selected.lines.length > 0 && (
                                <div className="px-2 py-1 text-xs text-muted-foreground">Use a line from the PDF</div>
                              )}
                              {selected.lines.map((l) => (
                                <SelectItem key={l.idx} value={`line:${l.idx}`}>
                                  <span className="flex w-full items-center justify-between gap-4">
                                    <span className="truncate">{l.name}</span>
                                    <b className="shrink-0 tabular-nums">{rupees(l.price)}</b>
                                  </span>
                                </SelectItem>
                              ))}

                            </SelectContent>
                          </Select>
                        );
                        return (
                          <div
                            key={it.id}
                            className={cn(COLS, 'border-t px-5 py-3', amber && 'bg-amber-50/70 dark:bg-amber-950/20')}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">
                                {it.item_name}{' '}
                                <span className="font-normal text-muted-foreground">
                                  × {qty}
                                  {it.unit_label ? ` ${it.unit_label}` : ''}
                                </span>
                              </p>
                              {/* one short status — actions live in the row's ⋯ menu */}
                              <p className="truncate text-xs">
                                {unsure ? (
                                  <span className="text-amber-800 dark:text-amber-300">
                                    {isSet ? `${parts.length} parts = one set?` : `“${parts[0]?.name}”?`}{' '}
                                    <button
                                      type="button"
                                      className="ml-1 rounded bg-primary px-1.5 py-px font-semibold text-primary-foreground hover:bg-primary/90"
                                      onClick={() => c?.kind === 'line' && setChoice(selected.key, it.id, { ...c, confirmed: true })}
                                    >
                                      Yes
                                    </button>
                                  </span>
                                ) : unanswered || notQuoted || c?.kind === 'custom' ? null : (
                                  <span className="text-green-700 dark:text-green-400" title={parts.map((p) => p.name).join(', ')}>
                                    ✓ {isSet ? `Set of ${parts.length} parts` : parts[0]?.name}
                                  </span>
                                )}
                              </p>
                              {isSet && (
                                <details className="mt-1 text-xs text-muted-foreground">
                                  <summary className="cursor-pointer text-primary">See the {parts.length} parts</summary>
                                  <ul className="mt-1 space-y-0.5">
                                    {parts.map((p) => (
                                      <li key={p.idx} className="flex items-center justify-between gap-2">
                                        <span className="truncate">{p.name}</span>
                                        <span className="flex shrink-0 items-center gap-1 tabular-nums">
                                          {rupees(p.price)}
                                          <button
                                            type="button"
                                            className="rounded p-0.5 hover:bg-muted hover:text-foreground"
                                            aria-label={`Remove ${p.name} from ${it.item_name}`}
                                            onClick={() => setParts(c?.kind === 'line' ? c.idxs.filter((i) => i !== p.idx) : [])}
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                  {addable.length > 0 && c?.kind === 'line' && (
                                    <Select key={c.idxs.length} onValueChange={(v) => setParts([...c.idxs, Number(v.slice(5))])}>
                                      <SelectTrigger className="mt-1 h-7 w-auto gap-1 px-2 text-xs" aria-label={`Add a part to ${it.item_name}`}>
                                        <Plus className="h-3 w-3" /> Add a part
                                      </SelectTrigger>
                                      <SelectContent className="max-w-[520px]">
                                        {addable.map((l) => (
                                          <SelectItem key={l.idx} value={`line:${l.idx}`}>
                                            <span className="flex w-full items-center justify-between gap-4">
                                              <span className="truncate">{l.name}</span>
                                              <b className="shrink-0 tabular-nums">{rupees(l.price)}</b>
                                            </span>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </details>
                              )}
                            </div>

                            {(
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                inputMode="decimal"
                                aria-label={`Price per unit for ${it.item_name}`}
                                placeholder="—"
                                className={cn(
                                  'h-9 bg-background text-right tabular-nums',
                                  amber && 'border-amber-400'
                                )}
                                value={c?.kind === 'custom' ? c.price : price != null ? String(price) : ''}
                                onChange={(e) => typed(e.target.value)}
                                disabled={selected.status === 'saving'}
                              />
                            )}
                            <span className={`text-right text-sm tabular-nums ${price != null ? 'font-semibold' : 'text-muted-foreground'}`}>
                              {price != null ? rupees(price * qty) : '—'}
                            </span>
                            {rowMenu}
                          </div>
                        );
                      })}
                      <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">
                        Leave a price empty if this vendor didn&apos;t quote that item.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Footer: total, what is left, Save ─────────────────────────── */}
            <div className="flex flex-wrap items-center gap-3 border-t bg-muted/40 px-6 py-3">
              <span className="min-w-0 flex-1 text-sm">
                {stillReading ? (
                  <span className="text-muted-foreground">Reading the PDFs…</span>
                ) : many ? (
                  <>
                    <b>
                      {savable.length} of {rows.length}
                    </b>{' '}
                    ready
                    {selected && statusOf[selected.key]?.tone === 'warn' && (
                      <span className="text-amber-700 dark:text-amber-400"> · {vendorName(selected)}: {statusOf[selected.key]?.blocker}</span>
                    )}
                  </>
                ) : selected ? (
                  <>
                    <span className="block">
                      Total <b className="tabular-nums">{rupees(totalOf(selected))}</b>
                    </span>
                    {statusOf[selected.key]?.tone === 'warn' && (
                      <span className="block text-xs text-amber-700 dark:text-amber-400">{statusOf[selected.key]?.blocker}</span>
                    )}
                  </>
                ) : null}
              </span>
              <Button variant="ghost" onClick={() => close(false)} disabled={saving || stillReading}>
                Cancel
              </Button>
              <Button className="h-10 px-5" onClick={saveAll} disabled={saving || stillReading || savable.length === 0}>
                {saving ? 'Saving…' : savable.length > 1 ? `Save ${savable.length} quotes` : 'Save quote'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

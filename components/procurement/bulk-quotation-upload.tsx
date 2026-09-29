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
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, FileText, X, Loader2, Check, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { useVendorsForSelect } from '@/hooks/procurement/use-rfqs';
import { useCreateQuotation, useCreateVendor } from '@/hooks/procurement/use-quotations';
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
 * picking one of the lines the AI read from the PDF (pre-picked where the AI
 * matched it), typing a price, or "not in this quote". Lines the vendor quoted that
 * nobody asked for are simply ignored. Nothing is saved until Save.
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

/** The answer for one requested item. undefined = not answered yet. */
type Choice =
  | { kind: 'line'; idx: number; confirmed: boolean }
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

export function BulkQuotationUpload({
  rfq,
  quotedSupplierIds,
  open,
  onOpenChange,
}: {
  rfq: RfqWithDetails;
  quotedSupplierIds: Set<string>;
  open: boolean;
  onOpenChange: (o: boolean) => void;
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
      if (line.rfq_item_id && !choices[line.rfq_item_id]) {
        // Shown as a match only when the AI was sure AND the names share a word —
        // "Keyboard" ← "POE INJECTOR 48V" stays an AI guess for a person to check,
        // whichever reader (office runner, direct, cached) produced it.
        const asked = rfq.items.find((it) => it.id === line.rfq_item_id)?.item_name ?? '';
        const sure = !line.uncertain && namesShareAWord(asked, line.item_name || '');
        choices[line.rfq_item_id] = { kind: 'line', idx, confirmed: sure };
      }
    }

    // Items the AI left unmatched: suggest the first quote line that shares a word
    // with the item's name — as a guess to confirm, never as a match.
    const usedIdx = new Set(
      Object.values(choices).flatMap((ch) => (ch?.kind === 'line' ? [ch.idx] : []))
    );
    for (const it of rfq.items) {
      if (choices[it.id]) continue;
      const hit = lines.find((l) => !usedIdx.has(l.idx) && namesShareAWord(it.item_name, l.name));
      if (hit) {
        choices[it.id] = { kind: 'line', idx: hit.idx, confirmed: false };
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

  const addFiles = (files: FileList | null) => {
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

  const priceOf = (r: Row, itemId: string): number | null => {
    const c = r.choices[itemId];
    if (!c || c.kind === 'none') return null;
    if (c.kind === 'custom') return Number(c.price) > 0 ? Number(c.price) : null;
    return r.lines.find((l) => l.idx === c.idx)?.price ?? null;
  };

  /** Items still waiting for an answer: unanswered, an unconfirmed AI guess, or a blank typed price. */
  const toCheck = (r: Row) =>
    rfq.items.filter((it) => {
      const c = r.choices[it.id];
      if (!c) return true;
      if (c.kind === 'line') return !c.confirmed;
      if (c.kind === 'custom') return !(Number(c.price) > 0);
      return false;
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
    let noPdf = 0;
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

        let document_url: string | null = null;
        let document_file_id: string | null = null;
        try {
          const fd = new FormData();
          fd.append('file', r.file);
          fd.append('institutionId', rfq.institution_id);
          fd.append('rfqNumber', rfq.rfq_number);
          const res = await fetch('/api/procurement/quotations/upload', { method: 'POST', body: fd });
          const body = await res.json().catch(() => ({}));
          if (res.ok && body?.attachment) {
            document_url = body.attachment.url;
            document_file_id = body.attachment.driveFileId;
          } else {
            noPdf++;
          }
        } catch {
          noPdf++; // the PDF is a nice-to-have; the prices are what matter — but say so
        }

        await createQuotation.mutateAsync({
          dto: {
            institution_id: rfq.institution_id,
            rfq_id: rfq.id,
            supplier_id: supplierId,
            vendor_quote_number: r.quoteNumber || null,
            delivery_time_days: r.deliveryDays ? Number(r.deliveryDays) : null,
            payment_terms: r.paymentTerms || null,
            document_url,
            document_file_id,
            items: rfq.items.map((it) => {
              const c = r.choices[it.id];
              const line = c?.kind === 'line' ? r.lines.find((l) => l.idx === c.idx) : undefined;
              return {
                rfq_item_id: it.id,
                unit_price: priceOf(r, it.id), // null = not quoted
                quantity: it.quantity,
                manufacturer: line?.manufacturer || null,
                quality_grade: line?.quality_grade || null,
                concentration: line?.concentration || null,
                other_specs: line?.other_specs || null,
              };
            }),
          },
          userId: profile.id,
        });
        patch(r.key, { status: 'saved' });
        ok++;
      } catch (e) {
        patch(r.key, { status: 'ready', error: errorMessage(e, 'Could not save') });
      }
    }
    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ['procurement-vendors-select', rfq.institution_id] });
    if (ok) toast.success(`${ok} quotation${ok === 1 ? '' : 's'} saved`);
    if (noPdf) toast.warning(`${noPdf} PDF${noPdf === 1 ? ' was' : 's were'} not attached (file storage failed) — the prices were saved.`);
    setRows((prev) => {
      const left = prev.filter((r) => r.status !== 'saved');
      if (left.length === 0) {
        onOpenChange(false);
        setSelectedKey(null);
      } else {
        setSelectedKey(left[0].key);
      }
      return left;
    });
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

  const toneClass = {
    ok: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
    warn: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    busy: 'bg-muted text-muted-foreground',
    done: 'bg-muted text-muted-foreground',
  } as const;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        {fileInput}
        <DialogHeader className="flex-row items-center justify-between gap-4 space-y-0 border-b px-5 py-4 pr-12">
          <div>
            <DialogTitle className="text-lg">Add quotations</DialogTitle>
            <DialogDescription>
              {rows.length
                ? `${rows.length} PDF${rows.length === 1 ? '' : 's'} · check each vendor, then save`
                : 'Choose all the vendor quotation PDFs together. The AI reads each one.'}
            </DialogDescription>
          </div>
          {rows.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={saving}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add more PDFs
            </Button>
          )}
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="p-5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                addFiles(e.dataTransfer.files);
              }}
              className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-14 text-center transition-colors hover:border-primary"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="font-medium">Choose PDFs or drop them here</span>
              <span className="text-xs text-muted-foreground">Several files at once · max 15 MB each</span>
            </button>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[260px_minmax(0,1fr)]">
            {/* ── Left: one card per PDF ─────────────────────────────── */}
            <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto border-b bg-muted/30 p-2.5 md:max-h-none md:border-b-0 md:border-r">
              {rows.map((r) => {
                const st = statusOf[r.key];
                const isSel = selected?.key === r.key;
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setSelectedKey(r.key)}
                    className={cn(
                      'flex flex-col gap-1 rounded-lg border bg-background p-2.5 text-left transition-colors',
                      isSel ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/50'
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-semibold">
                        {r.status === 'reading' ? 'Reading…' : vendorName(r)}
                      </span>
                      {st && (
                        <span className={cn('flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', toneClass[st.tone])}>
                          {st.tone === 'busy' && <Loader2 className="h-3 w-3 animate-spin" />}
                          {st.tone === 'ok' && <Check className="h-3 w-3" />}
                          {st.label}
                        </span>
                      )}
                    </span>
                    <span className="truncate text-xs text-muted-foreground" title={r.file.name}>
                      {r.file.name}
                    </span>
                    {st?.tone === 'warn' && st.blocker && st.blocker !== st.label && (
                      <span className="text-[11px] text-amber-700 dark:text-amber-400">{st.blocker}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Right: the selected vendor ─────────────────────────── */}
            <div className="min-h-0 overflow-y-auto p-5">
              {!selected ? null : selected.status === 'reading' ? (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  The AI is reading {selected.file.name}…
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Vendor */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="w-[240px]">
                          <Select
                            value={selected.vendorId || NEW_VENDOR}
                            onValueChange={(val) => patch(selected.key, { vendorId: val === NEW_VENDOR ? '' : val })}
                            disabled={selected.status === 'saving'}
                          >
                            <SelectTrigger className="h-9 font-semibold">
                              <SelectValue placeholder="Choose vendor" />
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
                        </div>
                        {!selected.vendorId && (
                          <Input
                            className="h-9 w-[220px]"
                            placeholder="New vendor name"
                            value={selected.newVendor.name}
                            onChange={(e) =>
                              patch(selected.key, (row) => ({ newVendor: { ...row.newVendor, name: e.target.value } }))
                            }
                          />
                        )}
                        {selected.vendorNote && (
                          <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                            <Check className="h-3.5 w-3.5" />
                            {selected.vendorNote}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {[
                          selected.deliveryDays ? `Delivery ${selected.deliveryDays} days` : null,
                          selected.paymentTerms || null,
                          selected.quoteNumber ? `Quote no. ${selected.quoteNumber}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'No delivery or payment terms found in the PDF'}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" asChild>
                        <a href={pdfUrl ?? undefined} target="_blank" rel="noopener noreferrer">
                          <FileText className="mr-1.5 h-4 w-4" />
                          View PDF
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        disabled={selected.status === 'saving'}
                        onClick={() => {
                          setRows((prev) => prev.filter((x) => x.key !== selected.key));
                          setSelectedKey(null);
                        }}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  </div>

                  {selected.error && (
                    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
                      {selected.error} — type the prices below.
                    </p>
                  )}

                  {/* For each thing asked for: what the AI found in this quote, and whether to trust it */}
                  <div className="overflow-hidden rounded-lg border">
                    <div className="hidden grid-cols-[minmax(0,1fr)_64px_minmax(0,1.6fr)_110px] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground md:grid">
                      <span>You asked for</span>
                      <span className="text-right">Qty</span>
                      <span>Found in this quote</span>
                      <span className="text-right">Total</span>
                    </div>
                    {rfq.items.map((it) => {
                      const c = selected.choices[it.id];
                      const price = priceOf(selected, it.id);
                      const line = c?.kind === 'line' ? selected.lines.find((l) => l.idx === c.idx) : undefined;
                      const unsure = c?.kind === 'line' && !c.confirmed;
                      const unanswered = !c;
                      const needsYou = unsure || unanswered || (c?.kind === 'custom' && !(Number(c.price) > 0));
                      const value = c ? (c.kind === 'line' ? `line:${c.idx}` : c.kind) : '';
                      const onPick = (v: string) => {
                        if (v === 'none') setChoice(selected.key, it.id, { kind: 'none' });
                        else if (v === 'custom')
                          setChoice(selected.key, it.id, { kind: 'custom', price: price != null ? String(price) : '' });
                        else setChoice(selected.key, it.id, { kind: 'line', idx: Number(v.slice(5)), confirmed: true });
                      };
                      return (
                        <div
                          key={it.id}
                          className={cn(
                            'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 border-b px-3 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_64px_minmax(0,1.6fr)_110px]',
                            needsYou && 'bg-amber-50/70 dark:bg-amber-950/20'
                          )}
                        >
                          {/* asked for */}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{it.item_name}</p>
                            {it.item_spec && <p className="text-xs text-muted-foreground">{it.item_spec}</p>}
                          </div>
                          <span className="text-right text-sm tabular-nums">
                            {Number(it.quantity)}
                            {it.unit_label ? <span className="text-muted-foreground"> {it.unit_label}</span> : null}
                          </span>

                          {/* found in the quote */}
                          <div className="col-span-2 min-w-0 space-y-1.5 md:col-span-1">
                            {line ? (
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm leading-snug">{line.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    <b className="text-foreground tabular-nums">{rupees(line.price)}</b> each
                                  </p>
                                </div>
                                {unsure ? (
                                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                    AI guess
                                  </span>
                                ) : (
                                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800 dark:bg-green-950 dark:text-green-300">
                                    <Check className="h-3 w-3" /> Match
                                  </span>
                                )}
                              </div>
                            ) : c?.kind === 'custom' ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  autoFocus
                                  type="number"
                                  min={0}
                                  step="any"
                                  aria-label={`Price for ${it.item_name}`}
                                  placeholder="Price per unit (₹)"
                                  className="h-8 w-40"
                                  value={c.price}
                                  onChange={(e) => setChoice(selected.key, it.id, { kind: 'custom', price: e.target.value })}
                                />
                                <span className="text-xs text-muted-foreground">typed by you</span>
                              </div>
                            ) : c?.kind === 'none' ? (
                              <p className="text-sm text-muted-foreground">Not in this quote</p>
                            ) : (
                              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                                Not found in this quote
                              </p>
                            )}

                            {/* what to do about it */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              {unsure && c?.kind === 'line' && (
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => setChoice(selected.key, it.id, { kind: 'line', idx: c.idx, confirmed: true })}
                                >
                                  <Check className="mr-1 h-3.5 w-3.5" />
                                  Yes, same item
                                </Button>
                              )}
                              <Select value={value} onValueChange={onPick} disabled={selected.status === 'saving'}>
                                <SelectTrigger
                                  className={cn(
                                    'h-7 w-auto gap-1 px-2 text-xs',
                                    unanswered ? 'border-amber-500 font-semibold' : 'text-muted-foreground'
                                  )}
                                  aria-label={`Choose the price for ${it.item_name}`}
                                >
                                  {unanswered ? 'Pick from the quote' : unsure ? 'No, pick another' : 'Change'}
                                </SelectTrigger>
                                <SelectContent className="max-w-[560px]">
                                  {selected.lines.map((l) => (
                                    <SelectItem key={l.idx} value={`line:${l.idx}`}>
                                      <span className="flex w-full items-center justify-between gap-4">
                                        <span className="truncate">{l.name}</span>
                                        <b className="shrink-0 tabular-nums">{rupees(l.price)}</b>
                                      </span>
                                    </SelectItem>
                                  ))}
                                  {selected.lines.length > 0 && <SelectSeparator />}
                                  <SelectItem value="custom">Type a price instead</SelectItem>
                                  <SelectItem value="none">Not in this quote</SelectItem>
                                </SelectContent>
                              </Select>
                              {unanswered && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-muted-foreground"
                                  onClick={() => setChoice(selected.key, it.id, { kind: 'none' })}
                                >
                                  Not quoted
                                </Button>
                              )}
                            </div>
                          </div>

                          <span className="hidden pt-0.5 text-right text-sm font-semibold tabular-nums md:block">
                            {price != null ? rupees(price * Number(it.quantity)) : <span className="font-normal text-muted-foreground">—</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-xs text-muted-foreground">
                      {(() => {
                        const used = new Set(
                          Object.values(selected.choices)
                            .filter((c): c is Extract<Choice, { kind: 'line' }> => c?.kind === 'line')
                            .map((c) => c.idx)
                        );
                        const other = selected.lines.filter((l) => !used.has(l.idx)).length;
                        return other ? `${other} other line${other === 1 ? '' : 's'} in this PDF not asked for — ignored` : '';
                      })()}
                    </span>
                    <span>
                      Total for your items{' '}
                      <b className="tabular-nums">
                        {rupees(rfq.items.reduce((s, it) => s + (priceOf(selected, it.id) ?? 0) * Number(it.quantity), 0))}
                      </b>
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-5 py-3">
            <span className="text-sm text-muted-foreground">
              {stillReading ? (
                'Waiting for the AI to finish reading…'
              ) : (
                <>
                  <b className="text-foreground">{savable.length} of {rows.length}</b> ready to save
                </>
              )}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => close(false)} disabled={saving || stillReading}>
                Cancel
              </Button>
              <Button onClick={saveAll} disabled={saving || stillReading || savable.length === 0}>
                {saving ? 'Saving…' : `Save ${savable.length || ''} quotation${savable.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

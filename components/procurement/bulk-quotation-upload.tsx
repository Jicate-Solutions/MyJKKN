'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, FileText, X, Loader2, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { useVendorsForSelect } from '@/hooks/procurement/use-rfqs';
import { useCreateQuotation, useCreateVendor } from '@/hooks/procurement/use-quotations';
import { readQuotationPdf, type ExtractResult } from '@/lib/procurement/read-quotation-pdf';
import { matchVendor, normalizeGstin } from '@/lib/procurement/vendor-match';
import { errorMessage } from '@/lib/utils/supabase-error';
import { cn } from '@/lib/utils';
import type { RfqWithDetails } from '@/types/procurement';

/**
 * Upload several vendor quotation PDFs at once. Each PDF is read by the AI (always
 * on — nobody has to press "read"), matched to a vendor, and shown in one review
 * list; one "Save all" stores every quotation. Prices the AI was unsure of are
 * highlighted, and nothing is saved until the person presses Save.
 */

type RowStatus = 'reading' | 'ready' | 'failed' | 'saving' | 'saved';

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
  prices: Record<string, string>;
  uncertain: Record<string, boolean>;
  specs: Record<string, { manufacturer: string; quality_grade: string; concentration: string; other_specs: string }>;
  /** Priced lines the AI read but could not match to a requested item — the person assigns them. */
  unmatched: Array<{ idx: number; name: string; price: number; manufacturer: string; other_specs: string }>;
  open: boolean;
}

const READ_CONCURRENCY = 3;
const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

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
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  // Reads finish asynchronously; the ref lets them match against the current list.
  const vendorsRef = useRef(allVendors);
  useEffect(() => {
    vendorsRef.current = allVendors;
  }, [allVendors]);

  const patch = (key: string, p: Partial<Row> | ((r: Row) => Partial<Row>)) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...(typeof p === 'function' ? p(r) : p) } : r)));

  const applyResult = (key: string, result: ExtractResult) => {
    const prices: Row['prices'] = {};
    const uncertain: Row['uncertain'] = {};
    const specs: Row['specs'] = {};
    const unmatched: Row['unmatched'] = [];
    for (const [idx, line] of (result.lines ?? []).entries()) {
      const id = line.rfq_item_id;
      const price = typeof line.unit_price === 'number' ? line.unit_price : NaN;
      if (!Number.isFinite(price) || price <= 0) continue;
      if (!id) {
        // Read with a price, but the vendor named it differently from the request.
        unmatched.push({
          idx,
          name: line.item_name || 'Unnamed line',
          price,
          manufacturer: line.manufacturer ?? '',
          other_specs: line.other_specs ?? '',
        });
        continue;
      }
      prices[id] = String(price);
      if (line.uncertain) uncertain[id] = true;
      specs[id] = {
        manufacturer: line.manufacturer ?? '',
        quality_grade: line.quality_grade ?? '',
        concentration: line.concentration ?? '',
        other_specs: line.other_specs ?? '',
      };
    }
    let vendorId = '';
    let vendorNote: string | undefined;
    const newVendor = { name: '', gstin: '', phone: '', email: '', address: '', contact: '' };
    const v = result.vendor;
    if (v) {
      const match = matchVendor(v, vendorsRef.current);
      if (match) {
        vendorId = match.vendor.id;
        vendorNote = `Matched ${match.vendor.name} by ${match.by === 'gstin' ? 'GSTIN' : match.by}`;
      } else if (v.name) {
        newVendor.name = v.name;
        newVendor.gstin = normalizeGstin(v.gstin) ?? v.gstin ?? '';
        newVendor.phone = v.phone ?? '';
        newVendor.email = v.email ?? '';
        newVendor.address = v.address ?? '';
        newVendor.contact = v.contact_person ?? '';
        vendorNote = 'Not a registered vendor yet — will be added as new';
      }
    }
    patch(key, {
      status: 'ready',
      prices,
      uncertain,
      specs,
      vendorId,
      newVendor,
      vendorNote,
      quoteNumber: result.quote_number ?? '',
      deliveryDays: result.delivery_days ? String(result.delivery_days) : '',
      paymentTerms: result.payment_terms ?? '',
      unmatched,
      open: Object.keys(uncertain).length > 0 || unmatched.length > 0,
    });
  };

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const pdfs = [...files].filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length < files.length) toast.warning('Only PDF files can be read — other files were skipped.');
    const fresh: Row[] = pdfs.map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      file,
      status: 'reading',
      vendorId: '',
      newVendor: { name: '', gstin: '', phone: '', email: '', address: '', contact: '' },
      quoteNumber: '',
      deliveryDays: '',
      paymentTerms: '',
      prices: {},
      uncertain: {},
      specs: {},
      unmatched: [],
      open: false,
    }));
    setRows((prev) => [...prev, ...fresh]);

    // Read a few at a time so a stack of PDFs doesn't flood the reader.
    const queue = [...fresh];
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        try {
          applyResult(next.key, await readQuotationPdf(next.file, rfq));
        } catch (e) {
          patch(next.key, { status: 'failed', error: errorMessage(e, 'AI could not read this PDF'), open: true });
        }
      }
    };
    for (let i = 0; i < Math.min(READ_CONCURRENCY, fresh.length); i++) void worker();
  };

  // Per-row problems that block saving, computed live.
  const problems = useMemo(() => {
    const out: Record<string, string | null> = {};
    const seen = new Map<string, string>();
    for (const r of rows) {
      if (r.status === 'saved') continue;
      const priced = rfq.items.filter((it) => Number(r.prices[it.id]) > 0).length;
      let p: string | null = null;
      if (!r.vendorId && !r.newVendor.name.trim()) p = 'Choose the vendor';
      else if (r.vendorId && quotedSupplierIds.has(r.vendorId)) p = 'This vendor has already quoted';
      else if (priced === 0)
        p = r.unmatched.length ? 'Pick the item for the lines read below' : 'Enter at least one price';
      const vendorKey = r.vendorId || `new:${r.newVendor.name.trim().toLowerCase()}`;
      if (!p && seen.has(vendorKey)) p = `Same vendor as ${seen.get(vendorKey)}`;
      if (!p) seen.set(vendorKey, r.file.name);
      out[r.key] = p;
    }
    return out;
  }, [rows, rfq.items, quotedSupplierIds]);

  const savable = rows.filter((r) => (r.status === 'ready' || r.status === 'failed') && !problems[r.key]);
  const stillReading = rows.some((r) => r.status === 'reading');

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
          // The PDF is a nice-to-have; the prices are what matter — but say so.
          noPdf++;
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
            // A blank price means the vendor did not quote that item.
            items: rfq.items.map((it) => {
              const price = Number(r.prices[it.id]);
              const spec = r.specs[it.id];
              return {
                rfq_item_id: it.id,
                unit_price: price > 0 ? price : null,
                quantity: it.quantity,
                manufacturer: spec?.manufacturer || null,
                quality_grade: spec?.quality_grade || null,
                concentration: spec?.concentration || null,
                other_specs: spec?.other_specs || null,
              };
            }),
          },
          userId: profile.id,
        });
        patch(r.key, { status: 'saved', open: false });
        ok++;
      } catch (e) {
        patch(r.key, { status: 'ready', error: errorMessage(e, 'Could not save'), open: true });
      }
    }
    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ['procurement-vendors-select', rfq.institution_id] });
    if (ok) toast.success(`${ok} quotation${ok === 1 ? '' : 's'} saved`);
    if (noPdf) toast.warning(`${noPdf} PDF${noPdf === 1 ? ' was' : 's were'} not attached (file storage failed) — the prices were saved.`);
    setRows((prev) => {
      const left = prev.filter((r) => r.status !== 'saved');
      if (left.length === 0) onOpenChange(false);
      return left;
    });
  };

  const close = (o: boolean) => {
    if (!o && (saving || stillReading)) return;
    if (!o) setRows([]);
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload quotations</DialogTitle>
          <DialogDescription>
            Select all the vendor quotation PDFs together. The AI reads each one — check the prices, then save.
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
          className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors hover:border-primary"
        >
          <Upload className="h-7 w-7 text-muted-foreground" />
          <span className="font-medium">{rows.length ? 'Add more PDFs' : 'Choose PDFs or drop them here'}</span>
          <span className="text-xs text-muted-foreground">You can select several files at once · max 15 MB each</span>
        </button>
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

        <div className="space-y-2">
          {rows.map((r) => {
            const priced = rfq.items.filter((it) => Number(r.prices[it.id]) > 0);
            const total = priced.reduce((s, it) => s + Number(r.prices[it.id]) * Number(it.quantity), 0);
            const unsure = Object.keys(r.uncertain).length;
            const problem = problems[r.key];
            const busy = r.status === 'reading' || r.status === 'saving';
            return (
              <div key={r.key} className={cn('rounded-lg border', problem && !busy && 'border-amber-300')}>
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <button
                    type="button"
                    aria-label={r.open ? 'Hide prices' : 'Show prices'}
                    onClick={() => patch(r.key, { open: !r.open })}
                    disabled={busy}
                    className="text-muted-foreground"
                  >
                    {r.open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 max-w-[200px] truncate text-sm" title={r.file.name}>
                    {r.file.name}
                  </span>

                  {r.status === 'reading' && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> AI is reading…
                    </span>
                  )}
                  {r.status === 'saving' && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                    </span>
                  )}
                  {(r.status === 'ready' || r.status === 'failed') && (
                    <>
                      <div className="w-[220px]">
                        <Select
                          value={r.vendorId || '__new__'}
                          onValueChange={(val) => patch(r.key, { vendorId: val === '__new__' ? '' : val })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Choose vendor" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__new__">+ New vendor</SelectItem>
                            {allVendors.map((v) => (
                              <SelectItem key={v.id} value={v.id} disabled={quotedSupplierIds.has(v.id)}>
                                {v.name}
                                {quotedSupplierIds.has(v.id) ? ' (already quoted)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {!r.vendorId && (
                        <Input
                          className="h-8 w-[180px]"
                          placeholder="New vendor name"
                          value={r.newVendor.name}
                          onChange={(e) => patch(r.key, (row) => ({ newVendor: { ...row.newVendor, name: e.target.value } }))}
                        />
                      )}
                      <span className="text-sm">
                        {priced.length}/{rfq.items.length} prices · <b>{rupees(total)}</b>
                      </span>
                      {unsure > 0 && (
                        <Badge variant="outline" className="border-amber-400 text-amber-700">
                          {unsure} to check
                        </Badge>
                      )}
                      {r.unmatched.length > 0 && (
                        <Badge variant="outline" className="border-blue-400 text-blue-700">
                          {r.unmatched.length} line{r.unmatched.length === 1 ? '' : 's'} to match
                        </Badge>
                      )}
                    </>
                  )}

                  <span className="ml-auto flex items-center gap-2">
                    {!busy && problem && (
                      <span className="flex items-center gap-1 text-xs text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" /> {problem}
                      </span>
                    )}
                    {!busy && !problem && (
                      <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="Ready to save" />
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${r.file.name}`}
                      disabled={busy}
                      onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                </div>

                {(r.error || r.vendorNote) && r.status !== 'reading' && (
                  <p className={cn('px-10 pb-2 text-xs', r.error ? 'text-red-700' : 'text-muted-foreground')}>
                    {r.error ? `${r.error} — enter the prices below.` : r.vendorNote}
                  </p>
                )}

                {r.open && r.status !== 'reading' && (
                  <div className="space-y-3 border-t px-3 py-2">
                    {r.unmatched.length > 0 && (
                      <div className="rounded-md border border-blue-200 bg-blue-50/60 p-2 dark:border-blue-900 dark:bg-blue-950/30">
                        <p className="mb-1 text-xs font-medium text-blue-900 dark:text-blue-200">
                          The vendor named these differently from your request — pick which item each one is:
                        </p>
                        <div className="space-y-1">
                          {r.unmatched.map((u) => (
                            <div key={u.idx} className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="min-w-0 flex-1 truncate" title={u.name}>
                                {u.name}
                              </span>
                              <span className="font-semibold">{rupees(u.price)}</span>
                              <div className="w-[200px]">
                                <Select
                                  value=""
                                  onValueChange={(itemId) =>
                                    patch(r.key, (row) => ({
                                      prices: { ...row.prices, [itemId]: String(u.price) },
                                      specs: {
                                        ...row.specs,
                                        [itemId]: {
                                          manufacturer: u.manufacturer,
                                          quality_grade: '',
                                          concentration: '',
                                          other_specs: u.other_specs,
                                        },
                                      },
                                      unmatched: row.unmatched.filter((x) => x.idx !== u.idx),
                                    }))
                                  }
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue placeholder="Use for item…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {rfq.items.map((it) => (
                                      <SelectItem key={it.id} value={it.id}>
                                        {it.item_name}
                                        {Number(r.prices[it.id]) > 0 ? ' (replace price)' : ''}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <button
                                type="button"
                                className="text-xs text-muted-foreground hover:text-foreground"
                                onClick={() =>
                                  patch(r.key, (row) => ({ unmatched: row.unmatched.filter((x) => x.idx !== u.idx) }))
                                }
                              >
                                Ignore
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="py-1 font-medium">Item</th>
                          <th className="py-1 font-medium">Qty</th>
                          <th className="w-40 py-1 font-medium">Unit price (blank = not quoted)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rfq.items.map((it) => (
                          <tr key={it.id}>
                            <td className="py-1 pr-2">{it.item_name}</td>
                            <td className="py-1 pr-2 text-muted-foreground">
                              {it.quantity} {it.unit_label || ''}
                            </td>
                            <td className="py-1">
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                className={cn('h-8', r.uncertain[it.id] && 'border-amber-400 bg-amber-50 dark:bg-amber-950/30')}
                                value={r.prices[it.id] ?? ''}
                                disabled={r.status === 'saving'}
                                onChange={(e) =>
                                  patch(r.key, (row) => {
                                    const uncertain = { ...row.uncertain };
                                    delete uncertain[it.id]; // editing the price IS the check
                                    return { prices: { ...row.prices, [it.id]: e.target.value }, uncertain };
                                  })
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:items-center">
          {stillReading && <span className="text-xs text-muted-foreground sm:mr-auto">Waiting for the AI to finish reading…</span>}
          <Button variant="outline" onClick={() => close(false)} disabled={saving || stillReading}>
            Cancel
          </Button>
          <Button onClick={saveAll} disabled={saving || stillReading || savable.length === 0}>
            {saving ? 'Saving…' : `Save ${savable.length || ''} quotation${savable.length === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

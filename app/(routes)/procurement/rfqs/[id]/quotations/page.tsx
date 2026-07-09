'use client';

import { useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useRfq } from '@/hooks/procurement/use-rfqs';
import {
  useQuotationsForRfq,
  useComparison,
  useCreateQuotation,
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

export default function RfqQuotationsPage() {
  const router = useRouter();
  const params = useParams();
  const rfqId = params.id as string;
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || canAccess('procurement', 'quotation_manage');

  const { data: rfq, isLoading: rfqLoading } = useRfq(rfqId);
  const { data: quotations = [] } = useQuotationsForRfq(rfqId);
  const { data: comparison = [], isLoading: compLoading } = useComparison(rfqId);
  const createQuotation = useCreateQuotation();
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
  const [vendorId, setVendorId] = useState('');
  const [quoteNumber, setQuoteNumber] = useState('');
  const [deliveryDays, setDeliveryDays] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);

  // Vendors attached to the RFQ that haven't quoted yet.
  const quotedSupplierIds = new Set(quotations.map((q) => q.supplier_id));
  const availableVendors = useMemo(
    () => (rfq?.vendors ?? []).filter((v) => !quotedSupplierIds.has(v.supplier_id)),
    [rfq?.vendors, quotations] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const resetForm = () => {
    setVendorId('');
    setQuoteNumber('');
    setDeliveryDays('');
    setPaymentTerms('');
    setPrices({});
    setFile(null);
  };

  const handleAdd = async () => {
    if (!rfq || !profile?.id || !profile?.institution_id) return;
    if (!vendorId) {
      toast.error('Select a vendor.');
      return;
    }
    const items: CreateQuotationItemDto[] = rfq.items.map((it) => ({
      rfq_item_id: it.id,
      unit_price: Number(prices[it.id] || 0),
      quantity: it.quantity,
    }));
    if (items.some((i) => !(i.unit_price >= 0) || i.unit_price === 0)) {
      toast.error('Enter a unit price for every item.');
      return;
    }

    try {
      // Optional document upload to Drive.
      let document_url: string | null = null;
      let document_file_id: string | null = null;
      if (file) {
        setUploading(true);
        const fd = new FormData();
        fd.append('file', file);
        fd.append('institutionId', profile.institution_id);
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
          institution_id: profile.institution_id,
          rfq_id: rfq.id,
          supplier_id: vendorId,
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

  // Read prices from the attached vendor PDF via Claude, then fill the fields for review.
  const handleExtractPdf = async () => {
    if (!file || !rfq) return;
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('items', JSON.stringify(rfq.items.map((it) => ({ id: it.id, item_name: it.item_name }))));
      const res = await fetch('/api/procurement/quotations/extract-pdf', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Extraction failed');
      const { prices: parsed, matched, unmatched } = json as {
        prices: Record<string, number>;
        matched: number;
        unmatched: string[];
      };
      if (!matched) {
        toast.error('No prices could be read from the PDF. Enter them manually or use the template.');
        return;
      }
      setPrices((prev) => {
        const next = { ...prev };
        for (const [id, price] of Object.entries(parsed)) next[id] = String(price);
        return next;
      });
      toast.success(
        `AI read ${matched} of ${rfq.items.length} price${matched === 1 ? '' : 's'} — review before saving` +
          (unmatched.length ? ` · ${unmatched.length} line(s) unmatched` : '')
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not read the PDF');
    } finally {
      setExtracting(false);
    }
  };

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
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push(`/procurement/rfqs/${rfqId}`)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Quotations & Comparison</h2>
              <p className="text-muted-foreground">{rfq.rfq_number}</p>
            </div>
          </div>
          {canManage && availableVendors.length > 0 && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Quotation
            </Button>
          )}
        </div>

        {/* No vendors attached -> quotations can't be captured yet. Explain why. */}
        {canManage && (rfq.vendors?.length ?? 0) === 0 && (
          <Card className="border-amber-400/50">
            <CardContent className="pt-6 text-sm">
              No vendors are attached to this RFQ yet. Go to the{' '}
              <button
                className="font-medium text-primary underline"
                onClick={() => router.push(`/procurement/rfqs/${rfqId}`)}
              >
                RFQ page
              </button>{' '}
              and add vendors, then capture each vendor’s quotation here.
            </CardContent>
          </Card>
        )}

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
                  <div key={q.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{q.supplier?.name ?? q.supplier_id}</p>
                      <p className="text-xs text-muted-foreground">
                        {q.vendor_quote_number ? `Ref ${q.vendor_quote_number} · ` : ''}
                        Total ₹{Number(q.total_amount ?? 0).toLocaleString()}
                        {q.delivery_time_days ? ` · ${q.delivery_time_days}d delivery` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {q.document_url && (
                        <a href={q.document_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="sm">
                            <FileText className="h-4 w-4" />
                            <ExternalLink className="h-3 w-3 ml-1" />
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
                      <div className="flex flex-wrap gap-2">
                        {row.quotes.map((qt) => {
                          const isLowest = qt.unit_price === row.lowest_price;
                          return (
                            <div
                              key={qt.quotation_item_id}
                              className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
                                qt.awarded
                                  ? 'border-green-500 bg-green-500/10'
                                  : isLowest
                                  ? 'border-blue-400'
                                  : ''
                              }`}
                            >
                              <span className="font-medium">{qt.supplier_name}</span>
                              <span>₹{Number(qt.unit_price).toLocaleString()}</span>
                              {isLowest && !qt.awarded && (
                                <Badge variant="secondary" className="text-[10px]">
                                  Lowest
                                </Badge>
                              )}
                              {qt.awarded ? (
                                <span className="flex items-center gap-1 text-green-600">
                                  <Award className="h-3.5 w-3.5" /> Awarded
                                  {canManage && (
                                    <button
                                      className="ml-1"
                                      onClick={() =>
                                        run(() => unawardLine.mutateAsync(row.rfq_item_id), 'Award cleared')
                                      }
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </span>
                              ) : (
                                canManage && (
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
                            </div>
                          );
                        })}
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Vendor</Label>
                <Select value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vendor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableVendors.map((v) => (
                      <SelectItem key={v.supplier_id} value={v.supplier_id}>
                        {v.supplier?.name ?? v.supplier_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
              {rfq.items.map((it) => (
                <div key={it.id} className="flex items-center gap-3">
                  <div className="flex-1 text-sm">
                    {it.item_name}
                    <span className="text-muted-foreground">
                      {' '}
                      ({it.quantity} {it.unit_label || ''})
                    </span>
                  </div>
                  <div className="w-32">
                    <Input
                      type="number"
                      min={0}
                      placeholder="Unit price"
                      value={prices[it.id] ?? ''}
                      onChange={(e) => setPrices((p) => ({ ...p, [it.id]: e.target.value }))}
                    />
                  </div>
                </div>
              ))}
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
            <Button onClick={handleAdd} disabled={createQuotation.isPending || uploading}>
              {uploading ? 'Uploading...' : createQuotation.isPending ? 'Saving...' : 'Save quotation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}

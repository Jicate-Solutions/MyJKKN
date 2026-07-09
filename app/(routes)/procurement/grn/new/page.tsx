'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePurchaseOrder } from '@/hooks/procurement/use-purchase-orders';
import { useCreateGrn } from '@/hooks/procurement/use-grns';
import { matchLine } from '@/lib/services/procurement/three-way-match';
import { GRN_MATCH_CONFIG, type GrnLineInput } from '@/types/procurement';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';

// One editable row of the receiving form. Seeded from a PO line; the receiver fills
// in what actually arrived. ordered_remaining = PO ordered − already received.
interface LineDraft extends GrnLineInput {
  item_name: string;
  ordered_remaining: number;
  unit_label: string | null;
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
        invoice_quantity: remaining,
        received_quantity: remaining,
        accepted_quantity: remaining,
        rejected_quantity: 0,
        rejection_reason: null,
        replacement_required: false,
        batch_number: null,
        expiry_date: null,
        manufacturing_date: null,
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

  const submit = async () => {
    const payload = drafts
      .filter((l) => Number(l.received_quantity) > 0)
      .map((l) => ({
        po_item_id: l.po_item_id,
        invoice_quantity: l.invoice_quantity,
        received_quantity: Number(l.received_quantity),
        accepted_quantity: Number(l.accepted_quantity),
        rejected_quantity: Number(l.rejected_quantity),
        rejection_reason: l.rejection_reason,
        replacement_required: l.replacement_required,
        batch_number: l.batch_number,
        expiry_date: l.expiry_date,
        manufacturing_date: l.manufacturing_date,
      }));

    if (payload.length === 0) {
      toast.error('Enter a received quantity for at least one line.');
      return;
    }

    try {
      const grn = await createGrn.mutateAsync({
        input: {
          purchase_order_id: po.id,
          invoice_number: invoiceNumber || null,
          invoice_date: invoiceDate || null,
          invoice_amount: invoiceAmount ? Number(invoiceAmount) : null,
          notes: notes || null,
          lines: payload,
        },
        userId: profile!.id,
      });
      toast.success(`GRN ${grn.grn_number} created — pending verification.`);
      router.push(`/procurement/grn/${grn.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create GRN');
    }
  };

  return (
    <ContentLayout title="Receive Goods">
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/procurement/purchase-orders/${po.id}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Receive against {po.po_number}</h2>
            <p className="text-muted-foreground">{po.supplier?.name ?? po.supplier_id}</p>
          </div>
        </div>

        {/* Invoice header */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Supplier invoice</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Invoice number</Label>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Invoice date</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Invoice amount (₹)</Label>
              <Input
                type="number"
                value={invoiceAmount}
                onChange={(e) => setInvoiceAmount(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Line-by-line receiving */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items received</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {drafts.map((l, idx) => {
              const match = matchLine({
                orderedRemaining: l.ordered_remaining,
                invoiceQty: l.invoice_quantity,
                receivedQty: Number(l.received_quantity),
              });
              const cfg = GRN_MATCH_CONFIG[match.match_status];
              const overSplit =
                Number(l.accepted_quantity) + Number(l.rejected_quantity) >
                Number(l.received_quantity) + 0.001;
              return (
                <div key={l.po_item_id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{l.item_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Outstanding on PO: {l.ordered_remaining} {l.unit_label || ''}
                      </p>
                    </div>
                    <Badge variant="outline">{cfg.label}</Badge>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-4">
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
                  </div>

                  {overSplit && (
                    <p className="text-xs text-destructive">
                      Accepted + rejected exceeds received quantity.
                    </p>
                  )}

                  {/* Batch tracking — required for chemicals at verification */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Batch no. <span className="text-muted-foreground">(chemicals)</span></Label>
                      <Input
                        value={l.batch_number ?? ''}
                        onChange={(e) => update(idx, { batch_number: e.target.value || null })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Expiry date <span className="text-muted-foreground">(chemicals)</span></Label>
                      <Input
                        type="date"
                        value={l.expiry_date ?? ''}
                        onChange={(e) => update(idx, { expiry_date: e.target.value || null })}
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

                  {match.reason && (
                    <p className="text-xs text-muted-foreground">{match.reason}</p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => router.push(`/procurement/purchase-orders/${po.id}`)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={createGrn.isPending}>
            {createGrn.isPending ? 'Creating…' : 'Create GRN'}
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}

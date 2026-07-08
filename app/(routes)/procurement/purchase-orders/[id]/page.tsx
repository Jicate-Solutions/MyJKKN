'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  usePurchaseOrder,
  useSubmitPO,
  useApprovePO,
  useRejectPO,
  useMarkPOSent,
  useCancelPO,
} from '@/hooks/procurement/use-purchase-orders';
import { PO_STATUS_CONFIG } from '@/types/procurement';
import { downloadPurchaseOrderPdf } from '@/lib/procurement/purchase-order-pdf';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, FileDown, Send, Check, X } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';

export default function PurchaseOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canApprove = isSuperAdmin || canAccess('procurement', 'po_approve');
  const canCreate = isSuperAdmin || canAccess('procurement', 'po_create');

  const { data: po, isLoading } = usePurchaseOrder(id);
  const submitPO = useSubmitPO();
  const approvePO = useApprovePO();
  const rejectPO = useRejectPO();
  const markSent = useMarkPOSent();
  const cancelPO = useCancelPO();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  if (isLoading) {
    return (
      <ContentLayout title="Purchase Order">
        <div className="flex items-center justify-center py-16">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }
  if (!po) {
    return (
      <ContentLayout title="Purchase Order">
        <p className="text-muted-foreground py-12 text-center">Purchase order not found.</p>
      </ContentLayout>
    );
  }

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  };

  return (
    <ContentLayout title={po.po_number}>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/procurement/purchase-orders')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{po.po_number}</h2>
              <p className="text-muted-foreground">
                {po.supplier?.name ?? po.supplier_id} · ₹{Number(po.total_amount).toLocaleString()}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-sm">
            {PO_STATUS_CONFIG[po.status].label}
          </Badge>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => downloadPurchaseOrderPdf(po)}>
            <FileDown className="mr-2 h-4 w-4" />
            Download PO (PDF)
          </Button>
          {po.status === 'draft' && canCreate && (
            <Button
              onClick={() => run(() => submitPO.mutateAsync({ id, userId: profile!.id }), 'Submitted for approval')}
            >
              <Send className="mr-2 h-4 w-4" />
              Submit for approval
            </Button>
          )}
          {po.status === 'pending_approval' && canApprove && (
            <>
              <Button
                onClick={() => run(() => approvePO.mutateAsync({ id, userId: profile!.id }), 'PO approved')}
              >
                <Check className="mr-2 h-4 w-4" />
                Approve
              </Button>
              <Button variant="outline" onClick={() => setRejectOpen(true)}>
                <X className="mr-2 h-4 w-4" />
                Reject
              </Button>
            </>
          )}
          {po.status === 'approved' && canCreate && (
            <Button onClick={() => run(() => markSent.mutateAsync({ id, userId: profile!.id }), 'PO marked as sent')}>
              <Send className="mr-2 h-4 w-4" />
              Send to vendor
            </Button>
          )}
          {(po.status === 'draft' || po.status === 'pending_approval') && canCreate && (
            <Button
              variant="ghost"
              onClick={() => run(() => cancelPO.mutateAsync({ id, userId: profile!.id }), 'PO cancelled')}
            >
              Cancel PO
            </Button>
          )}
        </div>

        {po.status === 'rejected' && po.rejection_reason && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6">
              <p className="text-sm">
                <span className="font-medium text-destructive">Rejected: </span>
                {po.rejection_reason}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Line Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {po.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">
                      {it.item_name}
                      {it.item_spec && (
                        <span className="block text-xs text-muted-foreground">{it.item_spec}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {it.ordered_quantity} {it.unit_label || ''}
                    </TableCell>
                    <TableCell className="text-right">{it.received_quantity}</TableCell>
                    <TableCell className="text-right">₹{Number(it.unit_price).toLocaleString()}</TableCell>
                    <TableCell className="text-right">₹{Number(it.line_total).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-end border-t p-4">
              <div className="text-right space-y-1">
                <p className="text-sm text-muted-foreground">
                  Subtotal: ₹{Number(po.subtotal).toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">
                  Tax: ₹{Number(po.tax_amount).toLocaleString()}
                </p>
                <p className="text-base font-semibold">
                  Total: ₹{Number(po.total_amount).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject purchase order</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (required)</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this PO is being rejected..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim()}
              onClick={async () => {
                await run(
                  () => rejectPO.mutateAsync({ id, userId: profile!.id, reason: rejectReason }),
                  'PO rejected'
                );
                setRejectOpen(false);
                setRejectReason('');
              }}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}

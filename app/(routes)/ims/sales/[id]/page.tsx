'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ContentLayout } from '@/components/layout/content-layout';
import { useImsSale, useCancelImsSale } from '@/hooks/ims/use-ims-sales';
import type { ImsSaleItem, ImsSaleStatus } from '@/types/ims';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Printer,
  XCircle,
  User,
  CreditCard,
  Calendar,
  DollarSign,
  Package,
  AlertTriangle,
} from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);

const STATUS_CONFIG: Record<
  ImsSaleStatus,
  { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline'; color: string }
> = {
  completed: { label: 'Completed', variant: 'default', color: 'text-green-600' },
  cancelled: { label: 'Cancelled', variant: 'destructive', color: 'text-red-600' },
  refunded: { label: 'Refunded', variant: 'secondary', color: 'text-yellow-600' },
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  gpay: 'GPay',
  card: 'Card',
  mixed: 'Mixed',
};

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  student: 'Student',
  staff: 'Staff',
  patient: 'Patient',
  walk_in: 'Walk-in',
};

export default function SaleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [itemsReturned, setItemsReturned] = useState(true);

  const { data: sale, isLoading } = useImsSale(id);
  const cancelSale = useCancelImsSale();

  const handleCancelSale = async () => {
    if (!cancelReason.trim()) {
      toast.error('Please provide a cancellation reason');
      return;
    }
    try {
      await cancelSale.mutateAsync({ id, reason: cancelReason, itemsReturned });
      toast.success('Sale cancelled successfully');
      setCancelDialogOpen(false);
      setCancelReason('');
      setItemsReturned(true);
    } catch {
      toast.error('Failed to cancel sale');
    }
  };

  if (isLoading) {
    return (
      <ContentLayout title="Sale Details">
        <div className="flex items-center justify-center py-24">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }

  if (!sale) {
    return (
      <ContentLayout title="Sale Details">
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <p className="text-lg">Sale not found</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push('/ims/sales/history')}
          >
            Back to Sales History
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const statusConfig = STATUS_CONFIG[sale.status];

  return (
    <ContentLayout title={`Sale ${sale.sale_number}`}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/ims/sales/history')}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold tracking-tight">
                  {sale.sale_number}
                </h2>
                <Badge variant={statusConfig.variant}>
                  {statusConfig.label}
                </Badge>
              </div>
              <p className="text-muted-foreground">Sale Details</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => router.push(`/ims/sales/${id}/receipt`)}
            >
              <Printer className="mr-2 h-4 w-4" />
              Receipt
            </Button>
            {sale.status === 'completed' && (
              <Button
                variant="destructive"
                onClick={() => setCancelDialogOpen(true)}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Cancel Sale
              </Button>
            )}
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Customer</CardTitle>
              <User className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-base font-medium">
                {sale.customer_name || 'Walk-in Customer'}
              </p>
              <Badge variant="outline" className="mt-1 text-xs">
                {CUSTOMER_TYPE_LABELS[sale.customer_type] || sale.customer_type}
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Payment</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-base font-medium">
                {PAYMENT_LABELS[sale.payment_method] || sale.payment_method}
              </p>
              {sale.payment_method === 'mixed' && (
                <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {sale.cash_amount > 0 && (
                    <p>Cash: {formatCurrency(sale.cash_amount)}</p>
                  )}
                  {sale.gpay_amount > 0 && (
                    <p>GPay: {formatCurrency(sale.gpay_amount)}</p>
                  )}
                  {sale.card_amount > 0 && (
                    <p>Card: {formatCurrency(sale.card_amount)}</p>
                  )}
                </div>
              )}
              {sale.gpay_transaction_id && (
                <p className="text-xs text-muted-foreground mt-1">
                  Txn: {sale.gpay_transaction_id}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Date</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-base font-medium">
                {format(new Date(sale.created_at), 'dd MMM yyyy')}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(sale.created_at), 'hh:mm a')}
              </p>
              {sale.cashier && (
                <p className="text-xs text-muted-foreground mt-1">
                  By: {sale.cashier.full_name}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${statusConfig.color}`}>
                {formatCurrency(sale.total_amount)}
              </p>
              {sale.profit_amount !== undefined && (
                <p className="text-xs text-muted-foreground mt-1">
                  Profit: {formatCurrency(sale.profit_amount)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Amount Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Amount Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">{formatCurrency(sale.subtotal)}</span>
              </div>
              {sale.discount_amount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount</span>
                  <span className="font-mono">
                    -{formatCurrency(sale.discount_amount)}
                  </span>
                </div>
              )}
              {sale.tax_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-mono">
                    +{formatCurrency(sale.tax_amount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold border-t pt-2">
                <span>Total</span>
                <span className="font-mono">
                  {formatCurrency(sale.total_amount)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Items Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Sale Items
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Discount %</TableHead>
                    <TableHead className="text-right">Discount</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sale.items && sale.items.length > 0 ? (
                    sale.items.map((item: ImsSaleItem, index: number) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-muted-foreground">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          <div>
                            <p>{item.item?.name || '-'}</p>
                            {item.item?.code && (
                              <p className="text-xs text-muted-foreground">
                                {item.item.code}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(item.unit_price)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {item.discount_percent > 0
                            ? `${item.discount_percent}%`
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {item.discount_amount > 0
                            ? formatCurrency(item.discount_amount)
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {formatCurrency(item.total)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-muted-foreground"
                      >
                        No items found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Cancellation Info (if cancelled) */}
        {sale.status === 'cancelled' && sale.cancellation_reason && (
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Cancellation Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <p className="text-sm text-muted-foreground">Reason</p>
                <p className="font-medium">{sale.cancellation_reason}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cancelled On</p>
                <p className="font-medium">
                  {format(new Date(sale.updated_at), 'dd MMM yyyy, hh:mm a')}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cancel Sale Dialog */}
        <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel Sale</DialogTitle>
              <DialogDescription>
                Are you sure you want to cancel sale {sale.sale_number}? Choose
                whether items were returned to store. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="items-returned">Items returned to store?</Label>
                  <p className="text-xs text-muted-foreground">
                    {itemsReturned
                      ? 'Stock will be restored to inventory'
                      : 'Stock will be written off automatically'}
                  </p>
                </div>
                <Switch
                  id="items-returned"
                  checked={itemsReturned}
                  onCheckedChange={setItemsReturned}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cancel-reason">Cancellation Reason *</Label>
                <Textarea
                  id="cancel-reason"
                  placeholder="Enter the reason for cancellation..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCancelDialogOpen(false)}
              >
                Keep Sale
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancelSale}
                disabled={cancelSale.isPending || !cancelReason.trim()}
              >
                {cancelSale.isPending ? (
                  <BeatLoader color="white" size={8} />
                ) : (
                  'Cancel Sale'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ContentLayout>
  );
}

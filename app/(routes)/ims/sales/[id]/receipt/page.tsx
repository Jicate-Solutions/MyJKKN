'use client';

import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ContentLayout } from '@/components/layout/content-layout';
import { useImsSale } from '@/hooks/ims/use-ims-sales';
import { useAuth } from '@/hooks/use-auth';
import type { ImsSaleItem } from '@/types/ims';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Printer } from 'lucide-react';
import { BeatLoader } from 'react-spinners';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);

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

export default function SaleReceiptPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const id = params.id as string;

  const { data: sale, isLoading } = useImsSale(id);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <ContentLayout title="Sales Receipt">
        <div className="flex items-center justify-center py-24">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }

  if (!sale) {
    return (
      <ContentLayout title="Sales Receipt">
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

  return (
    <ContentLayout title="Sales Receipt">
      {/* Action Buttons (hidden on print) */}
      <div className="flex items-center gap-2 mb-6 print:hidden">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/ims/sales/${id}`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Sale
        </Button>
        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          Print Receipt
        </Button>
      </div>

      {/* Receipt Content */}
      <div className="max-w-md mx-auto bg-white dark:bg-background border rounded-lg p-6 print:border-none print:shadow-none print:p-0 print:max-w-full">
        {/* Receipt Header */}
        <div className="text-center border-b pb-4 mb-4">
          <h1 className="text-xl font-bold uppercase tracking-wider">
            {profile?.institutions?.name || 'Institution'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">SALES RECEIPT</p>
          <div className="w-16 h-0.5 bg-foreground/20 mx-auto mt-2" />
        </div>

        {/* Receipt Info */}
        <div className="space-y-1 text-sm mb-4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Receipt No:</span>
            <span className="font-medium">{sale.sale_number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date:</span>
            <span>{format(new Date(sale.created_at), 'dd MMM yyyy, hh:mm a')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Customer:</span>
            <span>{sale.customer_name || 'Walk-in'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Type:</span>
            <span>
              {CUSTOMER_TYPE_LABELS[sale.customer_type] || sale.customer_type}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Payment:</span>
            <span>
              {PAYMENT_LABELS[sale.payment_method] || sale.payment_method}
            </span>
          </div>
          {sale.cashier && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cashier:</span>
              <span>{sale.cashier.full_name}</span>
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="border-t border-dashed my-3" />

        {/* Items */}
        <div className="mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1 font-medium">#</th>
                <th className="text-left py-1 font-medium">Item</th>
                <th className="text-right py-1 font-medium">Qty</th>
                <th className="text-right py-1 font-medium">Price</th>
                <th className="text-right py-1 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items &&
                sale.items.map((item: ImsSaleItem, index: number) => (
                  <tr key={item.id} className="border-b border-dashed">
                    <td className="py-1.5 text-muted-foreground">
                      {index + 1}
                    </td>
                    <td className="py-1.5">
                      <div>
                        <span>{item.item?.name || '-'}</span>
                        {item.discount_percent > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            (-{item.discount_percent}%)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {item.quantity}
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {formatCurrency(item.unit_price)}
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {formatCurrency(item.total)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Separator */}
        <div className="border-t border-dashed my-3" />

        {/* Totals */}
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-mono">{formatCurrency(sale.subtotal)}</span>
          </div>
          {sale.discount_amount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Discount</span>
              <span className="font-mono">
                -{formatCurrency(sale.discount_amount)}
              </span>
            </div>
          )}
          {sale.tax_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-mono">
                +{formatCurrency(sale.tax_amount)}
              </span>
            </div>
          )}
          <div className="border-t pt-2 mt-2">
            <div className="flex justify-between text-base font-bold">
              <span>Grand Total</span>
              <span className="font-mono">
                {formatCurrency(sale.total_amount)}
              </span>
            </div>
          </div>
        </div>

        {/* Mixed Payment Breakdown */}
        {sale.payment_method === 'mixed' && (
          <>
            <div className="border-t border-dashed my-3" />
            <div className="space-y-1 text-sm">
              <p className="font-medium text-xs text-muted-foreground uppercase">
                Payment Split
              </p>
              {sale.cash_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cash</span>
                  <span className="font-mono">
                    {formatCurrency(sale.cash_amount)}
                  </span>
                </div>
              )}
              {sale.gpay_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GPay</span>
                  <span className="font-mono">
                    {formatCurrency(sale.gpay_amount)}
                  </span>
                </div>
              )}
              {sale.card_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Card</span>
                  <span className="font-mono">
                    {formatCurrency(sale.card_amount)}
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Separator */}
        <div className="border-t border-dashed my-4" />

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground space-y-1">
          <p className="font-medium">Thank you for your purchase!</p>
          <p className="text-xs">
            This is a computer-generated receipt.
          </p>
        </div>

        {/* Cancelled Notice */}
        {sale.status === 'cancelled' && (
          <div className="mt-4 p-3 border-2 border-dashed border-destructive/50 rounded text-center">
            <p className="text-destructive font-bold text-lg uppercase">
              CANCELLED
            </p>
            {sale.cancellation_reason && (
              <p className="text-sm text-muted-foreground mt-1">
                Reason: {sale.cancellation_reason}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .max-w-md,
          .max-w-md * {
            visibility: visible;
          }
          .max-w-md {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: 100% !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </ContentLayout>
  );
}

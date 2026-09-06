'use client';

// components/ims/gateway-payment-card.tsx
//
// "Who paid this, and how do I find it on the bank statement?"
//
// Everything shown here was already being captured on every gateway sale — it just
// lived inside a JSONB column that nothing read. The one field worth understanding
// is BANK REF (the acquirer RRN): that is the reference that appears on the bank
// statement, so it is what a reconciliation actually turns on. The Razorpay payment
// id is only useful inside the Razorpay dashboard.
//
// Renders nothing for a cash or manual-UPI sale, so the page can mount it
// unconditionally.

import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ImsSalesService } from '@/lib/services/ims/sales-service';
import { describePayer } from '@/lib/services/payments/razorpay/payer-details';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);

function Field({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  copyable?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className={`text-sm text-right break-all ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
        {copyable && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 ml-1.5 align-middle"
            onClick={() => {
              void navigator.clipboard.writeText(value);
              toast.success(`${label} copied`);
            }}
          >
            <Copy className="h-3 w-3" />
          </Button>
        )}
      </span>
    </div>
  );
}

export function GatewayPaymentCard({
  saleId,
  storeName,
}: {
  saleId: string;
  storeName?: string | null;
}) {
  const { data: payment } = useQuery({
    queryKey: ['ims-gateway-payment-for-sale', saleId],
    queryFn: () => ImsSalesService.getGatewayPaymentForSale(saleId),
    enabled: !!saleId,
    staleTime: 5 * 60 * 1000,
  });

  if (!payment) return null;

  const captured =
    payment.captured_amount_paise == null ? null : payment.captured_amount_paise / 100;

  // The key id is publishable, but only its tail is worth showing — enough to tell
  // two merchant accounts apart without turning the panel into a credential dump.
  const keyTail = payment.razorpay_key_id ? payment.razorpay_key_id.slice(-6) : null;
  const isTestKey = payment.razorpay_key_id?.startsWith('rzp_test_');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-green-600" />
          Payment (gateway verified)
          {isTestKey && (
            <Badge variant="outline" className="ml-2 text-amber-600 border-amber-500/50">
              TEST MODE
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          <Field label="Status" value={payment.status === 'paid' ? 'Paid' : payment.status} />
          <Field label="Amount" value={formatCurrency(Number(payment.amount))} />
          {/* Shown only when it differs — an equal figure is noise, a different one
              is the reason somebody opened this page. */}
          {captured != null && captured !== Number(payment.amount) && (
            <Field label="Amount received" value={formatCurrency(captured)} />
          )}

          <Field label="Paid from" value={describePayer(payment)} mono={!!payment.payer_vpa} />
          <Field label="Payer phone" value={payment.payer_contact} />
          <Field
            label="Paid to"
            value={
              keyTail
                ? `${storeName ? `${storeName} · ` : ''}Razorpay ···${keyTail}`
                : storeName ?? null
            }
          />

          <Field label="Bank ref (RRN)" value={payment.bank_rrn} mono copyable />
          <Field label="UPI transaction id" value={payment.upi_transaction_id} mono />
          <Field label="Razorpay payment" value={payment.razorpay_payment_id} mono copyable />
          <Field label="Our reference" value={payment.transaction_ref} mono />

          {payment.gateway_fee_paise != null && payment.gateway_fee_paise > 0 && (
            <Field label="Gateway fee" value={formatCurrency(payment.gateway_fee_paise / 100)} />
          )}
          {payment.late_credit && (
            <Field label="Note" value="Credited after the payment window closed — accepted" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

'use client';

import { useState, useMemo } from 'react';
import {
  Banknote,
  CreditCard,
  Smartphone,
  QrCode,
  Layers,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

import { CustomerSearch } from './customer-search';
import { UpiQrPayment } from './upi-qr-payment';
import { GatewayPaymentLauncher } from './gateway-payment';
import { formatCurrencyINR } from '@/lib/utils/ims-receipt';
import type { ImsPaymentMethod, ImsCustomerType, ImsSale } from '@/types/ims';
import type { ImsCartItem } from '@/lib/stores/ims-cart-store';

// ── Quick cash buttons ──
const QUICK_CASH = [50, 100, 200, 500, 1000, 2000];

interface PaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ImsCartItem[];
  total: number;
  storeId: string;
  institutionId: string;
  customerType: ImsCustomerType;
  customerName: string;
  customerPhone: string;
  onCustomerChange: (type: ImsCustomerType, name: string, phone: string) => void;
  onSaleComplete: (sale: ImsSale) => void;
  onValidateStock: () => Promise<string[]>;
  onCreateSale: (dto: {
    payment_method: ImsPaymentMethod;
    cash_amount?: number;
    gpay_amount?: number;
    card_amount?: number;
    gpay_transaction_id?: string;
    upi_qr_amount?: number;
    upi_qr_transaction_ref?: string;
  }) => Promise<ImsSale>;
}

type PaymentTab = 'cash' | 'card' | 'gpay' | 'upi_qr' | 'upi_verified' | 'mixed';

export function PaymentModal({
  open,
  onOpenChange,
  items,
  total,
  storeId,
  institutionId,
  customerType,
  customerName,
  customerPhone,
  onCustomerChange,
  onSaleComplete,
  onValidateStock,
  onCreateSale,
}: PaymentModalProps) {
  const [activeTab, setActiveTab] = useState<PaymentTab>('cash');
  const [isProcessing, setIsProcessing] = useState(false);
  const [stockErrors, setStockErrors] = useState<string[]>([]);
  // Set when a checkout attempt fails for a reason that is NOT "fix it and retry"
  // (i.e. anything other than insufficient stock). The pay buttons stay disabled
  // until the cashier explicitly acknowledges, so a second press cannot raise a
  // duplicate bill for the same basket. The RPC is atomic, so a retry can no
  // longer double-deduct stock — but it can still issue two invoice numbers for
  // one customer, which is its own problem at audit time.
  const [failedAttempt, setFailedAttempt] = useState<string | null>(null);

  // Cash state
  const [cashAmount, setCashAmount] = useState('');

  // Card state
  const [cardRef, setCardRef] = useState('');

  // GPay state
  const [gpayRef, setGpayRef] = useState('');
  const [gpayTxnId, setGpayTxnId] = useState('');

  // UPI QR state
  const [showQr, setShowQr] = useState(false);

  // Mixed state
  const [mixCash, setMixCash] = useState('');
  const [mixCard, setMixCard] = useState('');
  const [mixGpay, setMixGpay] = useState('');

  // ── Derived values ──
  const cashNum = parseFloat(cashAmount) || 0;
  const changeAmount = Math.max(0, cashNum - total);

  const mixCashNum = parseFloat(mixCash) || 0;
  const mixCardNum = parseFloat(mixCard) || 0;
  const mixGpayNum = parseFloat(mixGpay) || 0;
  const mixTotal = mixCashNum + mixCardNum + mixGpayNum;
  const mixRemaining = total - mixTotal;

  // ── Tab icon/label map ──
  //
  // The self-hosted 'upi_qr' tab is HIDDEN, not deleted — leaving this list is all
  // it takes to bring it back. It asked the cashier to confirm a UTR and believed
  // the answer; the gateway tab below takes the same payment and has Razorpay
  // confirm the credit instead. Two QR tabs side by side only ever invited the
  // cashier to pick the one with no proof behind it.
  //
  // With it gone, "UPI (verified)" no longer needs the qualifier — there is nothing
  // left to distinguish it FROM, and "verified" described our plumbing rather than
  // anything the customer does. Razorpay's hosted page opens straight onto a UPI QR
  // (see the launcher's prefill), so from the counter this simply IS "UPI QR" —
  // the name the staff already use.
  const tabs: { value: PaymentTab; label: string; icon: React.ReactNode }[] = [
    { value: 'cash', label: 'Cash', icon: <Banknote className="h-4 w-4" /> },
    { value: 'card', label: 'Card', icon: <CreditCard className="h-4 w-4" /> },
    { value: 'gpay', label: 'GPay', icon: <Smartphone className="h-4 w-4" /> },
    { value: 'upi_verified', label: 'UPI QR', icon: <QrCode className="h-4 w-4" /> },
    { value: 'mixed', label: 'Mixed', icon: <Layers className="h-4 w-4" /> },
  ];

  // ── Reset form ──
  const resetForm = () => {
    setCashAmount('');
    setCardRef('');
    setGpayRef('');
    setGpayTxnId('');
    setShowQr(false);
    setMixCash('');
    setMixCard('');
    setMixGpay('');
    setStockErrors([]);
    setIsProcessing(false);
    setFailedAttempt(null);
  };

  // ── Complete payment handler ──
  const completePayment = async (
    paymentMethod: ImsPaymentMethod,
    params: {
      cash_amount?: number;
      gpay_amount?: number;
      card_amount?: number;
      gpay_transaction_id?: string;
      upi_qr_amount?: number;
      upi_qr_transaction_ref?: string;
    }
  ) => {
    setIsProcessing(true);
    setStockErrors([]);
    setFailedAttempt(null);

    try {
      // Step 1: Advisory stock check, purely so the cashier learns about a
      // shortfall before the customer has paid. It is NOT the safety net — the
      // ims_pos_checkout RPC re-checks every line with a guarded, row-locking
      // decrement, which is what actually prevents overselling.
      const issues = await onValidateStock();
      if (issues.length > 0) {
        setStockErrors(issues);
        setIsProcessing(false);
        return;
      }

      // Step 2: Create sale — one atomic RPC. Either the whole bill lands or
      // nothing does.
      const sale = await onCreateSale({
        payment_method: paymentMethod,
        ...params,
      });

      toast.success(`Sale ${sale.sale_number} completed`);
      resetForm();
      onSaleComplete(sale);
    } catch (err: any) {
      const message = err?.message || 'Failed to complete sale';
      toast.error(message);
      setIsProcessing(false);

      // Insufficient stock is a "change the basket and try again" error, so leave
      // the buttons live. Anything else (permission, network, unmatched tender)
      // gets latched: nothing was written, but the cashier should read the reason
      // before firing a second attempt.
      if (/insufficient stock|not stocked/i.test(message)) {
        setStockErrors([message]);
      } else {
        setFailedAttempt(message);
      }
    }
  };

  // ── Tab-specific submit handlers ──
  const handleCashPay = () => {
    if (cashNum < total) {
      toast.error('Cash amount is less than the total');
      return;
    }
    completePayment('cash', { cash_amount: cashNum });
  };

  const handleCardPay = () => {
    completePayment('card', { card_amount: total });
  };

  const handleGpayPay = () => {
    completePayment('gpay', {
      gpay_amount: total,
      gpay_transaction_id: gpayTxnId || undefined,
    });
  };

  // `upiTransactionId` is the bank UTR the cashier confirmed. It is deliberately
  // not forwarded: ims_sales has no column for it, and it is already persisted on
  // ims_upi_qr_payments.upi_transaction_id, linked back to this sale by
  // transaction_ref. The consequence to be aware of is that the UPI audit report
  // (reports-service.ts getUpiAuditReport) reads ims_sales, so it shows our
  // internal ref rather than the bank's — reconciling against a bank statement
  // needs the join to ims_upi_qr_payments. Left as-is today rather than adding a
  // column mid-go-live.
  const handleUpiQrSuccess = (transactionRef: string, upiTransactionId: string) => {
    completePayment('upi_qr', {
      upi_qr_amount: total,
      upi_qr_transaction_ref: transactionRef,
    });
  };

  const handleMixedPay = () => {
    if (Math.abs(mixRemaining) > 0.01) {
      toast.error('Payment amounts must equal the total');
      return;
    }

    if (mixCashNum < 0 || mixCardNum < 0 || mixGpayNum < 0) {
      toast.error('Payment amounts cannot be negative');
      return;
    }

    // The UPI box is gone from this tab rather than erroring on use.
    //
    // It never worked: typing an amount here created an ims_sales row with
    // upi_qr_amount > 0 and NO ims_upi_qr_payments row — no QR, no UTR — and the
    // UPI audit report filters on .gt('upi_qr_amount', 0), so those phantom
    // receipts surfaced as UPI takings no bank statement would ever match. The
    // guard that replaced it told the cashier to "use the UPI QR tab", which is
    // now hidden, and the gateway that replaced THAT settles the full total in one
    // go and cannot take a partial leg. So a UPI split is genuinely unsupported,
    // and a box that always refuses is a worse way to say so than no box.

    // Determine payment method
    const methods: ImsPaymentMethod[] = [];
    if (mixCashNum > 0) methods.push('cash');
    if (mixCardNum > 0) methods.push('card');
    if (mixGpayNum > 0) methods.push('gpay');

    if (methods.length === 0) {
      toast.error('Enter at least one payment amount');
      return;
    }

    const paymentMethod: ImsPaymentMethod = methods.length === 1 ? methods[0] : 'mixed';

    completePayment(paymentMethod, {
      cash_amount: mixCashNum || undefined,
      card_amount: mixCardNum || undefined,
      gpay_amount: mixGpayNum || undefined,
      // Carried through so a split cash+GPay payment keeps its GPay reference —
      // previously this handler dropped it, unlike handleGpayPay.
      gpay_transaction_id: mixGpayNum > 0 ? gpayTxnId || undefined : undefined,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!isProcessing) {
          if (!v) resetForm();
          onOpenChange(v);
        }
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Checkout</span>
            <span className="text-xl font-bold">{formatCurrencyINR(total)}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Item count */}
        <p className="text-sm text-muted-foreground">
          {items.length} item{items.length !== 1 ? 's' : ''} in cart
        </p>

        {/* Customer Info */}
        <CustomerSearch
          customerType={customerType}
          customerName={customerName}
          customerPhone={customerPhone}
          onTypeChange={(t) => onCustomerChange(t, customerName, customerPhone)}
          onNameChange={(n) => onCustomerChange(customerType, n, customerPhone)}
          onPhoneChange={(p) => onCustomerChange(customerType, customerName, p)}
        />

        <Separator />

        {/* Stock errors */}
        {stockErrors.length > 0 && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive mb-1">
              <AlertCircle className="h-4 w-4" />
              Insufficient stock
            </div>
            <ul className="text-xs text-destructive space-y-0.5">
              {stockErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Latched failure — nothing was billed, but require an explicit
            acknowledgement so a reflex second press cannot issue a duplicate
            invoice number for the same basket. */}
        {failedAttempt && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertCircle className="h-4 w-4" />
              Payment not recorded
            </div>
            <p className="text-xs text-destructive">{failedAttempt}</p>
            <p className="text-xs text-muted-foreground">
              Nothing was billed and no stock was deducted. The cart is intact.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setFailedAttempt(null)}
              >
                Try again
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </div>
        )}

        {/* Payment Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as PaymentTab);
            setShowQr(false);
          }}
        >
          {/* Driven off tabs.length rather than a hardcoded grid-cols-N, which
              silently left an empty sixth column the moment a tab was hidden. */}
          <TabsList
            className="w-full grid"
            style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
          >
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-1 text-xs">
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── Cash ── */}
          <TabsContent value="cash" className="space-y-4">
            <div>
              <Label>Cash Received</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="Enter amount"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                className="mt-1 text-lg"
                autoFocus
              />
            </div>

            {/* Quick buttons */}
            <div className="grid grid-cols-3 gap-2">
              {QUICK_CASH.map((amt) => (
                <Button
                  key={amt}
                  variant="outline"
                  size="sm"
                  onClick={() => setCashAmount(String(amt))}
                >
                  {formatCurrencyINR(amt)}
                </Button>
              ))}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCashAmount(String(total))}
              >
                Exact
              </Button>
            </div>

            {cashNum > 0 && (
              <div className="flex justify-between text-sm p-2 rounded bg-muted">
                <span>Change</span>
                <span className="font-medium">{formatCurrencyINR(changeAmount)}</span>
              </div>
            )}

            <Button
              className="w-full"
              disabled={isProcessing || !!failedAttempt || cashNum < total}
              onClick={handleCashPay}
            >
              {isProcessing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Pay {formatCurrencyINR(total)} (Cash)
            </Button>
          </TabsContent>

          {/* ── Card ── */}
          <TabsContent value="card" className="space-y-4">
            <div>
              <Label>Card Reference (optional)</Label>
              <Input
                placeholder="Last 4 digits or ref"
                value={cardRef}
                onChange={(e) => setCardRef(e.target.value)}
                className="mt-1"
              />
            </div>

            <Button
              className="w-full"
              disabled={isProcessing || !!failedAttempt}
              onClick={handleCardPay}
            >
              {isProcessing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Pay {formatCurrencyINR(total)} (Card)
            </Button>
          </TabsContent>

          {/* ── GPay ── */}
          <TabsContent value="gpay" className="space-y-4">
            <div>
              <Label>GPay Reference (optional)</Label>
              <Input
                placeholder="Transaction reference"
                value={gpayRef}
                onChange={(e) => setGpayRef(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Transaction ID (optional)</Label>
              <Input
                placeholder="GPay transaction ID"
                value={gpayTxnId}
                onChange={(e) => setGpayTxnId(e.target.value)}
                className="mt-1"
              />
            </div>

            <Button
              className="w-full"
              disabled={isProcessing || !!failedAttempt}
              onClick={handleGpayPay}
            >
              {isProcessing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Pay {formatCurrencyINR(total)} (GPay)
            </Button>
          </TabsContent>

          {/* ── UPI QR, self-hosted — HIDDEN, NOT DELETED ──
              No trigger renders for this tab (see the `tabs` array), so it is
              currently unreachable. Kept whole because it is a working payment
              path with its own table (ims_upi_qr_payments), its own API routes and
              settled money already recorded against it; restoring it is one line
              in `tabs`. Delete it only once that history no longer matters. */}
          <TabsContent value="upi_qr" className="space-y-4">
            {!showQr ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <QrCode className="h-12 w-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground text-center">
                  Generate a UPI QR code for {formatCurrencyINR(total)}.
                  The customer scans and pays via any UPI app.
                </p>
                <Button onClick={() => setShowQr(true)}>
                  Generate QR Code
                </Button>
              </div>
            ) : (
              <UpiQrPayment
                storeId={storeId}
                amount={total}
                customerName={customerName || undefined}
                onSuccess={handleUpiQrSuccess}
                onCancel={() => setShowQr(false)}
              />
            )}
          </TabsContent>

          {/* ── UPI (verified) ──
              Razorpay takes the payment and confirms the credit itself, so nobody
              has to type a reference number and be believed. Note this tab does NOT
              call onCreateSale: the server books the sale from the cart IT priced
              when the order opened. Routing it back through the browser would
              reopen the very gap this closes.

              The browser leaves for Razorpay's page here and returns to
              /ims/sales?gp=<id>, where the POS picks the payment back up — so this
              tab ends at "handed over", not at "paid". */}
          <TabsContent value="upi_verified" className="space-y-4">
            <GatewayPaymentLauncher
              storeId={storeId}
              items={items}
              customerType={customerType}
              customerName={customerName}
              customerPhone={customerPhone}
              amount={total}
              onCancel={() => onOpenChange(false)}
            />
          </TabsContent>

          {/* ── Mixed ── */}
          <TabsContent value="mixed" className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Split payment across multiple methods. Total must equal {formatCurrencyINR(total)}.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Cash</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={mixCash}
                  onChange={(e) => setMixCash(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Card</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={mixCard}
                  onChange={(e) => setMixCard(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">GPay</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={mixGpay}
                  onChange={(e) => setMixGpay(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              UPI cannot be part of a split — the payment page settles the whole
              amount at once. Take a UPI payment on the UPI QR tab instead.
            </p>

            {/* Balance indicator */}
            <div className={`flex justify-between text-sm p-2 rounded ${
              Math.abs(mixRemaining) < 0.01
                ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
            }`}>
              <span>Remaining</span>
              <span className="font-medium">{formatCurrencyINR(Math.max(0, mixRemaining))}</span>
            </div>

            <Button
              className="w-full"
              disabled={isProcessing || !!failedAttempt || Math.abs(mixRemaining) > 0.01}
              onClick={handleMixedPay}
            >
              {isProcessing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Complete Mixed Payment
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

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

type PaymentTab = 'cash' | 'card' | 'gpay' | 'upi_qr' | 'mixed';

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
  const [mixUpiQr, setMixUpiQr] = useState('');

  // ── Derived values ──
  const cashNum = parseFloat(cashAmount) || 0;
  const changeAmount = Math.max(0, cashNum - total);

  const mixCashNum = parseFloat(mixCash) || 0;
  const mixCardNum = parseFloat(mixCard) || 0;
  const mixGpayNum = parseFloat(mixGpay) || 0;
  const mixUpiQrNum = parseFloat(mixUpiQr) || 0;
  const mixTotal = mixCashNum + mixCardNum + mixGpayNum + mixUpiQrNum;
  const mixRemaining = total - mixTotal;

  // ── Tab icon/label map ──
  const tabs: { value: PaymentTab; label: string; icon: React.ReactNode }[] = [
    { value: 'cash', label: 'Cash', icon: <Banknote className="h-4 w-4" /> },
    { value: 'card', label: 'Card', icon: <CreditCard className="h-4 w-4" /> },
    { value: 'gpay', label: 'GPay', icon: <Smartphone className="h-4 w-4" /> },
    { value: 'upi_qr', label: 'UPI QR', icon: <QrCode className="h-4 w-4" /> },
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
    setMixUpiQr('');
    setStockErrors([]);
    setIsProcessing(false);
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

    try {
      // Step 1: Optimistic stock check
      const issues = await onValidateStock();
      if (issues.length > 0) {
        setStockErrors(issues);
        setIsProcessing(false);
        return;
      }

      // Step 2: Create sale
      const sale = await onCreateSale({
        payment_method: paymentMethod,
        ...params,
      });

      toast.success(`Sale ${sale.sale_number} completed`);
      resetForm();
      onSaleComplete(sale);
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete sale');
      setIsProcessing(false);
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

    if (mixCashNum < 0 || mixCardNum < 0 || mixGpayNum < 0 || mixUpiQrNum < 0) {
      toast.error('Payment amounts cannot be negative');
      return;
    }

    // Determine payment method
    const methods: ImsPaymentMethod[] = [];
    if (mixCashNum > 0) methods.push('cash');
    if (mixCardNum > 0) methods.push('card');
    if (mixGpayNum > 0) methods.push('gpay');
    if (mixUpiQrNum > 0) methods.push('upi_qr');

    const paymentMethod: ImsPaymentMethod = methods.length === 1 ? methods[0] : 'mixed';

    completePayment(paymentMethod, {
      cash_amount: mixCashNum || undefined,
      card_amount: mixCardNum || undefined,
      gpay_amount: mixGpayNum || undefined,
      upi_qr_amount: mixUpiQrNum || undefined,
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

        {/* Payment Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as PaymentTab);
            setShowQr(false);
          }}
        >
          <TabsList className="w-full grid grid-cols-5">
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
              disabled={isProcessing || cashNum < total}
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
              disabled={isProcessing}
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
              disabled={isProcessing}
              onClick={handleGpayPay}
            >
              {isProcessing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Pay {formatCurrencyINR(total)} (GPay)
            </Button>
          </TabsContent>

          {/* ── UPI QR ── */}
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
              <div>
                <Label className="text-xs">UPI QR</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={mixUpiQr}
                  onChange={(e) => setMixUpiQr(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

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
              disabled={isProcessing || Math.abs(mixRemaining) > 0.01}
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

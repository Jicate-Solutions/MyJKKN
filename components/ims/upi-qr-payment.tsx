'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface UpiQrPaymentProps {
  storeId: string;
  amount: number;
  customerName?: string;
  onSuccess: (transactionRef: string, upiTransactionId: string) => void;
  onCancel: () => void;
}

interface QrData {
  qrBase64: string;
  transactionRef: string;
  upiString: string;
  expiresAt: string;
}

type QrStatus = 'idle' | 'generating' | 'pending' | 'confirming' | 'paid' | 'expired' | 'error';

export function UpiQrPayment({
  storeId,
  amount,
  customerName,
  onSuccess,
  onCancel,
}: UpiQrPaymentProps) {
  const [status, setStatus] = useState<QrStatus>('idle');
  const [qrData, setQrData] = useState<QrData | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [utrInput, setUtrInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Generate QR code
  const generateQr = useCallback(async () => {
    setStatus('generating');
    setErrorMsg('');

    try {
      const res = await fetch('/api/ims/payment/upi-qr/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, amount, customerName }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to generate QR');
      }

      const data: QrData = await res.json();
      setQrData(data);
      setStatus('pending');

      // Start countdown
      const expiresMs = new Date(data.expiresAt).getTime();
      const updateTimer = () => {
        const remaining = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining <= 0) {
          clearTimer();
          setStatus('expired');
        }
      };

      updateTimer();
      timerRef.current = setInterval(updateTimer, 1000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error generating QR');
      setStatus('error');
    }
  }, [storeId, amount, customerName, clearTimer]);

  // Auto-generate on mount
  useEffect(() => {
    generateQr();
    return () => clearTimer();
  }, [generateQr, clearTimer]);

  // Confirm payment
  const confirmPayment = async () => {
    if (!qrData) return;

    const utr = utrInput.trim();
    if (!utr) {
      toast.error('Please enter the UPI Transaction ID (UTR)');
      return;
    }

    setStatus('confirming');
    setErrorMsg('');

    try {
      const res = await fetch('/api/ims/payment/upi-qr/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionRef: qrData.transactionRef,
          upiTransactionId: utr,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to confirm payment');
      }

      clearTimer();
      setStatus('paid');
      toast.success('UPI payment confirmed');
      onSuccess(qrData.transactionRef, utr);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error confirming payment');
      setStatus('pending'); // Allow retry
    }
  };

  // Format timer
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // Format amount
  const formattedAmount = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amount);

  // ── Generating state ──
  if (status === 'generating') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Generating UPI QR code...</p>
      </div>
    );
  }

  // ── Error state ──
  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive">{errorMsg}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={generateQr}>Try Again</Button>
        </div>
      </div>
    );
  }

  // ── Expired state ──
  if (status === 'expired') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <Clock className="h-8 w-8 text-amber-500" />
        <p className="text-sm font-medium">QR code expired</p>
        <p className="text-xs text-muted-foreground">The 15-minute window has passed.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={generateQr} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Generate New QR
          </Button>
        </div>
      </div>
    );
  }

  // ── Paid / Confirming state ──
  if (status === 'paid') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <CheckCircle2 className="h-8 w-8 text-green-600" />
        <p className="text-sm font-medium text-green-600">Payment confirmed!</p>
      </div>
    );
  }

  // ── Pending state (QR displayed) ──
  return (
    <div className="flex flex-col items-center gap-4">
      {/* Amount */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground">Amount to pay</p>
        <p className="text-2xl font-bold">{formattedAmount}</p>
      </div>

      {/* QR Code */}
      {qrData && (
        <div className="rounded-lg border bg-white p-3">
          <img
            src={qrData.qrBase64}
            alt="UPI QR Code"
            className="h-48 w-48"
          />
        </div>
      )}

      {/* Timer */}
      <div className="flex items-center gap-2 text-sm">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className={timeLeft < 60 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
          Expires in {formatTime(timeLeft)}
        </span>
      </div>

      {/* Transaction reference */}
      <p className="text-xs text-muted-foreground font-mono">
        Ref: {qrData?.transactionRef}
      </p>

      {/* UTR input */}
      <div className="w-full max-w-xs space-y-2">
        <Label className="text-xs">UPI Transaction ID (UTR)</Label>
        <Input
          placeholder="Enter UTR after payment"
          value={utrInput}
          onChange={(e) => setUtrInput(e.target.value)}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 w-full max-w-xs">
        <Button variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          onClick={confirmPayment}
          disabled={status === 'confirming' || !utrInput.trim()}
        >
          {status === 'confirming' ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-2" />
          )}
          Payment Received
        </Button>
      </div>
    </div>
  );
}

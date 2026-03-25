# HDFC SmartGateway Integration - Code Examples

## 1. Database Migration

```sql
-- File: supabase/migrations/015_payment_gateway_integration.sql

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create payment transactions table
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_ref VARCHAR(100) UNIQUE NOT NULL,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  student_id UUID NOT NULL,
  institution_id UUID NOT NULL,
  bill_ids UUID[] NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  status VARCHAR(50) NOT NULL DEFAULT 'initiated' CHECK (status IN (
    'initiated', 'processing', 'success', 'failed', 'cancelled', 'expired', 'refunded'
  )),
  gateway_response JSONB,
  payment_method VARCHAR(50),
  gateway_transaction_id VARCHAR(255),
  payment_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT fk_payment_transactions_student
    FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_transactions_institution
    FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE
);

-- Create payment transaction items table
CREATE TABLE IF NOT EXISTS public.payment_transaction_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL,
  bill_id UUID NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT fk_payment_transaction_items_transaction
    FOREIGN KEY (transaction_id) REFERENCES public.payment_transactions(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_transaction_items_bill
    FOREIGN KEY (bill_id) REFERENCES public.billing_student_bills(id) ON DELETE CASCADE,

  UNIQUE(transaction_id, bill_id)
);

-- Create indexes
CREATE INDEX idx_payment_transactions_student_id ON public.payment_transactions(student_id);
CREATE INDEX idx_payment_transactions_status ON public.payment_transactions(status);
CREATE INDEX idx_payment_transactions_created_at ON public.payment_transactions(created_at);
CREATE INDEX idx_payment_transactions_session_id ON public.payment_transactions(session_id);
CREATE INDEX idx_payment_transaction_items_transaction_id ON public.payment_transaction_items(transaction_id);
CREATE INDEX idx_payment_transaction_items_bill_id ON public.payment_transaction_items(bill_id);

-- Enable RLS
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transaction_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view payment transactions"
  ON public.payment_transactions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create payment transactions"
  ON public.payment_transactions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update payment transactions"
  ON public.payment_transactions FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT ALL ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transaction_items TO authenticated;

-- Create trigger for updated_at
CREATE TRIGGER trigger_payment_transactions_updated_at
  BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_billing_updated_at();
```

## 2. TypeScript Types

```typescript
// File: types/payment-gateway.ts

export interface PaymentTransaction {
  id: string;
  transaction_ref: string;
  session_id: string;
  student_id: string;
  institution_id: string;
  bill_ids: string[];
  total_amount: number;
  currency: string;
  status: PaymentStatus;
  gateway_response?: any;
  payment_method?: string;
  gateway_transaction_id?: string;
  payment_date?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export type PaymentStatus =
  | 'initiated'
  | 'processing'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'refunded';

export interface CreatePaymentSessionDto {
  student_id: string;
  bill_ids: string[];
  return_url?: string;
  cancel_url?: string;
}

export interface PaymentSessionResponse {
  transaction_id: string;
  session_id: string;
  payment_url: string;
  amount: number;
  expires_at: string;
}

export interface HDFCSessionRequest {
  order: {
    amount: number;
    currency: string;
    id: string;
  };
  payment_page_client_id: string;
  customer: {
    email: string;
    phone: string;
  };
  success_url: string;
  failure_url: string;
}

export interface HDFCWebhookPayload {
  event_type: string;
  event_id: string;
  event_time: string;
  data: {
    order: {
      order_id: string;
      amount: number;
      currency: string;
      status: string;
    };
    payment: {
      payment_id: string;
      payment_method: string;
      payment_status: string;
    };
  };
}
```

## 3. Payment Gateway Service

```typescript
// File: lib/services/billing/payment-gateway-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { BillingReceiptService } from './receipts/billing-receipt-service';
import crypto from 'crypto';

export class PaymentGatewayService {
  private static supabase = createClientSupabaseClient();

  private static readonly HDFC_CONFIG = {
    baseUrl: process.env.HDFC_BASE_URL || 'https://api.smartgateway.hdfcbank.com',
    merchantId: process.env.HDFC_MERCHANT_ID!,
    apiKey: process.env.HDFC_API_KEY!,
    apiSecret: process.env.HDFC_API_SECRET!,
    webhookSecret: process.env.HDFC_WEBHOOK_SECRET!,
    testMode: process.env.HDFC_TEST_MODE === 'true'
  };

  /**
   * Create a payment session with HDFC SmartGateway
   */
  static async createPaymentSession(
    data: CreatePaymentSessionDto
  ): Promise<PaymentSessionResponse> {
    try {
      // Validate student and bills
      const { data: bills, error: billsError } = await this.supabase
        .from('billing_student_bills')
        .select('*, student:students(*), institution:institutions(*)')
        .in('id', data.bill_ids)
        .eq('student_id', data.student_id)
        .in('status', ['unpaid', 'partially_paid']);

      if (billsError || !bills || bills.length === 0) {
        throw new Error('No valid bills found for payment');
      }

      // Calculate total amount
      const totalAmount = bills.reduce((sum, bill) => {
        return sum + (bill.balance_amount > 0 ? bill.balance_amount : bill.final_amount);
      }, 0);

      // Generate transaction reference
      const transactionRef = this.generateTransactionRef();

      // Create transaction record
      const { data: transaction, error: transactionError } = await this.supabase
        .from('payment_transactions')
        .insert({
          transaction_ref: transactionRef,
          session_id: '', // Will be updated after HDFC response
          student_id: data.student_id,
          institution_id: bills[0].institution_id,
          bill_ids: data.bill_ids,
          total_amount: totalAmount,
          status: 'initiated'
        })
        .select()
        .single();

      if (transactionError) throw transactionError;

      // Create transaction items
      const transactionItems = bills.map(bill => ({
        transaction_id: transaction.id,
        bill_id: bill.id,
        amount: bill.balance_amount > 0 ? bill.balance_amount : bill.final_amount
      }));

      await this.supabase
        .from('payment_transaction_items')
        .insert(transactionItems);

      // Create HDFC session
      const hdfcSession = await this.createHDFCSession({
        orderId: transactionRef,
        amount: totalAmount,
        customerEmail: bills[0].student.student_email,
        customerPhone: bills[0].student.student_mobile,
        returnUrl: data.return_url || `${process.env.NEXT_PUBLIC_APP_URL}/billing/payments/return`,
        cancelUrl: data.cancel_url || `${process.env.NEXT_PUBLIC_APP_URL}/billing/payments/cancel`
      });

      // Update transaction with session ID
      await this.supabase
        .from('payment_transactions')
        .update({ session_id: hdfcSession.session_id })
        .eq('id', transaction.id);

      return {
        transaction_id: transaction.id,
        session_id: hdfcSession.session_id,
        payment_url: hdfcSession.payment_url,
        amount: totalAmount,
        expires_at: hdfcSession.expires_at
      };
    } catch (error) {
      console.error('Error creating payment session:', error);
      throw error;
    }
  }

  /**
   * Create HDFC SmartGateway session
   */
  private static async createHDFCSession(params: {
    orderId: string;
    amount: number;
    customerEmail: string;
    customerPhone: string;
    returnUrl: string;
    cancelUrl: string;
  }) {
    const requestBody: HDFCSessionRequest = {
      order: {
        amount: Math.round(params.amount * 100), // Convert to paisa
        currency: 'INR',
        id: params.orderId
      },
      payment_page_client_id: this.HDFC_CONFIG.merchantId,
      customer: {
        email: params.customerEmail,
        phone: params.customerPhone
      },
      success_url: params.returnUrl,
      failure_url: params.cancelUrl
    };

    const headers = {
      'Content-Type': 'application/json',
      'X-Client-Id': this.HDFC_CONFIG.apiKey,
      'X-Client-Secret': this.HDFC_CONFIG.apiSecret
    };

    const response = await fetch(`${this.HDFC_CONFIG.baseUrl}/v1/payments/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`HDFC API Error: ${error.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return {
      session_id: data.payment_session_id,
      payment_url: data.payment_links.web,
      expires_at: data.expires_at
    };
  }

  /**
   * Handle webhook from HDFC
   */
  static async handleWebhook(
    payload: HDFCWebhookPayload,
    signature: string
  ): Promise<void> {
    try {
      // Verify webhook signature
      if (!this.verifyWebhookSignature(payload, signature)) {
        throw new Error('Invalid webhook signature');
      }

      const orderId = payload.data.order.order_id;
      const paymentStatus = payload.data.payment.payment_status;

      // Get transaction
      const { data: transaction, error } = await this.supabase
        .from('payment_transactions')
        .select('*')
        .eq('transaction_ref', orderId)
        .single();

      if (error || !transaction) {
        console.error('Transaction not found:', orderId);
        return;
      }

      // Update transaction status
      const newStatus = this.mapHDFCStatusToInternal(paymentStatus);
      await this.supabase
        .from('payment_transactions')
        .update({
          status: newStatus,
          gateway_response: payload,
          gateway_transaction_id: payload.data.payment.payment_id,
          payment_method: payload.data.payment.payment_method,
          payment_date: payload.event_time,
          completed_at: newStatus === 'success' ? new Date().toISOString() : null
        })
        .eq('id', transaction.id);

      // If payment successful, create receipt
      if (newStatus === 'success') {
        await this.processSuccessfulPayment(transaction.id);
      }
    } catch (error) {
      console.error('Webhook processing error:', error);
      throw error;
    }
  }

  /**
   * Process successful payment
   */
  private static async processSuccessfulPayment(transactionId: string): Promise<void> {
    try {
      // Get transaction details
      const { data: transaction } = await this.supabase
        .from('payment_transactions')
        .select(`
          *,
          student:students(*),
          institution:institutions(*),
          items:payment_transaction_items(*)
        `)
        .eq('id', transactionId)
        .single();

      if (!transaction) throw new Error('Transaction not found');

      // Create receipt
      const receiptData = {
        student_id: transaction.student_id,
        institution_id: transaction.institution_id,
        payment_mode: 'online' as const,
        payment_reference_number: transaction.gateway_transaction_id,
        payment_amount: transaction.total_amount,
        payment_paid_date: new Date().toISOString().split('T')[0],
        payer_name: transaction.student.student_name,
        payer_contact: transaction.student.student_mobile,
        payment_remarks: `Online payment via HDFC SmartGateway - ${transaction.transaction_ref}`,
        receipt_items: transaction.items.map((item: any) => ({
          bill_id: item.bill_id,
          amount_paid: item.amount
        }))
      };

      const receipt = await BillingReceiptService.createBillingReceipt(receiptData);

      // The existing triggers will handle bill status updates and invoice generation
      console.log('Receipt created successfully:', receipt.receipt_number);
    } catch (error) {
      console.error('Error processing successful payment:', error);
      throw error;
    }
  }

  /**
   * Check payment status from HDFC
   */
  static async checkPaymentStatus(sessionId: string): Promise<any> {
    const headers = {
      'X-Client-Id': this.HDFC_CONFIG.apiKey,
      'X-Client-Secret': this.HDFC_CONFIG.apiSecret
    };

    const response = await fetch(
      `${this.HDFC_CONFIG.baseUrl}/v1/payments/sessions/${sessionId}`,
      { headers }
    );

    if (!response.ok) {
      throw new Error('Failed to check payment status');
    }

    return response.json();
  }

  /**
   * Generate unique transaction reference
   */
  private static generateTransactionRef(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `TXN-${timestamp}-${random}`.toUpperCase();
  }

  /**
   * Verify webhook signature
   */
  private static verifyWebhookSignature(
    payload: any,
    signature: string
  ): boolean {
    const computedSignature = crypto
      .createHmac('sha256', this.HDFC_CONFIG.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return computedSignature === signature;
  }

  /**
   * Map HDFC payment status to internal status
   */
  private static mapHDFCStatusToInternal(hdfcStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'COMPLETED': 'success',
      'PENDING': 'processing',
      'FAILED': 'failed',
      'CANCELLED': 'cancelled',
      'EXPIRED': 'expired',
      'REFUNDED': 'refunded'
    };

    return statusMap[hdfcStatus] || 'processing';
  }
}
```

## 4. API Routes

### Payment Initiation API

```typescript
// File: app/api/billing/payments/initiate/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { PaymentGatewayService } from '@/lib/services/billing/payment-gateway-service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { z } from 'zod';

const initiatePaymentSchema = z.object({
  student_id: z.string().uuid(),
  bill_ids: z.array(z.string().uuid()).min(1),
  return_url: z.string().url().optional(),
  cancel_url: z.string().url().optional()
});

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = initiatePaymentSchema.parse(body);

    // Create payment session
    const paymentSession = await PaymentGatewayService.createPaymentSession(validatedData);

    return NextResponse.json(paymentSession);
  } catch (error) {
    console.error('Payment initiation error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to initiate payment' },
      { status: 500 }
    );
  }
}
```

### Webhook Handler

```typescript
// File: app/api/billing/payments/webhook/hdfc/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { PaymentGatewayService } from '@/lib/services/billing/payment-gateway-service';

export async function POST(request: NextRequest) {
  try {
    // Get webhook signature from headers
    const signature = request.headers.get('X-Webhook-Signature');
    if (!signature) {
      return NextResponse.json(
        { error: 'Missing webhook signature' },
        { status: 401 }
      );
    }

    // Parse webhook payload
    const payload = await request.json();

    // Process webhook
    await PaymentGatewayService.handleWebhook(payload, signature);

    // Return success response
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook processing error:', error);

    // Return error but with 200 status to prevent retries
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 200 }
    );
  }
}
```

### Payment Status Check API

```typescript
// File: app/api/billing/payments/status/[transactionId]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { transactionId: string } }
) {
  try {
    const supabase = createServerSupabaseClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get transaction status
    const { data: transaction, error } = await supabase
      .from('payment_transactions')
      .select(`
        id,
        transaction_ref,
        status,
        total_amount,
        payment_date,
        payment_method,
        completed_at,
        items:payment_transaction_items(
          bill_id,
          amount
        )
      `)
      .eq('id', params.transactionId)
      .single();

    if (error || !transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Get receipt if payment was successful
    let receipt_id = null;
    if (transaction.status === 'success') {
      const { data: receipt } = await supabase
        .from('billing_receipts')
        .select('id')
        .eq('payment_reference_number', transaction.transaction_ref)
        .single();

      receipt_id = receipt?.id;
    }

    return NextResponse.json({
      transaction_id: transaction.id,
      status: transaction.status,
      amount: transaction.total_amount,
      payment_date: transaction.payment_date,
      payment_method: transaction.payment_method,
      receipt_id,
      bills_paid: transaction.items.length
    });
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: 'Failed to check payment status' },
      { status: 500 }
    );
  }
}
```

## 5. Frontend Components

### Online Payment Button

```tsx
// File: components/billing/online-payment-button.tsx

'use client';

import { useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PaymentSelectionModal } from './payment-selection-modal';
import type { StudentBill } from '@/types/billing-schedule';

interface OnlinePaymentButtonProps {
  studentId: string;
  bills: StudentBill[];
  onPaymentInitiated?: () => void;
}

export function OnlinePaymentButton({
  studentId,
  bills,
  onPaymentInitiated
}: OnlinePaymentButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filter unpaid/partially paid bills
  const payableBills = bills.filter(
    bill => bill.status === 'unpaid' || bill.status === 'partially_paid'
  );

  if (payableBills.length === 0) {
    return null;
  }

  return (
    <>
      <Button
        onClick={() => setIsModalOpen(true)}
        className="bg-green-600 hover:bg-green-700"
      >
        <CreditCard className="mr-2 h-4 w-4" />
        Pay Online
      </Button>

      <PaymentSelectionModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        studentId={studentId}
        bills={payableBills}
        onPaymentInitiated={onPaymentInitiated}
      />
    </>
  );
}
```

### Payment Selection Modal

```tsx
// File: components/billing/payment-selection-modal.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'react-hot-toast';
import type { StudentBill } from '@/types/billing-schedule';

interface PaymentSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  bills: StudentBill[];
  onPaymentInitiated?: () => void;
}

export function PaymentSelectionModal({
  open,
  onOpenChange,
  studentId,
  bills,
  onPaymentInitiated
}: PaymentSelectionModalProps) {
  const router = useRouter();
  const [selectedBills, setSelectedBills] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleBillSelection = (billId: string, checked: boolean) => {
    if (checked) {
      setSelectedBills([...selectedBills, billId]);
    } else {
      setSelectedBills(selectedBills.filter(id => id !== billId));
    }
  };

  const calculateTotal = () => {
    return bills
      .filter(bill => selectedBills.includes(bill.id))
      .reduce((sum, bill) => {
        const amount = bill.balance_amount > 0 ? bill.balance_amount : bill.final_amount;
        return sum + amount;
      }, 0);
  };

  const handlePayment = async () => {
    if (selectedBills.length === 0) {
      toast.error('Please select at least one bill to pay');
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch('/api/billing/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          bill_ids: selectedBills
        })
      });

      if (!response.ok) {
        throw new Error('Failed to initiate payment');
      }

      const data = await response.json();

      // Store transaction ID for tracking
      sessionStorage.setItem('payment_transaction_id', data.transaction_id);

      // Redirect to payment gateway
      window.location.href = data.payment_url;

      onPaymentInitiated?.();
    } catch (error) {
      console.error('Payment initiation error:', error);
      toast.error('Failed to initiate payment. Please try again.');
      setIsProcessing(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Select Bills to Pay</DialogTitle>
          <DialogDescription>
            Choose the bills you want to pay online. You can pay multiple bills at once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[400px] overflow-y-auto">
          {bills.map((bill) => {
            const amount = bill.balance_amount > 0 ? bill.balance_amount : bill.final_amount;
            return (
              <div
                key={bill.id}
                className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-gray-50"
              >
                <Checkbox
                  id={bill.id}
                  checked={selectedBills.includes(bill.id)}
                  onCheckedChange={(checked) =>
                    handleBillSelection(bill.id, checked as boolean)
                  }
                />
                <div className="flex-1">
                  <label
                    htmlFor={bill.id}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {bill.bill_description}
                  </label>
                  <div className="text-sm text-muted-foreground mt-1">
                    Due: {new Date(bill.due_date).toLocaleDateString('en-IN')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatCurrency(amount)}</div>
                  {bill.status === 'partially_paid' && (
                    <div className="text-xs text-muted-foreground">
                      Balance Amount
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t pt-4">
          <div className="flex justify-between items-center">
            <span className="font-semibold">Total Amount:</span>
            <span className="text-xl font-bold text-green-600">
              {formatCurrency(calculateTotal())}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            onClick={handlePayment}
            disabled={isProcessing || selectedBills.length === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Proceed to Payment'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Payment Status Page

```tsx
// File: app/(routes)/billing/payments/[transactionId]/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function PaymentStatusPage() {
  const params = useParams();
  const router = useRouter();
  const transactionId = params.transactionId as string;

  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkPaymentStatus();

    // Poll for status updates if payment is processing
    const interval = setInterval(() => {
      if (status?.status === 'processing') {
        checkPaymentStatus();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [transactionId]);

  const checkPaymentStatus = async () => {
    try {
      const response = await fetch(`/api/billing/payments/status/${transactionId}`);
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Error checking payment status:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = () => {
    switch (status?.status) {
      case 'success':
        return <CheckCircle className="h-16 w-16 text-green-600" />;
      case 'failed':
      case 'cancelled':
        return <XCircle className="h-16 w-16 text-red-600" />;
      default:
        return <Clock className="h-16 w-16 text-yellow-600" />;
    }
  };

  const getStatusMessage = () => {
    switch (status?.status) {
      case 'success':
        return 'Payment Successful!';
      case 'failed':
        return 'Payment Failed';
      case 'cancelled':
        return 'Payment Cancelled';
      case 'processing':
        return 'Payment Processing...';
      default:
        return 'Checking Payment Status...';
    }
  };

  if (loading) {
    return (
      <ContentLayout title="Payment Status">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Payment Status">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-center">Payment Status</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            {getStatusIcon()}

            <h2 className="text-2xl font-bold">{getStatusMessage()}</h2>

            {status?.status === 'success' && (
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  Your payment of ₹{status.amount} has been successfully processed.
                </p>
                <p className="text-sm text-muted-foreground">
                  {status.bills_paid} bill(s) have been paid.
                </p>
                {status.receipt_id && (
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/billing/receipts/${status.receipt_id}`)}
                  >
                    View Receipt
                  </Button>
                )}
              </div>
            )}

            {status?.status === 'failed' && (
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  Your payment could not be processed. Please try again.
                </p>
                <Button
                  onClick={() => router.push('/billing/schedule')}
                >
                  Try Again
                </Button>
              </div>
            )}

            {status?.status === 'processing' && (
              <p className="text-muted-foreground">
                Your payment is being processed. This may take a few moments.
              </p>
            )}

            <div className="pt-4">
              <Button
                variant="outline"
                onClick={() => router.push('/billing/schedule')}
              >
                Back to Billing
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
```

## 6. Integration with Existing UI

Update the student billing page to include the online payment button:

```tsx
// File: app/(routes)/billing/schedule/students/[id]/page.tsx
// Add this import
import { OnlinePaymentButton } from '@/components/billing/online-payment-button';

// In the header section, add the payment button alongside the Schedule Bill button:
{/* Header Actions */}
<div className="flex gap-2">
  {/* Online Payment Button */}
  <OnlinePaymentButton
    studentId={studentId}
    bills={billingSummary.bills}
    onPaymentInitiated={() => {
      toast.success('Redirecting to payment gateway...');
    }}
  />

  {/* Existing Schedule Bill Button */}
  {canCreateBills && (
    <Button asChild>
      <Link href={`/billing/schedule/new?student_id=${studentId}`}>
        <Plus className='mr-2 h-4 w-4' />
        Schedule Bill
      </Link>
    </Button>
  )}
</div>
```

## 7. Environment Variables

Add these to your `.env.local`:

```env
# HDFC SmartGateway Configuration
HDFC_MERCHANT_ID=your_merchant_id
HDFC_API_KEY=your_api_key
HDFC_API_SECRET=your_api_secret
HDFC_WEBHOOK_SECRET=your_webhook_secret
HDFC_BASE_URL=https://api.smartgateway.hdfcbank.com
HDFC_TEST_MODE=true

# Application URL (for payment redirects)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 8. Testing

Use HDFC test cards for development:

```
Test Card Numbers:
- Success: 4111 1111 1111 1111
- Failure: 4000 0000 0000 0002
- 3D Secure: 4000 0000 0000 0010

CVV: 123
Expiry: Any future date
```

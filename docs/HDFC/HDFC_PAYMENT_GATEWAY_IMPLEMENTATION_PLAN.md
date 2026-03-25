# HDFC SmartGateway Payment Integration - Complete Implementation Plan

**Date:** 2025-01-20
**Project:** MyJKKN Billing Management System
**Module:** Online Payment Gateway Integration
**Payment Gateway:** HDFC SmartGateway

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current System Analysis](#current-system-analysis)
3. [Integration Architecture](#integration-architecture)
4. [Implementation Phases](#implementation-phases)
5. [Technical Specifications](#technical-specifications)
6. [Testing Strategy](#testing-strategy)
7. [Deployment Plan](#deployment-plan)
8. [Security Considerations](#security-considerations)
9. [Appendix](#appendix)

---

## Executive Summary

### Objective
Integrate HDFC SmartGateway to enable students to pay their bills online while maintaining the existing billing system's automatic receipt and invoice generation functionality.

### Current Status
- ✅ Manual payment processing (cash, bank transfer, DD, cheque) - **COMPLETE**
- ✅ Automatic receipt generation with unique receipt numbers - **COMPLETE**
- ✅ Automatic bill status updates via database triggers - **COMPLETE**
- ✅ Automatic invoice generation for fully paid bills - **COMPLETE**
- ⏳ Online payment gateway integration - **PENDING**

### Key Benefits
1. **Student Convenience**: Pay bills 24/7 from anywhere
2. **Reduced Manual Work**: Automatic receipt generation for online payments
3. **Better Cash Flow**: Instant payment processing and confirmation
4. **Complete Audit Trail**: Every transaction tracked in payment_transactions table
5. **Scalability**: Handle unlimited concurrent payments

### Implementation Timeline
- **Phase 1 (Week 1)**: Database & TypeScript Types Setup
- **Phase 2 (Week 2)**: Backend Services & Payment Gateway Integration
- **Phase 3 (Week 3)**: API Development & Webhook Handler
- **Phase 4 (Week 4)**: Frontend Components & UI Integration
- **Phase 5 (Week 5)**: Testing, Security Hardening & Deployment

---

## Current System Analysis

### Database Schema - Billing Tables

#### Existing Tables (Already in Production)
```sql
-- Student Bills
billing_student_bills (
  id UUID PRIMARY KEY,
  student_id UUID REFERENCES students(id),
  institution_id UUID REFERENCES institutions(id),
  item_category_id UUID REFERENCES billing_item_categories(id),
  bill_description TEXT,
  due_date DATE,
  quantity INTEGER DEFAULT 1,
  unit_amount NUMERIC,
  total_amount NUMERIC,
  tax_amount NUMERIC DEFAULT 0,
  final_amount NUMERIC,
  status VARCHAR(50) DEFAULT 'unpaid', -- paid, unpaid, partially_paid, cancelled, overdue
  payment_date TIMESTAMP,
  balance_amount NUMERIC DEFAULT 0,
  remarks TEXT,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern VARCHAR(50), -- monthly, quarterly, yearly
  number_of_recurrences INTEGER,
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)

-- Receipts (Manual + Will be used for Online Payments)
billing_receipts (
  id UUID PRIMARY KEY,
  receipt_number VARCHAR UNIQUE, -- Auto-generated: RCP-YYYY-NNNNNN
  receipt_date DATE,
  student_id UUID REFERENCES students(id),
  institution_id UUID REFERENCES institutions(id),
  payment_mode VARCHAR(50), -- cash, online, bank_transfer, dd, cheque
  payment_reference_number VARCHAR, -- Will store gateway transaction ID for online
  payment_amount NUMERIC,
  payment_paid_date DATE,
  payer_name VARCHAR,
  payer_contact VARCHAR,
  accountant_id UUID REFERENCES profiles(id),
  payment_remarks TEXT,
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)

-- Receipt Items (Links receipts to bills)
billing_receipt_items (
  id UUID PRIMARY KEY,
  receipt_id UUID REFERENCES billing_receipts(id),
  bill_id UUID REFERENCES billing_student_bills(id),
  amount_paid NUMERIC,
  created_at TIMESTAMP DEFAULT NOW()
)

-- Invoices (Auto-generated when bills are fully paid)
billing_invoices (
  id UUID PRIMARY KEY,
  invoice_number VARCHAR UNIQUE,
  invoice_type VARCHAR(50), -- individual, consolidated
  invoice_date DATE,
  student_id UUID REFERENCES students(id),
  institution_id UUID REFERENCES institutions(id),
  billing_period_from DATE,
  billing_period_to DATE,
  invoice_description TEXT,
  tax_summary JSONB,
  payment_terms TEXT,
  due_date DATE,
  additional_charges NUMERIC DEFAULT 0,
  discount_applied NUMERIC DEFAULT 0,
  grand_total NUMERIC,
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
```

### Current Payment Flow (Manual)

```
1. Staff creates bill for student
   ↓
2. Student/Parent makes payment (cash/bank transfer/DD/cheque)
   ↓
3. Staff manually creates receipt via /billing/receipts/new
   ↓
4. BillingReceiptService.createBillingReceipt() executes:
   - Generates unique receipt number (RCP-YYYY-NNNNNN)
   - Creates receipt record
   - Creates receipt_items linking receipt to bills
   ↓
5. Database trigger automatically:
   - Updates bill status (paid/partially_paid/unpaid)
   - Updates balance_amount
   - Sets payment_date
   ↓
6. BillingReceiptService checks if bill is fully paid:
   - If yes → Automatically generates invoice
   - Creates billing_invoices record
   - Links invoice_items to receipts
```

### Existing Service Layer

#### BillingReceiptService (lib/services/billing/receipts/billing-receipt-service.ts)
```typescript
class BillingReceiptService {
  // Core receipt creation - WILL BE USED FOR ONLINE PAYMENTS TOO
  static async createBillingReceipt(receiptData: CreateReceiptDto): Promise<BillingReceipt>

  // Helper methods
  private static async generateReceiptNumber(): Promise<string>
  private static async validateAndUpdateBillStatus(billId: string): Promise<void>
  private static async checkAndGenerateInvoice(billId: string): Promise<void>

  // Bill retrieval for receipt generation
  static async getBillsByIds(billIds: string[]): Promise<any[]>
}
```

**Key Insight:** The online payment integration will leverage the existing `createBillingReceipt()` method, ensuring all existing triggers and workflows continue to work seamlessly!

---

## Integration Architecture

### New Components Required

#### 1. Database Tables (2 new tables)
```sql
-- Payment Transactions (Track online payment sessions)
payment_transactions
payment_transaction_items
```

#### 2. Backend Services (1 new service)
```typescript
PaymentGatewayService (lib/services/billing/payment-gateway-service.ts)
```

#### 3. API Endpoints (3 new endpoints)
```
POST   /api/billing/payments/initiate
POST   /api/billing/payments/webhook/hdfc
GET    /api/billing/payments/status/[transactionId]
```

#### 4. Frontend Components (3 new components)
```typescript
OnlinePaymentButton (components/billing/online-payment-button.tsx)
PaymentSelectionModal (components/billing/payment-selection-modal.tsx)
PaymentStatusPage (app/(routes)/billing/payments/[transactionId]/page.tsx)
```

#### 5. TypeScript Types (1 new type file)
```typescript
types/payment-gateway.ts
```

### Online Payment Flow

```
Student Dashboard
    ↓
1. Student selects unpaid/partially paid bills
    ↓
2. Clicks "Pay Online" button
    ↓
3. PaymentSelectionModal displays selected bills
    ↓
4. Student confirms payment
    ↓
5. Frontend calls POST /api/billing/payments/initiate
    ↓
6. PaymentGatewayService creates payment session:
   - Creates payment_transactions record (status: 'initiated')
   - Creates payment_transaction_items for each bill
   - Calls HDFC API to create payment session
   - Returns payment_url
    ↓
7. Student redirected to HDFC payment gateway
    ↓
8. Student completes payment on HDFC
    ↓
9. HDFC sends webhook to POST /api/billing/payments/webhook/hdfc
    ↓
10. PaymentGatewayService.handleWebhook():
    - Verifies webhook signature
    - Updates payment_transactions status to 'success'
    ↓
11. PaymentGatewayService.processSuccessfulPayment():
    - Calls BillingReceiptService.createBillingReceipt()
    - Creates receipt with payment_mode='online'
    - payment_reference_number = gateway_transaction_id
    ↓
12. Existing workflow takes over:
    - Receipt items created
    - Database triggers update bill status
    - Invoice auto-generated if fully paid
    ↓
13. Student redirected to success page with receipt
```

---

## Implementation Phases

### Phase 1: Database & TypeScript Types (Week 1)

#### 1.1 Create Database Migration

**File:** `supabase/migrations/[timestamp]_add_payment_gateway_tables.sql`

```sql
-- Migration: Add Payment Gateway Tables
-- Created: 2025-01-20
-- Purpose: Enable online payment processing via HDFC SmartGateway

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
    'initiated',
    'processing',
    'success',
    'failed',
    'cancelled',
    'expired',
    'refunded'
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

-- Create indexes for performance
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
CREATE POLICY "Users can view their own payment transactions"
  ON public.payment_transactions FOR SELECT
  USING (
    auth.uid() = student_id OR
    auth.uid() IN (SELECT id FROM profiles WHERE role IN ('super_admin', 'admin', 'institution_admin'))
  );

CREATE POLICY "Authenticated users can create payment transactions"
  ON public.payment_transactions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "System can update payment transactions"
  ON public.payment_transactions FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can view payment transaction items"
  ON public.payment_transaction_items FOR SELECT
  USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT ALL ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transaction_items TO authenticated;

-- Create trigger for updated_at
CREATE TRIGGER trigger_payment_transactions_updated_at
  BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_billing_updated_at();

-- Add comment
COMMENT ON TABLE public.payment_transactions IS 'Tracks online payment sessions with HDFC SmartGateway';
COMMENT ON TABLE public.payment_transaction_items IS 'Links payment transactions to specific bills being paid';
```

#### 1.2 Update SQL_FILE_INDEX.md

```markdown
### 2025-01-20: HDFC Payment Gateway Integration

- **File**: `migrations/[timestamp]_add_payment_gateway_tables.sql` ✅ **APPLIED**

  **Tables Added**:
  - `payment_transactions` - Track online payment sessions
  - `payment_transaction_items` - Link transactions to bills

  **Features**:
  - Full RLS policies for data security
  - Indexes for optimal query performance
  - Foreign key constraints to ensure data integrity
  - Status tracking for payment lifecycle
  - JSONB storage for gateway responses
```

#### 1.3 Create TypeScript Types

**File:** `types/payment-gateway.ts`

```typescript
// Payment Gateway Types for HDFC SmartGateway Integration

export type PaymentStatus =
  | 'initiated'
  | 'processing'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'refunded';

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

export interface PaymentTransactionItem {
  id: string;
  transaction_id: string;
  bill_id: string;
  amount: number;
  created_at: string;
}

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

export interface PaymentStatusCheckResponse {
  transaction_id: string;
  status: PaymentStatus;
  amount: number;
  payment_date?: string;
  payment_method?: string;
  receipt_id?: string;
  bills_paid: number;
}
```

**Deliverables:**
- ✅ Database migration file created and tested
- ✅ SQL_FILE_INDEX.md updated
- ✅ TypeScript types defined in types/payment-gateway.ts

---

### Phase 2: Backend Services & Payment Gateway Integration (Week 2)

#### 2.1 Create Payment Gateway Service

**File:** `lib/services/billing/payment-gateway-service.ts`

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { BillingReceiptService } from './receipts/billing-receipt-service';
import type {
  CreatePaymentSessionDto,
  PaymentSessionResponse,
  PaymentStatus,
  HDFCWebhookPayload,
  PaymentTransaction
} from '@/types/payment-gateway';
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
      console.log('[PaymentGateway] Creating payment session for:', data);

      // Validate student and bills
      const { data: bills, error: billsError } = await this.supabase
        .from('billing_student_bills')
        .select(`
          *,
          student:students(
            id,
            first_name,
            last_name,
            student_email,
            student_mobile,
            institution_id
          ),
          institution:institutions(
            id,
            name,
            counselling_code
          )
        `)
        .in('id', data.bill_ids)
        .eq('student_id', data.student_id)
        .in('status', ['unpaid', 'partially_paid']);

      if (billsError || !bills || bills.length === 0) {
        throw new Error('No valid bills found for payment');
      }

      // Calculate total amount (use balance_amount if exists, else final_amount)
      const totalAmount = bills.reduce((sum, bill) => {
        const billAmount = bill.balance_amount > 0 ? bill.balance_amount : bill.final_amount;
        return sum + billAmount;
      }, 0);

      console.log('[PaymentGateway] Total amount to pay:', totalAmount);

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

      if (transactionError) {
        console.error('[PaymentGateway] Transaction creation error:', transactionError);
        throw transactionError;
      }

      console.log('[PaymentGateway] Transaction created:', transaction.id);

      // Create transaction items
      const transactionItems = bills.map(bill => ({
        transaction_id: transaction.id,
        bill_id: bill.id,
        amount: bill.balance_amount > 0 ? bill.balance_amount : bill.final_amount
      }));

      const { error: itemsError } = await this.supabase
        .from('payment_transaction_items')
        .insert(transactionItems);

      if (itemsError) {
        console.error('[PaymentGateway] Transaction items error:', itemsError);
        throw itemsError;
      }

      // Create HDFC session
      const firstBill = bills[0];
      const student = firstBill.student as any;

      const hdfcSession = await this.createHDFCSession({
        orderId: transactionRef,
        amount: totalAmount,
        customerEmail: student.student_email || student.college_email,
        customerPhone: student.student_mobile,
        returnUrl: data.return_url || `${process.env.NEXT_PUBLIC_APP_URL}/billing/payments/${transaction.id}/status`,
        cancelUrl: data.cancel_url || `${process.env.NEXT_PUBLIC_APP_URL}/billing/payments/${transaction.id}/cancel`
      });

      // Update transaction with session ID
      await this.supabase
        .from('payment_transactions')
        .update({
          session_id: hdfcSession.session_id,
          status: 'processing'
        })
        .eq('id', transaction.id);

      console.log('[PaymentGateway] Payment session created successfully');

      return {
        transaction_id: transaction.id,
        session_id: hdfcSession.session_id,
        payment_url: hdfcSession.payment_url,
        amount: totalAmount,
        expires_at: hdfcSession.expires_at
      };
    } catch (error) {
      console.error('[PaymentGateway] Error creating payment session:', error);
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
    const requestBody = {
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

    console.log('[PaymentGateway] Creating HDFC session:', params.orderId);

    const response = await fetch(`${this.HDFC_CONFIG.baseUrl}/v1/payments/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[PaymentGateway] HDFC API Error:', error);
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
      console.log('[PaymentGateway] Processing webhook:', payload.event_type);

      // Verify webhook signature
      if (!this.verifyWebhookSignature(payload, signature)) {
        console.error('[PaymentGateway] Invalid webhook signature');
        throw new Error('Invalid webhook signature');
      }

      const orderId = payload.data.order.order_id;
      const paymentStatus = payload.data.payment.payment_status;

      console.log('[PaymentGateway] Order ID:', orderId, 'Status:', paymentStatus);

      // Get transaction
      const { data: transaction, error } = await this.supabase
        .from('payment_transactions')
        .select('*')
        .eq('transaction_ref', orderId)
        .single();

      if (error || !transaction) {
        console.error('[PaymentGateway] Transaction not found:', orderId);
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

      console.log('[PaymentGateway] Transaction status updated to:', newStatus);

      // If payment successful, create receipt
      if (newStatus === 'success') {
        console.log('[PaymentGateway] Processing successful payment...');
        await this.processSuccessfulPayment(transaction.id);
      }
    } catch (error) {
      console.error('[PaymentGateway] Webhook processing error:', error);
      throw error;
    }
  }

  /**
   * Process successful payment - Creates receipt using existing service
   */
  private static async processSuccessfulPayment(transactionId: string): Promise<void> {
    try {
      console.log('[PaymentGateway] Creating receipt for transaction:', transactionId);

      // Get transaction details
      const { data: transaction } = await this.supabase
        .from('payment_transactions')
        .select(`
          *,
          student:students(
            id,
            first_name,
            last_name,
            student_email,
            student_mobile
          ),
          institution:institutions(
            id,
            name
          ),
          items:payment_transaction_items(
            bill_id,
            amount
          )
        `)
        .eq('id', transactionId)
        .single();

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      const student = transaction.student as any;
      const payerName = `${student.first_name} ${student.last_name}`;

      // Create receipt using existing service - This triggers all existing workflows!
      const receiptData = {
        student_id: transaction.student_id,
        institution_id: transaction.institution_id,
        payment_mode: 'online' as const,
        payment_reference_number: transaction.gateway_transaction_id || transaction.transaction_ref,
        payment_amount: transaction.total_amount,
        payment_paid_date: new Date().toISOString().split('T')[0],
        payer_name: payerName,
        payer_contact: student.student_mobile,
        payment_remarks: `Online payment via HDFC SmartGateway - Transaction: ${transaction.transaction_ref}`,
        receipt_items: transaction.items.map((item: any) => ({
          bill_id: item.bill_id,
          amount_paid: item.amount
        }))
      };

      const receipt = await BillingReceiptService.createBillingReceipt(receiptData);

      console.log('[PaymentGateway] Receipt created successfully:', receipt.receipt_number);
      console.log('[PaymentGateway] Automatic bill status updates and invoice generation handled by existing triggers');
    } catch (error) {
      console.error('[PaymentGateway] Error processing successful payment:', error);
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
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `TXN-${timestamp}-${random}`;
  }

  /**
   * Verify webhook signature for security
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
      'SUCCESS': 'success',
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

#### 2.2 Environment Variables

Add to `.env.local`:

```env
# HDFC SmartGateway Configuration
HDFC_MERCHANT_ID=your_merchant_id_here
HDFC_API_KEY=your_api_key_here
HDFC_API_SECRET=your_api_secret_here
HDFC_WEBHOOK_SECRET=your_webhook_secret_here
HDFC_BASE_URL=https://api.smartgateway.hdfcbank.com
HDFC_TEST_MODE=true

# Application URL (for payment redirects)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Deliverables:**
- ✅ PaymentGatewayService created with full HDFC integration
- ✅ Environment variables configured
- ✅ Webhook signature verification implemented

---

### Phase 3: API Development & Webhook Handler (Week 3)

#### 3.1 Payment Initiation API

**File:** `app/api/billing/payments/initiate/route.ts`

```typescript
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

    console.log('[API] Initiating payment:', validatedData);

    // Create payment session
    const paymentSession = await PaymentGatewayService.createPaymentSession(validatedData);

    return NextResponse.json(paymentSession);
  } catch (error) {
    console.error('[API] Payment initiation error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to initiate payment',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
```

#### 3.2 Webhook Handler

**File:** `app/api/billing/payments/webhook/hdfc/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { PaymentGatewayService } from '@/lib/services/billing/payment-gateway-service';

export async function POST(request: NextRequest) {
  try {
    // Get webhook signature from headers
    const signature = request.headers.get('X-Webhook-Signature');
    if (!signature) {
      console.error('[Webhook] Missing webhook signature');
      return NextResponse.json(
        { error: 'Missing webhook signature' },
        { status: 401 }
      );
    }

    // Parse webhook payload
    const payload = await request.json();

    console.log('[Webhook] Received HDFC webhook:', payload.event_type);

    // Process webhook
    await PaymentGatewayService.handleWebhook(payload, signature);

    // Return success response
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[Webhook] Processing error:', error);

    // Return error but with 200 status to prevent retries for invalid webhooks
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 200 }
    );
  }
}
```

#### 3.3 Payment Status Check API

**File:** `app/api/billing/payments/status/[transactionId]/route.ts`

```typescript
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
      const { data: receipts } = await supabase
        .from('billing_receipts')
        .select('id, receipt_number')
        .ilike('payment_remarks', `%${transaction.transaction_ref}%`)
        .limit(1);

      receipt_id = receipts?.[0]?.id;
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
    console.error('[API] Status check error:', error);
    return NextResponse.json(
      { error: 'Failed to check payment status' },
      { status: 500 }
    );
  }
}
```

**Deliverables:**
- ✅ Payment initiation API with validation
- ✅ Webhook handler with signature verification
- ✅ Payment status check API
- ✅ Proper error handling and logging

---

### Phase 4: Frontend Components & UI Integration (Week 4)

#### 4.1 Online Payment Button Component

**File:** `components/billing/online-payment-button.tsx`

```typescript
'use client';

import { useState } from 'react';
import { CreditCard } from 'lucide-react';
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

#### 4.2 Payment Selection Modal Component

**File:** `components/billing/payment-selection-modal.tsx`

```typescript
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
        const error = await response.json();
        throw new Error(error.message || 'Failed to initiate payment');
      }

      const data = await response.json();

      // Store transaction ID for tracking
      sessionStorage.setItem('payment_transaction_id', data.transaction_id);

      toast.success('Redirecting to payment gateway...');

      // Redirect to payment gateway
      window.location.href = data.payment_url;

      onPaymentInitiated?.();
    } catch (error) {
      console.error('Payment initiation error:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to initiate payment. Please try again.'
      );
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
          <DialogTitle>Select Bills to Pay Online</DialogTitle>
          <DialogDescription>
            Choose the bills you want to pay. You can pay multiple bills at once.
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
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
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

#### 4.3 Payment Status Page

**File:** `app/(routes)/billing/payments/[transactionId]/status/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { PaymentStatusCheckResponse } from '@/types/payment-gateway';

export default function PaymentStatusPage() {
  const params = useParams();
  const router = useRouter();
  const transactionId = params.transactionId as string;

  const [status, setStatus] = useState<PaymentStatusCheckResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkPaymentStatus();

    // Poll for status updates if payment is processing
    const interval = setInterval(() => {
      if (status?.status === 'processing') {
        checkPaymentStatus();
      } else {
        clearInterval(interval);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [transactionId, status?.status]);

  const checkPaymentStatus = async () => {
    try {
      const response = await fetch(`/api/billing/payments/status/${transactionId}`);

      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
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
        return <Clock className="h-16 w-16 text-yellow-600 animate-pulse" />;
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0
    }).format(amount);
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
            <div className="flex justify-center">
              {getStatusIcon()}
            </div>

            <h2 className="text-2xl font-bold">{getStatusMessage()}</h2>

            {status?.status === 'success' && (
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  Your payment of {formatCurrency(status.amount)} has been successfully processed.
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
                <Button onClick={() => router.push('/billing/schedule/students')}>
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
                onClick={() => router.push('/billing/schedule/students')}
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

#### 4.4 Integrate into Student Billing Page

Update `app/(routes)/billing/schedule/students/[id]/page.tsx`:

```typescript
// Add import at the top
import { OnlinePaymentButton } from '@/components/billing/online-payment-button';

// In the header section, add the payment button:
<div className="flex gap-2">
  {/* Online Payment Button */}
  <OnlinePaymentButton
    studentId={studentId}
    bills={billingSummary?.bills || []}
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

**Deliverables:**
- ✅ OnlinePaymentButton component
- ✅ PaymentSelectionModal component
- ✅ PaymentStatusPage with auto-polling
- ✅ Integration into student billing page

---

## Testing Strategy

### Unit Tests

#### Test Payment Gateway Service
```typescript
// __tests__/services/payment-gateway-service.test.ts
describe('PaymentGatewayService', () => {
  it('should create payment session', async () => {
    const session = await PaymentGatewayService.createPaymentSession({
      student_id: 'test-student-id',
      bill_ids: ['bill-1', 'bill-2']
    });

    expect(session).toHaveProperty('payment_url');
    expect(session).toHaveProperty('transaction_id');
  });

  it('should verify webhook signature', () => {
    const payload = { event_type: 'PAYMENT_SUCCESS' };
    const signature = 'valid-signature';

    const isValid = PaymentGatewayService.verifyWebhookSignature(payload, signature);
    expect(isValid).toBe(true);
  });
});
```

### Integration Tests

#### Test Complete Payment Flow
```typescript
describe('Online Payment Flow', () => {
  it('should complete full payment cycle', async () => {
    // 1. Create bills
    const bills = await createTestBills();

    // 2. Initiate payment
    const session = await initiatePayment(bills);

    // 3. Simulate webhook callback
    await simulateHDFCWebhook(session.transaction_id, 'SUCCESS');

    // 4. Verify receipt created
    const receipt = await getReceiptByTransaction(session.transaction_id);
    expect(receipt).toBeDefined();
    expect(receipt.payment_mode).toBe('online');

    // 5. Verify bill status updated
    const updatedBills = await getBills(bills.map(b => b.id));
    expect(updatedBills.every(b => b.status === 'paid')).toBe(true);

    // 6. Verify invoice generated
    const invoice = await getInvoiceByStudent(bills[0].student_id);
    expect(invoice).toBeDefined();
  });
});
```

### Test Cards (HDFC Test Environment)

```
Success Payment:
- Card: 4111 1111 1111 1111
- CVV: 123
- Expiry: Any future date

Failed Payment:
- Card: 4000 0000 0000 0002
- CVV: 123
- Expiry: Any future date

3D Secure Authentication:
- Card: 4000 0000 0000 0010
- CVV: 123
- Expiry: Any future date
- OTP: 123456 (test OTP)
```

---

## Security Considerations

### 1. Webhook Security
- ✅ Signature verification using HMAC-SHA256
- ✅ Validate payload structure
- ✅ Idempotency checks to prevent duplicate processing

### 2. Data Protection
- ✅ Never store credit card details
- ✅ All sensitive data in environment variables
- ✅ HTTPS required for all payment endpoints
- ✅ RLS policies on payment_transactions table

### 3. Authentication & Authorization
- ✅ User authentication required for payment initiation
- ✅ Verify student ID matches authenticated user
- ✅ Institution access control

### 4. Error Handling
- ✅ Graceful handling of gateway failures
- ✅ Proper error messages to users
- ✅ Comprehensive logging for debugging

---

## Deployment Plan

### Pre-Deployment Checklist

#### 1. HDFC Configuration
- [ ] Obtain production merchant ID
- [ ] Obtain production API keys
- [ ] Configure webhook URL: `https://yourdomain.com/api/billing/payments/webhook/hdfc`
- [ ] Whitelist production domain with HDFC
- [ ] Test connection to production gateway

#### 2. Environment Variables
```env
# Production
HDFC_MERCHANT_ID=prod_merchant_id
HDFC_API_KEY=prod_api_key
HDFC_API_SECRET=prod_api_secret
HDFC_WEBHOOK_SECRET=prod_webhook_secret
HDFC_BASE_URL=https://api.smartgateway.hdfcbank.com
HDFC_TEST_MODE=false
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

#### 3. Database Migration
```bash
# Run migration on production
psql -h your-supabase-host -U postgres -d postgres < migrations/[timestamp]_add_payment_gateway_tables.sql
```

#### 4. Deployment Steps

**Phase 1: Backend Deployment**
1. Deploy database migration
2. Deploy backend services
3. Deploy API endpoints
4. Test webhook endpoint connectivity

**Phase 2: Frontend Deployment**
1. Deploy frontend components
2. Test payment button visibility
3. Test payment selection modal
4. Test payment status page

**Phase 3: Go Live**
1. Enable online payment for limited users (beta testing)
2. Monitor transaction logs
3. Verify receipt generation
4. Verify bill status updates
5. Verify invoice generation
6. Gradual rollout to all users

### Monitoring & Alerts

```typescript
// Set up monitoring for:
- Payment initiation success rate
- Webhook delivery success rate
- Receipt generation success rate
- Average payment processing time
- Failed payment reasons
```

---

## Appendix

### A. Database Schema Diagram

```
payment_transactions (NEW)
├─ id (PK)
├─ transaction_ref (UNIQUE)
├─ session_id (UNIQUE)
├─ student_id (FK → students)
├─ institution_id (FK → institutions)
├─ bill_ids (ARRAY)
├─ total_amount
├─ status
└─ gateway_response (JSONB)

payment_transaction_items (NEW)
├─ id (PK)
├─ transaction_id (FK → payment_transactions)
├─ bill_id (FK → billing_student_bills)
└─ amount

billing_receipts (EXISTING - No Changes)
├─ payment_mode (NOW INCLUDES 'online')
└─ payment_reference_number (STORES gateway_transaction_id)
```

### B. API Endpoints Summary

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/api/billing/payments/initiate` | POST | Create payment session | Yes |
| `/api/billing/payments/webhook/hdfc` | POST | HDFC webhook handler | No (signature verified) |
| `/api/billing/payments/status/[id]` | GET | Check payment status | Yes |

### C. Environment Variables Reference

| Variable | Purpose | Example |
|----------|---------|---------|
| `HDFC_MERCHANT_ID` | HDFC merchant identifier | `merchant_123456` |
| `HDFC_API_KEY` | API key for authentication | `key_abc123` |
| `HDFC_API_SECRET` | API secret for authentication | `secret_xyz789` |
| `HDFC_WEBHOOK_SECRET` | Secret for webhook verification | `webhook_secret_abc` |
| `HDFC_BASE_URL` | HDFC API base URL | `https://api.smartgateway.hdfcbank.com` |
| `HDFC_TEST_MODE` | Enable test mode | `true` or `false` |
| `NEXT_PUBLIC_APP_URL` | Application URL for redirects | `https://yourdomain.com` |

### D. Error Codes & Messages

| Code | Message | Resolution |
|------|---------|-----------|
| `PAYMENT_001` | Invalid bill IDs | Verify bill IDs exist and are unpaid |
| `PAYMENT_002` | HDFC API error | Check HDFC credentials and connectivity |
| `PAYMENT_003` | Webhook signature invalid | Verify webhook secret configuration |
| `PAYMENT_004` | Receipt creation failed | Check BillingReceiptService logs |
| `PAYMENT_005` | Transaction not found | Verify transaction ID is correct |

---

## Next Steps

Once you review and approve this plan:

1. ✅ Confirm HDFC test credentials availability
2. ✅ Set up test environment
3. ✅ Begin Phase 1 implementation (Database setup)
4. ✅ Schedule weekly progress reviews
5. ✅ Plan UAT sessions with test users

---

**Document Version:** 1.0
**Last Updated:** 2025-01-20
**Status:** Ready for Implementation
**Estimated Completion:** 5 Weeks

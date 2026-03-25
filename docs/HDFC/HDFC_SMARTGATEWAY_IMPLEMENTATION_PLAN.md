# HDFC SmartGateway Payment Integration - Implementation Plan

## Executive Summary

This document outlines the implementation plan for integrating HDFC Bank SmartGateway payment gateway into the existing MyJKKN billing management system. The integration will enable students to pay their bills online while maintaining the current billing workflow and automatic receipt/invoice generation.

## Current System Analysis

### Database Schema Overview

#### Core Tables:

- **billing_student_bills**: Stores student bills with status tracking
- **billing_receipts**: Records payment receipts with automatic receipt number generation
- **billing_receipt_items**: Junction table linking receipts to bills
- **billing_invoices**: Stores auto-generated invoices when bills are fully paid
- **billing_refunds**: Handles refund transactions
- **billing_discounts**: Manages discounts and scholarships

#### Key Features:

1. Automatic bill status updates via database triggers
2. Receipt number generation (format: RCP-YYYY-NNNNNN)
3. Automatic invoice generation when bills are fully paid
4. Support for partial payments
5. Refund processing with bill status recalculation

### Current Payment Flow:

1. Bills created for students
2. Manual payment recording through receipts
3. Automatic bill status updates
4. Invoice auto-generation for paid bills

## Integration Architecture

### New Database Tables Required

```sql
-- Table to store payment gateway transactions
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_ref VARCHAR(100) UNIQUE NOT NULL,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  student_id UUID NOT NULL,
  institution_id UUID NOT NULL,
  bill_ids UUID[] NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  status VARCHAR(50) NOT NULL DEFAULT 'initiated',
  gateway_response JSONB,
  payment_method VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT fk_payment_transactions_student
    FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_transactions_institution
    FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE
);

-- Table to store payment transaction items (bills being paid)
CREATE TABLE IF NOT EXISTS public.payment_transaction_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL,
  bill_id UUID NOT NULL,
  amount DECIMAL(10,2) NOT NULL,

  CONSTRAINT fk_payment_transaction_items_transaction
    FOREIGN KEY (transaction_id) REFERENCES public.payment_transactions(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_transaction_items_bill
    FOREIGN KEY (bill_id) REFERENCES public.billing_student_bills(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_payment_transactions_student_id ON public.payment_transactions(student_id);
CREATE INDEX idx_payment_transactions_status ON public.payment_transactions(status);
CREATE INDEX idx_payment_transactions_created_at ON public.payment_transactions(created_at);
```

### API Endpoints

#### 1. Payment Initiation

```typescript
POST /api/billing/payments/initiate
{
  student_id: string;
  bill_ids: string[];
  return_url?: string;
  cancel_url?: string;
}

Response:
{
  transaction_id: string;
  session_id: string;
  payment_url: string;
  amount: number;
}
```

#### 2. Payment Status Check

```typescript
GET /api/billing/payments/status/:transaction_id

Response:
{
  transaction_id: string;
  status: 'initiated' | 'processing' | 'success' | 'failed' | 'cancelled';
  amount: number;
  payment_date?: string;
  receipt_id?: string;
  error_message?: string;
}
```

#### 3. Webhook Handler

```typescript
POST /api/billing/payments/webhook/hdfc
Headers: X-Webhook-Signature
Body: HDFC Webhook Payload
```

## Implementation Steps

### Phase 1: Backend Infrastructure (Week 1-2)

#### 1.1 Database Setup

- Create payment_transactions tables
- Add RLS policies
- Create indexes for performance

#### 1.2 Payment Service Implementation

```typescript
// lib/services/billing/payment-gateway-service.ts
export class PaymentGatewayService {
  // Initialize HDFC SmartGateway session
  static async createPaymentSession(data: CreatePaymentSessionDto): Promise<PaymentSession>

  // Check payment status from HDFC
  static async checkPaymentStatus(sessionId: string): Promise<PaymentStatus>

  // Process successful payment
  static async processSuccessfulPayment(transactionId: string): Promise<void>

  // Handle webhook events
  static async handleWebhook(payload: WebhookPayload): Promise<void>

  // Create receipt automatically
  private static async createAutomaticReceipt(transaction: PaymentTransaction): Promise<void>
}
```

#### 1.3 Environment Configuration

```env
# HDFC SmartGateway Configuration
HDFC_MERCHANT_ID=your_merchant_id
HDFC_API_KEY=your_api_key
HDFC_API_SECRET=your_api_secret
HDFC_WEBHOOK_SECRET=your_webhook_secret
HDFC_BASE_URL=https://api.smartgateway.hdfcbank.com
HDFC_TEST_MODE=true
```

### Phase 2: API Development (Week 2-3)

#### 2.1 Payment Initiation API

```typescript
// app/api/billing/payments/initiate/route.ts
export async function POST(request: Request) {
  // Validate student and bills
  // Calculate total amount
  // Create payment session with HDFC
  // Store transaction in database
  // Return payment URL
}
```

#### 2.2 Webhook Handler

```typescript
// app/api/billing/payments/webhook/hdfc/route.ts
export async function POST(request: Request) {
  // Verify webhook signature
  // Update transaction status
  // If successful, create receipt
  // Trigger bill status updates
}
```

### Phase 3: Frontend Implementation (Week 3-4)

#### 3.1 Student Portal Enhancement

- Add "Pay Online" button to student billing page
- Create payment selection interface
- Implement payment flow UI

#### 3.2 New Components

```typescript
// components/billing/online-payment-button.tsx
// components/billing/payment-selection-modal.tsx
// components/billing/payment-status-tracker.tsx
```

#### 3.3 Payment Flow Pages

```typescript
// app/(routes)/billing/payments/[transactionId]/page.tsx
// app/(routes)/billing/payments/success/page.tsx
// app/(routes)/billing/payments/failed/page.tsx
```

### Phase 4: Security Implementation (Week 4)

#### 4.1 Security Measures

- Implement webhook signature verification
- Add rate limiting on payment APIs
- Implement idempotency for payment processing
- Add comprehensive logging for audit trail
- Implement payment timeout handling

#### 4.2 Error Handling

- Graceful handling of payment failures
- Retry mechanism for transient failures
- Clear error messages for users
- Admin notification for critical failures

### Phase 5: Testing & Deployment (Week 5)

#### 5.1 Testing Strategy

- Unit tests for payment service
- Integration tests with HDFC test environment
- End-to-end testing of payment flow
- Load testing for concurrent payments
- Security testing (OWASP compliance)

#### 5.2 Deployment Plan

- Deploy to staging environment
- Conduct UAT with test payments
- Production deployment with feature flag
- Gradual rollout to institutions

## Technical Specifications

### Payment Flow Sequence

1. Student selects bills to pay
2. System creates payment session with HDFC
3. Student redirected to HDFC payment page
4. After payment, redirected back to application
5. Webhook confirms payment status
6. System automatically creates receipt
7. Bill status updated via existing triggers
8. Invoice auto-generated if fully paid

### Error Scenarios

- Payment timeout: Show pending status, check via API
- Payment failure: Clear error message, retry option
- Duplicate payment: Prevent via idempotency
- Partial payment failure: Rollback transaction

### Integration Points

- HDFC Session API for payment initiation
- Order Status API for status checks
- Webhook integration for real-time updates
- Refund API for processing refunds

## UI/UX Considerations

### Student Portal Enhancements

1. **Bill Selection Interface**

   - Checkbox selection for multiple bills
   - Running total display
   - Clear payment summary

2. **Payment Status Pages**

   - Success page with receipt download
   - Failure page with retry option
   - Processing page for pending payments

3. **Payment History**
   - Show online payment transactions
   - Download payment receipts
   - Track refund status

## Monitoring & Maintenance

### Monitoring Requirements

- Payment success/failure rates
- Average payment processing time
- Failed webhook deliveries
- System error rates

### Maintenance Tasks

- Regular reconciliation with HDFC
- Cleanup of abandoned transactions
- Monitoring webhook health
- Performance optimization

## Risk Mitigation

### Identified Risks

1. **Payment Gateway Downtime**

   - Mitigation: Graceful error handling, status page

2. **Webhook Delivery Failures**

   - Mitigation: Implement retry mechanism, manual reconciliation

3. **Duplicate Payments**

   - Mitigation: Idempotency keys, transaction locking

4. **Security Breaches**
   - Mitigation: Follow PCI compliance, regular security audits

## Timeline

| Phase   | Duration | Deliverables                            |
| ------- | -------- | --------------------------------------- |
| Phase 1 | Week 1-2 | Backend infrastructure, Database setup  |
| Phase 2 | Week 2-3 | API development, Webhook integration    |
| Phase 3 | Week 3-4 | Frontend implementation, UI components  |
| Phase 4 | Week 4   | Security implementation, Error handling |
| Phase 5 | Week 5   | Testing, Deployment, Documentation      |

## Success Criteria

- Students can pay bills online successfully
- Automatic receipt generation works correctly
- Bill status updates happen in real-time
- Zero payment data loss
- Sub-3 second payment initiation time
- 99.9% uptime for payment services

## Next Steps

1. Review and approve implementation plan
2. Set up HDFC SmartGateway test account
3. Create development branch for implementation
4. Begin Phase 1 implementation

## Appendix

### HDFC SmartGateway API References

- Session API: Create payment sessions
- Order Status API: Check payment status
- Webhook Events: Real-time payment updates
- Refund API: Process refunds
- Test Cards: For development testing

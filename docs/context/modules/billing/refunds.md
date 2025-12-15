# Billing Refunds - Complete Context

> Refund processing with approval workflow

---

## Overview

Refunds allow returning money from a receipt to a student. Each refund requires authorization and approval before processing.

### Table Name
`public.billing_refunds`

---

## Data Model

### Primary Entity: billing_refunds

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `receipt_id` | UUID | Yes | - | FK to receipts |
| `refund_category` | TEXT | Yes | - | Reason category |
| `refund_amount` | DECIMAL | Yes | - | Gross refund amount |
| `refund_date` | DATE | Yes | - | Date of refund |
| `refund_method` | TEXT | Yes | - | How refund is made |
| `bank_details` | JSONB | No | - | Bank info (if transfer) |
| `refund_reason` | TEXT | Yes | - | Detailed reason |
| `supporting_documents` | JSONB | No | - | Document references |
| `authorizer_id` | UUID | No | - | FK to profiles |
| `approved_by` | UUID | No | - | FK to profiles |
| `processing_fee` | DECIMAL | Yes | `0` | Deducted fee |
| `net_refund_amount` | DECIMAL | Yes | - | refund - fee |
| `approval_status` | TEXT | Yes | `'pending'` | Status |
| `created_by` | UUID | No | - | Creator user ID |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

---

## Refund Categories

```typescript
type RefundCategory =
  | 'course_change'
  | 'withdrawal'
  | 'overpayment'
  | 'duplicate_payment'
  | 'administrative_error'
  | 'service_not_provided'
  | 'system_error'
  | 'other';
```

| Category | Description | Common Scenario |
|----------|-------------|-----------------|
| `course_change` | Student changed course | Transfer to different program |
| `withdrawal` | Student withdrew | Left institution |
| `overpayment` | Paid more than required | Excess payment |
| `duplicate_payment` | Same bill paid twice | Double payment error |
| `administrative_error` | Institution mistake | Wrong billing |
| `service_not_provided` | Service not rendered | Lab not available |
| `system_error` | Technical issue | Payment gateway error |
| `other` | Other reasons | Miscellaneous |

---

## Refund Methods

```typescript
type RefundMethod =
  | 'cash'
  | 'bank_transfer'
  | 'adjust_future_bills'
  | 'cheque'
  | 'online_transfer';
```

| Method | Description | Bank Details Required |
|--------|-------------|-----------------------|
| `cash` | Cash refund | No |
| `bank_transfer` | NEFT/RTGS/IMPS | Yes |
| `adjust_future_bills` | Credit to account | No |
| `cheque` | Cheque issued | No |
| `online_transfer` | UPI/Wallet | Yes (UPI ID) |

---

## Refund Status

```typescript
type RefundStatus = 'pending' | 'approved' | 'rejected' | 'processed';
```

### Status Flow

```
┌─────────┐
│ pending │ ← Initial state (refund requested)
└────┬────┘
     │
     ├── Authorizer approves ──→ ┌──────────┐
     │                           │ approved │
     │                           └────┬─────┘
     │                                │
     │                                ├── Finance processes ──→ ┌───────────┐
     │                                │                         │ processed │
     │                                │                         └───────────┘
     │                                │
     │                                └── (stays approved until processed)
     │
     └── Authorizer rejects ───→ ┌──────────┐
                                 │ rejected │
                                 └──────────┘
```

---

## TypeScript Types

```typescript
export interface BillingRefund {
  id: string;
  receipt_id: string;
  refund_category: RefundCategory;
  refund_amount: number;
  refund_date: string;
  refund_method: RefundMethod;
  bank_details?: any;
  refund_reason: string;
  supporting_documents?: any;
  authorizer_id?: string;
  approved_by?: string;
  processing_fee: number;
  net_refund_amount: number;
  approval_status: RefundStatus;
  created_by?: string;
  created_at: string;
  updated_at: string;

  // Related data
  receipt?: BillingReceipt;
  authorizer?: {
    id: string;
    full_name: string;
  };
  approver?: {
    id: string;
    full_name: string;
  };
}

export interface CreateRefundDto {
  receipt_id: string;
  refund_category: RefundCategory;
  refund_amount: number;
  refund_date: string;
  refund_method: RefundMethod;
  bank_details?: any;
  refund_reason: string;
  supporting_documents?: any;
  processing_fee?: number;
}

export interface UpdateRefundDto extends Partial<CreateRefundDto> {
  authorizer_id?: string;
  approval_status?: RefundStatus;
  net_refund_amount?: number;
}

export interface RefundFilters {
  search?: string;
  receipt_id?: string;
  refund_category?: RefundCategory;
  refund_method?: RefundMethod;
  approval_status?: RefundStatus;
  refund_date_from?: string;
  refund_date_to?: string;
  page?: number;
  limit?: number;
}
```

---

## Bank Details Structure

```typescript
interface BankDetails {
  bank_name: string;
  account_number: string;
  ifsc_code: string;
  account_holder_name: string;
  branch_name?: string;
  upi_id?: string;  // For online_transfer method
}
```

Example:
```json
{
  "bank_name": "State Bank of India",
  "account_number": "1234567890",
  "ifsc_code": "SBIN0001234",
  "account_holder_name": "Rahul Kumar",
  "branch_name": "Main Branch"
}
```

---

## Net Refund Calculation

```
net_refund_amount = refund_amount - processing_fee
```

### Processing Fee Rules
- Default: ₹0 (no fee)
- May apply for: course_change, withdrawal
- Configurable per institution

---

## Refund Processing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. SELECT RECEIPT                                               │
│     - Search by receipt number or student                       │
│     - Receipt must have positive amount                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. ENTER REFUND DETAILS                                         │
│     - Category (overpayment, withdrawal, etc.)                  │
│     - Amount (≤ receipt.payment_amount - existing refunds)      │
│     - Method (cash, bank transfer, etc.)                        │
│     - Reason with details                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. ENTER BANK DETAILS (if required)                             │
│     - Bank name, account number, IFSC                           │
│     - Account holder name                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. UPLOAD SUPPORTING DOCUMENTS (Optional)                       │
│     - Withdrawal letter                                         │
│     - Duplicate payment proof                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. SUBMIT FOR APPROVAL                                          │
│     - status = 'pending'                                        │
│     - Notify authorizer                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  6. AUTHORIZER REVIEWS                                           │
│     - Verifies details and documents                            │
│     - Approves or rejects                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  7. IF APPROVED - FINANCE PROCESSES                              │
│     - Makes actual refund (cash/transfer)                       │
│     - Updates approval_status = 'processed'                     │
│     - Records approved_by (finance user)                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Relationships

### Foreign Keys

| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `billing_receipts` | `receipt_id` | Many-to-One |
| `profiles` | `authorizer_id` | Many-to-One |
| `profiles` | `approved_by` | Many-to-One |
| `profiles` | `created_by` | Many-to-One |

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/billing/refunds` | List refunds |
| GET | `/api/api-management/billing/refunds/:id` | Get refund by ID |
| POST | `/api/billing/refunds` | Create refund |
| PUT | `/api/billing/refunds/:id` | Update refund |
| PUT | `/api/billing/refunds/:id/approve` | Approve refund |
| PUT | `/api/billing/refunds/:id/reject` | Reject refund |
| PUT | `/api/billing/refunds/:id/process` | Mark as processed |
| DELETE | `/api/billing/refunds/:id` | Delete (pending only) |

### Create Refund Request

```json
{
  "receipt_id": "receipt-uuid",
  "refund_category": "overpayment",
  "refund_amount": 5000,
  "refund_date": "2024-12-15",
  "refund_method": "bank_transfer",
  "bank_details": {
    "bank_name": "State Bank of India",
    "account_number": "1234567890",
    "ifsc_code": "SBIN0001234",
    "account_holder_name": "Rahul Kumar"
  },
  "refund_reason": "Student overpaid by ₹5000 due to calculation error",
  "processing_fee": 0
}
```

### Approve Refund Request

```json
{
  "approval_status": "approved",
  "authorizer_id": "finance-head-uuid"
}
```

### Process Refund Request

```json
{
  "approval_status": "processed",
  "approved_by": "cashier-uuid"
}
```

---

## Sample Data

### Bank Transfer Refund

```json
{
  "id": "refund-uuid",
  "receipt_id": "receipt-uuid",
  "refund_category": "overpayment",
  "refund_amount": 5000,
  "refund_date": "2024-12-15",
  "refund_method": "bank_transfer",
  "bank_details": {
    "bank_name": "State Bank of India",
    "account_number": "1234567890",
    "ifsc_code": "SBIN0001234",
    "account_holder_name": "Rahul Kumar",
    "branch_name": "Main Branch"
  },
  "refund_reason": "Student overpaid ₹5000 against tuition fee",
  "authorizer_id": "finance-head-uuid",
  "approved_by": "cashier-uuid",
  "processing_fee": 0,
  "net_refund_amount": 5000,
  "approval_status": "processed",
  "receipt": {
    "id": "receipt-uuid",
    "receipt_number": "RCP-3839-20241201-0001",
    "payment_amount": 55000,
    "student": {
      "first_name": "Rahul",
      "last_name": "Kumar",
      "roll_number": "21CS001"
    }
  },
  "authorizer": {
    "id": "finance-head-uuid",
    "full_name": "Finance Head"
  },
  "approver": {
    "id": "cashier-uuid",
    "full_name": "Cashier"
  }
}
```

### Withdrawal Refund (with processing fee)

```json
{
  "id": "refund-uuid-2",
  "receipt_id": "receipt-uuid-2",
  "refund_category": "withdrawal",
  "refund_amount": 50000,
  "refund_date": "2024-12-15",
  "refund_method": "cheque",
  "refund_reason": "Student withdrawing from course - refund of tuition fee minus processing fee",
  "processing_fee": 5000,
  "net_refund_amount": 45000,
  "approval_status": "approved",
  "supporting_documents": {
    "documents": [
      {
        "document_type": "withdrawal_letter",
        "file_name": "withdrawal_letter.pdf",
        "file_url": "/uploads/refunds/withdrawal_letter.pdf",
        "uploaded_at": "2024-12-14T10:00:00Z"
      }
    ]
  }
}
```

---

## Refund Report

```typescript
interface RefundReport {
  refund_id: string;
  receipt_number: string;
  first_name: string;
  last_name?: string;
  roll_number?: string;
  institution_name: string;
  refund_category: RefundCategory;
  refund_method: RefundMethod;
  refund_amount: number;
  processing_fee: number;
  net_refund_amount: number;
  approval_status: RefundStatus;
  refund_date: string;
}
```

---

## Business Rules

1. **Receipt Required**: Refund must reference a valid receipt
2. **Amount Limit**: Total refunds ≤ receipt.payment_amount
3. **Bank Details**: Required for bank_transfer and online_transfer methods
4. **Two-Level Approval**: authorizer_id (approves) → approved_by (processes)
5. **Processing Fee**: Deducted from refund_amount
6. **Pending Only Delete**: Only pending refunds can be deleted
7. **approved_by Required**: Must be set before marking as 'processed'

---

## Permission Keys

| Operation | Permission Key |
|-----------|----------------|
| View Refunds | `billing.refunds.view` |
| Create Refund | `billing.refunds.create` |
| Edit Refund | `billing.refunds.edit` |
| Delete Refund | `billing.refunds.delete` |
| Approve/Reject | `billing.refunds.approve` |
| Process Refund | `billing.refunds.process` |

---

## Impact on Reports

When a refund is processed:
- Collection report shows `net_amount = payment_amount - total_refunds`
- Receipt shows `has_refunds: true`
- Dashboard metrics include refund totals

---

## Service Location

- **Service**: `lib/services/billing/refunds/billing-refund-service.ts`
- **Hook**: `hooks/billing/use-refunds.ts`
- **Types**: `types/billing-schedule.ts`

---

*Last Updated: December 2024*

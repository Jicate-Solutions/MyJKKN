# Billing Receipts - Complete Context

> Payment collection and receipt management

---

## Overview

Receipts record payments made by students. A single receipt can cover multiple bills (full or partial payments).

### Table Names
- `public.billing_receipts` - Receipt headers
- `public.billing_receipt_items` - Receipt line items (bill payments)

---

## Data Model

### Entity: billing_receipts

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `receipt_number` | TEXT | Yes | Auto-generated | Unique receipt number |
| `receipt_date` | DATE | Yes | `CURRENT_DATE` | Receipt date |
| `student_id` | UUID | Yes | - | FK to students |
| `institution_id` | UUID | Yes | - | FK to institutions |
| `payment_mode` | TEXT | Yes | - | Payment method |
| `payment_reference_number` | TEXT | No | - | Transaction reference |
| `payment_amount` | DECIMAL | Yes | - | Total payment amount |
| `payment_paid_date` | DATE | Yes | - | Date payment received |
| `payer_name` | TEXT | Yes | - | Person who paid |
| `payer_contact` | TEXT | No | - | Contact number |
| `accountant_id` | UUID | No | - | FK to profiles (collector) |
| `payment_remarks` | TEXT | No | - | Payment notes |
| `created_by` | UUID | No | - | Creator user ID |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

### Entity: billing_receipt_items

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `receipt_id` | UUID | Yes | - | FK to receipts |
| `bill_id` | UUID | Yes | - | FK to student bills |
| `amount_paid` | DECIMAL | Yes | - | Amount allocated to bill |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |

---

## Payment Modes

```typescript
type PaymentMode = 'cash' | 'online' | 'bank_transfer' | 'dd' | 'cheque';
```

| Mode | Description | Reference Required |
|------|-------------|-------------------|
| `cash` | Cash payment | No |
| `online` | Online gateway (UPI, cards) | Yes - Transaction ID |
| `bank_transfer` | NEFT/RTGS/IMPS | Yes - UTR Number |
| `dd` | Demand Draft | Yes - DD Number |
| `cheque` | Cheque payment | Yes - Cheque Number |

---

## TypeScript Types

```typescript
export interface BillingReceipt {
  id: string;
  receipt_number: string;
  receipt_date: string;
  student_id: string;
  institution_id: string;
  payment_mode: PaymentMode;
  payment_reference_number?: string;
  payment_amount: number;
  payment_paid_date: string;
  payer_name: string;
  payer_contact?: string;
  accountant_id?: string;
  payment_remarks?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;

  // Related data
  student?: {
    id: string;
    first_name: string;
    last_name: string;
    roll_number?: string;
    college_email: string;
  };
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  accountant?: {
    id: string;
    full_name: string;
  };
  receipt_items?: ReceiptItem[];
  refunds?: BillingRefund[];
}

export interface ReceiptItem {
  id: string;
  receipt_id: string;
  bill_id: string;
  amount_paid: number;
  created_at: string;

  // Related data
  bill?: StudentBill;
  receipt?: BillingReceipt;
}

export interface CreateReceiptDto {
  student_id: string;
  institution_id: string;
  payment_mode: PaymentMode;
  payment_reference_number?: string;
  payment_amount: number;
  payment_paid_date: string;
  payer_name: string;
  payer_contact?: string;
  accountant_id?: string;
  payment_remarks?: string;
  receipt_items: {
    bill_id: string;
    amount_paid: number;
  }[];
}

export interface UpdateReceiptDto
  extends Partial<Omit<CreateReceiptDto, 'receipt_items'>> {
  receipt_date?: string;
}

export interface ReceiptFilters {
  search?: string;
  student_id?: string;
  institution_id?: string;
  payment_mode?: PaymentMode;
  receipt_date_from?: string;
  receipt_date_to?: string;
  amount_from?: number;
  amount_to?: number;
  payer_name?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}
```

---

## Receipt Number Generation

Format: `RCP-{INST_CODE}-{YYYYMMDD}-{SEQUENCE}`

Example: `RCP-3839-20241215-0001`

- `RCP`: Receipt prefix
- `3839`: Institution counselling code
- `20241215`: Date (YYYYMMDD)
- `0001`: Daily sequence number

---

## Payment Collection Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. SEARCH STUDENT                                               │
│     - Enter name, roll number, or mobile                        │
│     - Display matching students with outstanding balance        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. VIEW PENDING BILLS                                           │
│     - List all bills with status: unpaid, partially_paid        │
│     - Show: description, due_date, amount, balance              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. SELECT BILLS TO PAY                                          │
│     - Check boxes to select bills                               │
│     - Enter amount for each (default: full balance)             │
│     - Partial payments allowed                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. ENTER PAYMENT DETAILS                                        │
│     - Payment mode (cash, online, etc.)                         │
│     - Reference number (if applicable)                          │
│     - Payer name and contact                                    │
│     - Payment date                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. VALIDATE & SUBMIT                                            │
│     - Verify sum(receipt_items) = payment_amount                │
│     - Verify each amount ≤ bill.balance_amount                  │
│     - Generate receipt number                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  6. UPDATE BILLS                                                 │
│     - For each receipt_item:                                    │
│       - bill.balance_amount -= amount_paid                      │
│       - Update bill.status based on new balance                 │
│     - Record accountant_id                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  7. PRINT RECEIPT                                                │
│     - Generate printable receipt                                │
│     - Include all receipt_items with bill details               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Relationships

### billing_receipts Foreign Keys

| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `students` | `student_id` | Many-to-One |
| `institutions` | `institution_id` | Many-to-One |
| `profiles` | `accountant_id` | Many-to-One |
| `profiles` | `created_by` | Many-to-One |

### billing_receipt_items Foreign Keys

| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `billing_receipts` | `receipt_id` | Many-to-One |
| `billing_student_bills` | `bill_id` | Many-to-One |

### Referenced By

| Table | Via | Description |
|-------|-----|-------------|
| `billing_invoice_items` | `receipt_id` | Invoice line items |
| `billing_refunds` | `receipt_id` | Refunds against receipt |

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/billing/receipts` | List receipts |
| GET | `/api/api-management/billing/receipts/:id` | Get receipt by ID |
| POST | `/api/billing/receipts` | Create receipt |
| PUT | `/api/billing/receipts/:id` | Update receipt |
| GET | `/api/billing/receipts/:id/print` | Get printable receipt |

### Create Receipt Request

```json
{
  "student_id": "student-uuid",
  "institution_id": "inst-uuid",
  "payment_mode": "cash",
  "payment_amount": 55000,
  "payment_paid_date": "2024-12-15",
  "payer_name": "Ramesh Kumar (Father)",
  "payer_contact": "9876543210",
  "accountant_id": "accountant-uuid",
  "receipt_items": [
    {
      "bill_id": "bill-1",
      "amount_paid": 50000
    },
    {
      "bill_id": "bill-2",
      "amount_paid": 5000
    }
  ]
}
```

---

## Sample Data

### Receipt with Multiple Items

```json
{
  "id": "receipt-uuid",
  "receipt_number": "RCP-3839-20241215-0001",
  "receipt_date": "2024-12-15",
  "student_id": "student-uuid",
  "institution_id": "inst-uuid",
  "payment_mode": "online",
  "payment_reference_number": "UPI123456789",
  "payment_amount": 55000,
  "payment_paid_date": "2024-12-15",
  "payer_name": "Rahul Kumar",
  "payer_contact": "9876543210",
  "accountant_id": "accountant-uuid",
  "student": {
    "id": "student-uuid",
    "first_name": "Rahul",
    "last_name": "Kumar",
    "roll_number": "21CS001",
    "college_email": "rahul@jkkn.ac.in"
  },
  "accountant": {
    "id": "accountant-uuid",
    "full_name": "Accounts Staff"
  },
  "receipt_items": [
    {
      "id": "ri-1",
      "receipt_id": "receipt-uuid",
      "bill_id": "bill-1",
      "amount_paid": 50000,
      "bill": {
        "id": "bill-1",
        "bill_description": "CSE 1st Year Sem 1 Tuition",
        "final_amount": 50000
      }
    },
    {
      "id": "ri-2",
      "receipt_id": "receipt-uuid",
      "bill_id": "bill-2",
      "amount_paid": 5000,
      "bill": {
        "id": "bill-2",
        "bill_description": "Lab Fees",
        "final_amount": 5000
      }
    }
  ],
  "refunds": []
}
```

---

## Business Rules

1. **Amount Validation**: `sum(receipt_items.amount_paid) = payment_amount`
2. **Balance Check**: Each `amount_paid ≤ bill.balance_amount`
3. **Reference Required**: Online/bank/dd/cheque require reference number
4. **Receipt Immutable**: After creation, only remarks editable
5. **Bill Updates**: Creating receipt auto-updates bill balances
6. **Refund Link**: Refunds reference the original receipt

---

## Collection Reports

### CollectionReport Interface

```typescript
interface CollectionReport {
  receipt_id: string;
  receipt_number: string;
  receipt_date: string;
  first_name: string;
  last_name?: string;
  roll_number?: string;
  institution_name: string;
  payment_mode: PaymentMode;
  payment_amount: number;
  total_refunds: number;
  net_amount: number;
  has_refunds: boolean;
  accountant_name?: string;
}
```

---

## Service Location

- **Service**: `lib/services/billing/receipts/billing-receipt-service.ts`
- **Hook**: `hooks/billing/use-receipts.ts`
- **Types**: `types/billing-schedule.ts`

---

*Last Updated: December 2024*

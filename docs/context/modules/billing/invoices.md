# Billing Invoices - Complete Context

> Invoice generation for receipts and payments

---

## Overview

Invoices are formal documents generated for receipts. They can be individual (single receipt) or consolidated (multiple receipts).

### Table Names
- `public.billing_invoices` - Invoice headers
- `public.billing_invoice_items` - Invoice line items (receipts)

---

## Data Model

### Entity: billing_invoices

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `invoice_number` | TEXT | Yes | Auto-generated | Unique invoice number |
| `invoice_type` | TEXT | Yes | - | individual/consolidated |
| `invoice_date` | DATE | Yes | `CURRENT_DATE` | Invoice date |
| `student_id` | UUID | Yes | - | FK to students |
| `institution_id` | UUID | Yes | - | FK to institutions |
| `billing_period_from` | DATE | No | - | Period start (for consolidated) |
| `billing_period_to` | DATE | No | - | Period end (for consolidated) |
| `invoice_description` | TEXT | No | - | Invoice description |
| `tax_summary` | JSONB | No | - | Tax breakdown |
| `payment_terms` | TEXT | No | - | Payment terms text |
| `due_date` | DATE | No | - | Invoice due date |
| `additional_charges` | DECIMAL | No | `0` | Extra charges |
| `discount_applied` | DECIMAL | No | `0` | Discounts applied |
| `grand_total` | DECIMAL | Yes | - | Final invoice amount |
| `created_by` | UUID | No | - | Creator user ID |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

### Entity: billing_invoice_items

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `invoice_id` | UUID | Yes | - | FK to invoices |
| `receipt_id` | UUID | Yes | - | FK to receipts |
| `amount` | DECIMAL | Yes | - | Receipt amount on invoice |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |

---

## Invoice Types

```typescript
type InvoiceType = 'individual' | 'consolidated';
```

| Type | Description | Use Case |
|------|-------------|----------|
| `individual` | Single receipt invoice | Per-payment invoice |
| `consolidated` | Multiple receipts | Period summary invoice |

---

## TypeScript Types

```typescript
export interface BillingInvoice {
  id: string;
  invoice_number: string;
  invoice_type: InvoiceType;
  invoice_date: string;
  student_id: string;
  institution_id: string;
  billing_period_from?: string;
  billing_period_to?: string;
  invoice_description?: string;
  tax_summary?: any;
  payment_terms?: string;
  due_date?: string;
  additional_charges: number;
  discount_applied: number;
  grand_total: number;
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
  invoice_items?: InvoiceItem[];
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  receipt_id: string;
  amount: number;
  created_at: string;

  // Related data
  receipt?: BillingReceipt;
}

export interface CreateInvoiceDto {
  invoice_type: InvoiceType;
  student_id: string;
  institution_id: string;
  billing_period_from?: string;
  billing_period_to?: string;
  invoice_description?: string;
  tax_summary?: any;
  payment_terms?: string;
  due_date?: string;
  additional_charges?: number;
  discount_applied?: number;
  invoice_items: {
    receipt_id: string;
    amount: number;
  }[];
}

export interface UpdateInvoiceDto
  extends Partial<Omit<CreateInvoiceDto, 'invoice_items'>> {
  invoice_date?: string;
  grand_total?: number;
}

export interface InvoiceFilters {
  search?: string;
  student_id?: string;
  institution_id?: string;
  invoice_type?: InvoiceType;
  invoice_date_from?: string;
  invoice_date_to?: string;
  billing_period_from?: string;
  billing_period_to?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}
```

---

## Invoice Number Generation

Format: `INV-{INST_CODE}-{YYYYMMDD}-{SEQUENCE}`

Example: `INV-3839-20241215-0001`

- `INV`: Invoice prefix
- `3839`: Institution counselling code
- `20241215`: Date (YYYYMMDD)
- `0001`: Daily sequence number

---

## Tax Summary Structure

```typescript
interface TaxSummary {
  subtotal: number;
  tax_items: {
    tax_name: string;      // "GST", "CGST", "SGST"
    tax_rate: number;      // 18, 9, 9
    tax_amount: number;    // calculated amount
  }[];
  total_tax: number;
  grand_total: number;
}
```

Example:
```json
{
  "subtotal": 50000,
  "tax_items": [
    {
      "tax_name": "CGST",
      "tax_rate": 9,
      "tax_amount": 4500
    },
    {
      "tax_name": "SGST",
      "tax_rate": 9,
      "tax_amount": 4500
    }
  ],
  "total_tax": 9000,
  "grand_total": 59000
}
```

---

## Invoice Generation Flow

### Individual Invoice
```
┌─────────────────────────────────────────────────────────────────┐
│  1. SELECT RECEIPT                                               │
│     - From receipt list or after payment                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. GENERATE INVOICE                                             │
│     - invoice_type = 'individual'                               │
│     - Single invoice_item with receipt                          │
│     - grand_total = receipt.payment_amount                      │
└─────────────────────────────────────────────────────────────────┘
```

### Consolidated Invoice
```
┌─────────────────────────────────────────────────────────────────┐
│  1. SELECT STUDENT                                               │
│     - Filter by institution                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. SELECT DATE RANGE                                            │
│     - billing_period_from                                       │
│     - billing_period_to                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. FETCH RECEIPTS                                               │
│     - All receipts in date range                                │
│     - Not already on another invoice                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. GENERATE CONSOLIDATED INVOICE                                │
│     - invoice_type = 'consolidated'                             │
│     - Multiple invoice_items                                    │
│     - grand_total = sum(receipt amounts)                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Relationships

### billing_invoices Foreign Keys

| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `students` | `student_id` | Many-to-One |
| `institutions` | `institution_id` | Many-to-One |
| `profiles` | `created_by` | Many-to-One |

### billing_invoice_items Foreign Keys

| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `billing_invoices` | `invoice_id` | Many-to-One |
| `billing_receipts` | `receipt_id` | Many-to-One |

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/billing/invoices` | List invoices |
| GET | `/api/api-management/billing/invoices/:id` | Get invoice by ID |
| POST | `/api/billing/invoices` | Create invoice |
| PUT | `/api/billing/invoices/:id` | Update invoice |
| GET | `/api/billing/invoices/:id/print` | Get printable invoice |
| POST | `/api/billing/invoices/consolidated` | Create consolidated |

### Create Individual Invoice

```json
{
  "invoice_type": "individual",
  "student_id": "student-uuid",
  "institution_id": "inst-uuid",
  "invoice_description": "Payment Receipt",
  "invoice_items": [
    {
      "receipt_id": "receipt-uuid",
      "amount": 55000
    }
  ]
}
```

### Create Consolidated Invoice

```json
{
  "invoice_type": "consolidated",
  "student_id": "student-uuid",
  "institution_id": "inst-uuid",
  "billing_period_from": "2024-01-01",
  "billing_period_to": "2024-06-30",
  "invoice_description": "Semester 1 Fee Summary",
  "payment_terms": "Payment already received",
  "invoice_items": [
    { "receipt_id": "receipt-1", "amount": 50000 },
    { "receipt_id": "receipt-2", "amount": 5000 },
    { "receipt_id": "receipt-3", "amount": 8000 }
  ]
}
```

---

## Sample Data

### Consolidated Invoice

```json
{
  "id": "invoice-uuid",
  "invoice_number": "INV-3839-20241215-0001",
  "invoice_type": "consolidated",
  "invoice_date": "2024-12-15",
  "student_id": "student-uuid",
  "institution_id": "inst-uuid",
  "billing_period_from": "2024-07-01",
  "billing_period_to": "2024-12-31",
  "invoice_description": "Semester 1 - 2024 Fee Summary",
  "tax_summary": null,
  "payment_terms": "All payments received",
  "due_date": null,
  "additional_charges": 0,
  "discount_applied": 0,
  "grand_total": 63000,
  "student": {
    "id": "student-uuid",
    "first_name": "Rahul",
    "last_name": "Kumar",
    "roll_number": "21CS001",
    "college_email": "rahul@jkkn.ac.in"
  },
  "institution": {
    "id": "inst-uuid",
    "name": "JKKN College of Engineering",
    "counselling_code": "3839"
  },
  "invoice_items": [
    {
      "id": "ii-1",
      "invoice_id": "invoice-uuid",
      "receipt_id": "receipt-1",
      "amount": 50000,
      "receipt": {
        "receipt_number": "RCP-3839-20240815-0001",
        "payment_amount": 50000,
        "payment_mode": "online"
      }
    },
    {
      "id": "ii-2",
      "invoice_id": "invoice-uuid",
      "receipt_id": "receipt-2",
      "amount": 5000,
      "receipt": {
        "receipt_number": "RCP-3839-20240815-0002",
        "payment_amount": 5000,
        "payment_mode": "cash"
      }
    },
    {
      "id": "ii-3",
      "invoice_id": "invoice-uuid",
      "receipt_id": "receipt-3",
      "amount": 8000,
      "receipt": {
        "receipt_number": "RCP-3839-20240901-0001",
        "payment_amount": 8000,
        "payment_mode": "bank_transfer"
      }
    }
  ]
}
```

---

## Invoice Report

```typescript
interface InvoiceReport {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  first_name: string;
  last_name?: string;
  roll_number?: string;
  institution_name: string;
  invoice_type: InvoiceType;
  grand_total: number;
  billing_period_from?: string;
  billing_period_to?: string;
}
```

---

## Business Rules

1. **Receipt Once**: A receipt can only appear on one invoice
2. **Grand Total Calculation**: `grand_total = sum(items) + additional_charges - discount_applied`
3. **Period Required**: Consolidated invoices need billing period dates
4. **Invoice Immutable**: After generation, most fields read-only
5. **Same Student**: All invoice_items must be for the same student

---

## Service Location

- **Service**: `lib/services/billing/invoices/billing-invoice-service-optimized.ts`
- **Hook**: `hooks/billing/use-invoices.ts`
- **Types**: `types/billing-schedule.ts`

---

*Last Updated: December 2024*

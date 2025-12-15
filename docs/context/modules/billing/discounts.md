# Billing Discounts - Complete Context

> Scholarship, financial aid, and discount management with approval workflow

---

## Overview

Discounts reduce bill amounts for students. Each discount requires an approval workflow before it affects the bill balance.

### Table Name
`public.billing_discounts`

---

## Data Model

### Primary Entity: billing_discounts

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `bill_id` | UUID | Yes | - | FK to student bills |
| `discount_category` | TEXT | Yes | - | Category of discount |
| `discount_type` | TEXT | Yes | - | amount or percentage |
| `discount_value` | DECIMAL | Yes | - | Value (amount or %) |
| `discount_amount` | DECIMAL | Yes | - | Calculated amount |
| `discount_reason` | TEXT | Yes | - | Reason/justification |
| `supporting_documents` | JSONB | No | - | Document references |
| `authorizer_id` | UUID | No | - | FK to profiles (approver) |
| `approval_date` | DATE | No | - | Date of approval |
| `approval_status` | TEXT | Yes | `'pending'` | Approval status |
| `effective_date` | DATE | Yes | - | When discount takes effect |
| `expiry_date` | DATE | No | - | When discount expires |
| `created_by` | UUID | No | - | Creator user ID |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

---

## Discount Categories

```typescript
type DiscountCategory =
  | 'merit_scholarship'
  | 'financial_aid'
  | 'staff_quota'
  | 'sports_quota'
  | 'special_circumstances';
```

| Category | Description | Typical Amount |
|----------|-------------|----------------|
| `merit_scholarship` | Academic excellence scholarship | 10-100% |
| `financial_aid` | Need-based financial assistance | Variable |
| `staff_quota` | Discount for staff children | 25-50% |
| `sports_quota` | Sports achievement discount | 10-50% |
| `special_circumstances` | Other special cases | Variable |

---

## Discount Types

```typescript
type DiscountType = 'amount' | 'percentage';
```

| Type | Description | Example |
|------|-------------|---------|
| `amount` | Fixed amount reduction | ₹5,000 off |
| `percentage` | Percentage of bill | 20% off |

### Discount Amount Calculation

```typescript
// For percentage type
discount_amount = (bill.final_amount * discount_value) / 100;

// For amount type
discount_amount = discount_value;
```

---

## Approval Status

```typescript
type ApprovalStatus = 'pending' | 'approved' | 'rejected';
```

### Status Flow

```
┌─────────┐
│ pending │ ← Initial state (discount created)
└────┬────┘
     │
     ├── Authorizer approves ──→ ┌──────────┐
     │                           │ approved │
     │                           └────┬─────┘
     │                                │
     │                                └── Bill balance updated
     │
     └── Authorizer rejects ───→ ┌──────────┐
                                 │ rejected │
                                 └──────────┘
```

---

## TypeScript Types

```typescript
export interface BillingDiscount {
  id: string;
  bill_id: string;
  discount_category: DiscountCategory;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  discount_reason: string;
  supporting_documents?: any;
  authorizer_id?: string;
  approval_date?: string;
  approval_status: ApprovalStatus;
  effective_date: string;
  expiry_date?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;

  // Related data
  bill?: StudentBill;
  authorizer?: {
    id: string;
    full_name: string;
  };
}

export interface CreateDiscountDto {
  bill_id: string;
  discount_category: DiscountCategory;
  discount_type: DiscountType;
  discount_value: number;
  discount_reason: string;
  supporting_documents?: any;
  effective_date: string;
  expiry_date?: string;
}

export interface UpdateDiscountDto extends Partial<CreateDiscountDto> {
  authorizer_id?: string;
  approval_date?: string;
  approval_status?: ApprovalStatus;
  discount_amount?: number;
}

export interface DiscountFilters {
  search?: string;
  bill_id?: string;
  discount_category?: DiscountCategory;
  discount_type?: DiscountType;
  approval_status?: ApprovalStatus;
  effective_date_from?: string;
  effective_date_to?: string;
  page?: number;
  limit?: number;
}
```

---

## Supporting Documents Structure

```typescript
interface SupportingDocuments {
  documents: {
    document_type: string;     // "mark_sheet", "income_certificate", etc.
    file_name: string;
    file_url: string;
    uploaded_at: string;
  }[];
  notes?: string;
}
```

Example:
```json
{
  "documents": [
    {
      "document_type": "mark_sheet",
      "file_name": "12th_marksheet.pdf",
      "file_url": "/uploads/discounts/12th_marksheet.pdf",
      "uploaded_at": "2024-12-10T10:00:00Z"
    },
    {
      "document_type": "income_certificate",
      "file_name": "income_cert.pdf",
      "file_url": "/uploads/discounts/income_cert.pdf",
      "uploaded_at": "2024-12-10T10:05:00Z"
    }
  ],
  "notes": "Student scored above 95% in 12th standard"
}
```

---

## Discount Application Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. SELECT BILL                                                  │
│     - Search student                                            │
│     - Select unpaid/partially_paid bill                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. ENTER DISCOUNT DETAILS                                       │
│     - Category (merit, financial aid, etc.)                     │
│     - Type (amount or percentage)                               │
│     - Value (₹5000 or 20%)                                     │
│     - Reason/justification                                      │
│     - Effective date                                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. UPLOAD DOCUMENTS (Optional)                                  │
│     - Mark sheets, income certificates                          │
│     - Sports certificates, staff ID proof                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. SUBMIT FOR APPROVAL                                          │
│     - Status = 'pending'                                        │
│     - discount_amount calculated                                │
│     - Bill balance NOT yet affected                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. AUTHORIZER REVIEWS                                           │
│     - Views discount details and documents                      │
│     - Approves or rejects                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  6. IF APPROVED                                                  │
│     - approval_status = 'approved'                              │
│     - authorizer_id = approver's profile ID                     │
│     - approval_date = today                                     │
│     - bill.balance_amount -= discount_amount                    │
│     - bill.status updated if needed                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Relationships

### Foreign Keys

| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `billing_student_bills` | `bill_id` | Many-to-One |
| `profiles` | `authorizer_id` | Many-to-One |
| `profiles` | `created_by` | Many-to-One |

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/billing/discounts` | List discounts |
| GET | `/api/api-management/billing/discounts/:id` | Get discount by ID |
| POST | `/api/billing/discounts` | Create discount |
| PUT | `/api/billing/discounts/:id` | Update discount |
| PUT | `/api/billing/discounts/:id/approve` | Approve discount |
| PUT | `/api/billing/discounts/:id/reject` | Reject discount |
| DELETE | `/api/billing/discounts/:id` | Delete (pending only) |

### Create Discount Request

```json
{
  "bill_id": "bill-uuid",
  "discount_category": "merit_scholarship",
  "discount_type": "percentage",
  "discount_value": 25,
  "discount_reason": "Scored above 95% in 12th standard",
  "effective_date": "2024-12-01",
  "supporting_documents": {
    "documents": [
      {
        "document_type": "mark_sheet",
        "file_name": "12th_marksheet.pdf",
        "file_url": "/uploads/discounts/12th_marksheet.pdf",
        "uploaded_at": "2024-12-10T10:00:00Z"
      }
    ]
  }
}
```

### Approve Discount Request

```json
{
  "approval_status": "approved",
  "authorizer_id": "authorizer-uuid",
  "approval_date": "2024-12-15"
}
```

---

## Sample Data

### Merit Scholarship Discount

```json
{
  "id": "discount-uuid",
  "bill_id": "bill-uuid",
  "discount_category": "merit_scholarship",
  "discount_type": "percentage",
  "discount_value": 25,
  "discount_amount": 12500,
  "discount_reason": "Scored 98% in 12th standard - Merit scholarship",
  "supporting_documents": {
    "documents": [
      {
        "document_type": "mark_sheet",
        "file_name": "12th_marksheet.pdf",
        "file_url": "/uploads/discounts/12th_marksheet.pdf",
        "uploaded_at": "2024-12-10T10:00:00Z"
      }
    ]
  },
  "authorizer_id": "principal-uuid",
  "approval_date": "2024-12-12",
  "approval_status": "approved",
  "effective_date": "2024-12-01",
  "expiry_date": null,
  "bill": {
    "id": "bill-uuid",
    "bill_description": "CSE 1st Year Sem 1 Tuition",
    "final_amount": 50000,
    "balance_amount": 37500
  },
  "authorizer": {
    "id": "principal-uuid",
    "full_name": "Dr. Principal"
  }
}
```

### Financial Aid Discount

```json
{
  "id": "discount-uuid-2",
  "bill_id": "bill-uuid-2",
  "discount_category": "financial_aid",
  "discount_type": "amount",
  "discount_value": 20000,
  "discount_amount": 20000,
  "discount_reason": "Family annual income below ₹2,00,000",
  "supporting_documents": {
    "documents": [
      {
        "document_type": "income_certificate",
        "file_name": "income_cert.pdf",
        "file_url": "/uploads/discounts/income_cert.pdf",
        "uploaded_at": "2024-12-08T14:30:00Z"
      }
    ]
  },
  "approval_status": "pending",
  "effective_date": "2024-12-15"
}
```

---

## Discount Report

```typescript
interface DiscountReport {
  discount_id: string;
  first_name: string;
  last_name?: string;
  roll_number?: string;
  institution_name: string;
  bill_description: string;
  discount_category: DiscountCategory;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  approval_status: ApprovalStatus;
  effective_date: string;
  authorizer_name?: string;
}
```

---

## Business Rules

1. **Bill Required**: Discount must reference a valid bill
2. **One Category Per Bill**: Typically one discount per category per bill
3. **Pending Until Approved**: Discount doesn't affect balance until approved
4. **Max Discount**: Total discounts can't exceed bill.final_amount
5. **Effective Date**: Discount only valid from effective_date onwards
6. **Expiry Check**: Expired discounts are ignored
7. **Delete Pending Only**: Only pending discounts can be deleted
8. **Approval Authority**: Only users with `billing.discounts.approve` permission

---

## Permission Keys

| Operation | Permission Key |
|-----------|----------------|
| View Discounts | `billing.discounts.view` |
| Create Discount | `billing.discounts.create` |
| Edit Discount | `billing.discounts.edit` |
| Delete Discount | `billing.discounts.delete` |
| Approve/Reject | `billing.discounts.approve` |

---

## Service Location

- **Service**: `lib/services/billing/discounts/billing-discount-service.ts`
- **Scholarship Service**: `lib/services/billing/scholarship-permission-service.ts`
- **Hook**: `hooks/billing/use-discounts.ts`
- **Types**: `types/billing-schedule.ts`

---

*Last Updated: December 2024*

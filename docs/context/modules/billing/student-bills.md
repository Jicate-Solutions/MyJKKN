# Student Bills - Complete Context

> Fee scheduling and bill management for students

---

## Overview

Student bills represent fee charges assigned to students. Each bill tracks amounts, due dates, payment status, and balance.

### Table Name
`public.billing_student_bills`

---

## Data Model

### Primary Entity: billing_student_bills

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `student_id` | UUID | Yes | - | FK to students |
| `institution_id` | UUID | Yes | - | FK to institutions |
| `item_category_id` | UUID | Yes | - | FK to item categories |
| `bill_description` | TEXT | No | - | Description override |
| `due_date` | DATE | Yes | - | Payment due date |
| `quantity` | INTEGER | Yes | `1` | Quantity |
| `unit_amount` | DECIMAL | Yes | - | Per unit amount |
| `total_amount` | DECIMAL | Yes | - | quantity × unit_amount |
| `tax_amount` | DECIMAL | No | `0` | Tax amount |
| `final_amount` | DECIMAL | Yes | - | total + tax |
| `status` | TEXT | Yes | `'unpaid'` | Bill status |
| `payment_date` | DATE | No | - | Last payment date |
| `balance_amount` | DECIMAL | Yes | - | Remaining balance |
| `remarks` | TEXT | No | - | Additional notes |
| `is_recurring` | BOOLEAN | Yes | `false` | Recurring flag |
| `recurrence_pattern` | TEXT | No | - | monthly/quarterly/yearly |
| `number_of_recurrences` | INTEGER | No | - | Total occurrences |
| `created_by` | UUID | No | - | Creator user ID |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

---

## Status Values

```typescript
type BillStatus =
  | 'paid'
  | 'unpaid'
  | 'partially_paid'
  | 'cancelled'
  | 'overdue'
  | 'refunded';
```

### Status Transitions

```
┌─────────┐
│ unpaid  │ ← Initial state
└────┬────┘
     │
     ├── Payment received ──→ ┌────────────────┐
     │                        │ partially_paid │
     │                        └───────┬────────┘
     │                                │
     │                                ├── Full payment ──→ ┌──────┐
     │                                │                    │ paid │
     │                                │                    └──────┘
     │                                │
     ├── Full payment ────────────────┘
     │
     ├── Due date passed ──→ ┌─────────┐
     │                       │ overdue │
     │                       └─────────┘
     │
     ├── Admin cancels ────→ ┌───────────┐
     │                       │ cancelled │
     │                       └───────────┘
     │
     └── Refund processed ──→ ┌──────────┐
                              │ refunded │
                              └──────────┘
```

---

## TypeScript Types

```typescript
export interface StudentBill {
  id: string;
  student_id: string;
  institution_id: string;
  item_category_id: string;
  bill_description: string;
  due_date: string;
  quantity: number;
  unit_amount: number;
  total_amount: number;
  tax_amount: number;
  final_amount: number;
  status: BillStatus;
  payment_date?: string;
  balance_amount: number;
  remarks?: string;
  is_recurring: boolean;
  recurrence_pattern?: RecurrencePattern;
  number_of_recurrences?: number;
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
    student_mobile: string;
    degree?: { id: string; degree_name: string; };
    department?: { id: string; department_name: string; };
    semester?: { id: string; semester_name: string; };
  };
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  item_category?: {
    id: string;
    item_category_name: string;
    parent_category?: { id: string; parent_category_name: string; };
    sub_category?: { id: string; sub_category_name: string; };
  };
  discounts?: BillingDiscount[];
  receipt_items?: ReceiptItem[];
}

export interface CreateStudentBillDto {
  student_id: string;
  institution_id: string;
  item_category_id: string;
  bill_description?: string;
  due_date: string;
  quantity?: number;
  unit_amount: number;
  total_amount: number;
  tax_amount?: number;
  final_amount: number;
  remarks?: string;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern;
  number_of_recurrences?: number;
}

export interface UpdateStudentBillDto extends Partial<CreateStudentBillDto> {
  status?: BillStatus;
  payment_date?: string;
  balance_amount?: number;
}

export interface StudentBillFilters {
  search?: string;
  student_id?: string;
  institution_id?: string;
  item_category_id?: string;
  status?: BillStatus;
  due_date_from?: string;
  due_date_to?: string;
  amount_from?: number;
  amount_to?: number;
  is_recurring?: boolean;
  // Academic hierarchy filters
  academic_year_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}
```

---

## Recurrence Pattern

```typescript
type RecurrencePattern = 'monthly' | 'quarterly' | 'yearly';
```

### Recurring Bill Generation

When `is_recurring = true`:
1. System generates bills at the specified pattern
2. `number_of_recurrences` controls total bills
3. Each occurrence creates a new bill record

Example: Monthly mess fees for 6 months
```json
{
  "is_recurring": true,
  "recurrence_pattern": "monthly",
  "number_of_recurrences": 6,
  "unit_amount": 3500
}
```

---

## Balance Calculation

```
balance_amount = final_amount - (sum of receipt_items.amount_paid) - (sum of approved discounts)
```

### Rules
1. `balance_amount` starts equal to `final_amount`
2. Each payment (receipt_item) reduces balance
3. Approved discounts reduce balance
4. When `balance_amount = 0`, status = `'paid'`
5. When `0 < balance_amount < final_amount`, status = `'partially_paid'`

---

## Relationships

### Foreign Keys

| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `students` | `student_id` | Many-to-One |
| `institutions` | `institution_id` | Many-to-One |
| `billing_item_categories` | `item_category_id` | Many-to-One |
| `profiles` | `created_by` | Many-to-One |

### Referenced By

| Table | Via | Description |
|-------|-----|-------------|
| `billing_receipt_items` | `bill_id` | Payment items |
| `billing_discounts` | `bill_id` | Applied discounts |

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/billing/bills` | List bills |
| GET | `/api/api-management/billing/bills/:id` | Get bill by ID |
| POST | `/api/billing/bills` | Create bill |
| POST | `/api/billing/bills/bulk` | Bulk create bills |
| PUT | `/api/billing/bills/:id` | Update bill |
| DELETE | `/api/billing/bills/:id` | Cancel bill |

### Bulk Bill Creation

```typescript
interface BulkBillScheduleDto {
  student_ids: string[];  // Array of student IDs
  bills: Omit<CreateStudentBillDto, 'student_id'>[];  // Bills to create
}

interface BulkOperationResult {
  success: string[];  // Successfully created bill IDs
  failed: {
    id: string;
    error: string;
  }[];
}
```

---

## Sample Data

### Single Bill

```json
{
  "id": "bill-uuid-1",
  "student_id": "student-uuid",
  "institution_id": "inst-uuid",
  "item_category_id": "item-1",
  "bill_description": "CSE 1st Year Sem 1 Tuition",
  "due_date": "2024-08-15",
  "quantity": 1,
  "unit_amount": 50000,
  "total_amount": 50000,
  "tax_amount": 0,
  "final_amount": 50000,
  "status": "partially_paid",
  "balance_amount": 25000,
  "is_recurring": false,
  "student": {
    "id": "student-uuid",
    "first_name": "Rahul",
    "last_name": "Kumar",
    "roll_number": "21CS001",
    "college_email": "rahul@jkkn.ac.in"
  },
  "item_category": {
    "id": "item-1",
    "item_category_name": "CSE 1st Year Sem 1 Tuition",
    "parent_category": {
      "parent_category_name": "Tuition Fees"
    },
    "sub_category": {
      "sub_category_name": "Semester Fees"
    }
  },
  "discounts": [],
  "receipt_items": [
    {
      "id": "ri-1",
      "receipt_id": "receipt-1",
      "bill_id": "bill-uuid-1",
      "amount_paid": 25000
    }
  ]
}
```

### Recurring Bill

```json
{
  "id": "bill-uuid-2",
  "student_id": "student-uuid",
  "institution_id": "inst-uuid",
  "item_category_id": "item-3",
  "bill_description": "Hostel Room Rent - January 2024",
  "due_date": "2024-01-05",
  "quantity": 1,
  "unit_amount": 8000,
  "total_amount": 8000,
  "tax_amount": 0,
  "final_amount": 8000,
  "status": "paid",
  "balance_amount": 0,
  "is_recurring": true,
  "recurrence_pattern": "monthly",
  "number_of_recurrences": 12
}
```

---

## Business Rules

1. **Student Required**: bill must be linked to a valid student
2. **Item Category Required**: must reference valid item category
3. **Balance Tracking**: balance_amount auto-calculated from payments
4. **Overdue Detection**: Cron job marks overdue bills daily
5. **Cancel Restrictions**: Can't cancel paid/partially_paid bills
6. **Discount Limits**: Total discounts can't exceed final_amount

---

## Student Billing Summary

Get comprehensive billing summary for a student:

```typescript
interface StudentBillingSummary {
  student: StudentForBilling;
  bills: StudentBill[];
  receipts: BillingReceipt[];
  discounts: BillingDiscount[];
  refunds: BillingRefund[];
  invoices: BillingInvoice[];
  summary: {
    total_bills: number;
    paid_amount: number;
    outstanding_amount: number;
    overdue_amount: number;
    discount_amount: number;
    refund_amount: number;
  };
}
```

---

## Service Location

- **Service**: `lib/services/billing/schedule/student-bill-service.ts`
- **Search Service**: `lib/services/billing/schedule/student-search-service-optimized.ts`
- **Hook**: `hooks/billing/use-student-bills.ts`
- **Types**: `types/billing-schedule.ts`

---

*Last Updated: December 2024*

# Billing Module - Complete Context

> Comprehensive fee management, payments, invoices, and financial operations

---

## Overview

The Billing module handles all financial operations for educational institutions, including fee management, payment collection, invoicing, discounts, and refunds.

### Key Features
- **3-Level Category Hierarchy**: Parent → Sub → Item categories
- **Student Bills**: Fee scheduling with recurring support
- **Payment Receipts**: Multi-bill payment collection
- **Invoices**: Individual and consolidated invoicing
- **Discounts**: Scholarship and financial aid with approval workflow
- **Refunds**: Refund processing with authorization
- **Reports**: Dashboard analytics and financial reports

### Database Tables

| Table | Description | Key Fields |
|-------|-------------|------------|
| `billing_parent_categories` | Top-level categories | parent_category_name |
| `billing_sub_categories` | Mid-level categories | sub_category_name |
| `billing_item_categories` | Specific fee items | item_category_name, amount, frequency |
| `billing_student_bills` | Student bills | total_amount, balance_amount, status |
| `billing_receipts` | Payment receipts | receipt_number, payment_amount |
| `billing_receipt_items` | Receipt line items | bill_id, amount_paid |
| `billing_invoices` | Invoices | invoice_number, grand_total |
| `billing_invoice_items` | Invoice line items | receipt_id, amount |
| `billing_discounts` | Discounts | discount_type, approval_status |
| `billing_refunds` | Refunds | refund_amount, approval_status |

---

## Billing Hierarchy

```
┌──────────────────────────────────────────────────────────────────┐
│  BILLING PARENT CATEGORY                                          │
│  Example: "Tuition Fees", "Hostel Fees", "Transport Fees"        │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  BILLING SUB CATEGORY                                             │
│  Example: "Semester Fees", "Lab Fees", "Room Rent"               │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  BILLING ITEM CATEGORY                                            │
│  Example: "1st Year Sem 1 Tuition" - ₹50,000 (yearly)           │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  STUDENT BILL                                                     │
│  Assigned to student with due date, status, balance              │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  RECEIPT / INVOICE                                                │
│  Payment collection or invoice generation                        │
└──────────────────────────────────────────────────────────────────┘
```

---

## Billing Flow

### 1. Setup Flow (Admin)
```
┌─────────────────────────────────────────────────────────────────┐
│  1. CREATE PARENT CATEGORIES                                     │
│     - Tuition Fees, Hostel Fees, Transport Fees                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. CREATE SUB CATEGORIES                                        │
│     - Under Tuition: Semester Fees, Lab Fees, Exam Fees         │
│     - Under Hostel: Room Rent, Mess Fees                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. CREATE ITEM CATEGORIES                                       │
│     - Define amounts and frequency                               │
│     - Example: "CSE 1st Year Sem 1" - ₹50,000 (yearly)         │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Bill Assignment Flow
```
┌─────────────────────────────────────────────────────────────────┐
│  1. SELECT STUDENTS                                              │
│     - Filter by institution, department, semester, section      │
│     - Single or bulk selection                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. SELECT ITEM CATEGORY                                         │
│     - Choose fee item from hierarchy                            │
│     - Override amount if needed                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. SET BILL DETAILS                                             │
│     - Due date                                                   │
│     - Quantity (default: 1)                                     │
│     - Tax amount (optional)                                     │
│     - Recurring option with pattern                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. GENERATE BILLS                                               │
│     - Creates billing_student_bills records                     │
│     - Status: unpaid, balance_amount = final_amount             │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Payment Collection Flow
```
┌─────────────────────────────────────────────────────────────────┐
│  1. SEARCH STUDENT                                               │
│     - By name, roll number, or mobile                           │
│     - Shows outstanding balance                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. VIEW PENDING BILLS                                           │
│     - List all unpaid/partially_paid bills                      │
│     - Show due dates and amounts                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. COLLECT PAYMENT                                              │
│     - Select bills to pay                                       │
│     - Enter payment mode and amount                             │
│     - Payment can cover multiple bills (partial/full)           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. GENERATE RECEIPT                                             │
│     - Creates billing_receipts record                           │
│     - Creates billing_receipt_items for each bill               │
│     - Updates bill balance_amount and status                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Status Enums

### Bill Status
| Status | Description |
|--------|-------------|
| `unpaid` | No payment received |
| `partially_paid` | Partial payment, balance remaining |
| `paid` | Fully paid |
| `overdue` | Past due date, unpaid |
| `cancelled` | Bill cancelled |
| `refunded` | Refund processed |

### Payment Mode
| Mode | Description |
|------|-------------|
| `cash` | Cash payment |
| `online` | Online payment gateway |
| `bank_transfer` | Direct bank transfer |
| `dd` | Demand Draft |
| `cheque` | Cheque payment |

### Approval Status
| Status | Description |
|--------|-------------|
| `pending` | Awaiting approval |
| `approved` | Approved by authorizer |
| `rejected` | Rejected |

### Refund Status
| Status | Description |
|--------|-------------|
| `pending` | Awaiting approval |
| `approved` | Approved, awaiting processing |
| `rejected` | Rejected |
| `processed` | Refund completed |

---

## Dashboard Metrics

### BillingDashboardMetrics Interface
```typescript
interface BillingDashboardMetrics {
  total_students: number;
  total_bills: number;
  total_amount_billed: number;
  total_amount_collected: number;
  total_outstanding: number;
  total_overdue: number;
  collection_rate: number;
  recent_transactions: {
    receipts: BillingReceipt[];
    bills: StudentBill[];
    refunds: BillingRefund[];
  };
  monthly_collection: {
    month: string;
    amount: number;
  }[];
  institution_wise_summary: {
    institution_id: string;
    institution_name: string;
    total_bills: number;
    amount_billed: number;
    amount_collected: number;
    outstanding: number;
  }[];
}
```

---

## Permissions

### Permission Keys

| Operation | Permission Key | Description |
|-----------|----------------|-------------|
| View Dashboard | `billing.dashboard.view` | Access billing dashboard |
| View Bills | `billing.bills.view` | View student bills |
| Create Bills | `billing.bills.create` | Create new bills |
| Edit Bills | `billing.bills.edit` | Modify bills |
| Delete Bills | `billing.bills.delete` | Remove bills |
| Collect Payments | `billing.payments.create` | Process payments |
| View Receipts | `billing.receipts.view` | View receipts |
| Create Invoices | `billing.invoices.create` | Generate invoices |
| Apply Discounts | `billing.discounts.create` | Apply discounts |
| Approve Discounts | `billing.discounts.approve` | Approve discounts |
| Process Refunds | `billing.refunds.create` | Process refunds |
| Approve Refunds | `billing.refunds.approve` | Approve refunds |
| View Reports | `billing.reports.view` | Access reports |
| Manage Categories | `billing.categories.manage` | CRUD categories |

---

## API Endpoints Summary

### Categories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/billing/parent-categories` | List parent categories |
| GET | `/api/api-management/billing/sub-categories` | List sub categories |
| GET | `/api/api-management/billing/item-categories` | List item categories |
| POST | `/api/billing/[type]-categories` | Create category |

### Bills
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/billing/bills` | List bills |
| POST | `/api/billing/bills` | Create bill |
| POST | `/api/billing/bills/bulk` | Bulk create bills |

### Receipts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/billing/receipts` | List receipts |
| POST | `/api/billing/receipts` | Create receipt |

### Invoices
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/billing/invoices` | List invoices |
| POST | `/api/billing/invoices` | Create invoice |

### Discounts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/billing/discounts` | List discounts |
| POST | `/api/billing/discounts` | Apply discount |
| PUT | `/api/billing/discounts/:id/approve` | Approve discount |

### Refunds
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/billing/refunds` | List refunds |
| POST | `/api/billing/refunds` | Create refund |
| PUT | `/api/billing/refunds/:id/approve` | Approve refund |

---

## Service Locations

| Service | Path | Lines |
|---------|------|-------|
| Parent Category Service | `lib/services/billing/categories/billing-parent-category-service.ts` | ~200 |
| Sub Category Service | `lib/services/billing/categories/billing-sub-category-service.ts` | ~220 |
| Item Category Service | `lib/services/billing/categories/billing-item-category-service.ts` | ~250 |
| Student Bill Service | `lib/services/billing/schedule/student-bill-service.ts` | ~600 |
| Receipt Service | `lib/services/billing/receipts/billing-receipt-service.ts` | ~500 |
| Invoice Service (Optimized) | `lib/services/billing/invoices/billing-invoice-service-optimized.ts` | ~800 |
| Discount Service | `lib/services/billing/discounts/billing-discount-service.ts` | ~400 |
| Refund Service | `lib/services/billing/refunds/billing-refund-service.ts` | ~450 |
| Report Service | `lib/services/billing/reports/billing-report-service.ts` | ~600 |
| Payment Audit Service | `lib/services/billing/security/payment-audit-service.ts` | ~300 |

---

## Module Files

| Document | Description |
|----------|-------------|
| [categories.md](./categories.md) | Category hierarchy (parent/sub/item) |
| [student-bills.md](./student-bills.md) | Student bill entity and flows |
| [receipts.md](./receipts.md) | Receipt and payment collection |
| [invoices.md](./invoices.md) | Invoice generation |
| [discounts.md](./discounts.md) | Discount with approval workflow |
| [refunds.md](./refunds.md) | Refund processing |

---

*Last Updated: December 2024*

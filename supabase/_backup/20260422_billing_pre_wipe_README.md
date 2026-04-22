## Billing Module Wipe — Pre-Delete Backup

**Date:** 2026-04-22
**Reason:** All billing data (categories, bills, receipts, invoices, payment_transaction_items) was test data. User requested complete wipe to start fresh with new category structure.

**Source DB:** Supabase project (live, via MCP execute_sql)
**Format:** Each `.json` file is a JSONB array dump of one table at the moment of backup.
**Restore approach (if ever needed):** `INSERT INTO <table> SELECT * FROM jsonb_populate_recordset(NULL::<table>, $1::jsonb);`

### Files

| File | Table | Rows |
|---|---|---:|
| `20260422_billing_categories.json` | `public.billing_categories` | 86 |
| `20260422_billing_receipts.json` | `public.billing_receipts` | 20 |
| `20260422_billing_receipt_items.json` | `public.billing_receipt_items` | 20 |
| `20260422_billing_invoices.json` | `public.billing_invoices` | 2 |
| `20260422_billing_invoice_items.json` | `public.billing_invoice_items` | 3 |
| `20260422_payment_transaction_items.json` | `public.payment_transaction_items` (bill-linked rows only) | 20 |
| `20260422_billing_student_bills.json` | `public.billing_student_bills` | 376 (if file exists) |

### What was deleted

Migration: `supabase/migrations/20260422000002_wipe_billing_test_data.sql`

Order (bottom-up by FK):
1. `payment_transaction_items` — auto-cascade from billing_student_bills
2. `billing_invoice_items`
3. `billing_invoices`
4. `billing_receipt_items`
5. `billing_receipts`
6. `billing_student_bills`
7. `billing_categories`

### Empty tables (not backed up — already 0 rows)

- `billing_discounts`
- `billing_refunds`

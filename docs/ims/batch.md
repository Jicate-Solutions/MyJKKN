# Add Batch Stock — Complete Workflow

> **JKKN POS** — Batch Inventory Management
> Last updated: 2026-03-04

---

## What is a Batch?

A **batch** is a specific stock entry with its own cost price, GST rate, expiry date, and supplier. The system uses **FEFO (First Expiry, First Out)** — when a sale is made, the batch with the earliest expiry date is consumed first.

---

## Entry Points — 2 Ways to Start

### A) From the Inventory List (`/inventory`)

```
Inventory List
  └─ Click ⋮ (more options) on any item row
       └─ Select "Add Batch Stock"
            └─ AddBatchModal opens
```

### B) From the Item Detail Page (`/inventory/[id]`)

```
Item Detail / Edit Page
  ├─ Click "Add Batch Stock" button  →  AddBatchModal opens
  └─ Click "View All Batches"        →  BatchesDialog opens
                                           └─ Click "Add Batch" inside
                                                └─ AddBatchModal opens
```

---

## Step 1 — Fill the Add Batch Form

| # | Field | Required | Description |
|---|-------|----------|-------------|
| 1 | **Batch Number** | No | Auto-generated (`XXX-YYYYMMDD-###`) if left blank. Enter a custom number if needed. |
| 2 | **Quantity** | Yes | Number of units being received into stock. |
| 3 | **Cost Price (ex-GST)** | Yes | Purchase cost per unit, before tax. |
| 4 | **GST Rate** | No | Select: 0% / 5% / 12% / 18% / 28%. Defaults to 0%. |
| 5 | **Cost with GST** | Auto | Read-only. Calculated as `Cost Price × (1 + GST Rate / 100)`. |
| 6 | **Stock Entry Date** | Yes | Defaults to today. Cannot be a future date. |
| 7 | **Expiry Date** | No | Leave blank for non-perishable items. Must be a future date. |
| 8 | **Supplier** | No | Choose from the active supplier list. |
| 9 | **Notes** | No | Any remarks, invoice numbers, or batch details. |

**Live summary shown at the bottom of the form:**
```
Quantity:              50 units
Unit Cost (with GST):  ₹118.00
────────────────────────────────
Total Batch Value:     ₹5,900.00
```

---

## Step 2 — Click "Add Batch"

```
User clicks "Add Batch"
  │
  ├─ Form validation (Zod schema)
  │    ├─ Quantity must be > 0
  │    ├─ Cost price must be ≥ 0
  │    ├─ Entry date is required
  │    └─ If batch number is provided, must match allowed format
  │
  ├─ Hook: useBatchActions().addBatch()
  │
  ├─ Service: batchService.addBatch()
  │
  └─ Database RPC: add_item_batch(...)
       ├─ Inserts row into item_batches table
       │    ├─ batch_number generated if not provided
       │    ├─ quantity_available = quantity received
       │    └─ cost_with_gst calculated automatically
       │
       └─ DB trigger fires automatically:
            └─ item.stock += quantity added  (delta-based sync)
```

---

## Step 3 — Result

### On Success
```
✅ Toast: "Batch BTC-20250304-001 added successfully"
          "Added 50 pieces to Paracetamol 500mg"

Modal closes automatically.
Inventory list refreshes — stock column shows updated total.
```

### On Error
```
❌ Toast: "Failed to add batch"
          [Server error message shown here]

Modal stays open. User can fix the issue and retry.
```

---

## Step 4 — View & Manage Batches

```
Inventory List  →  ⋮  →  "View Batches"
Item Detail     →  "View All Batches" button
  │
  └─ BatchesDialog opens
       │
       ├─ Summary cards at top:
       │    ├─ Total Stock (sum of all active batches)
       │    ├─ Active Batches (count)
       │    ├─ Latest Cost (most recent batch cost)
       │    └─ Nearest Expiry (earliest expiry date with alert if < 30 days)
       │
       └─ Three tabs:
            ├─ Available   — batches with stock > 0 (FEFO sorted: earliest expiry first)
            ├─ Expired     — batches where expiry date < today
            └─ All History — every batch ever added for this item
```

**Actions on each batch:**
- **Edit** — update cost price, GST rate, expiry date, or notes
- **Delete** — only allowed if the batch has never been used in a sale

---

## Step 5 — Stock Deduction During a Sale (Automatic)

```
Cashier adds item to cart in POS
  └─ Sale is completed
       └─ DB RPC: deduct_batch_stock_fefo()
            ├─ Finds batches in FEFO order (earliest expiry first)
            ├─ Deducts quantity from the oldest-expiry batch first
            ├─ Spills over to next batch if first batch runs out
            └─ item.stock auto-decremented via trigger
```

---

## Key Rules

| Rule | Detail |
|------|--------|
| **Stock is batch-controlled** | Once batches exist for an item, the stock field in Edit Item is disabled. Only adding/removing batches changes the stock count. |
| **FEFO order** | Sales always consume the batch with the earliest expiry date first. |
| **Delete restriction** | A batch cannot be deleted if it has been linked to any sale. |
| **Business isolation** | All batch data is scoped to your business. No cross-business access. |
| **Auto batch number** | If no custom batch number is entered, the system generates one in the format `{PREFIX}-{YYYYMMDD}-{###}`. |

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    INVENTORY LIST / ITEM DETAIL          │
│                                                         │
│   [Add Batch Stock]  ──────────────────────────────┐    │
│   [View All Batches] ──→ BatchesDialog ──→ [+ Add] ─┘    │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  AddBatchModal  │
                    │  (9-field form) │
                    └────────┬────────┘
                             │ Submit
                             ▼
                    ┌─────────────────┐
                    │  Zod Validation │
                    └────────┬────────┘
                             │ Pass
                             ▼
                    ┌─────────────────┐
                    │ useBatchActions │
                    │    .addBatch()  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  batchService   │
                    │   .addBatch()   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────────────────┐
                    │  DB RPC: add_item_batch()   │
                    │  • Insert into item_batches  │
                    │  • DB trigger: item.stock += │
                    └────────┬────────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Success Toast   │
                    │ Modal closes    │
                    │ List refreshes  │
                    └─────────────────┘
```

---

## Files Reference

| File | Role |
|------|------|
| `components/inventory/add-batch-modal.tsx` | Batch entry form UI |
| `components/inventory/batches-dialog.tsx` | View & manage batches dialog |
| `app/(dashboard)/inventory/page.tsx` | Entry point from inventory list |
| `app/(dashboard)/inventory/[id]/page.tsx` | Entry point from item detail |
| `lib/hooks/use-batches.ts` | React hooks for batch actions |
| `lib/services/batch.service.ts` | Supabase service layer |
| `types/batch.types.ts` | TypeScript types |
| `supabase/migrations/` | DB migrations (add_item_batch RPC, FEFO trigger) |

# Centralized Procurement — Implementation Plan (v1)

> Backbone = your Google Doc **"Purchase & Inventory Workflow"** (the 14-step PR → PO → GRN → three-way-match → inventory-update chain).
> Grounded in the actual codebase (verified by exploration on 2026-07-07).
> **Companion to `PLAN-reconciled-v3.md`** — that plan is the *downstream* half (issuing stock out of the store). This plan is the *upstream* half (buying stock into the store). They compose; §11 reconciles them.

---

## 0. The three decisions that frame everything (confirmed)

1. **Architecture = module-agnostic now, IMS adapter only.** One procurement spine (`procurement_*`) that references items **polymorphically** and delegates inventory posting to a per-domain **adapter**. IMS is the first registered domain. Resource Management (and any future module) plugs in later by registering an adapter — **no schema change**.
2. **Name = Procurement.** New `procurement_*` tables, a new "Procurement" sidebar group. We do **not** call it "POS" — that name is already the point-of-sale engine (`ims_sales`, `payment_method`), and overloading it guarantees confusion.
3. **Deliverable = this plan.** No code yet.

---

## 1. Why this exists — the gap

The codebase has the **right half** of the procurement chain (receiving → inventory) and is missing the **left half** (sourcing → ordering) plus the **link** that makes three-way matching possible.

| PRD step | Codebase today | Verdict |
|---|---|---|
| Vendors | `ims_suppliers` | ✅ reuse (enrich) |
| 1. Purchase Request (restock / new-item + reason) | `ims_indent_requests` is *department→store* issue, not *store→vendor* buy | ❌ build new |
| 2. Requisition + Super Admin approval | indent has a different single-approver flow | ❌ build new |
| 3. Purchase Requirement List (PDF) | PDF libs installed, unused in IMS | ❌ build new |
| 4–6. Quotations, upload, comparison | nothing | ❌ build new |
| 7. Purchase Order (per-vendor, approve, PDF) | nothing — **keystone gap** | ❌ build new |
| 8. GRN + invoice upload | `ims_goods_received_notes` exists but **has no `purchase_order_id`**, and no file upload | ⚠️ rebuild module-agnostic |
| 9. Three-way match (PO vs invoice vs received) | impossible — GRN lines have only `quantity, cost_price, batch, expiry` | ❌ build new |
| 10–11. Qty mismatch, quality inspection, replacement | no `accepted/rejected/received` split, no replacement | ❌ build new |
| 12. Chemical validation (batch/expiry mandatory) | batch/expiry columns exist but nullable; no `is_chemical` flag | ⚠️ enforce |
| 13. Inventory update (batch-wise) | `ims_stock_batches` + `ims_stock_summary` + posting in `ImsGRNService` | ✅ reuse via adapter |
| 14. GRN status lifecycle + PO auto-close | GRN enum differs; no PO to close | ❌ build new |

**One-line summary:** build the sourcing spine (Request → Requisition → Quotation → Comparison → **PO**), then a **PO-linked GRN** that reuses the existing IMS stock-posting logic through an adapter.

---

## 2. The architecture — a module-agnostic procurement spine

```
                         ┌─────────────────────────────────────────────┐
                         │  PROCUREMENT SPINE (procurement_* tables)     │
                         │  vendors · PR · RFQ · quotations · PO · GRN   │
                         │  three-way-match · approvals · numbering      │
                         └───────────────────────┬─────────────────────┘
                                                 │  references items by
                                                 │  { domain, domain_item_id, snapshot }
                                                 │  posts accepted qty via adapter
                         ┌───────────────────────┴─────────────────────┐
                         │            DOMAIN ADAPTER REGISTRY            │
                         │  adapters[domain] → { searchItems, getItem,  │
                         │      postReceipt, reconcileNewItem }         │
                         └──────┬───────────────────────────┬──────────┘
                                │ 'ims' (build now)          │ 'resource_mgmt' (later)
                    ┌───────────┴──────────┐      ┌──────────┴───────────┐
                    │ ims_items / catalog  │      │ RM catalog           │
                    │ ims_stock_batches    │      │ RM inventory         │
                    │ ims_stock_summary    │      │                      │
                    └──────────────────────┘      └──────────────────────┘
```

**The polymorphic seam (this is what makes it centralized):**

- Every item-bearing procurement row references an item as **`domain` (`'ims'|'resource_mgmt'|…`) + `domain_item_id` (uuid, nullable) + a denormalized snapshot** (`item_name`, `item_spec`, `unit_label`, `hsn_code`). Procurement never joins to `ims_items` directly.
- **`domain_item_id = NULL`** elegantly *is* the PRD's "New Item Request" — an item that exists in no catalog yet, carried purely by its snapshot until it's created on approval.
- **Inventory posting is delegated**, not hard-coded. When a GRN line is accepted, the spine calls `adapters[domain].postReceipt(...)`. The IMS adapter runs the *existing* batch-insert + stock-summary + financial-txn path (reused from `ImsGRNService`). The RM adapter is registered later.

**The adapter interface** (the reusability contract — see §9 for why this is the one place your domain input matters most):

```ts
// lib/services/procurement/domain-adapters/types.ts
export interface ProcurementDomainAdapter {
  domain: string;
  // build a PR/PO from an existing catalog
  searchItems(query: string, ctx: DomainCtx): Promise<CatalogItem[]>;
  getItem(id: string, ctx: DomainCtx): Promise<CatalogItem | null>;
  // post accepted goods into this domain's inventory (batch/expiry/cost/store)
  postReceipt(line: AcceptedReceiptLine, ctx: DomainCtx): Promise<void>;
  // materialize a new-item PR into the domain catalog after approval (optional)
  reconcileNewItem?(snapshot: ItemSnapshot, ctx: DomainCtx): Promise<string /* new domain_item_id */>;
}
```

---

## 3. Data model (`procurement_*`)

> RLS convention: **new procurement tables gate money-adjacent value → real RLS**, not the `USING(true)` convention the `ims_*` tables use. Standard predicate:
> `institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()) OR get_current_user_role() = 'super_admin'`

### Extend existing
- `ims_suppliers` → add `payment_terms TEXT`, `rating NUMERIC(2,1)`, `bank_details JSONB`, `lead_time_days INT`. (Vendors are inherently cross-domain; reuse this as the shared vendor master rather than forking `procurement_vendors`. See OPEN-1.)
- `ims_item_categories` → add `is_chemical BOOLEAN DEFAULT false`. (Optional per-item override `ims_items.is_chemical`.) Drives step-12 enforcement.

### 3.1 Purchase Request (steps 1–2)
- `procurement_purchase_requests` — `id, institution_id, request_number(unique), domain, request_type('restock'|'new_item'), status('draft'|'submitted'|'approved'|'rejected'|'converted'|'cancelled'), requested_by, submitted_at, approved_by, approved_at, rejection_reason, notes, +audit`.
  - **PR and "Requisition" are one entity, not two.** The doc's "Purchase Requisition" is the PR *after Store Admin submits it* (`draft → submitted`); Super Admin then `approved`/`rejected`. Modeling them as two tables would overload one lifecycle across two rows — the same trap as reusing indents for purchasing.
- `procurement_purchase_request_items` — `id, request_id, domain_item_id(nullable), item_name, item_spec, required_quantity, unit_id, reason(mandatory when request_type='new_item'), current_stock(snapshot), reorder_level(snapshot), estimated_cost`.

### 3.2 RFQ + Requirement List (steps 3–5)
- `procurement_rfqs` — `id, institution_id, rfq_number, source_request_id(FK), status('draft'|'sent'|'quotations_received'|'compared'|'awarded'|'closed'), requirement_pdf_url, created_by, sent_at, +audit`. (The "Purchase Requirement List" PDF is generated from this RFQ.)
- `procurement_rfq_items` — `rfq_id, request_item_id, item_name, item_spec, quantity, unit_id`.
- `procurement_rfq_vendors` — `rfq_id, supplier_id, sent_at, sent_email`. (Which vendors received the requirement list.)
- `procurement_quotations` — `id, rfq_id, supplier_id, vendor_quote_number, quote_date, validity_date, payment_terms, delivery_time_days, total_amount, document_url(uploaded → Google Drive), status, notes, +audit`.
- `procurement_quotation_items` — `id, quotation_id, rfq_item_id, unit_price, quantity, delivery_time_days, remarks, awarded BOOLEAN DEFAULT false`. (Per-line `awarded` flag lets **different items go to different vendors** — step 6.)

### 3.3 Purchase Order (step 7)
- `procurement_purchase_orders` — `id, institution_id, po_number(unique), supplier_id, rfq_id(nullable), domain, status('draft'|'pending_approval'|'approved'|'rejected'|'sent'|'partially_received'|'completed'|'closed'|'cancelled'), subtotal, tax_amount, total_amount, payment_terms, expected_delivery_date, approved_by, approved_at, rejection_reason, pdf_url, created_by, notes, +audit`. **One PO per vendor** (grouped at generation from awarded quotation lines).
- `procurement_purchase_order_items` — `id, po_id, domain_item_id(nullable), item_name, item_spec, ordered_quantity, unit_id, unit_price, taxable_amount, cgst/sgst/igst(percent+amount), line_total, received_quantity(running, default 0), source_quotation_item_id(traceability)`. (GST shape mirrors the existing `ims_grn_items` GST columns.)

### 3.4 GRN — PO-linked, three-way-match-capable (steps 8–14)
- `procurement_grn` — `id, institution_id, grn_number, purchase_order_id(FK), supplier_id, invoice_number, invoice_date, invoice_amount, invoice_document_url(uploaded → Drive), status('draft'|'pending_verification'|'partially_accepted'|'replacement_requested'|'accepted'|'completed'), received_by, verified_by, verified_at, notes, +audit`. **Multiple GRNs per PO** → partial delivery.
- `procurement_grn_items` — `id, grn_id, po_item_id(FK → ordered qty), domain_item_id(nullable), item_name, ordered_quantity(snapshot), invoice_quantity, received_quantity, accepted_quantity, rejected_quantity, mismatch_flag BOOLEAN, mismatch_remarks, replacement_required BOOLEAN, rejection_reason, match_status('matched'|'qty_mismatch'|'price_mismatch'|'short'|'over'), batch_number, expiry_date, manufacturing_date, cost_price, is_chemical(snapshot)`.
- `procurement_grn_replacements` — `id, grn_item_id, rejected_quantity, reason, status('pending'|'received'), replacement_grn_item_id(nullable)`. (Rejected qty is **not** added to inventory until replacement arrives via a later GRN.)

### 3.5 Numbering
- `procurement_number_counters` — keyed by `(institution_id, doc_type ∈ 'PR'|'RFQ'|'PO'|'GRN')`, with an atomic increment RPC. Reuse the exact pattern in `supabase/migrations/20260226_add_ims_grn_indent_number_rpcs.sql`.

---

## 4. The three-way match engine (the heart — step 9)

A pure-logic module `lib/services/procurement/three-way-match.ts`, called on GRN verify. For each GRN line it reconciles three numbers:

| Source | Field |
|---|---|
| **Ordered** (PO) | `po_item.ordered_quantity` minus already-received across prior GRNs |
| **Invoiced** (supplier) | `grn_item.invoice_quantity` |
| **Received** (physical) | `grn_item.received_quantity` → split into `accepted_quantity` + `rejected_quantity` |

Derived outcomes:
- **Partial delivery** — `Σ received < ordered` → PO stays `partially_received`; remaining = `ordered − Σ received`.
- **Quantity mismatch (step 10)** — `invoice_quantity ≠ received_quantity` → `mismatch_flag=true`, record the difference + remarks; stays visible until resolved.
- **Quality/replacement (step 11)** — `rejected_quantity > 0` or `replacement_required` → rejected qty **excluded from inventory**; a `procurement_grn_replacements` row tracks it.
- **Chemical validation (step 12)** — if `is_chemical`, verify is **blocked** until `batch_number` + `expiry_date` present (`manufacturing_date` optional). Enforced in service + a DB CHECK/trigger.
- **On verify** — `accepted_quantity` posted to inventory via `adapters[domain].postReceipt(...)`; `po_item.received_quantity += accepted`.
- **PO auto-close (steps 13–14)** — PO → `completed`/`closed` only when: every line `Σ received ≥ ordered` **AND** no `pending` replacements **AND** all GRNs verified.

> The exact **tolerance policy** (exact match vs. allow N% over/under, how over-delivery is handled) is a business rule — flagged as a contribution point in §9.

---

## 5. Request → PO flow (how the spine sequences)

```
Purchase Request (restock | new_item, reason mandatory for new_item)
  └─ draft ──[Store Admin submits]──▶ submitted  (= "Requisition")
       └─[Super Admin]──▶ approved | rejected(remarks)
             └─ approved ──▶ RFQ generated ──▶ Requirement List PDF ──▶ emailed to N vendors
                   └─ vendors quote ──▶ upload quotations (PDF/Excel/img → Drive)
                         └─ item-wise comparison ──▶ award per line (mix vendors OK)
                               └─ generate ONE PO per awarded vendor
                                     └─[Super Admin]──▶ approve each PO ──▶ PO PDF ──▶ send to vendor
                                           └─ goods delivered ──▶ GRN + invoice upload
                                                 └─ three-way match (§4) ──▶ inventory post (IMS adapter)
                                                       └─ PO auto-close when fully received & verified
```

---

## 6. Service layer (`lib/services/procurement/`)

Match the existing IMS convention (static-method service classes under `lib/services/ims/`).

- `purchase-request-service.ts` — CRUD, submit, approve, reject, convertToRfq, new-item reconcile.
- `rfq-service.ts` — create-from-PR, add vendors, generate requirement-list PDF, mark sent.
- `quotation-service.ts` — upload (→ Drive), CRUD, comparison matrix, award-per-line.
- `purchase-order-service.ts` — generate-per-vendor-from-awards, approve, reject, PO PDF, send, status transitions.
- `grn-service.ts` — create against PO, invoice upload, verify (runs three-way match), replacement handling, status lifecycle.
- `three-way-match.ts` — pure reconciliation logic (§4).
- `procurement-number-service.ts` — wraps the counter RPC.
- `domain-adapters/` — `types.ts` (interface), `ims-adapter.ts` (wraps `ImsInventoryService` + reuses `ImsGRNService` posting), `registry.ts` (`getAdapter(domain)`).

**Reuse, don't rebuild:** the IMS adapter's `postReceipt` calls the same batch-insert + `ims_stock_summary` update + `ims_financial_transactions` (`purchase`) write that `ImsGRNService.approveGRN` already performs.

---

## 7. Routes, hooks, permissions

**Routes** `app/(routes)/procurement/`: `dashboard`, `requests` (+`new`,`[id]`), `rfqs` (+`[id]`), `quotations` (+`[id]` compare), `purchase-orders` (+`new`,`[id]`), `grn` (+`new`,`[id]` three-way UI), `approvals` (Super Admin inbox: PR + PO), `vendors` (or reuse `ims/settings/suppliers` enriched).

**API** `app/api/procurement/`: `quotations/upload`, `grn/[id]/invoice-upload` (both → Google Drive via `lib/google/drive-upload.ts`), `rfqs/[id]/requirement-pdf`, `purchase-orders/[id]/pdf` (PDF via installed `@react-pdf/renderer` / `jspdf-autotable`).

**Hooks** `hooks/procurement/`: `use-purchase-requests`, `use-rfqs`, `use-quotations`, `use-purchase-orders`, `use-procurement-grn`, `use-procurement-approvals`.

**Permissions** `lib/constants/permissions.ts` → `procurement.*`: `request_create, request_approve, rfq_manage, quotation_manage, po_create, po_approve, grn_create, grn_verify, vendor_manage`. **Wire every sidebar row to `MENU_PERMISSIONS[href]`** — guards the inline-submenu permission leak hit before (`menu.tsx`).

---

## 8. Phasing

| Phase | Deliverable | Depends on |
|---|---|---|
| **0 · Foundation** | permissions + sidebar group; `procurement_number_counters` + RPC; adapter interface + IMS adapter skeleton; vendor enrichment; `is_chemical` flag; RLS convention | — |
| **1 · Sourcing** | PR (+items) table/service/routes; submit→approve; new-item handling; RFQ + requirement-list PDF | 0 |
| **2 · Quotations** | quotation tables; upload → Drive; item-wise comparison; per-line award | 1 |
| **3 · Purchase Orders** | PO tables/service/routes; generate-per-vendor; approve; PO PDF; send | 2 |
| **4 · Receiving + 3-way match** | `procurement_grn` tables; three-way-match engine; partial delivery; qty-mismatch; quality/replacement; chemical validation; inventory post via IMS adapter; PO auto-close; GRN lifecycle | 3 |
| **5 · Reuse proof** | register Resource Management adapter to validate the seam (design/later) | 4 |

---

## 9. Where your domain input actually shapes the design (learning-mode contribution points)

These are the 4 decisions where the codebase has no "right default" and your business knowledge changes behavior. I'll hand each to you as a focused 5–10 line contribution during implementation:

1. **The adapter `postReceipt`/`searchItems` contract** — *the* reusability seam. Its exact shape decides how cleanly Resource Management (and everything after) plugs in.
2. **Three-way-match tolerance policy** — exact match, or allow N% over/under? How is over-delivery treated (reject / accept-and-flag / cap at ordered)?
3. **Chemical enforcement strictness** — hard-block verify vs. warn; which fields mandatory (batch + expiry confirmed; manufacturing date?).
4. **PO auto-close conditions** — the precise predicate for "fully received & verified, no pending replacements."

---

## 10. Migrations (planned)

1. `procurement_number_counters` + increment RPC.
2. `ims_suppliers` enrichment (payment_terms, rating, bank_details, lead_time_days).
3. `ims_item_categories.is_chemical` (+ optional `ims_items.is_chemical`).
4. `procurement_purchase_requests` + `_items` + RLS.
5. `procurement_rfqs` + `_items` + `_vendors` + RLS.
6. `procurement_quotations` + `_items` + RLS.
7. `procurement_purchase_orders` + `_items` + RLS.
8. `procurement_grn` + `_items` + `_replacements` + RLS.
9. Triggers/CHECKs: PO auto-close, three-way-match status, chemical validation.

---

## 11. Reconciliation with `PLAN-reconciled-v3.md`

Procurement = **inflow**; Central Office / Main Store (v3) = **outflow**. They share four touch-points and must not clobber each other:

| Shared object | v3 (outflow) does | Procurement (inflow) does | Conflict? |
|---|---|---|---|
| `ims_item_categories` | adds `audience` enum | adds `is_chemical` bool | ✅ different columns |
| `ims_suppliers` | — | enriches (payment terms, rating…) | ✅ additive |
| `ims_stock_batches` | issues **out of** (Path A/B/C) | posts **into** (via IMS adapter) | ✅ opposite directions, same table |
| `ims_stores.is_main_store` | v3 introduces | procurement targets it | ✅ reuse v3's column |
| New-table RLS convention | real RLS (not `USING(true)`) | same | ✅ consistent |

Procurement gets its **own** sidebar group, separate from v3's "Central Office." The two approval styles stay separated: v3's staff path uses a rank-chain; procurement uses the doc's simple two-level (Store Admin submit → Super Admin approve).

---

## 12. Open decisions (flagged, not silently resolved)

- **OPEN-1 · Vendor master** — enrich `ims_suppliers` as the shared cross-domain vendor master (**recommended**, avoids a data migration + parallel table) vs. a fresh `procurement_vendors`.
- **OPEN-2 · Legacy `ims_goods_received_notes`** — `procurement_grn` is the go-forward, PO-linked receiving path. Keep the legacy table for ad-hoc direct (no-PO) receipts, or migrate everything to `procurement_grn`? (**Recommend:** keep legacy short-term, plan migration — avoids two GRN engines confusing users, a risk v3 also flags.)
- **OPEN-3 · Document storage** — Google Drive (**recommended**, matches project preference, saves Supabase quota) vs. a Supabase bucket like `ims-receipts`.
- **OPEN-4 · PR vs Requisition modeling** — one entity with statuses (**recommended**) vs. two tables.
- **OPEN-5 · Approval depth** — the doc's static two-level (**recommended, per PRD**) vs. configurable chains (explicitly out of scope in v3).

---

## 13. Verification (end-to-end, when built)

- Build/lint pass; Procurement menu rows hide without permission.
- New-item PR requires `reason`; restock PR pre-fills from reorder-level data.
- Requisition submit → Super Admin approve/reject (reason on reject) sequences correctly.
- Requirement-List PDF generates from approved PR; emails to multiple vendors.
- Quotation upload lands in Drive; comparison matrix is item-wise; award mixes vendors across lines.
- One PO per awarded vendor; Super Admin approves each; PO PDF generates.
- **Partial-delivery scenario from the PRD:** PO=15 → GRN#1 (inv#001, 10/10) → PO `partially_received`, remaining 5 → GRN#2 (inv#002, 5/5) → PO `completed`.
- **Qty mismatch:** invoice 20 / received 18 → mismatch flagged, difference recorded, stays visible.
- **Quality:** rejected qty excluded from inventory; replacement tracked; arrives via later GRN.
- **Chemical:** verify blocked until batch + expiry entered.
- Accepted qty posts to `ims_stock_batches` + `ims_stock_summary` + `ims_financial_transactions` via the IMS adapter; PO auto-closes only when fully received & verified.
- **Reuse proof:** a stub Resource Management adapter can be registered without touching any `procurement_*` schema.
```

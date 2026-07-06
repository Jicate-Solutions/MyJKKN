# Admission Billing Workflow

> **Scope:** End-to-end flow from a qualified admission lead to a paid admission bill, applicable to **any institution** (Aided / Self-financing CAS siblings, engineering, arts, schools).
> **Status:** Design/flow reference. The flow below is assembled from infrastructure that **already exists** in MyJKKN — this document maps the seam where the *admission* module hands off to the *billing* module, it does not propose a new stack.
> **Last updated:** 2026-06-24

---

## 1. Purpose

Admission billing is the bridge between **lead acquisition** (admission CRM) and **money collected** (billing + payment gateway). A prospect becomes a learner only when:

1. The correct fee structure for **their** institution / programme / quota / community is resolved, and
2. Bills are atomically generated at the moment of admission, and
3. Payment is collected and a receipt (and optionally an invoice) is issued.

The design goal is **institution-agnostic**: the same flow serves every institution by resolving the fee matrix per-institution rather than hardcoding amounts. CAS colleges (Aided + Self-financing sharing one `counselling_code`) are handled by the existing institution-resolution pattern — resolve sibling institution UUIDs via `counselling_code` (never `id ===`), and adapt UI labels via `lib/utils/school-label-adapter.ts`.

---

## 2. Actors

| Actor | Role in the flow |
|-------|------------------|
| **Counselor / Admission staff** | Qualifies the lead, fills matrix dimensions, applies adjustments, confirms admission |
| **Admission admin / Principal** | Approves account transition (document verification), authorises fee waivers |
| **Learner / Parent** | Pays the generated bill via the portal (self-service or parent portal) |
| **System (RPCs + PaymentGatewayService)** | Resolves fees, generates bills atomically, verifies payments, issues receipts |

---

## 3. The Pipeline (high level)

```
 LEAD                 RESOLVE              CONFIRM / ADMIT          PAY                  RECEIPT
 ────                 ───────              ───────────────          ───                 ───────
 admission_leads ──▶  resolve fee    ──▶  account transition  ──▶  payment gateway ──▶ receipt + invoice
 (qualified)          items (matrix)      + bills generated        (HDFC / Razorpay)   (PDF, audit)
```

Each arrow is an existing, named capability. The sections below detail each stage with the exact service / RPC / table involved.

---

## 4. Stage-by-stage flow

### Stage 0 — Lead is qualified (precondition)

- A row exists in `admission_leads` with status in the **lead** scope (`admission-status-service.ts`, `AdmissionStatusScope = 'lead'`).
- Matrix dimensions are captured on the lead during counselling: `institution_id`, `degree_id`, `department_id`, `programme_id`, `quota_id`, `community_category_id`, `admission_year_id`.
- **Institution note:** `institution_id` is the dimension that makes this flow multi-institution. For CAS colleges, resolve the sibling set via `counselling_code` before matching (Aided and Self-financing are distinct UUIDs sharing one code).

### Stage 1 — Resolve the applicable fee structure

**Service:** `lib/services/admission/fee-resolution-service.ts`
**RPC:** `admission_resolve_fee_items_for_lead(p_learner_id)`

```
previewMatchByDimensions(dims)      // pure read — no-match UI preview before save
        │
        ▼
resolveForLearner(learnerId)        // calls RPC, persists fee_items on the learner
        │
        ▼
adoptStructureForLead(learnerId)    // legacy rows: flip legacy_fee_mode=false + resolve, atomic
```

- The RPC performs an **8-dimension lookup** against `admission_fee_structures` + `admission_fee_structure_items` (junction `admission_fee_structure_communities` keyed by community).
- Fee item **applicability rules** decide which items apply this year: `first_year_only`, `every_year`, `specific_year` (`feeItemAppliesToYear()` in `fee-structure-bulk-lookups.ts`).
- **Adjustments / waivers** (`fee-adjustment-service.ts`) are layered on top; every change is recorded by `fee-change-event-service.ts` for audit.
- Output: `fee_items[]` persisted on the learner, with `total`. A no-match returns an empty set → the UI shows a "Fees Setup Pending" state rather than admitting with zero fees.

> **Guard:** dimensions are UUID-validated before reaching Postgres (`isValidDimensions`) to avoid `22P02 invalid_input_syntax_for_type_uuid` from transient form state.

### Stage 2 — Confirm & admit (atomic transition → bills)

**Service:** `lib/services/admission/account-transition-service.ts`
**RPC:** `admission_account_transition_with_bills(p_learner_id, p_required_documents, p_received_documents, p_idempotency_key, p_notes)`

This is the **hinge of the whole workflow**. In one SECURITY DEFINER transaction it:

1. Verifies required vs. received documents.
2. Flips the lead → learner (status scope `lead` → `learner`).
3. **Generates `billing_student_bills`** from the resolved `fee_items` — returns `bills_generated`.

```
AccountVerificationDialog
        │  (generates idempotency_key client-side — double-click safe)
        ▼
AccountTransitionService.transitionToAccount({
  learner_id, required_documents, received_documents,
  idempotency_key, notes
})
        │
        ▼
RPC  ── atomic ──▶  learner promoted  +  billing_student_bills rows created
        │
        ▼
Activity logs emitted from CALLER's session (honest audit: names the admin, not the RPC owner)
   • lifecycle.account_transition
   • documents.received (per doc)
   • bill.auto_generated (count)
```

- **Idempotency:** rapid double-clicks pass the same `idempotency_key`; the RPC returns the stored result instead of generating duplicate bills.
- **Audit honesty:** the activity logs fire *outside* the DEFINER context, so the trail records the real actor.

### Stage 3 — Collect payment

**Service:** `lib/services/billing/payment-gateway-service.ts` (dual provider: HDFC SmartGateway primary, Razorpay secondary)
**API:** `app/api/billing/payment/initiate` → `app/api/billing/payment/callback` → `app/api/billing/payment/status`

```
Learner / Parent portal  ──▶  POST /api/billing/payment/initiate
   (learners/my-bills or          │   PaymentGatewayService.createPaymentSession({ bill_ids, ... })
    parent/fees/pay)              ▼
                            payment_transactions row (status=initiated, provider, bill_ids[])
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                                ▼
         HDFC payment page                 Razorpay hosted checkout
                  │                                │
                  └───────────────┬───────────────┘
                                  ▼
                     POST /api/billing/payment/callback
                                  │
                                  ▼
        verifyPaymentWithGateway()  ── server-side, anti-tamper (HDFC Order Status / Razorpay dual-inquiry)
                                  │
                                  ▼
        processVerifiedPayment()  ──▶  bill balance updated, status → success
```

- **Provider routing:** `lib/services/payments/factory.ts` selects provider via `BILLING_PAYMENT_PROVIDER`, institution-level overrides, and fee-head routing (multi-account Razorpay). This is where **per-institution** payment accounts plug in — each institution can route to its own MID / Razorpay account.
- **Security:** `payment-audit-service.ts` logs signature failures, amount mismatches, replay attempts. Verification is **server-side only** — client-reported status is never trusted.

### Stage 4 — Issue receipt (and optionally invoice)

**Services:** `billing-receipt-service.ts`, `billing-invoice-service.ts`
**PDF:** `lib/utils/billing/receipt-pdf.ts` (jsPDF + autotable)

```
processVerifiedPayment success
        │
        ▼
BillingReceiptService.createBillingReceipt()   // receipt_number via DB RPC
        │
        ▼
receipt_pdf.generateReceiptPdf(receipt)        // A4 PDF, "Rs." formatting
        │
        ▼ (when bill fully paid)
BillingInvoiceService.createBillingInvoice()   // invoice_number via DB RPC
```

- Receipt links back to bills via `billing_receipt_items`; invoice links via `billing_invoice_items`.
- Learner sees the paid bill + receipt under `app/(routes)/learners/my-bills`; parents under `app/api/parent/fees`.

---

## 5. Data model touchpoints

| Layer | Table | Role |
|-------|-------|------|
| Fee config | `admission_fee_structures` / `_items` / `_communities` | Per-institution fee matrix (8 dims) |
| Adjustments | `admission_fee_adjustments`, `admission_fee_change_events` | Waivers + audit trail |
| Bills | `billing_student_bills` | Generated atomically at admission |
| Payment | `payment_transactions` / `payment_transaction_items` | Online payment session (HDFC + Razorpay unified) |
| Receipt | `billing_receipts` / `billing_receipt_items` | Issued post-payment |
| Invoice | `billing_invoices` / `billing_invoice_items` | Issued when bill fully paid |

---

## 6. Key RPCs (the spine)

| RPC | Stage | Effect |
|-----|-------|--------|
| `admission_resolve_fee_items_for_lead` | 1 | Match 8-dim matrix, persist `fee_items` |
| `admission_adopt_structure_for_lead` | 1 | Legacy migration: flip `legacy_fee_mode` + resolve |
| `admission_account_transition_with_bills` | 2 | Atomic lead→learner + generate bills (idempotent) |

All three are SECURITY DEFINER; permission is enforced inside (`admission_fees.manage_adjustments`, etc.) and audit logs are emitted from the caller's session.

---

## 7. Institution-agnostic checklist

When extending this flow to a new institution, **no code change** should be needed if:

- [ ] An `admission_fee_structures` row set exists covering the institution's degree/department/programme/quota/community combinations.
- [ ] For CAS colleges, fee structures exist for **both** sibling UUIDs (Aided + Self-financing) — resolve via `counselling_code`, never `id ===`.
- [ ] A payment account (HDFC MID or Razorpay account) is mapped for the institution in the provider factory config.
- [ ] Billing categories (`billing_categories.kind`) include the relevant fee heads (`application_fee`, `tuition`, etc.).
- [ ] Labels adapt for schools vs. colleges via `school-label-adapter.ts` ("Programme" → "Class", etc.).

If any box is unchecked, the flow **fails safe**: fee resolution returns a no-match and the learner lands in "Fees Setup Pending" instead of being admitted with wrong/zero fees.

---

## 8. Failure & edge handling

| Situation | Behaviour |
|-----------|-----------|
| No matching fee structure | Empty `fee_items` → "Fees Setup Pending" tab; learner not billed incorrectly |
| Double-click on Confirm | `idempotency_key` dedupes; one set of bills |
| Payment amount tampered | `processVerifiedPayment` rejects via server-side gateway verification; `payment-audit-service` logs it |
| Legacy admitted learner (pre-matrix) | `adoptStructureForLead` migrates them onto the matrix atomically |
| CAS sibling fee gap | Resolve `counselling_code` sibling set before matching (see CAS memory notes) |

---

## 9. Open questions / decisions to confirm

These determine whether any *new* code is required beyond wiring the existing pieces:

1. **Application fee before admission?** — Do you need a pre-admission *application fee* collected at the lead stage (before account transition), or does billing only begin at admission (Stage 2)? Current infra bills at Stage 2; a pre-admission fee needs a small `module='admission'` branch in the payment callback router.
2. **Instalments / fee plans?** — Are admission bills paid in full, or split into a schedule? `billing/schedule/students` exists; confirm whether admission bills feed it.
3. **Consultant commission trigger** — Should a successful admission payment fire `consultant-commission-trigger-service.ts`? (Referral partners.)
4. **Receipt vs. invoice policy** — Always issue both, or invoice only on full payment? (Stage 4 currently: receipt always, invoice on full payment.)

---

## 10. Summary

Admission billing in MyJKKN is **already a composable pipeline** of existing services, not a feature to build from scratch:

```
resolve (matrix) → confirm (atomic transition + bills) → pay (gateway) → receipt/invoice
```

The only institution-specific inputs are **data** (fee structures + payment account mapping), not code — which is exactly what makes the flow reusable across every institution.

# Admission Billing — Page-by-Page Reference

> **Companion to:** [admission-billing-workflow.md](./admission-billing-workflow.md) (the conceptual flow).
> **This document:** every page in the workflow, in money-flow order, with **two views per page** — an **End-User Reference** (what you see and do) and a **Technical Reference** (files, components, APIs, services, hooks, permissions, tables).
> **Audience models** appear on each page: 🧑‍💼 **Staff** (Supabase session + permission key) · 🎓 **Learner** (self-service, RLS-scoped) · 👪 **Parent** (parent JWT + service-role).
> **Last updated:** 2026-06-24

---

## Map of the journey

```
 CONFIGURE                ADMIT (generate bills)         COLLECT (pay)                SETTLE (receipt/invoice)
 ─────────                ──────────────────────         ─────────────                ───────────────────────
 1. Fee Structure   ┐     3. Enquiry → Finance tab  ┐    6. My Bills (learner)   ┐    9.  Receipts list/detail
 2. Fee Adjustments ┘     4. Account Verification    │    7. Parent Fees (parent) │    10. Invoices list/detail
                          5. Fees Setup Pending tab  ┘    8. Payment pages        ┘    11. Discounts / 12. Refunds
```

Pages 1–5 are **admission-side** (`/learners/enquiries`, `/admission/settings`). Pages 6–12 are **billing-side** (`/billing`, parent portal).

---

# Part A — Configure (admission settings)

## 1. Fee Structure

**Route:** `/admission/settings/fees-structure`
**File:** `app/(routes)/admission/settings/fees-structure/page.tsx`
**Audience:** 🧑‍💼 Staff

### End-User Reference
Where an admission admin defines **what fees apply to whom**. The matrix answers "for institution X, degree Y, department, programme, quota, community — these are the fee heads and amounts."

You can:
- **Search & filter** existing structures by institution, degree, department, programme, admission year, quota, community.
- **New** — create a structure: pick the 7 cascading dimensions, then add line items (billing category + amount).
- **Download Template** — blank Excel for bulk entry.
- **Export for Edit** — pull current structures to Excel, edit, re-import.
- **Import** — bulk-load structures from the template.
- **Bulk Delete** — remove selected structures.
- Click a row → detail/edit page.

**Institution note:** create structures for *every* institution you bill. For CAS colleges, create them for **both** the Aided and Self-financing sibling — they're separate UUIDs sharing one `counselling_code`.

### Technical Reference
| | |
|---|---|
| Components | `FeeStructuresListView` (DataTable, URL-state), `FeeStructureStats`, `FeeStructuresDimensionSelector` (7-level cascade), `FeesStructureForm` |
| API | `app/api/admission/fees-structure/export`, `/import`, `/template` |
| Service | `lib/services/admission/fee-structure-service.ts` (`listAllPaginated`, `findByDimensions`) |
| Tables | `admission_fee_structures`, `admission_fee_structure_items`, `admission_fee_structure_communities` |
| Permissions | `admission.settings:view` (list), `admission_fees:manage` / `admission_fees:delete` (edit/delete) |
| Applicability | line items carry `first_year_only` / `every_year` / `specific_year` (resolved by `feeItemAppliesToYear()`) |

---

## 2. Fee Adjustments / Waivers

**Location:** rendered **inside the enquiry Finance tab** (not a standalone page) — see page 3.
**Panel:** `app/(routes)/learners/enquiries/_components/form-sections/_fee/fee-adjustments-panel.tsx`
**Dialog:** `…/_fee/adjustment-dialog.tsx`
**Audience:** 🧑‍💼 Staff (with adjustment permission)

### End-User Reference
Per-learner exceptions to the matrix fee: scholarships, donor seats, sibling rebates, management waivers, concessions, staff-ward, hardship.

You can:
- See a table of current adjustments (Category | Reason | Delta | Edit/Delete).
- **Add Adjustment** → pick a **Reason** (enum), enter a **Delta Amount** (₹; negative = discount, positive = surcharge, never zero), optionally bind to a **Billing Category** (immutable after save), add **Notes** and **Evidence** URLs.
- Edit / delete existing adjustments.

Every add/edit/delete **recomputes** the learner's fee total immediately.

### Technical Reference
| | |
|---|---|
| Components | `FeeAdjustmentsPanel`, `AdjustmentDialog` |
| Service | `lib/services/admission/fee-adjustment-service.ts` (`listForLearner`, `create`, `update`, `remove`, `resolveAndPersist`) |
| Recompute | calls RPC `admission_resolve_fee_items_for_lead` after every mutation |
| Tables | `admission_fee_adjustments`, audit in `admission_fee_change_events` |
| Permission | `admission_fees:manage_adjustments` (hides "Add Adjustment" otherwise) |
| Reason enum | `scholarship_merit, donor_seat, sibling_rebate, management_waiver, fee_concession, staff_ward, financial_hardship, other` |

---

# Part B — Admit (generate the bills)

## 3. Enquiry Edit → Finance tab

**Route:** `/learners/enquiries/[id]/edit`
**File:** `app/(routes)/learners/enquiries/[id]/edit/page.tsx`
**Finance section:** `…/_components/form-sections/finance-details.tsx`
**Audience:** 🧑‍💼 Staff

### End-User Reference
The heart of admission billing prep. On the Finance tab you confirm the fees a prospect will be billed **before** admitting them.

For a **matrix-driven** lead (the normal case):
- A read-only **Fee Structure card** auto-fills from the 8-dimension matrix lookup (institution, degree, department, programme, quota, community, accommodation, admission year + gender).
- A table shows billing categories + amounts with a subtotal.
- The **Fee Adjustments** panel (page 2) lets you layer scholarships/waivers.
- **Sync Fees** refreshes the resolved structure if you change any dimension.
- If dimensions are incomplete, a **No-match empty state** tells you exactly which fields are missing and which tab to fix — so you never admit with zero/wrong fees.

For a **legacy** lead (pre-matrix): a banner offers **Migrate to fee structure** → see page 5.

### Technical Reference
| | |
|---|---|
| Components | `FeeStructureReadonlyPanel`, `NoMatchEmptyState`, `FeeAdjustmentsPanel`, `LegacyModeBanner`, `AdoptStructureDialog` |
| Services | `FeeResolutionService.previewMatchByDimensions()` (pure read), `.resolveForLearner()` (persists `fee_items`) |
| RPC | `admission_resolve_fee_items_for_lead(p_learner_id)` |
| Dimensions | 8: `institution_id, degree_id, department_id, programme_id, quota_id, community_category_id, accommodation_type_id, admission_year_id` (+ gender) |
| Guard | dims UUID-validated (`isValidDimensions`) to avoid Postgres `22P02` |

---

## 4. Account Verification dialog (the hinge)

**Trigger:** "Move to Account" status button on the enquiry → opens dialog.
**File:** `app/(routes)/learners/enquiries/_components/_account/account-verification-dialog.tsx`
**Audience:** 🧑‍💼 Staff (admin/principal)

### End-User Reference
The single action that **turns a lead into a billed learner**. The dialog shows, read-only:
- Student identity (name, application ID).
- The 8 academic dimension cards.
- The fee structure preview.
- **"Bills to be generated: X line items"** and the **total ₹**.
- An optional **Notes** box (saved for audit).

**Confirm** is enabled only when a structure matched, no fee change is pending, and you're not already submitting. If the fee structure *changes while the dialog is open* (drift), it warns you and makes you re-confirm.

On confirm: the learner is promoted to **Account**, bills are generated atomically, and you get a toast: **"Moved to Account — N bills generated."** Double-clicking is safe (deduped).

### Technical Reference
| | |
|---|---|
| Service | `AccountTransitionService.transitionToAccount({ learner_id, required_documents, received_documents, idempotency_key, notes })` |
| RPC | `admission_account_transition_with_bills` (SECURITY DEFINER, atomic: promote + generate `billing_student_bills`, returns `bills_generated`) |
| Idempotency | client-generated `idempotency_key` (UUID) dedupes double-clicks |
| Audit | caller-session activity logs: `lifecycle.account_transition`, `documents.received` (per doc), `bill.auto_generated` — fired *outside* DEFINER for honest actor attribution |
| Output table | `billing_student_bills` (one row per fee item) |
| Alt variant | leads module has a simpler `…/admission/leads/_components/_account/account-transition-dialog.tsx` (backward-compat) |

---

## 5. "Fees Setup Pending" tab (legacy migration)

**Route:** `/learners/enquiries` → filter/tab `Fees Setup Pending`
**File:** `app/(routes)/learners/enquiries/page.tsx`
**Audience:** 🧑‍💼 Staff

### End-User Reference
A worklist of learners admitted under the **old fee model** (`legacy_fee_mode = true`) who need migrating onto the matrix. Columns include a **Match Status** (matched / no-match) and **Missing Fields** hint.

Open a row → the Finance tab shows a **Migrate to fee structure** banner → **Adopt Structure** dialog shows old vs. new fee items side-by-side. Confirm migrates atomically. The row then leaves this tab.

### Technical Reference
| | |
|---|---|
| Filter | server-side `legacy_fee_mode = true AND lifecycle_status IN ('admitted', …)` |
| Service | `FeeResolutionService.adoptStructureForLead()` |
| RPC | `admission_adopt_structure_for_lead` (flips `legacy_fee_mode=false` + resolves `fee_items`; **raises** on no-match, never adopts empty) |
| Permission | `admission_fees:manage_adjustments` |
| Audit | `enquiry.legacy_fee_adopted(item_count, resolved_total)` |

---

# Part C — Collect (view & pay bills)

## 6. My Bills (learner self-service)

**Route:** `/learners/my-bills`
**File:** `app/(routes)/learners/my-bills/page.tsx`
**Audience:** 🎓 Learner

### End-User Reference
A student's read-only view of their own fees:
- **Summary card:** name, roll number, institution, **Total Due** (color-coded) + count of outstanding bills.
- **Outstanding Bills tab:** each bill with due date, fee-head badge, balance.
- **Paid Receipts tab:** past receipts (number, date, amount, mode).
- Empty states: "You're all caught up" / "No payments yet".

> Note: this page is **view-only** — actual payment is initiated from the billing schedule/parent portal flow (pages 7–8).

### Technical Reference
| | |
|---|---|
| Component | `MyBillsClient` (tabs, bill cards, receipt list); `FEE_HEAD_LABELS` map |
| Gating | auth + `role='student'` + `learner_id` + `StudentValidationService` (active/graduated) |
| Queries (RLS) | `billing_student_bills` (`student_id = learner_id`, `balance_amount > 0`), `billing_receipts`, `billing_categories` |

---

## 7. Parent Portal — Fees

**Route:** `/parent/fees` (parent portal)
**File:** `app/(parent-portal)/parent/(authed)/fees/page.tsx`
**Audience:** 👪 Parent

### End-User Reference
Where a parent pays a child's fees:
- **Total Due** card (learner name, admission number).
- **Bill selection list** — checkboxes (all pre-selected); category, due date, balance.
- **Proceed to Pay ₹XXXX** — amount updates with selection.
- **Paid Receipts** — historical receipts.

Tapping pay hands off to the gateway (HDFC or Razorpay hosted checkout); on return the parent lands back on `/parent/fees?payment=success|cancelled`.

### Technical Reference
| | |
|---|---|
| Component / hook | `FeesContent`; `useParentFees()` (React Query, dynamic refetch); `ParentFeeService.pay()` |
| API GET | `app/api/parent/fees` → `{ learnerName, admissionNumber, totalDue, bills[], receipts[] }` |
| API POST | `app/api/parent/fees/pay` → `{ paymentUrl, transactionId, provider }` |
| Auth model | parent JWT (not Supabase session) + **service-role** client + `assertLearnerAccess()` |
| Gateway call | `PaymentGatewayService.createPaymentSession()`; return/cancel URLs set to `/parent/fees?payment=…` |

---

## 8. Payment pages (initiate → gateway → callback → result)

**Audience:** 🎓 Learner · 👪 Parent · 🧑‍💼 Staff (staff-initiated)

### End-User Reference
A **redirect** flow, not an in-app modal:
1. Selecting bills + Pay calls **initiate**; the app **redirects** you to the gateway (HDFC SmartGateway form or Razorpay hosted checkout).
2. You pay on the gateway.
3. The gateway returns to the app's **callback**, which verifies server-side and routes you to:
   - **Payment Successful** page — green check, amount, transaction details, "Receipt Generated" alert, buttons: **View Receipt**, **View My Bills**, **Dashboard**.
   - **Payment Failed/Cancelled/Expired** page — reason, common-causes help, **Try Again**, **Dashboard**.

You are never asked to trust a "success" the gateway *claims* — the app re-verifies before showing success.

### Technical Reference
| Step | Endpoint / page | Notes |
|---|---|---|
| Initiate | `POST app/api/billing/payment/initiate` | validates bills share one institution; `PaymentGatewayService.createPaymentSession()`; returns `payment_url`, `transaction_id`, `provider` |
| Gateway | external | HDFC form **or** Razorpay checkout; provider chosen by `lib/services/payments/factory.ts` (`getActiveProviderName`) |
| Callback | `POST/GET app/api/billing/payment/callback` | **server-side verify only**: Razorpay (`razorpay_order_id/payment_id/signature` → `verifyPaymentWithGateway`) or HDFC (order-status API); then `processVerifiedPayment()` creates receipt; `PaymentAuditService.logCallbackReceived()` |
| Status | `GET app/api/billing/payment/status/[transactionId]` | `checkPaymentStatus()`; students see only own |
| Success page | `app/(routes)/billing/payment/success/page.tsx` | `usePaymentStatus()` re-verifies; links to receipt |
| Failed page | `app/(routes)/billing/payment/failed/page.tsx` | auto-redirects to success if status later resolves |
| Tables | `payment_transactions`, `payment_transaction_items` (`provider`, `bill_ids[]`, `gateway_response` JSONB) |
| Security | `lib/services/billing/security/payment-audit-service.ts` (signature failure, amount mismatch, replay) |

---

# Part D — Settle (receipts, invoices, discounts, refunds)

## 9. Receipts — list & detail

**Routes:** `/billing/receipts`, `/billing/receipts/[id]`
**Files:** `app/(routes)/billing/receipts/page.tsx`, `…/[id]/page.tsx`
**Audience:** 🧑‍💼 Staff (manage) · 🎓 Learner (view own)

### End-User Reference
- **List:** filter by payment mode (cash/online/bank transfer/DD/cheque), institution, student, date; staff see **Create Receipt**.
- **Detail:** professional receipt — Received From, Payment Details, Payment Breakdown table, Refund History (if any), Net Receipt Amount. Actions: **Download PDF**, **Print**, **Send Email** (if college email), and staff-only **Edit/Delete**.

### Technical Reference
| | |
|---|---|
| Components | `ReceiptsFiltersClient`, `ReceiptsTableServer`, `ReceiptActionsClient`, `ReceiptDetailsServer` |
| PDF | `BillingReceiptService.downloadReceiptPDF()` → `lib/utils/billing/receipt-pdf.ts` (jsPDF + autotable, "Rs." formatting); file `receipt-{number}.pdf` |
| Server actions | `_actions/receipt-actions.ts`: `createReceipt` (number via RPC), `updateReceipt`, `deleteReceipt`, `sendReceipt` |
| Tables | `billing_receipts`, `billing_receipt_items` (+ `billing_refunds` for refund history) |
| Permission | `billing.receipts:view` / `billing.receipts:create` |

---

## 10. Invoices — list & detail

**Routes:** `/billing/invoices`, `/billing/invoices/[id]`
**Files:** `app/(routes)/billing/invoices/page.tsx`, `…/[id]/page.tsx`
**Audience:** 🧑‍💼 Staff (manage) · 🎓 Learner (view own)

### End-User Reference
- **List:** filter by invoice type (individual/consolidated), institution, student, date; staff see **Create Invoice**.
- **Detail:** professional invoice; actions **Download PDF**, **Send Email**, staff-only **Edit/Delete**.

> Policy today: a **receipt** is issued on every successful payment; an **invoice** is generated when a bill is fully paid.

### Technical Reference
| | |
|---|---|
| Components | `InvoicesFiltersClient`, `InvoicesTableServer`, `InvoicesPaginationClient`, `InvoiceActionsClient`, `InvoiceDetailsServer` |
| Server actions | `_actions/invoice-actions.ts`: `sendInvoice`, `downloadInvoicePDF`, `deleteInvoice` |
| Service | `BillingInvoiceService.createBillingInvoice()` (number via RPC) |
| Tables | `billing_invoices`, `billing_invoice_items` |
| Permission | `billing.invoices:view` / `billing.invoices:create` |

---

## 11. Discounts / Scholarships (billing-side)

**Route:** `/billing/discounts`
**File:** `app/(routes)/billing/discounts/page.tsx`
**Audience:** 🧑‍💼 Staff

### End-User Reference
Manage scholarships/discounts applied to **issued** bills (distinct from admission-time fee adjustments in page 2). Summary cards: Total, Pending Approvals, Total Amount, Approved Rate. Buttons: **Apply Scholarship**, **Policies**, **Bulk Apply**. Each row has an approval status (pending/approved/rejected).

### Technical Reference
| | |
|---|---|
| Components | `DiscountList`, `DiscountFilters` |
| Hook | `useBillingDiscounts()` |
| Table | `billing_discounts` (`discount_amount`, `approval_status`, …) |
| Permission | `billing.discounts:view` / `billing.discounts:create` |

---

## 12. Refunds

**Route:** `/billing/refunds`, `/billing/refunds/[id]`
**File:** `app/(routes)/billing/refunds/page.tsx`
**Audience:** 🧑‍💼 Staff

### End-User Reference
Process and track refunds against receipts. Summary cards: Total, Pending Approvals, Total Amount, Completion Rate. Buttons: **Process Refund**, **Policies**, **Bulk Process**. Statuses: pending/approved/rejected/processed. Refund rows link back to the originating receipt.

### Technical Reference
| | |
|---|---|
| Components | `RefundsTableServer`, `RefundsFiltersClient`, `RefundsPaginationClient` |
| Fetcher | `getRefunds(filters)` |
| Table | `billing_refunds` (`refund_amount`, `net_refund_amount`, `processing_fee`, `approval_status`, `refund_method`, `receipt_id`, …) |
| Permission | `billing.refunds:view` / `billing.refunds:create` |

---

## Appendix A — Permission keys at a glance

| Page | View | Create / Manage |
|---|---|---|
| Fee Structure (1) | `admission.settings:view` | `admission_fees:manage`, `admission_fees:delete` |
| Fee Adjustments (2) | — | `admission_fees:manage_adjustments` |
| Account Verification (4) | — | enforced inside the RPC (per-learner) |
| Billing Schedule | `billing.schedule:view` | `billing.schedule:create` |
| Receipts (9) | `billing.receipts:view` | `billing.receipts:create` |
| Invoices (10) | `billing.invoices:view` | `billing.invoices:create` |
| Discounts (11) | `billing.discounts:view` | `billing.discounts:create` |
| Refunds (12) | `billing.refunds:view` | `billing.refunds:create` |

> Permission-key punctuation (`:` vs `.`) has drifted historically in this codebase. Confirm the exact stored format against `lib/sidebarMenuLink.ts` / the `custom_roles` grants before relying on a key in a new gate. (See memory: BOS perm-key format drift.)

## Appendix B — Provider & security notes

- **Providers:** Razorpay (hosted checkout, HMAC signature verify, late-auth cron) and HDFC SmartGateway (MID `SG3726`, order-status API). Selected by `lib/services/payments/factory.ts`; per-institution account routing supported.
- **Trust boundary:** the **callback never trusts client-claimed status** — it re-verifies with the gateway, then `processVerifiedPayment()` writes the receipt. All anomalies logged by `payment-audit-service.ts`.
- **Three access models** recap: Staff = Supabase session + permission key; Learner = RLS on `auth.uid`; Parent = parent JWT + service-role + `assertLearnerAccess()`.

# Centralized Store — Reconciled Plan (v3)

> Backbone = your Google Doc **"Centralized Store — Four New Modules (Plan v2)"**.
> Grounded in the actual codebase (verified by exploration on 2026-07-07).
> The one place Plan v2 conflicts with the design we discussed is flagged as an **OPEN DECISION** (§7), not silently resolved.

---

## 1. Context — why this exists

There is one physical store that must serve three consumers who live in structurally different parts of the system:

- **Learner** (student) — identity in `learners_profiles`, surfaced as a `profiles` row with `role='student'`.
- **Senior Learner** (= faculty / leadership: HOD, Principal, CAO, Chairperson) — `profiles`/`staff`.
- **Cleaning Supervisor** (in-charge of housekeeping staff) — `profiles`/`staff`.

Today the store already has two issue engines:
- **Indent → approve → issue** (`ims_indent_requests` → `approveIndent()` → `ims_stock_issues`) — internal, unpaid.
- **POS sale** (`ims_sales`, `payment_method ∈ cash|gpay|card|upi_qr|mixed`) — paid, over-the-counter.

Plan v2 adds a **Central Office** area with four modules on top of the existing `ims_*` schema. This plan builds to that.

---

## 2. Scope of this pass

| Module | This pass |
|---|---|
| 1. Learner Fees | **Design only** (no code) — fee-status derivation + Pay Now gate rules |
| 2. Senior Learners registry | **Build** |
| 3. Cleaning Staff registry + tasks | **Build** |
| 4. Main Store Inventory | **Build** |

Out of scope (per doc): configurable approval chains (static ladder only), Learner Fees implementation, changes to the two existing inter-institution transfer flows.

---

## 3. Cross-cutting foundation (do first)

1. **Roles** — add `cao`, `chairperson`, `supervisor` to `SYSTEM_ROLES` (`types/auth.ts`) and `ROLE_LABELS` (`lib/constants/permissions.ts`).
   - ⚠️ Also add them to the `profiles.role` CHECK constraint (a migration), or inserts fail. See precedent `supabase/migrations/20260225_add_store_admin_to_profiles_role_check.sql`.
2. **Rank map** — `lib/central-office/role-rank.ts`: `{ hod:1, principal:2, cao:3, chairperson:4 }`.
3. **Permissions** — add categories to `lib/constants/permissions.ts`:
   - `learner_fees.*` (view, pay)
   - `senior_staff.*` (CRUD)
   - `cleaning_staff.*` (CRUD, assign, verify)
   - `main_store.*` (view, request, approve, issue, adjust, pos_sell)
4. **Sidebar** — new "Central Office" group in `GetPages()`, four rows wired to `MENU_PERMISSIONS` (guards against the inline-submenu permission leak we've hit before).
5. **Item visibility resolver** — `getVisibleItems({ callerContext })` in `inventory-service.ts`, filtering catalog by category `audience`.

---

## 4. Data model changes

### Extend existing
- `ims_stores` → add `is_main_store BOOLEAN DEFAULT false` (enforce one per institution via partial unique index).
- `ims_item_categories` → add `audience` enum (`student_sale | staff_issue | cleaning_internal`, default `staff_issue`).
- `ims_items` → already has `is_sellable_to_students` (per-item override). No change.
- `billing_student_bills` → already has `balance_amount, final_amount, due_date, status, item_category_id, student_id`. No change.

### New tables
- `senior_staff` — `id, institution_id, profile_id(FK profiles), full_name, designation(hod|principal|cao|chairperson), email, phone, department_id, is_active, +audit`.
- `senior_staff_history` — append-only (`senior_staff_id, action, actor_id, changes jsonb, created_at`).
- `cleaning_staff` — `id, institution_id, full_name, designation(supervisor|cao|chairperson), phone, is_active, +audit`.
- `cleaning_task_assignments` — `id, institution_id, cleaning_staff_id, area, description, assigned_by, assigned_at, due_date, status(assigned|in_progress|done|verified), verified_by, verified_at, remarks`.
- `cleaning_task_history` — append-only.
- `central_store_requests` — `id, institution_id, requester_profile_id, requester_kind(learner|staff), requester_rank(int, null for learner), status(draft|pending_approval|approved|rejected|issued|cancelled), current_approver_rank, +audit`.
- `central_store_request_items` — `request_id, item_id, qty, unit_id`.
- `central_store_request_approvals` — `request_id, approver_rank, approver_profile_id, action(pending|approved|rejected), acted_at, comments` (one row per required rank).

### RLS (closes a real gap we found)
All new tables:
```
institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
OR get_current_user_role() = 'super_admin'
```
> NOTE: existing `ims_*` tables are all `USING(true)` (service-layer scoping only), and `ims_indent_dept_scope()` has **no committed SQL** in the repo. New tables should NOT copy the open-RLS convention — they gate money-adjacent value. (See §8 risks.)

---

## 5. The three request paths (Main Store)

- **Path A — Learner POS (no approval):** gate on fee status; if allowed, POS `ims_sales`; items filtered to `audience='student_sale'` + `is_sellable_to_students`.
- **Path B — Senior Staff (static rank chain):** on submit, seed `central_store_request_approvals` with every rank above requester; `pending_approval → approved` as each rank signs; reject halts chain (reason required); final approval writes `ims_stock_issues`. Items filtered to `audience='staff_issue'`.
- **Path C — Department Indent (unchanged):** reuse `ims_indent_requests` + `approveIndent()`.

---

## 6. Module build details

**Module 2 — Senior Learners**
- Service `lib/services/central-office/senior-staff-service.ts` (CRUD, history logging, `getRankForProfile()`).
- Routes `app/(routes)/central-office/senior-staff/`; API `app/api/central-office/senior-staff/{route,[id]}.ts` (withAuth + `senior_staff.*`); hook `hooks/central-office/use-senior-staff.ts`.

**Module 3 — Cleaning Staff**
- Service `lib/services/central-office/cleaning-staff-service.ts` (staff CRUD + `assignTask`, `updateTaskStatus`, `verifyTask`).
- Routes `app/(routes)/central-office/cleaning-staff/` (list + Tasks tab + history timeline); API + tasks sub-route; permissions `cleaning_staff.*`.

**Module 4 — Main Store**
- Extend `ims_stores`; create the 3 `central_store_*` tables; implement Paths A/B/C; integrate existing IMS services (`stock-service`, `grn-service`, `indent-service`, `stock-adjustment-service`, `reports-service`, `activity-log-service`).
- Routes `app/(routes)/central-office/main-store/` (landing, item/GRN/stock/report screens, Requests area, Approvals inbox).

**Module 1 — Learner Fees (design only)**
- Derive tags from `billing_student_bills`: **Paid** `balance=0`; **Partial** `0<balance<final`; **Pending** `balance=final & due≥today`; **Overdue** `balance>0 & due<today`.
- `getLearnerFeeStatus(learnerId)` = sum of all `balance_amount` → 0 allows POS, else Pay Now (routes to existing Razorpay/HDFC or IMS UPI-QR; success updates `billing_receipts`).

---

## 7. The package case — REUSE the Campus Living pattern (revised)

> Earlier this was an open A-vs-B decision. Exploring **Campus Living** (which already solves "a bundle is assigned to a learner, priced through billing, and physically delivered only after the bill exists") gives a proven third path that dissolves the conflict. **Recommended: mirror Campus Living**, do NOT use the zero-value-sale hack, do NOT edit the admission fee-resolution RPCs.

### The proven pattern (Campus Living), step → our analogue

| # | Campus Living object | Our store analogue |
|---|---|---|
| 1 DEFINITION (contents) | `admission_packages` (room+mess + eligibility dims); catalog RLS `USING(true)` read | package↔item **bundle** table: which `ims_items` belong to a package |
| 2 PRICE | `hostel_fees` (keyed by cycle; polymorphic target incl. `package_id`) | item/package **price** keyed by billing cycle (or reuse item cost) |
| 3 ASSIGNMENT | `learner_package_assignment` `UNIQUE(learner, hostel_year)`; `assignPackageToLearner()` | `learner_item_assignment` — learner's entitlement, `UNIQUE(learner, cycle, item)` |
| 4 RESOLVE | RPC `campus_living_resolve_hostel_fee()` → JSONB fee lines | **new** RPC `store_resolve_package_items()` → item fee lines |
| 5 BILLING (write) | RPC `campus_living_generate_hostel_year_bills()` → `billing_student_bills`, `fee_source='hostel_package'`, dedup via partial unique index + `ON CONFLICT DO NOTHING` | **new** RPC → `billing_student_bills`, `fee_source='store_package_item'`, same dedup shape |
| 6 FULFILLMENT | `hostel_allocations` + `fee_status` + `p_require_bill` allocation gate | `store_item_issuance` (status `pending/issued/returned`), **gated on the bill existing** |

### Why this beats the earlier Option B
- The item's cost becomes a **real `billing_student_bills` line** (not a zero-value POS sale) → it literally *is* part of the fees the learner pays. Satisfies your original requirement.
- Collecting the item = a **fulfillment record gated on the bill** (the `hostel_allocations` + `p_require_bill` analogue) — the double-issue guard is a **partial UNIQUE index**, DB-enforced, exactly as Campus Living dedups bills.
- **No edits to `admission_resolve_fee_items_for_lead()`** — we add a *parallel* resolver+writer pair, the way Campus Living runs alongside academic fees (and the academic path shows how to *skip* already-handled learners to avoid double-billing).

### `fee_source` extension
`billing_student_bills.fee_source` CHECK currently allows `academic|hostel_package|hostel_category|ad_hoc`. Add `'store_package_item'` — a one-line `ADD`-style migration, same precedent as `'mess'` (`20260704999000_billing_category_kind_add_mess.sql`).

### Still-open sub-choices (smaller, not blocking the shape)
- **Both-timing fulfillment (your answer):** onboarding batch-issue vs on-demand counter — both write the same `store_item_issuance` row; onboarding just auto-issues, counter issues on lookup. One table serves both.
- **Fee head:** reuse an existing `billing_categories` row per bundled item (add a `kind` value if needed) vs a generic "store package" head. Campus Living reuses `billing_categories.kind`.
- **Alternative (only if you insist on the doc's orthogonal model):** skip steps 1–6 entirely, keep fees as a pure `getLearnerFeeStatus()` gate (doc's Option A). Simpler but does NOT hand package items over or prevent double-pay. Recommend against, given your original ask.

---

## 8. Risks / things to watch

- **`profiles.role` CHECK constraint** — new roles fail to insert unless the CHECK is migrated (§3.1).
- **New-table RLS must not copy the `USING(true)` convention** — these tables gate value.
- **`ims_indent_dept_scope()` has no committed SQL** — if Path C relies on it, its definition needs to be captured in a migration.
- **Two approval engines coexist** (rank-chain for staff, single-approver indent for dept) — keep them clearly separated in UI + service to avoid confusion.
- **Windows/npm**, DataTable `rowId`, PostgREST numeric-as-string — known local gotchas from prior work; apply the usual guards.

---

## 9. Migrations (5 files)

1. `ims_stores.is_main_store` (+ partial unique index).
2. `ims_item_categories.audience` enum.
3. `senior_staff` + `senior_staff_history` + RLS.
4. `cleaning_staff` + `cleaning_task_assignments` + `cleaning_task_history` + RLS.
5. `central_store_requests` + `_items` + `_approvals` + RLS.
6. *(package feature — Campus Living pattern, §7)* package↔item bundle table + `learner_item_assignment` + `store_item_issuance` + `store_resolve_package_items()` / `store_generate_package_bills()` RPCs + `billing_student_bills.fee_source` CHECK add `'store_package_item'`. **No edits to admission fee RPCs.**
7. *(if new roles used)* `profiles.role` CHECK extension.

---

## 10. Verification (end-to-end)

- Build/lint pass; menu rows hide without permission.
- Learner fee gate blocks/allows correctly; Pay Now updates balance.
- Staff rank chain sequences through all ranks; rejection halts with reason.
- Cleaning lifecycle assign → status → verify with timestamps + history.
- GRN → dept indent → approval → issue → adjustment logged in `ims_activity_log`.
- Item visibility: learner POS API returns **zero** cleaning items; cleaning picker returns them.
- *(if Option B)* package item issues once as zero-value sale; second collection attempt is blocked.
- Local run via browser-login recipe; DataTable rows stable across refetch.

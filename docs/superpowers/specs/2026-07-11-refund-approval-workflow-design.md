# Refund Approval Workflow — Design Spec

**Date:** 2026-07-11
**Status:** Approved by product owner (brainstorming session)
**Replaces:** the existing receipt-based refund module (`billing_refunds` UI, hooks, service, server actions, gateway-refund route)

## 1. Summary

A multi-stage, bill-based refund approval workflow for the billing module:

```
INITIATE ──▶ [dynamic approval stages 1..N] ──▶ DISBURSE
(fixed)       (configurable per institution)     (fixed)

Any stage can DECLINE with a mandatory reason (terminal).
```

- Refunds are initiated from the student schedule page (`/billing/schedule/students/[id]`)
  against one or more bills that carry paid money.
- A configurable chain of approval stages (e.g., Chief Accountant Verify → MD Approve)
  reviews the request in the rebuilt `/billing/refunds` module.
- A fixed final Disbursement stage (Accounts) records how the money was returned
  (payment mode + details), exports the full trail as PDF, and completes the refund.
- Withdrawal-type refunds free the learner's seat **at initiation** by moving the
  learner to a new `withdrawal_pending` lifecycle status.

## 2. Decisions log (from brainstorming)

| # | Decision |
|---|----------|
| 1 | **Replace** the old receipt-based refund module entirely. Legacy `billing_refunds` rows remain readable history; nothing new writes to that table. |
| 2 | **Amounts are proposed per bill at initiation** (capped at refundable headroom), locked through approval. Accounts records *how* it was paid, never changes the amount. |
| 3 | **Fully dynamic middle stages** (add/remove/reorder in settings) between **fixed** Initiate and Disburse ends. |
| 4 | **Any stage can decline** with a mandatory reason. Decline is **terminal** — a fresh request can be initiated afterwards. |
| 5 | Workflow config: **global default + optional per-institution override**. |
| 6 | Files stored in **Google Drive** (existing `lib/google/drive-upload.ts` pattern); DB stores `{name, drive_file_id, drive_url, mime, size}`. |
| 7 | Refunded bills are **marked refunded / partially_refunded — never reopened** as due. Existing bill `status` column untouched. |
| 8 | **Eligibility:** any bill with unrefunded paid money (fully or partially paid). Unpaid bills excluded. Cap = paid − already refunded − amounts held by other active requests. |
| 9 | Engine: **purpose-built tables with a frozen chain snapshot** per request (Approach A). Config edits never affect in-flight requests. |
| 10 | Every request carries a **`refund_type`**: `withdrawal` (student leaving, seat released) or `adjustment` (overpayment/correction; learner untouched). |
| 11 | Withdrawal seat release fires **at initiation**: learner → new `withdrawal_pending` status (seat freed immediately). Decline → restore snapshotted previous status. Disburse → `exited` (terminal). |
| 12 | **Out of scope v1:** notifications to next approver, send-back-for-revision, Razorpay online refund execution, editing a request after initiation. |

## 3. Data model

### 3.1 New table: `billing_refund_flow_configs`

Settings-page managed. At most one active global config and one active config per institution
(partial unique indexes).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `institution_id` | uuid NULL | `NULL` = global default; set = institution override |
| `name` | text | display name |
| `initiator_roles` | uuid[] | `custom_roles.id` — who can initiate (fixed stage 0) |
| `initiator_users` | uuid[] | pinned `profiles.id` |
| `stages` | jsonb | ordered array: `[{ key, name, assignee_roles: uuid[], assignee_users: uuid[] }]` |
| `disburser_roles` / `disburser_users` | uuid[] | fixed final stage |
| `is_active` | boolean | |
| `created_by`, `created_at`, `updated_at` | | |

Validation (settings UI + RPC): ≥1 middle stage; every stage/initiator/disburser must resolve
to ≥1 real user (role picker shows holder counts — lesson from HR flows where zero-holder
roles made approvals invisible forever).

### 3.2 New table: `billing_refund_requests`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `request_number` | text UNIQUE | e.g. `RFND-2026-00042`; generated with retry-on-collision |
| `institution_id` | uuid NOT NULL | from the student's profile |
| `student_id` | uuid NOT NULL | → `learners_profiles` |
| `refund_type` | text | `withdrawal` \| `adjustment` |
| `status` | text | `pending_review` → `pending_disbursement` → `disbursed`; or `declined` |
| `current_stage_index` | int | index into `flow_snapshot.stages`; meaningful only in `pending_review` |
| `flow_snapshot` | jsonb | **frozen at initiation**: `{ initiator, stages[], disburser }` — ALL gating reads only this |
| `total_refund_amount` | numeric | denormalized sum of bill lines |
| `previous_lifecycle_status` | text NULL | snapshot for withdrawal revert (set only when `refund_type='withdrawal'`) |
| `initiated_by`, `initiated_at` | | |
| `declined_by`, `declined_at`, `decline_reason`, `declined_stage_name` | | denormalized for list display |
| `payment_mode` | text NULL | cash / online / cheque / dd / bank_transfer … (existing payment-mode list) |
| `payment_details` | jsonb NULL | reference numbers, bank details, etc. |
| `disbursed_by`, `disbursed_at` | | |
| `created_at`, `updated_at` | | |

### 3.3 New table: `billing_refund_request_bills`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `request_id` | uuid FK → requests | ON DELETE CASCADE |
| `bill_id` | uuid FK → `billing_student_bills` | |
| `paid_amount_snapshot` | numeric | paid at request time |
| `refund_amount` | numeric | `CHECK (refund_amount > 0 AND refund_amount <= paid_amount_snapshot)` |
| | | `UNIQUE(request_id, bill_id)` |

### 3.4 New table: `billing_refund_request_actions` (append-only audit trail)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `request_id` | uuid FK | |
| `action_type` | text | `initiated` \| `approved` \| `declined` \| `disbursed` |
| `stage_index` | int NULL | null for initiate/disburse |
| `stage_name` | text | snapshot for display |
| `actor_id` | uuid | |
| `actor_role_name` | text | snapshot |
| `notes` | text | required on approve/initiate/disburse; decline uses `decline_reason` + optional notes |
| `attachments` | jsonb | `[{name, drive_file_id, drive_url, mime, size}]` |
| `created_at` | timestamptz | never updated, never deleted |

### 3.5 Alterations to existing tables

- `billing_student_bills` + `refunded_amount numeric DEFAULT 0`, + `refund_status text NULL`
  (`partially_refunded` \| `refunded`). The `status` column is untouched (no allow-list breakage).
- `admission_statuses` + new row `{scope:'learner', code:'withdrawal_pending', label:'Withdrawal Pending', is_terminal:false, is_seat_filled:false, gates_login:false}`.
  Not added to any seat-RPC counted list → any learner in this status frees their seat automatically.
- `types/supabase.ts` regenerated to register all new tables/columns.

## 4. Workflow state machine & RPCs

All writes go through three SECURITY DEFINER, **self-authorizing** RPCs. Clients get SELECT
only via RLS; there are no INSERT/UPDATE/DELETE policies on the new tables. Super admin can
always act (override). Gating reads ONLY the frozen `flow_snapshot` — immune to the
config-edit drift deadlock class (reservations lesson, mig 20260619150000).

### 4.1 `fn_initiate_refund_request(p_student_id, p_refund_type, p_bills jsonb, p_notes, p_attachments)`

1. Caller must be in the active config's initiator roles/users (institution override, else global). No active config → error `no_flow_configured`.
2. Locks selected bills `FOR UPDATE`; validates each bill's refundable headroom:
   `paid − refunded_amount − SUM(refund_amount in other ACTIVE requests)` ≥ requested amount.
   Blocks over-refunds and concurrent duplicate requests.
3. Resolves + freezes the chain into `flow_snapshot`; generates `request_number` (retry on collision).
4. Inserts request (`pending_review`, stage 0 of middle stages) + bill lines + `initiated` action row.
5. **If `refund_type='withdrawal'`:** snapshots `learners_profiles.lifecycle_status` into
   `previous_lifecycle_status`, then sets learner → `withdrawal_pending`. Seat freed immediately.

### 4.2 `fn_act_on_refund_request(p_request_id, p_action, p_notes, p_attachments, p_reason)`

- Caller must be in the **current stage's** assignees per the snapshot (pinned users matched
  first, then role holders — HR pattern). Same person may act at multiple stages (Chief
  Accountant initiates AND verifies).
- `approve`: notes required; appends action row; advances `current_stage_index`; after the
  last middle stage → `status='pending_disbursement'`.
- `decline`: reason required; terminal `status='declined'`; **if withdrawal-type, restores the
  learner to `previous_lifecycle_status`** (seat re-occupied — honest state).

### 4.3 `fn_disburse_refund_request(p_request_id, p_payment_mode, p_payment_details, p_notes, p_attachments)`

1. Caller must be a disburser per snapshot; request must be `pending_disbursement`.
2. Per bill line: `refunded_amount += refund_amount`; sets `refund_status`
   (`refunded` if refunded ≥ paid, else `partially_refunded`). Bills are never reopened.
3. Writes `disbursed` action; stamps payment fields; `status='disbursed'`.
4. **If withdrawal-type:** learner → `exited` (terminal; existing exit semantics incl. login
   deactivation via the established gates).
5. Refreshes `student_billing_summary`.

### 4.4 Auto-promotion safety

`evaluate_learner_status_after_payment` only acts on learners in `account`/`reserved` —
a `withdrawal_pending` or `exited` learner can never be re-promoted by billing events.

## 5. UI surfaces

### 5.1 Student schedule page (`/billing/schedule/students/[id]`) — initiation

- Checkboxes on eligible bill rows (unrefunded paid money > 0); **Initiate Refund** button
  visible only to initiator assignees (capability resolved from the active config).
- Initiation dialog: refund type selector (withdrawal ⇒ warning "Seat will be released and
  learner marked Withdrawal Pending immediately"), selected bills with per-bill editable
  refund amount (default = headroom, validated), required notes, multi-file Drive upload.
- Post-disbursement the page shows Refunded badges + amounts per bill and a refund history
  entry (request number, date, mode).

### 5.2 `/billing/refunds` — rebuilt Refund Requests module

- Server-rendered list: tabs **Pending my action / All / Pending disbursement / Disbursed /
  Declined**; summary cards; filters (institution, status, type, date range, search by
  request number / student).
- Detail page `/billing/refunds/[id]`: learner panel; all bills + receipts + payment history
  (reuse existing student-billing components); selected bill lines with amounts; withdrawal
  banner when applicable; **stage timeline** (every action row: actor, role, stage, notes,
  files, timestamp); context-sensitive action panel (Approve / Decline-with-reason for current
  stage assignee; Disburse form for disburser when `pending_disbursement`).
- **PDF export** on the detail page: request summary, learner details, bill lines, complete
  approval trail with all notes — follows the existing `lib/utils/billing/receipt-pdf.ts`
  generation pattern.

### 5.3 Settings page `/billing/settings/refund-approvals`

- List-first (HR flow-builder layout): table of configs (Global Default + per institution)
  with Create / Edit / Activate / Deactivate.
- Editor: initiator assignees; orderable middle-stage list (add/remove/reorder; each stage
  named, role/user pickers with **holder counts**); disburser assignees; validation as §3.1.

## 6. Permissions & RLS

- Keys: reuse `billing.refunds.view` (module access) and `billing.refunds.create`
  (UI-level initiation gate; the authoritative gate is config assignees inside the RPC).
  New key **`billing.refunds.configure`** for the settings page — the migration **grants it
  to roles** (Super Admin + billing admin roles) in the same change; declaring alone does nothing.
- New tables RLS:
  - Requests/bills/actions: SELECT for super admin, OR (`billing.refunds.view` +
    `role_has_institution_access(institution_id)`), OR snapshot participant (initiator /
    any stage assignee / disburser — so an MD sees requests without holding the billing module),
    OR the learner themself (My Bills self-view, mirroring the existing student policy pattern).
  - No write policies — writes only via the three self-authorizing DEFINER RPCs.
  - Configs: SELECT for authenticated (capability resolution); writes gated on
    `billing.refunds.configure`.
- RLS authoring rules honored: fully-qualify outer columns in EXISTS; DEFINER helpers where
  recursion risk exists; RPCs self-authorize.

## 7. Old module retirement

Removed: receipt-page "Process Refund" dialog; old `/billing/refunds` pages/components;
`hooks/billing/use-billing-refunds.ts`; `lib/services/billing/refunds/billing-refund-service.ts`;
orphaned `app/(routes)/billing/_actions/refund-actions.ts`; broken
`app/api/billing/refunds/[id]/gateway-refund/route.ts`; dead links to `/refunds/policies`
and `/refunds/bulk`.

Kept: `billing_refunds` table + legacy trigger chain (for existing rows only), surfaced
read-only in a small "Legacy refunds" section of the reports tab. The refund report tab
switches to the new tables.

## 8. Edge cases

| Case | Behavior |
|---|---|
| No active config for institution (and no global) | Initiate button hidden with tooltip "Refund approvals not configured". RPC also refuses. |
| Config edited/deactivated mid-flight | In-flight requests continue on their frozen snapshot; only new initiations see the change. |
| Assignee removed from role mid-flight | Role membership resolved live at act-time; pinned users always valid; super admin fallback. |
| Two active requests on one bill | Blocked by headroom check under `FOR UPDATE` lock. |
| Decline after seat released | Learner restored to `previous_lifecycle_status`; seat counted again. |
| Learner status changed externally while `withdrawal_pending` | Disburse sets `exited` regardless; decline restores the snapshot (last-writer honesty; rare, acceptable). |
| Partial refund on withdrawal | Seat release is driven by `refund_type`, not amount. |
| Decline → re-initiate | Allowed; declined requests hold no headroom. |

## 9. Verification plan

1. `mcp__ide__getDiagnostics` clean on all touched files.
2. `npm run check:menus` / `check:reachability` pass (new settings route, nav entries).
3. Browser walkthrough with non-super-admin users at each stage: initiate (admission officer),
   verify (chief accountant), approve (MD), disburse (accounts). Confirm: seat count drops at
   initiation in Seat Analytics; decline restores status + seat; disburse marks bills
   refunded (never reopened), schedule page shows refund history; PDF exports the full trail;
   declined path stores its reason; learner in `withdrawal_pending` can't be auto-promoted.
4. Legacy refunds still visible read-only; no new writes to `billing_refunds`.

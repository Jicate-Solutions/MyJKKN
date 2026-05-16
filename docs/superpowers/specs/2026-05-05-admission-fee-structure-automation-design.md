# Admission Fee Structure Automation — Design Spec

**Date:** 2026-05-05
**Author:** Boobalan (with multi-agent brainstorm + ultrathink synthesis)
**Status:** Draft — pending user sign-off
**Scope:** v1 module to automate admission fee assignment, replacing the current manual `fee_items` entry on the enquiry form

---

## 1. Executive Summary

A new sub-module `admission/settings/fees-structure` introduces a rule engine that auto-populates each enquiry's `learners_profiles.fee_items[]` JSONB array based on an 8-dimensional matrix lookup. The bill-generation engine in `lib/services/billing/onboarding/onboarding-service.ts` is left **unchanged** — it consumes `fee_items[]` exactly as it does today. Real-world exceptions (scholarships, donor seats, sibling rebates, waivers) are modelled as a first-class `admission_fee_adjustments` entity; programme/quota/accommodation changes that occur after bill generation flow through a finance-head-approved `admission_fee_change_events` workflow that supersedes (never deletes) old bills and reallocates paid amounts. Cutover uses a per-institution feature flag for phased rollout.

**Eleven new tables (3 lookup + 8 feature), one new bill state (`superseded`), three new SECURITY DEFINER RPCs, one Postgres trigger, one feature flag — zero changes to the bill engine.**

---

## 2. Background & Current State

### 2.1 The flow today

```
admission/leads (CRM stage)
   ↓ admit
learners/enquiries  (full enquiry form)
   ├─ Course Selection tab     — institution, degree, dept, programme, quota (TEXT), admission_year_id (FK)
   ├─ Accommodation tab        — accommodation_type (TEXT), hostel info
   ├─ Finance tab              — MANUAL: counsellor types fee_items[] one-by-one
   └─ submit
   ↓ status flows: admitted → pending → approved → account
billing/onboarding              — accounts team clicks "Generate Bills" manually
   ↓ all bills paid
learners/profiles               — lifecycle_status='active'
```

### 2.2 What's already built (and reusable)

- **`learners_profiles.fee_items` JSONB column** (added 2026-04-15) — shape `[{category_id, category_name, amount}]`, references `billing_categories(id)`. The bill engine consumes this directly.
- **`OnboardingService.createBillsFromProfile(learnerId)`** — already iterates `fee_items[]` and creates one `billing_student_bills` row per item, with idempotency guard (skips if any bills exist). No changes needed.
- **`billing_categories`** — global, flat, no hierarchy (collapsed 2026-04-28). Source for the new fee-structure builder.
- **`OnboardingService.markAsApproved(learnerId)`** (account → active) — checks `balance_amount=0` on all bills before flipping status. The activation cascade already works.
- **House-style settings sub-module pattern** — exemplified by `admission/settings/assignment-rules/`: list page + DataTable + service + types + Radix AlertDialog for confirmations.
- **Activity logging infrastructure** — `lib/utils/activity-logger-client.ts` with templates; resource-management instrumented 34 ops as recent precedent (commit `e8fa0bdef`).
- **Shadow-FK migration playbook** — `admission_year` int → `admission_year_id` FK (project memory `project_admission_year_fk_migration.md`). We re-use this exact pattern for quota/community/accommodation.
- **`OnboardingService.revertToApproved()`** — deletes only fully unpaid bills, preserves partially-paid. The semantic precedent for our supersede approach.

### 2.3 Structural problems

- **`quota`, `community`, `accommodation_type` are stored as free-form TEXT** on `learners_profiles` and `admission_leads`. Reliable matrix lookup requires stable identity (UUID).
- **Bill generation is currently a manual click** — a verification checkpoint accounts uses for non-fee reasons (PAN/Aadhaar/parent agreement/token-payment proof).
- **No fee-template/matrix infrastructure** anywhere — this is greenfield.
- **No fee-change reconciliation** — no supplemental bills, no fee adjustments, no void/amendment workflow exists.
- **Activity logging gap** — billing has none on bill generation, approval, or revert.

---

## 3. Goals & Non-Goals

### 3.1 Goals (v1)

1. Replace manual fee entry with auto-population from a configured matrix
2. Capture real-world exceptions (scholarships etc.) as auditable adjustments
3. Atomic status='account' transition with documents-checklist gate + bill generation
4. Safe handling of programme/quota/accommodation changes after bill generation
5. Never lose audit trail — paid bills are superseded, not deleted; payments are reallocated, not mutated
6. Phased per-institution rollout via feature flag

### 3.2 Non-goals (deferred to v2)

- Bulk fee-change workflow for statutory revisions (e.g. "Govt revised cap, apply to all 800 students")
- Grid-mode (Excel-paste) editor in the fee-structure builder
- Bulk-edit / percentage-based revisions
- Admin UI for `admission_settings_per_institution` (initial config via SQL/seed)
- Email notifications for fee-change-events (badge + bell-icon panel only in v1)
- Dropping deprecated TEXT columns (`learners_profiles.quota`, `community`, `accommodation_type`) — kept for backward compat
- Refund automation (refunds still go through existing `billing_refunds` UI; the approval dialog only flags intent)
- Multi-currency / international student fee handling

---

## 4. Design Decisions (with rationale)

| # | Question | Resolution | Rationale |
|---|---|---|---|
| 1 | Fee model: rigid matrix vs editable-with-override vs hybrid | **Strict matrix + first-class `admission_fee_adjustments` entity** | Preserves rigid contract; gives real-world exceptions a proper audited home; avoids drift back to manual entry culture |
| 2 | Fee-change reconciliation when programme/quota changes after bill gen | **Pending-review event with finance-head approval, supersede + reallocate (never delete paid bills)** | Lifecycle-safe gate, explicit human decision, preserves audit trail; receipts remain valid |
| 3 | Bill generation timing | **Atomic with status='account', gated by documents checklist in confirmation dialog** | Reclaims accounts' verification checkpoint without an extra click; documents checklist is reusable infrastructure |
| 4 | Versioning across academic years | **`admission_year_id` as 8th lookup dimension** | Cohort IS the version; archival automatic; no effective-date arithmetic |
| 5 | Identity for quota/community/accommodation | **Shadow-FK pattern: introduce lookup tables, keep TEXT alongside, gradual cutover** | Proven pattern in this codebase (admission_year); zero-breakage v1; v2 drops TEXT |
| 6 | Fee-structure builder UI | **Tree-rail hybrid (Form + Clone modes for v1; Grid mode v1.5)** | Builds operator productivity for hundreds of structures; gap-surfacing via Coverage Report |
| 7 | Confirmation dialogs | **Pre-submit: read-only summary. Status-change: two-panel modal with required-docs gate.** | Real cognitive engagement at financial commitment point only; pre-submit informational |
| 8 | Migration of in-flight data | **Per-institution feature flag, soft-warn on prerequisite, banner-driven adoption for in-flight leads** | Phased rollout de-risks; existing leads at status≥account remain legacy permanently |

### 4.1 Sub-decisions

- **Old bills on swap**: `superseded` (soft-retire), never deleted. Receipts and `billing_receipt_items` rows preserved.
- **Overpayment after swap**: held in `student_credit_balances` by default; "Refund instead" toggle on approval dialog.
- **Notification surface**: badge on billing/onboarding row + bell-icon panel entry; email v2.
- **Edit-safety on structure amount changes**: allowed with warning ("12 leads have already used this structure — their fees are unchanged").
- **Lookup-table scoping**: global for `quotas` and `community_categories`; institution-scoped for `accommodation_types`.
- **Lookup-table seeding**: curated canonical list; observed TEXT values that don't match write a `data_quality_review` row for admin to map.
- **Cutover prerequisite**: soft-warn only ("0 fee structures configured — are you sure?"), don't hard-block.
- **Fee-change-event trigger mechanism**: Postgres trigger on `learners_profiles` UPDATE detects programme/quota/community/accommodation_type/admission_year_id changes when bills exist, inserts the event row, freezes lifecycle. RPC handles approval.
- **Bill generation trigger**: service-level SECURITY DEFINER RPC, NOT a Postgres trigger — single deliberate entry point.

---

## 5. End-to-End Lifecycle

```
admission/leads (CRM stage — unchanged)
   ↓ admit
learners/enquiries (full enquiry form)
   ├─ Course Selection: institution_id, degree_id, department_id, programme_id,
   │                    quota_id, community_category_id, admission_year_id
   ├─ Accommodation:    accommodation_type_id
   ├─ Finance tab (NEW BEHAVIOR):
   │     ├─ "Fee Structure" section (read-only, auto-populated from matrix lookup)
   │     ├─ "Adjustments" section (gated by admission_fees.manage_adjustments)
   │     └─ "Resolved Total" (live computed)
   └─ FINAL SUBMIT
        ↓ pre-submit dialog (read-only summary + Cancel/Submit)
        ↓ admission_resolve_fee_items_for_lead RPC writes resolved fee_items[]
   ↓ status: admitted → pending → approved
   ↓ status='account' transition
        ↓ STATUS-CHANGE DIALOG: fee summary + documents checklist
        ↓ Confirm disabled until all required docs ticked
        ↓ admission_account_transition_with_bills RPC (atomic):
             ├─ Validates fee structure match still resolves (re-runs the lookup)
             ├─ Persists documents to learner_admission_documents
             ├─ Updates lifecycle_status='account'
             ├─ Calls createBillsFromProfile() pattern (idempotent, in same txn)
             └─ Logs activity events
billing/onboarding
   ↓ row appears with bills already present
   ↓ payments collected via existing receipts flow
   ↓ all bills paid → markAsApproved() → status='active'
learners/profiles (active learner — unchanged)

PARALLEL FLOW — fee-change reconciliation:
   UPDATE learners_profiles SET program_id|quota_id|community_category_id|accommodation_type_id|admission_year_id = ...
     IF bills exist for this learner:
       trigger inserts admission_fee_change_events row (status='pending_review')
       lifecycle frozen (markAsApproved blocked while pending events exist)
       notification badge fires on billing/onboarding
   Accounts opens event in fee-change-events panel
   Per-line decisions made (supplemental / credit / refund / reallocate / waive / nothing)
   Approve → admission_approve_fee_change_event RPC (atomic):
       ├─ Old bills: status flips to 'superseded', superseded_by_bill_id set
       ├─ New bills: created from new fee_items
       ├─ Reallocations: NEW billing_receipt_items rows with allocation_reason
       ├─ Excess → student_credit_balances (or refund toggle)
       └─ Lifecycle unfreezes
```

---

## 6. Data Model

### 6.1 New lookup tables (Decision 5 — shadow-FK)

```sql
-- Global lookups
CREATE TABLE quotas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text UNIQUE NOT NULL,
    name text NOT NULL,
    sort_order int DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES profiles(id),
    updated_by uuid REFERENCES profiles(id)
);

CREATE TABLE community_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text UNIQUE NOT NULL,
    name text NOT NULL,
    sort_order int DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES profiles(id),
    updated_by uuid REFERENCES profiles(id)
);

-- Institution-scoped lookup
CREATE TABLE accommodation_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES institutions(id),
    code text NOT NULL,
    name text NOT NULL,
    sort_order int DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    UNIQUE (institution_id, code),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES profiles(id),
    updated_by uuid REFERENCES profiles(id)
);

-- Shadow-FK columns on existing tables (TEXT columns kept, deprecated)
ALTER TABLE learners_profiles
    ADD COLUMN quota_id uuid REFERENCES quotas(id),
    ADD COLUMN community_category_id uuid REFERENCES community_categories(id),
    ADD COLUMN accommodation_type_id uuid REFERENCES accommodation_types(id),
    ADD COLUMN legacy_fee_mode boolean NOT NULL DEFAULT true;

ALTER TABLE admission_leads
    ADD COLUMN quota_id uuid REFERENCES quotas(id),
    ADD COLUMN community_category_id uuid REFERENCES community_categories(id),
    ADD COLUMN accommodation_type_id uuid REFERENCES accommodation_types(id);

-- Indexes for matrix lookup
CREATE INDEX ix_learners_profiles_matrix
    ON learners_profiles (institution_id, degree_id, department_id, program_id,
                          quota_id, community_category_id, accommodation_type_id, admission_year_id);
```

### 6.2 Fee structure tables (Decision 1 + 4)

```sql
CREATE TABLE admission_fee_structures (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES institutions(id),
    degree_id uuid NOT NULL REFERENCES degrees(id),
    department_id uuid NOT NULL REFERENCES departments(id),
    programme_id uuid NOT NULL REFERENCES programs(id),
    quota_id uuid NOT NULL REFERENCES quotas(id),
    community_category_id uuid NOT NULL REFERENCES community_categories(id),
    accommodation_type_id uuid NOT NULL REFERENCES accommodation_types(id),
    admission_year_id uuid NOT NULL REFERENCES admission_years(id),
    name text NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES profiles(id),
    updated_by uuid REFERENCES profiles(id),
    UNIQUE (institution_id, degree_id, department_id, programme_id,
            quota_id, community_category_id, accommodation_type_id, admission_year_id)
);

CREATE INDEX ix_fee_structures_institution_year
    ON admission_fee_structures (institution_id, admission_year_id, status);

CREATE TABLE admission_fee_structure_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fee_structure_id uuid NOT NULL REFERENCES admission_fee_structures(id) ON DELETE CASCADE,
    billing_category_id uuid NOT NULL REFERENCES billing_categories(id),
    amount numeric(15,2) NOT NULL CHECK (amount >= 0),
    is_optional boolean NOT NULL DEFAULT false,
    sort_order int DEFAULT 0,
    UNIQUE (fee_structure_id, billing_category_id)
);
```

### 6.3 Adjustments table (Decision 1 — Option D)

```sql
CREATE TABLE admission_fee_adjustments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id uuid NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
    billing_category_id uuid REFERENCES billing_categories(id),  -- NULL = global adjustment (flat delta)
    reason_code text NOT NULL CHECK (reason_code IN
        ('scholarship_merit','donor_seat','sibling_rebate','management_waiver',
         'fee_concession','staff_ward','financial_hardship','other')),
    reason_notes text,
    delta_amount numeric(15,2) NOT NULL,  -- positive = surcharge, negative = discount
    applied_at timestamptz NOT NULL DEFAULT now(),
    approved_by uuid REFERENCES profiles(id),
    evidence_documents jsonb NOT NULL DEFAULT '[]',
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','reversed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES profiles(id),
    updated_by uuid REFERENCES profiles(id)
);

CREATE INDEX ix_fee_adjustments_learner ON admission_fee_adjustments (learner_id, status);
```

### 6.4 Fee-change reconciliation tables (Decision 2)

```sql
CREATE TABLE admission_fee_change_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id uuid NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
    trigger_field text NOT NULL CHECK (trigger_field IN
        ('program_id','quota_id','community_category_id',
         'accommodation_type_id','admission_year_id','manual')),
    -- Captured at moment of change
    old_program_id uuid,
    old_quota_id uuid,
    old_community_category_id uuid,
    old_accommodation_type_id uuid,
    old_admission_year_id uuid,
    old_fee_structure_id uuid REFERENCES admission_fee_structures(id),
    new_fee_structure_id uuid REFERENCES admission_fee_structures(id),
    status text NOT NULL DEFAULT 'pending_review'
        CHECK (status IN ('pending_review','approved','rejected')),
    reason_notes text,
    requested_by uuid REFERENCES profiles(id),
    decided_by uuid REFERENCES profiles(id),
    requested_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_fee_change_events_pending
    ON admission_fee_change_events (status, learner_id) WHERE status = 'pending_review';

CREATE TABLE admission_fee_change_event_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES admission_fee_change_events(id) ON DELETE CASCADE,
    billing_category_id uuid NOT NULL REFERENCES billing_categories(id),
    old_amount numeric(15,2),  -- NULL when category didn't exist before
    new_amount numeric(15,2),  -- NULL when category removed in new structure
    paid_amount_so_far numeric(15,2) NOT NULL DEFAULT 0,
    decision text CHECK (decision IN
        ('apply_supplemental','issue_credit_note','refund_payment',
         'reallocate_payment','waive_delta','do_nothing')),
    generated_artifact_id uuid,  -- bill or credit-balance row created on approval
    decision_notes text,
    UNIQUE (event_id, billing_category_id)
);
```

### 6.5 Bill schema additions (Decision 2 evolution — supersede)

```sql
ALTER TABLE billing_student_bills
    ADD COLUMN superseded_by_bill_id uuid REFERENCES billing_student_bills(id);

-- Extend status check
ALTER TABLE billing_student_bills
    DROP CONSTRAINT IF EXISTS billing_student_bills_status_check;

ALTER TABLE billing_student_bills
    ADD CONSTRAINT billing_student_bills_status_check
    CHECK (status IN ('unpaid','partially_paid','paid','superseded'));

-- Reason on receipt items for reallocation tracking
ALTER TABLE billing_receipt_items
    ADD COLUMN allocation_reason text NOT NULL DEFAULT 'original_payment'
    CHECK (allocation_reason IN
        ('original_payment','fee_structure_change_reallocation','manual_reallocation'));
```

### 6.6 Credit balance + documents + settings

```sql
CREATE TABLE student_credit_balances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
    amount numeric(15,2) NOT NULL CHECK (amount >= 0),
    source text NOT NULL CHECK (source IN
        ('fee_structure_change','overpayment','refund_reversal','manual')),
    source_event_id uuid,  -- e.g. admission_fee_change_events.id
    is_consumed boolean NOT NULL DEFAULT false,
    consumed_against_bill_id uuid REFERENCES billing_student_bills(id),
    consumed_at timestamptz,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES profiles(id)
);

CREATE INDEX ix_credit_balances_student ON student_credit_balances (student_id, is_consumed);

CREATE TABLE learner_admission_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id uuid NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
    doc_type text NOT NULL,
    is_received boolean NOT NULL DEFAULT false,
    received_at timestamptz,
    received_by uuid REFERENCES profiles(id),
    received_via text CHECK (received_via IN ('physical','email','upload')),
    document_ref text,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (learner_id, doc_type)
);

CREATE TABLE admission_settings_per_institution (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL UNIQUE REFERENCES institutions(id),
    use_fee_structures boolean NOT NULL DEFAULT false,
    required_documents_for_account_transition jsonb NOT NULL DEFAULT
        '["pan","aadhaar","parent_id","agreement_form"]'::jsonb,
    pre_submit_dialog_enabled boolean NOT NULL DEFAULT true,
    status_change_dialog_enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES profiles(id),
    updated_by uuid REFERENCES profiles(id)
);
```

---

## 7. Resolution Engine

`learners_profiles.fee_items[]` is no longer hand-typed. It is a **resolved output** computed by a single SECURITY DEFINER RPC and persisted at three moments:

1. **Enquiry submit** — first computation
2. **Adjustment add/remove/edit** — recompute incrementally
3. **Fee-change-event approval** — recompute fully and supersede old bills if any

```sql
CREATE OR REPLACE FUNCTION admission_resolve_fee_items_for_lead(p_learner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_lead record;
    v_structure_id uuid;
    v_fee_items jsonb;
    v_adjustments jsonb;
    v_final jsonb;
BEGIN
    -- 1. Load lead's matrix dimensions
    SELECT institution_id, degree_id, department_id, program_id,
           quota_id, community_category_id, accommodation_type_id, admission_year_id
      INTO v_lead
      FROM learners_profiles
     WHERE id = p_learner_id;

    -- 2. Lookup matching active fee structure
    SELECT id INTO v_structure_id
      FROM admission_fee_structures
     WHERE institution_id        = v_lead.institution_id
       AND degree_id             = v_lead.degree_id
       AND department_id         = v_lead.department_id
       AND programme_id          = v_lead.program_id
       AND quota_id              = v_lead.quota_id
       AND community_category_id = v_lead.community_category_id
       AND accommodation_type_id = v_lead.accommodation_type_id
       AND admission_year_id     = v_lead.admission_year_id
       AND status = 'active'
     LIMIT 1;

    -- 3. No match → return empty array (caller handles UX)
    IF v_structure_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    -- 4. Base fee items from structure
    SELECT jsonb_agg(jsonb_build_object(
                'category_id',   fsi.billing_category_id,
                'category_name', bc.category_name,
                'amount',        fsi.amount,
                'source',        'structure'))
      INTO v_fee_items
      FROM admission_fee_structure_items fsi
      JOIN billing_categories bc ON bc.id = fsi.billing_category_id
     WHERE fsi.fee_structure_id = v_structure_id;

    -- 5. Apply active adjustments
    --    (full algorithm in implementation: per-category deltas merged, global adjustments appended,
    --     amounts clamped to >= 0)
    -- ...

    RETURN v_final;
END;
$$;
```

The full implementation handles:
- Per-category adjustment merging (matching `billing_category_id`) — sums `delta_amount` into the base
- Global adjustments (`billing_category_id IS NULL`) — appended as synthetic rows with `source='adjustment'` for visibility
- Negative-amount clamp to zero (with audit log entry on clamp)
- No-match return distinguishable from empty match (sentinel value)

---

## 8. Service Layer

### 8.1 New service files (matching the `assignment-rules` house style)

| File | Responsibility |
|---|---|
| `lib/services/admission/fee-structure-service.ts` | CRUD on `admission_fee_structures` + `_items`. Methods: `list()`, `get()`, `create()`, `update()`, `archive()`, `cloneToAcademicYear(srcId, newYearId)`, `findByDimensions(...)`, `getCoverageReport(institutionId, academicYearId)`. |
| `lib/services/admission/fee-adjustment-service.ts` | CRUD on `admission_fee_adjustments`. Triggers `resolve_fee_items` on every change. |
| `lib/services/admission/fee-change-event-service.ts` | List pending events, fetch event detail with delta lines, invoke approval RPC. |
| `lib/services/admission/admission-document-service.ts` | `learner_admission_documents` CRUD. Used by status-change dialog. |
| `lib/services/admission/admission-settings-service.ts` | Read/write `admission_settings_per_institution`. v1 read-only from UI; v2 admin UI. |
| `lib/services/admission/lookup-service.ts` | List/search `quotas`, `community_categories`, `accommodation_types`. |

### 8.2 Extensions to existing services

- `lib/services/admission/lead-service.ts` — on enquiry submit, calls `admission_resolve_fee_items_for_lead` RPC and persists into `learners_profiles.fee_items`. Blocks submit if `legacy_fee_mode=false` AND no match.
- `lib/services/billing/onboarding/onboarding-service.ts`:
  - `markAsAccount` → thin wrapper invoking `admission_account_transition_with_bills` RPC
  - `markAsApproved` → adds precondition: no `pending_review` `admission_fee_change_events` for this learner

### 8.3 SECURITY DEFINER RPCs (3 new)

#### 8.3.1 Atomic transition + bill generation

```sql
CREATE OR REPLACE FUNCTION admission_account_transition_with_bills(
    p_learner_id uuid,
    p_required_documents jsonb,
    p_received_documents jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_resolved_items jsonb;
    v_missing_docs jsonb;
BEGIN
    -- Permission check
    IF NOT user_has_permission('admission_documents.manage') THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;

    -- Validate fee structure still resolves (in case structure changed between enquiry submit and now)
    v_resolved_items := admission_resolve_fee_items_for_lead(p_learner_id);
    IF jsonb_array_length(v_resolved_items) = 0 THEN
        -- Allowed only if legacy_fee_mode=true
        PERFORM 1 FROM learners_profiles WHERE id = p_learner_id AND legacy_fee_mode = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'fee_structure_not_resolvable';
        END IF;
    ELSE
        UPDATE learners_profiles SET fee_items = v_resolved_items WHERE id = p_learner_id;
    END IF;

    -- Validate all required documents present
    -- ... (set difference between p_required_documents and p_received_documents.keys)

    -- Persist documents
    INSERT INTO learner_admission_documents (learner_id, doc_type, is_received, received_at, received_via, document_ref)
    SELECT p_learner_id, ... FROM jsonb_array_elements(p_received_documents);

    -- Update lifecycle
    UPDATE learners_profiles SET lifecycle_status = 'account', updated_at = now() WHERE id = p_learner_id;

    -- Generate bills (idempotent — skips if any exist)
    -- ... reuses createBillsFromProfile pattern, called inline in plpgsql

    -- Log activity
    PERFORM log_user_activity('lifecycle.account_transition', ...);

    RETURN jsonb_build_object('success', true, 'bills_generated', ...);
END;
$$;
```

#### 8.3.2 Approve fee-change event

```sql
CREATE OR REPLACE FUNCTION admission_approve_fee_change_event(
    p_event_id uuid,
    p_line_decisions jsonb,        -- [{billing_category_id, decision, reallocation_amount?}]
    p_refund_excess boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    -- Permission check (admission_fees.approve_change_event)
    -- For each line: write the decided artifact (supplemental bill / credit note / refund / reallocation)
    --   - Old bills covering removed/changed categories: status='superseded', superseded_by_bill_id set
    --   - New bills: created from new fee_items
    --   - Reallocations: NEW billing_receipt_items rows pointing at new bills with allocation_reason='fee_structure_change_reallocation'
    --     Original receipt_items rows are NEVER mutated.
    --   - Excess: row in student_credit_balances OR refund initiation if p_refund_excess=true
    -- Update event status='approved', decided_by, decided_at
    -- Log activity events for each artifact
    RETURN jsonb_build_object('success', true, ...);
END;
$$;
```

#### 8.3.3 Resolve fee items (shown in §7)

### 8.4 Postgres trigger (the only one needed)

```sql
CREATE OR REPLACE FUNCTION trigger_detect_fee_dimension_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW.program_id, NEW.quota_id, NEW.community_category_id, NEW.accommodation_type_id, NEW.admission_year_id)
       IS DISTINCT FROM
       (OLD.program_id, OLD.quota_id, OLD.community_category_id, OLD.accommodation_type_id, OLD.admission_year_id)
       AND EXISTS (SELECT 1 FROM billing_student_bills WHERE student_id = NEW.id AND status != 'superseded')
       AND NEW.legacy_fee_mode = false
    THEN
        INSERT INTO admission_fee_change_events (
            learner_id, trigger_field, old_program_id, old_quota_id, old_community_category_id,
            old_accommodation_type_id, old_admission_year_id, old_fee_structure_id, new_fee_structure_id,
            requested_by
        ) VALUES (
            NEW.id, ...,
            -- Look up matching fee_structure_ids for OLD and NEW dimension sets
            current_setting('request.jwt.claim.sub', true)::uuid
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_detect_fee_dimension_change
    AFTER UPDATE ON learners_profiles
    FOR EACH ROW EXECUTE FUNCTION trigger_detect_fee_dimension_change();
```

---

## 9. UI Surfaces

### 9.1 Fee-structure builder — `app/(routes)/admission/settings/fees-structure/`

Tree-rail hybrid (Decision 6 — Option D).

```
app/(routes)/admission/settings/fees-structure/
  page.tsx                              -- breadcrumb, PermissionGuard module='admission.settings' action='view',
                                          AdmissionErrorBoundary, renders the split-pane shell
  _components/
    fees-structure-tree-rail.tsx        -- left rail: collapsible tree (institution → degree → department →
                                          programme → quota → community → accommodation → year). Each leaf
                                          shows category-count badge. Red badge = zero coverage.
    fees-structure-form.tsx             -- right pane (Form mode): edit one leaf — billing_category multi-add
                                          + amount input per row, save = upsert structure + items
    fees-structure-clone-dialog.tsx     -- Clone mode: source selector + "Clone for academic year YYYY-YYYY"
                                          and "Clone with overrides" actions
    fees-structure-coverage-report.tsx  -- toggle in tree rail header; filters tree to zero-coverage leaves
    fees-structure-grid.tsx             -- v1.5 only (Grid mode)
    columns.tsx                         -- list-view columns
    row-actions.tsx                     -- view/edit/clone/archive dropdown
```

**Behaviors:**

- Form mode default for v1
- Clone "Clone for academic year": duplicates row with new `admission_year_id`, opens Form mode for tweaks
- Clone "with overrides": same dimensions pre-filled, operator changes 1-2, opens Form mode
- Edit dialog (AlertDialog) for amount changes; inline edit only in Grid mode (v1.5)
- Edit-with-warning: when editing amounts on a structure already used by N admitted leads, show "12 leads have already used this structure — their fees are unchanged. Continue?" before commit
- Coverage Report toggle filters tree to zero-coverage leaves; counsellor-friendly gap surfacing

### 9.2 Finance tab — updated `learners/enquiries/_components/form-sections/finance-details.tsx`

Three vertical sections, replacing the current free-form repeater:

1. **Fee Structure (read-only)**:
   - Header: "Auto-populated from: <fee_structure.name>" + link to settings module
   - Read-only table: category_name | amount, greyed
   - **No-match empty state**: "No fee structure configured for (B.Tech CSE / Govt Quota / OC / Hostel / 2026-2027). [Configure now] (admin link) or [Adjust selections]" — submit blocked
2. **Adjustments** (gated by `admission_fees.manage_adjustments`):
   - "+ Add Adjustment" button → small dialog: reason_code dropdown + delta_amount input (signed) + notes textarea + evidence_documents file upload
   - Each adjustment row: category | reason | delta | Edit | Remove
   - Adjustments either reference a `billing_category_id` (per-category) or are global (NULL)
3. **Resolved Total (read-only)**:
   - Live computed sum: structure rows + adjustments
   - This is what gets persisted as `fee_items[]`

**Legacy banner** when `legacy_fee_mode=true`:
- "This lead uses legacy manual fee entry. [Migrate to fee structure]" (admin-only action)
- Migrate flow: shows preview side-by-side (current `fee_items[]` vs structure-derived); admin confirms; writes new `fee_items[]` and flips the flag

### 9.3 Pre-submit confirmation dialog

- Triggered on enquiry final-submit
- Disabled-by-config per `admission_settings_per_institution.pre_submit_dialog_enabled`
- Modal title: "Confirm enquiry submission"
- Body: lead name + matched fee_structure.name + categories table + adjustments list + grand total
- Buttons: Cancel | Submit
- Read-only — no theatre per Decision 7

### 9.4 Status-change confirmation dialog (the load-bearing one)

- Triggered on lifecycle_status: approved → account
- Modal title: "Move to Account stage"
- **Top panel**: fee summary table + adjustments + grand total
- **Bottom panel**: documents checklist
  - Required docs from `admission_settings_per_institution.required_documents_for_account_transition`
  - Each row: doc_type label + checkbox + (when ticked) received_via dropdown + optional document_ref input
- Confirm button **disabled until all required docs ticked**
- On Confirm: invokes `admission_account_transition_with_bills` RPC

### 9.5 Fee-change-event review surface

- New surface: bell-icon notification panel on `app/(routes)/billing/onboarding/page.tsx` header
- Badge count = pending events for this institution
- Click bell → panel listing pending events; click event → opens per-event modal
- Per-event modal:
  - Header: lead name + trigger field + reason_notes
  - Side-by-side delta table: `[category | old_amount | paid_so_far | new_amount | decision_dropdown]`
  - Decision dropdown per row: apply_supplemental / issue_credit_note / refund_payment / reallocate_payment / waive_delta / do_nothing
  - Bottom: "Approve" button → invokes `admission_approve_fee_change_event` RPC | "Reject" button → writes event status='rejected', notes required
- Optional "Refund excess on approval" toggle below the delta table
- Component path: `app/(routes)/billing/onboarding/_components/fee-change-events-panel.tsx`

---

## 10. Permissions & RLS

### 10.1 New permission keys

| Key | Granted to | Purpose |
|---|---|---|
| `admission_fees.read` | counsellor, admin, finance head | View fee structures + Finance tab |
| `admission_fees.manage` | admin, finance head | CRUD on fee structures |
| `admission_fees.manage_adjustments` | admin, finance head | Add/remove adjustments on enquiries |
| `admission_fees.override` | finance head only | Edit `fee_items` directly on legacy rows |
| `admission_fees.approve_change_event` | finance head, admission head | Approve/reject fee-change events |
| `admission_documents.manage` | admin, accounts | Record documents in status-change dialog |
| `billing.bill.supersede` | system only | RPC-internal; granted via SECURITY DEFINER context |

### 10.2 RLS policies

- All institution-scoped tables protected by `role_has_institution_access(institution_id)` per project pattern (per memory `feedback_dashboard_rpc_role_access_check.md`)
- All writes pass through `user_has_permission()` check inline in RPCs (per memory `feedback_user_roles_insert_needs_security_definer_rpc.md` — never client-side INSERT for permission-gated tables)
- Settings tables (`admission_settings_per_institution`) — read by anyone in institution, write only by admin
- All RPCs declared `SECURITY DEFINER` — they bypass RLS for the operations they perform but check permissions internally

### 10.3 Error-checking discipline

- Per memory `feedback_supabase_mutations_must_check_error.md`: every Supabase mutation in service layer destructures `{error}` and surfaces it. Try/catch is not enough.
- Per memory `feedback_placeholder_migrations_hide_typos.md`: every migration commits its full body; no `SELECT 1;` placeholders.

---

## 11. Activity Logging Events

Mirroring the resource-management precedent (commit `e8fa0bdef`):

| Event | Source | When |
|---|---|---|
| `fee_structure.created` | service | Admin creates a structure |
| `fee_structure.updated` | service | Amount or status changed |
| `fee_structure.archived` | service | Status flipped to 'archived' |
| `fee_structure_item.added/updated/removed` | service | Per-item edits |
| `fee_adjustment.added/updated/removed/reversed` | service | Adjustment edits |
| `enquiry.fee_resolved` | RPC | `admission_resolve_fee_items_for_lead` writes into `fee_items` |
| `enquiry.fee_match_failed` | RPC | Resolve returns empty (no-match warning logged for analytics) |
| `lifecycle.account_transition` | RPC | `admission_account_transition_with_bills` |
| `documents.received` | RPC | Per doc in status-change dialog |
| `bill.auto_generated` | RPC | Each new bill in account-transition |
| `bill.superseded` | RPC | `admission_approve_fee_change_event` |
| `receipt_item.reallocated` | RPC | Per reallocation in approve event |
| `student_credit_balance.created` | RPC | Excess after swap |
| `student_credit_balance.consumed` | service | When applied to a future bill |
| `fee_change_event.requested` | trigger | Postgres trigger on dimension change |
| `fee_change_event.approved` | RPC | Approval RPC |
| `fee_change_event.rejected` | service | Rejection action |

---

## 12. Migration & Rollout

### 12.1 Cutover sequence per institution

1. **Phase 1 — Additive deploy (zero behavior change)**
   Deploy schema migrations, lookup tables, service layer, UI. All institutions: `use_fee_structures = false`.
2. **Phase 2 — Lookup-table backfill**
   Populate `quotas`, `community_categories`, `accommodation_types` with curated canonical lists. For each observed TEXT value in existing `learners_profiles.quota` / `community` / `accommodation_type`, attempt match. Unmatched values write a `data_quality_review` row for admin to map manually.
3. **Phase 3 — Per-institution config**
   Institution admin opens `admission/settings/fees-structure`, configures matrix for current and next academic years. Clone mode encouraged for year-over-year roll.
4. **Phase 4 — Flip the flag**
   Admin sets `use_fee_structures = true` for that institution. Soft-warning if zero structures configured.
5. **Phase 5 — In-flight handling**
   - Existing rows at `lifecycle_status IN ('account','active','inactive','exited','graduated','alumni')`: `legacy_fee_mode = true` permanently. Never touched.
   - Existing rows at `lifecycle_status IN ('admitted','pending','approved')`: banner appears on Finance tab — "Adopt structure-derived fees? [Preview & confirm]"
     - Preview: side-by-side current `fee_items[]` vs structure-derived
     - Confirm: writes new `fee_items[]`, flips `legacy_fee_mode = false`, logs activity
6. **Phase 6 (v2)**: Drop deprecated TEXT columns (`learners_profiles.quota`, `community`, `accommodation_type`) once all callers migrated.

### 12.2 Rollback

Feature flag `use_fee_structures = false` instantly reverts to legacy behavior. New tables persist (no harm) but are unused. Per-institution rollback isolated.

---

## 13. Testing Strategy

### 13.1 Unit tests

- `admission_resolve_fee_items_for_lead` algorithm:
  - Structure-only (no adjustments)
  - Structure + per-category adjustments (positive + negative deltas)
  - Structure + global adjustment (NULL category)
  - No-match returns empty array
  - Negative-clamp behavior

### 13.2 Integration tests (RPC-level)

- Full enquiry submit → resolved `fee_items[]` persisted
- Status='account' transition with documents → bills generated, all in one transaction; rollback if any step fails
- Status='account' transition blocked when required documents incomplete
- Fee-change-event approval: each decision type (supplemental, credit, refund, reallocate, waive, nothing)
- Fee-change-event approval: paid-bill swap preserves receipts; new receipt_items rows created with `allocation_reason='fee_structure_change_reallocation'`
- Fee-change-event approval: excess goes to credit balance OR refund based on toggle
- Lifecycle frozen while pending event exists (markAsApproved blocked)

### 13.3 Migration tests

- Backfill script idempotency
- Banner-driven adoption preserves prior `fee_items[]` as a savepoint (snapshot in activity log)
- Rollback restores pre-adoption state
- Lookup-table backfill from observed TEXT values; data_quality_review rows for misses

### 13.4 RLS & permission tests

- Cross-institution access denied (per `role_has_institution_access`)
- Counsellor cannot edit fee structures (admission_fees.manage required)
- Counsellor cannot add adjustments (admission_fees.manage_adjustments required)
- Admin can override `fee_items` only on `legacy_fee_mode=true` rows

### 13.5 No-match UX tests

- Enquiry submit blocked when no matching structure (and `legacy_fee_mode=false`)
- Status='account' transition validates structure resolution at commit time
- Empty-state Finance tab renders correct admin link to fee-structure builder

### 13.6 Edge cases

- Lookup-table mid-flight rename (e.g. quota "OBC" → "OBC-NCL"): existing leads keep old `quota_id` FK, fee structure lookup continues to resolve
- Fee structure status flipped to 'archived' while leads in flight: existing `fee_items[]` snapshots persist (resolved at submit time); only future submits affected
- Two simultaneous adjustments on same enquiry by different operators: last-write-wins on the JSONB resolve, but each adjustment row has its own audit trail

---

## 14. Out-of-Scope (Deferred to v2)

| Item | Reason |
|---|---|
| Bulk fee-change workflow for statutory revisions | Full design needed; v1 supports individual events |
| Grid-mode editor in fee-structure builder | Productivity boost, not blocking |
| Bulk-edit / percentage-based revisions | Same as above |
| Admin UI for `admission_settings_per_institution` | Initial config via SQL/seed acceptable; admin UI is polish |
| Email notifications for fee-change-events | Badge + bell-icon panel sufficient v1 |
| Drop deprecated TEXT columns | Risk-mitigation; v1 keeps backward compat |
| Refund automation | Refunds still go through existing `billing_refunds` UI |
| Multi-currency / international student fees | Out of scope entirely |

---

## 15. Open Items / Risks

| Item | Mitigation |
|---|---|
| **Lookup-table seeding accuracy** — observed TEXT values may not all map cleanly | data_quality_review queue; admin reviews before flag flip |
| **Coverage gap discovery time** — operators only learn a structure is missing when an enquiry hits Finance tab | Coverage Report toggle in builder makes gaps visible upfront; soft-warn on flag flip |
| **Fee-change trigger correctness** — Postgres trigger inserting events on every dimension UPDATE could over-fire if dimensions are normalized in non-functional updates | Trigger checks `IS DISTINCT FROM` and `EXISTS bills WHERE not superseded`; trigger does NOT fire when `legacy_fee_mode=true` |
| **Receipt-items uniqueness** — multiple `billing_receipt_items` rows for the same `receipt_id`-`bill_id` pair with different `allocation_reason` | Schema explicitly allows this; queries reading "amount paid against bill X" must SUM across all reasons |
| **Concurrent adjustment edits** — two operators edit adjustments simultaneously | Optimistic concurrency on `learners_profiles.fee_items` + `updated_at`; resolve RPC re-runs |
| **Trigger interaction with `legacy_fee_mode` flip** — flipping legacy_fee_mode itself updates the row but should NOT fire fee-change-event | Trigger explicitly checks `OLD.legacy_fee_mode = false AND NEW.legacy_fee_mode = false` |
| **`role_has_institution_access` correctness** — per memory `feedback_user_accessible_institutions_must_honor_role_scope.md`, drift between SQL function and RLS semantics silently hides data | All new institution-scoped queries verified against same helper; integration tests with super-admin and institution-admin roles |

---

## 16. Appendix — File Path Index

### 16.1 New files

```
app/(routes)/admission/settings/fees-structure/
  page.tsx
  _components/
    fees-structure-tree-rail.tsx
    fees-structure-form.tsx
    fees-structure-clone-dialog.tsx
    fees-structure-coverage-report.tsx
    fees-structure-grid.tsx              (v1.5)
    columns.tsx
    row-actions.tsx

app/(routes)/billing/onboarding/_components/
  fee-change-events-panel.tsx

lib/services/admission/
  fee-structure-service.ts
  fee-adjustment-service.ts
  fee-change-event-service.ts
  admission-document-service.ts
  admission-settings-service.ts
  lookup-service.ts

types/admission.ts                       (extend with FeeStructure, FeeAdjustment, FeeChangeEvent, etc.)

supabase/migrations/
  YYYYMMDD_lookup_tables_quotas_communities_accommodations.sql
  YYYYMMDD_admission_fee_structures.sql
  YYYYMMDD_admission_fee_adjustments.sql
  YYYYMMDD_admission_fee_change_events.sql
  YYYYMMDD_billing_bill_supersede_columns.sql
  YYYYMMDD_student_credit_balances.sql
  YYYYMMDD_learner_admission_documents.sql
  YYYYMMDD_admission_settings_per_institution.sql
  YYYYMMDD_rpc_admission_resolve_fee_items_for_lead.sql
  YYYYMMDD_rpc_admission_account_transition_with_bills.sql
  YYYYMMDD_rpc_admission_approve_fee_change_event.sql
  YYYYMMDD_trigger_detect_fee_dimension_change.sql
```

### 16.2 Modified files

```
app/(routes)/learners/enquiries/_components/form-sections/finance-details.tsx
  — replace free-form repeater with three sections: structure (read-only), adjustments, resolved total
  — legacy banner for legacy_fee_mode=true rows

app/(routes)/admission/nav-config.ts
  — add 'fees-structure' to settings sub-modules

lib/services/admission/lead-service.ts
  — on submit, invoke admission_resolve_fee_items_for_lead RPC, persist into learners_profiles.fee_items
  — block submit if legacy_fee_mode=false AND no match

lib/services/billing/onboarding/onboarding-service.ts
  — markAsAccount: thin wrapper for admission_account_transition_with_bills RPC
  — markAsApproved: precondition check on pending fee_change_events

lib/services/admission/lead-service.ts (status transitions)
  — status='account' transition surfaces the new dialog

lib/sidebarMenuLink.ts
  — register fees-structure permission keys
```

### 16.3 Reference memories applied

- `feedback_user_roles_insert_needs_security_definer_rpc.md` — all permission-gated writes via SECURITY DEFINER RPC
- `feedback_supabase_mutations_must_check_error.md` — explicit `{error}` destructure on every Supabase write
- `feedback_placeholder_migrations_hide_typos.md` — every migration committed with full body
- `feedback_dashboard_rpc_role_access_check.md` — institution-scoped RPCs check `role_has_institution_access` inside CTEs/WHEREs
- `feedback_user_accessible_institutions_must_honor_role_scope.md` — service-layer institution filters mirror RLS semantics
- `feedback_postgres_trigger_doublelogging.md` — confirm no auto-loggers on tables we INSERT into from SECURITY DEFINER RPCs
- `feedback_supabase_econnreset_use_withretry.md` — server-side calls use `lib/retry.ts withRetry()`
- `project_admission_year_fk_migration.md` — playbook reused for shadow-FK migration of quota/community/accommodation
- `project_counselor_taxonomy.md` — permission gates use `role IN (...)` not single-key checks where applicable

---

## 17. Sign-off Gate

**Before implementation begins**:
- [ ] User reviews this spec end-to-end
- [ ] User confirms decisions in §4 are correct
- [ ] User flags any sections that need revision
- [ ] Spec committed to git

**After sign-off**:
- Transition to `superpowers:writing-plans` skill
- Produce phase-by-phase implementation plan with task breakdown, dependency analysis, and goal-backward verification

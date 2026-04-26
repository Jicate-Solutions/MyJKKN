# Spec: Capital Purchase Approvals — Queue Gap Fill

**Status**: SPEC ONLY (no code, no migration, no PR this session per Director's directive)
**Stream**: D-4 (per /cnext brief 2026-04-26)
**Source signal**: Google Chat audit 2025-04-26 → 2026-04-26 → **19 decision-requests in 365 days**. **6× growth** between 90d → 365d windows (steepest growth curve in the audit).
**Stakeholders**: Procurement / Inventory team, Department heads, Finance / Accounts, Director
**Approver in current chat workflow**: Director (Omm)

---

## Why This Spec Exists

Capital purchases — equipment, machinery, infrastructure, lab apparatus, IT hardware, furniture, vehicles — flow through Google Chat as multi-stakeholder approval threads. Department heads request, Procurement researches vendor/quote, Finance checks budget, Director gives final go-ahead. The 6× growth between 90d and 365d windows says this volume is rising — and chat threads scale poorly when they cross 4+ stakeholders.

MyJKKN already has a `service_requests` table (per memory `feedback_sweep_must_include_generic_frameworks.md`) that handles small operational asks (printer toner, minor repairs). Capital purchases are NOT the same workflow — they require quote-comparison, multi-stakeholder sign-off, asset registration post-purchase. Worth a dedicated table + flow.

---

## §1 — User Stories

### Department head submits capital purchase request

> *As an HOD, I want to file a capital purchase request with quantity, justification, expected vendor list, and target purchase date, so Procurement can start vendor research and Finance can confirm budget allocation, all without creating a 50-message chat thread.*

### Procurement adds vendor quotes

> *As Procurement, I want to attach 2–3 vendor quotes with comparison notes to the request, so Director can see options side-by-side before approving.*

### Finance confirms budget

> *As Finance, I want to confirm budget head + amount + fiscal-year availability before the request reaches Director's queue, so Director isn't approving requests that can't actually be funded.*

### Director approves / vetoes

> *As Director, I want a queue of capital-purchase requests with full context (quotes, budget confirmation, justification) so I can approve in <2 minutes per request, not via 30-message chat reconciliation.*

### Asset registration

> *As Inventory team, I want approved purchases to auto-create asset records once the PO is placed, so we don't lose track of equipment.*

---

## §2 — Schema Sketch (NOT a migration — for design only)

```sql
-- Table: capital_purchase_approvals
-- Belongs in supabase/setup/01_tables.sql when implemented (date-stamped comment).

CREATE TABLE capital_purchase_approvals (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id           UUID NOT NULL REFERENCES institutions(id),
  -- Submitter
  submitted_by             UUID NOT NULL REFERENCES profiles(id),
  submitter_role           VARCHAR(50),                       -- 'hod','principal','department_admin','procurement'
  department_id            UUID REFERENCES departments(id),
  submitted_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- What's being purchased
  purchase_category        VARCHAR(50) NOT NULL,              -- 'equipment','machinery','infrastructure','lab_apparatus','it_hardware','furniture','vehicle','software_license','other'
  item_description         TEXT NOT NULL,                     -- 'Centrifuge model XYZ-500 for biotech lab'
  quantity                 INT NOT NULL DEFAULT 1,
  estimated_unit_price     NUMERIC(12,2),
  estimated_total          NUMERIC(12,2) GENERATED ALWAYS AS (quantity * COALESCE(estimated_unit_price,0)) STORED,
  currency                 CHAR(3) DEFAULT 'INR',
  target_purchase_date     DATE,                              -- by-when needed
  -- Justification
  justification            TEXT NOT NULL,                     -- why this is needed; 2-5 sentences
  alternatives_considered  TEXT,                              -- "rented for 6 months — need to own now because..."
  expected_lifetime_years  INT,                               -- depreciation horizon
  -- Vendor quotes (filled by procurement)
  vendor_quotes            JSONB DEFAULT '[]',                -- [{vendor_name, quote_amount, quote_url, lead_time_days, notes}, ...]
  procurement_recommendation TEXT,                            -- procurement's "we recommend Vendor X because..."
  procurement_filled_by    UUID REFERENCES profiles(id),
  procurement_filled_at    TIMESTAMPTZ,
  -- Budget (filled by finance)
  budget_head              VARCHAR(100),                      -- accounting-system code
  fiscal_year              VARCHAR(10),                       -- '2026-2027'
  budget_confirmed         BOOLEAN DEFAULT FALSE,
  budget_confirmed_by      UUID REFERENCES profiles(id),
  budget_confirmed_at      TIMESTAMPTZ,
  budget_notes             TEXT,                              -- "shortfall ₹2L — need carry-over from last quarter"
  -- Approval state machine
  status                   VARCHAR(30) NOT NULL DEFAULT 'pending_quotes',
                           -- 'pending_quotes','pending_budget','pending_approval','approved','rejected','withdrawn','po_placed','received','closed'
  status_blocked_reason    TEXT,                              -- if stuck waiting on someone
  final_approver_id        UUID REFERENCES profiles(id),      -- defaults to Director on transition to pending_approval
  approved_by              UUID REFERENCES profiles(id),
  approved_at              TIMESTAMPTZ,
  rejection_reason         TEXT,
  -- Post-approval
  po_number                VARCHAR(50),                       -- PO from procurement system once placed
  po_placed_at             TIMESTAMPTZ,
  received_at              TIMESTAMPTZ,                       -- when goods landed
  asset_record_ids         UUID[] DEFAULT '{}',               -- if it auto-registered into assets table (future)
  -- Audit
  metadata                 JSONB DEFAULT '{}',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cpa_status_submitted ON capital_purchase_approvals(status, submitted_at);
CREATE INDEX idx_cpa_institution ON capital_purchase_approvals(institution_id);
CREATE INDEX idx_cpa_approver ON capital_purchase_approvals(final_approver_id) WHERE status='pending_approval';
CREATE INDEX idx_cpa_dept ON capital_purchase_approvals(department_id);
```

---

## §3 — RLS Sketch

```sql
-- SELECT: super_admin + user_has_permission('finance.capital_purchase.view')
--           + role_has_institution_access(institution_id)
-- INSERT: user_has_permission('finance.capital_purchase.submit')
-- UPDATE:
--   - submitted_by=auth.uid() can update while status='pending_quotes'
--   - procurement role can update vendor_quotes/procurement_* fields while status IN ('pending_quotes','pending_budget')
--   - finance role can update budget_* fields while status IN ('pending_quotes','pending_budget')
--   - super_admin / director can transition status to approved/rejected
--   - any role with own access can withdraw their own request (set status='withdrawn')
-- DELETE: super_admin only
```

New permission keys for `lib/constants/permissions.ts`:
- `finance.capital_purchase.view`
- `finance.capital_purchase.submit`
- `finance.capital_purchase.fill_quotes` (procurement)
- `finance.capital_purchase.confirm_budget` (finance/accounts)
- `finance.capital_purchase.approve` (director)
- `finance.capital_purchase.record_po` (procurement post-approval)

Roles that should get these by default:
- `super_admin` — all
- `accounts` — confirm_budget, view
- `procurement` (NEW role? or extend `accounts`?) — fill_quotes, record_po, view
- `hod` — submit, view (own dept only)
- `principal` — submit, view (own institution)

---

## §4 — Generator Outline (queue work-item emission)

Function: `fn_generate_capital_purchase_approval_items` (additive to `fn_generate_all_dashboard_work_items` orchestrator).

```sql
CREATE OR REPLACE FUNCTION fn_generate_capital_purchase_approval_items()
RETURNS INT AS $$
DECLARE
  v_created INT := 0;
  v_row RECORD;
  v_target UUID;
  v_key TEXT;
  v_priority TEXT;
BEGIN
  FOR v_row IN
    SELECT id, item_description, purchase_category, estimated_total, currency,
           target_purchase_date, final_approver_id, status,
           EXTRACT(EPOCH FROM (NOW() - submitted_at))/3600 AS hours_pending
    FROM capital_purchase_approvals
    WHERE status = 'pending_approval'              -- already past quotes + budget
      AND submitted_at < NOW() - INTERVAL '12 hours'  -- give director 12h to opt-in proactively
      AND submitted_at > NOW() - INTERVAL '90 days'
    ORDER BY estimated_total DESC NULLS LAST, submitted_at ASC
    LIMIT 50
  LOOP
    v_target := COALESCE(v_row.final_approver_id, fn_resolve_dashboard_target(NULL));  -- Stream A helper
    IF v_target IS NULL THEN CONTINUE; END IF;
    v_priority := CASE WHEN v_row.estimated_total >= 500000 THEN 'urgent'    -- ≥ ₹5L
                       WHEN v_row.estimated_total >= 100000 THEN 'high'      -- ≥ ₹1L
                       ELSE 'normal' END;
    v_key := 'capital_purchase:' || v_row.id::text || ':' || CURRENT_DATE::text;
    v_created := v_created + fn_create_dashboard_work_item(
      'dashboard:approval',
      v_priority,
      'Capital purchase pending: ' || LEFT(v_row.item_description, 80),
      'Total ' || COALESCE(v_row.currency,'INR') || ' ' ||
        COALESCE(v_row.estimated_total::text, 'TBD') ||
        ' | category: ' || v_row.purchase_category ||
        CASE WHEN v_row.target_purchase_date IS NOT NULL
             THEN ' | needed by ' || v_row.target_purchase_date::text
             ELSE '' END,
      jsonb_build_object(
        'cpa_id', v_row.id,
        'estimated_total', v_row.estimated_total,
        'currency', v_row.currency,
        'category', v_row.purchase_category,
        'url', '/admin/capital-purchase/' || v_row.id::text
      ),
      v_target, v_key,
      CASE WHEN v_priority = 'urgent' THEN 8 ELSE 48 END
    );
  END LOOP;
  RETURN v_created;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
```

Wire into `fn_generate_all_dashboard_work_items` orchestrator alongside the existing 7 generators.

**Note**: this generator only fires for `status='pending_approval'`. Earlier states (`pending_quotes`, `pending_budget`) emit to OTHER queues (procurement queue, finance queue) — separate generators not specified here. v1 can ship Director-side approval queue first, leave procurement/finance queue for v2.

---

## §5 — Intake Form Sketch (UI)

### Route: `/admin/capital-purchase/submit`

Three visible Phase 1A fields:

1. **What + how many** — `purchase_category` dropdown + `item_description` text + `quantity` int
2. **Why** — `justification` textarea (2-5 sentences)
3. **By when** — `target_purchase_date`

Progressive (advanced) fields:
- `estimated_unit_price` + `currency` (auto-computes `estimated_total`)
- `alternatives_considered` textarea
- `expected_lifetime_years`
- `department_id` (auto-filled from `submitted_by` profile)

Pre-filled from `auth.uid()`:
- `submitted_by`
- `submitter_role` (from `profiles.role`)
- `institution_id` (from `profiles.institution_id`)
- `department_id` (from submitter's primary dept)

### Route: `/admin/capital-purchase/[id]` (status + workflow page)

- Shows full request with timeline.
- Procurement role sees vendor-quote-add UI when `status='pending_quotes'`.
- Finance role sees budget-confirmation UI when `status='pending_budget'`.
- Director sees Approve/Reject/Request More Info UI when `status='pending_approval'`.
- Submitter sees Withdraw button anytime before approval.
- Post-approval: PO-number + received-date capture forms.

### Route: `/admin/capital-purchase` (list)

- Tabs by status: Pending Quotes | Pending Budget | Pending Approval | Approved (PO Pending) | PO Placed | Received | Rejected.
- Filters: department, category, date range, total amount range.
- Default sort: `estimated_total DESC NULLS LAST`.

---

## §6 — Decision Flow

```
[hod / department_admin] ─submit→ status='pending_quotes'
                                       │
                                       ↓
[procurement] ─add quotes→ status='pending_budget'
                                       │
                                       ↓
[finance / accounts] ─confirm budget→ status='pending_approval'
                                       │
                                       ↓ orchestrator (every cron tick)
                            fn_generate_capital_purchase_approval_items()
                                       │
                                       ↓ work item in 'dashboard:approval' queue
                                       │
                                       ↓ Director sees in /dashboard
                                       │
                                       ┌────────┴────────┐
                                       ↓                 ↓
                                  {Approve}          {Reject}
                                  status='approved'  status='rejected'
                                  (queue auto-dismiss)
                                       │
                                       ↓
[procurement places PO] ─po_number→ status='po_placed'
                                       │
                                       ↓
[goods received]      ─received_at→ status='received'
                                       │
                                       ↓ (optional v2)
[asset table records]                  status='closed'
```

---

## §7 — Open Questions (for Director, before implementation)

1. **Threshold for Director approval** — should ALL capital purchases route to Director, or only ones above ₹X (e.g., ₹50,000)? Smaller purchases could route to Principal/HOD only. Reduces queue load.
2. **Multi-institution coordination** — can a capital purchase span institutions (e.g., bulk IT hardware for 8 colleges)? If yes, schema needs `institution_ids[]` not single `institution_id`.
3. **Vendor master** — should `vendor_quotes` reference a separate `vendors` table (with vendor IDs, history, ratings), or stay as JSONB freeform? JSONB is faster to ship; vendor-master pays off long-term.
4. **Asset registration auto-flow** — does an `assets` / `inventory_items` table already exist or will it need to be built? If yes, define FK; if no, leave `asset_record_ids` as future state.
5. **Budget head taxonomy** — does Finance already have a coded budget-head list, or is `budget_head` freeform text in v1?
6. **Procurement role** — does this exist as a `custom_roles` entry, or do we add it as part of this rollout? Likely needs to be added.
7. **Cancel-after-PO** — once PO is placed, can the request still be canceled (for refund / vendor non-delivery)? Probably yes. Schema supports via `status='closed'` + `metadata.cancel_reason`.

---

## §8 — Estimated Implementation Effort

When Director gives the green light:
- Schema + RLS + permissions + new `procurement` role: ~1.5 days
- Intake form + 3-stage workflow UI (submit / quotes / budget / approval): ~5 days
- Generator function + orchestrator wiring: ~0.5 day
- Asset-registration auto-flow (if assets table exists): ~1 day
- PO + received-date capture + rollup reports: ~1 day
- Test accounts + role assignments + RLS verification: ~1 day
- **Total: ~10 days for v1 (single-Director-approval, freeform budget heads, JSONB vendors).**

---

*End spec. NO code, NO migration, NO PR shipped this session.*

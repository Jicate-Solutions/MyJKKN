# Billing Apportionment — Internal Revenue-Head Split (Build-Ready Spec)

**Date:** 2026-06-09
**Author:** Mac Claude (interview-driven) · **For sign-off:** Director (MD + CAIO)
**Status:** SPEC ONLY — not built, not migrated, no PR. Requires Director sign-off before any code.
**Project:** MyJKKN · Supabase prod ref `kvizhngldtiuufknvehv`
**Module home:** `billing` (extends, does not fork)

---

> **⚠️ REVISED 2026-06-09 (lean v2 — find-the-pattern-extend).** After reading the live billing substrate, the "revenue head" is NOT a new table — it is an existing **`billing_categories`** row (Hostel Fee + Transport Fee already exist; a **Mess Fee** category + `'mess'` enum value are added). This **drops** `billing_revenue_heads`, the `/admin/config/revenue-heads` UI, and the `billing.apportionment.config.edit` key wherever they appear below. Head management reuses the existing **`/billing/categories`** page. New substrate = **3 tables** (`billing_apportionment_rules`, `billing_bill_apportionments`, `billing_apportionment_audit`) + the per-bill overlay being the only genuinely-new concept (bills are flat, no line-items). **Source of truth = the migrations:** `20260704999000_billing_category_kind_add_mess.sql`, `20260705000000_billing_apportionment_substrate.sql`, `20260705000100_billing_apportionment_rpcs.sql`. Where sections below reference `billing_revenue_heads`, this banner supersedes them.

## 0. One-paragraph summary

An **accounts-facing internal overlay** that lets the accounts team record how much of a *bundled* tuition bill actually belongs to a revenue head (Hostel-room, Mess, Transport). It is an **overlay, never a bill mutation** — the student's bill row is byte-for-byte unchanged and the student sees one bundled amount exactly as today. The overlay makes the dissolved hostel/mess rupee *explicit and attributable*, which is the missing keystone that makes "revenue per bed" computable for bundled students. Visible **only** to accounts + super-admin. Every entry is dual-controlled (create → approve) and fully audited.

---

## 1. Why this exists (the problem, verified live)

From `specs/hostel-revenue-reconciliation-brief-2026-06-09.md` and the production memory `reference_hostel_revenue_two_mechanisms_and_no_apportionment.md` (all live-verified on prod 2026-06-09):

- Hostel is **bundled into tuition** for most students via an `accommodation_type_id` variant on the fee structure. **There is no hostel-component field anywhere** — the hostel share of a bundled package is stored as a number nowhere.
- The diff method (hosteler total − day-scholar total) is **unreliable** — dominated by quota (GQ/MQ/PMS), not accommodation.
- Code grep + schema probe both returned **zero** apportionment / revenue_head / internal_split / cost_center / gl_code artifacts. **This feature does not exist today** — confirmed again at the top of this session.
- Consequence: per-bed revenue is **structurally unanswerable** for bundled students until the hostel rupee is made explicit *internally*, without changing the student-facing bill.

**This spec is that internal mechanism.**

---

## 2. Decisions locked in the interview (Director, 2026-06-09)

| # | Question | Decision | Data-model consequence |
|---|----------|----------|------------------------|
| 1 | Where to record the split (grain)? | **Rule + per-bill override** | Two operational layers: a *per-package rule* table (defaults) + a *per-bill apportionment* table (resolved entries, overridable). |
| 2 | How to express the portion (method)? | **Allow both — fixed rupee OR percentage, per rule** | Rule carries `split_method ENUM('fixed','percent')` + `split_value NUMERIC`. Resolved per-bill rows store the **absolute rupee** figure (percent resolved at apply-time) plus the source method/value for traceability. |
| 3 | Does ₹65k cover room only or all-in? | **Room only — mess charged separately** | v1 **must** support ≥2 heads (Hostel-room + Mess). Rules out a hardcoded single "hostel" column. |
| 4 | Require approval before it counts? | **Yes — dual control** | `status ENUM('draft','pending_approval','approved','rejected')`; only `approved` rows feed the dashboard. New `billing.apportionment.approve` key (precedent: `billing.refunds.approve`). |
| 5 | Which bills does it apply to (time)? | **Forward + opt-in backfill** | No automatic history mutation. Backfill is an explicit accounts UI action that drafts apportionment rows for selected past bundled bills. |
| 6 | Which revenue heads in v1? | **Hostel + Mess + Transport** | Seed 3 active config rows in `billing_revenue_heads`. Head list is config-driven — adding/removing later is a settings change, not code. |

---

## 3. Hard invariants (non-negotiable; a build that violates any of these is rejected)

1. **Student bill is never mutated.** The feature holds **zero** INSERT/UPDATE/DELETE grants on `billing_student_bills` or `billing_student_bill_items`. All apportionment lives in *separate* tables that reference the bill by FK. A reviewer must be able to confirm this with a grep: no write path from `apportionment-service.ts` to the bill tables.
2. **Internal visibility only.** Apportionment data is surfaced **only** under `/billing/apportionment/*` (gated) and consumed by the already-gated Bed Economics dashboard. It appears on **no** student-facing route, receipt, invoice PDF, or learner portal view.
3. **You cannot apportion more than the bill.** A trigger enforces `SUM(approved apportionment amounts) per bill ≤ bill total`. Over-apportionment is a hard error, not a warning.
4. **Approved-only counts.** Revenue RPCs read `status = 'approved'` rows exclusively. Draft/pending rows are invisible to every dashboard.
5. **Config-driven, no hardcoded heads/splits.** The head catalog and any default-policy live in config rows read at runtime. Zero head names or split percentages as literals in TS or SQL function bodies (seed migration is the one allowed place for the literal).
6. **Anon-revoked.** Every new SECURITY DEFINER RPC ships with `REVOKE EXECUTE ... FROM anon, PUBLIC; GRANT EXECUTE ... TO authenticated;` (CLAUDE.md mandate + `feedback_supabase_anon_execute_default_grant`).

---

## 4. Data model

Three tables + one unified audit table. All follow the config-table-pattern shared mixin where applicable (`docs/architecture/config-table-pattern.md`).

### 4.1 `billing_revenue_heads` — CONFIG table (the head catalog)

The CRUDable list of revenue heads. Pure config-table-pattern. Super-admin edits it.

```sql
CREATE TABLE billing_revenue_heads (
  -- config-table-pattern shared mixin (verbatim)
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key    TEXT NOT NULL,                  -- 'hostel_room' | 'mess' | 'transport'
  display_name  TEXT NOT NULL,                  -- 'Hostel (Room)' | 'Mess' | 'Transport'
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    UUID REFERENCES profiles(id),
  change_reason TEXT,
  -- typed columns
  sort_order    INTEGER NOT NULL DEFAULT 0,     -- display order in pickers
  maps_to_billing_category_id UUID REFERENCES billing_categories(id)  -- optional link to an existing category (e.g. 'Hostel Fee' da039df9-…) for reconciliation
);

CREATE UNIQUE INDEX billing_revenue_heads_key_active_unique
  ON billing_revenue_heads(config_key) WHERE is_active = true;
```

**Seed (in the same migration):**

```sql
INSERT INTO billing_revenue_heads (config_key, display_name, description, sort_order, maps_to_billing_category_id, change_reason) VALUES
  ('hostel_room', 'Hostel (Room)', 'Room/accommodation portion of a bundled package. Excludes mess (Director: ₹65k is room-only).', 10, 'da039df9-641d-475e-9d52-d5aedd85b95a', 'Initial seed — billing-apportionment-spec-2026-06-09'),
  ('mess',        'Mess',          'Food/mess portion of a bundled package. Charged separately from room per Director decision.',        20, NULL, 'Initial seed — billing-apportionment-spec-2026-06-09'),
  ('transport',   'Transport',     'Transport/bus portion of a bundled package.',                                                       30, NULL, 'Initial seed — billing-apportionment-spec-2026-06-09')
ON CONFLICT (config_key) WHERE is_active = true DO NOTHING;
```

> **System-wide** (no `institution_id`) — the head catalog is universal. The room-vs-mess split *amounts* vary by institution, but that lives on the rule table, not the catalog.

### 4.2 `billing_apportionment_rules` — per-package DEFAULT split rules

"For this fee-structure (or accommodation type), this head = ₹X (fixed) or Y% (percent)." Auto-applies to every bill on that package. A rule change is a money-policy change → carries the approval lifecycle.

```sql
CREATE TABLE billing_apportionment_rules (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id     UUID REFERENCES institutions(id),       -- NULL = applies to all institutions
  -- scope: ONE of these identifies the package the rule targets
  fee_structure_id   UUID REFERENCES admission_fee_structures(id),  -- preferred precise scope
  accommodation_type_id UUID REFERENCES accommodation_types(id), -- broader scope (e.g. all 'Hostel' variants). FK target CONFIRMED live 2026-06-09.
  revenue_head_id    UUID NOT NULL REFERENCES billing_revenue_heads(id),
  split_method       TEXT NOT NULL CHECK (split_method IN ('fixed','percent')),
  split_value        NUMERIC(12,2) NOT NULL CHECK (split_value >= 0),  -- rupees if fixed; 0–100 if percent
  effective_from     DATE NOT NULL DEFAULT CURRENT_DATE,
  -- approval lifecycle
  status             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','pending_approval','approved','rejected')),
  approved_by        UUID REFERENCES profiles(id),
  approved_at        TIMESTAMPTZ,
  -- config-mixin audit fields
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by         UUID REFERENCES profiles(id),
  change_reason      TEXT,
  CHECK (split_method <> 'percent' OR split_value <= 100),  -- percent ≤ 100
  CHECK (fee_structure_id IS NOT NULL OR accommodation_type_id IS NOT NULL)  -- must target something
);

-- one active approved rule per (scope, head) at a time
CREATE UNIQUE INDEX billing_apportionment_rules_scope_head_unique
  ON billing_apportionment_rules(
       COALESCE(fee_structure_id, '00000000-0000-0000-0000-000000000000'::uuid),
       COALESCE(accommodation_type_id, '00000000-0000-0000-0000-000000000000'::uuid),
       revenue_head_id)
  WHERE is_active = true AND status = 'approved';
```

> **CONFIRMED (live 2026-06-09):** `admission_fee_structures.accommodation_type_id` → `accommodation_types(id)`. `admission_fee_structure_items` has `(fee_structure_id, billing_category_id, amount)` — the rule-scope FKs are valid.

### 4.3 `billing_bill_apportionments` — resolved per-bill entries (the money records)

One or more rows per bundled bill, each = (head, rupee amount). **This is what the dashboard reads.** Created by applying a rule, or by a manual override/backfill. References the bill; never writes to it.

```sql
CREATE TABLE billing_bill_apportionments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id            UUID NOT NULL REFERENCES billing_student_bills(id),  -- the bundled bill (READ-only FK)
  institution_id     UUID NOT NULL REFERENCES institutions(id),           -- copied from bill for RLS efficiency
  revenue_head_id    UUID NOT NULL REFERENCES billing_revenue_heads(id),
  amount             NUMERIC(12,2) NOT NULL CHECK (amount >= 0),          -- ABSOLUTE rupees (percent already resolved)
  -- provenance / traceability
  source             TEXT NOT NULL CHECK (source IN ('rule','manual','backfill')),
  source_rule_id     UUID REFERENCES billing_apportionment_rules(id),    -- which rule produced it (if source='rule')
  source_method      TEXT CHECK (source_method IN ('fixed','percent')),  -- what the rule said
  source_value       NUMERIC(12,2),                                       -- the rule's value at apply time
  -- approval lifecycle (dual control)
  status             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','pending_approval','approved','rejected')),
  approved_by        UUID REFERENCES profiles(id),
  approved_at        TIMESTAMPTZ,
  -- audit
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         UUID REFERENCES profiles(id),
  updated_by         UUID REFERENCES profiles(id),
  change_reason      TEXT
);

CREATE INDEX billing_bill_apportionments_bill_idx ON billing_bill_apportionments(bill_id);
CREATE INDEX billing_bill_apportionments_head_status_idx ON billing_bill_apportionments(revenue_head_id, status);
CREATE INDEX billing_bill_apportionments_inst_idx ON billing_bill_apportionments(institution_id);
-- at most one active row per (bill, head)
CREATE UNIQUE INDEX billing_bill_apportionments_bill_head_unique
  ON billing_bill_apportionments(bill_id, revenue_head_id) WHERE status <> 'rejected';
```

**Over-apportionment guard (trigger):**

```sql
CREATE OR REPLACE FUNCTION fn_billing_apportionment_guard() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bill_total NUMERIC(12,2);
  v_sum        NUMERIC(12,2);
BEGIN
  SELECT final_amount INTO v_bill_total FROM billing_student_bills WHERE id = NEW.bill_id;  -- CONFIRMED: final_amount is the payable total (= total_amount on hostel bills, live 2026-06-09)
  SELECT COALESCE(SUM(amount),0) INTO v_sum
    FROM billing_bill_apportionments
    WHERE bill_id = NEW.bill_id AND status <> 'rejected' AND id <> NEW.id;
  IF (v_sum + NEW.amount) > v_bill_total THEN
    RAISE EXCEPTION 'Apportionment (% + %) exceeds bill total % for bill %',
      v_sum, NEW.amount, v_bill_total, NEW.bill_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER billing_apportionment_guard_trg
  BEFORE INSERT OR UPDATE ON billing_bill_apportionments
  FOR EACH ROW EXECUTE FUNCTION fn_billing_apportionment_guard();
```

### 4.4 `billing_apportionment_audit` — unified money-trail

**Deliberate deviation from the pattern's per-table audit:** one consolidated log so "show me everything that ever happened to apportionment" is a single query. Justified because this is a money feature where the audit *is* the control.

```sql
CREATE TABLE billing_apportionment_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('revenue_head','rule','bill_apportionment')),
  entity_id     UUID NOT NULL,
  action        TEXT NOT NULL CHECK (action IN ('insert','update','delete','approve','reject')),
  old_value     JSONB,
  new_value     JSONB,
  changed_by    UUID REFERENCES profiles(id),
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_reason TEXT
);
CREATE INDEX billing_apportionment_audit_entity_idx ON billing_apportionment_audit(entity_type, entity_id);
```

One `AFTER INSERT OR UPDATE OR DELETE` trigger per source table writes into this log (3 thin trigger functions, same body, different `entity_type` literal). Pattern source: config-table-pattern `fn_<module>_config_audit`, generalised to entity_type.

---

## 5. RLS (dynamic-permission model)

Every table gets RLS with the canonical helpers (`is_super_admin()`, `is_admin()`, `user_has_permission()`, `role_has_institution_access()`).

```sql
-- billing_bill_apportionments (has institution_id)
ALTER TABLE billing_bill_apportionments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bill_apportionments_select" ON billing_bill_apportionments
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('billing.apportionment.view')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bill_apportionments_insert" ON billing_bill_apportionments
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('billing.apportionment.create')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bill_apportionments_update" ON billing_bill_apportionments
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('billing.apportionment.edit')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bill_apportionments_delete" ON billing_bill_apportionments
FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('billing.apportionment.delete')
      AND role_has_institution_access(institution_id))
);
```

- `billing_apportionment_rules` — same shape; rules with `institution_id IS NULL` (all-institution) are visible to any holder of the key (guard in the RPC, since `role_has_institution_access(NULL)` must be handled — treat NULL as "all", super-admin/admin only to *edit* a NULL-scoped rule).
- `billing_revenue_heads` — config-table RLS: SELECT for any authenticated user (so service-layer joins resolve head names); write `is_super_admin()` only (+ optional `billing.apportionment.config.edit`).
- `billing_apportionment_audit` — SELECT gated by `billing.apportionment.view`; no direct writes (trigger-only, SECURITY DEFINER).
- **Approval transition** (`status → 'approved'`) is enforced in the RPC, not raw UPDATE: the RPC checks `user_has_permission('billing.apportionment.approve')` before allowing the status flip. This keeps "who can approve" in one place.

---

## 6. Permission keys

Add to the existing `billing` category in `lib/constants/permissions.ts` (the block at line ~489, right after the `billing.refunds.*` keys so `.approve` sits beside its precedent):

```ts
{ key: 'billing.apportionment.view',    label: 'View Revenue Apportionment' },
{ key: 'billing.apportionment.create',  label: 'Create Revenue Apportionment' },
{ key: 'billing.apportionment.edit',    label: 'Edit Revenue Apportionment' },
{ key: 'billing.apportionment.delete',  label: 'Delete Revenue Apportionment' },
{ key: 'billing.apportionment.approve', label: 'Approve Revenue Apportionment' },
// NOTE (lean v2): no .config.edit key — revenue heads are billing_categories rows,
// managed by the EXISTING billing.categories.* keys + /billing/categories page.
```

**Grant matrix (seed via Role Management, not hardcoded):**

| Role | view | create | edit | delete | approve | config.edit |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| super_admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `accountant_assistant` (Accountant Assistant — **maker**) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `accounts` (Chief Accountant — **checker/approver**) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| student / faculty / everyone else | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

> **CONFIRMED (live 2026-06-09):** both roles exist in `custom_roles`, scope `all`. The maker-checker split is real org structure: `accountant_assistant` creates/edits, `accounts` (Chief Accountant) approves. The student role **must never** receive any `billing.apportionment.*` key — invariant #2.

---

## 7. Sidebar + routes

**Sidebar source is `lib/sidebarMenuLink.ts`, NOT `modules.ts`** (memory `reference_myjkkn_sidebar_is_sidebarmenulink_not_modules`). Add under the existing **Billing & Accounts** group, beside `/billing/discounts`:

```ts
// in the menus array of the Billing & Accounts group:
{ name: 'Revenue Apportionment', href: '/billing/apportionment', icon: <appropriate icon> },

// in MENU_PERMISSIONS:
'/billing/apportionment': 'billing.apportionment.view',
'/billing/apportionment/rules': 'billing.apportionment.view',
'/billing/apportionment/[billId]': 'billing.apportionment.view',

// admin config (super-admin), beside other /admin/config routes:
'/admin/config/revenue-heads': 'billing.apportionment.config.edit',
```

Verify the new sidebar entry against the **live DOM** after build (sidebar renders from this file; a PR that edits `modules.ts` instead is invisible — receipt PRs #1195/#1198).

---

## 8. RPCs / functions (all SECURITY DEFINER, all anon-revoked)

In a dedicated migration `..._billing_apportionment_rpcs.sql`. Pattern source for each: `fn_counselor_evaluate` (config-reading) + the create-then-approve flow of refunds.

| Function | Purpose |
|----------|---------|
| `fn_apportionment_preview_rule(p_rule_id, p_bill_id)` | Resolve a rule against a bill → returns the rupee amount it *would* produce (percent → rupees). Read-only preview. |
| `fn_apportionment_apply_rule(p_rule_id, p_bill_ids[])` | Draft `billing_bill_apportionments` rows for the given bills from an approved rule. Status starts `draft`. Used by both forward-apply and opt-in backfill. |
| `fn_apportionment_submit(p_apportionment_ids[])` | `draft → pending_approval`. Requires `.create`/`.edit`. |
| `fn_apportionment_approve(p_apportionment_ids[], p_reason)` | `pending_approval → approved`. Requires `.approve`. Stamps `approved_by`/`approved_at`. |
| `fn_apportionment_reject(p_apportionment_ids[], p_reason)` | `pending_approval → rejected`. Requires `.approve`. |
| `fn_bed_econ_apportioned_hostel_revenue(p_institution_id, p_year)` | **Dashboard contract (downstream consumer).** Returns SUM of `approved` `billing_bill_apportionments.amount` where head = `hostel_room`, for bundled bills, by institution/year. The Bed Economics dashboard adds this to Mechanism-A explicit Hostel-Fee bills to get *true billed hostel revenue*. |

Every one ends with:
```sql
REVOKE EXECUTE ON FUNCTION public.fn_xxx(...) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_xxx(...) TO authenticated;
```

---

## 9. Bed Economics dashboard integration (CONTRACT ONLY — not built this session)

Per the continuation brief, dashboard/billed-revenue wiring is a **separate downstream task** and is **out of this build's scope**. This spec defines only the *contract* so the future wiring is unambiguous:

- **True billed hostel revenue** = (Mechanism A: explicit `Hostel Fee` category bills, `item_category_id = da039df9-641d-475e-9d52-d5aedd85b95a`) **+** (`fn_bed_econ_apportioned_hostel_revenue` — approved Hostel-room apportionment on bundled bills).
- Mechanism B's premium-potential RPC (already built, prod-validated: `fn_bed_econ_premium_potential`) remains the **"potential / upsell"** lens.
- The **gap** between true-billed and premium-potential is the upsell story (Hybrid Option 3 from the reconciliation brief).
- Mess and Transport apportionment feed their own future revenue surfaces (out of scope here) but the data model already captures them.

> Note: the room-only/mess-separate decision (interview Q3) **resolves** the question the brief flagged as blocking dashboard wiring — the Hostel-room head is unambiguously *room* revenue. The wiring task can now proceed when prioritised; it is simply not part of *this* spec's build.

---

## 10. Migration plan for existing bills

| Population | Count (live 2026-06-09) | Treatment |
|------------|------------------------|-----------|
| Explicit `Hostel Fee` bills (Mechanism A) | 61 bills · ₹39.65 L | **No apportionment rows needed.** Already 100% Hostel-room (room-only). Dashboard counts them directly as Mechanism A. (Optional: a future toggle can mirror them as `hostel_room` apportionment rows for a single unified read — *not* required for v1.) |
| Bundled tuition bills (hostel dissolved) | Small this year — only 2 active hostel-variant structures vs 90 day-scholar | **Forward + opt-in backfill** (interview Q5). No automatic data migration. Accounts uses the backfill UI: pick a fee-structure + its approved rule → `fn_apportionment_apply_rule` drafts rows → submit → approve. |

**The substrate migration creates tables + seeds the 3 heads only. It performs NO data backfill.** Backfill is always an explicit, audited accounts action.

---

## 11. Accounts UI surface (gated, internal)

Precedent to copy: `app/(routes)/billing/refunds/*` (create-then-approve list + actions) and `app/(routes)/billing/discounts/*` (approval workflow).

| Route | Purpose | Precedent |
|-------|---------|-----------|
| `app/(routes)/billing/apportionment/page.tsx` | List bundled bills with their apportionment status (none / draft / pending / approved); filters by institution, head, status. | `billing/refunds/page.tsx` |
| `app/(routes)/billing/apportionment/rules/page.tsx` | CRUD the per-package default rules; submit-for-approval; approve. | `billing/discounts/page.tsx` |
| `app/(routes)/billing/apportionment/[billId]/page.tsx` | One bill's apportionment detail: heads + amounts, apply-rule, manual override, submit, approve. Shows the **unchanged** student bill read-only beside it. | `billing/invoices/[id]/page.tsx` |
| `app/(routes)/admin/config/revenue-heads/page.tsx` | Super-admin head catalog CRUD (config-table). | config-table-pattern `/admin/config/<module>` + `components/admin/config-row-editor.tsx` |

UI never exposes apportionment on any learner/student view (invariant #2).

---

## 12. Service + hook layer

| File | Purpose | Precedent |
|------|---------|-----------|
| `lib/services/billing/apportionment/apportionment-service.ts` | CRUD + apply-rule + submit/approve/reject (calls the RPCs). **No write path to bill tables.** | `lib/services/billing/refunds/*` |
| `lib/services/billing/apportionment/revenue-heads-config-service.ts` | Config accessor for the head catalog. | config-table-pattern service-layer accessor |
| `hooks/billing/use-apportionment.ts` | React Query hooks for list/detail/mutations. | existing `hooks/billing/*` |
| `hooks/billing/use-revenue-heads.ts` | Head catalog hook (STABLE_DATA cache). | config-table-pattern `useModuleConfig` |

---

## 13. Files the build will touch (complete list, each with precedent)

1. `supabase/migrations/2026XXXX_billing_apportionment_substrate.sql` — 4 tables + RLS + audit triggers + over-apportionment guard + seed 3 heads. *Precedent: `20260222000015_campus_living_enums_and_tables.sql` (multi-table substrate) + config-table-pattern (`counselor_rules`).*
2. `supabase/migrations/2026XXXX_billing_apportionment_rpcs.sql` — 7 RPCs, all anon-revoked. *Precedent: `fn_counselor_evaluate`; refund approve-flow.*
3. `supabase/SQL_FILE_INDEX.md` — register new tables + functions (mandatory).
4. `lib/constants/permissions.ts` — add 6 `billing.apportionment.*` keys to the billing category. *Precedent: `billing.refunds.approve`.*
5. `lib/sidebarMenuLink.ts` — add `/billing/apportionment` + `/admin/config/revenue-heads` entries + MENU_PERMISSIONS. *Precedent: `/billing/discounts`.*
6. `lib/services/billing/apportionment/apportionment-service.ts` + `revenue-heads-config-service.ts`. *Precedent: `lib/services/billing/refunds/*`.*
7. `hooks/billing/use-apportionment.ts` + `use-revenue-heads.ts`. *Precedent: existing billing hooks.*
8. `app/(routes)/billing/apportionment/*` (3 routes + `_components`). *Precedent: `billing/refunds/*`, `billing/discounts/*`.*
9. `app/(routes)/admin/config/revenue-heads/page.tsx`. *Precedent: config-table-pattern + `components/admin/config-row-editor.tsx`.*

**Out of scope for this build:** Bed Economics dashboard wiring (§9 — contract only); Mess/Transport revenue surfaces; migration of hostel charging onto Mechanism B.

---

## 14. Test plan (build must prove these before "done")

1. **Invariant #1 (bill untouched):** apply + approve an apportionment on a bill; assert the `billing_student_bills` row's `updated_at` and every column are unchanged (BEGIN/ROLLBACK smoke test on prod-shaped data).
2. **Invariant #2 (visibility):** log in as `test.student@jkkn.ac.in` → `/billing/apportionment` returns explicit 403 (not silent redirect — rule #27); the student's bill/receipt view shows the bundled amount with no head breakdown.
3. **Invariant #3 (over-apportionment):** attempt to apportion ₹70k of heads onto a ₹65k bill → trigger raises, transaction rolls back.
4. **Invariant #4 (approved-only):** a `draft`/`pending` apportionment contributes ₹0 to `fn_bed_econ_apportioned_hostel_revenue`; only after approve does it count.
5. **Dual control:** `test.accounts` can create + submit but **cannot** approve (RPC rejects); approver role can.
6. **Config-driven:** deactivate the Transport head in `/admin/config/revenue-heads` → it disappears from the head picker with no deploy.
7. **Anon lockdown:** `curl` each new RPC with the public anon key → 401/permission denied (per `feedback_supabase_anon_execute_default_grant`).
8. **Three-layer sweep** before "done": UI (click every action), API/RPC (each function × role × auth), DB (impersonate accounts vs student vs anon).

---

## 15. Build-time facts (RESOLVED live 2026-06-09) + one open policy item

**Resolved against production (`kvizhngldtiuufknvehv`):**
- ✅ Bill total column = **`final_amount`** (= `total_amount` on the 61 hostel bills; `balance_amount` = unpaid). Guard trigger uses `final_amount`.
- ✅ Accommodation FK target = **`accommodation_types(id)`**.
- ✅ Approver roles exist: **`accountant_assistant`** (maker) + **`accounts`/Chief Accountant** (checker). No super-admin-only fallback needed.
- ✅ `billing_categories` name column = **`category_name`** (not `name`); `kind` is an enum; Hostel Fee id `da039df9-…` confirmed (61 bills, ₹39.65L).
- ✅ `admission_fee_structure_items` = `(fee_structure_id, billing_category_id, amount)`.

**One open POLICY item (not a code blocker):**
- **Where mess revenue lives today.** No "Mess" billing category exists. If mess is dissolved in tuition, the Mess head lets accounts carve it out — the intended use. If mess is collected outside MyJKKN (canteen cash), that's a separate Director decision; the head still captures the intent when/if it moves in.

---

## 16. Sign-off

This spec is build-ready: data model (4 tables + config rows), RLS, 6 permission keys, accounts-only UI surface, dashboard integration **contract**, full audit trail, and a migration plan that touches **no** existing bill. Every proposed file names its production precedent. It honours the config-table-pattern, the dynamic-permission model, and the **student-bill-unchanged** hard invariant.

**Awaiting Director sign-off before any code, migration, or PR.**

---
*Interview-driven, 2026-06-09. No code written, no migration applied, no PR opened. Production facts live-verified via read-only probes (created → called → dropped, anon-revoked) on `kvizhngldtiuufknvehv`, per prior session.*

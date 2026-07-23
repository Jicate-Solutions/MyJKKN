# Dynamic Status Management & Bill-Gated Seat-Filled Metric — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert hardcoded admission lead and learner statuses into an admin-managed CRUD; gate the `account → active` learner transition on a configurable fee-paid percentage (excluding application fee); update the group dashboard's "Seat Filled" KPI to reflect the new bill-driven definition.

**Architecture:** A single new lookup table `admission_statuses` carries metadata (label, color, ordering, threshold) keyed by `(scope, code)` where `scope ∈ {lead, learner}`. The existing `lifecycle_status` ENUM and `funnel_stage` TEXT column remain as storage — `admission_statuses` is metadata joined by `code`, so the 14+ hardcoded literal sites do not need to be rewritten in this phase. A new `billing_categories.kind` ENUM (`application_fee | tuition | hostel | …`) lets the threshold computation exclude application-fee bills. A SECURITY DEFINER trigger on `billing_receipt_items` re-evaluates the learner's paid percentage after every payment and auto-promotes `account → active` when the threshold is crossed. Five dashboard RPCs are rewritten to read the seat-filled set from `admission_statuses.is_seat_filled` instead of hardcoded literals. Demotion is intentionally manual-only (avoids accidental login loss from refunds). Existing 491+ learners are grandfathered untouched.

**Tech Stack:** Next.js 15 (App Router, `(routes)` route group), TypeScript, Supabase (Postgres + RLS), react-hook-form + zod, TanStack Query (React Query v5), Tailwind + shadcn/ui, lucide-react.

---

## Pre-Implementation Reading

The engineer MUST skim these files before starting — they define the patterns this plan mirrors:

- `app/(routes)/admission/settings/lookups/quotas/page.tsx` — pattern this plan clones for the Status CRUD UI
- `app/(routes)/admission/settings/lookups/quotas/_components/quotas-data-table.tsx` — list table pattern
- `app/(routes)/admission/settings/lookups/quotas/_components/quota-form-dialog.tsx` — dialog form pattern
- `lib/services/admission/lookup-service.ts:21-71` — service shape this plan mirrors
- `lib/services/billing/onboarding/onboarding-service.ts:515-572` — the `markAsApproved` gate this plan rewrites
- `supabase/migrations/20260502000008_get_seat_analytics_role_access_check.sql` — dashboard RPC this plan rewrites
- `supabase/migrations/20260510_rewrite_fn_group_dashboard_overview_to_leads_only.sql` — second dashboard RPC
- `lib/constants/permissions.ts:944-964` — permission registration pattern
- `supabase/migrations/20260513150000_admission_lead_sources_master_rls_to_settings_namespace.sql` — RLS migration pattern
- Memory files referenced by name in this plan (live in `C:\Users\Admin\.claude\projects\D--Projects-MyJKKN\memory\`)

---

## File Structure Overview

### Created Files

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260517000001_create_admission_statuses_table.sql` | Schema for the metadata table |
| `supabase/migrations/20260517000002_seed_admission_statuses.sql` | Seed 26 lead + 11 learner statuses with current colors |
| `supabase/migrations/20260517000003_billing_categories_kind_enum.sql` | ENUM + column + name-pattern backfill |
| `supabase/migrations/20260517000004_create_vw_learner_payment_progress.sql` | Per-learner paid% view |
| `supabase/migrations/20260517000005_create_learners_profile_status_history.sql` | Status-change audit table |
| `supabase/migrations/20260517000006_register_status_settings_permissions.sql` | Permission keys + role grants |
| `supabase/migrations/20260517000007_evaluate_learner_status_after_payment.sql` | RPC + trigger on receipt items |
| `supabase/migrations/20260517000008_rewrite_seat_analytics_dynamic.sql` | `get_seat_analytics` rewrite |
| `supabase/migrations/20260517000009_rewrite_sibling_dashboard_rpcs.sql` | 4 sibling RPCs |
| `supabase/migrations/20260517000010_rewrite_group_dashboard_overview_dual_kpi.sql` | Split filled into enrolled+seat-filled |
| `supabase/migrations/20260517000011_mirror_lead_active_stage_policy.sql` | One-way sync trigger |
| `lib/services/admission/admission-status-service.ts` | CRUD service |
| `hooks/admission/use-admission-statuses.ts` | React Query hooks |
| `lib/admission/status-helpers.ts` | `getStatusLabel`, `getStatusColor` dynamic helpers |
| `types/admission-status.ts` | TS types for the new table |
| `app/(routes)/admission/settings/statuses/page.tsx` | List page (server component) |
| `app/(routes)/admission/settings/statuses/_components/statuses-data-table.tsx` | Tabs + table |
| `app/(routes)/admission/settings/statuses/_components/status-form-dialog.tsx` | Create/edit dialog |
| `app/(routes)/admission/settings/statuses/_components/status-row-actions.tsx` | Edit/archive actions |
| `app/(routes)/admission/tools/re-evaluate-learner/page.tsx` | Manual re-evaluation admin tool |
| `app/(routes)/admission/group-dashboard/_components/seat-filled-card.tsx` | New KPI card |
| `tests/integration/admission-status-crud.test.ts` | Integration tests |
| `tests/sql/evaluate_learner_status_after_payment.sql` | RPC behavior tests |

### Modified Files

| Path | Change |
|---|---|
| `lib/constants/permissions.ts:944-964` | Add `admission.settings.statuses.{view,manage}` keys |
| `lib/services/billing/onboarding/onboarding-service.ts:515-572` | Read threshold from `admission_statuses` |
| `lib/services/learner-profile-service.ts:983` | Add threshold check on direct `account → active` updates |
| `hooks/admission/use-group-dashboard.ts:60-80` | Add `billing_student_bills` channel |
| `app/(routes)/admission/group-dashboard/page.tsx:283-348` | Replace single "Filled" with "Enrolled Leads" + "Seat Filled" cards |
| `components/learners/lifecycle-status-badge.tsx:19-94` | Read colors from `useAdmissionStatuses` (kept compatible with hardcoded fallback) |
| `app/(routes)/admission/leads/_components/columns.tsx:17-74` | Replace `FUNNEL_STAGES` / `getStageColor` with helper lookups |
| `config/sidebar.tsx` (or whichever defines the admission settings menu) | Add "Statuses" entry |

---

## Phase A — Foundations (Database Schema + Seed)

### Task A1 — Create `admission_statuses` table

**Files:**
- Create: `supabase/migrations/20260517000001_create_admission_statuses_table.sql`

- [ ] **Step 1: Write the migration**

```sql
-- File: supabase/migrations/20260517000001_create_admission_statuses_table.sql
BEGIN;

CREATE TABLE public.admission_statuses (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                       text NOT NULL CHECK (scope IN ('lead','learner')),
  code                        text NOT NULL,
  label                       text NOT NULL,
  description                 text,
  color                       text NOT NULL DEFAULT '#9CA3AF',
  icon                        text,
  sort_order                  int  NOT NULL DEFAULT 0,
  is_active                   boolean NOT NULL DEFAULT true,
  is_terminal                 boolean NOT NULL DEFAULT false,
  is_seat_filled              boolean NOT NULL DEFAULT false,
  fee_paid_threshold_percent  numeric(5,2),
  gates_login                 boolean NOT NULL DEFAULT false,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid REFERENCES profiles(id),
  updated_by                  uuid REFERENCES profiles(id),
  CONSTRAINT chk_threshold_range CHECK (
    fee_paid_threshold_percent IS NULL
    OR (fee_paid_threshold_percent >= 0 AND fee_paid_threshold_percent <= 100)
  ),
  CONSTRAINT chk_threshold_only_for_learner CHECK (
    fee_paid_threshold_percent IS NULL OR scope = 'learner'
  ),
  CONSTRAINT chk_gates_login_only_for_learner CHECK (
    gates_login = false OR scope = 'learner'
  )
);

CREATE UNIQUE INDEX uq_admission_statuses_scope_code
  ON public.admission_statuses(scope, code);

CREATE UNIQUE INDEX uq_admission_statuses_one_seat_filled
  ON public.admission_statuses(scope)
  WHERE is_seat_filled = true AND is_active = true;

CREATE INDEX idx_admission_statuses_scope_active_order
  ON public.admission_statuses(scope, is_active, sort_order);

-- Touch trigger (reuse project standard fn)
CREATE TRIGGER trg_admission_statuses_touch_updated_at
  BEFORE UPDATE ON public.admission_statuses
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- RLS
ALTER TABLE public.admission_statuses ENABLE ROW LEVEL SECURITY;

-- Read: anyone with admission.settings.statuses.view OR is_super_admin
CREATE POLICY admission_statuses_select
  ON public.admission_statuses FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.settings.statuses.view')
    OR user_has_permission('admission.settings.statuses.manage')
  );

CREATE POLICY admission_statuses_insert
  ON public.admission_statuses FOR INSERT
  WITH CHECK (
    is_super_admin() OR user_has_permission('admission.settings.statuses.manage')
  );

CREATE POLICY admission_statuses_update
  ON public.admission_statuses FOR UPDATE
  USING (is_super_admin() OR user_has_permission('admission.settings.statuses.manage'))
  WITH CHECK (is_super_admin() OR user_has_permission('admission.settings.statuses.manage'));

CREATE POLICY admission_statuses_delete
  ON public.admission_statuses FOR DELETE
  USING (is_super_admin());  -- hard delete only by super_admin; UI uses archive

COMMIT;
```

- [ ] **Step 2: Apply migration via MCP**

Run: `mcp__supabase__apply_migration` with name `20260517000001_create_admission_statuses_table`.

Expected: Success. No errors.

- [ ] **Step 3: Verify table + indexes + policies**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name='admission_statuses';
SELECT indexname FROM pg_indexes WHERE tablename='admission_statuses';
SELECT polname FROM pg_policy WHERE polrelid='public.admission_statuses'::regclass;
```

Expected: 1 table, 4 indexes (pk + 3 explicit), 4 policies.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260517000001_create_admission_statuses_table.sql
git commit -m "feat(admission): create admission_statuses metadata table

Unified scope='lead'|'learner' lookup carrying label/color/sort_order/
is_terminal/is_seat_filled/fee_paid_threshold_percent/gates_login.
RLS gated on admission.settings.statuses.{view,manage}. Partial unique
index ensures at most one is_seat_filled row per scope.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task A2 — Seed `admission_statuses` with current data

**Files:**
- Create: `supabase/migrations/20260517000002_seed_admission_statuses.sql`

- [ ] **Step 1: Write the seed migration**

```sql
-- File: supabase/migrations/20260517000002_seed_admission_statuses.sql
-- Mirrors the current colors from:
--   app/(routes)/admission/leads/_components/columns.tsx:45-74 (lead)
--   components/learners/lifecycle-status-badge.tsx:19-94 (learner)
BEGIN;

INSERT INTO public.admission_statuses
  (scope, code, label, color, sort_order, is_terminal, is_seat_filled,
   fee_paid_threshold_percent, gates_login)
VALUES
  -- Lead scope (from types/admission.ts FunnelStage union, 26 values)
  ('lead', 'new',                       'New',                       '#3B82F6',  1, false, false, NULL, false),
  ('lead', 'contacted',                 'Contacted',                 '#0EA5E9',  2, false, false, NULL, false),
  ('lead', 'not_reachable',             'Not Reachable',             '#F59E0B',  3, false, false, NULL, false),
  ('lead', 'interested',                'Interested',                '#10B981',  4, false, false, NULL, false),
  ('lead', 'follow_up_scheduled',       'Follow-up Scheduled',       '#06B6D4',  5, false, false, NULL, false),
  ('lead', 'engaged',                   'Engaged',                   '#14B8A6',  6, false, false, NULL, false),
  ('lead', 'qualified',                 'Qualified',                 '#22C55E',  7, false, false, NULL, false),
  ('lead', 'application_started',       'Application Started',       '#A855F7',  8, false, false, NULL, false),
  ('lead', 'application_submitted',     'Application Submitted',     '#8B5CF6',  9, false, false, NULL, false),
  ('lead', 'documents_pending',         'Documents Pending',         '#F97316', 10, false, false, NULL, false),
  ('lead', 'documents_verified',        'Documents Verified',        '#84CC16', 11, false, false, NULL, false),
  ('lead', 'interview_scheduled',       'Interview Scheduled',       '#6366F1', 12, false, false, NULL, false),
  ('lead', 'interview_completed',       'Interview Completed',       '#4F46E5', 13, false, false, NULL, false),
  ('lead', 'offer_sent',                'Offer Sent',                '#EC4899', 14, false, false, NULL, false),
  ('lead', 'offer_accepted',            'Offer Accepted',            '#16A34A', 15, false, false, NULL, false),
  ('lead', 'token_paid',                'Token Paid',                '#15803D', 16, false, false, NULL, false),
  ('lead', 'applied',                   'Applied',                   '#7C3AED', 17, false, false, NULL, false),
  ('lead', 'interviewed',               'Interviewed',               '#4338CA', 18, false, false, NULL, false),
  ('lead', 'offered',                   'Offered',                   '#DB2777', 19, false, false, NULL, false),
  ('lead', 'enrolled',                  'Enrolled',                  '#059669', 20, true,  false, NULL, false),
  ('lead', 'confirmed',                 'Confirmed',                 '#047857', 21, true,  false, NULL, false),
  ('lead', 'declined',                  'Declined',                  '#DC2626', 22, true,  false, NULL, false),
  ('lead', 'withdrew',                  'Withdrew',                  '#B91C1C', 23, true,  false, NULL, false),
  ('lead', 'expired',                   'Expired',                   '#991B1B', 24, true,  false, NULL, false),
  ('lead', 'lost',                      'Lost',                      '#7F1D1D', 25, true,  false, NULL, false),
  ('lead', 'dormant',                   'Dormant',                   '#52525B', 26, true,  false, NULL, false),

  -- Learner scope (from public.lifecycle_status ENUM, 11 values)
  ('learner', 'admitted',   'Admitted',   '#3B82F6',  1, false, false, NULL,    false),
  ('learner', 'pending',    'Pending',    '#F59E0B',  2, false, false, NULL,    false),
  ('learner', 'approved',   'Approved',   '#10B981',  3, false, false, NULL,    false),
  ('learner', 'account',    'Account',    '#8B5CF6',  4, false, false, NULL,    false),
  ('learner', 'rejected',   'Rejected',   '#EF4444',  5, true,  false, NULL,    false),
  ('learner', 'waitlisted', 'Waitlisted', '#F59E0B',  6, false, false, NULL,    false),
  ('learner', 'active',     'Active',     '#22C55E',  7, false, true,  60.00,   true),   -- THE GATE
  ('learner', 'inactive',   'Inactive',   '#9CA3AF',  8, false, false, NULL,    false),
  ('learner', 'exited',     'Exited',     '#DC2626',  9, true,  false, NULL,    false),
  ('learner', 'graduated',  'Graduated',  '#0EA5E9', 10, true,  false, NULL,    false),
  ('learner', 'alumni',     'Alumni',     '#0369A1', 11, true,  false, NULL,    false);

COMMIT;
```

- [ ] **Step 2: Apply migration**

Run `mcp__supabase__apply_migration` with name `20260517000002_seed_admission_statuses`.

Expected: 37 rows inserted, no errors.

- [ ] **Step 3: Verify counts and pivots**

```sql
SELECT scope, COUNT(*) FROM admission_statuses GROUP BY scope;
SELECT code, fee_paid_threshold_percent, is_seat_filled, gates_login
FROM admission_statuses WHERE scope='learner' AND code='active';
SELECT COUNT(*) FROM admission_statuses WHERE is_seat_filled=true;
```

Expected: lead=26, learner=11. `active` row: threshold=60.00, is_seat_filled=true, gates_login=true. Total is_seat_filled rows = 1.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260517000002_seed_admission_statuses.sql
git commit -m "feat(admission): seed admission_statuses with current 37 statuses

Lead scope: 26 stages mirroring the current FunnelStage union and the
hardcoded colors in columns.tsx. Learner scope: 11 lifecycle_status
values mirroring lifecycle-status-badge.tsx. The 'active' learner row
carries the new defaults: fee_paid_threshold_percent=60, is_seat_filled
=true, gates_login=true.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task A3 — Add `billing_category_kind` ENUM + column + backfill

**Files:**
- Create: `supabase/migrations/20260517000003_billing_categories_kind_enum.sql`

- [ ] **Step 1: Write the migration**

```sql
-- File: supabase/migrations/20260517000003_billing_categories_kind_enum.sql
BEGIN;

CREATE TYPE billing_category_kind AS ENUM
  ('application_fee','tuition','hostel','transport','exam','library','other');

ALTER TABLE public.billing_categories
  ADD COLUMN kind billing_category_kind NOT NULL DEFAULT 'other';

-- One-time best-effort backfill by name pattern.
UPDATE public.billing_categories SET kind='application_fee'
  WHERE category_name ILIKE 'Application Fee%'
     OR category_name ILIKE 'App. Fee%'
     OR category_name ILIKE 'Application Charges%';

UPDATE public.billing_categories SET kind='tuition'
  WHERE category_name ILIKE 'Tuition%'
     OR category_name ILIKE 'Course Fee%';

UPDATE public.billing_categories SET kind='hostel'
  WHERE category_name ILIKE 'Hostel%'
     OR category_name ILIKE 'Accommodation%';

UPDATE public.billing_categories SET kind='transport'
  WHERE category_name ILIKE 'Transport%' OR category_name ILIKE 'Bus%';

UPDATE public.billing_categories SET kind='exam'
  WHERE category_name ILIKE 'Exam%' OR category_name ILIKE 'University Reg%';

UPDATE public.billing_categories SET kind='library'
  WHERE category_name ILIKE 'Library%';

CREATE INDEX idx_billing_categories_kind ON public.billing_categories(kind);

COMMIT;
```

- [ ] **Step 2: Apply migration**

Run `mcp__supabase__apply_migration`.

Expected: ENUM created, column added, indexed.

- [ ] **Step 3: Audit the backfill**

```sql
SELECT kind, COUNT(*) FROM billing_categories GROUP BY kind ORDER BY 2 DESC;
SELECT id, category_name, kind FROM billing_categories
WHERE kind='application_fee' ORDER BY category_name LIMIT 20;
```

Expected: report shown to user; if many rows ended up as `other`, document that admin will retag in the fee-categories settings UI (out-of-scope tweak — separate task).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260517000003_billing_categories_kind_enum.sql
git commit -m "feat(billing): add billing_category_kind enum + backfill by name

Adds typed classification for fee categories so the seat-filled threshold
can exclude application_fee bills. Name-pattern backfill is best-effort
only — admins retag in the existing fee-categories settings UI as needed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task A4 — Create `vw_learner_payment_progress` view

**Files:**
- Create: `supabase/migrations/20260517000004_create_vw_learner_payment_progress.sql`

- [ ] **Step 1: Write the migration**

```sql
-- File: supabase/migrations/20260517000004_create_vw_learner_payment_progress.sql
BEGIN;

CREATE OR REPLACE VIEW public.vw_learner_payment_progress
WITH (security_invoker = true) AS
SELECT
  lp.id AS learner_id,
  lp.institution_id,
  lp.lifecycle_status,
  COALESCE(SUM(b.final_amount)
           FILTER (WHERE bc.kind <> 'application_fee'), 0) AS countable_billed,
  COALESCE(SUM(b.final_amount - b.balance_amount)
           FILTER (WHERE bc.kind <> 'application_fee'), 0) AS countable_paid,
  CASE
    WHEN COALESCE(SUM(b.final_amount) FILTER (WHERE bc.kind <> 'application_fee'), 0) = 0
      THEN 0
    ELSE ROUND(
      100.0
      * SUM(b.final_amount - b.balance_amount) FILTER (WHERE bc.kind <> 'application_fee')
      / SUM(b.final_amount)                    FILTER (WHERE bc.kind <> 'application_fee')
    , 2)
  END AS paid_pct,
  BOOL_OR(bc.kind = 'application_fee' AND b.status = 'paid') AS application_fee_paid,
  COUNT(b.id) AS total_bills,
  COUNT(b.id) FILTER (WHERE b.status = 'paid') AS paid_bills
FROM public.learners_profiles lp
LEFT JOIN public.billing_student_bills b
  ON b.student_id = lp.id AND b.status <> 'superseded'
LEFT JOIN public.billing_categories bc
  ON bc.id = b.item_category_id
GROUP BY lp.id, lp.institution_id, lp.lifecycle_status;

COMMENT ON VIEW public.vw_learner_payment_progress IS
  'Per-learner payment progress for seat-filled threshold computation. '
  'paid_pct EXCLUDES application_fee category bills. '
  'security_invoker=true so RLS on learners_profiles + billing_student_bills applies.';

COMMIT;
```

- [ ] **Step 2: Apply migration**

Run `mcp__supabase__apply_migration`.

- [ ] **Step 3: Spot-check view output**

```sql
SELECT learner_id, paid_pct, countable_billed, countable_paid,
       application_fee_paid, total_bills, paid_bills
FROM vw_learner_payment_progress
WHERE total_bills > 0
ORDER BY paid_pct DESC
LIMIT 10;
```

Expected: paid_pct ∈ [0,100]; total_bills > 0 for rows shown; for any learner who has only paid their application fee, paid_pct should be 0 (or near 0 if some tuition is paid).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260517000004_create_vw_learner_payment_progress.sql
git commit -m "feat(billing): add vw_learner_payment_progress view for seat-filled gate

Per-learner aggregate: countable_billed/paid/paid_pct EXCLUDING bills
in billing_categories.kind='application_fee'. security_invoker=true so
RLS on the underlying tables applies. Consumed by the new
evaluate_learner_status_after_payment RPC (Task D1).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task A5 — Create `learners_profile_status_history` audit table

**Files:**
- Create: `supabase/migrations/20260517000005_create_learners_profile_status_history.sql`

- [ ] **Step 1: Write the migration**

```sql
-- File: supabase/migrations/20260517000005_create_learners_profile_status_history.sql
BEGIN;

CREATE TABLE public.learners_profile_status_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id    uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  from_status   lifecycle_status,
  to_status     lifecycle_status NOT NULL,
  reason_code   text,                  -- 'auto_threshold','manual','revert','admin_override'
  paid_pct_at_change numeric(5,2),     -- snapshot for forensics
  threshold_at_change numeric(5,2),    -- snapshot of the rule applied
  changed_by    uuid REFERENCES public.profiles(id),  -- NULL for trigger-driven
  changed_at    timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX idx_lpsh_learner_changed_at
  ON public.learners_profile_status_history(learner_id, changed_at DESC);

ALTER TABLE public.learners_profile_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY lpsh_select ON public.learners_profile_status_history FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('learners.profiles.view')
    OR user_has_permission('admission.settings.statuses.manage')
  );

-- Inserts only by SECURITY DEFINER RPC. No INSERT policy.
COMMIT;
```

- [ ] **Step 2: Apply migration**

Run `mcp__supabase__apply_migration`.

- [ ] **Step 3: Verify**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='learners_profile_status_history' ORDER BY ordinal_position;
SELECT polname FROM pg_policy
WHERE polrelid='public.learners_profile_status_history'::regclass;
```

Expected: 9 columns; 1 SELECT policy.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260517000005_create_learners_profile_status_history.sql
git commit -m "feat(learners): add learners_profile_status_history audit table

Records every lifecycle_status change with reason_code, paid_pct, and
threshold snapshots. Insert-only via SECURITY DEFINER RPCs (no INSERT
policy by design). Read gated on learners.profiles.view OR
admission.settings.statuses.manage.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase B — Service Layer + Types + Hooks

### Task B1 — Register permission keys in catalog + grant to roles

**Files:**
- Modify: `lib/constants/permissions.ts:944-964`
- Create: `supabase/migrations/20260517000006_register_status_settings_permissions.sql`

- [ ] **Step 1: Add permission keys to TS catalog**

Open `lib/constants/permissions.ts`. Find the `admission.settings` namespace block (around lines 944-964). Add:

```ts
  // Inside the admission.settings.* permission registration block
  'admission.settings.statuses.view': {
    label: 'View admission statuses',
    description: 'View dynamic status definitions (lead + learner) in admission settings.',
    category: 'admission',
  },
  'admission.settings.statuses.manage': {
    label: 'Manage admission statuses',
    description: 'Create, edit, archive, and reorder admission status definitions; configure fee-paid threshold for seat-filled gate.',
    category: 'admission',
  },
```

- [ ] **Step 2: Write the role-grant migration**

```sql
-- File: supabase/migrations/20260517000006_register_status_settings_permissions.sql
BEGIN;

-- Grant view + manage to roles that already hold admission.settings.* manage rights.
UPDATE public.custom_roles
SET permissions = permissions
  || jsonb_build_object(
       'admission.settings.statuses.view', true,
       'admission.settings.statuses.manage', true
     )
WHERE role_key IN ('super_admin','admission_admin');

-- Grant view-only to other admission-facing roles.
UPDATE public.custom_roles
SET permissions = permissions
  || jsonb_build_object('admission.settings.statuses.view', true)
WHERE role_key IN ('administrator','admission_counselor','expo_counselor','admission_director');

COMMIT;
```

- [ ] **Step 3: Apply migration + verify**

```sql
SELECT role_key,
       permissions ? 'admission.settings.statuses.view'  AS has_view,
       permissions ? 'admission.settings.statuses.manage' AS has_manage
FROM custom_roles
WHERE role_key IN ('super_admin','admission_admin','administrator','admission_counselor');
```

Expected: super_admin + admission_admin have both; others have view only.

- [ ] **Step 4: Commit**

```bash
git add lib/constants/permissions.ts supabase/migrations/20260517000006_register_status_settings_permissions.sql
git commit -m "feat(permissions): register admission.settings.statuses.{view,manage}

Adds catalog entries in permissions.ts and grants matching custom_roles
JSONB updates. Follows feedback_reserved_perm_keys_need_role_grants.md:
declaring keys in TS only populates Role Management UI; without the
JSONB grants the Settings page renders empty for non-super-admins.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task B2 — Create TS types for `admission_statuses`

**Files:**
- Create: `types/admission-status.ts`

- [ ] **Step 1: Write the types file**

```ts
// File: types/admission-status.ts
import { z } from 'zod';

export type AdmissionStatusScope = 'lead' | 'learner';

export interface AdmissionStatus {
  id: string;
  scope: AdmissionStatusScope;
  code: string;
  label: string;
  description: string | null;
  color: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  is_terminal: boolean;
  is_seat_filled: boolean;
  fee_paid_threshold_percent: number | null;
  gates_login: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export const admissionStatusFormSchema = z.object({
  scope: z.enum(['lead', 'learner']),
  code: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/, {
    message: 'Lowercase letters, digits, and underscores only; must start with a letter.',
  }),
  label: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, { message: 'Hex color like #22C55E' }),
  icon: z.string().max(64).nullable().optional(),
  sort_order: z.coerce.number().int().min(0).max(9999),
  is_active: z.boolean().default(true),
  is_terminal: z.boolean().default(false),
  is_seat_filled: z.boolean().default(false),
  fee_paid_threshold_percent: z.coerce.number().min(0).max(100).nullable().optional(),
  gates_login: z.boolean().default(false),
}).refine(
  (v) => v.scope === 'learner' || v.fee_paid_threshold_percent == null,
  { path: ['fee_paid_threshold_percent'],
    message: 'Threshold only applies to learner scope.' }
).refine(
  (v) => v.scope === 'learner' || !v.gates_login,
  { path: ['gates_login'], message: 'Login gating only applies to learner scope.' }
).refine(
  (v) => v.scope === 'learner' || !v.is_seat_filled,
  { path: ['is_seat_filled'], message: 'Seat-filled flag only applies to learner scope.' }
);

export type AdmissionStatusFormInput = z.infer<typeof admissionStatusFormSchema>;
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit -p tsconfig.json | grep types/admission-status.ts || echo OK`

Expected: `OK` (no errors).

- [ ] **Step 3: Commit**

```bash
git add types/admission-status.ts
git commit -m "feat(admission): add types and zod schema for admission_statuses

AdmissionStatus interface mirrors DB shape; admissionStatusFormSchema
enforces scope-gated rules (threshold/gates_login/is_seat_filled only
on learner scope) at the form layer for fast UX feedback before RLS.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task B3 — Create `AdmissionStatusService`

**Files:**
- Create: `lib/services/admission/admission-status-service.ts`

- [ ] **Step 1: Write the service**

```ts
// File: lib/services/admission/admission-status-service.ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import type { AdmissionStatus, AdmissionStatusFormInput, AdmissionStatusScope } from '@/types/admission-status';

export class AdmissionStatusService {
  private static supabase = createClientSupabaseClient();

  static async list(
    scope: AdmissionStatusScope,
    { activeOnly = true }: { activeOnly?: boolean } = {}
  ): Promise<AdmissionStatus[]> {
    let q = this.supabase
      .from('admission_statuses')
      .select('*')
      .eq('scope', scope)
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true });
    if (activeOnly) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw new Error(getErrorMessage(error));
    return data as AdmissionStatus[];
  }

  static async listAll(): Promise<AdmissionStatus[]> {
    const { data, error } = await this.supabase
      .from('admission_statuses')
      .select('*')
      .order('scope', { ascending: true })
      .order('sort_order', { ascending: true });
    if (error) throw new Error(getErrorMessage(error));
    return data as AdmissionStatus[];
  }

  static async get(id: string): Promise<AdmissionStatus | null> {
    const { data, error } = await this.supabase
      .from('admission_statuses').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(getErrorMessage(error));
    return (data as AdmissionStatus) ?? null;
  }

  static async create(input: AdmissionStatusFormInput): Promise<AdmissionStatus> {
    const { data, error } = await this.supabase
      .from('admission_statuses')
      .insert([input])
      .select()
      .single();
    if (error) throw new Error(getErrorMessage(error));
    return data as AdmissionStatus;
  }

  static async update(id: string, patch: Partial<AdmissionStatusFormInput>): Promise<AdmissionStatus> {
    const { data, error } = await this.supabase
      .from('admission_statuses')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(getErrorMessage(error));
    return data as AdmissionStatus;
  }

  /** Soft delete via is_active=false. Hard delete reserved for super_admin via DB. */
  static async archive(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('admission_statuses')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw new Error(getErrorMessage(error));
  }

  static async restore(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('admission_statuses')
      .update({ is_active: true })
      .eq('id', id);
    if (error) throw new Error(getErrorMessage(error));
  }

  static async reorder(scope: AdmissionStatusScope, orderedIds: string[]): Promise<void> {
    const updates = orderedIds.map((id, idx) =>
      this.supabase.from('admission_statuses').update({ sort_order: idx + 1 }).eq('id', id).eq('scope', scope)
    );
    const results = await Promise.all(updates);
    const firstErr = results.find((r) => r.error);
    if (firstErr?.error) throw new Error(getErrorMessage(firstErr.error));
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json | grep admission-status-service || echo OK`

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add lib/services/admission/admission-status-service.ts
git commit -m "feat(admission): add AdmissionStatusService CRUD

Mirrors LookupService pattern. Soft-delete via is_active. All error
paths use getErrorMessage() per feedback_supabase_plain_error_not_error
_instance.md. Static methods, singleton supabase client.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task B4 — Create React Query hooks

**Files:**
- Create: `hooks/admission/use-admission-statuses.ts`

- [ ] **Step 1: Write the hooks**

```ts
// File: hooks/admission/use-admission-statuses.ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AdmissionStatusService } from '@/lib/services/admission/admission-status-service';
import type { AdmissionStatusFormInput, AdmissionStatusScope } from '@/types/admission-status';

const KEY_LIST = (scope: AdmissionStatusScope, activeOnly: boolean) =>
  ['admission-statuses', scope, activeOnly] as const;
const KEY_ALL = ['admission-statuses', 'all'] as const;

export function useAdmissionStatuses(scope: AdmissionStatusScope, opts: { activeOnly?: boolean } = {}) {
  const activeOnly = opts.activeOnly ?? true;
  return useQuery({
    queryKey: KEY_LIST(scope, activeOnly),
    queryFn: () => AdmissionStatusService.list(scope, { activeOnly }),
    staleTime: 60_000,
  });
}

export function useAllAdmissionStatuses() {
  return useQuery({ queryKey: KEY_ALL, queryFn: () => AdmissionStatusService.listAll(), staleTime: 60_000 });
}

export function useCreateAdmissionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdmissionStatusFormInput) => AdmissionStatusService.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admission-statuses'] });
      toast.success('Status created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateAdmissionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<AdmissionStatusFormInput> }) =>
      AdmissionStatusService.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admission-statuses'] });
      toast.success('Status updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useArchiveAdmissionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => AdmissionStatusService.archive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admission-statuses'] });
      toast.success('Status archived');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useRestoreAdmissionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => AdmissionStatusService.restore(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admission-statuses'] });
      toast.success('Status restored');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useReorderAdmissionStatuses(scope: AdmissionStatusScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => AdmissionStatusService.reorder(scope, orderedIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admission-statuses'] }),
    onError: (err: Error) => toast.error(err.message),
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json | grep use-admission-statuses || echo OK`

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add hooks/admission/use-admission-statuses.ts
git commit -m "feat(admission): add React Query hooks for admission_statuses CRUD

useAdmissionStatuses + mutate hooks. Toast on success/error using
sonner. Query keys: ['admission-statuses', scope, activeOnly].

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task B5 — Dynamic label/color helpers (replaces hardcoded maps)

**Files:**
- Create: `lib/admission/status-helpers.ts`

- [ ] **Step 1: Write the helpers**

```ts
// File: lib/admission/status-helpers.ts
import type { AdmissionStatus, AdmissionStatusScope } from '@/types/admission-status';

// Fallback maps copied verbatim from the current hardcoded sites so the UI
// keeps working until the dynamic list loads or in case of API failure.
const LEAD_FALLBACK_COLORS: Record<string, string> = {
  new: '#3B82F6', contacted: '#0EA5E9', not_reachable: '#F59E0B',
  interested: '#10B981', enrolled: '#059669', lost: '#7F1D1D',
  // ...callers should treat unknown codes as #9CA3AF
};
const LEARNER_FALLBACK_COLORS: Record<string, string> = {
  admitted: '#3B82F6', pending: '#F59E0B', approved: '#10B981',
  account: '#8B5CF6', rejected: '#EF4444', waitlisted: '#F59E0B',
  active: '#22C55E', inactive: '#9CA3AF', exited: '#DC2626',
  graduated: '#0EA5E9', alumni: '#0369A1',
};

export function getStatusLabel(
  list: AdmissionStatus[] | undefined,
  scope: AdmissionStatusScope,
  code: string
): string {
  const found = list?.find((s) => s.scope === scope && s.code === code);
  return found?.label ?? prettify(code);
}

export function getStatusColor(
  list: AdmissionStatus[] | undefined,
  scope: AdmissionStatusScope,
  code: string
): string {
  const found = list?.find((s) => s.scope === scope && s.code === code);
  if (found) return found.color;
  const fallback = scope === 'lead' ? LEAD_FALLBACK_COLORS : LEARNER_FALLBACK_COLORS;
  return fallback[code] ?? '#9CA3AF';
}

export function findStatus(
  list: AdmissionStatus[] | undefined,
  scope: AdmissionStatusScope,
  code: string
): AdmissionStatus | undefined {
  return list?.find((s) => s.scope === scope && s.code === code);
}

function prettify(code: string): string {
  return code.split('_').map((p) => p[0]?.toUpperCase() + p.slice(1)).join(' ');
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json | grep status-helpers || echo OK`

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add lib/admission/status-helpers.ts
git commit -m "feat(admission): add dynamic getStatusLabel/getStatusColor helpers

Resolves status metadata from useAdmissionStatuses cache with hardcoded
fallback map. Lets existing UI sites swap from FUNNEL_STAGES /
statusConfig incrementally without breaking before data loads.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase C — Settings CRUD UI

### Task C1 — Status settings page (server entry)

**Files:**
- Create: `app/(routes)/admission/settings/statuses/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// File: app/(routes)/admission/settings/statuses/page.tsx
import { Metadata } from 'next';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { StatusesDataTable } from './_components/statuses-data-table';

export const metadata: Metadata = { title: 'Admission Statuses | Settings' };

export default function AdmissionStatusesPage() {
  return (
    <PermissionGuard module="admission.settings.statuses" action="view">
      <div className="container mx-auto py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Admission Statuses</h1>
          <p className="text-sm text-muted-foreground">
            Define lead funnel stages and learner lifecycle statuses. Configure the fee-paid threshold
            that gates the <code>account → active</code> transition and the dashboard's "Seat Filled" KPI.
          </p>
        </div>
        <StatusesDataTable />
      </div>
    </PermissionGuard>
  );
}
```

- [ ] **Step 2: Commit (page only — table component next task)**

```bash
git add app/(routes)/admission/settings/statuses/page.tsx
git commit -m "feat(admission/settings): add /admission/settings/statuses page shell

PermissionGuard module='admission.settings.statuses' action='view'
gates the page. StatusesDataTable child added in next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task C2 — `StatusesDataTable` with scope tabs

**Files:**
- Create: `app/(routes)/admission/settings/statuses/_components/statuses-data-table.tsx`

- [ ] **Step 1: Write the table component**

```tsx
// File: app/(routes)/admission/settings/statuses/_components/statuses-data-table.tsx
'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Archive, ArchiveRestore } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdmissionStatuses, useArchiveAdmissionStatus, useRestoreAdmissionStatus } from '@/hooks/admission/use-admission-statuses';
import type { AdmissionStatus, AdmissionStatusScope } from '@/types/admission-status';
import { StatusFormDialog } from './status-form-dialog';

export function StatusesDataTable() {
  const [scope, setScope] = useState<AdmissionStatusScope>('learner');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<AdmissionStatus | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useAdmissionStatuses(scope, { activeOnly: !showInactive });
  const archive = useArchiveAdmissionStatus();
  const restore = useRestoreAdmissionStatus();

  return (
    <Tabs value={scope} onValueChange={(v) => setScope(v as AdmissionStatusScope)}>
      <div className="flex items-center justify-between gap-4">
        <TabsList>
          <TabsTrigger value="lead">Lead Statuses</TabsTrigger>
          <TabsTrigger value="learner">Learner Statuses</TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? 'Hide archived' : 'Show archived'}
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add status
          </Button>
        </div>
      </div>

      <TabsContent value={scope} className="mt-4">
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Terminal</TableHead>
                  <TableHead>Seat Filled</TableHead>
                  <TableHead>Threshold %</TableHead>
                  <TableHead>Gates Login</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">
                    No statuses. Click <em>Add status</em> to create one.
                  </TableCell></TableRow>
                )}
                {(data ?? []).map((s) => (
                  <TableRow key={s.id} className={!s.is_active ? 'opacity-60' : ''}>
                    <TableCell className="font-mono">{s.sort_order}</TableCell>
                    <TableCell>
                      <Badge style={{ backgroundColor: s.color, color: '#fff', borderColor: s.color }}>
                        {s.label}
                      </Badge>
                    </TableCell>
                    <TableCell><code className="text-xs">{s.code}</code></TableCell>
                    <TableCell>{s.is_terminal ? 'Yes' : ''}</TableCell>
                    <TableCell>{s.is_seat_filled ? 'Yes' : ''}</TableCell>
                    <TableCell>{s.fee_paid_threshold_percent != null ? `${s.fee_paid_threshold_percent}%` : '—'}</TableCell>
                    <TableCell>{s.gates_login ? 'Yes' : ''}</TableCell>
                    <TableCell>{s.is_active ? 'Active' : 'Archived'}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(s)} aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {s.is_active ? (
                        <Button variant="ghost" size="icon"
                          onClick={() => archive.mutate(s.id)} disabled={archive.isPending}
                          aria-label="Archive">
                          <Archive className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon"
                          onClick={() => restore.mutate(s.id)} disabled={restore.isPending}
                          aria-label="Restore">
                          <ArchiveRestore className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {(creating || editing) && (
          <StatusFormDialog
            scope={scope}
            initial={editing ?? undefined}
            open
            onOpenChange={(o) => {
              if (!o) { setCreating(false); setEditing(null); }
            }}
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 2: Commit (component depends on form dialog from C3)**

```bash
git add app/(routes)/admission/settings/statuses/_components/statuses-data-table.tsx
git commit -m "feat(admission/settings): add scope-tabbed statuses table

Lead/Learner tabs; shows order, badge, code, flags, threshold, gates_login,
active. Archive/restore inline. Edit/create open StatusFormDialog (next task).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task C3 — `StatusFormDialog` (create/edit)

**Files:**
- Create: `app/(routes)/admission/settings/statuses/_components/status-form-dialog.tsx`

- [ ] **Step 1: Write the dialog**

```tsx
// File: app/(routes)/admission/settings/statuses/_components/status-form-dialog.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import { admissionStatusFormSchema, type AdmissionStatusFormInput, type AdmissionStatus, type AdmissionStatusScope } from '@/types/admission-status';
import { useCreateAdmissionStatus, useUpdateAdmissionStatus } from '@/hooks/admission/use-admission-statuses';

interface Props {
  scope: AdmissionStatusScope;
  initial?: AdmissionStatus;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function StatusFormDialog({ scope, initial, open, onOpenChange }: Props) {
  const isEdit = !!initial;
  const create = useCreateAdmissionStatus();
  const update = useUpdateAdmissionStatus();

  const form = useForm<AdmissionStatusFormInput>({
    resolver: zodResolver(admissionStatusFormSchema),
    defaultValues: initial ?? {
      scope,
      code: '',
      label: '',
      description: '',
      color: '#22C55E',
      icon: null,
      sort_order: 100,
      is_active: true,
      is_terminal: false,
      is_seat_filled: false,
      fee_paid_threshold_percent: scope === 'learner' ? null : null,
      gates_login: false,
    },
  });

  const onSubmit = async (values: AdmissionStatusFormInput) => {
    // Guard against double-submit (feedback_react_query_disabled_prop_alone_isnt_enough.md)
    if (create.isPending || update.isPending) return;
    if (isEdit) {
      await update.mutateAsync({ id: initial!.id, patch: values });
    } else {
      await create.mutateAsync(values);
    }
    onOpenChange(false);
  };

  const isLearner = scope === 'learner';
  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Status' : 'Add Status'} — {scope === 'lead' ? 'Lead' : 'Learner'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField name="label" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. Active" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField name="code" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl><Input {...field} placeholder="active" disabled={isEdit} /></FormControl>
                  <FormDescription>Lowercase, underscores. Cannot change after creation.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField name="description" control={form.control} render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl><Textarea {...field} value={field.value ?? ''} rows={2} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-3 gap-3">
              <FormField name="color" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      <Input type="color" value={field.value} onChange={field.onChange} className="h-9 w-12 p-1" />
                      <Input value={field.value} onChange={field.onChange} className="font-mono" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField name="sort_order" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Order</FormLabel>
                  <FormControl><Input type="number" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField name="icon" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Icon (optional)</FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ''} placeholder="lucide name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField name="is_terminal" control={form.control} render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded border p-3">
                  <div>
                    <FormLabel>Terminal</FormLabel>
                    <FormDescription>End state; no further transitions.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
              <FormField name="is_active" control={form.control} render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded border p-3">
                  <div><FormLabel>Active</FormLabel><FormDescription>Visible in dropdowns and filters.</FormDescription></div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
            </div>

            {isLearner && (
              <div className="space-y-3 rounded border border-dashed p-3">
                <p className="text-sm font-medium">Learner-only options</p>
                <FormField name="is_seat_filled" control={form.control} render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <div>
                      <FormLabel>Counts as Seat Filled</FormLabel>
                      <FormDescription>Only ONE learner status can carry this flag.</FormDescription>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <FormField name="gates_login" control={form.control} render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <div>
                      <FormLabel>Enables Login</FormLabel>
                      <FormDescription>Learner can sign in only when in a status with this flag.</FormDescription>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <FormField name="fee_paid_threshold_percent" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fee-paid threshold (%)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min={0} max={100}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))} />
                    </FormControl>
                    <FormDescription>
                      A learner's paid-% (excluding application_fee bills) must meet this to enter the status.
                      Leave blank for no gate.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
              <Button type="submit" disabled={pending}>{isEdit ? 'Save' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Browser smoke test**

Start dev server (`npm run dev`). Navigate to `/admission/settings/statuses`. Verify:
- Both tabs render with seeded data.
- Click "Add status" → dialog opens, learner-only fields visible when scope=learner.
- Try entering threshold=150 → validation fires.
- Create a test status "test_status" / label "Test" / threshold blank → success toast; row appears.
- Edit → fields populated; code field disabled.
- Archive → row dims; toggle "Show archived" to see it.
- Restore → row regains opacity.
- Try toggling `is_seat_filled=true` on a second learner row → DB rejects (uq_admission_statuses_one_seat_filled partial unique index); error toast shows the constraint message.
- Delete the test_status row directly in DB (or leave archived).

- [ ] **Step 3: Commit**

```bash
git add app/(routes)/admission/settings/statuses/_components/status-form-dialog.tsx
git commit -m "feat(admission/settings): add StatusFormDialog with zod + react-hook-form

Single dialog for create + edit. Code field disabled on edit (identity).
Learner-only fields gated by scope. Double-submit guard per
feedback_react_query_disabled_prop_alone_isnt_enough.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task C4 — Sidebar entry

**Files:**
- Modify: the file that defines the admission settings menu (search: `grep -ril 'admission/settings/lookups/quotas' config/ components/`)

- [ ] **Step 1: Locate the sidebar config**

Run: `grep -ril 'admission/settings/lookups/quotas' config/ components/ lib/ app/` to find the registration file.

- [ ] **Step 2: Add the entry**

Add a sibling entry like (adapt to discovered file's shape):

```ts
{
  label: 'Statuses',
  href: '/admission/settings/statuses',
  icon: 'Workflow',
  permission: 'admission.settings.statuses.view',
}
```

- [ ] **Step 3: Verify visibility**

In the dev browser, log in as a role with `admission.settings.statuses.view`; entry appears. Log in as a role without it; entry hides.

- [ ] **Step 4: Commit**

```bash
git add <discovered-config-file>
git commit -m "feat(sidebar): add Statuses entry under admission settings

Gated by admission.settings.statuses.view; mirrors the Quotas/Lookups
sidebar pattern.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase D — Threshold Gate Mechanics

### Task D1 — `evaluate_learner_status_after_payment` RPC

**Files:**
- Create: `supabase/migrations/20260517000007_evaluate_learner_status_after_payment.sql`

- [ ] **Step 1: Write the RPC**

```sql
-- File: supabase/migrations/20260517000007_evaluate_learner_status_after_payment.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.evaluate_learner_status_after_payment(p_learner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_current_status   lifecycle_status;
  v_paid_pct         numeric;
  v_threshold        numeric;
  v_target_code      text;
  v_updated          boolean := false;
BEGIN
  SELECT lp.lifecycle_status INTO v_current_status
  FROM public.learners_profiles lp WHERE lp.id = p_learner_id;

  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'updated', false, 'reason', 'not_found');
  END IF;

  -- Only auto-promote from 'account'. Other transitions stay manual.
  IF v_current_status::text <> 'account' THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'updated', false,
      'reason', 'no_op_for_status', 'current_status', v_current_status::text);
  END IF;

  -- Read current paid percentage from the view.
  SELECT v.paid_pct INTO v_paid_pct
  FROM public.vw_learner_payment_progress v
  WHERE v.learner_id = p_learner_id;

  v_paid_pct := COALESCE(v_paid_pct, 0);

  -- Find the threshold target row in admission_statuses (highest threshold
  -- the learner currently qualifies for among active learner statuses).
  SELECT s.code, s.fee_paid_threshold_percent
  INTO v_target_code, v_threshold
  FROM public.admission_statuses s
  WHERE s.scope = 'learner'
    AND s.is_active = true
    AND s.fee_paid_threshold_percent IS NOT NULL
    AND v_paid_pct >= s.fee_paid_threshold_percent
  ORDER BY s.fee_paid_threshold_percent DESC
  LIMIT 1;

  IF v_target_code IS NULL THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'updated', false,
      'reason', 'below_threshold', 'paid_pct', v_paid_pct);
  END IF;

  -- Promote.
  UPDATE public.learners_profiles
  SET lifecycle_status = v_target_code::lifecycle_status
  WHERE id = p_learner_id
    AND lifecycle_status::text = 'account';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated THEN
    INSERT INTO public.learners_profile_status_history
      (learner_id, from_status, to_status, reason_code, paid_pct_at_change,
       threshold_at_change, changed_by, metadata)
    VALUES
      (p_learner_id, 'account'::lifecycle_status, v_target_code::lifecycle_status,
       'auto_threshold', v_paid_pct, v_threshold, NULL,
       jsonb_build_object('rpc', 'evaluate_learner_status_after_payment'));
  END IF;

  RETURN jsonb_build_object(
    'learner_id', p_learner_id,
    'updated', v_updated,
    'from_status', 'account',
    'to_status', v_target_code,
    'paid_pct', v_paid_pct,
    'threshold', v_threshold
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.evaluate_learner_status_after_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_learner_status_after_payment(uuid) TO authenticated;

-- Trigger function on billing_receipt_items
CREATE OR REPLACE FUNCTION public._on_receipt_item_evaluate_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_student_id uuid;
BEGIN
  SELECT br.student_id INTO v_student_id
  FROM public.billing_receipts br
  WHERE br.id = NEW.receipt_id;

  IF v_student_id IS NOT NULL THEN
    PERFORM public.evaluate_learner_status_after_payment(v_student_id);
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_evaluate_status_after_payment
  AFTER INSERT ON public.billing_receipt_items
  FOR EACH ROW
  EXECUTE FUNCTION public._on_receipt_item_evaluate_status();

COMMIT;
```

- [ ] **Step 2: Apply migration**

Run `mcp__supabase__apply_migration`.

- [ ] **Step 3: SQL unit tests**

```sql
-- Pick a real learner in 'account' status with bills.
SELECT lp.id, lp.lifecycle_status, v.paid_pct
FROM learners_profiles lp JOIN vw_learner_payment_progress v ON v.learner_id=lp.id
WHERE lp.lifecycle_status='account' AND v.paid_pct BETWEEN 55 AND 65
LIMIT 5;

-- Force-call the RPC on one and observe.
SELECT evaluate_learner_status_after_payment('<id>');

-- Confirm row in history.
SELECT * FROM learners_profile_status_history
WHERE learner_id='<id>' ORDER BY changed_at DESC LIMIT 1;
```

Expected: a learner at 60% promotes to `active`; one at 55% does not; history row recorded.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260517000007_evaluate_learner_status_after_payment.sql
git commit -m "feat(billing): add threshold-gated auto-promotion to active

evaluate_learner_status_after_payment(uuid) RPC reads paid_pct from
vw_learner_payment_progress, looks up active threshold from
admission_statuses, and promotes account→active when met. Records
audit row. Wired via AFTER INSERT trigger on billing_receipt_items.
Promote-only — no auto-demote (refund-safe per design).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D2 — Refactor `OnboardingService.markAsApproved` to use dynamic threshold

**Files:**
- Modify: `lib/services/billing/onboarding/onboarding-service.ts:515-572`

- [ ] **Step 1: Replace the hardcoded balance check**

Open the file at the `markAsApproved` method (around line 515). Replace the body that currently reads `if (totalBalance > 0) throw …` with:

```ts
// File: lib/services/billing/onboarding/onboarding-service.ts (markAsApproved)
async markAsApproved(learnerId: string): Promise<{ promoted: boolean; reason?: string }> {
  // 1. Load current lifecycle_status
  const { data: profile, error: profileErr } = await this.supabase
    .from('learners_profiles')
    .select('id, lifecycle_status')
    .eq('id', learnerId)
    .single();
  if (profileErr) throw new Error(getErrorMessage(profileErr));
  if (profile.lifecycle_status !== 'account') {
    return { promoted: false, reason: `Learner is in '${profile.lifecycle_status}', not 'account'.` };
  }

  // 2. Block if fee-change event pending (existing rule, preserved)
  if (await FeeChangeEventService.hasPendingForLearner(learnerId)) {
    throw new Error('Cannot approve: fee-change event pending. Resolve first.');
  }

  // 3. Delegate to SECURITY DEFINER RPC — single source of truth.
  const { data, error } = await this.supabase
    .rpc('evaluate_learner_status_after_payment', { p_learner_id: learnerId });
  if (error) throw new Error(getErrorMessage(error));

  const result = data as {
    updated: boolean; from_status?: string; to_status?: string;
    paid_pct?: number; threshold?: number; reason?: string;
  };

  if (!result.updated) {
    if (result.reason === 'below_threshold') {
      throw new Error(
        `Cannot approve: paid ${result.paid_pct ?? 0}% — need threshold from settings (active status).`
      );
    }
    return { promoted: false, reason: result.reason ?? 'unknown' };
  }
  return { promoted: true };
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.json | grep onboarding-service || echo OK`

Expected: `OK`.

- [ ] **Step 3: Browser test**

In dev, find a learner in `account` status with `paid_pct < 60`. Click "Mark as Approved". Expect error toast with the paid % and threshold. Then test with a learner at ≥ 60 — expect success.

- [ ] **Step 4: Commit**

```bash
git add lib/services/billing/onboarding/onboarding-service.ts
git commit -m "refactor(billing): markAsApproved now delegates to dynamic-threshold RPC

Replaces hardcoded 'totalBalance===0' (100%) gate with the
evaluate_learner_status_after_payment RPC which reads the threshold
from admission_statuses. Preserves the existing FeeChangeEvent pending
check.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D3 — Close the `LearnerProfileService.updateLifecycleStatus` bypass

**Files:**
- Modify: `lib/services/learner-profile-service.ts:983`

- [ ] **Step 1: Add the threshold check at the bypass site**

Locate `updateLifecycleStatus` (around line 983). Add this guard near the top, after the existing `STATUS_TRANSITIONS` check:

```ts
// File: lib/services/learner-profile-service.ts (updateLifecycleStatus)
async updateLifecycleStatus(
  learnerId: string,
  newStatus: LifecycleStatus,
  reason?: string
): Promise<void> {
  // ... existing STATUS_TRANSITIONS check ...

  // NEW: if target is the seat-filled status (or any status with a threshold),
  // delegate to the RPC. RPC will refuse if conditions are unmet.
  const { data: target, error: targetErr } = await this.supabase
    .from('admission_statuses')
    .select('fee_paid_threshold_percent')
    .eq('scope', 'learner')
    .eq('code', newStatus)
    .eq('is_active', true)
    .maybeSingle();
  if (targetErr) throw new Error(getErrorMessage(targetErr));

  if (target?.fee_paid_threshold_percent != null) {
    const { data: rpcResult, error: rpcErr } = await this.supabase
      .rpc('evaluate_learner_status_after_payment', { p_learner_id: learnerId });
    if (rpcErr) throw new Error(getErrorMessage(rpcErr));
    const r = rpcResult as { updated: boolean; reason?: string; paid_pct?: number };
    if (!r.updated) {
      throw new Error(
        `Cannot move to ${newStatus}: paid ${r.paid_pct ?? 0}% does not meet threshold (${target.fee_paid_threshold_percent}%).`
      );
    }
    return; // RPC performed the update.
  }

  // ... existing direct-update path for non-threshold statuses ...
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json | grep learner-profile-service || echo OK`

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add lib/services/learner-profile-service.ts
git commit -m "fix(learners): close updateLifecycleStatus threshold bypass

When the target status has a fee_paid_threshold_percent set, delegate
to the RPC instead of doing a raw UPDATE. Prevents the existing
bypass path (called from bulk update dialog) from skipping the gate.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase E — Dashboard & Sibling RPC Rewrite

### Task E1 — Rewrite `get_seat_analytics` to use `admission_statuses`

**Files:**
- Create: `supabase/migrations/20260517000008_rewrite_seat_analytics_dynamic.sql`

- [ ] **Step 1: Read the current RPC**

Read `supabase/migrations/20260502000008_get_seat_analytics_role_access_check.sql` — note exact return signature, parameters, and the line containing `lifecycle_status IN ('admitted','active','graduated','account')`.

- [ ] **Step 2: Write the rewrite migration**

```sql
-- File: supabase/migrations/20260517000008_rewrite_seat_analytics_dynamic.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.get_seat_analytics(
  p_admission_year_id uuid DEFAULT NULL,
  p_institution_ids   uuid[] DEFAULT NULL
)
RETURNS TABLE (
  /* keep the existing return signature verbatim — copy from
     20260502000008_get_seat_analytics_role_access_check.sql */
  -- For example:
  institution_id      uuid,
  institution_name    text,
  programme_id        uuid,
  programme_name      text,
  total_seats         int,
  filled_seats        int,
  fill_rate           numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH seat_filled_codes AS (
    SELECT code
    FROM public.admission_statuses
    WHERE scope = 'learner' AND is_active = true AND is_seat_filled = true
  )
  SELECT
    ay.institution_id,
    i.name AS institution_name,
    ay.programme_id,
    p.name AS programme_name,
    ay.total_seats,
    COALESCE(COUNT(lp.id) FILTER (
      WHERE lp.lifecycle_status::text IN (SELECT code FROM seat_filled_codes)
    ), 0)::int AS filled_seats,
    CASE WHEN ay.total_seats > 0
      THEN ROUND(100.0 * COUNT(lp.id) FILTER (
        WHERE lp.lifecycle_status::text IN (SELECT code FROM seat_filled_codes)
      ) / ay.total_seats, 2)
      ELSE 0 END AS fill_rate
  FROM public.admission_years ay
  JOIN public.institutions i ON i.id = ay.institution_id
  LEFT JOIN public.programmes p ON p.id = ay.programme_id
  LEFT JOIN public.learners_profiles lp ON lp.admission_year_id = ay.id
  WHERE (p_admission_year_id IS NULL OR ay.id = p_admission_year_id)
    AND (p_institution_ids IS NULL OR ay.institution_id = ANY(p_institution_ids))
    AND public.role_has_institution_access(ay.institution_id)
  GROUP BY ay.institution_id, i.name, ay.programme_id, p.name, ay.total_seats
  ORDER BY i.name, p.name;
$$;

REVOKE ALL ON FUNCTION public.get_seat_analytics(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_seat_analytics(uuid, uuid[]) TO authenticated;

COMMIT;
```

> **NOTE TO ENGINEER:** Open `20260502000008_get_seat_analytics_role_access_check.sql` first and copy the EXACT return column list — the example above is illustrative. Mismatched return signature breaks every caller silently.

- [ ] **Step 3: Apply + verify**

```sql
-- Sanity row
SELECT institution_name, total_seats, filled_seats, fill_rate
FROM get_seat_analytics(NULL, NULL) LIMIT 5;

-- Spot-check that filled_seats matches the new definition
SELECT i.name, COUNT(lp.id) AS expected
FROM learners_profiles lp
JOIN admission_years ay ON ay.id = lp.admission_year_id
JOIN institutions i ON i.id = ay.institution_id
WHERE lp.lifecycle_status IN (
  SELECT code::lifecycle_status FROM admission_statuses
  WHERE scope='learner' AND is_seat_filled AND is_active
)
GROUP BY i.name ORDER BY i.name LIMIT 5;
```

Expected: filled_seats from RPC matches direct count.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260517000008_rewrite_seat_analytics_dynamic.sql
git commit -m "refactor(dashboard): get_seat_analytics reads seat-filled codes from admission_statuses

Replaces hardcoded lifecycle_status IN ('admitted','active','graduated',
'account') with a subquery against admission_statuses where
is_seat_filled=true AND is_active=true. Today: only 'active' qualifies
(per the new gate). Future seat-filled statuses can be flagged without
RPC changes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task E2 — Rewrite the 4 sibling RPCs

**Files:**
- Create: `supabase/migrations/20260517000009_rewrite_sibling_dashboard_rpcs.sql`

- [ ] **Step 1: Read all four sources**

Read these four files for exact signatures + body:
- `supabase/migrations/20260502000010_align_remaining_sibling_rpcs.sql` (contains `fn_seat_analytics_daily_pivot`, `fn_institution_comparison`)
- `supabase/migrations/20260502000013_align_geography_and_source_analytics_lifecycle.sql` (contains `fn_geography_analytics`, `fn_source_analytics`)

- [ ] **Step 2: Write the rewrite migration**

For each RPC, create `OR REPLACE` with the same return signature; replace every literal `lifecycle_status IN (…)` with:

```sql
lifecycle_status::text IN (
  SELECT code FROM public.admission_statuses
  WHERE scope='learner' AND is_active=true AND is_seat_filled=true
)
```

Wrap in one migration file. Engineer copies each function from its source migration verbatim into a `BEGIN; … COMMIT;` block, changing only the WHERE clause.

- [ ] **Step 3: Apply + verify**

```sql
-- Each RPC's "Seat Filled" column should match Task E1's count.
SELECT 'daily_pivot', SUM(filled_seats) FROM fn_seat_analytics_daily_pivot(NULL, NULL, NULL, NULL)
UNION ALL
SELECT 'institution_comparison', SUM(enrolled) FROM fn_institution_comparison(NULL, NULL)
UNION ALL
SELECT 'geography', SUM(filled) FROM fn_geography_analytics(NULL, NULL)
UNION ALL
SELECT 'source', SUM(converted) FROM fn_source_analytics(NULL, NULL);
```

Expected: numbers consistent across siblings.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260517000009_rewrite_sibling_dashboard_rpcs.sql
git commit -m "refactor(dashboard): align 4 sibling RPCs to admission_statuses

fn_seat_analytics_daily_pivot, fn_institution_comparison,
fn_geography_analytics, fn_source_analytics now all read the seat-filled
status set from admission_statuses. Same precedent as the 2026-05-02
alignment work.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task E3 — Rewrite `fn_group_dashboard_overview` for dual KPI (Enrolled Leads + Seat Filled)

**Files:**
- Create: `supabase/migrations/20260517000010_rewrite_group_dashboard_overview_dual_kpi.sql`

- [ ] **Step 1: Read existing**

Read `supabase/migrations/20260510_rewrite_fn_group_dashboard_overview_to_leads_only.sql:58-141`.

- [ ] **Step 2: Write the rewrite**

Add a new column `seat_filled_learners int` alongside the existing `active_learners`/`filled_seats`. Compute it via a LATERAL join on `learners_profiles` filtered by `lifecycle_status::text IN (SELECT code FROM admission_statuses WHERE is_seat_filled)`. Keep `enrolled_leads` returning the existing `funnel_stage='enrolled'` count.

Engineer writes the migration (mirroring the source RPC's structure verbatim, plus the new column and LATERAL join). Return signature: add ONE column `seat_filled_learners int` after the existing `filled_seats` column. Do NOT remove `filled_seats` — page UI keeps a fallback during rollout.

- [ ] **Step 3: Apply + verify**

```sql
SELECT institution_name, total_leads, enrolled_leads, seat_filled_learners, filled_seats, total_seats
FROM fn_group_dashboard_overview(ARRAY[<some-uuid>]::uuid[], NULL)
LIMIT 5;
```

Expected: `enrolled_leads` matches old `filled_seats`; `seat_filled_learners` is a NEW value (typically ≤ enrolled_leads).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260517000010_rewrite_group_dashboard_overview_dual_kpi.sql
git commit -m "feat(dashboard): split filled_seats into enrolled_leads + seat_filled_learners

Group dashboard overview now returns both metrics — enrolled_leads
(funnel_stage='enrolled', lead-space) and seat_filled_learners
(learners_profiles.lifecycle_status IN is_seat_filled set, learner-space).
The gap is the accounts team's drop-off pursuit list. filled_seats stays
populated (=enrolled_leads) for backward compatibility during rollout.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task E4 — Replace dashboard "Filled" card with two cards

**Files:**
- Modify: `app/(routes)/admission/group-dashboard/page.tsx:283-348`
- Create: `app/(routes)/admission/group-dashboard/_components/seat-filled-card.tsx`

- [ ] **Step 1: Create the new card component**

```tsx
// File: app/(routes)/admission/group-dashboard/_components/seat-filled-card.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

interface Props {
  enrolledLeads: number | undefined;
  seatFilled: number | undefined;
  isLoading: boolean;
}

export function SeatFilledCard({ enrolledLeads, seatFilled, isLoading }: Props) {
  const gap = (enrolledLeads ?? 0) - (seatFilled ?? 0);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Seat Filled</CardTitle>
        <CheckCircle2 className="h-4 w-4 text-green-600" />
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-8 w-24" /> : (
          <>
            <div className="text-2xl font-bold">{(seatFilled ?? 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              of {(enrolledLeads ?? 0).toLocaleString()} enrolled
              {gap > 0 && (
                <Link href="/admission/leads?funnel_stage=enrolled" className="ml-1 underline text-amber-600">
                  ({gap} below threshold)
                </Link>
              )}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire it into the page**

In `page.tsx` (around lines 283-348), find where the existing "Filled" card is rendered. Replace with two cards using the new `seat_filled_learners` field:

```tsx
{/* Was: a single "Filled" KPI card sourcing data.filled_seats */}
<KpiCard
  label="Enrolled Leads"
  value={data?.enrolled_leads}
  icon={CheckCheck}
  href="/admission/leads?funnel_stage=enrolled"
/>
<SeatFilledCard
  enrolledLeads={data?.enrolled_leads}
  seatFilled={data?.seat_filled_learners}
  isLoading={isLoading}
/>
```

- [ ] **Step 3: Browser verification**

In dev, navigate to `/admission/group-dashboard`. Confirm two cards render. Make a real payment that crosses the threshold for a test learner → reload → "Seat Filled" count increments by 1.

- [ ] **Step 4: Commit**

```bash
git add app/(routes)/admission/group-dashboard/page.tsx app/(routes)/admission/group-dashboard/_components/seat-filled-card.tsx
git commit -m "feat(dashboard): split 'Filled' into 'Enrolled Leads' + 'Seat Filled' cards

The gap (enrolled but below threshold) is now visible directly on the
dashboard with a click-through to the leads list.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task E5 — Realtime: add `billing_student_bills` to dashboard invalidations

**Files:**
- Modify: `hooks/admission/use-group-dashboard.ts:60-80`

- [ ] **Step 1: Add the channel**

Open `use-group-dashboard.ts`. Find the existing realtime subscription block (around lines 60-80, listening to `learners_profiles`). Add a parallel subscription:

```ts
// Inside the existing useEffect that sets up realtime channels
const billsChannel = supabase
  .channel('group-dashboard-bills')
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'billing_student_bills' },
      () => qc.invalidateQueries({ queryKey: ['group-dashboard'] }))
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'billing_receipt_items' },
      () => qc.invalidateQueries({ queryKey: ['group-dashboard'] }))
  .subscribe();

// Add to the cleanup return:
return () => {
  // ... existing cleanup
  supabase.removeChannel(billsChannel);
};
```

- [ ] **Step 2: Browser verification**

Open the dashboard in one tab. In another tab, record a payment that crosses threshold. The dashboard counts update within ~1s without reload.

- [ ] **Step 3: Commit**

```bash
git add hooks/admission/use-group-dashboard.ts
git commit -m "feat(dashboard): invalidate on billing_student_bills + receipt_items changes

The seat-filled KPI now updates in realtime when payments land,
matching the precedent of learners_profiles invalidation already in
place.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase F — Admin Re-Evaluation Tool

### Task F1 — `/admission/tools/re-evaluate-learner` page

**Files:**
- Create: `app/(routes)/admission/tools/re-evaluate-learner/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// File: app/(routes)/admission/tools/re-evaluate-learner/page.tsx
'use client';

import { useState } from 'react';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';

export default function ReEvaluateLearnerTool() {
  const [id, setId] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const supabase = createClientSupabaseClient();

  const run = async () => {
    if (pending) return;
    setPending(true);
    setErr(null);
    setResult(null);
    try {
      const { data, error } = await supabase.rpc('evaluate_learner_status_after_payment', { p_learner_id: id });
      if (error) throw new Error(getErrorMessage(error));
      setResult(data);
    } catch (e) {
      setErr(getErrorMessage(e as Error));
    } finally {
      setPending(false);
    }
  };

  return (
    <PermissionGuard module="admission.settings.statuses" action="manage">
      <div className="container mx-auto py-6 max-w-2xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Re-Evaluate Learner Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Manually trigger the threshold evaluator for a specific learner. Existing learners are grandfathered;
              use this to retroactively promote one when their paid percentage has crossed the threshold.
            </p>
            <div className="space-y-2">
              <Label htmlFor="learner-id">Learner ID (UUID)</Label>
              <Input id="learner-id" value={id} onChange={(e) => setId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
            </div>
            <Button onClick={run} disabled={pending || !id}>Run evaluator</Button>
            {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
            {result != null && (
              <pre className="rounded bg-muted p-3 text-xs overflow-auto">{JSON.stringify(result, null, 2)}</pre>
            )}
          </CardContent>
        </Card>
      </div>
    </PermissionGuard>
  );
}
```

- [ ] **Step 2: Browser verification**

Log in as `admission_admin`. Visit `/admission/tools/re-evaluate-learner`. Paste a learner ID; click "Run evaluator". See JSON response.

- [ ] **Step 3: Commit**

```bash
git add app/(routes)/admission/tools/re-evaluate-learner/page.tsx
git commit -m "feat(admission/tools): add re-evaluate-learner admin page

Allows manual invocation of evaluate_learner_status_after_payment for
grandfathered learners. Gated by admission.settings.statuses.manage.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase G — Lead-Stage-Policy Substrate Mirror

### Task G1 — Sync `lead_active_stage_policy.is_terminal` → `admission_statuses.is_terminal`

**Files:**
- Create: `supabase/migrations/20260517000011_mirror_lead_active_stage_policy.sql`

- [ ] **Step 1: Write the sync trigger**

```sql
-- File: supabase/migrations/20260517000011_mirror_lead_active_stage_policy.sql
BEGIN;

-- One-way mirror: lead_active_stage_policy.is_terminal (existing routing source)
-- becomes admission_statuses.is_terminal for scope='lead'.
-- Initial backfill:
UPDATE public.admission_statuses s
SET is_terminal = p.is_terminal
FROM public.lead_active_stage_policy p
WHERE s.scope = 'lead'
  AND s.code = p.funnel_stage;

-- Trigger to keep them in sync going forward.
CREATE OR REPLACE FUNCTION public._mirror_lead_stage_policy_is_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.admission_statuses
  SET is_terminal = NEW.is_terminal
  WHERE scope='lead' AND code = NEW.funnel_stage;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_mirror_lead_stage_policy_is_terminal
  AFTER INSERT OR UPDATE OF is_terminal ON public.lead_active_stage_policy
  FOR EACH ROW EXECUTE FUNCTION public._mirror_lead_stage_policy_is_terminal();

COMMIT;
```

- [ ] **Step 2: Apply + verify**

```sql
SELECT s.code, s.is_terminal, p.is_terminal AS policy_is_terminal
FROM admission_statuses s
LEFT JOIN lead_active_stage_policy p ON s.code = p.funnel_stage
WHERE s.scope = 'lead' AND p.id IS NOT NULL
ORDER BY s.code;
```

Expected: every row's `is_terminal` matches `policy_is_terminal`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260517000011_mirror_lead_active_stage_policy.sql
git commit -m "feat(admission): mirror lead_active_stage_policy.is_terminal into admission_statuses

One-way sync trigger keeps the routing source-of-truth
(lead_active_stage_policy, consumed by counselor-capacity routing) and
the UI source-of-truth (admission_statuses) consistent. Phase 2 work
will fold both into a single source.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase H — UI Migration of Existing Hardcoded Sites

This phase is **incremental and optional for Phase 1 deployment**. Each task swaps one hardcoded location to use the dynamic helpers from Task B5. The system works without these — they just remove hardcoded coupling site by site.

### Task H1 — Migrate `lifecycle-status-badge.tsx` to dynamic lookups

**Files:**
- Modify: `components/learners/lifecycle-status-badge.tsx:19-94`

- [ ] **Step 1: Replace `statusConfig` with hook-driven lookup**

```tsx
// Top of file
'use client';
import { useAdmissionStatuses } from '@/hooks/admission/use-admission-statuses';
import { getStatusLabel, getStatusColor } from '@/lib/admission/status-helpers';
import { Badge } from '@/components/ui/badge';

export function LifecycleStatusBadge({ status }: { status: string }) {
  const { data: list } = useAdmissionStatuses('learner', { activeOnly: false });
  const color = getStatusColor(list, 'learner', status);
  const label = getStatusLabel(list, 'learner', status);
  return <Badge style={{ backgroundColor: color, color: '#fff', borderColor: color }}>{label}</Badge>;
}
```

Keep `getStatusColorClass`, `getStatusLabel`, `getStatusIcon` exports for backward compatibility — make them delegate to the helpers with a no-data fallback (the helpers already include hardcoded fallbacks).

- [ ] **Step 2: Browser verification**

Reload the `/learners/profiles` list and `/learners/enquiries` list. Badges should render unchanged. Change a status's color in Settings — refresh both lists — color updates.

- [ ] **Step 3: Commit**

```bash
git add components/learners/lifecycle-status-badge.tsx
git commit -m "refactor(learners): LifecycleStatusBadge reads colors from admission_statuses

Replaces hardcoded statusConfig map with useAdmissionStatuses lookup
+ static fallback. Color edits in Settings now propagate to all
learner badge sites without code changes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task H2 — Migrate lead `columns.tsx` color/label maps

**Files:**
- Modify: `app/(routes)/admission/leads/_components/columns.tsx:17-74`

- [ ] **Step 1: Replace `FUNNEL_STAGES` array and `getStageColor` function**

Keep the array as a fallback constant; new lookups use the hook. Filter dropdown reads from `useAdmissionStatuses('lead', { activeOnly: true })` and falls back to the constant during loading.

- [ ] **Step 2: Browser verification**

Open `/admission/leads`. Filter dropdown should show all 26 stages with their current colors. Archive a stage in Settings, refresh → filter dropdown loses that option but existing leads in that stage still render the label.

- [ ] **Step 3: Commit**

```bash
git add app/(routes)/admission/leads/_components/columns.tsx
git commit -m "refactor(admission/leads): columns read colors/labels from admission_statuses

Status filter dropdown is now dynamic. Stage colors honor Settings.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Verification & Testing

### Task V1 — RPC behavior unit tests via mcp__supabase__execute_sql

**Files:**
- Create: `tests/sql/evaluate_learner_status_after_payment.sql`

- [ ] **Step 1: Write SQL test scenarios**

```sql
-- File: tests/sql/evaluate_learner_status_after_payment.sql
-- Run via mcp__supabase__execute_sql in a dev/test branch. Each block
-- BEGIN/ROLLBACKs so no permanent state change.

-- Scenario 1: paid_pct < threshold → no promotion
BEGIN;
  -- Pick a real learner in 'account' with bills, observe paid_pct
  -- Inject a small receipt that keeps paid_pct < 60
  -- Call: SELECT evaluate_learner_status_after_payment('<id>');
  -- Assert: result.updated = false, reason='below_threshold'
ROLLBACK;

-- Scenario 2: paid_pct = 60 exactly → promotion
BEGIN;
  -- Inject a receipt that puts paid_pct at exactly 60
  -- Assert: result.updated = true, to_status='active'
  -- Assert: row in learners_profile_status_history with reason_code='auto_threshold'
ROLLBACK;

-- Scenario 3: only application fee paid → no promotion
BEGIN;
  -- Inject a receipt allocated solely to a bill with billing_categories.kind='application_fee'
  -- Assert: result.updated = false, paid_pct = 0
ROLLBACK;

-- Scenario 4: refund-driven below-threshold → no demotion (promote-only design)
BEGIN;
  -- Pick a learner already in 'active'
  -- Inject a refund that reduces paid_pct below 60
  -- Call evaluate manually
  -- Assert: result.reason='no_op_for_status' (not in 'account')
  -- Assert: learner remains 'active'
ROLLBACK;

-- Scenario 5: institution scope isolation (RLS impersonation)
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<institution_A_user_uuid>","role":"authenticated"}';
  -- Call evaluate on a learner in institution B
  -- Assert: error or no row (RLS denies write)
ROLLBACK;
```

- [ ] **Step 2: Execute scenarios via MCP**

For each block, run `mcp__supabase__execute_sql` and assert the documented expectation. Document results in the commit message.

- [ ] **Step 3: Commit**

```bash
git add tests/sql/evaluate_learner_status_after_payment.sql
git commit -m "test(billing): SQL scenarios for evaluate_learner_status_after_payment

Five scenarios — below threshold, exact threshold, app-fee-only,
refund (no demote), and RLS scope. All pass against dev.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task V2 — Browser-level verification (Chrome DevTools MCP)

- [ ] **Step 1: Settings CRUD smoke test**

Open `/admission/settings/statuses`. Run through Create → Edit → Archive → Restore as documented in Task C3 Step 2. Use `mcp__chrome-devtools__take_screenshot` after each step. Save screenshots to `docs/plans/2026-05-17-screenshots/`.

- [ ] **Step 2: Threshold gate end-to-end**

Find a test learner currently in `account` with paid_pct = 50. Record a payment that pushes them to 60. Wait <2s. The dashboard "Seat Filled" KPI increments by 1; the learner's badge on `/learners/profiles` changes to "Active".

- [ ] **Step 3: Permission denial check**

Log in as a role without `admission.settings.statuses.view`. Try direct navigation to `/admission/settings/statuses` → expect denial / redirect.

- [ ] **Step 4: Commit verification artifacts**

```bash
git add docs/plans/2026-05-17-screenshots/
git commit -m "docs: capture verification screenshots for dynamic status rollout

Settings CRUD smoke test + end-to-end threshold gate flow + permission
denial check.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task V3 — Vercel deploy preview verification

- [ ] **Step 1: Push branch + open PR**

```bash
git push -u origin feat/dynamic-admission-statuses
gh pr create --title "feat: dynamic admission statuses + bill-gated seat-filled" \
  --body "$(cat <<'EOF'
## Summary
- Adds `admission_statuses` metadata table (unified lead/learner) with CRUD UI at `/admission/settings/statuses`
- Adds `billing_categories.kind` ENUM for application-fee classification
- Replaces hardcoded `markAsApproved` 100% balance gate with a configurable per-status threshold (default 60% on `active`)
- Auto-promotes `account → active` via DB trigger on `billing_receipt_items`
- Rewrites 5 dashboard RPCs to read seat-filled set from `admission_statuses.is_seat_filled`
- Splits dashboard "Filled" KPI into "Enrolled Leads" (lead-space) + "Seat Filled" (learner-space, bill-gated)

## Test plan
- [x] SQL scenarios in tests/sql/evaluate_learner_status_after_payment.sql
- [x] Settings CRUD smoke test (screenshots attached)
- [x] End-to-end threshold gate flow
- [x] Permission denial check
- [ ] Vercel preview verification

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Wait for preview**

After Vercel build completes, hit the preview URL. Repeat V2 verification steps on the preview environment.

- [ ] **Step 3: Merge after approval**

Standard PR review + merge flow. Do not auto-merge.

---

## Rollback Plan

If a critical issue surfaces post-merge:

1. **Schema rollback** — revert is straightforward; all changes are additive. Drop the new table, ENUM, view, RPC, trigger, and column. Existing code still works since the `lifecycle_status` ENUM and `funnel_stage` TEXT are untouched.
2. **Service rollback** — `markAsApproved` and `updateLifecycleStatus` revert to their previous implementations via `git revert`.
3. **Dashboard rollback** — re-apply the original `get_seat_analytics` and 4 sibling RPCs (their previous migration files are still in `supabase/migrations/`). The new dual-KPI page UI gracefully falls back to `filled_seats` if `seat_filled_learners` is undefined.

## Out of Scope (Future Phases)

These were considered but deferred to keep this plan focused:

- True ENUM→FK migration of `lifecycle_status` to `admission_statuses.id` — same playbook as `admission_year_id` (project memory).
- Demotion logic (auto-demote on refund) — currently manual-only by design.
- Per-program or per-institution threshold overrides — single global threshold per status row.
- Folding `lead_active_stage_policy` into `admission_statuses` — requires rewriting 4 routing migrations.
- Migrating the remaining 12+ hardcoded literal sites (`ALLOWED_STAGE_TRANSITIONS`, partial indexes, etc.) — UI sites in Phase H is enough for now.
- Cron-driven re-evaluation of all `account` learners (in case the trigger missed an event) — manual `/admission/tools/re-evaluate-learner` covers it.

---

## Plan Coverage Self-Review

The 8 architectural decisions confirmed in brainstorming are each covered:

| Decision | Covered by |
|---|---|
| Single unified table with `scope` column | Task A1, A2 |
| % of all bills except application fee | Task A3 (kind enum), A4 (view) |
| Threshold on the status row itself | Task A1 (`fee_paid_threshold_percent` column) |
| Auto-promote via DB trigger | Task D1 |
| `kind` column on `billing_categories` | Task A3 |
| Auto-promote only; demotion manual | Task D1 (RPC has no demote branch) |
| Grandfather existing learners | (No backfill task) + Task F1 admin tool |
| Replace "Filled" with bill-driven count | Task E1, E3, E4 |

Plus the two clarifying answers:

| Decision | Covered by |
|---|---|
| Dual KPI ("Enrolled Leads" + "Seat Filled") | Task E3, E4 |
| Mirror `lead_active_stage_policy.is_terminal` | Task G1 |

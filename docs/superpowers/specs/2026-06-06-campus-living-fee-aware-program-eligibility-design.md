# Fee-aware Program Eligibility (Campus Living) — Design Spec

**Date:** 2026-06-06
**Author:** Boobalan (with Claude)
**Module:** Campus Living → Settings → Program Eligibility
**Status:** Design — awaiting plan

---

## 1. Problem

Today, Program Eligibility gates which **room** and **mess** categories a program may use, on a
2-key matrix `(institution, program) → {room categories}` and `→ {mess categories}` with an
institution-default + per-program-override fallback.

The institution needs eligibility to depend on **two more dimensions** (per the source matrix):

```
Programme | Quota        | Fee bracket   | Classic Rm | Deluxe Rm | Premium Rm | Classic Mess | Premium Mess
BDS       | Govt         | < 4 L         |     S      |           |            |      S       |
BDS       | Govt         | = 4 L         |     S      |           |            |              |      S
BDS       | Govt         | = 4.25 L      |     S      |           |            |              |      S
BDS       | Management   | = 5 L         |           |     S     |            |              |      S
BDS       | Management   | Above 5/Below 6|          |     S     |            |              |      S
Pharm-D   | Govt         | = 2 L         |     S      |           |            |      S       |
...
```

i.e. **`(program → quota → tuition-fee bracket) → {allowed room categories} + {allowed mess categories}`**.
Higher fee ⇒ access to premium tiers. The fee is a proxy that varies within a quota by community.

---

## 2. Locked decisions (from stakeholder)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Fee value that gates | **`learners_profiles.tuition_fee`** (auto-read; annual tuition, stored in **rupees**) |
| 2 | PMSS / 7.5% modelling | **Add a `PMSS` quota row.** `7.5%` already exists (`government_7_5`). Rules key on `quota_id`. |
| 3 | Schema approach | **Extend the existing two eligibility tables** (they are empty — no migration risk) |
| 4 | Fee bracket input | **Single threshold + operator** (`<`, `≤`, `=`, `≥`, `>`) |
| 5 | No-match behaviour | **Fail-open** — no matching bracket ⇒ show all categories + a subtle hint (today's behaviour) |
| 6 | Enforcement points | **Bed allocation + Student self-service** |
| 7 | Build sequencing | **Everything together** (schema + resolver + Settings UI + both enforcement points) |

---

## 3. Current-state facts (verified 2026-06-06)

- **Tables:** `hostel_program_room_eligibility`, `hostel_program_mess_eligibility`. Columns:
  `id, institution_id, program_id (NULL=default), <room|mess>_category_id, is_active, effective_from,
  created_at, updated_at, created_by, updated_by`; mess also has `is_monthly_mess_allowed`.
  **Both are EMPTY (0 rows).** `admission_packages` also empty.
- **Resolver:** `ProgramEligibilityService.getEffective{Room,Mess}Categories(inst, program)` — client-side
  `OR(program_id.eq, program_id.is.null)` then JS "override beats default". Wrapped by
  `useEffective{Room,Mess}Categories` (`hooks/campus-living/use-allocation-eligibility.ts`).
- **Quotas:** `quotas(id, code, name, is_active)` = `government`, `government_7_5`, `management`, `sports`.
  **No `pmss`.** `learners_profiles.quota_id` is the live FK (legacy `quota` TEXT being retired).
- **Fee storage:** `learners_profiles.tuition_fee numeric` (rupees, e.g. 65000) + `fee_items jsonb`.
  Screenshot uses **lakhs** (4 L = ₹400,000). Editor will accept lakhs, store rupees (`×100000`).
- **Allocation enforcement:** `/campus-living/allocations/new` already resolves `learnerProgramId` and
  fail-open filters room + mess dropdowns via the two `useEffective*` hooks.
- **Self-service enforcement target:** `fn_my_manual_categories()` (SECURITY DEFINER SQL RPC) returns
  room categories filtered **by gender only — no program/quota/fee gate today.** `fn_my_room_options()`
  applies *physical-room* rules (`fn_learner_eligible_for_room`), not category eligibility.
- **RLS:** both eligibility tables have `SELECT USING (true)` for `authenticated`, and **legacy hardcoded
  `profiles.role IN ('super_admin','admin')`** write policies (campus-living perm-key retrofit pending).
- **Permission keys exist:** `campus_living.settings.view`, `campus_living.settings.edit`.

---

## 4. Architecture

### 4.1 Principle — one SQL resolver, two callers
The matching logic lives in **one `STABLE` SQL function per category kind**. Both the TS allocation path
(via `.rpc()`) and the self-service SQL RPC call it. This prevents the recurring "list/detail diverge"
bug class — there is exactly one definition of "which categories can this `(program, quota, fee)` student get."

### 4.2 Schema (additive, reversible)
Add to **both** `hostel_program_room_eligibility` and `hostel_program_mess_eligibility`:

| column | type | meaning |
|--------|------|---------|
| `quota_id` | `uuid NULL REFERENCES quotas(id) ON DELETE CASCADE` | `NULL` = applies to **any** quota |
| `fee_operator` | `text NULL CHECK (fee_operator IN ('lt','lte','eq','gte','gt'))` | comparison vs the student's fee; `NULL` = applies to **any** fee |
| `fee_threshold` | `numeric(12,2) NULL` | bracket value in **rupees** |

Constraints:
- `CHECK ((fee_operator IS NULL) = (fee_threshold IS NULL))` — both set or both null.
- Replace the uniqueness with a **bracket-level** unique index keyed on the full tuple, NULL-safe via
  `COALESCE` sentinels:
  `UNIQUE (institution_id, COALESCE(program_id,'00..0'), COALESCE(quota_id,'00..0'),
   COALESCE(fee_operator,''), COALESCE(fee_threshold,-1), <category_id>)`.
- Keep `effective_from`, `is_active`, audit columns unchanged.

A row with `quota_id=NULL, fee_operator=NULL, fee_threshold=NULL` behaves **identically** to today's
program-only rule — the current semantics are a strict subset.

**Seed data:** `INSERT INTO quotas (code, name, is_active) VALUES ('pmss','PMSS Quota', true)
ON CONFLICT (code) DO NOTHING;`

### 4.3 The resolver — `fn_hostel_effective_room_categories` / `fn_hostel_effective_mess_categories`
```
fn_hostel_effective_room_categories(p_institution uuid, p_program uuid, p_quota uuid, p_fee numeric)
  RETURNS SETOF uuid   -- LANGUAGE sql STABLE, SET search_path=public
```
**Bracket** = `(program_id, quota_id, fee_operator, fee_threshold)`. Algorithm:
1. **Candidate rows** = active rows where
   `(program_id = p_program OR program_id IS NULL)` AND
   `(quota_id = p_quota OR quota_id IS NULL)` AND
   the **fee condition holds**: `fee_operator IS NULL` OR
   `lt:` `p_fee < t` · `lte:` `p_fee <= t` · `eq:` `p_fee = t` · `gte:` `p_fee >= t` · `gt:` `p_fee > t`.
2. **Specificity** per bracket = `(program_id NOT NULL)*4 + (quota_id NOT NULL)*2 + (fee_operator NOT NULL)*1`.
3. **Winner** = the single bracket with **max specificity**; tie-break by **tightest threshold**
   (for `gte/gt` highest `fee_threshold`; for `lt/lte` lowest `fee_threshold`), then earliest `created_at`.
4. Return **all `category_id`s belonging to the winning bracket** (a bracket can grant several categories).
5. **No candidates ⇒ return empty set** ⇒ caller fails open (shows everything).

Room and mess are resolved **independently** (separate tables), mirroring the two-tab model.

> **Known limitation (single-threshold model):** a closed band like *"Above 5, Below 6"* is not one
> threshold. Model it by **partitioning** the fee axis with tiers — `≥5` grants Deluxe and a tighter
> `≥6` rule (higher specificity tie-break) takes over above 6. The UI should **warn on overlapping
> brackets** within one `(program, quota)`. If closed bands become common, add a `between` operator
> (with a second `fee_threshold_max`) in a follow-up — the schema already isolates this to two columns.

### 4.4 TS service + hooks
- Rewrite `getEffective{Room,Mess}Categories` to call the RPC with `(institutionId, programId, quotaId, feeAmount)`.
- `useEffective{Room,Mess}Categories(institutionId, programId, quotaId, feeAmount)` — add the two args to
  the query key + `enabled`.
- Extend `useLearnerProgramId` → also select `quota_id` and `tuition_fee` (rename to
  `useLearnerEligibilityInputs` returning `{ programId, quotaId, tuitionFee }`), or add a sibling hook.
  Keep a thin back-compat export if anything else imports `useLearnerProgramId`.

### 4.5 Settings UI (`/campus-living/settings/program-eligibility`)
- **`form-dialog.tsx`:** add a **Quota** `SearchableSelect` (`All quotas — any` default + quota rows) and a
  **Fee condition** control: operator select (`Any fee`, `<`, `≤`, `=`, `≥`, `>`) + a number input in **lakhs**
  (disabled when `Any fee`). On submit: `Any fee` ⇒ `fee_operator=null, fee_threshold=null`; else
  `fee_threshold = lakhs * 100000`. Edit mode keeps scope/category/quota/fee immutable (matches current
  "scope & category fixed once created"); only `is_active` / `is_monthly_mess_allowed` / `effective_from` edit.
- **`columns.tsx`:** add **Quota** column (`All quotas` badge when null) and **Fee** column
  (e.g. `Any`, `< 4L`, `≥ 5L`, `= 4.25L`) for both room and mess tables.
- **DTO/type updates** in `types/program-eligibility.ts` + `program-eligibility-service.ts` create/list
  (carry `quota_id`, `fee_operator`, `fee_threshold`; resolve `quota_name` in the joined row shape).
- New option loader `getActiveQuotas()` + `useActiveQuotas()` (read `quotas` where `is_active`).

### 4.6 Enforcement
- **Allocation (`allocations/new/page.tsx`):** read the learner's `quotaId` + `tuitionFee` via the extended
  hook; pass all four args into `useEffective{Room,Mess}Categories`. Existing fail-open filter + hints unchanged.
- **Self-service (`fn_my_manual_categories`)**: inside the RPC, resolve the caller's
  `learners_profiles.{program_id, quota_id, tuition_fee, institution_id}` (via `get_my_learner_id()`),
  compute the eligible room-category set with `fn_hostel_effective_room_categories(...)`, and filter:
  `AND (v_eligible_count = 0 OR c.id = ANY(v_eligible_ids))` — preserving gender filter **and** fail-open.
  (Student self-service has no mess picker today; mess gating applies via the allocation page.)

### 4.7 RLS / permissions
- Adding nullable columns needs **no policy change**; `SELECT USING(true)` keeps the resolver working for
  all callers (allocation, self-service SECURITY DEFINER).
- **Out of scope (flagged):** the two tables still use the legacy hardcoded role write-gate. Leave as-is;
  note for the campus-living `user_has_permission('campus_living.settings.edit')` retrofit.

---

## 5. Files touched

**DB (migration `supabase/migrations/<ts>_fee_aware_program_eligibility.sql` + mirror to `supabase/setup/`):**
- ALTER both eligibility tables (3 cols + checks + unique index swap).
- Seed `pmss` quota.
- `fn_hostel_effective_room_categories`, `fn_hostel_effective_mess_categories`.
- `CREATE OR REPLACE fn_my_manual_categories` (inject eligibility filter).

**TS:**
- `types/program-eligibility.ts` — DTOs + row shapes (+ quota/fee fields, `quota_name`).
- `lib/services/campus-living/program-eligibility-service.ts` — create/list/resolver via RPC + `getActiveQuotas`.
- `hooks/campus-living/use-program-eligibility.ts` — `useActiveQuotas`; thread quota/fee through DTOs.
- `hooks/campus-living/use-allocation-eligibility.ts` — extend learner-inputs hook + 4-arg resolvers.
- `app/(routes)/campus-living/settings/program-eligibility/_components/form-dialog.tsx` — quota + fee controls.
- `app/(routes)/campus-living/settings/program-eligibility/_components/columns.tsx` — quota + fee columns.
- `app/(routes)/campus-living/allocations/new/page.tsx` — pass quota + fee into the hooks.

**Type registration:** add the new RPCs to call sites loosely-typed (existing pattern); no `types/supabase.ts`
table change needed (only columns + functions).

---

## 6. Verification (no test runner in repo)
- `mcp__ide__getDiagnostics` on every touched TS file.
- Apply migration on the project; `fn_hostel_effective_*` unit checks via `execute_sql` with crafted rows:
  - program+quota+fee bracket beats program-default;
  - tightest threshold wins on partitioned `gte` tiers;
  - empty config ⇒ empty set ⇒ fail-open.
- Browser, as a **non-super-admin**: configure BDS-Govt `< 4L → Classic Room + Classic Mess`; allocate a
  BDS govt learner with `tuition_fee = 380000` → only Classic Room/Mess offered; a `420000` learner with
  a `≥4L` Premium-Mess rule → Premium Mess offered; unconfigured program → all shown + hint.
- Self-service `request-room` as a student: category list narrows to the eligible set; fail-open when unconfigured.
- `npm run check:menus` not required (no new routes/keys). Run `npm run lint` on touched files.

---

## 7. Out of scope / follow-ups
- Permission-key retrofit of the two tables' write RLS.
- `between` operator / closed-band brackets (only if partitioning proves insufficient).
- Mess self-service picker (none exists today).
- Admission-package assignment enforcement (not selected).
- `effective_from` forward-only restriction runtime (still reserved, unchanged).

# Fee-aware Program Eligibility (Campus Living) — Design Spec

**Date:** 2026-06-06 (revised — supersedes the morning single-threshold / tuition_fee draft)
**Author:** Boobalan (with Claude)
**Module:** Campus Living → Settings → Program Eligibility
**Status:** Design — awaiting plan

> **Revision note.** An earlier draft today locked `learners_profiles.tuition_fee` + a single
> threshold/operator model + "extend tables." Verification against the live DB changed two of those:
> `tuition_fee` is effectively unpopulated (29/5723), and a single threshold cannot express the
> closed band *"Above 5, Below 6"*. This revision keeps **extend tables** + **fail-open** but moves to
> **min–max fee ranges** and a **strict bill-based fee source** (see §2). Decisions re-confirmed with
> stakeholder.
>
> **Revision 2 (2026-06-06, post-build).** Stakeholder asked to **merge the Room + Mess tabs into a single
> "Category Eligibility" table** — one row = `(institution, program, quota, fee band)` → **both** a room and a
> mess category. Replaces the two `hostel_program_*_eligibility` tables with one `hostel_program_eligibility`
> (`room_category_id` + `mess_category_id` + `is_monthly_mess_allowed`, one row per band). The two `effective`
> resolvers now read this single table (room reads `room_category_id IS NOT NULL`, mess reads
> `mess_category_id IS NOT NULL`); the fee fn, composites, allocation-page + self-service enforcement are
> UNCHANGED. UI collapses to one tab/dialog/table. Trade-off accepted: when room and mess flip at different fee
> points, enter one combined row per breakpoint (repeating the unchanged category) — matches the screenshot 1:1.

---

## 1. Problem

Today, Program Eligibility gates which **room** and **mess** categories a program may use, on a
2-key matrix `(institution, program) → {room categories}` / `→ {mess categories}` with an
institution-default + per-program-override fallback. It is a fail-open UI filter on the allocation page.

The institution needs eligibility to depend on **two more dimensions** (per the source matrix screenshot):

```
Programme | Quota        | Fee band (₹ L)  | Classic Rm | Deluxe Rm | Premium Rm | Classic Mess | Premium Mess
BDS       | Govt         | < 4             |     S      |           |            |      S       |
BDS       | Govt         | 4               |     S      |           |            |              |      S
BDS       | Govt         | 4.25            |     S      |           |            |              |      S
BDS       | 7.5%         | 4.95            |     S      |           |            |      S       |
BDS       | Management   | 5               |           |     S     |            |              |      S
BDS       | Management   | < 4             |     S      |           |            |      S       |
BDS       | Management   | 4.25            |     S      |           |            |              |      S
BDS       | Management   | Above 5, Below 6|           |     S     |            |              |      S
BDS       | PMSS         | 6               |     S      |           |            |              |      S
Pharm-D   | Govt         | 2               |     S      |           |            |      S       |
Pharm-D   | Govt         | 2.75            |     S      |           |            |              |      S
Pharm-D   | Govt         | 2.8             |     S      |           |            |              |      S
```

i.e. **`(program → quota → academic-fee band) → {allowed room categories} + {allowed mess categories}`**.

**Key observation that drives the schema choice:** room and mess change at *different* fee breakpoints.
For BDS-Govt the **room** is Classic across the whole `<4 / 4 / 4.25` range while the **mess** flips
Classic→Premium at ₹4 L. Room-access and mess-access are therefore **independent functions of fee**,
which is exactly what the two separate eligibility tables already model. The screenshot's "one row =
room + mess" is presentation, not data shape.

A matched band is an **allow-set / ceiling** ("these are the categories you may take at this fee").
A later phase ("My Hostel" upgrade) lets a student move above the ceiling — **out of scope here**.

---

## 2. Locked decisions (stakeholder, revised 2026-06-06)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Fee value that gates | **Strict current-academic-year academic bill.** `SUM(billing_student_bills.final_amount)` for the learner where `fee_source='academic'`, `status NOT IN ('cancelled','superseded')`, and **`academic_year_id = learners_profiles.academic_year_id`**. Stored/compared in **rupees**. |
| 2 | No bill-year match | **Strict (Option 2).** Only properly year-tagged bills count. A learner with **no matching bill** ⇒ fee is **NULL (undefined)** ⇒ resolver returns empty ⇒ **fail-open** — never silently gated to a band (see §4.5, §6). A genuine computed ₹0 is distinct from NULL and flows to the lowest band. |
| 3 | Fee band model | **Min–max range** per rule (`fee_min` inclusive, `fee_max` exclusive; either NULL = unbounded). Cleanly expresses `<4`, `4–4.25`, `Above 5/Below 6`. |
| 4 | PMSS / 7.5% modelling | `government_7_5` already exists. **Seed a `pmss` quota row.** Rules key on `quota_id`. |
| 5 | Schema approach | **Extend the two existing eligibility tables** (empty — no migration risk; current behaviour = a strict subset). |
| 6 | Grant semantics | **Allow-set / ceiling**, **fail-open** when no rule matches (today's behaviour + a subtle hint). |
| 7 | Enforcement points | **Bed allocation** (`allocations/new`) **+ student self-service** (`fn_my_manual_categories`). Re-evaluated on every allocation. |
| 8 | Build sequencing | **Config + resolver + both enforcement points together.** My-Hostel upgrade UI = later phase. |

---

## 3. Current-state facts (verified against DB + code, 2026-06-06)

- **Eligibility tables:** `hostel_program_room_eligibility`, `hostel_program_mess_eligibility`. Columns:
  `id, institution_id, program_id (NULL=institution default), <room|mess>_category_id, is_active,
  effective_from, created_at, updated_at, created_by, updated_by`; mess also `is_monthly_mess_allowed`.
  **Both EMPTY (0 rows).** Partial-unique on the default row (`program_id IS NULL`). RLS: `SELECT USING(true)`
  for authenticated; **writes gated on hardcoded `profiles.role IN ('super_admin','admin')`** (legacy pattern,
  perm-key retrofit still pending — left as-is, §5).
- **Existing resolver:** `ProgramEligibilityService.getEffective{Room,Mess}Categories(inst, program)` — client-side
  `OR(program_id.eq, program_id.is.null)` then JS "override beats default". Wrapped by
  `useEffective{Room,Mess}Categories` + `useLearnerProgramId` (`hooks/campus-living/use-allocation-eligibility.ts`).
  Consumed as a **fail-open filter** by `app/(routes)/campus-living/allocations/new/page.tsx`.
- **Self-service:** `fn_my_manual_categories()` (SECURITY DEFINER) returns manual room categories filtered
  **by gender only — no program/quota/fee gate today.** `fn_my_room_options()` applies *physical-room* rules
  (`fn_learner_eligible_for_room`), a separate axis. `fn_self_request_room` hard-guards the chosen room.
- **Categories:** `hostel_categories` (global lookup, **gender-specific rows** — Classic/Deluxe/Premium/Premium-Plus
  × boys/girls, `sort_order` 1–4) and `mess_categories` (Classic/Premium × boys/girls). No price on the table
  (pricing lives in `hostel_fees`). The eligibility rows reference a **specific gender-typed** `*_category_id`.
- **Quotas:** `quotas(id, code, name, is_active)` = `government`, `government_7_5`, `management`, `sports`.
  **No `pmss`.** `learners_profiles.quota_id` is the live FK; **populated on 4,101/5,723 (72%)** — the
  un-quota'd 28% fail-open.
- **Bills:** `billing_student_bills` — **5,774 rows, all `fee_source='academic'`.** It **has** an
  `academic_year_id uuid` column (FK → `academic_years`, `ON DELETE SET NULL`), but **only 1 of 5,774 rows
  is tagged** (5,773 NULL). `final_amount` = total billed; `balance_amount` = outstanding. 0 hostel bills exist.
- **Learner fields:** `academic_year_id` 5,367/5,723 (94%); `program_id` 99.7%; `gender` 100%;
  `tuition_fee` **29/5,723 (unusable)**; `hostel_category_id` set on 891.
- **Permission keys present:** `campus_living.settings.view`, `campus_living.settings.edit`.

---

## 4. Architecture

### 4.1 Principle — one fee definition, one resolver, two callers
All matching logic lives in **SQL functions** (`STABLE`, `SET search_path=public`). The TS allocation path
(`.rpc()`) and the self-service SECURITY DEFINER RPC call the **same** functions. This kills the recurring
"list/detail diverge" bug class — there is exactly one definition of "the gating fee" and one of "which
categories can this `(program, quota, fee)` student get."

### 4.2 Schema (additive, reversible) — both eligibility tables
Add to **both** `hostel_program_room_eligibility` and `hostel_program_mess_eligibility`:

| column | type | meaning |
|--------|------|---------|
| `quota_id` | `uuid NULL REFERENCES quotas(id) ON DELETE CASCADE` | `NULL` = applies to **any** quota |
| `fee_min` | `numeric(12,2) NULL` | **inclusive** lower bound, **rupees**; `NULL` = no lower bound |
| `fee_max` | `numeric(12,2) NULL` | **exclusive** upper bound, **rupees**; `NULL` = no upper bound |

Match predicate (per row): `(fee_min IS NULL OR p_fee >= fee_min) AND (fee_max IS NULL OR p_fee < fee_max)`.
Examples (rupees): `<4 L` → `(NULL, 400000)`; `4 L` band → `(400000, 425000)`; `Above 5/Below 6` → `(500000, 600000)`.
Half-open intervals ⇒ adjacent bands never overlap.

Constraints:
- `CHECK (fee_min IS NULL OR fee_max IS NULL OR fee_min < fee_max)`.
- Replace the existing uniqueness with a **band-level** unique index, NULL-safe via `COALESCE` sentinels:
  `UNIQUE (institution_id, COALESCE(program_id,'00..0'), COALESCE(quota_id,'00..0'),
   COALESCE(fee_min,-1), COALESCE(fee_max,-1), <room|mess>_category_id)`.
- **Optional hard guard against overlapping bands** (recommended): a `numrange` generated column +
  `EXCLUDE USING gist (institution_id WITH =, program_id WITH =, quota_id WITH =, fee_range WITH &&)
   WHERE (is_active)` (needs `btree_gist`). If we skip it, the Settings UI must warn on overlap.
- Keep `effective_from`, `is_active`, `is_monthly_mess_allowed`, audit columns unchanged.

A row with `quota_id=NULL, fee_min=NULL, fee_max=NULL` behaves **identically to today's program-only rule** —
current semantics are a strict subset.

**Seed:** `INSERT INTO quotas (code, name, is_active) VALUES ('pmss','PMSS Quota', true)
ON CONFLICT (code) DO NOTHING;`

### 4.3 The fee source — `fn_learner_current_year_academic_fee`
```
fn_learner_current_year_academic_fee(p_learner_id uuid) RETURNS numeric
  -- LANGUAGE sql STABLE, SECURITY DEFINER, SET search_path=public
```
```sql
SELECT SUM(b.final_amount)        -- NO COALESCE: SUM over zero rows = NULL = "no data"
FROM billing_student_bills b
JOIN learners_profiles lp ON lp.id = b.student_id
WHERE b.student_id = p_learner_id
  AND b.fee_source = 'academic'
  AND b.status NOT IN ('cancelled','superseded')
  AND b.academic_year_id = lp.academic_year_id;   -- strict (Option 2)
```
Returns **NULL** when the learner has no year-tagged academic bill — the caller treats NULL as "no fee data"
and **fails open** (it is *not* coalesced to 0, which would wrongly match a `<4L` band). A real summed value
(including a genuine `0`) is gated normally. This is the **single** definition of the gating fee; nothing else
computes it. **`SECURITY DEFINER`** (returns only an aggregate numeric, no row leakage) so campus-living
operators without billing read-permission still get a correct fee — mirroring `campus_living_get_hostelite_bill_status`.

### 4.4 The resolver — `fn_hostel_effective_room_categories` / `…_mess_categories`
```
fn_hostel_effective_room_categories(p_institution uuid, p_program uuid, p_quota uuid, p_fee numeric)
  RETURNS SETOF uuid   -- LANGUAGE sql STABLE
```
**Scope key** = `(program_id, quota_id, fee_min, fee_max)`. Algorithm:
1. **Candidate rows** = active rows where `institution_id = p_institution`
   AND `(program_id = p_program OR program_id IS NULL)`
   AND `(quota_id = p_quota OR quota_id IS NULL)`
   AND the **fee band holds** (`fee_min`/`fee_max` predicate above; both NULL = any fee).
2. **Specificity** = `(program_id NOT NULL)*4 + (quota_id NOT NULL)*2 + ((fee_min IS NOT NULL OR fee_max IS NOT NULL))*1`.
3. **Winning scope** = the candidate scope with **max specificity**; tie-break by **tightest band**
   (smallest `COALESCE(fee_max,'inf') − COALESCE(fee_min,0)`), then earliest `created_at`.
4. Return **all `<room|mess>_category_id`s of rows in the winning scope** (a scope may grant several categories).
5. **No candidates ⇒ empty set ⇒ caller fails open** (shows everything + hint).

Room and mess resolve **independently** (separate tables), matching the two-tab model and the matrix's
different room/mess breakpoints.

> **Gender note.** The returned `category_id`s are gender-typed rows. Admins configure a category per gender
> (the Settings dialog groups by name so "Classic" can add both boys + girls variants in one gesture). The
> allocation page already filters physical rooms by the student's gender, so the gender-typed set composes
> correctly. A program configured for one gender only leaves the other gender ungated ⇒ fail-open (safe, flagged).

### 4.5 Composite learner resolvers (the interface callers use)
```
fn_hostel_learner_room_categories(p_learner_id uuid) RETURNS SETOF uuid   -- STABLE
fn_hostel_learner_mess_categories(p_learner_id uuid) RETURNS SETOF uuid   -- STABLE
```
Each reads the learner's `institution_id, program_id, quota_id` from `learners_profiles`, computes the fee via
`fn_learner_current_year_academic_fee(p_learner_id)`, and returns
`fn_hostel_effective_{room,mess}_categories(institution, program, quota, fee)`. One RPC = the whole decision.
**If the fee is NULL (no year-tagged bill), the composite returns an empty set immediately ⇒ fail-open** — a
learner with no current-year academic bill is never forced into a band (the transition-period safety guarantee).

### 4.6 TS service + hooks
- `ProgramEligibilityService`: rewrite `getEffective{Room,Mess}Categories` to call the **composite** RPC
  `fn_hostel_learner_{room,mess}_categories(learnerId)` (returns `string[]`). Add `getActiveQuotas()`.
- `useEffective{Room,Mess}Categories(learnerId)` — key on `learnerId`; `enabled: !!learnerId`. (The hook no
  longer needs institution/program/quota/fee threaded in — the RPC derives them. Keep a thin back-compat
  export if anything imports the old signature.)
- `useActiveQuotas()` (reads `quotas` where `is_active`) for the Settings dropdown.
- `types/program-eligibility.ts`: add `quota_id`, `fee_min`, `fee_max` (+ resolved `quota_name`) to row shapes
  and create/update DTOs.

### 4.7 Settings UI (`/campus-living/settings/program-eligibility`, both Room & Mess tabs)
- **`form-dialog.tsx`:** add a **Quota** `SearchableSelect` (`Any quota` default + quota rows) and a **Fee band**
  control — two number inputs in **lakhs** (Min / Max, either blank = unbounded). On submit:
  `fee_min/fee_max = lakhs * 100000` (blank ⇒ `null`). Edit keeps scope/category immutable (current behaviour);
  only `is_active` / `is_monthly_mess_allowed` / `effective_from` editable. Optional client-side overlap warning.
- **`columns.tsx`:** add **Quota** (`Any` badge when null) and **Fee band** (`< 4L`, `4–4.25L`, `5–6L`, `Any`) columns.
- Category picker groups options by name with a gender hint; selecting a name offers both gender variants.

### 4.8 Enforcement
- **Allocation (`allocations/new/page.tsx`):** swap the 2-arg `useEffective*Categories(institution, program)`
  calls for the new `useEffective*Categories(learnerId)`. Existing fail-open filter + hint unchanged.
- **Self-service (`fn_my_manual_categories`)**: inside the RPC, resolve the caller's learner id
  (`get_my_learner_id()`), compute the eligible room set via `fn_hostel_learner_room_categories(self)`, and
  filter: `AND (v_eligible_count = 0 OR c.id = ANY(v_eligible_ids))` — preserving gender filter **and** fail-open.
  (No mess self-service picker exists today; mess gating applies via the allocation page.)

### 4.9 RLS / permissions
- Additive nullable columns ⇒ **no policy change**; `SELECT USING(true)` keeps the eligibility tables readable by
  all callers (allocation + SECURITY DEFINER self-service). The eligibility resolvers are `STABLE` INVOKER.
- **`fn_learner_current_year_academic_fee` is `SECURITY DEFINER`** (firm) — billing RLS would otherwise hide bills
  from campus-living operators and yield a false ₹0/NULL. It returns only an aggregate numeric (no row leakage),
  exactly the pattern `campus_living_get_hostelite_bill_status` uses. Pin `search_path=public`.
- **Out of scope (flagged):** the two tables keep the legacy hardcoded-role write gate; note for the
  `user_has_permission('campus_living.settings.edit')` retrofit.

---

## 5. Files touched

**DB (migration `supabase/migrations/<ts>_fee_aware_program_eligibility.sql` + mirror to `supabase/setup/`):**
- `ALTER` both eligibility tables (`quota_id`, `fee_min`, `fee_max`, check, unique-index swap, optional EXCLUDE).
- Seed `pmss` quota.
- `fn_learner_current_year_academic_fee`.
- `fn_hostel_effective_room_categories`, `fn_hostel_effective_mess_categories`.
- `fn_hostel_learner_room_categories`, `fn_hostel_learner_mess_categories`.
- `CREATE OR REPLACE fn_my_manual_categories` (inject the eligibility filter).

**TS:**
- `types/program-eligibility.ts` — DTOs + row shapes (+ quota/fee fields, `quota_name`).
- `lib/services/campus-living/program-eligibility-service.ts` — create/list carry quota/fee; resolver via composite RPC; `getActiveQuotas`.
- `hooks/campus-living/use-program-eligibility.ts` — `useActiveQuotas`; thread quota/fee through DTOs.
- `hooks/campus-living/use-allocation-eligibility.ts` — `useEffective{Room,Mess}Categories(learnerId)` over the composite RPC.
- `app/(routes)/campus-living/settings/program-eligibility/_components/form-dialog.tsx` — quota + fee-band controls.
- `app/(routes)/campus-living/settings/program-eligibility/_components/columns.tsx` — quota + fee-band columns.
- `app/(routes)/campus-living/allocations/new/page.tsx` — call the learner-based hooks.

**Type registration:** new RPCs called loosely-typed (existing pattern). No `types/supabase.ts` **table** change
(only columns + functions); add the 3 columns to the `billing`/eligibility Row/Insert/Update shapes if strict
typing of `.from()` selects requires it.

---

## 6. Prerequisites (the Option-2 cost — the gate is inert until these land)

1. **Bills must carry `academic_year_id`.** The `academic-year-aware-billing` feature (separate, *approved
   design, not yet built*) tags new bills. Until manual/automated bill paths set `academic_year_id`, new bills
   stay NULL and the strict join finds nothing.
2. **One-time backfill of the current cohort's academic bills** (5,773 currently NULL). Backfill only where it
   is *safe* — i.e. learners whose bills all belong to their current academic year (fresh/first-year intake);
   do **not** blanket-stamp multi-year students' historical bills to their current year (the academic-year-aware
   design's documented hazard). A targeted backfill or a per-institution generation pass is required before the
   gate enforces for existing students.
3. **`quota_id` coverage** is 72%; the un-quota'd 28% fail-open until quotas are assigned.

Until 1–2 are satisfied, `fn_learner_current_year_academic_fee` returns `0` for most learners ⇒ the gate
fail-opens (safe, but does nothing). This is the accepted trade-off of the strict model.

---

## 7. Verification (no test runner in repo)

- `mcp__ide__getDiagnostics` on every touched TS file (strict mode off — no full `tsc`).
- Apply migration; `execute_sql` unit-checks on crafted rows:
  - `fn_learner_current_year_academic_fee` sums only `fee_source='academic'`, current-year, non-cancelled bills.
  - resolver: program+quota+band beats program-default; tightest band wins tie; closed band `[5L,6L)` matches 5.5L, not 4.9L/6L; empty config ⇒ empty ⇒ fail-open.
- Browser, as a **non-super-admin**:
  - Configure BDS-Govt Room `Any → Classic`; Mess `<4L → Classic`, `≥4L → Premium`. Seed/tag a BDS-Govt learner with a `380000` academic bill (current AY) → Classic Room + Classic Mess offered; a `420000` learner → Classic Room + Premium Mess.
  - Configure BDS-Management `[5L,6L) → Deluxe + Premium Mess`; a `550000` learner → Deluxe offered.
  - Unconfigured program ⇒ all categories shown + hint.
  - Student `request-room` self-service: room list narrows to the eligible set; fail-open when unconfigured.
- `npm run check:menus` not required (no new routes/keys). `npm run lint` on touched files.

---

## 8. Out of scope / follow-ups
- **My-Hostel "upgrade to next level"** UI (the phase-2 the stakeholder deferred).
- Implementing `academic-year-aware-billing` + the current-cohort backfill (prerequisites, tracked separately).
- Permission-key retrofit of the two tables' write RLS.
- Mess self-service picker (none exists today).
- Admission-package assignment enforcement (not selected).
- `effective_from` forward-only restriction runtime (still reserved, unchanged).

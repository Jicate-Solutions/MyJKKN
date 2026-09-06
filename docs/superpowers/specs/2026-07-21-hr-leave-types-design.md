# HR Leave Types & Entitlement Management — Design

**Date:** 2026-07-21
**Status:** Approved, implementation not started
**Supersedes parts of:** `specs/hr-leave-and-employee-self-service-plan.md` (§1.3 claim that `leave_types` is the single canonical catalog for both audiences)

---

## 0. Problem

Staff cannot apply for leave. `/hr/leave/apply` renders *"No leave balance configured for this academic year. Please contact HR to set up your entitlements."* for every user, in every institution.

Verified root cause — **two independent faults**:

1. **No balances exist for the current academic year.** All 2,358 `hr_leave_balances` rows sit on 2024-2025 (2,334) or 2025-2026 (24). Zero rows exist for 2026-2027. The apply form builds its leave-type dropdown from `hr_leave_balances`, not `leave_types`, so the dropdown is empty, `leaveTypeId` never sets, and `canSubmit` is permanently false. No error, no toast, no 403.
2. **The academic-year picker selects the wrong year.** `use-academic-years.ts:13-14` orders `academic_year_name` descending as **text** and `apply/page.tsx:49-52` takes `[0]`. Institutions have future years pre-created with `is_active = true`, so `'2030-2031' > '2026-2027'` lexically. Pharmacy requests **2030-2031**; Dental requests **2028-2029**.

RLS is **not** a factor — the `20260721065226_hr_leave_rls_permission_retrofit` migration works. Verified by impersonation: a real team member sees exactly her own 6 balance rows, self-scoped.

**Why there is no admin fix:** every code reference to `hr_leave_balances` and `hr_leave_type_entitlements` is a *read*. No page, service method, or API route writes either table. The 2,358 rows were seeded once by migration and never refreshed. The only DB automation, `hr_trig_update_leave_balance`, increments `used` on approval — it never provisions `entitled`.

---

## 1. Goals

1. Give HR a dedicated leave-type catalog, managed in the HR module, independent of Academic leave types.
2. Make entitlements configurable through the UI rather than SQL.
3. Provide a repeatable "generate balances for an academic year" action so this outage cannot recur annually.
4. Rewire the leave flow to consume the HR catalog only.

**Non-goals:** biometric attendance ingestion; manager-based approval routing (the org chart is empty — `reports_to_staff_id` 0/543, `head_of_department_id` 0/79); leave-application comments (broken by separate column drift, tracked independently).

---

## 2. Approved decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Data model | **New physical `hr_leave_types` table**, not a scope filter on the shared table |
| D2 | Migration safety | **Preserve UUIDs** — FK values stay byte-identical; only constraint targets move |
| D3 | New fields | Carry-forward, encashment, accrual, and gender/cadre eligibility — all four groups |
| D4 | Scope | **All three tiers** — types + entitlements + balance generation |
| D5 | Old `leave_types` team member rows | **Delete** — one catalog per audience, no drift |
| D6 | Team members with no cadre | **Fall back to `default_entitled_days`**, and report who fell back |
| D7 | Cadre linkage | **Build a bulk cadre-assignment screen** — keep entitlements keyed by cadre |
| D8 | `institution_leaves` conflict | **Create `scope='institution'` label types and repoint the 20 rows**, then delete |

---

## 3. Discovered constraints

These were found by querying production and **materially changed the design**. Each would have broken the migration.

### 3.1 Seven FKs reference `leave_types`, not four

| Table | On delete | Rows pointing at staff types | Consequence |
|---|---|---|---|
| `hr_leave_balances` | — | 2,358 | Repoint to `hr_leave_types` |
| `hr_leave_applications` | — | 0 | Repoint |
| `hr_leave_type_entitlements` | CASCADE | 33 | Repoint |
| `hr_leave_encashments` | — | 0 | Repoint |
| `hr_leave_policies` | CASCADE | **0** | Repoint (empty, but constraint exists) |
| `institution_leaves` | **RESTRICT** | **20** | **Would hard-fail the DELETE** |
| `leave_approval_chains` | **CASCADE** | **3** | **Would be silently deleted** |

### 3.2 The `institution_leaves` coupling

20 rows across 5 institutions use staff leave types as holiday **labels** — real 2026 vacation periods:

| Label type | Institution | Rows | Range |
|---|---|---|---|
| Vacation Leave | Arts & Science (Aided) | 6 | 2026-06-20 → 2026-07-18 |
| Casual Leave | Nursing and Research | 5 | 2026-06-24 → 2026-07-25 |
| Vacation Leave | Arts & Science (Self) | 4 | 2026-06-20 → 2026-07-04 |
| Vacation Leave | Dental College | 2 | 2026-04-23 → 2026-05-31 |
| Vacation Leave | Nursing and Research | 2 | 2026-04-23 → 2026-06-03 |
| Casual Leave | Dental College | 1 | 2026-06-24 → 2026-06-27 |

**Key fact:** `hr_calc_leave_days` reads `institution_leaves` **by date range only** — it never reads `leave_type_id`. The FK is a label, not functional. Repointing it to new `scope='institution'` label types preserves day-count behaviour exactly.

### 3.3 The cadre link is entirely unpopulated

| Field | Populated |
|---|---|
| `hr_staff_details.cadre_id` | **0 of 543** |
| `hr_staff_details.designation_id` | **0 of 543** |
| `hr_cadres` rows | 44 |
| `hr_leave_type_entitlements` rows | 33 (pointing at cadres no team members have) |
| `staff.designation` (free text) | 731 of 731 — **165 distinct, unnormalized** |

The cadre × leave-type entitlement matrix therefore resolves for **zero staff today**. Every employee will hit the D6 fallback until the D7 assignment screen is used. This is expected, not a defect.

---

## 4. Data model

```
hr_leave_types  (new physical table, replaces the view)
├── identity ──── id (UUID preserved), hr_organization_id, leave_type_code,
│                 leave_type_name, description, color_code, display_order, is_active
├── duration ──── duration_type ('full'|'first_half'|'second_half'|'hourly'),
│                 allow_half_day, allow_hourly
├── day math ──── skip_weekends (default true), skip_holidays (default true)
├── policy ────── requires_approval, is_paid, min_advance_notice_days,
│                 max_continuous_days, requires_documents,
│                 document_required_after_days, default_entitled_days
├── validity ──── valid_from, valid_until, superseded_by
└── NEW (D3)
    ├── allow_carry_forward   boolean  default false
    ├── max_carry_forward_days numeric NULL
    ├── is_encashable         boolean  default false
    ├── max_encashable_days   numeric  NULL
    ├── accrual_type          varchar  default 'none'  -- none|annual|monthly
    ├── accrual_rate          numeric  default 0
    ├── applicable_gender     varchar  default 'all'   -- all|male|female
    └── applicable_cadre_ids  uuid[]   NULL            -- NULL = all cadres
```

**Tenancy:** keys on `hr_organization_id` (NOT NULL), not `institution_id`. This removes the org↔institution translation `apply/page.tsx:39-42` performs today. The 1:1 mapping (14 orgs ↔ 14 institutions) is verified.

`leave_types` retains `scope` with values `'learner'` (9 rows) and `'institution'` (new label types). `'staff'` ceases to exist there.

---

## 5. Migration plan

One transactional migration. Order matters — steps 2 and 3 must precede any delete.

```
1. CREATE TABLE hr_leave_types (…)          -- after DROP VIEW hr_leave_types
2. INSERT INTO hr_leave_types (id, hr_organization_id, …)
     SELECT lt.id, o.id, …                   -- SAME UUIDs
     FROM leave_types lt
     JOIN hr_organizations o ON o.institution_id = lt.institution_id
     WHERE lt.scope = 'staff';               -- expect 66
3. Repoint 5 HR foreign keys → hr_leave_types(id)
     hr_leave_balances, hr_leave_applications,
     hr_leave_type_entitlements, hr_leave_encashments, hr_leave_policies
4. Create scope='institution' label types (Vacation, Casual, …)
   and UPDATE institution_leaves.leave_type_id → the new labels   -- 20 rows
5. DELETE FROM leave_approval_chains WHERE leave_type_id IN (staff types)  -- 3 rows,
   EXPLICIT and logged, never left to silent CASCADE.
   Rationale: staff leave routes through hr_approval_flows; these rows are orphaned config.
6. DELETE FROM leave_types WHERE scope = 'staff';   -- expect 66
7. RLS policies on hr_leave_types
```

**Post-conditions asserted inside the migration** (raise on mismatch):
- `hr_leave_types` = 66 rows
- `leave_types WHERE scope='staff'` = 0 rows
- `hr_leave_balances` orphan check = 0 rows
- `institution_leaves` orphan check = 0 rows

**Rollback:** UUIDs are preserved throughout, so reversal is re-inserting the 66 rows into `leave_types` and repointing FKs back. No balance data is mutated at any step.

---

## 6. Admin surfaces

| Route | Purpose | Permission |
|---|---|---|
| `/hr/admin/leave-types` | CRUD the 66 types, all 28 fields | `hr.leave.types.manage` (new) |
| `/hr/admin/staff-cadres` | Bulk-assign 740 team members → 44 cadres, suggested from `staff.designation` | `hr.staff.cadre.assign` (new) |
| `/hr/admin/leave-entitlements` | Matrix: cadre × leave type → entitled days | `hr.leave.policies.write` (**exists**) |
| `/hr/admin/leave-balances` | Generate balances for an academic year | `hr.leave.balance.manage` (new) |

Follow the existing HR admin pattern: page → React Query hook (`hooks/hr/`) → service class extending `BaseService` (`lib/services/hr/`) → Supabase. New service: `lib/services/hr/leave-type-service.ts`.

`/hr/admin/*` routes currently all gate on `hr.dashboard.view`; the new keys are additive and must be granted by migration.

---

## 7. Balance generator

`SECURITY DEFINER` RPC, self-authorizing on `user_has_permission('hr.leave.balance.manage')`.

```
generate_hr_leave_balances(p_hr_org_id uuid, p_academic_year_id uuid, p_dry_run boolean)

for each active staff in org:
  for each active hr_leave_type (respecting applicable_gender / applicable_cadre_ids):
    entitled := hr_leave_type_entitlements(cadre, type).entitled_days   -- if staff has cadre
             ?? hr_leave_types.default_entitled_days                    -- D6 fallback
    carried  := prior-year (entitled + carried - used), clamped ≥ 0,
                capped at max_carry_forward_days,
                0 when allow_carry_forward = false
    INSERT INTO hr_leave_balances (…) VALUES (…, entitled, 0, carried)
    ON CONFLICT (employee_id, leave_type_id, academic_year_id) DO NOTHING
```

**Prior year resolution (explicit — do not infer from name).** The prior academic year is the row for the *same institution* with the greatest `end_date` strictly earlier than the target year's `start_date`. Never sort by `academic_year_name` — that is the exact text-sort bug being fixed in §8, and names are not reliably ordered (some carry trailing spaces, e.g. `'2026-2027 '`, `'2025-2026 '`).

If no prior year exists, `carried := 0`.

Returns `{ created, skipped, fallback_used[] }` where `fallback_used` lists team members who had no cadre entitlement. Dry-run computes and reports without writing.

**Idempotent** via the real constraint `(employee_id, leave_type_id, academic_year_id)` — safe to re-run.

**Ordering requirement:** the generator must run *before* anyone applies. `hr_trig_update_leave_balance` inserts `entitled = 0, used = total_days` on approval when no row exists, producing a permanently negative balance that then blocks the employee.

---

## 8. Flow rewiring

| Site | Change |
|---|---|
| `leave-service.ts` `applyLeave` | `.from('leave_types').eq('scope','staff')` → `.from('hr_leave_types')`; drop the scope filter |
| `leave-service.ts` `getBalance` | join target → `hr_leave_types` |
| `leave-service.ts` `getCalendar`, encashment | same |
| `use-academic-years.ts:10-14` | select the year whose `start_date`/`end_date` bracket today, not `[0]` of a name-desc list |
| `apply/page.tsx:49-52`, `balance/page.tsx`, `encashment/page.tsx` | consume the corrected selection |

The year-picker fix is **in scope**: without it the generator writes 2026-2027 balances while Pharmacy's form still requests 2030-2031, and the outage persists for two institutions.

Sweep for remaining `leave_types` references in HR paths before step 6. A missed path fails loudly (FK/relation error) rather than returning empty — deliberate, per D5.

---

## 9. Navigation wiring

Per the 10-step checklist in `specs/hr-leave-and-employee-self-service-plan.md:152-163`:

| # | File | Gate |
|---|---|---|
| 1 | `lib/sidebarMenuLink.ts` — HR Admin group entries | `check:sidebar` |
| 2 | `lib/sidebarMenuLink.ts` — `MENU_PERMISSIONS` per href (**missing ⇒ default-DENY**) | `check:menu-coverage` |
| 3 | `lib/constants/permissions.ts` — catalog the 3 new keys | `check:permissions` |
| 4 | Migration granting keys to roles | ⚠️ **no gate** — verify by SQL |
| 5 | `components/BottomNav/bottom-nav-more-menu.tsx` | ⚠️ **no gate** |
| 6 | `lib/permissions-audit/module-mappings.ts` | `check:audit-coverage` |
| 7 | `app/(routes)/hr/nav-config.ts` — chips | `check:reachability` |
| 8 | `lib/navigation/route-manifest.generated.ts` | `gen:routes` |

Also required: register `hr_leave_types` in `types/supabase.ts`, or `.from('hr_leave_types')` fails typecheck.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| A missed code path joins `leave_types` for team members | Deliberate loud failure (D5). Full reference sweep before step 6. |
| New permission keys declared but not granted → empty pages | Grant migration tested by **value** (`(permissions->>k)::boolean IS TRUE`), not key presence — 63 roles carry HR keys set to `false` |
| Approving leave with no balance row → negative balance | Generator runs before apply is enabled; dry-run first |
| `institution_leaves` RESTRICT blocks migration | Step 4 repoints all 20 rows before step 6 |
| `leave_approval_chains` silent CASCADE | Step 5 deletes the 3 rows explicitly, with a logged count |
| `user_hr_access` tripwire (L1 — 26 `cmd=ALL` policies incl. self-grant) | Design touches **no** `user_hr_access` rows; policies stay dormant |
| Entitlements inert until cadres assigned | Expected (§3.3). D6 fallback ensures nobody is blocked meanwhile. |

---

## 11. Suggested build order

This spec is large (a migration, four screens, an RPC, and flow rewiring). It is coherent as one design but should be executed in dependency order, with the module verified working before the optional screens are added:

| Stage | Contents | Outcome |
|---|---|---|
| **A** | Migration (§5) + `types/supabase.ts` + flow rewiring (§8) | Catalog split done; module still reads correctly |
| **B** | Generator RPC (§7) + `/hr/admin/leave-balances` | **Team members can apply for leave** — the outage ends here |
| **C** | `/hr/admin/leave-types` CRUD | Types manageable without SQL |
| **D** | `/hr/admin/leave-entitlements` + `/hr/admin/staff-cadres` | Per-cadre entitlements become meaningful |

Stage B is the point at which the reported bug is fixed. Stages C and D remove the recurring SQL dependency. Nav wiring (§9) accompanies whichever stage introduces each route.

---

## 12. Verification

There is **no test suite in this repo** — do not claim tests pass.

1. `mcp__ide__getDiagnostics` on every touched file
2. `npm run check:sidebar`, `check:reachability`, `check:audit-coverage`, `check:menus`
   - Note: `check:menus` fails at HEAD on an unrelated pre-existing issue (`/system` has no `MENU_PERMISSIONS` entry). Not a regression.
3. SQL: assert the four post-conditions in §5; assert grants by value
4. Dry-run the generator for JKKN Testing Institution; confirm the fallback list contains all staff (cadres unassigned)
5. Run the generator for real; confirm Boobalan A (JEI001, team member `403db380-…`) gains 6 rows on AY 2026-2027 (`f88b7054-…`)
6. **Browser test as a plain `faculty` role — never as super-admin.** Confirm `/hr/leave/apply` populates the dropdown and submits.

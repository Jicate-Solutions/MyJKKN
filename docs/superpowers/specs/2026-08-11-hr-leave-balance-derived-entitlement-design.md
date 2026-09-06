# HR Leave Balances — Derived Entitlement

**Date:** 2026-08-11
**Status:** Approved, implementation not started
**Builds on:** `specs/2026-07-21-hr-leave-types-design.md` (which introduced `hr_leave_types`, the generator RPC, and `/hr/admin/leave-balances`)

---

## 0. Problem

`hr_leave_balances` is a materialized ledger: one row per staff × leave type × academic year, carrying `entitled`, `used`, `carried_forward`. The only way rows come into existence is an admin manually running **Generate** at `/hr/admin/leave-balances`.

That makes the module unmanageable in three compounding ways.

**A staff member with no balance row cannot apply for leave.** The leave-type dropdown is built from balances, not from the leave-type catalog (`apply-leave-drawer.tsx:62`, `hooks/hr/use-time-off-context.ts:46`). With zero rows the drawer renders *"No leave balance is configured for you this academic year. Please contact HR to set up your entitlements."* (`apply-leave-drawer.tsx:180-187`). **315 staff joined in the last 90 days**; every one of them was locked out until somebody remembered to re-run Generate.

**The generator cannot repair what it created wrong.** It inserts `ON CONFLICT DO NOTHING`, so a re-run reports "skipped", never "updated". Editing a leave type's `default_entitled_days` therefore has no effect on the 4,289 rows already written for the current year.

**The absence of a row disables the over-draw guard.** `leave-service.ts:336` reads `if (balance) { …check… }`. No row means no check — a fail-open. The negative-balance path is real too: `hr_trig_update_leave_balance` inserts `entitled = 0, used = total_days` on approval when no row exists, and the generator will not later fix it.

---

## 1. Goals

1. A newly created staff member can apply for leave immediately, with no admin action.
2. Editing a leave type's days takes effect at once for everyone at that institution.
3. Closed academic years keep the numbers they had.
4. Genuine per-person exceptions remain expressible, explicitly and auditably.
5. The mandatory pre-year "Generate" ritual is removed.

**Non-goals:** backfilling `hr_staff_details` / cadre data; reworking comp-off or short-time-off (neither draws on this ledger); approval routing; encashment.

---

## 2. Approved decisions

| # | Decision | Choice |
|---|---|---|
| D1 | How entitlement is decided | **Flat per institution + explicit per-person exceptions.** The leave type's `default_entitled_days` applies to every active staff member; exceptions are individually recorded with a reason |
| D2 | Mid-year policy edit | **Applies immediately to everyone** in that institution for the open year. Past years unaffected |
| D3 | Storage model | **Derive entitlement, store only usage.** `entitled` is computed from policy, not copied per person |
| D4 | Cadre entitlements (`hr_leave_type_entitlements`) | **Retired from the balance path.** Table and rows left in place, simply unread. No UI ever exposed them |
| D5 | History | **Frozen at year end** by an automated archival step, not at year start by a manual one |
| D6 | View security | **Explicit predicate copied from `hlb_select`**, not `security_invoker` |

---

## 3. Discovered constraints

Queried from production 2026-08-11. Each materially shaped the design.

### 3.1 The cadre entitlement layer is inert

Of the **4,289** balance rows on the current year (2026-2027):

| Source of `entitled` | Rows |
|---|---|
| Leave type default | **4,286** |
| Cadre entitlement | **3** |
| Manual / other | 0 |

Across all 71 active leave types: **0** are cadre-restricted (`applicable_cadre_ids IS NULL` everywhere), **0** are gender-restricted, and there is **1** active `hr_leave_type_assignments` row (JKKN Testing Institution). The precedence chain assignment → cadre → default resolves to *default* 99.93% of the time.

### 3.2 Cadre data does not exist, and arrives late when it does

| Of 752 active staff | Count |
|---|---|
| No `hr_staff_details` row at all | **279** |
| Row exists, `cadre_id` NULL | **220** |
| Has a cadre | **253** (34%) |
| `hr_staff_details` created >1 min after the `staff` row | **183** |

That last row is decisive. Cadre is assigned as a **separate, later step**. Any "provision balances when staff is created" trigger would resolve entitlement while `cadre_id` is still NULL, freeze the type default, and — being additive-only — never correct it once the cadre arrived. Materialize-on-insert is not safely implementable against this data.

### 3.3 The cadre × leave-type matrix has no UI

`/hr/admin/leave-entitlements` was specified as Stage D of the 2026-07-21 plan and **never built**. The only screens under `/hr/admin` touching this area are `leave-types/` and `leave-balances/`. Retiring the cadre layer from the balance path therefore breaks **no screen** — nothing can currently write those rows through the product.

### 3.4 Current ledger state

| Year | `hr_academic_year_id` | Rows | Staff |
|---|---|---|---|
| 2027-2028 | `e63051a0-…` | 0 | 0 |
| **2026-2027 (current)** | `2c5d0bb6-…` | **4,289** | 755 |
| 2025-2026 | `6ba632af-…` | 24 | 4 |
| 2024-2025 | `a6baeaf9-…` | 2,334 | 389 |

Rows with `entitled = 0 AND used > 0` (the permanently-negative case): **0 today.** The failure mode is live but has not yet been triggered — 302 leave applications exist so far. This is a fix-before-it-bites, not a cleanup.

### 3.5 Platform facts

- **PostgreSQL 15.6** — `security_invoker` views are available (not used; see D6).
- `hlb_select` on `hr_leave_balances`:
  `is_super_admin() OR employee_id IN (SELECT unnest(fn_my_staff_ids())) OR (user_has_permission('hr.leave.approve') AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids())))`
- `trg_hla_balance_update` is **AFTER UPDATE**, UPDATE-only. `trg_hla_populate_total_days` is BEFORE, so `total_days` is populated before the balance trigger reads it — no ordering hazard.

---

## 4. Principle

> **Entitlement is derived. Usage is recorded. History freezes when a year ends.**

`used` is a fact about the past — it accumulates from approved applications and cannot be recomputed, so it must be stored. `entitled` is a restatement of current policy — it can always be recomputed, so storing a per-person copy only creates opportunities for the copy to be missing, stale, or frozen from incomplete inputs. All three of §0's failures are consequences of that copy.

Resolution order, evaluated in exactly one place:

```sql
effective_entitled = COALESCE(
  override.entitled_days,              -- explicit, reasoned exception
  balance.entitled,                    -- frozen value (closed years only)
  leave_type.default_entitled_days     -- current policy
)
```

`COALESCE`, not truthiness: an override or frozen value of `0` is a real decision and must win over the default.

---

## 5. Schema changes

All additive or widening. No column is dropped, no table is removed.

**5.1 `hr_leave_balances.entitled` becomes nullable.**
`NULL` means *derive from policy*. A non-NULL value continues to win, so every closed-year row keeps its number with no migration of historical data.

**5.2 New table `hr_leave_entitlement_overrides`.**

```sql
CREATE TABLE public.hr_leave_entitlement_overrides (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid NOT NULL REFERENCES public.staff(id)             ON DELETE CASCADE,
  leave_type_id       uuid NOT NULL REFERENCES public.hr_leave_types(id)    ON DELETE CASCADE,
  hr_academic_year_id uuid NOT NULL REFERENCES public.hr_academic_years(id) ON DELETE CASCADE,
  hr_organization_id  uuid NOT NULL REFERENCES public.hr_organizations(id),
  entitled_days       numeric NOT NULL CHECK (entitled_days >= 0),
  reason              text NOT NULL CHECK (btrim(reason) <> ''),
  created_by          uuid REFERENCES public.profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, leave_type_id, hr_academic_year_id)
);
```

`hr_academic_year_id` is NOT NULL — an override always names its year. A nullable "applies to every year" value would be invisible to the unique constraint (Postgres treats NULLs as distinct) and would let duplicates accumulate silently.

`reason` is mandatory. An unexplained exception is how this table becomes unmaintainable.

`hr_organization_id` is denormalized to carry the RLS predicate without a join, matching `hr_leave_balances`.

**RLS.** Two policies, mirroring the shape already used on `hr_leave_balances`:

```sql
-- read: your own overrides, or any in an org you approve for
CREATE POLICY hleo_select ON public.hr_leave_entitlement_overrides FOR SELECT USING (
  (SELECT is_super_admin())
  OR employee_id IN (SELECT unnest(fn_my_staff_ids()))
  OR ((SELECT user_has_permission('hr.leave.approve'))
      AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids())))
);

-- write: balance managers, scoped to their own orgs
CREATE POLICY hleo_write ON public.hr_leave_entitlement_overrides FOR ALL USING (
  (SELECT is_super_admin())
  OR ((SELECT user_has_permission('hr.leave.balance.manage'))
      AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids())))
);
```

The write key is `hr.leave.balance.manage` (the key already guarding this screen), **not** `hr.leave.policies.write` which guards `hlb_write`. Setting one person's exception is a balance-administration act, and the page the UI lives on is already gated on that key.

**5.3 `hr_academic_years.frozen_at timestamptz NULL`.** Non-NULL marks the year as archived; see §8.

---

## 6. `v_hr_leave_balance`

One row per (active staff × active leave type for their org × academic year), **whether or not a ledger row exists**. That property is what unblocks new staff with no admin action.

Shape — denormalized deliberately so consumers need no PostgREST embed (views do not carry FK metadata reliably, and the current code embeds `hr_leave_types`):

```
employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
leave_type_name, leave_type_code, request_category, color_code, display_order,
allow_half_day, max_continuous_days, min_advance_notice_days,
entitled, used, carried_forward, available,
entitlement_source  -- 'override' | 'frozen' | 'policy'
```

`entitlement_source` exists so the Exceptions UI and any audit can distinguish the three cases without re-deriving the COALESCE.

**Security (D6).** The view carries an explicit `WHERE` clause copied verbatim from `hlb_select`:

```sql
WHERE is_super_admin()
   OR s.id IN (SELECT unnest(fn_my_staff_ids()))
   OR (user_has_permission('hr.leave.approve')
       AND t.hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids())))
```

`security_invoker` is **not** used, even though PG 15.6 supports it. The view's driving table is `staff`, not `hr_leave_balances`, so invoker mode would silently substitute `staff`'s RLS for the leave-balance rule that governs this data today — a different and unaudited access model. Copying the predicate keeps behaviour identical to the current table reads.

**Scope.** The view is a union of two arms:

- **Open years** (`frozen_at IS NULL`) — the derived arm: active staff × active leave types for their org, LEFT JOINed to any ledger row for `used` / `carried_forward`. This is the arm that returns a row for a staff member who has none.
- **Frozen years** (`frozen_at IS NOT NULL`) — stored ledger rows only, no cross join. History is served exactly as recorded.

A year that has ended but not yet been frozen still sits in the open arm and keeps deriving. That is deliberate (see the freeze-cron risk in §13) and is why `frozen_at`, not `end_date`, is the discriminator.

The cross join is bounded at roughly 752 staff × 6 types ≈ 4.5k rows per open year.

---

## 7. Approval trigger

`hr_trig_update_leave_balance` currently inserts `entitled = 0` when no row exists, producing a permanently negative balance the generator can never repair. Change that single value to `NULL`.

```sql
VALUES (NEW.employee_id, NEW.leave_type_id, NEW.hr_academic_year_id,
        NEW.hr_organization_id, NULL, v_delta, 0)
```

The row now derives its entitlement from policy while still recording the usage. The negative-balance failure mode ceases to exist rather than being cleaned up.

---

## 8. Year freeze

A new `SECURITY DEFINER` RPC, `fn_hr_freeze_leave_year(p_hr_academic_year_id uuid) RETURNS jsonb`, driven by a daily cron at `app/api/cron/hr-leave-year-freeze/route.ts` — following the established pattern in the 144 existing cron routes (`CRON_SECRET` check, service-role client, since sessionless contexts have no cookie identity).

For each `hr_academic_years` row where `end_date < current_date AND frozen_at IS NULL`:

1. Insert a ledger row for every (active staff × active leave type) pair in that year that lacks one, stamping the **then-current derived** `entitled`.
2. `UPDATE hr_leave_balances SET entitled = <derived> WHERE hr_academic_year_id = <year> AND entitled IS NULL`.
3. Set `frozen_at = now()`.

The whole thing runs in one transaction per year, so a year is never left half-frozen. Idempotent by the `frozen_at` guard.

**This is a new function, not the existing generator.** `generate_hr_leave_balances` and `generate_hr_leave_balances_bulk` are `ON CONFLICT DO NOTHING` and cannot perform step 2 — freezing must *overwrite* the NULLs it finds, which is exactly the update the old generator was designed never to do. The two old RPCs are left in the database, unreferenced, so the migration stays reversible; they are dropped in a later cleanup once this model has run through one year end.

Conceptually the ritual has moved rather than vanished: from *a prerequisite you must remember before a year starts* to *an archival step that runs itself after a year ends*.

A manual "Freeze now" action is exposed in the UI for admins holding `hr.leave.balance.manage`, so a year can be closed early without waiting for the cron.

---

## 9. Data migration

Order matters.

1. **Preserve the divergent rows.** Verified 2026-08-11: **exactly 3** current-year rows differ from their type default — all three are *Vacation Leave* at **7.00** against a default of **14.00**, all cadre-derived (employees `70e1c25e…`, `c143596f…`, `3f8058b6…`). Insert each as an `hr_leave_entitlement_overrides` row with `reason = 'Migrated from cadre entitlement 2026-08-11'`, so no individual's number changes on cutover. Select them by the general predicate (`entitled IS DISTINCT FROM default_entitled_days`), not by hardcoded ids — the ids are recorded here to verify the count, not to drive the migration.
2. **Widen the column** — `ALTER TABLE hr_leave_balances ALTER COLUMN entitled DROP NOT NULL`.
3. **Release the open years** — `UPDATE hr_leave_balances SET entitled = NULL WHERE hr_academic_year_id IN (SELECT id FROM hr_academic_years WHERE end_date >= current_date)`. Expected: **4,289** rows (all on 2026-2027; 2027-2028 has none). `used` and `carried_forward` are never touched.
4. **Backfill `frozen_at`** on 2024-2025 and 2025-2026 (both ended) so the cron does not re-derive historical numbers from today's policy.

**Post-conditions asserted inside the migration** (raise on mismatch):

- `hr_leave_entitlement_overrides` = 3 rows, each with `entitled_days = 7.00`
- `hr_leave_balances WHERE hr_academic_year_id = <2026-2027> AND entitled IS NOT NULL` = 0
- `sum(used)` and `sum(carried_forward)` on the current year unchanged from their pre-migration values
- every active staff member resolves ≥1 row in `v_hr_leave_balance` for the current year
- the 3 migrated employees still resolve `entitled = 7.00` (not 14.00) through the view

**Rollback:** step 3 is the only destructive step and only nulls a column that is recomputable from policy; reversal is re-running the derivation into `entitled` and restoring `NOT NULL`.

---

## 10. Read-path rewiring

Every consumer funnels through a small number of sites:

| Site | Change |
|---|---|
| `lib/services/hr/leave-service.ts:325` (`getBalance` / over-draw check) | `.from('hr_leave_balances')` → `.from('v_hr_leave_balance')` |
| `lib/services/hr/leave-service.ts:336` | `if (balance)` → unconditional. The view always returns a row, so the over-draw guard stops being fail-open |
| `hooks/hr/use-time-off-context.ts:46` | No change — inherits the corrected `useLeaveBalance` |
| `lib/services/hr/dashboard-service.ts:293, 698, 792` | Read the view so KPI rollups include staff with no ledger row |
| `lib/services/hr/analytics-service.ts:334` | Read the view. **Note:** this currently selects `allocated`, a column that does not exist on `hr_leave_balances` — a pre-existing latent bug to be fixed here, and reported separately |
| `hr_leave_balance_analytics` RPC | "Coverage" is structurally always complete under this model. Reduce to utilisation + override counts |

---

## 11. UI

**`/hr/admin/leave-balances`** (guard unchanged: `hr.leave.balance.manage`)

| Tab | Change |
|---|---|
| Analytics | Keep utilisation. Remove coverage/gap reporting — it can no longer be non-zero |
| Generate | **Removed.** Replaced by **Exceptions** — list, create, edit, delete overrides, each showing staff, leave type, year, days, reason, author |
| — | New **Year archive** tab: freeze status per year, plus a manual "Freeze now" |

**`/hr/admin/leave-types`** — the days field gains a live *"applies immediately to N active staff at this institution"* note, so the blast radius of D2 is visible before saving.

`generate-balances-form.tsx` and `coverage-status.ts` are deleted, along with the `GenerateBalancesBulkResult` type and the `useGenerateBalancesBulk` / `useGenerateBalances` hooks. The two `generate_hr_leave_balances*` RPCs stay in the database unreferenced (§8), so nothing in the product calls them after this change.

---

## 12. Permissions & navigation

No new permission keys. Overrides are gated on the existing `hr.leave.balance.manage`; the view mirrors `hlb_select`.

`hr_leave_entitlement_overrides` must be registered in `types/supabase.ts` or `.from('hr_leave_entitlement_overrides')` fails typecheck (TS2769 cascade). `v_hr_leave_balance` likewise.

No route is added or removed — `/hr/admin/leave-balances` keeps its path — so `check:sidebar`, `check:reachability`, and `check:audit-coverage` should be unaffected. They are run regardless.

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| View performance — cross join over 752 staff × ~6 types × open years | ~4.5k rows/year. `EXPLAIN ANALYZE` before shipping; index `hr_leave_balances(employee_id, leave_type_id, hr_academic_year_id)` and the overrides unique key |
| A write path still sets `entitled` directly | Full sweep before cutover. `hlb_write` is gated on `hr.leave.policies.write`; only the freeze cron should write `entitled` after this change |
| `analytics-service.ts` selects a non-existent `allocated` column | Pre-existing. Fixed as part of §10 and reported separately rather than folded in silently |
| Carry-forward derivation | No active leave type sets `allow_carry_forward`, so this is 0 everywhere today. Implemented against the **frozen** prior year (correct by construction) but cannot be exercised with current configuration — stated, not claimed as verified |
| `trg_hla_balance_update` is UPDATE-only | An application INSERTed already-approved bypasses balance accounting. Pre-existing and out of scope; noted so it is not mistaken for a regression |
| Freeze cron never runs (misconfigured secret) | Years stay open and keep deriving — degrades to current-policy numbers for old years rather than to an outage. Freeze status is visible in the Year archive tab |
| Removing the Generate tab surprises an operator mid-year | Release note in the UI; the Exceptions tab replaces it in the same position |

---

## 14. Verification

**There is no test runner in this repo — do not claim tests pass.**

1. `mcp__ide__getDiagnostics` on every touched file.
2. `npm run check:sidebar`, `check:reachability`, `check:audit-coverage`, `check:menus`.
3. The four §9 post-conditions asserted inside the migration.
4. SQL: pick a staff member with **no** `hr_staff_details` row and confirm `v_hr_leave_balance` returns their full set of leave types for the current year.
5. SQL: change a leave type's `default_entitled_days`, confirm every active staff member at that institution reflects it immediately and that a closed year does not move.
6. SQL: insert an override, confirm it wins over the policy value and `entitlement_source = 'override'`.
7. **Browser, as a plain `faculty` role — never as super-admin.** Create a staff member, then confirm `/hr/leave/apply` shows a populated dropdown with correct available days, with **no** admin action in between. This is the acceptance criterion for the whole change.
8. Confirm the over-draw guard now rejects an over-limit request for a staff member with no ledger row (previously fail-open).

---

## 15. Build order

| Stage | Contents | Outcome |
|---|---|---|
| **A** | Schema (§5) + data migration (§9) + `types/supabase.ts` | Model in place; nothing reads it yet |
| **B** | `v_hr_leave_balance` (§6) + read-path rewiring (§10) + trigger fix (§7) | **New staff can apply with no admin action** — the goal is met here |
| **C** | Freeze cron (§8) + Year archive tab | History stops depending on anyone remembering |
| **D** | Exceptions UI (§11) + leave-type blast-radius note | Per-person exceptions manageable without SQL |

Stage B is the point at which the reported problem is solved. Until Stage D ships, the 3 migrated overrides are managed by SQL — acceptable, as that is also true today.

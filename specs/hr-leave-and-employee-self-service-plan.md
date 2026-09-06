# HR Leave + Employee Self Service — Implementation Plan

**Date:** 2026-07-21
**Status:** Approved, implementation not started
**Method:** Six parallel investigation agents + direct verification. Every number below was verified by SQL against production or by reading source. Claims that were reported but not personally verified are marked ⚠️.

---

## 0. Executive summary

The `/hr/leave/*` module is **fully built and completely non-functional**. `hr_leave_applications` has 0 rows not because staff didn't adopt it, but because **no user can reach the form**. There are four independent, individually-fatal blockers, plus three dormant security holes that any fix to the first blocker would *activate*.

This is not a rearrangement job. The menu restructure the user asked for is the smaller half; the module has to be made reachable first.

---

## 1. Verified findings

### 1.1 The four blockers

| # | Blocker | Evidence |
|---|---|---|
| 1 | **`getCurrentEmployee()` reads an empty table.** Resolves the caller via `hr_employees.user_id`, but `hr_employees` has **0 rows** (all 740 active staff moved to `staff` by `20260524083600_consolidate_hr_employees_to_staff`). Returns `null` for every user, always. | `lib/services/hr/regularization-service.ts:148` and `:315` |
| 2 | **HR tenancy was never provisioned.** All `hr_leave_*` RLS gates on `auth_hr_organization_id()` → reads `user_hr_access` → **1 row for 844 staff**. Returns NULL for everyone else; `col = NULL` is NULL, not TRUE, so RLS denies every read and write. **32 tables** across the HR module are gated this way. | `pg_get_functiondef('auth_hr_organization_id')`; `SELECT count(*) FROM user_hr_access` = 1 |
| 3 | **Self-service permissions granted to almost nobody.** `hr.leave.apply` = **4** roles of 75. `hr.attendance.view_self` = **2**. Only **11 of 75** roles hold *any* HR permission; `faculty` and plain `staff` hold **zero**. | value-tested: `count(*) FILTER (WHERE (permissions->>key)::boolean IS TRUE)` |
| 4 | **The layout guard blocks the whole subtree.** `app/(routes)/hr/layout.tsx` wraps `/hr/*` in `RoutePermissionGuard`. `matchPermission()` returns the *deepest* matched prefix, so any page with no own `MENU_PERMISSIONS` entry inherits `'/hr' → 'hr.view'` — TRUE for **2 of 75 roles** (`hr_admin`, `hr_head`). Blocks `/hr/shifts/my`, `/hr/my-assets`, `/hr/memos/my`, `/hr/performance-reviews`, `/hr/promotions/apply`, `/hr/attendance/regularize`, `/hr/training`, `/hr/fdp`, `/hr/documents`, `/hr/forms/inbox` — for 73 roles including CEO and COO. | `lib/auth/route-matcher.ts:183-231`; `hr.view` TRUE = 2 |

**The failure is silent by construction.** The apply form builds its leave-type dropdown from `hr_leave_balances`. RLS returns *zero rows*, not an error — so the dropdown renders "No leave balance configured for this academic year. Please contact HR", `leaveTypeId` never sets, `canSubmit` is permanently false, and the Submit button never enables. No toast, no console error, no 403.

Proven by RLS impersonation of a real staff member (`profiles.id = 3a7a0e1c-…`) who **has 6 genuine balance rows**: `auth_hr_organization_id()` = NULL, `visible hr_leave_balances` = **0**. Her own data is invisible to her.

### 1.2 Three dormant security holes — activated by fixing blocker 2

| Hole | Detail |
|---|---|
| **Self-approval** | `hla_update` permits `employee_id IN (SELECT id FROM staff WHERE profile_id = auth.uid())` with `with_check = null`, and `approveApplication` never verifies the caller matches `chain[current_step]`. An employee can `POST /api/hr/leave/applications/{own-id}/approve`. `lib/services/hr/leave-service.ts:250-295` |
| **Balance IDOR** | `app/api/hr/leave/balance/route.ts:35` takes `employee_id` from the query string, checks only that *someone* is authenticated. `hlb_select` is org-scoped, not self-scoped → any staff member reads a colleague's entitlements by editing a URL param. |
| **Unscoped approver inbox** | `pending_approver_id` is declared (`leave-service.ts:35`), sent by the hook (`use-leave.ts:40`), and **never applied** to the query. `/hr/leave/approve` calls `useApplicationsByStatus` and lists every pending application in the org. `useApprovalInbox` has zero callers. |

**These must ship in the same change as the tenancy fix.** Today they are unreachable only because everyone is locked out.

### 1.3 What is actually fine — do not rebuild

- **The code is wired.** No mocks, no TODO stubs. Every page → real hook → real API route → real service → real table.
- **`leave_types` (75 rows) is the single canonical catalog.** `hr_leave_types` is a **VIEW** over `leave_types WHERE scope='staff'`, left by the 2026-04-15 unification whose cleanup PR never landed. Both `hr_leave_applications.leave_type_id` and `hr_leave_balances.leave_type_id` FK to `leave_types`. *There is no second catalog and no FK mismatch — an early hypothesis to that effect was refuted.*
- **Short time off already exists (PARTIAL).** 11 leave types named "Permission (Hourly)" (one per institution), `duration_type='hourly'`, apply form handles hourly with start/end times (`apply/page.tsx:61-63, 112-113`), balance math counts it as 0.125 day (`leave-service.ts:211`). A full policy schema is authored (`permission_short_time_off`: 2/month, 2hr max, HOD approval). **Missing: a first-class surface and any enforcement of those rules.**
- **Config data is present:** 2,358 balances across 393 staff, 66 staff leave types, 33 entitlements, 14 saved policy rows.
- **The policy pages under `/hr/admin/policies/leave/*` are the only working part** — editable config surfaces writing to `platform_policies`, 2 saved rows each.

### 1.4 Data readiness (staff leave)

| Requirement | Have | Missing |
|---|---|---|
| Active staff | 740 | — |
| `hr_staff_details` (supplies `hr_organization_id`) | 543 | 197 |
| Leave balances | 393 | 347 |
| **Fully ready to apply** | **296 (40%)** | 444 |
| `hr_staff_details.reports_to_staff_id` | **0 of 543** | all |
| `departments.head_of_department_id` | **0 of 79** | all |

**Manager-based approval routing is not implementable** — the columns exist, the data does not. Decision taken: permission-based approval scoped to institution now, manager routing later.

### 1.5 Smaller confirmed defects

- **Comments are 100% broken.** `addComment` inserts `{application_id, author_id, body}`; the table has `commenter_id`, `comment`, and a NOT NULL `hr_organization_id` that is never supplied. Reads are equally broken — `[id]/page.tsx:123,125` reads `c.body`/`c.author_id`, both undefined. `leave-service.ts:446`
- **`/hr/memos/my` is dead.** Queries `staff.auth_user_id`; `staff` has `profile_id` and **no** `auth_user_id`. 42703, error discarded. Verified against live schema.
- **Balance check silently skipped.** `.eq('academic_year_id', payload.academic_year_id ?? '')` — `''` as uuid → 22P02 — with `error` never destructured. Over-draw check is skipped entirely. Same pattern on the blackout query at `:162`. `leave-service.ts:215-221`
- **`leaveType.name` doesn't exist** on `leave_types` (it's `leave_type_name`; `name` exists only on the view). Error message reads "you have 3.0 undefined available". `leave-service.ts:227`
- **`buildApprovalChain` queries the wrong table.** Selects `leave_type_id, scope_level, chain_order, approver_role, approver_scope` from `hr_approval_flows` — **zero of those five columns exist there** (they exist on `leave_approval_chains`). And all 26 `hr_approval_flows` rows are `flow_for='recruitment_approval'`; **zero leave flows exist**. `leave-service.ts:108-115`
- **`hr.leave.*` keys are inert.** Zero `hr_leave_*` policies call `user_has_permission`; no `PermissionGuard` under `app/(routes)/hr/leave/`. The comment at `permissions.ts:685` claiming these are "RLS keys referenced in hr_leave_* policies" is false. Policies hardcode role strings (`hr_officer`, `hr_director`) — values that appear in **zero** `user_hr_access` rows, so even the single provisioned user fails them.
- **Empty masters break day-count math.** `hr_public_holidays` and `hr_work_schedules` both have **0 rows and zero code references**, so `leave_types.skip_holidays` computes against nothing — **every holiday silently counts as a leave day**.
- **No staff attendance viewing surface exists.** Only "file a correction" and "approve corrections". Biometric ingestion was spec'd in detail and explicitly deferred (`specs/myjkkn-hr-sprint-04-plan.md:8`); `hr_attendance_records` has exactly one writer in the whole app.

---

## 2. Logged, deliberately NOT actioned

| # | Finding | Why deferred |
|---|---|---|
| L1 | **26 `cmd = ALL` RLS policies** gated only on tenancy — `hr_pay_scales`, `hr_allowances`, `hr_designations`, `hr_cadres`, `hr_staff_details`, `hr_incentive_schemes`, `hr_termination_rules`, `hr_approval_flows`, **and `user_hr_access` itself**. Dormant only because `user_hr_access` is empty. **Anyone who "helpfully" backfills that table grants every employee write access to their institution's pay scales — and the ability to self-grant access to any org.** | Phase 0b routes around it. Separate security pass. **This is a tripwire — document it loudly.** |
| L2 | 7 learner applications have no approval flow configured for their institution/department/category | Config decision for the academic team |
| L3 | Live `flow_steps` pin **no** approver IDs — only `{step_order, is_optional, approver_role}` — so resolution picks *an* eligible HOD by earliest `created_at`, not *the* designated one | Needs someone who knows the org chart |
| L4 | One resolved approver is `"Hodcse"` — reads as a generic/shared account, not a person | Audit of approver profiles |
| L5 | `/hr/recruitment/my` over-fetches (no owner filter, filters client-side; in-file TODO) ⚠️ reported, not personally verified | Low severity |
| L6 | `/hr/forms/inbox` has no ownership filter; approval-chain matching unimplemented ⚠️ reported, not personally verified | Low severity |
| L7 | `get_applicable_approval_flow` has **two overloads** (5-arg, 7-arg). Approve-time and (now) apply-time both call the 5-arg. Calling the 7-arg anywhere would desync them | Documented in code |

---

## 3. COMPLETED this session — student leave (verified)

Fixed first by explicit decision: these affected live student data, while staff leave has zero users.

| Metric | Before | After |
|---|---|---|
| Applications visible to faculty at an unrelated institution | 60 (all) | **0** |
| Applications stuck with no approver | 54 | **7** |
| Approver rows | 4 | **99** |
| Applications with a working chain | 3 | **50** |

**Artifacts:**
- `supabase/migrations/20260801002200_fix_leave_onduty_cross_tenant_read_leak.sql` — the `approvers_view_assigned` SELECT policy had a branch that never referenced the row (no institution predicate), so 679 role-holders could read all 60 learner applications group-wide. Now delegates to the already-correct `can_see_leave_onduty_application()`.
- `supabase/migrations/20260801002300_backfill_stuck_leave_onduty_approvals.sql` — idempotent (`NOT EXISTS` guard); seeded 95 approver rows across 47 applications.
- `lib/services/academic/leave-onduty-service.ts:722` — apply-time now calls the same RPC as approve-time. The old inline query filtered `.eq('category', …)` which could never match the 155 flows stored as `category='all'`, and `.eq('sub_category', null)` emits `eq.null` which never matches SQL NULL.

**End-to-end verification:** impersonated a real faculty approver — 29-item pending queue, reads 31 applications (own institution only). Queue works *and* tenant boundary holds.

---

## 4. Approved decisions

| Decision | Choice |
|---|---|
| Approval routing | **Permission-based, institution-scoped now**; manager routing later once the org chart is populated |
| Self-service grant scope | **All 61 roles holding `staff.view`** |
| Tenancy fix approach | **Retrofit RLS onto `user_has_permission('hr.leave.*')` + institution scope** — NOT backfilling `user_hr_access` (needs role strings the policies don't recognise; `LIMIT 1` can't express multi-org; would activate L1) |
| Student defects | **Fixed first** — done, §3 |
| `cmd = ALL` policies | **Log only** (L1) |
| Menu structure | **Separate top-level `'Employee Self Service'` groupLabel, accepting trailing sidebar placement** (no `MODULES` entry possible — `MODULES` is keyed by top-level URL slug and this group is assembled from `/hr/*` sub-routes) |
| Layout-guard fix | **Per-page `MENU_PERMISSIONS` entries + catalog keys + grants** — not broadening `hr.view`, not a role bypass |
| Key naming | Follow the dominant **`.view_own`** precedent (~14 existing keys). The codebase already has six competing conventions; do not add a seventh |

---

## 5. Implementation phases

### Phase 0a — identity
Repoint `getCurrentEmployee()` (`regularization-service.ts:148`, `:315`) from `hr_employees` to `staff`, keyed `staff.profile_id = auth.uid()`. Resolve `hr_organization_id` via `hr_organizations.institution_id` (verified 1:1 — 14 orgs ↔ 14 institutions, all 740 staff resolvable) rather than `hr_staff_details`, whose own RLS is gated on the broken `auth_hr_organization_id()`.
**Unblocks leave apply AND attendance regularize simultaneously.**

### Phase 0b — tenancy (RLS retrofit)
Rewrite RLS on `hr_leave_applications`, `hr_leave_balances`, `hr_leave_blackouts`, `hr_leave_encashments`, `hr_leave_application_comments`, `hr_leave_type_entitlements` to gate on `user_has_permission('hr.leave.*')` + institution scope + self-scope, replacing `auth_hr_organization_id()` and the hardcoded `hr_officer`/`hr_director` strings.

### Phase 0c — security (MUST ship with 0b)
1. Approver-identity check in `approveApplication`/`rejectApplication`.
2. Narrow `hla_update` — applicants may withdraw, not transition status.
3. Implement `pending_approver_id` in `listApplications`; switch `/hr/leave/approve` to `useApprovalInbox`.
4. Fix balance IDOR — derive `employee_id` from the session, never the query string.

### Phase 1 — grants
Migration granting self-service keys to the 61 `staff.view` roles. Pattern: `20260801002100_hr_employees_view_align_with_staff_view.sql`. **Test the VALUE (`(permissions->>k)::boolean IS TRUE`), not key presence** — 63 roles carry these keys set to `false`.

### Phase 2 — approval flows
Fix `buildApprovalChain` (wrong table, wrong columns) and seed leave flows with **pinned `approver_ids`** — do not repeat L3's role-lookup fragility.

### Phase 3 — small defects
Comments column drift; `?? ''` balance check + swallowed errors; `leaveType.name`; `/hr/memos/my` `auth_user_id → profile_id`.

### Phase 4 — navigation
New `'Employee Self Service'` groupLabel. Per the checklist:

| # | File | Gate |
|---|---|---|
| 1 | `lib/sidebarMenuLink.ts` — new group in `GetPages` | `check:sidebar` (blocking at ≥15 items/group) |
| 2 | `lib/sidebarMenuLink.ts` — `MENU_PERMISSIONS` entry per href (**missing ⇒ default-DENY**) | `check:menu-coverage` |
| 3 | `lib/constants/permissions.ts` — catalog every new key | `check:permissions` |
| 4 | Migration granting the keys | ⚠️ **no gate** — verify by SQL |
| 5 | `lib/navigation/modules.ts` | N/A — group trails by decision |
| 6 | `components/BottomNav/bottom-nav-more-menu.tsx` — `GROUP_TILE_GRADIENTS` keyed by exact groupLabel | ⚠️ **no gate** — missing ⇒ undefined tile |
| 7 | `lib/navigation/derive-page-info.ts` — `MODULE_PREFIX_MAP` | ⚠️ **no gate** — only if new top-level prefix |
| 8 | `lib/permissions-audit/module-mappings.ts` | `check:audit-coverage` |
| 9 | `app/(routes)/hr/nav-config.ts` — regroup chips | `check:reachability --max-unreachable 58` |
| 10 | `lib/navigation/route-manifest.generated.ts` | `gen:routes` |

Proposed contents: Apply for Leave · My Applications · Leave Balance · Short Time Off · My Attendance/Regularize · My Shifts · My Assets · My Memos · My Appraisal · My Training/FDP · My Documents.
Admin leave surfaces (policies, encashment config, blackouts) → Admin. Approver surfaces (`/hr/leave/approve`, regularize approvals, shift approvals) → their own row.

### Phase 5 — verification
`check:sidebar`, `check:reachability`, `check:audit-coverage`, `check:menus`; SQL verification of grants; **browser test logged in as a plain `faculty` role — never as super-admin.**

> Note: `check:menus` currently fails on a pre-existing, unrelated issue — `/system` has no `MENU_PERMISSIONS` entry. Confirmed failing at HEAD. Do not treat as a regression.

---

## 6. Standing traps

1. **Test permission VALUE, not key presence.** `permissions ? 'key'` overstates grants ~10x here — 63 roles carry `hr.leave.apply` set to `false`.
2. **Never backfill `user_hr_access`** without first fixing L1's 26 `cmd = ALL` policies.
3. **Never ship 0b without 0c.** The tenancy gate is currently the only thing preventing self-approval and the balance IDOR.
4. **Sidebar visibility ≠ page reachability.** The layout guard is a second, independent enforcement point (blocker 4).
5. **Steps 4, 5, 6 and 7 of the nav checklist have no build gate.** Verify by SQL and in a browser.
6. **`hr_leave_types` is a view, not a table.** Do not "reconcile the two catalogs" — there is one.

# Sprint 2 — Policy Management (RETROSPECTIVE)

**Status:** Shipped 2026-04-14 via PR #167 (merged). **This spec was captured post-ship on 2026-04-24 from the actual PR diff + production schema; it is not a pre-implementation design document.**
**Parent Spec:** `specs/myjkkn-hr-module-spec-v4-evidence.md` §6.1 (Policy-as-Data)
**Precedes:** Sprint 3 `specs/myjkkn-hr-sprint-03-plan.md`, Sprint 6 `specs/myjkkn-hr-sprint-06-plan.md`
**Builds on:** Sprint 1 `hr_staff_details` + `hr_organizations` (PRs #163, #165)

---

## Why this retrospective exists

Sprint 1 shipped with a committed plan (`myjkkn-hr-sprint-01-plan.md`). Sprint 3 shipped with a committed plan (`myjkkn-hr-sprint-03-plan.md`). Sprint 2 shipped without one — the design lived in the PR body of #167 and the working implementation, but was never extracted to a discoverable spec file. This document reverse-engineers the design so that:

- Future sprints can reference `specs/myjkkn-hr-sprint-02-plan.md` the way Sprint 3 already does ("Sprint 2 delivered the rules, Sprint 3 delivers the transactions")
- Anyone reading `specs/myjkkn-hr-README.md` sees a complete sprint chain
- The Policy-as-Data architectural pattern is captured outside the PR UI

---

## What Sprint 2 delivered

**One generic PolicyEditor component drives all 19 HR configuration routes.** Adding the next config table = one entry in `features/hr/policies/registry.ts`. No per-table CRUD code.

Compliance-grade: edits create new versions (`valid_from` / `valid_until` / `superseded_by`) instead of mutating in place. Full audit trail via 3 SECURITY DEFINER RPCs.

---

## Schema — 19 policy tables

All shipped via 4 migrations applied to production before PR #167 merged. Columns verified on prod `kvizhngldtiuufknvehv` on 2026-04-24.

| Category | Table | Columns (prod) |
|----------|-------|:--------------:|
| Leave & Approval | `hr_leave_types` | 25 |
| Leave & Approval | `hr_leave_policies` | 18 |
| Leave & Approval | `hr_approval_flows` | 15 |
| Compensation | `hr_pay_scales` | 17 |
| Compensation | `hr_allowances` | 17 |
| Compensation | `hr_incentive_schemes` | 15 |
| Schedule & Holidays | `hr_work_schedules` | 18 |
| Schedule & Holidays | `hr_public_holidays` | 13 |
| Onboarding | `hr_onboarding_checklists` | 13 |
| Onboarding | `hr_required_documents` | 15 |
| Discipline & Compliance | `hr_memo_rules` | 14 |
| Discipline & Compliance | `hr_termination_rules` | 14 |
| Discipline & Compliance | `hr_disciplinary_penalties` | 15 |
| Discipline & Compliance | `hr_conduct_rules` | 14 |
| Development | `hr_promotion_criteria` | 15 |
| Development | `hr_training_programs` | 16 |
| Development | `hr_role_descriptions` | 13 |
| Engagement & Feedback | `hr_welfare_events` | 15 |
| Engagement & Feedback | `hr_feedback_dimensions` | 16 |

**Total: 19 tables, ~280 columns, 7 logical categories.**

### Versioning columns (every table)

Every policy table carries:

```
valid_from      timestamptz NOT NULL DEFAULT now()
valid_until     timestamptz           -- NULL = current version
superseded_by   uuid                  -- FK to the row that replaced this one
is_active       boolean NOT NULL DEFAULT true
created_by      uuid  REFERENCES profiles(id)
updated_by      uuid  REFERENCES profiles(id)
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()
hr_organization_id uuid NOT NULL REFERENCES hr_organizations(id)
```

### Versioning pattern (SUPERSEDE, not UPDATE)

PATCH on a policy row does NOT mutate it. It:

1. Marks the existing row `valid_until = NOW()`, `superseded_by = NEW.id`
2. Inserts a new row with `valid_from = NOW()`, `valid_until = NULL`
3. Audit chain queryable via `hr_policy_history` RPC

**Why:** Compliance-grade. When JKKN changes CL from 12 → 14 days mid-year, employees who took 13 days under the OLD policy must be calculated by the OLD rule. Versioning is statutory-required for TDS slabs, PF rates, and leave encashment.

### 3 SECURITY DEFINER RPCs

All allowlisted to `hr_*` tables only:

- `hr_policy_history(table_name, row_id)` — returns full version chain
- `hr_policy_diff(from_id, to_id)` — column-level diff between two versions
- `hr_policy_restore(table_name, row_id)` — marks target row as new current; current row becomes superseded

---

## Application surface

### Generic shell — one component, 19 routes

| File | Purpose |
|------|---------|
| `features/hr/policies/registry.ts` | Single source of truth: 19 table defs, ~140 fields with type metadata (enum, number, date, text, boolean, jsonb) |
| `features/hr/policies/components/policy-editor.tsx` | Universal CRUD shell (~450 lines). Renders form from registry; handles create/supersede/history/diff/restore |

### Service + hooks

| File | Purpose |
|------|---------|
| `lib/services/hr/policy-service.ts` | `list` / `get` / `create` / `supersede` / `deactivate` / `history` / `diff` / `restore` |
| `hooks/hr/use-policies.ts` | React Query hooks: `usePolicyList`, `usePolicyRow`, `usePolicyHistory`, `useSupersedePolicy`, `useRestorePolicy` |

### API routes (all under `app/api/hr/policies/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/hr/policies/[table]` | GET, POST | List current versions; create new row |
| `/api/hr/policies/[table]/[id]` | GET, PATCH, DELETE | Fetch single; supersede; deactivate |
| `/api/hr/policies/[table]/history` | GET, POST | Full chain + diff (GET); restore (POST) |

Response envelope: `{ data, metadata }` (same pattern used by Sprint 3).

### Page routes

| Route | Purpose |
|-------|---------|
| `/hr/policies` | Hub showing 19 cards in 7 category groups |
| `/hr/policies/[table]` | Universal page → renders `<PolicyEditor tableName={...} />` |

### Sidebar entry

One line added to `lib/sidebarMenuLink.ts` under the HR Sprint-1 group: **Policies** → `/hr/policies`.

---

## Permission keys registered

Registered in `lib/constants/permissions.ts`:

| Key | Grants |
|-----|--------|
| `hr.policies.view` | Read policies (all 19 tables) |
| `hr.policies.create` | Create new policy rows |
| `hr.policies.edit` | Supersede existing rows (edit) |
| `hr.policies.history.view` | View version history + diff |

**Note:** Scoping is by `hr_organization_id` via `auth_hr_organization_id()` RLS — HR Officer sees own organisation, Super Admin sees all 11.

---

## File inventory (from PR #167)

| Path | LOC |
|------|-----|
| `features/hr/policies/registry.ts` | 355 |
| `features/hr/policies/components/policy-editor.tsx` | 451 |
| `lib/services/hr/policy-service.ts` | 186 |
| `hooks/hr/use-policies.ts` | 131 |
| `app/api/hr/policies/[table]/route.ts` | 80 |
| `app/api/hr/policies/[table]/[id]/route.ts` | 91 |
| `app/api/hr/policies/[table]/history/route.ts` | 88 |
| `app/(routes)/hr/policies/page.tsx` | 74 |
| `app/(routes)/hr/policies/[table]/page.tsx` | 27 |
| `lib/sidebarMenuLink.ts` | +7 |

**Total: ~1,490 LOC for 19 fully-functional CRUD interfaces with versioning** — <80 lines per table — because everything is generic.

---

## Post-ship verification (all passed on merge day, 2026-04-14)

```bash
curl -I https://www.jkkn.ai/hr/policies                     # 307 unauth
curl -I https://www.jkkn.ai/hr/policies/hr_leave_types      # 307 unauth
curl -I https://www.jkkn.ai/api/hr/policies/hr_leave_types  # 401 unauth

# Browser test via persistent jkkn-ai session
# - hub showed 19 cards in 7 category groups
# - clicking a card rendered universal PolicyEditor with empty list
# - Create → row appeared with "Current" badge
# - Edit → form pre-filled; save created v2; old marked Superseded
# - History showed both with Diff button; Restore confirmed
```

---

## Why this pattern (architectural retrospective)

| Conventional approach | Policy-as-Data approach (Sprint 2) |
|-----------------------|------------------------------------|
| 19 × (form + service + hook + 3 routes + page) | 1 × generic shell + 19 registry entries |
| ~5,000 LOC | ~1,500 LOC |
| Each table gets independent migration + code | Adding table #20 = 1 registry entry |
| Audit trail built per-table | Audit trail centralised in 3 RPCs |
| Mutation semantics per-developer | Supersede-only contract enforced by service |

This is the pattern the /myjkkn-leverage skill now recommends for any "many small editable rule tables" problem space.

---

## Gaps this retrospective does NOT claim to capture

Because this doc was written 10 days after merge from artifacts, it cannot recover:

1. The live design discussions / interview rounds that preceded the build
2. Why some columns exist with certain constraints vs others
3. Which of the 19 tables were add-ons vs originally scoped
4. The names of test data rows seeded during development

For those, see the PR #167 conversation thread + the v4 parent spec §6.1.

---

## Sprint 2 links

- **PR:** https://github.com/Jicate-Solutions/MyJKKN/pull/167 (merged 2026-04-14)
- **Related PRs:** Sprint 1 (#163, #165), Sprint 3 (#168), Sprint 6 (shipped separately)
- **Parent:** `specs/myjkkn-hr-module-spec-v4-evidence.md` §6.1
- **Customer evidence:** `specs/hrapp-issues-capture.md` — "policy changes mid-year break payroll" recurs 47+ times in corpus

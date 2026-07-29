# HR Head — Full HR Access + Recruitment Approval Override

**Date:** 2026-07-16
**Author:** Boobalan (with Claude)
**Status:** Approved design — ready for implementation plan

## Goal

Two related outcomes for the existing `hr_head` role (`custom_roles.role_key = 'hr_head'`, `institution_scope = 'all'`, currently **0 holders**):

1. **Full HR management module access** — grant `hr_head` every HR permission `hr_admin` holds, so HR Head is a functional peer of HR Administrator across the whole `/hr` module.
2. **Recruitment approval override** — let HR Head (and HR Admin, COO) action *any* step of a candidate's step-by-step recruitment approval chain — even a step pinned to another user or scoped to a different role — while adding a mandatory comment, and while preserving a full audit trail of who the step was *supposed* to go to.

## Background (verified against current code + DB, 2026-07-16)

### The recruitment approval engine
- Candidates (`hr_recruitment_candidates`) carry a **frozen `approval_chain` JSONB snapshot** built at submit-time from `hr_approval_flows` via `RecruitmentService.buildApprovalChain` (`lib/services/hr/recruitment-service.ts:201`). Editing a flow later does not disturb in-flight candidates.
- Each chain step has: `step_order`, `approver_role`, `approver_user_id` (nullable — pinned person), `status`, `step_type` (`review` | `final`), `interview_required`, `interview_id`.
- `RecruitmentService.approveCandidate` (`recruitment-service.ts:346`) enforces, in order:
  1. **Step-approver gate** (lines 364–398, ALWAYS ON): pinned user → only them; role step → holders of `approver_role`; **super-admin → always allowed** (`supabase.rpc('is_super_admin')`, line 386). This `is_super_admin` call is the **only** bypass that exists today.
  2. Status must be `pending_approval` | `submitted`.
  3. Interview gate: an `interview_required` step needs its linked sitting `status = 'completed'`.
  - On success it stamps the step (`status='approved'`, `decided_by`, `decided_at`, `comment`) and advances `current_step` by one; last step sets candidate `status='approved'`.

### What actually blocks HR Head today — three layers, only one is a real gate
1. **Sidebar visibility (blocks everything):** `/hr` is gated on `hr.view` (`lib/sidebarMenuLink.ts:765`). `hr.view` is a **reserved key** — it is *not* in `lib/constants/permissions.ts` and is **absent from `hr_head`'s JSONB entirely** (value `null`, not `false`). Only `hr_admin` holds it. Result: HR Head cannot see the HR menu at all.
2. **RLS (already passes):** `hr_recruitment_candidates_update_permission` requires `hr.recruitment.edit AND role_has_institution_access(institution_id)`. `hr_head` already holds `hr.recruitment.edit` and is `institution_scope='all'`, so the DB accepts the write. **No RLS change needed.**
3. **Service-layer step gate (the override target):** `approveCandidate`'s step check throws for a non-pinned, non-role, non-super-admin caller. This is where the override plugs in.

### Permission gap (verified): `hr_head` vs `hr_admin`
- `hr_admin` grants **58** `hr.*` keys (all `true`).
- `hr_head` grants **16** of those; of the rest, **31 are present-but-`false`** and **11 are missing from the JSONB entirely** (`hr.view` + all 10 `hr.attendance.*`).

### Cross-org tenancy (already correct)
`fn_is_hr_admin()` already lists `hr_head`, so HR config tables (`hr_approval_flows`, `hr_organizations`) are already cross-org visible to HR Head. No tenancy change required.

## Decisions (locked with user)

| Question | Decision |
|---|---|
| Which "requirement module"? | **HR Recruitment** (`/hr/recruitment/*`) |
| Override behaviour | **Step-by-step**, chain advances one step at a time, **audit preserved** (no force-approve-all) |
| HR access scope | **Mirror `hr_admin` exactly** — all 58 `hr.*` keys |
| `rejectCandidate` has no step gate today | **Leave as-is; report only** (out of scope) |
| Who holds the override key | **`hr_head`, `hr_admin`, `coo`** (super_admin keeps its implicit bypass) |
| Role has 0 holders | **Grant permissions only**; user assigns HR Head to a person manually via Role Management |

## Design

### Part 1 — New permission key
Add to `lib/constants/permissions.ts` in the `HR Management` block:
- `hr.recruitment.approve.override` — *"Override recruitment approval step (act as any approver)"*
- `hr.view` — *"Access HR Module"* (declare the reserved key so Role Management can toggle it; mirrors the existing `staff.view` / `learners.view` precedent). Declaring it changes no runtime behaviour on its own — the grant migration does that.

### Part 2 — Grant migration (`supabase/migrations/`)
One migration, `jsonb || jsonb_build_object(...)` pattern:
- **`hr_head`**: merge all **58** `hr.*` keys `hr_admin` holds (list frozen in this spec), each `= true`. This flips the 31 present-but-false keys and adds the 11 missing ones — including `hr.view`.
- **Override key** `hr.recruitment.approve.override = true` merged onto **`hr_head`, `hr_admin`, `coo`**.
- End with `NOTIFY pgrst, 'reload schema';`.
- Idempotent: `||` overwrites existing keys, safe to re-run.
- Also mirror into `supabase/setup/03_policies.sql`? — No policy change here; this is data-only (`custom_roles.permissions`), so the setup reference files (`01`–`05`) are unaffected. The migration body itself is the record.

### Part 3 — Service change: `approveCandidate` (`recruitment-service.ts`)
Extend the authorization ladder in the step-approver block (lines 364–398):

```
authorized      = pinnedUser === approver
             OR   (unpinned step AND approver holds approver_role)
isSuperAdmin    = rpc('is_super_admin')
hasOverride     = rpc('user_has_permission', { permission_name: 'hr.recruitment.approve.override' })
isOverride      = !authorized AND (isSuperAdmin OR hasOverride)
finalAuthorized = authorized OR isOverride
```
- If not `finalAuthorized` → throw (unchanged messages).
- **Audit fix:** the stamping block (lines 440–444) currently sets `step.approver_user_id = approverId` *unconditionally*, silently erasing who a pinned step belonged to. Change so that on override it records the override instead of clobbering:
  - normal path: `step.approver_user_id = approverId` (unchanged)
  - override path: keep `intended_approver_user_id` / `intended_approver_role` (the original pinned user / role), set `overridden = true`, `overridden_by = approverId`, `overridden_at = now`. `decided_by`/`decided_at`/`comment` are stamped as usual, so "who really decided" is always truthful.
- Chain still advances exactly one step. No auto-approval of later steps.
- **Comment is mandatory on override**: if `isOverride` and no `comment`, throw a clear error before stamping.

`LeaveApprovalStep` type gains optional fields: `overridden?`, `overridden_by?`, `overridden_at?`, `intended_approver_user_id?`, `intended_approver_role?` (all optional → no migration of existing frozen chains).

### Part 4 — UI (`workspace-candidates-tab.tsx`)
The Approve button already renders for anyone who can open the job workspace (`decisionBlocked` only checks chain-configured + interview-completed; `awaitingMe` drives a *badge*, not the button). Minimal additions:
- When the current step is **not** the viewer's own (not pinned to them, not their role) but they hold override/super-admin, label the action **"Override approval"** and show a short "you are acting on <role>'s step" note in the dialog.
- Make the comment field **required** in the override case (it is optional today), matching the "update the comments and give approval" requirement.
- Render an "Overridden by HR Head" marker on any step whose `overridden === true` in the chain strip.

No change to `fn_list_my_pending_recruitment` — "Awaiting my action" stays role/pin-scoped; override is an *action*, not an inbox change (HR Head reaches candidates via the job workspace / All-pending view they can already see through `hr.recruitment.view`).

## Out of scope (reported, not changed)
- **`rejectCandidate` has no step-approver enforcement** (`recruitment-service.ts:471`) — anyone with `hr.recruitment.approve` can reject any step today. Pre-existing hole; left untouched per decision. Flagged for a separate follow-up.
- Assigning a user to `hr_head` (0 holders) — user will do this via Role Management.

## Verification plan (no test suite in this repo)
1. `mcp__ide__getDiagnostics` on every touched `.ts`/`.tsx` file.
2. `npm run check:menus` (permission catalog + audit coverage) after adding the two keys.
3. DB check: re-run the `hr_head` vs `hr_admin` gap query → expect 0 gaps + override key present on the three roles.
4. Browser exercise as an `hr_head` holder (user assigns a test user): confirm `/hr` menu is visible, and that HR Head can approve a step pinned to another user with a comment, that the candidate advances exactly one step, and that the step records both `decided_by = HR Head` and `intended_approver_user_id = original`.

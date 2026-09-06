# HR Head — Full HR Access + Recruitment Approval Override — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the `hr_head` role full HR-module access (peer of `hr_admin`) and let HR Head / HR Admin / COO override any step of a recruitment candidate's approval chain — acting as any approver, one step at a time, with a mandatory comment and a preserved audit trail.

**Architecture:** Three layers move together. (1) A **grant migration** flips `custom_roles.permissions` JSONB so `hr_head` holds all 58 `hr.*` keys `hr_admin` has, and grants a new `hr.recruitment.approve.override` key to `hr_head`/`hr_admin`/`coo`. (2) The **service** `RecruitmentService.approveCandidate` gains an override branch in its existing step-approver gate, and stops clobbering the original approver on the chain step. (3) The **UI** relabels the approve dialog as "Override Approval" and forces a comment when the actor is acting on someone else's step. RLS already permits the write (`hr.recruitment.edit` + `institution_scope='all'`), so no policy change is needed.

**Tech Stack:** Next.js 16 App Router, TypeScript (strict OFF), Supabase Postgres + RLS, React Query v5, Shadcn UI. Permission checks: server via `user_has_permission()` RPC, client via `usePermissions()`.

## Global Constraints

- **No test runner exists in this repo.** "Done" = touched files pass `mcp__ide__getDiagnostics`, the relevant `check:*` gates pass, and the feature is exercised in the browser. Never claim "tests pass". (CLAUDE.md)
- **TypeScript strict is OFF; the build does not typecheck.** Verify types per-file with `mcp__ide__getDiagnostics`, not full `tsc`. (CLAUDE.md)
- **Never hardcode role names in the service/SQL gate** — the override is gated on the permission key `hr.recruitment.approve.override`, not on `role_key`. (CLAUDE.md RBAC)
- **Supabase mutations must destructure and check `{ error }`** — never fire-and-forget. Errors are plain objects, not `Error` instances. (CLAUDE.md)
- **Migration must ship the real SQL body** to `supabase/migrations/` and end with `NOTIFY pgrst, 'reload schema';`. Grant pattern: `permissions || jsonb_build_object(...)`. (CLAUDE.md + memory)
- **New permission keys go in `lib/constants/permissions.ts`** AND must be granted via the migration, or they do nothing. (CLAUDE.md)
- Exact override key string, used identically in all three layers: **`hr.recruitment.approve.override`**
- Roles receiving the override key: **`hr_head`, `hr_admin`, `coo`** (super_admin bypasses implicitly via `user_has_permission`).

---

### Task 1: Declare the two permission keys in the catalog

**Files:**
- Modify: `lib/constants/permissions.ts` (HR Management block, around lines 658–668)

**Interfaces:**
- Produces: catalog entries for `hr.view` and `hr.recruitment.approve.override` (consumed by Role Management UI and the audit-coverage gate).

- [ ] **Step 1: Add the two keys**

In `lib/constants/permissions.ts`, the HR block currently opens like this (lines 658–668):

```ts
    permissions: [
      // Recruitment (Phase 1A+1B shipped 2026-04-15) —
      // RLS keys referenced in supabase/setup/03_policies.sql for hr_recruitment_*
      { key: 'hr.recruitment.view', label: 'View Recruitment Candidates' },
      { key: 'hr.recruitment.create', label: 'Submit Recruitment Candidates' },
      { key: 'hr.recruitment.edit', label: 'Edit Recruitment Candidates' },
      { key: 'hr.recruitment.delete', label: 'Delete Recruitment Candidates' },
      { key: 'hr.recruitment.approve', label: 'Approve Recruitment Candidates' },
      { key: 'hr.recruitment.packages.view', label: 'View Candidate CTC Packages' },
      { key: 'hr.recruitment.packages.propose', label: 'Propose Candidate CTC Packages' },
      { key: 'hr.recruitment.packages.approve', label: 'Approve Candidate CTC Packages' },
```

Change it to add the module-gate key at the top and the override key right after `hr.recruitment.approve`:

```ts
    permissions: [
      // Module gate — value behind '/hr' in lib/sidebarMenuLink.ts. Declared
      // here (2026-07-16) so Role Management can toggle it; previously a
      // reserved key only hr_admin held.
      { key: 'hr.view', label: 'Access HR Module' },
      // Recruitment (Phase 1A+1B shipped 2026-04-15) —
      // RLS keys referenced in supabase/setup/03_policies.sql for hr_recruitment_*
      { key: 'hr.recruitment.view', label: 'View Recruitment Candidates' },
      { key: 'hr.recruitment.create', label: 'Submit Recruitment Candidates' },
      { key: 'hr.recruitment.edit', label: 'Edit Recruitment Candidates' },
      { key: 'hr.recruitment.delete', label: 'Delete Recruitment Candidates' },
      { key: 'hr.recruitment.approve', label: 'Approve Recruitment Candidates' },
      // Override: act as any approver on a candidate's approval chain step
      // (hr_head / hr_admin / coo). Enforced in RecruitmentService.approveCandidate.
      { key: 'hr.recruitment.approve.override', label: 'Override Recruitment Approval Step' },
      { key: 'hr.recruitment.packages.view', label: 'View Candidate CTC Packages' },
      { key: 'hr.recruitment.packages.propose', label: 'Propose Candidate CTC Packages' },
      { key: 'hr.recruitment.packages.approve', label: 'Approve Candidate CTC Packages' },
```

- [ ] **Step 2: Verify types + uniqueness**

Run: `mcp__ide__getDiagnostics` on `lib/constants/permissions.ts`
Expected: no new errors.

Then confirm no duplicate keys (the catalog requires unique keys — see memory `feedback_permission_categories_keys_must_be_unique`):

Run: `cd "D:/Projects/MyJKKN" && grep -c "hr.recruitment.approve.override\|'hr.view'" lib/constants/permissions.ts`
Expected: `2` (one occurrence of each new key).

- [ ] **Step 3: Run the audit-coverage gate**

Run: `cd "D:/Projects/MyJKKN" && npx tsx scripts/check-permission-audit-coverage.ts`
Expected: exits 0 (adding keys to the existing `hr` category/module does not change module→category mapping).

- [ ] **Step 4: Commit**

```bash
cd "D:/Projects/MyJKKN"
git add lib/constants/permissions.ts
git commit -m "feat(hr): declare hr.view + hr.recruitment.approve.override permission keys"
```

---

### Task 2: Extend `LeaveApprovalStep` with override-audit fields

**Files:**
- Modify: `types/hr.ts:214-231` (the `LeaveApprovalStep` interface)

**Interfaces:**
- Produces: optional fields `overridden`, `overridden_by`, `overridden_at`, `intended_approver_user_id`, `intended_approver_role` on `LeaveApprovalStep`. Consumed by Task 3 (service stamping) and Task 5 (UI). All optional → existing frozen chains and leave chains are unaffected.

- [ ] **Step 1: Add the fields**

In `types/hr.ts`, the interface currently ends like this (lines 229–231):

```ts
  /** hr_recruitment_interviews.id linked to this step (re-pointed on reschedule). */
  interview_id?: string | null;
}
```

Change it to:

```ts
  /** hr_recruitment_interviews.id linked to this step (re-pointed on reschedule). */
  interview_id?: string | null;
  // ----- Override audit (2026-07-16) --------------------------------------
  // Set when a step is actioned by an authorized OVERRIDE (super-admin or a
  // holder of hr.recruitment.approve.override) instead of the step's own
  // pinned user / role. Optional → legacy and leave chains untouched.
  /** True when this step was approved via override, not by its intended approver. */
  overridden?: boolean;
  /** profiles.id of the user who performed the override. */
  overridden_by?: string | null;
  /** ISO timestamp of the override. */
  overridden_at?: string | null;
  /** The pinned user this step was originally routed to (null if role-only). */
  intended_approver_user_id?: string | null;
  /** The role this step was originally routed to. */
  intended_approver_role?: string | null;
}
```

- [ ] **Step 2: Verify types**

Run: `mcp__ide__getDiagnostics` on `types/hr.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "D:/Projects/MyJKKN"
git add types/hr.ts
git commit -m "feat(hr): add override-audit fields to LeaveApprovalStep"
```

---

### Task 3: Add the override branch to `approveCandidate`

**Files:**
- Modify: `lib/services/hr/recruitment-service.ts:355-398` (auth gate) and `:440-444` (step stamping)

**Interfaces:**
- Consumes: `LeaveApprovalStep` override fields from Task 2; the `hr.recruitment.approve.override` key from Task 1 (granted in Task 4); Postgres RPCs `is_super_admin()` and `user_has_permission(permission_name text)` (both exist, `auth.uid()`-based).
- Produces: `approveCandidate` now authorizes override actors and stamps override audit instead of clobbering `approver_user_id`. Signature unchanged: `approveCandidate(supabase, id, approverId, comment?)`.

**Note on `user_has_permission`:** two overloads exist. Use the **single-arg** form `user_has_permission({ permission_name })` — it resolves against `auth.uid()`, exactly like the adjacent `is_super_admin()` call. In the approve API route `approverId === auth.uid()`, so this is consistent.

- [ ] **Step 1: Replace the auth gate (lines 355–398)**

The current block is:

```ts
    // ---------------------------------------------------------------------
    // Step-approver enforcement (dynamic flows, 2026-07-06 — ALWAYS ON).
    // The flow builder (/hr/admin/recruitment-approval-flows) is the single
    // source of truth for who acts at each step; the old platform_policies
    // toggle + /hr/admin/recruitment-approvals-scope page were removed.
    //   - step pinned to a user → only that user
    //   - role step            → holders of that role_key
    //   - super-admin          → always allowed
    // ---------------------------------------------------------------------
    {
      const chainForCheck = candidate.approval_chain ?? [];
      const stepForCheck = chainForCheck[candidate.current_step];
      if (stepForCheck?.status === 'pending') {
        const pinnedUserId = stepForCheck.approver_user_id ?? null;
        let authorized = pinnedUserId === approverId;

        if (!authorized && !pinnedUserId) {
          const expectedRole = (stepForCheck.approver_role ?? '').toLowerCase();
          const { data: roleRows } = await supabase
            .from('user_roles')
            .select('custom_roles!inner(role_key)')
            .eq('user_id', approverId);
          const userRoles = (
            (roleRows ?? []) as unknown as Array<{ custom_roles?: { role_key?: string } }>
          )
            .map((r) => r.custom_roles?.role_key?.toLowerCase())
            .filter((k): k is string => !!k);
          authorized = !!expectedRole && userRoles.includes(expectedRole);
        }

        if (!authorized) {
          const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');
          authorized = !!isSuperAdmin;
        }
        if (!authorized) {
          throw new Error(
            stepForCheck.approver_user_id
              ? 'This step is assigned to a specific approver and can only be actioned by them.'
              : `Only users with role '${stepForCheck.approver_role}' can action this step. ` +
                'Adjust the chain at /hr/admin/recruitment-approval-flows if routing is wrong.'
          );
        }
      }
    }
```

Replace it with (note `let isOverride` is hoisted to method scope so Step 2 can read it):

```ts
    // ---------------------------------------------------------------------
    // Step-approver enforcement (dynamic flows, 2026-07-06 — ALWAYS ON).
    // The flow builder (/hr/admin/recruitment-approval-flows) is the single
    // source of truth for who acts at each step; the old platform_policies
    // toggle + /hr/admin/recruitment-approvals-scope page were removed.
    //   - step pinned to a user → only that user
    //   - role step            → holders of that role_key
    //   - super-admin          → always allowed (implicit)
    //   - override key holder   → allowed as an OVERRIDE (2026-07-16):
    //     hr.recruitment.approve.override (hr_head / hr_admin / coo). Acting
    //     on another approver's step requires a comment and preserves the
    //     original routing in the chain (see stamping below).
    // ---------------------------------------------------------------------
    let isOverride = false;
    {
      const chainForCheck = candidate.approval_chain ?? [];
      const stepForCheck = chainForCheck[candidate.current_step];
      if (stepForCheck?.status === 'pending') {
        const pinnedUserId = stepForCheck.approver_user_id ?? null;
        let ownStep = pinnedUserId === approverId;

        if (!ownStep && !pinnedUserId) {
          const expectedRole = (stepForCheck.approver_role ?? '').toLowerCase();
          const { data: roleRows } = await supabase
            .from('user_roles')
            .select('custom_roles!inner(role_key)')
            .eq('user_id', approverId);
          const roleKeys = (
            (roleRows ?? []) as unknown as Array<{ custom_roles?: { role_key?: string } }>
          )
            .map((r) => r.custom_roles?.role_key?.toLowerCase())
            .filter((k): k is string => !!k);
          ownStep = !!expectedRole && roleKeys.includes(expectedRole);
        }

        let authorized = ownStep;
        if (!authorized) {
          // Override path: super-admin (implicit) OR holders of the
          // hr.recruitment.approve.override key. Both RPCs resolve against
          // auth.uid(), which equals approverId in the approve route.
          const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');
          const { data: hasOverride } = await supabase.rpc('user_has_permission', {
            permission_name: 'hr.recruitment.approve.override',
          });
          authorized = !!isSuperAdmin || !!hasOverride;
          isOverride = authorized;
        }

        if (!authorized) {
          throw new Error(
            stepForCheck.approver_user_id
              ? 'This step is assigned to a specific approver and can only be actioned by them.'
              : `Only users with role '${stepForCheck.approver_role}' can action this step. ` +
                'Adjust the chain at /hr/admin/recruitment-approval-flows if routing is wrong.'
          );
        }

        // Override must carry a reason so the audit trail explains why someone
        // acted on another approver's step.
        if (isOverride && !(comment && comment.trim())) {
          throw new Error(
            "A comment is required when overriding another approver's step. " +
            'Please explain why you are approving on their behalf.'
          );
        }
      }
    }
```

- [ ] **Step 2: Update the step stamping (lines 440–444)**

The current stamping is:

```ts
    step.status = 'approved';
    step.decided_at = new Date().toISOString();
    step.decided_by = approverId;
    step.comment = comment ?? null;
    step.approver_user_id = approverId;
```

Replace with:

```ts
    const nowIso = new Date().toISOString();
    step.status = 'approved';
    step.decided_at = nowIso;
    step.decided_by = approverId;
    step.comment = comment ?? null;
    if (isOverride) {
      // Record the override; DO NOT clobber approver_user_id — that would
      // erase who the step was originally routed to. decided_by already
      // records who really acted.
      step.overridden = true;
      step.overridden_by = approverId;
      step.overridden_at = nowIso;
      step.intended_approver_user_id = step.approver_user_id ?? null;
      step.intended_approver_role = step.approver_role ?? null;
    } else {
      step.approver_user_id = approverId;
    }
```

- [ ] **Step 3: Verify types**

Run: `mcp__ide__getDiagnostics` on `lib/services/hr/recruitment-service.ts`
Expected: no errors. (`isOverride` is in scope for the stamping block; override fields exist on `LeaveApprovalStep` from Task 2.)

- [ ] **Step 4: Commit**

```bash
cd "D:/Projects/MyJKKN"
git add lib/services/hr/recruitment-service.ts
git commit -m "feat(hr): approveCandidate override branch + preserve original approver in audit"
```

---

### Task 4: Grant migration — HR Head full access + override key

**Files:**
- Create: `supabase/migrations/20260716_hr_head_full_access_and_approval_override.sql`

**Interfaces:**
- Consumes: the two catalog keys from Task 1 (catalog is display-only; this migration is what actually grants).
- Produces: `hr_head` holds all 58 `hr.*` keys; `hr_head`/`hr_admin`/`coo` hold `hr.recruitment.approve.override`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260716_hr_head_full_access_and_approval_override.sql` with this exact body (explicit key list = deterministic; `||` overwrites so it is idempotent):

```sql
-- 20260716_hr_head_full_access_and_approval_override.sql
-- HR Head gets full HR-module access (mirror of hr_admin's hr.* grants) and a
-- new recruitment approval-override key is granted to hr_head / hr_admin / coo.
-- Data-only change to custom_roles.permissions JSONB — no schema/policy change.
-- Pattern: permissions || jsonb_build_object(...). Safe to re-run.

-- 1) HR Head — mirror every hr.* key hr_admin holds (flips 31 present-but-false
--    keys to true and adds 11 missing ones, incl. hr.view which gates '/hr').
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'hr.view', true,
  'hr.dashboard.view', true,
  'hr.dashboard.manage', true,
  'hr.attendance.approve_team', true,
  'hr.attendance.audit_export', true,
  'hr.attendance.export', true,
  'hr.attendance.mark_self', true,
  'hr.attendance.override', true,
  'hr.attendance.regularize_approve', true,
  'hr.attendance.regularize_self', true,
  'hr.attendance.status_types.write', true,
  'hr.attendance.thresholds.write', true,
  'hr.attendance.view_all', true,
  'hr.attendance.view_self', true,
  'hr.attendance.view_team', true,
  'hr.career_development.view', true,
  'hr.counseling.notes.create', true,
  'hr.counseling.notes.view_own', true,
  'hr.counseling.sessions.create', true,
  'hr.counseling.sessions.view', true,
  'hr.counseling.view', true,
  'hr.employees.create', true,
  'hr.employees.delete', true,
  'hr.employees.edit', true,
  'hr.employees.export', true,
  'hr.employees.view', true,
  'hr.grievance.escalate', true,
  'hr.grievance.view', true,
  'hr.leave.apply', true,
  'hr.leave.approve', true,
  'hr.leave.balance.dispute', true,
  'hr.leave.balance.view', true,
  'hr.leave.cancel', true,
  'hr.leave.dispute.approve', true,
  'hr.leave.encashment.approve', true,
  'hr.leave.encashment.view', true,
  'hr.leave.policies.write', true,
  'hr.leave.view', true,
  'hr.leave.withdraw', true,
  'hr.onboarding.execute', true,
  'hr.onboarding.manage', true,
  'hr.onboarding.view', true,
  'hr.policies.create', true,
  'hr.policies.edit', true,
  'hr.policies.history.view', true,
  'hr.policies.view', true,
  'hr.promotion.case.create', true,
  'hr.promotion.case.decide', true,
  'hr.promotion.case.view', true,
  'hr.promotion.criteria.write', true,
  'hr.recruitment.approve', true,
  'hr.recruitment.create', true,
  'hr.recruitment.delete', true,
  'hr.recruitment.edit', true,
  'hr.recruitment.packages.approve', true,
  'hr.recruitment.packages.propose', true,
  'hr.recruitment.packages.view', true,
  'hr.recruitment.view', true
)
WHERE role_key = 'hr_head';

-- 2) Override key — hr_head / hr_admin / coo. super_admin bypasses implicitly
--    via user_has_permission(), so it is intentionally not listed.
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object('hr.recruitment.approve.override', true)
WHERE role_key IN ('hr_head', 'hr_admin', 'coo');

-- PostgREST schema cache reload so RLS/permission reads pick up the change.
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP tool `mcp__supabase__apply_migration` with name `hr_head_full_access_and_approval_override` and the exact SQL body above. (Commit the same real SQL to the file — never a `SELECT 1;` placeholder.)

- [ ] **Step 3: Verify the grants landed (0 gaps)**

Run this via `mcp__supabase__execute_sql`:

```sql
-- Expect: hr_head_missing_or_false = 0, and override present on 3 roles.
SELECT
  (SELECT count(*)
     FROM custom_roles ha, jsonb_each(ha.permissions) e
     WHERE ha.role_key = 'hr_admin' AND e.key LIKE 'hr.%' AND e.value = 'true'::jsonb
       AND COALESCE((SELECT (hh.permissions->>e.key)::boolean
                       FROM custom_roles hh WHERE hh.role_key='hr_head'), false) = false
  ) AS hr_head_missing_or_false,
  (SELECT count(*) FROM custom_roles
     WHERE role_key IN ('hr_head','hr_admin','coo')
       AND (permissions->>'hr.recruitment.approve.override')::boolean = true
  ) AS override_granted_roles;
```

Expected: `hr_head_missing_or_false = 0`, `override_granted_roles = 3`.

- [ ] **Step 4: Commit**

```bash
cd "D:/Projects/MyJKKN"
git add supabase/migrations/20260716_hr_head_full_access_and_approval_override.sql
git commit -m "feat(hr): grant hr_head full HR access + approval override to hr_head/hr_admin/coo"
```

---

### Task 5: UI — relabel approve dialog as override + require comment

**Files:**
- Modify: `app/(routes)/hr/recruitment/approvals/[jobId]/_components/workspace-candidates-tab.tsx`
  - `RowActions` component (`~473`): add `usePermissions`, compute `isOverrideAction`
  - `handleApprove` (`~620`): guard empty override comment
  - approve dialog (`~872-903`): relabel title/label, disable confirm on empty override comment
  - `ApprovalChainCascade` (`~444-465`): mark overridden steps

**Interfaces:**
- Consumes: `hr.recruitment.approve.override` key from Task 1; `LeaveApprovalStep.overridden` etc. from Task 2; `usePermissions()` → `{ permissions, isSuperAdmin, userRoles }`.
- Produces: no new exports; behavior only.

**Note:** The server (Task 3) is authoritative. This UI is UX polish so HR Head sees they are overriding and is forced to supply a reason before the request is sent. `usePermissions()` is the correct client hook — `useAuth()` here exposes only `{ profile, isLoading, error }`.

- [ ] **Step 1: Import `usePermissions`**

Near the other hook imports at the top of `workspace-candidates-tab.tsx`, add:

```ts
import { usePermissions } from '@/hooks/use-permissions';
```

- [ ] **Step 2: Compute override state in `RowActions`**

`RowActions` already computes (around lines 511–521):

```ts
  const isPendingApproval =
    !!candidate && (candidate.status === 'submitted' || candidate.status === 'pending_approval');
  const chain = candidate?.approval_chain ?? [];
  const chainConfigured = chain.length > 0;
  const currentStep = candidate ? chain[candidate.current_step] : undefined;
```

Immediately after that `currentStep` line, add:

```ts
  // Override detection (mirrors the server gate in RecruitmentService.approveCandidate):
  // the current step is "mine" if pinned to me, or role-only and I hold that role_key.
  const { permissions, isSuperAdmin, userRoles } = usePermissions();
  const myRoleKeys = useMemo(
    () => new Set((userRoles ?? []).map((r) => (r.role_key ?? '').toLowerCase())),
    [userRoles],
  );
  const isMyStep =
    !!currentStep &&
    (currentStep.approver_user_id
      ? currentStep.approver_user_id === userId
      : !!currentStep.approver_role &&
        myRoleKeys.has(currentStep.approver_role.toLowerCase()));
  const canOverrideStep =
    isSuperAdmin || permissions['hr.recruitment.approve.override'] === true;
  // True when the actor is acting on someone else's step via override.
  const isOverrideAction = isPendingApproval && !isMyStep && canOverrideStep;
```

- [ ] **Step 3: Guard the override comment in `handleApprove`**

`handleApprove` currently starts (line 620–621):

```ts
  const handleApprove = async () => {
    if (!candidate) return;
    try {
```

Change the top to:

```ts
  const handleApprove = async () => {
    if (!candidate) return;
    if (isOverrideAction && !approveComment.trim()) {
      toast.error("A comment is required to override another approver's step.");
      return;
    }
    try {
```

- [ ] **Step 4: Relabel the approve dialog + disable confirm on empty override comment**

The dialog block (lines 872–903) currently reads:

```tsx
      {/* Review / final-approve dialog */}
      <Dialog open={approveOpen} onOpenChange={(o) => { if (!o) setApproveOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isFinalStep ? 'Final Approval' : 'Mark as Reviewed'}</DialogTitle>
            <DialogDescription>
              {isFinalStep
                ? `Grants the final approval for ${row.name} — the candidate can then be onboarded to Staff.`
                : `Records your review of ${row.name} and forwards the candidacy to the next approver.`}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor={`approve-comment-${row.key}`}>
              {isFinalStep ? 'Comment (optional)' : 'Review notes (optional)'}
            </Label>
            <Textarea
              id={`approve-comment-${row.key}`}
              value={approveComment}
              onChange={(e) => setApproveComment(e.target.value)}
              rows={2}
              placeholder={isFinalStep ? 'Final remarks…' : 'Any notes for the next approver…'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button disabled={approve.isPending} onClick={handleApprove}>
              {approve.isPending
                ? 'Saving…'
                : isFinalStep ? 'Confirm Final Approval' : 'Confirm Review'}
            </Button>
          </DialogFooter>
        </DialogContent>
```

Replace it with (override-aware title, description, label, and confirm gating):

```tsx
      {/* Review / final-approve / override dialog */}
      <Dialog open={approveOpen} onOpenChange={(o) => { if (!o) setApproveOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isOverrideAction
                ? 'Override Approval'
                : isFinalStep ? 'Final Approval' : 'Mark as Reviewed'}
            </DialogTitle>
            <DialogDescription>
              {isOverrideAction
                ? `You are acting on the step for ${currentStep?.approver_role ?? 'another approver'} on behalf of ${row.name}'s chain. This is recorded as an override.`
                : isFinalStep
                ? `Grants the final approval for ${row.name} — the candidate can then be onboarded to Staff.`
                : `Records your review of ${row.name} and forwards the candidacy to the next approver.`}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor={`approve-comment-${row.key}`}>
              {isOverrideAction
                ? 'Reason for override (required)'
                : isFinalStep ? 'Comment (optional)' : 'Review notes (optional)'}
            </Label>
            <Textarea
              id={`approve-comment-${row.key}`}
              value={approveComment}
              onChange={(e) => setApproveComment(e.target.value)}
              rows={2}
              placeholder={
                isOverrideAction
                  ? 'Explain why you are approving on their behalf…'
                  : isFinalStep ? 'Final remarks…' : 'Any notes for the next approver…'
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button
              disabled={approve.isPending || (isOverrideAction && !approveComment.trim())}
              onClick={handleApprove}
            >
              {approve.isPending
                ? 'Saving…'
                : isOverrideAction
                ? 'Confirm Override'
                : isFinalStep ? 'Confirm Final Approval' : 'Confirm Review'}
            </Button>
          </DialogFooter>
        </DialogContent>
```

- [ ] **Step 5: Mark overridden steps in the chain strip**

In `ApprovalChainCascade`, the chain map (lines 456–465) renders each step's badge with a `title`. It currently is:

```tsx
          return (
            <span
              key={`${candidate.id}-step-${idx}`}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] ${cls}`}
              title={`Step ${idx + 1}: ${step.approver_role} — ${step.status}`}
            >
              <Icon className={`h-3 w-3 ${isCurrent ? 'animate-spin' : ''}`} />
              {step.approver_role}
            </span>
          );
```

Replace with (adds an "(overridden)" hint to the tooltip and a trailing marker):

```tsx
          return (
            <span
              key={`${candidate.id}-step-${idx}`}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] ${cls}`}
              title={
                step.overridden
                  ? `Step ${idx + 1}: ${step.approver_role} — ${step.status} (overridden; originally for ${step.intended_approver_role ?? step.approver_role})`
                  : `Step ${idx + 1}: ${step.approver_role} — ${step.status}`
              }
            >
              <Icon className={`h-3 w-3 ${isCurrent ? 'animate-spin' : ''}`} />
              {step.approver_role}
              {step.overridden && <span className="ml-0.5 opacity-70">⚑</span>}
            </span>
          );
```

- [ ] **Step 6: Verify types**

Run: `mcp__ide__getDiagnostics` on `app/(routes)/hr/recruitment/approvals/[jobId]/_components/workspace-candidates-tab.tsx`
Expected: no errors. (`useMemo` and `toast` are already imported and used in this file; `usePermissions` added in Step 1.)

- [ ] **Step 7: Commit**

```bash
cd "D:/Projects/MyJKKN"
git add "app/(routes)/hr/recruitment/approvals/[jobId]/_components/workspace-candidates-tab.tsx"
git commit -m "feat(hr): override-aware approve dialog with mandatory reason + overridden step marker"
```

---

### Task 6: End-to-end browser verification

**Files:** none (verification only).

**Interfaces:** Consumes everything above. This is the repo's real "done" gate — silent permission/scope bugs don't throw.

**Precondition:** `hr_head` currently has **0 holders**. Assign the `HR Head` role to a test user via Role Management (`/settings` → Role Management, or the user assigns it), OR run one-off in a test env:
`INSERT INTO user_roles(user_id, role_id) SELECT '<test-user-uuid>', id FROM custom_roles WHERE role_key='hr_head';`
(Per memory, direct `user_roles` INSERT may need a SECURITY DEFINER RPC depending on RLS — prefer the Role Management UI.)

- [ ] **Step 1: Menu visibility**

Log in as the `hr_head` test user. Confirm the **HR** section appears in the sidebar and `/hr` loads (was previously hidden — `hr.view` fix).
Expected: HR menu visible; `/hr/recruitment/approvals` reachable.

- [ ] **Step 2: Override a step pinned to someone else**

Open a candidate whose current step is pinned to a *different* user (or a role the HR Head does not hold). Click the decision button.
Expected: dialog title is **"Override Approval"**, the comment label says **"Reason for override (required)"**, and **Confirm Override is disabled** until a comment is typed.

- [ ] **Step 3: Confirm the override advances exactly one step**

Type a reason, confirm.
Expected: success toast; candidate advances by exactly one step (not force-completed); if it was the final step, status becomes `approved`.

- [ ] **Step 4: Confirm the audit trail (DB)**

Run via `mcp__supabase__execute_sql` (substitute the candidate id):

```sql
SELECT current_step,
       jsonb_pretty(approval_chain) AS chain
FROM hr_recruitment_candidates
WHERE id = '<candidate-uuid>';
```

Expected on the actioned step: `status='approved'`, `decided_by = <HR Head uuid>`, `overridden = true`, `overridden_by = <HR Head uuid>`, and `intended_approver_user_id` / `intended_approver_role` still showing the ORIGINAL pinned user / role (not clobbered to HR Head).

- [ ] **Step 5: Confirm a non-override approval is unchanged**

As a normal approver (pinned to their own step, no override key), approve a step.
Expected: dialog shows the normal "Final Approval"/"Mark as Reviewed" wording, comment stays optional, and the step's `approver_user_id` is set to that approver with **no** `overridden` field. (Regression check that the override path didn't leak into the normal path.)

- [ ] **Step 6: Report results honestly**

Summarize what was observed in each step. If any step failed, do NOT claim success — report the actual behavior and stop for review.

---

## Out of scope (reported, not implemented)
- **`rejectCandidate` (`recruitment-service.ts:471`) has no step-approver gate** — anyone with `hr.recruitment.approve` can reject any step today. Pre-existing hole, deliberately left untouched (user decision). Flag for a separate follow-up.
- **Assigning a user to `hr_head`** — the user will do this via Role Management; only the Task 6 verification needs a holder.

## Self-review notes
- **Spec coverage:** Part 1 (keys)→Task 1; Part 2 (grant migration)→Task 4; Part 3 (service override + audit fix)→Tasks 2+3; Part 4 (UI)→Task 5; verification plan→Task 6. `hr.view` fix→Task 1+4. All spec sections covered.
- **Type consistency:** override field names (`overridden`, `overridden_by`, `overridden_at`, `intended_approver_user_id`, `intended_approver_role`) are defined once in Task 2 and used identically in Tasks 3 and 5. The key string `hr.recruitment.approve.override` is identical across Tasks 1, 3, 4, 5. `isOverride` (service) vs `isOverrideAction` (UI) are intentionally distinct names in distinct files.
- **No placeholders:** every code step shows the full before/after.

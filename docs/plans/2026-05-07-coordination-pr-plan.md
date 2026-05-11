# Coordination PR Plan — 6-Module Program Prerequisites
## Phase 0 of HR/Appraisal Program

**Date:** 2026-05-07
**Status:** Ready for execution
**Purpose:** Single PR landing the cross-cutting changes that ALL 6 module PRs depend on. Avoids merge-conflict cascade on shared files. Per `/myjkkn-chain` standing rule: extract shared substrate FIRST, fan out modules SECOND.

**Source specs:** All 6 in `specs/{SAMS-SLICE-1,HR-LEAVE-ACTIVATION,HR-ATTENDANCE-LIVE,PROMOTION-RULEBOOK,VERIFIED-PUBLICATIONS,STUDENT-FEEDBACK}-SPEC.md`

---

## Why this PR exists

Per `/myjkkn-chain` "Production-code-sweep" + `feedback_preflight_before_parallel_pr_fanout.md`: when ≥2 PRs would touch the same shared file, **extract shared changes into a preceding PR**. The 6 module PRs touch:
- `lib/sidebarMenuLink.ts` (6 nav add edits)
- `lib/constants/permissions.ts` (30+ permission key adds)
- `departments` table (1 schema add — `head_of_department_id`, dependency for SAMS Module)

Without this coordination PR, the 6 module PRs hit `pr-preflight` BLOCKED status (overlap on shared files) and must serialize. With it, they fan out cleanly.

---

## Phase Dependency Map

```
Phase 0A: DDL — departments.head_of_department_id (sequential, must precede Phase 0B)
Phase 0B: Permission catalog adds (parallel within phase: 30 keys total)
Phase 0C: Sidebar nav adds (sequential — 6 entries, single file)
Phase 0D: HR officer HoD data-entry sprint (parallel — 8 HR officers fill ~50 rows)
Phase 0E: catalog-sync gate verification + PR open
```

Phases 0A → 0B → 0C → 0D run sequentially within this PR. Phase 0E gates merge.

---

## Phase 0A — DDL: Add `head_of_department_id` to `departments`

### T01 — Create migration file

**File:** `supabase/migrations/20260507000001_departments_add_hod.sql` (NEW)

**Content:**
```sql
-- Coordination PR: Phase 0A
-- Adds HoD pointer to departments table for SAMS-Slice-1 routing.
-- Per /interview Round 2/3 (2026-05-07) — Director-locked schema add.

ALTER TABLE departments
  ADD COLUMN head_of_department_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX idx_departments_hod
  ON departments(head_of_department_id)
  WHERE head_of_department_id IS NOT NULL;

COMMENT ON COLUMN departments.head_of_department_id IS
  'Resolves to the staff member acting as HoD for this department. '
  'Used by SAMS appraisal routing (one HoD per dept). '
  'NULL allowed; SAMS service treats NULL as "needs assignment". '
  'Filled by HR officer per college via /admin/departments admin UI.';
```

**Verification:**
```bash
# After applying migration via mcp__supabase__apply_migration:
psql -c "\d departments" | grep head_of_department_id  # column exists
psql -c "SELECT indexname FROM pg_indexes WHERE tablename='departments';" | grep idx_departments_hod  # index exists
```

### T02 — Verify RLS unchanged
The existing `departments` RLS policies must continue to allow read for all authenticated users (departments are public-ish metadata) and write for institution_admin/super_admin only. No RLS update needed.

**Verification:**
```sql
SELECT policyname, cmd, qual::TEXT FROM pg_policies WHERE tablename='departments';
-- Expected: existing policies unchanged
```

### T03 — Generate updated TypeScript types

**Command:**
```bash
cd /Users/omm/PROJECTS/MyJKKN
npx supabase gen types typescript --project-id kvizhngldtiuufknvehv > types/supabase.ts
```

**Verification:**
```bash
grep -A 2 "departments:" types/supabase.ts | grep "head_of_department_id"  # field present
```

---

## Phase 0B — Permission catalog adds

### T04 — Edit `lib/constants/permissions.ts` MENU_PERMISSIONS

**File:** `lib/constants/permissions.ts`

**Adds (one batch, ~30 keys):**

```typescript
// SAMS module (Module 1)
'sams.appraisal.self.read': 'SAMS — Read own appraisal',
'sams.appraisal.self.write': 'SAMS — Write own appraisal (before submit)',
'sams.appraisal.review': 'SAMS — Review and approve appraisals (HoD/Principal)',
'sams.cycle.manage': 'SAMS — Create/manage appraisal cycles',
'sams.metric.config': 'SAMS — Configure metric definitions',
'sams.threshold.write': 'SAMS — Tune metric thresholds (super-admin)',

// Promotion Rulebook module (Module 2)
'hr.promotion.criteria.write': 'Promotion — Configure criteria',
'hr.promotion.case.create': 'Promotion — Create case for candidate',
'hr.promotion.case.view': 'Promotion — View case-sheet',
'hr.promotion.case.decide': 'Promotion — Director decision (approve/reject)',

// Student Feedback module (Module 4)
'feedback.student_course_faculty.respond': 'Feedback — Submit response (student)',
'feedback.student_course_faculty.template.write': 'Feedback — Configure question template',
'feedback.student_course_faculty.faculty_view': 'Feedback — View own ratings (faculty)',
'feedback.student_course_faculty.aggregate.view': 'Feedback — View dept aggregates (HoD)',

// Verified Publications module (Module 5)
'sh.publications.enrich': 'Publications — Enrich own entries (faculty)',
'sh.publications.verify': 'Publications — Verify entries (research-cell)',
'sh.publications.dashboard': 'Publications — Director progress dashboard',

// HR Attendance Live module (Module 6)
'hr.attendance.mark': 'Attendance — Mark for staff (HR officer)',
'hr.attendance.my.view': 'Attendance — View own record',
'hr.attendance.regularize': 'Attendance — Submit regularization request',
'hr.attendance.regularize.approve': 'Attendance — Approve regularization',
'hr.attendance.status_types.write': 'Attendance — Configure status types',
'hr.attendance.thresholds.write': 'Attendance — Configure thresholds',

// HR Leave Activation module (Module 7) — note many already exist
'hr.leave.policies.write': 'Leave — Configure cadre policies',
'hr.leave.balance.dispute': 'Leave — Submit balance correction request',
'hr.leave.dispute.approve': 'Leave — Approve balance correction',

// Departments admin (NEW for SAMS HoD assignment)
'admin.departments.hod.write': 'Departments — Assign Head of Department',
```

### T05 — Edit `lib/constants/permissions.ts` PERMISSION_CATEGORIES

**Same file.** Adds parallel entries grouping the above keys into UI categories shown in role-management Edit dialog. Pattern per existing categories: `{ category: 'SAMS', keys: ['sams.*'] }`, etc.

### T06 — Verify catalog-sync passes

**Command:**
```bash
cd /Users/omm/PROJECTS/MyJKKN
node scripts/check-permissions-catalog.mjs
```

**Expected:** exit code 0. If exit 1 (hard ERROR), fix the missing entries before proceeding.

---

## Phase 0C — Sidebar nav adds

### T07 — Edit `lib/sidebarMenuLink.ts`

**File:** `lib/sidebarMenuLink.ts`

**Adds (under HR module + Admin module):**

```typescript
// HR module nav additions
{
  label: 'Self-Appraisal',
  path: '/hr/sams',
  permission: 'sams.appraisal.self.read',
  icon: 'ClipboardCheck',
},
{
  label: 'Review Appraisals',
  path: '/hr/sams/review',
  permission: 'sams.appraisal.review',
  icon: 'CheckSquare',
},
{
  label: 'Promotion Cases',
  path: '/hr/promotions',
  permission: 'hr.promotion.case.view',
  icon: 'TrendingUp',
},
{
  label: 'My Attendance',
  path: '/hr/attendance/my',
  permission: 'hr.attendance.my.view',
  icon: 'Calendar',
},
{
  label: 'My Publications',
  path: '/hr/profile/publications',
  permission: 'sh.publications.enrich',
  icon: 'BookOpen',
},

// Admin module nav additions
{
  label: 'SAMS Cycles',
  path: '/admin/sams/cycles',
  permission: 'sams.cycle.manage',
  icon: 'Cycle',
},
{
  label: 'SAMS Metrics',
  path: '/admin/sams/metric-definitions',
  permission: 'sams.metric.config',
  icon: 'Settings',
},
{
  label: 'Promotion Criteria',
  path: '/admin/hr/promotions/criteria',
  permission: 'hr.promotion.criteria.write',
  icon: 'Award',
},
{
  label: 'Attendance Settings',
  path: '/admin/hr/attendance/thresholds',
  permission: 'hr.attendance.thresholds.write',
  icon: 'Clock',
},
{
  label: 'Publications (Verify)',
  path: '/admin/research/publications/pending',
  permission: 'sh.publications.verify',
  icon: 'FileCheck',
},
{
  label: 'Department HoDs',
  path: '/admin/departments',
  permission: 'admin.departments.hod.write',
  icon: 'Users',
},
```

**Verification:**
```bash
# Lint passes:
npx tsc --noEmit lib/sidebarMenuLink.ts
# Permissions are all defined:
grep -oE "'[a-z\.]+\.[a-z_]+'" lib/sidebarMenuLink.ts | sort -u | while read p; do
  grep -q "${p}" lib/constants/permissions.ts || echo "MISSING: ${p}"
done
# Expected: no MISSING output
```

---

## Phase 0D — HoD data-entry sprint (parallel, 8 HR officers)

### T08 — Build minimal `/admin/departments` admin UI for HoD assignment

**File:** `app/(routes)/admin/departments/page.tsx` (NEW)

**Component:** `LookupTable` inside `PolicyPageShell` per `lib/admin/policy-shell` substrate.

**Skeleton:**
```typescript
'use client';

import { PolicyPageShell, LookupTable } from '@/lib/admin/policy-shell';
import type { LookupConfig } from '@/lib/admin/policy-shell';

const config: LookupConfig = {
  table: 'departments',
  englishTitle: 'Departments — HoD Assignment',
  englishDescription: 'Assign one Head of Department per department. Used by SAMS appraisal routing.',
  columns: [
    { name: 'department_name', englishLabel: 'Department', kind: 'text', readOnly: true },
    { name: 'department_code', englishLabel: 'Code', kind: 'text', readOnly: true },
    {
      name: 'head_of_department_id',
      englishLabel: 'HoD',
      kind: 'fk_profile',
      placeholder: 'Search staff with role_key=hod',
      filterRoleKey: 'hod',
    },
  ],
  permission: 'admin.departments.hod.write',
};

export default function DepartmentsHoDPage() {
  return (
    <PolicyPageShell config={config}>
      <LookupTable config={config} />
    </PolicyPageShell>
  );
}
```

### T09 — Communicate HR-officer task

After PR merge: Director or HR coordinator emails the 8 HR officers with:
- Link to `/admin/departments` per institution
- Instructions: "Set HoD for each department; ~5-10 departments per college; ~10 minutes total"
- Deadline: 1 week post-PR-merge (before SAMS Phase 1B starts)

**Tracking metric:**
```sql
SELECT institution_id, 
       COUNT(*) AS total_departments,
       COUNT(head_of_department_id) AS hod_assigned,
       100.0 * COUNT(head_of_department_id) / COUNT(*) AS pct_complete
FROM departments
WHERE is_active = true
GROUP BY institution_id;
-- Target: 100% per institution before SAMS Phase 1B kicks off
```

---

## Phase 0E — Catalog-sync gate + PR open

### T10 — Run all gates

```bash
cd /Users/omm/PROJECTS/MyJKKN

# Catalog sync (mandatory)
node scripts/check-permissions-catalog.mjs && echo "✓ catalog-sync passed"

# Type check
npm run type-check && echo "✓ type-check passed"

# Build (per /myjkkn-chain build-depth-gate, this PR is type-only-ish — but new admin route requires full build)
~/.claude/scripts/preflight-jicate-build.sh --mode build && echo "✓ build green"

# Step 0 env-target check is automatic in the helper.
```

### T11 — pr-preflight gate

```bash
# Per /myjkkn-chain — check overlap with open PRs
gh pr list --repo Jicate-Solutions/MyJKKN --state open --search "in:title coordination OR sidebar OR permissions"
# Expected: no conflicting PRs touching lib/sidebarMenuLink.ts or lib/constants/permissions.ts
```

### T12 — Open PR

```bash
gh pr create --repo Jicate-Solutions/MyJKKN \
  --title "feat(coordination): Phase 0 prerequisites for HR/Appraisal program (6 modules)" \
  --body "$(cat <<'EOF'
## Summary
- Adds `departments.head_of_department_id` schema column (SAMS HoD routing)
- Adds 30 permission keys for the 6-module program (SAMS / Promotion / Feedback / Publications / Attendance / Leave)
- Adds 11 sidebar nav entries
- Ships `/admin/departments` admin UI for HoD assignment

## Per-module dependencies
| Module | Module spec | Depends on this PR for |
|---|---|---|
| 1 | SAMS-Slice-1 | departments.head_of_department_id, sams.* permissions, /hr/sams nav |
| 2 | Promotion Rulebook | hr.promotion.* permissions, /hr/promotions nav |
| 4 | Student Feedback | feedback.* permissions, faculty-view nav |
| 5 | Verified Publications | sh.publications.* permissions, /hr/profile/publications nav |
| 6 | HR Attendance | hr.attendance.* permissions, /hr/attendance/my nav |
| 7 | HR Leave | hr.leave.policies.write + dispute permissions |

## Test plan
- [ ] Migration applied; `head_of_department_id` column exists with index
- [ ] catalog-sync passes (exit 0)
- [ ] Build green; Issues delta ≤0
- [ ] /admin/departments renders; HoD picker filters by role_key='hod'
- [ ] HR officer can assign HoD for ≥1 department; row saved

## Director sign-off
Required per Pattern D protocol — schema add affects appraisal routing.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### T13 — Director sign-off + merge

Per Pattern D protocol: Director must approve the merge. Comment on PR: "Approve" → merge.

After merge:
1. Vercel deploy hook fires (verify via `vercel ls my-jkkn --scope jicate-solutions | head -3`)
2. Wait for build success (~5-8 min typical)
3. HR officer comms goes out (T09)
4. 1-week wait for HoD data entry to complete
5. Once `pct_complete=100%` per institution → fire the 6 module PRs in parallel

---

## Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| AC1 | Migration applied; column + index exist | `\d departments` shows column |
| AC2 | All 30 permission keys in BOTH MENU_PERMISSIONS and PERMISSION_CATEGORIES | catalog-sync passes |
| AC3 | All 11 nav entries reference defined permissions | grep validation |
| AC4 | /admin/departments admin UI uses policy-shell substrate | grep -l "PolicyPageShell\|LookupTable" |
| AC5 | catalog-sync exits 0 | `node scripts/check-permissions-catalog.mjs` |
| AC6 | npm run build green; Issues delta ≤0 on /admin/departments page | `~/.claude/scripts/preflight-jicate-build.sh --mode build` exits 0 |
| AC7 | Post-merge: ≥80% of departments have head_of_department_id within 1 week | tracking SQL above; report to Director |
| AC8 | No merge conflicts with open PRs (pr-preflight clean) | `gh pr list` check |

---

## Risks + Mitigations

| Risk | Mitigation |
|---|---|
| HR officers don't fill HoD assignments → SAMS Phase 1B blocked | Director-driven comms; 1-week deadline; tracking SQL reported daily |
| `role_key='hod'` filter in HoD picker returns 0 staff for some institutions (data gap) | Fallback: allow filter by `role_type` OR show all staff with manual filter; document edge case |
| Permission key naming collides with existing keys | Prefix-namespace check before commit: `grep -c "^'sams\." lib/constants/permissions.ts` returns expected count |
| Sidebar nav order looks wrong to Director after merge | Director can reorder via `display_order` config (existing field); no code change |

---

## Hand-off

After this PR merges and HoD assignments hit ~80%:

**Spawn 6 parallel module PRs** per `2026-05-07-{module}-plan.md` plans. They are file-disjoint by design (each owns its `sams_*` / `hr_promotion_*` / `feedback_course_faculty_*` etc. table prefix and route directory).

**Recommended PR order** (loosely — they can run in parallel since file-disjoint):
1. SAMS-Slice-1 (foundation — others consume it)
2. HR Leave Activation (independent, simplest)
3. HR Attendance Live (independent, simple)
4. Verified Publications (feeds SAMS — start early to populate before SAMS auto-pull cron runs)
5. Student Feedback (feeds SAMS M12)
6. Promotion Rulebook (consumes SAMS — start last)

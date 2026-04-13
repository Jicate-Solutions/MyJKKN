# Exceptions & Privileges Module — Full Spec

> Interviewed: 25 March 2026 | Director: Ommsharravana | Module: MyJKKN Academic

---

## Problem Statement

JKKN removes institutional barriers (attendance, marks, funding, scholarships) for learners serving in special capacities — startup founders, learner council, sports teams, NCC cadets, research fellows. Today this happens through verbal orders, spreadsheets, and manual coordination across 6 colleges. Faculty don't know why a learner is absent. HODs don't have visibility. Parents can't see status. Reviews happen informally. No audit trail exists.

This module makes **blanket privilege exceptions official, automated, transparent, and revocable** inside MyJKKN.

---

## Interview Findings — Key Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| OD mechanics | **Auto-mark every period** | Each faculty's attendance sheet shows 'OD - Startup Founder' automatically for all 6-8 daily periods. No manual action. |
| Marks scope | **Everything — max all components** | CIA tests, assignments, practicals, attendance component, lab work — all auto-filled to maximum. Founder focuses on university exams only. |
| Review criteria | **Hybrid — milestones inform, Director decides** | System shows progress data (GitHub activity, app status, self-reports). Revoke decision is human. |
| AICTE compliance | **Not a concern — OD is legitimate** | On-Duty is a recognized attendance category. University accepts it as present. |
| Funding flow | **NIF committee approves** | MyJKKN tracks requests and status only. Actual disbursement is outside the system. |
| Revocation impact | **Keep past marks, manual from now** | Marks already awarded stay. From revocation date, learner earns marks normally. |
| Extensibility | **Make it extensible** | Schema allows custom privilege types beyond the initial 4. Future: hostel waiver, lab access, mentorship, travel allowance. |
| Faculty visibility | **Show the reason** | Faculty sees: "Auto OD — Solve for 100 Founder (Director Order #SG36)". Transparent, prevents pushback. |
| Progress signals | **Both — auto signals + self-report** | System auto-checks GitHub commits and app liveness. Founders also submit monthly updates. Review dashboard shows both. |
| Templates | **Save as templates** | Admin can save group configurations as reusable templates ("Founder Package", "Council Package"). |
| Parent visibility | **Yes — parents see the badge** | Parents see "Startup Founder — Full OD Privilege" with explanation. Builds pride and institutional trust. |

---

## User Stories

### Admin (Director / Super Admin)

1. **As admin**, I can create a privilege group (e.g., "Solve for 100 — Startup Founders") with a name, description, semester, and selected privilege types.
2. **As admin**, I can define which privilege types a group receives — from the 4 core types (OD, marks, scholarship, funding) plus any custom types.
3. **As admin**, I can bulk-add learners to a group via CSV upload or search-and-select.
4. **As admin**, I can save a group's privilege configuration as a reusable template.
5. **As admin**, I can create new groups from saved templates.
6. **As admin**, I can view a review dashboard showing each member's progress signals (last GitHub commit, app status, monthly self-report).
7. **As admin**, I can review members: keep active, put under review, or revoke — with notes.
8. **As admin**, I can see review history for any group (who was reviewed, when, outcome).
9. **As admin**, I can revoke a single member mid-semester. Their past marks stay, but future attendance/marks revert to normal.

### HOD / Department Admin

10. **As HOD**, I can see which of my department's learners have active privileges and which groups they belong to.
11. **As HOD**, I can see reports: how many privileged learners per department, privilege types distribution.

### Faculty (Attendance Marker)

12. **As faculty**, when I mark attendance, I see privileged learners auto-marked as "OD" with a visible tag: "Auto OD — [Group Name] (Director Order #[ref])".
13. **As faculty**, I cannot override the auto-OD status for privileged learners.

### Learner

14. **As a learner**, I see a badge on my dashboard: "Solve for 100 — Startup Founder" (or whatever group I belong to).
15. **As a learner**, I see my attendance at 100% with "Full OD" status and monthly breakdown.
16. **As a learner**, I see my internal marks at full with subject-wise breakdown.
17. **As a learner**, I see all my active privileges (the "4 Barriers Removed" card).
18. **As a learner**, I can submit monthly progress updates (app link, what I built, screenshot).
19. **As a learner**, I see "Reviewed each semester" warning so I know it's conditional.

### Parent

20. **As a parent**, when I view my child's attendance, I see the privilege badge and explanation alongside 100% attendance.

---

## Requirements

### Must-Have (V1)

| # | Requirement | Priority |
|---|-------------|----------|
| M1 | Privilege group CRUD (create, read, update, delete with confirmation) | P0 |
| M2 | 4 core privilege types: full_od, full_marks, scholarship, funding | P0 |
| M3 | Extensible privilege type system (admin can add custom types later) | P0 |
| M4 | Bulk member import (CSV + search-and-add) | P0 |
| M5 | Auto-OD in attendance: every period auto-marked, faculty sees reason tag, locked | P0 |
| M6 | Auto-marks: all CIA components auto-filled to max for privileged learners | P0 |
| M7 | Learner privilege view: badge, attendance tab, marks tab, 4-barriers card | P0 |
| M8 | Member status management: active → under_review → revoked | P0 |
| M9 | Revocation: past marks kept, future reverts to manual | P0 |
| M10 | Review dashboard with member list, status filters | P0 |
| M11 | Faculty visibility: "Auto OD — [Group Name] (Director Order #ref)" | P0 |
| M12 | Permission-gated: only super_admin/admin can manage | P0 |

### Should-Have (V1.1)

| # | Requirement | Priority |
|---|-------------|----------|
| S1 | Privilege templates (save group config, create from template) | P1 |
| S2 | Monthly self-report form for founders (app link, description, screenshot) | P1 |
| S3 | Auto-signals: check GitHub last commit date, ping deployed app URL | P1 |
| S4 | Review history log (who reviewed, when, decisions made) | P1 |
| S5 | HOD department view: which of my learners have privileges | P1 |
| S6 | Parent badge visibility on parent portal | P1 |
| S7 | Scholarship/funding status tracking (informational, no payment) | P1 |

### Nice-to-Have (V2)

| # | Requirement | Priority |
|---|-------------|----------|
| N1 | Auto-flag founders with zero GitHub activity in 30 days | P2 |
| N2 | Notification to learner when put under review | P2 |
| N3 | Analytics dashboard: privilege usage across institution | P2 |
| N4 | API for external systems (NIF) to update funding status | P2 |

---

## Database Schema

### Table: `privilege_types` (extensible)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| institution_id | uuid FK | Multi-tenancy |
| key | text UNIQUE | 'full_od', 'full_marks', 'scholarship', 'funding', or custom |
| name | text | Display name |
| description | text | What this privilege means |
| category | text | 'academic', 'financial', 'facility', 'other' |
| is_system | boolean | true for 4 core types (can't delete), false for custom |
| config_schema | jsonb | Optional: config fields (e.g., max_amount for scholarship) |
| created_at | timestamptz | |

Seed data: 4 core types pre-inserted.

### Table: `privilege_groups`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| institution_id | uuid FK | |
| name | text | "Solve for 100 — Startup Founders" |
| description | text | Purpose |
| reference_code | text | "SG36" — used in faculty-facing tags |
| semester_id | uuid FK | |
| status | text | 'active', 'expired', 'archived' |
| is_template | boolean | If true, this is a saved template |
| template_name | text | "Founder Package" (only if is_template) |
| created_by | uuid FK | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### Table: `privilege_group_types` (many-to-many)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| group_id | uuid FK | → privilege_groups |
| type_id | uuid FK | → privilege_types |
| config | jsonb | Type-specific config (e.g., {"max_amount": 100000} for scholarship) |

### Table: `privilege_members`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| group_id | uuid FK | → privilege_groups |
| learner_id | uuid FK | → profiles |
| status | text | 'active', 'under_review', 'revoked' |
| start_date | date | |
| end_date | date | Semester end |
| revoked_at | timestamptz | |
| revoked_by | uuid FK | |
| revoke_reason | text | |
| review_notes | text | |
| created_by | uuid FK | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### Table: `privilege_reviews`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| group_id | uuid FK | |
| reviewer_id | uuid FK | |
| review_date | date | |
| members_reviewed | integer | |
| members_kept | integer | |
| members_revoked | integer | |
| notes | text | |
| created_at | timestamptz | |

### Table: `privilege_progress_reports` (V1.1)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| member_id | uuid FK | → privilege_members |
| report_month | date | First of the month |
| app_url | text | Current deployed app link |
| github_url | text | GitHub repo |
| description | text | What they built this month |
| screenshot_url | text | Supabase storage path |
| auto_signals | jsonb | {"last_commit": "2026-04-15", "app_live": true} |
| submitted_at | timestamptz | |

---

## Pages & Routes

| Route | Role | Purpose |
|-------|------|---------|
| `/academic/privileges` | Admin | Group list dashboard with stats |
| `/academic/privileges/new` | Admin | Create group (or from template) |
| `/academic/privileges/[id]` | Admin | Group detail: members, privileges, review history |
| `/academic/privileges/[id]/members` | Admin | Add/remove/bulk-import members |
| `/academic/privileges/[id]/review` | Admin | Semester review: keep/revoke per member |
| `/academic/privileges/templates` | Admin | Manage saved templates |
| `/academic/privileges/my` | Learner | My privileges view (the mockup) |
| `/academic/privileges/my/report` | Learner | Submit monthly progress report |

---

## Integration Points

### 1. Attendance Auto-OD (P0)

**Where:** `attendance-core-service.ts` or the attendance marking page component.

**Logic:**
```
When marking attendance for a learner:
1. Check: PrivilegeService.getActivePrivileges(learnerId)
2. If has 'full_od':
   - Auto-set status = 'OD'
   - Lock the field (faculty cannot override)
   - Show tag: "Auto OD — {groupName} (Director Order #{referenceCode})"
3. This applies to EVERY period, not just a daily summary
```

**Integration service:** `privilege-attendance-integration-service.ts`

### 2. Internal Marks Auto-Fill (P0)

**Where:** Wherever internal marks are entered (need to verify if marks entry page exists).

**Logic:**
```
When loading marks entry for a subject:
1. Check: PrivilegeService.getActivePrivileges(learnerId)
2. If has 'full_marks':
   - Pre-fill ALL components to max: CIA1, CIA2, CIA3, assignments, practicals, presentations
   - Lock the fields
   - Show badge: "Full Marks — {groupName}"
3. If revoked mid-semester:
   - Past marks stay as-is
   - Future components unlock for manual entry
```

### 3. Learner Dashboard Badge (P0)

**Where:** Main learner dashboard component.

**Logic:**
```
On dashboard load:
1. Check: PrivilegeService.getActivePrivileges(learnerId)
2. If any active privileges:
   - Show golden badge with group name
   - Link to /academic/privileges/my
```

### 4. Parent Portal (P1)

**Where:** Parent attendance view (when it exists).

**Logic:** Same badge display as learner view.

---

## Permissions

| Action | Roles |
|--------|-------|
| Create/edit privilege groups | super_admin, admin |
| Create/edit templates | super_admin, admin |
| Add/remove members | super_admin, admin |
| Review & revoke members | super_admin, admin |
| View group reports | super_admin, admin, hod_department |
| View own privileges | learner (self only) |
| Submit progress report | learner (self only) |
| Override auto-OD | NOBODY (locked) |

---

## Edge Cases

| Case | Handling |
|------|----------|
| Learner in 2 groups with overlapping privileges | Union — both badges shown, both reasons in OD tag |
| Group deleted while members active | Confirmation required. All members revoked first, then group archived. |
| Semester rollover | Groups auto-expire. Admin can "renew for next semester" (copies members to new group). |
| Revoked mid-semester | Past marks/attendance stay. From revocation date onwards, manual. |
| Learner transfers department | Privilege stays (it's learner-linked, not department-linked). |
| Faculty marks attendance before privilege is granted | Privilege is retroactive only from start_date. Past dates not affected. |
| CSV import with invalid learner IDs | Show error rows, import valid ones. Summary: "110 imported, 6 failed (not found)". |
| Custom privilege type added | Appears as checkbox in group form. No attendance/marks integration unless coded. |

---

## Out of Scope (V1)

- Payment gateway integration for scholarship/funding
- Automated revocation (always human decision)
- Integration with university exam portal
- Mobile app notifications (PWA push only if already set up)
- Workflow approval for privilege granting (Director grants directly, no committee approval flow)

---

## Technical Constraints

- **Supabase project:** kvizhngldtiuufknvehv (Mumbai)
- **Branch:** omm-dev
- **Stack:** Next.js 15, App Router, TypeScript, Tailwind, shadcn/ui, React Query
- **Patterns:** Follow existing MyJKKN service/hook/type/component patterns (see codebase exploration report)
- **Build must not break existing modules** — the MyJKKN build currently has pre-existing errors in admission components; new code must not add errors

---

## Success Criteria

| # | Criteria | Verification |
|---|----------|-------------|
| 1 | Admin creates "Solve for 100" group with all 4 privileges | Group appears in list with correct badges |
| 2 | Admin bulk-imports 116 warriors via CSV | All 116 show as active members |
| 3 | Faculty marks attendance → privileged learner auto-OD with tag | Screenshot of attendance page showing locked OD + reason |
| 4 | Learner logs in → sees golden badge + 100% OD + full marks | Screenshot of learner view |
| 5 | Admin revokes one member → marks stay, future goes manual | Before/after comparison |
| 6 | Admin does semester review → decisions recorded | Review history shows entries |
| 7 | Template saved from group → new group created from template | Template appears in template list, new group has same config |

---

*Interview conducted: 25 March 2026*
*Spec version: 1.0*
*Ready for: Phase 2 (Planning + Task Decomposition)*

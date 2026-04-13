# Exceptions & Privileges Module — MyJKKN

## 1. True Goal

Enable JKKN administrators to **grant blanket academic exceptions and privileges** (attendance, internal marks, scholarships, funding) to groups of learners who are serving the institution in special capacities — startup founders, learner council members, sports teams, NCC cadets, etc.

**Why:** JKKN promised Sarvam Galatta startup founders 4 barriers removed (full OD, full marks, full funding, scholarship). Today this is done manually via spreadsheets and verbal approvals. This module makes it **official, trackable, and revocable** — configured once on MyJKKN, visible to the learner immediately.

**Core principle:** Privileges are given **upfront** but **reviewed periodically**. If someone stops contributing, privileges are revoked.

---

## 2. Users & Roles

| Role | What They Do |
|------|-------------|
| **Super Admin / Director** | Create privilege groups, define what privileges each group gets, assign/remove learners, review & revoke |
| **HOD / Department Admin** | View learners in their department who have privileges, see reports |
| **Learner** | See their privileges on their dashboard — attendance status, marks status, scholarship status |

---

## 3. Core Concepts

### Privilege Group
A named group with defined privileges. Examples:
- "Solve for 100 — Startup Founders" (Sarvam Galatta 36)
- "Learner Council 2026-27"
- "University Sports Team"
- "NCC Cadets"
- "Research Fellows"

### Privilege Types (4 Barriers)

| Type | Key | What It Means | How It Works |
|------|-----|--------------|-------------|
| **Full On-Duty** | `full_od` | 100% attendance for the semester | Attendance system auto-marks OD |
| **Full Internal Marks** | `full_marks` | Full internal marks upfront | Marks system auto-fills max |
| **Innovation Scholarship** | `scholarship` | Up to ₹X/year | Tracked, issued for redemption |
| **Full Funding** | `funding` | NIF covers costs, phase-wise | Tracked with disbursement records |

Each group can have **any combination** of these 4 privilege types.

### Membership
A learner belongs to a group with:
- Start date (usually semester start)
- End date (usually semester end)
- Status: `active`, `under_review`, `revoked`
- Review notes (why revoked, if applicable)

---

## 4. Happy Path

### Admin Creates a Privilege Group
1. Admin goes to `/academic/privileges`
2. Clicks "Create Group"
3. Fills: Name, Description, Semester, Privileges (checkboxes for the 4 types)
4. For scholarship: sets max amount (e.g., ₹1,00,000/year)
5. For funding: sets funding model (phase-wise, lump sum)
6. Saves → Group created

### Admin Adds Learners to Group
1. Opens the group
2. Clicks "Add Members"
3. Two options:
   - **Search & add** — search by name, roll number, department
   - **Bulk import** — paste list of learner IDs or upload CSV
4. For Sarvam Galatta: bulk import the 116 pledged warriors
5. Confirms → All 116 get privileges immediately

### Learner Sees Their Privileges
1. Learner logs into MyJKKN
2. On their academic dashboard, a banner appears: "Solve for 100 — Startup Founder"
3. Attendance tab shows: 100% — Full OD
4. Internal Marks tab shows: Full marks — all subjects
5. A "My Privileges" section shows all 4 barriers with status

### Admin Reviews at Semester End
1. Admin opens the group
2. Sees member list with activity indicators
3. Can filter: Active / Under Review / Revoked
4. Selects learners to review
5. Options: Keep Active, Put Under Review, Revoke
6. Revoke removes privileges for next semester
7. Learner's dashboard updates immediately

---

## 5. Sad Paths

| Scenario | Handling |
|----------|----------|
| Learner removed from group | Privileges revoked, attendance reverts to normal tracking, marks revert to manual entry |
| Group deleted | All members lose privileges, confirmation required |
| Learner in multiple groups | Privileges stack (union of all group privileges) |
| Semester ends | Groups expire unless renewed by admin |
| No learners in group | Group exists but is empty — no effect |

---

## 6. Database Schema

### Table: `privilege_groups`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| institution_id | uuid FK | Multi-tenancy |
| name | text | "Solve for 100 — Startup Founders" |
| description | text | Purpose of this group |
| semester_id | uuid FK | Which semester this applies to |
| has_full_od | boolean | Full attendance privilege |
| has_full_marks | boolean | Full internal marks privilege |
| has_scholarship | boolean | Scholarship privilege |
| scholarship_max_amount | numeric | Max scholarship amount |
| has_funding | boolean | Funding privilege |
| funding_model | text | 'phase_wise' or 'lump_sum' |
| status | text | 'active', 'expired', 'archived' |
| created_by | uuid FK | Admin who created |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### Table: `privilege_members`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| group_id | uuid FK | → privilege_groups |
| learner_id | uuid FK | → profiles |
| status | text | 'active', 'under_review', 'revoked' |
| start_date | date | When privilege starts |
| end_date | date | When privilege ends (semester end) |
| revoked_at | timestamptz | When revoked (if applicable) |
| revoked_by | uuid FK | Who revoked |
| revoke_reason | text | Why revoked |
| review_notes | text | Notes from last review |
| created_by | uuid FK | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### Table: `privilege_reviews`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| group_id | uuid FK | → privilege_groups |
| reviewer_id | uuid FK | Who did the review |
| review_date | date | When reviewed |
| members_reviewed | integer | How many reviewed |
| members_kept | integer | How many kept active |
| members_revoked | integer | How many revoked |
| notes | text | Review summary |
| created_at | timestamptz | |

---

## 7. Pages & Routes

### Admin Pages

| Route | Purpose |
|-------|---------|
| `/academic/privileges` | List all privilege groups with stats |
| `/academic/privileges/[id]` | Group detail — members, review history |
| `/academic/privileges/[id]/members` | Manage members — add, remove, bulk import |
| `/academic/privileges/[id]/review` | Semester review — keep/revoke per member |

### Learner Page

| Route | Purpose |
|-------|---------|
| `/academic/privileges/my` | Learner's own privilege view (the mockup we built) |

The learner view is also embedded as a card/banner on the main academic dashboard.

---

## 8. Integration Points

### Attendance Integration
- When attendance is being marked for a learner with `full_od` privilege → auto-mark as "On Duty"
- The `leave-onduty-attendance-check-service.ts` already has a pattern for this
- Add a check: `PrivilegeService.hasActivePrivilege(learnerId, 'full_od')` → returns true/false

### Internal Marks Integration
- When internal marks entry page loads, learners with `full_marks` → pre-filled with max marks
- Faculty can see the "Privilege: Full Marks" badge but cannot override
- Marks are auto-populated when the privilege is granted

### Dashboard Integration
- Learner dashboard shows a "Startup Founder" or privilege badge
- Links to `/academic/privileges/my` for details

---

## 9. Permissions

| Action | Who Can |
|--------|---------|
| Create/edit privilege groups | super_admin, admin |
| Add/remove members | super_admin, admin |
| Review & revoke | super_admin, admin |
| View group reports | super_admin, admin, hod_department |
| View own privileges | Learner (self only) |

---

## 10. File Structure (Following MyJKKN Patterns)

```
app/(routes)/academic/privileges/
├── page.tsx                          # Group list dashboard
├── [id]/
│   ├── page.tsx                      # Group detail
│   ├── members/page.tsx              # Member management
│   └── review/page.tsx               # Semester review
├── my/page.tsx                       # Learner privilege view
└── _components/
    ├── group-columns.tsx             # DataTable columns
    ├── group-form-dialog.tsx         # Create/edit group
    ├── member-columns.tsx            # Member list columns
    ├── add-members-dialog.tsx        # Add members (search + bulk)
    ├── review-dialog.tsx             # Review modal
    ├── privilege-badge.tsx           # Reusable badge component
    └── learner-privilege-card.tsx    # Learner dashboard card

lib/services/academic/
├── privilege-service.ts              # Main service
└── privilege-attendance-integration-service.ts

hooks/academic/
└── use-privileges.ts                 # React Query hooks

types/
└── privileges.ts                     # TypeScript types
```

---

## 11. Success Criteria

| Criteria | How to Verify |
|----------|--------------|
| Admin can create a privilege group with 4 barrier types | Create "Solve for 100" group, check all 4 checkboxes |
| Admin can bulk-add 116 warriors | Import CSV, verify all 116 appear as members |
| Learner sees privileges on dashboard | Log in as a warrior, see the badge + attendance + marks |
| Attendance auto-marks OD | Mark attendance for a privileged learner, verify auto-OD |
| Marks auto-fill | Open marks entry, verify privileged learner has full marks |
| Admin can revoke | Revoke one member, verify their attendance reverts to normal |
| Review history tracked | Do a review, check review record is saved |

---

## Assumptions

- [ASSUMPTION] The existing `student_attendance` table can accept OD status from this module (same as leave-onduty integration)
- [ASSUMPTION] Internal marks entry exists somewhere in MyJKKN (need to verify — may need to build marks entry too)
- [ASSUMPTION] Scholarship and funding tracking are informational only (no payment gateway integration)
- [ASSUMPTION] One learner can be in multiple privilege groups simultaneously

---

*Spec written: 25 March 2026*
*Module: Exceptions & Privileges*
*Target: MyJKKN omm-dev branch*

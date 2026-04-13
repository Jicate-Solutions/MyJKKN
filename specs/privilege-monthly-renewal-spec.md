# Privilege Monthly Renewal & Committee Approval — Spec

> Interviewed: 30 March 2026 | Director: Ommsharravana | Module: Exceptions & Privileges (V1.1)

---

## Problem Statement

Currently, privileges (Full OD, Full Marks, Scholarship, Funding) are granted once and remain active until manually revoked. There is no structured check-in mechanism to verify that the learner is still actively contributing to their startup, council role, or sports team. This creates a risk of "zombie privileges" — learners who received exceptions months ago but are no longer active, yet continue to receive automatic attendance and marks.

This enhancement adds a **monthly renewal gate**: privileges must be explicitly approved by a committee each month, informed by the learner's progress report. If not approved by the 27th, the privilege auto-pauses on the 1st.

---

## Interview Findings — Key Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Who approves? | **Configurable committee per group** | Different groups may need different reviewers (NIF committee for founders, sports committee for athletes) |
| When is the review? | **By the 27th of each month** | Gives 3-4 days buffer before month-end. All learners in a group reviewed together. |
| What if not approved? | **Immediate stop on the 1st** | No grace period. Auto-OD and auto-marks stop. Faculty sees learner as regular student. |
| What if committee doesn't review? | **Auto-pause** | No news = no privilege. Forces accountability. |
| Is report required? | **Yes — gating condition** | Committee cannot approve a learner who hasn't submitted their monthly progress report. System blocks it. |
| Review flow | **Individual per learner** | Each learner must be explicitly approved or denied. No bulk-approve shortcut. |
| Non-approval meaning | **Temporary pause** | Can be re-approved next month. Not permanent revocation. |
| Gap month handling | **Stays as-is** | The paused month's attendance and marks remain manual. No retroactive changes when re-approved. |
| Notifications | **In-app badge + email** | Learner sees renewal status badge. Email sent on: renewal due, approved, paused. |

---

## User Stories

### Committee Member / Reviewer

1. **As a committee member**, I see a list of learners whose privileges are up for renewal this month, with their progress report status (submitted / not submitted).
2. **As a committee member**, I can view each learner's progress report (app link, GitHub, description, screenshot) before approving.
3. **As a committee member**, I approve or deny each learner individually with optional notes.
4. **As a committee member**, I cannot approve a learner who hasn't submitted their monthly report — the approve button is disabled with a message "Report not submitted."

### Admin (Director / Super Admin)

5. **As admin**, when creating a privilege group, I assign a review committee (select users who will be reviewers).
6. **As admin**, I can change the committee members for a group at any time.
7. **As admin**, I see a dashboard showing: groups with pending renewals, approved count, paused count, overdue reports.

### Learner

8. **As a learner**, I see my renewal status on my privilege badge: "Active" (approved for this month), "Renewal Due" (report needed), "Pending Review" (report submitted, waiting for committee), "Paused" (not approved).
9. **As a learner**, I submit my monthly progress report before the 27th: app URL, GitHub URL, what I built this month, screenshot.
10. **As a learner**, I receive an email reminder on the 20th if I haven't submitted my report yet.
11. **As a learner**, I receive an email when my privilege is approved or paused.

### System (Automated)

12. **As the system**, on the 1st of each month, I check each privilege member: if their renewal for the current month is not approved, I set their status to 'paused'.
13. **As the system**, I send email reminders to learners who haven't submitted reports by the 20th.
14. **As the system**, I send email notifications to committee members on the 22nd with a list of learners ready for review.

---

## Requirements

### Must-Have (V1.1)

| # | Requirement | Priority |
|---|-------------|----------|
| R1 | Monthly renewal cycle: privileges must be approved each month to continue | P0 |
| R2 | Committee assignment per privilege group (configurable list of reviewer users) | P0 |
| R3 | Learner monthly progress report submission (app URL, GitHub, description, screenshot) | P0 |
| R4 | Report is a gating condition — committee can't approve without it | P0 |
| R5 | Individual approval per learner (approve/deny with notes) | P0 |
| R6 | Auto-pause on 1st if not approved by 27th | P0 |
| R7 | Renewal status badge on learner dashboard: Active/Renewal Due/Pending Review/Paused | P0 |
| R8 | Email notifications: report reminder (20th), review ready (22nd), approved/paused | P1 |
| R9 | Admin dashboard: renewal overview across groups | P1 |
| R10 | Re-approval: paused learners can be approved again next month | P0 |
| R11 | Gap month: no retroactive changes when re-approved | P0 |

### Nice-to-Have (V2)

| # | Requirement | Priority |
|---|-------------|----------|
| N1 | Auto-signals: system checks GitHub last commit date and app URL liveness | P2 |
| N2 | WhatsApp notifications in addition to email | P2 |
| N3 | Committee voting (majority approval instead of single reviewer) | P2 |
| N4 | Renewal history timeline for each learner (months approved/paused) | P2 |

---

## Database Schema Changes

### New Table: `privilege_renewals`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| member_id | uuid FK | → privilege_members |
| month | date | First of the month (e.g., 2026-04-01) |
| status | text | 'pending', 'approved', 'denied', 'auto_paused' |
| report_id | uuid FK | → privilege_progress_reports (null if not submitted) |
| reviewed_by | uuid FK | → profiles (committee member who approved/denied) |
| reviewed_at | timestamptz | |
| review_notes | text | |
| created_at | timestamptz | |

UNIQUE(member_id, month) — one renewal record per learner per month.

### New Table: `privilege_group_reviewers`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| group_id | uuid FK | → privilege_groups |
| reviewer_id | uuid FK | → profiles |
| added_by | uuid FK | → profiles |
| added_at | timestamptz | |

### Modify: `privilege_members`

Add column:
- `renewal_status` text DEFAULT 'active' CHECK IN ('active', 'paused', 'pending_report', 'pending_review')

This is the live status that the attendance system checks. Updated by:
- Auto-pause job: set to 'paused' on 1st if renewal not approved
- Report submission: set to 'pending_review'
- Committee approval: set to 'active'

---

## Flow Diagram

```
Monthly 1st: privilege_members.renewal_status checked
  ├── Has approved renewal for this month? → status = 'active' (auto-OD continues)
  └── No approved renewal? → status = 'paused' (auto-OD stops, faculty sees normal student)

Monthly 20th: System email to learners with status = 'pending_report'
  "Your privilege renewal is due. Submit your progress report by the 27th."

Learner submits report → status = 'pending_review'

Monthly 22nd: System email to committee members
  "N learners are ready for renewal review."

Committee reviews each learner:
  ├── Approve → creates renewal record (status='approved'), member status → 'active'
  └── Deny → creates renewal record (status='denied'), member status → 'paused'

Monthly 27th deadline:
  └── Any learner still 'pending_review' or 'pending_report' → stays un-approved
      → On 1st, auto-pause kicks in
```

---

## Integration Points

### 1. Attendance Auto-OD Check (modify existing)

The existing attendance integration checks `privilege_members.status = 'active'`. Now it also needs to check `renewal_status = 'active'`.

```
When marking attendance:
  IF privilege_members.status = 'active' AND renewal_status = 'active'
    → Auto-OD (locked)
  ELSE
    → Normal attendance (manual)
```

### 2. Learner Dashboard Badge (modify existing)

Current: Shows "Active" badge always.
New states:
- "Active" (green) — approved for this month
- "Renewal Due" (amber) — need to submit report
- "Pending Review" (blue) — report submitted, waiting for committee
- "Paused" (red) — not approved, privilege inactive

### 3. Progress Report Form (V1.1 — currently placeholder)

The placeholder at `/academic/privileges/my/report` becomes the actual submission form.
Fields: app URL, GitHub URL, description (what I built), screenshot upload.

---

## Permissions

| Action | Roles |
|--------|-------|
| Submit progress report | learner (self only) |
| View renewal dashboard | super_admin, admin |
| Review & approve/deny renewals | assigned committee members |
| Assign committee members | super_admin, admin |
| Override auto-pause | super_admin only |

---

## Edge Cases

| Case | Handling |
|------|----------|
| New member added mid-month | First month is auto-approved (no renewal needed until next month) |
| Learner submits report after 27th but before 1st | Committee can still approve in the 3-day window (28-31st) |
| Committee member removed from group | Existing approvals stay. Removed reviewer can't approve future months. |
| Learner in 2 groups with different committees | Each group's renewal is independent. Both committees must approve. |
| All committee members inactive | Admin alert: "No active reviewers for group X" — privilege auto-pauses |
| Report submitted but with empty fields | All fields optional except description. Minimum 10 characters required. |
| System email fails | Log the failure. Don't block the process. Learner can still see status in-app. |

---

## Out of Scope (V1.1)

- WhatsApp notifications (V2)
- Auto-signals checking GitHub/app liveness (V2)
- Committee voting/quorum (V2 — any single committee member can approve for now)
- Retroactive OD fill for gap months (explicitly rejected)
- Mobile push notifications

---

## Success Criteria

| # | Criteria | Verification |
|---|----------|-------------|
| 1 | Committee assigned to a privilege group | Group detail shows committee members |
| 2 | Learner submits monthly report | Report appears in committee review dashboard |
| 3 | Committee approves → privilege stays active | Learner badge shows "Active", attendance auto-OD works |
| 4 | Committee denies → privilege pauses | Learner badge shows "Paused", attendance becomes manual |
| 5 | No action by 27th → auto-pause on 1st | Status changes automatically without human action |
| 6 | Paused learner re-approved next month | Status returns to "Active", auto-OD resumes |
| 7 | Gap month not retroactively changed | Manual attendance/marks from paused month stay as-is |
| 8 | Email notifications sent on schedule | 20th reminder, 22nd committee alert, approval/pause notices |

---

*Interview conducted: 30 March 2026*
*Spec version: 1.0*
*Parent module: Exceptions & Privileges*
*Ready for: Phase 2 (Planning + Task Decomposition)*

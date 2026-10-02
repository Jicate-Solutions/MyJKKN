# CVViZ UI Feature Spec for MyJKKN Recruitment (screen by screen)

**Date:** 2026-10-01 · **Companion:** [cvviz-to-myjkkn-recruitment-migration-2026-10-01.md](cvviz-to-myjkkn-recruitment-migration-2026-10-01.md)

**Source:** every CVViZ screen was opened read-only (DTO account) and its fields, columns, filters and actions captured. Raw captures are in `scratchpad/cvviz/ui/*.json`.

**Legend** for the **MyJKKN** column:
- ✅ exists in `/hr/recruitment` today
- 🟡 exists but needs the listed delta
- 🆕 new build

Build order and batches are in §12.

---

## 0. Global shell

| CVViZ element | Behaviour | MyJKKN |
|---|---|---|
| Top menu | Dashboard · Jobs · Candidates · Reports | ✅ sidebar group *Recruitment* (`lib/sidebarMenuLink.ts`) |
| Quick add (+) | Candidate / job / user / task | 🆕 optional: "Add candidate" and "Add job" in the page header |
| Quick Access | Pinned + recent pages | skip (MyJKKN has global search) |
| Calendar / Tasks / Settings / Bell icons | — | Tasks 🆕 (§9). Settings: §10. Bell = existing notifications ✅ |
| Feedback / Help | — | skip |

---

## 1. Dashboard (`/dashboard`) → `/hr/recruitment` 🟡

| Block | Content | Notes |
|---|---|---|
| Header | Greeting, date, **Refresh**, scope toggle **My work / All accessible**, **Filters**, "Updated hh:mm" | Scope = assigned jobs vs institution scope |
| KPI cards ×4 | **Open jobs** · **Applications to review** (+ "N past review target") · **Interviews you scheduled** (today / next 7 days) · **Pending offers** (+ "N past response target") | Each card links to a filtered list |
| Action queue (tabs) | **Applications** (jobs with unreviewed apps, priority order) · **Feedback** (interviews awaiting scorecard) · **Offers** · **Overdue tasks** · **Record cleanup** (stale candidates) | Empty state for each tab |
| Upcoming | Today / 7 days toggle; tasks + calendar events; **My tasks**, **Set up calendar** | |
| Hiring intelligence | Date range; tabs **Source performance** · **Hiring outcomes** · **Talent opportunities** | Charts |

**Delta:** add the *Applications to review* and *Record cleanup* queues, the source-performance chart, and the "past target" SLA counters (review target and offer response target, configurable).

---

## 2. Jobs list (`/jobs`) → `/hr/recruitment/jobs` 🟡

- **Header:** title "Jobs", subtitle "Manage your requisitions and hiring teams", **Add Job**.
- **Status chips with counts:** All 388 · Pending Approval 3 · In Progress 340 · Cancelled 1 · Closed 26 · Archived 18.
  - CVViZ status codes: 3 = Pending Approval, 5 = In Progress, 9 = Cancelled, 10 = Closed, 11 = Archived.
  - MyJKKN `hr_recruitment_jobs.status`: draft / open / on_hold / closed / filled.
  - **Delta:** add `pending_approval`, `cancelled` and `archived`, or map them (§12.3).
- **Toolbar:** search (title or job code) · **Filters** · **Views** (saved views) · Sort (Newest first …) · **Display** (columns).
- **Columns:** checkbox · **Job** (title, department, city, min-exp "3+ yr", job type) · **Status** · **Candidates** (count) · **Team** (recruiter avatars, +N) · **Updated** · **Actions** (Add candidates, Share job, ⋯ More: edit, clone, change status, delete).
- **Bulk actions:** status change and tag management on the selected jobs.
- **Pagination:** 10/25/50/100 per page, plus go-to page.

**Delta:**
- Team avatars column.
- Candidate-count column.
- Saved views (per user + team shared).
- Bulk status change.
- Job tags.

---

## 3. Job workspace (`/jobs/:id/*`) → `/hr/recruitment/approvals/[jobId]` 🟡

**Header:** breadcrumb Jobs / title · **Switch job** dropdown · status badge · department · location · experience · job type · **Copy Job ID** · **Add candidates** · **Share job** · ⋯.

Tabs: **Candidates · Job Details · Notes · Analytics**. MyJKKN already has the candidates / interviews / notes / analytics / details tabs.

### 3.1 Candidates tab

- **Search:** name, email, role, skill, company. **Show filters**, **Saved views**, **Sort** (default: stage, then score), **Display options**.
- **Stage chips:** All N · one chip per stage in use with its count (from `GET /jobs/:id/candidate-stages`).
- **Row:**
  - checkbox
  - **Name** (opens profile) + avg rating "4.0 out of 5 from N reviews"
  - email · phone (`tel:` link) · source badge
  - **Profile summary:** experience "6 years 8 Months", education
  - **Match & fit:** score or "Not evaluated yet"
  - **Stage** button (opens the change-stage dialog)
  - "N other job applications" popover
  - **Add note** · **Send email** · ⋯ (share, move to job, download resume, delete)
- **Bulk:** change stage, email, share, export, delete.
- **Change-stage dialog:** stage picker (hierarchical, §11), **reason** (required for reject codes, 29-reason list), remark (rich text), notify candidate (email template).

**Delta:**
- The stage chip bar.
- A rejection-reason picker.
- An "other applications" popover, matched by email across jobs and the archive.
- Ratings in the row.

### 3.2 Job Details tab (read view)

- Summary strip: N skills · N team members · Qualification · Hiring manager · Department · Compensation.
- Collapsible sections:
  - **Job Approval Status**
  - **Basic Details**: title, job code, employer, job type, department, location + ZIP
  - **Specifications**: min/max experience, qualification, skills chips with level B/I/P/E and Mandatory/Desired, salary
  - **Hiring Team**
  - **Job Description**: rich HTML, word count, read time

### 3.3 Notes tab

Rich-text composer (bold, italic, underline, strike, quote, lists, indent, link) · `@` mention notifies a teammate · **Note type** select (Note / …) · **Team visibility** toggle · **Add Note** · feed with an empty state. MyJKKN: ✅ `hr_recruitment_job_notes`. **Delta:** @mentions and a visibility flag.

### 3.4 Analytics tab

- Range: **30 days · 6 months · 1 year**, custom start/end · **Refresh**.
- KPIs: Candidates uploaded · Shortlisted (% conversion) · Interviewed · Offered · Joined · Avg days to join (from job creation).
- Charts: **Hiring funnel** · **Source mix** · **Resume upload trend** (daily, top 5 sources) · **Time to stage**.
- Tables: Resume upload sources (Source, Uploaded resumes, Active days); Time-to-stage (Stage, Candidates, Average days).

---

## 4. Job create / edit wizard (`/jobs/new`, `/jobs/:id/edit?tab=`) → `/hr/recruitment/jobs/new|[id]/edit` 🟡

An 8-section stepper ("Section n of 8 · x/8 done") with **Save & Continue** on each section and **Back / Help** in the header.

| # | Section | Fields / controls | MyJKKN |
|---|---|---|---|
| 1 | **Job Details** | **Basic:** Job Title (counter /100 + quality hint), Job Code (+ regenerate), Department, Job Type, Industry, Employer Type, Job Function. **Location:** remote checkbox, Country, State, City, ZIP. **Specification:** Education Level, Qualifications (multi), Min Exp, Max Exp, Salary currency, Min, Max, Pay frequency, "Display salary on job page". **Job Description:** rich text with *Generate Job Description* (AI) and Description / Responsibilities / Requirements blocks. **Skills:** add skill, Required / Nice to have, level Basic / Intermediate / Pro / Expert, remove, *Generate Skills* (AI) | 🟡 most columns exist (job_type, industry, employer_type, location, education_level, experience, salary, display_salary). **Add:** `skills jsonb` [{name, required, level}], `qualifications text[]`, `job_function`, `is_remote`, AI JD/skills generation (optional) |
| 2 | **Benchmark Resume** | Upload up to 20 resumes of good hires to rank applicants by similarity | 🆕 P3 (AI ranking) |
| 3 | **Hiring Team** | Assigned team members table (member, role), add/remove; external vendors table | 🆕 `hr_recruitment_job_team(job_id, profile_id, role)`. Drives "My work" scope and notifications |
| 4 | **Job Application** | Toggles: Resume mandatory · Show resume upload · Include pre-screening questions. **Select Pre-Screening Questions** from the bank. Live preview of the apply form (Upload Resume → Applicant Details → Confirm; .pdf/.doc/.docx < 2 MB) | 🟡 apply wizard exists. **Add:** per-job question selection + toggles |
| 5 | **Hiring Pipelines** | Choose a pipeline template (stage set) | 🟡 MyJKKN uses a fixed stage model (`stage-model.ts`). Keep it fixed in v1 |
| 6 | **Interview Scorecard** | Feedback Type radio: **Basic** (overall rating + remarks) / **Detailed** (technical, soft skills, overall), plus live preview and editable criteria | ✅ `hr_recruitment_scorecards`. Add the basic/detailed choice per job |
| 7 | **Job Approval** | Approval group picker; emails approvers; "already approved" state | ✅ `hr_approval_flows` (stronger) |
| 8 | **Get More Applicants** | **Free Job Boards** on/off + per-board checkboxes (20 boards; LinkedIn needs a company email), **Premium Advertising** (campaign), **Career Page Publishing** (Show on Career Page, View, Copy public link, Embed code), **Share Job** (LinkedIn, Twitter, Facebook, email, vendor) | 🟡 public careers API exists. **Add:** share buttons, embed snippet, Google Jobs JSON-LD, Indeed XML feed (P3) |

---

## 5. Candidate profile (`/jobs/:jobId/candidates/:id/profile`) → `/hr/recruitment/candidates/[id]` 🟡

The candidate screen itself was not opened (opening it may mark the candidate as viewed). The layout below is derived from the profile APIs.

- **Header:** name, avg rating, stage button, email/phone, source, applied date, job, tags, ⋯ (move / copy to job, share, download, delete).
- **Tabs:**
  - **Profile**: experience, current role and company, qualification[], worked-in cities, location, skills, social links.
  - **Resume**: inline PDF viewer and download.
  - **Timeline**: actions status_change, notes, feedback, resume_sourced, resume_update, resume_shared, document, event, contact_sourced. Each shows actor, time and remark.
  - **Notes**: threaded, private flag, mentions, tasks.
  - **Feedback**: per reviewer, criteria + rating + remarks; "Add feedback".
  - **Screening answers**: question + answer; types input, text, switch, url, choice.
  - **Other jobs**: same person's other applications.
  - **Emails**: sent and received.

**Delta:** a unified timeline, a screening-answers panel, an "other applications" panel (live + archive), an inline resume viewer (Drive proxy).

---

## 6. Candidate database (`/discover`) → `/hr/recruitment/candidates` 🟡 + archive 🆕

- **Header:** "Candidate database", subtitle "Search, organize, and engage your talent network", **Add candidates**.
- **Tabs with counts:** All candidates 24,934 · In active jobs 20,987 · Talent pool 3,947.
- **Toolbar:** search · Filters · Views · Sort (Recently added) · Display.
- **Columns:** Candidate (name, email, phone, source) · Profile Summary (experience, education, or "Extract resume details") · Job & Stage (job, stage, "+N more job") · Source & Added (source, date) · Actions (Add note, Send email, ⋯).
- **Add candidates:** upload resumes (single or bulk) to a job or to the talent pool.

**Delta:** a talent-pool concept (applications without a job), cross-job dedupe by email, and an archive tab (§12).

---

## 7. Reports (`/reports/*`) → `/hr/recruitment/reports` 🆕

Shared layout:
- Header "Reports".
- Sub-tabs: **Jobs Summary · Users Summary · Vendors Summary · Resume Upload · Time To Fill · Trending Recruitments**.
- Range 1M / 6M / 1Y + date pickers (max 366 days) · Refresh · **Export**.

| Report | KPIs | Chart(s) | Table columns | Group-by |
|---|---|---|---|---|
| Jobs Summary | Matching jobs, Candidates, Shortlisted %, Joined % | Hiring funnel; Job status mix | Job, Status, Customer, Department, Candidates, Shortlisted, Interviewed, Offered, Joined | Jobs / Departments (Customers n/a) |
| Users Summary | Users, Jobs assigned, Candidates handled, Joined | User performance (top 25) | User, Role, Jobs, Candidates, Shortlisted, Interviewed, Offered, Joined | — |
| Resume Upload | Uploaded resumes, Active sources, Top source %, Active days | Upload trend (top 5); Source mix | Source, Uploaded resumes, Active days | — |
| Time To Fill | Average stage time, Stage entries, Fastest stage, Avg time to join | Time to stage | Stage, Candidates reaching stage, Avg days from job creation | — |
| Trending / Vendors | (customer / vendor based, not used by JKKN) | — | — | skip |

**MyJKKN:** build Jobs, Users, Source and Time-to-fill reports with an **Institution** group-by and filter (replacing CVViZ "Customers"), Excel export, and RLS institution scope.

---

## 8. Calendar (`/calendar`) → skip / existing

Schedule interview · New event · Google / Outlook connect · Scheduling links (needs an upgrade; unused). MyJKKN already has interview booking slots (`/api/public/interview-booking`) ✅.

## 9. Tasks (`/tasks`) → 🆕 P3

- Header **Create task**; tabs **My tasks / All tasks**.
- Chips: Open, Overdue, Due today, Upcoming, Completed, All.
- Search; sort (Due date first); filters.
- Task fields: note (rich), assignee, due date, private, linked entity (candidate / none), complete.

MyJKKN: fold into My Desk instead of a new screen. CVViZ tasks (1,718, all stale) are **archive only**.

---

## 10. Settings → MyJKKN equivalents

| CVViZ settings page | Fields / columns | MyJKKN |
|---|---|---|
| Profile | photo, first/last name, email, phone, timezone, meeting link, working days and hours | ✅ user profile |
| Users | search, status filter, role filter; columns User, Company, Role, Status, Updated, Actions; **Add User** | ✅ MyJKKN users / RBAC |
| User Roles | Role, Permissions (count), Assigned users, Updated; 46 permission flags | ✅ permission keys `hr.recruitment.*` |
| Departments | Department, Default, Actions; 79 rows | ✅ `departments` (institution-scoped). The CVViZ list is mapped, not recreated |
| Hiring Managers | Hiring manager, Department, Actions | 🟡 use institution principals / HODs (no separate table) |
| Job Approval | Approval groups | ✅ `admin/recruitment-approval-flows` |
| Hiring Pipelines | custom stage sets | 🟡 fixed in v1 |
| **Screening Setup** | tabs Questions / Forms; columns Type, Question, Database Mapping, Mandatory, Default, Actions; filters by answer type and attribute; **Add Question** (types input, text, switch, url, choice) | 🆕 `hr_recruitment_screening_questions` (bank) + `hr_recruitment_job_questions` + answers. Seeded from the 21 CVViZ questions |
| Email Templates | Template, Type (Candidate Rejection / Other…), Visibility (Private/Shared), Actions; merge fields `{{CANDIDATE_FIRST_NAME}}`, `{{JOB_PROFILE}}`, `{{COMPANY_NAME}}` … | 🆕 P3 editable templates (today fixed `hr-decision-email`) |
| Evaluation Templates | AI templates (Benchmark Competency / Career Level / Balanced …) | skip (AI) |
| Email Preferences | signature, reply-to email, sender name | 🟡 env-level sender |
| Notifications | email + in-app × (status change, new application) | 🟡 MyJKKN notification prefs |
| Integrations | Outlook mail, Google / Outlook calendar, voice / SMS | skip |
| Automations | rules + 6 templates + auto-evaluation (0 used) | skip |
| Referral Portal | off | skip |
| GDPR Compliance | off | covered by the PII retention decision (migration spec §8) |
| Career page (403 for this account) | brand, path, publish / unpublish, editor, history | ✅ public careers |

---

## 11. Pipeline stage model (UI)

The stage picker is a two-level tree. MyJKKN shows it grouped like this; mapping to DB statuses is in migration spec §3.3.

- **Screening:** New · No Response – Phone · Phone Screened · Internal Review · Shared · Internal Shortlisted · Resume Shortlisted · Hold · Internal Hold
- **Assessment:** Assessment / Trial Invited · Accepted · Scheduled · Passed · Failed
- **Interview:** 1st Interview Invited · Accepted · Scheduled · Passed · Reject · Failed · Intermediary · Final Interview Invited · Accepted · Scheduled · Passed · Failed · Declined by Candidate · No Show
- **Offer:** Job Offered · Offer Accepted · Offer Rejected · Background Screening
- **Outcome:** Joined · Not Joined · Not Interested
- **Rejected** (needs a reason): Internal Screening Reject · Phone Screen Reject · Interview Reject · Job Offer Reject · Not Shortlisted · Rejected

Reason catalogue: 29 reasons across 4 groups (screening, interview, offer, general). Seeded from `/static/progresschangereasons`.

---

## 12. Batch plan: institution by institution

### 12.1 Batch order

Each batch = archive import for that institution, then department-map sign-off, then resumes, then promotion of live jobs, then UI smoke test with that institution's principal and HR.

Counts are from the 2026-10-01 snapshot. Institution is derived from the CVViZ department, so §12.2 sign-off is required.

| Batch | Institution | Jobs | Applications | Active* | Joined |
|---|---|---|---|---|---|
| **B0 pilot** | CON: Nursing (JKKN + Sresakthimayeil) | 25 | 219 | 82 | 22 |
| B1 | JICATE Solutions | 7 | 455 | 87 | 7 |
| B2 | COE: College of Education | 31 | 714 | 11 | 0 |
| B3 | AHS: Allied Health Sciences (+ Biostatistics dept, 3 jobs / 126 apps) | 38 | 1,192 | 199 | 33 |
| B4 | DCH: Dental College & Hospital | 76 | 1,955 | 271 | 52 |
| B5 | COP: College of Pharmacy | 46 | 2,670 | 292 | 56 |
| B6 | School: JKKN Matric HSS | 29 | 2,786 | 890 | 5 |
| B7 | CET: Engineering & Technology | 43 | 3,121 | 506 | 118 |
| B8 | CAS: Arts & Science (Self / Aided split needs a decision) | 52 | 4,109 | 164 | 36 |
| B9 | Main Administrative Office | 41 | 4,115 | 268 | 33 |
| B10 | Talent pool (job −99, no institution) + 17 rows on deleted jobs | — | 3,598 | 65 | 0 |
| **Total** | | **388** | **24,934** | **2,835** | **362** |

\*Active = past "New" or has notes. These rows carry notes, feedback and timeline.

The pilot is the smallest batch with real pipeline history. B10 goes last and is visible to HR admins only.

### 12.2 Per-batch checklist

1. Export a department-map sheet for the institution (CVViZ dept → `institution_id`, `department_id`). The principal or HR signs off.
2. Dry run of `scripts/cvviz/import-archive.ts --institution=<code> --dry-run`: counts, stage histogram, dedupe report.
3. Live run: upsert into `hr_cvviz_jobs`, `hr_cvviz_applications`, `hr_cvviz_activity`. This is idempotent on CVViZ ids, so it can be re-run.
4. Resume transfer for the batch to Drive `HR Recruitment/CVViZ Archive/<institution>/…`, with a manifest CSV and a retry list.
5. Promote that institution's still-open jobs and their recent applications (migration spec §5.5).
6. Smoke test: the institution's principal sees only their rows (RLS); 10 spot-checks against CVViZ.
7. Sign-off recorded, then the next batch.

### 12.3 Job status mapping (UI chips)

| CVViZ | MyJKKN `hr_recruitment_jobs.status` |
|---|---|
| 3 Pending Approval | `draft` (approval flow pending) |
| 5 In Progress | `open` when promoted; archive otherwise |
| 9 Cancelled | `closed` + close_reason "cancelled" |
| 10 Closed | `closed` |
| 11 Archived | archive only |

---

## 13. Build backlog (UI-level, ordered)

| # | Item | Screens | Size |
|---|---|---|---|
| 1 | Archive tables + import script (per institution) | — | M |
| 2 | `/hr/recruitment/archive`: search list + detail drawer (profile, resume, timeline, notes, feedback, screening answers) | §5, §6 | M |
| 3 | `cvviz_url` optional → Drive resume viewer | §5 | S |
| 4 | Stage chip bar + hierarchical stage picker + reject reasons | §3.1, §11 | M |
| 5 | Screening question bank + per-job selection + answers on apply | §4.4, §10 | M |
| 6 | Job wizard deltas: skills with levels, qualifications, job function, hiring team | §4 | M |
| 7 | Other-applications popover (live + archive, by email) | §3.1, §5 | S |
| 8 | Reports: Jobs / Users / Sources / Time-to-fill with institution group-by + export | §7 | M |
| 9 | Dashboard queues + SLA counters | §1 | S |
| 10 | Job list: saved views, team avatars, bulk status, tags | §2 | S |
| 11 | Share / embed / Google Jobs JSON-LD / Indeed feed | §4.8 | M |
| 12 | Editable email templates | §10 | S |
| 13 | Tasks on My Desk | §9 | S |

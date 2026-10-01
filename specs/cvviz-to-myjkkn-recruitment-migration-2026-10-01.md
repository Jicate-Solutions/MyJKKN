# CVViZ → MyJKKN Recruitment: Feature Spec + Data Migration

**Date:** 2026-10-01 · **Status:** DRAFT, awaiting decisions in §8 · **Owner:** DTO

The source is the CVViZ workspace "JKKN Institutions", tenant 2814, used since 2022-05-13. It was explored read-only with the DTO account; nothing was changed in CVViZ.
The target is MyJKKN `/hr/recruitment`, which already exists (see §4).

---

## 1. Goal

1. Document every CVViZ feature JKKN uses, so MyJKKN can replace it.
2. Copy all CVViZ data into MyJKKN, so nothing is lost when the subscription stops.
3. Remove MyJKKN's last dependency on CVViZ. Today `hr_recruitment_candidates.cvviz_url` is NOT NULL, so every MyJKKN candidate must point to a CVViZ CV.

---

## 2. CVViZ feature inventory (what JKKN has)

The plan is AppSumo lifetime (`AS LTD Plan`), valid until 2052. Limits: 25,000 resumes (24,934 used, so it is **at the cap**), 15,000 emails per cycle (13,949 used), unlimited jobs and users.

| # | Module | CVViZ feature | Used by JKKN? |
|---|---|---|---|
| 1 | **Dashboard** | Open jobs, applications to review, interviews, pending offers, action queue (applications / feedback / offers / overdue tasks / record cleanup), upcoming tasks, source performance and hiring outcomes | Yes |
| 2 | **Jobs** | Create, clone, edit; JD (HTML); department; job function (category); industry; employer type; job type; location; experience range; salary range and interval; qualifications; skills (must-have / nice-to-have with level); job code; validity in days; assigned recruiters; hiring manager; job approval workflow; close reasons; tags | Yes, 388 jobs |
| 3 | **Job publishing** | Career page `jobs.cvviz.com/jkkn_institutions`, plus a multi-board push to Indeed, LinkedIn, Glassdoor, Google Jobs and 17 others | Yes. Sources: CareerPage 54%, Indeed 16%, LinkedIn 9% |
| 4 | **Application form** | Resume mandatory; pre-screening questions (21 in the global bank: research h-index, grants, NEP awareness, GitHub, LinkedIn…); questions per job | Yes |
| 5 | **Candidates per job** | List with match, fit and stage; stage chips; search and filters; saved views; bulk select; sort by stage and grade | Yes |
| 6 | **Hiring pipeline** | 50 stage codes in a parent/child hierarchy (New → Phone Screened → Shortlisted → Interview rounds → Assessment → Offered → Background check → Joined; reject branches carry reasons) | Yes, see §3.3 |
| 7 | **Candidate profile** | Parsed resume (experience, qualification, cities, current role); resume file; tags; other job applications by the same person | Yes |
| 8 | **Notes** | Per candidate and per job; private flag; @mentions; replies | Yes, 2,246 candidates have notes |
| 9 | **Feedback / ratings** | Per-reviewer rating (1–5) plus a remarks scorecard | Yes |
| 10 | **Timeline** | Status changes with remark and actor, notes, feedback, emails | Yes |
| 11 | **Tasks** | Assignable, due date, linked to a candidate | Yes, 1,718 tasks (1,714 still open) |
| 12 | **Candidate database** | Global talent pool: 24,934 rows = 20,987 on active jobs + 3,947 in the talent pool | Yes |
| 13 | **Email** | 9 templates with merge fields (`{{CANDIDATE_FIRST_NAME}}`, `{{JOB_PROFILE}}`…); send to candidate; daily limit | Yes, a light-use set |
| 14 | **Users & roles** | 106 users (75 active, 23 invited, 8 inactive); 17 custom roles over 46 permission flags | Yes |
| 15 | **Departments / Hiring managers** | 79 departments, named "Dept - College"; 9 hiring managers | Yes |
| 16 | **Reports** | Sources, jobs, recruiters, time-to-fill, trends (max 366-day window) | Yes |
| 17 | **Calendar** | Google/Outlook connection | No connections |
| 18 | **Vendors, customers, contacts, email campaigns, AI sourcing, webhooks, API** | — | Not enabled or not used |

### 2.1 CVViZ API (for reference)

The REST API is `https://api.cvviz.com`. It uses a Bearer JWT from `POST /auth/application/login` and allows 100 requests per minute. Every endpoint below was verified with a GET:

```
GET /me, /me/usage, /app-config, /reference-data/application-shell   (enums, stage codes, export fields)
GET /jobs?page&pageSize<=100, /jobs/counts, /jobs/{id}, /jobs/{id}/screening-questions
GET /jobs/{id}/candidates?page&pageSize, /jobs/{id}/candidate-stages, /jobs/{id}/notes
GET /jobs/{jobId}/candidates/{canId}                (profile)
GET /jobs/{jobId}/candidates/{canId}/notes|feedback|timeline|screening-answers
GET /candidate-database?page&pageSize<=500&sortBy=audit_insert&sortOrder=desc, /candidate-database/counts
GET /users, /roles, /departments, /hiring-managers, /screening-questions, /email-templates (pageSize<=100)
GET /tasks?scope=visible, /static/progresschangereasons, /approval-groups, /vendors
GET /reports/{sources|jobs|recruiters|dashboard|time-to-fill|trends}?from&to   (≤366 days)
Resume files: https://fileman.cvviz.com/files/2814_files/{jobId}/{fileName}   ← publicly readable, no auth
```

> ⚠️ **Security finding:** resume PDFs open from their URL without any login. All 24,934 CVs, which contain PII, are effectively public to anyone who has or guesses the link. This is one more reason to move off CVViZ.

---

## 3. Collected data (snapshot 2026-10-01)

Stored outside the repo (it contains PII) in the session scratchpad `cvviz/data/`. **It must not be committed.**

| Dataset | Rows | File |
|---|---|---|
| Candidate applications | 24,934 (18,364 unique emails, 53 with no email) | `candidates_part1.json`, `candidates_part2.json` |
| Jobs (list) | 388 | `masters.json → jobsList` |
| Job details (JD, skills, publication, recruiters, approvers, screening Qs) | 388 (318 with job-level screening Qs, 335 with hiring manager) | `job_details.json` |
| Per-job stage counts and job notes | 388 / 2 notes | `job_details.json` |
| Candidate notes / feedback / timeline / screening answers | 2,835 candidates (every one with notes or past "New") → 4,610 notes · 849 feedback · 16,391 timeline events · 5,388 screening answers | `candidate_activity.json` |
| Screening answers for the remaining "New" applicants | about 22k candidates | `screening_answers_new.json` |
| Tasks | 1,718 | `masters.json → tasks` |
| Users / roles / departments / hiring managers | 106 / 17 / 79 / 9 | `masters.json` |
| Screening questions / email templates | 21 / 9 | `masters.json` |
| Reference data (50 stage codes, 29 reject reasons, enums) | — | `masters.json → shell, progressReasons` |
| Resume PDFs | 24,934 | **Not downloaded yet.** This is phase M3. |

### 3.1 Data profile

- **Applications by year:** 2022: 1,609 · 2023: 9,640 · 2024: 7,674 · 2025: 4,223 · 2026: 1,788
- **Sources:** CareerPage 14,168, Indeed 4,161, CareerPageGeneric 3,419, LinkedIn 2,141, App 525, Neuvoo 336, others under 100. Case variants such as `careerPage` and `linkedin` need to be normalised.
- **Stages:** New 22,778 (91%), Joined 362, Not Interested 341, No Response 295, Resume Shortlisted 180, Final Interview Passed 168, Not Shortlisted 148, others under 130.
- **Jobs:** all 388 are Full Time. 280 were created in 2022. Categories: FACILITATOR 179, Assistant Professor 37, Senior Lecturer 18, Reader 18… Status codes: 5 = 340 (in progress), 10 = 26, 11 = 18, 3 = 3, 9 = 1.
- **One CVViZ "candidate" row is one application** (person × job). The same email appears on several rows.

### 3.2 Candidate row shape (CVViZ)

`id, originalJobId, job{id,title,code}, firstName, lastName, email, phone, source, uploadedBy, currentRole{title,company,duration}, experienceMonths, qualification[], workedInCities[], currentLocation{…}, skillMatchRating, stage{code,label,parentCode}, statusUpdate{remark,by,at}, tags[], counts{notes,otherJobs,feedbackRatings}, feedbackRatingAverage, resume{fileName,url}, createdAt, updatedAt`

### 3.3 Stage mapping: CVViZ stage → MyJKKN

| CVViZ stage codes | `hr_job_applications.status` | `hr_recruitment_candidates.status` (only when promoted) |
|---|---|---|
| 0 New | `pending` | — |
| 2 No Response, 3 Phone Screened, 4 Internal Review, 5 Shared | `reviewed` | — |
| 9 Internal Shortlisted, 10 Resume Shortlisted, 13 Assessment (41–44), 15 Interviewed (51–59), 65/66 Hold | `shortlisted` | `pending_approval` |
| 60 Job Offered, 62 Offer Accepted, 63 Background Screening | `promoted` | `offer_issued` |
| 999 Joined | `promoted` | `joined` |
| 64 Not Joined | `promoted` | `no_show` |
| 61 Offer Rejected, -97 Job Offer Reject | `promoted` | `withdrawn` |
| -99, -98, -96, -95, -92, -90, -89…-80 (rejects), -5 Not Interested | `rejected` | `rejected` (if promoted) |

---

## 4. What MyJKKN already has

`/hr/recruitment` is a full ATS (spec `myjkkn-hr-module-spec-v4-evidence.md`):

| CVViZ feature | MyJKKN equivalent | Gap |
|---|---|---|
| Jobs CRUD + JD | `hr_recruitment_jobs`, `/hr/recruitment/jobs` | No `skills[]` with levels, `validity_days`, assigned recruiters, `hiring_manager` or `close_reason`. `role_category` is required and has no CVViZ equivalent, so it must be derived. |
| Career page | `/api/public/careers/jobs/*` | **No job-board syndication** (Indeed, LinkedIn, Google Jobs). Indeed + LinkedIn bring 25% of applicants. |
| Apply form + resume | `hr_job_applications`, Drive upload `uploadResumeToJobFolder` | Pre-screening questions per job are missing. |
| Pipeline stages | `hr_job_applications.status` (5 values) + `hr_recruitment_candidates.status` (10 values) + interviews/scorecards | Coarser than CVViZ's 50 codes. Interview rounds are separate rows, which is acceptable. Reject *reasons* are missing. |
| Notes | `hr_recruitment_job_notes`, `hr_recruitment_candidate_comments` | Comments sit on *candidates*, not on raw applications. |
| Feedback | `hr_recruitment_scorecards` | Fine. |
| Approvals | `hr_approval_flows` (stronger than CVViZ) | — |
| Packages / offer / onboard-to-staff | packages, offer, `onboard-to-staff` | MyJKKN is ahead here. |
| Tasks | — (My Desk) | No recruitment tasks. 1,714 open CVViZ tasks are all stale (2022–2023). |
| Talent pool / global search | `/hr/recruitment/candidates` | No search across *all* past applicants. |
| Email templates | `hr-decision-email` | Templates are fixed in code. |
| Reports | `/hr/recruitment` dashboard + recruitment-need analytics | No source or time-to-fill report. |
| CV link | `hr_recruitment_candidates.cvviz_url NOT NULL` | **This must become optional or switch to Drive** before CVViZ is switched off. |

---

## 5. Migration design

### 5.1 Principle: archive first, promote selectively

The live workflow tables have strict invariants: `submitted_by NOT NULL`, approval-chain snapshots, `role_category`, and policies keyed to the approval engine. Putting 24,934 historical rows into them would flood approval queues and My Desk.

The plan instead:

1. **Archive (all data, read-only):** new `hr_cvviz_*` tables keep every CVViZ record in typed columns, plus a `raw jsonb` column holding the original payload. Nothing is lost.
2. **Promote (selected):** only applications on jobs that are *still being hired for* are copied into `hr_recruitment_jobs` / `hr_job_applications`, and linked back through `cvviz_*_id` columns.

### 5.2 New tables (migration `2026100110xxxx_hr_cvviz_archive.sql`)

```sql
hr_cvviz_jobs(
  cvviz_job_id bigint PK, job_code text, title text, status_code int, department_name text,
  category text, institution_id uuid NULL → institutions, department_id uuid NULL → departments,
  description_html text, qualifications text[], skills jsonb, salary jsonb, city text, state text,
  min_exp int, max_exp int, assigned_recruiters jsonb, created_by_name text,
  created_at timestamptz, closed_at timestamptz,
  myjkkn_job_id uuid NULL → hr_recruitment_jobs,         -- set when promoted
  raw jsonb NOT NULL, imported_at timestamptz default now())

hr_cvviz_applications(
  cvviz_candidate_id bigint PK, cvviz_job_id bigint → hr_cvviz_jobs,
  first_name text, last_name text, email citext, phone text, source text, source_normalized text,
  experience_months int, qualification text[], worked_cities text[],
  current_title text, current_company text,
  stage_code int, stage_label text, stage_remark text, stage_by text, stage_at timestamptz,
  tags text[], feedback_avg numeric,
  resume_filename text, resume_cvviz_url text, resume_drive_url text, resume_drive_file_id text,
  applied_at timestamptz, institution_id uuid NULL,
  myjkkn_application_id uuid NULL → hr_job_applications,
  raw jsonb NOT NULL)
  -- indexes: email, cvviz_job_id, stage_code, institution_id, applied_at

hr_cvviz_activity(            -- notes + feedback + timeline + screening answers, one table
  id bigserial PK, cvviz_candidate_id bigint → hr_cvviz_applications,
  kind text CHECK (kind IN ('note','feedback','timeline','screening_answer')),
  actor_email text, body text, value text, occurred_at timestamptz, raw jsonb NOT NULL)

hr_cvviz_reference(kind text, key text, payload jsonb, PRIMARY KEY(kind,key))
  -- users, roles, departments, hiring_managers, screening_questions, email_templates, stage_codes, reasons, tasks
```

**RLS:** SELECT is allowed when the user `has_permission('hr.recruitment.view')` AND `role_has_institution_access(institution_id)` (rows with NULL institution are HR-admin only). There is **no** INSERT/UPDATE/DELETE policy; the import runs as service role.

### 5.3 Institution / department mapping

The 79 CVViZ departments use names like "Pharmacology - Pharmacy College". Steps:

1. Generate `cvviz_department_map.xlsx` with one row per CVViZ department and suggested `institution_id` + `department_id`. Match on the institution keyword (Dental / Pharmacy / AHS / Nursing / Engineering / Arts and Science / Education / Matric / JICATE / Admin Office) plus fuzzy matching on the department name.
2. **HR / DTO reviews the sheet.** The CAS Self/Aided split and the CNR/Sresakthimayeil split need a human decision.
3. The mapping is applied to `hr_cvviz_jobs`, and through them to the applications.

### 5.4 Resumes (phase M3)

- Download all 24,934 PDFs from `fileman.cvviz.com` with a throttled script (resumable, with a manifest CSV).
- Upload them to the Shared Drive through the existing `drive-upload.ts` pattern, into a new folder `HR Recruitment/CVViZ Archive/{year}/{job title} [{job code}]/`. They get no public permission, just like live resumes, and are served through the authenticated `/resume` proxy.
- Write `resume_drive_url` and `resume_drive_file_id` back to `hr_cvviz_applications`.
- After this, change `hr_recruitment_candidates.cvviz_url` to nullable, add `resume_url`, and backfill existing candidates from the archive by email.

### 5.5 Promotion rules (phase M4)

These are proposed and need confirmation in §8:

- **Jobs to promote:** jobs with `status_code = 5` **and** at least one application in the last 12 months. Expected to be a small number; most of the 340 "open" jobs are 2022 bulk-hiring posts with no activity. They become `hr_recruitment_jobs` with `status='open'` and `is_public=false`, so HR decides on republishing.
- **Applications to promote:** applications on promoted jobs go to `hr_job_applications`, with status mapped per §3.3, `source='external_website'` and `utm_source=<cvviz source>`.
- Joined, rejected and old applications **stay archive-only**.

### 5.6 UI

- **`/hr/recruitment/archive`** (new, read-only) offers:
  - CVViZ applications search: name, email, phone, job, institution, stage, source, year, with server-side paging over about 25k rows.
  - A detail drawer: profile, resume (Drive proxy), timeline, notes, feedback, screening answers, and other applications by the same email.
  - A jobs tab: archived jobs with application counts per stage.
- **Candidate detail** (`/hr/recruitment/candidates/[id]`): a "Previous applications (CVViZ)" panel matched by email.
- Menu: `'/hr/recruitment/archive': 'hr.recruitment.view'` in `MENU_PERMISSIONS`. No new permission key.

### 5.7 Gap features to build after migration (separate specs, prioritised)

1. **P1:** Make `cvviz_url` optional / move to Drive resume (this unblocks switching CVViZ off).
2. **P1:** Talent-pool search across archive + live applications (dedupe by email).
3. **P2:** Pre-screening questions per job (21-question bank → `hr_recruitment_screening_questions` + answers).
4. **P2:** Reject reasons (29-reason catalogue) on application and candidate rejection.
5. **P2:** Source and time-to-fill reports.
6. **P3:** Job-board syndication. At minimum, Google Jobs JSON-LD on the careers page plus an Indeed XML feed. LinkedIn needs a partner API.
7. **P3:** Editable email templates with merge fields.
8. Not migrating: CVViZ calendar, vendors, campaigns, AI matching. 1,714 stale tasks go to the archive only.

---

## 6. Phases

| Phase | Work | Writes to MyJKKN? | Writes to CVViZ? |
|---|---|---|---|
| **M0** | Read-only export (this document) | No | **No** |
| **M1** | Archive migration (§5.2) + department map sheet | Schema only (file, applied by user) | No |
| **M2** | Import script `scripts/cvviz/import-archive.ts`: JSON → `hr_cvviz_*`, idempotent upsert on CVViZ ids, dry-run first | Yes (service role) | No |
| **M3** | Resume download → Drive, then backfill | Drive + 2 columns | No (GET only) |
| **M4** | Promote active jobs and applications (§5.5) | Yes | No |
| **M5** | `/hr/recruitment/archive` UI + candidate "previous applications" panel | Code | No |
| **M6** | Gap features (§5.7), then a final delta export, then CVViZ switch-off | Code | No |

**M2–M4 run institution by institution:** pilot Nursing, then JICATE, Education, AHS, Dental, Pharmacy, School, CET, CAS, Admin Office, and the talent pool last. Batch sizes and the per-batch checklist are in [cvviz-ui-feature-spec-2026-10-01.md §12](cvviz-ui-feature-spec-2026-10-01.md).

**Delta before switch-off:** re-run the export with `createdAt > snapshot` (sort `audit_insert desc`, stop at the last imported id). Upserts are idempotent.

---

## 7. Verification

- Row counts: `hr_cvviz_applications` = 24,934; `hr_cvviz_jobs` = 388; activity counts match the export manifest.
- Stage histogram after import equals §3.1.
- 20 spot-checks of random candidates: archive drawer vs CVViZ UI (name, stage, notes, resume opens).
- RLS: a principal of institution A cannot see institution B's archive rows (impersonation test, as in the memory note on impersonating a learner).
- No row is written to `hr_recruitment_candidates` / approval queues by M2/M3.

---

## 8. Decisions needed

1. **Archive vs full import.** This spec recommends archive tables plus selective promotion (§5.1) rather than pushing all 24,934 rows into the live workflow tables. Confirm.
2. **Promotion rule** in §5.5: "status 5 + an application in the last 12 months". Confirm or name the jobs.
3. **Department → institution map:** who reviews the 79-row sheet?
4. **Resume storage:** about 25k PDFs (estimated 5–10 GB) go to the Shared Drive. Confirm Drive quota, or keep only the resumes of joined and shortlisted candidates.
5. **PII retention:** keep applicants from 2022 (4+ years old)? A retention cut-off (for example, purge applications older than 3 years that were never shortlisted) would cut volume by about 45%.
6. **Stale CVViZ tasks** (1,714 open, 2022–23): archive only, not recreated. Confirm.
7. **Rotate the DTO CVViZ password.** It was shared in chat.

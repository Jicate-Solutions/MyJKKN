# MyJKKN HR Recruitment: how it works, and how it compares with CVViZ

**Date:** 2026-10-07 · **Scope:** `/hr/recruitment` and its public endpoints · **Owner:** DTO

**Companions:** [cvviz-full-product-spec-2026-10-03.md](cvviz-full-product-spec-2026-10-03.md) (every CVViZ feature, plus the best of ten other portals) and [cvviz-to-myjkkn-recruitment-migration-2026-10-01.md](cvviz-to-myjkkn-recruitment-migration-2026-10-01.md).

Nothing was changed while preparing this review. The code was read, and the live database was read for counts only.

---

## 1. Verdict

MyJKKN recruitment is a working hiring pipeline, and it is stronger than CVViZ from approval onward: an approval chain per role category, pay package negotiation, an offer step, an onboarding checklist and creation of the HR record.

It is weaker than CVViZ before approval: screening, searching, stages, interview feedback, communication and reports.

Four defects need attention first, because they affect what is live today:

1. **About 330 old CVViZ postings are on the public careers feed.** All 366 jobs are open, and an open job is public. 261 of them were created in 2022.
2. **Interview scorecards cannot be saved.** The code writes columns that do not exist in the live table. There are 0 scorecards.
3. **Panel members chosen in the schedule dialog are stored with the wrong kind of id**, so they are never recognised as panel members.
4. **Seven approved candidates have been waiting since February to April 2026.** They were submitted directly, with no job, and the action that creates the HR record is only offered inside a job.

Section 7 lists these and the other defects with evidence. Section 8 puts all improvement points in order.

---

## 2. Live state on 2026-10-07

| Item | Count | Note |
|---|---|---|
| Jobs | 366 | 332 imported from CVViZ on 2026-10-01 by `scripts/import-cvviz-jobs.py`; 34 created in MyJKKN |
| Jobs with status open | 366 | Every job. The import script says it lands jobs as draft, so they were opened afterwards |
| Jobs with a closing date | 0 | No screen can set one |
| Applications | 166 | First on 2026-06-27. 104 from the website, 62 keyed in. 101 website applications still pending |
| Candidates (in the approval pipeline) | 68 | 37 pending approval, 12 package fixed, 10 approved, 1 offer issued, 6 joined, 2 rejected |
| Candidates with no job link | 8 | Direct submissions from February to May 2026. 7 are approved or package fixed and have not moved since (B11) |
| Candidates joined | 6 | None has a link to an HR record, so the onboard action was not used for any of them |
| Candidates whose CV link still points to CVViZ | 8 | The other 60 point to Google Drive |
| Interviews | 10 | All still marked scheduled; 8 came from the public booking link |
| Scorecards | 0 | See 7.B |
| Approval flows | Active for each role category | One flow per organisation and role category |

---

## 3. How it works today

### 3.1 Screens

| Screen | Route | What it is for |
|---|---|---|
| Recruitment home | `/hr/recruitment` | Four link tiles and a help card. No numbers |
| Job postings | `/hr/recruitment/jobs`, `/jobs/new`, `/jobs/[id]`, `/jobs/[id]/edit` | Create and edit jobs; see a job with its applications |
| Apply for jobs | `/hr/recruitment/submit` | A signed-in user picks an open job and keys in an applicant in three steps |
| My submissions | `/hr/recruitment/my` | Candidates the signed-in user submitted |
| All candidates | `/hr/recruitment/candidates` | One read-only list of every application and candidate, with filters and Excel export |
| Candidate page | `/hr/recruitment/candidates/[id]` | Approval chain, onboarding, pay negotiation, discussion |
| Application page | `/hr/recruitment/applications/[id]` | Read-only applicant details and a screening note |
| Approvals | `/hr/recruitment/approvals` | What is waiting for me; every job with counts |
| Job workspace | `/hr/recruitment/approvals/[jobId]` | Tabs: Candidates, Interviews, Job Details, Notes, Analytics. Most daily work happens here |
| Interviews | `/hr/recruitment/interviews`, `/interviews/[id]` | List, schedule, complete, reschedule, cancel, scorecards |
| Approval flow builder | `/hr/admin/recruitment-approval-flows` | Define the approval chain per organisation and role category |
| Onboarding templates | `/hr/admin/onboarding-checklists` | Define checklist steps |
| Maintenance | `/hr/admin/recruitment-maintenance` | Repair tools |
| Public interview booking | `/book-interview` | Anyone picks a post and a time slot |
| Public careers | API only: `/api/public/careers/jobs` | The JKKN website builds its own pages from this feed. There is no careers page inside MyJKKN |

### 3.2 The flow, start to finish

1. **Create a job.** Title, institution, department, role category (teaching, medical, non-teaching, senior leadership, contract), job type, location, education level, qualifications, experience range, salary range, description, skills with level, positions open, and search-engine fields.
2. **Open it.** The button sets the status to open. That alone puts it on the public feed. A job needs no approval.
3. **Applications arrive** in one of three ways:
   - the website posts to the public apply endpoint (resume checked, duplicates blocked, consent recorded, confirmation email sent, HR notified in-app);
   - a signed-in user keys one in on the Apply screen;
   - a visitor books an interview on the public booking page, which creates a candidate directly.
4. **Screen.** In the job workspace, HR marks each application Reviewed, Shortlisted or Rejected, with one free-text note.
5. **Promote.** A shortlisted application becomes a candidate. The approval chain for the job's role category is copied onto the candidate and frozen.
6. **Approve.** Each approver in turn approves or rejects. A rejection needs a reason. A step may ask for an interview, but the interview does not block approval. HR heads can override a step with a comment.
7. **Fix the package.** After final approval, a pay package is proposed, countered and approved. The candidate becomes "package fixed".
8. **Issue the offer.** This records who marked the offer as issued and when. No letter or email is produced.
9. **Onboard and join.** HR starts an onboarding checklist. When every step is ticked, the onboard action opens a form, creates the row in the `staff` table and marks the candidate joined.

### 3.3 Two record types, one stage list

An **application** is one person applying to one job. A **candidate** is a person in the approval pipeline. Promotion links the two.

| Shown stage | Application status | Candidate status |
|---|---|---|
| Pending Review | pending | |
| Reviewed | reviewed | |
| Shortlisted | shortlisted | |
| In Approval | promoted | submitted, pending approval |
| Approved | | approved, package fixed, offer issued |
| Joined | | joined |
| Rejected | rejected | rejected |
| Closed | | withdrawn, offer rescinded, no show |

Points to know:
- A candidate is tied to its job only by a value inside a JSON field, not by a database link. 8 live candidates have no job.
- Package fixed and offer issued look the same as Approved in every list.
- Nothing reopens a closed candidate; the person must be submitted again.

### 3.4 Approval engine

- A flow belongs to one HR organisation and one role category. Its steps are ordered; each names a role or one pinned person, and may ask for an interview.
- The chain is frozen on the candidate at promotion. Later edits to the flow do not affect candidates already in progress.
- Decisions are made by one database function that locks the row, checks the approver and writes the step. Steps run one after another; there are no parallel steps.
- An approver finds their work in three places: the Approvals page, the job workspace and My Desk.
- A step stores "escalate after N hours", but nothing reads it. There are no reminders, no delegation and no send-back.

### 3.5 Interviews and booking

- An interview belongs to a candidate, with round number, time, duration, mode (in person, phone, video, walk-in), place or link, and a panel.
- It can be created five ways: the schedule dialog, the step-interview dialog in the workspace, the public booking page, linking an existing meeting, and rescheduling.
- The public booking page is one shared link onto one person's calendar. It reads that calendar from Google, offers slots for the next 14 days, creates the calendar event and a Meet link, and emails both sides. It also has a "call me back" form.
- An interview scheduled inside MyJKKN gets none of that: no calendar event, no email, no clash check.
- A scorecard has four ratings from 1 to 5 (overall, technical, communication, culture fit), strengths, concerns, and a five-level recommendation from strong hire to strong no hire. It is one per interviewer.

### 3.6 Package, offer, onboarding, joining

- **Package:** monthly salary, a break-up (basic, HRA, DA, special allowance, other), notes, and counter-offers. Visibility is limited to people with the package permissions, the proposer, the approver and the submitter.
- **Offer:** a status change only.
- **Onboarding checklist:** templates per cadre, with steps that can name a role or a person and an expected day. The running checklist is stored inside the candidate record.
- **Joining:** the form asks for name, gender, date of birth, marital status, joining date, email, phone, designation, employment category, department and institution. It creates the HR record and stores that record's id inside the candidate.
- **Not carried to the HR record:** the resume, the approved package, qualifications and experience, interview feedback, the approval history.

### 3.7 Access

- Ten permission keys: view, create, edit, delete, approve, approve override, three for packages, and one to view scorecards.
- Pages are guarded by key. The job workspace needs the approve key.
- The recruitment API routes check only that the caller is signed in. The database row rules do the real checking: the key, plus access to the row's institution.
- Public endpoints run with full database rights and do their own checks (allowed website origins, a hidden trap field, request limits).

### 3.8 Notifications

| Event | What is sent |
|---|---|
| Website application received | Email to the applicant; in-app notice to HR editors of that institution |
| Tagged in a candidate discussion | In-app notice to the tagged person |
| Onboarding started | In-app notice to the new joiner, if they already have an account |
| Interview booked on the public page | Calendar invitation and confirmation emails |
| Everything else | Nothing. That includes: keyed-in application, shortlist, reject, promote, approval step waiting, approval decision, package, offer, joined, interview scheduled inside MyJKKN |

---

## 4. Comparison with CVViZ

| Area | CVViZ | MyJKKN today | Position |
|---|---|---|---|
| Job form | 8-step wizard; skills with level; AI job description | One form with nearly the same fields, including skills with level | Level |
| Job status | Pending approval, in progress, cancelled, closed, archived; close reasons | Draft, open, on hold, closed, filled; any status can be set from any other; no reasons, no history | Behind |
| Job approval before publishing | Approval groups | None | Behind |
| Hiring team per job | Assigned recruiters and hiring manager | None; access is by institution | Behind |
| Publishing | Career page, 21 job boards, share links, embed code | Public feed for the JKKN website only | Behind |
| Application form | Resume, details, pre-screening questions per job | Resume and details only | Behind |
| Screening questions | Bank of questions; 318 of 388 jobs used them | None | Behind |
| Resume reading | Parsed into experience, education, cities, skills | Stored as a file only; details are typed by the applicant | Behind |
| Match score | Skill match and grade | None | Behind |
| Duplicate handling | Shows "other job applications" for the same person | Website path blocks the same email on the same job; "applied to N jobs" badge in the list | Level |
| Stages | About 50, two levels, with interview and assessment steps | 8 shown stages | Behind (decision taken to add sub-stages) |
| Rejection reasons | 29 standard reasons | Free text; optional at screening | Behind |
| Bulk actions | Stage change, email, share, export, delete | Export only | Behind |
| Candidate search | Full-text search across the whole database with filters and saved views | Good filters on one list, but it loads every row into the browser; no saved views | Behind |
| Talent pool | Candidates with no job; rediscovery | None | Behind |
| Candidate profile | 12 tabs: resume viewer, timeline, emails, documents, feedback, screening answers | Approval chain, onboarding, package, discussion. No resume viewer, no interviews, no timeline | Behind |
| Notes | Rich text, private flag, mentions, replies, tasks | Discussion with mentions on the candidate; plain notes on the job that cannot be edited | Behind |
| Email to candidates | Composer, templates, bulk email | One automatic confirmation email | Behind |
| Interview scheduling | Calendar link; scheduling links need a higher plan | Public self-booking with Google Calendar, Meet link and emails | **Ahead** |
| Interview feedback | Rating and remarks, or a detailed scorecard; average shown in lists | Scorecard designed but not working | Behind |
| Approval of the hire | None in the pipeline | Chain per role category, frozen per candidate, override, My Desk | **Ahead** |
| Pay package | "Final salary offered" field | Proposal, counter-offer, approval, restricted visibility | **Ahead** |
| Offer | Offer email and a public offer page | Status change only | Behind |
| Onboarding | None | Checklist templates and tracking | **Ahead** |
| Hand-over to HR | None; CVViZ ends at Joined | Creates the HR record | **Ahead** |
| Past JKKN history of a candidate | None | Shows alumni, earlier service and council roles by email | **Ahead** |
| Dashboard | Counts, action queue, source and outcome charts | Link tiles only | Behind |
| Reports | Jobs, users, sources, time to fill, with export | Per-job funnel only; one Excel export of candidates | Behind |
| Planning | None | Recruitment-need analysis by institution | **Ahead**, but not linked to jobs |
| Institution separation | One workspace; departments as labels | Real institutions with access rules | **Ahead** |
| Data safety | Resume files open without sign-in | Resumes in Google Drive with no public link; purge of rejected applicants with a log | **Ahead** |

---

## 5. Where MyJKKN is ahead

1. **Approval chain.** CVViZ has no approval of the hire. MyJKKN routes each candidate through named roles, records each decision, and lets HR heads override with a comment.
2. **Pay package.** Negotiation rounds are recorded and only the right people can see them.
3. **Onboarding and the HR record.** The pipeline continues past Joined into a checklist and the HR system.
4. **Institution scoping.** A principal sees only their own institution's hiring.
5. **Public self-booking of interviews**, tied to a real calendar.
6. **Website apply endpoint.** It checks the file's real type, blocks repeat applications, records consent, and does not reveal whether someone has already applied.
7. **JKKN history** of an applicant, which CVViZ cannot know.
8. **Recruitment-need analysis**, which shows where hiring is needed.

---

## 6. Where MyJKKN is behind

In order of how much daily work it costs:

1. **No screening help.** No questions, no knock-out rules, no reading of the resume, no score. Each of the 101 pending website applications has to be opened and read.
2. **No bulk actions.** Shortlisting or rejecting is one click per person.
3. **Coarse stages and no reason list.** Interview rounds, assessment and hold are not stages; rejection reasons are free text.
4. **Interview feedback is not usable**, and the candidate page shows neither interviews nor feedback.
5. **No communication to candidates** after the first confirmation: no rejection email, no interview call email for internally scheduled interviews, no templates.
6. **No reminders to approvers.** Work waits until someone opens My Desk.
7. **No dashboard and no reports** across jobs: source, time to fill, by institution, by recruiter.
8. **No talent pool and no search across history.**
9. **No offer letter.**
10. **Job lifecycle is loose:** no closing date, no approval, no history, manual count of positions filled.
11. **No job-board publishing** beyond the JKKN website.

---

## 7. Defects found

Each item names the file that shows it. "Live" means it was also confirmed against the live database or the live site on 2026-10-07.

### A. Affecting what is public or live now

| # | Defect | Evidence |
|---|---|---|
| A1 | **All 366 jobs are on the public feed**, including 261 CVViZ postings from 2022. A job is public whenever its status is open; the old per-job public switch is ignored. The live feed returns about 1.2 MB of jobs. | `lib/services/hr/public-careers/public-job.ts` (`isJobVisible`); **live** |
| A2 | **Skills are missing from the public feed.** The form saves each skill as an object; the feed keeps only plain text values, so the list comes out empty. | `public-job.ts` (`strArr`, `toPublicJob`); the test uses plain text, so it passes |
| A3 | **Deleting a job deletes its applications**, while the confirmation text says records are kept. Resume files stay in Drive and nothing is logged. Several jobs can be deleted at once. | `jobs/_components/jobs-data-table.tsx`; `20260627_hr_job_applications.sql` |
| A4 | **Marking Reviewed or Shortlisted erases the screening note.** | `workspace-candidates-tab.tsx`; `recruitment-service.ts` (`reviewJobApplication`) |
| A5 | **Positions filled is never updated** when someone joins. Only 1 of 366 jobs has a value. | Only the edit forms write it; **live** |

### B. Features that do not work

| # | Defect | Evidence |
|---|---|---|
| B1 | **Scorecards cannot be saved or listed.** The code writes `strengths`, `concerns` and `submitted_at` and leaves out the required `candidate_id`; the live table has `comments` and `candidate_id` instead. | `lib/services/hr/recruitment-scorecards-service.ts` vs `20260516063655_create_hr_recruitment_scorecards.sql`; **live** (column does not exist; 0 rows) |
| B2 | **Panel members from the schedule dialog are saved as ids from the `staff` table**, but membership is tested against the sign-in profile id. These panel members never see the scorecard form. Interviews from other paths show the panel as a fragment of an id. | `features/hr/recruitment/schedule-interview-dialog.tsx`; `interviews/[id]/page.tsx` |
| B3 | **The chain repair page calls `/api/hr/admin/recruitment/backfill-chains`; the route is at `/api/admin/hr/recruitment/backfill-chains`.** | `recruitment-maintenance-client.tsx`; `app/api/hr/admin` does not exist |
| B4 | **Candidates created by the booking page have no approval chain** and appear in nobody's queue. Approving one fails with a misleading message. No such candidate exists live yet: the 8 booked interviews so far matched existing candidates. | `interview-booking-service.ts` (`recordInterviewBooking`) |
| B5 | **"Mark as Joined" is offered on an approved candidate but refused by the server**, which allows it only after the offer is issued. | `candidates/[id]/page.tsx`; `recruitment-service.ts` (`CANDIDATE_FORWARD_TRANSITIONS`) |
| B6 | **The publish and close functions are never called.** The create form sets only the status, so the posted date stays empty (32 live jobs) and no closing date can exist. | `create-job-form.tsx`; `recruitment-jobs-service.ts` (`publishJob`, `closeJob`); **live** |
| B7 | **Routing by salary band cannot happen.** No screen sends the band, the builder only makes band-less flows, and the seed data uses a different key name from the code. | `recruitment-service.ts` (`matchRecruitmentFlow`); `flow-editor.tsx` |
| B8 | **Two screens tell the user "the submitter will be notified"; nothing is sent.** | `workspace-candidates-tab.tsx`; `candidates/[id]/page.tsx` |
| B9 | **"Consider for a new role" links from the HR profile and the learner profile open the Apply screen, which ignores what they pass.** | `app/(routes)/hr/recruitment/submit` reads no query values |
| B10 | **Job code "auto-generates on save" is promised on the form but not done.** 33 live jobs have no code. | `create-job-form.tsx`; service writes null; **live** |
| B11 | **A candidate with no job cannot be turned into an HR record.** The onboard action exists only in the job workspace. 7 live candidates, approved or package fixed between February and April 2026, are in this position. | `workspace-candidates-tab.tsx` is the only caller; **live** |

### C. Weak guards

| # | Defect | Evidence |
|---|---|---|
| C1 | **The approval inbox shows candidates the approver then cannot act on.** The inbox matches on role only; the decision also requires access to the institution. | `fn_list_my_pending_recruitment` vs `fn_decide_recruitment_candidate` |
| C2 | **A proposer can approve their own pay package.** | package UPDATE policy in `supabase/setup/03_policies.sql` |
| C3 | **Job and interview update routes pass the request body straight to the database**, so any column can be changed by anyone allowed to edit, and interview status rules can be skipped. | `app/api/hr/recruitment/jobs/[id]/route.ts`; `interviews/[id]/route.ts` |
| C4 | **The candidate create route accepts a status from the caller.** A holder of the create key could insert a candidate already approved. No screen calls it today. | `app/api/hr/recruitment/candidates/route.ts` |
| C5 | **Anyone signed in can submit a scorecard for any interview** once B1 is fixed; neither the route nor the row rule checks the panel. | `interviews/[id]/scorecards/route.ts` |
| C6 | **Interview create, update and delete are not limited by institution**; only reading is. | `20261121164500_hr_scope_gate_institution_access.sql` |
| C7 | **Promote, package approval and the onboard action each make two separate writes.** If the second fails, the first stays. Promote can then be repeated and create a second candidate. | `recruitment-service.ts` (`promoteJobApplication`); `recruitment-package-service.ts`; onboard handler |
| C8 | **Buttons are shown to everyone.** Add, edit, delete, approve and interview actions are not hidden by permission; a refusal appears as "Unknown error". | jobs table, workspace tab, interview page |
| C9 | **Keyed-in applications skip the checks the website path has:** no duplicate check (1 live duplicate), no real file-type check, no phone format check. | `app/api/hr/recruitment/jobs/[id]/apply/route.ts`; **live** |
| C10 | **Job search text is put into the query unescaped**, so a comma or bracket breaks the search. | `recruitment-jobs-service.ts` (`listJobs`) |

### D. Scale limits

These are harmless at 166 applications. They will fail when the CVViZ history (24,934 applications) is added, or as live volume grows.

| # | Limit | Evidence |
|---|---|---|
| D1 | All Candidates downloads every application and candidate into the browser | `recruitment-service.ts` (`listPipeline`) |
| D2 | A job shows only its first 100 applications, with no next page | `workspace-candidates-tab.tsx`; `applications-section.tsx` |
| D3 | Per-job analytics reads at most 1,000 applications | `getJobAnalytics` |
| D4 | The Approvals overview reads at most 200 jobs; there are 366 | `getApprovalsJobOverview`; **live** count |
| D5 | The public feed reads at most 500 jobs and filters in memory | `public-careers-service.ts` |
| D6 | Interviews list shows the first 50 with no next page | `interviews/page.tsx` |
| D7 | The candidate-to-job link is a value inside JSON with no index | `listCandidatesForJob`; `fn_recruitment_approvals_counts` |
| D8 | Public request limits are held in memory per server and reset on deploy | `lib/services/hr/public-careers/rate-limit.ts` |

### E. Records that disagree

- The setup SQL files and the migrations describe different columns and rules for jobs, interviews and scorecards. The live database matches the migrations.
- `hr_job_applications.drive_file_id` exists live but no migration in the repo adds it.
- The base definitions of `hr_approval_flows` and `hr_onboarding_checklists` are not in the repo.
- The user guide and the home page still tell users to paste a CVViZ link. The CV button is labelled "View CVViz Profile" for what is now a Drive file.
- No tests cover interviews, scorecards, job analytics, the approvals overview or job notes.

---

## 8. Improvement points, in order

### Now: stop the visible problems

| # | Action | Fixes |
|---|---|---|
| 1 | Decide which of the 332 imported CVViZ jobs are really open. Set the rest back to draft or closed. | A1 |
| 2 | Send skills to the public feed in a form the website can read. | A2 |
| 3 | Make the scorecard code match the live table, and limit submission to the panel. | B1, C5 |
| 4 | Store profile ids for panel members in the schedule dialog. | B2 |
| 5 | Offer the onboard action on the candidate page as well, and clear the 7 waiting candidates. Correct the address of the chain repair call, and give booking-page candidates a chain when they are created. | B11, B3, B4 |
| 6 | Keep the screening note when the status changes. | A4 |
| 7 | Stop job deletion from removing applications, or say so plainly and require a typed confirmation. | A3 |

### Next: close the biggest gaps with CVViZ

| # | Action | Closes |
|---|---|---|
| 8 | Pre-screening questions per job, with knock-out answers. Already decided for the first release. | Gap 1 |
| 9 | Bulk shortlist, reject and promote in the job workspace, with paging. | Gap 2, D2 |
| 10 | Sub-stages (interview rounds, assessment, hold) and the 29-reason rejection list. Already decided. | Gap 3 |
| 11 | Show interviews and scorecards on the candidate page; hide other panel members' feedback until yours is in; remind until submitted. | Gap 4 |
| 12 | Email the candidate on interview scheduled, rejection and offer. Notify approvers when a step reaches them, and use the stored escalation hours for reminders. | Gaps 5, 6; B8 |
| 13 | Use the publish and close functions: stamp the posted date, allow a closing date, update positions filled on joining, and mark the job filled when the count is reached. | Gap 10; A5, B6 |
| 14 | Carry resume, package, qualifications and feedback to the HR record on joining, and store the link in a real column on both sides. Already decided. | Section 3.6 |
| 15 | Move list filtering and paging to the server, and index the candidate-to-job link. Needed before the CVViZ history arrives. | D1 to D7 |
| 16 | A real home page: jobs open, applications waiting, interviews this week, offers pending, by institution. | Gap 7 |

### Later

| # | Action |
|---|---|
| 17 | Reports across jobs: source, time to fill, by institution and recruiter, with export. |
| 18 | Talent pool and search across live applications and the CVViZ history. |
| 19 | Offer letter from a template, with the pay break-up. |
| 20 | Job approval before publishing, linked to the recruitment-need analysis. |
| 21 | Hiring team per job, so department heads see only their own jobs. |
| 22 | Tighten the guards in 7.C: field allow-lists on update routes, single-transaction writes, buttons hidden by permission, self-approval of packages removed. |
| 23 | Bring the setup SQL, the guide and the tests in line with the live system (7.E). |
| 24 | Job-board publishing: Google Jobs listing and an Indeed feed. |

---

## 9. What this changes in the CVViZ migration plan

- **Jobs are already imported.** 332 CVViZ jobs went into the working jobs table on 2026-10-01, with their CVViZ-only details kept in an extra field that no screen shows yet. The separate jobs archive table and importer prepared earlier (`20270521090000_hr_cvviz_jobs_archive.sql`, `scripts/apply-hr-cvviz-jobs.mjs`) are not needed for jobs and should not be applied.
- **56 CVViZ jobs were left out** by that import: those deleted in CVViZ, JICATE jobs, jobs located in the US, and two that duplicate live jobs.
- **Arts & Science jobs** were placed by department, defaulting to Self where a department exists in both. This differs from the later decision that a reviewer assigns each job; those rows need review.
- **The decision "only jobs with recent applications become live" is not what happened.** Every imported job is open. Action 1 in section 8 puts this right.
- **Applications, notes, feedback and resumes are still only in CVViZ and the export.** The list screens must be made to page on the server (action 15) before 24,934 applications are loaded, or the All Candidates screen will not open.
- **Only 8 candidates still depend on a CVViZ link**, the 8 direct submissions from early 2026. The other 60 point to Drive. Those 8 files need copying before CVViZ is switched off. A migration in the repo makes the CV link optional.

---

## 10. How this was checked

- Three passes over the code: jobs and public careers; applications, approvals, package, offer and joining; interviews, scorecards, home page, reports and access.
- Live counts were read with read-only queries on 2026-10-07. The live public jobs feed was opened once.
- Items 1, 2 and 4 in section 1 and every row marked **live** were confirmed against the live system. All other findings come from reading the code and have not been run.
- Not checked: whether interview reminders are configured in the meetings module; how in-app notices are delivered; whether every migration in the repo is applied.

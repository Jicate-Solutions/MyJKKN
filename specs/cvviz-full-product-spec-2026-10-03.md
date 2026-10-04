# CVViZ Full Product Spec (every feature)

**Date:** 2026-10-03 · **Status:** reference spec · **Owner:** DTO

**Companions:**
- [cvviz-to-myjkkn-recruitment-migration-2026-10-01.md](cvviz-to-myjkkn-recruitment-migration-2026-10-01.md): data migration plan and decisions.
- [cvviz-ui-feature-spec-2026-10-01.md](cvviz-ui-feature-spec-2026-10-01.md): the shorter first pass, with the institution batch plan and build backlog.

This document describes **all** of CVViZ: the features JKKN uses, the features JKKN has but does not use, and the features that are switched off on JKKN's plan. It is the reference for rebuilding recruitment inside MyJKKN. Section 10 sets out how it becomes the recruitment module of MyJKKN HR. Section 11 adds the best features of ten other recruitment portals.

---

## 1. How this spec was built

CVViZ was only read. Nothing was created, edited or deleted in it.

| Source | What it gave | Confidence |
|---|---|---|
| Live screens, opened with the DTO account (Super Admin role) | Layout, columns, filters, menus and counts of every screen the account can open | High |
| CVViZ data API (GET only) | Field names and real values of every record type; reference lists; permissions; plan flags | High |
| CVViZ front-end code bundles (268 bundles, 14,311 screen labels) | Labels, options, hints and messages of **every** screen, including the ones this account cannot open | Medium: wording is exact, but the arrangement on screen is inferred |

Sections 4 to 9 mark anything inferred as "inferred". Section 9 (modules not enabled) comes from code labels only.

Six things could not be seen live and rely on code labels alone:
- the candidate profile screen (opening it may mark the candidate as viewed, so it was not opened);
- the hiring pipelines list (it failed to load in CVViZ itself);
- AI sourcing;
- campaigns;
- companies, customers and contacts;
- the career page editor, account, billing, webhooks and developer settings (no access for this account).

---

## 2. Product map

### 2.1 Modules

"JKKN" shows whether the module is in use at JKKN today.

| # | Module | Main routes | Plan flag / permission | JKKN | Section |
|---|---|---|---|---|---|
| 1 | Dashboard | `/dashboard` | View Dashboard | In use | 6 |
| 2 | Jobs (requisitions) | `/jobs`, `/jobs/new`, `/jobs/:id/edit` | Add New Job, View All Jobs, Delete Job, Change Job Status | In use, 388 jobs | 4 |
| 3 | Job approval | `/settings/job_approval`, public `/job-approval` | JOB_APPROVAL | On; 340 jobs carry approvers | 4, 7 |
| 4 | Job publishing: career page, 21 job boards, social share, embed | job wizard step 8, `/settings/career_page` | Share Job Posting | In use | 4, 7 |
| 5 | Paid job advertising campaigns | `/campaigns/*` | View Campaigns Tab | Off | 9 |
| 6 | Candidates in a job | `/jobs/:id/candidates` | View / Change Candidate Status and others | In use | 5 |
| 7 | Candidate profile | `/jobs/:id/candidates/:id/:tab` | View All Candidate Tabs | In use | 5 |
| 8 | Candidate database and talent pool | `/discover` | View Candidate Database | In use, 24,934 records | 5 |
| 9 | People search | `/discover/:jobid/people_search` | PEOPLE_SEARCH + View People Search Tab | Plan on, permission off | 5 |
| 10 | AI sourcing | `/ai-sourcing/*` | AI_SOURCING | Off | 9 |
| 11 | Resume parsing, match score, AI evaluation, benchmark resumes | inside jobs and candidates | AI_FEATURES on; ADVANCED_PARSING and ADVANCED_SCREENING off | Basic only | 4, 5 |
| 12 | Pre-screening questions and public screening form | `/settings/screening_questions`, public `/screening/:id` | Screening Questions | In use, 21 questions | 5, 7 |
| 13 | Interview feedback and scorecards | job wizard step 6, candidate profile | none | In use | 4, 5 |
| 14 | Notes, mentions and tasks | candidate, job, `/tasks` | Add Notes, View Tasks | In use, 1,718 tasks | 5, 6 |
| 15 | Email to candidates, templates, signatures | candidate actions, `/settings/email_templates` | Send Email to Candidates | In use, 9 templates | 5, 8 |
| 16 | Email campaigns and marketing | `/email_campaigns`, `/marketing` | EMAIL_CAMPAIGNS, EMAIL_MARKETING | Off | 9 |
| 17 | Calendar, interview scheduling, booking links | `/calendar`, public `/book/:token` | CALENDAR_INTEGRATION on; INTERVIEW_SCHEDULING off | Not connected | 6, 8 |
| 18 | Job offers | candidate actions, public `/job-offer/:id` | View & Send Job Offers | Available | 5 |
| 19 | Sharing: candidate shortlists to hiring managers, vendor upload links | public `/shortlisting/:id`, `/upload/:id` | RESUME_SHARING on; VENDOR_SHARING off | Light use (169 share events) | 5 |
| 20 | Reports | `/reports/*`, `/jobs/:id/reports` | View Reports, View Job Reports | In use | 6 |
| 21 | Notifications | bell, `/notifications/*` | none | In use | 6 |
| 22 | Users, roles, permissions | `/settings/users`, `/settings/roles` | Modify Users; ROLES_CUSTOMIZATION | In use, 107 users, 17 roles | 7 |
| 23 | Departments, hiring managers | `/settings/departments`, `/settings/hiringmanagers` | Modify Departments / Hiring Managers | In use, 79 and 9 | 7 |
| 24 | Hiring pipelines (custom stage sets) | `/settings/hiring_pipelines` | HIRING_PIPELINE_CUSTOMIZATION | On, none defined | 7 |
| 25 | Vendors (external recruiters) | `/settings/vendors`, job hiring team | Modify Vendors | None defined | 7 |
| 26 | Companies, customers, contacts (agency CRM) | `/companies/*`, `/customers/*` | RECRUITMENT_AGENCY_WORKFLOW, View Companies Tab | Off | 9 |
| 27 | Child companies, multi-domain, customer career pages | `/settings/child_companies` | CHILD_COMPANIES and others | Off | 7 |
| 28 | Automations and auto-evaluation | `/settings/automations` | WORKFLOW_AUTOMATION on; View & Add Automations off | None defined | 8 |
| 29 | Integrations: Outlook and Gmail mail, Google and Outlook calendar, Twilio voice and SMS, WhatsApp | `/settings/integrations` | per integration | None connected | 8 |
| 30 | Webhooks, API credentials, developer docs | `/settings/webhooks`, `/settings/developers` | WEBHOOKS, API_ACCESS | Off | 8 |
| 31 | Compliance: GDPR consent and data requests | `/settings/compliance`, public `/consent/:id`, `/gdpr/:id` | none | Off | 8 |
| 32 | Referral portal | `/settings/referral_portal` | none | Off | 7 |
| 33 | Billing, plan and usage limits | `/settings/billing` | View Billing Section | AppSumo lifetime plan | 8 |
| 34 | Appearance, saved views, keyboard shortcuts | `/settings/appearance`, list toolbars | SAVED_VIEWS_* | Available | 4, 8 |
| 35 | Sign-in, sign-up, SSO, invitations, onboarding | `/user/*`, `/onboarding/*` | SSO_LOGIN off | In use | 6 |

### 2.2 Plan feature flags (all 39)

Every optional capability in CVViZ is switched by a plan flag. "On" means enabled for JKKN.

| Flag | JKKN | Flag | JKKN |
|---|---|---|---|
| API_ACCESS | Off | PRE_SCREENING_AUTOMATION | Off |
| WORKFLOW_AUTOMATION | On | HIRING_PIPELINE_CUSTOMIZATION | On |
| ROLES_CUSTOMIZATION | On | WHATSAPP_INTEGRATION | On |
| TWILIO_INTEGRATION | On | CALENDAR_INTEGRATION | On |
| INTERVIEW_SCHEDULING | Off | MULTI_DOMAIN_ACCESS | Off |
| CUSTOM_DOMAIN | Off | CHILD_COMPANIES | Off |
| SSO_LOGIN | Off | RECRUITMENT_AGENCY_WORKFLOW | Off |
| CUSTOMIZE_EVALUATION | Off | CHROME_EXTENSION | Off |
| ADVANCED_PARSING | Off | ADVANCED_SCREENING | Off |
| SCREENING_QUESTION_COLUMNS | Off | CANDIDATE_EXPORT | On |
| BULK_DOWNLOAD | Off | RESUME_SHARING | On |
| VENDOR_SHARING | Off | CANDIDATE_ACCESS_OVER_RESUME_LIMIT | Off |
| EMAIL_CAMPAIGNS | Off | AI_ASSISTANT | Off |
| ADD_JOB_FROM_JD | Off | AI_SOURCING | Off |
| EMAIL_MARKETING | Off | CUSTOMER_CAREER_PAGES | Off |
| AI_FEATURES | On | WEBHOOKS | Off |
| JOB_APPROVAL | On | SAVED_VIEWS_JOBS | On |
| SAVED_VIEWS_CANDIDATES | On | TEAM_SHARED_VIEWS | On |
| PEOPLE_SEARCH | On |  |  |

### 2.3 Permission flags (all 46)

| # | Permission | What it allows | Group | Default |
|---|---|---|---|---|
| 1 | **Add New Job** (per_add_job) | Allow user to create a new job posting in the app. | job | on |
| 2 | **Share Job Posting** (per_social_media) | Share job on social media, recruitment agencies, etc. | job | on |
| 3 | **Send Email to Candidates** (per_email_to_candidates) | Send emails to candidates using your existing email or using CVViZ. | candidate | on |
| 4 | **Share Candidates** (per_share_resume) | Share candidates with hiring managers, team-mates, clients or to your contacts | candidate | on |
| 5 | **Upload Candidates** (per_resume_upload) | Upload resumes or candidate contatcs for any job or into candidate database. | candidate | on |
| 6 | **Add Notes** (per_add_notes) | Add personal and private notes for any candidate | candidate | off |
| 7 | **View Reports** (per_view_reports) | View different types of reports, i.e.user's, resume upload | privacy, report | on |
| 8 | **Import Resumes From Inbox** (per_import_outlook) | Import resumes from your inbox (Gmail or Outlook) | candidate | on |
| 9 | **Delete Candidate** (per_delete_resume) | Delete candidate/resume from a job or candidate database | candidate | on |
| 10 | **Download Resumes** (per_download_resume) | Download resumes from job or candidate database | candidate | on |
| 11 | **Export Candidates Data** (per_export_data) | Export candidate information to csv or excel sheet | candidate | on |
| 13 | **User's Summary Report** (per_view_recruiter_summary) | View users summary in reports section (No. of jobs and candidates in different stages) | report | on |
| 14 | **Modify Users** (per_modify_recruiters) | Add or update user basic profile and their permissions | user, admin | on |
| 16 | **View & Send Job Offers** (per_job_offer) | View and send job offers to candidates via email | candidate | on |
| 17 | **View Sensitive Fields** (per_view_sensitive_fields) | View sensitive fields like salary details, salary range, etc. | candidate | on |
| 18 | **View All Jobs** (per_view_all_jobs) | Allow user to view all jobs irrespective of they are assigned to him/her or not | job | on |
| 19 | **View Companies Tab** (per_view_companies_tab) | View companies tab (Current Customers, Prospects, Future Customers & Contacts) | privacy, company | off |
| 20 | **Add/Edit Customer** (per_modify_customer) | Allow user to add a new customer or modify an existing customers. | company | off |
| 21 | **Modify Departments** (per_modify_departments) | Add new department or update existing departments. | user, admin | on |
| 22 | **Modify Hiring Managers** (per_modify_hiring_managers) | Add new hiring manager or update existing ones. | user, admin | on |
| 23 | **Modify Vendors** (per_modify_vendors) | Add new vendor or update existing vendors. | user, admin | on |
| 24 | **Screening Questions** (per_modify_screening_questions) | Add new or update existing screening questions. | user, admin | on |
| 26 | **Bulk Delete Candidate** (per_bulk_delete_candidates) | Bulk Delete candidates from a job or candidate database | candidate | off |
| 29 | **View Billing Section** (per_view_billing) | View billing section, make payments and view Invoices | admin | on |
| 30 | **Delete Job** (per_delete_job) | Allow user to permanently delete a job posting. | job | on |
| 31 | **View & Add Automations** (per_view_automation) | View Automation Settings, Add Automations & Modify existing Automations | admin | on |
| 32 | **View Users from External Domains** (per_view_external_domain_users) | Grants users the ability to view accounts from external or different domains. | user, admin | on |
| 33 | **View Email Campaigns** (per_view_email_campaigns) | Manage Email Campaigns | admin | off |
| 34 | **View Candidates Submitted by Others** (per_view_others_candidates) | Allow user to view candidates that are submitted by other users | candidate | on |
| 35 | **View Notes by Others** (per_view_others_notes) | Allow user to view notes added by other users | candidate | on |
| 36 | **View Candidate Status** (per_view_candidate_status) | Allow user to view current status of the candidate | candidate | on |
| 37 | **Change Candidate Status** (per_change_candidate_status) | Allow user to change current status of the candidate | candidate | on |
| 38 | **View Candidate Database** (per_view_candidate_database) | Access and view the candidate database section | admin | on |
| 39 | **View People Search Tab** (per_view_people_search) | Access people search to find potential candidates | admin | off |
| 40 | **View Dashboard** (per_view_dashboard) | View main dashboard with key metrics and insights | admin | on |
| 41 | **View Settings** (per_view_settings) | Access all settings pages. When disabled, only profile page is visible | admin | on |
| 42 | **View Calendar Tab** (per_view_calendar) | Access calendar to manage interviews and schedules | admin | on |
| 43 | **View Tasks** (per_view_tasks) | View and manage tasks and follow-ups | admin | on |
| 44 | **View Job Reports** (per_view_job_reports) | View job-level reports and metrics including pipeline analytics | privacy, report, job | on |
| 45 | **View Job Notes** (per_view_job_notes) | View notes added to jobs by team members | privacy, job | on |
| 46 | **Add Job Notes** (per_add_job_notes) | Add notes to jobs for internal communication | job | on |
| 47 | **View All Candidate Tabs** (per_view_all_candidate_tabs) | View all candidate tabs. When disabled, only profile tab is visible | candidate | on |
| 48 | **View Campaigns Tab** (per_view_campaigns) | Access and manage paid job advertising campaigns to attract and engage candidates. | admin | off |
| 50 | **Change Job Status** (per_change_job_status) | Allow user to change the status of a job posting. | job | off |
| 51 | **Manage API Credentials** (per_manage_api_credentials) | Create, rotate, and revoke customer API credentials. | settings | off |
| 52 | **AI Sourcing** (per_view_ai_sourcing) | Search talent and manage independent sourcing projects. | general | off |

### 2.4 Roles in the JKKN workspace (17)

| Role | Users | Permissions granted |
|---|---|---|
| JKKN Department Heads | 53 | 29 of 46 |
| JKKN Heads | 15 | 32 of 46 |
| Super Admin | 9 | 38 of 46 |
| JKKN Admins | 5 | 33 of 46 |
| Admin | 5 | 40 of 46 |
| Career Page Admins | 4 | 22 of 46 |
| JKKN AHS College Principal | 3 | 32 of 46 |
| JKKN Digital Transformation Incharges | 3 | 32 of 46 |
| JKKN Nursing College Principal | 2 | 32 of 46 |
| HR Head | 2 | 34 of 46 |
| JKKN Matric Principal | 1 | 32 of 46 |
| JKKN Arts & Science College Principal | 1 | 32 of 46 |
| JKKN Engineering College Principal | 1 | 32 of 46 |
| JKKN Pharmacy College Principal | 1 | 32 of 46 |
| JKKN Dental College Principal | 1 | 32 of 46 |
| JICATE Admins | 1 | 33 of 46 |
| Digital Transformation Officer | 0 | 34 of 46 |

### 2.5 Reference lists

**Job types:** Full Time, Part Time, Contract, Contract-to-Hire, Contract Corp-to-Corp, Internship, Commission Based, Freelancer, Voluntary, Third Party.

**Job close reasons:** Job position is filled; Job posting period has ended; Job is moved to a new location; Job position is on hold; The job is cancelled.

**Job boards (21):** Career Page, LinkedIn, Indeed, Glassdoor, Monster, Google Jobs, ziprecruiter, Jooble, Neuvoo, Adzuna, Jobsora, JORA, PostJobFree, MyJobHelper (inactive), JobIsJob, JobInventory, Upward, Jobomas, Jobrapido, Recruit.Net, Dr Jobs. LinkedIn is the only board not on by default.

**Work authorization options:** Ready, US Citizen, Canadian Citizen, Green card Holder, Need H1 Visa, Have H1 Visa, Employment Auth Document, TN Permit Holder.

**Onboarding checklist (8 steps):** Add Company Related Basic Details; Setup Career Page To Get More Candidates; Integrate Your Email; Set Up User Roles and Access Permissions; Invite Your Team Members; Add Your First Job Listing; Add Your Email Signature; Integrate with Twilio.

**Candidate export columns (30):** File Name, First Name, Last Name, Email Address, Phone Number, Top Skills, Skill Match Rating (job view only), Notice Period, Current Salary, Expected Salary, Cities, Zip Code, Qualification, Resume Upload Date, Source, Added By, Current Company, Current Job Title, Tags, Notes, Social Media Links, Pre-Screening Questions (job view only), Job, Job Code, Status, Updated Date, Status Updated By, Candidate Profile Link, Uploaded Year, Uploaded Month.

**Contact export columns (21):** First Name, Last Name, Full Name, Job Title, Email Address, Primary Contact, Phone Number, Alternate Phone Number, City, State/Province, Country, Address, Postal/ZIP Code, LinkedIn URL, Facebook URL, Twitter Handle, Instagram Handle, Website URL, Company Name, Lead Owner Name, Added By.

**Notification types (9):**

| # | Name | Message template |
|---|---|---|
| 1 | Resume Added | {{username}} added new resume {{filename}}. |
| 2 | Resume Deleted | {{username}} deleted a resume {{filename}}. |
| 3 | New Candidate Applied from Career Page | New candidate {{filename}} applied for the {{jobtitle}}({{jobcode}}) job from {{source}} |
| 4 | Candidate Status Updated | {{username}} {{statusaction}} the candidate {{filename}} for the job {{jobtitle}} |
| 5 | Job Ranking | {{process_name}} for {{jobtitle}} ({{jobcode}}) |
| 6 | New Files Found in Email | New files(resumes) found in dedicated email address |
| 7 | New resumes added by vendor | {{RESUME_COUNT_TEXT}}  added by {{VENDOR_NAME}} for job {{JOB_TITLE}} |
| 8 | Email Viewed | {{RECIPIENT}} viewed your email on {{DATE_TIME}} |
| 9 | New Email Recieved | {{RECIPIENT}} replied to your email with subject {{SUBJECT}} |

**Screening answer types in use:** Switch (Yes/No), Text Input (Short Answer), TextArea (Long Answer), URL Link. Choice types exist in the product but no JKKN question uses them.

**Pipeline stage codes (50):**

| Code | Stage | Parent | Indeed disposition |
|---|---|---|---|
| 0 | New |  | NEW |
| 2 | No Response - Phone |  | UNABLE_TO_MAP |
| 4 | Internal Review |  | REVIEW |
| 3 | Phone Screened |  | CONTACTED |
| 5 | Shared |  | REVIEW |
| 9 | Internal Shortlisted |  | LIKED |
| 16 | Submitted to Client |  | REVIEW |
| 17 | Submitted to Client | Submitted to Client | REVIEW |
| 18 | Submitted to Partner | Submitted to Client | REVIEW |
| 19 | Submitted to AM | Submitted to Client | REVIEW |
| 10 | Resume Shortlisted |  | LIKED |
| 13 | Assessment |  | ASSESS_QUALIFICATIONS |
| 15 | Interviewed |  | INTERVIEW |
| 66 | Internal Hold |  | UNABLE_TO_MAP |
| 65 | Hold |  | UNABLE_TO_MAP |
| 60 | Job Offered |  | OFFER_MADE |
| 61 | Offer Rejected |  | OFFER_DECLINED |
| 62 | Offer Accepted |  | UNABLE_TO_MAP |
| 63 | Background Screening |  | #1ac4a5cc |
| 64 | Not Joined |  | OFFER_DECLINED |
| 999 | Joined |  | HIRED |
| -99 | Rejected |  | NOT_SELECTED |
| -5 | Not Interested |  | UNABLE_TO_MAP |
| -92 | Internal Screening Reject | Rejected | NOT_SELECTED |
| -98 | Interview Reject | Rejected | NOT_SELECTED |
| -97 | Job Offer Reject | Rejected | OFFER_DECLINED |
| -96 | Phone Screen Reject | Rejected | NOT_SELECTED |
| -89 | Rejected by AM | Rejected | NOT_SELECTED |
| -88 | Rejected by Client | Rejected | NOT_SELECTED |
| -87 | Rejected by Partner | Rejected | NOT_SELECTED |
| -95 | Not Shortlisted | Rejected | NOT_SELECTED |
| 51 | 1st Interview Invited | Interviewed | INTERVIEW |
| 52 | 1st Interview Accepted | Interviewed | INTERVIEW |
| 53 | 1st Interview Scheduled | Interviewed | INTERVIEW |
| 54 | 1st Interview Passed | Interviewed | INTERVIEW |
| -84 | 1st Interview Reject | Interviewed | INTERVIEW |
| -85 | 1st Interview Failed | Interviewed | INTERVIEW |
| 55 | Intermediary Interview stage | Interviewed | INTERVIEW |
| 56 | Final Interview Invited | Interviewed | INTERVIEW |
| 57 | Final Interview Accepted | Interviewed | INTERVIEW |
| 58 | Final Interview Scheduled | Interviewed | INTERVIEW |
| 59 | Final Interview Passed | Interviewed | INTERVIEW |
| -93 | Interview Declined By Candidate | Interviewed | INTERVIEW |
| -94 | Candidate No Show For Interview | Interviewed | INTERVIEW |
| -80 | Final Interview Failed | Interviewed | INTERVIEW |
| 41 | Assessment/Trial Invited | Assessment | ASSESS_QUALIFICATIONS |
| 42 | Assessment/Trial Accepted | Assessment | ASSESS_QUALIFICATIONS |
| 43 | Assessment/Trial Scheduled | Assessment | ASSESS_QUALIFICATIONS |
| 44 | Assessment/Trial Passed | Assessment | ASSESS_QUALIFICATIONS |
| -90 | Assessment/Trial Failed | Assessment | ASSESS_QUALIFICATIONS |

**Rejection reasons (29):**

| Applies to stage code | Reasons |
|---|---|
| Rejected (-99) | Sloppy application; Wrong skill set; Poor follow-up questions; Not responsive; Colleagues don't approve; No references; Other |
| Phone Screen Reject (-96) | Unsuitable personality; Weak recommendations; Rejected at background check; Not suitable for the job profile; Immigration or legal issues; Approach wasn't optimal; Better candidate is available; Not willing to relocate; Other |
| Interview Reject (-98) | Skills are not the right fit for the role; Not on time; Unaffordable salary expectations; Slow or Not responsive; Short term periods in past companies; Other |
| Job Offer Reject (-97) | Terms Of The Offer Are Unsatisfactory; Work Is Too Difficult Or Too Easy.; Corporate Culture Doesn't Feel Right; Commute Is Too Difficult; Too Much Travel Required In The Job; Accepted Another Job Offer; Other |
---

## 3. Data model and API

### 3.1 Record types

Field names are CVViZ's own, as returned by its API. Counts are JKKN's at the 2026-10-03 snapshot.

| Record | Count | Fields |
|---|---|---|
| **Workspace** | 1 | id, name, type, country, subscriptionType, careerPageSlug, replyToLabel, linkedInCompanyId, defaultParser, and switches: jobApprovalEnabled, aiEnabled, webhookEnabled, ssoEnabled, subAccountsEnabled, bulkDownloadsEnabled, multiDomainAccessEnabled, customerCareerPagesEnabled, compliance (gdprActive, bulkDeleteAllowed), emailPolicy (dailyLimit, currentCount) |
| **User** | 107 | id, firstName, lastName, name, email, phone, avatarUrl, status (active / invited / inactive), role (id, title, isAdmin), activationDate, accessRestriction, timezone, emailSignature, schedulingLink, workingSchedule (dayStart, dayEnd, startTime, endTime), defaultCandidatesView |
| **Role** | 17 | id, title, description, isAdmin, assignedUserCount, permissionKeys[] |
| **Department** | 79 | id, name, description, isDefault, company |
| **Hiring manager** | 9 | id, name, email, department |
| **Vendor** | 0 | id, name, companyName (external recruiter firm) |
| **Approval group** | 0 | id, name, approvers[] |
| **Job** | 388 | See 3.2 |
| **Candidate application** | 24,934 | See 3.3 |
| **Note** | 4,610 on candidates, 2 on jobs | id, noteType (note / task), entityType (candidate / job / none), entityId, replyToId, note (HTML), isPrivate, mentionedUserIds[], createdBy, createdAt, modifiedAt, modifiedHistory |
| **Task** | 1,718 | A note with noteType = task, plus assignedTo, dueDate, isCompleted |
| **Feedback** | 849 | reviewer (id, type, name, email, submittedAt), answers[] (feedbackType, inputType T = text or R = rating, criterion, value), canEdit |
| **Timeline event** | 16,391 | action, occurredAt, actor (name, email), value, details (type, statusChangeRemark, feedbackCriteria, eventId, docDescription) |
| **Screening question** | 21 in the bank | id, question (HTML), type, required, isDefault, isDemographic, mapping (links the answer to a candidate field, for example the cover letter), choices[] |
| **Screening answer** | 5,388 or more | id, questionId, answerType, answer, selectedChoiceIds[], question snapshot, updatedAt |
| **Email template** | 9 | id, name, subject, body (HTML with merge fields), context, isPublic, owner, canEdit, canDelete |
| **Saved view** | 0 | per user, type jobs or candidates, optional jobId; stores filters, sort and columns; can be shared with the team |
| **Notification** | 0 | type 1 to 9 (see 2.5), read flag |
| **Calendar connection** | 0 | provider, account |

Timeline action values: status_change, notes, feedback, resume_sourced, resume_update, resume_shared, document, event, contact_sourced.

### 3.2 Job fields

| Group | Fields |
|---|---|
| Identity | id, tenantId, title, jobCode, status (3 Pending Approval, 5 In Progress, 9 Cancelled, 10 Closed, 11 Archived), currentStage, isDeleted, isDraft |
| Classification | department, jobFunction, industry, employerType, jobType, tags[], customer, employer |
| Location | country, state, city, zipCode, isRemote |
| Requirements | educationLevel, qualifications[], minExperience (-1 means any), maxExperience (99 means any), skills[] (skill, level 1 Basic to 4 Expert, type 1 Required or 2 Nice to have), parsedSkills |
| Pay | salary (min, max, currency, interval M / Y / H), showSalaryOnCareerPage, hourlyRate, duration |
| Work permit | visaStatuses[], visaTypes[] |
| Description | description (HTML), chatbotScript |
| Application form | resumeMandatory, showResumeUpload, includePrescreening, screeningQuestions[] |
| Interview | feedbackType (1 Basic, 2 Detailed), feedbackCriteria[], workflowTemplateId, criteriaData |
| Ranking | benchmarkData[] (benchmark resumes), lastEvaluatedAt |
| Team | assignedRecruiters[], externalRecruiters[] (vendors), hiringManager, contactEmail |
| Approval | approvalStatus, approvalGroupId, approvers[] (name, email, hasResponded), approvalRequestsSent |
| Publishing | careerPage, careerPageUrl, shareUrl, publication (one switch per job board), jobValidity (days) |
| Audit | createdAt, createdBy, updatedAt, updatedBy, closedAt, closeReason |

### 3.3 Candidate application fields

One record is one person applying to one job. The same person on three jobs is three records; CVViZ links them as "other job applications".

| Group | Fields |
|---|---|
| Identity | id, tenantId, originalJobId (-99 means talent pool, no job), job (id, title, code), isDiscovered |
| Person | firstName, lastName, email, phone, currentLocation (city, state, country, zipcode) |
| Profile (parsed from the resume) | currentRole (title, company, duration), experienceMonths, qualification[], workedInCities[], top skills, notice period, current and expected salary, social links |
| Source | source (CareerPage, Indeed, Linkedin, App, whatsapp, …), uploadedBy, vendor |
| Pipeline | stage (code, label, color, parentCode), statusUpdate (remark, by, at) |
| Scoring | grade, gradingTime, screeningType, skillMatchRating, evaluation, evaluationTemplate, feedbackRatingAverage |
| Other | tags[], counts (notes, otherJobs, feedbackRatings), resume (fileName, url), createdAt, updatedAt |

### 3.4 API

Base `https://api.cvviz.com`. Sign-in is `POST /auth/application/login`, which returns a bearer token valid for 24 hours. The limit is 100 requests per minute. List responses are `{ data, meta.pagination { page, pageSize, totalItems, totalPages } }`.

| Area | Read endpoints (verified) |
|---|---|
| Session | `/me`, `/me/usage`, `/me/preferences`, `/app-config`, `/reference-data/application-shell` |
| Jobs | `/jobs?page&pageSize≤100&sortBy&sortDirection`, `/jobs?view=picker`, `/jobs/counts`, `/jobs/{id}`, `/jobs/{id}/screening-questions`, `/jobs/{id}/notes`, `/jobs/{id}/candidate-stages` |
| Candidates | `/jobs/{id}/candidates?page&pageSize`, `/jobs/{jobId}/candidates/{id}`, and under it `/notes`, `/feedback`, `/timeline`, `/screening-answers` |
| Candidate database | `/candidate-database?page&pageSize≤500&sortBy=audit_insert&sortOrder`, `/candidate-database/counts` |
| Setup | `/users`, `/roles`, `/departments`, `/hiring-managers`, `/vendors`, `/approval-groups`, `/screening-questions`, `/email-templates` (pageSize ≤ 100), `/static/progresschangereasons` |
| Work | `/tasks?scope=visible|mine`, `/notifications`, `/notifications/unread`, `/calendar/connections`, `/users/current/saved-views?type=jobs|candidates` |
| Dashboard | `/dashboard?from&to&scope&view&widgets`, `/dashboard/recruiting-overview?…&summaryMetric=reviews|offers|interviews` |
| Reports | `/reports/jobs`, `/reports/recruiters`, `/reports/sources`, `/reports/time-to-fill`, `/reports/trends`, `/reports/vendors`, `/reports/dashboard`, all with `from` and `to` (366 days at most) |
| Files | Resumes at `https://fileman.cvviz.com/files/{tenant}_files/{jobId}/{fileName}`. These open **without sign-in** |
| No access for this account | `/customers`, `/contacts`, `/workflow-templates` |

Write endpoints were not called. Section 4 onward lists the paths each screen's code refers to.

---

## 4. Jobs module

Conventions: text in "quotes" is copied from the bundle strings. "(inferred)" marks a grouping or control type that is my reading of the strings, not something the strings state. "Not in strings" means the value list is loaded from the server and could not be recovered. Strings ending in a space (e.g. "Saved view ") are prefixes followed by a dynamic value.

Routes found in the router chunk (298): `/jobs`, `/jobs/new`, `/jobs/:jobid`, `/jobs/:jobid/candidates`, `/jobs/:jobid/details`, `/jobs/:jobid/people_search`, `/jobs/:jobid/notes`, `/jobs/:jobid/reports`, `/jobs/:jobid/edit`, `/jobs/:jobid/edit/share`, `/requisitions`, `/requisitions/:jobid`, `/onboarding/jobs/new`, `/onboarding/jobs/:jobid/edit`, `/onboarding/jobs/:jobid/edit/share`, public `/job-approval`, public `/upload`. Page titles: "New Job", "Add New Job", "Job Candidates", "Job Details", "People Search", "Job Notes", "Job Reports", "Jobs & Resumes".

---

### 1. Jobs list

| Item | Detail |
|---|---|
| Route | `/jobs` (alias `/requisitions`) |
| Purpose | Browse, filter, sort and bulk-manage all jobs. Sub-heading: "Manage your requisitions and hiring teams". |
| API paths seen | `/job_`, `/edit`, `/settings/billing` |

**Layout blocks (inferred order)**

| Block | Strings |
|---|---|
| Status counter chips | "Filter jobs by status", "All Jobs", "Active Jobs", "Closed Jobs", "Closed", "Active jobs", "No active jobs", "View active jobs", "Loading job counters", "Status totals are overall" (counts ignore the other filters). Live observation: All / Pending Approval / In Progress / Cancelled / Closed / Archived. |
| Toolbar | Search ("Search by title or job code" / "Search jobs by title or job code"), "Filters" ("Filters, " + count), Saved views, "Sort jobs", "Display " |
| Active filter chips | "Active", "Show all active filters", "Clear status", "Clear date range", "Clear all filters" |
| Filter side panel | "Hide filters panel", "Hide filters", "View jobs" / "View results", "Clear all" |
| Result header | "Showing ", "Refreshing", "Select all " |
| Table / grid | see columns below |
| Bulk action bar | "Selected job actions" (see Bulk actions) |

**Table columns**

| Column | Notes |
|---|---|
| Job | Title + job code; badges "Remote", "This job is a draft and not yet published"; card details (chunk 6589): "Location: ", "Experience required: ", "Job type: ", "Customer: " ("View jobs for " customer), "Remote job", "Any exp", "Department" |
| Status | Clickable status control: "Change Status", "Change status for ", "Status is unavailable for this job.", "Loading status..." |
| Candidates | Count; popover "Candidate Status" breakdown (see Candidate status breakdown) |
| Team | "Assigned recruiter", "No recruiter assigned", "Assigned ", "Assigned recruiters (" |
| Updated | Relative date: "Just now", "Yesterday", "MMM D, YYYY"; also "Last evaluated: ", "Created: " |
| Actions | Inline: "Add Candidates", "Share job", "Add Benchmark Resumes", "AI Source Candidates", "More actions" / "More job actions" |
| Row checkbox | "Select " / "Select job" / "Deselect job" |

**Filters**

| Group | Filter | Control | Placeholder / options |
|---|---|---|---|
| BASIC (group name from live observation) | Customers | multi-select | "Select customers" (shown for agency-type accounts, inferred) |
| | Department | multi-select | "Select departments" |
| | Job Type | multi-select | "Select job types" |
| | Job Industry | multi-select | "Select industries" |
| | Job Function | multi-select | "Select job functions" |
| | Hiring Stage | multi-select | "Select hiring stages" |
| | Tags | multi-select | "Select tags" |
| | Date Added | date range | "Start Date", "End Date" |
| "Requirements" | Min Experience | number | "Min years" |
| | Max Experience | number | "Max years" |
| "Team & Ownership" | Hiring Managers | multi-select | "Select hiring managers" |
| | Recruiters | multi-select | "Select recruiters" |
| "Location" | Country | text | "Enter country" |
| | State | text | "Enter state" |
| | City | text | "Enter city" |

Active-filter chip names: "Status", "Customer", "Department", "Job Type", "Industry", "Job Function", "Hiring Stage", "Tags", "Date Range", "Min Exp", "Max Exp", "Hiring Manager", "Recruiter", "Country", State, City.

**Sort options**

| Sort field | Directions |
|---|---|
| "Date Created" | "Newest first", "Oldest first" |
| "Status" (pairing inferred) | "Advanced first", "Advanced last" |
| "Updated" (inferred as sortable from the column name) | not determined |

**Display menu** ("Display options", "Choose a layout and density")

| Setting | Options |
|---|---|
| "Layout" / "Jobs layout" | List, Grid (names from live observation) |
| "Row density" | "Comfortable", "Compact" |
| "Keyboard shortcuts " | opens the cheat sheet |

**Saved views** (beta per live observation)

| Element | Strings |
|---|---|
| Menu title / help | "Saved views"; "Save filters, sorting, and column settings to return to the same view."; "Save the current filter, sort, and view combination so you can jump back to it with one click." |
| Save | "Save current" ("Save the current toolbar state as a preset"); input "Name this view (e.g. My active reqs)"; checkbox "Share with team"; "Cancel" |
| Per-view actions | "Copy link to this view" / "Copy link for view "; "Delete this view" / "Delete view " |
| State | "Viewing saved: ", "Applied ", "Saved view ", "Already saved" |
| Validation | "Please name your view"; "A view with that name already exists"; "This view is already saved"; "Apply filters or sort first, then save the view" |
| Messages | "Link copied for "; "Couldn't copy view link" |
| Plan gate | "Saved views limit reached." + "Upgrade your plan"; "Available on higher plans." + "Open Billing" (`/settings/billing`) |

**Row menu ("More job actions")**

| Action | Evidence |
|---|---|
| Add Candidates | "Add Candidates" / "Add candidates" |
| Share job / Share with Vendor | "Share job", "Share with vendor" (see Share job) |
| Manage tags | chunk 9340 (see Manage job tags) |
| Benchmark Resumes | "Add Benchmark Resumes" / "Add benchmark resumes" |
| AI Source Candidates | "AI Source Candidates"; messages "Checking previous sourcing results...", "Previous suggestions could not be loaded. You can start a new search.", "AI sourcing started.", "We could not start AI sourcing.", "Sourcing did not return a valid queued job." Sources: "People Search", "Internal ATS", "Web discovery". Match grades: "Strong match", "Good match", "Possible match". |
| Evaluate (ranking) | "Evaluation has started and is running in the background."; "Ranking done!" |
| Edit Job | link to `/edit` |
| Clone Job | seen live only; no "Clone" string in any bundle |
| Copy job code | "Job code copied!", "Could not copy the job code.", "Clipboard unavailable" |
| Change Status | see Change job status dialog |
| Close Job | see Close job confirmation |
| Archive Job | see Permanently archive dialog |

**Bulk actions ("Selected job actions")**

| Action | Strings | Blocks / errors |
|---|---|---|
| Change status | "Change job status", "Change Status"; remark auto-text "Bulk update from jobs list"; success "Updated status for "; fail "Bulk status update failed" | "You do not have permission to change job statuses"; "No jobs selected"; "Select a status first"; "Status change is not allowed when selection includes pending approval jobs"; "Status change is not allowed when selection includes archived or deleted jobs" |
| Export | "Export selected jobs", "Export"; success "CSV exported"; fail "Could not export selected jobs" | — |
| Assign recruiters | "Assign recruiters", "Assign", dialog title "Assign Recruiters"; success "Added recruiters for "; fail "Bulk assignment failed" | "Select at least one recruiter"; "Assign recruiters is not allowed when selection includes archived or deleted jobs" |
| Archive | "Archive selected jobs", "Archive" | "Archive is not allowed when selection includes pending approval jobs"; "You do not have permission to permanently archive jobs" |
| Generic disabled tooltips | "Not available when selection includes archived or deleted jobs"; "Not available when selection includes pending approval jobs" | |
| Clear | "Clear selection (Esc)" / "Clear selection" | |

**CSV export columns**: "Job ID", "Job Code", job title (inferred), "Status", "Approval Status" (values "Approved" / "Pending"), "Company", "Customer", "Department", "Job Type", "Industry", "Job Function", "Country", State, City, "Candidate Count", "Hiring Manager", "Assigned Recruiters", "External Recruiters", "Benchmark Resumes", "Contact Email", "Salary Min", "Salary Max", "Salary Currency", "Salary Interval", "Job Validity", "Created", "Updated", "Last Evaluated", "Job URL". (Exact column order is not determinable.)

**Empty states**

| Situation | Title | Text | Button |
|---|---|---|---|
| No jobs, can create | "No jobs yet" / "Create your first job" | "Define the role, invite your hiring team, and start adding candidates."; "Create your first role and start building your hiring pipeline" | "Create first job" |
| No jobs, cannot create | "No jobs yet" | "Ask an administrator to create a job or update your access." | — |
| Search miss | "No matches for " + term | "Try a different keyword, job title, or job code." | — |
| Filter miss | "No jobs match your filters" | "Try removing or loosening a filter." | "Clear all filters" |

**Keyboard shortcuts cheat sheet** ("Keyboard shortcuts", opened by "Show this cheat sheet"). Key bindings are not in the strings except "Escape" and "Middle click".

| Group | Action |
|---|---|
| "Navigation" | "Focus search"; "Focus search (universal)" |
| "Views & filters" | "Open saved views"; "Toggle filter sidebar"; "Navigate items in saved views"; "Apply highlighted view" |
| "Job rows" | "Open job in current tab"; "Open job in new tab" ("Middle click"); "Open focused job (keyboard)" |
| General | "Show this cheat sheet"; "Escape" (close / clear selection) |

**Plan / permission gates**: saved-view limit; job-status permission; permanent-archive permission; inactive-job banner (see Job inactive screen).

---

### 2. Candidate status breakdown popover (jobs list, chunk 6589)

| Item | Detail |
|---|---|
| Purpose | Shows per-status candidate counts for one job from the Candidates cell. |
| Title | "Candidate Status"; "Filter by: " |
| Buckets | "Total Candidates", "Phone Screened", "Shared", "Shortlisted", "Interviewed", "Job Offered", "Not Joined", "Joined", "Rejected", "Not Interested" |
| Empty / error | "No status data yet"; "Error fetching candidate status breakdown:"; "Candidates unavailable. View job access information." |

---

### 3. Add a New Job chooser (chunk 6589)

| Item | Detail |
|---|---|
| Route | Opened by "Add Job" on `/jobs`; continues to `/jobs/new` |
| Purpose | Choose how to start a new job; can pre-fill the form from pasted text or an uploaded file. |
| Title | "Add a New Job" |

| Option | Description | Follow-up |
|---|---|---|
| "Start from Blank" | "Create a new job by filling in the details yourself." | opens editor |
| "Paste Job Details" | "Paste or type a job description you already have. We'll use it to fill out the form for you to review." | sub-view "Paste Job Description": hint "Paste the job description. We'll use it to fill in the job details, which you can review and complete next."; textarea "Paste or type the full job description here..."; button "Analyze Job Description" |
| "Upload a Job File" | "Upload a job description file (.txt, .pdf, .doc, .docx, .rtf). We'll use it to fill out the form for you to review." | dropzone "Click or drag a file here to upload"; "Choose a file with your job description (.txt, .pdf, .doc, .docx, .rtf)"; "We'll use your file to help fill in the job details. You can review and edit everything next. Maximum file size: 10 MB."; progress "Analyzing your job description file..." |

| Message type | Text |
|---|---|
| Validation | "Please enter a job description."; "Job description files must be 10 MB or smaller." |
| Success | "Job details are ready! Please review and complete the form."; "File uploaded and job details are ready to review!" |
| Error | "Sorry, we couldn't use that text to pre-fill the job details."; "We could not analyze that job description. Please check it and try again."; "We couldn't get job details from your file. Please try a different file."; "Oops! File upload did not work. Please try again."; "We could not read that file. Please check the file and try again." |
| Plan gate (jobs) | "Job limit reached" — "You have reached your active job limit. Upgrade your plan or buy a top-up to add more jobs." / "You have reached your active job limit. Please contact your account admin to upgrade or buy a top-up."; button "Go to Billing" |
| Plan gate (resumes) | "Resume limit reached" — "You have reached your resume limit. Upgrade your plan or buy a top-up before adding another job." / "You have reached the resume limit. Please contact your account admin." |

---

### 4. Job editor shell (create / edit wizard)

| Item | Detail |
|---|---|
| Route | `/jobs/new`, `/jobs/:jobid/edit` (also `/onboarding/jobs/...`) |
| Purpose | Multi-section job setup with per-section save. |
| Header | "Add Job" / "Create job" / "Edit job"; "Back to jobs"; job title fallback "Untitled job"; "Loading job editor", "Loading job header", "Loading job actions", "Loading job settings" |
| API paths seen | `/api/jobs`, `/api/jobs/editor-reference-data`, `/api/jobs/editor-reference-data/job-functions`, `/api/grades`, `/api/pickers/recruiters`, `/api/templates`, `/api/recruiter-automations`, `/api/workflow-templates`, `/workflow`, `/api/automation-settings/automatic-evaluation`, `/api/sourcing-agent/run-pipeline`, `/api/sourcing-agent/sources`, `/api/sourcing-agent/suggested-candidates/import-preflight`, `/api/sourcing-agent/add-suggested-candidate`, `/api/sourcing-agent/sessions/active`, `/cancel`, `/dismiss`, `/draft-email`, `/details`; links to `/settings/departments`, `/settings/customers`, `/settings/career_page`, `/settings/integrations`, `/settings/job_approval`, `/settings/hiring_pipelines`, `/settings/billing` |

**Section navigation** ("Job setup", "Job setup sections", "Section ", "Form completion: ", "Loading section completion")

| # | Section | Lock text when unavailable |
|---|---|---|
| 1 | "Job Details" | — ("Start with the job details."; "Other sections become available after creating the job.") |
| 2 | "Benchmark Resume" | "Available after creating the job." |
| 3 | "Hiring Team" | "Available after creating the job." |
| 4 | "Job Application" | "Available after creating the job." |
| 5 | "Hiring Pipelines" | "Available after creating the job." |
| 6 | "Automation" / "Automations" | "Add pre-screening questions on the Job Application tab first." (for pre-screening rules) |
| 7 | "Interview Scorecard" | "Available after creating the job." |
| 8 | "Job Approval" | "Submit the draft for approval to unlock this section." |
| 9 | "Get More Applicants" | "Publish the draft to unlock this section." / "Available after the job is published." |

(The strings list nine section names; the caller's count of eight omits Automation.)

**Footer / header actions**

| Button | Tooltip |
|---|---|
| "Create job" | "Create the job with these details" |
| "Save & Continue" | "Save and move on to the next section" |
| "Save & Finish" | "Save and return to the jobs list" |
| "Save draft" | "Save draft changes without publishing"; "Save what you've filled in so far without publishing." |
| "Submit for approval" | "Submit this draft for approval before publishing" |
| "Publish job" | "Publish this draft and open it for applications" |
| "Previous" | previous section |
| "Job actions" menu | contents not enumerated in strings |

**Save state indicator**: "Not saved yet", "Unsaved changes", "Unsaved changes in this section", "Saved a moment ago", "Saved 1 minute ago", "Saved " + time.

**Keyboard shortcuts** ("Keyboard shortcuts (?)"; key bindings not in strings)

| Action |
|---|
| "Save the current section" |
| "Jump to the previous section" |
| "Jump to the next section" |
| "Close any open dialog or popover" |
| "Move focus to the next field or control" |
| "Move focus to the previous field" |
| "Submit a focused button or open option" |
| "Open this shortcuts cheat sheet" |

**Messages**

| Type | Text |
|---|---|
| Success | "Section saved successfully."; "Job created successfully"; "Job details updated successfully"; "Hiring team updated successfully"; "Job application updated successfully"; "Interview scorecard updated successfully"; "Job boards updated successfully"; "Job approval data updated!"; "Benchmark resume settings saved successfully"; "Benchmark data updated successfully" |
| Progress | "Creating job" / "Setting up the job workspace..." |
| Leave guard | "You have unsaved changes. Leave without saving?" |
| Error | "Unable to load the job."; "Departments returned an invalid response." ("Job editor reference data") |
| Read-only banner | "This job is read-only" — "Editing and recruitment actions are unavailable for closed, cancelled, archived, or inactive jobs."; link "View job details" |
| Plan gate | "Job Limit Exceeded" — "You have exceeded the limit of number of jobs." / "Please upgrade your plan or add job top-up to publish more jobs."; buttons "Upgrade", "Job limit details"; "You have reached the job limit."; "You have reached the resume limit."; "Review billing" |

**Post-create prompt**: "Job Created Successfully!" — "Would you like to run the autonomous AI sourcing agent to instantly find perfect candidates for this role?"; buttons "Confirm" (inferred), "Maybe Later".

---

### 5. Editor section: Job Details

Purpose: capture the core definition of the role. Sub-blocks: "Basic Details", "Location", "Job Specification", "Job Description", "Skills", "Salary Range".

**Basic Details**

| Field | Control type | Options / allowed values | Validation / hint |
|---|---|---|---|
| Job title | text with length meter | free text | Hint: "The role candidates see in search results. Lead with the skill or specialty (e.g. 'Senior Python Developer') rather than internal levels (Engineer III)." Meter: "Aim for around " N; "Keep the title under " N. Error: "Job title is required." |
| Job code | text + regenerate button | auto-generated | "Auto-generated from the job title. You can edit it to match your internal tracking format."; button "Regenerate job code from the job title"; error "Job code is required." |
| "This is a child company" | checkbox | on/off | "Tick if the role belongs to one of your sub-accounts (a child company under your CVViZ tenant). The job will be visible only to that sub-account" |
| "Select Sub-Account" | select (shown when the checkbox is on) | sub-account list | placeholder "Select a sub-account"; error "Please select a sub-account." |
| Customer | select | customer list (`/settings/customers`) | placeholder "Select Customer"; hint (rephrased) "The end client this requisition is for. Visible because your account is configured as a recruitment agency."; error "Customer is required"; permission messages "You do not have permission to add customers. Ask your account administrator to update your role." / "You do not have permission to edit customers..."; "The company could not be saved. Your changes are still here." |
| External Reference ID | text | free text | shown as "External Ref ID: " |
| Department | select | department list (`/settings/departments`) | placeholder "Select Department"; error "Department is required" |
| Job type | select | only "Full Time" appears in strings; remaining values not in strings | placeholder "Select job type"; error "Job type is required" |
| Industry | select | not in strings (reference data API) | placeholder "Select Industry"; hint "The vertical your company operates in (e.g. SaaS, Healthcare, Manufacturing). Drives the Employer Type and Job Function options below."; error "Industry is required" |
| Employer Type | select, dependent on Industry | not in strings | placeholder "Select Employer Type"; disabled hint "Pick an industry first"; error "Employer is required" |
| Job Function | select with inline add, dependent on Industry | not in strings; "Add Job Function", "New category " (create new) | placeholder "Select Job Function"; hint "The functional area this role falls under within the chosen industry (e.g. Backend Engineering, DevOps, UI/UX). Used to match benchmark resumes and rank applicants."; errors "Job Function is required", "Job Category is required" |

**Location** (hint: "Where the role is based. Remote-friendly jobs still need a city and ZIP to pass most job-board filters.")

| Field | Control type | Options | Validation / hint |
|---|---|---|---|
| Country | select | Country names embedded in the bundle (partial extraction): Afghanistan, Albania, Algeria, Andorra, Angola, Anguilla, Argentina, Australia, Bahrain, Bangladesh, Barbados, Belarus, Belize, Bermuda, Bhutan, Botswana, Brazil, Bulgaria, Burundi, Cambodia, Cameroon, Canada, Cape Verde, Cayman Islands, Colombia, Comoros, Cook Islands, Costa Rica, Croatia, Czech Republic, Denmark, Djibouti, Dominican Republic, Ecuador, Eritrea, Ethiopia, French Polynesia, Georgia, Gibraltar, Guatemala, Guernsey, Guinea, Guyana, Honduras, Hong Kong, Hungary, Iceland, Indonesia, Israel, Jamaica, Jordan, Kuwait, Kyrgyzstan, Lebanon, Lesotho, Liberia, Liechtenstein, Madagascar, Malawi, Malaysia, Maldives, Mauritania, Mauritius, Mexico, Moldova, Mongolia, Morocco, Mozambique, Myanmar, Namibia, Nicaragua, Nigeria, Norway, Pakistan, Panama, Papua New Guinea, Paraguay, Philippines, Poland, Romania, Rwanda, Saudi Arabia, Serbia, Seychelles, Sierra Leone, Singapore, Solomon Islands, Somalia, South Africa, Sri Lanka, Suriname, Swaziland, Sweden, Taiwan, Tajikistan, Thailand, Trinidad and Tobago, Tunisia, Turkmenistan, Uganda, Ukraine, United Arab Emirates, Uruguay, Vanuatu, Vietnam, Zambia (short names such as India, USA, UK were dropped by the extractor) | "Country is required" |
| State | select / text | — | "State is required" |
| City | select / text | — | "City is required" |
| Zip Code | text | — | "Zip Code is required."; warning "Posting jobs to most of the job boards won't work if state, city and zip code are blank" |
| Remote | toggle (inferred from "Remote" / "Remote job" badges) | on/off | — |

**Job Specification**

| Field | Control type | Options | Validation / hint |
|---|---|---|---|
| Education Level | select | not in strings | placeholder "Select Education Level"; "Education Level is required" |
| Qualifications | multi-select | not in strings | placeholder "Select Qualifications"; "Qualification is required" |
| Min Experience | select | not in strings (years) | placeholder "Select Minimum Experience"; hint "The lowest amount of relevant work experience an applicant should have, in years."; "Minimum experience is required" |
| Max Experience | select | not in strings (years) | placeholder "Select Maximum Experience"; "Maximum experience is required" |

**Salary Range**

| Field | Control type | Options | Validation / hint |
|---|---|---|---|
| "Salary currency" | select | "Currency" list not in strings | — |
| "Minimum salary" | number | — | — |
| "Maximum salary" | number | — | — |
| "Pay frequency" | select | not in strings (exported as "Salary Interval") | — |
| Show salary on career page | checkbox | on/off | "If unchecked, the salary range is still sent to job boards (which require it) but hidden on your CVViZ-hosted career page." |

**Job Description**

| Field | Control type | Options | Validation / hint |
|---|---|---|---|
| "Job Summary" | text with AI generate | "Generate " / "Generating "; needs title: "Add a job title first" | — |
| "Job Description" | rich text editor ("Rich text editor", placeholder "Type here...") | Toolbar: "Text formatting", bold (inferred), "Italic", "Underline", "Strikethrough", "Block quote", "Insert link", "Clear formatting", "Numbered list", "Bulleted list", "Decrease indent", "Increase indent"; AI "Generate " | Hints: "Describe the role: responsibilities, must-haves, and what success looks like in the first 90 days."; "Use the formatting toolbar. Clear responsibilities and must-haves outperform long paragraphs."; meter "Aim for ", "Add at least ", "Roughly "; errors "Job description is required.", "Description must have at least " N |

**Skills** (hint: "Add the skills you're hiring for. Mark required vs preferred and set proficiency.")

| Field | Control type | Options | Validation |
|---|---|---|---|
| Skill entry | tag input ("Add a skill"); "Generate " from title | free text | "Skill name cannot be empty" |
| "Skill importance" / "Importance" ("Adding as", "Add next as") | toggle | "Required", "Nice to have" (read views show "Mandatory" / "Desired" / "Good to have") | "At least one Required skill is needed."; "Skills are required" |
| "Proficiency level" / "Proficiency" | select | "Intermediate", "Expert" (a third, lower level is likely but not in strings) | — |
| Remove | button | "Remove " + skill | — |

---

### 6. Editor section: Benchmark Resume

| Item | Detail |
|---|---|
| Purpose | Upload resumes of strong recent hires so new applicants are ranked by similarity. |
| Title / intro | "Add Benchmark Resume" — "Upload resumes of strong recent hires for this role. CVViZ uses them to rank new applicants by similarity." |
| Upload zone | "Drop resumes here or click to browse"; "Up to " N " MB each"; "Upload a PDF, DOC, DOCX, RTF, or TXT resume." |
| Limits | "Each benchmark resume must be " N "MB or smaller."; "You can upload up to " N |
| Existing list | "Benchmark Resumes" — "Resumes already linked to this job. Remove any that no longer represent your ideal candidate."; row actions "View benchmark resume" ("View Resume" / "View File"), "Remove benchmark resume"; label "Benchmark resume : " |
| Empty state | "No benchmark resumes yet" — "Add resumes above to define the benchmark for this role." |
| Progress | "This may take a moment."; "Your resumes are queued for processing."; "Benchmark processing is still running. Refresh this section to check its status." |
| Success | "Benchmark resume settings saved successfully"; "Benchmark data updated successfully" |
| Errors | "Benchmark resumes could not be processed."; "Benchmark resumes could not be updated."; "Benchmark processing completed, but no valid benchmark resume was added."; "The following resumes were not accepted as benchmark data. Please review them and try again:" |
| Plan gate | "Adding benchmark data is not applicable to your account! Please go to next step." |

**Re-evaluate prompt** (after benchmark change)

| Element | Text |
|---|---|
| Title | "Evaluate candidates?" / "Evaluate Candidates" |
| Body | "It seems you have updated benchmark resumes. We suggest you evaluate candidates again."; "Following benchmark resumes will be considered for evaluation:"; "The following resumes were not accepted as benchmark data." |
| Result | "Candidates Evaluated Successfully" — "You can now view the evaluated candidates."; button "View Evaluated Candidates" |

---

### 7. Add benchmark data dialog (from candidates, chunk 1624)

| Item | Detail |
|---|---|
| Purpose | Pick existing candidates of a job as benchmark examples (row menu "Benchmark Resumes"). |
| Title / subtitle | "Add benchmark data" — "Improve ranking with examples of strong candidates" |
| Body | "Choose your best-fit candidates" — "Select one or more examples. Their resumes will help CVViZ rank similar candidates higher for this role."; list "Eligible candidates"; "Clear selection"; "Review selection" |
| Option | Checkbox "Replace existing benchmark data" — "Clear the current benchmark set before adding this selection." |
| Buttons | "Add selected", "Evaluate Candidates", "Continue in background", "Cancel"; busy "Processing..." |
| Validation | "Please select candidates" |
| Progress | "Adding benchmark data" — "The selected resume is being processed. This usually completes in a few seconds."; "Your selected resumes are queued for benchmark processing. You can safely continue working while this runs."; "Processing is underway."; "Waiting for an available processing worker."; "Evaluating candidates" — "Basic screening is running in the background. Results will refresh when it completes." |
| Success | "Benchmark Data Added" — "Selected resumes added to benchmark data for this job!"; "Candidate evaluation completed."; "Summary of uploaded files for benchmark data:" |
| Failure | "Benchmark Data Not Added" — "Selected resumes not considered for benchmark data!"; "Benchmark Processing Failed"; "Benchmark data could not be processed."; "Candidate Evaluation Failed"; "Candidate evaluation could not be completed." |

---

### 8. Editor section: Hiring Team

| Block | Field | Control | Hint / empty text |
|---|---|---|---|
| "Assigned Team Members" | "Team Member" | multi-select picker (`/api/pickers/recruiters`) | "Internal recruiters and hiring managers who can screen applicants and move them through the pipeline."; empty "No recruiters assigned yet." |
| "External Hiring Team" | "Vendor" | multi-select picker | "Vendor recruiters who can submit candidates against this job from their own pool."; empty "No external vendors assigned yet." / "Add vendor recruiters above to let them submit candidates against this job." |
| Hiring manager | select (inferred; shown on Job Details view as "Hiring Manager") | hiring-manager list | — |
| Contact email | text (inferred; shown as "Contact Email") | — | — |

Success: "Hiring team updated successfully".

---

### 9. Editor section: Job Application

Purpose: configure the public application form and its pre-screening questions. Blocks: "Basic Settings", "Pre-Screening Questions", "Application Form Preview".

**Basic Settings**

| Field | Control | Hint |
|---|---|---|
| "Show resume upload field" | toggle | "Display resume upload option in application form" |
| "Resume is mandatory" | toggle | "Require candidates to upload their resume" |
| "Include pre-screening questions in application form" | toggle | "Add screening questions directly to the application process"; "You can send a separate pre-screening link if you don't want to include questions in the application form." |

**Pre-Screening Questions list**

| Element | Strings |
|---|---|
| Empty state | "No Pre-Screening Questions Yet" — "Select questions from your question bank to screen candidates before they submit their applications. You can reorder them anytime by dragging."; button "Select Pre-Screening Questions" |
| Add | "Add Pre-Screening Questions", "Add More Pre-Screening Questions" |
| Row | "Question " N; "Drag to reorder" / "Drag the grip on the left to reorder questions"; "Options:"; "Type : "; actions "Edit question", "Remove question" |
| Row badges | "Synced with database field" / "DB Field" ("This question is mapped with database field : "); "Default question for all jobs" / "Default" ("This is default question"); "This is mandatory question"; "This question has " N options |
| Loading | "Loading questions..." |

**Question picker dialog** ("Add Pre-Screening Questions" — "Select questions to add to your job application")

| Element | Strings |
|---|---|
| Search | "Search questions by keyword..." / "Search screening questions..." |
| Filter chips ("Filter:") | "Database Fields" / "Database Mapped", "Default Questions" / "System Default", "Mandatory" |
| Buttons | "Add Questions", "New Question" / "Create Question" / "Create New Question", "Select All", "Clear All", "Cancel" |
| Count | "Showing " |
| Empty | "No questions available" — "All questions have been added or create a new one"; "No questions match your criteria. Please adjust your filters or search term, or create a new question."; "Try removing some filters" |
| Validation | "No new questions selected" |

**Add / Edit Screening Question dialog** ("Add Screening Question", "Create New Screening Question", "Edit Screening Question")

| Field | Control | Options | Validation / hint |
|---|---|---|---|
| "Question text" | text | — | "Enter the question that candidates will see and answer"; "Question is required" |
| "Answer type" | select ("Choose an answer type") | From shared chunk 9707: "Short Text", "Long Text", "Dropdown", "Checkbox", "Single Choice", "File Attachment", "Number" (date, URL, email, phone types implied by validators below) | "Select how candidates will provide their answer"; "Answer type is required" |
| "Answer options" | repeatable text ("Option " N, "Remove Option") | — | "Add the choices candidates can select from"; "At least one option is required"; "Question should have at least 2 options" |
| "Database mapping field" | select ("Select a database field (optional)") | not in strings | "Map this question to a database field for automatic data storage" |
| "Additional Settings" → "Required question" | checkbox | — | "Candidates must answer this question to submit their application." |
| → "Default question" | checkbox | — | "Default questions will pre-populate in screening questions when adding a new job." |
| → "Demographic question" | checkbox | — | "Mark this question as demographic if it relates to the applicant" |
| Buttons | "Add Question", "Update Question", "Cancel" | | Success "Screening question added", "Question updated" |

Answer input validators: "The input is not a valid URL"; "The input is not a valid Date" ("DD-MM-YYYY"); "The input is not valid E-mail"; "The input is not valid Number"; "The input is not phone Number!"; "Please select an option from dropdown"; placeholders "Input your answer", "Select Option".

**Application Form Preview** (live preview of the public form)

| Step | Fields shown |
|---|---|
| "Upload Resume" | "Resume" dropzone "Click or drag resume file to this area to upload"; "Format supported: .pdf,.doc,.docx"; "File size should be less than 2MB"; "Resume is required" |
| "Applicant Details" / "Personal Information" | "First Name", "Last Name", "Email Address", "Mobile Number" |
| "Professional Details" | "Location" (sample "New York, NY"), "Current Job Title" (sample "Senior Software Engineer"), "Years of Experience", "Current Salary", company sample "ABC Corp" |
| "Pre-Screening Questions" / "Additional Info" / "Additional Information" | "Sample screening question ", "Your Answer", "Answer " |
| "Review & Submit" | "Review your information before submission"; consent "I agree to " "Privacy Policy" — "Agree to Terms of Service and Privacy Policy."; buttons "Previous", "Submit Application" |

Success: "Job application updated successfully".

---

### 10. Editor section: Hiring Pipelines

| Item | Detail |
|---|---|
| Purpose | Choose the stage workflow used by this job. |
| Hint | "Pick the stage workflow that fits this role. Pipelines are reusable across jobs and can be edited in Settings." |
| Control | Pipeline cards / radio (inferred) showing stages and "Sub-stages"; "Show less" toggle |
| Actions | "Create Hiring Pipeline", "Create New Pipeline" (to `/settings/hiring_pipelines`) |
| Empty | "No Hiring Pipelines found. Create one to get started."; "No stages configured" |

Default candidate stage / sub-stage names found in shared chunks (1624, 8317): New Candidate, No Response - Phone, Phone Screened, Internal Review, Shared, Internal Shortlisted, Resume Shortlisted, Assessment, Interviewed, Submitted to Client, Submitted to Partner, Submitted to AM, Assessment/Trial Invited, Assessment/Trial Accepted, Assessment/Trial Scheduled, Assessment/Trial Passed, Intermediary Interview stage, Final Interview Invited, Final Interview Accepted, Final Interview Scheduled, Final Interview Passed, Job Offered, Offer Rejected, Offer Accepted, Background Screening, Not Joined, Internal Hold, Joined, Rejected, Interview Reject, Job Offer Reject, Phone Screen Reject, Not Shortlisted, Candidate No Show For Interview, Interview Declined By Candidate, Internal Screening Reject, Assessment/Trial Failed, Rejected by AM, Rejected by Client, Rejected by Partner, Final Interview Failed, Not Interested.

---

### 11. Editor section: Automation — pre-screening rules

| Item | Detail |
|---|---|
| Purpose | Route candidates to a status automatically based on their screening answers. |
| Title / intro | "Prescreening rules" / "Prescreening criteria" — "Route candidates using their answers"; "Set matching criteria and choose the resulting statuses. Use Save & Continue to save your rules." |
| Empty | "No pre-screening rules yet" — "Define conditions on screening question answers (e.g. "...; "Build your screening rules"; "Add screening questions in Job Application to use them here." |

**Matching criteria** ("Match rules using" — "Choose how these rules work together.")

| Mode | Internal tag | Description | Extra fields |
|---|---|---|---|
| "All rules" | "ALL/AND" | "Every rule must match" | — |
| "Any rule" | "ANY/OR" | "At least one rule must match" | — |
| "Score based" | "WEIGHTED SCORE" | "Reach a points threshold" | Per rule "Points" ("Add points") and "Must match" ("A required condition must match regardless of the total score."); "Passing score" "Out of" N; error "The passing score exceeds the available points." |

**Rule row** ("Rules ", "Add rule")

| Field | Control | Options | Validation |
|---|---|---|---|
| "Screening question" | select ("Choose a screening question") | job's questions | "Question not selected"; "Choose a question to set its condition and expected answer." |
| Condition logic within rule | toggle "Match these conditions using" | "Any (OR)", "All (AND)" | — |
| "Criteria" (condition operator) | select ("Choose a condition") | equals — "Matches when the candidate response is exactly equal to the expected answer."; not equals — "...is different from the expected answer."; greater than — "...numeric value is strictly greater than the expected value."; less than — "...strictly less than the expected value."; greater or equal — "...greater than or equal to the expected value."; less or equal — "...less than or equal to the expected value."; in — "...is one of the selected choices."; not in — "...is none of the selected choices."; any of — "...overlaps with any of the selected choices."; all of — "...contains all of the selected choices." (operator display names are not in strings; only these descriptions) | "Criteria is required" |
| "Expected Answer" | input by answer type: "Enter answer...", "Enter number...", "Choose option", date "YYYY-MM-DD", boolean "Yes/True" / "No/False", multi with "Select All" / "Clear All" | — | "Expected Answer is required." |
| Row actions | "Add condition" ("Check another answer for this question."), "Remove condition ", "Move up", "Move down", "Drag rule ", "Duplicate rule", "Remove rule" | — | badge "Incomplete" |

**Candidate outcomes** ("When screening completes, move the candidate to the selected status.")

| Field | Control | Validation |
|---|---|---|
| "When rules match" → "Move candidate to" | status select ("Choose a status") | "Please select positive and negative status"; "No status selected" |
| "When rules do not match" → "Move candidate to" | status select | "Positive and negative status must be different" |

**Confirmations**

| Dialog | Text | Buttons |
|---|---|---|
| Remove rule | "Use Save & Continue to save this change." | "Remove rule", "Keep rule" |
| Clear all | "Clear all screening rules?" — "This change is applied when you save the job." | "Clear rules", "Keep rules" |
| Delete condition (older UI) | "Are you sure to delete this condition ?" | "Delete condition" |

**Test panel** ("Test rules" → "Test screening rules" — "Try sample answers and review the outcome.")

| Element | Strings |
|---|---|
| Inputs | "Sample answers" — "Enter an answer for each question to see how the current rules behave."; "Fill sample A", "Fill sample B"; "Sample answers are not saved to a candidate." |
| Result | "Test result"; "Complete the sample to see the outcome"; "Finish configuring the rules first."; "Rules match" / "Rules do not match"; "Passing score: "; "Condition results "; per condition "Matched", "Not matched", "Awaiting answer", "Question not selected" |

**Setup guide** ("Setup guide"): steps "Choose how rules match", "Add a question and condition", "Choose the candidate outcomes", "Test with sample answers" ("Open Test rules and try different answers. Review each condition and the resulting status. Samples stay in the test panel and do not change candidates."), "Save your changes" ("Use Save & Continue in the job editor. To remove screening, clear all rules and save the job."). "Examples": "All rules: meet two requirements" ("Require at least 3 years of relevant experience and availability within 30 days. Both rules must match for the candidate to receive the match status."); "Any rule: accept an alternative" ("Accept experience with either of two relevant tools. A match on either rule is enough."); "Score based: combine criteria".

**Messages**: "Rule duplicated successfully!"; "Conflicting rules: Contradictory rules are set for "; "These conditions conflict" — "Review the expected answers. A candidate cannot satisfy all of these conditions together."; "Please resolve all incomplete rules or logical conflicts in pre-screening rules before saving."; "Please fill in all conditions and input values for the pre-screening rules."; "Prescreening Automation updated successfully!"; "Prescreening Automation created successfully!"; "Job Prescreening automation data updated!"; "Failed to save pre-screening automation"; "Pre-screening rules cleared successfully"; "Failed to clear pre-screening rules".

---

### 12. Editor section: Automation — job workflow automations

| Item | Detail |
|---|---|
| Purpose | Per-job email, reminder and status-update automations built from templates. |
| Intro | "Keep your hiring process moving, automatically."; "Manage emails, reminders, and status updates for " job; "Automate routine emails, follow-ups, and status updates with a few simple rules."; "Enabled workflows run when their trigger occurs." |
| Tabs (inferred) | "Automations", "Templates", "Auto-evaluation" |
| API | `/api/recruiter-automations`, `/api/workflow-templates`, `/workflow`, `/api/templates`, `/api/grades`, `/api/automation-settings/automatic-evaluation` |

**List**

| Element | Strings |
|---|---|
| Search | "Search automations"; "Search by name or action" / "Search by name, job, or action" |
| Filters | "Filter by job" ("All jobs", "Selected job"); "Filter by workflow type" ("All workflow types"); "Applied filters", "Remove job filter", "Remove workflow type filter", "Clear filters" |
| Columns (inferred) | name, "Workflow type", "Applies to" ("Jobs: ", "Shared across " N), "Timing", "Automation status", "Actions for " |
| Row actions | "Enable" / pause toggle, "Edit automation", "Delete automation" |
| Status values | "Enabled", "Paused", "Unavailable" |
| Empty | "No automations yet" + "Create your first automation"; "No matching automations" — "Try another search or adjust your filters." |
| Errors | "Your automations could not be loaded. Please try again."; "Automations are unavailable"; "Some workflow details are unavailable"; "Some saved references are unavailable: " |
| Plan gate | "Workflow automation is unavailable on your plan." |

**Workflow templates** ("Step 1 of 2" — "Choose a workflow" — "Select the hiring task you want to automate."; "Workflow templates" — "Start with a common hiring task, then customize the details.")

| Template | Category badge | Trigger | Description | Action label |
|---|---|---|---|---|
| "Application acknowledgement" | Email | "Candidate applies" | "Welcome applicants with a timely email after they apply for a job." | "Send an acknowledgement email" |
| "Status change email" | Email | "Candidate status changes" | "Keep candidates informed when they move to a new stage in your hiring process." | "Email the candidate" |
| "Ranking notification" | "Notification" | "Ranking completes" | "Let your recruiting team know when candidate rankings are ready to review." | "Notify your recruiting team" |
| "Prescreening outcome" | "Status update" | "Prescreening completes" | "Move candidates to the right status based on their prescreening results." | "Update status based on results" |
| "Resume follow-up" | "Reminder" | "No response to a shared resume" | "Remind hiring managers to review shared resumes when a response is overdue." | "Send a follow-up reminder" |
| "Grade-based status update" | "Workflow" | "Configured event" | "Run an action when the configured conditions are met." | "Update status by candidate grade" |

Template filters: "Template category" = "All workflows", "Email & notifications", "Status updates", "Reminders"; "Search templates" / "Search workflows"; "Use template "; empty "No workflows match these filters.", "No templates are available."; next-step hints "Next: configure the action and timing for this job.", "Next: configure jobs, conditions, and timing."

**Automation form** ("Create automation" / "Edit automation"; "Change template")

| Field | Control | Options | Validation / hint |
|---|---|---|---|
| "Automation name" | text | default "Untitled" | "Give this automation a name." |
| "Department" | select | departments | — |
| "From status" | select | statuses + "Any status" | "Select a status" |
| "To status" | select | statuses | "Runs when a candidate enters the destination status." |
| "When criteria match" / "When criteria do not match" | status selects | statuses | — |
| "Email template" | select | templates | preview "Subject:" / "No subject"; "Personalized fields will be filled in when the email is sent." |
| "Send from" | select ("Choose a sender") | senders | "Choose a sender." |
| "Recipients" | multi-select | — | "Choose " + field |
| "Candidate grades" | multi-select | grades (`/api/grades`) | "Run when a candidate receives any of these grades." |
| "Days without a response" | number | — | "Start the reminder when this many days pass without a response."; "The response deadline above determines when the reminder condition is met." |
| "Maximum reminders" | number | — | "The maximum number of follow-up reminders." |
| "Screening form" | select | forms | "Choose the screening form to include in this email."; "Included through the screening form link in your email template."; "Screening forms could not be loaded." |
| "When to run" (timing) | radio | "Immediately" ("No waiting"); "After a delay" ("Minutes, hours or days") with "Wait for" N + unit ("Minutes", hours, days); "Scheduled" ("A specific date & time") with "Date and time" ("DD MMM YYYY, HH:mm", "Timezone: ") | "Enter a duration of at least 1 minute."; "Choose a date and time in the future."; "Choose an available timing option."; "Delay not set"; "Schedule not set" |

Preview panel ("Workflow preview"): "When this happens" → "Then wait" ("No delay" / "After ") → "Do this" ("Send an email" / "Update candidate status" / "Run the configured action"); summaries "Email: ", "Match: ", "Move to "; "Not selected yet"; "Ready to ".

Buttons / state: "Create and enable"; "Save changes"; "Discard changes"; "This automation is enabled" / "This automation is paused" / "Runs automatically once enabled"; shared warning "Changes to this automation apply to every assigned job."

| Dialog | Text | Buttons |
|---|---|---|
| Unsaved | "Discard unsaved changes?" — "Your changes to this automation have not been saved." | "Discard changes", "Keep editing" |
| Delete | "Delete automation?" — "This rule will be permanently deleted. To stop it temporarily, pause it instead."; input "Type DELETE to confirm" | "Delete automation", "Cancel" |

Messages: "Automation saved and enabled."; "Automation updated."; "Automation enabled."; "Automation paused."; "Automation deleted."; "The automation could not be saved."; "We could not save this automation. Your changes are still here. Please try again."; "Automation was not saved"; "The status could not be changed. Please try again."; "The automation could not be deleted. Please try again."; "Some form choices could not be loaded"; "Workflow choices are unavailable. Please retry loading them."; "This template contains a field that this editor does not support yet."; "The template for this automation is unavailable. Please refresh and try again."; "A saved selection is unavailable in the current list. It will be preserved unless you replace it."

**Auto-evaluation tab** ("Candidate auto-evaluation" — "Manage automatic evaluation and the criteria used in your hiring process.")

| Field | Control | Hint |
|---|---|---|
| "Enable auto-evaluation" | toggle | "Use automatic candidate evaluation with the criteria configured for your jobs." |
| "Configure criteria for each job" | link ("Open jobs ") | — |

State: "Unsaved" / "You have unsaved changes" / "All changes saved" / "Settings unavailable"; "Auto-evaluation settings saved."; "Your changes could not be saved. Please try again."; "Automatic evaluation settings are unavailable"; "Automatic evaluation settings could not be loaded."; "The automatic evaluation service returned an invalid response."

---

### 13. Editor section: Interview Scorecard

| Item | Detail |
|---|---|
| Purpose | Choose and customise the feedback form interviewers fill in for this job. |

| Field | Control | Options | Hint |
|---|---|---|---|
| "Feedback Type" | radio cards | "Basic Feedback" — "A single overall rating plus a remarks field. Best when you want quick, lightweight interview notes."; "Detailed Feedback" — "A scorecard broken into technical skills, soft skills, and an overall rating. Best when multiple interviewers need to compare notes." | "Choose how interviewers will rate candidates. The form they fill in is generated from this choice." |
| Evaluation criteria (Detailed only) | editable list in two groups "Technical Skills" / "Soft Skills" | add "New evaluation criterion" typed "Technical" or "Soft Skill"; samples "System Design", "Communication"; "Remove" | "Skill name cannot be empty" |
| "Overall Rating" / "Overall" | rating | scale words seen: "Very good" / "Very Good", "Exceptional" (remaining scale words not in strings) | — |
| "Remarks" | textarea | — | placeholder "Input your feedback" |

Preview: "Feedback Form Preview" — "Live preview of the scorecard interviewers will fill in. Add or tweak criteria to customise it for this job."; before choice: "Choose a feedback type to preview the scorecard your interviewers will see." Success: "Interview scorecard updated successfully".

---

### 14. Editor section: Job Approval

| Item | Detail |
|---|---|
| Purpose | Send the job to an approval group before it can be published. |
| Hint | "Choose who must sign off on this job before it can be published. Approval requests are emailed to each approver." |

| Field | Control | Options | Validation |
|---|---|---|---|
| "Approval Group" | select ("Select Approver Group") | groups from settings | "Please select an approval group." |
| "Approver List:" | read-only table: approver, "Status", "Action" | status "Pending" / "Approved" / "Rejected" / "Not Approved"; job-level "Pending Approval" | — |
| Buttons | "Send Request" / "Send Approval Request"; "Create a new approval group" / "Create an approval group" | | |

| State | Text |
|---|---|
| No groups | "No approval groups configured yet." — "Approval groups define who needs to sign off on a job before it goes live." |
| Already approved | "This job is already approved" — "No further action required for this section." |
| No approvers (blocking modal) | "No Approvers Configured" / "Approvers Required" — "To add this job with approval enabled, you must configure at least one approver or approver group in your settings."; button "Go to Approval Settings" (`/settings/job_approval`) |
| Multiple groups, no default (modal) | "Multiple approval groups exist without a default. Please select the group to sign off on the job " |
| Progress | "Checking Approval Settings" — "Resolving approvers..."; "Sending Approval Requests" — "Updating job approval group and sending emails..." |
| Success | "Approval request sent successfully!"; "Approval requests sent successfully to group: "; "Approval requests sent automatically to " |
| Error | "Failed to automatically send approval requests."; "Failed to load approval settings."; "Failed to send approval requests." |

---

### 15. Editor section: Get More Applicants (career page, job boards, sharing, campaigns)

Purpose: publish the approved job to the career page and job boards and share tracked links. Sub-blocks: "Career Page Publishing", "Free Job Boards", "Premium Advertising", "Share Job".

**Career Page Publishing** ("Control whether this job appears on your CVViZ-hosted career page and copy the public share link.")

| Field / element | Control | Text |
|---|---|---|
| "Show on Career Page" | toggle | "Include this role in your public job list." |
| Status badge | read-only | "Live on career page"; "Not active"; "Not live: Draft"; "Not live: Pending approval"; "Not live: " + status; "Hidden from career page" |
| Status help | text | "Applicants can find this from your hosted career page."; "This job will appear publicly when it is approved, in progress, and enabled here."; "Job is " + status; "Career page listing and share links should not be treated as live until the job returns to In Progress." |
| "Public job link" | read-only + copy | "Share the public job link:"; "Copy public job link"; toast "Job link copied" |
| "Embed code" | collapsible + copy | "Hide embed code"; toast "Embed snippet copied" |
| Link | — | "Configure career page settings" (`/settings/career_page`) |

**Free Job Boards**

| Element | Text |
|---|---|
| Master switch | "Enable job board publishing" ("Enabled" / "Disabled") |
| Per-board toggle | "Publish on " + board name; board states "Available", "Enabled", "Recommended", "Needs setup", "Not live", "Paused", "Linked" |
| Quick actions | "Recommended" — "Enable the recommended free boards for this job"; "Select all" — "Enable every board that does not need setup"; "Disable all free job boards" |
| Board names in strings | LinkedIn, Indeed ("Enable Indeed Apply from" integrations). Other board names are not in strings (server data). |
| LinkedIn requirement | "LinkedIn publishing requirements" — "To publish your job listings on LinkedIn, please ensure that your LinkedIn Company ID is updated in the company settings. You can update it in the" "Company Settings"; "LinkedIn Help guide" |
| Status messages | "All free boards are ready to publish. Publishing may take 24-48 hours."; "Job boards are paused" — "This job needs to be approved and In Progress before it can be published to job boards. Once eligible and enabled, publishing may take 24-48 hours."; "Job boards are paused because this job is not live. Once eligible and enabled, publishing may take 24-48 hours."; "Job boards will resume when this job is approved and In Progress." |
| Success | "Job boards updated successfully" |

**Premium Advertising**

| Element | Text |
|---|---|
| Section | "Campaign Channels"; "Create a campaign for " job; "Create a campaign to explore advertising options for this job." |
| Buttons | "Create Campaign" / "Create campaign" |
| Empty / validation | "No suggested channels"; "Add channels to create campaign" |

**Share Job** ("Send tracked job links to social channels, colleagues, or vendor partners.")

| Action | Notes |
|---|---|
| "Share on LinkedIn" | — |
| "Share on Twitter" | prefilled text "Apply for job openings at " company |
| "Share on Facebook" | — |
| "Share by email" | — |
| "Share with Vendor" | opens vendor share composer |

---

### 16. Share on social media page

| Item | Detail |
|---|---|
| Route | `/jobs/:jobid/edit/share` (and `/onboarding/jobs/:jobid/edit/share`) |
| Purpose | Final step page prompting the user to share the job. |
| Strings | "Share This Job"; "Do & Dont" (guidance block; its content is not in strings) |

---

### 17. Share job menu and Share with vendors composer (chunks 9340, 9707)

| Item | Detail |
|---|---|
| Purpose | Share the public job link from the list or the job header. |
| Menu items | "Share on LinkedIn", "Share on Facebook", "Share on Twitter" (text "Apply for " + title), "Share with vendor", "Copy job link" ("Click to copy job link"; toast "Link copied") |

**Share job with vendors** (email composer titled "Share job with vendors")

| Field | Control | Validation / hint |
|---|---|---|
| "Vendors" / "Recipients" | multi-select ("Select Vendors", "Search by company name", "Type to search or enter email address") | "Recipients required"; "Recipients limit exceeded" — "You have exceeded the combined limit for recipients, cc and bcc. Please keep the recipients count below " N |
| "Cc recipients" / "Bcc recipients" | tag inputs ("Add Cc...", "Add Bcc...") | — |
| "Subject" | text ("Enter subject...") | "Subject is required" |
| "Template" | picker ("Choose Email Template", "Search templates...", "Apply Template") | "No templates available"; "No templates match your search" |
| "Email body" | rich text ("Write email body here...") with "AI writing assistant" | — |
| Send | "Send via CVViZ" / "Send via Gmail" / "Send via Outlook" | Success "Job accepted for vendor delivery."; error "The job could not be shared. Please try again." |

Vendor creation (chunk 9287, used when adding an external hiring-team member): "Add Vendor" / "Edit Vendor" with "Company name" ("Company name is required", "Company name cannot exceed 50 characters"), "Contact name" ("Contact person name cannot exceed 50 characters"), "Email address" ("Vendor email id is required", "Please enter correct email", "Email cannot exceed 50 characters"), checkbox "Add to Hiring Team" ("Invite this vendor as an external team member to participate in hiring"), "User Role" ("Pre-selected Vendor role for hiring team access"; "Vendor Role Not Found" → "Create a Vendor role"); buttons "Add and Invite", "Invite", "Save changes".

---

### 18. Manage job tags dialog (chunks 9340, JobView)

| Item | Detail |
|---|---|
| Purpose | Add or remove free-form tags on a job. |
| Title | "Manage tags" / "Manage job tags" / "Job tags" / "Edit tags" |
| Field | "New job tag" — text input, placeholder "Add a tag"; button "Add tag" |
| Validation | "Tags cannot contain spaces."; "This tag already exists." |
| Empty | "No tags added yet" |
| Errors | "Failed to add tag. Please try again."; "Failed to remove tag. Please try again." |

---

### 19. Change job status dialog (chunk 2554)

| Item | Detail |
|---|---|
| Purpose | Change the lifecycle status of one job or of all selected jobs. |
| Title | "Update job status" / "Update status for " / "Change status for " |

| Field | Control | Options | Validation / hint |
|---|---|---|---|
| "Job status" | select / radio list ("Select a new status"; current marked "Current" / "Current: ") | Values not listed as a set in strings. Evidence: In Progress, On Hold, Paused (billing text); Pending Approval, Cancelled, Closed, Archived (live chips); Draft (list badge) | "Select a status first" |
| "Remarks " | textarea ("Add context for your team...") | — | "Visible in status history" |
| Scope note | text | — | "This change applies immediately to the job." / "This change applies immediately to all " N |
| Buttons | "Update status", "Cancel" | | |

Errors: "Status is unavailable for this job."; "You do not have permission to change job statuses"; pending-approval and archived/deleted jobs are excluded (see Bulk actions).

**Approval popover on a Pending Approval status** (same chunk): "Group: ", "Approvers" list with "Pending" / "Approved" / "Rejected", button "Resend" ("Approval request sent successfully!" / "Failed to send approval request." / "Failed to refresh approvers:"), "No approval details found.", "Configure Approval".

**Status values and transitions (assembled)**

| Status | Evidence | Rules found |
|---|---|---|
| Draft | "This job is a draft and not yet published"; "Not live: Draft" | "Save draft" keeps it unpublished; "Publish job" or "Submit for approval" moves it on |
| Pending Approval | "Pending Approval"; "Not live: Pending approval" | no status change, archive or bulk action allowed; resolved by approvers through the public approval page |
| In Progress | "approved and In Progress" | only status in which career page, job boards and "Add candidates to a job" work ("Candidates can only be added to in-progress jobs.") |
| On Hold | billing text | counts as active for billing |
| Paused | billing text | counts as active for billing |
| Cancelled | read-only banner | editing and recruitment actions blocked |
| Closed | "Job Closed" | read-only |
| Archived | "Job permanently archived" | permanent; read-only; excluded from bulk actions |
| Inactive (billing) | "Job inactive" | over active-job allowance |

"For billing limits, active jobs include jobs marked In Progress, On Hold, or Paused."

---

### 20. Close job confirmation

| Item | Detail |
|---|---|
| Title | "Close " + job title / "Close Job" |
| Body | "Are you sure you want to close this job?" (chunk variants: "Are you sure you want to close this job ? ") |
| Buttons | "Close job", "Cancel" |
| Success | "Job Closed" / "Job closed!" |
| Close reasons | No close-reason list exists in the strings; the only free text is the "Remarks " field of the status dialog. |

---

### 21. Permanently archive dialog

| Item | Detail |
|---|---|
| Title | "Permanently archive job" / "Permanently archive " + N |
| Warning (single) | "This will permanently remove candidates and related recruiting data from this job." |
| Warning (bulk) | "This will permanently remove candidates and related recruiting data from these jobs." |
| Detail | "Screening questions, notes, skills, feedback, approvals, sharing history, and stored job files will also be deleted. This cannot be undone." |
| Confirm field | text input "Type PERMANENTLY ARCHIVE to confirm"; expected value "PERMANENTLY ARCHIVE"; error "Archive confirmation is required" |
| Success | "Job permanently archived"; bulk "Permanently archived " N |
| Errors | "Could not archive job"; "Could not permanently archive the selected jobs"; "Archive is not allowed for pending approval jobs"; "Archive is not allowed when selection includes pending approval jobs"; "You do not have permission to permanently archive jobs" |

---

### 22. Delete job dialog (job workspace header, chunk 8317)

| Item | Detail |
|---|---|
| Title | "Delete job" — "Are you sure you want to delete " + title |
| Warning | "Deleting this job will delete job and all resumes added for this job." |
| Confirm field | "Type Permanently Delete to confirm" ("Please enter " + phrase); expected value "Permanently Delete" |
| Success | "Job Deleted" |

(This appears to be the older wording of the archive action; both exist in the bundles.)

---

### 23. Assign Recruiters dialog (bulk)

| Field | Control | Validation |
|---|---|---|
| Recruiters | multi-select ("Select recruiters") | "Select at least one recruiter" |
| Buttons | "Assign", "Cancel" | Success "Added recruiters for " N; error "Bulk assignment failed" |

---

### 24. Job workspace shell and header

| Item | Detail |
|---|---|
| Route | `/jobs/:jobid` → tabs `/candidates`, `/details`, `/notes`, `/reports`, `/people_search` (alias `/requisitions/:jobid`) |
| Purpose | Per-job workspace with a shared header and tabs. |
| Tabs | "Candidates", "Job Details", "Notes" (inferred from route title "Job Notes"), "Analytics" (route `/reports`), "People Search" |
| Header facts | "Job Code", "Department", "Location", "Experience" ("Experience required: "), "Created"; "This job belongs to " customer; "View company"; "Job ID: " with "Copy Job ID " ("Job ID copied" / "Could not copy the Job ID" / "Clipboard unavailable") |
| Header actions ("Job Actions" / "Open job actions menu") | "Share job", "Manage tags", "Reports", edit (`/edit`), "Close Job", "Delete job", "Change Status" |
| Add-candidate menu | "Upload resumes" ("Add one or multiple resume files"); "Add contacts or import CSV" ("Create manually or import a spreadsheet"); "Paste resume text" ("Create candidates from copied resumes") |
| Job switcher | "Switch job"; "Current job"; search "Search by title, code, or location"; "Loading jobs"; "No jobs match your search"; "No jobs available" |
| Errors | "Job details are temporarily unavailable."; "Loading job header" |

---

### 25. Job Details tab (read-only view)

| Item | Detail |
|---|---|
| Route | `/jobs/:jobid/details` |
| Purpose | Read-only summary of the job definition, team and approval status. |

| Block | Rows shown |
|---|---|
| "Job overview" / "Hiring essentials" | "Qualification", "Hiring manager" ("Not assigned"), "Department", "Compensation", experience ("Any experience" / "Up to " N / "Not specified") |
| "Job Approval Status" | approver rows "Pending" / "Approved" / "Rejected"; "Approval request sent to "; empty "No approval history found" |
| "Basic Details" | "Job title", "Job Code", "Employer", "Job Type", "Location" |
| "Specifications" | "Minimum Experience", "Maximum Experience", "Qualification" |
| "Skills" | "Skill proficiency levels" — "Hover or focus a skill for its requirement and level."; requirement "Mandatory" / "Desired"; level "Intermediate" / "Expert"; "Type : " |
| "Salary Details" | compensation range |
| "Hiring Team" | "Hiring Manager", "Assigned Recruiters", "External Recruiters", "Contact Email"; empty "No hiring team assigned to this job." / "No team assigned"; "Loading team" |
| "Job Description" / "About this role" | rich text; empty "No job description has been added yet." |

Loading: "Loading job details".

---

### 26. Notes tab

| Item | Detail |
|---|---|
| Route | `/jobs/:jobid/notes` |
| Purpose | Team notes, tasks and replies attached to a job. |
| Heading | "Job notes" / "Team notes" — "Decisions, follow-ups, and updates for this job."; activity list "Activity" |

| Field | Control | Options | Validation |
|---|---|---|---|
| Note body ("Add an update") | rich text editor (same toolbar as the job description) | — | "Note can not be empty!" |
| "Note type" | select / toggle | "Job note"; task (inferred from task strings) | — |
| Visibility | toggle | "Make visible to the team" ("Team visibility") / "Mark as private" ("Private") | — |
| "Due date" | date-time picker ("Add due date" / "Change due date"; format "MMM D, h:mm A") | — | "Due date must be in the future" |
| "Assign to user" | user select; shortcut "Assign to myself" | team members | "Unable to assign this task. Please refresh and try again." |
| Buttons | "Add Note", "Update", "Add Reply", "Cancel" | | |

| Element | Strings |
|---|---|
| Row badges | "Private note", "Private task", "Edited", "Task completed", "Task created by ", "Task assigned to me", "Task assigned to ", "Assigned to Me" |
| Row actions | "Edit note", "Delete note", reply |
| Delete confirm | "Delete this note?" — button "Delete" |
| Success | "Note Added!", "Note updated!", "Note Deleted!", "Reply added!", "Reply updated!", "Success!" |
| Empty | "No notes to show" — "Updates and team discussions for this job appear here."; "No activity yet" |
| Loading | "Loading job notes" |

---

### 27. Analytics tab (job report)

| Item | Detail |
|---|---|
| Route | `/jobs/:jobid/reports` |
| Purpose | Per-job hiring analytics for a chosen date range. |
| Heading | "Job analytics" / "Hiring analytics" — "Activity for this job in the selected date range." |
| Controls | Date range picker ("YYYY-MM-DD") with "Date range presets"; "Refresh" |

| Block | Content | Empty text |
|---|---|---|
| KPI tiles | "Candidates", "Shortlisted", "Interviewed", "Offered", "Joined", "Average days to join" | "No candidates in this range"; "No joined candidates in this range"; "Timing data unavailable" |
| "Hiring funnel" | funnel chart over Candidates → Shortlisted → Interviewed → Offered → Joined | "No candidate activity in this range" |
| "Source mix" | share by source | "No source activity in this range" |
| "Resume upload trend" | "Daily uploads for the five highest-volume sources."; series "Resumes" | "No upload timeline in this range" |
| "Time to stage" | "Average elapsed days and candidate volume at every reached stage."; axis "Average days" | "No stage activity in this range" |
| Table "Resume upload sources" | "Detailed source totals for the selected range." Columns: "Source", "Uploaded resumes", "Active days" | "No uploads in this range" |
| Table "Time-to-stage details" | "Candidate volume and average elapsed time by stage." Columns: stage, "Candidates", "Average days" | — |

Source values: "Upload", "Career page", "General career page", "Vendor", "Referral", "People Search", "Customer API", "Unknown".

Errors: "A job is required to load analytics."; "Report data is unavailable. Please retry."; "The job report could not be loaded."; "We couldn't load the job report". Loading: "Loading ".

---

### 28. Job inactive / over-limit screen

| Item | Detail |
|---|---|
| Route | wraps `/jobs/*` (chunk `p__Jobs__index`) |
| Purpose | Blocks a job that falls outside the active-job allowance. |
| Title | "Job inactive" ("Job inactive. View access information.") |
| Admin text | "This job is outside your current active-job allowance because the job top-up expired." — "Renew the top-up or reduce the number of active jobs to restore access." |
| Non-admin text | "This job is currently unavailable because your organization is over its active-job limit." — "Contact your account admin to restore access." |
| Note | "For billing limits, active jobs include jobs marked In Progress, On Hold, or Paused." |
| Buttons | "Review billing" (`/settings/billing`), "Back to jobs" (`/jobs`) |

---

### 29. Public job approval page

| Item | Detail |
|---|---|
| Route | `/job-approval` (public, token link from the approval email) |
| Purpose | Lets an approver approve or reject a job request without signing in. |
| Intro | "Hiring team requires your approval on this job request."; after a decision "Update your decision on this job request:"; "You have " (current decision prefix) |

| Block | Rows |
|---|---|
| Job summary | title (fallback "Untitled Job"), department (fallback "General"), "Location", "Compensation", "Experience", "Qualification", "Mandatory Skills", "Desired Skills" (levels "Intermediate" / "Expert"; "None specified"), "Primary Contact"; fallback "Not Specified" |
| Actions | "Approve Job" / "Approve"; "Reject Job" / "Reject" |

| Confirmation | Text | Field | Buttons |
|---|---|---|---|
| Approve | "Are you sure you want to approve this job?" | "Job approval comments" textarea ("Input your comments...") | "Accept", "Cancel" |
| Reject | "Are you sure you want to reject this job?" | same comments textarea | "Reject", "Cancel" |

| Result | Title | Text |
|---|---|---|
| Approved | "Job Approved Successfully" | "You have approved this job request. The hiring process can now proceed." |
| Rejected | "Job Request Rejected" | "You have rejected this job request. The hiring team has been notified." |

---

### 30. Public vendor upload — job details view

| Item | Detail |
|---|---|
| Route | `/upload` (public vendor link) |
| Purpose | Shows the job to an external vendor before they upload resumes. |
| Blocks | "Skills Required"; "Job Description"; "Upload" action |
| Errors | "Vendor upload access is unavailable."; "This vendor upload link is invalid or no longer available." |

---

### 31. Settings: Job Approval

| Item | Detail |
|---|---|
| Route | `/settings/job_approval` |
| Purpose | Turn the approval workflow on and maintain approvers and approval groups. |
| Heading | "Job Approval" — "Manage approval workflow and configure approvers for job postings" |
| Master switch | "Enable job approval" ("Active" / "Inactive"); when off: "Job approval is turned off" — "Enable job approval to configure approvers and approval groups for job postings." |
| Plan gate | "Job Approval is not included in your plan" — "Upgrade your subscription to configure job approval workflows."; button "View Plans" (`/settings/billing`) |
| Save messages | "Job approval settings saved."; "Could not save job approval settings. Please try again."; "Job approval settings could not be loaded" |

**Approvers table**

| Column | Notes |
|---|---|
| "Approver Name" | — |
| "Email Address" | — |
| "Approval Groups" | "No Group" when none |
| "Actions" | "Edit Approver", "Delete" |

**Add / Edit Approver dialog** ("Add Approver" / "Update Approver")

| Field | Control | Validation |
|---|---|---|
| "Approver Name" | text | "Approver contact person is required" |
| "Approver Email Address" | email | "Approver email id is required"; "Please enter correct email" |
| "Approval Groups" | multi-select ("Select groups") | "Please select groups!" |

Delete approver: title "Delete approver"; "Are you sure you want to delete this approver?"; "Approver :  " name; error "The approver could not be deleted. Please try again." Empty: "No approvers yet. Add the people who can approve job postings." Load error: "Approvers could not be loaded"; "The approver list is unavailable. Retry loading it above."

**Approval groups table**

| Column | Notes |
|---|---|
| "Group Name" | badge "Default" / "Default group" |
| "Group Description" | — |
| "Approvers" | "No Approver" when none |
| "Actions" | edit, "Delete" |

**Add / Edit Approval Group dialog** ("Add Approver Group" / "Add Approval Group" / "Update Approval Group")

| Field | Control | Validation |
|---|---|---|
| "Group Name" | text | "Please input the group name!" |
| "Group Description" | text | "Please input the group description!" |
| "Approvers" | multi-select ("Select approvers") | "Please select approvers!" |
| "Set this group as default" | checkbox | — |

Delete group: title "Delete group"; "Are you sure you want to delete this group?"; "Group :  " name; error "The approval group could not be deleted. Please try again." Empty: "No approval groups yet. Create a group to organize job approvers." Load error: "Approval groups could not be loaded"; "The approval group list is unavailable. Retry loading it above."

---

### 32. Add candidates to a job dialog (chunk 3185, used from the candidate database)

| Item | Detail |
|---|---|
| Title | "Add candidates to a job" |
| Body | "Choose an in-progress destination job for the selected candidates. Existing applications will be skipped automatically." |
| Field | "Destination job" — searchable select ("Select a destination job"; "Search jobs by title, code, or location"; "Loading jobs..."; "No matching in-progress jobs found") |
| Summary | "Selected candidates" / "Candidates Selected" / "No candidates selected"; "Selected job", "Job ID: " |
| Rule | "Candidates can only be added to in-progress jobs." |
| Results | "They are now available in " job; "No candidates were added"; "No changes were made. Close this window and try again."; button "View Job" |

---

### Items not determinable from the strings

| Item | Finding |
|---|---|
| Job type list | only "Full Time" present; rest comes from `/api/jobs/editor-reference-data` |
| Industry, Employer Type, Job Function lists | server reference data; not in strings (the industry-like words in chunk 2554 — Consulting, Technology, Agriculture, Finance, Healthcare, Education, Retail, Manufacturing — belong to a company card, not confirmed as the job industry list) |
| Education level, qualification, experience range, pay frequency, currency lists | not in strings |
| Skill proficiency levels | only "Intermediate", "Expert" present |
| Close reasons | none exist in strings |
| Job board names | only LinkedIn and Indeed present |
| "Clone Job", "Edit Job", "Archive Job" exact menu wording | "Clone" has no string in any bundle |
| Keyboard key bindings | only "Escape" and "Middle click" present |
| Full job status enumeration and allowed transitions | assembled from scattered strings; no single list |

### Option lists loaded from the server (job form)

Read from the job-editor reference data on 2026-10-03. Employer types and job functions depend on the chosen industry and are loaded after one is picked.

**Industries (28):** Aerospace, Agriculture, Aviation, BFSI, Civil, Construction, Consulting, E-Commerce, Education, Energy, Engineering, Entertainment, Government, Healthcare, Hospitality, IT, Learning and Development, Legal, Manufacturing, Marketing, Non Profit, Pharmaceutical, Real Estate, Retail, SaaS, Space and Defence, Transport and Logistics, Unknown.


---

## 5. Candidates module

Conventions: text in "quotes" is exact wording from the bundles. A trailing "…" inside quotes means the bundle string ends there and a dynamic value (name, count, date) is appended at run time. "(inferred)" marks a grouping or behaviour deduced from string proximity, not stated in the strings.

Route map (from the router bundle):

| Screen | Route(s) |
|---|---|
| Candidate list in a job | `/jobs/:jobid/candidates` |
| Candidate database | `/discover/-99/candidates` (`-99` is the pseudo job id for the database / talent pool); `/discover/:jobid/candidates`; `/discover` |
| Candidate profile | `/jobs/:jobid/candidates/:canid`, `/jobs/:jobid/candidates/:canid/profile`, `/jobs/:jobid/candidates/:canid/:tab`, `/jobs/:jobid/candidates/:canid/resumes`, `/jobs/-99/candidates/:canid/resumes`, `/discover/:jobid/candidates/:canid`, `/discover/:jobid/candidates/:canid/profile`, `/discover/:jobid/candidates/:canid/:tab`, `/discover/candidates/:canid`, `/requisitions/:jobid/candidates/:canid` |
| People Search | `/jobs/:jobid/people_search`, `/discover/:jobid/people_search` |
| Public pages | `/screening`, `/screening/:id`, `/shortlisting`, `/shortlisting/:id`, `/job-offer`, `/job-offer/:id`, `/consent`, `/consent/:id`, `/consent/:id/:legacy`, `/consent/:id/success`, `/gdpr`, `/gdpr/:id`, `/gdpr/:id/success`, `/book/:token`, `/book/:token/confirmed`, `/upload` |

Navigation names seen: "Job Candidates", "Candidates", "Candidate database", "People Search".

---

### 1. Candidate list inside a job

**Route:** `/jobs/:jobid/candidates`
**Purpose:** Work the pipeline of one job: search, filter, sort, evaluate and act on its candidates.

**Layout blocks**

| Block | Content |
|---|---|
| Job header | Job title, "Job ID: …" ("Copy Job ID …", toast "Job ID copied" / "Could not copy the Job ID" / "Clipboard unavailable"), "Experience required: …", "View company", "Switch job" picker (search "Search by title, code, or location"; "Current job"; "Loading jobs"; "No jobs match your search"; "No jobs available"), job tabs "Candidates", "Job Details", "Analytics", "People Search"; "Loading job header" |
| Header buttons | "Add Candidates", "Evaluate", "Share job", "Bulk actions" ("Open bulk actions menu, …"), "More job actions" ("Open job actions menu", "Loading job actions"), "Change Status" (job status) |
| Search box | Placeholder "Search candidates by name, email, role, skill, or company"; help popover "Full text Search Operators" (example value "FullStack Developer") |
| Toolbar | "Show filters" / "Hide filters" / "Filters (n" / "Show filters (n"; "Saved views"; "Sort candidates"; display: "List view" / "Card view", "Row density", "Hide pipeline" / "Show pipeline" ("Hide stage pipeline" / "Show stage pipeline"); "Keyboard shortcuts (?)"; "Quick Actions" |
| Stage pipeline | "Candidate stages" chips with counts, first chip "All Candidates"; "Scroll stages left" / "Scroll stages right"; "Loading candidate stages" |
| Applied filters bar | "Applied filters", "Active", "Clear all filters", "Clear filters"; hint "These conditions limit the candidate list. Filters below narrow it further." |
| Result list | Table or cards; "Showing …"; "Select all candidates on this page"; "Scroll columns left" / "Scroll columns right"; "Skip to candidate list" |
| Post-evaluation banner | "Just evaluated: …" + "Showing the candidates from this evaluation. Your previous filters and stage are temporarily paused." + "Back to all candidates" / "Show all candidates" |

**Table columns**

| Column | Content |
|---|---|
| (checkbox) | "Select …" per row; "Candidate row …" |
| Candidate | Name ("Unknown Candidate"), role ("Role not specified"), avatar, "Candidate tags", "New candidate tag", "Discovered candidate" badge, "View resume for …", contact icons "Click to email …", "Click to call …", "Click to WhatsApp …", "Email …" |
| Profile Summary | Experience ("Experience not specified"), location ("Location not specified"), qualification ("Qualification not specified"; degree abbreviations "B.Tech", "M.Tech" mapped from "Bachelor of Technology", "Bachelor of Engineering", "Master of Science"); expandable "Detailed profile" / "Profile details": "Work history" ("Roles, companies and dates"), "Education" ("Degrees and institutions"), "Inferred skills" ("Skills found in the resume"), "Profile summary" ("Structured, searchable details"); badges "Basic parsed" / "Advanced parsed" |
| Job & Stage | Stage pill (tooltip "Current pipeline stage. Click a status pill or press S when the row is focused to update."), "Candidate stage: …", "N other job applications" popover |
| Match & Fit | "Grade : …", "Skill Match :…", "Overall grade …"; header help "About overall grade and skill fit"; "High skill match: 85% or higher."; "No match score yet"; "Not evaluated"; "Recommendation: …"; "Skill fit details" |
| Source & Added | "Source: …" ("Unknown source"), "Uploaded by: …", "Applied", "Updated", "Last activity", date ("Date unavailable") |
| Screening | Pre-screening answers shown as columns: "Question …", "No answer". Gate: "Available on eligible higher plans. Show pre-screening answers as columns." |
| Actions | Notes icon ("View notes" / "Click to add a note" / "Add a note" / "Add note"), "Send email", "Candidate feedback" ("Based on …" reviews, "View feedback …"), "More candidate actions" |

Card view shows the same data with these section captions: "Resume details", "Screening insights", "Filter-ready pipeline", "Top matched skills" ("No top skills were captured for this candidate."), "Skill fit". "Loading candidate cards".

**Source values:** "Upload", "Career page", "General career page", "Referral", "People Search", "Customer API"; plus database origin badges "Discovered from existing database", "Found in candidate database".

**Vendor approval badge values (inferred use):** "Pending Approval", "Not Approved", "Approved", "Pending".

**Row actions ("More candidate actions" menu)**

| Action | Notes |
|---|---|
| "View profile" | Opens candidate profile |
| "View resume" | Resume preview drawer; "Previous Resume …" / "Next Resume …" |
| "Copy profile link" | Toast "Profile link copied"; error "Clipboard is unavailable in this browser" |
| "Add note" | Notes drawer (section 10) |
| "Change status" | Update stage dialog (section 8) |
| "Send email" | Email composer (section 12) |
| "Setup interview" | Schedule interview (section 15); event title "Interview with …" |
| "Add tags" | Add tags dialog (section 14) |
| "Share resume" | Share selected resumes composer (section 12) |
| "Send Screening Form" | Composer variant (section 12) |
| "Download resume" | Errors: "Resume file path is unavailable", "Resume download URL is unavailable", "Unable to download resume. Please try again.", permission: "You don't have permission to download resumes. Ask your administrator to enable 'Download Resumes' for your role." |
| "Edit candidate" | Edit candidate form (section 5.15) |
| "Delete candidate" | Toast "Candidate deleted" |
| "Evaluate candidate" / "Run advanced evaluation" / "Review advanced options" | Evaluation dialog (section 9) |
| "Extract resume details" | Advanced parsing (section 5.3) |

**Sort options** (menu "Sort candidates", "Sort candidates, current sort …", "Reset sort")

| Option | Description text |
|---|---|
| "Stage, then grade (default)" / "Default" | "Later stages first, then highest overall grade, then most recently updated" |
| "Recently added" | |
| "Oldest first" | |
| "Top grade first" | |
| "Lowest grade first" | |
| "Best skill match" | |
| "Status (early stages)" | Command name "Sort: Lowest status first" |
| "Status (late stages)" | Command name "Sort: Highest status first" |
| "Longest waiting first" | Used with the review-queue presets below |
| "Shortest waiting first" | Used with the review-queue presets below |

**Row density options:** "Comfortable" ("Default row height"), "Compact" ("Tighter rows, more on screen"), "Ultra-compact" ("Avatar-first scan mode with minimal row details").

**Bulk actions** ("Bulk actions on …", "Selected candidate actions", "Selected …", "Select all …", "All matching candidates selected"; error "Could not select all candidates across pages. Please retry.")

| Action | Validation / result |
|---|---|
| "Send Resumes" | "Please select candidates!" |
| "Submit to Client" | |
| "Email Candidates" / "Email candidates" | "No selected candidates have email addresses." / "Please select candidates with email!" |
| "Change Candidate Status" | Update stage dialog |
| "Send Scheduling Link" | "Selected candidates must have email addresses." Subject default "Interview Schedule - …" / "Interview Schedule" |
| "Send Screening Form" | |
| "Add Tags" | |
| "Add Candidates to Job" | Section 16 |
| "Add to Email Marketing Audience" | Section 19 |
| "Re-parse Resumes" | Section 20 |
| "Export" → "Export Selected", "Export All", "Export to Excel" | Section 17 |
| "Download Candidates" (resume archive) | Section 17 |
| "Delete Candidates" | Section 21; "Failed to delete candidates." |

**Empty, error and loading messages**

| Situation | Text |
|---|---|
| No candidates in job | "No candidates yet" + "Build your shortlist by adding resumes to this job. Once candidates are added, you can screen, sort, and move them through the pipeline." + button "Add Candidates" |
| Read-only job | "This job is read-only and has no candidates." |
| Filters return nothing | "No matching candidates" / "No candidates match the current filters" + "Try broadening your filters" + "Clear filters" / "Modify search above" |
| Generic | "No candidates", "No candidates to show" |
| Load failure | "We couldn't load candidates" / "Failed to load candidates" + "Please check your connection and try again." + "Back to dashboard" |
| Loading | "Loading candidates" |
| Experience filter caveat | "The years of experience of the candidate could be outside given range." / "The years of experience of the candidate could be outside given range or candidate is new (Not yet evaluated)." |
| Evaluation note | "The candidate's resume has been evaluated and evaluated according to the job's requirements." |
| Resume quota | "Resume Limit Exceeded"; "The maximum number of resumes has been reached. Please consider upgrading your account or adding resume credits to continue viewing candidates."; "Please upgrade your account or add resume credits to view this information."; buttons "Upgrade / Add Credits", "Upgrade or Add Resume Credits"; non-admin: "Contact account admin", "Please contact your account admin" |

**API paths seen:** `/candidates`, `/profile`, `/edit`, `/notes`, `/resumes`, `/feedbacks`, `/dashboard`, `/settings/billing`, `/discover/-99/candidates`, `/details`, `/requisitions`, `/jobs`, `/api/workflow-templates`, `/workflow`.

**Plan / permission gates:** screening-answer columns ("Available on eligible higher plans…"); saved views ("Saved views limit reached.", "Available on higher plans.", "Upgrade your plan", "Open Billing"); resume limit; "Download Resumes" role permission; export ("You are not allowed to export candidates. Please upgrade your plan to unlock this feature.").

---

### 2. Candidate list: filters drawer

**Purpose:** Narrow the candidate list; shared by the job list and the candidate database. Opened by "Show filters" / "Open filters drawer". Title "Filters"; sections "Basic Filters", "Advanced Filters", "Pre-Screening Questions", "Visa Details".

**Basic filters**

| Label | Control | Options / placeholder | Hint |
|---|---|---|---|
| "Status" | Multi-select | Pipeline stages (section 8 list); "Any status"; "No status set" | |
| "Source" | Select | "Any source"; values as in Source list | |
| "Vendor" | Select | "Any vendor" | |
| "Recruiter" | Select | "Any recruiter" | |
| Job | Select | "Any job"; "Candidate Database"; "Candidates Database (Talent Pool)" | |
| Tags | Multi-select | "Any tag" | |
| "Skill Match" | Range | Percentage | chip label "Skill match" |
| "Min Experience" | Select | "Select Min Experience" | |
| "Max Experience" | Select | "Select Max Experience" | |
| "Uploaded Date Range" | Date range | "YYYY-MM-DD" | quick chip "Last 7 days" |
| "With email" | Toggle | | |
| "Has notes" | Toggle | | |

**Advanced filters** (when not allowed: "Advanced filters are disabled.")

| Label | Control | Placeholder | Hint |
|---|---|---|---|
| "Job Titles" | Multi-select + "all" checkbox | "Select Job Title" | "When this is checked, the search will return candidates who have all the selected job titles." |
| "Company Name" | Multi-select + "all" checkbox | "Select Company Name" | "When this is checked, the search will return candidates who worked in all the selected companies." |
| Top skills | Multi-select + "all" checkbox | "Filter By Top Skills" | "When this is checked, the search will return candidates who have all the selected skills." |
| "Qualifications" | Multi-select | "Filter By Qualifications" | |
| "Worked in Cities" | Multi-select | "Filter By Worked In Cities" | |
| "Country" | Select | "Filter By Country" | |
| States | Multi-select | "Filter By States" | |
| Cities | Multi-select | "Filter By Cities" | |
| "Zipcode" | Input | "Filter By ZipCode" | |
| "Expected Salary (PA)" | Range | | chip label "Expected salary" |
| "Job change frequency" | "Operator" select + count + "Months" | Operators: "Less than", "At least", "Exactly" | "Filters candidates based on the number of job changes within a specified time period. Example: …"; "Clear all"; chip label "Job changes" |

**Visa details**

| Label | Control | Placeholder |
|---|---|---|
| "Visa Country" | Select | "Filter By Visa Country" |
| "Visa Type" | Select | "Filter By Visa Type" |
| "Visa Valid Till" | Date | "YYYY-MM-DD" |

**Pre-screening questions:** one control per job screening question; "Search or select answers", "Search answer", "Select Option", date "DD/MM/YYYY"; empty "No screening questions found for this job"; error "Error fetching question answers:".

**Review-queue presets (deep-link filters from dashboard cards; inferred use)**

| Preset title | Chip / subtitle | Description |
|---|---|---|
| "Applications to review" | "All awaiting review" | "Applications in review stages, including recent applications and those with unknown stage timing. Older records are excluded using the workspace review policy." |
| "Needs review" | "Waiting …" | "Candidates in review stages who have waited at least …" |
| "Waiting in a stage too long" | "In one stage …" | "Candidates who have stayed in one hiring stage for at least …" |
| "Inactive candidates" | "No stage movement for 1+ year" | "Candidates who have not moved to another hiring stage in over a year." |
| "Interview feedback needed" | "Feedback pending …" | "Interviewed candidates waiting at least …" |
| "Awaiting offer response" | "Offer response pending" | "Candidates whose latest offer is still waiting for a response." |
| "Selected hiring stage" | | "Candidates currently in the selected hiring stage." |

Preset condition labels shown as chips: "Review age limit (includes unknown timing)", "Review age measured in", "Hiring stages", "Excluded stages", "Stage scope" (values "Active job", "Assigned to a hiring stage", "Stage …", "Other hiring stage", "Talent pool"), "Minimum time in stage", "Maximum time in stage", "Offer response" (values "Awaiting response", "Selected offer statuses").

Other chip labels: "Company", "Qualification", "Worked in cities", "Zipcode". Chip removal uses "Backspace"; "Escape" closes.

---

### 3. Candidate list: saved views, command palette, keyboard shortcuts

**Saved views** (menu "Saved views")

| Element | Text |
|---|---|
| Intro | "Save the current filters, sort, and column setup so you can jump back to it with one click." |
| Save button | "Save current" (tooltip "Save the current filters, sort, and column setup as a preset") |
| Disabled states | "Apply filters, sort, or adjust columns first, then save the view"; "This view is already saved" / "Already saved" |
| Name field | Validation "Please name your view"; "A view with that name already exists" |
| Option | "Share with team" |
| Per-view actions | "Apply view: …", "Copy link to this view" ("Copy link for view …"), "Delete this view" ("Delete view …") |
| Toasts | "Saved view …", "Applied …", "Link copied for …", "Couldn't copy view link" |
| Current indicator | "Viewing saved: …" |
| Gates | "Saved views limit reached."; "Available on higher plans."; "Upgrade your plan"; "Open Billing" |

**Command palette** ("Command palette", "Ctrl+K", "Commands", "No commands match"): "Sort: Recently added", "Sort: Oldest first", "Sort: Highest status first", "Sort: Lowest status first", "Sort: Top grade first", "Sort: Lowest grade first", "Sort: Best skill match", "Sort: Reset", "Clear all filters", "Open filters drawer", "Saved views", "Apply view: …", "Density: Comfortable", "Density: Compact", "Keyboard shortcuts".

**Keyboard shortcut sheet** ("Keyboard shortcuts")

| Group | Entries |
|---|---|
| "Command palette" | "Open the command palette" |
| "Navigation" | "Focus candidate rows and controls"; "Open the focused candidate"; "Clear selection / close menus" |
| "Search & filter" | "Focus the search box" |
| "Selection" | "Toggle checkbox when focused on selection"; "Select a range of rows" |
| Row actions | "Open notes for the focused row"; "Send email to the focused row"; "Open status update for the focused row" (key S per the stage tooltip) |
| Help | "Show this shortcut sheet" (key ?) |

---

### 4. Candidate database

**Route:** `/discover/-99/candidates`
**Purpose:** One searchable list of every candidate in the account, across jobs and the talent pool.

**Header:** title "Candidate database", subtitle "Search, organize, and engage your talent network"; breadcrumb label "Jobs & Resumes".

**Tabs**

| Tab | Tooltip |
|---|---|
| "All candidates" | "All candidates, including those linked only to inactive jobs" |
| "In active jobs …" | "Candidates linked to at least one active job" |
| "Talent pool …" | "Candidates not linked to any job" |

**Table columns:** "Candidate", "Profile Summary", "Job & Stage", "Source & Added", "Actions" (same cell content as section 1; "Match & Fit" belongs to the job list).

**Talent-pool row note:** "This profile is stored in the Talent Pool. Any job applications are listed below." Badge "Talent Pool".

**"Job & Stage" cell / other applications popover**

| Element | Text |
|---|---|
| Titles | "Job applications" (database) / "Other job applications" (job list) |
| Search | "Search job applications", placeholder "Search by job title or ID", "Clear search" |
| Hint | "Select an application to open in a new tab" |
| Row | Job title, "Job ID: …", "Candidate stage: …" |
| Empty | "No job applications to show." / "No other job applications to show." / "No matching applications." |
| Close | "Close …", key "Escape" |

**Toolbar, filters, sort, saved views, density, bulk actions:** same components as sections 1 to 3. Bulk menu items: "Send Resumes", "Submit to Client", "Email Candidates", "Change Candidate Status", "Send Scheduling Link", "Send Screening Form", "Re-parse Resumes", "Add to Email Marketing Audience", "Add Candidates to Job", "Export to Excel" / "Export All" / "Export Selected", "Delete Candidates".

**Add menu:** "Upload resumes" ("Add one or multiple resume files"), "Add contacts or import CSV" ("Create manually or import a spreadsheet"), "Paste resume text" ("Create candidates from copied resumes").

**Empty states:** "No candidates found in your database!" + "Upload candidates to your account and explore discover candidates option."

**API paths seen:** `/discover/-99/candidates`, `/candidates`, `/api/candidate-exports`, `/api/resume-archives`, `/api/candidate-database/candidate-imports/contacts`.

---

### 5. Candidate profile

**Route:** `/jobs/:jobid/candidates/:canid[/profile|/:tab]` and `/discover/:jobid/candidates/:canid[/profile|/:tab]`
**Purpose:** Full record of one candidate in the context of one job application (or the database), with every action available on the person.

**API paths seen:** `/candidates`, `/profile`, `/edit`, `/notes`, `/details`, `/resumes`, `/feedbacks`, `/dashboard`, `/settings/billing`, `/discover/-99/candidates`, `/api/integrations/twilio`, `/api/integrations/twilio/voice-tokens`, `/api/integrations/twilio/messages`.

#### 5.1 Header and summary

| Block | Content |
|---|---|
| Pager | "Previous candidate" / "Next candidate" |
| Identity | Name ("Name unavailable"), role ("Role not specified" / "Role not provided"), badge "Discovered candidate" |
| "Candidate context" | Value "Current application" + "Job application", or "Candidate database" |
| "Contact details" | Email, phone with "Click to email …", "Click to call …", "Click to WhatsApp …"; copy feedback "Copied"; empty "No email or phone number added." |
| "Hiring stage" | Stage pill, opens Update stage dialog |
| "Evaluation" | "Overall grade", "Skills match", "Evaluated …" / "Evaluation date unavailable" / "Not evaluated yet"; links "View basic evaluation", "View match & fit" |
| "Team rating" | Average of reviewer ratings; "No feedback yet"; link "View interview feedback" |
| Tags | "Candidate tags", "New candidate tag", "You added this tag …", "More Tags" |
| "Additional candidate details" / "Additional details & tags" | Expandable: "Notice period", "Current salary", "Expected salary", "Candidate profile details" |
| "Experience sources" | "Candidate profile:" vs "Resume summary:" totals; warning "These sources report different totals. Review the work history before updating the profile."; link "Compare experience sources" |
| Discovered-origin panel | "This profile already existed in your candidate database and was matched to this job."; "Originally added to" + job title + "Job ID: …" + "View original job …"; badges "Discovered from existing database" / "Found in candidate database" |
| Other applications | "Other job applications" popover (as in section 4) |
| Credit status chip | "Advanced credits available" / "No Advanced credits available" / "Credit balance unavailable" / "Subscription expired"; texts "Advanced parsing credit available.", "Credit balance is unavailable.", "Your subscription has expired."; buttons "Get credits", "Add credits", "Get parsing credits", "Check credits", "Manage subscription"; non-admin text "Contact your account administrator to …" |

**Header buttons and "More candidate actions" menu**

| Action | Opens / effect |
|---|---|
| "Add note" | Panel "New note" ("Share context and updates with the hiring team.") |
| "Send email" | Panel "New email" ("Write and send a message to this candidate.") |
| "Schedule" → "Schedule interview", "Schedule event" | Schedule interview dialog / calendar event ("Interview with …", "Interview") |
| "Edit candidate profile" | Panel "Edit candidate" |
| "Add document" | Panel "Add document" ("Attach a file and add an optional description.") |
| "Add interview feedback" | Panel "Add interview feedback" ("Record your assessment for the hiring team."); disabled state "Feedback already submitted" with "You have already submitted feedback for this candidate." |
| "Send resume" | Share resume composer |
| "Send screening form" | Screening form composer |
| "Send offer" / "Send job offer" | Panel "Send job offer" ("Review the offer message before sending it.") |
| "Download resume" | Same errors and permission text as section 1 |
| "Manage data privacy" | Data Privacy tab |
| "Evaluate candidate" / "Run basic evaluation" / "Run advanced evaluation" | Evaluation dialog (section 9) |
| "Extract resume details" | Advanced parsing |
| Contact menu "Contact" → "Twilio Call", "Twilio SMS" | Section 5.6 |
| "Delete candidate" | Toast "Candidate deleted!" |

Generic side panel wrapper: "Candidate action" + "Complete this action or close it to return to the profile."

**Recommended next step card** ("Recommended next step")

| Variant | Title | Body | Button |
|---|---|---|---|
| Parsing | "Build a detailed profile" / "Extract details from this resume" | "Use Advanced parsing to extract work history, education and skills from the resume into this profile." / "Extract work history, education and inferred skills from the resume."; list "Advanced parsing adds" | "Extract resume details" |
| Evaluation | "Get a detailed job assessment" | "Assessment includes": "Overall fit" ("Grade, strengths and areas to review"), "Skills & gaps" ("Matches and missing job requirements"), "Experience fit" ("Relevant experience and role alignment"), "Education fit" ("Qualifications against job requirements"); note "Review the evaluation criteria before using Advanced credits." | "Run advanced evaluation"; alt "Use basic evaluation instead" |
| Done | "Complete" | | |

Errors: "Could not check credits. Please try again."; "Could not refresh the profile. Reopen it to see the latest result."

**Tabs** (12): "Profile", "Resume", "Timeline", "Calls & SMS", "Screening Answers", "Emails", "Documents", "Interview Feedback", "Cover Letter", "Events", "Job Offers", "Data Privacy". A notes panel also exists ("Notes for …").

**Tab group captions:** "Resume & files", "Communication", "Screening & Evaluation", "Hiring", "Data privacy". Membership inferred: Resume & files = Resume, Documents, Cover Letter; Communication = Emails, Calls & SMS, Events; Screening & Evaluation = Screening Answers, Interview Feedback; Hiring = Job Offers; Data privacy = Data Privacy.

#### 5.2 Tab: Profile

| Section | Content | Empty / helper text |
|---|---|---|
| "Skills" | Skill chips; "Inferred from resume" marker; "Show all …" / "Show fewer"; "Edit skills" | "No skills added yet." |
| Edit skills (inline) | "New skill" input (placeholder "Add a skill"), "Add skill", "Save skills"; warning "Some entries may be resume headings." | "Skills updated."; "Could not update skills. Candidate details are missing."; "Could not update skills. Please retry."; "Failed to update skills:" |
| "Work experience" | Role, company, dates ("Present", "Until …", "Dates not provided"); "Company not specified" | "No work history in this profile" + "Review the original resume for employment details." (button "Review original resume") or "Add a resume to capture employment details." (button "Add resume"); "No professional experience details were extracted for this candidate."; "Loading professional experience..." |
| "Education" | Degree ("Degree not specified"), institution ("Institution not specified" / "Institution not provided"), "Major: …", "Rank: …" | "No education details were extracted for this candidate."; "Loading education details..." |
| "Resume summary" | Parsed summary; "Read more"; "Parsed …" | "No profile summary" |
| "Certifications" | List | |
| "Achievements" | List | |
| "Research and publications" | List | |
| "Activities" | List | |
| Address | "Address", "Country", "Zipcode" | |
| Social links | "Linkedin", "Github", "Medium", "Facebook", "Twitter", "Instagram", "Stack Overflow", "Behance" | |
| Job details | "Notice period", "Current salary", "Expected salary" | |
| Parsing status | "Basic parsed" / "Advanced parsed"; "This resume has already been processed with Advanced parsing."; "This profile has already been Advanced parsed."; "Checking resume details..."; "Could not check this resume's parsing details."; "No details extracted" / "No extracted details"; "Loading details" | "Add a resume first" + "Add a resume to extract candidate details."; "Complete candidate profile" |

#### 5.3 Advanced parsing (resume detail extraction)

| State | Title | Text | Button |
|---|---|---|---|
| Credit ready | "Credit available" | "Advanced parsing credit available." | "Extract resume details" |
| No credits | "Advanced credits required" | "Advanced parsing credit required." / non-admin "Contact your account administrator for Advanced parsing credits." | "Get parsing credits" |
| Unknown | "Check credit availability" | "Check your Advanced parsing credit availability." | "Check credits" |
| Expired | "Subscription inactive" | "Renew your subscription to use Advanced parsing." / non-admin "Contact your account administrator to renew the subscription." | "Manage subscription" |
| Non-admin generic | | "Contact your account administrator to extract resume details." | |
| Errors | | "Could not check parsing credits. Please try again."; "Could not confirm Advanced parsing credits. Please try again." | |

#### 5.4 Tab: Resume

| Element | Text |
|---|---|
| Header | "Current resume"; "Source: …"; "Updated" / "Uploaded" + date; "One resume per candidate" |
| "Resume actions" menu | "Open original in a new tab", "Download resume", "Replace resume" / "Upload resume", "Reading view" / "Exit reading view" ("Resume reading mode: …", "Exit reading mode") |
| Upload / replace dialog | Titles "Add a resume" / "Replace resume" / "Upload resume"; drop zone "Drop your resume here"; "Choose a PDF, DOC, DOCX or RTF file."; "Ready to upload"; "Choose a different file"; progress "Updating resume" |
| Validation | "Choose a file smaller than 2 MB."; "This file is empty. Choose another resume."; "Select a valid resume and candidate." |
| Errors | "Resume replacement failed. Please try again."; "Processing is taking longer than expected. Retry to check this replacement again." |
| Preview errors | "Resume preview is unavailable" + "Retry preview"; "You do not have access to this resume." |
| Links | "View Resume", "View File" |

#### 5.5 Tab: Timeline

**Purpose:** Chronological activity for the candidate. Date format "MMMM D, YYYY h:mm A".

| Event text | Detail |
|---|---|
| "Resume uploaded" | |
| "Contact added" | |
| "Stage changed to …" | With "Updated by …", "Reason", "Remark" / "Status Update Remark" |
| "Resume shared with …" | |
| "Note added" | "Read more" |
| "Feedback rating added" / "Feedback added" | "Rating …" |
| "Document added" | "Document : …" |
| Email events | Delivery indicators: "Email is not delivered yet.", "Recipient is yet to open an email.", "Link has not been clicked yet or email doesn't contain a link." |
| Calendar events | "Scheduled an event", "Starts …" |

Empty: "No activity yet. Candidate updates will appear here." Actor fallback: "Unknown user".

Shared activity-timeline component (used on record timelines): "Activity timeline"; "Filter activity" with types "All activity", "Details", "Contacts", "Documents", "Events", "Other activity"; "Sort activity": "Newest first", "Oldest first"; button "Add note"; empty "No activity yet" + "Notes and updates will appear here as you work with this record."; filtered empty "No matching activity" + "Choose another activity type to see more updates." + "Show all activity".

#### 5.6 Tab: Calls & SMS

**Purpose:** "Review call history and messages for this candidate." (Twilio integration.)

| Element | Text |
|---|---|
| List | "Call Duration: …"; "Call not completed"; "Loading..." |
| Empty | "No calls or SMS found"; without phone: "Add a phone number to see calls and messages." |
| Call widget status | "Preparing your device..."; "Requesting access to the call service..."; "Access granted. Preparing your device..."; "Your device is ready to make and receive calls."; "Device is already initialized and ready to use."; "Your device is not ready yet."; "Calling …"; "Call in progress ..."; "Incoming call from …"; "The call has ended."; "The call was cancelled."; "The call was rejected." |
| Call errors | "There was an issue with the call service. Please try again."; "There was an issue setting up your device. Please try again."; "Unable to access the call service. Please try again."; "There was an issue making the call. Please try again."; "Detailed error:" |
| Call button | "Hang Up" |
| SMS dialog | Title "Send SMS to …"; textarea "Enter your message here" |
| SMS validation | "Please enter a valid phone number." / "Invalid phone number"; "Please enter a message."; "Message exceeds the maximum length of …" |
| SMS result | "Sending message..."; "Message sent successfully."; "There was an issue sending the message. Please try again." |

#### 5.7 Tab: Screening Answers

**Purpose:** "Review responses and update candidate information." / "Candidate responses for this application."

| Element | Text |
|---|---|
| Heading | "Screening form"; per item "Screening question" |
| Meta | "Submitted by candidate"; "Last updated by …" |
| Unanswered | "Not answered" |
| Buttons | "Edit answers", "Add answers" |
| Empty (no answers) | "No screening answers yet" + "Add responses to the screening questions configured for this job." |
| Empty (no questions) | "No screening questions" + "This job does not have any screening questions configured." |

**Edit dialog** ("Edit screening answers" / "Add screening answers"; subtitle "Review each response before saving it to this application.")

| Control | Text |
|---|---|
| Toggle | "Show all job questions": "Include active questions that do not have an answer yet." |
| Answer controls by question type | Text ("Input your answer"), select ("Select Option"), date ("DD/MM/YYYY"), duration ("Months"), salary ("Currency" + amount; currency picker lists countries), file ("Choose file") |
| Validation | "This field is required"; "Enter a valid email address" |
| Save | "Save answers" → "Screening answers updated"; error "Unable to update screening answers. Please try again." |

Countries present in the currency/country picker strings (list in the bundle is partial): Afghanistan, Albania, Algeria, Andorra, Angola, Anguilla, Argentina, Australia, Bahrain, Bangladesh, Barbados, Belarus, Belize, Bermuda, Bhutan, Botswana, Brazil, Bulgaria, Burundi, Cambodia, Cameroon, Canada, Cape Verde, Cayman Islands, Colombia, Comoros, Cook Islands, Costa Rica, Croatia, Czech Republic, Denmark, Djibouti, Dominican Republic, Ecuador, Eritrea, Ethiopia, French Polynesia, Georgia, Gibraltar, Guatemala, Guernsey, Guinea, Guyana, Honduras, Hong Kong, Hungary, Iceland, Indonesia, Israel, Jamaica, Jordan, Kuwait, Kyrgyzstan, Lebanon, Lesotho, Liberia, Liechtenstein, Madagascar, Malawi, Malaysia, Maldives, Mauritania, Mauritius, Mexico, Moldova, Mongolia, Morocco, Mozambique, Myanmar, Namibia, Nicaragua, Nigeria, Norway, Pakistan, Panama, Papua New Guinea, Paraguay, Philippines, Poland, Romania, Rwanda, Saudi Arabia, Serbia, Seychelles, Sierra Leone, Singapore, Solomon Islands, Somalia, South Africa, Sri Lanka, Suriname, Swaziland, Sweden, Taiwan, Tajikistan, Thailand, Trinidad and Tobago, Tunisia, Turkmenistan, Uganda, Ukraine, United Arab Emirates, Uruguay, Vanuatu, Vietnam, Zambia.

#### 5.8 Tab: Emails

**Purpose:** "Review email conversations with this candidate across connected inboxes."

| Element | Text |
|---|---|
| Inbox chooser | "Choose email inbox": "CVViZ inbox", "Connected Gmail inbox", "Connected Outlook inbox" |
| Search | "Search email messages", placeholder "Search subject or message"; "Refresh messages" |
| Message meta | "Sent to", "Received from", "Details" / "Message details", "Forward", "More email actions", "Load more messages" |
| Delivery status | "Queued" ("Accepted by CVViZ and waiting to be processed."), "Sending", "Still processing" ("This is taking longer than usual. The message has not been marked as failed." + "Refresh"), "Delivered" ("Delivered to …", "Message has been delivered to …"), "Opened" ("Opened on …", "Recipient viewed this email on …"), "Link Clicked" |
| Negative status tooltips | "Email is not delivered yet."; "Recipient is yet to open an email."; "Link has not been clicked yet or email doesn't contain a link." |
| Empty | "No conversations yet" + "Start a conversation with this candidate. Emails from this inbox will appear here." + "Send email"; "No emails found for …" |
| No address | "No email address added" + "Add an email address to the profile to send and view emails." |
| Errors | "The connected mailbox could not be loaded."; "Mailbox unavailable. Reconnect the account in Settings and try again." + "Try again"; "Failed to load email settings:" |
| Loading | "Loading email messages", "Loading inbox" |

#### 5.9 Tab: Documents

**Purpose:** "Supporting files shared with the hiring team."

| Element | Text |
|---|---|
| Row | File name, description, uploader ("Unknown user"), date; actions "Preview" ("Preview …"), "Download" ("Download …"), "Delete" ("Delete …"); "View File" |
| Delete confirm | "Delete this document?" + "This removes the document from this candidate." + "Delete" / "Cancel" |
| Empty | "No documents yet" + "Add a supporting file to keep it with this profile." + "Add document" |

**Upload document dialog**

| Label | Control | Hint / validation |
|---|---|---|
| File | Drop zone "Choose a document or image" / "Drag and drop a file here, or browse to select one." / "Browse files"; "Change file", "Remove" | "Select a file to continue"; "Select a document to upload."; "Choose a supported document or image."; "Choose a document or image."; "File size should be less than 10MB." |
| "Description" / "Document description (optional)" | Textarea | Placeholder "What should the hiring team know about this file?" |
| Submit | "Upload document" | Success "Document added."; errors "Document upload failed. Your file and description are ready to retry.", "The file API did not return an uploaded filename." |

#### 5.10 Tab: Interview Feedback

**Purpose:** "Assessments from the hiring team. You can update your own feedback."

| Element | Text |
|---|---|
| Summary | "Team rating"; "Your feedback is included" |
| Per-review card | "Reviewer", "Submitted …", "Rating …", sections "Overall assessment", "Technical skills", "Soft skills", "Remarks" ("No remarks provided"), per-criterion rating ("Not rated") |
| Rating words seen | "Very good" / "Very Good", "Exceptional" (other scale words are not in the bundle) |
| Buttons | "Add feedback", "Add the first feedback", "Edit your feedback" / "Edit feedback" |
| Empty | "No interview feedback has been submitted yet." |
| Errors | "Could not load interview feedback." |

**Add feedback form** (panel "Add interview feedback")

| Label | Control | Validation / hint |
|---|---|---|
| "Technical" → "Skill Name" + rating + feedback | Repeating rows; "Add Technical Criteria" | "Input your feedback" |
| "Soft Skills" → "Skill Name" + rating + feedback | Repeating rows; "Add Soft Skill Criteria" | |
| "Overall" → "Rating" | Star rating | "Rating is required"; "Select a rating" |
| "Feedback" / "Remarks" | Textarea | "Feedback is required"; "Feedback response is too long." |
| Submit | "Submit Feedback" | "Feedback added!" |

**Edit own feedback** ("Edit your interview feedback"): "Update your assessment. Your changes replace your previous answers."; "Save changes"; success "Your feedback was updated." or "Feedback was saved. Reopen the profile to refresh the rating."

List-side popover: "Feedback for …", "Feedback added by …", "Feedback not added yet!", "Add Feedback".

#### 5.11 Tab: Cover Letter

Shows the candidate's "Cover letter" text. No other strings found.

#### 5.12 Tab: Events

| Element | Text |
|---|---|
| Header | "Events for …"; "Active calendar: …" ("Google Calendar", "Outlook Calendar"; providers "Google Workspace or Gmail", "Microsoft 365 or Outlook.com"); "Refresh events"; "Add event" |
| Event card | "Calendar event", "Provider", start time ("Time not available", "Not set"), "Open meeting link", "Edit event", "Delete event" |
| Sections | Upcoming (inferred), "Past Events" |
| Delete confirm | "Delete this event?" + "Delete" / "Cancel" |
| Empty | "No calendar events yet" + "Create the first event for …" / "Create calendar events for …" |
| No email | "Add an email address to show events" + "Calendar events are matched by attendee email. Add a valid email address to …" |
| No calendar | "Connect a calendar first"; "Connect a calendar to add events"; "Calendar events are not enabled" |
| Errors | "Calendar events are unavailable" + "The provider-backed calendar API is not responding right now."; "Checking calendar connection..." |

#### 5.13 Tab: Job Offers

**Purpose:** "Track offer letters, delivery, and candidate responses." Title "Job offers".

| Element | Text |
|---|---|
| Offer card | "You have a job offer from …" (subject), "Offer sent by …", "View offer letter …" |
| Status values | "Delivery queued", "Delivery failed" ("The offer email could not be delivered."), "Offer Sent", "Offer Accepted", "Offer rejected" |
| Button | "Send offer" |
| Empty | "No job offers yet" |
| Permission | "You don't have permission to send job offers. Ask your administrator to enable 'View & Send Job Offers' for your role." |

#### 5.14 Tab: Data Privacy

**Purpose:** "Manage consent and candidate data requests."

**Block "Candidate consent"**

| Label | Control | Options | Hint |
|---|---|---|---|
| "Data consent required" | Toggle / select | Required, "Not required" | "Manage the consent requirement for this candidate." |
| "Consent status" | Select | "Pending", "Waiting", "Not responded", "Obtained" | "Update the recorded status when consent changes." |
| Awaiting panel | Info + button | "Send consent email" | "Awaiting candidate consent" + "Send a consent request by email or copy the link to share it." |

Errors: "Could not update candidate consent."; "Could not update candidate consent status."

**Block "Candidate data requests" / "Data requests"**

| Element | Text |
|---|---|
| Request types | "Access data", "Export Data", "Update Data", "Delete Data", "Stop Processing Data", "Information" |
| Row | "Date: …" (format "DD MMM YYYY, hh:mm A"; "Date unavailable"), "Data request status" with "Click to change status" (value seen: "Closed"), "Email Candidate", "Update" |
| Empty | "No data requests yet. Candidate requests will appear here." / "No requests found!" |
| Error | "Could not update the data request." |

#### 5.15 Edit candidate (panel)

Title "Update candidate information"; subtitle "Keep contact, location, work, and profile details accurate."; footer note "Changes apply to this candidate profile."; button "Update Information"; success "Candidate information updated!".

| Group | Label | Control | Hint / validation |
|---|---|---|---|
| "Personal Info" | "First Name" | Text | |
| | "Last Name" | Text | |
| | "Email ID" | Email | |
| | "Phone Number" | Phone | |
| | "Experience (Years)" / "Experience" | Number | |
| | "Qualification" | Text | |
| "Current Address" | "Street Address" | Text | |
| | "Country" | Select | |
| | State / city (labels not present as separate strings) | | |
| | "Zip Code" | Text | |
| "Visa Details" | "Visa Type" | Select / text | |
| | "Expiry Date" | Date | "YYYY-MM-DD" |
| "Social Media Links" | "Linkedin", "Github", "Twitter", "Facebook", "Instagram", "Stackoverflow", "Behance", "Medium" | URL inputs | |
| "Job Details" | "Notice Period" / "Notice Period (Months)" | Number | |
| | "Current Salary (PA)" | Number | Placeholder "Current Salary" |
| | "Expected Salary (PA)" | Number | Placeholder "Expected Salary" |
| | "Job Title" | Text | Placeholder "Current Job Title" |
| | "Company Name" | Text | Placeholder "Current Company Name" |
| | "Job Duration" | Text | Placeholder "Current Job Duration" |

---

### 6. Match & fit panel (evaluation result)

**Purpose:** Show the evaluation of one candidate against the job. Opened from "View match & fit", the Match & Fit column, or "View full evaluation". Titles "Match & fit for …", "Full evaluation", "Open full evaluation for …", "Close match and fit".

| Section | Content | Empty text |
|---|---|---|
| "Overview" | "Overall grade …", recommendation ("Not recommended" seen), summary with "Read summary" / "Show less" | "No evaluation summary available."; "Not scored"; "Not available" |
| "Strengths" | List | "No strengths recorded." |
| "Gaps to review" | List | "No gaps recorded." |
| Skills | "Required skills found", "Required skills not found in the profile", "Required skills awaiting evidence", "Preferred skills found", "Additional gaps reported" ("These gaps were reported separately and are not included in the assessed skill count above."); note "Based on evidence in the profile. Skills not found may still need to be confirmed with the candidate." | "Required skill coverage unavailable"; "Skill evidence unavailable"; "Not Found" |
| Experience | "Relevant experience", "Role alignment" | |
| Education | "Qualification match", "Education level" | |
| "Evaluation details" | "How the overall grade is determined", "Score breakdown", "Evaluation criteria", "Evaluated …" / "Evaluation date unavailable", "Template: …" | |
| Not evaluated | "Not evaluated yet. Use Evaluate to score this candidate against the job." / "This candidate has not been evaluated for this job yet." + "Evaluate candidate" | |
| Basic-only result | "Detailed assessment not generated" + "This basic evaluation includes an overall grade and skills match. Detailed experience, education and supporting evidence are not available in this result." | |

**List-side evaluation teaser cards**

| Card | Text |
|---|---|
| "Advanced screening preview" / "Unlock advanced screening" | Preview fields: "Overall fit" ("Fit score + grade"), "Recommendation", "Matched skills", "Missing gaps", "Relevant years", "Degree check", "Qualification fit"; "Run screening to see scored fit, gaps, risks, and template context." or "Buy credits or upgrade to unlock scored fit, gaps, risks, and template context." |
| "Not evaluated yet" | "Run advanced screening to fill this area with fit score, gaps, risks, and template context." or "Buy credits or upgrade to run advanced screening and fill this area with fit details." |
| "Basic screening result" | "Review the current match, then add evidence-based insight with Advanced evaluation." or "Review the current match. Advanced evaluation is available with credits."; "After evaluation"; "Get deeper evidence with Advanced"; "Detailed screening breakdown"; "Upgrade Basic screening to Advanced"; "Buy credits or upgrade" |
| Done | "Advanced screening completed" |

---

### 7. Discover candidates (match existing database to a job)

**Route:** `/discover/:jobid/candidates`; dialog also launched from Add candidates.
**Purpose:** Find people already in the database and add them to the current job.

**Dialog "Discover Candidates"** (subtitle "Find candidates from your existing database, review a bounded page, and keep selections while browsing more results.")

| Label | Control | Options / placeholder | Validation |
|---|---|---|---|
| Discover type | Radio / select | "Date Added" ("Discover by the date the candidate was added" / "Discover by date added"); Tags ("Discover by tags applied to candidates" / "Discover by tags"); Job ("Discover from candidates of another job" / "Discover by jobs") | "Discover type is required" |
| "Date added" | Date range | "Choose a date range"; "Start date", "End date"; "YYYY-MM-DD"; "Select date added" | "Required" |
| Tags | Tag select | "Select or type tags" / "Enter Tags" | "Choose at least one tag" |
| "Source job" | Job select | "Select a job" / "Enter Job titles" | "Choose a source job" |

Steps: filters → "Review Candidates" → "Back to filters" → "Discover …" (count). Review table columns: "Candidate" ("Unnamed candidate"), email ("Email unavailable"), "Source" ("Unknown").

| Message | Text |
|---|---|
| Validation | "Select a job before discovering candidates."; "Select at least one candidate to discover."; "Select no more than …" |
| Empty | "No candidates found for the selected filters."; "No candidates found in your database for selected filter" |
| Errors | "Could not load candidates. Please try again."; "Could not add the selected candidates to the job."; "No new candidates were added to this job." |

**Discover results page**

| Element | Text |
|---|---|
| Progress | "Discovering Candidates..."; "Discovering candidates from existing database for …"; "Discovered …"; "CVViZ have found 1 candidate for this job from your database." |
| Columns | "File Name" ("Click to view …"), date ("DD MMM"), "Grade : …", "Skill Match :…" |
| Actions | "Add To Job", "Add Resume To Job", "Add discovered candidates to …"; pager "Previous Resume …" / "Next Resume …" |
| Validation | "Please select resumes" |
| Success | "Candidate Added to job!" / "Candidates Added to job!" |
| Empty | "Sorry, No candidates discovered!" + "Upload more candidates to your account and explore discover candidates option." |

---

### 8. Update candidate stage dialog

**Purpose:** Move one or many candidates to another pipeline stage, with reason, note and history. Titles "Update candidate stage", "Update Status", "Change stage: …", "Update …".

**Tabs:** update form and "History" ("Back to update").

| Label | Control | Options | Validation / hint |
|---|---|---|---|
| "Current stage" | Read-only | | |
| "New stage" | Select | Stage list below; placeholder "Choose a stage" | "Choose a stage." |
| "Reason" | Select | Reasons configured per stage; placeholder "Choose a reason" (reason values are not in the bundle) | "Choose a reason for this change." |
| "Final salary offered" + "Currency" | Number + currency select | Shown for offer / joining stages (inferred) | |
| "Stage change note" / "Remark" / "Status Update Remark" | Textarea | | |
| Submit | "Update stage" | | Success "Progress updated"; error "Stage wasn't updated. Please try again." + "Your stage selection and note are still saved in this dialog." |

**History tab:** "Stage change history", "Newest first", rows "Status changed to" + "Stage …" ("Unknown stage") + actor ("System" when automatic, "Updated by …") + "D MMM YYYY, HH:mm" + "Reason:"; empty "No stage changes recorded for this job yet."; "Loading stage history"; "Couldn't load stage history".

**Stage names in the bundle (order as found; two-level grouping is supplied by the workflow API `/api/workflow-templates` and `/workflow`):** "New Candidate", "No Response - Phone", "Phone Screened", "Internal Review", "Shared", "Internal Shortlisted", "Resume Shortlisted", "Assessment", "Interviewed", "Submitted to Client", "Submitted to Partner", "Submitted to AM", "Assessment/Trial Invited", "Assessment/Trial Accepted", "Assessment/Trial Scheduled", "Assessment/Trial Passed", "Intermediary Interview stage", "Final Interview Invited", "Final Interview Accepted", "Final Interview Scheduled", "Final Interview Passed", "Job Offered", "Offer Rejected", "Offer Accepted", "Background Screening", "Not Joined", "Internal Hold", "Joined", "Rejected", "Interview Reject", "Job Offer Reject", "Phone Screen Reject", "Not Shortlisted", "Candidate No Show For Interview", "Interview Declined By Candidate", "Internal Screening Reject", "Assessment/Trial Failed", "Rejected by AM", "Rejected by Client", "Rejected by Partner", "Final Interview Failed", "Not Interested".

**Job-card stage summary buckets (job list widget "Candidate Status", "Filter by: …"):** "Total Candidates", "Phone Screened", "Shared", "Shortlisted", "Interviewed", "Job Offered", "Not Joined", "Joined", "Rejected", "Not Interested"; empty "No status data yet".

---

### 9. Evaluate candidates dialog (AI screening)

**Purpose:** Score selected candidates against the job, either with the free basic match or the credit-based advanced assessment. Title "Evaluate candidates for …"; single-candidate variant "Evaluate candidate" + "Choose how CVViZ should evaluate this candidate for the job."

**Step 1: "Choose an evaluation type"** ("Select how CVViZ should evaluate …")

| Option | Tagline | Description | Badge | Button |
|---|---|---|---|---|
| "Basic evaluation" / "Basic screening" | "Quick job match" | "Quickly compare candidates with the job requirements." / "Quickly compare this candidate with the job requirements." | "No credits required" | "Run basic evaluation …" |
| "Advanced evaluation" | "Detailed assessment" | "Assess skills, experience and education with supporting evidence against this job." | "Recommended"; when blocked "Advanced screening unavailable" | "Continue with Advanced …" |

**Step 2: "Choose an evaluation setup"** ("Select how CVViZ should evaluate the …"; "Evaluation setup"; "Change screening type")

| Option | Description |
|---|---|
| "Recommended setup" ("Recommended") | Default template (inferred) |
| "Use a template" | "Reuse a system template or one previously saved by your team." |
| "Customize evaluation" | "Fine-tune weightages, benchmark usage, and instructions." |

**Template picker** ("Choose a template")

| Element | Text |
|---|---|
| Search | "Search evaluation templates", placeholder "Search templates..." |
| Type filter ("Evaluation template type") | "All templates", "System templates", "My templates" |
| Card badges | "System template" / "System", "Team template", "Public template", "Private template", "Benchmark" / "Includes benchmark weighting", "Created by …", "Created: …", "Updated: …" |
| Preview pane | "Preview a template" + "Select a template to review its criteria, weightages, and evaluation guidance."; sections "Evaluation focus", "How it evaluates", "Weightage Values:", "View details", "Show all …" |
| System templates | "Standard Evaluation": "Evaluate candidates based on their overall fit for the role, considering technical skills, experience, and cultural alignment." / "Technical Focus": "Prioritize technical skills assessment, focusing on hands-on experience, coding abilities, and technical problem-solving capabilities." / "Leadership Potential": "Evaluate candidates with emphasis on leadership qualities, team management experience, and strategic thinking abilities." / "Innovation Focus": "Look for candidates demonstrating creative problem-solving, innovative thinking, and experience with cutting-edge technologies." |
| States | "No templates found"; "Failed to load templates" / "Failed to load templates. Please try again." |

**Customize: "Evaluation weightages"** (hint "Use whole percentages" / "Use whole percentages between 0 and 100, totaling 100%."; validation "Total weightages must sum up to 100%."; "Validation failed:")

| Group | Criterion | Helper text |
|---|---|---|
| "Skills" | "Required skills" | "Mandatory skills in the resume" |
| | "Preferred skills" | "Optional skills that strengthen the fit" |
| "Experience" | "Professional experience" | "Relevant work experience" |
| | "Domain expertise" | "Industry and domain alignment" |
| | "Job stability" | "Consistency of employment history" |
| "Education & certifications" | "Education" | "Qualification fit for the role" |
| | "Certifications" | "Relevant professional certifications" |
| "Additional criteria" | "Notable achievements" | "Relevant achievements and outcomes" |
| | "Benchmark alignment" | "Similarity to the benchmark profile" |

| Label | Control | Hint |
|---|---|---|
| "Custom Instructions" | Textarea | "Add specific instructions for the evaluation process"; "These instructions will be used along with the weightages to evaluate candidates. Be specific about any particular aspects you want to focus on."; placeholder "Example: Focus on evaluating problem-solving abilities and system design experience. Consider any open source contributions..." |
| "Save this as Template" | Checkbox | |
| "Template Name" | Text | Placeholder "Enter a name for your template"; "Please enter a template name" |
| "Template Description" | Textarea | Placeholder "Describe what this template is best used for"; "Please enter a template description" |
| "Make this template public" | Checkbox | "Making the template public will allow other users to access it." |

Buttons: "Save and evaluate …", "Start evaluation …", "Start Evaluation", "Start evaluation for …", "Cancel". Toast "Template saved successfully".

**Selected candidates review:** "Selected candidates" + "Review the list and remove anyone you want to exclude."; "Remove …"; "Show fewer candidates"; "View all …"; empty "No candidates selected" + "Add at least one candidate to start an evaluation."; validation "Please select candidates to evaluate."

**Progress and results**

| State | Text |
|---|---|
| Starting | "Wait for evaluation to start"; "Please wait while the evaluation is prepared."; "Evaluation queued" |
| Running | "Evaluating candidates"; "Matching candidate profiles"; "Matching"; "Evaluating candidate fit"; "Finalizing results"; "In progress"; "Retrying"; "Profile matching retrying"; "Reconnecting to evaluation"; "About …" (time estimate); "Updated …" |
| Background | "Evaluation continues in the background. You may close this window."; "Minimize and continue in the background"; "Minimize evaluation window"; "Close evaluation window"; "Restore evaluation window"; "View Progress"; "Evaluation progress tracker"; "Dismiss evaluation tracker" |
| Done | "Evaluation complete" / "AI evaluation complete"; "Results are ready to review in the candidate list."; "Evaluated"; "Completed"; "View candidates"; list banner "Evaluation complete. Showing the candidates evaluated in this run." |
| Failed | "Evaluation could not be started"; "The evaluation did not complete."; "Evaluation needs attention"; "Try Again"; "Candidate Evaluation Failed"; "Candidate evaluation could not be completed." |
| Missing prerequisites | "Job skills are required" + "Edit job skills" |

**Plan / credit gates**

| Situation | Text | Buttons |
|---|---|---|
| Limit reached | "Screening limit reached" / "Screening limit reached."; "Your account has used or reserved …"; "Your account has reached its candidate evaluation limit. Add credits or upgrade your plan to evaluate more candidates." | "View billing" |
| Credits ran out | "Advanced screening credits ran out"; "Another screening used the last available credit before this request started."; "Basic screening is already running. Add credits to upgrade candidates to Advanced afterward."; "Add credits to run Advanced screening, including Basic ranking and AI evaluation."; "Basic screening will continue in the background while you add credits."; table "Required" / "Available" / "To add" | "Buy Advanced credits", "Continue with Basic instead", "Not now" |

**Benchmark data (related dialog "Add benchmark data")**

| Element | Text |
|---|---|
| Heading | "Improve ranking with examples of strong candidates"; "Choose your best-fit candidates"; "Select one or more examples. Their resumes will help CVViZ rank similar candidates higher for this role." |
| List | "Eligible candidates"; "Clear selection"; "Review selection"; "Add selected" |
| Option | "Replace existing benchmark data": "Clear the current benchmark set before adding this selection." |
| Progress | "Adding benchmark data"; "The selected resume is being processed. This usually completes in a few seconds."; "Your selected resumes are queued for benchmark processing. You can safely continue working while this runs."; "Processing is underway."; "Waiting for an available processing worker."; "Continue in background"; "Processing..."; "Benchmark processing is still running. Refresh this section to check its status." |
| Results | "Benchmark Data Added" + "Selected resumes added to benchmark data for this job!"; "Benchmark Data Not Added" + "Selected resumes not considered for benchmark data!"; "Benchmark Processing Failed"; "Benchmark data could not be processed."; "Summary of uploaded files for benchmark data:" |
| Validation | "Please select candidates" |

---

### 10. Notes drawer

**Purpose:** Add, reply to and manage notes and tasks on a candidate. Title "Notes for …"; profile panel caption "Keep context and updates for the hiring team."

| Label | Control | Options | Validation / hint |
|---|---|---|---|
| Note body | Rich text editor ("Rich text editor", placeholder "Type here..." / "Add a note here.") | Toolbar: "Text formatting", bold (inferred), "Italic", "Underline", "Strikethrough", "Block quote", "Insert link", "Clear formatting", "Numbered list", "Bulleted list", "Decrease indent", "Increase indent" | "Note can not be empty!" |
| "Note type" | Select | "Job note" (other values not in bundle) | |
| "Team visibility" | Toggle | "Make visible to the team" / "Mark as private"; badge "Private" | |
| "Due date" | Date-time ("Add due date" / "Change due date"; format "MMM D, h:mm A") | | "Due date must be in the future" |
| "Assign to user" | User select; shortcut "Assign to myself" | | "Unable to assign this task. Please refresh and try again." |
| Submit | "Add Note" | | "Note Added!" / "Note added!"; "Success!" |

**Note card:** badges "Private note", "Private task", "Edited", "Task created by …", "Task assigned to me" / "Assigned to Me", "Task assigned to …", "Task completed"; actions "Edit note" ("Update" → "Note updated!"), "Delete note" (confirm "Delete this note?" + "Delete" → "Note Deleted!"), "Add Reply" ("Reply added!", "Reply updated!").

**Empty:** "No notes yet" + "Add the first note to share context and updates with the hiring team."; "Activity" / "No activity yet".

**API paths seen:** `/notes`.

---

### 11. AI writing assistant (inside the email composer)

| Element | Text |
|---|---|
| Title | "AI Assistant" / "AI writing assistant"; "Generate email content using AI"; "Choose an action below to generate or improve email content with AI." |
| "Action" options | "Generate email from description"; "Improve" ("Enhance clarity and professionalism"); "Shorten" ("Make more concise"); "Expand" ("Add more detail"); "Rephrase" ("Rewrite differently"); "Change Tone" ("Adjust message tone") |
| "Description" | Textarea, placeholder "E.g., Write an interview invitation for Tuesday at 2pm" |
| Tone options | "Professional", "Friendly", "Formal" |
| Buttons | "Generate" ("Generating..." / "Generating with AI..."), "Regenerate", "Insert", "Copy to clipboard" ("Copied!"), "Cancel" |
| Output | "Generated Content" |
| Validation | "Please enter a description for your email"; "Please write some content first before using this action" |
| Results | "Content generated successfully!"; "Content inserted into email"; "Content copied to clipboard"; "Failed to generate content. Please try again."; "Feature Unavailable" |

---

### 12. Email composer and its variants

**Purpose:** One composer used for single and bulk candidate email, sharing resumes, screening forms, scheduling links, offer letters and sharing a job with vendors.

**Dialog titles (variants):** "Send Email" / "Send Emails", "Share selected resumes", "Send Screening Form", "Send Scheduling Link", "Send An Offer Letter", "Share job with vendors".

**Send channel (split button):** "Send via CVViZ" ("Send email using CVViZ", sender "CVViZ Email Service"), "Send via Gmail" ("Send email using Gmail"), "Send via Outlook" ("Send email using Outlook"); busy "Sending...".

| Label | Control | Variant | Placeholder / hint | Validation |
|---|---|---|---|---|
| "Recipients" | Tag input with search | All | "Type to search or enter email address" / "Add recipients..."; bulk note "Each candidate will receive a separate, individual email. They will not see other recipients." | "Recipients required"; "Recipients limit exceeded" + "You have exceeded the combined limit for recipients, cc and bcc. Please keep the recipients count below …" |
| "Vendors" | Multi-select | Share job / submit | "Select Vendors"; "Search by company name" | |
| "Cc recipients" | Tag input | All | "Add Cc..." | |
| "Bcc recipients" | Tag input | All | "Add Bcc..." | |
| "Template" | Template picker ("Choose Email Template", "Choose an email template", "Selected email template", "Template: …") | All | Search "Search templates..."; preview "Subject: …"; "Apply Template" | "No templates available"; "No templates match your search"; "Email template not found for key: …" |
| "Subject" | Text ("Email subject") | All | "Enter subject..." | "Subject is required" |
| "Email body" | Rich text | All | "Write email body here..."; "AI writing assistant"; "Insert Link Placeholder" | "Warning:" (missing placeholder), "Email id …" |
| "Screening Form" | Select | Screening form | "Select a screening form..."; option "Job-specific screening questions"; link "Manage Form Templates" | "Please select a screening form"; "Unable to load the screening form questions." |
| Form preview | Read-only list | Screening form | Groups "Job-specific Questions", "Screening Form Questions"; question types "Short Text", "Long Text", "Dropdown", "Checkbox", "Single Choice", "File Attachment", "Number"; "Required"; "No screening questions defined for this job."; "No questions in this form."; "Try again" | |
| "Scheduling Link" | Select | Scheduling link | "Select scheduling link..."; "Untitled Link" | "No scheduling links found. Please …"; "No Scheduling Links Configured" + "You have not created any scheduling links. Please …" / "Create a scheduling link in your settings first."; gate "You can preview the email composer and template, but sending bulk scheduling links is disabled." |
| "Attach Resumes" | Checkbox | Share resumes | | "Select include Link/Attach resume" |
| "Include Resumes Link" | Checkbox | Share resumes | | |
| "Include Notes" | Checkbox | Share resumes | | |
| "Offer letter" | File upload | Offer | "Click to upload or drag a file here"; "Attach files (.doc, .docx, .pdf, .rtf)"; "Attachment" | "Job offer letter is required"; "Job offer attachments must be 7 MB or smaller."; "Upload failed:" |
| Consent notice | Info | When GDPR consent applies | "Consent required for data processing" | |

**Result messages:** "Email queued for delivery."; "Email sent."; "Resume email accepted for delivery."; "The resume email could not be sent. Please try again."; "Job accepted for vendor delivery."; "The job could not be shared. Please try again."; "Job offer accepted for delivery."; "The job offer could not be queued. Please try again."; "Unable to send email. Please try again."; "The secure candidate link could not be created. Please try again."; "A candidate and Career Page are required to create the public link."; "A valid job is required to create the public link."; "We could not create the email draft."

**Discard confirm:** "Discard unsaved draft?" + "You have modified this email draft. Closing will discard your changes." + "Discard" / "Cancel".

**Permission gate:** "You don't have permission to send job offers. Ask your administrator to enable 'View & Send Job Offers' for your role."

**API paths seen:** `/calendar/links`, `/api/career-page/application-links`, `/api/email-preferences`.

**Email template editor (related)**: titles "New email template" / "Edit email template" / "View email template".

| Label | Control | Options | Validation |
|---|---|---|---|
| "Template name" | Text | | "Template name required" |
| "Template type" | Select ("Select a template type") | "Candidate Availability Request", "Candidate Email", "Candidate Interview Confirmation", "Candidate Rejection", "Extending Offer", "Interviewer Invite", "Job Post Request", "Scorecard Due", "Team Email", "Github Personalized" | "Template type is required" |
| "Subject" | Text ("Enter the email subject") | | "Enter a subject" |
| "Message" / "Template body" | Rich text ("Write the email message") | | "Please provide the Email body" |
| "Share this template with other users" | Checkbox | | Hint "When you share this template with other users, they can also use it while sending emails. Other users won't be able to edit or delete this template." |
| Placeholders ("Click to copy …") | Chips | "CANDIDATE FIRST NAME", "CANDIDATE LAST NAME", "EMAIL SIGNATURE", "JOB PROFILE", "COMPANY NAME", "JOB LOCATION", "JOB LINK", "EXPERIENCE REQUIRED", "POSITION SALARY RANGE", "LANGUAGE SKILLS", "GITHUB PROJECTS", "LATEST EVENT DETAILS", "SHARED CANDIDATES LIST", "GDPR CONSENT LINK", "MEETING SCHEDULING LINK", "SCREENING FORM LINK" | Hint "Use placeholders in the subject or body. They are replaced with the corresponding details when the email is sent." |

Buttons "Create template" / "Save changes" / "Cancel"; toasts "Template added", "Template updated".

---

### 13. Add candidates dialog (hub)

**Purpose:** Single entry point for every way of creating candidates. Title "Add candidates"; subtitles "Create candidate profiles from the information you already have." / "Build your talent pool or add candidates to an existing job."

**Step: "Where should these candidates go?"**

| Option | Description |
|---|---|
| "An existing job" | "Add candidates directly to a hiring pipeline." + "Choose an active job" (search "Search by title, code, or location"; "No active jobs found"; "Loading job...") |
| "Talent pool" | "Save candidates for future opportunities." |

Summary line: "Adding to" + destination + "Change" + "You can change this before importing." Validation "Select a valid job or the Candidate Database."

**Methods ("Add candidate methods")**

| Method | Section |
|---|---|
| "Upload resume" / "Upload resumes" | 13.1 |
| "Add contacts" | 13.2 |
| "Paste text" / "Paste resumes" | 13.3 |
| "Other methods": "From inbox" | 13.4 |
| "Other methods": "Discover candidates" | 7 |
| "Other methods": "AI Sourcing Agent" | 23 |

**Gate:** "Upgrade your account to add candidates" + "Upgrade Now".

**API paths seen:** `/api/candidate-database/candidate-imports/contacts`, `/candidate-imports/contacts`, `/candidates`, `/discover/-99/candidates`.

#### 13.1 Upload resumes

| Element | Text |
|---|---|
| Heading | "Upload resumes" + "Upload files and we'll extract candidate details and check for duplicates." |
| Drop zone | "Drag and drop resumes here"; "Browse files"; formats "PDF, DOC, DOCX, RTF" (older component: "PDF, DOC, DOCX"); "Under 2 MB per file"; "Add more resumes" |
| Tags | "Add tags to organize these candidates" |
| Review | "Selected resumes"; "Review before uploading"; "Remove …" |
| Limits | "You can upload a maximum of …"; "Files skipped: …"; "Duplicate file : …" |
| Buttons | "Upload …", "Upload more", "Cancel" |
| Per-file status | "Uploading", "Processing", "Completed", "Duplicate", "Failed"; "Review before continuing"; "Resume processing status" / "Resume parsing status" |
| Background tracker | "Continue parsing in the background"; "Minimize upload window" / "Minimize"; "Restore upload window"; "Processing …"; "Resume import complete"; "Resume import finished with issues"; "View details"; "Dismiss" |
| Results | "Resume parsing results"; "They're ready to review in your candidate list. Want to add another?"; "Add more candidates" |
| Duplicates | "Existing candidate found"; "The uploaded file was not used. Existing resume:"; "Resume on candidate profile"; buttons "Add existing to job", "Acknowledge duplicates"; "This existing contact was linked to the selected job."; "Could not link the existing candidates. Please try again." |
| Errors | "This resume could not be parsed."; "Upload failed"; "The parser did not accept every uploaded resume."; "Advanced parsing could not be started."; "The resume import status is incomplete."; "The resume import did not return an operation."; "The resume import did not accept every uploaded file."; "Parsing ended with status: …"; "Parsing timed out. Please try re-parsing these resumes."; "Unable to check import status (HTTP …"; "Unable to confirm parsing completion." |

Legacy single-resume form ("Upload for …", "Bulk Upload"): "Click or drag …"; "Format supported: .pdf,.doc,.docx"; "File size should be less than 2MB"; "Supported file formats are .pdf,.doc and .docx with file size less than 2MB."; fields "First Name" ("First name is required"), "Last Name" ("Last name is required"), "Email Address" ("Email ID is required", "Please enter correct email"), "Mobile Number" ("Mobile number is required"); "Please upload resume file"; "File upload failed!"; "Resume processing failed. Please try again."; duplicate notice "Below resumes already exist for this job."; "Submit" / "Cancel".

#### 13.2 Add contacts (manual or CSV)

Heading "Add contacts" + "Import a spreadsheet or add one person using the form below."

**CSV import ("Import from CSV")**

| Element | Text |
|---|---|
| Limits | "You can add up to 500 contacts at a time" / "Import up to 500 contacts at a time." |
| Options | "Consider 1…" first-row option with hint "Check this if first row in the CSV file is a contact data and not a header."; "Update existing contacts" |
| Mapping step | "Review column mapping" + "Check the preview and use the pencil on a header to change its destination field."; "Map CSV column …"; "Select a field"; "Map column"; "Required"; "Unmapped columns will be ignored."; "Map one CSV column to Email Address before importing." |
| Mappable fields | "First Name", "Last Name", "Email Address", "Phone Number", "Experience (In months)", "Cover Letter", "Top Skills", "Worked In Cities", "Current State", "Country" / "Current Country", "Zip Code", "Qualification", "Notice Period", "Current Salary", "Expected Salary", "Visa Status", "Github Link", "Instagram Link", "Twitter Link", "Behance Link", "Facebook Link", "Linkedin Link", "Stackoverflow Link" |
| Validation | "Choose a CSV file."; "Could not read this CSV file."; "The CSV contains an unmatched quote."; "Every CSV column must have a header."; "CSV column headers must be unique."; "The CSV does not contain any contact rows."; "Please include email column!"; "Please include first name column!"; "Every contact row must include an email address."; "The CSV contains duplicate email addresses. Remove them and try again." |
| Results | "Contacts added"; "Some contacts were not imported" + "Contact row …" + "This contact could not be imported."; "Contact import failed"; "Could not import these contacts. Please try again."; "The contact import is missing its operation key." |
| Button | "Import contacts" |

**Manual form ("Or enter a contact manually")**

| Label | Control | Validation |
|---|---|---|
| "First name" | Text | "First name is required" |
| "Last name" | Text | |
| Email | Email | "Email is required"; "Enter a valid email address" |
| "Phone number" | Phone | Placeholder "Contact number" |
| "Additional details …" (collapsible) | | |
| "Years of experience" | Number | |
| "Current company" | Text | |
| "Job title" | Text | |
| Social link type | Select ("Select type") | "Github", "Twitter", "Instagram", "Facebook", "Behance" (plus Linkedin / Stackoverflow from the field list) |
| "Social Media URL" | URL | "Missing social media URL" |
| Note | Textarea | Placeholder "Add a note here." |

Button "Add contact"; results "Contact added"; "This contact already exists in your candidate database."; "Could not add this contact. Please try again."

#### 13.3 Paste resume

| Element | Text |
|---|---|
| Titles | "Paste Resume" / "Paste a Resume" |
| Field | Textarea, placeholder "Paste your resume text here..."; validation "Please paste the resume text" |
| Button | "Parse resume" |
| Status | "Pasted resume"; "Pasted resume parsing status" |
| Errors | "Parsing failed."; "Could not parse the pasted resume."; "The pasted resume could not be parsed."; "Parsing timed out. Please try again." |

#### 13.4 Import from inbox

Heading "Import from inbox" + "Pull resume attachments straight from your …" + "Gmail or Office 365".

| Label | Control | Options / placeholder | Validation |
|---|---|---|---|
| Inbox type | Radio | "Gmail" ("Google Suite"), "Outlook" ("Office 365") | "Please choose Inbox type - …Gmail or Outlook" |
| "Folders" | Select | Mailbox folders | "Please select a folder" |
| "Sender" | Text | "Input sender's email address" | |
| "Subject" | Text | "Input subject title" | |

Not connected: "Connect Google Workspace on the server" / "Connect Microsoft 365 on the server". Info "Files will be imported from …".
Results table: "File Name", "Email Subject"; "Searching resumes..." / "Searching resumes …"; "Resumes …"; "No supported resume attachments found."
Buttons: "Import", "Import …" (count), "Import Resumes". Validation "Please select resume files to import." Results "Mailbox resumes accepted for processing."; "Unable to import mailbox resumes."
Stop confirm: "Stop importing resumes?" + "Stop the current resume import from this inbox?" + "Stop importing" / "Keep importing".

---

### 14. Add tags dialog

| Label | Control | Hint | Validation |
|---|---|---|---|
| Tags | Tag select with create | "Pick existing tags or type to create new" | "Tags required" |

Header shows "Candidates Selected" count ("No candidates selected"). Buttons "Add Tags" / "Cancel". Results "Tags added"; "Tags could not be added. Please try again."

---

### 15. Schedule interview dialog

**Purpose:** Book an interview directly on a calendar or send the candidate a booking link. Title "Schedule interview".

| Section | Label | Control | Options / hint | Validation |
|---|---|---|---|---|
| "Scheduling method" ("Pick a time now or share slots.") | Method | Radio cards | "Book directly" ("Pick a slot and send the invite."); "Booking link" ("Let the candidate choose.") | |
| "Participants" ("Interviewers and candidate details.") | "Panelists" | Multi-select with free email | "Internal interviewers/colleagues whose calendar availability we'll check. Pick from your team or type any work email."; placeholder "Start typing a name or email" | "Add at least one panelist"; "Enter a valid email for …" |
| | "Candidate email (optional)" | Email | "Used only when you email a booking link to the candidate." | "Enter a valid email address" |
| | "Candidate name (optional)" | Text | Placeholder "Jane Doe" | |
| "Booking link settings" ("Candidate-facing availability window.") | "Duration" | Select | | |
| | "Look in" | Select | "Next 3 days", "Next 5 days", "Next 7 days", "Next 14 days"; "We will find available slots in …" | |
| "Find a time" ("Selected slot and availability." / "Search availability in your timezone.") | Slot search | Button "Find available slots"; slot list ("Select …"); "Change time" | "Slots are shown in …" / "Times in …"; "Calendar timezone: …"; "Booking on …" ("Google Calendar" / "Outlook Calendar") | "Select a time slot before booking the interview." |
| "Event details" ("Invite title, conferencing, and context.") | "Event title" | Text | Placeholder "Interview with Jane Doe"; default "Interview with …" | "Add a title" |
| | Conferencing | Checkbox | "Add Google Meet" / "Add Microsoft Teams" | |
| | "Description (optional)" | Textarea | "Agenda or context for attendees" | |

**Buttons:** "Book selected slot" ("Create the calendar event and send invites to panelists."; disabled label "Select a slot"), "Email link to candidate" ("The booking link will be emailed to …"), "Get booking link" ("Create available slots in the background, then copy and share the link."), "Cancel".

| State | Text |
|---|---|
| Searching | "Checking availability..."; "Checking panelist availability..."; "Searching" |
| No search yet | "No slots searched yet" + "Add panelists, confirm the duration, then search availability." |
| No slots | "No matching slots found" + "Try a wider search window, shorter duration, or fewer panelists." |
| No calendar | "Connect a calendar to schedule" + "Link Google or Outlook, then mark one calendar as active." + "Open integrations"; "Connect and activate a calendar before finding slots."; "Connect and activate a calendar before creating a booking link." |
| Success (link emailed) | "Invite sent to candidate" + "We've emailed the booking link to the candidate. You can also copy it below to share another way." |
| Success (link only) | "Booking link ready" + "Share this URL with the candidate. They'll pick a slot and the event will be created automatically."; toast "Booking link copied to clipboard." |
| Plan gate | "You can review the setup, but creating invites and booking links is disabled." |

**API path seen:** `/settings/integrations`.

---

### 16. Add candidates to a job dialog (copy to another job)

| Element | Text |
|---|---|
| Title | "Add candidates to a job" |
| Intro | "Choose an in-progress destination job for the selected candidates. Existing applications will be skipped automatically." |
| Field "Destination job" | Job search select: "Select a destination job"; "Search jobs by title, code, or location"; "Loading jobs..."; "No matching in-progress jobs found"; job summary "Selected job", "Job ID: …", "Experience not set", "Location not specified" |
| List | "Selected candidates" / "Candidates Selected"; "No candidates selected" |
| Rule | "Candidates can only be added to in-progress jobs." |
| Results | "They are now available in …" + "View Job"; "No candidates were added"; "No changes were made. Close this window and try again." |
| Buttons | Add / "Cancel" |

**API path seen:** `/candidates`.

---

### 17. Export candidates and download resumes

**Export candidates** ("Export candidates"; "Candidate export"; "Candidate export status")

| Element | Text |
|---|---|
| Scope | "Export Selected", "Export All", "Export to Excel" |
| Field | Column picker; validation "Please select columns to export" |
| Output file | "Candidates.csv" |
| Results | "Candidate export is ready"; "The candidate export was not accepted."; "Candidate export failed:" / "Candidate export failed"; "Candidate export could not be created."; "Candidate export creation timed out." |
| Plan gate | "You are not allowed to export candidates. Please upgrade your plan to unlock this feature." |
| API | `/api/candidate-exports` |

**Download resumes as archive** ("Download Candidates"; "Resume archive"; "Resume archive status")

| Element | Text |
|---|---|
| Confirm | "Confirm Download"; "Files to Download (…"; "Download …" |
| Validation | "Please select candidates to download"; "No valid candidates to download"; "You can only download up to …" / "You can only download …" |
| Results | "Resume archive is ready"; "The archive operation was not accepted."; "Download failed:" / "Download failed"; "Resume archive could not be created."; "Resume archive creation timed out." |
| API | `/api/resume-archives` |

---

### 18. Candidate tags (inline on row and profile)

"Candidate tags", "New candidate tag", "You added this tag …", "More Tags", "Add tags". Bulk tagging uses section 14.

---

### 19. Add to email marketing audience dialog

**Purpose:** Push selected candidates' emails into a marketing audience. Title "Add to email marketing audience"; intro "Add selected candidates to an audience. No emails will be sent or credits used."

| Label | Control | Options / hint | Validation |
|---|---|---|---|
| "Destination" | Radio | "Existing audience", "New audience" | |
| "Audience" | Select ("Choose an audience") | "Load more audiences"; "No ready audiences. Create a new one or load more."; hint "Creates an updated audience version. Campaigns and automations keep the version they already selected." | |
| "Audience name" | Text | For new audience | |
| "Review selected emails" | List | "No email" marker for rows without email | "Select up to 100 unique emails at a time." |
| "Marketing permission note" | Checkbox | "I confirm these candidates have agreed to receive marketing emails."; note "A candidate profile alone does not indicate marketing consent. Unsubscribed or blocked contacts remain excluded." | Required (inferred) |
| Submit | "Add to audience" | | |

| Result / error | Text |
|---|---|
| Success | "The audience is being prepared. Select its latest version for future campaigns. Existing campaign selections and opt-outs are unchanged." / "Existing campaign selections and opt-outs are unchanged." |
| Nothing added | "No contacts were added" |
| Gates | "Email marketing is not available for this account"; "An administrator account with email marketing access is required."; "Audience import is not available in this marketing release. Please try again after the update."; "Marketing requires an approved HTTPS origin." |
| Session | "Session changed" / "Your session changed" + "Close and reopen this dialog to try again." |
| Errors | "Unable to load audiences"; "Marketing connection lost. Check your audience before trying again."; "Marketing connection closed."; "Could not load these records. Check your access and try again."; "Wait for the marketing connection to be ready."; "Invalid audience source"; "Invalid search"; "Invalid audience filter"; "Invalid selection"; "Invalid audience action"; "Invalid launch response" |

**API paths seen:** `/api/marketing-pilot/config`, `/api/marketing-pilot/launch`, `/api/marketing-pilot/audience-sources`, `/resolve`.

---

### 20. Re-parse resumes dialog

| Element | Text |
|---|---|
| Titles | "Re-parse resumes" / "Re-parse …" / "Extract resume details"; "Resume re-parsing status" |
| Info | "Candidate records were updated in place."; "Re-parsing runs in the background and can be minimized." |
| Progress | "Re-parsing …"; "Minimize and continue in the background"; "Minimize re-parse window"; "Close details and keep re-parsing minimized"; "Close re-parse window"; "View details"; "Dismiss" |
| Results | "Re-parse complete"; "Resumes re-parsed!" / "Resume re-parsed!"; "Re-parse finished with issues" |
| Errors | "Unable to re-parse the selected resumes."; "Re-parsing timed out."; "Unable to confirm re-parse status."; "The re-parse batch did not accept every resume."; "Unable to start resume re-parsing." |
| Validation | "Please select candidates!" |

---

### 21. Delete candidates dialog

| Element | Text |
|---|---|
| Title | "Delete candidates?" / "Delete selected candidates (…" |
| Body | "Review the selected candidates before deleting them."; list "Candidates to Delete"; "This action cannot be undone." |
| Buttons | "Delete" / "Cancel" |
| Validation | "Please select one or more candidates to proceed with deletion"; "No eligible candidates found for deletion"; "Maximum limit exceeded. You may delete up to …" / "Maximum limit of …" |
| Results | "Selected candidates have been successfully deleted"; "Unable to complete deletion operation: …"; "Failed to delete candidates." |

---

### 22. People Search

**Route:** `/jobs/:jobid/people_search`, `/discover/:jobid/people_search`
**Purpose:** "Find candidates outside your CVViZ database." Search external professional profiles, reveal contacts with credits, tag them and add them to a job or the candidate database.

**Layout blocks**

| Block | Content |
|---|---|
| Header | "People Search"; "Discover your next great hire"; help button "People Search help" |
| Keyword bar | "People Search keywords" ("Match keywords anywhere in external profiles. Search runs only when you choose Search people or Update results."); "People Search keywords help"; shortcut Control+Enter / Meta+Enter |
| Criteria panel | "Search criteria" ("Hide search criteria" / "Show search criteria", "Hide search criteria panel"); "Use job criteria"; "Reset criteria"; badges "From this job", "Suggested from this job", "Modified criteria", "Saved criteria restored", "No criteria selected", "Changes not searched" |
| Active filters | "Active filters" / "Filters:" chips; "Clear all" / "Clear All"; groups "All of" / "Any of" |
| Action | "Search people" / "Update results" / "Run search" / "Run again"; cost note "Uses up to …" / "Requests current results and may use up to …" |
| Views | "Saved views and recent searches" |
| Display | "People Search layout": List / Grid (from help text) |
| Results | Table; "Showing …"; pager "People Search result pages"; note "New result pages may use up to …" |
| Page-level tag filter | "Tags on this page": "Matches any selected CVViZ tag on the currently loaded result page."; "Any tag"; "No People Search tags yet"; "Filters loaded profiles only. No search credits used."; "Tags filter help" |
| Stale banner | "Criteria changed. Results still show your previous search." + "Currently showing: …" + "Refresh results"; "Filter changes apply when you choose …" |

**Primary filters**

| Label | Control | Placeholder | Hint |
|---|---|---|---|
| "Keywords" | Text | | |
| "Current job titles" | Tag input | "Enter job title" | "Match candidates by the job titles they currently hold." |
| "Target skills" | Tag input + mode | "Enter target skills" | "Choose Any for OR matching or All to require every selected skill" / "Choose Any for broader OR matching or All to require every selected skill." |
| "Target skills matching mode" | Toggle | "Any (OR)", "All (AND)" | |
| "Experience range" / "Years of Experience" | Min / max number | "Minimum years of experience", "Maximum years of experience", "No max" | "Set a minimum, maximum, or both for total experience."; "Total professional experience in years" |
| "Location" | Tag input | "Enter city name" | "Type a city or choose one used in your account." |
| "Location radius" | Number + unit ("Location radius unit") | | "Applied to every selected location."; "Select a location before adding a radius."; "Enter a whole number greater than zero."; "Location radius help" |
| "Country" | Tag input | "Enter country name" | |
| "Company industry" | Tree select | "Enter industry" | "Match candidates by their current employer's industry." |

**"More filters"** ("Industry, radius, keywords, education and company")

| Group (inferred) | Label | Placeholder | Hint |
|---|---|---|---|
| "Professional profile" | "Degree" | "Enter degree" | |
| | "Education" | | |
| | "Department" | "Enter department" | |
| | "Connections" | "Enter connection filters" | |
| | "Contact Method" | "Enter contact method" | |
| | "Current Employer" | "Enter employer name" | |
| | "Description" | "Enter keyword in profile" | "Matches keywords in profile description" |
| | "Domain" | "Enter email domain" | |
| | Email | "Enter email address" | |
| "Company" | "Company Name" | "Enter company name" | |
| | "Company City" | "Enter company city" | |
| | "Company Country Code" | "Enter ISO country code" | |
| | "Company Region" | "Enter region" | |
| | "Company Postal Code" | "Enter postal code" | |
| | "Company Domain" | "Enter company domain" | |
| | "Company Email" | "Enter company email(s)" | |
| | "Company Website URL" | "Enter website URL" | |
| | "Company Website Category" | "Enter category" | |
| | "Company Website Rank" / "Company Website Rank Min" / "Company Website Rank Max" | "Enter rank" / "Enter minimum rank" / "Enter maximum rank" | |
| | "Company Industry" | "Enter industry" | |
| | "Company Industry Keywords" | "Enter keywords" | |
| | "Company NAICS Code" | "Enter NAICS code" | |
| | "Company SIC Code" | "Enter SIC code" | |
| | "Company Size" / "Company Size Min" / "Company Size Max" | "Enter company size" / "Enter minimum size" / "Enter maximum size" | |
| | "Company Competitors" ("Competitors") | "Enter competitor names" | |
| | "Company Intent" | "Enter intent" | |
| | "Company News Timestamp" | | "Filter by event type and time period" |
| | "Company Tag" | "Enter company tag" | "Maps to company ID list by tag" |
| | "Company List" | "Enter company list name" | "Matches companies in the saved list" |
| | "Company List ID" | "Enter list ID" | "Internal list ID" |
| | "Company ID" | "Enter company ID" | "Internal company identifier" |
| "Company finance" | "Company Funding Min" / "Company Funding Max" | "Enter minimum funding amount" / "Enter maximum funding amount" | |
| | "Company Revenue" / "Company Revenue Min" / "Company Revenue Max" | "Enter revenue range" / "Enter minimum revenue" / "Enter maximum revenue" | |
| | "Company Publicly Traded" | "Enter true or false" | "Whether the company is publicly traded" |

**Company industry options** (parent → sub-industries; parent/child grouping inferred from order; two entries reworded and marked):

| Parent | Sub-industries |
|---|---|
| Agriculture & Fishing | Agriculture; Farming Animals & Livestock; Fishery & Aquaculture; Ranching |
| Business Services | Accounting & Accounting Services; Auctions; Business Services - General; Call Centers & Business Centers; Commercial Printing; Design; Digital Accessibility Services; Engineering Services; Equipment Rental Services; Event Services; Executive Search Services; Facilities Management & Services; Food Service; Geography & Positioning; Human Resources & recruitment agencies (reworded); Information Services; Janitorial Services; Management Consulting; Sales, Marketing & Advertising; Multimedia & Graphic Design; Office Administration; Outsourcing; Repair & Maintenance; Security & Investigations Products & Services; HR, recruitment agencies & Recruiting (reworded); Translation & Localization; Writing & Editing |
| Construction | Architecture Engineering & Design; Building Construction; Building Equipment Contractors; Building Finishing Contractors; Building Structure & Exterior Contractors; Construction - General; Highway, Street, & Bridge Construction; Landscaping Services; Mechanical Engineering; Mechanical or Industrial Engineering; Nonresidential Building Construction; Residential Building Construction; Specialty Trade Contractors; Utility System Construction |
| Consumer Services | Car & Truck Rental; Caterers; Child Care; Consumer Services - General; Funeral Homes & Funeral Related Services; Hair Salons and Cosmetology; Health Wellness & Fitness; Household Services; Laundry & Dry Cleaning Services; Photography; Vehicle Repair & Maintenance; Veterinary Care |
| Education | Career Services; Colleges & Universities; E-learning; Education - General; Education Management; Fine Arts Schools; Higher Education; K-12 Schools; Professional Training & Coaching; Sports & Recreation Instruction; Training |
| Energy, Utilities & Waste Treatment | Electricity & Energy; Energy, Utilities & Waste Treatment - General; Environmental Services; Nuclear; Oil & Gas Exploration & Services; Renewables & Environment; Solar Electric Power Generation; Utilities; Water Energy & Waste Treatment |
| Finance | Banking; Collection Agencies; Credit Cards & Transaction Processing; Finance - General; Financial Services; Funds, Trusts & Estates; Holding Companies; Insurance - General; Investment Advice; Investment Banking; Loan Brokers; Securities & Commodity Exchanges; Venture Capital & Private Equity |
| Government & Public Services | Chambers of Commerce; Cities Towns & Municipalities - General; Communities; Conservation Programs; Corrections Facilities; Fire Protection; Government - General; Health & Human Services; International Affairs; Law Enforcement; Military; Public Policy; Public Safety; Space Research & Technology |
| Healthcare | Biotechnology; Chiropractors; Dentists; Drug Manufacturing & Research; Drug Stores & Pharmacies; Elder & Disabled Care; Emergency & Relief Services; Emergency Medical Transportation & Services; Healthcare - General; Home Health Care Services; Hospitals & Healthcare; Medical & Diagnostic testing facilities (reworded); Medical Practice; Medicine; Mental Health Care; Optometrists; Pharmaceuticals; Physical, Occupational & Speech Therapists; Public Health |
| Leisure & Hospitality | Amusement Parks Arcades & Attractions; Bars, Taverns, & Nightclubs; Cultural - General; Entertainment; Fine Arts; Fitness & Dance Facilities; Gambling & Casinos; Gaming; Golf Courses & Country Clubs; Leisure & Hospitality - General; Leisure, Travel & Tourism; Libraries; Hotels, Lodging, & Resorts; Movie Theaters; Museums & Art Galleries; Performing Arts; Recreation; Restaurants; Sports; Zoos & National Parks |
| Law Firms & Legal Services | Courts of Law; Law Firms & Legal Services - General |
| Manufacturing | Aerospace & Defense; Animal & Leather Products; Textiles, Fashion, & Apparel; Appliances; Audio & Video Equipment & Products; Automotive; Automotive Equipment; Boats & Submarines; Building Materials; Business Supplies & Equipment; Chemical Products; Cleaning Products; Commercial & Industrial Machinery Maintenance; Commercial Machinery; Computer Hardware; Consumer Electronics; Consumer Goods; Cosmetics & Personal Care Products; Electrical Equipment & Products; Electronics & Electronics Manufacturing; Energy Equipment & Products; Fabricated Metal Products; Food & Beverages; Food Production; Furniture; Glass & Concrete; Hand Power and Lawn-care Tools; Health & Nutrition Products; Household Goods; Industrial Machinery Equipment & Automation; Lighting Equipment & Products; Lumber & Wood Production; Manufacturing - General; Maritime; Measurement & Testing Equipment; Medical Devices & Equipment; Metal Products; Miscellaneous Building Materials; Office Equipment & Products; Paper, Wood, & Forest Products; Personal Computers & Peripherals; Petrochemicals; Plastics & Packaging & Containers; Plastics & Rubber Products; Plumbing & HVAC Equipment; Power Conversion & Protection Equipment; Recyclable Materials; Renewable Energy Equipment & Products; Semiconductor & Semiconductor Equipment; Shipbuilding; Telecommunication Equipment; Test & Measurement Equipment; Textiles & Apparel; Tires & Rubber; Tobacco; Wine, Beer, & Spirits; Wire & Cable |
| Media & Internet | Animation; Broadcasting & Media; Ebook & Audiobooks; Ecommerce & Internet Retail; Film Video & Media Production & Services; Internet & Digital Media; Internet News & Publishing; Internet-related Services; Media & Internet - General; Music & Music Related Services; Newspapers & News Services; Public Relations & Communication; Publishing; Radio Stations; Search Engines & Internet Portals; Social Media; Television Stations |
| Metals & Mining | Metals & Mining - General; Mining |
| Organizations | Non-Profit & Charitable Organizations & Foundations; Organizations - General; Philanthropy; Professional Organizations; Program Development; Religious Organizations |
| Real Estate | Commercial Real Estate; Leasing Residential Real Estate; Real Estate & Equipment Rental Services; Real Estate - General; Real Estate Agents & Brokers |
| Research & Technology | Artificial Intelligence & Machine Learning; Climate Data & Analytics; Cryptocurrency; Mobile; Nanotechnology; Research - General; Robotics; Technology; Think Tanks |
| Retail | Apparel & Accessories Retail; Consumer Electronics & Computers Retail; Consumer Goods Rental; Department Stores Shopping Centers & Superstores; Flowers Gifts & Specialty; Footwear; Gas Stations Convenience & Liquor Stores; Grocery & Supermarkets; Home Improvement & Hardware; Jewelry & Watch Retail; Luxury Goods & Jewelry; Optometry & Eyewear; Pet Products; Record, Video & Book Stores; Toys & Games; Rental - Other - Furniture A/V Construction & Industrial Equipment; Rental - Video & DVD; Retail - General; Retail Motor Vehicles; Retail Musical Instruments; Sporting & Recreational Equipment |
| IT & Software | Business Intelligence Software; Cloud Software; Computer Games; Content & Collaboration Software; Customer Relationship Management Software(CRM); Database & File Management Software; Data Infrastructure & Analytics; Desktop Computing Software Products; Embedded Software Products; Enterprise Resource Planning Software(ERP); IT Systems & Services; Mobile Computing Software Products; Network Security Hardware & Software; Software & Technical Consulting; Software Engineering; Software - General |
| Telecommunications | Cable & Satellite; Telecommunications - General; Wireless |
| Supply Chain & Logistics | Import & Export & Trade; Logistics & Supply Chain - General; Shipping; Warehousing; Wholesale |
| Transportation | Airlines & Aviation; Delivery; Freight & Logistics Services; Ground Passenger Transportation; Rail Bus & Taxi; Rail Transportation; School & Employee Bus Services; Shuttles & Special Needs Transportation Services; Sightseeing Transportation; Taxi & Limousine Services; Transportation - General; Trucking Moving & Storage; Urban Transit Services |

**Result table columns:** (checkbox "Select all profiles on this page"), "Profile", "Experience & education", "Skills", "Contact", "Actions".

| Cell | Content |
|---|---|
| Profile | Name, title ("Title unknown"), "LinkedIn Profile" ("LinkedIn unavailable": "This LinkedIn profile link is no longer active"), badges "Already in candidate database" / "In candidate database", "Already added to job" / "Added to job" / "Already added", "Contact revealed", "Updated recently" / "Updated …", "CVViZ tags" ("Show all profile tags") |
| Experience & education | Roles ("Current", "Present"); "No structured role history is available for this profile."; "No structured education history is available for this profile." |
| Skills | "Profile skills"; "Matched: …" / "Missing: …"; "Show all …"; "No skills listed"; note "Coverage is based on the returned profile skill list and is not an overall candidate-fit score."; "Search requires every selected target skill (AND)." / "Search requires at least one selected target skill (OR)." |
| Contact | "Available" / "Not available"; "Work email", "Personal email", "Office phone"; "Reveal contact"; "Retry contact details"; "No contact details found"; "Contact reveal status is unavailable"; "Previously revealed contact is unavailable" |
| Actions | "View profile" ("View profile: …"), "Add tags" ("Add tags: …"), "Add to job" / "Add to candidate database", "Select to add to …", "Select for bulk actions" |

**Bulk bar ("Selected people actions"):** "Candidates Selected", "Select all …", "Clear selection" ("Clear selection (Esc)"), "Add tags to selected people", "Add to job", "Add to candidate database". Disabled reasons: "All selected people are already in …"; "Resume upload permission is required to …".

**Profile drawer** ("Candidate profile"; "Close profile" / "Close candidate profile")

| Section | Content |
|---|---|
| Header | Name, badges "Contact details revealed", "In candidate database", "Added to job"; "CVViZ tags" + "Add tags" |
| "Contact information" | Locked: "Contact information is locked" + "Reveal available email addresses and phone numbers for this profile." + button "Reveal contact" + "Credit usage will be confirmed before revealing". Revealed: emails ("Validated email address", "Validated …", "Grade …", "Copy email"), phones ("Personal", "Office", "Copy phone number"); "Copied to clipboard"; "No contact information available"; "Reveal contact to view the complete details." |
| Contact loading states | "Checking contact access" + "Restoring any details already revealed by your organization."; "Loading contact details"; "Contact already revealed" + "Loading your contact details. No additional credit is needed."; "Contact access could not be checked" + "Retry to check whether this contact was previously revealed." + "Retry loading"; "The details could not be loaded. Retry without using another contact credit."; "Retry loading contact details."; "Fetching contact info..."; "Failed to fetch contact info"; "Contact information is unavailable." |
| "Skills & expertise" | "All target skills" / "Any target skill"; "This search requires every selected target skill." / "This search requires at least one selected target skill."; "Show fewer skills"; "No skills information available" |
| "Healthcare credentials" | "Healthcare provider"; "License …" |
| "Work experience" | "Current"; "Show more" / "Show fewer roles"; "No work experience available" |
| "Education" | "No education information available" |

**Dialogs and confirmations**

| Dialog | Text | Buttons |
|---|---|---|
| Reveal contact | "Reveal contact details?" + "This will use …" + "After you confirm, CVViZ will retrieve the available email and phone details for this person." | "Confirm and reveal", "Cancel" |
| Not enough contact credits | "Contact credits required" + "Revealing this contact requires …" + "Purchase more contact credits in" + "Billing settings" | "Buy contact credits", "Not now" |
| Bulk add | "CVViZ will reveal the selected contacts and add their profiles to the …" or "These contacts were revealed previously, so no contact credits will be used." | "Reveal and add", "Cancel" |
| Bulk add, credits short | "More contact credits are required" + "Adding the selected people requires …" + "You can add contact credits from Billing settings." | |
| Re-run search | "Run this search again?" + "CVViZ will request current results from People Search." + "This may use up to …" | "Run search", "Keep current results" |
| Add tags | "Add Tags"; "Tags required"; "Pick existing tags or type to create new"; results "Tags added" / "Tags could not be added. Please try again." / "People Search tags could not be saved." | "Add Tags", "Cancel" |
| Delete view | "Delete …" + "This will permanently delete …" | "Delete", "Cancel" |

**Saved views and recent searches**

| Element | Text |
|---|---|
| Sections | "Saved views"; "Recent searches" ("Restores without credits"); hint "Select a saved view to open its results."; "Just now" |
| Save | "Save current" ("Save the current People Search criteria as a view"; disabled "Add search criteria before saving a view"); "Name this view"; field "View name"; "Save your current criteria to return to it with one click." |
| Unsaved | "Unsaved changes" → "Update view" / "Save as new" |
| Per view ("Actions for view …") | "Rename", "Duplicate", "Delete view" |
| Toasts | "Saved view …"; "Updated view …"; "Renamed view to …"; "Duplicated view as …"; "Deleted view …"; "Saved view: …" |
| Validation / errors | "A view with that name already exists."; "People Search view criteria are required"; "The People Search view could not be saved."; "The People Search view could not be updated."; "The People Search view could not be deleted."; "Could not open saved view" + "Please try opening this view again. No new search was run." |
| Restore | "Loading saved results" + "Restoring the previous search and its criteria."; "Results from …"; "Previously saved results"; "Saved results unavailable"; "The saved result snapshot expired. Your criteria are still available."; "The previous People Search could not be restored." |

**Help guide ("PEOPLE SEARCH GUIDE" / "Find the right people faster")**: intro "Search professional profiles outside your CVViZ database, review the evidence, and bring the right people into your workflow." Steps: "Set focused criteria" ("Use the keyword search or open Filters for titles, location, and target skills. Switch between List and Grid in Display."), "Run the search", "Review before revealing" ("Open the full professional profile without revealing contact details. Contact information remains locked until you request it."), "Organize and take action" ("Tag useful profiles immediately, or add them to your destination when you are ready to reveal and engage."). Sections "How matching works" ("Choose how target skills combine"; "Other filters narrow results": "Titles, location, experience, industry, and More filters work together. Remove a chip from Active filters to broaden the next search."), "Credits and privacy" ("Search credits"; "Contact credits": "Separate from search credits. Availability and usage are confirmed before contact details are revealed."), "Recruiter tips" ("Begin with Any (OR), then switch to All (AND) when every selected skill is essential."; "Use Views to return to useful criteria and saved results."; "Add shortlisted profiles to the …"). Button "Got it".

**Empty, loading and error messages**

| Situation | Text |
|---|---|
| Before search | "Start your people search"; "Start with a job title, skill, or location. Add filters to build your search."; "Add a job title, skill, or location in the search criteria panel to get started."; "Add keywords or filters to find external profiles"; "Results will appear here after you search."; "Add at least one criterion to enable search."; buttons "Add filters" / "Review filters" / "Review all …" |
| From a job | "Preparing your search" + "Loading the criteria from this job."; "Use the criteria suggested from this job, or enter your own in the search criteria panel."; "Use the criteria suggested from this job, or add your own filters."; "Review your criteria, then search for external profiles that match this role."; "Your search is ready"; "Ready to search" |
| Searching | "Finding matching profiles" + "Your search is running. Results will appear here." |
| Results | "Found …"; "People" |
| No results | "No matches"; "No matching profiles. Try a broader title, fewer required skills, or a wider location."; "No profiles found for your search criteria."; "No profiles found for current page."; "No profiles on this page match the selected tags." |
| Validation | "Add at least one search filter before searching."; "Choose a destination before adding profiles." |
| Credits | "People Search credits exhausted" / "People Search credits exhausted."; "People Search credits are exhausted for your account. Review your plan options to continue searching."; "You have 0 search credits available."; "Your search allowance is currently unavailable."; "Account allowance is unavailable. Refresh to try again."; "Ask your account administrator to enable search credits."; "Ask your account administrator about search credits."; "Search unavailable"; "View plan options" |
| Session | "Session verification failed" + "Refresh the page and sign in again if your session has expired."; "Your session could not be verified. Please refresh the page and try again." |
| Rate limit | "People Search is temporarily rate limited" + "Please wait a moment, then retry your search."; "Too many requests. Please wait and try again." |
| Outage | "People Search is temporarily unavailable"; "Something went wrong during the search. Please try again later."; "Search failed:"; "Failed to load default filters. Please try again later." |
| Import | "Adding …"; "This profile cannot be added right now." / "Add unavailable"; "The import did not return a candidate"; "Failed to import People Search profile …"; "The selected profiles could not be added to the …"; "Resume upload permission is required to add profiles to the …"; "You do not have permission to add these profiles."; "We could not prepare the selected profiles to be added."; "Contact credit availability could not be checked."; "We could not check contact credit availability." |

**API paths seen:** `/api/people-search`, `/contact-preflight`, `/api/people-search/contact-preflight`, `/revealed`, `/api/people-search/import-status`, `/api/people-search/profile-tags/query`, `/api/people-search/profile-tags`, `/people-search-imports`, `/settings/billing`. Requests carry an `Idempotency-Key` header.

**Plan / permission gates:** search credits; contact credits (separate pool); resume upload permission needed to add profiles.

---

### 23. AI sourcing: suggested candidates panel

**Purpose:** Show AI-sourced external profiles scored against the job and let the recruiter add, email or dismiss them. Title "Suggested candidates"; opened by "AI source candidates" / "AI Sourcing Agent".

| Block | Content |
|---|---|
| Header | "Run sourcing again" ("Starting a new sourcing run..."); "Minimize" ("Minimize suggested candidates"); "Close suggested candidates"; "Refreshing suggested candidates" / "Refreshing suggestions in the background..."; timestamps "Updated just now", "Updated 1 minute ago", "Updated 1 hour ago", "Updated …" |
| Sources | "Sources": "All sources", "All sources, …"; "Not connected" |
| Sort ("Sort by") | "Best match", "Candidate name" |
| Selection | "Select all visible"; "Select …" |

**Filters ("Filter candidates", "Filters", "Clear all")**

| Label | Control | Options |
|---|---|---|
| "Minimum match" | Select / slider | "Any score (include potential matches)"; quick toggle "Hide matches below 50%" |
| "Location" | Text | Placeholder "City, region, or country" |
| "Job status" | Select | "All candidates", "Not added yet", "Already added" |
| "Required skills" | Multi-select | "Choose job skills" |

**Card content:** name ("Unknown candidate"), role ("Role unavailable"), "Source", match score (tooltip "AI match score based on the job requirements and available profile details. Review strengths and gaps before deciding."), "Key strengths", "Missing requirements", "Matched skills", "Profile skills", "Expand" / "Show less", "Quick view" (sections "Profile summary", professional experience, "Education", "Skills"; empties "No match summary available.", "No professional experience available.", "No education details available.").

**Card actions:** "Add to job", "Draft email", "Source profile", "Add to audience", "Dismiss suggestion", "Retry import".

| Dialog / message | Text |
|---|---|
| Add confirm | "Adding the selected People Search candidate" + "After confirmation, CVViZ will generate a resume and use advanced parsing when credits are available, otherwise basic parsing." + "Confirm and add" / "Cancel" |
| Credits | "Contact credits required" + "You need …" + "Purchase more contact credits in" + "Billing settings"; buttons "Buy contact credits", "Not now"; "We could not check contact credits for this import." |
| Add results | "Candidate added to the job. Contact details and resume parsing are in progress."; "Candidate was already in this job."; "We could not add this candidate."; "Import interrupted" |
| Add blocked | "A verified email is required to import this public profile"; "Resume upload permission required" |
| Dismiss | "Dismiss …"; reason "Not relevant to this role"; "Dismissed suggestions will be removed from this result set."; error "We could not dismiss this candidate." |
| Close with selection | "Close without applying your selection?" + "Keep reviewing" |
| Empty | "No candidates match these filters" + "Try removing a filter or lowering the minimum match score." + "Clear filters"; "No matching profiles from …" + "Adjust the location or required skills and run sourcing again." + "Adjust search" |
| Error | "We could not load sourcing suggestions." |

Related sourcing-result strings (second sourcing component): actions "Add to job", "Add candidate", "Import profile", "Open job", "Save to project", "Remove from project"; states "Profile import accepted" ("The profile is in the ATS processing queue. Open the job to follow parsing and screening progress. Repeating this action reopens the same import."), "Profile already imported" / "Already in this job" ("Open the job to review the existing candidate. No new import was created."), "Existing import needs attention" ("The existing import did not finish successfully. Open the job to review its status. This action has not started or charged for another import."), "Candidate added", "Screening has been queued.", "The application is saved. Screening has not been queued by this action."; add form: "Choose an active job" ("Choose a job."; "Only accessible active jobs in this workspace are shown."), "Confirm candidate name" ("Name confirmed from the source profile"); notes "Links the existing ATS candidate to this job and queues screening. Repeating this action does not create another application.", "Uses your existing parsing allowance: advanced parsing when available, otherwise basic. Normal ATS processing follows.", "No additional search or contact-lookup credits.", "Repository activity and search excerpts are not imported as claimed skills or work history."; card sections "Skills & evidence", "Found on", "Source evidence", "Search excerpt", "Overview", "Listed skills: …"; empties "No candidates found" + "Try a broader role, location or set of skills.", "No matching candidates" + "Try another name, company or skill.", "Skills not provided", "Role and company not provided", "Location not listed", "Work history is not available from this source.", "The available source does not provide enough evidence.", "The source did not provide skills. This does not mean the candidate lacks them."; project dialog "Create a project": "Project name" ("Give your project a name."), "Description (optional)" ("What are you building this talent pool for?"), visibility "Private" ("Private to you. You can explicitly share it with your team later.") / "Shared with team", button "Create project", empty "No active projects yet. Create one below."

---

### 24. Public page: candidate pre-screening form

**Route:** `/screening/:id`
**Purpose:** Candidate answers the job's screening questions (and can attach a resume) from an emailed link.

| Element | Text |
|---|---|
| Header link | "Career Page" |
| Answer controls | Text ("Input your answer"), select ("Select Option"), date ("DD-MM-YYYY"), duration ("Months"), salary ("Currency" + amount, with the country list of section 5.7), file upload, checkbox |
| Consent | Checkbox "I agree to …" + "Privacy Policy" |
| CAPTCHA | Present |
| Submit | "Save Application" |

| Validation | Text |
|---|---|
| Required | "Required" |
| URL | "The input is not a valid URL" |
| Date | "The input is not a valid Date" |
| Email | "The input is not valid E-mail" |
| Number | "The input is not valid Number" |
| Phone | "The input is not phone Number!" |
| Dropdown | "Please select an option from dropdown" |
| Terms | "You must agree to the terms and privacy policy." |
| CAPTCHA | "Please solve the CAPTCHA check." |
| File | "Sorry, the file was not accepted. Please upload a file with content." |

Success: "Your application has been saved!"; "Resume submitted successfully."
**API path seen:** `/job_`.

---

### 25. Public page: shared shortlist (client / hiring-manager review)

**Route:** `/shortlisting/:id`
**Purpose:** External reviewer opens a shared link, reads resumes and records a decision per candidate.

**List view** (title "Candidate shortlist"; subtitle "Review shared resumes and record your hiring decision."; summary "Candidate review summary", "Review progress")

| Element | Text |
|---|---|
| Search | "Search shared candidates" / "Search candidates" |
| Filter | "Filter by review decision": "All statuses", "Not reviewed", "Shortlisted", "Rejected" |
| Columns | "Candidate" (with "Experience", "Location", "Qualification"; "Not specified"), "Contact" ("Email …"; "Not provided"), "Shared" (date "DD MMM YYYY"), "Status" ("Candidate review decision", "Click to change status"), "Actions" |
| Row actions | "Review", "View or add notes", "View or add feedback", "Candidate resume" / "Resume" |
| Empty | "No candidates match these filters" |
| Invalid link | "This shared shortlist is unavailable" + "The link may be invalid or expired. Ask the sender for a new link." |
| Toast | "Status updated" |

**Review view** ("Back to candidate list"; "Candidate …"; "Previous candidate" / "Next candidate")

| Block | Text |
|---|---|
| "Resume preview" | "Download" / "Download resume"; errors "Resume access unavailable" + "The resume is temporarily unavailable. Please try again."; "Resume preview unavailable" + "You can retry the preview or download the original resume." + "Retry preview" |
| "Decision" | "Record your decision after reviewing the resume."; buttons "Shortlist candidate", "Reject candidate" |
| Decision confirm | "Add a note (optional)" + "Add an optional note to give your team context for this decision." + "Confirm …" / "Cancel" |
| "Review tools" | Notes ("Notes for …", "Add Note", "Note added!"), "Interview feedback" (form as section 5.10) |

**API path seen:** `/shortlisting`.

---

### 26. Public page: job offer

**Route:** `/job-offer/:id`
**Purpose:** Candidate reads the offer letter and accepts or declines.

| Block | Text |
|---|---|
| Eyebrow / title | "CANDIDATE JOB OFFER"; "Your offer from …"; "You have …" |
| Intro | "Review your offer letter and confirm your decision below." |
| Details | "Position"; date ("DD MMM YYYY") |
| "Offer letter" | "Offer letter document"; "Download" / "Download offer letter"; "View File" |
| Letter error | "Offer letter unavailable" + "The offer letter could not be loaded. Please try this link again later." |
| Response block | "Ready to respond?" + "Your response will be shared with …"; buttons "Accept offer", "Decline offer" |
| Confirm accept | "Are you sure you want to accept this offer?" + field "Add a note (optional)" |
| Confirm decline | "Are you sure you want to decline this offer?" + field "Add a note (optional)" |
| After response | "Offer accepted" or "Offer declined" + "Your response has been shared with …" |
| Errors | "We could not save your response. Please try again."; "Unable to update job offer status" |
| Invalid link | "This offer link is unavailable" + "It may be invalid, expired, or withdrawn. Please contact the hiring team if you need a new link." |

---

### 27. Public page: consent form

**Route:** `/consent/:id` (legacy `/consent/:id/:legacy`); success `/consent/:id/success`
**Purpose:** Candidate grants data-processing consent requested by email.

| Label | Control | Notes |
|---|---|---|
| "Consent Form" | Page title | |
| "Consent Statement" | Read-only text + checkbox | Text supplied by account settings |
| "Communication preferences" | Checkbox group | Options supplied by account settings |
| "Remarks (optional)" | Textarea | Placeholder "Remarks (if any)" |
| "Privacy Statement" | Read-only text | |
| Submit | "Submit My Consent" | |

| Message | Text |
|---|---|
| Error | "Could not submit your consent." |
| Invalid link | "Consent form unavailable"; "This consent link is incomplete or no longer available."; "This consent link is invalid or no longer available." |

**API path seen:** `/success`.

---

### 28. Public page: GDPR request form

**Route:** `/gdpr/:id`; success `/gdpr/:id/success`
**Purpose:** A data subject files a privacy request, which appears under the candidate's Data Privacy tab.

| Label | Control | Options / placeholder | Validation |
|---|---|---|---|
| "What's your name ?" | Text | "Your full name" | "This field is required!" |
| "What's your email address?" | Email | "Email Address" | "Please enter a valid email address!" |
| "What do you want to get done?" | Select ("Select an option") | "I want company to delete my personal data"; "I want company to export my data"; "I want company to rectify incorrect data you have about me"; "I want to know how you are using my personal information"; "I want company to keep my data, but stop processing it" | "Please select an option!" |
| "Describe the data you want to rectify" | Textarea (shown for the rectify option, inferred) | | "Please describe the data you want to rectify" |
| Submit | "Submit my request" | | |

Mapping to internal request types (inferred): delete → "Delete Data"; export → "Export Data"; rectify → "Update Data"; how used → "Information" / "Access data"; stop processing → "Stop Processing Data".

| Message | Text |
|---|---|
| Error | "Could not submit your privacy request." |
| Invalid | "Privacy request unavailable"; "This privacy request form is unavailable." |

**API path seen:** `/success`.

---

### 29. Public page: interview booking

**Route:** `/book/:token`; confirmation `/book/:token/confirmed`
**Purpose:** Candidate picks an interview slot from a scheduling or booking link.

| Element | Text |
|---|---|
| Titles | "Book a meeting"; "Interview invitation"; "Scheduling link"; "Select a Date & Time" |
| Calendar | "Previous month" / "Next month" ("MMMM YYYY"); "Display timezone" (America/Denver, America/Chicago, America/Toronto, Europe/London, Europe/Paris, Europe/Berlin, Europe/Moscow, Africa/Cairo, Asia/Dubai, Asia/Karachi, Asia/Kolkata, Asia/Singapore, Asia/Tokyo, Asia/Shanghai, Australia/Sydney, Pacific/Auckland); "Times shown in …"; "Video meeting included"; "Look further ahead" |
| Field "Your name" | Text, placeholder "Jane Doe"; validation "Tell us your name" |
| Field "Your email" | Email; validation "We need your email to send the invite"; "That doesn't look like a valid email" |
| Submit | "Confirm booking"; disabled hint "Select a time to continue."; validation "Pick a time slot first." |
| Loading | "Checking availability" + "Preparing the booking calendar for your timezone." |
| Empty | "No times available"; "No dates in this month" + "Use the month arrows to browse other available dates."; "No matching times are available in the next …"; "No matching times are available right now. Try another day or contact the recruiter."; "The recruiter hasn't suggested any slots. Please reply to the email you received." |
| Errors | "Missing booking token in the URL."; "We couldn't load this booking link. It may be invalid or expired."; "Could not load available times for this scheduling link."; "Could not load more available times for this scheduling link."; "Could not confirm the booking. Try a different slot."; "Booking unavailable" |
| Already used | "This time has already been booked" + "If you need to reschedule, please reply to the email you received." |
| Cancelled | "This booking has been cancelled" + "Please reach out to the recruiter for an alternative." |

**API path seen:** `/confirmed`.

---

### Not determinable from the bundles

| Item | Status |
|---|---|
| Reject / stage-change reason values | Loaded from the API; no reason strings in the bundles |
| Parent-child structure of pipeline stages | Supplied by `/api/workflow-templates`; only flat names in the bundle |
| Full rating scale words | Only "Very good" and "Exceptional" plus "Not rated" are present |
| Experience and skill-match filter option values | Dynamic |
| Export column list | Dynamic; only the validation text is present |
| Exact tab-to-group membership on the profile | Group captions present; membership inferred |
| State / city labels in the edit candidate form | Not present as separate strings |
| Visa type, note type and duration option values | Dynamic or absent |
| Merge-duplicate-candidates and "copy / move between jobs" as distinct features | No strings found; only duplicate detection on upload and "Add Candidates to Job" exist |
| WhatsApp messaging | Only a click-to-open link ("Click to WhatsApp …"); no composer strings |

---

## 6. Dashboard, reports, calendar, tasks and shell

Conventions: text in "quotes" is copied from the product. A trailing `…` marks a text fragment that the product completes at run time with a name, number or date. "inferred" marks a grouping or placement that the strings suggest but do not state. One source label (a Company type option on the sign-up form) was reworded to respect the vocabulary rules of this document; it is flagged "(reworded)".

### 1. Dashboard (recruiting workspace)

- Route: `/dashboard` (also registered: `/dashboard-v2`, `/dashboard-v3`). Menu name "Dashboard".
- Purpose: a personal recruiting workspace showing counts, a work queue, the user's schedule and hiring insights for the jobs in scope.
- Loading / refresh states: "Loading your recruiting workspace", "Updating your workspace", "Updated …", "Try refreshing. Your saved dashboard preferences are unchanged."

Layout blocks (order inferred from live observation plus strings):

| Block | Heading / helper text | Contents |
|---|---|---|
| Header | Greeting "Good morning" / "Good afternoon" / "Good evening" | "Refresh" ("Refresh dashboard"), "Personalize", "Dashboard scope" toggle, "Filters", "Saved workspace views", "Recent changes", "Reporting timezone:" |
| Recruiting overview | "Recruiting overview" | KPI cards, each with an "About …" help trigger |
| Action queue | "Your action queue" - "Review, decide, and keep candidates moving." | Category tabs with counts, row list, pager |
| Upcoming | "PLAN AHEAD" / "Upcoming" - "Your personal tasks and calendar." | "Schedule period" switch (Today / 7 days per live observation), "Upcoming commitments" list |
| Hiring intelligence | "LOOK A LITTLE FURTHER" / "Hiring intelligence" - "Find fresh talent, improve your workflow, and understand what works." | "Insights period" selector, "Hiring intelligence views" tabs: "Source performance", "Hiring outcomes", "Talent opportunities" |
| Recent hiring milestones | "Recent hiring milestones" | Period switch "Recent changes period" with "Since last visit"; list of milestones |

Scope and filters:

| Control | Options / text | Notes |
|---|---|---|
| "Dashboard scope" | "My work", "All accessible" | "All accessible …" also appears as a filter option prefix |
| "Filters" panel, titled "Focus your workspace" | Filter groups "Customer(s)", "Department(s)", "Recruiter(s)" and jobs ("Filter by …") | "Filter workload and intelligence by job and team. Upcoming events and tasks always show your own schedule." / "Filters apply as you select them." / "Clear filters" / "No matching options" |
| Filter load failure | "Some filter options could not be loaded", "Options unavailable. Try Retry above." | |
| "Insights period" | "Last 30 days", "Last 90 days", "Last year"; plus "Insights period end" date | "Choose an insights period of up to one year." |
| "Recent changes period" | "Since last visit" plus period options | "Interview-stage entries and hires recorded in your current scope since …" |

KPI cards ("Recruiting overview"):

| KPI | Definition / help text | Sub-text and empty state |
|---|---|---|
| "Open jobs" | "Currently open jobs. Independent of the Hiring intelligence period." | "In your selected scope"; empty: "No open jobs match this scope now." |
| "Applications to review" | "Recent applications and those past the review target." / "Based on pipeline stage, not whether a profile has been viewed." Link text "How review applications are counted". Stage breakdown names seen: "Internal Review", "Shared", "Submitted to Client", "Stage not recorded" | Badge wording built from "Review" + target ("At the review target", past-review-target per live observation); empty: "No applications to review" - "No current applications are in the included stages for your selected jobs." |
| "Interviews you scheduled" (detail title "Upcoming interviews") | "Interviews you created in CVViZ, linked to a visible candidate and open job, from now through the next six days. Personal and provider-only events remain in Upcoming." | Empty: "No recorded interviews in the next 7 days" - "No interviews you created in CVViZ match your selected jobs. Open your calendar to see your other scheduled events." |
| "Pending offers" | "The latest recorded offer is pending for these applications in open jobs. Joined and rejected candidates are excluded." | Badge wording built from "Response" + target (past-response-target per live observation); empty: "No pending offers" - "No recorded offers are awaiting a response in your selected jobs." |
| "Jobs to check" | "Open jobs with no visible applications or no recent recorded activity, using your workspace inactivity target. These signals reflect the candidates you can access." Flags per job: "No visible applications", "No visible candidates past review", "No recent recorded progress" | Empty: "No jobs flagged by these checks" - "No jobs match the pipeline checks in your selected scope." / "No recent hiring activity" |

KPI card states and errors: "This overview is temporarily unavailable", "Overview is not available", "Count unavailable", "Open the full list to check the current count", "Access required", "Preview unavailable", "Date not recorded", "Oldest record …", "Oldest: …". Data-integrity messages: "Missing overview result", "Incomplete overview list", "Inconsistent stage breakdown", "Incomplete review job totals", "Missing overview count", "Inconsistent overview count", "Missing recruiter identity", "Incomplete job lookup".

KPI row links: "Open job", "Open role", "View role", "View job", "Review role", "Review job", "Review offer", "Review applications for …", "View candidates for …", "View profile".

API paths seen: `/api/dashboard/configuration`, `/api/dashboard/configuration/profile`, `/api/dashboard/preferences`, `/api/dashboard/actions`, `/api/dashboard/outcomes`; navigation targets `/dashboard`, `/details`, `/candidates`, `/jobs`, `/tasks`, `/calendar`, `/people_search`, `/job-offers`, `/feedbacks`.

Permission gates: "Additional access required", "This view needs additional access" - "Your administrator can review the permissions needed for this insight."; "Access follows your workspace role"; "Your workspace permissions determine which records you can view."

### 2. Dashboard - KPI detail list ("Review queue")

- Route: dashboard sub-view using `/details` (exact path not determined).
- Purpose: full paged list behind a KPI card.

| Element | Text |
|---|---|
| Titles | "Review queue", "Across your selected jobs", "Choose a job to open its candidate list" |
| Back link | "Back to dashboard" |
| Row content | Candidate / job, "Location not recorded", "Remote", "Offer recorded", "Owner: …", "Times in …" (timezone note) |
| Row actions | "Review applications for …", "Review job", "Review offer", "Open interview feedback (opens in a new tab)", "Join meeting (opens in a new tab)" |
| Stale list notice | "The queue changed while you were reviewing it. Return to the first page to see the remaining records." + "Go to first page" |
| Empty | "No records on this page" |
| Access | "Access to these records is limited" - "Your workspace permissions determine which records you can view." |
| Loading | "Loading …" |

### 3. Dashboard - Action queue

- Purpose: prioritised follow-up work, grouped in categories ("Action queue category").

| Tab | Description line | Empty title | Empty detail |
|---|---|---|---|
| "Applications" | "Applications needing attention" | "No applications need attention" | "Nothing needs a review follow-up in your selected jobs right now." |
| "Feedback" | "Interview feedback to follow up" | "No feedback to follow up" | "No candidates in your selected jobs need a feedback follow-up." |
| "Offers" | "Offers awaiting a response" | "No offer follow-ups due" | "No offers match this follow-up queue in your selected jobs." |
| "Overdue tasks" | "Past their due date" / "My tasks …" | "No overdue tasks" | "You have no overdue tasks. Check My tasks for upcoming work." + "View my tasks …" |
| "Record cleanup" | "Older records and inactive jobs" / "Jobs needing a decision" | "No older records to check" | "No records match the cleanup policy in your selected jobs." |
| (generic) | | "No work in this queue" | |

| Row action | Result / message |
|---|---|
| "Review applications" / "View candidates for …" | Opens the job's candidate list |
| "Assign owner" | Opens "Assign queue owner" dialog; success "Owner updated." |
| "Create follow-up task" | Opens "Create task" dialog pre-filled "Follow up: …" |
| "Mark task complete: …" / "Complete" | Completes an overdue task; failure "Could not complete the task. Please try again." |
| "More actions for …" | Overflow menu |

Other texts: "Loading overdue tasks", "Count unavailable", "Queue unavailable", "No queues available for your role" - "Your workspace permissions determine which hiring queues appear here.", pager "Action queue pages", "Queue rows per page".

Dialog "Create task" (follow-up task):

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| "Task (required)" | Text | - | "Add a task and choose a due date in the future." |
| "Due date (required)" | Date-time picker (format `D MMM YYYY, h:mm A`) | - | "Choose a time in the future." + "Times shown in …" (timezone) |
| Buttons | "Create task", "Cancel" | | Success "Task added to My tasks, due …"; errors "Task creation was not confirmed", "Your account is still loading. Please try again." |

Dialog "Assign queue owner":

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| "Accountable recruiter" | Searchable select | Recruiters in the workspace | Placeholder "Choose a recruiter"; "No matching recruiters" |
| Buttons | "Save owner", "Cancel" | | Success "Owner updated." |

### 4. Dashboard - Upcoming

- Purpose: the signed-in user's own tasks and calendar events for a short period.

| Element | Text |
|---|---|
| Period switch | "Schedule period" (Today / 7 days per live observation) |
| Item types | "Calendar event", task ("Untitled task"), "Untitled event", "In progress", "All day", "Time unavailable" |
| Item actions | "Join meeting", "Open event details", "Open in My tasks", "Schedule details", "Prepare for this event", "Location not provided" |
| List controls | "Show all …", "Show fewer commitments", "At least …" (count prefix) |
| Footer actions | "Open calendar", "Set up calendar" |
| Empty (today) | "No more commitments today" - "Your connected calendar and tasks have nothing else scheduled today." |
| Empty (7 days) | "No commitments in the next 7 days" - "Your connected calendar and tasks have nothing scheduled in this period." |
| Partial data | "Your schedule is incomplete" - "Open your calendar or tasks for the latest commitments." |
| Loading / retry | "Loading your schedule", "Try again" |
| Providers named | "Google Calendar", "Outlook Calendar" |

### 5. Dashboard - Hiring intelligence: Source performance

- Purpose: compare candidate sources by application volume and recorded progress.
- Headline lines: "See where your candidate pipeline begins." / "Find the channels that lead to conversations."

| Element | Text / definition |
|---|---|
| Display switch | "Source performance display" (chart or table; "View table") |
| Metric switch | "Source metric": application volume vs conversion (labels "Applications added", "Reached shortlist", "Reached interview") |
| Volume definition | "Applications added to the selected jobs during this period." |
| Progress definition | "Applications added in this period, with progress tracked through today." |
| Table name | "Source performance table" - "Applications and outcomes by source" |
| Table columns | "Source", "Applications added", "Share of volume", "Reached shortlist", "Reached interview", "Conversion" |
| Period columns | "Selected period", "Previous period" |
| Source names | "People Search", "Career page", "Manual upload", "Unknown" |
| Cell fallbacks | "Not available", "No applications", "No applications in this period" |
| Badges | "Application volume only", "Small sample" |
| Table hints | "Scroll horizontally to see all source metrics.", "Show fewer sources", "Your source data is still available in the table." |

Guidance and caveat texts:

- "Fewer than 20 applications. Treat conversion rates as early signals, not a basis for sourcing decisions."
- "Try a wider insights period to see more activity from this source."
- "Outcome and conversion data are not available for this source."
- "This report shows application volume only. Outcome data is unavailable, so volume alone should not guide sourcing decisions."
- "Application volume shows where candidates come from. Review outcomes as well before making sourcing decisions."
- "More applications will make comparisons useful. Recommendations need at least 20 applications from each of two known sources."
- "Source comparisons appear as applications are added to your selected jobs."
- Empty: "No applications were added to your selected jobs in this period."

Source detail panel ("Application progress"): "Recorded outcomes through the last refresh." / "Outcomes for applications added in each period"; column "Outcome"; help "How to read these numbers": "Outcomes can overlap: an application may have reached shortlist, interview, and hire. Percentages use applications added in each period as the denominator." and "Recent applications have had less time to progress. Compare similar jobs and application dates. Conversion measures recorded progress, not candidate quality."

### 6. Dashboard - Hiring intelligence: Hiring outcomes

- Purpose: hires and offers recorded in the selected period, compared with the previous period.
- API: `/api/dashboard/outcomes`.

| Metric / element | Definition or text |
|---|---|
| "Hires recorded" | Count of hires in the period; empty "No hires recorded in this period" |
| "Candidates offered" | Count first offered in the period; empty "No candidates first offered in this period" |
| "Median time to hire" | Empty states "Recorded hires have no valid timing", "Available after a hire with valid timing" |
| "Offer acceptance" | Split "Accepted", "Declined", "Awaiting response", "Response unknown"; empty "No decided offers" |
| "Hiring activity" chart | "Trend metric" switch between hires and "Offers" |
| Scope note | "Includes closed jobs. Results follow your current access." |
| Comparison | "Results for the selected period", "Compared with …", "Selected period", "Previous period" |
| Actions | "Refresh hiring outcomes", "Change period", "Choose another period", "Review filters", "Expand to 90 days", "Expand to 1 year" |
| Empty | "No recorded hiring outcomes match this period and scope." |
| Loading | "Loading outcomes", "Loading hiring insights", "Loading outcome details" |
| Errors | "Temporarily unavailable", "This insight is temporarily unavailable" - "Try again in a moment."; integrity messages "Unsupported hiring outcomes", "Missing comparison period", "Missing outcome state", "Incomplete outcome detail", "Incomplete outcome counts", "Invalid hiring timing", "Inconsistent offer cohort" |

Drill-down "Outcome records" ("Outcome records table"), two variants "Hire records" and "Offer records":

| Column | Notes |
|---|---|
| "Candidate / job" | Shows "Candidate …" and "Source: …" |
| "First joined" (hire records) | Date format `MMM D, YYYY HH:mm`; note "Dates use …" (timezone) |
| "First offered" (offer records) | |
| "Time to hire" | "Timing unavailable" when missing |
| "Latest response" | Accepted / Declined / Awaiting response / Response unknown |

Empty: "No records on this page."

### 7. Dashboard - Hiring intelligence: Talent opportunities

- Purpose: jump from an active job into external profile search.

| Element | Text |
|---|---|
| Headings | "Discover people for your next hire.", "Find people beyond your database.", "Sourcing for your selected jobs" |
| Field "Job to explore" | Searchable select of in-progress jobs; "Loading jobs", "No jobs match your search"; hint "Choose a job to explore external profiles in People Search." |
| Action | "Open People Search …" ("Search for …") |
| Credit notes | "Opening People Search does not use search credits. Review criteria and credits before searching." / "Access and available credits are confirmed in People Search before a search runs." |
| Plan gate | "People Search is not enabled on your current plan. Your administrator can enable it. Opening the workspace does not run a search." |
| Permission gate | "People Search needs additional access" - "Your administrator can enable your People Search permission so you can explore external profiles for this job." |
| Empty | "Start with an active job" - "People Search becomes available here when an in-progress job is in your selected scope." |

### 8. Dashboard - Recent hiring milestones

| Element | Text |
|---|---|
| Heading | "Recent hiring milestones" / "Recent changes" |
| Definition | "Interview-stage entries and hires recorded in your current scope since …" |
| Period | "Recent changes period", option "Since last visit" |
| Row | "Candidate", action "View profile" |
| Empty | "No new milestones recorded in this scope." |

### 9. Dashboard - Personalize and saved views

Dialog "Personalize dashboard" ("Make this workspace yours" - "Personalize your dashboard. Preferences are saved in this browser."):

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| "Workspace preset" | Select | Saved views, "Custom view" | - |
| "Start intelligence with" | Select | "Source performance", "Hiring outcomes", "Talent opportunities" | - |
| "Compact spacing" | Switch | on / off | "Fit more of your workspace on screen." |
| Saved views list | List | "Remove saved view …" / "Remove" | - |

Dialog "Save a workspace view":

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| "View name (required)" | Text | - | Placeholder "For example, Engineering hiring" |
| Note | - | - | "Saves your job and team filters and the selected intelligence tab. Reporting dates stay flexible. Available on this browser." |
| Buttons | "Save view", "Replace saved view", "Cancel" | | Limit: "You can save up to 8 views. Remove one in Personalize or replace an existing view."; success "Workspace view saved." |

### 10. Dashboard experience settings

- Route: under `/settings` (menu name "Dashboard Experience").
- Purpose: workspace-wide targets that decide when the dashboard flags waiting work and when older work moves to Record cleanup.
- Header: "Dashboard experience" - "Set review targets and record cleanup rules for your dashboard."
- Section "Workspace defaults": "Applies to your whole team. Set how long work can wait before the dashboard flags it for attention." / "Existing role or pipeline overrides still apply when viewing a single role. Saving workspace defaults does not change those overrides."

| Group | Label | Control type | Hint |
|---|---|---|---|
| "Review & follow-up" - "When waiting applications need attention." | "Application review" | Number (days) | "New, Internal Review, Shared, and Submitted to Client stages, including related custom stages." |
| | "Stage follow-up" | Number (days) | "Candidates waiting in other active stages." |
| | "Interview feedback" | Number (days) | "Candidates in the interview stage without recorded feedback." |
| | "Offer response" | Number (days) | "Pending offers waiting for a response." |
| "Record cleanup" - "When older work belongs in Record cleanup." | "Inactive roles" | Number (days) | "Roles without recent activity, when no other queue action takes priority." |
| | "Older candidate records" | Number (days) | "Candidate records with no stage change beyond this threshold. No records are deleted." |
| (all) | "Count weekdays only" | Switch | "Off: count every day. On: count Monday to Friday, including public holidays. Applies to all targets above, including cleanup." |

Validation: "Enter a number of days". Footer: "Unsaved changes" / "No unsaved changes", "Reset changes", "Save changes". Messages: "Workspace dashboard defaults updated.", "Dashboard action rules could not be saved.", "Dashboard settings could not be loaded" - "Retry to load the current settings before making changes." APIs: same `/api/dashboard/*` set as the dashboard.

### 11. Reports (summary reports)

- Routes: `/reports`, `/reports/jobs`, `/reports/users`, `/reports/vendors`, `/reports/upload`, `/reports/timetofill`, `/reports/trending`.
- Purpose: "Monitor hiring activity and understand performance across your recruitment process."
- Layout: page title "Reports", tab strip "Reports navigation", then per tab: summary cards, charts, "Detailed results" table.

Common controls:

| Control | Text / options |
|---|---|
| Date range | "Date range presets" (1M / 6M / 1Y and a 366-day maximum per live observation; these preset labels are not in the extracted strings) |
| Search | "Search report" |
| Group by (Jobs Summary) | Jobs, "Departments", "Customers" |
| "Refresh" | Reloads |
| "Export" | "Export to CSV", "Export to …" (image) |
| Count lines | "Showing …", "Showing all …", "Across …", "Selected filters: …", "Current filters: …" |

Messages: "CSV export is ready.", "The report export failed.", "The report export is still processing. Please try again shortly.", "Could not export this report.", "Could not export this report image.", "The report could not be loaded.", "We couldn't load this report", "No chart data in this date range", "No report data in this date range".

Tab descriptions:

| Tab | Description |
|---|---|
| "Jobs Summary" | "Monitor job activity and candidate movement through the hiring funnel." |
| "Users Summary" | "Compare workload, candidate activity, and hiring outcomes by user." |
| "Vendors Summary" | "Evaluate vendor contribution and downstream candidate outcomes." |
| "Resume Upload" | "Understand where resumes originate and how upload volume changes over time." |
| "Time To Fill" | "Track how long candidates take to reach each hiring stage." |
| "Trending Recruitments" | "Compare recruitment demand and hiring activity across customers." |

Summary cards (metric and tooltip definition):

| Tab | Metric | Definition |
|---|---|---|
| Jobs Summary | "Matching jobs" | "Jobs returned by the selected date range and active filters." |
| | "Candidates" | "Total candidates associated with the job rows currently displayed." |
| | "Shortlisted" | "Candidates currently in the shortlisted stage across the displayed jobs." |
| | "Joined" | "Candidates who joined, divided by candidates across the displayed jobs." |
| Users Summary | "Matching users" | "Users returned by the selected date range and current search." |
| | "Jobs assigned" | "Total job assignments across the user rows currently displayed." |
| | "Candidates handled" | "Candidates associated with the users currently displayed." |
| | "Joined" | "Candidates who joined, divided by candidates handled by the displayed users." |
| Vendors Summary | "Matching vendors" | "Vendors returned by the selected date range and current search." |
| | "Candidates received" | "Candidates supplied by the vendor rows currently displayed." |
| | "Shortlisted" | "Vendor-supplied candidates currently in the shortlisted stage." |
| | "Joined" | "Vendor-supplied candidates who joined, divided by candidates received from displayed vendors." |
| Resume Upload | "Uploaded resumes" | "All resume uploads attributed to the source rows currently displayed." |
| | "Active sources" | "Sources with at least one resume upload in the selected date range." |
| | "Top source" | "Source contributing the largest number of resume uploads in the displayed results." (fallback "No uploads") |
| | "Active days" | "Distinct calendar days containing at least one resume upload." |
| Time To Fill | "Average stage time" | "Simple average of the reported average duration across displayed hiring stages." |
| | "Candidate stage entries" | "Total candidate-stage records across displayed stages. A candidate may appear in more than one stage." |
| | "Fastest stage" | "Displayed hiring stage with the lowest average elapsed time from job creation." (fallback "No stage data") |
| | "Average time to join" | "Average elapsed time from job creation until candidates reached Joined." (fallback "No joined data") |
| Trending Recruitments | "Matching customers" | "Customers returned by the selected date range and current search." |
| | "Open jobs" | "Open jobs belonging to the customer rows currently displayed." |
| | "Candidates" | "Candidates associated with the customer rows currently displayed." |
| | "Joined" | "Candidates who joined, divided by candidates across the displayed customers." |

Charts:

| Tab | Chart | Caption / series |
|---|---|---|
| Jobs Summary | "Hiring funnel" | "Candidate movement …"; series Candidates, Shortlisted, Interviewed, Offered, Joined |
| Jobs Summary | "Job status mix" | "Status distribution …" |
| Users Summary | "User performance" | "Top users among the …" |
| Vendors Summary | "Vendor performance" | "Top vendors among the …" |
| Resume Upload | "Upload trend" | "Daily upload activity for the five highest-volume sources."; "Upload activity: …"; axis "Resumes" |
| Resume Upload | "Source mix" | "Contribution of each source to total resume uploads." |
| Time To Fill | "Time to stage" | "Average elapsed days and candidate volume at each stage."; axis "Average days" |
| Trending Recruitments | "Recruitment activity" | "Most active customers among the …" |

Detail tables:

| Tab | Table title / caption | Column | Column definition |
|---|---|---|---|
| Jobs Summary | "Job-by-job performance" - "Compare candidate volume and hiring outcomes for every displayed job." | Job | "Job title and the unique job code used throughout CVViZ." (fallbacks "Untitled job", "No job code") |
| | | "Status" | "Current lifecycle status of the job." (value "In progress" seen) |
| | | "Customer" | "Customer or employer associated with the job." (fallback "Direct employer") |
| | | "Department" | "Department responsible for the job." (fallback "Not assigned") |
| | | "Candidates" | "Candidates associated with this job in the selected date range." |
| | | "Shortlisted" | "Candidates currently in the shortlisted stage." |
| | | "Interviewed" | "Candidates currently in the interviewed stage." |
| | | "Offered" | "Candidates currently in the offered stage." |
| | | "Joined" | "Candidates who reached the joined stage." |
| Users Summary | "User performance details" - "Compare workload and candidate outcomes for every displayed user." | User | "User name and account email address." (fallback "Unknown user") |
| | | Role | "Role assigned to this user in CVViZ." (value "Recruiter" seen) |
| | | "Jobs assigned" | "Jobs assigned to this user." |
| | | "Candidates handled" | "Candidates handled by this user." |
| | | "Shortlisted" | "Candidates shortlisted by this user." |
| | | "Interviewed" | "Candidates interviewed by this user." |
| | | "Offered" | "Candidates offered through this user." |
| | | "Joined" | "Candidates who joined through this user." |
| Vendors Summary | "Vendor contribution details" - "Compare candidate supply and hiring outcomes for every displayed vendor." | "Vendor" | "Vendor name and account email address." (fallback "Unnamed vendor") |
| | | Jobs | "Jobs shared with this vendor." |
| | | "Candidates received" | "Candidates supplied by this vendor." |
| | | "Shortlisted" | "Vendor candidates shortlisted." |
| | | "Interviewed" | "Vendor candidates interviewed." |
| | | "Offered" | "Vendor candidates offered." |
| | | "Joined" | "Vendor candidates who joined." |
| Resume Upload | "Resume source details" - "Review upload volume and active days for every displayed source." | "Source" | "Channel through which resumes entered CVViZ." |
| | | "Uploaded resumes" | "Resumes uploaded through this source in the selected date range." |
| | | "Active days" | "Distinct days with at least one upload from this source." |
| Time To Fill | "Stage timing details" - "Review candidate volume and average elapsed time for each hiring stage." | Stage | "Hiring stage reached by candidates." |
| | | "Candidates reaching stage" | "Candidates who reached this stage in the selected date range." |
| | | "Average days from job creation" | "Average elapsed calendar days from job creation until candidates reached this stage." |
| Trending Recruitments | "Customer recruitment details" - "Compare job demand, candidate activity, and hires for every displayed customer." | "Customer" | "Customer or direct employer represented by this row." |
| | | Jobs | "Total jobs associated with this customer." |
| | | "Open jobs" | "Jobs currently open for this customer." |
| | | "Closed jobs" | "Jobs currently closed for this customer." |
| | | "Candidates" | "Candidates associated with this customer." |
| | | "Joined" | "Candidates who joined this customer." |

API path seen: `/reports`. Page titles registered: "Users Summary Report", "Vendors Summary Report", "Jobs Summary Report", "Resume Upload Report", "Time to Fil Report" (spelling as in source), "Trending Recruitment Report".

### 12. Job analytics (per-job report)

- Route: `/jobs/:jobid/reports` (menu name "Job Reports").
- Purpose: "Hiring analytics" - "Activity for this job in the selected date range."
- Controls: "Date range presets", "Refresh".

| Block | Caption | Notes |
|---|---|---|
| "Hiring funnel" | "Hiring funnel. …" | Series Candidates, Shortlisted, Interviewed, Offered, Joined; empty "No candidate activity in this range" / "No candidates in this range" |
| "Average days to join" | - | Empty "No joined candidates in this range", "Timing data unavailable" |
| "Source mix" | - | Empty "No source activity in this range" |
| "Resume upload trend" | "Daily uploads for the five highest-volume sources." | Axis "Resumes"; empty "No upload timeline in this range" |
| "Time to stage" | "Average elapsed days and candidate volume at every reached stage." | Axis "Average days"; empty "No stage activity in this range" |
| Table "Resume upload sources" | "Detailed source totals for the selected range." | Columns "Source", "Uploaded resumes", "Active days"; empty "No uploads in this range" |
| Table "Time-to-stage details" | "Candidate volume and average elapsed time by stage." | - |

Source names: "Upload", "Career page", "Vendor", "Referral", "People Search", "General career page", "Customer API", "Unknown". Errors: "A job is required to load analytics.", "Report data is unavailable. Please retry.", "The job report could not be loaded.", "We couldn't load the job report".

### 13. Reports & insights (report workspace, newer version)

- Route: `/reports-v2` (menu name "Reports V2").
- Purpose: a library of configurable recruiting reports with saved configurations, sharing, exports and email delivery.
- Header: "Reports & insights"; actions "Create report", "Refresh report" / "Refresh reports", "Resume report".
- Navigation ("Report navigation"): "Overview", "Report library", "My reports", "Exports".
- APIs: `/api/reports/workspace` with sub-paths `/catalog`, `/runs`, `/definitions`, `/schedule`, `/preference`, `/regenerate`, `/exports`, `/download`, `/profile`; link target `/candidates`.
- Global notes: "Report timezone: …" (zones seen: "Asia/Kolkata", "Europe/London"), "Outcomes use recorded stage history. Job closure does not establish that a candidate joined.", "Missing history is disclosed. Sharing a configuration never grants access to its underlying data."
- Errors: "Reporting service unavailable", "The reporting service returned an unexpected response.", "Report could not be loaded", "Could not load this report. Please try again."

Report catalogue ("Report library" - "Start with the hiring question you need to answer."; search "Find a report"; empty "No reports match your search."):

| Report | Description |
|---|---|
| "Hiring overview" | Landing overview (see blocks below) |
| "Applications added" | "Explore applications added during the selected dates and their recorded outcomes." |
| "Current pipeline" | "All currently open applications, including applications added before this period." |
| "Recruiting activity" | "Recorded events during a period, including events on older applications." |
| "Hiring progress" | "Review applications and hiring outcomes for each job." |
| "Candidate sources" | "See where applications come from, then explore interview and joining outcomes." |
| "Pipeline bottlenecks" | "Find candidates waiting longest and open their applications to follow up." |
| "Custom recruiting report" | User-built report |

Overview blocks:

| Block | Text |
|---|---|
| Headline cards | "Distinct applications", "Recorded interviews", "Recorded joins", "Median time to join", "Timing samples", "Within …" (outcome window) |
| "Application momentum" | "Applications added on the dates shown"; "Time interval": "Automatic", "Weekly", "Monthly"; "Application counts by date"; legend "Blue: selected period"; "Previous:" |
| "Worth a closer look" | "Evidence you can inspect and act on"; "Overdue applications in this cohort" / "No overdue applications in this cohort"; "Within this application cohort. Review the current pipeline to include all older active applications."; actions "Review applications", "Review the full pipeline", "Review current pipeline" |
| "Compare source quality" | "Eligible samples are available. Compare role mix before changing sourcing priorities."; action "Compare sources"; otherwise "Source recommendations need at least 20 eligible applications with recorded history in a group. Volume and recorded outcomes remain available below." |
| "Recorded hiring milestones" | "Independent milestones within …"; "Share of applications, not sequential pass-through. Skipped stages are not inferred."; link "Full report" |
| "Candidates waiting longest" | "Up to 5 applications, ordered by time in their current stage."; "View all waiting applications"; error "Could not load waiting applications." |
| "Recent recruiting activity" | Recent recorded events |

Measures and columns (labels as shown in results and exports):

| Measure / column | Definition text where given |
|---|---|
| "Applications" / "Applications added in period" | "Applications added on the dates shown" |
| "Interviewed", "Joined" | Recorded outcomes |
| "Mature applications" / "Eligible applications" / "Eligible applications (denominator)" | "Conversion rates and joining times use applications that have had this much time to progress." |
| "Interviewed (complete windows)" / "Interviews in eligible applications" / "Eligible recorded interviews (numerator)" | "Only elapsed windows and joins inside the …" (window) |
| "Joined (complete windows)" / "Joins in eligible applications" / "Eligible recorded joins (numerator)" | Same window rule |
| "Interview conversion (%)", "Join conversion (%)" | "Applications used in conversion"; "Applications and interview conversion within …" |
| "Median time to join (days)", "Days to join", "Timing sample" | "Uses lifetime recorded joins with a reliable application start date."; "From application start" |
| "Missing stage history" / "Applications missing stage history" | "Stage history is missing for …"; "Based on recorded stage history" |
| "Unknown current stage age" / "Unknown stage age" | "Waiting time is unknown for …"; "Unknown waiting time" |
| "Current stage age (days)" / "Stage age" | "Time spent in the current stage" |
| "Recorded offers" | - |
| "Recorded stage updates" / "Applications with recorded stage updates" / "Stage updates in period" | "Stage updates recorded during the selected dates" |
| "Overdue up to 30 days", "Overdue 31 to 60 days", "Overdue over 60 days" | Ageing bands; threshold label "Waiting over …" |
| "Job age (days)" / "Job age" | - |
| "Time to closure" | "Days from job creation to closure" |
| "Observation days" | - |
| "Open applications" | "Currently open applications on open jobs, across all application start dates." |
| "Applications on these jobs" | "Lifetime applications on the selected jobs. Jobs with no matching applications remain visible." |
| "Jobs without applicants …" | "Showing jobs without matching applicants. Exports include all …"; toggle "Show all jobs" |
| "Events recorded" | Recruiting activity count |
| "Recorded milestone", "Share of cohort" | "Independent recorded events. Earlier stages are not inferred from later outcomes." |
| Source channel values | "In-app", "Career page", "People search", "Unassigned", "Not recorded", "Unknown" |

Report filters ("Report filters" - "Filters apply to every chart, table, drilldown and export."):

| Filter | Options |
|---|---|
| "Date range preset" | "Last 7 days", "Last 30 days", "Last 90 days", "This month", "Last month", "Latest completed outcome month", "Fixed dates" |
| "Report date range" | Date pair; "Choose a completed month"; snapshot notes "Each run uses a fresh current snapshot." / "Dates stay fixed." |
| "Job status" | Includes "Closed" |
| "More filters" | "Departments", "Uploaders", "Vendors", "Hiring managers", "Current stages", "Job locations", "Sources" (inferred from "Source" column) |
| "Only vendor submissions" | Switch; badge "Vendor submissions only" |
| "Timezone" | Zone select |
| Actions | "Filters", "Clear filters", "Review filters", "View last 90 days", "View application volume" |

Dialog "Customize report" ("Customize" - "Choose what this report shows. Changes take effect when you apply them."):

| Label | Control type | Options | Hint |
|---|---|---|---|
| "Report on" | Select | Applications added / Current pipeline / Recruiting activity / Hiring progress (inferred from catalogue) | - |
| "Measure" | Select ("Source report measure") | Measures from the table above | - |
| "Group by" | Select | "Job status", Source, Department, "Hiring manager", Current stage (inferred from columns) | - |
| "Second breakdown" | Select | Same dimension list | - |
| "Comparison bars" | Switch | "Compare with previous period" | Legend "Selected result" / "Previous period" / "Selected cohort" |
| "Hiring milestones" | Switch | "Independent hiring milestones" | - |
| "Count outcomes within" | Select (window) | Day windows | "Conversion rates and joining times use applications that have had this much time to progress." |
| "Show applications waiting longer than" | Number (days) | - | Empty "No applications waiting over …" |
| "Result presentation" | Select | "Chart + table" and others | "Chart shows …" |

Results area ("Report results", "Detailed results", "Milestone details", "Result context"):

| Element | Text |
|---|---|
| Search | "Search result groups", "Find a job or hiring manager", "Find a result group"; "No groups match your search. Clear the search to see all results." |
| Column picker "Table columns" | "Columns", "Apply columns", "Required metric and sample columns stay visible." |
| Drill-in hints | "Open a group to inspect the applications behind this measure." / "Open a group to view the applications used in its conversion rate." / "Open a group to inspect the recorded joins used in its timing sample." / "Open a milestone to inspect its recorded applications." |
| Badges | "Small sample", "Not yet eligible", "Median", "Based on …", "Recorded within …" |
| Empty | "No applications match this report" - "Try a wider date range or review the report filters."; "No vendor applications in this period"; "No matching applications on these jobs"; "No jobs match these filters" - "Review job status, department, or hiring-manager filters to broaden the job inventory."; "Review job and application filters to broaden the current pipeline." |
| Not-ready states | "Outcomes are still developing" - "These applications have not completed the …"; "Time to join is not available yet" - "A recorded join and a reliable application start date are needed to calculate time to join."; "The source and group counts are available in the table." |
| Help | "How metrics are calculated", "All reporting definitions", "Got it" |

Drill-down "Applications to inspect" ("Inspect the applications in this snapshot. Current stage and recorded outcomes describe different things."):

| Element | Text |
|---|---|
| Columns | "Application ID", "Candidate", job, "Source", "Department", "Current stage", "Stage age", "Stage entered", "Last stage update", "Stage history present", "Recorded interview", "Recorded join" |
| Sort "Application sort" | "Default order", "Longest stage wait first", "Newest application first" |
| Search | "Search applications" - placeholder "Search name, job, or source" |
| Row actions | "View applications", "Open job candidates …", "Open job …" |
| Cell fallbacks | "No recorded event", "History unavailable", "Recorded stage entry", "Waiting" |

Dialog "Save report" / "Update saved report":

| Label | Control type | Options | Hint |
|---|---|---|---|
| "Report name" | Text | - | - |
| "Description" | Text area | - | - |
| Save mode | Radio | "Update existing", "Save as new report" | - |
| Sharing | Radio | "Private", "Share with my organization", "Share with selected users" | "Private unless you choose users"; visibility values "Organization", "Selected users", "Private", "Shared with you" |
| Buttons | "Save report", "Save changes", "Save as", "Cancel" | | Success "Report saved."; state "Unsaved changes", "Saved report", "Unchanged", "Updated …" |

Dialog "Export report":

| Label | Control type | Options | Hint |
|---|---|---|---|
| "File format" / "Download format" | Radio | "Excel (.xlsx)" ("Download Excel"), "Download CSV" | - |
| "Contents" | Checkbox group | "Summary", "Milestones", "Grouped results", "All matching applications" | - |
| "Included columns" | List | Current columns | - |
| Other | Button | "Print report or save as PDF" | - |
| Result | - | - | "Downloaded …"; error "Could not download this report." |

Delivery tab ("Delivery" - "Email delivery for …"):

| Label | Control type | Options | Hint |
|---|---|---|---|
| "Email this report to me" | Switch | on / "Not active" | "Delivery uses the saved configuration" - "Save your report changes to include the edits in this tab in future deliveries." |
| "Delivery frequency" | Select | "Daily at 9:00 AM", "Monday at 9:00 AM" (weekly), monthly (inferred from "Monthly") | "Time zone: …"; "Next email: …" |
| Button | "Save delivery settings" | | Success "Report delivery updated." |

"My reports" ("Pinned and recently opened reports appear first. Every run uses your current data permissions."):

| Element | Text |
|---|---|
| Tabs | "All reports", "Shared", "Favorites" |
| Row info | "Current snapshot", "Next email: …", visibility badge |
| Row actions | "Duplicate …", "Archive …", pin |
| Archive confirm | "Archive this saved report?" - "Its configuration will disappear from saved reports." |
| Empty | "No pinned reports yet. Pin a report from All to find it here."; "No reports have been shared with you."; "Save a report to reuse its filters, dates and columns." |
| Links | "View all saved reports", "Browse report library" |

"Exports" ("Download the exact snapshot while it is available, or regenerate a new result with current data and permissions."):

| Column | Notes |
|---|---|
| "Report" | - |
| "Contents" | "Summary" etc. |
| "Created" | - |
| "Available until" | - |
| "Status" | Includes "Expired" |
| Actions | "Download", "Regenerate" (confirm "Regenerate with current data?") |

Empty: "No exports yet. Open a report to download its results." + "Browse reports".

### 14. Tasks

- Routes: `/tasks`, `/tasks/today` (page title "Today's Tasks - CVViZ"), `/tasks/all` (page title "All Tasks - CVViZ").
- Purpose: list, filter and complete follow-up tasks.

| Control | Options / text |
|---|---|
| "Task scope" | "My tasks" ("Your tasks") / "All tasks" ("Tasks you can access") |
| Scope note | "Showing tasks assigned to you and your unassigned private tasks." / "Showing tasks you have permission to access, including your private tasks." |
| "Task status" chips | Open (per live observation), "Overdue", "Due today", "Upcoming", "Completed", "All statuses" |
| Search | "Search tasks"; placeholder "Search tasks or team members" |
| "Filters" | Assignee: "All assignees", "Unassigned", named users; "Visibility": "All visibility", "Private", team-visible; "Clear filters" |
| "Sort tasks" | "Due date first", "Newest first", "Oldest first" |
| Buttons | "Create task", "Refresh tasks" |

Table columns:

| Column | Notes |
|---|---|
| "Completion" | Toggle "Mark complete" / "Reopen task"; disabled hint "Only the creator or assignee can change completion" |
| Task | Description; fallback "Untitled task" |
| "Created by" | - |
| "Assigned to" | "Assigned to …" or "Unassigned" |
| "Due date" | Format `D MMM YYYY`; relative words "Tomorrow"; "No due date" |
| "Actions" ("Actions for …") | "View task", "Edit task", "Complete" / "Reopen", "Delete task" |

Messages: "Task completed", "Task reopened", "Task deleted", "Task could not be updated", "Loading tasks", "Please try again to see your latest tasks." + "Try again".

Delete confirm: "Delete this task?" - "This permanently removes the task from your workspace." Buttons "Delete task" / "Keep task".

Empty states: "No tasks in this view" - "Try another status or adjust your search and filters." + "Show all tasks"; "No tasks yet" - "Tasks assigned to you will appear here. Create one to plan your next step." / "Create a task to organize work and follow up with your team."

### 15. Task dialog (create / edit / view)

- Titles: "Create task", "Edit task", "Task details"; status tag "Open task" / "Completed task".
- Intro: "Describe the next step, choose an owner, and set a due date."

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| "Task description" | Rich text editor (toolbar: Italic, Underline, Strikethrough, Block quote, Insert link, Clear formatting, Numbered list, Bulleted list, Decrease indent, Increase indent) | - | Placeholder "What needs to be done?" / "Type here..."; "Enter a task description."; "The task description is too long. Please shorten it." |
| "Assigned to" | Select of team members | "Unassigned", users, "Current assignee" | "Unable to load team members" |
| "Due date & time" | Date-time picker (`D MMM YYYY, h:mm a`) | "No due date" | "Choose a valid due date."; "Choose a future due date and time, or leave the due date empty." |
| "Visibility" ("Task visibility") | Radio / select | Team: "Visible to team members with permission."; "Private": "Visible to you and the person assigned." | - |
| Read-only info | - | "Created by", "Created", "Due date", "Not available" | "Only the task creator can edit its details." |

Buttons: "Create task", "Save changes", "Cancel". Messages: "Task created", "Task updated", "Unable to save task", "Loading task editor". Unsaved-changes confirm: "Discard unsaved changes?" - "Your task changes have not been saved." Buttons "Discard changes" / "Keep editing".

Related (tasks created from the notes panel on a job or candidate, shared component): "Assign to user", "Assign to myself", "Add due date" / "Change due date", "Due date must be in the future", "Make visible to the team" / "Mark as private", "Private task", "Task created by …", "Task assigned to me", "Task assigned to …", "Unable to assign this task. Please refresh and try again."

### 16. Calendar

- Route: `/calendar` (page title "Calendar - CVViZ").
- Purpose: "Manage your events, interviews, and team availability."
- Tabs ("Calendar navigation"): "Calendar", "Scheduling links", "Calendar setup".

| Element | Text |
|---|---|
| Header actions | "Schedule interview", "New event", "Manage connection", "Refresh events" |
| View controls | "Calendar view", "Previous …", next, "Jump to date"; month title format `MMMM YYYY` |
| Event list | "Calendar events"; note "Times are shown in your local timezone. Select an event to view details" |
| Event badges | "Cancelled", "Tentative", "All day", "Untitled event", "Time unavailable" |
| Empty | "No events this month" - "Choose another month or create an event to add to your calendar." |
| Loading / errors | "Loading calendar", "Calendar service is unreachable right now. Please try again in a moment.", "Try refreshing this date range.", "Try again" |
| Guard messages | "Connect and activate a calendar first.", "Choose a future time to create an event." |

Connect panel ("Connect a calendar" - "Keep interviews, panel availability, and booking links in one schedule."):

| Provider | Sub-text | Action |
|---|---|---|
| "Google Calendar" | "Google Workspace and Gmail accounts" | "Connect" / "Unavailable" |
| "Outlook Calendar" | "Microsoft 365 and Outlook.com accounts" | "Connect" / "Unavailable" |

Benefits listed: "Events and interviews in one calendar", "Panel availability before scheduling", "Candidate booking links". Plan gate: "Open billing" (link to `/settings/billing`); integration settings also carry "Calendar Integration is not included in your plan." API paths seen: `/calendar`, `/calendar/links`, `/settings/billing`.

"Calendar setup" tab content beyond the connect panel was not found in the extracted strings; related integration-settings texts: "Use this calendar as the active one for events", "Default calendar", "Select calendar", "We couldn't load this account's calendars", "No calendars were found for this account", "Reconnect the calendar or try another account with an active mailbox." OAuth return page: "Please wait while the server completes the secure setup.", "No authorization code received."

### 17. Event dialog (new / edit / details)

- Titles: "New event", "Edit event", "Event details". Context line "Adding to …" / "Editing in …" (calendar name).

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| "Event title" | Text | - | "Enter an event title."; "Use 500 characters or fewer."; placeholder "Add a title" (inferred) |
| "Date & time" | Start / end date-time (`D MMM YYYY, h:mm a`) | - | "Choose a start and end time."; "End time must be after start time."; "Choose a start time in the future."; "Timezone: …"; "All-day dates are preserved. Change the dates in your calendar provider." |
| "Attendees" (section "Guests & location") | Tag input with team search | Team members or typed emails | Placeholder "Search team or enter email addresses"; "Enter an email and press Enter. You can also select a team member."; "Enter a valid email for …"; "Add up to 100 attendees." |
| "Location" | Text | - | Placeholder "Office, meeting room, or address" |
| "Online meeting" | Switch | "Microsoft Teams meeting" / "Google Meet meeting" | "Add a video meeting link to this event." |
| "Description" ("Event description") | Text area | - | Placeholder "Agenda or details for attendees"; "Shorten the description to 20,000 characters or fewer." |

Detail view: "Date & time", "Location", "Online meeting" + "Join meeting", "Attendees …" with response status "Accepted" / "Declined" / "Tentative" / "Awaiting response", "No attendees added.", "Description", status "Cancelled".

Buttons: "Create event", "Save changes", "Cancel", "Edit event", "Delete event". Error: "Your changes are still here. Try again."; "Connect a calendar first".

Confirms: "Discard event changes?" - "Your unsaved changes will be lost." ("Discard changes" / "Keep editing"); "Delete this event?" - "This removes the event from your connected calendar." ("Delete event" / "Keep event").

### 18. Schedule interview dialog

- Title: "Schedule interview". Header info: "Booking on …" (calendar), "Calendar timezone: …".
- Gate: "Connect a calendar to schedule" - "Link Google or Outlook, then mark one calendar as active." + "Open integrations" (`/settings/integrations`). Read-only preview: "You can review the setup, but creating invites and booking links is disabled."

| Section | Label | Control type | Options | Validation / hint |
|---|---|---|---|---|
| "Scheduling method" - "Pick a time now or share slots." | Method | Radio cards | "Book directly" ("Pick a slot and send the invite."), "Booking link" ("Let the candidate choose.") | - |
| "Participants" - "Interviewers and candidate details." | "Panelists" | Tag input | Team members or any work email | "Internal interviewers/colleagues whose calendar availability we'll check. Pick from your team or type any work email."; "Add at least one panelist"; placeholder "Start typing a name or email"; "Enter a valid email for …" |
| | "Candidate email (optional)" | Email | - | "Used only when you email a booking link to the candidate."; "Enter a valid email address" |
| | "Candidate name (optional)" | Text | - | Placeholder "Jane Doe" |
| "Booking link settings" - "Candidate-facing availability window." | "Duration" | Select | Minutes | - |
| | "Look in" | Select | "Next 3 days", "Next 5 days", "Next 7 days", "Next 14 days" | "We will find available slots in …" |
| "Find a time" - "Selected slot and availability." | Slot search | Button + slot list | "Find available slots", "Select …", "Change time" | "Search availability in your timezone."; "Slots are shown in …"; "Times in …"; "Checking availability...", "Checking panelist availability...", "Searching" |
| "Event details" - "Invite title, conferencing, and context." | "Event title" | Text | - | Placeholder "Interview with Jane Doe" / "Add a title"; default "Interview with …" |
| | Conferencing | Switch | "Add Microsoft Teams" / "Add Google Meet" | - |
| | "Description (optional)" | Text area | - | Placeholder "Agenda or context for attendees" |

Slot states: "No slots searched yet" - "Add panelists, confirm the duration, then search availability."; "No matching slots found" - "Try a wider search window, shorter duration, or fewer panelists."

Actions:

| Button | Hint / result |
|---|---|
| "Book selected slot" (disabled label "Select a slot") | "Create the calendar event and send invites to panelists."; guard "Select a time slot before booking the interview." |
| "Email link to candidate" | "The booking link will be emailed to …"; result "Invite sent to candidate" - "We've emailed the booking link to the candidate. You can also copy it below to share another way." |
| "Get booking link" | "Create available slots in the background, then copy and share the link."; result "Booking link ready" - "Share this URL with the candidate. They'll pick a slot and the event will be created automatically."; "Booking link copied to clipboard." |
| "Cancel" | - |

Guards: "Connect and activate a calendar before creating a booking link.", "Connect and activate a calendar before finding slots."

### 19. Scheduling links (list)

- Route: `/calendar/links` (page title "Scheduling Links - CVViZ").
- Purpose: "Create reusable booking pages that show live calendar availability." / "Share your availability and let candidates book a time."

| Element | Text |
|---|---|
| Header | "Scheduling links"; buttons "New link" / "Create scheduling link", "Refresh links" ("Refresh scheduling links") |
| Counters | "Active links", "Paused", "Active …", "Paused …", "Showing …" |
| Search | "Search links" / "Search scheduling links" |
| Sort ("Sort scheduling links") | "Recently updated", "Newest first", "Title A-Z" |
| Card content | Title ("Untitled scheduling link"), "Reusable booking page", duration, working days ("Mon-Fri" / "Every day"), "No notice", "No date limit", "Panelists", provider "Google" / "Outlook", "Video meeting included" / "No video meeting" |
| Card actions ("More actions for …") | "Copy link", "Open public page" ("Open booking page for …"), edit, "Pause link" ("Pause …"), "Activate link" ("Activate …"), "Archive link" |
| Messages | "Scheduling link copied.", "Could not copy the link." |
| Archive confirm | "Archive scheduling link?" - "People with this URL will no longer be able to book from this link." Button "Archive" |
| Empty (first use) | "Create your first scheduling link" - "Share one reusable booking page with candidates or contacts. CVViZ checks your connected calendar and only shows available time slots." |
| Empty (list) | "No scheduling links yet"; "No scheduling links match your search" |
| No calendar | "Connect a calendar before creating scheduling links" - "Scheduling links use your active Google or Outlook calendar to compute live availability."; "Connect and activate Google or Outlook Calendar first."; button "Connect calendar" (`/settings/integrations`) |

Plan gate (preview mode): "Preview" / "Preview only"; "This preview shows how reusable booking pages work. Upgrade to create live links, use panel availability, and share booking pages with candidates."; "Upgrade your plan to create scheduling links."; "Upgrade to copy live scheduling links."; "Upgrade to edit links."; "Open billing". Sample cards in preview: "Reusable booking page for candidate introductions", "Share this with shortlisted candidates after evaluation".

### 20. Scheduling link editor (new / edit)

- Titles: "New scheduling link", "Edit scheduling link". Steps with captions; side panel "Public page preview" - "Updates as you configure the link".

| Step | Label | Control type | Options | Validation / hint |
|---|---|---|---|---|
| "Basics" - "Name and describe the booking page." | "Link title" | Text | - | "This is the title candidates see on the public booking page."; "Add a title" |
| | "URL slug" | Text | - | "Optional. CVViZ still uses the secure token in the public URL."; "Public URL will appear after save." |
| | "Description" | Text area | - | "Share context candidates should see before booking."; "Keep this short and candidate-facing. It appears on the public booking page." |
| | "Set as my Meeting Scheduling Link in Profile Settings" | Checkbox | - | - |
| "Availability" - "Control how far ahead and how soon candidates can book." | "Duration" | Select | Minutes | "Length of each booked meeting." |
| | "Minimum notice" | Select | Includes "No notice" | "Prevents last-minute bookings by requiring this much notice." |
| | "Booking window" | Radio | "Limited", "No limit" | "Limit how far ahead candidates can book, or let them browse future availability in rolling windows." |
| | "Look ahead" | Number (days) | - | "How many days into the future candidates can see available slots."; no-limit note "Candidates can keep browsing future availability. The booking page loads dates in rolling windows so it stays fast." |
| | "Booking guardrails": "Buffer before" | Select | Minutes | "Time kept free before each booking."; group hint "Buffers keep breathing room around meetings. Daily limits are optional." |
| | "Buffer after" | Select | Minutes | "Time kept free after each booking." |
| | "Daily limit" | Number | - | "Optional cap for how many meetings this link can create per day." |
| "Working hours" - "Choose the calendar hours used to generate available slots." | Days and hours | Day toggles + time range | Presets "Mon-Fri", "Every day" | "Candidates will only see slots inside these days and hours."; "These hours apply only to this link and do not change your global calendar settings."; "Select at least one working day." |
| | "Time zone" | Select | America/Chicago, America/Denver, Europe/London, Europe/Berlin, Asia/Kolkata, Asia/Singapore, Asia/Tokyo, Australia/Sydney | - |
| Panel step - "Add optional team members and meeting preferences." | "Additional panelists" | Tag input | Teammates or typed email | "Optional colleagues whose calendars should also be checked before showing available slots."; placeholder "Search teammate or type email"; "Leave this empty when only your connected calendar should be checked." |
| | "Add video meeting to bookings" | Switch | - | "When enabled, each booked event includes a calendar video meeting when the provider supports it." |
| "Review" - "Confirm the public booking page before sharing it." | "Review before creating" | Read-only summary | "Booking rules", "Calendar" ("Only the connected calendar" or with panelists), "Video meeting" ("Included" / "Not included") | - |

Buttons: "Create link", "Save link", "Cancel".

### 21. Public booking page (candidate-facing)

- Routes: `/book/:token` and `/book/:token/confirmed`.
- Purpose: lets an invited person pick an interview slot from a scheduling link without signing in.

| Element | Text |
|---|---|
| Titles | "Book a meeting", "Interview", "Interview invitation", "Scheduling link", "Video meeting included" |
| Loading | "Checking availability" - "Preparing the booking calendar for your timezone." |
| Calendar | "Select a Date & Time", "Previous month", "Next month", month title `MMMM YYYY` |
| "Display timezone" | America/Denver, America/Chicago, America/Toronto, Europe/London, Europe/Paris, Europe/Berlin, Europe/Moscow, Africa/Cairo, Asia/Dubai, Asia/Karachi, Asia/Kolkata, Asia/Singapore, Asia/Tokyo, Asia/Shanghai, Australia/Sydney, Pacific/Auckland; "Times shown in …" |
| Slot empty states | "No times available"; "No dates in this month" - "Use the month arrows to browse other available dates."; "No matching times are available in the next …"; "No matching times are available right now. Try another day or contact the recruiter."; "The recruiter hasn't suggested any slots. Please reply to the email you received."; "Look further ahead" |

| Label | Control type | Validation / hint |
|---|---|---|
| "Your name" | Text | "Tell us your name"; placeholder "Jane Doe" |
| "Your email" | Email | "We need your email to send the invite"; "That doesn't look like a valid email" |
| "Confirm booking" | Button | "Select a time to continue."; "Pick a time slot first." |

Errors: "Missing booking token in the URL.", "We couldn't load this booking link. It may be invalid or expired.", "Could not load available times for this scheduling link.", "Could not load more available times for this scheduling link.", "Could not confirm the booking. Try a different slot."

Unavailable states: "Booking unavailable"; "This time has already been booked" - "If you need to reschedule, please reply to the email you received."; "This booking has been cancelled" - "Please reach out to the recruiter for an alternative."

Confirmation page: "Check your inbox for the invite". Footer on public layouts: "Powered by" + product name.

### 22. Notifications

- Routes: `/notifications`, `/notifications/all`.
- Purpose: full history of in-app notifications with read / unread handling.

| Element | Text |
|---|---|
| Left menu "Categories" | "All Notifications", "Resumes & Candidates" ("Resumes/Candidates"), "Job Notifications", "Email Notifications", "Events" |
| Read filter ("Filter notifications by read status") | All, Read, "Unread" |
| Bulk action | "Mark All As Read" ("Mark all notifications as read") |
| Row | "Received …"; date groups "This week" etc. |
| Row links | "View Email", "View Candidate", "View Job", "View Files" |
| Row toggle | "Mark as read" / "Mark as unread" ("Mark Read" / "Mark Unread") |
| Messages | "All notifications marked as read!", "Could not mark notifications as read. Please try again.", "Marked as …", "Could not update this notification. Please try again." |
| Loading / error | "Loading notifications"; "Couldn't load notifications" - "There was a problem fetching your notifications. Check your connection and try again." + "Try again" |
| Empty (unread) | "You're all caught up!" - "No unread notifications right now. Check back later." |
| Empty (read) | "No read notifications yet" - "Notifications you've read will appear here." |
| Empty (all) | "No notifications found" - "You don't have any notifications yet." |

### 23. Global shell (signed-in layout)

- Purpose: frame around every signed-in page: navigation, quick add, quick access, help, notifications and user menu.
- API / link paths seen: `/companies`, `/settings/billing`, `/api/integration/featurebase/jwt`, `/notifications`, `/jobs/new`, `/customers/add`, `/calendar`, `/tasks`, `/settings`, `/settings/profile`, `/help`, `/onboarding`.

| Area | Items |
|---|---|
| Logo | "CVViZ home" |
| Main navigation (labels in layout bundle) | "Candidates", "Companies", "Campaigns", "Reports", "Settings"; route catalogue adds "Dashboard", "Jobs & Resumes", "Candidate database", "AI Sourcing", "Ad Campaigns", "Email Campaigns", "Calendar", "Notifications", "Help Document" |
| Quick add menu | "Add Candidate" ("Candidate"), "Add Job", "Customer" (`/customers/add`), "Add User" |
| Quick add limits | "You have reached the resume limit"; "You have reached the user limit" |
| Shortcut icons | "Calendar" (`/calendar`), tasks (`/tasks`) |
| Help menu ("Help and feedback") | "Help & Support" ("CVViZ Help & Support"), "Share Feedback" ("CVViZ Feedback", feedback widget "Featurebase") |
| Notification bell | Tabs "Notification" and "Events" (inferred); "No new notifications", "No notifications", "You have viewed all notifications.", "You have viewed all events.", "Loading more", "Loaded", "Cleared …", "View All Notifications" / "Show All Notifications" |
| User menu | Role tag (e.g. "Recruiter"), "Upgrade", "Profile Settings", "Lock Screen", "Change Password", "Logout" |
| Credit banner | "Advanced parsing credits exhausted" - "Add credits or upgrade to keep richer, more accurate resume details available." Buttons "Add credits", "Dismiss advanced parsing credit notice" |
| Subscription badges (shared billing component) | "Trial ends in …", "Trial has ended", "Free plan active", "Expires in …", "Expired"; block page "Access Restricted!" - "It seems your subscription has expired. Please contact your admin." |
| Error boundary | "Something went wrong.", "Refresh page" / "Refresh this page", "Report this error" -> "Thank you for reporting this. Our team will look into this soon." |
| Exception pages | 403 "Sorry, you don't have access to this page"; 404 "Sorry, the page you visited does not exist"; 500 "Sorry, the server is reporting an error"; button "Back to home" |
| Customer permission messages | "You do not have permission to add customers. Ask your account administrator to update your role."; "You do not have permission to edit customers. Ask your account administrator to update your role."; "The company could not be saved. Your changes are still here." |

Lock Screen: only the menu item text is present; the lock overlay's own texts were not found in the extracted bundles.

### 24. Quick Access panel

- Purpose: pinned, frequent and recently visited records for fast navigation.

| Element | Text |
|---|---|
| Title | "Quick Access" |
| Search | "Search pinned & recent", "Clear search", "Recent searches", "No matches", "Filter: …" |
| Sections | "Pinned", "Frequent", "Recent" (grouped "Yesterday", "This week", "Earlier") |
| Item actions | "Open in new tab", "Pin to Quick Access", "Rename", "Copy link", "Remove", "Remove from recent", "Drag to reorder" |
| Suggestion | "You visit this often" + "Dismiss suggestion" |
| Messages | "Link copied", "Could not copy link", "Clipboard not available" |
| Empty | "Recently visited jobs, candidates, and companies will appear here."; "Star a recent item to pin it here for quick access."; "Pages you visit will appear here." |
| Keyboard | "Escape" closes (inferred); a "Keyboard shortcuts …" entry exists in the shared list display-options component |

### 25. Add a New Job chooser (from quick add)

- Route target: `/jobs/new`.
- Purpose: choose how to start a job posting.

| Option | Description |
|---|---|
| "Start from Blank" | "Create a new job by filling in the details yourself." |
| "Paste Job Details" | "Paste or type a job description you already have. We'll use it to fill out the form for you to review." |
| "Upload a Job File" | "Upload a job description file (.txt, .pdf, .doc, .docx, .rtf). We'll use it to fill out the form for you to review." |

| Sub-dialog | Label | Control type | Validation / hint |
|---|---|---|---|
| "Paste Job Description" | Description | Text area | "Paste the job description. We'll use it to fill in the job details, which you can review and complete next."; placeholder "Paste or type the full job description here..."; "Please enter a job description."; button "Analyze Job Description" |
| Upload | File | Drag-and-drop | "Click or drag a file here to upload"; "Choose a file with your job description (.txt, .pdf, .doc, .docx, .rtf)"; "Job description files must be 10 MB or smaller."; "We'll use your file to help fill in the job details. You can review and edit everything next. Maximum file size: 10 MB."; progress "Analyzing your job description file..." |

Messages: "Job details are ready! Please review and complete the form."; "File uploaded and job details are ready to review!"; "Sorry, we couldn't use that text to pre-fill the job details."; "We could not analyze that job description. Please check it and try again."; "We couldn't get job details from your file. Please try a different file."; "Oops! File upload did not work. Please try again."; "We could not read that file. Please check the file and try again."

Plan-limit dialogs:

| Title | Text (admin) | Text (non-admin) | Button |
|---|---|---|---|
| "Job limit reached" | "You have reached your active job limit. Upgrade your plan or buy a top-up to add more jobs." | "You have reached your active job limit. Please contact your account admin to upgrade or buy a top-up." | "Go to Billing" |
| "Resume limit reached" | "You have reached your resume limit. Upgrade your plan or buy a top-up before adding another job." | "You have reached the resume limit. Please contact your account admin." | "Go to Billing" |

### 26. Onboarding (account setup)

- Routes: `/onboarding` plus steps `/onboarding/company_profile`, `/onboarding/user_profile`, `/onboarding/add_roles`, `/onboarding/career_page`, `/onboarding/invite_team_members`, `/onboarding/integration`, `/onboarding/email_signature`, `/onboarding/jobs/new`, `/onboarding/jobs/:jobid/edit`, `/onboarding/jobs/:jobid/edit/share`.
- Purpose: "Account setup" - "Finish the essentials that make CVViZ ready for your hiring workflow."

| Step (route catalogue name) | Path |
|---|---|
| "Setup Company Profile" | `/onboarding/company_profile` |
| "Update User Profile" | `/onboarding/user_profile` |
| "Add Roles" | `/onboarding/add_roles` |
| "Setup Career Page" | `/onboarding/career_page` |
| "Invite Team Members" | `/onboarding/invite_team_members` |
| "Integrate with outlook (onboarding)" | `/onboarding/integration` |
| "Add Email Signature" | `/onboarding/email_signature` |
| "Add New Job" | `/onboarding/jobs/new` |

| Element | Text |
|---|---|
| Step card status | "Recommended setup step", "Ready to use", "Skipped", "Skipped for now" |
| Step card actions | "Watch guide", "Resume setup" |
| Page action | "Setup Later" |
| Completion | "All done!" - "Thank you for choosing our platform. We're excited to help you streamline your candidate management process!. Start using now..." + "Go to Dashboard" (`/dashboard`) |

Step card titles and descriptions shown on the start page were not found in the extracted strings.

### 27. Account layout (signed-out pages frame)

| Element | Text |
|---|---|
| Brand panel | "AI recruitment workspace"; "Make every hire your next advantage."; "Source, screen, and engage the right candidates from one focused workspace." |
| Bullets | "AI-powered candidate matching"; "ATS and recruitment CRM in one place"; "Automated workflows that save hiring time"; "Built for recruiting teams that value clarity and speed." |
| Footer links | "Privacy Policy" / "Privacy", "Support", "Feedback", "About CVViZ", "Copyright …" |
| Logo | "CVViZ home" |

### 28. Sign in

- Route: `/user/login`.
- Header: "Welcome back" / "Sign in to your workspace" - "Access your candidates, jobs, and hiring workflows."

| Label | Control type | Validation / hint |
|---|---|---|
| "Work email" | Email | "Enter your work email." |
| "Password" | Password | Placeholder "Enter your password"; "Enter your password."; "Caps Lock is on. Check your password before continuing." |
| "Sign in" | Button | Error summary "Please fix the following before signing in" / "Review the highlighted fields before continuing." |
| "Continue with SSO" | Button | "Microsoft sign in was cancelled or could not be completed." |
| "Forgot password?" | Link | `/user/forgot-password` |
| "New to CVViZ?" + "Create account" | Link | `/user/signup/free_trial` |

Session message: "Your previous session has ended. Please sign in again to continue." Legacy validation texts also present (unused fields, inferred): "Please enter username!", "Please enter password!", "Please enter mobile number!", "Wrong mobile number format!", "Please enter Captcha!".

### 29. Create account (free trial sign-up)

- Routes: `/user/signup`, `/user/signup/:id`, `/user/signup/free_trial`, `/user/free-trial`.
- Two steps: "Create your workspace" ("Workspace details") then "Secure your account" ("Secure your account and verify that you agree to the service terms."). Buttons "Continue", "Create account". Footer "Already have an account?" + "Sign in".

| Step | Label | Control type | Options | Validation / hint |
|---|---|---|---|---|
| 1 | "Full name" | Text | - | "Enter your full name."; "Enter your first and last name." |
| 1 | "Work email" | Email | - | "Please enter your email!"; "Please enter your work email address."; "The email address is in the wrong format!" |
| 1 | "Phone number (optional)" | Phone | - | - |
| 1 ("Company details") | "Company name" | Text | - | "Company name required"; "Please avoid using special characters in company name." |
| 1 | "Company type" | Select ("Select type") | Recruitment-agency option (reworded; source label names an agency-type company), "Employer" | "Company type required" |
| 1 | "Primary use case (optional)" | Select | Options not in strings | Placeholder "Select how you plan to use CVViZ" |
| 2 ("Security") | "Password" | Password | - | Placeholder "Create a strong password"; "Caps Lock is on. Check your password before continuing."; "Password requirements" list (see below) |
| 2 | "Confirm password" | Password | - | Placeholder "Re-enter password"; "Please confirm your password!"; "The passwords entered twice do not match!"; "Caps Lock is on. Password confirmation may not match." |
| 2 ("Verification") | "I agree to CVViZ's" "Terms of Service" and "Privacy Policy" | Checkbox | - | "Agree to Terms of Service and Privacy Policy." |
| 2 | CAPTCHA | Widget | - | "Please complete the captcha before creating your account."; "Complete the CAPTCHA verification before creating your account." |

Password requirements component (shared by sign-up, invitation and reset): "At least …" (minimum length), "No more than …" (maximum length), "Not a common or easy-to-guess password"; errors "Enter a password.", "Use at least …", "Use no more than …", "Choose a less common password that is difficult to guess."

Error summaries: "Please fix the following before continuing", "Please fix the following before creating your account", "Please complete all required fields", "Something went wrong".

Result panel after submit:

| Element | Text |
|---|---|
| Progress steps | "Workspace created" / "Account created", "Verify email", "Start free trial" |
| Title | "Check your inbox" |
| Body | "Your verification email should arrive within a few minutes. Open the link to begin your free trial, and check spam or promotions before requesting another email." |
| Info | "Your registered email"; link "Email address is wrong" |
| Actions | "Resend activation email" (cool-down "Resend available in …"), "Return to sign in" |
| Messages | "The activation email is on its way. Resending keeps your current activation link valid."; "Could not resend the activation email."; "Could not resend the activation email. Please try again shortly." |

### 30. Accept team invitation

- Routes: `/user/register`, `/user/register/:id`, `/user/invitation`.
- Header: "Team invitation" / "Join your team on CVViZ"; loading "Preparing your invitation"; workspace line "Joining workspace" (fallback "Your CVViZ team").

| Label | Control type | Validation / hint |
|---|---|---|
| "First name" | Text | "Enter your first name." |
| "Last name" | Text | "Enter your last name." |
| "Work email" | Email (prefilled, inferred read-only) | - |
| "Phone number (optional)" | Phone | - |
| "Password" (section "Set your password") | Password | Placeholder "Create a secure password"; password requirements list |
| "Confirm password" | Password | Placeholder "Re-enter password"; "Confirm your password."; "Passwords do not match." |
| "Accept invitation" | Button | Summary "Please fix the following before accepting your invitation" |

Errors: "Unable to accept this invitation."; "Unable to accept this invitation. Please request a new invitation."; "This invitation link is incomplete."; "This invitation is invalid, expired, or has already been used."; panel "Invitation unavailable" with "Request a new invitation", "Contact support", "Return to sign in". Success redirects to `/user/signup-result`.

### 31. Registration result

- Routes: `/user/signup-result`, `/user/register-result`.

| Variant (inferred) | Step captions | Title | Body | Action |
|---|---|---|---|---|
| Invitation accepted | "Invite accepted", "Account ready" | "Registration complete" / "Your account is ready" | "Your CVViZ account is ready. Sign in to start working with your candidates and jobs." | "Sign in" |
| Self sign-up | "Registration submitted", "Activation email sent", "Email verified" | "Check your inbox" | - | "Sign in" |

### 32. Account activation result

- Route: `/user/activate/:id`.

| State | Text |
|---|---|
| In progress | "Account activation" / "Activating your account" |
| Steps | "Activation link opened", "Email verified", "Sign in to workspace" |
| Success | "Activation complete" / "Your account is active" - "Your email has been verified and your workspace is ready to use." + "Continue to sign in" |
| Failure | "Activation issue" / "Account activation was not completed"; "This activation link could not be used."; "This activation link is invalid or has expired."; "This activation link is invalid or incomplete."; actions "Contact support", "Return to sign in" |

### 33. Forgot password

- Route: `/user/forgot-password`.
- Header: "Account recovery" / "Reset your password".

| Label | Control type | Validation / hint |
|---|---|---|
| Work email | Email | "We will send password reset instructions to this email address."; "Enter your work email."; "Enter a valid email address." |
| "Send reset link" | Button | Summary "Please fix the following before requesting reset instructions"; error "Unable to send reset instructions right now." |

Note: "Reset instructions are sent only to your registered work email." Footer: "Don't have an account?" + "Sign up" (`/user/signup/free_trial`).

### 34. Forgot password result

- Route: `/user/forgot-password/success`.

| Element | Text |
|---|---|
| Steps | "Reset requested", "Email delivered", "Password reset completed" |
| Title | "Password request sent" / "Check your inbox" |
| Body | "If an account exists for …" / "If an account exists for that email, reset instructions should arrive within a few minutes. Check your spam or promotions folder if you do not see them." |
| Actions | "Return to sign in", "Send another reset link" |

### 35. Reset password

- Route: `/user/reset-password`.
- Header: "Account security" / "Choose a new password".

| Label | Control type | Validation / hint |
|---|---|---|
| "New password" | Password | Placeholder "Enter a new password"; password requirements list; "Caps Lock is on. Check your password before continuing." |
| "Confirm password" | Password | Placeholder "Confirm your new password"; "Please confirm your new password."; "Passwords do not match."; "Caps Lock is on. Confirmed password may not match." |
| "Update password" | Button | Summary "Please fix the following before updating your password"; error "Unable to reset password." |

Footer: "Remembered your password?" + "Sign in".

| State | Text |
|---|---|
| Invalid link | "Reset link unavailable" - "This password reset link is invalid, incomplete, or has expired. Request a new link to continue securely." + "Request a new reset link", "Return to sign in" |
| Success | "Password updated" / "Your account is secure" - "Your password has been updated successfully. You can now use it to sign in." + "Sign in with your new password" |

---

## 7. Settings: general, team and recruitment setup

Conventions: text in "quotes" is exact wording from the bundles. "inferred" marks a grouping or mapping that the strings suggest but do not state. "Not in strings" means the bundle gives no evidence. Where the original wording used a word for a company's people that this document avoids, it is rephrased as "team members" and flagged "(rephrased)".

### 1. Settings home

| Item | Detail |
|---|---|
| Route | `/settings` |
| Purpose | Landing page listing every settings page as a card/link, grouped. |
| Header | Title "Settings"; subtitle "Manage your account, team, and hiring preferences." |
| Search | Box "Search settings" |
| Fallback card description | "Configure settings" |

Groups: "General", "Team & Access", "Recruitment Setup", "Communication", "Integrations & Tools", "System".

Entries and descriptions (the bundle lists names and descriptions as two separate lists; pairing below is inferred from order and meaning; group membership is inferred except where the live observation fixed it):

| Entry | Description | Group (inferred) |
|---|---|---|
| Profile | "Manage your personal profile and preferences" | General |
| Company Details | "Configure company details and settings" | General |
| User Roles | "Define user roles and permissions" | Team & Access |
| Users | "Manage team members and access" | Team & Access |
| Vendors | "Configure vendor partnerships" | Team & Access |
| Customers | not paired with a description in strings | Team & Access |
| Child Companies | "Manage sub-accounts and child companies" | Team & Access |
| Referral Portal | not paired with a description in strings | Team & Access or Recruitment Setup (undetermined) |
| Departments | "Organize your company departments" | Recruitment Setup |
| Hiring Managers | "Set up hiring managers" | Recruitment Setup |
| Job Approval | "Configure job posting approval workflow" | Recruitment Setup |
| Hiring Pipelines | "Customize your recruitment pipelines" | Recruitment Setup |
| Dashboard Experience | "Configure dashboard timing, defaults, and action responsibilities" | Recruitment Setup |
| Screening Setup | "Manage screening questions and form templates" | Recruitment Setup |
| Evaluation Templates | "Set up candidate evaluation templates" | Recruitment Setup |
| Career Page | "Design your public career page" | Recruitment Setup |
| Email Templates | "Create and manage email templates" | Communication |
| Scheduling Links | "Manage reusable interview booking links" | Communication |
| Email Settings / Email Signature | "Configure email settings and signatures" | Communication |
| Email Preferences / Notifications | "Manage notification preferences" | Communication |
| Integrations | "Connect email, calendar, and job boards" | Integrations & Tools |
| Webhooks | "Manage event notifications sent to connected applications" | Integrations & Tools |
| (browser extension entry, name not in strings) | "Set up browser extension" | Integrations & Tools |
| Developers | "API access and developer tools" | Integrations & Tools |
| Automations | "Configure automated workflows" | System |
| Compliance Settings | "GDPR and compliance settings" | System |
| Billing / Invoices | "Manage subscriptions and billing" | System |
| Appearance (Beta) | "Beta: customize app theme and layout preferences" | System |

### 2. Settings menu (side navigation)

| Item | Detail |
|---|---|
| Route | Wraps every `/settings/*` page; links seen: `/settings`, `/settings/automations` |
| Purpose | Persistent settings navigation with a filter box. |
| Browser title | "Settings - CVViZ" |
| Layout | Region "Settings navigation"; "Breadcrumb"; heading "Settings" |
| Search | "Find a setting" |
| Empty | "No settings found" |
| Content | Same entry names, descriptions and six group headings as Settings home |

Routes confirmed anywhere in the bundles for pages in this document: `/settings/profile`, `/settings/users`, `/settings/roles`, `/settings/customers`, `/settings/departments`, `/settings/hiring_pipelines`, `/settings/job_approval`, `/settings/career_page`. Routes for Company Details, Vendors, Child Companies, Hiring Managers, Screening Setup, Evaluation Templates, Referral Portal and Dashboard Experience are not in strings.

### 3. Profile

| Item | Detail |
|---|---|
| Route | `/settings/profile` |
| Purpose | "Manage your personal profile information and preferences" |
| Layout blocks | Profile photo; "Personal Information" ("Your basic profile details"); "Preferences" ("Timezone and scheduling settings"); "Working Days and Hours" ("Configure your working schedule"); "Save changes" |

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Profile photo | Image upload ("Upload photo" / "Change photo" / "Remove") | JPG or PNG | Hint "JPG or PNG, under 2 MB. Changes apply when you save."; "File size should be less than 2MB."; "Choose a JPG or PNG image."; "Select a profile picture to upload."; "The file service did not return the uploaded image." |
| First Name | Text | | "First Name required" |
| Last Name | Text | | "Last Name required" |
| Email | Text (field name not in strings, only its error) | | "Email required" |
| Phone | Text (field name not in strings, only its error) | | "Phone required" |
| Timezone | Select, placeholder "Select Timezone" | list not in strings | "Timezone is required" |
| Meeting Scheduling Link | URL text | | "Please enter a valid URL" |
| Start day | Select | Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday | "Start day is required" |
| End day | Select | same seven days | "End day is required" |
| Start Time | Time picker, placeholder "Start time" | | "Start time is required" |
| End Time | Time picker, placeholder "End time" | | "End time is required" |

Messages: success "Profile updated successfully"; error "Profile could not be updated."
API paths: none in strings.

### 4. Company Details

| Item | Detail |
|---|---|
| Route | not in strings |
| Purpose | "Configure your company information and business settings" (title "Company details") |
| Layout blocks | "Basic Information" ("Company name and contact details"); "Location Information" ("Company address and geographic details"); "Default Currency" ("Set your preferred currency for financial transactions"); "Working Days and Hours" ("Configure your company's operating schedule"); "Website & Social Media" ("Company website and social media profiles"); "Account access"; "Save changes" |

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Company Name (name inferred from error text) | Text | | "Company Name required" |
| Admin Email | Text | | "Please input your email!" |
| Phone Number | Text | | "Please input your phone!" |
| Street Address | Text | | "Please input your address!" |
| Country | Select with suggestions, "Select country" | loaded from server | "Country required"; "Could not load country suggestions. You can still enter a country." |
| State | Select with suggestions, "Select state" | loaded from server | "State required"; "Could not load state suggestions. You can still enter a state." |
| City | Select with suggestions, "Select city" | loaded from server | "City required"; "Could not load city suggestions. You can still enter a city." |
| Zip Code | Text | | |
| GST Number | Text | | "GST Number is required" (when it is shown or required is not in strings) |
| Default currency | Select | list not in strings | "Default currency is required" |
| Start day / End day | Select | Monday to Sunday | |
| Start Time / End Time | Time picker ("Start time", "End time") | | |
| Website (name inferred) | URL | | "The input is not a valid URL!" |
| LinkedIn company page URL (name inferred) | URL | | Hint "To find your company page URL, visit this link:" |
| LinkedIn Company ID | Text | | Hint "To publish your job listings on LinkedIn, please enter your LinkedIn company ID. You can find your company ID by visiting this link:"; "LinkedIn company ID must be numeric!"; info heading "LinkedIn publishing requirements" |
| Reason for changing the Company ID | Text (shown when the LinkedIn Company ID is changed, inferred) | | Hint "Explain why the LinkedIn Company ID is changing."; "Enter at least 5 characters for the change reason."; placeholder "For example: Corrected after verifying the LinkedIn company page" |
| Facebook | URL | | "The input is not a valid URL!" (inferred shared rule) |
| Twitter | URL | | same |
| Instagram | URL | | same |

Account access block: text "Deactivate your account and sign out. Contact CVViZ Support to reactivate it."; button "Deactivate account".

| Dialog | Wording | Buttons |
|---|---|---|
| Deactivate account | "Deactivate your account?" / "Your account will be deactivated immediately and you will be signed out. Contact CVViZ Support if you need to reactivate it." | "Deactivate account", "Cancel" |

Messages: "Account information updated!"; "Could not save company details. Your edits are still here."; "Account deactivated"; load failure "Could not load company details" with "Retry before editing to make sure you have the latest information."
API paths: none in strings.

### 5. Users (list)

| Item | Detail |
|---|---|
| Route | `/settings/users` |
| Purpose | "Manage your team members and their access permissions" |
| Table columns | User (name plus email; "No email address" fallback), "Company" ("Not assigned" fallback), Role, "Status", "Updated" (formats "DD MMM YYYY, h:mm A" and "DD MMM YYYY"), "Actions" |
| Status values | "Active", "Invited", "Inactive", "Unknown"; extra marker "Access suspended" |
| Search | "Search users" / placeholder "Search by name, email, company, or role" |
| Filters | "Filter users by status" ("All statuses", Active, Invited, Inactive); "Filter users by role" ("All roles" plus role list); "Clear filters" |
| Page action | "Add User" |
| Row actions | Menu "More actions for <name>": "Edit User", "Deactivate user", "Reactivate User" |

| Dialog | Wording | Buttons |
|---|---|---|
| Deactivate | "Deactivate this user?" / "User :  <name>" | "Deactivate user", "Cancel" |
| Reactivate | "Reactivate this user?" / "User :  <name>" | "Reactivate user", "Cancel" |

Messages: "Unable to deactivate this user."; "Unable to reactivate this user."; "User seat limit reached. Add user seats before reactivating."; "User seat limit reached. Add user seats before reactivating this user."
Empty: "No users found. Add your first team member to get started."; filtered "No users match the current search and filters."
Load error: "Could not load users" / "Please try again to get the latest list."
Plan gate: reactivation and invitation are limited by purchased user seats.
API paths: none in strings.

### 6. Invite New User / Edit User (dialog, shared chunk 4902)

| Item | Detail |
|---|---|
| Titles | "Invite New User" (subtitle "Send an invitation to join your team"); "Edit User" |
| Blocks | "User Information"; "User Role"; "Role Permissions" (read-only preview of the selected role's permissions, inferred); child-company assignment |
| Buttons | "Send Invitation" (new), "Update User" (edit), "Cancel" |

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| First Name | Text | | "Required" |
| Last Name | Text | | "Required" |
| Email Address | Text | | "Invalid email"; "Email must be 50 characters or fewer" |
| User Role | Select, "Select a role..." | roles from User Roles | "Required" (inferred) |
| Assign to a child company | Checkbox / switch | | Hint "This user belongs to a child company under your organization" |
| Select Sub-Account | Select, "Select a sub-account" | child companies | "Please select a sub-account." |

Messages: "Invitation sent to <email>"; "Unable to send this invitation."; "Unable to save this user."; "No user seats are available. Add a user seat or deactivate an existing user."

Seat-limit state inside the dialog:

| Element | Wording |
|---|---|
| Tag | "User limit reached" |
| Heading | "Add a user seat to invite this teammate" |
| Body | "Your current plan has no available user seats. Add one seat now, then return here to send the invitation." |
| Bullets | "Pay only for the remaining days in this billing cycle." / "The new seat is available immediately after payment." / "After payment, come back here to send the invitation." |
| Button | "Add user seat" (opens the seat purchase flow in shared chunk 5052, which links back to `/settings/users`) |

### 7. User Roles (list)

| Item | Detail |
|---|---|
| Route | `/settings/roles` (links to `/settings/users` via "View users") |
| Purpose | "Manage roles and permissions for your team members" |
| Table columns | Role (name, description, "System role" tag), "Permissions" (count; "No permissions granted."), "Assigned users", "Updated" ("DD MMM YYYY, h:mm A" / "DD MMM YYYY"), "Actions" |
| Search | "Search roles" / "Search roles by name or description"; "Clear search" |
| Page actions | "New Role"; "Compare" (row selection; "Select exactly two roles to compare") |
| Row actions | Menu "More actions for <role>": "Edit role", "Duplicate role" (new name prefixed "Copy of "), Delete |

| Dialog | Wording | Buttons |
|---|---|---|
| Delete role | "Delete <role>" / "This permanently removes the role and its permission configuration." | "Delete role", "Cancel" |
| Role in use (delete blocked) | "This role is currently in use" | "View users" |
| Compare role permissions | Title "Compare role permissions"; columns "Permission" plus one column per role with values "Granted" / "Not granted" | |

Messages: "Unable to delete this role."
Empty: "No user roles found. Create your first role to get started."; "No roles match your search."
Load error: "Could not load roles" / "Please try again to get the latest list."

### 8. Create / Edit / Duplicate Role (dialog, shared chunk 6411)

| Item | Detail |
|---|---|
| Titles | "Create New Role", "Edit Role", "Duplicate Role" |
| Also used at | `/onboarding/add_roles` |
| Buttons | "Create Role", "Update Role", "Cancel" |
| Edit warning | "Changes to this role affect <n assigned users>" |

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Role Title | Text | | "Title is required"; "Role title must be 50 characters or fewer" |
| Description | Text area, "Describe this role's purpose and responsibilities..." | | "Description must be 500 characters or fewer" |
| Permissions | Grouped checkbox list with per-group "Select all" | Group headings in this chunk: "Job Management", "Candidate Management", "Company Management", "Reports & Analytics", "Administration" | "At least one permission required" |

Permission list tools: "Search permissions"; toggle "Selected only"; "Clear all"; empty "No permissions match the current filters."
The individual permission names are not in strings (loaded from the server). One name appears elsewhere: "View & Send Job Offers" (shared chunk 9707).

| Dialog | Wording | Buttons |
|---|---|---|
| Unsaved changes | "Discard unsaved role changes?" / "Your title, description, and permission changes will be lost." | "Discard changes", "Keep editing" |

Messages: "Unable to create this role."; "Unable to update this role."; success toast begins "New role ".

### 9. Vendors (list)

| Item | Detail |
|---|---|
| Route | not in strings |
| Purpose | "Manage your external recruitment vendors" |
| Table columns | "Vendor Company", "Primary contact" ("No contact assigned"), "Team access", "Actions" |
| Team access values | "Active", "Invited", "Not Invited" |
| Search | "Search vendors" / "Search vendors by company, contact, or email" |
| Filter | "Filter vendors by hiring team status": "All team statuses", Active, Invited, "Not invited"; "Clear filters" |
| Page action | "Add Vendor" |
| Row actions | Menu "More actions for <vendor>": "Edit Vendor", "Invite Vendor to Hiring Team" (shown as "Invite <name>"), "Delete vendor" |

| Dialog | Wording | Buttons |
|---|---|---|
| Delete vendor | "Are you sure you want to delete this vendor?" / "Vendor: <name>" | "Delete vendor", "Cancel" |

Messages: "Could not delete this vendor. Please try again."; delete success toast begins "Vendor ".
Empty: "No vendors found. Add your first vendor to get started."; "No vendors match the current search and filters."
Load error: "Could not load vendors" / "Please try again to get the latest list."

### 10. Add Vendor / Edit Vendor / Invite Vendor to Hiring Team (dialog, shared chunk 9287)

| Item | Detail |
|---|---|
| Titles | "Add Vendor", "Edit Vendor", "Invite Vendor to Hiring Team" |
| Buttons | "Add Vendor", "Add and Invite", "Invite", "Save changes", "Cancel" |
| Link | "Create a Vendor role" goes to `/settings/roles` |

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Company name ("Company Name") | Text | | "Company name is required"; "Company name cannot exceed 50 characters" |
| Contact name ("Vendor Name") | Text | | "Contact person name is required when adding as team member"; "Contact person name cannot exceed 50 characters" |
| Email address ("Email Address") | Text | | "Vendor email id is required"; "Please enter correct email"; "Email cannot exceed 50 characters" |
| Add to Hiring Team | Checkbox / switch | | Hint "Invite this vendor as an external team member to participate in hiring"; explanation "This vendor will be invited to join your organization as an external team member. They'll receive access to participate in the hiring process for jobs they're assigned to." |
| User Role | Select, "Please select a role" | roles; a role named "Vendor" is pre-selected | "User role is required when adding as team member"; hint "Pre-selected Vendor role for hiring team access" |
| Role Permissions | Read-only preview, "View selected role permissions" | | |

Warning when no Vendor role exists: "Vendor Role Not Found" with link "Create a Vendor role".
Messages: "Invitation sent to <email>"; "Unable to send invitation."; "Vendor added but invitation failed: <reason>"; "Invitation failed: <reason>"; "Unknown error"; "Could not add this vendor. Your edits are still here."; "Could not save this vendor. Your edits are still here."; success toasts begin "New vendor " and "Vendor ".

### 11. Customers (list)

| Item | Detail |
|---|---|
| Route | `/settings/customers`; add and edit open separate pages (`/customers/add`, `/customers/:customerId/edit`, titled "Add Customer" / "Edit Customer" in the route table) |
| Purpose | "Manage your customer accounts and information" |
| Table columns | "Company Name" (sortable, inferred from sort icons), "Contact Person", "Default", "Actions" |
| Search | "Search customers" / "Search customers by company or contact" |
| Page action | "New Customer" |
| Row actions | Edit (link ending `/edit`), "Delete" |

| Dialog | Wording | Buttons |
|---|---|---|
| Delete customer | "Are you sure you want to delete this customer?" / "Customer :  <name>" | "Delete customer", "Cancel" |

Messages: "Could not delete this customer. Please try again."; "The company could not be saved. Your changes are still here."; delete success toast begins "Customer ".
Empty: "No customers found. Create your first customer to get started."; "No customers match your search."
Load error: "Could not load customers".
Permission gates: "Ask your account administrator for permission to add customers."; "You do not have permission to add customers. Ask your account administrator to update your role."; "You do not have permission to edit customers. Ask your account administrator to update your role."

### 12. Child Companies (list and master switch)

| Item | Detail |
|---|---|
| Route | not in strings |
| Purpose | "Manage subsidiaries and divisions with decentralized operations" |
| Layout blocks | Access card "Child company access" ("Allow subsidiaries to manage their own users and jobs.") with switch "Enable child companies" showing "Enabled" / "Disabled"; table; "Add child company" |
| Table columns | "Company Name", "Location" ("No location added"), "Actions" |
| Row actions | Menu "More actions for <name>": "Edit child company", "Delete child company" |

| Dialog | Wording | Buttons |
|---|---|---|
| Delete | "Are you sure you want to delete this company?" / "Child Company :  <name>" | "Delete company", "Cancel" |

Messages: "Child company settings updated successfully"; "Unable to update child company settings."; "Cannot delete child company <name>"; "Failed to delete child company <name>".
Empty: "No child companies found. Create your first child company to get started."
Load error: "Could not load child companies".

### 13. Add / Edit Child Company (dialog)

| Item | Detail |
|---|---|
| Titles | "Add Child Company", "Edit Child Company" |
| Blocks | Name; "Address"; "Working Hours & Salary Currency" |
| Buttons | "Add company", "Save changes", "Cancel" |

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Child Company Name | Text | | "Child Company name is required" |
| Street Address | Text | | "Please input your address!" |
| Country | Select | not in strings | |
| Zip Code | Text | | |
| Start day | Select | Monday to Sunday (default Monday, inferred) | |
| End day | Select | Monday to Sunday (default Friday, inferred) | |
| Start Time / End Time | Time picker ("Start time", "End time") | | |
| Salary Currency | Select, "Default Currency" | not in strings | |

Messages: "Could not save this child company. Your edits are still here."; success toasts begin "New child company " and "Child company ".

### 14. Departments (list)

| Item | Detail |
|---|---|
| Route | `/settings/departments` |
| Purpose | "Organize your team structure with departments" |
| Table columns | "Department" (sortable, inferred; tooltip "This department belongs to <child company>"), "Company", "Default", "Actions" |
| Search | "Search departments" / "Search departments by name or description" |
| Filters | "Filter departments by company" ("All companies"); "Filter departments by default status" ("All departments", "Default only", "Non-default only"); "Clear filters" |
| Page action | "Add Department" |
| Row actions | Menu "More actions for <name>": "Edit Department", "Delete department" |

| Dialog | Wording | Buttons |
|---|---|---|
| Delete | "Delete this department?" / "Department: <name>" | Delete, "Cancel" |

Messages: "The department could not be deleted. Please try again."; delete success toast begins "Department ".
Empty: "No departments found. Create your first department to get started."; "No departments match the current search and filters."
Load error: "Departments could not be loaded".

### 15. Add / Edit Department (dialog, shared chunk 4014)

| Item | Detail |
|---|---|
| Titles | "Add Department", "Edit Department" |
| Buttons | "Add department", "Save changes", "Cancel" |

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Department Name | Text | | "Department name is required" |
| Description | Text area, "Department description" | | "Department description required" |
| This is Child Company Department (strings "This is Child Company " + "Department") | Checkbox | | |
| Select Sub-Account | Select, "Select a sub-account" | child companies | "Please select a sub-account." |
| Use as the default department | Checkbox | | Hint "New jobs will use this department by default. This replaces the current default department."; shows "Current default: <name>" |

Messages: success toasts begin "New department " and "Department ".

### 16. Hiring Managers (list)

| Item | Detail |
|---|---|
| Route | not in strings |
| Purpose | "Manage hiring managers across your organization" |
| Table columns | "Hiring manager" (name plus email, inferred), "Department" ("Unassigned" fallback), "Actions" |
| Search | "Search hiring managers" / "Search hiring managers by name or email" |
| Filter | "Filter hiring managers by department" ("All departments"); "Clear filters" |
| Page action | "Add Hiring Manager" |
| Row actions | Menu "More actions for <name>": "Edit Hiring Manager", "Delete hiring manager" |

| Dialog | Wording | Buttons |
|---|---|---|
| Delete | "Delete this hiring manager?" / "Hiring manager: <name>" | Delete, "Cancel" |

Messages: "The hiring manager could not be deleted. Please try again."; delete success toast begins "Hiring manager ".
Empty: "No hiring managers found. Add your first hiring manager to get started."; "No hiring managers match the current search and filters."
Load error: "Hiring managers could not be loaded".

### 17. Add / Edit Hiring Manager (dialog, shared chunk 9385)

| Item | Detail |
|---|---|
| Titles | "Add Hiring Manager", "Edit Hiring Manager" |
| Buttons | "Add hiring manager", "Save changes", "Cancel" |

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Hiring Manager's Name | Text | | "Name is required"; "Name cannot exceed 50 characters" |
| Email address ("Email Address") | Text | | "Email address is required"; "Please enter correct email"; "Email cannot exceed 150 characters" |
| Department | Select, "Please select a department" | departments | "Department is required" |

Messages: success toasts begin "New Hiring Manager " and "Hiring Manager ". No user account or seat is mentioned for hiring managers.

### 18. Job Approval (page)

| Item | Detail |
|---|---|
| Route | `/settings/job_approval` |
| Purpose | "Manage approval workflow and configure approvers for job postings" |
| Layout blocks | Master switch "Enable job approval" with state "Active" / "Inactive"; "Approvers" list with "Add Approver"; "Approval Groups" list with "Add Approver Group" (tabs or stacked sections: not in strings) |
| Off state | "Job approval is turned off" / "Enable job approval to configure approvers and approval groups for job postings." |
| Plan gate | "Job Approval is not included in your plan" / "Upgrade your subscription to configure job approval workflows." / button "View Plans" (goes to `/settings/billing`) |

Approvers table:

| Columns | Row actions | Empty / error |
|---|---|---|
| "Approver Name", "Email Address", Approval Groups ("No Group" fallback), "Actions" | "Edit Approver", "Delete" | "No approvers yet. Add the people who can approve job postings."; "Approvers could not be loaded"; "The approver list is unavailable. Retry loading it above." |

Approval groups table:

| Columns | Row actions | Empty / error |
|---|---|---|
| "Group Name", "Group Description", "Approvers" ("No Approver" fallback), "Default" (tag "Default group"), "Actions" | Edit, "Delete" | "No approval groups yet. Create a group to organize job approvers."; "Approval groups could not be loaded"; "The approval group list is unavailable. Retry loading it above." |

| Dialog | Wording | Buttons |
|---|---|---|
| Delete approver | "Are you sure you want to delete this approver?" / "Approver :  <name>" | "Delete approver", "Cancel" |
| Delete group | "Are you sure you want to delete this group?" / "Group :  <name>" | "Delete group", "Cancel" |

Messages: "Job approval settings saved."; "Could not save job approval settings. Please try again."; "Job approval settings could not be loaded"; "The approver could not be deleted. Please try again."; "The approval group could not be deleted. Please try again."; success toasts begin "Approver " and "Group ".
API paths: none in strings (only the page link `/settings/billing`).
Related use elsewhere (shared chunk 2554, job header): "Configure Approval", "Group: <name>", approver states "Pending" / "Approved" / "Rejected", "Resend", "Approval request sent successfully!", "Failed to send approval request.", "No approval details found." Public approval route `/job-approval`.

### 19. Add / Edit Approver (dialog)

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Approver Name | Text | | "Approver contact person is required" |
| Approver Email Address | Text | | "Approver email id is required"; "Please enter correct email" |
| Approval Groups | Multi-select, "Select groups" | existing groups | "Please select groups!" |

Titles "Add Approver" / "Edit Approver"; buttons "Add Approver", "Update Approver", "Cancel".

### 20. Add / Edit Approval Group (dialog)

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Group Name | Text | | "Please input the group name!" |
| Group Description | Text area | | "Please input the group description!" |
| Approvers | Multi-select, "Select approvers" | existing approvers | "Please select approvers!" |
| Set this group as default | Checkbox | | |

Buttons "Add Approval Group", "Update Approval Group", "Cancel". Approval order, minimum approvals and approve/reject rules are not in strings.

### 21. Hiring Pipelines (list)

| Item | Detail |
|---|---|
| Route | `/settings/hiring_pipelines` |
| Purpose | "Create and manage custom hiring workflows for your recruitment process" |
| Layout | Search plus a list of pipelines; each shows its name, "Default" tag, its stages, and "Sub-stages" with "Show less" toggle (card or table layout: not in strings) |
| Search | "Search hiring pipelines" / "Search pipelines by name" |
| Page action | "Add Hiring Pipeline" / "New Hiring Pipeline" |
| Row actions | Menu "More actions for <name>": "Edit Pipeline" / "Edit Hiring Pipeline", Delete |
| Stage fallback | "No stages configured" |

| Dialog | Wording | Buttons |
|---|---|---|
| Delete | "Are you sure you want to delete this hiring pipeline?" / "Hiring Pipeline: <name>" | "Delete pipeline", "Cancel" |

Messages: "The hiring pipeline could not be deleted. Please try again."; delete success toast begins "Hiring Pipeline ".
Empty: "No hiring pipelines yet. Create a pipeline to define your recruitment stages."; "No pipelines match your search."
Load error: "Hiring pipelines could not be loaded"; "The pipeline list is unavailable. Retry loading it above."
API paths: `/api/workflow-templates`; `/workflow` (path suffix, also used by job screens to read a job's stages).

### 22. Add / Edit Hiring Pipeline (dialog or page)

| Item | Detail |
|---|---|
| Titles | "Add Hiring Pipeline", "New Hiring Pipeline", "Edit Hiring Pipeline", "Edit Pipeline" |
| Intro | "Customize your hiring pipeline with advanced features." |
| Blocks | Pipeline name; default switch; "Pipeline stages" editor |
| Buttons | "Create Pipeline", "Update Pipeline", "Cancel" |

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Pipeline name | Text | | "Please enter pipeline name" |
| Use as the default pipeline | Checkbox / switch | | Shows "Current default: <name>" |
| Pipeline stages | Ordered, drag-sortable list | | Hint "Drag stages to reorder them. Add stages between existing steps."; "Step cannot be empty" |
| Stage Name ("Stage name") | Inline text with "Save stage name" | | "Step cannot be empty" |
| Stage type | Select, "Select a status" | the status catalog below | |

Stage editor controls: "Drag to reorder" handle; "Add stage"; "Add stage after <stage>" (insert between steps); "Add child stage" / "Add child stage to <stage>" (creates a sub-stage under a stage); "Delete" / "Remove <stage>".

Status catalog offered as stage type (order as in the bundle; any grouping is inferred):

| # | Status | # | Status |
|---|---|---|---|
| 1 | No Response - Phone | 22 | Offer Rejected |
| 2 | Phone Screened | 23 | Offer Accepted |
| 3 | Internal Review | 24 | Background Screening |
| 4 | Shared | 25 | Not Joined |
| 5 | Internal Shortlisted | 26 | Internal Hold |
| 6 | Resume Shortlisted | 27 | Joined |
| 7 | Assessment | 28 | Rejected |
| 8 | Interviewed | 29 | Interview Reject |
| 9 | Submitted to Client | 30 | Job Offer Reject |
| 10 | Submitted to Partner | 31 | Phone Screen Reject |
| 11 | Submitted to AM | 32 | Not Shortlisted |
| 12 | Assessment/Trial Invited | 33 | Candidate No Show For Interview |
| 13 | Assessment/Trial Accepted | 34 | Interview Declined By Candidate |
| 14 | Assessment/Trial Scheduled | 35 | Internal Screening Reject |
| 15 | Assessment/Trial Passed | 36 | Assessment/Trial Failed |
| 16 | Intermediary Interview stage | 37 | Rejected by AM |
| 17 | Final Interview Invited | 38 | Rejected by Client |
| 18 | Final Interview Accepted | 39 | Rejected by Partner |
| 19 | Final Interview Scheduled | 40 | Final Interview Failed |
| 20 | Final Interview Passed | 41 | Not Interested |
| 21 | Job Offered | 42 | New Candidate |

Inferred reading: 1 to 27 are progress statuses, 28 to 41 are rejection/withdrawal reasons, 42 is the entry status. The same catalog is shipped in the candidate stage-change dialog (shared chunks 1624 and 8317).

Messages: "Hiring Pipeline added successfully!"; "Hiring Pipeline updated successfully!"; "Please fill in all required fields"; "Invalid insertion index"; console-style errors "Error parsing default pipeline:" and "Error updating workflow steps:".
Not in strings: stage colours, per-stage automation, per-stage time targets, limits on the number of stages.

### 23. Screening Setup (page with two tabs)

| Item | Detail |
|---|---|
| Route | not in strings |
| Purpose | "Manage custom screening questions and form templates" (title "Screening Setup") |
| Tabs | Questions; Forms (tab names from live observation; strings carry "Questions" and form wording) |

Questions tab:

| Item | Detail |
|---|---|
| Table columns | Type (shown as "Answer Type: <type>"), "Question", "Database Mapping", "Mandatory" (values "Required" / "Optional"), Default ("Default question"), "Actions" |
| Search | "Search questions" / "Search screening questions" |
| Filters | "Filter screening questions by answer type" ("All answer types" plus types); "Filter screening questions by attribute" ("All question attributes", "Mandatory only", "Default only", "Database mapped"); "Clear filters" |
| Page action | "Add Question" |
| Row actions | "Edit Question" ("Edit question: <text>"), "Delete question" |
| Empty | "No screening questions found."; "No screening questions match the current search and filters." |
| Load error | "Screening questions could not be loaded" |

| Dialog | Wording | Buttons |
|---|---|---|
| Delete question | "Delete this screening question?" / "Question :  <text>" | "Delete", "Cancel" |

Messages: "Question deleted!"; "The question could not be deleted. Please try again."

Forms tab:

| Item | Detail |
|---|---|
| Table columns | Form name (with description, inferred), "Default", "Questions" (count), "Created", "Actions" |
| Search | "Search screening forms" |
| Filter | "Filter screening forms by default status": "All forms", "Default only", "Non-default only"; "Clear filters" |
| Page action | "Create Form" |
| Row actions | Menu "More actions for <form>": "Preview Form" ("Preview <name>"), "Edit Form", "Delete form" |
| Empty | "No screening forms found. Create your first form to get started."; "No screening forms match the current search and filters." |

| Dialog | Wording | Buttons |
|---|---|---|
| Delete form | "Are you sure you want to delete this screening form?" / "This will permanently delete the form: <name>" | "Delete", "Cancel" |

Messages: "Screening form deleted successfully"; "The screening form could not be deleted. Please try again."
API paths: none in strings.

### 24. Add / Edit Screening Question (dialog, shared chunk 4493)

| Item | Detail |
|---|---|
| Titles | "Add Screening Question", "Edit Screening Question" |
| Blocks | Question text; answer type; answer options (choice types only, inferred); database mapping; "Additional Settings" |
| Buttons | "Add Question", "Update Question", "Cancel" |

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Question text | Text area | | "Question is required"; hint "Enter the question that candidates will see and answer" |
| Answer type | Select, "Choose an answer type" | see answer types below | "Answer type is required"; hint "Select how candidates will provide their answer" |
| Answer options | Repeating text rows "Option <n>" with "Remove Option" / "Remove option <n>" and an add-option control | | "At least one option is required"; "Question should have at least 2 options"; hint "Add the choices candidates can select from" |
| Database mapping field | Select, "Select a database field (optional)" | field list not in strings | Hint "Map this question to a database field for automatic data storage" |
| Required question | Checkbox | | "Candidates must answer this question to submit their application." |
| Default question | Checkbox | | "Default questions will pre-populate in screening questions when adding a new job." |
| Demographic question | Checkbox | | "Mark this question as demographic if it relates to the applicant" |

Answer types: the option list is not in this dialog's strings (inferred to be server-supplied). The type names found in the shared email/screening chunk 9707 are "Short Text", "Long Text", "Dropdown", "Checkbox", "Single Choice", "File Attachment", "Number". The form preview additionally renders a date input ("DD/MM/YYYY"). Live observation also showed a yes/no switch and a URL type; those two names are not in strings.

Messages: "Screening question added"; "Question updated". (Strings "Image size should not exceed 1Mb" and "You can have only 1 image in signature" sit in the same chunk but belong to a signature editor, inferred.)

### 25. Create / Edit Screening Form (dialog)

| Item | Detail |
|---|---|
| Titles | "Create Screening Form", "Edit Screening Form" |
| Blocks | Form details; "Add Questions" ("Select questions from your library to include in this screening form."); "Selected Questions" |
| Buttons | "Create form", "Save changes", "Cancel" |

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Form Name | Text, "Form name" | | "Please enter screening form name"; "Please enter a form name" |
| Description | Text area, "Form description" / "Explain the purpose of this screening form..." | | |
| Set as default form | Checkbox | | |
| Add screening questions | Searchable select, "Search and select screening questions..." | question library | "Question already added to this form" |
| Selected Questions | List; each row shows the question, "Required:" flag, and "Remove question from form" | | "No questions selected yet"; "Please add at least one screening question to the form" |

Messages: "Screening form created successfully"; "Failed to create screening form"; "Screening form updated successfully"; "Failed to update screening form".
Load error: "Screening form could not be loaded" / "Retry before editing the questions in this form."

### 26. Preview Screening Form (dialog)

| Item | Detail |
|---|---|
| Title | "Preview Form: <name>" |
| Purpose | Read-only rendering of the form as a candidate sees it. |
| Rendered inputs | "Short answer text..." (short text); "Long answer text..." (long text); "Select option..." (dropdown); "DD/MM/YYYY" (date); "Upload File" (file); "Required" marker |
| Empty | "No questions in this form." |
| Error | "Screening form preview could not be loaded" |

### 27. Evaluation Templates (list)

| Item | Detail |
|---|---|
| Route | not in strings |
| Purpose | "Create AI-powered evaluation templates for candidate assessment" |
| Table columns | Template name, "Description", "Created At" |
| Page action | "New Template" |
| Row actions | none in strings (no edit or delete wording found) |
| Empty | "No evaluation templates yet. Create a template to reuse your assessment criteria." |
| Load error | "Evaluation templates could not be loaded"; "The template library is unavailable. Retry loading it above." |

Template names seen live (Benchmark Competency, Benchmark Career Level, Benchmark Balanced) are not in strings; they come from the server.

### 28. Create evaluation template (dialog, two steps)

| Item | Detail |
|---|---|
| Title | "Create evaluation template" |
| Step 1 (inferred) | Pick a starting preset, or go straight to custom |
| Step 2 | "Configure Weightages" with "Back to options" |
| Buttons | "Save Template" |

Presets:

| Preset | Description |
|---|---|
| Standard Evaluation | "Evaluate candidates based on their overall fit for the role, considering technical skills, experience, and cultural alignment." |
| Technical Focus | "Prioritize technical skills assessment, focusing on hands-on experience, coding abilities, and technical problem-solving capabilities." |
| Leadership Potential | "Evaluate candidates with emphasis on leadership qualities, team management experience, and strategic thinking abilities." |
| Innovation Focus | "Look for candidates demonstrating creative problem-solving, innovative thinking, and experience with cutting-edge technologies." |

Fields:

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Template Name | Text, "Enter a name for your template" | | "Please enter a template name" |
| Template Description | Text area, "Describe what this template is best used for" | | "Please enter a template description" |
| Evaluation weightages | Nine percentage inputs (below) | 0 to 100 each | "Use whole percentages"; "Use whole percentages between 0 and 100, totaling 100%."; "Validation failed:" |
| Custom Instructions | Text area; placeholder "Example: Focus on evaluating problem-solving abilities and system design experience. Consider any open source contributions..." | | Heading "Add specific instructions for the evaluation process"; hint "These instructions will be used along with the weightages to evaluate candidates. Be specific about any particular aspects you want to focus on." |

Weightage criteria:

| Group | Criterion | Hint |
|---|---|---|
| Skills | Required skills | "Mandatory skills in the resume" |
| Skills | Preferred skills | "Optional skills that strengthen the fit" |
| Experience | Professional experience | "Relevant work experience" |
| Experience | Domain expertise | "Industry and domain alignment" |
| Experience | Job stability | "Consistency of employment history" |
| Education & certifications | Education | "Qualification fit for the role" |
| Education & certifications | Certifications | "Relevant professional certifications" |
| Additional criteria | Notable achievements | "Relevant achievements and outcomes" |
| Additional criteria | Benchmark alignment | "Similarity to the benchmark profile" |

Messages: "Template created successfully". Default weight values per preset are not in strings.

### 29. Career site builder (page shell)

| Item | Detail |
|---|---|
| Route | `/settings/career_page` (also reached in onboarding at `/onboarding/career_page`, "Setup Career Page") |
| Purpose | "Build and manage the candidate-facing careers experience" (title "Career site") |
| Layout blocks | Header with publication status, live URL and publishing buttons; left list "Career site sections"; centre form for the chosen section ("Career site builder view"); right live preview |
| Leave guard | "You have unsaved career page changes. Are you sure you want to leave?" |
| Load errors | "Career page settings could not be loaded"; "Unable to load career page settings." |

Section navigation (name plus description; the Talent pool pairing is inferred):

| Section | Description |
|---|---|
| General | "Name, address, and language" |
| Brand & layout | "Logo, colors, imagery, and jobs" |
| Page content | "Company story, perks, and benefits" |
| Talent pool | "General applications and messaging" |
| SEO & sharing | "Search results and social previews" |
| Legal & links | "Website, privacy, and GDPR" |
| Integrations | "Links, embeds, and verification" |
| History | "Published versions and recovery" |

Per-section status tags (which tag belongs to which section is inferred): "Complete", "Branded", "Customized", "Using defaults", "Configured", "Optional", "No versions", "Enabled", "Disabled".

Header status and publishing controls:

| Element | Wording |
|---|---|
| Status tags | "Published", "Draft changes", "Unsaved changes", "Publish pending", "Unpublish pending" |
| Status notes | "Visible to candidates"; "Not publicly visible"; "Draft changes are not live"; "Ready to publish"; "Published <time>"; "Draft saved <time>"; "Save changes to publish"; "Live until changes are saved"; "Publication time unavailable" |
| Helper lines | "Save a private draft, or publish these changes to candidates."; "Save when you are ready to refresh the preview."; "Saving will publish this page to candidates."; "Saving will remove this page from public access."; "Saving will enable the Talent Pool application."; "Saving will disable the Talent Pool application." |
| Live URL | "Live URL:" with "Copy live career site URL" (toast "Live URL copied."); "View live" / "View live page"; fallback "Available after a career page path is added" |
| Buttons | "Save draft", "Publish changes", "Publish site", "Save changes", "Discard" |
| Menu "More publishing actions" | "Revert saved draft", "Unpublish site" (disabled note "Save or discard your local changes before unpublishing.") |
| Saving notes | "Changes were not saved"; "Your preview may refresh when saving finishes." |

Older-style controls also present in the bundle (inferred to be a legacy or alternate variant of the same page): switch "Enable Career Page"; "Set career page to draft"; "Publish career page"; "Career Page URL"; "Talent Pool Application URL"; "Career Page Language" with "Select Default Locale"; "Required."

Dialogs:

| Dialog | Wording | Buttons |
|---|---|---|
| Unpublish (site) | "Unpublish career site?" / "Candidates will no longer be able to open the public career site. Your saved draft will remain available in this builder." | "Unpublish site", "Cancel" |
| Unpublish (page, save-based variant) | "Unpublish career page?" / "Candidates will no longer be able to open the public career page after you save this change. Your configuration will remain available as a draft." | "Unpublish", "Keep published" |
| Revert draft | "Revert saved draft?" / "All saved draft changes will be replaced with the current published version. This cannot be undone." | "Revert draft", "Keep draft" |
| Discard local edits | "Discard unsaved changes?" / "All changes made since your last save will be restored to the currently published or saved configuration." | "Discard changes", "Continue editing" |
| Restore version | "Restore version <n>" / "This replaces the current saved draft with the selected published version. The live career site will not change until you publish the restored draft." | Restore, "Cancel" |
| URL change on publish | "Publishing will change your career page URL" / "Existing bookmarks, embedded links, and search results will stop working until you update them to the new URL." | (warning block) |

Messages: "Career page settings saved."; "Unable to save career page settings."; "Draft saved. Your live career site was not changed."; "Unable to save the career site draft."; "Career site published."; "Unable to publish the career site."; "Career site unpublished."; "Unable to unpublish the career site."; "Saved draft reverted to the published version."; "Unable to revert the saved draft."; "Unable to restore version <n>"; "Review the highlighted fields before publishing."; "Unable to upload the <image name>".

API and embed paths: `/widgets/jobs`, `/widgets/drop-your-resume`, `/settings/billing`; public host string "JOBS.CVVIZ.COM"; `/api/career-page/application-links` (shared chunk 9707, public application links).
Plan gate: custom domain needs the "Custom Career Page Domain" add-on bought in Billing.

### 30. Career site: General section

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Company Name | Text, placeholder "Example Company" | | Hint "Shown in the page header and browser title."; "Company name is required."; "Company name cannot exceed 120 characters." |
| Career page path | Text (URL slug) | | Hint "Use letters, numbers, hyphens, or underscores. Changing this path will also change your public links and embed URLs."; "Career page path is required."; "Use only letters, numbers, hyphens, or underscores."; "Career page path cannot exceed 80 characters."; "This career page path is already in use." |
| Career page language | Select, "Select a language" | language list not in strings | Hint "Used for system-generated labels and application controls." |

### 31. Career site: Brand & layout section

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Color mode | Choice | option names not in strings (a light/dark style choice, inferred) | "Choose the base appearance used across the public page." |
| Accent color | Colour picker plus "Accent color hex value" text | | "Used for links, buttons, and highlighted controls. Contrast checks use the selected page color mode."; contrast read-outs "White text <ratio>" and "On page <ratio>"; "Aim for at least 4.5:1 contrast for readable text and controls." |
| Font family | Select | "System default" (Segoe UI, sans-serif), Arial (Arial, Helvetica, sans-serif), "Georgia", "Verdana", "Trebuchet MS", "Times New Roman" | "Choose from web-safe fonts so the page stays fast and consistent on every device." |
| Job grouping | Select, "Select Group" | "Do not group jobs", "Group by department", "Group by location" | "Controls how open positions are organized for candidates." |
| Company Logo | Image upload with crop ("Choose logo", "Edit Company Logo") | | Size limits in the bundle: 5MB, 2MB, 512KB (which image gets which limit is inferred: cover 5MB, logo 2MB, browser icon 512KB) |
| Logo height | Number / slider | | "Set the maximum logo height shown in the career page header." |
| Browser icon | Image upload with crop ("Choose browser icon", "Edit Browser Icon") | | see size limits above |
| Cover Photo | Image upload with crop ("Choose cover photo", "Edit Cover Photo") | | see size limits above |
| Cover image focal point | Two sliders "Horizontal position", "Vertical position" with "Cover focal point preview" | | "Keep the important subject visible as the page adapts to different screen sizes." |

Crop dialog: title "Crop Image"; button "Crop & Upload"; errors "Failed to read file", "Crop failed", "Crop cancelled", "Upload aborted via beforeCrop or beforeUpload"; size errors "File size should be less than 5MB." / "2MB." / "512KB."

### 32. Career site: Page content section

Fixed blocks:

| Label | Control type | Validation / hint |
|---|---|---|
| About your company | Rich text editor | "Introduce your mission, culture, and what candidates can expect."; "About company is required." |
| Also show this content on job details pages | Checkbox | |
| Perks and benefits | Rich text editor | "Highlight the benefits and employee experience you offer." |
| Also show perks and benefits on job details pages | Checkbox | |

Rich text toolbar ("Rich text editor", placeholder "Type here..."): "Text formatting" (bold inferred), "Italic", "Underline", "Strikethrough", "Block quote", "Insert link", "Clear formatting", "Numbered list", "Bulleted list", "Decrease indent", "Increase indent".

Additional page sections ("Build a richer candidate story with reusable sections you can reorder, duplicate, or temporarily hide."):

| Item | Detail |
|---|---|
| Add control | "Add section"; empty state "No additional sections yet" with "Add your first section" |
| Section types (inferred from strings) | "Text section" (default heading "Life at our company"); "Highlight" (default heading "Why join us"); "Call to action" (default heading "Learn more about us", default button "Learn more") |
| Per-section controls | "Move up", "Move down" ("Move section <name>"); "Duplicate" ("Duplicate section <name>"); hide/show toggle with tag "Hidden"; "Delete" ("Delete section <name>") |

| Label | Control type | Validation / hint |
|---|---|---|
| Section heading | Text | "Enter a section heading."; "Use 120 characters or fewer." |
| Content | Rich text | "Add section content." |
| Button label | Text (call-to-action type, inferred) | "Enter button text."; "Use 40 characters or fewer." |
| Button destination | URL (call-to-action type, inferred) | "Enter a destination."; "Enter a full http:// or https:// URL." |

| Dialog | Wording | Buttons |
|---|---|---|
| Delete section | "Delete this section?" / "It will be removed from the draft immediately." | "Delete", "Keep section" |

### 33. Career site: Talent pool section

| Label | Control type | Validation / hint |
|---|---|---|
| Talent pool applications | Switch ("Enabled" / "Disabled") | "Let candidates apply when no current role is a match." |
| Talent pool invitation | Text area | "Shown below the open-jobs list to invite candidates to apply generally."; "Talent pool description is required." |
| Invitation button text | Text, default "Join our talent pool" | "Invitation button text is required."; "Keep button text under 40 characters." |
| Application introduction | Text area | "Explain what happens after a candidate submits their resume." |
| Submit button text | Text, default "Submit application" | "Submit button text is required." |

Disabled state: "Talent pool applications are disabled" / "Enable this section to edit the invitation and application messaging."

### 34. Career site: SEO & sharing section

Block title "Search and social defaults": "Leave optional fields blank to use your company name, career page content, and cover image automatically."

| Label | Control type | Validation / hint |
|---|---|---|
| Search result title | Text | "Search title cannot exceed 70 characters." |
| Search result description | Text area, default "Explore open roles, learn about our team, and find your next opportunity." | "Summarize why a candidate should explore and apply."; "Search description cannot exceed 180 characters." |
| Social sharing image URL | URL | "Enter a valid public image URL."; "Image URL is too long." |
| Allow search engine indexing | Switch ("Search engine indexing status": "Indexed" / off) | "Turn this off for private launches or pages that should not appear in search." |

Previews: "Search result preview" and "Social sharing preview", using fallbacks "Your company", "Explore open roles and career opportunities at <company>", host "JOBS.CVVIZ.COM", headings "Career opportunities" / "Open positions".

### 35. Career site: Legal & links section

| Label | Control type | Validation / hint |
|---|---|---|
| Company website | URL | "Optional. Include https:// so candidates can open the link reliably."; "Include https:// for a reliable external link." |
| Privacy policy URL | URL | "Displayed to candidates during the application process."; "Include https:// in the privacy policy URL." |
| GDPR terms URL | URL | "Include https:// in the GDPR terms URL." |

### 36. Career site: Integrations section

| Block | Content |
|---|---|
| Direct link | "Link to the hosted career page from your company website or social profiles." Copy field "Career page link" |
| Embed the career page | "Paste this iframe where the full career page should appear on your website." Copy field "Career page embed code" |
| Optional dynamic-height script | "Add this once on the host page to resize the iframe when its content changes." Copy field "Dynamic-height script" |
| Embed the jobs widget | "Use this smaller embed when you only want to show the list of open positions." Copy field "Jobs widget embed code" (path `/widgets/jobs`) |
| Talent pool link | "Share this application link so candidates can leave their resume when no current role is a match." (path `/widgets/drop-your-resume`) |
| Custom domain | Heading "Use your own career-page domain"; "Add the Custom Career Page Domain add-on, then verify DNS and secure activation from Billing."; buttons "View domain options", "Manage domain setup"; states "Activating", "DNS verified", "Needs attention", "DNS setup" |
| Website connection | "Check whether your website links to or embeds this career site." |
| Analytics | "Measure visits and candidate journeys with your own Google Analytics 4 property. Tracking is never loaded inside the builder preview." |

| Label | Control type | Validation / hint |
|---|---|---|
| Website careers URL | URL, placeholder "Enter career page URL (e.g., https://www.example.com/careers)" | "Enter a complete URL beginning with http:// or https://." |
| Verify / Recheck / Reset verification | Buttons | States "Not checked", "Previously verified", "Verified", "Not detected" |
| Google Analytics measurement ID | Text, placeholder "G-ABC1234" | "Leave blank to disable analytics. IDs begin with G-."; "Enter a valid GA4 measurement ID, such as G-ABC1234." |

Verification messages: "Website integration verified."; "The career site link was found at this address."; "The career site link was not detected. Add a link or embed, then recheck."; "The website could not be reached. Confirm the URL is public, then try again."; "Integration verification could not be completed."; "Verification could not be completed".
Analytics notice: "Confirm your consent requirements" / "Your organization is responsible for providing any cookie notice or consent flow required in the regions where you recruit."

### 37. Career site: History section

| Item | Detail |
|---|---|
| Title | "Published versions" |
| Intro | "Restore an earlier publication into the draft, review it in the preview, and publish only when it is ready." |
| Row content | "Published version <n>" / "Version <n>"; tags "Current live version", "Most recent record"; publish time ("Publication time unavailable" fallback) |
| Row action | "Restore as draft" (confirmation in section 29) |
| Empty | "Your first published version will appear here." |
| Error | "Version history could not be loaded" / "Unable to load publication history." with "Try again" |

### 38. Career site: preview panel

| Item | Detail |
|---|---|
| Title | "Preview" / "Draft preview" |
| View selector | "Career page" ("Career page preview"), "Jobs widget" ("Jobs widget preview"), "Talent pool" ("Talent pool application preview") |
| Device selector | "Preview device width": "Desktop", "Mobile" |
| Button | "Refresh" |
| Notes | "Local changes appear in this preview only. Save a draft or publish when ready."; "The preview uses your last saved settings." |
| States | "Career site is unpublished" / "Publish the site when it is ready for candidates."; "Previewing draft changes" / "Candidates continue to see the published version until you publish this draft."; "Talent pool is disabled" / "Enable the Talent Pool and save your changes before sharing this application."; "Add a career page path to load the preview." |

### 39. Referral Portal

| Item | Detail |
|---|---|
| Route | not in strings |
| Purpose | Lets team members refer candidates through a dedicated portal (rephrased from the page subtitle). |
| Layout blocks | Master switch "Enable referral portal"; "Portal Configuration"; "Access Control" ("Define who can register and create referrals"); "Save Changes" |
| Off state | "Referral portal is turned off" / turn it on to configure team-member access, then save your changes to enable the portal (rephrased) |
| Loading | "Loading referral portal settings" |

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Enable referral portal | Switch | on / off | |
| Portal URL | Text (subdomain) with copy button | | "Choose a unique subdomain for your referral portal"; "Subdomain is required"; "Only lowercase letters, numbers, and hyphens"; "The portal URL will be confirmed by the server after you save." |
| Who can access the portal? | Select, "Select access type" | "Only company email domain", "Selected email domains", "Specific email addresses", "Anyone with the link" | |
| Allowed Domains | Tag input (shown for "Selected email domains", inferred) | | "Add at least one domain" |
| Allowed Emails | Tag input, "Enter specific email addresses" (shown for "Specific email addresses", inferred) | | "Add at least one email" |

Messages: "Referral portal settings updated successfully"; "Failed to update settings"; "Referral portal disabled successfully"; "Failed to disable portal"; "Portal URL copied."; "Could not copy the URL. Select and copy it manually."
Errors: "Referral portal settings are unavailable."; "Referral portal settings returned an invalid response."; "Referral portal settings could not be loaded" / "Retry to load the current portal configuration."
API path: `/api/settings/referral-portal`.
Not in strings: referral rewards, referral status tracking, the portal's own screens.

### 40. Dashboard Experience (listed under Recruitment Setup in the menu; file present in the same folder)

| Item | Detail |
|---|---|
| Route | not in strings (links back to `/settings`) |
| Purpose | "Set review targets and record cleanup rules for your dashboard." (title "Dashboard experience") |
| Layout blocks | "Workspace defaults" ("Applies to your whole team. Set how long work can wait before the dashboard flags it for attention."); group "Review & follow-up" ("When waiting applications need attention."); group "Record cleanup" ("When older work belongs in Record cleanup."); weekday switch; footer with "Unsaved changes" / "No unsaved changes", "Reset changes", "Save changes" |
| Note | "Existing role or pipeline overrides still apply when viewing a single role. Saving workspace defaults does not change those overrides." |

| Label | Control type | Validation / hint |
|---|---|---|
| Application review | Number of days | "New, Internal Review, Shared, and Submitted to Client stages, including related custom stages."; "Enter a number of days" |
| Stage follow-up | Number of days | "Candidates waiting in other active stages." |
| Interview feedback | Number of days | "Candidates in the interview stage without recorded feedback." |
| Offer response | Number of days | "Pending offers waiting for a response." |
| Inactive roles | Number of days | "Roles without recent activity, when no other queue action takes priority." |
| Older candidate records | Number of days | "Candidate records with no stage change beyond this threshold. No records are deleted." |
| Count weekdays only | Switch | "Off: count every day. On: count Monday to Friday, including public holidays. Applies to all targets above, including cleanup." |

Messages: "Workspace dashboard defaults updated."; "Dashboard action rules could not be saved."; "Dashboard settings could not be loaded" / "Retry to load the current settings before making changes."
API paths: `/api/dashboard/configuration`, `/api/dashboard/configuration/profile`, `/api/dashboard/preferences`, `/api/dashboard/actions`, `/api/dashboard/outcomes`.

### 41. Add user seat purchase flow (shared chunk 5052, opened from the Users seat-limit state)

| Item | Detail |
|---|---|
| Purpose | Buy extra user seats so more people can be invited. |
| Titles | "Add User Seat" / "Add User Seats" / "Add user seats" |
| Steps ("Purchase progress") | "Choose a plan" or "Choose a pack"; "Review & pay" |
| Intro | "Add seats so more team members can access your account." |
| Fields | "Number of user seats" / "Number of Users" (stepper; "Minimum <n>"; "You currently have <n>"); "Promo code" ("Add promo code", "Enter promo code", "Remove code"); auto-renew checkbox "Renew this user seat pack automatically" |
| Summary | "Seat Change Summary": "Current seats", "New seats", "Added seats", "Price per seat"; "Order summary": "Subtotal", "Discount", "Tax (GST: 18%)", "Total due today" |
| Proration notes | "Prorated User Seat"; "You're adding a user seat during an active billing period. You'll only pay for the remaining days shown below."; "You will only be charged the prorated amount shown above."; "Calculating prorated amount..."; "Proration could not be calculated" |
| Activation notes | "Seat activates immediately after payment."; "Added seats activate immediately after payment." |
| Link | "Manage users to reduce seats" goes to `/settings/users` |
| Errors | "Invalid coupon code"; "Failed to apply coupon"; "Checkout failed. Please try again."; "Payment cancelled. You can try again anytime."; "Payment verification failed. Please contact support."; "Billing Address Required" / "Please update your billing address to view and purchase plans." |
| API path fragments | `/user/mo`, `/mo`, `/pack` |

### Items that the strings do not settle

| Topic | Gap |
|---|---|
| Permission flags | The 46 individual permission names and their nine-way grouping (job, candidate, report, privacy, user, admin, company, settings, general) are not in the bundles; only five display group headings and one permission name appear. |
| Answer types | Exact option list of the "Answer type" select; names for the yes/no switch and URL types. |
| Database mapping | The list of mappable database fields. |
| Routes | Company Details, Vendors, Child Companies, Hiring Managers, Screening Setup, Evaluation Templates, Referral Portal, Dashboard Experience. |
| API paths | Only `/api/workflow-templates`, `/workflow`, `/api/settings/referral-portal`, `/api/dashboard/*`, `/api/career-page/application-links` and widget paths appear; users, roles, vendors, departments, hiring managers, approvals, screening and evaluation templates expose none. |
| Evaluation templates | Built-in template names, preset weight values, edit/delete actions. |
| Hiring pipelines | Whether "Stage type" is required, list layout (cards or table), limits on stages or sub-stages. |
| Career site | Colour mode option names, language list, exact image dimension rules, mapping of status tags to sections. |
| Customers | The add/edit customer form lives on separate `/customers/*` pages outside this group. |

### Referral portal settings (read from the server)

Setting names: enabled, subdomain, fullUrl, accessType, allowedDomains, allowedEmails, requireApproval, allowExternalReferrers, referralBonusAmount, bonusCurrency. The portal is off for JKKN.


---

## 8. Settings: communication, integrations and system

Source notes: routes marked "confirmed" appear as URL paths in the bundles; routes marked "not in strings" could not be read from the bundles. Settings menu groups seen: General, Team & Access, Recruitment Setup, Communication, Integrations & Tools, System. Menu entries relevant here (title: menu description): Email Templates: "Create and manage email templates"; Scheduling Links: "Manage reusable interview booking links"; Email Preferences / Email Signature / Email Settings: "Configure email settings and signatures"; Notifications: "Manage notification preferences"; Integrations: "Connect email, calendar, and job boards"; Webhooks: "Manage event notifications sent to connected applications"; Developers: "API access and developer tools"; Automations: "Configure automated workflows"; Compliance Settings: "GDPR and compliance settings"; Billing / Invoices: "Manage subscriptions and billing"; Appearance (Beta): "Beta: customize app theme and layout preferences"; also "Set up browser extension" (title not paired in strings).

---

### 1. Email Templates (list page)

- **Route:** not in strings (page bundle `Settings/Communication/EmailTemplates`).
- **Purpose:** "Create and manage email templates for candidate communication".
- **Layout blocks:** page header (title "Email Templates", subtitle, "New Template" button); search box; two filter selects; "Clear filters"; table.
- **API paths seen:** none in the page bundle (automation editor reads `/api/templates`).

**Table columns**

| Column | Content |
|---|---|
| Template | Template name, with subject underneath ("No subject" when blank) (pairing inferred) |
| Type | Template type (see list below) |
| Visibility | "Shared" or "Private"; hints "Shared by <name>" and "Only you can use this template"; "Team member" appears as an owner fallback (inferred) |
| Actions | "More actions for <template>" menu; "Delete template" |

**Filters**

| Filter | Options |
|---|---|
| Search ("Search email templates") | Placeholder "Search templates by name, subject, or content" |
| Visibility ("Filter email templates by visibility") | All visibility; Shared templates; Private templates |
| Type ("Filter email templates by type") | All template types; Candidate Availability Request; Candidate Email; Candidate Interview Confirmation; Candidate Rejection; Extending Offer; Interviewer Invite; Job Post Request; Scorecard Due; Team Email; Github Personalized |
| Clear filters | Button |

"Other" was seen live as a type value; it is not in the strings (probably a fallback for unknown types, inferred).

**Actions:** New Template; view; edit; delete (row menu).

**Dialogs and confirmations:** delete confirm "Are you sure you want to delete this template?" with line "Template : <name>"; buttons Cancel / delete.

**Messages**

| Kind | Text |
|---|---|
| Empty (no data) | "No email templates found. Create your first template to get started." |
| Empty (filtered) | "No email templates match the current search and filters." |
| Toast titles | "Success", "Warning" |

### 2. Email template dialog (view / edit / new)

- **Source:** shared bundle `2469`.
- **Purpose:** create, edit or view one email template.
- **Dialog titles:** "New email template", "Edit email template", "View email template".

**Fields**

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Template name | Text | | "Template name required" |
| Template type | Select ("Select a template type") | Candidate Availability Request; Candidate Email; Candidate Interview Confirmation; Candidate Rejection; Extending Offer; Interviewer Invite; Job Post Request; Scorecard Due; Team Email; Github Personalized | "Template type is required" |
| Subject | Text ("Enter the email subject") | | "Enter a subject" |
| Message ("Template body") | Rich text editor ("Write the email message") | | "Please provide the Email body" |
| Share this template with other users | Checkbox | | "When you share this template with other users, they can also use it while sending emails. Other users won't be able to edit or delete this template." |

**Placeholders (merge fields) panel**: hint "Use placeholders in the subject or body. They are replaced with the corresponding details when the email is sent."; each chip has tooltip "Click to copy <placeholder>". The strings give the chip names; the double-brace token form (for example `{{CANDIDATE_FIRST_NAME}}`) is from live observation, underscore spelling of the others is inferred.

| Chip name | Token (inferred spelling) |
|---|---|
| CANDIDATE FIRST NAME | {{CANDIDATE_FIRST_NAME}} |
| CANDIDATE LAST NAME | {{CANDIDATE_LAST_NAME}} |
| EMAIL SIGNATURE | {{EMAIL_SIGNATURE}} |
| JOB PROFILE | {{JOB_PROFILE}} |
| COMPANY NAME | {{COMPANY_NAME}} |
| JOB LOCATION | {{JOB_LOCATION}} |
| JOB LINK | {{JOB_LINK}} |
| EXPERIENCE REQUIRED | {{EXPERIENCE_REQUIRED}} |
| POSITION SALARY RANGE | {{POSITION_SALARY_RANGE}} |
| LANGUAGE SKILLS | {{LANGUAGE_SKILLS}} |
| GITHUB PROJECTS | {{GITHUB_PROJECTS}} |
| LATEST EVENT DETAILS | {{LATEST_EVENT_DETAILS}} |
| SHARED CANDIDATES LIST | {{SHARED_CANDIDATES_LIST}} |
| GDPR CONSENT LINK | {{GDPR_CONSENT_LINK}} |
| MEETING SCHEDULING LINK | {{MEETING_SCHEDULING_LINK}} |
| SCREENING FORM LINK | {{SCREENING_FORM_LINK}} |

**Actions:** Cancel; Create template (new); Save changes (edit).
**Success messages:** "Template added"; "Template updated".

### 3. Template use inside the email composer (related shared dialog)

- **Source:** shared bundles `9707`, `9676`. Not a settings page; listed because it consumes templates, scheduling links and the signature.
- **Composer modes (dialog titles):** Send Email / Send Emails; Send An Offer Letter; Share selected resumes; Share job with vendors; Send Screening Form; Send Scheduling Link.

| Element | Detail |
|---|---|
| Template picker | "Choose Email Template" / "Choose an email template"; search "Search templates..."; preview "Subject: ..."; button "Apply Template"; "Selected email template"; "Template: <name>"; empty "No templates available" / "No templates match your search" |
| Fields | Recipients ("Type to search or enter email address", "Add recipients...", "Recipients required"); Vendors ("Select Vendors", "Search by company name"); Cc ("Add Cc..."); Bcc ("Add Bcc..."); Screening form ("Select a screening form...", "Please select a screening form", option "Job-specific screening questions"); Subject ("Enter subject...", "Subject is required"); Scheduling Link ("Select scheduling link...", fallback name "Untitled Link"); Email body ("Write email body here..."); Offer letter upload ("Click to upload or drag a file here", "Attach files (.doc, .docx, .pdf, .rtf)", "Job offer letter is required", "Job offer attachments must be 7 MB or smaller.") |
| Checkboxes | Attach Resumes; Include Resumes Link; Include Notes |
| Other buttons | "Insert Link Placeholder"; "AI writing assistant" |
| Send channel | "Send via CVViZ" / "Send via Gmail" / "Send via Outlook" (also "Send email using CVViZ / Gmail / Outlook"); sender name "CVViZ Email Service" |
| Hints | "Each candidate will receive a separate, individual email. They will not see other recipients."; "Recipients limit exceeded": "You have exceeded the combined limit for recipients, cc and bcc. Please keep the recipients count below <n>" |
| Scheduling link gaps | "No Scheduling Links Configured"; "You have not created any scheduling links. Please ..."; "No scheduling links found. Please ..."; "Create a scheduling link in your settings first."; "You can preview the email composer and template, but sending bulk scheduling links is disabled." |
| Results | "Email queued for delivery."; "Email sent."; "Resume email accepted for delivery."; "Job accepted for vendor delivery."; "Job offer accepted for delivery."; "Unable to send email. Please try again."; "Email template not found for key: <key>"; "The secure candidate link could not be created. Please try again." |
| Permission gate | "You don't have permission to send job offers. Ask your administrator to enable 'View & Send Job Offers' for your role." |
| Close confirm | "Discard unsaved draft?": "You have modified this email draft. Closing will discard your changes." Buttons Discard / Cancel |
| API paths | `/calendar/links`, `/api/career-page/application-links`, `/api/email-preferences` |

**AI Assistant sub-dialog** ("Generate email content using AI"; "Choose an action below to generate or improve email content with AI.")

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Action | Choice list | Generate email from description; Improve ("Enhance clarity and professionalism"); Shorten ("Make more concise"); Expand ("Add more detail"); Rephrase ("Rewrite differently"); Change Tone ("Adjust message tone") | "Please write some content first before using this action" |
| Description | Text area ("E.g., Write an interview invitation for Tuesday at 2pm") | | "Please enter a description for your email" |
| Tone | Select | Professional; Friendly; Formal | |

Buttons: Generate ("Generating...", "Generating with AI..."); Regenerate; Insert; Copy to clipboard ("Copied!"); Cancel. Result block "Generated Content". Messages: "Content generated successfully!"; "Failed to generate content. Please try again."; "Content inserted into email"; "Content copied to clipboard"; gate title "Feature Unavailable" (plan flag: AI assistant, inferred).

### 4. Email Preferences

- **Route:** not in strings.
- **Purpose:** "Configure your email signature and reply-to settings".
- **Layout blocks:** card "Email signature" ("Add a signature to your outgoing emails."); card "Reply-to settings" ("Choose where replies are sent and the sender name shown to recipients.").
- **API paths seen:** `/api/email-preferences`.

**Fields**

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Email signature | Rich text editor, placeholder "Type here..." | Toolbar: text formatting (bold inferred), Italic, Underline, Strikethrough, Block quote, Insert link, Clear formatting, Numbered list, Bulleted list, Decrease indent, Increase indent | From shared bundle `4493`: "Image size should not exceed 1Mb"; "You can have only 1 image in signature" |
| Reply-to email | Email input ("Enter reply-to email") | | "Reply-to email is required!"; "Please enter a valid email!" |
| Sender name | Text | | "Sender name is required!" |

**Actions:** "Save signature"; "Save reply-to settings" (two separate saves).

**Messages**

| Kind | Text |
|---|---|
| Success | "Email preferences saved." |
| Save error | "Email preferences could not be saved. Please try again." |
| Load error | "Email preferences could not be loaded": "Retry to load your saved signature and reply-to settings." |

### 5. Notifications

- **Route:** not in strings for the settings page (`/notifications`, `/notifications/all` are the notification center routes).
- **Purpose:** "Choose the updates you receive. Changes save automatically."
- **Layout blocks:** two cards, each with two switches.
- **API paths seen:** `/api/email-preferences`.

**Fields**

| Group | Label | Control type | Hint |
|---|---|---|---|
| Email notifications ("Updates delivered to your email inbox.") | Candidate status changes | Switch | "When a candidate moves to another stage." |
| Email notifications | New applications | Switch | "When a candidate applies through your career page." |
| In-app notifications ("Updates shown in your CVViZ notification center.") | Candidate status changes | Switch | same hint |
| In-app notifications | New applications | Switch | same hint |

**Actions:** none; each switch saves on change.

**Messages:** "Notification preferences saved."; "Could not save notification preferences. Please try again."; "Notification preferences could not be loaded".

### 6. Scheduling Links (list)

- **Route:** `/calendar/links` (confirmed; page title "Scheduling Links - CVViZ"). Source: shared bundle `1859`.
- **Purpose:** "Create reusable booking pages that show live calendar availability." Also: "Share your availability and let candidates book a time."
- **Layout blocks:** header ("Scheduling links", "New link"); counters "Active links", "Paused"; filter chips "Active <n>" / "Paused <n>" (plus All, from live observation); search; sort; refresh; list of link cards; "Showing <n>" count.
- **API paths seen:** `/calendar`, `/calendar/links`, `/settings/billing`, `/settings/integrations`.

**Link card content (inferred from strings):** title (fallback "Untitled scheduling link"); "Reusable booking page"; provider badge (Google / Outlook; "Google Calendar" / "Outlook Calendar"); working days summary ("Mon-Fri" / "Every day"); notice ("No notice"); window ("No date limit"); "Panelists"; "Video meeting included" / "No video meeting"; status Active / Paused; "Public URL will appear after save."

**Filters**

| Filter | Options |
|---|---|
| Status | All (live observation); Active; Paused |
| Search ("Search scheduling links") | Placeholder "Search links" |
| Sort ("Sort scheduling links") | Recently updated; Newest first; Title A-Z |
| Refresh | "Refresh links" / "Refresh scheduling links" |

**Actions (per link):** Copy link; Open public page ("Open booking page for <title>"); edit; Pause link ("Pause <title>") / Activate link ("Activate <title>"); Archive link; "More actions for <title>".

**Dialogs and confirmations:** "Archive scheduling link?": "People with this URL will no longer be able to book from this link." Buttons Archive / Cancel.

**Messages**

| Kind | Text |
|---|---|
| Empty (first use) | "Create your first scheduling link": "Share one reusable booking page with candidates or contacts. CVViZ checks your connected calendar and only shows available time slots." Buttons "Create scheduling link", "Connect calendar" |
| Empty | "No scheduling links yet"; "No scheduling links match your search" |
| No calendar | "Connect a calendar before creating scheduling links": "Scheduling links use your active Google or Outlook calendar to compute live availability."; "Connect and activate Google or Outlook Calendar first." |
| Copy | "Scheduling link copied."; "Could not copy the link." |

**Plan gates:** "Upgrade your plan to create scheduling links."; "Upgrade to copy live scheduling links."; "Upgrade to edit links."; badges "Preview" / "Preview only"; banner "This preview shows how reusable booking pages work. Upgrade to create live links, use panel availability, and share booking pages with candidates." with "Open billing". Preview sample cards: "Reusable booking page for candidate introductions", "Share this with shortlisted candidates after evaluation". Related plan flags: interview scheduling, calendar integration (inferred).

### 7. Scheduling link dialog (new / edit)

- **Source:** shared bundle `1859`. Titles "New scheduling link", "Edit scheduling link".
- **Layout blocks:** stepped form with a live "Public page preview" ("Updates as you configure the link").

**Steps**

| Step | Description |
|---|---|
| Basics | "Name and describe the booking page." |
| Availability | "Control how far ahead and how soon candidates can book." |
| Working hours | "Choose the calendar hours used to generate available slots." |
| Panelists | "Add optional team members and meeting preferences." |
| Review | "Confirm the public booking page before sharing it." ("Review before creating"; summary rows "Booking rules", "Calendar": "Only the connected calendar", "Video meeting": Included / Not included) |

**Fields**

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Link title | Text | | "This is the title candidates see on the public booking page."; error "Add a title" |
| URL slug | Text | | "Optional. CVViZ still uses the secure token in the public URL." |
| Description | Text area ("Share context candidates should see before booking.") | | "Keep this short and candidate-facing. It appears on the public booking page." |
| Set as my Meeting Scheduling Link in Profile Settings | Checkbox | | Feeds the MEETING SCHEDULING LINK placeholder (inferred) |
| Duration | Select | values not in strings | "Length of each booked meeting." |
| Minimum notice | Select | includes "No notice"; other values not in strings | "Prevents last-minute bookings by requiring this much notice." |
| Booking window | Choice | Limited; No limit | "Limit how far ahead candidates can book, or let them browse future availability in rolling windows." No limit hint: "Candidates can keep browsing future availability. The booking page loads dates in rolling windows so it stays fast." |
| Look ahead | Number / select (shown for Limited) | | "How many days into the future candidates can see available slots." |
| Booking guardrails (group) | | | "Buffers keep breathing room around meetings. Daily limits are optional." |
| Buffer before | Select | | "Time kept free before each booking." |
| Buffer after | Select | | "Time kept free after each booking." |
| Daily limit | Number | | "Optional cap for how many meetings this link can create per day." |
| Working hours | Day checkboxes plus time range | Days of week; presets shown as "Mon-Fri", "Every day" | "Candidates will only see slots inside these days and hours."; "These hours apply only to this link and do not change your global calendar settings."; error "Select at least one working day." |
| Time zone | Select | Seen: America/Chicago; America/Denver; Europe/London; Europe/Berlin; Asia/Kolkata; Asia/Singapore; Asia/Tokyo; Australia/Sydney (list may be longer) | |
| Additional panelists | Multi-select / tag input ("Search teammate or type email") | Team members or typed emails | "Optional colleagues whose calendars should also be checked before showing available slots."; "Leave this empty when only your connected calendar should be checked." |
| Add video meeting to bookings | Switch | | "When enabled, each booked event includes a calendar video meeting when the provider supports it." |

**Actions:** Cancel; Create link (new); Save link (edit).

### 8. Public booking page (output of a scheduling link)

- **Route:** `/book/:token` and `/book/:token/confirmed` (confirmed).
- **Purpose:** candidate picks a slot from live availability.
- **Layout blocks:** header ("Book a meeting" / "Interview" / "Interview invitation" / "Scheduling link"); "Video meeting included" badge; month calendar ("Previous month", "Next month"); "Select a Date & Time"; "Display timezone" select; slot list ("Times shown in <tz>"); form; "Confirm booking".

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Display timezone | Select | America/Denver; America/Chicago; America/Toronto; Europe/London; Europe/Paris; Europe/Berlin; Europe/Moscow; Africa/Cairo; Asia/Dubai; Asia/Karachi; Asia/Kolkata; Asia/Singapore; Asia/Tokyo; Asia/Shanghai; Australia/Sydney; Pacific/Auckland (list may be longer) | |
| Your name | Text ("Jane Doe") | | "Tell us your name" |
| Your email | Email | | "We need your email to send the invite"; "That doesn't look like a valid email" |

**Messages:** "Checking availability": "Preparing the booking calendar for your timezone."; "Missing booking token in the URL."; "We couldn't load this booking link. It may be invalid or expired."; "Could not load available times for this scheduling link."; "Could not load more available times for this scheduling link."; "Pick a time slot first." / "Select a time to continue."; "Could not confirm the booking. Try a different slot."; "The recruiter hasn't suggested any slots. Please reply to the email you received."; "No matching times are available in the next <n> ..."; "No matching times are available right now. Try another day or contact the recruiter."; "No times available" with "Look further ahead"; "No dates in this month": "Use the month arrows to browse other available dates."; "Booking unavailable"; "This time has already been booked": "If you need to reschedule, please reply to the email you received."; "This booking has been cancelled": "Please reach out to the recruiter for an alternative."

### 9. Schedule interview dialog (uses the active calendar)

- **Source:** shared bundle `4483`. Title "Schedule interview". Not a settings page; documented because it depends on the calendar integration and creates one-off booking links.
- **API paths seen:** `/settings/integrations`.

| Block | Label | Control type | Options | Validation / hint |
|---|---|---|---|---|
| Scheduling method ("Pick a time now or share slots.") | Method | Choice cards | Book directly ("Pick a slot and send the invite."); Booking link ("Let the candidate choose.") | |
| Participants ("Interviewers and candidate details.") | Panelists | Multi-select / tag input ("Start typing a name or email") | Team members or any work email | "Internal interviewers/colleagues whose calendar availability we'll check. Pick from your team or type any work email."; "Add at least one panelist"; "Enter a valid email for <x>" |
| Participants | Candidate email (optional) | Email | | "Used only when you email a booking link to the candidate."; "Enter a valid email address" |
| Participants | Candidate name (optional) | Text ("Jane Doe") | | |
| Booking link settings ("Candidate-facing availability window.") / Find a time | Duration | Select | values not in strings | |
| same | Look in | Select | Next 3 days; Next 5 days; Next 7 days; Next 14 days | "We will find available slots in <window>" |
| same | Email link to candidate | Checkbox | | "The booking link will be emailed to <email>" |
| Find a time ("Selected slot and availability.") | Slot list | Selectable slots | | "Search availability in your timezone."; "Slots are shown in <tz>"; "Times in <tz>"; "Change time" |
| Event details ("Invite title, conferencing, and context.") | Event title | Text ("Interview with Jane Doe"; default "Interview with <name>" / "Interview") | | "Add a title" |
| Event details | Add Microsoft Teams / Add Google Meet | Switch (depends on provider) | | |
| Event details | Description (optional) | Text area ("Agenda or context for attendees") | | |

**Actions:** Find available slots ("Checking availability...", "Checking panelist availability...", "Searching"); Book selected slot ("Create the calendar event and send invites to panelists."); Get booking link ("Create available slots in the background, then copy and share the link."); Cancel; "Open integrations".
**Header info:** "Booking on <calendar>" (Outlook Calendar / Google Calendar); "Calendar timezone: <tz>".
**Messages:** "Connect a calendar to schedule": "Link Google or Outlook, then mark one calendar as active."; "Connect and activate a calendar before creating a booking link."; "Connect and activate a calendar before finding slots."; "No slots searched yet": "Add panelists, confirm the duration, then search availability."; "No matching slots found": "Try a wider search window, shorter duration, or fewer panelists."; "Select a time slot before booking the interview."; "Select a slot"; "Booking link ready": "Share this URL with the candidate. They'll pick a slot and the event will be created automatically."; "Invite sent to candidate": "We've emailed the booking link to the candidate. You can also copy it below to share another way."; "Booking link copied to clipboard."
**Plan gate:** "You can review the setup, but creating invites and booking links is disabled."

### 10. Integrations (page)

- **Route:** `/settings/integrations` (confirmed).
- **Purpose:** "Connect email, calendars, communication tools, and job boards."
- **Layout blocks:** header "Integrations"; category navigation ("Integration categories"): Email, Calendar, Voice & SMS, Job boards; one card per provider with status tag and buttons.
- **API paths seen:** `/api/integrations/twilio`, `/api/integrations/twilio/voice-tokens`, `/api/integrations/twilio/messages`.

**Integrations and their settings**

| Category | Provider | Description / status text | Actions |
|---|---|---|---|
| Email | Gmail | "Connect Gmail to send and receive candidate email directly in CVViZ."; "Connect Gmail securely to read and send candidate email. Your Google Calendar connection remains separate."; "Reconnect Gmail to restore email access. Your calendar connection is unaffected."; disconnect note "Disconnects Gmail only" | Connect securely; Reconnect; Restart; Disconnect |
| Email | Microsoft 365 Outlook | "Connect Microsoft 365 Outlook to send and receive candidate email directly in CVViZ."; "Reconnect to restore email access. Your calendar connection remains available."; disconnect note "Disconnects both email and calendar for this account" | Connect securely; Reconnect; Restart; Disconnect |
| Email | (section note) | "CVViZ email retention: 45 days" | |
| Calendar | Google Calendar | "Connected as <account>"; tags Connected, Active | Connect <provider>; Set as active ("Use this calendar as the active one for events"); Manage / Manage <provider>; Disconnect <provider> |
| Calendar | Microsoft Outlook Calendar | same | same |
| Voice & SMS | Twilio | Not connected: "Connect Twilio to call and text candidates directly from CVViZ."; connected: "Connected for voice calls and SMS." or "Connected for SMS. Voice calling is not enabled for this environment."; "Account ending in <last digits>" | Connect Twilio; Edit Twilio Settings; Remove Twilio Integration |
| Job boards | Indeed | "Publish eligible jobs to Indeed and receive applications directly in CVViZ."; "Indeed Apply: Enabled / Disabled" | Enable Indeed Apply (see dialog 13) |

Status tags used across cards: Connected; Active; Enabled; Disabled.

**Calendar messages:** "Calendar connection action is in progress."; "Retry loading your calendar connections first."; "Calendar service is unavailable right now. Please try again in a moment."; "Unknown calendar provider: <x>"; "Unknown conferencing provider: <x>".

**Plan gates:** "Calendar Integration is not included in your plan." Twilio and WhatsApp integrations are plan flags; no WhatsApp setup screen exists in the strings of this page.

### 11. Calendar settings dialog ("Manage")

- **Source:** integrations page bundle.
- **Purpose:** choose default calendar, working hours and conferencing for a connected calendar account.

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Default calendar | Select ("Select calendar") | Calendars of the connected account | "New events you create in CVViZ go here unless you pick a different one." |
| Working hours | Day checkboxes plus time range (inferred) | Days of week | "Select at least one working day." |
| Time zone | Select | Seen: America/Chicago; America/Denver; Europe/London; Europe/Berlin; Asia/Kolkata; Asia/Singapore; Asia/Tokyo; Australia/Sydney (list may be longer) | |
| Default conferencing | Select | Google Meet; Microsoft Teams | "Used when you toggle 'Add meeting' on a new event." |

**Actions:** Cancel; Save changes.
**Messages:** "Changes could not be saved": "Your edits are still here. Please try saving again."; "We couldn't load this account's calendars"; "No calendars were found for this account": "Reconnect the calendar or try another account with an active mailbox."

### 12. Twilio Configuration dialog

- **Purpose:** store Twilio credentials for calls and text messages.
- **Notice:** "Credentials are stored server-side and are never returned to this browser. Re-enter them to update this connection."

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Twilio SID | Text ("Enter your Twilio Account SID") | | "Please input your Twilio SID!"; "Invalid Twilio SID!" |
| Auth Token | Password / text ("Enter your Auth Token") | | "Please input your Auth Token!"; "Invalid Auth Token!" |
| Twilio Number | Text | | "Please input your Twilio Number!"; "Invalid Twilio Number!" |
| TwiML App SID (for browser calling) | Text | | "Invalid TwiML App SID!" (optional, inferred) |

**Actions:** Connect / Save changes; Cancel.
**Remove confirmation:** "Are you sure you want to remove Twilio integration?" Buttons Remove / Cancel.
**Error log text:** "Twilio save error:".
**Browser calling runtime messages (shared bundle `981`, Twilio voice library):** "A call is currently in-progress. Leaving or reloading this page will end the call."; microphone permission errors such as "The browser or end-user denied permissions to user media. Therefore we were unable to acquire input audio."

### 13. Indeed Apply / career page integration check

- **Purpose:** verify the career page is linked from the company website, then enable Indeed Apply.

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Career page URL | URL input | | "Enter a complete URL starting with https:// or http://." |
| I confirm that I've integrated the career page in my website | Checkbox | | |
| I understand that jobs selected for Indeed will be published with Indeed Apply enabled. | Checkbox | | |

**Actions:** Check integration; Retry check; Enable Indeed Apply; link "Learn how to integrate career page".
**Messages:** "Website integration verified": "The career page link was found on your website."; "Career page integration not detected": "We could not find the CVViZ career page link at the website address you checked. Confirm the URL is public, then add the direct link or embed code and verify again."; "The career page could not be checked": "Please retry. Your URL has been kept."; "Unable to update the Indeed Apply integration."

### 14. Calendar callback and Email callback pages

| Page | Route | Purpose | Messages |
|---|---|---|---|
| Calendar callback | not in strings | Landing page after the calendar provider's authorization redirect | "Please wait while the server completes the secure setup."; "No authorization code received." |
| Email callback | not in strings | Landing page after the mailbox provider's authorization redirect | "Please wait while CVViZ confirms the secure mailbox connection." |

### 15. Automations (list tab)

- **Route:** `/settings/automations` (confirmed).
- **Purpose:** "Keep your hiring process moving, automatically." / "Automate routine emails, follow-ups, and status updates with a few simple rules."
- **Layout blocks:** header; tabs Automations / Templates / Auto-evaluation; status filter; search; "Filters" panel; "Applied filters" chips; table; sub-line "Manage emails, reminders, and status updates for <scope>"; note "Enabled workflows run when their trigger occurs."
- **API paths seen:** `/api/recruiter-automations`, `/api/templates`, `/api/jobs`, `/jobs`, `/api/grades`, `/api/pickers/recruiters`, `/api/automation-settings/automatic-evaluation`; shared: `/api/workflow-templates`, `/workflow`.

**Table columns**

| Column | Content |
|---|---|
| Automation (name) | Name (fallback "Untitled"); workflow type |
| Applies to | Job(s) ("Untitled job" fallback; "Shared across <n> ..." when assigned to several jobs; "Jobs: ...") |
| Timing | "Immediately"; "After <duration>"; "Scheduled"; "Delay not set"; "Schedule not set" |
| Status ("Automation status") | Enabled / Paused switch or tag |
| Actions ("Actions for <name>") | Edit automation; Enable / pause; Delete automation |

Row summary phrases: "Email: <template>"; "Match: <status>"; "Move to <status>"; "Any status"; "Run the configured action"; warning "Some saved references are unavailable: <list>".

**Filters**

| Filter | Options |
|---|---|
| Status | All; Enabled; Paused (All from live observation) |
| Search ("Search automations") | Placeholders "Search by name or action" / "Search by name, job, or action" |
| Job ("Filter by job") | All jobs; each job; chip "Selected job"; "Remove job filter" |
| Workflow type ("Filter by workflow type") | All workflow types; each workflow type (see section 16); "Remove workflow type filter" |

**Actions:** Create automation; "Create your first automation"; Enable; pause; Edit automation; Delete automation.

**Dialogs and confirmations:** "Delete automation?": "This rule will be permanently deleted. To stop it temporarily, pause it instead."; shows "Jobs: <list>"; input "Type DELETE to confirm"; buttons Cancel / Delete automation.

**Messages**

| Kind | Text |
|---|---|
| Empty (no data) | "No automations yet" |
| Empty (filtered) | "No matching automations": "Try another search or adjust your filters." |
| Toggle | "Automation enabled."; "Automation paused."; "The status could not be changed. Please try again." |
| Delete | "Automation deleted."; "The automation could not be deleted. Please try again." |
| Load errors | "Automations are unavailable"; "Your automations could not be loaded. Please try again."; "Some workflow details are unavailable"; "Could not load <item>" |

**Plan gate:** "Workflow automation is unavailable on your plan." (plan flags: workflow automation, pre-screening automation). Billing shows "Automation runs included in your plan".

### 16. Automations: Templates tab ("Workflow templates")

- **Purpose:** "Start with a common hiring task, then customize the details."
- **Layout blocks:** search ("Search templates" / "Search workflows"); category filter ("Template category"); template cards with "Use template <name>"; "None enabled" marker.

**Filters:** category: All workflows; Email & notifications; Status updates; Reminders. "Clear filters".

**The six workflow templates** (name, category tag, trigger, action and description are separate strings; row pairing is inferred from their order in the bundle)

| Template | Category tag | Trigger ("When this happens") | Action ("Do this") | Description |
|---|---|---|---|---|
| Application acknowledgement | Email | Candidate applies | Send an acknowledgement email | "Welcome applicants with a timely email after they apply for a job." |
| Status change email | Email | Candidate status changes | Email the candidate | "Keep candidates informed when they move to a new stage in your hiring process." |
| Ranking notification | Notification | Ranking completes | Notify your recruiting team | "Let your recruiting team know when candidate rankings are ready to review." |
| Prescreening outcome | Status update | Prescreening completes | Update status based on results | "Move candidates to the right status based on their prescreening results." |
| Resume follow-up | Reminder | No response to a shared resume | Send a follow-up reminder | "Remind hiring managers to review shared resumes when a response is overdue." |
| Grade-based status update | Status update (inferred) | Candidate receives one of the chosen grades (from hint "Run when a candidate receives any of these grades.") | Update status by candidate grade | not in strings |

Generic fallback for unknown types: name "Automation" / "Workflow"; trigger "Configured event"; action "Run the configured action"; description "Run an action when the configured conditions are met."

**Messages:** "No workflows match these filters."; "No templates are available."; "Workflow choices are unavailable. Please retry loading them."; "The template for this automation is unavailable. Please refresh and try again."

### 17. Create / Edit automation dialog

- **Titles:** "Create automation"; "Edit automation".
- **Step 1 of 2: "Choose a workflow"**: "Select the hiring task you want to automate."; footer hint "Next: configure the action and timing for this job." or "Next: configure jobs, conditions, and timing."; "Not selected yet".
- **Step 2: configuration** with a side "Workflow preview" in three parts: "When this happens" (trigger), "Then wait" / "At the right moment" (timing: "No delay" / "No waiting"), "Do this" (action: "Send an email" / "Update candidate status"). Header button "Change template". Status line: "This automation is enabled" / "This automation is paused" / "Runs automatically once enabled"; "Ready to <action>"; tag "Unsaved changes".

**Fields (all triggers, conditions and action settings found)**

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Automation name | Text | | "Give this automation a name." |
| Jobs (applies to) | Job select (single or multi, depending on workflow) | Jobs from `/api/jobs` | "Shared across <n> ..."; "Changes to this automation apply to every assigned job." |
| Department | Select | Departments | condition |
| From status | Select ("Select a status") | Pipeline statuses; "Any status" | condition for status change workflow |
| To status | Select ("Select a status") | Pipeline statuses | "Runs when a candidate enters the destination status." |
| When criteria match | Status select | Pipeline statuses | Prescreening outcome: status to move to when criteria match |
| When criteria do not match | Status select | Pipeline statuses | Prescreening outcome: status to move to otherwise |
| Candidate grades | Multi-select | Grades from `/api/grades` | "Run when a candidate receives any of these grades." |
| Days without a response | Number | | "Start the reminder when this many days pass without a response."; "The response deadline above determines when the reminder condition is met." |
| Maximum reminders | Number | | "The maximum number of follow-up reminders." |
| Email template | Select | Templates from `/api/templates` | Preview "Subject: ..." ("No subject"); "Personalized fields will be filled in when the email is sent." |
| Send from | Select ("Choose a sender") | Recruiters from `/api/pickers/recruiters` | "Choose a sender." |
| Recipients | Multi-select | Team recipients | "Choose <item>" |
| Screening form | Select | Screening forms | "Choose the screening form to include in this email."; "Included through the screening form link in your email template."; "Screening forms could not be loaded." |
| When to run | Choice | Immediately ("No waiting"); After a delay ("Minutes, hours or days"); Scheduled ("A specific date & time") | "Choose an available timing option." |
| Wait for | Number plus unit | Minutes; hours; days (unit strings seen: "Minutes"; hours and days implied by "Minutes, hours or days") | "Enter a duration of at least 1 minute." |
| Date and time | Date-time picker (format `DD MMM YYYY, HH:mm`) | | "Choose a date and time in the future."; shows "Timezone: <tz>" |

**Pipeline statuses usable in status fields** (list from shared bundle `8317`): New Candidate; No Response - Phone; Phone Screened; Internal Review; Shared; Internal Shortlisted; Resume Shortlisted; Assessment; Interviewed; Submitted to Client; Submitted to Partner; Submitted to AM; Assessment/Trial Invited; Assessment/Trial Accepted; Assessment/Trial Scheduled; Assessment/Trial Passed; Intermediary Interview stage; Final Interview Invited; Final Interview Accepted; Final Interview Scheduled; Final Interview Passed; Job Offered; Offer Rejected; Offer Accepted; Background Screening; Not Joined; Internal Hold; Joined; Rejected; Interview Reject; Job Offer Reject; Phone Screen Reject; Not Shortlisted; Candidate No Show For Interview; Interview Declined By Candidate; Internal Screening Reject; Assessment/Trial Failed; Rejected by AM; Rejected by Client; Rejected by Partner; Final Interview Failed; Not Interested.

**Actions:** Cancel; "Create and enable"; Save changes; Change template.

**Dialogs and confirmations:** "Discard unsaved changes?": "Your changes to this automation have not been saved." Buttons "Keep editing" / "Discard changes".

**Messages**

| Kind | Text |
|---|---|
| Success | "Automation saved and enabled."; "Automation updated." |
| Error | "Automation was not saved"; "The automation could not be saved."; "We could not save this automation. Your changes are still here. Please try again." |
| Warnings | "Some form choices could not be loaded"; "This template contains a field that this editor does not support yet."; "A saved selection is unavailable in the current list. It will be preserved unless you replace it."; "Unavailable <item>" |

### 18. Automations: Auto-evaluation tab

- **Title:** "Candidate auto-evaluation": "Manage automatic evaluation and the criteria used in your hiring process."
- **API paths seen:** `/api/automation-settings/automatic-evaluation`.

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Enable auto-evaluation | Switch | Enabled / Disabled (tags also: Unavailable; Unsaved) | "Use automatic candidate evaluation with the criteria configured for your jobs." |

**Other elements:** link block "Configure criteria for each job" with button "Open jobs" (to `/jobs`); save bar states "You have unsaved changes" / "All changes saved" / "Settings unavailable"; buttons "Discard changes", "Save changes".
**Messages:** "Auto-evaluation settings saved."; "Your changes could not be saved. Please try again."; "Automatic evaluation settings could not be loaded."; "Automatic evaluation settings are unavailable"; "The automatic evaluation service returned an invalid response."
**Plan gate (inferred):** plan flags customize evaluation / advanced screening.

### 19. Appearance (Beta)

- **Route:** not in strings.
- **Purpose:** "Customize color mode, theme color, layout, and navigation display."
- **Layout blocks:** three groups plus footer note "Appearance changes apply to your workspace. Some beta options may evolve."; buttons "Reset to defaults", "Copy settings JSON", "Open theme settings".
- **API paths seen:** `/settings/billing` (upgrade link).

**Fields**

| Group | Label | Control type | Options | Validation / hint |
|---|---|---|---|---|
| Color theme ("Control app color mode, contrast style, and brand color.") | Color Mode | Choice | Match system (System); light; dark (inferred from "Dark style" / "Light style") | |
| Color theme | Page Style | Choice | Light style; Dark style | |
| Color theme | Theme Color | Swatches plus "Pick a custom color" | Dust Red; Volcano; Sunset Orange; Polar Green; Daybreak Blue (default); Geek Glue; Golden Purple; custom | |
| Layout & Navigation ("Choose how primary navigation and page chrome behave.") | Navigation Mode | Choice | Side menu; Top menu | |
| Layout & Navigation | Content Width | Select | values not in strings | "Set the content container width style." |
| Layout & Navigation | Fixed Header | Switch ("Enable Fixed Header") | | "Keep the top header visible while navigating pages." |
| Layout & Navigation | Hidden Header on Scroll | Switch | | "Auto-hide the header when you scroll down." |
| Layout & Navigation | Fixed Sidebar | Switch | | "Pin the side navigation while page content scrolls."; "Available only when Navigation Mode is Side Menu." |
| Accessibility ("Improve visibility for color perception differences.") | Weak Mode | Switch | | "Adjust colors for improved visual accessibility." |

**Messages:** "Copied. Replace defaultSettings in src/models/setting.js if needed." (developer-facing copy toast).

**Plan gate:** upgrade panel "Appearance customization is available on higher plans.": "Give every recruiter a workspace that feels familiar, readable, and consistent across browsers."; feature rows "Color theme: Color mode, page style, and brand color" and "Layout & Navigation: Top menu, side menu, fixed header, and sidebar"; "Included with appearance customization": "Saved across browsers", "Consistent team workspace", "Improved readability controls"; "Upgrade to unlock these controls and save changes."; button "Upgrade plan".

### 20. Billing (page)

- **Route:** `/settings/billing` (confirmed).
- **Purpose:** "Manage your plan, usage, add-ons, and invoices."
- **Layout blocks (tabs, inferred from strings):** Overview; Usage ("View usage", "View all usage"); Add-ons; Invoices. Trial banner texts: "Trial ends in <n>"; "Trial has ended"; "Free plan active"; "Expires in <n>".
- **API paths seen:** `/api/billing/email-marketing`, `/api/billing/email-marketing/catalog`, `/api/billing/email-marketing/checkouts`, `/email_campaigns`; shared checkout bundle: `/user/mo`, `/mo`, `/pack`, `/settings/users`.

**Overview: "Current plan" card**

| Element | Values |
|---|---|
| Plan kind | Subscription; Trial subscription; Lifetime plan; Free trial |
| Billing interval | Billed annually; Billed monthly |
| Date rows | Renews on; Access until; Trial ends; Ended on; Access (date format `MMM D, YYYY`; "Not specified"; "No expiry") |
| Other rows | Plan status; Billing currency |
| Auto-renew | "Auto-renew enabled"; "Cancel auto-renew to end renewal. Access continues until the current period ends." |
| Buttons | Upgrade plan; View usage; Cancel auto-renew |
| Note | "Purchased add-ons have their own validity periods. See Add-ons for expiry and setup details." |
| Loading / error | "Loading current plan"; "No subscription details are available."; "Subscription details could not be loaded": "Retry to see your current plan and usage." |

**Cancel auto-renew confirmation:** "Cancel auto-renew?": "Your subscription remains available until the current period ends." Buttons "Cancel auto-renew" / "Keep auto-renew". Results: "Auto-renew canceled. It will stop at period end."; "Failed to cancel auto-renew. Please try again."; "No active subscription found to cancel."

**Overview: "Billing details" card**

| Row | Note |
|---|---|
| Company | "Not provided" when blank |
| Billing email | |
| Address | button "Edit address" |
| GST number | |

Messages: "Complete your billing address before your next purchase."; "Billing details could not be loaded"; "Loading billing details".

**Overview: summaries:** "Usage summary" / "Usage at a glance" ("Review usage"); "Add-on summary" ("Manage add-ons"; "Complete setup to use these add-ons."; "Review setup").

**Usage: meters**

| Group | Meter | Description | Action |
|---|---|---|---|
| Account capacity ("Current seats, stored resumes, and active jobs.") | User seats | "Active and invited users occupying seats" | Add user seats |
| Account capacity | Resume storage | "Resumes stored in your account" | Add capacity |
| Account capacity | Active jobs | "Jobs currently open for hiring" | Add job slots |
| Credits & usage ("Your current allowance includes applicable purchased capacity.") | Automations | "Automation runs included in your plan" | |
| Credits & usage | Advanced parsing | "Advanced resumes processed or currently reserved in this cycle" | Buy credits |
| Credits & usage | Advanced screening | "Candidates screened in the current cycle" | Buy credits |
| Credits & usage | People search | "Search credits used"; "No search credits are included in your current plan" | |
| Credits & usage | Contact reveals | "Contact details revealed"; "No contact reveal credits are currently available" | Buy credits |

Meter states: Unlimited; Over limit; Limit reached; Running low; Not included; Usage unavailable; Included with plan. Note: "Parsing and screening usage is measured for the current cycle. Credit reset dates and purchase-level balances are not available here." Empty: "No usage details are available."; loading "Loading usage".

**Add-ons: "Your add-ons"** ("Manage purchased capacity and complete setup."; "View your purchases, validity periods, and available options.")

| Element | Values |
|---|---|
| Filter ("Filter add-ons by status") | All add-ons; status values Active; Setup required; Scheduled; Expired; Status unavailable |
| Card rows | Purchased; Expires ("Expires <date>" / "No expiry"); Capacity; Configured items |
| Card buttons | Manage; View details; Complete setup; Renew add-on; "Renew API add-on" |
| Empty | "No add-ons purchased yet"; "No add-on details have been configured yet."; "Show all add-ons" |
| Errors | "Your add-ons could not be loaded"; "This add-on is not active yet."; "You cannot add items to an expired add-on."; "External-domain user access requires active Multi-Domain Access. Renew the add-on to restore eligible users." |

**Add-ons: "Available add-ons"** ("Explore add-ons": "Add capacity or extend your account with optional features.")

| Add-on | Description | Button |
|---|---|---|
| Advanced Parsing Credits | "Process more resumes with advanced parsing." | View packs |
| Advanced screening credits | "Evaluate more candidates against your job requirements." | View packs |
| Contact reveal credits | "Reveal available candidate contact details." | View packs |
| Custom career page domain | "Use your own domain for your career page. DNS setup required." | View options |
| Additional domains | "Add more domains to your account." | View options |
| API access | "Connect your recruiting workflows through the CVViZ API." | View options; "Pricing available in options" |

Messages: "Available add-ons could not be loaded"; "No add-ons are currently available for your plan."

**Add-on detail: Additional domains (multi-domain access)**

| Label | Control type | Validation / hint |
|---|---|---|
| Configured domains / Domain capacity | List plus counter | Empty: "No domains have been added yet. Add one to route hiring activity across another domain."; "You can only add up to <n> ..." |
| Domain | Text; button "Add domain" | "Please enter a domain"; "Please enter a valid domain, for example example.com"; "This domain is already added."; success "Domain added successfully."; error "Unable to save the domain. Please try again." |

**Add-on detail: Custom career page domain (CNAME mapping)**

| Label | Control type | Validation / hint |
|---|---|---|
| Career page mappings / Mapping capacity | List plus counter | Empty: "No career page mappings have been configured yet. Add a custom domain to start verification." |
| Custom domain | Text | "Please enter the custom domain"; "Please enter a valid custom domain URL" |
| Mapped career page | URL (with "Edit mapped career page", "Visit mapped career page") | "Using your current CVViZ career page. Click edit if you need to map a different page."; "Please enter the mapped career page"; "Please enter a valid career page URL" |
| Add mapping | Button | "This mapping already exists."; "CNAME mapping added successfully." |

DNS setup panel: "Add this CNAME in the DNS settings for <domain>"; row "Target"; "Routes to <page>"; "How to add it": 1) "Open your DNS provider for <domain>", 2) "Add a CNAME record named <name>", 3) "Point it to jobs.cvviz.com and save"; "Example: in GoDaddy, Cloudflare, or Namecheap, open DNS Records, choose CNAME, enter ..."; "DNS updates can take a few minutes, and sometimes up to 24 hours, to propagate."; status "Verified": "DNS verification is complete for this custom domain."; copy toasts "Copied to clipboard." / "Unable to copy. Please copy it manually."

**Add-on detail: API access limits:** Monthly requests; Daily requests; Requests per minute; Concurrent requests.

**AppSumo code:** button "Redeem AppSumo code"; field "AppSumo redemption code" ("Enter your AppSumo code"); "Please enter your AppSumo code."; "AppSumo code applied successfully."; "The AppSumo code could not be applied."

**Invoices tab**

| Column | Content |
|---|---|
| Invoice | "Invoice <number>" or "Credit note"; "View invoice <number>" |
| Description | Plan name, "Credit purchase", "Add-on purchase", "Credit Pack" |
| Date | format `DD MMM YYYY` (column heading not in strings) |
| Amount | "Amount unavailable" fallback |
| Status | Unpaid; Pending; Failed; Refunded; Cancelled; Overdue; Unknown (paid value not in strings) |
| Actions | Download PDF ("Download invoice <number>"); "View tax invoice"; "View credit note"; Download |

Filters: search ("Search invoices", placeholder "Search invoice number or description"); "Invoice status" (All statuses plus the statuses above); "Invoice start date" / "Invoice end date" ("From date", "To date"); "Clear filters".
Messages: "No invoices yet. Your invoices will appear here after a purchase."; "No invoices match your filters."; "Invoices could not be loaded"; "Invoice history is unavailable."; "Invoice could not be loaded"; "Loading invoice preview".

### 21. Plan selection and checkout dialog

- **Source:** shared bundles `5052`, `768`. Opened by "Upgrade plan" and by the add-capacity buttons.
- **Steps ("Purchase progress"):** "Choose a plan" (or "Choose a pack") then "Review & pay".
- **Payment provider:** Razorpay checkout ("Missing Razorpay checkout key").

**Plan step:** title "Select a plan to continue" / "Choose the plan that best fits your hiring needs" / "Compare plans and choose the one that best fits your hiring workflow."; "Billing interval" toggle: Billed Monthly; Billed Yearly ("Save up to 12%"); plan cards with tags "Current Plan", "Popular", "Selected"; buttons "Select Plan" / "Select"; link "Compare all plans & features" / "Compare Plans & Features" (comparison table heading "Feature / Limit"); "Prices exclude applicable taxes". "Starter" and "Growth" appear as tier names in the API add-on bundle; ATS plan names are not in the strings.

**Plan limit rows shown on cards**

| Limit | Description |
|---|---|
| User Seats / Number of Users | "Team members included in the plan." |
| Active Jobs | "Open job slots available to your team." |
| Resume storage | "Resumes that can be stored in your account." |
| Automations | "Workflow automations included in the plan." |
| Parsing credits | "Advanced parsing credits included in each billing cycle." |
| Advanced Screening Credits | "Advanced screening credits included in each billing cycle." |

**Pack purchase types**

| Purchase | Pack name | Hint | Auto-renew checkbox |
|---|---|---|---|
| Add user seats | User Seat Pack ("One-time user seat pack") | "Add seats so more team members can access your account." | "Renew this user seat pack automatically" |
| Add resume storage | Resume Pack ("One-time resume pack") | "Choose how much additional resume storage you need." | "Renew this resume pack automatically" |
| Add job slots | Job Pack ("One-time job pack") | "Add capacity to keep more jobs open for hiring." | "Renew this job pack automatically" |
| Additional domains | Domain Access Pack ("One-time domain access pack") | "Choose how many additional domains you need for your account." | "Renew this domain pack automatically" |
| Custom career page domain | Career page domain pack ("One-time CNAME add-on") | "Use your own domain for your career page. Domain setup follows payment."; "Connect and verify your domain after payment." | "Renew this CNAME add-on automatically" |
| Advanced parsing credits | Parsing Credit Pack | "Choose a credit pack. Review the total before paying." | "Renew this pack automatically" |
| Advanced screening credits | Screening Credit Pack | same | same |
| Contact reveal credits | Contact Credit Pack | same | same |

Pack card rows: "Pack includes" / "Includes per pack"; "Price per unit"; "Pack price"; "Pack validity" / "Validity: <period>" ("No expiry", "Validity not specified"); "All options are valid for <period>". Buttons: "Select Pack"; "Change pack"; "Back to plans"; "Review order". Empty: "No packs are available for this selection."; "No purchase options available": "There are no purchase options available for this item on your current plan. Contact support for help adding capacity."; "Unable to load options" with "Try again".

**Seat selector:** "Number of user seats"; "Choose the total seats needed for your team" / "Choose how many users need access"; "You currently have <n>"; "Minimum <n>"; rows "Current seats", "New seats", "Added seats", "Price per seat", "Active Users", "New seat limit"; link "Manage users to reduce seats" (`/settings/users`).

**Review & pay ("Order summary")**

| Row | Note |
|---|---|
| Selected plan / pack | "Your selected pack"; "Current plan"; "Updated to" |
| Promo code | "Add promo code"; field "Promo code" ("Enter promo code"); "Remove code"; messages "Coupon applied successfully!", "Invalid coupon code", "Failed to apply coupon", "Coupon is not valid for the selected plan", "Failed to validate coupon" |
| Subtotal; Discount / Coupon discount; Subtotal after discount | |
| Tax (GST: 18%) | |
| Total due today / Amount due today | |
| Proration | "Mid-Cycle Upgrade": "You're upgrading from an active paid plan. You'll only pay the prorated difference for the remaining days."; "Prorated User Seat": "You're adding a user seat during an active billing period. You'll only pay for the remaining days shown below."; rows "Full price", "Prorated for <days>", "Saved due to proration", "Current plan unused credit", "Prorated Upgrade Cost", "Seat Change Summary", "Billing Breakdown"; "Calculating prorated amount..."; "Proration could not be calculated" |
| Renewal note | "Automatic renewal": "Renews and charges automatically at the end of each <period>" or "One-time purchase. You will not be charged automatically."; "Recurring subscription" |

**Gates and errors:** "Billing Address Required": "Please update your billing address to view and purchase plans." Button "Update Billing Address"; "Checkout failed. Please try again."; "Payment cancelled. You can try again anytime."; "Payment verification failed. Please contact support."; "Payment verification timeout. Please contact support."; "Payment failed. Please try again or contact support."; "Please contact support if the payment was deducted from your account."
**Progress:** "Preparing your checkout, just a moment..."; "Processing payment..."; "Generating invoice and activating subscription..."; "Please wait while we confirm your payment..."
**Success screen:** "Upgrade complete" / "Payment complete"; "Your account has been successfully upgraded to your new plan."; "Your subscription has been updated. You can find the invoice in Billing."; "Your career page domain pack has been added. Complete domain setup in Billing to start using it."; rows "Validity", "Next step" ("Complete DNS setup" / "Available immediately"), "Invoice" ("Ready to download" / "Generated"), "Status" ("Activated"), "Reference Code: <code>"; buttons "Download invoice" / "View Invoice", "Continue".
**Expired account screen:** "Access Restricted!": "It seems your subscription has expired. Please contact your admin."

### 22. Email marketing credits (billing sub-page)

- **Route:** not in strings (reached from Billing; "Return to marketing" goes to `/email_campaigns`).
- **Purpose:** "Credit purchases and delivery for this workspace."
- **API paths seen:** `/api/billing/email-marketing`, `/api/billing/email-marketing/catalog`, `/api/billing/email-marketing/checkouts` (request header `Idempotency-Key`).
- **Layout blocks:** "Email credits" balance; "Email credit packs" / "Email credit offers" ("Choose <pack>", "Reload offers"); "Recent credit purchases" ("Refresh status"; "Up to 20 paid purchases. Test credits and pending payments are not listed here.").

**Review dialog ("Review email credit purchase")**: rows "Pack: <name>", "Total: <amount>"; terms "Credits expire exactly 90 days after successful payment. Earlier-expiring credits are used first. This purchase does not extend older credits. No automatic renewal."; "No routine refunds. Contact support for duplicate charges, payment errors or missing credits."; required checkbox "I understand the 90-day expiry and purchase terms."; usage rule "One credit per recipient email accepted by the provider, including test emails. Delivery is not guaranteed."

**Purchase states:** "Checking payment and credit delivery"; "Payment received": "Credits are being added. Please do not purchase again."; "Credits added": "View your available balance in Marketing settings."; "Purchase needs review" / "Needs attention": "Credit delivery needs review. Contact support with the reference below."; "If you paid, do not pay again. Contact support if this status persists."; buttons "Check status", "Buy another pack", "Try again". History rows: "Valid for 90 days from payment. Expires <date>"; "Credit period <range>"; "This is a past credit addition, not your remaining balance."

**Messages:** "No paid email-credit purchases yet."; "Credit purchases are not available yet": "Email credit checkout is being prepared. Other ATS add-ons do not increase your marketing balance."; "Complete your billing address before purchasing email credits."; "Email credit information is unavailable."; "Email credit offers could not be verified."; "Could not load credit packs. Existing purchases are unchanged."; "Credit offers timed out. Please reload offers."; "Payment window could not load. Please retry."; "Checkout could not be verified. Contact support before retrying."; "Checkout is unavailable. Please retry with the same pack."; "Could not load email credits"; "Purchase status could not be checked. This does not mean a payment failed."; "Your session changed": "Reload this page to view the current workspace."

**Permission / plan gate:** "Email marketing is not available for this account": "An eligible workspace administrator can access email marketing billing." (plan flags: email marketing, email campaigns).

### 23. API add-ons (purchase flow)

- **Source:** shared bundle `2456`. Reached from Developers ("API add-ons") and Billing ("API access").
- **Purpose:** "Connect your tools with CVViZ. Your existing ATS plan stays unchanged."

**Account states**

| State | Text | Action |
|---|---|---|
| No active subscription | "An active ATS account is required": "Restore your account subscription before requesting or purchasing API access." | |
| Not offered yet | "API add-ons are not yet available for this account": "We are introducing availability in stages. Your existing plan is unchanged." | |
| Can request | "Request approval to purchase an API add-on. Approval does not activate API access or charge your account." | Request API access; Explore API documentation |
| Under review | "Your request is under review": "Once approved, available API plans and purchase options will appear here. No payment is due yet." | |
| Declined | "New API purchases are unavailable": "Contact support to review purchase eligibility. Existing paid API terms are not cancelled by this decision." | |
| Approved | "Approved to purchase"; if no pricing: "Plans are being prepared": "Your approval is saved. Purchase options will appear when pricing is available." / "Pricing coming soon" | Review purchase |
| Active | "API access is available": "Manage credentials and view usage in Developer tools. Purchased add-ons keep their own validity period." | |

**Request form**

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Preferred tier (optional) | Select | Starter; Growth | |
| What would you like to connect? (optional) | Text area | | |

Button "Submit request"; results "Your API access request has been submitted." / "Could not submit your request."

**Plan cards:** tiers Starter, Growth; interval toggle Monthly / Annual ("For one month" / "For one year"); limit rows "Requests / month", "Requests / day", "Requests / minute", "Concurrent requests".

**Review dialog ("Review API add-on purchase")**: rows "Subtotal: <amount>", "Total: <amount>"; note "Access starts after verified payment. A same-tier renewal starts after your existing API term ends."; button "Proceed to payment"; non-billing users see "Ask an account administrator or a user with billing permission to complete the purchase."

**Messages:** "Your API add-on purchase is complete."; "Checking payment and activation": "If you completed payment, do not pay again. We are verifying activation. Checkout reference: <ref>" with "Check status"; "Pricing changed. Review the updated total before paying."; "Checkout could not load. Please try again."; "Could not prepare checkout."; "Unable to open checkout."; "Unable to check payment."; "Unable to load API access."; "Loading API access"; "Refresh".

### 24. Compliance Settings (GDPR Compliance)

- **Route:** not in strings.
- **Purpose:** "Manage personal data processing and GDPR compliance settings for your organization".
- **Layout blocks:** header "GDPR Compliance"; card "GDPR tools" ("Manage consent preferences and personal data requests.") with switch "Enable GDPR compliance" and status tag Active / Inactive; when enabled, tabs Overview; Preferences; Consent Form; Data Request Form.
- **API paths seen:** none in the bundle.

**Off state:** "GDPR tools are turned off": "Enable these tools to configure consent preferences and data request forms. You can review the data processing agreement before activation."

**Activation dialog ("Data Processing Agreement")**: agreement text; checkbox "I accept the terms and conditions of data processing agreement"; button "Activate GDPR".

**Overview tab**

| Block | Content |
|---|---|
| "Consent records <n>" / "Consent Requests : <n>" | Counters by status: Obtained; Waiting; Not responded / Not Responded; Pending |
| "Data requests <n>" / "Data Requests : <n>" | Counters by type: Access; Rectify; Export; Stop processing; Delete |
| Consent table | Columns: File Name (links "View File" / "View Resume"); Consent Status. Empty: "No consent requests found." |
| Data request list | Each item: request type; requester name and email (inferred); "Date: <DD MMM YYYY, hh:mm A>" ("Date unavailable"); status control ("Data request status", "Click to change status") with values Pending and Closed; action button depending on type. Empty: "No requests found!" |

Data request types and their action buttons (pairing inferred): Access data / Information: "Email Candidate"; Rectify Data / Update Data: "Update"; Export Data: "Export"; Stop Processing Data: "Stop Processing"; Delete Data: "Delete".
Error: "Could not update the data request."

**Preferences tab**

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Waiting Period (Consent waiting period) | Number plus unit select ("Consent waiting period unit") | Day(s); Week(s); Month(s) | "How long to wait for a response to a consent request." |
| Manage actions when record is unavailable ("Action when consent is unavailable") | Select / radio | Process data as usual; Stop processing data | "Choose how to handle candidate data when consent is unavailable." |
| Delete data automatically after (Data retention period) | Number plus unit select ("Data retention period unit") | Units seen: Year(s); also Day(s), Week(s), Month(s) may apply (inferred) | "The retention period used for automatic data deletion." |

Messages: "Could not update compliance settings."; "Compliance settings could not be loaded".

**Consent Form tab** (editable preview of the public consent form): note "Edit the text below to customize the public form. Submission is disabled in this preview."

| Label | Control type | Note |
|---|---|---|
| Communication preferences | Checkbox group (editable text) | |
| Consent Statement | Editable text | |
| Privacy Statement | Editable text | |
| Remarks (optional) | Text area ("Remarks (if any)") | |
| Submit My Consent | Button (disabled in preview) | |

**Data Request Form tab** (preview of the public request form): "GDPR Data Request link : <url>" with copy; "Public data request link is unavailable" when missing.

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| What's your name ? | Text ("Your full name") | | "This field is required!" (public form) |
| What's your email address? | Email ("Email Address") | | "Please enter a valid email address!" (public form) |
| What do you want to get done? | Select ("Select an option") | I want company to delete my personal data; I want company to export my data; I want company to rectify incorrect data you have about me; I want to know how you are using my personal information; I want company to keep my data, but stop processing it | "Please select an option!" (public form) |
| Describe the data you want to rectify | Text area (shown for the rectify option, inferred) | | "Please describe the data you want to rectify" (public form) |
| Submit my request | Button | | |

**Public pages produced by these forms**

| Page | Route | Messages |
|---|---|---|
| Consent Form | `/consent/:id`, `/consent/:id/:legacy`, `/consent/:id/success` | "Consent form unavailable"; "This consent link is incomplete or no longer available."; "This consent link is invalid or no longer available."; "Could not submit your consent."; success "Thank you!": "We will process your data based on your consent received." |
| GDPR Request Form | `/gdpr/:id`, `/gdpr/:id/success` | "Privacy request unavailable"; "This privacy request form is unavailable."; "Could not submit your privacy request." |

Related: the email composer warns "Consent required for data processing"; email templates offer the GDPR CONSENT LINK placeholder.

### 25. Developers ("Developer tools")

- **Route:** not in strings.
- **Purpose:** "Connect CVViZ with your internal systems and trusted services."
- **Layout blocks:** header with links "API documentation" and "API add-ons"; card "API credentials"; card "API usage & limits"; card "Webhook management".
- **API paths seen:** `/api/customer-api-credentials`, `.../rotations`, `.../revocations`, `/api/customer-api-capacity`, `/settings/webhooks`.

**API credentials card:** "Create secure, account-scoped credentials for server-to-server integrations. Each credential can have its own permissions and expiry."; buttons "Create credential", "Refresh credentials"; notice "Store credentials securely": "A new credential is displayed once. Copy it immediately and keep it in a trusted secret manager, never in client-side code."; tab or counter "Active (<n>)".

**Table columns**

| Column | Content |
|---|---|
| Credential | Name |
| Permissions | Summary tag "Read-only" or "Includes write access" |
| Status | Active; Rotating; Expired; Revoked |
| Last used | Date (`DD MMM YYYY`) |
| Expires | Date; "Unavailable" |
| Actions | "Rotate credential" ("Rotate <name>"); "Revoke credential" ("Revoke <name>") |

**Messages:** "No active API credentials."; "No API credentials created yet."; "The account has reached its active credential limit."; "Unable to load API credentials."; "Unable to create API credential."; "Unable to rotate API credential."; "API credential revoked."; "Unable to revoke API credential."

**Permission / plan gate:** "API credential access is not available": "Your current plan and role must both allow API credential management." (plan flag: API access).

**API usage & limits card:** "Request allowances are shared across all API credentials in your account."; meters "This billing month" and "Today (UTC)" with "Resets <date>" and "Limit reached"; "Refresh"; without capacity add-on: "Included API access": "Your account uses its existing API limits. Daily and monthly request tracking will appear here when a capacity add-on is assigned."; errors "Unable to load API usage": "Your usage could not be verified. Please refresh to try again."; "API usage is unavailable."; "API capacity limits are unavailable."

**Webhook management card:** "Configure subscriptions, signing secrets, delivery tests, and retries from the dedicated Webhooks settings page."; button "Manage webhooks" (to `/settings/webhooks`).

### 26. Create API credential dialog

**Fields**

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Credential name | Text (placeholder "Production reporting integration") | | "Use a name that identifies the system or environment using it."; "Enter a credential name."; "Use 100 characters or fewer." |
| Expiry | Select | Account default ("Uses the account's recommended credential lifetime."; tag "Recommended"); 30 days ("Expires 30 days after it is created."); 90 days ("Expires 90 days after it is created."); Custom | |
| Choose expiry date | Date picker (when Custom) | | "Choose an expiry date." |
| Permissions ("API credential permissions") | Grouped checkboxes ("Select permissions") | See scope table | "Grant only what this integration needs."; "Select at least one permission." |

Permission shortcuts: "Apply starter API permissions" ("Starter access": "Recommended starting permissions. Add others only when required."); "Select all"; "Clear all API permissions".

**Credential scopes (every permission found)**

| Group | Permission | Description |
|---|---|---|
| Jobs (group heading inferred) | View jobs | "Job details, tags, stages, and pre-screening questions." |
| Jobs | Create and update jobs | "Create jobs through your account workflow, save drafts, and update core fields and tags. Publication stays off unless requested." |
| Jobs | Change job status | "Move jobs between supported lifecycle states." |
| Candidates | View candidates | "Profiles, stages, tags, screening data, and feedback." |
| Candidates | Download resumes | "Download original resumes or request temporary file links. Account resume-access limits still apply." |
| Candidates | Update profiles | "Approved fields on existing candidate profiles." |
| Candidates | Manage tags and stages | "Candidate tags and application stages." |
| Applications | View applications | "Application details and current hiring stage." |
| Applications | Add candidates to jobs | "Create an application for an existing candidate." |
| Workspace data | Users and settings | "Users, departments, hiring managers, grades, client companies, and job creation reference data." |
| Workspace data | View notes | "Non-private job and candidate notes." |
| Workspace data | Add notes | "Add non-private job and candidate notes." |
| Workspace data | Document metadata | "Candidate document names and metadata." |
| Workspace data | View job offers | "Offer details associated with a candidate and job." |
| Workspace data | View tasks | "API-visible recruiting tasks." |
| Workspace data | Manage tasks | "Manage API-visible recruiting tasks." |

**Actions:** Cancel; "Create API credential" / "Create credential".

**One-time reveal dialog ("Save your API credential")**: alert "This credential will not be shown again": "Copy it to a trusted secret manager before closing this dialog. CVViZ cannot retrieve it later."; field "One-time API credential"; button "Copy credential" ("API credential copied." / "Copy failed. Select the credential and copy it manually."); close button "I have stored it".

### 27. Rotate and revoke API credential dialogs

**Rotate ("Rotate credential")**: notice "A new credential will be issued": "The current credential remains valid only during the selected overlap period. Update your integration before that period ends."

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Overlap period | Number (seconds) | | "How long the current credential should continue working, in seconds."; "Enter an overlap period." |
| Replacement expiry (optional) | Date picker | "Use account default" | "Leave blank to use the account's default credential lifetime." |
| Change permissions on the replacement credential | Checkbox that reveals the permission picker | Same scopes as section 26 | |

After rotating, the one-time reveal dialog is shown again.

**Revoke:** "Revoke this API credential?": "Applications using it will immediately lose access." Buttons Revoke / Cancel. Result "API credential revoked."

### 28. Webhooks

- **Route:** `/settings/webhooks` (confirmed).
- **Purpose:** "Push candidate and job events to your endpoint in real-time".
- **Layout blocks:** header "Webhooks" with status tag Connected / Not connected; tabs Configuration; Delivery Logs; Payload Format (plus a guide area with Quick Start, Request Format, Signature Verification, Retry Policy and best practices; tab grouping of the guide is inferred).
- **API paths seen:** `/api/webhooks`, `/api/webhooks/test-deliveries`, `/api/webhooks/signing-secret-rotations`, `.../retries`, `/webhook`.
- **Model:** one webhook endpoint per account (inferred from "Connect Webhook" / "Update Webhook" / "No webhook configured yet").

**Configuration tab: fields**

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Endpoint URL | URL input, with "Copy URL" | | "The HTTPS URL where webhook payloads will be delivered"; "Please enter a webhook URL"; "Invalid URL"; "Please enter a valid URL (including https://)" |
| Events to deliver | Grouped checkboxes with "Select all" | See event table | "Select at least one event"; "All events selected" |
| Signing secret | Read-only with "Copy secret" | | shown after connecting (inferred) |
| Connected since | Read-only date | | |

**Webhook events (every event found)**

| Group | Event | Description |
|---|---|---|
| Candidate Events | Candidate Added | "Fired when a candidate is added to a job" |
| Candidate Events | Candidate Updated | "Fired when a recruiter edits candidate profile info" |
| Candidate Events | Status Changed | "Fired on every pipeline stage change" |
| Candidate Events | Candidate Deleted | "Fired when a candidate is removed" |
| Job Events | Job Created | "Fired when a new job is published" |
| Job Events | Job Updated | "Fired when a job's details are changed" |
| Job Events | Job Status Changed | "Fired when a job goes live, paused, or closed" |
| Job Events | Job Deleted | "Fired when a job is closed or removed" |

Machine event keys (for example `candidate.added`) are not in the strings.

**Actions:** "Connect Webhook" (first save); "Update Webhook"; "Send test ping" ("Delivery runs asynchronously. Its terminal status and receiver response will appear in Delivery Logs.").

**Danger Zone** ("These actions are irreversible. Proceed with caution.")

| Action | Hint | Confirmation |
|---|---|---|
| Rotate secret | "Generates a new secret. Your old secret stops working immediately." | "Rotate signing secret?": "Your current secret will be invalidated immediately." Button Rotate |
| Remove webhook | | "Remove this webhook?": "All pending deliveries will be cancelled." Button Remove |

**Toasts:** "Webhook saved"; "Failed to save webhook"; "Webhook removed"; "Failed to remove webhook"; "Copied to clipboard" / "Copied!"; "Test ping failed"; "Signing secret rotated"; "Failed to rotate secret"; "Delivery re-queued"; "Retry failed"; "Failed to load delivery logs".

**Delivery Logs tab**

| Element | Detail |
|---|---|
| Filters | "Filter deliveries by event": All event types plus the eight events; "Filter deliveries by status": All statuses; Delivered; Failed; Pending; button "Refresh" |
| Row / detail fields | Event; Status; Latency; Sent at (UTC); "Payload sent"; "Response body" |
| Row action | "Retry delivery" |
| Empty | "No deliveries match the current filters"; "No webhook configured yet": "Set up an endpoint in the Configuration tab to start receiving events." |

**Payload Format tab / guide content**

| Section | Content |
|---|---|
| Payload Format | "Every request is wrapped in a signed envelope. Verify using X-Webhook-Signature"; sample payloads per event (monospace code block, copy button) |
| Quick Start ("Get up and running in four steps") | 1) "Set up your endpoint": "Make sure your URL is publicly accessible over HTTPS. If you're developing locally, a tool like ngrok can temporarily expose it."; 2) "Connect it in Configuration"; 3) "Check the request signature": "Each request includes an X-Webhook-Signature header. Compare it against your own HMAC calculation to confirm the request genuinely came from us."; 4) "Acknowledge the request": "Respond with a 2xx status to confirm receipt. If you need to do heavy processing, do it in the background after responding." |
| Request Format | "Every delivery is an HTTP POST with a signature header and a JSON envelope" |
| Signature Verification | "Confirm that requests are genuinely coming from us"; Node.js code sample; failure text "Invalid signature" |
| Retry Policy | "If your endpoint doesn't respond, we'll try again automatically"; table columns "Attempt" / "Delay after failure" (row values not in strings); "If all retries are exhausted, the delivery is marked ..." (Failed, inferred) |
| Best practices ("A few things that will make your integration smoother") | "Respond first, process later": "Send a 200 response as soon as you receive the request, then handle the data in the background. This prevents unnecessary retries."; "Handle duplicate events gracefully": "The same event may occasionally be delivered more than once. Check for duplicates before taking action."; "Refresh your secret occasionally": "Rotate your signing secret from time to time to keep things secure. If it's ever exposed, rotate it straight away."; "Subscribe only to what you need" |

**Sample payload values seen (envelope key names are not in the strings):** job title "Software Engineer"; job code "SE-001"; company "Acme Corp"; external id "CRM-789"; job type "Full Time"; state "Maharashtra"; city "Mumbai"; qualification "B.Tech"; skills "React, Node.js"; work mode "Remote, Hybrid"; screening questions "Do you have a valid driver's license?", "Years of relevant experience?", "Preferred work location?".

**Plan gate:** "Webhooks are not included in your current plan": "API capacity add-ons provide customer API access only. Contact support about webhook availability." (plan flag: webhooks).

---

## 9. Modules not enabled for this account

> Note: every screen below was reconstructed from text strings and URL paths found in the CVViZ front-end code bundles. None of these screens was seen live (the observed account got "no access"). Strings are unordered in the source, so grouping into blocks, control types and step order are **inferred** unless the wording itself makes them explicit. Quoted text is verbatim from the bundles.

Shared gate message for all four modules (inferred, from the module shell bundle): "Sorry, you don't have access to this page" + button "Back to home".

---

### AI Sourcing

Permission: "AI Sourcing" (search talent and manage independent sourcing projects). Related permission: "View People Search Tab". Page title in router: "AI Sourcing".

API paths seen (base `/api/ai-sourcing`): `/bootstrap`, `/jobs`, `/requirements`, `/candidates`, `/interpret`, `/searches`, `/projects`.

#### AI Sourcing shell (module layout)

| Item | Detail |
|---|---|
| Route | `/ai-sourcing` (parent of all AI Sourcing routes) |
| Purpose | Header and two-tab navigation wrapping Discover and Projects. |
| Header | Title "AI Sourcing"; subtitle "Find the right people. Build your next talent pool." |
| Tabs | "Discover" (`/ai-sourcing`), "Projects" (`/ai-sourcing/projects`); tab group name "Discover & Projects" |
| Source names (used across the module) | "Internal database", "Web discovery"; column/field name "Source" |
| Evidence tags on a profile (inferred use) | "Listed in profile", "Public repository evidence", "Not confirmed" |
| Location scope names | "State / region", "Country" |

| Message | When (inferred) |
|---|---|
| "AI Sourcing could not be loaded" / "Try again, or ask your administrator to check AI Sourcing access." | Bootstrap call failed |
| "AI Sourcing access is required" / "Ask your administrator to enable AI Sourcing for your account." | Permission gate |
| "AI Sourcing could not complete this request." | Generic request error |
| "Could not load this view." | View load error |
| "The next source page is unavailable." | Paging error |
| "Sorry, you don't have access to this page" + "Back to home" | 403 state |

#### Discover (search brief)

| Item | Detail |
|---|---|
| Route | `/ai-sourcing` |
| Purpose | Describe the ideal candidate in one of three ways, then review the interpreted criteria before searching. |
| Blocks (inferred) | (1) Brief entry "Who are you looking for?" with hint "Describe your ideal candidate, then review the search criteria."; (2) "Your projects" strip with "View all" link and hint "Keep the people you want to come back to."; (3) "Recent searches" list |
| API | `/ai-sourcing/projects` (link), `/api/ai-sourcing/interpret`, `/jobs`, `/requirements`, `/searches` (inferred from shared list) |

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Input mode | Segmented choice (inferred) | "Describe a candidate", "Paste a job description", "Use an existing job" | — |
| "Your search brief" | Text area | — | Placeholder: "Senior frontend engineers in Bengaluru, with React and TypeScript experience. Ideally from a SaaS company." |
| Example prompts | Clickable chips (inferred) | "Frontend engineers with React", "Sales leaders in SaaS", "Product designers in London" | — |
| "Job description" | Text area | — | Shown for "Paste a job description" |
| "Choose a job" | Searchable select | Jobs the user can access | Placeholder "Search your accessible jobs" |

| Action | Effect (inferred) |
|---|---|
| "Review search" | Sends the brief for interpretation and opens the review step |
| "Set criteria manually" | Skips interpretation and opens the criteria form |
| "Create a project" | Opens the create-project dialog |
| "View all" | Goes to Projects |
| "Retry loading searches" | Reloads recent searches |

| Message | When (inferred) |
|---|---|
| "Projects could not be loaded" | Project strip error |
| "Your recent searches will appear here." | No recent searches |
| "All locations" | Recent-search row with no location |
| "Private" | Visibility tag on a project card |

#### Review your search (criteria confirmation)

| Item | Detail |
|---|---|
| Route | `/ai-sourcing` (second step of Discover, inferred) |
| Purpose | Show how the brief or job was interpreted, let the user edit criteria and pick sources, then start the search. |
| Heading | "Review your search" |
| Blocks (inferred) | "How these criteria were interpreted"; criteria form; source picker "Search across"; cost line |
| Job-based notice | "From an existing job" / "These requirements are a copy. Your job remains unchanged." / link "Return to job" |

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| Role (wording not captured) | Text | — | "Enter a role to search for." |
| "Search across" | Multi-select of sources | "Internal database", "Web discovery" (PeopleSearch credits referenced) | "Choose at least one source" / "Choose at least one available source." |
| "Location scope" | Select | "Geographic area", "State / region", "Country" | — |
| "Location" | Text | — | Placeholder "Any location"; helper "Searching …" / "Searching all locations." |
| "Years of experience" | Text | — | "Use 5-8 or 5+." |
| "Must-have skills" | Tag input | — | Placeholder "Add skills" |
| "Nice-to-have skills" | Tag input | — | Placeholder "Add preferred skills" |
| "Additional context" | Text area | — | Placeholder "Industry, company background, or relevant experience" |

| Cost / credit text | Meaning |
|---|---|
| "No provider credits" | Source that costs nothing |
| "Source quotas apply" | Source limited by quota |
| "Up to 25 PeopleSearch credits" | Maximum credit use per search page |
| "Cost unavailable" | Cost could not be computed |
| "Saving candidates to projects does not reveal contact details." | Reassurance note |

| Action / message | Detail |
|---|---|
| "Find candidates" | Runs the search |
| "Some requirements need review" | Warning banner on interpreted criteria |
| "Review the highlighted fields." | Validation summary |
| "Search was not confirmed. Please retry." | Search start failed |

#### Search results

| Item | Detail |
|---|---|
| Route | `/ai-sourcing/searches/:searchId` |
| Purpose | Show candidates returned by one saved search, per source and per source page, and let the user re-run with changed criteria. |
| Blocks (inferred) | Back link "Return to …"; criteria summary; "Search criteria" side panel/drawer ("Filters", "View results", closes on Escape); source tabs or sections with status; results list "All results (n)"; paging per source |
| API | `/api/ai-sourcing/searches`, `/candidates` |

| Element | Strings |
|---|---|
| Summary line | "All locations and experience levels" (when no criteria), "Up to …" |
| Source status | "Queued", "Unavailable"; "Searching your selected sources" (loading) |
| Source problems | "Some sources could not complete"; "This source could not complete."; "Source notes" |
| Paging | "Source page n", "Previous source page", "Search next page", "Search PeopleSearch page n", "Open saved" |
| Paging cost note | "Uses the saved criteria and up to 25 additional search credits. Previously seen profiles are hidden, but all returned profiles count toward usage." |
| Saved page note | "Reopening a saved page does not run or charge for the search again." |
| Criteria panel | "Search criteria"; button "Search with these criteria"; note "Changes apply when you run a new search." |

| Action | Effect |
|---|---|
| "New search" | Back to Discover |
| "Search" / "Search with these criteria" | Runs a new search with edited criteria |
| "Search next page" | Fetches the next page from a source (may use credits) |
| "Open saved" | Reopens an already-fetched page at no charge |

| Message | When (inferred) |
|---|---|
| "No candidates found" / "Try a broader role, location or set of skills." | Empty result |
| "Choose a source before searching." | No source chosen |
| "Search was not confirmed. Retry with the same criteria." | New search failed |
| "Search was not confirmed. Retry this page." | Page fetch failed |
| "Review the highlighted fields." | Criteria validation |
| "Candidates saved to your projects." | Success after saving |

#### Candidate result list and candidate profile panel (shared component)

| Item | Detail |
|---|---|
| Used on | Search results and Project detail (inferred) |
| Purpose | List sourced people with evidence, and open one profile with actions. |
| List filter | "Filter candidates" / placeholder "Filter these results"; empty: "No matching candidates" / "Try another name, company or skill." |

| Table columns | Notes |
|---|---|
| "Candidate" | Name; fallback "Role and company not provided" |
| Location (header not captured) | Fallback "Location not listed" |
| "Skills & evidence" | Fallback "Skills not provided" |
| "Found on" | Source name |
| Actions | "View profile", "Save to project", "Remove from project", "Add to job" |

| Profile panel block | Strings |
|---|---|
| Title | "Candidate profile" |
| "Overview" | "The available source does not provide enough evidence." |
| Skills | "Listed skills: …"; "The source did not provide skills. This does not mean the candidate lacks them." |
| "Experience" | "Work history is not available from this source." |
| "Source evidence" | "Search excerpt"; tags "Listed in profile", "Public repository evidence", "Not confirmed" |

#### Add to job dialog (import sourced profile into a job)

| Item | Detail |
|---|---|
| Purpose | Attach a sourced person to an active job, importing the profile into the ATS if needed. |
| Title / buttons | "Add to job"; confirm button varies: "Add candidate", "Import profile"; follow-up "Open job" |

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| "Choose an active job" | Searchable select | Active jobs the user can access | "Choose a job."; "Only accessible active jobs in this workspace are shown." |
| "Confirm candidate name" | Text | — | "Name confirmed from the source profile" |

| Explanatory note | Text |
|---|---|
| Existing ATS candidate | "Links the existing ATS candidate to this job and queues screening. Repeating this action does not create another application." |
| New import | "Uses your existing parsing allowance: advanced parsing when available, otherwise basic. Normal ATS processing follows." |
| Credits | "No additional search or contact-lookup credits." |
| Data caveat | "Repository activity and search excerpts are not imported as claimed skills or work history." |

| Result state | Text |
|---|---|
| "Candidate added" | "Screening has been queued." or "The application is saved. Screening has not been queued by this action." |
| "Profile import accepted" | "The profile is in the ATS processing queue. Open the job to follow parsing and screening progress. Repeating this action reopens the same import." |
| "Profile already imported" / "Already in this job" | "Open the job to review the existing candidate. No new import was created." |
| "Existing import needs attention" | "The existing import did not finish successfully. Open the job to review its status. This action has not started or charged for another import." |

#### Save to project / Create a project dialog

| Item | Detail |
|---|---|
| Purpose | Save a person to an existing project or create a new project. |
| Title | "Create a project"; hint "Bring candidates together around a role, team or future hiring need." |
| Empty state in picker | "No active projects yet. Create one below." |
| Button | "Create project" |

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| "Project name" | Text | — | "Give your project a name." |
| "Description (optional)" | Text area | — | Placeholder "What are you building this talent pool for?" |
| Visibility | Fixed at creation (inferred) | "Private", "Shared with team" (tags) | "Private to you. You can explicitly share it with your team later." |

#### Projects list

| Item | Detail |
|---|---|
| Route | `/ai-sourcing/projects` |
| Purpose | List sourcing projects (talent pools) with search and an active/archived switch. |
| Header | "Projects" / "A home for your talent pools and the people worth remembering." |
| Filters | Search box "Find a project"; status switch "Active" / "Archived" |
| Table columns | "Project", "Candidates", "Visibility" ("Private" / "Shared with team"), "Updated" |
| Actions | "New project" (header), "Create a project" (empty state) |
| Empty / error | "No projects match your search."; default description text "A new talent pool" |
| API | `/api/ai-sourcing/projects` |

#### Project detail

| Item | Detail |
|---|---|
| Route | `/ai-sourcing/projects/:projectId` |
| Purpose | Show one project's saved people and the searches that produced them. |
| Blocks | Header (name, visibility tag, status); "Saved candidates" list (shared candidate list above); "Searches behind this project" list |
| Actions | "Find candidates" (starts a search for this project), "Project settings", "Restore" (when archived) |
| Archived banner | "This project is archived" / "Saved candidates and searches are retained." + "Restore" |
| Empty state | "Your talent pool starts here" / "Run a search and save promising candidates to this project." |

#### Project settings dialog

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| "Project name" | Text | — | — |
| "Description" | Text area | — | — |
| "Who can access this project" | Radio / select | "Only me", "Permitted teammates" | — |

| Action | Effect |
|---|---|
| "Save changes" | Saves name, description, access |
| "Archive project" | Archives (people and searches kept) |
| "Restore project" | Un-archives |
| "Cancel" | Closes |

#### Related: AI Sourcing Agent on a job (shared dialogs found by keyword search)

These belong to the job screens ("AI source candidates" job action, "People Search" job tab) but share the sourcing vocabulary. API base `/api/sourcing-agent`: `/run-pipeline`, `/sources`, `/suggested-candidates/import-preflight`, `/add-suggested-candidate`, `/sessions/active`, `/cancel`, `/dismiss`, `/draft-email`, `/stream`.

**Run sourcing dialog**

| Item | Detail |
|---|---|
| Title | "AI Sourcing Agent" / "Find and rank relevant people for <job>" |
| Sections | "Choose candidate sources" (source tiles; tag "Not connected"; "People Search" — "Verified professional profiles from trusted data sources."); "Search criteria" — "Pre-filled from the job and editable for this run" |
| Footer | "Nothing is searched until you choose …" + button "Run sourcing" |

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| "Job title" | Text | — | — |
| "Location" | Text | — | — |
| "Years of experience" | Text | — | "Use a value such as 3, 3-7, or 5+."; "Minimum experience cannot exceed maximum experience." |
| "Skills" | Tag input | — | Placeholder "PHP, Laravel, MySQL" |

Messages: "AI sourcing started. You can keep working while candidates are ranked."; "We could not start AI sourcing. Try again."

**Sourcing progress widget (floating, inferred)**

| State text | |
|---|---|
| "Initializing AI Sourcing...", "Running for: <job>", "Complete for: <job>", "Failed for: <job>" | Status line |
| "Candidate Discovery Complete!", "Discovery Failed", "Discovery Cancelled" | Final states |
| "Suggestions: n", "Job ID: …", "Click to view candidates for …", "Click to dismiss" | Detail lines |
| Buttons | "Cancel", "Minimize", "Dismiss" |
| Errors | "Sourcing session is no longer available."; "Sourcing-agent stream authorization expired" |

**Suggested candidates panel**

| Item | Detail |
|---|---|
| Title | "Suggested candidates"; controls "Minimize", "Close suggested candidates", "Run sourcing again", "Adjust search" |
| Selection | "Select all visible", "Select <name>" |
| Sort ("Sort by") | "Best match", "Candidate name" |
| Filters ("Filter candidates", "Clear all") | "Minimum match" (option "Any score (include potential matches)"; toggle "Hide matches below 50%"); "Location" (placeholder "City, region, or country"); "Job status": "All candidates", "Not added yet", "Already added"; "Required skills" (placeholder "Choose job skills"); "Sources": "All sources", per-source entries, "Not connected" |
| Card content | "Candidate", "Source", "Source profile", "Key strengths", "Missing requirements", "Matched skills", "Profile skills", "Profile summary", "Education", "Skills", "Present"; "Quick view"; "Show less" / "Expand" |
| Score tooltip | "AI match score based on the job requirements and available profile details. Review strengths and gaps before deciding." |
| Card actions | "Add to job", "Add to audience", "Draft email", "Dismiss suggestion", "Retry import" |
| Fallbacks | "Unknown candidate", "Role unavailable", "No match summary available.", "No professional experience available.", "No education details available.", "Updated just now / 1 minute ago / 1 hour ago" |
| Empty | "No candidates match these filters" / "Try removing a filter or lowering the minimum match score."; "No matching profiles from <source>" / "Adjust the location or required skills and run sourcing again."; "Clear filters" |
| Loading / errors | "Refreshing suggested candidates", "Refreshing suggestions in the background...", "Starting a new sourcing run...", "We could not load sourcing suggestions.", "Import interrupted" |
| Blockers on import | "A verified email is required to import this public profile"; "Resume upload permission required" |

**Confirmations in the panel**

| Dialog | Text | Buttons |
|---|---|---|
| Add People Search candidate | "Adding the selected People Search candidate" / "After confirmation, CVViZ will generate a resume and use advanced parsing when credits are available, otherwise basic parsing." | "Confirm and add", "Cancel" |
| Contact credits required | "Contact credits required" / "You need …" / "Purchase more contact credits in Billing settings" | "Buy contact credits", "Not now" |
| Dismiss suggestion | "Dismiss <name>" / reason "Not relevant to this role" / "Dismissed suggestions will be removed from this result set." | "Dismiss", "Cancel" |
| Close with selection | "Close without applying your selection?" | "Keep reviewing" (+ close) |

Result messages: "Candidate added to the job. Contact details and resume parsing are in progress."; "Candidate was already in this job."; "We could not add this candidate."; "We could not check contact credits for this import."; "We could not dismiss this candidate."; "We could not create the email draft."

Plan gates: billing page lists "People search — Search credits used", "No search credits are included in your current plan", "Contact reveals"; purchasable "Contact Credit Pack" / "Contact reveal credits".

---

### Campaigns (paid job advertising)

Permission: "View Campaigns Tab" (paid job advertising campaigns). Menu name "Campaigns"; router titles: "Ad Campaigns", "Add Campaign", "View Campaigns", "View Channels", "New Campaigns", "Active Campaigns", "Scheduled Campaigns", "Closed Campaigns", "Offline Campaigns", "View Campaign", "Edit Campaign".

#### Ad campaigns shell

| Item | Detail |
|---|---|
| Routes | `/campaigns` (parent), `/campaigns/all`, `/campaigns/online`, `/campaigns/publish`, `/campaigns/new`, `/campaigns/cancelled`, `/campaigns/offline`, `/campaigns/channels` |
| Purpose | Header, status tabs and entry buttons for campaigns and the channel catalog. |
| Header | "Ad campaigns" / "Promote your jobs and manage advertising across channels." (campaign view); "Channel catalog" / "Compare job boards and advertising channels for your next campaign." (catalog view) |
| Status tabs ("Campaign status") | "All campaigns", "Active", "Scheduled", "Drafts", "Cancelled", "Offline" |
| Tab-to-route mapping (inferred from router titles) | All → `/campaigns/all`; Active → `/campaigns/online`; Scheduled → `/campaigns/publish`; Drafts → `/campaigns/new`; Cancelled → `/campaigns/cancelled`; Offline → `/campaigns/offline` |
| Actions | "Create campaign" (→ `/campaigns/add`), "Browse channels" (→ `/campaigns/channels`), "View campaigns" (→ `/campaigns/all`) |
| Shared fallbacks | "Not available", "Not set", "Duration not set", "Tracking starts when live", "Not reported", "No channels", "Unknown"; date formats "D MMM YYYY", "YYYY-MM-DD" |

#### Campaign list

| Item | Detail |
|---|---|
| Route | `/campaigns/all` and the status routes above |
| Purpose | Searchable, filterable table of campaigns for the chosen status. |
| Search | "Search campaigns" / placeholder "Search campaigns by job title" |
| Filters ("Filters", "Clear all") | "Education", "Regions", "Sectors" |
| Sort | "Newest first" (only option captured) |
| Table name | "Campaign list" |

| Table column | Content |
|---|---|
| "Campaign" | Job title (fallback "Untitled campaign"), "Created <date>" |
| "Status" | One of the status tab values |
| "Channel subtotal" | Money; fallback "Not available" |
| "Schedule" | Dates; fallbacks "Not set", "Duration not set" |
| "Actions" | "View campaign", "Open application page" ("Open application page for <job>") |

| Message | When |
|---|---|
| "Reach more candidates with your first campaign" / "Choose a job, compare advertising channels, and review your campaign before payment." + "Create campaign" | No campaigns at all |
| "No matching campaigns" / "Try a different title or clear your filters." + "Clear filters" | Filtered empty |
| "Campaigns will appear here when they reach this status." | Empty status tab |
| "Unable to load campaigns" | Load error |

#### Channel catalog

| Item | Detail |
|---|---|
| Route | `/campaigns/channels` (also embedded as step 2 of the editor) |
| Purpose | Browse and compare job boards / advertising channels with prices and durations. |
| Heading | "Advertising channel catalog"; result region "Channel results" |
| Tabs | "Recommended", "All channels"; link "Browse all channels" |
| Tab hints | "Suggestions based on your job targeting" (Recommended); "Compare channels and posting durations" (All) |
| Search | "Search channels" / "Search channels by name" |
| Filters ("Filters", "Clear all") | "Channel type", "Education", "Regions", "Sectors" |
| Sort ("Sort channels") | "Most popular" (only option captured) |
| Price note | "Prices in USD" |
| Channel card (shared component) | Description with "Read more" (fallback "No channel description available."), "Visit website", posting-duration choice (inferred), button "Select" / "Selected" / "Remove" |
| Paging | "Results pagination", "Previous", "No results on this page", "Could not load. Retry", "No options found" |

| Message | When |
|---|---|
| "Finding recommended channels" / "Fetching suggestions for your job and target audience." | Loading recommendations |
| "Loading channels" / "Fetching channels that match your search and filters." | Loading catalog |
| "This is taking longer than usual. Your campaign selections are unchanged." | Slow load |
| "Unable to load channels" | Error |
| "No recommended channels found" / "No channels found" / "Try a different search or adjust your targeting filters." + "Clear filters" | Empty |
| "Success", "Warning" | Toast titles |

#### Campaign editor — shell and stepper

| Item | Detail |
|---|---|
| Routes | `/campaigns/add` (create), `/campaigns/:id/edit` (edit) |
| Purpose | Four-step wizard to promote one job across paid channels. |
| Header | "Create campaign" or "Edit campaign"; "Promoting <job>"; "Promote a job across the right advertising channels."; "Step 1 of n" |
| Side navigation ("Campaign setup", "Campaign setup steps", "Campaign setup progress") | "Job & targeting", "Choose channels", "Review content", "Payment"; step tag "Complete" |
| Nav hints | "Choose a job, audience, channels, and payment."; "Select a section to review or update your campaign." |
| Draft status texts | "Unsaved changes on this step"; "Your draft is saved when you continue."; "Completed steps are saved to your draft."; "Review the final amount in secure checkout." |
| Footer buttons | "Cancel"; step-forward buttons: "Save & choose channels", "Review campaign", "Save & review payment", "Continue to payment", "Retry payment verification" |
| Blocking states | "Unable to open campaign editor"; "This campaign is no longer editable" / "View the campaign to check its current status and payment details." + "View campaign" |
| Step guard | "Select at least one channel before reviewing content or payment." |
| API | `/campaigns/all`, `/settings/billing` (links) |

#### Campaign editor — step 1: Job & targeting

Heading "Job & targeting" / "Choose the role to advertise and who you want to reach." Sub-block "Target audience" / "These details help us recommend relevant advertising channels." Loading text "Loading campaign job and targeting fields".

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| "Job to promote" ("Campaign job") | Searchable select of active jobs | Each option shows job title, "Job ID: …", experience ("Experience not set"), location ("Location not specified") | Placeholder "Search jobs by title, code, or location"; "Select a job to advertise."; "Select an active job to continue."; empty "No matching active jobs found"; hint "You can review and edit the campaign content before payment."; link "View application page" |
| "Sector" | Single select | Industry sectors (list loaded from server, not in bundle) | Placeholder "Select an industry sector"; hint "Select the industry that best describes the role."; "Select a sector." |
| "Education" | Multi-select | Education levels (server list) | Placeholder "Select education levels"; hint "Choose the education levels relevant to this role."; "Select at least one …" |
| "Regions" | Multi-select | Target regions (server list) | Placeholder "Select target regions"; hint "Choose where you want to reach candidates."; "Select at least one …" |
| "Job profiles" | Multi-select | Occupations (server list) | Placeholder "Select job profiles"; hint "Choose the occupations that best match the role."; "Select at least one …" |

| Message | When |
|---|---|
| "The previously selected job is no longer available for promotion. Select an active job to continue." | Saved job became inactive |
| "This job needs a valid HTTPS application page and a complete description. Update the job, then select it again." | Job not eligible |
| "Unable to verify active campaign jobs" / "Unable to load jobs" | Load errors |
| "Could not save" | Save error |

#### Campaign editor — step 2: Choose channels

| Item | Detail |
|---|---|
| Heading | "Choose where to advertise" / "Compare channels and add them to your campaign. Selections are saved as you go." |
| Body | Same catalog as "Channel catalog" above (tabs, search, filters, sort, cards) |
| Side summary ("Your campaign (n)") | Selected channels with "Remove <channel>"; empty text "Selected channels and their costs will appear here."; price lines "List price", "Channel discounts", "Channel subtotal"; note "Taxes and the final amount are confirmed at checkout." |
| Errors | "Channel could not be saved"; "Channel confirmation is missing"; "Channel selection could not be saved. Please try again."; "Preselected channels could not be loaded. Please select them from the catalog."; "Pricing is unavailable. Reload the campaign to try again." |
| Validation | "Select at least one channel to continue." / "Select at least one channel before continuing." |

#### Campaign editor — step 3: Review content

Heading "Review your campaign content" / "Check what candidates will see and choose your preferred start date."

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| "Job title" | Text | — | "Enter a job title between 2 and 200 characters." |
| "Job summary" | Text area with AI generate button ("Generate …", "Generating …") | — | "Add a short summary of the role."; generate needs a title: "Add a job title first" |
| "Job description" | Rich text editor (toolbar: bold inferred, "Italic", "Underline", "Strikethrough", "Block quote", "Insert link", "Clear formatting", "Numbered list", "Bulleted list", "Decrease indent", "Increase indent") with AI generate | — | Placeholder "Describe the role, responsibilities, and qualifications."; "Add the job description."; "Add at least 20 characters describing the role." |
| "Application page" | Read-only link | — | "The selected job needs a valid application page." |
| "Preferred start date" | Date picker (format YYYY-MM-DD) | Future weekdays only | "Choose a preferred start date."; "Choose a future weekday for the campaign start date."; hint "Choose a future weekday. Publishing is subject to channel review and availability." |

AI generation targets named in the bundle: "Skills", "Job Description", "Job Summary", "Content".

#### Campaign editor — step 4: Payment

| Item | Detail |
|---|---|
| Heading | "Review payment" / "Check your selected advertising channels before opening secure checkout." |
| Summary rows | "Campaign", "Preferred start", "Advertising channels", price lines as in step 2 |
| Draft notice | "Your campaign is saved as a draft" / "Continue to review the final amount and complete payment in Razorpay. Publishing starts after payment confirmation and channel review." |
| Invoice note | "Your invoice will be available in Billing after payment is confirmed." |
| Checkout | Razorpay window; merchant name "CVViZ Softwares Pvt Ltd", description "AI Powered Recruitment Solution" |
| Success block | "Payment confirmed" / "Your campaign is ready for channel review. Open the campaign to follow its publishing status." + buttons "View campaign", "All campaigns", "View billing" |

| Message | When |
|---|---|
| "Payment processed successfully! The invoice is available in Billing." | Paid |
| "Payment was already processed." | Duplicate attempt |
| "Payment was not completed. You can try again from checkout." | Checkout closed / failed |
| "Payment may be confirmed while publishing is still pending. Retry without making another payment." | Verification pending |
| "Payment checkout is unavailable. Please try again." / "Payment checkout could not be started. Please try again." | Checkout start errors |
| "Secure payment window could not be loaded. Check browser privacy or ad-blocking settings and try again." | Script blocked |

#### Campaign editor — confirmations

| Dialog | Body | Buttons |
|---|---|---|
| "Save changes before switching sections?" | "Your changes will be validated and saved before opening the selected section." | "Save & switch", "Keep editing" |
| "Leave without saving?" | "Changes on this step have not been saved. Earlier completed steps are saved as a draft." | "Leave page", "Keep editing" |

#### Campaign details (view)

| Item | Detail |
|---|---|
| Route | `/campaigns/:id` |
| Purpose | Read-only campaign summary with delivery status, performance, targeting and per-channel results. |
| Breadcrumb / title | "Ad campaigns" → "Campaign details"; "Created <date>"; link "Application page" |
| Header actions | "Edit campaign" (→ `/campaigns/:id/edit`), "More campaign actions" menu containing "Cancel campaign" |
| Status tiles (inferred) | "Delivery" (campaign status; "Unavailable"), "Total clicks", "Payment" ("Confirmed" / "Not confirmed"), "Retry status" |
| "Overview" block | "Job summary" (fallback "No summary added."), "Job description", "Created", "Preferred start", "Start date", "End date", "Duration", "Cost per click" (fallback "Not available") |
| "Performance" block | "Expected clicks", "Clicks per day" / "Expected clicks per day", "Expected apply clicks", "Apply clicks per day" / "Expected apply clicks per day"; empty: "Tracking starts when the campaign goes live."; "Brockmeyer has not reported performance details yet." |
| "Targeting" block | "Regions", "Sector", "Education", "Job profiles"; "Targeting details are temporarily unavailable."; "No targeting details available." |
| "Channels" block | Table below; footer "Taxes and the final amount are confirmed at checkout." |

| Channels table column | Notes |
|---|---|
| "Channel" | Channel name |
| "Status" | Per-channel publishing status |
| "Publishing window" | Start–end |
| "List price (USD)" | — |
| "Discount" | — |
| "Your price (USD)" | — |
| "Clicks" | Fallback "Not reported" |
| "Apply clicks" | Fallback "Not reported" |
| "Posting" | Link "View posting <channel>"; fallback "Available when live" |

| Message / banner | Text |
|---|---|
| Publishing incomplete banner | "Payment is confirmed, but publishing is incomplete" / "Retry publishing without making another payment. If the saved start date has passed, CVViZ will move it to the next available weekday." + button "Retry publishing" |
| Retry success | "Campaign publishing resumed. No additional payment was taken." |
| No channels | "No channels selected" / "Edit this campaign to choose where to advertise your job." |
| Errors | "Unable to load campaign"; "Unable to load campaign channels" |

#### Cancel campaign confirmation

| Item | Detail |
|---|---|
| Title | "Cancel this campaign?" |
| Body | "This will cancel advertising for <job>" |
| Buttons | "Cancel campaign", "Keep campaign" |
| Results | "Campaign cancelled"; "Campaign could not be cancelled. Please try again." |

Shared error panel for campaign pages: "Unable to load this page" / "Please try again. Your saved information has not changed." + "Try again"; "Request failed".

---

### Companies / Customers / Contacts (agency CRM)

Permissions: "View Companies Tab" (current customers, prospects, future customers and contacts); "Add/Edit Customer". Router titles: "Companies", "Customers", "Prospects", "Former Customers", "Contacts", "Add Customer", "Edit Customer", "Customer Details", "Contact Details".

Shared option lists used across this module:

| List | Values |
|---|---|
| Industry | Consulting, Technology, Agriculture, Finance, Healthcare, Education, Retail, Manufacturing |
| Lead priority | Hot lead, Warm lead, Cold lead |
| Company type | Customer, Prospect, Former Customer |
| Contact job role | Hiring Manager, Recruiter, HR Assistant, HR Manager, HR Director, Talent Acquisition Specialist, Talent Acquisition Manager, Senior Recruiter, Technical Recruiter, Executive Recruiter, HR Business Partner, HR Generalist, Recruitment Consultant, Sourcing Specialist, Talent Sourcer, HR Coordinator, HR Specialist, People Operations Manager, Head of HR, Chief Human Resources Officer, Talent Management Specialist, Workforce Planner, Diversity & Inclusion Specialist, Employee Relations Manager, Compensation & Benefits Analyst, plus a custom entry |
| Customer job status (job counts on a company row) | All Jobs, Pending Approval, In Progress, Archived |

Shared permission messages: "You do not have permission to add customers. Ask your account administrator to update your role."; "You do not have permission to edit customers. Ask your account administrator to update your role."; "The company could not be saved. Your changes are still here."

#### Companies shell

| Item | Detail |
|---|---|
| Routes | `/companies` (parent), `/companies/customers`, `/companies/prospects`, `/companies/former_customers`, `/companies/contacts` |
| Purpose | Header and four-tab navigation for the CRM lists, with a context-aware add button. |
| Header | "Companies" / "Manage companies and the people you work with" |
| Tabs ("Companies sections") | "Customers", "Prospects", "Former customers", "Contacts" |
| Add button (changes per tab) | "Add customer", "Add prospect", "Add former customer", "Add contact" |
| Gate message | "Your role cannot add companies or contacts. Ask your account administrator to update your role." |

#### Customers list (current customers)

| Item | Detail |
|---|---|
| Route | `/companies/customers` |
| Purpose | Table of current customer companies with job counts, primary contact and filters. |
| API | `/customers/:id/details`, `/contacts`, `/jobs`, `/edit` (row links) |

| Table column (inferred from strings) | Content |
|---|---|
| "Company" | "Company logo", name, "Website", "External reference ID: …" |
| "Industry" | Value from industry list; lead priority tag |
| "Primary contact" | Name, or "Add contact" link |
| "Job status" | Counts per "All Jobs", "Pending Approval", "In Progress", "Archived"; link "View all jobs" |
| "Actions" ("Actions for <company>") | Edit (via `/edit`), "Delete" |

| Filter group | Field | Control | Placeholder |
|---|---|---|---|
| "Specific customers" | "Customer" | Multi-select | "Select Customer Name" |
| "Company" | "Industry" | Multi-select | "Select Industry" |
| "Company" | "Company size" | Multi-select | "Select Company Size" (options not in bundle) |
| "Company" | "Revenue (millions)" | Number range (inferred) | — |
| "Account managers" | "Account managers" | Multi-select of users | "Select Account Managers" |
| "Location & date" | "Country" | Select | "Select Country" |
| "Location & date" | "Date added" | Date range (YYYY-MM-DD) | — |

Filter controls: "Clear all".

| Message | When |
|---|---|
| "No customers yet" / "Add your first customer to start managing accounts and tracking jobs." + "Add your first customer" | Empty |
| "Ask your account administrator for permission to add customers." | Empty, no add permission |
| "No customers match your filters" / "Try adjusting or clearing some filters to see more results." | Filtered empty |
| "Fetching your customer list." | Loading |

#### Prospects list

| Item | Detail |
|---|---|
| Route | `/companies/prospects` |
| Purpose | Same table for prospect companies (no job-status column; no `/jobs` path in this bundle). |
| Columns | "Company" (logo, name, "Website"), "Industry", "Primary contact" / "Add contact", "Actions" ("Delete") |
| Filters | "Specific prospects" → "Prospect" ("Select Customer Details"); "Industry" ("Select Industry"); "Company size" ("Select Company Size"); "Revenue (millions)"; "Account managers" ("Select Account Managers"); "Location & date" → "Country", "Date added"; "Clear all" |
| Empty | "No prospects yet" / "Track potential customers and convert them as they progress through your pipeline." + "Add your first prospect" |
| Filtered empty | "No prospects match your filters" / "Try adjusting or clearing some filters to see more results." |
| Loading | "Fetching your prospect list." |

#### Former customers list

| Item | Detail |
|---|---|
| Route | `/companies/former_customers` |
| Purpose | Same table for closed accounts, including job-status counts. |
| Columns | "Company", "Industry", "Primary contact" / "Add contact", "Job status" (All Jobs, Pending Approval, In Progress, Archived; "View all jobs"), "Actions" ("Delete") |
| Filters | "Specific former customers" → "Former Customer" ("Select Customer Details"); "Industry"; "Company size"; "Revenue (millions)"; "Account managers"; "Location & date" → "Country", "Date added"; "Clear all" |
| Empty | "No former customers yet" / "Closed accounts will appear here so you can keep their history within reach." + "Add former customer" |
| Filtered empty | "No former customers match your filters" / "Try adjusting or clearing some filters to see more results." |
| Loading | "Fetching your former customer list." |

#### List toolbar and filter drawer (shared by the four lists)

| Element | Strings |
|---|---|
| Filter button | "Filters", "Filters (n)", "Hide filters" |
| Drawer footer | "View results" (closes; Escape also closes), "Clear all" |
| Active filter chips ("Active filters") | "Company", "Industry", "Company size", "Revenue", "Account manager", "Country", "Date added", "Lead owner", "Added by", "Job title"; each chip has "Remove <filter>" / "Filter <name>" |
| Row density ("Row density") | "Comfortable", "Compact" |

#### Delete customer confirmation

| Item | Detail |
|---|---|
| Title | "Delete customer" |
| Body | "Are you sure you want to delete this customer?" / "Customer: <name>" |
| Buttons | "Delete", "Cancel" |
| Error | "Failed to delete <name>" |

#### Contacts list

| Item | Detail |
|---|---|
| Route | `/companies/contacts` |
| Purpose | Table of all contact people across companies with bulk email, export and delete. |
| API | `/contacts/.../notes`, `/timeline`, `/details` |

| Table column | Content |
|---|---|
| "Contact" | Name; tag "Primary contact for <company>" |
| "Job Title" | Fallback "Job title not specified" |
| "Company" | Company name |
| "Contact details" | Email, phone; fallback "No contact details" |
| "Lead Owner" | User |
| "Added By" | "Added by <user>" |
| "Primary Contact" | Flag |
| "Added On" | Date |
| "Actions" | "View notes" / "Add notes" ("View notes for <name>", "Add notes for <name>"), edit, delete |

| Filter group | Field | Placeholder |
|---|---|---|
| "Contact" | "Job Title" | "Select Job Title" |
| "Company" | "Company" | "Select Company" |
| "Ownership" | "Lead owner" | "Select Lead Owner" |
| "Ownership" | "Added by" | "Select Added By" |
| "Location" | "Country" | — |
| — | "Date added" | Date range (YYYY-MM-DD) |

| Bulk action bar ("Contact bulk actions", "Selected contacts on this page") | Effect |
|---|---|
| "Email selected contacts" | Opens the email composer; error "Selected contacts do not have email addresses" |
| "Export CSV" / "Export XLSX" | Opens column chooser "Select contacts to export"; export fields: First Name, Last Name, Full Name, Job Title, Email Address, Primary Contact, Phone Number, Alternate Phone Number, City, State/Province, Country, Address, Postal/ZIP Code, LinkedIn URL, Facebook URL, Twitter Handle, Instagram Handle, Website URL, Company Name, Lead Owner Name, Added By |
| "Delete contacts" | Confirmation "Delete selected contact?" / "Delete <n>" / "Contact: <name>"; error "Failed to delete selected contacts. Please try again." |
| "Clear selection" / "Clear selection (Esc)" | Deselects |

| Message | When |
|---|---|
| "No contacts yet" / "Add the people you work with at each company so emails and notes stay organized." + "Add your first contact" | Empty |
| "No contacts match your filters" / "Try adjusting or clearing some filters to see more results." | Filtered empty |
| "Fetching your contact list." | Loading |
| "No contacts selected" | Bulk action without selection |

#### Add / Edit contact dialog

Titles: "Add contact" ("New contact …"), "Edit contact" ("Contact …"). Buttons: "Save changes" / "Add contact", "Cancel".

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| "First name" | Text | — | "First name is required" |
| "Last name" | Text | — | "Last name is required" |
| "Company" | Select | Companies | Placeholder "Select company"; "Company is required" |
| "Job title" | Text | — | "Job title is required" |
| "Job role" | Select | Contact job role list above | Placeholder "Select Job role" |
| "Custom Job role" | Text (shown for custom choice, inferred) | — | Placeholder "Enter custom job role"; "Please specify the job role" |
| Email | Text | — | "Email is required"; "Please enter a valid email address" |
| Phone | Phone input | — | "Phone is required"; "Please enter a valid phone number" |
| "Alt Phone" | Phone input | — | Placeholder "Alternate phone Number" |
| "LinkedIn Profile" | URL text | — | Placeholder "Linkedin Profile" |
| "Lead owner" | Select of users | Team members | Placeholder "Select Lead owner"; "Lead owner is required" |
| "Set this as a primary contact" | Checkbox | — | "Primary contact will pre-populate while sending emails, adding calendar events." |
| "Address" | Text | — | Placeholder "Street Address"; "Please input your address!" |
| "Country" | Select | Countries | — |
| "Zip Code" | Text | — | — |

#### Contact notes panel (from the contacts list)

| Item | Detail |
|---|---|
| Title | "Notes for <contact>"; link "View all …" |
| Composer | Rich text editor (placeholder "Type here..."; toolbar as in the campaign editor); "Note type" (value seen: "Job note"); visibility switch "Make visible to the team" / "Mark as private" ("Team visibility", "Private"); "Add due date" / "Change due date" ("Due date", display "MMM D, h:mm A"); "Assign to user" / "Assign to myself"; button "Add Note" |
| Note item tags | "Private note", "Private task", "Edited", "Task created by <user>", "Task assigned to me", "Task assigned to <user>", "Assigned to Me", "Task completed" |
| Note item actions | "Edit note" ("Update"), "Delete note", "Add Reply" |
| Delete confirm | "Delete this note?" + "Delete" |
| Activity block | "Activity" / "No activity yet" |

| Message | When |
|---|---|
| "Note Added!" / "Note updated!" / "Note Deleted!" | Success |
| "Reply added!" / "Reply updated!" | Success |
| "Success!" | Generic |
| "Note can not be empty!" | Validation |
| "Due date must be in the future" | Validation |
| "Unable to assign this task. Please refresh and try again." | Error |

#### Company form (add / edit / view)

| Item | Detail |
|---|---|
| Routes | `/customers/add`, `/customers/:customerId/edit`, `/customers/:customerId/view` (read-only) |
| Purpose | Sectioned form to create or update a company record, its contact, defaults, preferences and public jobs page. |
| Titles | "Add company", "Add prospect", "Add former customer"; side title "Set up company" (create) / "Company settings" (edit); sub-lines "Capture company details, primary contact, and account ownership." (add), "Update company information." (edit), "Read-only view of this company." + tag "View only" (view) |
| Back links | "Back to <Customers / Prospects / Former Customers>", "Back to company", "Back to companies" |
| Section nav ("Company form sections") | "Company details" — "Profile, logo & location"; "Contact details" — "Name, email & phone"; "Defaults & ownership" — "Schedule, currency & team"; "Preferences" — "Visibility & job defaults"; "Career page" — "Public page & branding"; "Review" — "Check before creating" |
| Save status | "Unsaved changes", "No unsaved changes", "All changes saved", "Save when you create the company" |
| Footer buttons | "Cancel", "Previous", "Continue", "Create company" (add), "Save changes" (edit) |
| Legend | "Required fields are marked" |
| API | `/customers/:id/details`, `/view`, `/edit`; list links `/companies/customers`, `/companies/prospects`, `/companies/former_customers` |

**Section: Company details** — "Identify the company and how it relates to your account."

| Block | Label | Control type | Options | Validation / hint |
|---|---|---|---|---|
| "About the company" | "Company logo" | Image upload ("Upload logo" / "Change logo" / "Remove") | — | "JPG or PNG. A square image works best." |
| | "Company name" | Text | — | "Customer name is required" |
| | "Industry" | Select | Industry list above | Placeholder "Select industry"; "Industry is required" |
| | "Description" | Text area | — | "A short description of what the company does." |
| | "Website" | URL text | — | "Enter a full URL, including https://" |
| | "LinkedIn page" | URL text | — | "Enter a full LinkedIn URL, including https://" |
| "Classification" — "How this company fits in your pipeline" | "Company type" | Select | Customer, Prospect, Former Customer | Placeholder "Select type"; "Customer type is required" |
| | "Lead priority" | Select | Hot lead, Warm lead, Cold lead | Placeholder "Hot / Warm / Cold" |
| | "Company size" | Select | Not in bundle | Placeholder "Select size" |
| | "Annual revenue" | Number | — | "Enter revenue as a number" |
| "Address" — "Where the company is located" | "Street address" | Text | — | — |
| | "Country" | Select | Countries | — |
| | State (wording not captured; a list of US state names is present: Alabama, Alaska, Arizona, Arkansas, California, Colorado, Connecticut, Delaware, Florida, Georgia, Hawaii, Illinois, Indiana, Kansas, Kentucky, Louisiana, Maryland, Massachusetts, Michigan, Minnesota, Mississippi, Missouri, Montana, Nebraska, Nevada, New Hampshire, New Jersey, New Mexico, New York, North Carolina, North Dakota, Oklahoma, Oregon, Pennsylvania, Rhode Island, South Carolina, South Dakota, Tennessee, Vermont, Virginia, Washington, West Virginia, Wisconsin, Wyoming, District of Columbia) | Select (inferred) | As listed (list as captured; some states absent from the extract) | — |
| | "Postal code" | Text | — | Placeholder "Zip code" |

**Section: Contact details** — "Company contact details" / "Keep a name and contact information on the company record."

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| "Contact person" | Text | — | Placeholder "Full name" / "Contact person's name"; "Contact person is required" |
| "Job title" | Text | — | "Job title is required" |
| Email | Text | — | "Please enter a valid email address" |
| "Phone number" | Phone input | — | "Enter a valid phone number" |
| "Contact address" | Text | — | "Optional" |

**Section: Defaults & ownership** — "Set company defaults for jobs, interviews, and internal ownership."

| Block | Label | Control type | Options | Validation / hint |
|---|---|---|---|---|
| "Scheduling defaults" — "Used for interview scheduling and job setup." | "Start day" | Select | Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday | — |
| | "End day" | Select | Same seven days | — |
| | "Start time" | Time picker | — | — |
| | "End time" | Time picker | — | "End time must be after start time" |
| | "Default currency" | Select | Currencies | Placeholder "Select currency" |
| | "Working window" | Read-only summary | — | "Working hours timezone: …" |
| Ownership — "Assign the people responsible for this company." | "Primary manager" (shown as "Primary owner") | Select of team members | Users | Placeholder "Select primary manager"; "Primary manager is required" |
| | "Secondary manager" (shown as "Backup owner") | Select of team members | Users | Placeholder "Select secondary manager"; "Secondary manager must be different" |
| | Hint | — | — | "Select a primary manager to make ownership visible on customer lists and filters." |

Fallback texts: "Team member", "Not set".

**Section: Preferences** — "Manage visibility, job defaults, and external references." (block "Options")

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| "Keep customer company name private" | Checkbox / switch | — | "Hide the customer's company name in job postings on social media, job boards, and the career page." |
| "Set this as the default customer" | Checkbox / switch | — | "Default customer pre-populates when creating a new job. Setting this customer as default will remove other customers from default."; shows "Current default customer: …" |
| "Publish jobs on LinkedIn" | Checkbox / switch | — | "If enabled, jobs will be automatically posted on LinkedIn when a LinkedIn company ID is provided."; panel "LinkedIn publishing requirements" |
| "LinkedIn company ID" | Text (numeric) | — | "LinkedIn company ID must be numeric."; help "To locate the LinkedIn company ID, see LinkedIn Help" |
| "Reason for changing the Company ID" | Text (shown when the ID changes, inferred) | — | "Explain why the LinkedIn Company ID is changing."; "Enter at least 5 characters for the change reason."; placeholder "For example: Corrected after verifying the LinkedIn company page" |
| "External reference ID" | Text | — | — |

**Section: Career page** — "Configure the public jobs page for this company."

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| "Public URL" / "Career page URL" | Text suffix after a fixed base URL | — | "Career page URL suffix is required"; "Use letters, numbers, hyphens, or underscores only"; button "Copy public link" |
| "Theme color" | Color picker | — | — |
| "Public preview" | Preview panel | — | Shows "Open roles" |
| "Embed options" → "Direct link" | Read-only code | — | "Use this URL in an anchor tag's href if you'd rather link out than embed." |
| "Embed code" | Read-only code | — | "Copy this code and paste it on the page where the jobs list should appear." |
| "Dynamic height script" ("Script") | Read-only code | — | "Add this to the same page so the iframe resizes automatically as content changes." |

**Section: Review** — "Review & Create" / "Confirm the company setup before saving it."

| Item | Detail |
|---|---|
| Status tags | "Review required", "Ready to update", "Ready to create"; "Check <section>" links for sections with errors |
| Summary cards | "Company details" ("Unnamed company", "Industry not set", "Location"); "Primary Contact"; "Defaults & Ownership" ("Working week", "Working hours", "Salary currency"); "Preferences" ("Enabled" / "Disabled"); "Jobs Page" |

| Message | When |
|---|---|
| "Customer creation failed" / "The customer API did not return an identifier." | Create error |
| "Customer logo update failed" / "The customer was created, but its logo could not be saved. Please edit the customer to add the logo." | Logo save error after create |
| "Logo upload failed. The company was not saved." / "The file API did not return an uploaded filename." | Logo upload error |
| "Cannot add customers" + "Back to companies" | No add permission |
| "Unable to load this company" / "Try again to load the company before making changes." + "Try again" | Load error |
| "The company could not be saved. Your changes are still here." | Save error |

#### Discard changes confirmation (company form)

| Item | Detail |
|---|---|
| Title | "Discard unsaved changes in <section>" |
| Body | "Your changes have not been saved yet. Leaving this form will discard them." |
| Buttons | "Discard changes", "Keep editing" |

#### Company full view — header and tabs

| Item | Detail |
|---|---|
| Routes | `/customers/:customerId`, `/customers/:customerId/details`, `/customers/:customerId/:tab` |
| Purpose | One company's record with profile, contacts, jobs, emails, documents, notes and activity. |
| Breadcrumb ("Breadcrumb") | "Companies" → "Customers" / "Prospects" / "Former customers" → company name |
| Header | Logo, name, type tag, "Account owner: <user>" |
| Header actions | "Send email" (disabled hints: "Add an email address to the primary contact first", "Add an email address to the saved company contact first"), "Schedule event" (event title "Meeting with <name>"), "Add note" / "Add a note", "Edit company", "More options" → "Delete company" |
| Tabs (names present; exact set and order inferred) | "Details", "Contacts", jobs tab, "Emails", "Documents", notes tab, "Activity" / "Timeline", "Events" |
| API | `/customers/:id/details`, `/emails`, `/timeline`, `/contacts`, `/view`, `/edit`, `/companies` |
| Load error | "Unable to load this company" / "It may have been removed, or the request could not be completed." + "Try again" |
| Toasts | "Company added"; "Note added"; "Saved. Refresh the page to reload the company details."; "Primary contact updated" |

#### Company full view — Details tab

| Card | Content | Edit action (opens the matching form section in a drawer, inferred) |
|---|---|---|
| "Company profile" | Description (fallback "No company description added."), industry, size, revenue, website, LinkedIn | "Edit profile" → "Edit company profile" / "Edit company details" |
| "Location & working schedule" | Address; "Working schedule": "Working days", "Working hours (UTC)" | "Edit address", "Edit schedule" → "Edit schedule & account team" |
| "Primary contact" / "Contact information" | Contact name ("Contact name not set"), details; "No primary contact selected" + link "Open contacts to set one"; "Details saved on this company" | "Edit contact" → "Edit primary contact"; "Edit saved details" → "Edit saved contact details" |
| Mismatch notice | "Saved details differ from primary contact" / "These details are saved on the company record. Edit the primary contact if they should match." | — |
| "Account team" | "Account manager and secondary manager"; "Account manager"; fallback "No account managers assigned."; "Unassigned" | "Edit team" |
| "Preferences & job defaults" | "Company visibility and publishing": "Keep company name private" / "Company name private", "Default customer", "Publish jobs on LinkedIn" — each "Enabled" / "Disabled" | "Edit preferences" |
| "Career page settings" | "Public page and branding", "URL suffix" | "Edit career page" |
| "Recent activity" | Latest items; "See notes and updates"; link "View activity" | — |

Inline contact edit errors: "Contact unavailable"; "Unable to load the contact"; "The contact could not be saved. Your changes are still here."; "Discard unsaved contact changes?"; field checks "Enter a first name", "Enter a valid email address".

#### Company full view — Contacts tab

| Item | Detail |
|---|---|
| Heading | "Contacts" / "People linked to this company" |
| Search | "Search company contacts" / placeholder "Search name, email, role, or lead owner"; "Clear search" |
| Columns (inferred) | "Contact" ("Unnamed contact", "Role not specified", "Primary" tag), contact details ("No contact details"), "Lead owner" ("Unassigned"), date ("Date unavailable"), actions |
| Actions | "Add contact" (dialog above), import (dialog below) |
| Bulk bar ("Company contact bulk actions", "Selected on this page") | Same email / export / delete actions as the Contacts list (inferred) |
| Empty | "No contacts yet" / "Add the people you work with at this company." |
| Filtered empty | "No matching contacts" / "Try a different name, email, role, or lead owner." |
| Loading | "Fetching people linked to this company." |

#### Import contacts from CSV dialog

| Item | Detail |
|---|---|
| Title | "Import contacts" / "Upload a CSV, map the fields, then add contacts."; entry button "Import from CSV"; mode tag "CSV import" |
| Steps | "Upload CSV" → "Map fields" → "Import complete" |
| Upload step | "Upload and map contact fields"; drop zone "Drop a .csv file here or click to choose one. We preview the first rows so you can confirm the field mapping."; "Required columns are first name, last name, and email. You can map any extra columns after upload."; link "Download CSV template" |
| Options | "CSV has no header row" — "Use Column 1, Column 2... as temporary headers." / "Turn this on when the first row contains a contact, not column names."; "Update matching contacts" — "Existing contacts are matched and updated." / "Matching contacts will be updated with imported values." |
| Mapping step | "Review column mapping" / "Confirm required fields, leave optional columns unmapped if you do not need them."; "Column mapping" — "Use the pencil on any column header to change or remove a mapping."; per-column popover "Map CSV column <n>" with "Select a field", tag "Required", button "Map column"; "Unmapped columns will be ignored." |
| Mappable fields | First Name, Last Name, Job Title, Email Address, Phone Number, Alternate Phone Number, Address, Country, Zip Code, Linkedin Link, Facebook Link, Twitter Link, Instagram |
| Status line | "Upload a CSV file to start mapping."; "Map required fields: …"; "Required fields still needed: …"; "Missing required data: …"; "Ready to import"; "Review highlighted rows" |
| Buttons | "Import <n>", "Add Contacts", "Upload Again", "Import another CSV" |
| Result | "Contact imported" / "Contacts were added to this customer and are ready to review."; "Contacts added"; "Upload Summary": "Total Uploaded Files : n", "Duplicate Files : n", "Files Not Parsed : n" |

| Validation / error | Text |
|---|---|
| File type | "You can only upload CSV files!" |
| Empty file | "This CSV file does not contain any readable rows." |
| Unreadable | "We could not read this CSV file. Please try another file." |
| No rows | "Please import at least one contact row." |
| Missing columns | "Please include email column!"; "Please include first name column!"; "Please include last name column!" |
| Mapping | "Select a contact field first."; "Select a valid contact field." |

#### Company full view — Jobs tab

| Item | Detail |
|---|---|
| Purpose | Requisitions linked to this customer. |
| Columns (inferred) | Job, "Status", "Candidates", "Updated" |
| Counter | "Showing …"; "Refreshing"; "Loading jobs..." |
| Actions | "Add Job", "Add First Job" |
| Empty | "No jobs yet" / "Create the first requisition for this customer and start tracking candidates from here."; "No requisitions linked to this customer yet" |

#### Company full view — Career page share card

| Item | Detail |
|---|---|
| Heading | "Share this company's open jobs" / "Share this company's public jobs page or embed it on their website" |
| Actions | "Open page", "Copy public URL" (toast "Link copied!") |
| "Advanced embed options" | "Website embed" — "Paste this iframe where the company jobs list should appear."; "Add this script to resize the embedded jobs page automatically." |
| Not configured | "Career page isn't set up yet" / "Add a career page address in company settings to share open jobs." + "Set up career page" |

#### Company full view — Emails tab

| Item | Detail |
|---|---|
| Heading | "Emails" / "Review conversations and follow up with this customer" |
| Field | "Contact email for conversations" (the address threads are matched on, inferred) |
| Action | "Compose email" |
| Empty | "No emails yet" / "Send an email to start the conversation with this customer." |
| Attachments | "View File", "View Resume" |

#### Company full view — Documents tab

| Item | Detail |
|---|---|
| Heading | "Documents" |
| Columns (inferred) | File name, description, "Uploaded" (date, by; fallback "Unknown user"), "Actions" |
| Row actions | "Preview" ("Preview <file>"), "Download" ("Download <file>"), "Delete" ("Delete <file>") |
| Empty | "No documents yet" / "Upload agreements, briefs, and other files for this company." |

**Upload document dialog**

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| "Choose a document" | File drop zone — "Click or drag a file here to attach it." | One file | "Add one customer file up to 10 MB."; "Please choose a document to upload."; "File size should be less than 10MB." |
| Description | Text | — | Placeholder "Add a short note about this document"; "Please write a document description" |

Button "Add Document" (dialog title "Upload document"). Results: "Document Added!"; "Document upload failed. Please try again."

**Delete document confirmation**: "Delete document?" / "This removes <file> …" / buttons "Delete", "Cancel".

#### Company full view — Notes and Activity tabs

| Item | Detail |
|---|---|
| Notes heading | "Capture internal context and follow-ups"; button "Add note"; empty "No notes yet" / "Add context, reminders, and account updates for this customer." |
| Note composer | Same component as "Contact notes panel" above (inferred) |
| Activity heading | "Activity timeline" / "Activity" |
| "Filter activity" ("Activity type") | "All activity", "Details", "Contacts", "Documents", "Events", "Other activity" (option set inferred from adjacent strings) |
| "Sort activity" | "Newest first", "Oldest first" |
| Empty | "No activity yet" / "Notes and updates will appear here as you work with this record." |
| Filtered empty | "No matching activity" / "Choose another activity type to see more updates." + "Show all activity" |
| Other tab names | "Timeline", "Events" |

#### Delete company confirmation

| Item | Detail |
|---|---|
| Trigger | "More options" → "Delete company" |
| Body | "This will permanently remove the company and its associated records." |
| Buttons | "Delete", "Cancel" |

#### Contact full view

| Item | Detail |
|---|---|
| Route | `/contacts/:companyId/:contactId/:tab` |
| Purpose | One contact person's record with company context, emails, notes and timeline. |
| Breadcrumb | "Companies" → "Contacts" → contact name |
| Header | Name, job title, tag "Primary" ("Primary contact for this company") |
| Header actions | "Send email" (disabled hint "Add an email address to this contact first" + "Add email"), "Schedule event", "Add note" / "Add a note", "Edit contact", "More options" → "Delete contact" |
| Tabs (inferred) | Details, "Emails", notes, "Timeline", "Events" |
| API | `/contacts/.../details`, `/companies/contacts`, `/companies`, `/contacts` |

| Block | Rows |
|---|---|
| "Contact details" | Email, phone, "Alternate phone", "View LinkedIn profile"; empty "No email or phone saved yet." + "Complete contact details" |
| "Company" | Name, "Website", "Industry" (industry list), lead priority (Hot lead / Warm lead / Cold lead), "Company size", "Revenue", "Location"; link "Open company" |
| "Ownership" | "Lead owner", "Added by" |
| "Emails" | "Review conversations and follow up with this contact"; "Compose email"; empty "No emails yet" / "Send an email to start the conversation with this contact." |
| Notes | "Internal context and follow-ups for this contact"; "Add note"; empty "No notes yet" / "Keep conversation notes, reminders, and next steps together." |

| Dialog / message | Text |
|---|---|
| Delete contact | "Delete <name>" / "This will permanently remove the contact." / "Delete", "Cancel" |
| Load error | "Unable to load this contact" / "It may have been removed, or the request could not be completed." + "Try again", "Back to contacts" |

---

### Marketing (email marketing / email campaigns)

Permission: "View Email Campaigns". Router titles: "Email Campaigns" (`/email_campaigns`) and "Marketing" (`/marketing`). The bundle holds no campaign-builder strings: the page is a host that launches a separate marketing application inside the ATS (inferred from the launch/connection wording), so the builder screens themselves cannot be reconstructed.

API paths seen: `/api/marketing-pilot/config`, `/api/marketing-pilot/launch`, `/api/marketing-pilot/audience-sources`, `/api/marketing-pilot/audience-sources/.../resolve`; billing: `/api/billing/email-marketing`, `/api/billing/email-marketing/catalog`, `/api/billing/email-marketing/checkouts`.

#### Marketing host page

| Item | Detail |
|---|---|
| Routes | `/marketing`, `/email_campaigns` |
| Purpose | Loads configuration, launches the embedded email-marketing application for the signed-in workspace, and supplies it with audience data from the ATS. |
| Titles | "Marketing", "Email marketing", "Email Campaigns" |
| Notice while open | "Keep this page open. Your draft stays here." |
| Audience bridge | "Audience sources" (ATS records offered to the marketing app as audience sources) |

| Message | When (inferred) |
|---|---|
| "Marketing is not enabled for this account" / "Email marketing requires a current workspace administrator account." | Gate: not enabled or not an administrator |
| "Unable to load email marketing" + "Try again" | Config or launch error |
| "Invalid launch response" | Launch call returned bad data |
| "Marketing requires an approved HTTPS origin." | Origin check failed |
| "Wait for the marketing connection to be ready." | Action attempted before the connection is ready |
| "Marketing connection lost. Check your audience before trying again." | Connection dropped mid-action |
| "Marketing connection closed" / "Marketing connection closed." | Connection ended |
| "Your session changed" / "Reopen Marketing from your current workspace to continue." ("ATS session changed", "Session changed") | User or workspace switched |
| "Could not load these records. Check your access and try again." | Audience source fetch failed |
| "Audience import is not available in this marketing release. Please try again after the update." | Version mismatch |
| "Invalid audience source", "Invalid search", "Invalid audience filter", "Invalid selection", "Invalid audience action" | Request validation errors from the embedded app |

#### Local sandbox notice (developer-only state)

| Item | Detail |
|---|---|
| Titles | "Email marketing sandbox", "Email marketing local sandbox", "Preview email marketing locally", "Sandbox help" |
| Text | "The live marketing site only opens inside app.cvviz.com. Localhost uses an isolated sandbox, not your signed-in tenant."; "In the marketing worktree containing your UI changes, start the simulator:" / "Start the simulator from the marketing worktree containing your UI changes:"; "Then open the sandbox and choose a demo workspace. Data resets when the simulator restarts. Do not enter customer data."; "Demo data resets on restart. Do not enter customer data." |
| Buttons | "Open local sandbox", "Open live email marketing" |

#### Add to email marketing audience dialog (shared; opened from candidate lists and sourcing suggestions)

| Item | Detail |
|---|---|
| Trigger | Bulk action "Add to Email Marketing Audience" on candidate lists; "Add to audience" on suggested candidates |
| Title | "Add to email marketing audience" / "Add selected candidates to an audience. No emails will be sent or credits used." |
| Button | "Add to audience" |

| Label | Control type | Options | Validation / hint |
|---|---|---|---|
| "Destination" | Radio | "Existing audience", "New audience" | — |
| "Audience" | Select (for existing) | Ready audiences; "Load more audiences" | Placeholder "Choose an audience"; empty "No ready audiences. Create a new one or load more."; hint "Creates an updated audience version. Campaigns and automations keep the version they already selected." |
| "Audience name" | Text (for new) | — | — |
| "Review selected emails" | Read-only list of chosen people | Rows without an address show "No email" | "Select up to 100 unique emails at a time." |
| "Marketing permission note" → "I confirm these candidates have agreed to receive marketing emails." | Checkbox (required, inferred) | — | "A candidate profile alone does not indicate marketing consent. Unsubscribed or blocked contacts remain excluded." |

| Message | When |
|---|---|
| "The audience is being prepared. Select its latest version for future campaigns. Existing campaign selections and opt-outs are unchanged." | Success |
| "No contacts were added" / "Existing campaign selections and opt-outs are unchanged." | Nothing added |
| "Email marketing is not available for this account" / "An administrator account with email marketing access is required." | Gate |
| "Unable to load audiences" / "Close and reopen this dialog to try again." | Load error |
| "Session changed" / "Your session changed" | Session switch |

#### Email marketing credits (Billing settings panel)

| Item | Detail |
|---|---|
| Location | Billing settings (`/settings/billing`), with link "Return to marketing" (→ `/email_campaigns`) |
| Purpose | Buy and track prepaid email-sending credits for the workspace. |
| Heading | "Email marketing credits" / "Credit purchases and delivery for this workspace." |
| Blocks | "Email credit packs" (pack tiles, "Choose …", "Reload offers"); "Recent credit purchases" ("Refresh status"; "Up to 20 paid purchases. Test credits and pending payments are not listed here."; empty "No paid email-credit purchases yet."; "This is a past credit addition, not your remaining balance.") |
| Usage rule | "One credit per recipient email accepted by the provider, including test emails. Delivery is not guaranteed." |
| Actions | "Buy credits", "Buy another pack", "Check status" |

**Review email credit purchase dialog**

| Row | Text |
|---|---|
| Summary | "Pack: …", "Total: …" |
| Terms | "Credits expire exactly 90 days after successful payment. Earlier-expiring credits are used first. This purchase does not extend older credits. No automatic renewal."; "No routine refunds. Contact support for duplicate charges, payment errors or missing credits." |
| Required checkbox | "I understand the 90-day expiry and purchase terms." |

| Status / message | Text |
|---|---|
| Success | "Credits added" / "View your available balance in Marketing settings." |
| In progress | "Payment received" / "Credits are being added. Please do not purchase again."; "Checking payment and credit delivery" / "If you paid, do not pay again. Contact support if this status persists." |
| Needs review | "Purchase needs review"; "Needs attention" / "Credit delivery needs review. Contact support with the reference below." |
| Not yet offered | "Credit purchases are not available yet" / "Email credit checkout is being prepared. Other ATS add-ons do not increase your marketing balance." |
| Pre-condition | "Complete your billing address before purchasing email credits." |
| Errors | "Payment window could not load. Please retry."; "Credit offers timed out. Please reload offers."; "Could not load credit packs. Existing purchases are unchanged."; "Checkout could not be verified. Contact support before retrying."; "Checkout is unavailable. Please retry with the same pack."; "Could not load email credits"; "Purchase status could not be checked. This does not mean a payment failed." |
| Gate | "Email marketing is not available for this account" / "An eligible workspace administrator can access email marketing billing." |
| Session | "Your session changed" / "Reload this page to view the current workspace." |

---

## 10. Building this into MyJKKN HR

### 10.1 Principle

CVViZ is not kept as a separate product. Its features become **the recruitment module of MyJKKN HR**, at `/hr/recruitment`, which already exists. Each CVViZ feature is either already there, added to it, or left out. Recruitment and HR are one flow: a candidate who joins becomes a team-member record in HR, and their hiring history stays attached to that record.

### 10.2 Decisions (DTO interview, 2026-10-03)

| # | Question | Decision |
|---|---|---|
| 1 | What happens in HR when a candidate joins | HR confirms on a short pre-filled form, then the HR record is created and linked to the candidate. This is the existing MyJKKN step, kept. Login is enabled separately, as now |
| 2 | Hiring stages | Keep the MyJKKN stages and approval flow. Add the CVViZ detail MyJKKN lacks: interview rounds, assessment step, hold, rejection reasons |
| 3 | The 362 candidates already Joined in CVViZ | Link each to the existing HR record by email, then phone. Unmatched ones go to a review list. No HR records are created for them |
| 4 | First release, beyond jobs, candidates and the archive | Pre-screening questions only. Reports, job-board publishing and editable email templates come later |
| 5 | Who creates and manages jobs | Same as CVViZ: department heads and principals for their own institution; HR and admins for all. Every job still passes the MyJKKN approval flow |
| 6 | What carries over to HR on joining | Resume and documents; interview feedback and notes; agreed pay package; qualifications and experience |
| 7 | Public applications after CVViZ | MyJKKN careers page only. The old CVViZ career-page links are retired |
| 8 | Cut-over | Institution by institution, Nursing first as the pilot |
| 9 | Which CVViZ jobs become live in MyJKKN | Jobs marked In Progress that received an application in the last 12 months. All 388 go to the archive regardless |
| 10 | Arts & Science Self and Aided | Kept separate. Each Arts & Science job is assigned to Self or Aided by the reviewer; until then it is held as pending |
| 11 | The 1,714 old CVViZ tasks | Archive only. Not recreated as live tasks |
| 12 | The 47 jobs deleted in CVViZ | Imported, marked deleted, hidden by default, with a filter for admins |

Earlier decisions (2026-10-01) still stand: archive tables plus selective promotion; keep all 24,934 applications; all resumes to Google Drive; access by institution with admins seeing everything.

### 10.3 Stage model

The MyJKKN stage is the top level. The CVViZ detail sits under it as a sub-stage, so approvals and My Desk keep working unchanged.

| MyJKKN stage | Sub-stages added from CVViZ |
|---|---|
| Pending Review | New |
| Reviewed | Phone screened; No response; Internal review; Shared with reviewer |
| Shortlisted | Resume shortlisted; Assessment invited / scheduled / passed / failed; Interview round 1, intermediary, final, each with invited / scheduled / passed / failed / no-show / declined by candidate; Hold |
| In Approval | (MyJKKN approval chain, unchanged) |
| Approved | Package fixed; Offer issued; Offer accepted; Background check |
| Joined | Joined (creates the HR record, see 10.4) |
| Rejected | With a reason from the 29-reason list, grouped: screening, interview, offer, general |
| Closed | Offer declined; Not joined; Not interested; Withdrawn |

Interview rounds use the existing `hr_recruitment_interviews` rows (`round_number`, `round_name`, `status`); no new table. New pieces: a `sub_stage` value on applications and candidates, and `rejection_reason_id` pointing to a small reasons table seeded from CVViZ.

### 10.4 Joining: candidate to HR record

The existing step is the onboarding action on a finally approved candidate, opened from the job workspace (handler file: lib/api/hr/recruitment/candidates/handlers, the onboard handler). It creates the HR record and marks the candidate joined, and it is limited to users who may create HR records. The changes below extend it; they do not replace it.

| HR field | Filled from | Today | Change |
|---|---|---|---|
| First name, last name | Candidate name | Typed on the form | Pre-fill |
| Email, phone | Candidate | Typed | Pre-fill |
| Institution, department | Job | Typed | Pre-fill from the job |
| Designation | Job title | Typed | Pre-fill, editable |
| Category | Job role category | Typed | Suggest from role category |
| Date of joining | Expected joining date on the candidate | Typed | Pre-fill, editable |
| Gender, date of birth, marital status | Not collected in hiring | Typed | Still typed by HR (required) |
| Qualifications, experience, previous employer | Application (`qualification`, `experience_months`, `current_company`) | Not carried | **New:** copied to the HR profile |
| Resume and hiring documents | Application `resume_url` (Drive) | Not carried | **New:** listed under the HR documents of the team member |
| Agreed pay package | `hr_recruitment_candidate_packages` (approved) | Not carried | **New:** becomes the starting pay details in HR payroll data |
| Interview feedback and notes | Scorecards, candidate comments | Stay in recruitment | **New:** a "Hiring history" panel on the HR profile, visible to HR and admins only |
| Link back | none | None | **New:** the HR record stores the candidate id, and the candidate stores the HR record id |

Rules:
- The HR record is created only when HR submits the form. Nothing is created automatically.
- If an HR record with the same email already exists, the form offers to link to it instead of creating a second one. This also covers rehires and internal transfers.
- The pay package and the feedback panel follow the existing HR access rules for pay and for confidential notes.

**Past joiners (decision 3).** A one-time job matches the 362 CVViZ "Joined" applications to HR records by email, then phone. A match stores the link, so the "Hiring history" panel shows the CVViZ application, resume, feedback and notes from the archive. Non-matches go to a review list for HR; no record is created.

### 10.5 Cut-over, per institution

1. Import the CVViZ history of that institution into the archive (jobs first, then applications, activity, resumes).
2. The reviewer signs off the department map. For Arts & Science, the reviewer also marks each job Self or Aided.
3. Set up the users of that institution in MyJKKN with the recruitment permissions that match their CVViZ role.
4. Promote the live jobs (decision 9) and their applications into the working tables.
5. The institution stops using CVViZ. Its open jobs are republished on the MyJKKN careers page.
6. After the last institution, take a final delta export, then stop the CVViZ account.

Order: Nursing (pilot), JICATE, Education, Allied Health, Dental, Pharmacy, Matric school, Engineering, Arts & Science, Main Office, then the general talent pool.

### 10.6 Module by module

Priorities: **P1** = in the first release or needed before CVViZ can be switched off; **P2** = soon after; **P3** = later; none = not planned.

| # | CVViZ module | MyJKKN today | Gap to build | Priority |
|---|---|---|---|---|
| 1 | Dashboard | Recruitment dashboard exists | Review queue, record-cleanup queue, "past target" counters, source chart | P2 |
| 2 | Jobs | `hr_recruitment_jobs` and job screens exist | Skills with level, qualifications list, job function, hiring team, tags, saved views, grid layout, bulk status change | P2 |
| 3 | Job approval | `hr_approval_flows` (stronger than CVViZ) | Nothing | none |
| 4 | Job publishing | Public careers API exists | Share buttons, embed code, Google Jobs markup, Indeed feed. Indeed and LinkedIn bring a quarter of applicants | P3 |
| 5 | Paid campaigns | None | Not planned | none |
| 6 | Candidates in a job | Applications and candidates lists exist | Interview rounds, assessment step, hold and rejection reasons (see 10.3); stage chip bar; ratings in the row | P1 |
| 7 | Candidate profile | Candidate detail exists | One timeline, screening answers panel, other-applications panel, inline resume viewer | P2 |
| 8 | Candidate database | Candidates list exists | Talent pool (applications with no job), search across live and archive, dedupe by email | P1 |
| 9 | People search | None | Not planned | none |
| 10 | AI sourcing | None | Not planned | none |
| 11 | Parsing, match score, AI evaluation | None | Optional later. CVViZ resume-parsed fields come over in the archive | P3 |
| 12 | Pre-screening questions | None | Question bank, per-job selection, answers on the apply form. **In the first release** | P1 |
| 13 | Feedback and scorecards | `hr_recruitment_scorecards` exists | Basic or detailed choice per job | P3 |
| 14 | Notes, mentions, tasks | Job notes and candidate comments exist | Private flag, tasks on My Desk | P3 |
| 15 | Email templates | Decision emails, fixed in code | Editable templates with merge fields | P3 |
| 16 | Email campaigns | None | Not planned | none |
| 17 | Calendar and booking | Interview slot booking exists | Nothing | none |
| 18 | Job offers | Offer step and packages exist (stronger) | Nothing | none |
| 19 | Sharing shortlists | None | A read-only shortlist link for approvers, if wanted | P3 |
| 20 | Reports | Dashboard and staffing-need analytics | Jobs, users, source and time-to-fill reports with institution grouping and export | P2 |
| 21 | Notifications | MyJKKN notifications exist | Recruitment events wired in | P3 |
| 22 | Users, roles | MyJKKN roles and permission keys | Map the 17 CVViZ roles to MyJKKN roles per institution | P1 |
| 23 | Departments, hiring managers | `departments`, principals and heads | Department map (79 rows) reviewed per institution | P1 |
| 24 | Hiring pipelines | Fixed stage model | Keep fixed | none |
| 25 | Vendors | None | Not planned | none |
| 26 | Companies and CRM | None | Not planned (agency feature) | none |
| 27 | Child companies | Institutions already separate data | Nothing | none |
| 28 | Automations | None | Not planned in the first release | none |
| 29 | Integrations | Google Drive for resumes, email sending | Nothing | none |
| 30 | Webhooks and API | API-key routes exist elsewhere in MyJKKN | Nothing | none |
| 31 | Compliance | Purge of rejected applicants exists | Consent capture on the public apply form is already recorded (`consent_at`) | none |
| 32 | Referral portal | Internal "Apply for Jobs" exists | Nothing | none |
| 33 | Billing | Not applicable | Nothing | none |
| 34 | Saved views, shortcuts | None | With item 2 | P3 |
| 35 | Sign-in, onboarding | MyJKKN sign-in | Nothing | none |
| — | **CVViZ history** | Phase 1 files ready: jobs archive table and importer | Apply phase 1, then applications, activity and resumes, institution by institution | P1 |
| — | **CV link dependency** | `hr_recruitment_candidates.cvviz_url` is required | Make it optional and use the Drive resume | P1 |


---

## 11. Best features from other portals

CVViZ is one product. This section adds the strongest ideas from ten other recruitment portals, so the MyJKKN HR recruitment module can take the best of each. It was researched on 2026-10-03 from the vendors' own product and help pages; every row in 11.4 carries its source link.

### 11.1 Portals covered

| Portal | What it is | Status (Oct 2026) | Strongest at |
|---|---|---|---|
| Zoho Recruit | Applicant tracking, part of the Zoho suite | Active | Guided process (Blueprint), approval deadlines, WhatsApp, hand-over to Zoho People |
| Freshteam | Recruitment plus onboarding, by Freshworks | **Discontinued.** Announced 5 Jan 2026; last renewals stopped 7 Jun 2026. Used here as design reference only | Requisitions, staged approvals, panel load balancing, joiner form that fills the HR record |
| Keka | Indian HR system with recruitment (Keka Hire) | Active | Offer letter with pay break-up from payroll, pre-boarding, document collection, probation |
| Darwinbox | Enterprise HR system with recruitment | Active | Position budgeting, statutory forms, identity document scanning, hand-over to core HR and payroll |
| Workable | Applicant tracking | Active | Hiring plan with budget, interview kits, explained AI score, onboarding portal |
| Greenhouse | Enterprise applicant tracking | Active | Structured interviews: scorecards, focus attributes, interviewer calibration, approval gates |
| Breezy HR | Simple applicant tracking | Active | Automatic actions per stage, answer-based auto-move, consent expiry |
| Tellent Recruitee | Collaborative applicant tracking | Active; renamed from Recruitee on 23 Apr 2025 | Careers site builder, stage time limits, fair evaluations, templates |
| Leoforce | AI sourcing and matching (the Arya product) | Active; the Arya name no longer appears on its site | Matching, re-use of the existing candidate database |
| TurboHire | Indian AI-assisted applicant tracking | Active | Walk-in and campus drives, WhatsApp bot, no-login access for interviewers |

### 11.2 Shortlist for MyJKKN HR recruitment

Each idea is listed once, at the hiring step where it applies.

"MyJKKN today" is from the code as of this spec:
- **Has** = already built.
- **Partly** = a related feature exists.
- **No** = not present.
- **To check** = a related feature exists and needs a closer look before deciding.

Suggested tier:
- **A** = small, high value, fits the first release.
- **B** = the next release.
- **C** = later, or only if wanted.

These tiers are proposals for the DTO to confirm; they do not change the decisions in section 10.

**Requesting and approving a post**

| # | Feature | Seen in | MyJKKN today | Tier |
|---|---|---|---|---|
| 1 | Hiring request raised by the department head before any job exists, with reason, number of openings and budget | Workable, Freshteam, Recruitee, TurboHire | Partly: jobs go through `hr_approval_flows`; sanctioned posts and the staffing-need analysis exist separately | B |
| 2 | Replacement request raised straight from a resignation or exit approval, pre-filled from the leaving person, duplicates blocked | Keka, Freshteam, Darwinbox | Partly: an offboarding area exists; no link to a new job request | B |
| 3 | Approval chain chosen by rules (institution, department, role category, pay range, new post or replacement) | Keka, Darwinbox, Freshteam | Has: approval flows per organisation and role. To check: rule conditions on pay range and replacement | A (check only) |
| 4 | Approval deadline with reminders and an automatic action when it passes | Zoho Recruit | Partly: escalations table exists | A |
| 5 | Re-approval when key details change after approval (openings, department, pay) | Greenhouse | No | B |
| 6 | Stand-in approval when an approver is away, with the record kept | Greenhouse, Keka | Partly: approve-override permission exists | A (check only) |
| 7 | Approver view showing profile and all interview feedback together, with bulk approve | TurboHire | Partly: approval queue exists | B |

**Attracting applicants**

| # | Feature | Seen in | MyJKKN today | Tier |
|---|---|---|---|---|
| 8 | Internal openings with a personal referral link; whoever applies through it is recorded as that person's referral | Zoho Recruit, Breezy HR, Workable | Partly: internal "Apply for Jobs" exists; no referral link | B |
| 9 | Internal application policy: minimum time in the organisation and in the current role, with prior approval | Keka | No | C |
| 10 | Cooling-off period before the same person can re-apply, and a block list | Zoho Recruit | No | A |
| 11 | Walk-in drive mode: quick registration, screening and same-day interview queue for many candidates | TurboHire | No. Relevant: JKKN holds walk-in interviews (interview mode `walk_in` exists) | B |
| 12 | Careers page per institution or department, job alerts for visitors, embeddable jobs widget | Recruitee | Partly: one public careers page | C |
| 13 | Resumes sent to a hiring email address become applications automatically, tagged with their source | Freshteam, Keka | Partly: an `email_ingest` source value exists. To check | C |

**Screening**

| # | Feature | Seen in | MyJKKN today | Tier |
|---|---|---|---|---|
| 14 | Knock-out questions: a chosen answer moves or rejects the applicant automatically, with the reason stored | Breezy HR, Freshteam, Recruitee | No. Fits the pre-screening questions already chosen for the first release | A |
| 15 | Application form that changes with earlier answers | Zoho Recruit | No | C |
| 16 | Follow-up form sent to one or many candidates to collect missing details, usable as filters | TurboHire | No | B |
| 17 | Hide name, photo and contact details during first screening | Workable, Greenhouse, Recruitee | No | C |
| 18 | Past candidates suggested when a new job opens (by role, from the talent pool and the archive) | Freshteam, Workable, Recruitee, Leoforce, Darwinbox | No. The CVViZ archive (24,934 applications) makes this valuable | B |
| 19 | Weighted profile score with visible parts (skills, experience, degree, previous organisation), weights set per job | Keka, Workable, Breezy HR | No | C |
| 20 | Score that explains itself: each requirement shown as met, partly met or not met | Workable, Recruitee, Darwinbox | No | C |

**Interviews and evaluation**

| # | Feature | Seen in | MyJKKN today | Tier |
|---|---|---|---|---|
| 21 | Interview kit per round: what to assess, suggested questions, preparation notes, expected duration | Greenhouse, Workable, Breezy HR, TurboHire | Partly: scorecards exist | B |
| 22 | Focus attributes: each interviewer is told which criteria they own | Greenhouse | No | B |
| 23 | One fixed overall verdict on every scorecard (Definitely not / No / Yes / Strong yes) | Greenhouse | To check against the scorecard form | A |
| 24 | Other interviewers' feedback stays hidden until you submit your own | Greenhouse, Workable, Recruitee | No | A |
| 25 | Automatic feedback reminders until the scorecard is submitted | Keka, Greenhouse | No | A |
| 26 | Panel load balancing: when more interviewers are named than needed, pick those with fewer interviews that week; weekly cap per interviewer | Freshteam, Greenhouse | Partly: slot booking exists | C |
| 27 | Candidate picks a slot that suits the whole panel | Workable, Breezy HR | Has: public interview slot booking. To check for panels | C |
| 28 | Interviewer calibration report: how each interviewer rates compared with others, and how often they give no decision | Greenhouse | No | C |
| 29 | Interviewers give feedback from a phone link without signing in | TurboHire, Darwinbox | No | C |
| 30 | One-way video interview: candidate records answers in their own time | Zoho Recruit, Workable, TurboHire | No | C |

**Moving candidates along**

| # | Feature | Seen in | MyJKKN today | Tier |
|---|---|---|---|---|
| 31 | Automatic actions when a candidate enters a stage: send email or message, send a form, request feedback, create a task, assign a reviewer | Breezy HR, Freshteam, Recruitee, Zoho Recruit | No | B |
| 32 | Time limit per stage, with a notice when a candidate has waited too long | Recruitee | Partly: My Desk shows waiting items | A |
| 33 | WhatsApp messages from templates, sent by hand or by a rule (for example an interview reminder) | Zoho Recruit, TurboHire, Darwinbox, Keka | Partly: MyJKKN has WhatsApp integration elsewhere; recruitment does not use it | B |
| 34 | Reusable templates for pipelines, jobs, emails, offers and evaluations | Recruitee | Partly | C |
| 35 | Mandatory standard reason when an offer is withdrawn or a candidate is rejected | Zoho Recruit, Greenhouse | Partly: rejection reason text exists; the 29-reason list is planned in 10.3 | A |

**Offer, pre-boarding and joining**

| # | Feature | Seen in | MyJKKN today | Tier |
|---|---|---|---|---|
| 36 | Pre-offer stage: proposed terms shared and negotiation rounds tracked before the formal letter | Zoho Recruit, Darwinbox | Partly: packages can be proposed and approved | C |
| 37 | Offer letter templates by role, with placeholders, each carrying its own approval chain; version history | Keka, Darwinbox, Breezy HR | Partly: offer step exists. To check for letter templates | B |
| 38 | Pay break-up built from the payroll set-up, adjustable at offer time, and carried into the salary record | Keka | Partly: packages exist; carry-over to HR pay is decided in 10.4 | A |
| 39 | Documents collected from the candidate before the offer or before joining (education proofs, identity, past payslips), per candidate | Keka, Darwinbox | Partly: onboarding checklists exist | A |
| 40 | Joiner form (personal details, education, uploads) whose answers fill the HR record on conversion | Freshteam, Workable | No. Directly serves decision 6 in 10.2 and removes HR typing in 10.4 | A |
| 41 | Pre-boarding screen: one list of pending tasks for the candidate and for internal people, with remind, revise and revoke | Keka, Workable | Partly | B |
| 42 | Convert several joiners into HR records in one action | Keka, Darwinbox | No | B |
| 43 | Background verification as a recorded step, with the report and a pass or fail result stored | Keka, Darwinbox, Breezy HR | No | C |
| 44 | Statutory forms (PF, ESI, insurance) filled automatically from onboarding data | Darwinbox | No | C |
| 45 | Identity documents read automatically (PAN, Aadhaar) | Darwinbox | No | C |
| 46 | Probation with review points, feedback forms, reminders and a dashboard | Keka | To check in MyJKKN HR | C |
| 47 | E-signature on the offer letter | Freshteam, Breezy HR, Recruitee, Workable | No | C |

**Reports, control and compliance**

| # | Feature | Seen in | MyJKKN today | Tier |
|---|---|---|---|---|
| 48 | Report builder over any field, saved to dashboards, with scheduled email delivery | Workable, Darwinbox | No. Reports are planned after the first release | C |
| 49 | Consent with an expiry date, renewal request and automatic removal | Breezy HR | Partly: consent time is recorded; a purge of rejected applicants exists | B |
| 50 | Candidate data rights under India's data protection law (access, correction, erasure, grievance) | TurboHire | No. Relevant to the decision to keep all applications | B |
| 51 | Audit log of every approval and of changes to roles and candidate profiles | Workable, TurboHire, Greenhouse | Partly: approval chain is stored | B |
| 52 | Outside recruiter portal showing only their own candidates | Zoho Recruit, Breezy HR, Recruitee, TurboHire | No. JKKN uses no agencies today | none |

### 11.3 What stands out for JKKN

Thirteen of the 52 are marked tier A. Three of those are only checks of what MyJKKN already has (3, 6, 23).

- **Knock-out questions (14).** It is a small addition to the pre-screening questions already chosen for the first release, and it cuts review work on the 91% of applications that never leave "New".
- **Joiner form that fills the HR record (40), with document collection (39) and pay carry-over (38).** Together these complete the "candidate joins, HR record is created" flow in 10.4: the candidate types their own details and uploads their own proofs, and HR only confirms.
- **Hidden peer feedback (24), fixed verdict (23) and feedback reminders (25).** These are small changes to the scorecard that make interview panels more consistent.
- **Approval deadline (4) and stage time limit (32).** These stop candidates waiting unseen in a principal's or management queue.
- **Cooling-off period (10) and mandatory reasons (35).** These are simple rules that keep the data clean.

Two tier B items fit JKKN's way of hiring especially well: **walk-in drive mode (11)** and **past candidates suggested for a new job (18)**, which puts the imported CVViZ history to use.

Not recommended: outside recruiter portals, paid job advertising, AI sourcing from external databases, and one-way video. JKKN does not hire that way today.

### 11.4 Detail per portal, with sources

Checked on 3 October 2026. Every row cites a page that was opened during this research. Prices are left out on purpose. Plan names are mentioned only where the vendor's own page ties a feature to a plan.

---

#### Zoho Recruit

Recruitment system from Zoho with separate editions for in-house hiring teams and for recruitment agencies; actively sold and updated (the vendor's release log shows new features every month through September 2026).

| Feature | What it does (1–2 plain sentences) | Why it is notable | Source |
|---|---|---|---|
| Blueprint (guided hiring process) | The hiring process is drawn as a sequence of steps with drag and drop. For each step you set who may act, what conditions must be met and which actions run automatically (emails, record updates). | Turns an offline, paper-style process into an enforced path, so each person sees only the next allowed action. Fits a chain such as department head, principal, management. | https://www.zoho.com/recruit/blueprint-recruitment-automation.html |
| Approval SLA | A deadline can be set on any approval request, with reminders and automatic actions when the deadline passes. | Most systems only send an approval request and wait. This one handles a stalled approver. Released September 2026. | https://www.zoho.com/recruit/whats-new.html |
| Multiple hiring pipelines | Each job can have its own process with its own stages and statuses. | Lets a teaching post and a non-teaching post follow different stages in the same account. Released July 2026. | https://www.zoho.com/recruit/whats-new.html |
| Internal job portal with tracked referral links | People inside the organisation see internal openings and get a unique link; anyone who applies through that link is recorded as their referral. | Referral credit is automatic, with no form to fill in. Released July 2026. | https://www.zoho.com/recruit/whats-new.html |
| Vendor portal with live pipeline | Outside recruiters get a branded portal to add candidates. They see the progress of their candidates in real time and receive alerts when a job is shared, a note is added or a status changes. | Gives agencies a view of progress without giving them access to the main system. | https://www.zoho.com/recruit/whats-new.html |
| Cooling-off period and blocked candidates | A waiting period stops the same person re-applying too soon through the careers site, vendor portal or referral route. Specific candidates can be blocked from applying with the same email. | Controls repeat applications across every entry route, not only the careers site. | https://www.zoho.com/recruit/whats-new.html |
| Screening bot with auto-triggered assessment | When a person applies, a bot starts the assessment straight away, finds candidates who skipped it, and passes or rejects them on the result. Assessments can be generated from basic job details in one click. | Screening happens with no manual follow-up, and the test itself does not need to be written by hand. | https://www.zoho.com/blog/recruit/zia-ai-within-zoho-recruit.html |
| Zia candidate matches and profile summary | The built-in assistant shortlists candidates by comparing skills and qualifications with the job, and the match can be narrowed to experience, skills or location. It also writes a structured summary of each profile (overview, skills, experience, qualifications, accomplishments). | The summary is offered in six languages according to the release log. | https://www.zoho.com/blog/recruit/zia-ai-within-zoho-recruit.html |
| One-way video interview with transcript and summary | Candidates record answers in their own time; the hiring team reviews, comments and saves the recording with the profile. Since November 2025 the system also produces a transcript and a summary of the recording. | Reviewers can read instead of watching every recording. | https://www.zoho.com/recruit/video-interview.html |
| Numerical interviewer rating with thresholds | Interviewers score each question with a number and a pass threshold can be set. A separate Reviews area lists all evaluations of a candidate in one place. | Gives a comparable score per interviewer instead of free-text comments. | https://www.zoho.com/recruit/whats-new.html |
| Form rules | The application form changes what it shows based on what the candidate has already entered. | One form can serve different kinds of posts without showing irrelevant questions. | https://www.zoho.com/recruit/whats-new.html |
| WhatsApp messaging | Recruiters chat with candidates on WhatsApp from inside the system, use saved message templates, and let workflow rules send those templates on set events such as an interview reminder. | Two-way chat is kept in the candidate record. Relevant in India, where WhatsApp is the usual channel. Announced June 2023. | https://www.zoho.com/blog/recruit/writer/announcing-zohorecruit-whatsapp-integration.html |
| Pre-offer stage and offer withdrawal reason | Proposed terms are shared with the candidate before the final offer, and several rounds of negotiation are tracked. When an offer is withdrawn, a standard reason must be recorded. | Separates negotiation from the formal letter and keeps a record of why offers fell through. | https://www.zoho.com/recruit/whats-new.html |
| One-click hand-over to Zoho People | Changing a candidate's status from hired to joined creates the person's Zoho People account with the right access, using mapped fields, and onboarding can be started from the recruitment screen. | No re-typing of candidate data into the HR record. This is the same hand-over JKKN needs into MyJKKN HR. | https://www.zoho.com/recruit/zoho-people-integration.html |

Weak spots: the vendor's plan comparison lists Blueprint, the candidate portal and the vendor portal under the Enterprise edition and lists video interview as a paid add-on, so several of the features above are not in the lower editions (https://www.zoho.com/recruit/plan-comparison.html). The compliance page describes consent notices and consent marking but says nothing about automatic deletion after a retention period (https://www.zoho.com/recruit/compliance-features.html).

---

#### Freshteam (by Freshworks)

Combined recruitment and HR system for small and mid-sized organisations. **Discontinued:** Freshworks announced the sunset on 5 January 2026; annual and half-yearly renewals stopped on 7 March 2026, monthly renewals stopped on 7 June 2026, and data can be exported for 90 days after a paid subscription ends, after which it is deleted (https://support.freshteam.com/support/solutions/articles/19000162935-freshteam-sunset-support-faqs ; news report dated 8 January 2026: https://www.peoplematters.in/amp/news/business/freshworks-to-end-freshteam-hr-product-stop-renewals-from-march-2026-47939). It cannot be bought any more, but its design is still worth studying.

| Feature | What it does (1–2 plain sentences) | Why it is notable | Source |
|---|---|---|---|
| Requisition with backfill link | A hiring manager raises a requisition before any job is opened. If the type is "Backfill", the person who is leaving is named on the requisition. | Ties each vacancy to the departure that caused it, which makes headcount easy to justify. | https://support.freshteam.com/support/solutions/articles/19000100351-creating-a-new-job-requisition- |
| Requisition lifecycle | A requisition moves from Pending Approval to Approved, is then attached to a job opening, and recruiters are allocated to it. | A job cannot be opened until the requisition is fully approved. | https://support.freshteam.com/support/solutions/articles/19000103864-understanding-the-job-requisition-process |
| Staged approval rules | Each rule has named stages (for example Manager, Finance), each with its own approvers and one of three modes: everyone must approve, anyone can approve, or auto-approve with notification only. Conditions decide which requisitions fall under which rule, so different departments or locations get different chains. | The three modes per stage cover most real approval chains with very little setup. | https://support.freshteam.com/support/solutions/articles/19000100354-creating-a-new-approval-rule- |
| Autopilot (event, condition, action) | Automations start on four events (added to a job, moved to a stage, rejected, archived), check conditions (form answers, source, referral, tags, stage, job role) joined with AND/OR, and then act: move or reject, tag, email, comment, create a task, send a test, or call a webhook. | A small, clear rule model that non-technical people can set up. | https://support.freshteam.com/support/solutions/articles/19000083027-setting-up-autopilot-workflow-automations-for-your-hiring-process |
| Knock-out questions with auto-reject | Custom questions (experience, notice period and so on) are added to the application form. An Autopilot rule rejects any applicant whose answer falls outside the set range, with an optional email to the candidate. | Removes unqualified applicants before anyone reads the resume. | https://support.freshteam.com/support/solutions/articles/19000135724-how-to-automatically-reject-candidates-based-on-custom-knockout-questions |
| Listener (email intake) | The system watches approved email addresses and patterns. Resumes that arrive by email are parsed into candidate profiles and tagged with the right source; a resume forwarded by a team member is recorded as that person's referral. Emails it cannot parse are kept in a queue for manual handling. | Captures applications that arrive by email or from job boards with no direct link. | https://support.freshteam.com/support/solutions/articles/19000089260-understanding-listener-and-email-channels |
| Talent pool tied to job roles | A rejected but good candidate is archived with one or more "recommended job roles". When a new job is created for that role, the system lists those people. | Past applicants come back on their own when a matching post opens. | https://support.freshteam.com/support/solutions/articles/19000050907-understanding-the-talent-pool |
| Self-scheduling with panel load balancing | The recruiter sets duration, type, stage and how many interviewers are needed. If more interviewers are named than needed, the system picks those with fewer interviews that week and takes earlier contact with the candidate into account. Candidates can reschedule if allowed. | Spreads interview work fairly across a panel without manual planning. | https://support.freshteam.com/support/solutions/articles/19000129253-enable-candidate-self-schedule |
| Scorecards with interviewer hints | A scorecard lists competencies, each answered by rating, rating with comment, single choice, multiple choice or text. Each competency can carry a hint telling the interviewer what to look for, and a visibility setting controls who can see the scorecard. | The hints act as a simple interview guide inside the feedback form. | https://support.freshteam.com/support/solutions/articles/19000012865-creating-interview-scorecards |
| Offer approval and e-signature | An offer goes from draft through one or more approval stages; once approved it can no longer be edited. It is then sent by email or for e-signature through DocuSign or SignEasy, with extra signers if needed, and signer actions show on the candidate profile. | The lock after approval prevents changes to terms that were already signed off. | https://support.freshteam.com/support/solutions/articles/19000050905-how-to-make-an-offer-to-a-candidate- |
| New hire form that fills the HR record | With the welcome kit, the new joiner gets a form with three parts: personal details, employment and education, and file uploads. When the candidate is converted, the answers fill the matching fields of the HR record. | Document and data collection happens before day one and nothing is typed twice. | https://support.freshteam.com/support/solutions/articles/19000137885-how-to-send-the-new-hire-form-to-candidates-while-onboarding |
| Welcome kit and onboarding queue | New joiners move through "New Hire Queue" and "Onboarding Initiated". HR sends a welcome kit with chosen documents, can start an internal checklist of tasks, and can send bulk reminders to those who have not started. | One screen shows who has and has not completed pre-joining steps. | https://support.freshteam.com/support/solutions/articles/19000100355-onboarding-a-new-hire |

Weak spots: the product is discontinued and no successor is named in the sunset notice (https://support.freshteam.com/support/solutions/articles/19000162935-freshteam-sunset-support-faqs). A self-scheduling link cannot be changed once sent, only cancelled or re-sent (https://support.freshteam.com/support/solutions/articles/19000129253-enable-candidate-self-schedule). Searching the talent pool and getting suggestions needed the Pro or Enterprise plan (https://support.freshteam.com/support/solutions/articles/19000050907-understanding-the-talent-pool).

---

#### Workable

Recruitment system with an attached HR module (onboarding, people records, time off, reviews) aimed at small to large organisations; actively sold, and now built around an AI assistant called Workable Agent.

| Feature | What it does (1–2 plain sentences) | Why it is notable | Source |
|---|---|---|---|
| Hiring Plan (requisitions and budget) | Anyone who needs to hire raises a requisition on a customisable form. A default approval chain applies to all, with separate chains for chosen departments or locations; several requisitions can sit under one job for multiple openings. Reports compare budgeted and offered salary and planned and filled budget per department. | Links headcount approval to money, not only to a yes or no. | https://help.workable.com/hc/en-us/articles/360013082294-Hiring-Plan-Overview |
| Language Kit | Each job has its own language for everything the candidate sees: job text, application form, emails, event invitations and offer letter. The hiring team's screens stay in their own language. | A per-job candidate language is rare; it would allow Tamil or English per post. | https://help.workable.com/hc/en-us/articles/360043180913-Using-Language-Kit |
| Anonymised screening | In the Sourced and Applied stages the name, photo, social profiles, address, email and phone number are hidden. They are revealed when the candidate is moved on or disqualified. | A built-in bias control at the first review. | https://help.workable.com/hc/en-us/articles/360060351113-Anonymized-resume-screening |
| Interview kits with hidden peer feedback | A kit groups questions under skills or traits per stage, can be built from templates or generated from the job requirements, and is rated with thumbs, stars or numbers. An interviewer cannot see other interviewers' evaluations until they submit their own, and an overall rating with a comment is mandatory. | Stops panel members copying each other's opinions. | https://help.workable.com/hc/en-us/articles/115012304987-Creating-and-using-an-interview-kit-scorecard |
| One-way video interviews | Questions are written by hand or generated by AI. Settings cover deadline, thinking time, answer time and number of takes. Invitations go out manually or through an automated action, and answers are evaluated inside the system. | Fine control over how candidates answer, with no separate tool. | https://help.workable.com/hc/en-us/articles/360042640034-Workable-Video-Interviews-Overview |
| Self-scheduling for several interviewers | A link lets the candidate pick a slot from the interviewer's connected Google or Microsoft 365 calendar. With several interviewers, only slots that suit all of them are shown. The link can sit inside email templates, and buffers between events can be set. | Panel scheduling without emails back and forth. | https://help.workable.com/hc/en-us/articles/360007483594-Self-scheduled-events |
| Workable Agent with explained score | The assistant sources, screens, messages and chats with candidates. It scores each candidate out of 100 against the job's criteria; must-have criteria count double, partly met criteria count half, and each criterion is marked met, partially met, not met, disqualifying or unknown. People can edit any assessment, undo a disqualification and stop the assistant per candidate, job or account. | The score is broken down per criterion and a human decision always wins. | https://help.workable.com/hc/en-us/articles/38381544828695-Using-the-Workable-Agent |
| Referrals portal with internal applications | Team members refer a person, share openings with their network, apply for internal openings and track their referrals and possible rewards. Admins set a default reward and policy, change it per job and exclude chosen jobs. | Referral and internal movement share one portal. | https://help.workable.com/hc/en-us/articles/360015551333-Referrals-overview-and-setup-process |
| Offer approval with company signers | Approver groups are notified one after another; one approval per group moves the offer on. Approvers see all offer details and must give a reason when rejecting. Company signatories can sign before the letter reaches the candidate. | Sequential approval and internal signature are both part of the offer document flow. | https://help.workable.com/hc/en-us/articles/360001165533-E-signature-offer-approval-workflows |
| Onboarding portal and automatic profile publishing | The new joiner opens a mobile-friendly page from the welcome email with a message, optional video, profile completion and documents to sign. Tasks are split between the new joiner, the line manager and HR; emails are timed relative to the start date; templates vary by department. The person's HR profile can be published automatically at midnight on the start date. | The hand-over from candidate to HR record is date-driven and needs no manual step. | https://help.workable.com/hc/en-us/articles/9294190133399-Employee-onboarding-workflows |
| Posting to 200+ job boards and past-candidate resurfacing | One post goes to more than 200 job boards. The system also brings back qualified past candidates when a new job opens. | Very wide publishing from one action, and reuse of the existing candidate database. | https://www.workable.com/features |
| Custom report builder with scheduled delivery | Reports can be built from any field across jobs, candidates, offers, interviews and referrals, saved to dashboards, exported to Excel, CSV or PDF, and emailed daily, weekly or monthly. | Management gets reports without logging in. | https://www.workable.com/features |
| Audit logging and layered permissions | Preset roles (recruiter, hiring manager, contributor, reviewer) can be extended with extra permission sets. Changes to roles, reports, permissions and candidate profiles are logged. | A full audit trail of who changed what. | https://www.workable.com/features |

Weak spots: the Workable Agent works in English only and its sourcing, screening and messaging use AI credits (https://help.workable.com/hc/en-us/articles/38381544828695-Using-the-Workable-Agent). Offer approval chains are limited to the Premier and Enterprise plans, and full onboarding (e-signature, custom tasks, scheduled emails) needs the HR package (https://help.workable.com/hc/en-us/articles/360001165533-E-signature-offer-approval-workflows ; https://help.workable.com/hc/en-us/articles/9294190133399-Employee-onboarding-workflows). Offer approvers are chosen by role or name; routing by department or location is not described.

---

#### Breezy HR

Recruitment system for small and mid-sized organisations, built around a drag-and-drop pipeline and per-stage automation; actively sold (vendor site and help centre live on 3 October 2026), with a separate performance product called Breezy Perform.

| Feature | What it does (1–2 plain sentences) | Why it is notable | Source |
|---|---|---|---|
| Stage Actions | Each pipeline stage can carry automatic actions that run when a candidate arrives: send email or SMS (with a delay), ask for SMS consent, send a questionnaire or assessment, request team feedback, assign scorecards, create a task, add tags, start a message series, move on once a meeting is booked. | Fourteen action types attached directly to stages, which is easier to understand than a separate rule engine. Offered on all paid plans. | https://help.breezy.hr/en/articles/5236352-automating-with-stage-actions |
| Answer-based auto-move and auto-disqualify | In a questionnaire, any answer option on a multiple-choice or dropdown question can be marked to move the candidate to a chosen stage, including a disqualified stage with a recorded reason. | Knock-out screening is set on the answer itself, with the reason stored for reporting. | https://help.breezy.hr/en/articles/5260125-screen-candidates-based-on-answers |
| Hiring-manager rotation | A stage action assigns a hiring manager to the candidate, either a named person or by rotation. | Shares incoming candidates across reviewers automatically. | https://help.breezy.hr/en/articles/5236352-automating-with-stage-actions |
| Background check as a pipeline step | One stage action starts a background check and another routes the candidate on a pass or fail result. | The check and its outcome drive the pipeline without manual follow-up. Works only with the Checkr integration. | https://help.breezy.hr/en/articles/5236352-automating-with-stage-actions |
| Interview guides | A custom guide tells each interviewer exactly what to ask in each interview, and feedback is captured on scorecards from the candidate profile. | Keeps interviews consistent across panel members. | https://breezy.hr/qualify/interview-tools |
| Native live video with scorecard on screen | Live video interviews run inside the product and show the candidate's resume, the scorecard and real-time notes on the same screen. Recorded one-way video answers are also supported. | The interviewer scores while talking, with no switching between windows. | https://breezy.hr/qualify/interview-tools |
| Side-by-side panel scheduling and self-booking | A side-by-side view of each interviewer's free time allows drag-and-drop scheduling for several people at once. Candidates can also book their own slot, with Google and Outlook calendars kept in sync. | Makes panel scheduling visual. | https://breezy.hr/qualify/interview-tools |
| Candidate pools with their own pipeline | A pool is a holding area for good candidates with no current opening. Each pool has its own pipeline, scorecard, hiring team and consent rules, and can be active, draft, closed or archived. | A pool behaves like a job without a vacancy, so candidates can be nurtured and scored over time. | https://help.breezy.hr/en/articles/5297564-candidate-pools |
| Recruiter portal with isolated view | Outside recruiters are invited per position. In their portal they see only the openings they were invited to and only their own candidates (name, email, date submitted, current stage and stage dates), read-only. | Agencies get status updates but cannot see internal candidates or other agencies' candidates. | https://help.breezy.hr/en/articles/5296898-external-recruiters |
| Internal portal with referral links | People inside the organisation get shareable referral links and are credited when someone applies through them. They can also apply for internal positions, landing in a dedicated "Internal Applicants" stage. Access can be limited by email domain. | Internal applicants are kept separate from outside applicants from the first stage. | https://help.breezy.hr/en/articles/5313988-employee-portal |
| Consent with expiry, renewal and removal | Consent is requested from applied, referred, sourced and recruited candidates. It lasts 24 months by default (adjustable). The system can ask for renewal before expiry and can remove candidates whose consent has expired. Six consent statuses can be filtered. | A complete consent and retention cycle that runs without manual effort. | https://help.breezy.hr/en/articles/5558054-gdpr-candidate-consent |
| Offer templates, approval flow and e-signature | Offers are built from custom templates, pass through an approval flow and are signed with the built-in e-signature. | E-signature is built in, with no outside signing service needed. | https://breezy.hr/hire/offers |
| Candidate Match Score | Compares each resume with the job description and shows a score from 0 to 10 on the profile, pipeline card, team scorecards and candidate comparison. Weighting of the criteria can be adjusted per position. | Simple, visible ranking next to the human score. | https://help.breezy.hr/en/articles/6389729-candidate-match-score |

Weak spots: the help page describes Match Score as a legacy feature for existing subscribers, a candidate's score is not recalculated when the settings change, and no score is produced if the job has no description (https://help.breezy.hr/en/articles/6389729-candidate-match-score). Answer-based screening works only on multiple-choice and dropdown questions, with one move per questionnaire (https://help.breezy.hr/en/articles/5260125-screen-candidates-based-on-answers). The recruiter portal and the internal portal are limited to the Growth, Business and Pro plans (https://help.breezy.hr/en/articles/5296898-external-recruiters).

Research date: 2026-10-03. Every URL in the Source columns was opened on that date. Keka help-centre articles were read through the help centre's own article feed for the same article number, because the normal page blocks automated readers. Only points the source supports are listed.

---

#### Keka (Keka Hire, part of Keka HR)

Keka is an India-based HR and payroll suite that says it is used by 12,500+ organisations (https://www.keka.com/hr-software-for-recruiters), with a recruitment module called Keka Hire; it is active, and its pre-boarding screens were moved out of Keka Hire into the main Keka HR portal (help article updated December 2025).

| Feature | What it does (1–2 plain sentences) | Why it is notable | Source |
|---|---|---|---|
| Rule-based requisition approval | A hiring request can follow one approval chain for everything, or different chains chosen by rules on department, job title, location, salary range and job type. Each rule has its own approvers and levels. | Fits a group where a department head, a principal and management approve different kinds of posts; no code change needed when the chain changes. | https://help.keka.com/hc/en-us/articles/39946751824145-Adding-and-managing-Requisition-Approval-Workflow |
| Replacement request raised from the exit approval | The person approving a resignation or termination can raise the replacement request on the same screen. Job and salary details are filled in from the leaving person's record, and duplicate requests are blocked. | Links the exit process to hiring, so a vacancy is not forgotten and is tied to a real position. | https://help.keka.com/hc/en-us/articles/41513631754001-Raise-Backfill-Requisition-from-Exit-Approval |
| Internal job posting policy | Internal applications can be limited by minimum time in the organisation and in the current role, and can require prior approval through a multi-level chain. It auto-approves if the approver is missing or has left. | Clear, enforced rules for internal movement instead of informal requests. | https://help.keka.com/hc/en-us/articles/39946725299729-Managing-Internal-Job-postings-and-applications |
| Referrals with a written policy and feedback to the referrer | Referrals are switched on per job; the referral policy is shown when someone starts a referral, and the rejection reason can optionally be shown to the person who referred. | The "tell the referrer why" option is uncommon and keeps people willing to refer again. | https://help.keka.com/hc/en-us/articles/39946666835857-Managing-employee-referrals-for-a-role |
| Weighted candidate profile score | Each applicant is scored against the job on job profile, skills, experience, degree and previous organisation. The recruiter sets the weight of each part per job and sees both part scores and a total. | The scoring is open and adjustable per job, not a hidden ranking. | https://help.keka.com/hc/en-us/articles/39837915962897-Managing-candidate-profile-score |
| Posting and candidate intake from one place | Jobs are posted to the careers page, LinkedIn, Naukri and Indeed from inside the product. Candidates can be added singly, by bulk Excel or zip upload, by forwarding email, or with a browser extension, and can be messaged on WhatsApp from the profile. | Naukri posting and WhatsApp contact are the India-specific parts most global tools lack. | https://www.keka.com/hr-software-for-recruiters |
| Interview scheduling with automatic feedback chasing | Interviews are scheduled with calendar sync across the panel and shared scorecards. If feedback is not given within 24 hours, a reminder email goes out every day until it is. | Removes the most common delay in a hiring round: waiting for panel feedback. | https://www.keka.com/hr-software-for-recruiters |
| Offer letter templates that carry their own approval chain | Several templates can exist (by role or region), written in a web editor or uploaded as a Word file with placeholders for name, job title, pay and start date. Each template has its own approval steps; templates can be cloned. | Approval is tied to the letter type, so a senior post and a junior post follow different checks without extra set-up each time. | https://help.keka.com/hc/en-us/articles/39946726416529-Creating-Offer-Templates |
| Salary break-up built from payroll, with override at offer time | The offer's pay break-up is produced from the payroll set-up. Pay components (including those outside annual CTC) can be changed inside the offer screen, and the changed values go into both the letter and the later salary record. | The figure promised in the letter and the figure paid come from the same data; no spreadsheet in between. | https://help.keka.com/hc/en-us/articles/44257590136721-HIRE-Override-Over-Above-Salary-in-Offers |
| Documents collected before the offer is released | A different set of documents can be requested from each candidate, such as past payslips and education proofs, before the offer goes out. | Lets the pay offer be checked against proof first, which is normal practice in India. | https://www.keka.com/ae/offer-management |
| Flexible pre-boarding with a single action menu | Offer release, document collection and creation of the HR record can be done in any order. One screen shows pending tasks for the candidate and for internal people, with actions to revise, remind, revoke, release or "add as" an HR record, singly or in bulk. Tasks are assigned automatically by department, location and worker type. | Handles real cases where a person joins before all papers are in, without breaking the process. | https://help.keka.com/hc/en-us/articles/39946720098705-Managing-Preboarding-Page |
| Background verification inside pre-boarding | Checks can be started for one or many candidates, choosing the vendor (Ongrid or SpringVerify) and the checks needed. Any other vendor can be added as a "custom vendor": its report is uploaded and a pass or fail result is stored on the record. | The custom-vendor route means a local agency can be used and still tracked in the system. | https://help.keka.com/hc/en-us/articles/39946693819537-Adding-and-Managing-Custom-BGV-Vendors-in-Keka |
| Bulk conversion of joiners into HR records | Several pre-boarding candidates are turned into HR records in one action. Pre-boarding data and documents move across automatically, the candidate status changes from Hired to Joined, and the candidate-to-record link is kept. | Suits a batch of new joiners starting on the same day at the start of a term; nothing is typed twice. | https://help.keka.com/hc/en-us/articles/49701893253137 |
| Milestone-based probation review | A probation policy can have several review points (for example monthly or quarterly), each with its own feedback forms, reviewers and reminders. A dashboard shows who is in probation, under review, or confirmed, and each person has a probation timeline. | Continues the hiring record into confirmation, with evidence gathered along the way and not only at the end. | https://help.keka.com/hc/en-us/articles/44653221177105-CORE-HR-Enterprise-Probation-Milestone-Based-Probation-Evaluation |

Weak spots: reviewers on Capterra say some functions are fixed and hard to change, set-up takes many steps, and support and implementation replies are slow (https://capterra.com/p/149253/Keka/reviews/); Keka's own help page notes that perks were not shown in the CTC details of offer letters until two new letter fields were added (https://help.keka.com/hc/en-us/articles/39946726416529-Creating-Offer-Templates).

---

#### Darwinbox

Darwinbox is an India-founded HR suite for large organisations (its own pages say it is aimed at enterprises), with Recruitment and Onboarding modules on the same data as Core HR and Payroll; it is active, and its site states it was named a Leader in the Gartner Magic Quadrant for Talent Acquisition Suites 2026 (vendor's own claim).

| Feature | What it does (1–2 plain sentences) | Why it is notable | Source |
|---|---|---|---|
| One-click requisition from the organisation chart | A manager, not only a recruiter, can raise a hiring request. It can be created from a separating person, from an existing job or request, or straight from the organisation chart. | The request starts from a real position in the structure, so headcount and hiring stay in step. | https://darwinbox.com/products/recruitment |
| Budgeted and non-budgeted positions with separate approval flows | Requests are raised for budgeted or non-budgeted positions, with approval flows set differently for a replacement and for a new post. The request starts from a pre-set job description. | Unplanned posts get stricter approval than planned ones, which is what management usually wants. | https://darwinbox.com/blog/refine-your-recruitment-process-to-attract-the-best-talent |
| Internal postings, referrals, transfers and outside recruiters in one place | Openings go to job portals, social sites, the careers page, outside recruiters and referrals, and the result of each channel is tracked. Internal transfers, internal postings and third-party referrals are handled on the same platform, with mobile social sharing for referrals. | Internal movement and outside hiring share one record, so a transfer is not handled outside the system. | https://darwinbox.com/blog/refine-your-recruitment-process-to-attract-the-best-talent |
| AI ranking with reasons, plus re-use of the existing pool | Applicants are stack-ranked, searched with Boolean search and summarised with CV insights. The system also suggests suited candidates from people already in the database. | Looks at past applicants before paying for new sourcing; the AI page says rankings are explained. | https://darwinbox.com/products/recruitment |
| Candidate portal with job suggestions and a help desk | Candidates get job recommendations matched to their profile, an application form filled in from the resume, and a dedicated help desk for queries. | A candidate help desk inside the hiring tool is rare; it gives applicants one place to ask and be answered. | https://darwinbox.com/products/recruitment |
| Offer proposal, counter-offer and exception handling | There is an offer proposal stage for negotiation before the formal letter. Counter-offers are handled by editing or regenerating the offer, exceptions are routed by decision matrices, and offers can be generated in bulk. | Treats negotiation as a tracked step with rules, instead of emails outside the system. | https://darwinbox.com/products/recruitment |
| Digital offer letters with version tracking | Offer letters come from templates with custom approval flows, version tracking and digital sign-off. Policies and documents can also be signed before the joining day. | Version history of the offer is useful evidence when terms are later disputed. | https://darwinbox.com/products/employee-onboarding |
| Identity document scanning (OCR) | PAN and Aadhaar can be scanned and uploaded from the mobile app, and identity documents are read and checked automatically by OCR. Linked smart forms with validations avoid asking for the same detail twice. | Cuts typing errors in identity details, which later affect payroll and legal filings. | https://explore.darwinbox.com/lp/recruitment |
| Legally required forms filled in automatically | Forms such as PF transfer, ESI declaration and insurance policy forms are generated already filled from the data captured during onboarding. | India-specific paperwork is produced from data the joiner has already given. | https://darwinbox.com/products/employee-onboarding |
| Background verification at two points | Through the SpringVerify link, a check can be started by the recruiter before the offer, or automatically during onboarding (on form submission, on candidate activation, or on first form update). Reports come back into the verification section, and result statuses are mapped to the organisation's own list. | The pre-offer check gives an early signal; the post-acceptance check runs without anyone remembering to start it. | https://support.springworks.in/portal/en/kb/articles/darwinbox-integration-flows-configuration-options |
| Direct hand-over into Core HR and Payroll | Once the offer is accepted, the candidate's details move into onboarding, then into the Core HR and Payroll record without re-entry. Onboarding can be started in bulk, and journeys, tasks, a buddy or mentor are set by role, grade or location, with dashboards and reminders for pending items. | This is the recruitment-to-HR-record link done as one data flow, which is the main thing JKKN wants. | https://darwinbox.com/products/employee-onboarding |
| Mobile voice and WhatsApp use | The mobile app is used to start hiring and onboarding flows, give interview feedback by voice, sign off offer letters and fill onboarding feedback forms. WhatsApp alerts are built in. | Panel members who rarely open a laptop can still give feedback quickly. | https://explore.darwinbox.com/lp/recruitment |
| AI agents across the hiring steps | Agents draft job descriptions, screen and rank with explanations, prepare interviewers with questions, schedule interviews, and review offer details to flag inconsistencies. Candidates get rejection emails with context. | The offer-checking agent and the explained rejection are less common than plain resume ranking. | https://darwinbox.com/innovations/artificial-intelligence-in-hr/ai-in-recruitment |
| Storyboards, diversity dashboards and scheduled digests | Ready-made storyboards show the key hiring measures, diversity dashboards show the workforce mix, salary benchmarking data is built in, and dashboards can be subscribed to as regular PDF reports by email. | Management receives a regular report without logging in. | https://darwinbox.com/products/recruitment |

Weak spots: an independent review summary reports that full-suite roll-outs take months, support response is uneven, navigation needs many clicks and speed drops with high data volume (https://www.rfp.wiki/hr-office/cloud-hcm-suites-for-1-000-employee-enterprises/darwinbox); the vendor's WhatsApp page describes notices and approvals for people already in the organisation, and for candidates only "alerts" are stated (https://explore.darwinbox.com/lp/darwinbox-whatsapp-for-business).

---

#### TurboHire

TurboHire is a Hyderabad-based recruitment-only platform for mid-sized and large organisations doing high-volume hiring, which connects to a separate HR system for the HR record; it is active and independent, raised a 6 million US dollar Series A led by IvyCap Ventures in August 2025 (https://builtin.com/articles/turbohire-raises-6m-series-a-20250805), and has since announced a new brand identity and an AI layer called "SuperAgent" (https://new.turbohire.co/new-identity-new-chapter/; the page gives no date).

| Feature | What it does (1–2 plain sentences) | Why it is notable | Source |
|---|---|---|---|
| Hiring-manager requisitions with multi-level approval | Hiring managers have their own login to raise a job request. Approval levels are set by criteria such as department and band, and the request data can pass to the linked HR system. | Puts the department head inside the process from the first step. | https://turbohire.co/features/candidates-sourcing/ |
| Approver view with bulk approval and audit trail | Approvers see the candidate profile and interview feedback in one view, get notices for pending items, and can approve in bulk. Every approval step is recorded. | Useful where a principal or management must clear many selections at once after a drive. | https://turbohire.co/features/approver-experience/ (bulk approval: https://turbohire.co/features/) |
| Agency portal | Outside agencies submit candidates and follow their status in a portal. Duplicates across agencies are managed and agency compliance is tracked. | Ends disputes over which agency sent a candidate first. | https://turbohire.co/features-2-2/ |
| Combined referral and internal posting platform | Referrals and internal applications run on one built-in platform, which the vendor says needs no extra effort from the recruitment team. | Referrals and internal moves are treated as proper sourcing channels, not side processes. | https://turbohire.co/features-2-2/ |
| Resume parsing with data enrichment and "similar candidate" search | Resumes in different formats become structured, searchable cards. A knowledge graph adds missing context such as industry, education standing and skill level; candidates are scored on experience, education and skills and stack-ranked, and people similar to a chosen ideal candidate are found. | Enrichment and look-alike search go beyond plain keyword matching. | https://turbohire.co/solutions/recruitment-intelligence/ |
| Bulk enquiry forms | Recruiters create forms and send them to one or many candidates to collect details that are not in the resume. The answers can then be used as filters. | A quick way to gather notice period, expected pay or subject details from hundreds of applicants. | https://turbohire.co/features-2-2/ |
| One-way video interview | Questions are sent to candidates, who record video answers at a time that suits them. The panel reviews the recordings later. | Screens many applicants without booking panel time. | https://turbohire.co/features-2-2/ |
| WhatsApp bot and SMS messaging | Candidates are engaged and updated through WhatsApp bot flows, SMS and email. Templates can be sent to one candidate, to a selected group on the pipeline board, or in bulk. | WhatsApp is the channel most Indian candidates answer fastest. | https://turbohire.co/solutions/walk-in-hiring-drives/ |
| Walk-in drive and campus hiring flows | For walk-in drives the system handles registration, screening, scheduling and messaging for large numbers in a short time. For campus hiring it automates outreach, assessments, document sharing and offers across several campuses, with bulk actions. | Few tools treat walk-ins and campus rounds as their own hiring scenarios. | https://turbohire.co/solutions/campus-hiring/ |
| No-login mobile access for candidates and interviewers | Candidates apply and track progress, and interviewers see candidate details and give feedback, from any device without signing in. | Removes the password barrier for occasional panel members. | https://turbohire.co/features/ |
| Interview guides, AI question assistant and rating scales | Interviewers get structured guides and an AI assistant that suggests relevant questions. Scorecards use a 3-, 5- or 10-point scale, and scheduling syncs with Google Calendar and Outlook with reminders. | Makes panel assessment consistent across colleges. | https://turbohire.co/features/interviewer-experience/ (rating scales: https://turbohire.co/features-2-2/; calendars: https://turbohire.co/integrations-list/) |
| Offer and post-offer module | The module is described as replacing spreadsheets for salary calculation and break-up, email approvals of the offer letter and ad-hoc document collection, and it keeps candidates engaged after the offer. For high-volume roles, document collection and identity verification keep an audit trail (https://turbohire.co/solutions/blue-grey-collar-hiring/). | Tackles the gap between offer and joining, where many candidates drop out. | https://turbohire.co/features-2/ |
| Wide link-up with assessment, verification and HR systems | The vendor lists over 50 integrations: assessment tools (Mercer Mettl, HackerRank, HackerEarth, iMocha, Xobin and others), job boards including LinkedIn and Google Jobs, calendars, video meeting tools and HR systems such as SAP SuccessFactors. | Shows how a recruitment tool can pass a hired candidate to a separate HR system. | https://turbohire.co/integrations-list/ |
| Data rights under India's data protection law | The vendor publishes how candidates can ask for access, correction and erasure of their data, raise a grievance and name a nominee under the DPDPA. | A ready model for the candidate privacy notice JKKN will need. | https://turbohire.co/dpdpa-compliance-at-turbohire/ |

Weak spots: it holds no HR record or payroll of its own, so onboarding and the joiner's record depend on a link to another system (https://www.turbohire.co/); its integrations page says there is "no out-of-the-box" communication tool and that email and text messaging rely on connected services (https://turbohire.co/integrations-list/); most detailed feature pages are from an older site design and say little about how each function works, and the report-builder page still contains placeholder text (https://turbohire.co/features/recruiting-analytics-1/).

Researched 2026-10-03. Every Source link was opened during this research. Vendor pages are used wherever possible; third-party pages are marked.

---

#### Greenhouse

Applicant tracking and hiring system for mid-size and large organisations, built around "structured hiring" (decide what to assess before interviewing, then score every candidate against the same list). Current status: active, sold under its own name as Greenhouse Recruiting plus a separate Greenhouse Onboarding product; some features below are limited to higher subscription tiers.

| Feature | What it does (1–2 plain sentences) | Why it is notable | Source |
|---|---|---|---|
| Three separate approval gates | A job can need approval before recruiting starts (it stays in draft until approved), a second "official job approval" before any offer can be created, and a per-candidate offer approval before the offer is sent. | Splits "may we advertise" from "may we commit money" from "may we hire this person", which fits a chain of department head, principal and management. | https://support.greenhouse.io/hc/en-us/articles/201087714-Types-of-approvals |
| Two-stage approvals with re-approval on change | With two-stage approvals, a later change to department, number of openings or custom fields restarts the second approval round. Approvers can be set in sequence or in parallel and assigned by office or department. | Stops an approved post from being quietly altered after sign-off; the number of openings becomes a trusted record. | https://support.greenhouse.io/hc/en-us/articles/360025756071-One-Stage-vs-Two-Stage-Job-Approvals |
| Per-job approvers and stand-in approval | A custom job field can change who the approvers are for each job, and a site administrator can approve on behalf of an approver who is unavailable. Completed steps keep the record of who approved. | Handles "different head for each department" without building a separate flow for each, and avoids a stalled chain when someone is away. | https://support.greenhouse.io/hc/en-us/articles/18222984976795-Approvals-FAQ |
| Scorecard with attributes and a fixed four-level verdict | Each job has a list of skills, traits and qualifications. Each interviewer rates them and must pick one overall verdict: Definitely Not, No, Yes or Strong Yes (blank is logged as "No decision"), plus key takeaways and private notes. | No neutral middle option, so every interviewer has to commit; the same criteria are used for every candidate. | https://support.greenhouse.io/hc/en-us/articles/4414777492891-Scorecard-overview |
| Focus attributes per interview | For each interview stage, the job owner picks which scorecard attributes that interviewer should assess. These appear at the top of that interviewer's scorecard; the rest are folded under "show additional attributes". | Divides the assessment between interviewers so the panel covers everything once instead of everyone asking the same questions. | https://support.greenhouse.io/hc/en-us/articles/360018399451-Focus-Attributes-on-Scorecards |
| Interview kit | Each interview comes with a kit holding the focus attributes, suggested or required questions, preparation notes for the interviewer and an expected duration. | Interviewers do not have to invent questions on the spot, and candidates for the same job get comparable interviews. | https://support.greenhouse.io/hc/en-us/articles/115002226746-Interview-kit-overview |
| Hidden scorecards until you submit your own | Permission settings decide whether an interviewer can see other interviewers' scorecards never, always, or only after all interviewers have submitted. | Prevents later interviewers from copying the first opinion. | https://support.greenhouse.io/hc/en-us/articles/4414777492891-Scorecard-overview |
| Automatic scorecard reminder | The system sends each interviewer a reminder one hour after the interview ends, and more reminders can be sent by hand. | Feedback is captured while it is fresh, without a recruiter chasing. | https://support.greenhouse.io/hc/en-us/articles/360039539772-Structured-hiring-guide |
| Resume anonymisation | A machine-learning model blurs name, title, gender, photo, ethnicity or nationality, marital status, address, email, phone and social links on the resume during Application Review and Hiring Manager Review. | First screening is done on content only. Limits stated by the vendor: tuned for Latin-script resumes, Pro tier only, answers to custom questions can still reveal identity. | https://support.greenhouse.io/hc/en-us/articles/19864880540827-Anonymize-resumes |
| Bias-reduction settings for interviews | Optional switches: anonymous grading of take-home tests, a reminder at the top of each scorecard to judge job-relevant points only, a rule that interviewers must write a reason for each rating, and candidate name-pronunciation recordings. | Small prompts placed at the moment of decision, each one switchable by an administrator. | https://support.greenhouse.io/hc/en-us/articles/360004977491-DE-I-interviewing-features |
| Focus attributes for the final panel discussion | The hiring manager marks which attributes the panel should discuss in the wrap-up meeting; these are grouped in their own section of the scorecards view. Interviewers are not told which ones were marked. | Keeps the final decision meeting on agreed criteria instead of general impressions. | https://support.greenhouse.io/hc/en-us/articles/360003464191-Focus-attributes-for-candidate-roundup |
| Interviewer calibration report | Shows, per interviewer, the number of scorecards completed, how often they filled in their focus attributes, the spread of their ratings and how often they gave no decision. Filters include job, department, office and date. | Reveals who marks consistently high or low and who skips the assigned criteria. | https://support.greenhouse.io/hc/en-us/articles/203941429-Interviewer-calibration-report |
| Scheduling aids for interviewers | Suggests interview times across several calendars, lets each interviewer set a daily or weekly cap, sets working hours, offers booking links, and tracks interviewer training (shadowing steps before someone interviews alone). Post dated 1 May 2025. | Protects interviewers' time and makes sure new interviewers are prepared before they assess candidates. | https://www.greenhouse.com/blog/all-your-interview-scheduling-needs-covered-see-whats-new-in-greenhouse |
| AI search without ranking (Talent Filtering, Talent Rediscovery) | AI suggests keywords from the job description; the recruiter then filters new applicants, or past candidates and prospect pools, including by past interview activity, and can save searches. The vendor states humans, not AI, make the review decision; there is no auto-reject. | Reuses the existing candidate database for new jobs while keeping every decision with a person. | https://www.greenhouse.com/blog/find-talent-faster-and-easier-with-greenhouse-talent-filtering-and-talent-rediscovery |

Weak spots: resume anonymisation is tuned for Latin-script resumes and is a Pro-tier feature (https://support.greenhouse.io/hc/en-us/articles/19864880540827-Anonymize-resumes); with one-stage approvals, later changes to department, openings or custom fields never trigger re-approval (https://support.greenhouse.io/hc/en-us/articles/360025756071-One-Stage-vs-Two-Stage-Job-Approvals); onboarding is a separate product from recruiting (https://www.greenhouse.com/onboarding).

---

#### Tellent Recruitee (formerly Recruitee)

Collaborative applicant tracking system aimed at small and mid-size organisations, strong in Europe. Current status: active; renamed from "Recruitee" to "Tellent Recruitee" from 23 April 2025, when the parent group (Recruitee, KiwiHR, Javelo) unified under the Tellent name and KiwiHR became Tellent HR. Data, setup and product functions were unchanged by the rename (source: https://intercom.help/tellent-help-center/en/articles/10965134-welcome-to-the-new-tellent-hr-experience).

| Feature | What it does (1–2 plain sentences) | Why it is notable | Source |
|---|---|---|---|
| Requisition approvals | A request to hire records budget, number of openings and the reason. The administrator sets who approves and in how many steps; approvers are notified automatically. It can be made mandatory, so no job is published without an approved request. | Hard gate between "request" and "advert". Available on the Optimize plan. | https://support.recruitee.com/en/articles/9874895-requisition-approvals |
| CareersHub with page layouts and templates | A careers site builder with a library of page templates, different job-page layouts by job type, department or location, an embeddable jobs widget, job alerts for visitors and site analytics. | One group can show a different look per college or per job family from one account, without a developer. | https://recruitee.com/all-features |
| Multi-posting to job boards | Jobs can be sent to many boards at once (vendor states over 2,900 free and paid boards), with ad campaigns and scheduled automatic publish and close dates. | Publish and close dates run on their own; one place to see where money was spent. | https://recruitee.com/all-features |
| AgencyHub | Recruitment agencies submit candidates through a structured portal and only see the vacancies and candidate data they were given. A report tracks each agency's results. | Agencies are kept inside the same pipeline with limited visibility, and their performance can be compared. | https://recruitee.com/collaborative-hiring |
| ReferralsHub and talent pools | A referral programme for team members, plus named pools to keep past candidates grouped for future roles. | Two low-cost sources that sit inside the same database as applicants. | https://recruitee.com/all-features |
| Screening Assistant (AI) | Checks each application against criteria written by the hiring team and shows how the candidate meets each requirement. A person makes the decision. | The result is explained per requirement instead of a single opaque score. | https://recruitee.com/ai-recruitment-automation |
| Matching Assistant (AI) | Looks in the existing database for past candidates who fit a new job's criteria and puts a short set into the pipeline for review. | Rediscovery of earlier applicants, based on stated job criteria and reviewed by a person. | https://recruitee.com/ai-recruitment-automation |
| Knockout and screening questions | Application forms can hold custom questions; chosen answers disqualify the applicant automatically. Extra questionnaires can be sent later. | Removes clearly ineligible applications (for example a missing required qualification) before anyone reads them. | https://recruitee.com/all-features |
| Pipelines with stage time limits | Each job pipeline has custom stages; a stage can carry a time limit, and the team is notified when a candidate has stayed too long. Pipelines, jobs, emails, offers and evaluations can be saved as reusable templates. | Makes delay visible per stage, and lets each department reuse a standard process. | https://recruitee.com/all-features |
| If-then workflow automations | Rules with conditions trigger actions such as sending an email, assigning a task, requesting an evaluation or moving a candidate to another stage. | Recruiter-defined rules; nothing happens unless the stated condition is met. | https://recruitee.com/ai-recruitment-automation |
| Fair evaluations and anonymous candidates | Earlier evaluations stay hidden until a team member submits their own. A separate setting hides details such as name, gender and nationality. | Two simple bias controls: one protects independent judgement, the other hides identity at screening. | https://recruitee.com/all-features |
| Quick evaluations, evaluation forms and AI summary | One-click first impressions for early stages, detailed forms with standard criteria for later ones, and an AI summary that pulls together the team's written feedback. | Light feedback where speed matters, structured feedback where the decision is made. | https://recruitee.com/ai-recruitment-automation |
| Hiring roles, notes, mentions, tasks and shared links | Roles define what each person may see and do. Team and job notes, @mentions and assigned tasks keep discussion on the candidate record. A shareable link shows chosen candidate details to an outside reviewer. | External panel members can give input without an account or full access. | https://recruitee.com/collaborative-hiring |
| Offer pages, e-signature and pre-boarding | Offers are sent as personalised web pages from templates; signing uses DocuSign, HelloSign, OneFlow or SignRequest. "Journeys" automates pre-boarding steps, and the hired person's data passes to Tellent HR or another HR system. GDPR rules automate consent requests and deletion. | Covers the stretch between "selected" and "joined" in the same product family. | https://recruitee.com/all-features |

Weak spots: requisition approvals are only on the Optimize plan (https://support.recruitee.com/en/articles/9874895-requisition-approvals); e-signature depends on a third-party integration, and single sign-on is an add-on or Optimize item (https://recruitee.com/all-features).

---

#### Leoforce (maker of Arya)

AI sourcing and matching vendor for recruiting teams and recruiting agencies; it is not a full applicant tracking system and plugs into one. Current status: the vendor's site now lists five products under the Leoforce name (Source, Capture, Convert, Rediscovery, Signal) and no longer shows an Arya product page (https://leoforce.com/). A third-party article states Leoforce dropped the Arya name in 2025 and that old goarya.com links redirect to leoforce.com (https://www.pin.com/blog/arya-leoforce-pricing/ — written by a competitor). Arya features below come from Arya-era vendor documents and are marked as such.

| Feature | What it does (1–2 plain sentences) | Why it is notable | Source |
|---|---|---|---|
| One de-duplicated, ranked list from all sources (Arya) | For each job, Arya searched external sources together with the client's own past and current applicants and returned a single list with duplicates removed and candidates ranked. | The recruiter works from one list instead of searching each source and merging by hand. | https://media.trustradius.com/product-downloadables/FQ/UM/TDKMEPTULKWC.pdf |
| Two scores: match and likelihood to move (Arya) | Each candidate was scored on fit to the job and on "move probability" (how likely they are to change jobs), using predictive analytics. | Separates "suitable" from "reachable"; useful for deciding who to contact first. | https://media.trustradius.com/product-downloadables/FQ/UM/TDKMEPTULKWC.pdf |
| Signals used for matching (Arya) | The vendor's document names work history, career progression, job tenure, skill and experience, industries, education and corporate cultures, and says the weight of each varies by job, occupation, company, industry and location. | Career path and tenure are used, not just keywords in the resume. | https://media.trustradius.com/product-downloadables/FQ/UM/TDKMEPTULKWC.pdf |
| "7 data points and hundreds of attributes" (Arya) | The Greenhouse partner listing describes scoring on 7 multidimensional data points and hundreds of attributes, with the ranked list delivered directly into the client's Greenhouse dashboard. | Shows the working model: the matching engine sits beside the tracking system and writes results into it. | https://integrations.greenhouse.com/partners/arya-by-leoforce |
| Bias-related fields blocked from the model (Arya) | Name, gender and age are kept out of the machine-learning models, and diversity attributes are not used in sourcing, matching or scoring. User actions and candidate decisions are tracked and shown in reporting. | A concrete design rule worth copying for any in-house scoring. | https://media.trustradius.com/product-downloadables/FQ/UM/TDKMEPTULKWC.pdf |
| Learning from recruiter actions (Arya) | The models combine supervision by data scientists with continuous learning from the client's internal data and from user inputs and patterns, so later result sets are refined. | Rankings adapt to which candidates this organisation actually shortlists. | https://media.trustradius.com/product-downloadables/FQ/UM/TDKMEPTULKWC.pdf |
| Leoforce Rediscovery | Scans the candidates already in the client's tracking system, scores them on match to open roles and on likelihood to respond, then contacts them by text and/or email in a two-way conversation and does initial vetting. | Turns old applications into an interested, pre-vetted shortlist. Vendor states links to over 60 tracking systems. | https://leoforce.com/rediscovery/ |
| Leoforce Capture | Sources across 30+ channels and existing databases, qualifies candidates on skills, experience and role fit, with optional checking by a human recruiter, and delivers a shortlist. The client pays only for candidates who meet the agreed criteria. | Outcome-based model: payment tied to qualified candidates, not clicks or application volume. | https://leoforce.com/capture/ |
| Leoforce Convert (careers-site agent) | A chat agent on the careers site talks to visitors about skills and interests, recommends matching jobs, asks pre-screening questions, guides the application and can schedule interviews. Visitors with no current match are added to a talent network and contacted when a role opens. | Captures visitors who would otherwise leave without applying. | https://leoforce.com/convert/ |
| Leoforce Source (job advertising) | Checks first whether suitable candidates already exist internally, then spends advertising budget only on channels that fill the remaining gap. It optimises toward qualified applicants and hires and learns from who gets interviewed. | Advertising is steered by recruiter feedback on quality, not by clicks. | https://leoforce.com/source/ |
| Automated engagement (Arya) | Email, text and direct-dial outreach, templates and drip campaigns, plus a chatbot that could handle engagement, screening and interview scheduling. | Follow-up with a ranked list happens without manual chasing. | https://media.trustradius.com/product-downloadables/FQ/UM/TDKMEPTULKWC.pdf |

Weak spots: not a full hiring system (no requisition approval, interview scorecards, offers or onboarding were found on the vendor's pages); no public pricing, trial or free tier, and setup can take up to a month according to a third-party competitor article (https://www.pin.com/blog/arya-leoforce-pricing/); the vendor's Arya pages on score explanation now return "not found", so how a score was explained to the recruiter could not be confirmed.

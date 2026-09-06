/**
 * HR (Human Resources) — Smart Guide content.
 *
 * Drafted via the /smart-guide skill, mirroring the pde / campus-living installs:
 * ONE GuideBook drives the full page, the in-app drawer, and the "? Help" FAB on
 * every HR screen, so the three surfaces can never drift.
 *
 * Three lanes, authored from the REAL production routes (jicate/main):
 *   - employee  (ungated baseline)   → self-service: apply leave, balance, propose a hire
 *   - manager   (hr.leave.approve)   → approve their queue: leave + recruitment chains
 *   - hr-admin  (hr.policies.view)   → runs the module: workforce, BOTH policy
 *                                      systems, the full /hr/admin/* config hub,
 *                                      payroll, performance, compliance, forms
 *
 * ACCURACY NOTES (verified against page code, not assumed):
 *   - /hr/leave/apply auto-resolves the signed-in employee + active academic year
 *     and shows live balance before submit. /hr/leave/balance, /my-applications,
 *     /encashment, /calendar, and /approve still expose raw ID inputs in this
 *     build (Sprint 3.1 will auto-resolve), so those steps tell the user plainly
 *     that an ID may be needed and to ask HR if they don't have it.
 *   - Recruitment "approvals" and leave "approve" are SEPARATE inboxes. Leave is
 *     gated by hr.leave.approve; recruitment by hr.recruitment.approve. The manager
 *     lane covers both; the gate key used is hr.leave.approve as the representative
 *     "this person approves" permission.
 *   - /hr/counseling is a Phase-1 placeholder gate with NO page yet — deliberately
 *     NOT linked. /hr/recruitment/candidates has no list route (only a detail page),
 *     so the guide links to the hubs/my-candidates instead.
 *   - Employees come from the staff table (hr_employees was consolidated away);
 *     /hr/employees is the workforce list and links onward to full staff management.
 */

import type { GuideBook } from './types';

/**
 * Permission keys gating which lanes a NON-owner viewer may switch to. Defined
 * ONCE here and read via lanes[p].requires, so a rename is a compile error, not
 * a silently fail-open lane (auth-adapters.md rule). Keys are real hr.* strings
 * copied VERBATIM from lib/sidebarMenuLink.ts MENU_PERMISSIONS. The employee lane
 * is intentionally ungated — the universal self-service baseline (like pde's
 * learner lane).
 */
export const REQUIRES = {
  manager: 'hr.leave.approve',
  // hr-admin gate — CHANGED 2026-06-15 from 'hr.employees.view' → 'hr.policies.view'.
  // The admin lane now covers the WHOLE /hr/admin/* config surface (two policy
  // systems, onboarding/docs, recruitment chains, payroll, performance, compliance,
  // forms). hr.policies.view is the one real, role-grantable key that gates BOTH
  // policy systems' config (verified: /hr/policies AND most /hr/admin/policies
  // editors compose `hr.policies.view`). hr.employees.view was a fail-OPEN gate —
  // a workforce-only viewer could be shown the config lane yet be blocked from
  // every /hr/admin/* target. The deeper config screens are super_admin /
  // administrator ROLE-gated (no permission key spans them), so each role-gated
  // section carries an explicit super-admin prerequisite note instead of a key.
  'hr-admin': 'hr.policies.view',
} as const;

export const GUIDES: GuideBook = {
  lanes: {
    /* ──────────────────────────── EMPLOYEE ──────────────────────────── */
    employee: {
      persona: 'employee',
      title: 'Employee Guide',
      tagline:
        'Apply for leave, check your balance, and propose a new hire — your everyday HR self-service.',
      whyItMatters:
        "Leave, your balance, and proposing a candidate all live in one place. Applying here puts your request straight into the right approval chain — no email, no chasing — and you can see exactly where it stands.",
      startHere: { label: 'Go to Leave', href: '/hr/leave' },
      journey: [
        'Check your leave balance',
        'Apply for leave with a live balance check',
        'Track your application until it is approved',
        'Propose a candidate if you are hiring',
        'Request year-end encashment of unused leave',
      ],
      sections: [
        {
          id: 'leave-hub',
          title: 'Start at the Leave hub',
          steps: [
            {
              action: 'Open **Leave** to see everything you can do — apply, track, balance, calendar.',
              detail:
                'The Leave hub is a set of tiles: Apply Leave, My Applications, Approval Inbox, Team Calendar, My Balance, and Leave Encashment.',
              platforms: {
                web: 'Left sidebar → **HR** → **Leave**.',
                mobile: 'Tap the menu (**☰**), then **HR → Leave**.',
              },
              link: { label: 'Take me there', href: '/hr/leave' },
            },
            {
              action: 'Read **How Leave Works Here** at the bottom of the hub.',
              detail:
                'It explains the key rules: your entitlement is pro-rated from your joining date, weekends and holidays are skipped by default, and the calendar shows you are "On Leave" without revealing the reason to peers.',
            },
          ],
        },
        {
          id: 'check-balance',
          title: 'Check your leave balance',
          steps: [
            {
              action: 'Open **My Balance** to see days available for each leave type.',
              detail:
                'Each leave type shows days available, entitled, used, and carried-forward, with a bar for how much is left.',
              tip: 'This build may ask for your Employee ID and Academic Year ID. If you do not have them, ask HR — a later update will fill these in automatically.',
              link: { label: 'Take me there', href: '/hr/leave/balance' },
            },
          ],
        },
        {
          id: 'apply-leave',
          title: 'Apply for leave',
          steps: [
            {
              action: 'Open **Apply Leave** to submit a new application.',
              detail:
                'The form already knows who you are and your academic year — you just choose the leave and dates.',
              prerequisite:
                'You need an HR employee profile linked to your account. If the page says "No HR employee profile linked", contact HR before you can apply.',
              link: { label: 'Take me there', href: '/hr/leave/apply' },
            },
            {
              action: 'Pick a **leave type** — each option shows the days you have available.',
              detail:
                'If no leave types appear, your entitlements have not been set up for this academic year yet; contact HR.',
            },
            {
              action: 'Choose your **start and end dates** and the **duration type**.',
              detail:
                'Duration can be a full day, first half (AM), second half (PM), or hourly. Hourly asks for a start and end time.',
            },
            {
              action: 'Write a **reason**, tick **Emergency** only if it truly is, then **Submit Application**.',
              tip: 'Emergency leave skips the advance-notice rule but requires you to upload documents within 48 hours.',
            },
          ],
        },
        {
          id: 'track-leave',
          title: 'Track your leave',
          steps: [
            {
              action: 'Open **My Applications** to follow each request through review.',
              detail:
                'Every application shows a status — Pending, Approved, Rejected, Cancelled, Withdrawn, or Escalated — and any rejection reason.',
              tip: 'This build may ask for your Employee ID to load your history; a later update will fill it in automatically.',
              link: { label: 'Take me there', href: '/hr/leave/my-applications' },
            },
            {
              action: 'Use **Withdraw** on a pending request, or **Cancel** on an approved one.',
              detail:
                'Cancelling an approved leave creates a new "cancelled" record and your balance is restored automatically.',
            },
            {
              action: 'Open the **Team Calendar** to see who else is on leave before you plan dates.',
              detail:
                'It shows an org-wide "On Leave" view for a date range, without revealing anyone\'s leave type.',
              link: { label: 'Take me there', href: '/hr/leave/calendar' },
            },
          ],
        },
        {
          id: 'propose-hire',
          title: 'Propose a new hire',
          steps: [
            {
              action: 'Open **Recruitment** to propose a candidate and track your proposals.',
              detail:
                'The hub has three tiles: Submit Candidate, My Candidates, and Approvals.',
              link: { label: 'Take me there', href: '/hr/recruitment' },
            },
            {
              action: 'Click **Submit Candidate** and fill in their details and CVViz profile link.',
              detail:
                'Add the name, email, role category, role title, and a proposed monthly salary band. The form auto-detects your HR organization.',
              tip: 'Once you pick a role category and salary band, a preview shows the exact approval chain the candidate will go through.',
              link: { label: 'Take me there', href: '/hr/recruitment/submit' },
            },
            {
              action: 'Track your proposals on **My Candidates**.',
              detail:
                'See each candidate\'s status and withdraw any that are still pending if plans change.',
              link: { label: 'Take me there', href: '/hr/recruitment/my' },
            },
          ],
        },
        {
          id: 'encashment',
          title: 'Encash unused leave',
          steps: [
            {
              action: 'Open **Leave Encashment** to request payment for unused leave at year-end.',
              detail:
                'Enter the leave type, number of days, and per-diem rate; the page shows the total before you submit and lists your past requests.',
              tip: 'This build asks for several IDs (organization, employee, academic year, leave type). Ask HR for the per-diem rate and any IDs you do not have.',
              link: { label: 'Take me there', href: '/hr/leave/encashment' },
            },
          ],
        },
      ],
    },

    /* ──────────────────────────── MANAGER ──────────────────────────── */
    manager: {
      persona: 'manager',
      title: 'Manager Guide',
      tagline:
        'Clear your approval queues — leave applications and new-hire candidates routed to you.',
      whyItMatters:
        'Requests wait on you. A leave application or a candidacy only moves to the next person once you act, so a slow inbox holds up your whole team. These two inboxes are where you keep things moving.',
      requires: REQUIRES.manager,
      startHere: { label: 'Go to the Approval Inbox', href: '/hr/leave/approve' },
      journey: [
        'Open the leave Approval Inbox',
        'Approve or reject with a reason',
        'Open the recruitment Approvals inbox',
        'Read the candidate, then approve or reject',
      ],
      sections: [
        {
          id: 'leave-inbox',
          title: 'Approve leave',
          steps: [
            {
              action: 'Open the **Approval Inbox** to see leave applications waiting on you.',
              detail:
                'It lists pending and escalated applications with the dates, duration, reason, and which step of the approval chain they are at.',
              prerequisite:
                'You need the leave-approval permission. If the inbox stays empty or blocked, ask your HR admin to confirm you are an approver.',
              link: { label: 'Take me there', href: '/hr/leave/approve' },
            },
            {
              action: 'Read each request — note the **Emergency** and **Escalated** badges.',
              detail:
                'Emergency means advance-notice was bypassed; Escalated means it has been waiting past its window and needs attention sooner.',
              tip: 'This build may ask for an HR Organization ID to load the inbox. Ask your HR admin if you do not have it.',
            },
            {
              action: 'Click **Approve**, or **Reject** with a written reason.',
              detail:
                'Approving advances the application to the next approver (or finalises it); rejecting needs a reason that the applicant will see.',
            },
            {
              action: 'Use **Detail + comments** to open the full application before deciding.',
              detail:
                'The detail page shows the complete history and lets you leave comments for the applicant or the next approver.',
            },
          ],
        },
        {
          id: 'recruitment-inbox',
          title: 'Approve new hires',
          steps: [
            {
              action: 'Open **Recruitment → Approvals** to see candidates routed to you.',
              detail:
                'Switch between "Awaiting my action" (only yours) and "All pending". Each row shows the role, salary band, how many days it has been waiting, and the full approval chain.',
              prerequisite:
                'Approving candidates needs the recruitment-approval permission, which is separate from leave approval. If Approve is unavailable, ask your HR admin.',
              link: { label: 'Take me there', href: '/hr/recruitment/approvals' },
            },
            {
              action: 'Open the candidate\'s **CV** link and read the latest chain comment before deciding.',
              detail:
                'The row carries an inline CV link and the most recent comment from an earlier approver, so you can decide without leaving the page.',
              tip: 'A red "Approval chain not configured" badge means the candidacy needs an HR admin to backfill its route before anyone can approve it.',
            },
            {
              action: 'Click **Approve** (with an optional note) or **Reject** (with a required reason).',
              detail:
                'Approve advances to the next step in the chain; reject ends the candidacy and notifies whoever submitted it.',
            },
          ],
        },
      ],
    },

    /* ──────────────────────────── HR ADMIN ──────────────────────────── */
    'hr-admin': {
      persona: 'hr-admin',
      title: 'HR Admin Guide',
      tagline:
        'Run HR end to end — workforce, the policy catalogue, and the live command-centre dashboard.',
      whyItMatters:
        'You set the rules everyone else follows. Leave entitlements, approval chains, and salary bands all come from the policy catalogue you maintain, and the command centre is where you catch a stuck approval or a pending application before it becomes a complaint.',
      requires: REQUIRES['hr-admin'],
      startHere: { label: 'Open the HR Command Center', href: '/hr' },
      journey: [
        'Read the command-centre dashboard',
        'Manage the workforce list',
        'Know the two policy systems and when to use each',
        'Set onboarding, documents and shift timings',
        'Configure recruitment needs and approval chains',
        'Run payroll, performance, promotions and training',
        'Handle compliance: memos, discipline and exits',
        'Build custom HR forms',
        'Oversee leave and recruitment chains',
      ],
      sections: [
        {
          id: 'command-center',
          title: 'Read the command centre',
          steps: [
            {
              action: 'Open the **HR Command Center** for a live picture of leave, workforce, and compliance.',
              detail:
                'The dashboard adapts to your role — operational tiles for HR officers, strategic tiles for directors, and an 11-institution grid for super admins with a toggle to a rolled-up view.',
              prerequisite:
                'This dashboard is restricted to HR staff. If you are redirected to your main dashboard with a "restricted" message, ask for HR access.',
              platforms: {
                web: 'Left sidebar → **HR** (the HR Command Center is the module landing page).',
                mobile: 'Tap the menu (**☰**), then **HR**.',
              },
              link: { label: 'Take me there', href: '/hr' },
            },
            {
              action: 'Scan the quadrant cards and the **banners** at the top.',
              detail:
                'Banners flag things like a holiday today or a fiscal-year-end prompt; quadrant cards surface what needs attention right now. Use **Refresh** to pull the latest.',
            },
            {
              action: 'Jump to a workflow from the shortcut buttons.',
              detail:
                'Quick links take you straight to the Employee List, the HR Directory, and the Leave workflow.',
            },
          ],
        },
        {
          id: 'workforce',
          title: 'Manage the workforce',
          steps: [
            {
              action: 'Open **HR Directory** to browse every employee in the HR module.',
              detail:
                'Search by name, code, or email and filter by active or inactive. Each row links to the employee\'s detail page.',
              link: { label: 'Take me there', href: '/hr/employees' },
            },
            {
              action: 'Use **Employee List** for the complete staff record.',
              detail:
                'Employees come from the central staff table, so every add, edit and deeper change happens there. HR Directory is a read-only view with HR context layered on.',
              link: { label: 'Take me there', href: '/staff/list' },
            },
          ],
        },
        {
          id: 'policies',
          title: 'Know the two policy systems',
          steps: [
            {
              action: 'Learn that HR has **two separate policy systems** — and which to use when.',
              detail:
                'System 1, **Policies**, is a set of about 19 simple tables you fill in (leave types, approval flows, pay scales, allowances, holidays, and so on) — these drive the automation. System 2, the **HR Manual**, is where you write the policy text staff actually read. They overlap in subject (both cover leave, pay scales, code of conduct), but the tables run the calculations while the Manual is the published wording.',
              tip: 'Admins constantly look in the wrong one. If a leave balance calculates wrong, fix the table under Policies; if the wording of the rule is wrong, edit the HR Manual.',
            },
            {
              action: 'Open **Policies** to manage the configuration tables.',
              detail:
                'About 19 tables grouped into seven categories — Leave & Approval, Compensation, Schedule & Holidays, Onboarding, Discipline & Compliance, Development, and Engagement & Feedback. Each drives a real behaviour: leave entitlements, approval chains, salary bands, public holidays, and more. Every edit is versioned (valid-from / valid-until) with history, diffs, and restore.',
              tip: 'In-flight leave and recruitment keep a frozen snapshot of the rules they started under, so editing a policy never changes a request that is already moving.',
              link: { label: 'Take me there', href: '/hr/policies' },
            },
            {
              action: 'Open the **HR Manual** to edit the published policy text.',
              detail:
                'A set of editors — institution details, facilities, working schedule, welfare, roles, joining and resignation, reimbursement, performance review, and more. You edit as a draft and publish; the staff-facing HR Manual re-renders itself from what you publish.',
              prerequisite:
                'Some Manual editors — pay scales, allowances, code of conduct, disciplinary action, grievance cell, promotion policy — are restricted to super-admins. If an editor is blocked, ask your platform admin.',
              link: { label: 'Take me there', href: '/hr/admin/policies' },
            },
            {
              action: 'Use the **Leave** editors in the HR Manual for the detailed leave wording.',
              detail:
                'A sub-hub with separate editors for casual, vacation, half-pay, compensatory, marriage, on-duty, and holidays / loss-of-pay — the prose side of the leave rules whose numbers live in the Policies tables.',
              link: { label: 'Take me there', href: '/hr/admin/policies/leave' },
            },
          ],
        },
        {
          id: 'onboarding-documents',
          title: 'Set up onboarding, documents and shift timings',
          steps: [
            {
              action: 'Set the **Required Documents** every new hire must submit.',
              detail:
                'The documents demanded at joining — PAN, Aadhaar, certificates — which you can vary by employment type. Onboarding checks each new joiner against this list.',
              prerequisite:
                'The /hr/admin configuration screens are restricted to super-admins (and, for some, the administrator role). If a screen is blocked, ask your platform admin — HR policy access alone is not enough to open them.',
              link: { label: 'Take me there', href: '/hr/admin/required-documents' },
            },
            {
              action: 'Build **Onboarding Checklists** — the joining steps for each role.',
              detail:
                'Step-by-step joining workflows you assign per role category, so every new joiner is taken through the same setup.',
              link: { label: 'Take me there', href: '/hr/admin/onboarding-checklists' },
            },
            {
              action: 'Set **Shift Timings** — the working hours attendance is measured against.',
              detail:
                'Per institution, per staff category (teaching / non-teaching, or a specific category such as Security), and per weekday: the first-half and second-half windows, and the grace period allowed on the morning punch. Saturday can differ from Mon–Fri, Sunday can be marked non-working, and the second Saturday of each month can be set as a holiday. Changes are effective-dated, so past attendance keeps evaluating against the rules that were actually in force.',
              link: { label: 'Take me there', href: '/hr/admin/shift-timings' },
            },
            {
              action: 'Define **Work Patterns** — for staff whose week differs from the institution\'s.',
              detail:
                'A named week (for example "5-day Mon–Fri" or "3-day Tue/Wed/Thu") with its own hours and its own days per leave type. Assign staff to it from a date: their weekly-offs, leave day counts and the salary day-rate then follow the pattern instead of the institution week, and everyone else is unaffected. Assigning resyncs the open Casual Leave balance at once and shows what changed per person.',
              link: { label: 'Take me there', href: '/hr/admin/work-patterns' },
            },
          ],
        },
        {
          id: 'recruitment-config',
          title: 'Configure recruitment and approval chains',
          steps: [
            {
              action: 'Open **Recruitment Maintenance** to backfill a missing approval chain.',
              detail:
                'This is the screen that clears the red "Approval chain not configured" badge a candidacy can show. Until an admin sets the chain here, no one can approve that candidate.',
              prerequisite:
                'The recruitment-config screens are restricted to super-admins. If a screen is blocked, ask your platform admin.',
              tip: 'When a manager reports they cannot approve a candidate, this is almost always where the fix is.',
              link: { label: 'Take me there', href: '/hr/admin/recruitment-maintenance' },
            },
            {
              action: 'Set **who approves each step** in Recruitment Approval Flows.',
              detail:
                'Configure which role or person signs off at each stage of the recruitment chain — reviewers, the final approver, and per-step interview requirements — so candidacies route to the right approvers automatically.',
              link: { label: 'Take me there', href: '/hr/admin/recruitment-approval-flows' },
            },
            {
              action: 'Tune the **Recruitment Need** signals that decide when to hire.',
              detail:
                'A hub of settings — staffing norms, counting weights for adjunct and visiting staff, red/amber/green thresholds, regulatory bodies (AICTE, UGC, DCI, INC, PCI), and per-programme allocations — that together work out where you are short-staffed.',
              link: { label: 'Take me there', href: '/hr/admin/recruitment-need' },
            },
          ],
        },
        {
          id: 'payroll',
          title: 'Run payroll',
          steps: [
            {
              action: 'Open **Payroll Periods** to prepare, review, and approve each pay run.',
              detail:
                'Each pay period moves through a multi-stage workflow from preparation to approval. Open a period to work it, or create the next one.',
              prerequisite:
                'Payroll is restricted to super-admins. If it is blocked, ask your platform admin.',
              link: { label: 'Take me there', href: '/hr/admin/payroll/periods' },
            },
            {
              action: 'Check **Payroll Preview** before you prepare a period.',
              detail:
                'A live preview of pay components, deductions, and net pay, so you can catch a wrong figure before the period is locked.',
              link: { label: 'Take me there', href: '/hr/admin/payroll/preview' },
            },
          ],
        },
        {
          id: 'performance-promotions',
          title: 'Run performance, promotions and training',
          steps: [
            {
              action: 'Open **Performance Review Cycles** to set up appraisals.',
              detail:
                'Create the annual appraisal cycles and the rating rubric each employee is evaluated against, and follow the evaluation history.',
              prerequisite:
                'These screens are restricted to super-admins (cycles are set up centrally). If one is blocked, ask your platform admin.',
              link: { label: 'Take me there', href: '/hr/admin/performance-reviews/cycles' },
            },
            {
              action: 'Manage **Promotions** — proposals and approval pipelines.',
              detail:
                'Raise and track promotion proposals through their approval chain. It works alongside the promotion-criteria table (in Policies) and the promotion-policy wording (in the HR Manual).',
              link: { label: 'Take me there', href: '/hr/admin/promotions' },
            },
            {
              action: 'Run **Training Programs** for skill-building.',
              detail:
                'A catalogue of training programmes with attendance and completion certificates.',
              link: { label: 'Take me there', href: '/hr/admin/training' },
            },
            {
              action: 'Manage **Faculty Development (FDP)** programmes.',
              detail:
                'Faculty Development Programs — proposals, sponsorship, and reporting for staff development.',
              link: { label: 'Take me there', href: '/hr/admin/fdp' },
            },
          ],
        },
        {
          id: 'compliance-exit',
          title: 'Handle compliance, discipline and exits',
          steps: [
            {
              action: 'Issue and track official **Memos** to staff.',
              detail:
                'Raise, track, and analyse official memos. Auto-memo triggers are set in the memo-rules table under Policies.',
              prerequisite:
                'The compliance and exit screens are restricted to super-admins. If one is blocked, ask your platform admin.',
              link: { label: 'Take me there', href: '/hr/admin/memos' },
            },
            {
              action: 'Manage **Disciplinary** cases with a structured workflow.',
              detail:
                'Open a case and take it through investigation to outcome. It pairs with the disciplinary-penalties table (Policies) and the disciplinary-action wording (HR Manual).',
              link: { label: 'Take me there', href: '/hr/admin/disciplinary' },
            },
            {
              action: 'Process **Offboarding** — resignations, retirements and settlements.',
              detail:
                'Resignation, retirement, and full-and-final settlement workflows in one place.',
              link: { label: 'Take me there', href: '/hr/admin/offboarding' },
            },
            {
              action: 'Run **Terminations** through their approval chain.',
              detail:
                'Termination cases follow a fixed review chain (internal committee → legal → director) before they take effect. Pairs with the termination-rules table in Policies.',
              link: { label: 'Take me there', href: '/hr/admin/terminations' },
            },
            {
              action: 'Set **Automation Rules** to move cases along without manual review.',
              detail:
                'Triggered rules that advance HR cases between stages automatically, so routine steps do not wait on a person.',
              link: { label: 'Take me there', href: '/hr/admin/automation-rules' },
            },
          ],
        },
        {
          id: 'forms',
          title: 'Build custom HR forms',
          steps: [
            {
              action: 'Open **HR Forms** to build custom forms and their workflows.',
              detail:
                'Create a form, design its approval workflow, and review submissions — for any HR process that needs its own structured form.',
              prerequisite:
                'Form building is the most restricted HR screen — super-admins only. If it is blocked, ask your platform admin.',
              link: { label: 'Take me there', href: '/hr/admin/forms' },
            },
          ],
        },
        {
          id: 'oversight',
          title: 'Oversee the workflows',
          steps: [
            {
              action: 'Open the **Leave hub** to oversee applications, balances, and the team calendar.',
              detail:
                'From here you reach the approval inbox, every employee\'s balance view, encashment requests, and the org-wide leave calendar.',
              link: { label: 'Take me there', href: '/hr/leave' },
            },
            {
              action: 'Open the **Recruitment hub** to watch candidacies move through their chains.',
              detail:
                'Submit, track, and approve candidates. Approval chains are auto-built from your policy flow rules (role category plus salary band).',
              link: { label: 'Take me there', href: '/hr/recruitment' },
            },
            {
              action: 'Watch the **Approvals** inbox for candidates with no configured chain.',
              detail:
                'A candidacy flagged "Approval chain not configured" cannot be approved by anyone until you backfill its route from the recruitment maintenance screen.',
              link: { label: 'Take me there', href: '/hr/recruitment/approvals' },
            },
          ],
        },
      ],
    },
  },

  glossary: [
    ['Leave entitlement', 'The number of leave days you are given for the year, set by policy. It is pro-rated from your date of joining (fiscal year runs April 1 to March 31).'],
    ['Carried forward', 'Unused leave from last year that policy lets you add to this year\'s balance.'],
    ['Duration type', 'How long a single leave is: a full day, first half (morning), second half (afternoon), or hourly.'],
    ['Emergency leave', 'Leave that skips the advance-notice rule because it could not be planned. Documents are required within 48 hours.'],
    ['Approval chain', 'The ordered list of approvers a request must pass through. Each step is reviewed in turn — the next approver is only notified once the current one approves.'],
    ['Escalated', 'A request that has waited past its window and is pushed up for faster attention.'],
    ['Leave encashment', 'Asking to be paid for unused leave days, usually at year-end. The amount is the days encashed times a per-diem rate.'],
    ['Per-diem rate', 'The money value of one leave day, used to work out an encashment payment.'],
    ['Academic year', 'The April-to-March year HR uses for entitlements and balances. Some screens ask for its ID until a later update fills it in automatically.'],
    ['Role category', 'The kind of role a candidate is being hired into. It helps decide which approval chain the candidacy follows.'],
    ['Monthly salary band', 'A pay range used (with the role category) to route a candidate to the right approvers — not an exact salary.'],
    ['CVViz profile', 'The candidate\'s profile link in CVViz, the recruitment tool, pasted in when you submit a candidate.'],
    ['Internal transfer', 'Hiring a candidate who is already existing staff, linked back to their staff record for continuity.'],
    ['Policy version', 'A dated copy of a policy. Editing a policy creates a new version, so older rules stay on record and can be restored.'],
    ['Frozen snapshot', 'The rule set a request locked in when it started. Later policy edits do not change a request that is already in flight.'],
  ].map(([term, def]) => ({ term, def })),

  plannedLocaleNote: 'A Tamil version is planned — English only for now.',
};

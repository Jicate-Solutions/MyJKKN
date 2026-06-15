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
 *   - hr-admin  (hr.employees.view)  → runs the module: workforce, policies, dashboard
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
  'hr-admin': 'hr.employees.view',
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
        'Maintain the policy catalogue',
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
                'Quick links take you straight to Full-Time Staff, the Non-Staff Workforce list, and the Leave workflow.',
            },
          ],
        },
        {
          id: 'workforce',
          title: 'Manage the workforce',
          steps: [
            {
              action: 'Open **Workforce** to browse every employee in the HR module.',
              detail:
                'Search by name, code, or email and filter by active or inactive. Each row links to the employee\'s detail page.',
              link: { label: 'Take me there', href: '/hr/employees' },
            },
            {
              action: 'Use **Full Employee Management** for the complete staff record.',
              detail:
                'Employees come from the central staff table, so deeper edits happen in the main staff management area linked from this page.',
            },
            {
              action: 'Add a non-staff worker with **New employee** when needed.',
              detail:
                'This form registers non-staff workforce (for example guests/contract roles) into the HR module.',
              link: { label: 'Take me there', href: '/hr/employees/new' },
            },
          ],
        },
        {
          id: 'policies',
          title: 'Maintain the policy catalogue',
          steps: [
            {
              action: 'Open **Policies** to manage every HR policy table.',
              detail:
                'Policies are grouped by category. They drive leave entitlements, approval chains, salary bands, and more — change a policy and the rest of HR follows it.',
              link: { label: 'Take me there', href: '/hr/policies' },
            },
            {
              action: 'Click a policy tile to view and edit its rows.',
              detail:
                'Each policy is versioned: editing creates a new version (valid-from / valid-until), and you can view the change history, see diffs, and restore an earlier version.',
              tip: 'In-flight leave and recruitment keep a frozen snapshot of the rules they started under, so editing a policy never changes a request that is already moving.',
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

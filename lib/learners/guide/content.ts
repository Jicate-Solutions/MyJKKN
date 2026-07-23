/**
 * Learners Smart Guide — authored content (the actual product).
 *
 * Three persona lanes in plain 12th-grade language, authored from the module's
 * REAL routes under app/(routes)/learners/. Every step that happens on a page
 * carries a "Take me there" deep-link. Permission gating uses the shared
 * REQUIRES keys below (the host app's detect-lane checks the same key so a
 * rename is a compile error, not a silent fail-open lane).
 *
 * - The STUDENT lane is OPEN (no `requires`) — it is everyday self-service.
 * - The ADVISOR and STAFF lanes are gated on real permission keys from
 *   lib/constants/permissions.ts (the `key: 'learners'` block).
 */
import type { GuideBook } from "./types";

/** Permission keys that gate each non-student lane. ONE source of truth —
 *  content.ts sets `requires`, the host app's detect-lane checks the same key.
 *  Every key below is verified to literally exist in lib/constants/permissions.ts. */
export const REQUIRES = {
  // FLAG(SME): advisor-caseload (the "My Students — Risk Overview" page) gates
  // by ROLE in code (director / HOD / faculty / counselor scoping), not by a
  // single permission key — there is no `learners.caseload.view` or
  // `learners.at_risk.view` key in the active 'learners' block (the at-risk /
  // counseling keys live in a separate 'learners_counseling' Phase-2 block).
  // `learners.view` is the closest real key in the active block. A human should
  // refine this to the counseling/at-risk key once that block is enforced.
  advisor: "learners.view",
  // Staff/admin lane: the profiles list is the home base for this lane.
  staff: "learners.profiles.view",
} as const;

export const GUIDES: GuideBook = {
  lanes: {
    /* ── STUDENT (open lane — every learner) ───────────────────────────── */
    student: {
      persona: "student",
      title: "Student Guide",
      tagline:
        "Everything you do for yourself here — your profile, attendance, marks, timetable, bills, and leave.",
      whyItMatters:
        "This is your own corner of the platform. Keeping your profile correct and confirming your attendance each week keeps your records right when it counts — for exams, scholarships, and certificates.",
      startHere: { label: "Open My Profile", href: "/learners/my-profile" },
      journey: [
        "Check your profile",
        "Confirm your attendance",
        "See your marks",
        "Check your timetable",
        "Pay your bills",
        "Apply for leave",
      ],
      sections: [
        {
          id: "profile",
          title: "Your profile",
          steps: [
            {
              action: "Open **My Profile** and read through your details.",
              detail:
                "This is the record the institution holds for you — name, course, contact, and more. Check every field is correct.",
              platforms: {
                web: "left sidebar → Learners → My Profile",
                mobile: "tap the menu (☰) → Learners → My Profile",
              },
              link: { label: "Open My Profile", href: "/learners/my-profile" },
            },
            {
              action: "Found something wrong? **Ask for a change** from the same page.",
              detail:
                "You cannot edit some locked fields yourself. Send a change request and a staff member reviews it before it is applied.",
              tip: "You can follow the status of a request you have already sent on the My Profile status page.",
              link: { label: "Check request status", href: "/learners/my-profile/status" },
            },
          ],
        },
        {
          id: "attendance",
          title: "Your attendance",
          steps: [
            {
              action: "Open **My Attendance** to see how many classes you have attended.",
              detail:
                "It shows your attendance for each subject so you always know where you stand.",
              link: { label: "Open My Attendance", href: "/learners/my-attendance" },
            },
            {
              action: "Confirm your recent classes in **Learning Studio Feedback** — it takes about 10 seconds each.",
              detail:
                "After a class you give a quick feedback, and that confirms you were present. Classes stay 'present-pending' until you confirm them.",
              prerequisite:
                "Do this within the window after each class. If you skip it, that class may not be counted as attended.",
              link: { label: "Open Learning Studio Feedback", href: "/learners/class-feedback" },
            },
            {
              action: "Not sure which classes still need confirming? Open **Learning Studio Feedback** for the full pending list.",
              detail:
                "This is the one place that lists every class waiting on your confirmation — and, lower down, the ones you've already confirmed.",
              link: { label: "Open Learning Studio Feedback", href: "/learners/class-feedback" },
            },
          ],
        },
        {
          id: "marks",
          title: "Your marks",
          steps: [
            {
              action: "Open **My Marks** to see your internal marks.",
              detail:
                "This opens your internal assessment marks — the tests and assignments during the term.",
              link: { label: "Open Internal Marks", href: "/learners/my-marks/internal" },
            },
            {
              action: "Check your **published results** when exam results are out.",
              detail:
                "Final semester results appear here once the exam office publishes them.",
              link: { label: "Open Results", href: "/learners/my-marks/result" },
            },
          ],
        },
        {
          id: "timetable",
          title: "Your timetable",
          steps: [
            {
              action: "Open **My Timetable** to see your weekly class schedule.",
              detail:
                "Your classes, periods, and subjects for the week — check it the night before so you know your day.",
              link: { label: "Open My Timetable", href: "/learners/my-timetable" },
            },
          ],
        },
        {
          id: "bills",
          title: "Your bills",
          steps: [
            {
              action: "Open **My Bills** to see your fees and what you have paid.",
              detail:
                "Shows your fee details and payment record. Use it to check dues before a deadline.",
              link: { label: "Open My Bills", href: "/learners/my-bills" },
            },
          ],
        },
        {
          id: "leave",
          title: "Leave and on-duty",
          steps: [
            {
              action: "Need time off or to attend an event? **Apply for Leave / On-Duty**.",
              detail:
                "Use Leave for personal absence and On-Duty when you represent the institution (a match, a conference, a competition).",
              link: { label: "Apply for Leave / OnDuty", href: "/learners/leave-onduty/apply" },
            },
            {
              action: "Track what you have sent in **My Applications**.",
              detail:
                "See whether each request is pending, approved, or rejected, and edit or cancel one that is still pending.",
              link: { label: "Open My Applications", href: "/learners/leave-onduty/my-applications" },
            },
          ],
        },
      ],
    },

    /* ── ADVISOR (class advisor / counselor working a caseload) ────────── */
    advisor: {
      persona: "advisor",
      title: "Class Advisor Guide",
      tagline: "You watch over the students assigned to you and step in early when one needs help.",
      whyItMatters:
        "A student in trouble rarely says so. The risk overview surfaces the quiet ones — low attendance, slipping marks — so you can reach them before a small problem becomes a dropout.",
      startHere: { label: "Open My Students", href: "/learners/advisor-caseload" },
      requires: REQUIRES.advisor,
      journey: [
        "Open your caseload",
        "Read the risk tiers",
        "Reach the students who need you",
      ],
      sections: [
        {
          id: "caseload",
          title: "Work your caseload",
          steps: [
            {
              action: "Open **Advisor Caseload** to see your students grouped by risk.",
              detail:
                "Students are sorted into Critical, High, Moderate, Low, and Doing Well. The page is already scoped to your department, so you only see your own students.",
              platforms: {
                web: "left sidebar → Learners → Advisor Caseload",
                mobile: "tap the menu (☰) → Learners → Advisor Caseload",
              },
              link: { label: "Open Advisor Caseload", href: "/learners/advisor-caseload" },
            },
            {
              action: "Start with the **Critical** and **High** groups first.",
              detail:
                "These are the students most likely to fall behind. Open a student's card to see why they were flagged.",
              tip: "The risk tiers refresh daily, so check back through the week — a student can move between groups.",
            },
            {
              action: "Use the filters to focus on one **department, section, or risk tier**.",
              detail:
                "Narrow the list down to exactly the group you want to act on right now.",
              link: { label: "Open Advisor Caseload", href: "/learners/advisor-caseload" },
            },
          ],
        },
      ],
    },

    /* ── STAFF / ADMIN (operational learner records) ───────────────────── */
    staff: {
      persona: "staff",
      title: "Staff & Admin Guide",
      tagline:
        "You manage learner records end to end — enquiries, profiles, promotion, change requests, alumni, and the numbers behind it all.",
      whyItMatters:
        "Every record you keep clean here flows everywhere else — attendance, exams, certificates, and reports. Accurate learner data is the backbone of the whole institution.",
      startHere: { label: "Open Learner Profiles", href: "/learners/profiles" },
      requires: REQUIRES.staff,
      journey: [
        "Capture enquiries",
        "Onboard new learners",
        "Manage profiles",
        "Approve change requests",
        "Promote at year-end",
        "Track alumni",
        "Read the dashboard",
      ],
      sections: [
        {
          id: "enquiries",
          title: "Enquiries (people who want to join)",
          steps: [
            {
              action: "Open **Enquiries** to see everyone who has reached out about admission.",
              detail:
                "This is your list of prospects. Track each one from first contact to a confirmed admission.",
              link: { label: "Open Enquiries", href: "/learners/enquiries" },
            },
            {
              action: "Add a walk-in or phone enquiry with **New Enquiry**.",
              detail:
                "Capture the person's details on the spot so nobody who is interested gets lost.",
              link: { label: "Add New Enquiry", href: "/learners/enquiries/new" },
            },
          ],
        },
        {
          id: "onboarding",
          title: "Onboarding new learners",
          steps: [
            {
              action: "Open **Onboarding** to bring confirmed admissions into the system as learners.",
              detail:
                "This is where a new student's record gets set up so they can start using the platform.",
              link: { label: "Open Onboarding", href: "/learners/onboarding" },
            },
          ],
        },
        {
          id: "profiles",
          title: "Learner profiles",
          steps: [
            {
              action: "Open **Profiles** to view and manage every active learner.",
              detail:
                "Search, filter, and open any learner to see their full record. This is your day-to-day home base.",
              platforms: {
                web: "left sidebar → Learners → Profiles",
                mobile: "tap the menu (☰) → Learners → Profiles",
              },
              link: { label: "Open Profiles", href: "/learners/profiles" },
            },
            {
              action: "Add a single new learner with **Create Profile**.",
              detail:
                "Use this when you need to add one learner by hand rather than through onboarding.",
              link: { label: "Create a Profile", href: "/learners/profiles/create" },
            },
            {
              action: "Open any learner from the list to see or edit their **full profile**.",
              detail:
                "Click a row in the Profiles list to open that learner's detail page, then edit if needed.",
              tip: "Always open the learner from the list — that way you are sure you are editing the right person.",
              link: { label: "Open Profiles", href: "/learners/profiles" },
            },
          ],
        },
        {
          id: "change-requests",
          title: "Profile change requests",
          steps: [
            {
              action: "Open **Change Requests** to review edits that students have asked for.",
              detail:
                "When a student requests a change to a locked field, it waits here for a staff member to approve or reject it.",
              link: { label: "Open Change Requests", href: "/learners/change-requests" },
            },
            {
              action: "Open a request to **approve or reject** it.",
              detail:
                "Read what the student wants changed, check it is correct, then approve to apply it or reject with a reason.",
              tip: "Approving a request updates the learner's profile right away — double-check before you approve.",
              link: { label: "Open Change Requests", href: "/learners/change-requests" },
            },
          ],
        },
        {
          id: "promotion",
          title: "Year-end promotion",
          steps: [
            {
              action: "At the end of the academic year, open **Promotion** to move learners to the next year.",
              detail:
                "This advances students into their next semester or year in one organised place.",
              link: { label: "Open Promotion", href: "/learners/profiles/promotion" },
            },
          ],
        },
        {
          id: "lifecycle",
          title: "Lifecycle and alumni",
          steps: [
            {
              action: "Open **Lifecycle** to see how learners move through each stage — enquiry, active, graduated, exited.",
              detail:
                "A single view of where everyone is in their journey with the institution.",
              prerequisite:
                "The Lifecycle page needs its own access (the lifecycle view permission). If it is blocked, ask your administrator — the profiles permission alone does not open it.",
              link: { label: "Open Lifecycle", href: "/learners/lifecycle" },
            },
            {
              action: "Open **Alumni** to manage learners who have graduated or left.",
              detail:
                "Keep records of past students so you can reach them later and report on outcomes.",
              link: { label: "Open Alumni", href: "/learners/alumni" },
            },
          ],
        },
        {
          id: "analytics",
          title: "The numbers",
          steps: [
            {
              action: "Open **Analytics** for the learners dashboard — counts, trends, and change-request activity.",
              detail:
                "The big picture across all learners, useful for reviews and reporting.",
              prerequisite:
                "The dashboard needs its own access (the learners dashboard permission). If it is blocked, ask your administrator.",
              link: { label: "Open Analytics", href: "/learners/analytics" },
            },
          ],
        },
      ],
    },
  },

  glossary: [
    { term: "Profile", def: "A learner's full record in the system — name, course, contact, and more." },
    { term: "Enquiry", def: "A person who has shown interest in admission but is not yet a confirmed student." },
    { term: "Onboarding", def: "Setting up a confirmed admission as an active learner so they can use the platform." },
    { term: "Change request", def: "A student's request to update a locked field on their profile, which a staff member must approve." },
    { term: "Attendance confirmation", def: "Giving quick class feedback to confirm you were present; classes stay 'present-pending' until you do." },
    { term: "On-duty (OD)", def: "An approved absence for representing the institution — a match, conference, or competition — counted differently from ordinary leave." },
    { term: "Risk tier", def: "How urgently a student may need help, from Critical down to Doing Well, based on signals like attendance and marks." },
    { term: "Caseload", def: "The group of students assigned to a class advisor or counselor to watch over." },
    { term: "Promotion", def: "Moving learners up to their next year or semester at the end of the academic year." },
    { term: "Lifecycle", def: "The stages a learner passes through — enquiry, active, graduated, or exited." },
    { term: "Alumni", def: "Learners who have graduated or left the institution." },
  ],

  plannedLocaleNote: "A Tamil version is planned — English only for now.",
};

/**
 * Academic Management Smart Guide — authored content (the actual product).
 *
 * Five persona lanes in plain 12th-grade language, authored from the module's
 * REAL routes under app/(routes)/academic. Every step that happens on a page
 * carries a "Take me there" deep-link. Permission gating uses the shared
 * REQUIRES keys below (imported by detect-lane.ts so a rename is a compile
 * error, not a silent fail-open lane).
 */
import type { GuideBook } from "./types";
// Exam-eligibility thresholds are configuration (2026-07-26). This guide is static
// prose compiled at build time, so it renders the DEFAULT pair rather than a
// per-institution override — enough to keep the numbers from drifting out of sync
// with the code, which is what four hand-typed copies used to do.
import {
  ATTENDANCE_ELIGIBILITY,
  CONDONATION_FLOOR,
} from "@/lib/services/exam-audit/compute";

/** Permission keys that gate each staff lane. ONE source of truth — content.ts
 *  sets `requires`, detect-lane.ts checks the same key. Keys are the real
 *  Academic catalog keys from lib/constants/permissions.ts (and the
 *  PermissionGuard module+action pairs across app/(routes)/academic).
 *  The learner lane has no key — it is the open everyday lane. */
export const REQUIRES = {
  faculty: "academic.attendance.mark",
  hod: "academic.attendance.dashboard.view",
  principal: "academic.attendance.dashboard.view_all_institutions",
  coordinator: "academic.years.view",
  // Exam IA Audit — the Registrar's walk-in sheet (also held by principals,
  // administrators, CEO and EAO). Gate-matches the page's own API authority
  // (fn_exam_audit_access checks this exact key).
  registrar: "academic.internal_marks.exam_audit.view",
} as const;

export const GUIDES: GuideBook = {
  lanes: {
    /* ── LEARNER (open lane — every student) ─────────────────────────────── */
    learner: {
      persona: "learner",
      title: "Student Guide",
      tagline:
        "Apply for leave, confirm your attendance with feedback, and check your privileges.",
      whyItMatters:
        "Two small habits keep your record clean: apply for leave before you miss class, and give one-tap feedback after each session so your attendance is confirmed instead of left pending.",
      startHere: { label: "Give Learning Studio Feedback", href: "/learners/class-feedback" },
      journey: ["Give learning studio feedback", "Check it confirmed", "Apply for leave", "See your privileges"],
      sections: [
        {
          id: "feedback",
          title: "Confirm attendance with feedback",
          steps: [
            {
              action: "After a class, open **Give Learning Studio Feedback** and finish the short checklist.",
              detail:
                "It is a 10-second checklist plus a 'did I understand?' question. Submitting it confirms your attendance for that session.",
              platforms: {
                web: "left sidebar → Academic → Session Feedback → Give Learning Studio Feedback",
                mobile: "tap the menu (☰) → Academic → Session Feedback",
              },
              link: { label: "Give Learning Studio Feedback", href: "/learners/class-feedback" },
            },
            {
              action: "Open **Learning Studio Feedback** to see which sessions are confirmed.",
              detail:
                "Anything still marked present-pending means you have not given feedback yet — finish it so it counts. The confirmed list is under “Confirmed this month” on that page.",
              link: { label: "Open Learning Studio Feedback", href: "/learners/class-feedback" },
            },
          ],
        },
        {
          id: "leave",
          title: "Apply for leave",
          steps: [
            {
              action: "Open **Leaves** and press **New Leave** to file a request before you miss class.",
              detail:
                "Pick the dates and leave type and submit. It then goes to your approver to review.",
              tip: "Apply early — a request sent before the absence is far easier to approve than one sent after.",
              link: { label: "Apply for Leave", href: "/academic/leaves/new" },
            },
            {
              action: "Track the request back in **Leaves** until it shows approved.",
              detail: "The list shows the current status of every request you have filed.",
              link: { label: "Open Leaves", href: "/academic/leaves" },
            },
          ],
        },
        {
          id: "privileges",
          title: "See your privileges",
          steps: [
            {
              action: "Open **My Privileges** to see any active privilege you hold and its renewal status.",
              detail:
                "If a privilege shows 'Renewal Due', act before it lapses. You can download your privilege card from this page.",
              link: { label: "Open My Privileges", href: "/academic/privileges/my" },
            },
          ],
        },
      ],
    },

    /* ── FACULTY ─────────────────────────────────────────────────────────── */
    faculty: {
      persona: "faculty",
      title: "Faculty Guide",
      tagline: "Your daily teaching tasks: mark attendance, enter marks, and check your calendar.",
      whyItMatters:
        "Attendance and internal marks are your two most-used screens — getting them in cleanly keeps every downstream report (consolidation, OBE, results) correct.",
      startHere: { label: "Mark Attendance", href: "/academic/attendance/mark" },
      requires: REQUIRES.faculty,
      journey: ["Mark attendance", "Enter internal marks", "Check your timetable", "Read session insight"],
      sections: [
        {
          id: "attendance",
          title: "Mark attendance",
          steps: [
            {
              action: "Open **Mark Attendance** and pick the class period you are teaching.",
              detail:
                "Choose the date and period, then mark each learner present or absent and save. Use the search box to find a name quickly.",
              prerequisite:
                "Your timetable must list the period for it to appear here. If a class is missing, check your timetable or ask your coordinator.",
              platforms: {
                web: "left sidebar → Academic → Attendance → Mark",
                mobile: "tap the menu (☰) → Academic → Attendance → Mark",
              },
              link: { label: "Mark Attendance", href: "/academic/attendance/mark" },
            },
          ],
        },
        {
          id: "marks",
          title: "Enter internal marks",
          steps: [
            {
              action: "Open **Internal Marks** to enter Continuous Internal Assessment marks for your learners.",
              detail:
                "Type each learner's mark, then use **Submit** to lock them in once you are done.",
              tip: "Submitting is final for that round — double-check totals before you submit.",
              link: { label: "Open Internal Marks", href: "/academic/internal-marks" },
            },
            {
              action: "Open the **Internal Marks Report** to review what you entered.",
              link: { label: "Open Marks Report", href: "/academic/internal-marks/report" },
            },
          ],
        },
        {
          id: "calendar",
          title: "Your timetable and feedback",
          steps: [
            {
              action: "Open **Faculty Calendar** to see your week's classes at a glance.",
              link: { label: "Open Faculty Calendar", href: "/academic/timetables/faculty-calendar" },
            },
            {
              action: "Open **Session Insight** to see how well learners understood your sessions.",
              detail:
                "It shows aggregated, anonymous understanding signals from your own classes — individual learner answers are never shown.",
              link: { label: "Open Session Insight", href: "/academic/session-feedback/faculty" },
            },
          ],
        },
      ],
    },

    /* ── HOD ─────────────────────────────────────────────────────────────── */
    hod: {
      persona: "hod",
      title: "HOD Guide",
      tagline: "Watch your department's attendance, follow up on weak sessions, and approve leave.",
      whyItMatters:
        "The attendance dashboard and session escalations are your early-warning screens — they tell you where to step in before a pattern becomes a problem.",
      startHere: { label: "Open Attendance Dashboard", href: "/academic/attendance/dashboard" },
      requires: REQUIRES.hod,
      journey: ["Watch the dashboard", "Follow up weak sessions", "Approve leave", "Plan staff"],
      sections: [
        {
          id: "oversight",
          title: "Watch attendance and sessions",
          steps: [
            {
              action: "Open the **Attendance Dashboard** to see how your department is attending, day by day.",
              detail: "Use it to spot sections or courses where attendance is slipping.",
              platforms: {
                web: "left sidebar → Academic → Attendance → Dashboard",
                mobile: "tap the menu (☰) → Academic → Attendance → Dashboard",
              },
              link: { label: "Open Attendance Dashboard", href: "/academic/attendance/dashboard" },
            },
            {
              action: "Open **Session Escalations** to see classes where learners reported low understanding.",
              detail:
                "These are sessions flagged for follow-up — use them to start a conversation with the faculty member.",
              link: { label: "Open Session Escalations", href: "/academic/session-feedback/principal" },
            },
          ],
        },
        {
          id: "approvals",
          title: "Approve leave and plan staff",
          steps: [
            {
              action: "Open **On-Duty Approvals** to review and process pending on-duty and leave requests.",
              tip: "Clear approvals quickly — a pending request blocks the learner or staff member's plans.",
              link: { label: "Open Approvals", href: "/academic/leave-onduty/approvals" },
            },
            {
              action: "Open **Staff Planning** to review teaching workload and staffing for your department.",
              link: { label: "Open Staff Planning", href: "/academic/staff-planning" },
            },
          ],
        },
      ],
    },

    /* ── PRINCIPAL ───────────────────────────────────────────────────────── */
    principal: {
      persona: "principal",
      title: "Principal Guide",
      tagline: "See the whole institution's attendance and the sessions that need attention.",
      whyItMatters:
        "Your views span the whole institution, not one department — use them to catch wide patterns and confirm that flagged sessions actually improved.",
      startHere: { label: "Open Attendance Dashboard", href: "/academic/attendance/dashboard" },
      requires: REQUIRES.principal,
      journey: ["Watch institution attendance", "Review escalations", "Check consolidated reports"],
      sections: [
        {
          id: "institution",
          title: "Watch the institution",
          steps: [
            {
              action: "Open the **Attendance Dashboard** to see attendance across the institution.",
              detail:
                "With institution-wide access you can compare departments and spot where attendance needs attention.",
              prerequisite:
                "Seeing every institution at once needs the all-institutions view permission. If you only see one institution, ask your platform admin to grant it.",
              link: { label: "Open Attendance Dashboard", href: "/academic/attendance/dashboard" },
            },
            {
              action: "Open **Session Escalations** to review flagged classes and whether follow-up sessions improved.",
              detail:
                "Each escalation shows the low-understanding session and the later session by the same faculty for the same course, so you can see if it lifted.",
              link: { label: "Open Session Escalations", href: "/academic/session-feedback/principal" },
            },
          ],
        },
        {
          id: "reports",
          title: "Consolidated reports",
          steps: [
            {
              action: "Open **Attendance Consolidation** to review pulled-together attendance across sections.",
              link: { label: "Open Consolidation", href: "/academic/attendance/consolidation" },
            },
            {
              action: "Open **Attendance Reports** to review and export detailed attendance figures.",
              link: { label: "Open Reports", href: "/academic/attendance/reports" },
            },
          ],
        },
      ],
    },

    /* ── COORDINATOR (academic admin — sets up the structure) ────────────── */
    coordinator: {
      persona: "coordinator",
      title: "Academic Coordinator Guide",
      tagline: "Set up the academic structure the whole module runs on — years, rules, and timetables.",
      whyItMatters:
        "Nothing else works until the structure is in place: years, regulations, batches, periods and timetables are the foundation every other screen reads from.",
      startHere: { label: "Open Academic Years", href: "/academic/years" },
      requires: REQUIRES.coordinator,
      journey: ["Open the year", "Set regulations", "Build batches and periods", "Publish timetables", "Configure OBE"],
      sections: [
        {
          id: "foundation",
          title: "Set up the foundation",
          steps: [
            {
              action: "Open **Academic Years** and make sure the current year is created and active.",
              detail: "Everything else — periods, timetables, attendance — is scoped to the academic year.",
              prerequisite:
                "Set up the year FIRST. Without an active year, periods and timetables have nothing to attach to.",
              platforms: {
                web: "left sidebar → Academic → Years",
                mobile: "tap the menu (☰) → Academic → Years",
              },
              link: { label: "Open Academic Years", href: "/academic/years" },
            },
            {
              action: "Open **Regulations** to set the rules that govern courses and credits.",
              detail: "Regulations define the academic rules a batch follows for its whole programme.",
              link: { label: "Open Regulations", href: "/academic/regulations" },
            },
            {
              action: "Open **Batches** to create the student groups for the year.",
              link: { label: "Open Batches", href: "/academic/batches" },
            },
            {
              action: "Open **Periods** to define the daily class slots.",
              detail: "Periods are the time slots that timetables and attendance are built on.",
              link: { label: "Open Periods", href: "/academic/periods" },
            },
          ],
        },
        {
          id: "timetable-obe",
          title: "Timetables and outcomes",
          steps: [
            {
              action: "Open **Timetables** to build and publish the class schedule.",
              detail:
                "Assign faculty to periods. Once published, classes appear on each faculty member's calendar and feed the attendance screens.",
              tip: "Check **Conflicts** before publishing so no faculty member or room is double-booked.",
              link: { label: "Open Timetables", href: "/academic/timetables" },
            },
            {
              action: "Open **OBE** to configure program outcomes and course-outcome mapping.",
              detail:
                "Set up POs/PSOs and the CO-PO mapping that the module uses to track attainment for accreditation.",
              link: { label: "Open OBE", href: "/academic/obe" },
            },
            {
              action: "Open **Leave Settings** to configure leave types and approval workflows.",
              detail: "This decides which leave types staff and learners can apply for and who approves them.",
              link: { label: "Open Leave Settings", href: "/academic/leaves/settings" },
            },
          ],
        },
      ],
    },

    /* ── REGISTRAR (the in-person exam auditor — walks departments with the
       Exam IA Audit sheet; principals/administrators/CEO/EAO hold the same
       key and see this lane's sections too) ─────────────────────────────── */
    registrar: {
      persona: "registrar",
      title: "Registrar Exam-Audit Guide",
      tagline:
        "Before you walk into a department, know exactly which programs to visit and what to ask for.",
      whyItMatters:
        "Colleges send semester attendance to the university from manual registers, and internal marks can reach the exam system as one-day bulk entries. This audit shows, program by program, where the continuous trail is missing — so your department visit starts from evidence, not suspicion.",
      startHere: { label: "Open Exam IA Audit", href: "/academic/internal-marks/exam-audit" },
      requires: REQUIRES.registrar,
      journey: ["Pick college and exam", "Read the verdicts", "Note who to visit", "Check eligibility risk", "Walk the department"],
      sections: [
        {
          id: "open-audit",
          title: "Open the audit and pick the scope",
          steps: [
            {
              action: "Open **Exam IA Audit** under Academic → Assessment.",
              detail:
                "The page computes everything fresh from JKKN day-one attendance and the exam system — nothing on it is self-reported.",
              platforms: {
                web: "left sidebar → Academic → the Assessment tab → Exam IA Audit",
                mobile: "tap the menu (☰) → Academic → Assessment → Exam IA Audit",
              },
              link: { label: "Open Exam IA Audit", href: "/academic/internal-marks/exam-audit" },
            },
            {
              action: "Pick the **College**, then the **Exam session** you are auditing.",
              detail:
                "The current term is auto-detected; you can switch to any past cycle. Two empty states are possible and mean different things: a session with no registrations means the exam cell has not opened registrations for that college yet, and a college with no sessions at all (the page says so) means the exam cell has never created an exam session for it — in both cases the follow-up is with the exam cell, not the departments.",
              tip: "Audit the cycle whose exams are nearest — that is where a missing trail still has time to be fixed.",
            },
          ],
        },
        {
          id: "read-verdicts",
          title: "Read the two verdicts on each program",
          steps: [
            {
              action: "Read the **CIA source** chip first: it says WHO entered the internal marks and how they landed.",
              detail:
                "'Faculty · continuous' is the intended state. 'Operator dump' means the marks reached the exam system through a handful of exam-cell accounts in a burst — not that the marks are wrong, but the continuous-assessment trail must exist somewhere else, and that is what you audit in person.",
            },
            {
              action: "Read the **Rubric** chip next: it grades the entries against the configured assessment pattern.",
              detail:
                "'Partial · 1/2 rounds' means a whole configured round never happened. 'Off rubric · 0/2 rounds' means a rubric exists but nothing was entered. 'No rubric set' means the exam cell never configured an assessment pattern for that program — raise that with them before blaming the department.",
              tip: "Internal marks are defined by the rubric's components (tests, assignments). Attendance never decides marks — it only gates who may sit the exam.",
            },
            {
              action: "Use **Enterers / Entry days / Busiest day** to see the shape of the entry trail.",
              detail:
                "One enterer, one day, 100% on the busiest day = a bulk dump. Many enterers across many days = marks entered as assessments actually happened.",
            },
          ],
        },
        {
          id: "eligibility",
          title: "Check eligibility risk before the visit",
          steps: [
            {
              action: `Read the **<${ATTENDANCE_ELIGIBILITY}% / <${CONDONATION_FLOOR}% / No record** columns — they count the exam-registered learners against JKKN's own day-one attendance.`,
              detail: `Below ${ATTENDANCE_ELIGIBILITY}% needs condonation; below ${CONDONATION_FLOOR}% risks ineligibility; 'No record' means the learner is registered for the university exam but absent from JKKN attendance entirely — the university got their attendance from a manual register with nothing in our system behind it.`,
              prerequisite:
                "Audit 'No record' programs FIRST — those are the ones where the manual register is the only evidence that exists.",
            },
          ],
        },
        {
          id: "walk-in",
          title: "Walk the department with the sheet",
          steps: [
            {
              action: "For each flagged program, ask the department for the physical assessment records the chips say are missing.",
              detail:
                "'Partial · 1/2 rounds' → ask for the round-2 test papers and mark lists. 'Operator dump' → ask for the department's own continuous-assessment register that the bulk entry was copied from. 'No record' students → ask for the attendance register pages that were sent to the university.",
              tip: "Cross-check a few students by hand: the same student's percentage on this page versus the manual register page the college submitted.",
            },
          ],
        },
      ],
    },
  },

  glossary: [
    { term: "Academic Year", def: "The yearly cycle that periods, timetables and attendance are all scoped to. Set this up first." },
    { term: "Regulation", def: "The set of academic rules — courses, credits, structure — that a batch follows for its programme." },
    { term: "Batch", def: "A group of students admitted together who move through the programme as one cohort." },
    { term: "Period", def: "A single daily class time slot. Timetables and attendance are built on periods." },
    { term: "Internal Marks (CIA)", def: "Continuous Internal Assessment marks entered by faculty before final results — distinct from end-semester exams." },
    { term: "OBE", def: "Outcome-Based Education — tracking program outcomes (PO/PSO) and course outcomes (CO) and how they map, for accreditation." },
    { term: "On-Duty", def: "An approved official absence (e.g. representing the college) that is recorded separately from ordinary leave." },
    { term: "Session Feedback", def: "A short post-class checklist learners submit to confirm attendance and flag where they did not understand." },
  ],

  plannedLocaleNote: "A Tamil version is planned — English only for now.",
};

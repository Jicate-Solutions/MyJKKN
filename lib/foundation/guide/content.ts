/**
 * Foundation & Competitive-Exam Programme — Smart Guide (authored content).
 *
 * Two staff lanes in plain 12th-grade language, authored from the module's REAL
 * routes (/foundation hub, /foundation/console). Every step that happens on a
 * page carries a "Take me there" deep-link to a RESOLVABLE route (the dynamic
 * /foundation/students/[id] page is reached via the console, so no guide link
 * points at a bare [id]).
 *
 * Gating: the REQUIRES keys below are REAL keys present in
 * lib/constants/permissions.ts ('Foundation Programme' category). content.ts
 * sets `requires`; the registry re-keys these onto canonical personas so a
 * rename is a compile error, not a silent fail-open lane.
 */
import type { GuideBook } from "../../guide/types";

/** Permission keys that gate each lane — ONE source of truth. */
export const REQUIRES = {
  // The resource person / foundation admin who sets up cohorts, authors the
  // question bank and builds assessments — the "runs the programme" gate.
  coordinator: "foundation.cohorts.manage",
  // The teacher who reviews a student's diagnostic and generates a revision
  // plan — the "help this student" gate.
  facilitator: "foundation.students.view",
} as const;

export const GUIDES: GuideBook = {
  lanes: {
    /* ── COORDINATOR (resource person / foundation admin) ──────────────── */
    coordinator: {
      persona: "coordinator",
      title: "Coordinator Guide",
      tagline:
        "You set up the cohorts, build the question bank, and assemble the tests students take.",
      whyItMatters:
        "Everything students practise on starts with you. A good, well-tagged question bank is what lets the system find each student's weak spots — get this right and the diagnostics take care of themselves.",
      startHere: { label: "Open Foundation Programme", href: "/foundation" },
      requires: REQUIRES.coordinator,
      journey: [
        "See the programme",
        "Open the console",
        "Author questions",
        "Build an assessment",
      ],
      sections: [
        {
          id: "overview",
          title: "Start at the hub",
          steps: [
            {
              action:
                "Open **Foundation Programme** to see the whole module at a glance.",
              detail:
                "The hub is your way in — it links to the console where the cohorts, question bank and assessments live.",
              platforms: {
                web: "left sidebar → Foundation Programme",
                mobile: "tap the menu (☰) → Foundation Programme",
              },
              link: { label: "Open Foundation Programme", href: "/foundation" },
            },
          ],
        },
        {
          id: "console",
          title: "Set up cohorts and the question bank",
          steps: [
            {
              action:
                "Open the **Console** to see your cohorts and their students.",
              detail:
                "A cohort is one batch — a school + an exam (NEET, JEE, CUET…) + a term. Open one to see who's enrolled.",
              link: { label: "Open Console", href: "/foundation/console" },
            },
            {
              action:
                "**Author questions** into the bank, tagged by exam, topic and difficulty.",
              detail:
                "Tagging each question to a topic is what makes the weakness map work later — an untagged question can't tell you where a student is weak.",
              tip: "Mark the source (licensed or authored) so you always know which questions are yours to reuse freely.",
              link: { label: "Open Console", href: "/foundation/console" },
            },
            {
              action:
                "**Build an assessment** — a diagnostic, practice set, or mock — from the questions you've authored.",
              detail:
                "Pick the exam, give it a title, choose its kind, and add questions in order. A 'diagnostic' is what sets each student's starting baseline.",
              link: { label: "Open Console", href: "/foundation/console" },
            },
          ],
        },
      ],
    },

    /* ── FACILITATOR (teacher reviewing a student's diagnostic) ─────────── */
    facilitator: {
      persona: "facilitator",
      title: "Facilitator Guide",
      tagline:
        "You open a student, read exactly where they're weak, and generate a plan that targets it.",
      whyItMatters:
        "This is the part parents actually feel: not just a mark, but 'here is exactly where my child is weak, and here's what we're doing about it.' The system does the finding — you act on it.",
      startHere: { label: "Open Console", href: "/foundation/console" },
      requires: REQUIRES.facilitator,
      journey: [
        "Open a student",
        "Read the weakness map",
        "Generate a revision plan",
      ],
      sections: [
        {
          id: "find",
          title: "Open a student",
          steps: [
            {
              action:
                "From the **Console**, open a cohort and pick the student you want to review.",
              detail:
                "Each student has their own diagnostic page. You only see the students in cohorts you're assigned to — that's by design.",
              platforms: {
                web: "left sidebar → Foundation Programme → Console → a student",
                mobile: "tap the menu (☰) → Foundation Programme → Console → a student",
              },
              link: { label: "Open Console", href: "/foundation/console" },
            },
          ],
        },
        {
          id: "diagnose",
          title: "Read the weakness map and act",
          steps: [
            {
              action:
                "Read the student's **weakness map** — their mastery per topic, weakest first.",
              detail:
                "This is built from every test they've taken (a rolling average), so one bad day doesn't distort it. The lowest topics are where to focus.",
              prerequisite:
                "The map only fills in once the student has taken a diagnostic or practice test. An empty map means they haven't attempted anything yet.",
              link: { label: "Open Console", href: "/foundation/console" },
            },
            {
              action:
                "**Generate a revision plan** — one click turns the weak spots into a targeted plan.",
              detail:
                "The plan prioritises the weakest topics and pulls recommended questions for each, so the student practises exactly what they need.",
              link: { label: "Open Console", href: "/foundation/console" },
            },
          ],
        },
      ],
    },
  },

  glossary: [
    { term: "Cohort", def: "One batch of students — a school + an exam (NEET/JEE/CUET…) + a term — taught by a resource person." },
    { term: "Question bank", def: "The authored questions, each tagged by exam, topic and difficulty. Good tagging is what powers the weakness map." },
    { term: "Diagnostic", def: "A test that sets a student's starting baseline, so later progress is measured as movement from it." },
    { term: "Weakness map", def: "A student's mastery per topic (weakest first), built as a rolling average across all their attempts." },
    { term: "Revision plan", def: "A generated, prioritised plan targeting a student's weakest topics with recommended practice questions." },
  ],

  plannedLocaleNote: "A Tamil version is planned — English only for now.",
};

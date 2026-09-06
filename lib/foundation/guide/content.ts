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
import type { GuideBook, GuideSection } from "../../guide/types";

/** Permission keys that gate each lane — ONE source of truth. */
export const REQUIRES = {
  // The resource person / foundation admin who sets up cohorts, authors the
  // question bank and builds assessments — the "runs the programme" gate.
  coordinator: "foundation.cohorts.manage",
  // The teacher who reviews a student's diagnostic and generates a revision
  // plan — the "help this student" gate.
  facilitator: "foundation.students.view",
  // The person actually sitting the programme, answering the questions — the
  // "practise" gate. Everything else in this module is an operator surface.
  learner: "foundation.practice.take",
  // The Senior Learner who RUNS a session for a group rather than sitting it.
  //
  // Deliberately the same key as `learner`: one permission opens
  // /foundation/practice/facilitate, and no permission distinguishes running a
  // session from sitting one — that distinction is DATA
  // (fp_cohorts.resource_person_id = you), not a grant. The name exists so the
  // registry reads as what it means, and so this gate can be moved to its own
  // key later without hunting for the string.
  //
  // It is NOT `facilitator` (foundation.students.view) on purpose. The one role
  // that actually runs sessions today, school_faculty, does not hold that key —
  // gating these steps on it would hide them from the only person who needs them.
  session_leader: "foundation.practice.take",
  // OneMark (the TN Class-12 one-mark MCQ product, specs/onemark-decisions-
  // 2026-09-02.md) — two Senior Learner jobs on two EXISTING keys, no new
  // permission keys by ruling. Composed by the registry under these keys, NOT
  // under `coordinator` or `facilitator`: the one role that does both jobs
  // (school_faculty) holds neither foundation.cohorts.manage nor, before Wave
  // 1, foundation.students.view — stamping either lane key would hide these
  // steps from exactly the person they are written for.
  //
  // Builds a board-shape one-mark paper (/foundation/onemark/paper).
  paper_builder: "foundation.assessments.manage",
  // Ticks drafted items into the live bank (/foundation/onemark/review) —
  // one subject Senior Learner's approval is the whole sign-off (decision 7).
  item_approver: "foundation.items.manage",
} as const;

/**
 * ONEMARK — BUILDING A PAPER. Kept OUT of `GUIDES.lanes` for the same reason
 * `SESSION_LEADER_SECTIONS` is: `withRequires()` stamps one key across every
 * section it is given, so these carry their own gate only if the registry
 * composes them separately (under `REQUIRES.paper_builder`).
 */
export const ONEMARK_PAPER_SECTIONS: GuideSection[] = [
  {
    id: "onemark-paper",
    title: "Build a one-mark paper (OneMark)",
    steps: [
      {
        action:
          "Open **OneMark: Build a Paper**, start a new paper (subject and title), then under **Scope** pick the chapters to draw from.",
        detail:
          "Only approved questions count. A chapter that shows fewer questions than you expected is not broken — drafts nobody has ticked yet do not appear.",
        prerequisite:
          "This screen opens only for someone who builds assessments for the programme. If it says you do not have access, that is the honest answer — ask whoever runs the programme to grant it.",
        platforms: {
          web: "left sidebar → Foundation Programme → OneMark: Build a Paper",
          mobile: "tap the menu (☰) → Foundation Programme → OneMark: Build a Paper",
        },
        link: { label: "Open OneMark: Build a Paper", href: "/foundation/onemark/paper" },
      },
      {
        action:
          "Under **Quantity**, set the question count, the **JABT level mix** (K1–K6) and the **series variants** (A–D) you want.",
        detail:
          "There is no Easy / Medium / Hard here. The mix is by JABT level, and it starts proportional to what the bank holds for those units. English keeps the board shape by default — Q1–3 synonyms, Q4–6 antonyms, the rest from the pool — and the **Board shape** switch turns that off for a practice sheet.",
        tip: "Fifteen questions is the board standard. Each extra series is the same questions in a different order with the options re-lettered, so a hall can sit A to D side by side.",
        link: { label: "Open OneMark: Build a Paper", href: "/foundation/onemark/paper" },
      },
      {
        action:
          "Tap **Preview the paper**, **Lock** the questions you want kept, and **Swap** the rest.",
        detail:
          "If a chapter has fewer questions than you asked for, the page shows the real number and lets you take fewer or widen the chapters — it never fills the gap from elsewhere. A locked question stays even when you change a filter; the card says it is locked but no longer matches, and it is kept on the paper. Any wording you edit changes this paper only, never the bank.",
        link: { label: "Open OneMark: Build a Paper", href: "/foundation/onemark/paper" },
      },
      {
        action:
          "Tap **Confirm & finalise**, then either open the **Question paper** PDF (and its **Answer key**) for each series, or **Publish to cohort** with an open window and a duration.",
        detail:
          "The PDF prints each question in Tamil then English, with a separate answer key per series. A published paper appears under **Assigned papers** on the OneMark screen of every learner in that cohort — one sitting each, enforced on the server. A learner who missed the hall sitting can take it on a device later under the same score list, flagged as taken digitally; a learner who sat it already sees their result, not a retake. Publishing freezes the paper.",
        link: { label: "Open OneMark: Build a Paper", href: "/foundation/onemark/paper" },
      },
    ],
  },
];

/**
 * ONEMARK — APPROVING DRAFTED QUESTIONS. Composed separately under
 * `REQUIRES.item_approver` (see ONEMARK_PAPER_SECTIONS for why).
 */
export const ONEMARK_REVIEW_SECTIONS: GuideSection[] = [
  {
    id: "onemark-review",
    title: "Approve drafted one-mark questions (OneMark)",
    steps: [
      {
        action:
          "Open **OneMark: Review Drafts** and pick the subject tab.",
        detail:
          "Drafts arrive from two places — past board papers read in by the ingestion script, and AI drafting that a Senior Learner queues. Nothing on this screen is visible to a learner yet.",
        prerequisite:
          "Only a subject Senior Learner who manages the question bank can open this. If the page says so, nobody has granted you that yet.",
        platforms: {
          web: "left sidebar → Foundation Programme → OneMark: Review Drafts",
          mobile: "tap the menu (☰) → Foundation Programme → OneMark: Review Drafts",
        },
        link: { label: "Open OneMark: Review Drafts", href: "/foundation/onemark/review" },
      },
      {
        action:
          "Read each draft against the paper it came from and fix what the extraction got wrong — both stems, the correct option, the unit, the tags, the **JABT level** (K1–K6) and how the options sit on paper.",
        detail:
          "**No JABT level** and **Untagged** are the two flags on a card to clear, and the unit picker must not be left on **Not anchored to a unit**, before you approve. The Tamil block prints before the English block on every paper, so a missing Tamil stem is a real gap, not a nicety.",
        link: { label: "Open OneMark: Review Drafts", href: "/foundation/onemark/review" },
      },
      {
        action:
          "Tap **Approve**. Your tick is the whole sign-off — the question goes live under your name.",
        detail:
          "There is no second reviewer and no batch gate. The explanation you leave is shown to a learner right after they answer in practice, so write it for the learner, not for a colleague.",
        tip: "Learners are enrolled only once both subjects hold 300 approved questions. The number beside **Drafts waiting for a tick** is how many are still unapproved — not the approved count — so it should fall, not climb toward 300.",
        link: { label: "Open OneMark: Review Drafts", href: "/foundation/onemark/review" },
      },
    ],
  },
];

/**
 * RUNNING A SESSION FOR A GROUP — kept OUT of `GUIDES.lanes` on purpose.
 *
 * These steps belong in the facilitator lane, but they cannot be gated the way
 * the rest of that lane is. `withRequires()` in the registry stamps ONE key
 * across every section it is given, so a section cannot carry its own key from
 * here — the registry composes these separately, under `REQUIRES.session_leader`.
 *
 * Why that matters concretely: the whole existing Foundation facilitator lane is
 * gated on `foundation.students.view`, and the one role that actually runs
 * sessions (school_faculty) does not hold it. Folding these steps in with the
 * rest would have hidden them from precisely the person they are written for.
 */
export const SESSION_LEADER_SECTIONS: GuideSection[] = [
  {
    id: "run-a-session",
    title: "Run a practice session for a group",
    steps: [
      {
        action:
          "Open **Run a Practice Session** and pick one of your groups.",
        detail:
          "You see only the groups you are named as running — not every group in the programme. If a subject shows no questions yet, a session cannot be started for it, and the page says so rather than hiding the group.",
        prerequisite:
          "If it says you are not running any groups yet, that is the honest answer, not a fault: nobody has named you on one. Ask whoever sets up the programme to add you as the person running it.",
        platforms: {
          web: "left sidebar → Run a Practice Session",
          mobile: "tap the menu (☰) → Run a Practice Session",
        },
        link: {
          label: "Open Run a Practice Session",
          href: "/foundation/practice/facilitate",
        },
      },
      {
        action:
          "Choose a learner, then work through the questions together, one at a time.",
        detail:
          "Their name stays on screen for the whole run. Answers are recorded under that learner, never under you — which is what lets a child with no login of their own still build up a real record of what they know.",
        prerequisite:
          "Check the name on screen before you start answering. A run filed under the wrong learner looks completely normal afterwards, so the moment to catch it is now.",
        link: {
          label: "Open Run a Practice Session",
          href: "/foundation/practice/facilitate",
        },
      },
      {
        action:
          "Read the explanations at the end together — that is the part worth the time.",
        detail:
          "The review names the learner, shows what each answer was and why. Anything left blank is not counted right or wrong either way; the answer is still shown so you can talk it through.",
        tip: "Each completed run feeds that learner's weakness map, so their revision plan sharpens with every session.",
      },
    ],
  },
];

/**
 * Foundation fills three of the nine canonical lanes. `GuideBook.lanes` is a
 * CLOSED record (every canonical persona), which the registry satisfies at
 * compose time by re-keying these lanes and filling the rest from the platform
 * overview — so this constant is typed on the lanes it actually ships. Same
 * shape the registry indexes (`FOUNDATION_GUIDES.lanes.<learner|coordinator|
 * facilitator>`), so a lane rename here is still a compile error there.
 */
type FoundationGuideBook = Pick<GuideBook, "glossary" | "plannedLocaleNote"> & {
  lanes: Pick<GuideBook["lanes"], "learner" | "coordinator" | "facilitator">;
};

export const GUIDES: FoundationGuideBook = {
  lanes: {
    /* ── LEARNER (the person answering the questions) ───────────────────── */
    learner: {
      persona: "learner",
      title: "Practice Guide",
      tagline:
        "You pick a subject, answer a short set of questions one at a time, and read why each answer was what it was.",
      whyItMatters:
        "Nothing here is a mark against you. Practice is untimed; only a OneMark Timed sitting runs a clock, and a Live paper is one go. Getting one wrong is the useful part — the explanation afterwards is what you came for, and answering regularly is what tells your resource person where to help you.",
      startHere: { label: "Open Practice", href: "/foundation/practice" },
      requires: REQUIRES.learner,
      journey: ["Pick a subject", "Answer the questions", "Read what each answer was"],
      sections: [
        {
          id: "pick",
          title: "Pick a subject",
          steps: [
            {
              action:
                "Open **Practice** and choose a subject from the list. Each one shows how many questions are ready.",
              detail:
                "Only subjects that have questions ready appear. If the list is empty, the questions are still being prepared — nothing is broken.",
              prerequisite:
                "Someone at your school has to enrol you on the programme first. Until then the page says so rather than showing subjects.",
              platforms: {
                web: "left sidebar → Foundation Practice",
                mobile: "tap the menu (☰) → Foundation Practice",
              },
              link: { label: "Open Practice", href: "/foundation/practice" },
            },
          ],
        },
        {
          id: "answer",
          title: "Answer, then read the explanations",
          steps: [
            {
              action:
                "Tap the answer you think is right, then **Next**. You can go back with **Previous** and change it before you finish.",
              detail:
                "One question at a time, nothing timed. If you are unsure, move on — anything you leave is recorded as not attempted rather than wrong.",
            },
            {
              action:
                "On the last question tap **Finish and see how it went**, then read down the review.",
              detail:
                "The count at the top is the small part. Below it, every question shows what you chose, what the answer was, and why — that is the part worth reading.",
            },
            {
              action:
                "If a question looks wrong to you, use **Report a problem** on it.",
              detail:
                "Your report goes to whoever reviews the question bank. A question only stops counting toward mastery once enough different people have reported the same one.",
            },
          ],
        },
        {
          id: "onemark-practice",
          title: "OneMark — one-mark questions for Class 12",
          steps: [
            {
              action:
                "Open **OneMark Practice** and pick your subject. There are four ways to sit: **Practice**, **Timed**, an **Assigned paper** and the **Mistake Vault**.",
              detail:
                "Practice is untimed and shows the explanation as you go. A Timed paper submits itself when the clock runs out. An Assigned paper (it opens as a Live paper) is one your Senior Learner published — you get one go. The Mistake Vault brings back what you got wrong, when it is due.",
              prerequisite:
                "You have to be on the Foundation programme first. If the page says you are not on it yet, or that no subject is ready yet, nothing is broken — the questions are still being approved.",
              platforms: {
                web: "left sidebar → OneMark Practice",
                mobile: "tap the menu (☰) → OneMark Practice",
              },
              link: { label: "Open OneMark Practice", href: "/foundation/onemark/practice" },
            },
            {
              action:
                "Answer, or **Skip**, then **Next**. On the last question tap **Finish and see how it went** — in a Timed or Live paper that last button is **Submit paper**.",
              detail:
                "Skipping is never a mistake — a skipped question does not go into your vault and does not count against you. A wrong answer does go into the vault. In a Timed sitting, anything left when the clock ends counts as skipped, not wrong.",
              link: { label: "Open OneMark Practice", href: "/foundation/onemark/practice" },
            },
            {
              action:
                "Clear your **Mistake Vault**: a question you got wrong comes back when it is due — get it right in two separate sittings, at least two days apart, and it is mastered.",
              detail:
                "Getting it right twice in the same sitting counts once. A mastered question leaves the vault, but if you get it wrong again months later it comes back and the streak starts over. A vault review never lets one unit crowd the session, so a short review is normal.",
              tip: "The panel shows **next due** for each subject and offers **Review … due now** only when something is — before then there is nothing to do.",
            },
            {
              action:
                "For a **Live paper**, submit once. Opening it again shows your result, not a fresh paper.",
              detail:
                "The window and the time limit come from your Senior Learner. Wrong answers from a live paper still feed your vault, so the review afterwards is worth the time.",
            },
          ],
        },
      ],
    },

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
    { term: "OneMark", def: "The Tamil Nadu State Board Class-12 one-mark MCQ product — Physics and English, bilingual, run inside the Foundation programme." },
    { term: "JABT level", def: "The K1–K6 thinking level a one-mark question asks for (JKKN Advanced Bloom's Taxonomy). OneMark mixes papers by level, not by Easy / Medium / Hard." },
    { term: "Series", def: "One of up to four printed versions (A–D) of the same paper — same questions, different order, options re-lettered — each with its own answer key." },
    { term: "Mistake Vault", def: "A learner's own list of one-mark questions they got wrong. A question is mastered after two correct answers in separate sittings at least two days apart; a later wrong answer puts it back." },
  ],

  plannedLocaleNote: "A Tamil version is planned — English only for now.",
};

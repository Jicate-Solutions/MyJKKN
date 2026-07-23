/**
 * OKR Smart Guide — authored content (the actual product).
 *
 * OKR = Objectives & Key Results: a STAFF / EMPLOYEE goal-management tool.
 * People set objectives, define key results, submit weekly check-ins, view the
 * org → department → team cascade, rate the ABCD process matrix, and track their
 * compliance.
 *
 * THREE staff persona lanes in plain 12th-grade language, authored from the
 * module's REAL routes. Every step that happens on a page carries a "Take me
 * there" deep-link.
 *
 * CRITICAL INVARIANT: OKR is a staff tool gated by `okr.view`. There is NO open
 * `learner` lane — EVERY lane below is gated by a real `okr.*` permission key,
 * so OKR content can never leak into a student's getting-started guide.
 *
 * Permission gating uses the shared REQUIRES keys below (the same key a
 * detect-lane adapter would check, so a rename is a compile error, not a silent
 * fail-open lane).
 */
import type { GuideBook } from "./types";

/** Permission keys that gate each staff lane. ONE source of truth — content.ts
 *  sets `requires`, the host's detect-lane checks the same key. Every value is a
 *  real key from the `okr` block in lib/constants/permissions.ts. */
export const REQUIRES = {
  // An individual staff member who submits weekly check-ins. Gated on the
  // check-in permission — the action that defines a contributor.
  contributor: "okr.checkin.view",
  // A department / team lead who sees the department roll-up and creates
  // Tier-2 / Tier-3 objectives for their unit.
  manager: "okr.department.view",
  // An org-level admin who runs the compliance dashboard and analytics.
  admin: "okr.admin.view",
} as const;

export const GUIDES: GuideBook = {
  lanes: {
    /* ── CONTRIBUTOR (individual staff member) ─────────────────────────── */
    contributor: {
      persona: "contributor",
      title: "Contributor Guide",
      tagline:
        "Set your goals, then keep them moving with a quick check-in each week.",
      whyItMatters:
        "Your weekly check-in is what keeps your objectives alive and shows your manager you're on track — a goal with no check-ins looks stalled, even when you're working hard.",
      startHere: { label: "Open My OKRs", href: "/okr/objectives" },
      requires: REQUIRES.contributor,
      journey: [
        "Set your objectives",
        "Add key results",
        "Check in every week",
        "Rate the ABCD matrix",
        "Watch your compliance",
      ],
      sections: [
        {
          id: "set-objectives",
          title: "Step 1 — Set your objectives",
          steps: [
            {
              id: "open-my-okrs",
              action: "Open **My OKRs** to see every objective that belongs to you.",
              detail:
                "This is your home base. Objectives you own live here, along with the key results under each one.",
              platforms: {
                web: "left sidebar → OKR → My OKRs",
                mobile: "tap More (⋯) in the bottom bar → OKR → My OKRs",
              },
              link: { label: "Open My OKRs", href: "/okr/objectives" },
            },
            {
              id: "create-objective",
              action: "Press **New Objective** and write one clear goal.",
              detail:
                "An objective is a short, ambitious sentence about what you want to achieve this cycle — not a task. Keep it to one idea.",
              tip: "Aim for 3–5 objectives, no more. A long list is a sign the goals aren't sharp yet.",
              link: { label: "Create an objective", href: "/okr/objectives/new" },
            },
          ],
        },
        {
          id: "key-results",
          title: "Step 2 — Add key results",
          steps: [
            {
              id: "add-key-results",
              action:
                "Open the objective and add **2–4 key results** that prove it's done.",
              detail:
                "A key result is a measurable outcome with a number — for example 'raise pass rate from 70% to 85%'. If you can't measure it, it isn't a key result yet.",
              prerequisite:
                "You need an objective first. Create the objective (Step 1), then open it to add key results underneath.",
              tip: "Each key result should have a clear target so the system can show progress as a percentage.",
              link: { label: "Open My OKRs", href: "/okr/objectives" },
            },
          ],
        },
        {
          id: "weekly-check-in",
          title: "Step 3 — Check in every week",
          steps: [
            {
              id: "open-check-in",
              action: "Open **Check-In** once a week and update each key result.",
              detail:
                "Move the number, set a confidence colour (on track, at risk, behind), and add one line on what changed. This is the heartbeat of OKR — do it the same day each week.",
              platforms: {
                web: "left sidebar → OKR → My OKRs → Check-In",
                mobile: "tap More (⋯) in the bottom bar → OKR → Check-In",
              },
              tip: "A missed week shows up as a gap in your compliance — a 2-minute check-in keeps you green.",
              link: { label: "Submit a check-in", href: "/okr/check-in" },
            },
          ],
        },
        {
          id: "abcd-matrix",
          title: "Step 4 — Rate the ABCD process matrix",
          steps: [
            {
              id: "open-abcd",
              action: "Open the **ABCD** page and give your honest process rating.",
              detail:
                "ABCD rates HOW you worked this cycle (your process), separate from WHAT you delivered (your key results). Pick the band that matches and add a short note.",
              link: { label: "Open ABCD matrix", href: "/okr/abcd" },
            },
          ],
        },
        {
          id: "see-the-bigger-picture",
          title: "Step 5 — See where you fit",
          steps: [
            {
              id: "view-team",
              action: "Open **Team** to see your team's objectives next to yours.",
              detail:
                "This shows how your goals support the people around you, so you're pulling in the same direction.",
              link: { label: "Open Team OKRs", href: "/okr/team" },
            },
            {
              id: "view-cascade",
              action:
                "Open **Cascade** to trace your objective all the way up to the organization's goals.",
              detail:
                "The cascade is a tree: organization → department → team → you. Seeing the chain tells you why your goal matters.",
              link: { label: "Open the Cascade", href: "/okr/cascade" },
            },
            {
              id: "view-compliance",
              action: "Check your **compliance** status on the OKR dashboard.",
              detail:
                "This tells you, at a glance, whether your objectives, key results, and weekly check-ins are all up to date — and what's missing if not.",
              tip: "Green means everything is current. Anything amber or red points to a check-in or key result you still owe.",
              link: { label: "Open OKR dashboard", href: "/okr" },
            },
          ],
        },
      ],
    },

    /* ── MANAGER (department / team lead) ──────────────────────────────── */
    manager: {
      persona: "manager",
      title: "Manager Guide",
      tagline:
        "Set goals for your unit, keep your team's check-ins flowing, and watch the roll-up.",
      whyItMatters:
        "Your department view is your early-warning system — a column of missed check-ins is where you step in before a goal quietly slips.",
      startHere: { label: "Open Department OKRs", href: "/okr/department" },
      requires: REQUIRES.manager,
      journey: [
        "Read the department roll-up",
        "Create unit objectives",
        "Assign and align",
        "Keep check-ins flowing",
        "Watch the cascade",
      ],
      sections: [
        {
          id: "department-view",
          title: "Step 1 — Read your department roll-up",
          steps: [
            {
              id: "open-department",
              action:
                "Open **Department** to see every objective and check-in across your unit.",
              detail:
                "This is the one screen that tells you how your whole department is doing this cycle — who's on track and who's gone quiet.",
              platforms: {
                web: "left sidebar → OKR → Department",
                mobile: "tap More (⋯) in the bottom bar → OKR → Department",
              },
              link: { label: "Open Department OKRs", href: "/okr/department" },
            },
            {
              id: "open-team-rollup",
              action: "Drop into **Team** to focus on one team's objectives.",
              detail:
                "Use this when you want the detail for a single team rather than the whole department.",
              link: { label: "Open Team OKRs", href: "/okr/team" },
            },
          ],
        },
        {
          id: "create-unit-objectives",
          title: "Step 2 — Create objectives for your unit",
          steps: [
            {
              id: "create-tier2",
              action:
                "Create a **Tier-2 (Institution) objective** when you're setting a goal for your institution-level unit.",
              detail:
                "Tier-2 objectives sit below the organization's strategic goals and feed into them. Write the goal, then add measurable key results.",
              prerequisite:
                "Creating Tier-2 objectives needs the Tier-2 create permission. If the button is missing, ask your platform admin to grant it.",
              link: {
                label: "Create a Tier-2 objective",
                href: "/okr/objectives/create/tier2",
              },
            },
            {
              id: "create-via-create-hub",
              action:
                "Use the **Create** hub if you're not sure which tier you need.",
              detail:
                "The create hub walks you to the right level — organization, Tier-1, or Tier-2 — so you don't have to guess.",
              link: { label: "Open the Create hub", href: "/okr/objectives/create" },
            },
          ],
        },
        {
          id: "assign-and-align",
          title: "Step 3 — Assign and align",
          steps: [
            {
              id: "open-manage",
              action:
                "Open **Manage** to assign objectives to people on your team.",
              detail:
                "From here you hand an objective to the right owner so everyone knows who carries what.",
              link: { label: "Open Manage", href: "/okr/manage" },
            },
            {
              id: "check-cascade-alignment",
              action:
                "Open **Cascade** to confirm your unit's goals line up under the organization's.",
              detail:
                "The cascade tree shows whether your objectives connect upward. A goal floating with no parent is a sign it needs aligning.",
              link: { label: "Open the Cascade", href: "/okr/cascade" },
            },
          ],
        },
        {
          id: "keep-rhythm",
          title: "Step 4 — Keep the weekly rhythm",
          steps: [
            {
              id: "encourage-check-ins",
              action:
                "Make sure every team member submits a **Check-In** each week.",
              detail:
                "Check-ins are how progress becomes visible. The Department view shows you who's checked in and who hasn't.",
              link: { label: "Open Check-In", href: "/okr/check-in" },
            },
            {
              id: "review-analytics",
              action:
                "Open **Analytics** to see progress trends across your unit.",
              detail:
                "Charts here turn the raw check-ins into a trend line, so you can see momentum building or stalling over the cycle.",
              link: { label: "Open OKR Analytics", href: "/okr/analytics" },
            },
          ],
        },
      ],
    },

    /* ── ADMIN (org-level) ─────────────────────────────────────────────── */
    admin: {
      persona: "admin",
      title: "Admin Guide",
      tagline:
        "Set the organization's top-level goals and keep the whole program compliant.",
      whyItMatters:
        "Your organization objectives are the root of the cascade — every department and team goal hangs off them, so getting these right sets the direction for everyone.",
      startHere: { label: "Open the Compliance dashboard", href: "/okr/admin/compliance" },
      requires: REQUIRES.admin,
      journey: [
        "Set organization goals",
        "Open the cascade to everyone",
        "Watch compliance",
        "Read the analytics",
      ],
      sections: [
        {
          id: "set-top-goals",
          title: "Step 1 — Set the organization's goals",
          steps: [
            {
              id: "create-org-objective",
              action:
                "Create an **Organization-level objective** — the top of the cascade.",
              detail:
                "These are the strategic goals the whole institution rallies behind. Everything below cascades from here, so keep them few and clear.",
              prerequisite:
                "Creating organization objectives needs the organization create permission. If the option is hidden, ask your platform admin to grant it.",
              link: {
                label: "Create an organization objective",
                href: "/okr/objectives/create/organization",
              },
            },
            {
              id: "create-tier1",
              action:
                "Create a **Tier-1 (Strategic) objective** for a major strategic theme.",
              detail:
                "Tier-1 sits just under the organization level. Use it to break a big strategic goal into the themes departments will pick up.",
              link: {
                label: "Create a Tier-1 objective",
                href: "/okr/objectives/create/tier1",
              },
            },
            {
              id: "review-org-okrs",
              action: "Open **Organization** to review every org-level OKR in one place.",
              detail:
                "This is the master view of the institution's objectives and how far along each one is.",
              link: { label: "Open Organization OKRs", href: "/okr/organization" },
            },
          ],
        },
        {
          id: "open-the-cascade",
          title: "Step 2 — Make sure the cascade connects",
          steps: [
            {
              id: "review-cascade",
              action:
                "Open **Cascade** and confirm every department and team goal hangs off an organization objective.",
              detail:
                "The cascade tree shows the whole chain. Any goal with no parent is orphaned — chase it down so the structure holds together.",
              platforms: {
                web: "left sidebar → OKR → Cascade",
                mobile: "tap More (⋯) in the bottom bar → OKR → Cascade",
              },
              link: { label: "Open the Cascade", href: "/okr/cascade" },
            },
          ],
        },
        {
          id: "run-compliance",
          title: "Step 3 — Keep the program compliant",
          steps: [
            {
              id: "open-compliance",
              action:
                "Open the **Compliance** dashboard to see who is up to date and who is behind.",
              detail:
                "One screen shows every user's status — objectives set, key results defined, weekly check-ins submitted — across the whole institution. Red rows are where to follow up.",
              platforms: {
                web: "left sidebar → OKR → Compliance",
                mobile: "tap More (⋯) in the bottom bar → OKR → Compliance",
              },
              link: { label: "Open Compliance", href: "/okr/admin/compliance" },
            },
            {
              id: "open-admin-home",
              action: "Use the **Admin** home for the rest of the admin tools.",
              detail:
                "The admin landing page gathers the program-level controls in one place.",
              link: { label: "Open OKR Admin", href: "/okr/admin" },
            },
          ],
        },
        {
          id: "read-the-numbers",
          title: "Step 4 — Read the institution-wide numbers",
          steps: [
            {
              id: "open-analytics",
              action:
                "Open **Analytics** for trends across departments and the whole institution.",
              detail:
                "Use this to spot which areas are moving and which are stuck, and to brief leadership with real figures rather than guesses.",
              link: { label: "Open OKR Analytics", href: "/okr/analytics" },
            },
          ],
        },
      ],
    },
  },

  glossary: [
    {
      term: "OKR",
      def: "Objectives & Key Results — a simple way to set a goal (the objective) and the measurable outcomes that prove it's done (the key results).",
    },
    {
      term: "Objective",
      def: "One clear, ambitious goal for the cycle — a short sentence about what you want to achieve, not a task list.",
    },
    {
      term: "Key result",
      def: "A measurable outcome with a number and a target that shows whether the objective is being met, e.g. 'raise pass rate from 70% to 85%'.",
    },
    {
      term: "Check-in",
      def: "A quick weekly update where you move each key result's number, set a confidence colour, and note what changed. The heartbeat of OKR.",
    },
    {
      term: "Cascade",
      def: "The tree that links goals top to bottom: organization → department → team → individual, so every objective connects to a bigger one.",
    },
    {
      term: "Tier",
      def: "The level an objective sits at. Tier-1 is strategic/organization-wide, Tier-2 is institution, Tier-3 is department — higher tiers cascade down to lower ones.",
    },
    {
      term: "ABCD matrix",
      def: "A rating of HOW you worked this cycle (your process), kept separate from WHAT you delivered (your key results).",
    },
    {
      term: "Elective OKR",
      def: "An optional extra objective you take on beyond your core goals, to stretch yourself or support a side initiative.",
    },
    {
      term: "Compliance",
      def: "Whether your objectives, key results, and weekly check-ins are all current. Green means up to date; amber or red means something is missing.",
    },
    {
      term: "Confidence",
      def: "Your honest read on a key result during a check-in — on track, at risk, or behind — so trouble shows up early.",
    },
    {
      term: "Department view",
      def: "The roll-up screen a manager uses to see every objective and check-in across their unit at once.",
    },
  ],

  plannedLocaleNote: "A Tamil version is planned — English only for now.",
};

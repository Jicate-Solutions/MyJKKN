/**
 * Startup Studio Smart Guide — authored content (the actual product).
 *
 * Five persona lanes in plain 12th-grade language, authored from the module's
 * REAL routes under app/(routes)/startup-studio/*. Every step that happens on a
 * page carries a "Take me there" deep-link. Event-scoped links use the literal
 * `:scopeId` token (resolved to the current eventId at render time).
 *
 * Permission gating uses the shared REQUIRES keys below — real keys from
 * lib/constants/permissions.ts (the "Startup Studio" catalog block). The
 * founder lane is open (no key): registration is gated to the `student` role
 * at the page, not by a permission key.
 */
import type { GuideBook } from "./types";

/** Permission keys that gate each staff lane. ONE source of truth — content.ts
 *  sets `requires`, the lane detector checks the same key. All keys below are
 *  real entries in lib/constants/permissions.ts → "Startup Studio". */
export const REQUIRES = {
  // Mentors — view-side mentor key (mentor review of SF100 check-ins also needs
  // startup_studio.sf100.check_in.view; this lane key is the mentor-facing one).
  mentor: "startup_studio.mentors.view",
  // Event evaluators / judges — Manage Demo Day Evaluations.
  evaluator: "startup_studio.evaluations.manage",
  // Incubation coordinators — run the NIF pipeline (and SF100 programs).
  coordinator: "startup_studio.nif.view",
  // Studio admins — create and run events end to end.
  admin: "startup_studio.events.manage",
} as const;

export const GUIDES: GuideBook = {
  lanes: {
    /* ── FOUNDER / STUDENT (open lane — every student entrepreneur) ─────── */
    founder: {
      persona: "founder",
      title: "Founder Guide",
      tagline:
        "Enter an event, build your project with your team, and submit it — here's how.",
      whyItMatters:
        "This is where your idea becomes a real, judged project. Registering and submitting on time is the only way your team gets counted, scored, and seen.",
      startHere: { label: "Browse Events", href: "/startup-studio/events" },
      journey: [
        "Find an event",
        "Register your team",
        "Build with your team",
        "Submit your project",
        "Join Demo Day",
      ],
      sections: [
        {
          id: "join-event",
          title: "Find an event and register",
          steps: [
            {
              action: "Open **Events** and pick the event that is open for registration.",
              detail:
                "Events show their status — look for one marked open before its registration deadline.",
              prerequisite:
                "Only **student** accounts can register a team. If the page says registration is not available for your account, you are signed in with a staff role — sign in as a student.",
              platforms: {
                web: "left sidebar → Startup Studio → Events",
                mobile: "tap More (⋯) in the bottom bar → Startup Studio → Events",
              },
              link: { label: "Browse Events", href: "/startup-studio/events" },
            },
            {
              action: "Open the event and press **Register** to create or join a team.",
              detail:
                "Fill in your team name and the problem idea you want to work on. Registration closes at the deadline, so do this early.",
              link: { label: "Register for an event", href: "/startup-studio/events/:scopeId/register" },
            },
            {
              action: "Invite your teammates from **My Team** and accept any invites sent to you.",
              detail:
                "Search for classmates, add them, and confirm everyone has a laptop. Pending invites also show on the Events page.",
              tip: "Each member can pick a role card (Problem Finder, Prompt Architect, and more) so it is clear who did what.",
              link: { label: "Open My Team", href: "/startup-studio/events/:scopeId/my-team" },
            },
          ],
        },
        {
          id: "build-submit",
          title: "Build and submit your project",
          steps: [
            {
              action: "Build your app with your team, then open **Submit Project** to send it in.",
              detail:
                "Add your app name, the problem you solve, your solution, and links — live app, Lovable, GitHub, and a demo video.",
              tip: "Your work saves as a draft as you go, so you will not lose it if you step away.",
              link: { label: "Submit your project", href: "/startup-studio/events/:scopeId/submit" },
            },
            {
              action: "On Demo Day, present your project and watch the **Leaderboard**.",
              detail:
                "Judges score teams during Demo Day and live voting may be open — your standing updates as results come in.",
              link: { label: "Open Demo Day", href: "/startup-studio/events/:scopeId/demo-day" },
            },
          ],
        },
        {
          id: "solve-for-100",
          title: "Go further with Solve for 100",
          steps: [
            {
              action: "Open **Solve for 100** to join the 210-day program and chase 100 paying users.",
              detail:
                "If your team is enrolled you land on your Team Dashboard; if not, you will see how to apply. The top teams graduate to the Nattraja Incubation Forum (NIF).",
              link: { label: "Open Solve for 100", href: "/startup-studio/solve-for-100" },
            },
            {
              action: "Log your weekly progress on the **Team Dashboard** — check-ins, paid users, interviews, and pivots.",
              detail:
                "This is your team's home for the program. Keep it current so your mentor and the leaderboard reflect real progress.",
              link: { label: "Open Team Dashboard", href: "/startup-studio/solve-for-100/dashboard" },
            },
          ],
        },
      ],
    },

    /* ── MENTOR (faculty) ──────────────────────────────────────────────── */
    mentor: {
      persona: "mentor",
      title: "Mentor Guide",
      tagline: "You guide assigned teams and review their weekly progress.",
      whyItMatters:
        "Your feedback is what keeps teams honest and moving — you catch a stalling team a week before it would have given up.",
      startHere: { label: "Open Mentor Dashboard", href: "/startup-studio/solve-for-100/mentor" },
      requires: REQUIRES.mentor,
      journey: ["See your teams", "Review check-ins", "Flag who needs help"],
      sections: [
        {
          id: "review",
          title: "Review your teams",
          steps: [
            {
              action: "Open the **Mentor Dashboard** to see the teams assigned to you.",
              detail:
                "Teams that need attention are pushed to the top so you spend your time where it counts.",
              platforms: {
                web: "left sidebar → Startup Studio → Solve for 100 → My Mentees",
                mobile: "tap More (⋯) → Startup Studio → Solve for 100 → My Mentees",
              },
              link: { label: "Open Mentor Dashboard", href: "/startup-studio/solve-for-100/mentor" },
            },
            {
              action: "Open a team and **read its latest check-ins and paid-user numbers**.",
              detail:
                "Look at progress against the program phases — from first users through to 100 paying users.",
              tip: "Opening a team's weekly check-in detail may need a separate Solve for 100 check-in permission. If a team's check-ins won't open, ask your studio admin to grant it.",
            },
            {
              action: "Leave feedback and **flag any team that is stuck** so it gets help early.",
              tip: "A flagged team is a signal for you and the coordinator to step in — not a penalty for the team.",
            },
          ],
        },
        {
          id: "mentor-network",
          title: "Find a fellow mentor",
          steps: [
            {
              action: "Browse the **Mentor Network** to see other mentors and their areas.",
              detail:
                "Use it to connect a team with the right expert when a problem sits outside your own field.",
              link: { label: "Open Mentor Network", href: "/startup-studio/mentors" },
            },
          ],
        },
      ],
    },

    /* ── EVALUATOR / JUDGE (event-assigned) ────────────────────────────── */
    evaluator: {
      persona: "evaluator",
      title: "Evaluator Guide",
      tagline: "On Demo Day you are assigned teams and you score their work.",
      whyItMatters:
        "Your scores decide the leaderboard. Fair, finished verification is what makes the result mean something.",
      startHere: { label: "Open My Assignment", href: "/startup-studio/events/:scopeId/my-assignment" },
      requires: REQUIRES.evaluator,
      journey: ["See your assignment", "Verify each team", "Finish your venue"],
      sections: [
        {
          id: "judge",
          title: "Score your assigned teams",
          steps: [
            {
              action: "Open **My Assignment** to see which venue and teams you judge.",
              detail:
                "An admin assigns staff as judges or panel chairs to each venue before Demo Day. Your assignment lists exactly who you cover.",
              prerequisite:
                "You must be **assigned to the event** before you can score. If you see nothing, ask the studio admin to add you to a venue.",
              link: { label: "Open My Assignment", href: "/startup-studio/events/:scopeId/my-assignment" },
            },
            {
              action: "Open **Evaluate Teams** and work through your pending list.",
              detail:
                "Each team starts as pending; mark it verified or flagged as you review. A progress bar shows how many you have left.",
              link: { label: "Open Evaluate Teams", href: "/startup-studio/events/:scopeId/evaluate" },
            },
            {
              action: "Verify each team against the event's bar and **clear your pending list**.",
              tip: "Flag anything that looks off rather than guessing — a flag gets a second look from the admin.",
            },
          ],
        },
      ],
    },

    /* ── COORDINATOR (incubation / program manager) ────────────────────── */
    coordinator: {
      persona: "coordinator",
      title: "Incubation Coordinator Guide",
      tagline:
        "You run the Solve for 100 program and move the best teams into the incubation pipeline.",
      whyItMatters:
        "You are the bridge from a weekend project to a real, backed startup — your verification and pipeline calls decide who gets institutional support.",
      startHere: { label: "Open Program Admin", href: "/startup-studio/solve-for-100/admin" },
      requires: REQUIRES.coordinator,
      journey: [
        "Manage programs and teams",
        "Verify paid users",
        "Move teams into NIF",
        "Watch the portfolio",
      ],
      sections: [
        {
          id: "run-program",
          title: "Run the Solve for 100 program",
          steps: [
            {
              action: "Open **Program Admin** to manage programs, enrollments, and phase progress.",
              detail:
                "This is the control room for Solve for 100 — add or archive programs, enroll teams, and track each team's phase.",
              platforms: {
                web: "left sidebar → Startup Studio → Solve for 100 → Admin",
                mobile: "tap More (⋯) → Startup Studio → Solve for 100 → Admin",
              },
              link: { label: "Open Program Admin", href: "/startup-studio/solve-for-100/admin" },
            },
            {
              action: "Open a program's **Verification Queue** and approve or reject paid-user claims.",
              detail:
                "Teams submit proof that someone paid; you confirm it before it counts toward their 100. Open the program from the Programs list to reach its queue.",
              link: { label: "Open Programs", href: "/startup-studio/solve-for-100/programs" },
            },
          ],
        },
        {
          id: "pipeline",
          title: "Move teams into incubation",
          steps: [
            {
              action: "Open the **NIF Pipeline** to track teams heading into the Nattraja Incubation Forum.",
              detail:
                "Advance, reject, or manage candidates as they move through the incubation stages.",
              link: { label: "Open NIF Pipeline", href: "/startup-studio/nif" },
            },
            {
              action: "Watch incubated startups in **Portfolio Intelligence**.",
              detail:
                "Track each venture's readiness level (TRL), risk, and overall portfolio health in one view.",
              link: { label: "Open Portfolio", href: "/startup-studio/portfolio" },
            },
          ],
        },
      ],
    },

    /* ── ADMIN (studio admin) ──────────────────────────────────────────── */
    admin: {
      persona: "admin",
      title: "Admin Guide",
      tagline: "You create events, assign judges and venues, and publish results.",
      whyItMatters:
        "A well-run event is the difference between a smooth Demo Day and chaos — your setup is what every founder, mentor, and judge relies on.",
      startHere: { label: "Open Events", href: "/startup-studio/events" },
      requires: REQUIRES.admin,
      journey: [
        "Create the event",
        "Assign venues and judges",
        "Run Demo Day",
        "Publish results",
        "Track the whole studio",
      ],
      sections: [
        {
          id: "run-event",
          title: "Set up and run an event",
          steps: [
            {
              action: "Open **Events** and use **New Event** to create a hackathon, sprint, or Demo Day.",
              detail:
                "Set the name, registration deadline, and status. Founders register only while the event is open.",
              platforms: {
                web: "left sidebar → Startup Studio → Events",
                mobile: "tap More (⋯) → Startup Studio → Events",
              },
              link: { label: "Open Events", href: "/startup-studio/events" },
            },
            {
              action: "Inside the event, open **Venues & Mentors** and assign staff as judges and panel chairs.",
              detail:
                "Each judge then sees their teams under My Assignment. Set this up before Demo Day so nobody is left unassigned.",
              link: { label: "Open Venues", href: "/startup-studio/events/:scopeId/venues" },
            },
            {
              action: "Review submissions, then **publish the Leaderboard** when judging is done.",
              detail:
                "Open the event Dashboard to watch registrations and scores, and publish results when you are ready for everyone to see them.",
              tip: "Results stay hidden from founders until you publish — so you can finish judging first.",
              link: { label: "Open Event Dashboard", href: "/startup-studio/events/:scopeId/dashboard" },
            },
          ],
        },
        {
          id: "studio-wide",
          title: "Track the whole studio",
          steps: [
            {
              action: "Open the **Startup Studio dashboard** for a top-level view of cycles and metrics.",
              detail:
                "From here reach Cycles, KPI, Finance, Governance, Problem Bank, and the NIF pipeline.",
              link: { label: "Open Startup Studio", href: "/startup-studio" },
            },
            {
              action: "Check program health in **KPI** and grants in **Finance** as needed.",
              detail:
                "KPI rolls up performance across the studio; Finance tracks grants and budgets for incubated ventures.",
              link: { label: "Open KPI", href: "/startup-studio/kpi" },
            },
          ],
        },
      ],
    },
  },

  glossary: [
    { term: "Event", def: "A hackathon, sprint, or Demo Day that founders register a team for and submit a project to." },
    { term: "Demo Day", def: "The day teams present their projects and judges score them; live audience voting may also be open." },
    { term: "Submission", def: "Your project entry — app name, problem, solution, and links (live app, Lovable, GitHub, demo video)." },
    { term: "Role Card", def: "The job each teammate took on, e.g. Problem Finder, Prompt Architect, or Deal Closer." },
    { term: "Solve for 100", def: "A 210-day program where a team builds a real product and tries to reach 100 paying users." },
    { term: "Paid User", def: "A real customer who paid — counted toward a team's 100, after a coordinator verifies the proof." },
    { term: "NIF", def: "Nattraja Incubation Forum — the incubation pipeline that gives the best teams full institutional backing." },
    { term: "TRL", def: "Technology Readiness Level — how far a startup's product has matured, tracked in the portfolio." },
  ],

  plannedLocaleNote: "A Tamil version is planned — English only for now.",
};

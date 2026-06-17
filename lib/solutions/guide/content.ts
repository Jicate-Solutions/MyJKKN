/**
 * Solutions Hub Smart Guide — authored content (the actual product).
 *
 * Four working lanes in plain 12th-grade language, authored from the module's
 * REAL routes under app/(routes)/solutions. Every step that happens on a page
 * carries a "Take me there" deep-link. Permission gating uses the shared
 * REQUIRES keys below (imported by detect-lane.ts so a rename is a compile
 * error, not a silent fail-open lane).
 *
 * NOTE ON ROLES: the Solutions Hub permission catalogue
 * (lib/constants/permissions.ts, key 'solutions') is entirely `.view`-scoped —
 * "write actions are guarded at the service layer," so there is no role-named
 * or write-scoped permission key to gate on. Each lane below is therefore
 * gated by the `.view` key for the area that lane mainly works in. These are
 * the closest REAL keys, not a perfect role match — see the guide's report and
 * confirm the lane→key mapping with the module owner before launch.
 */
import type { GuideBook } from "./types";

/** Permission keys that gate each lane. ONE source of truth — content.ts sets
 *  `requires`, detect-lane.ts checks the same key. Every value below is a real
 *  key from lib/constants/permissions.ts (group key 'solutions'). They are
 *  `.view` keys (the module has no role-specific keys), chosen as the closest
 *  match for each lane's main work area. */
export const REQUIRES = {
  delivery_team: "solutions.dashboard.view",
  sales_lead: "solutions.pipeline.view",
  finance_officer: "solutions.payments.view",
  module_admin: "solutions.settings.view",
} as const;

export const GUIDES: GuideBook = {
  lanes: {
    /* ── DELIVERY TEAM ─────────────────────────────────────────────────── */
    delivery_team: {
      persona: "delivery_team",
      title: "Delivery Team Guide",
      tagline:
        "You run the actual work — software, training, and content — and keep every solution moving.",
      whyItMatters:
        "Every solution you log here is what the Hub counts as active work and revenue. If it's not recorded, it doesn't show up in the dashboard, the reports, or anyone's earnings.",
      startHere: { label: "Open the Dashboard", href: "/solutions" },
      requires: REQUIRES.delivery_team,
      journey: [
        "See the dashboard",
        "Add a new solution",
        "Pick the right builders",
        "Run training, content, and software",
      ],
      sections: [
        {
          id: "start",
          title: "Start a new piece of work",
          steps: [
            {
              action: "Open the **Solutions Hub dashboard** to see all active work at a glance.",
              detail:
                "The top cards show how many software, training, and content solutions are live, the total value, and the pipeline. The colored module cards below jump you into each area.",
              platforms: {
                web: "left sidebar → Solutions Hub",
                mobile: "tap More (⋯) in the bottom bar → Solutions Hub",
              },
              link: { label: "Open the Dashboard", href: "/solutions" },
            },
            {
              action: "Click **New Solution** and fill in the form to log a new piece of work.",
              detail:
                "Choose the solution type (software, training, or content), the client it's for, and its value. This creates the record everything else hangs off.",
              tip: "Don't have a client yet? Add one first with **Add Client**, then come back — you can't attach a solution to a client that doesn't exist.",
              link: { label: "Add a New Solution", href: "/solutions/new" },
            },
            {
              action: "Check the **Builders** pool and assign the right people to the work.",
              detail:
                "Builders are the talent pool — the people who actually deliver across software, training, and content. Open this list to see who's available before you commit a deadline.",
              link: { label: "Open Builders", href: "/solutions/builders" },
            },
          ],
        },
        {
          id: "run",
          title: "Run training, content, and software",
          steps: [
            {
              action: "Use **Training** to manage programs, sessions, and the cohort of learners.",
              detail:
                "The overview shows active programs. Use Programs to set up what you teach, Sessions for the schedule, and Cohort for who is enrolled.",
              link: { label: "Open Training", href: "/solutions/training" },
            },
            {
              action: "Use **Content** to track production orders from request to delivery.",
              detail:
                "Orders are what a client asked for; Deliverables are what you hand back; Production and Queue show what your team is working on right now.",
              link: { label: "Open Content", href: "/solutions/content" },
            },
            {
              action: "Use **Software** to track build phases and your software builders.",
              detail:
                "Phases walk a software solution from discovery through prototype, client demo, and deployment. Software Builders is the developer pool for these projects.",
              link: { label: "Open Software", href: "/solutions/software" },
            },
          ],
        },
      ],
    },

    /* ── SALES LEAD ────────────────────────────────────────────────────── */
    sales_lead: {
      persona: "sales_lead",
      title: "Sales Lead Guide",
      tagline:
        "You bring in new work — track prospects, move them through the pipeline, and turn them into clients.",
      whyItMatters:
        "The pipeline is the early view of future revenue. A prospect with an overdue follow-up is money slipping away — chasing it on time is the whole job.",
      startHere: { label: "Open the Pipeline Board", href: "/solutions/pipeline" },
      requires: REQUIRES.sales_lead,
      journey: [
        "Add a prospect",
        "Move it across the board",
        "Watch overdue follow-ups",
        "Convert a won prospect to a client",
      ],
      sections: [
        {
          id: "pipeline",
          title: "Work the pipeline",
          steps: [
            {
              action: "Open the **Pipeline** board to see every prospect by stage.",
              detail:
                "Each column is a stage of the deal. Drag a prospect card from one column to the next as the deal progresses. Switch to List View or Analytics from the top of the page.",
              platforms: {
                web: "left sidebar → Solutions Hub → Pipeline",
                mobile: "tap More (⋯) → Solutions Hub → Pipeline",
              },
              link: { label: "Open the Pipeline Board", href: "/solutions/pipeline" },
            },
            {
              action: "Click **Add Prospect** to log a new lead.",
              detail:
                "Record who they are, what they might buy, the likely value, and your next follow-up date so the board can warn you when it's overdue.",
              tip: "The follow-up date is what powers the red **overdue** banner — always set a real one.",
              link: { label: "Add a Prospect", href: "/solutions/pipeline/new" },
            },
            {
              action: "When a prospect says yes, **convert it to a client** from its card.",
              detail:
                "Use the convert action on the prospect to turn a won deal into a client record — then the delivery team can attach solutions to it.",
              link: { label: "Open Clients", href: "/solutions/clients" },
            },
          ],
        },
        {
          id: "review",
          title: "Review how the pipeline is doing",
          steps: [
            {
              action: "Open **Pipeline Analytics** to see conversion, value, and stage breakdown.",
              detail:
                "Use this to spot where deals get stuck and which stages leak the most prospects.",
              link: { label: "Open Pipeline Analytics", href: "/solutions/pipeline/analytics" },
            },
            {
              action: "Keep the **Clients** list current as deals close.",
              detail:
                "Each client holds the contact and the solutions delivered to them. Add new ones with **Add Client** and open any client to see their history.",
              link: { label: "Open Clients", href: "/solutions/clients" },
            },
          ],
        },
      ],
    },

    /* ── FINANCE OFFICER ───────────────────────────────────────────────── */
    finance_officer: {
      persona: "finance_officer",
      title: "Finance Guide",
      tagline:
        "You track the money — record payments against solutions and see how earnings are split.",
      whyItMatters:
        "Payments recorded here are the source of truth for revenue and for who gets paid. A missing payment means someone's earnings are wrong.",
      startHere: { label: "Open Payments", href: "/solutions/payments" },
      requires: REQUIRES.finance_officer,
      journey: ["See all payments", "Record a payment", "Check the earnings split"],
      sections: [
        {
          id: "money",
          title: "Record and track money",
          steps: [
            {
              action: "Open **Payments** to see every payment received against solutions.",
              detail:
                "This is the running record of money in. Amounts show in Indian Rupees.",
              platforms: {
                web: "left sidebar → Solutions Hub → Payments",
                mobile: "tap More (⋯) → Solutions Hub → Payments",
              },
              link: { label: "Open Payments", href: "/solutions/payments" },
            },
            {
              action: "Click **New Payment** to record a payment against a solution.",
              detail:
                "Pick the solution it belongs to, the amount, and the date. Linking it to the right solution is what keeps the dashboard's total value correct.",
              prerequisite:
                "The solution must already exist before you can record a payment against it. If you can't find it, ask the delivery team to add it first.",
              link: { label: "Record a Payment", href: "/solutions/payments/new" },
            },
            {
              action: "Open **Earnings** to see how revenue is split.",
              detail:
                "Earnings shows the revenue split across the people and teams involved — who earned what from each solution.",
              link: { label: "Open Earnings", href: "/solutions/earnings" },
            },
          ],
        },
      ],
    },

    /* ── MODULE ADMIN ──────────────────────────────────────────────────── */
    module_admin: {
      persona: "module_admin",
      title: "Module Admin Guide",
      tagline:
        "You set the Hub's rules and watch the big picture — settings, products and R&D, and department readiness.",
      whyItMatters:
        "The solution types you set here are the choices everyone else picks from, and the readiness dashboards are how leadership judges whether the paradigm shift is actually happening.",
      startHere: { label: "Open Settings", href: "/solutions/settings" },
      requires: REQUIRES.module_admin,
      journey: [
        "Set the solution types",
        "Track products and RDIF readiness",
        "Watch department readiness",
        "Check AI compliance",
      ],
      sections: [
        {
          id: "configure",
          title: "Set the Hub's rules",
          steps: [
            {
              action: "Open **Settings** to manage how the whole Hub behaves.",
              detail:
                "The Overview is the settings home; **Types** is where you define the solution types that everyone selects when creating a solution.",
              platforms: {
                web: "left sidebar → Solutions Hub → Settings",
                mobile: "tap More (⋯) → Solutions Hub → Settings",
              },
              link: { label: "Open Settings", href: "/solutions/settings" },
            },
            {
              action: "Edit the list of solution types in **Settings → Types**.",
              detail:
                "Add, rename, or retire the categories of work the Hub supports. Changes here change the choices on the New Solution form.",
              link: { label: "Open Solution Types", href: "/solutions/settings/types" },
            },
          ],
        },
        {
          id: "portfolio",
          title: "Track products and readiness",
          steps: [
            {
              action: "Open **Products** to track the R&D portfolio and each item's TRL.",
              detail:
                "TRL (Technology Readiness Level) measures how far a product has matured. Use **RDIF** to see how many readiness criteria are met.",
              link: { label: "Open Products", href: "/solutions/products" },
            },
            {
              action: "Open the **Paradigm Shift** dashboard to see department readiness scores.",
              detail:
                "Every department is becoming a Solutions Department. The scores here are self-validating from real data — no manual forms. The Leaderboard ranks departments.",
              link: { label: "Open Paradigm Shift", href: "/solutions/paradigm-shift" },
            },
            {
              action: "Open **AI Compliance** to check how departments and learners are adopting AI solutions.",
              detail:
                "Filter by institution and department to see compliance at the department, learner, and solution-team level.",
              link: { label: "Open AI Compliance", href: "/solutions/ai-solution-compliance" },
            },
          ],
        },
      ],
    },
  },

  glossary: [
    { term: "Solution", def: "One piece of work the Hub delivers — a software build, a training program, or a content order — logged with its client and value." },
    { term: "Builder", def: "A person in the talent pool who delivers the work — across software, training, and content." },
    { term: "Client", def: "An organization JKKN delivers solutions to. Each client holds its contacts and the solutions done for it." },
    { term: "Prospect", def: "A potential client in the sales pipeline — a deal that hasn't closed yet." },
    { term: "Pipeline", def: "The board that tracks prospects from first contact to a won deal, stage by stage." },
    { term: "Phase", def: "A stage of a software build — for example discovery, prototype, client demo, or deployment." },
    { term: "TRL", def: "Technology Readiness Level — a 1-to-9 score for how mature a product is, from idea to ready-to-ship." },
    { term: "Paradigm Shift", def: "The plan for every JKKN department to become a Solutions Department, scored automatically from real data." },
    { term: "View vs edit access", def: "You can open and read whatever your access allows. The buttons to add, edit, or delete only appear on areas where you also have edit access — so you may land on a page and see its records but not its action buttons." },
  ],

  plannedLocaleNote: "A Tamil version is planned — English only for now.",
};

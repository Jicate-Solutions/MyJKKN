/**
 * Events Smart Guide — authored content (the actual product).
 *
 * Three persona lanes in plain 12th-grade language, authored from the events
 * module's REAL routes under app/(routes)/events/*. Every step that happens on a
 * page carries a "Take me there" deep-link. Permission gating uses the shared
 * REQUIRES keys below (the same keys detect-lane checks, so a rename is a
 * compile error, not a silent fail-open lane).
 *
 * IMPORTANT — every lane here is GATED staff/organiser work. None of these lanes
 * is routed to the open `learner` baseline: proposing and running events are
 * staff actions, not everyday all-student actions, so leaking them into every
 * student's guide would be wrong. (See the parent's persona mapping note.)
 *
 * Permission reality: the events module has EXACTLY 5 permission keys —
 * events.view, events.proposals.view, events.proposals.create,
 * events.marathon.view, events.marathon.create. There are NO keys for
 * tournament / ops / budget / sponsors / etc. Those pages gate on
 * events.marathon.view (plus role checks at runtime). Where the key is coarser
 * than the lane, that is flagged with FLAG(SME) below — keys are never invented.
 */
import type { GuideBook } from "./types";

/** Permission keys that gate each staff lane. ONE source of truth — content.ts
 *  sets `requires`, detect-lane checks the same key. Only the 5 REAL events keys
 *  appear here; nothing invented. */
export const REQUIRES = {
  /** Proposing an event tracks a proposal → the proposals view key. Creating a
   *  proposal additionally needs events.proposals.create (called out in-lane). */
  proposer: "events.proposals.view",
  /** Running a marathon/tournament end to end → the marathon view key.
   *  FLAG(SME): organiser SETUP (create) also needs events.marathon.create;
   *  finer per-page rights (budget, sponsors, results) are enforced in-app by
   *  role, NOT by permission keys — none exist for those pages. */
  organiser: "events.marathon.view",
  /** Day-of operations crew (check-in, QR, stalls, t-shirt, certificate desk).
   *  FLAG(SME): there is NO ops permission key. Ops pages gate coarsely on
   *  events.marathon.view; finer ops gating (committee-lead / institution role)
   *  is enforced in-app at runtime, not by a permission key. */
  ops: "events.marathon.view",
} as const;

export const GUIDES: GuideBook = {
  lanes: {
    /* ── PROPOSER ──────────────────────────────────────────────────────── */
    proposer: {
      persona: "proposer",
      title: "Proposer Guide",
      tagline:
        "Suggest a new event and follow it from idea to approved or declined.",
      whyItMatters:
        "A proposal is how an event idea reaches a Director for a yes or no. If it is never submitted, nothing happens — and once it is, you can track the decision instead of chasing it by email.",
      startHere: { label: "Go to Event Proposals", href: "/events/proposals" },
      requires: REQUIRES.proposer,
      journey: [
        "Open Proposals",
        "Fill the short form",
        "Submit it",
        "Track the decision",
      ],
      sections: [
        {
          id: "find-proposals",
          title: "Find the proposals area",
          steps: [
            {
              id: "open-proposals",
              action: "Open **Events**, then go to **Event Proposals**.",
              detail:
                "This is your home base. It lists every proposal you can see and shows where each one stands — submitted, approved, or declined.",
              platforms: {
                web: "left sidebar → Events → Event Proposals",
                mobile: "tap More (⋯) in the bottom bar → Events → Event Proposals",
              },
              link: { label: "Go to Event Proposals", href: "/events/proposals" },
            },
          ],
        },
        {
          id: "submit",
          title: "Submit a new proposal",
          steps: [
            {
              id: "start-propose",
              action: "Click **New Proposal** to open the short proposal form.",
              detail:
                "The form is deliberately short — just the basics. You do not plan the whole event here; you only pitch the idea so a Director can decide.",
              prerequisite:
                "You need permission to create proposals (events.proposals.create). If the New Proposal button is missing or blocked, ask your admin to grant it.",
              link: { label: "Open the proposal form", href: "/events/propose" },
            },
            {
              id: "fill-form",
              action:
                "Fill the three main fields: **title**, **when and where**, and **who it is for**.",
              detail:
                "If you need to, open the extra fields to add **expected attendance** and a **budget band** (a rough cost range, not exact figures).",
              tip: "Keep the title clear and specific — it is the first thing a Director reads.",
            },
            {
              id: "submit-form",
              action: "Press **Submit** to send the proposal for a decision.",
              detail:
                "After you submit, the platform takes you straight to that proposal's status page so you can see it has been recorded.",
            },
          ],
        },
        {
          id: "track",
          title: "Track the decision",
          steps: [
            {
              id: "status-page",
              action:
                "Open your proposal's **Status** page to see whether it is still waiting, approved, or declined.",
              detail:
                "If a Director leaves decision notes, you will read them here. You can return any time from the proposals list.",
              link: {
                label: "Open proposal status",
                href: "/events/propose/:scopeId/status",
              },
            },
            {
              id: "back-to-list",
              action:
                "Use the **Event Proposals** list to check all your proposals in one place.",
              detail:
                "Each row shows the current status, so you can spot at a glance which ones still need a decision.",
              link: { label: "Back to Event Proposals", href: "/events/proposals" },
            },
          ],
        },
      ],
    },

    /* ── ORGANISER ─────────────────────────────────────────────────────── */
    organiser: {
      persona: "organiser",
      title: "Organiser Guide",
      tagline:
        "Run a marathon or tournament end to end — set it up, open registration, go live, and publish results.",
      whyItMatters:
        "You are the single owner of the event. Everything participants, sponsors, and committees rely on flows from the steps you complete here — skip the setup and the live day falls apart.",
      startHere: { label: "Open Marathon Events", href: "/events/marathon" },
      requires: REQUIRES.organiser,
      journey: [
        "Create the event",
        "Set up committees, budget, sponsors",
        "Open registrations",
        "Run live + ops day",
        "Publish results + certificates",
      ],
      sections: [
        {
          id: "create",
          title: "Create the event",
          steps: [
            {
              id: "open-marathon-list",
              action: "Open **Events → Marathon** to see all marathon events.",
              detail:
                "This list is where every marathon lives. Tap any event to open its dashboard; create a new one from here.",
              platforms: {
                web: "left sidebar → Events → Marathon",
                mobile: "tap More (⋯) in the bottom bar → Events → Marathon",
              },
              link: { label: "Open Marathon Events", href: "/events/marathon" },
            },
            {
              id: "new-marathon",
              action: "Click **New Marathon** and enter the name, date, and venue.",
              detail:
                "This creates the event in Draft. From now on, everything else hangs off this one event.",
              prerequisite:
                "Creating an event needs the create-marathon right (events.marathon.create). If the New Marathon button is blocked, ask your admin.",
              link: { label: "Create a new marathon", href: "/events/marathon/new" },
            },
            {
              id: "dashboard",
              action:
                "Open the event's **Dashboard** — your control centre for the whole event.",
              detail:
                "The dashboard shows registrations, budget, committees, and sponsors at a glance, with a link into each area. As the event moves from Draft to Live, you change its status from here.",
              link: {
                label: "Open the event dashboard",
                href: "/events/marathon/:scopeId/dashboard",
              },
            },
          ],
        },
        {
          id: "setup",
          title: "Set up the event (before registration opens)",
          steps: [
            {
              id: "committees",
              action: "Open **Committees** and build your teams.",
              detail:
                "Committees are the groups that run different parts of the event (registration desk, route, refreshments, and so on). Committee leads and members get scoped access to do their jobs.",
              link: {
                label: "Open Committees",
                href: "/events/marathon/:scopeId/committees",
              },
            },
            {
              id: "budget",
              action: "Open **Budget** and plan what you will spend and earn.",
              detail:
                "Record expected costs and income so the event stays on track financially.",
              link: {
                label: "Open Budget",
                href: "/events/marathon/:scopeId/budget",
              },
            },
            {
              id: "sponsors",
              action: "Open **Sponsors** to add the organisations backing the event.",
              detail:
                "Track each sponsor and what they have committed. Sponsor logos and tiers feed into certificates and results later.",
              link: {
                label: "Open Sponsors",
                href: "/events/marathon/:scopeId/sponsors",
              },
            },
            {
              id: "settings",
              action: "Open **Settings** to fine-tune how the event behaves.",
              detail:
                "Adjust event details and options here whenever something needs to change.",
              tip: "Set the basics here before you open registration — it is harder to change once people start signing up.",
              link: {
                label: "Open Settings",
                href: "/events/marathon/:scopeId/settings",
              },
            },
          ],
        },
        {
          id: "registrations",
          title: "Open and manage registrations",
          steps: [
            {
              id: "registrations-list",
              action:
                "Open **Registrations** to watch sign-ups come in and manage participants.",
              detail:
                "See who has registered, review individual entries, and keep the participant list clean before event day.",
              link: {
                label: "Open Registrations",
                href: "/events/marathon/:scopeId/registrations",
              },
            },
            {
              id: "mandatory-hostelers",
              action:
                "If your event requires it, open **Mandatory Hostelers** to track required participation.",
              detail:
                "This is for events where certain residents must take part — use it to check that everyone who must register has done so.",
              link: {
                label: "Open Mandatory Hostelers",
                href: "/events/marathon/:scopeId/mandatory-hostelers",
              },
            },
          ],
        },
        {
          id: "run",
          title: "Run the event day",
          steps: [
            {
              id: "go-live",
              action:
                "On the dashboard, move the event status to **Live** when the day begins.",
              detail:
                "Changing the status unlocks the live and operations views for your crew. Move it to Post Event once the day is over.",
              link: {
                label: "Open the event dashboard",
                href: "/events/marathon/:scopeId/dashboard",
              },
            },
            {
              id: "live-view",
              action: "Open the **Live** view to follow the event as it happens.",
              detail:
                "The live screen gives you a real-time picture of the event while it is running.",
              link: {
                label: "Open Live",
                href: "/events/marathon/:scopeId/live",
              },
            },
            {
              id: "ops-handoff",
              action:
                "Point your day-of crew at the **Operations Dashboard** for check-in, QR codes, stalls, and more.",
              detail:
                "The operations area has its own guide lane (Ops) — your crew runs the desks from there while you keep an eye on the big picture.",
              link: {
                label: "Open Operations Dashboard",
                href: "/events/marathon/:scopeId/ops/dashboard",
              },
            },
          ],
        },
        {
          id: "wrap-up",
          title: "Publish results and certificates",
          steps: [
            {
              id: "results",
              action: "Open **Results** and publish the finishing times and winners.",
              detail:
                "This is what participants and the institution see after the event — make sure it is accurate before you publish.",
              link: {
                label: "Open Results",
                href: "/events/marathon/:scopeId/results",
              },
            },
            {
              id: "certificates",
              action: "Open **Certificates** to generate and hand out participant certificates.",
              detail:
                "Certificates pull in event and sponsor details automatically, so finish your sponsor list first.",
              link: {
                label: "Open Certificates",
                href: "/events/marathon/:scopeId/certificates",
              },
            },
            {
              id: "analytics",
              action: "Open **Analytics** to review how the event went.",
              detail:
                "See participation, budget, and other numbers in one place — useful for the post-event report and for planning the next one.",
              link: {
                label: "Open Analytics",
                href: "/events/marathon/:scopeId/analytics",
              },
            },
          ],
        },
        {
          id: "tournaments",
          title: "Running a sports tournament instead",
          steps: [
            {
              id: "tournament-list",
              action:
                "For sports tournaments, open **Events → Tournament** — a separate list that works like the marathon list.",
              detail:
                "A tournament is the same kind of event with its own pages. Open one to manage it, or create a new one.",
              link: { label: "Open Tournaments", href: "/events/tournament" },
            },
            {
              id: "tournament-new",
              action: "Click **New Tournament** to set one up.",
              detail:
                "Enter the basics, then open the tournament to manage its divisions and lifecycle.",
              tip: "FLAG: tournament pages have no dedicated permission key — they gate on the marathon view right plus your role.",
              link: { label: "Create a new tournament", href: "/events/tournament/new" },
            },
            {
              id: "tournament-open",
              action: "Open a tournament to manage it.",
              detail:
                "From the tournament's page you run its divisions and move it through its stages.",
              link: {
                label: "Open this tournament",
                href: "/events/tournament/:scopeId",
              },
            },
          ],
        },
      ],
    },

    /* ── OPS (day-of operations crew) ──────────────────────────────────── */
    ops: {
      persona: "ops",
      title: "Operations Crew Guide",
      tagline:
        "Run the desks on event day — check participants in, scan QR codes, and hand out t-shirts and certificates.",
      whyItMatters:
        "On the day, the queues at your desk are the event. Fast, accurate check-in and hand-outs are what every participant actually experiences — this is where a smooth event is won or lost.",
      startHere: { label: "Open Operations Dashboard", href: "/events/marathon/:scopeId/ops/dashboard" },
      requires: REQUIRES.ops,
      journey: [
        "Open the Ops dashboard",
        "Check participants in",
        "Scan QR codes",
        "Hand out t-shirts + certificates",
      ],
      sections: [
        {
          id: "ops-home",
          title: "Start at the Operations Dashboard",
          steps: [
            {
              id: "ops-dashboard",
              action:
                "Open the event's **Operations Dashboard** — your launch pad for every desk.",
              detail:
                "Reach it from the event dashboard, or open it directly. Every station below is one tap from here.",
              prerequisite:
                "Operations is for the day-of crew — committee leads, committee members, and staff helping on the day. Students do not get operations access. If a station is blocked, ask the organiser to add you to a committee.",
              link: {
                label: "Open Operations Dashboard",
                href: "/events/marathon/:scopeId/ops/dashboard",
              },
            },
          ],
        },
        {
          id: "check-in",
          title: "Check participants in",
          steps: [
            {
              id: "check-in-desk",
              action: "Open **Check-in** to mark participants as arrived.",
              detail:
                "This is the front-of-house desk. Find a participant and check them in as they reach you.",
              link: {
                label: "Open Check-in",
                href: "/events/marathon/:scopeId/ops/check-in",
              },
            },
            {
              id: "qr-codes",
              action: "Use **QR Codes** to scan participants in quickly.",
              detail:
                "Scanning a participant's QR code is the fastest way to check them in and avoid long queues.",
              tip: "Keep one person on the scanner and one on manual check-in so nobody is stuck waiting.",
              link: {
                label: "Open QR Codes",
                href: "/events/marathon/:scopeId/ops/qr-codes",
              },
            },
          ],
        },
        {
          id: "hand-outs",
          title: "Hand out kit and certificates",
          steps: [
            {
              id: "tshirt",
              action: "Open the **T-shirt** desk to record kit hand-outs.",
              detail:
                "Mark off each t-shirt or kit item as you give it out, so you never run short or double-issue.",
              link: {
                label: "Open T-shirt desk",
                href: "/events/marathon/:scopeId/ops/tshirt",
              },
            },
            {
              id: "stalls",
              action: "Open **Stalls** to manage on-site stalls.",
              detail:
                "Keep track of the stalls set up at the venue from here.",
              link: {
                label: "Open Stalls",
                href: "/events/marathon/:scopeId/ops/stalls",
              },
            },
            {
              id: "ops-certificate",
              action: "Open the **Certificate** desk to issue certificates on the spot.",
              detail:
                "Hand participants their certificate at the desk once they have finished.",
              link: {
                label: "Open Certificate desk",
                href: "/events/marathon/:scopeId/ops/certificate",
              },
            },
          ],
        },
      ],
    },
  },

  glossary: [
    { term: "Proposal", def: "A short pitch for a new event idea, sent to a Director for a yes or no before any planning begins." },
    { term: "Status", def: "Where a proposal stands — submitted (waiting), approved, or declined — shown on its status page." },
    { term: "Budget band", def: "A rough cost range for a proposed event (not exact figures) so a Director can judge the scale." },
    { term: "Marathon", def: "A running event run end to end on the platform — registration, committees, budget, sponsors, live day, and results." },
    { term: "Tournament", def: "A sports tournament event; works like a marathon but with its own pages for divisions and stages." },
    { term: "Committee", def: "A team that runs one part of an event (e.g. registration desk, route). Leads and members get access scoped to their committee." },
    { term: "Registration", def: "A participant signing up for an event; the registrations page lists everyone who has signed up." },
    { term: "Live", def: "The event status (and view) while the event is actually happening — it unlocks the day-of operations screens." },
    { term: "Operations (Ops)", def: "The day-of running of the event — the desks for check-in, QR scanning, t-shirts, stalls, and certificates." },
    { term: "QR check-in", def: "Marking a participant as arrived by scanning the QR code on their registration — the fastest check-in method." },
    { term: "Sponsor", def: "An organisation backing the event; sponsor details feed into certificates and results." },
    { term: "Results", def: "The published finishing times and winners that participants and the institution see after the event." },
  ],

  plannedLocaleNote: "A Tamil version is planned — English only for now.",
};

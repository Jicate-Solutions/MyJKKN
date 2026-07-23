/**
 * Learners Council Smart Guide — authored content (the actual product).
 *
 * Two persona lanes in plain 12th-grade language, authored from the module's
 * REAL routes. Every step that happens on a page carries a "Take me there"
 * deep-link. Both lanes are gated by the single real permission key
 * `learners_council.view` — ordinary students never reach this module, so there
 * is no open lane.
 *
 * IMPORTANT — role granularity is NOT a permission key. The module has exactly
 * ONE permission key in lib/constants/permissions.ts: `learners_council.view`.
 * The deeper split (a council MEMBER who runs a committee vs the staff
 * COORDINATOR who oversees the whole council) is decided IN-APP via
 * lib/learners-council/lc-roles.ts (getLCRole / isStaffRole / canManageElections
 * and the lc_members.position_category lookup), and pages also check
 * profile.role ∈ admin/super_admin/staff/hod/principal for staff-only views.
 * So both lanes point at the same real key, and the role difference is a flag,
 * not a second key. NEVER invent keys like learners_council.manage.
 */
import type { GuideBook } from "./types";

/** Permission key that gates each lane. ONE source of truth — content.ts sets
 *  `requires`, the lane detector checks the same key. There is exactly ONE real
 *  learners-council key in lib/constants/permissions.ts: `learners_council.view`.
 *
 *  FLAG(SME): role granularity (member / office-bearer / coordinator) is
 *  enforced in-app via lc-roles.ts, NOT by permission keys. Both lanes map to
 *  the same real key on purpose — the member-vs-coordinator difference is
 *  decided at runtime from lc_members.position_category + profile.role, so a
 *  member and a coordinator can both hold `learners_council.view` yet see
 *  different controls on the page. */
export const REQUIRES = {
  member: "learners_council.view",
  coordinator: "learners_council.view",
} as const;

export const GUIDES: GuideBook = {
  lanes: {
    /* ── MEMBER (a student on the council — gated by learners_council.view) ── */
    member: {
      persona: "member",
      title: "Council Member Guide",
      tagline:
        "You're elected or appointed to the council — here's how you run your part of it.",
      whyItMatters:
        "The council only works when each member keeps their committee or vertical moving — proposing events, raising issues for students, and getting OD on record so taking part never costs you attendance.",
      startHere: { label: "Open the Council Dashboard", href: "/learners-council" },
      requires: REQUIRES.member,
      journey: [
        "See where you fit",
        "Speak up for students",
        "Plan an event",
        "Get OD on record",
        "Stand for a position",
      ],
      sections: [
        {
          id: "orient",
          title: "Find your place in the council",
          steps: [
            {
              action:
                "Open the **Council Dashboard** — your home screen for everything the council is doing right now.",
              detail:
                "It shows the active term, member count, live announcements, active polls, upcoming events, and any items waiting on you. Tap any card to jump straight to that section.",
              platforms: {
                web: "left sidebar → Learners Council",
                mobile: "tap More (⋯) in the bottom bar → Learners Council",
              },
              link: { label: "Open the Council Dashboard", href: "/learners-council" },
            },
            {
              action:
                "Open **Structure** to see how the council is organised — who holds which position and which committee you belong to.",
              detail:
                "Structure groups everything: Members (the people), Positions (the roles), Portfolio Committees (the working groups), Terms (which year), and Verticals.",
              link: { label: "Open Structure", href: "/learners-council/structure" },
            },
            {
              action:
                "Check the **Members** list to find your fellow council members and their contact details.",
              link: { label: "Open Members", href: "/learners-council/structure/members" },
            },
            {
              action:
                "If you lead or sit on a portfolio committee, open **Portfolio Committees** to see your group's brief.",
              link: { label: "Open Committees", href: "/learners-council/structure/committees" },
            },
          ],
        },
        {
          id: "issues",
          title: "Raise and track student issues",
          steps: [
            {
              action:
                "Open **Issues** to log a problem students are facing and watch it move toward a fix.",
              detail:
                "Issues are shown as a board — open, in progress, resolved. Create a new issue, choose a category, and assign it to the right council member.",
              tip: "Any issue assigned to you shows up under **My Pending Items** on the dashboard, so nothing slips.",
              link: { label: "Open Issues", href: "/learners-council/issues" },
            },
          ],
        },
        {
          id: "events",
          title: "Propose and run council events",
          steps: [
            {
              action:
                "Open **Events** to see what's coming up across the council.",
              link: { label: "Open Events", href: "/learners-council/events" },
            },
            {
              action:
                "To run something new, open **Event Proposals** and submit your idea for approval.",
              detail:
                "Fill in the title, date, venue, and what you need. A staff coordinator reviews it before it goes on the public calendar.",
              tip: "Your proposal is not live until it's approved — check back, or watch for it to appear on the calendar.",
              link: { label: "Propose an Event", href: "/learners-council/events/proposals" },
            },
            {
              action:
                "Once an event is approved, find it on the **Events Calendar** to confirm the date and venue.",
              link: { label: "Open the Calendar", href: "/learners-council/events/calendar" },
            },
          ],
        },
        {
          id: "od",
          title: "Get OD so council work doesn't cost you attendance",
          steps: [
            {
              action:
                "Open **OD** and submit an On-Duty request whenever council work pulls you out of class.",
              detail:
                "OD is the official record that you were doing council duty, so the time isn't marked as an absence. Say what you were doing and when.",
              prerequisite:
                "Submit the OD request **before** the duty where you can — an approved OD on record is what protects your attendance.",
              link: { label: "Open OD", href: "/learners-council/od" },
            },
            {
              action:
                "Track your request — it moves from submitted to in-review to approved as each approver signs off.",
              detail:
                "Your pending OD requests also appear under **My Pending Items** on the dashboard.",
              tip: "The people who approve your OD, and in what order, are set out in **Approval Chains**.",
              link: { label: "See Approval Chains", href: "/learners-council/od/chains" },
            },
          ],
        },
        {
          id: "communication",
          title: "Stay in the loop and have your say",
          steps: [
            {
              action:
                "Open **Communication** to read council announcements.",
              detail:
                "Announcements carry an urgency label (normal, high, urgent) so you can tell what needs attention now.",
              link: { label: "Open Communication", href: "/learners-council/communication" },
            },
            {
              action:
                "Vote in **Polls** when the council asks for member input.",
              link: { label: "Open Polls", href: "/learners-council/communication/polls" },
            },
            {
              action:
                "Discuss longer topics in **Forums**, or message other members in **Chat**.",
              link: { label: "Open Forums", href: "/learners-council/communication/forums" },
            },
          ],
        },
        {
          id: "selection",
          title: "Stand for a position",
          steps: [
            {
              action:
                "Open **Selection** to see the current and past elections for council positions.",
              detail:
                "Selection is the whole journey of choosing the next council: nominations, interviews, then elections.",
              link: { label: "Open Selection", href: "/learners-council/selection" },
            },
            {
              action:
                "Put yourself forward in **Nominations** when nominations are open.",
              tip: "You can only nominate while a position's nomination window is open — the dates are shown on each election.",
              link: { label: "Open Nominations", href: "/learners-council/selection/nominations" },
            },
            {
              action:
                "When voting opens, cast your vote in **Elections**.",
              link: { label: "Open Elections", href: "/learners-council/selection/elections" },
            },
          ],
        },
        {
          id: "yuva",
          title: "If your council runs a YUVA chapter",
          steps: [
            {
              action:
                "Open **YUVA Chapters** to see the chapters linked to the council, then **YUVA Members** for who's in them.",
              detail:
                "YUVA is the youth-leadership wing some councils run alongside their core work. Skip this section if your council doesn't.",
              link: { label: "Open YUVA Chapters", href: "/learners-council/yuva" },
            },
          ],
        },
      ],
    },

    /* ── COORDINATOR (staff advisor — gated by learners_council.view) ──────── */
    coordinator: {
      persona: "coordinator",
      title: "Staff Coordinator Guide",
      tagline:
        "You're the staff advisor who sets up the council and keeps it running fairly.",
      whyItMatters:
        "Members can only act once you've put the structure, the term, and the elections in place — and approvals (OD and events) only happen because a staff coordinator signs off. You're the backbone the student council leans on.",
      startHere: { label: "Open the Council Dashboard", href: "/learners-council" },
      requires: REQUIRES.coordinator,
      journey: [
        "Set up the structure",
        "Run the selection",
        "Approve OD and events",
        "Keep students informed",
        "Watch the whole council",
      ],
      sections: [
        {
          id: "structure",
          title: "Set up the council's structure",
          steps: [
            {
              action:
                "Open **Structure** — this is where the whole council is defined before any member can act.",
              detail:
                "Work through it in order: create the **Term** for the year, define the **Positions**, set up **Portfolio Committees** and **Verticals**, then add **Members** into positions.",
              prerequisite:
                "Create an **active Term** first. Most screens read from the active term — without one, the council looks empty.",
              platforms: {
                web: "left sidebar → Learners Council → Structure",
                mobile: "tap More (⋯) in the bottom bar → Learners Council → Structure",
              },
              link: { label: "Open Structure", href: "/learners-council/structure" },
            },
            {
              action:
                "Open **Terms** to create the academic term and mark it active.",
              link: { label: "Open Terms", href: "/learners-council/structure/terms" },
            },
            {
              action:
                "Open **Positions** to define every council role for the term.",
              link: { label: "Open Positions", href: "/learners-council/structure/positions" },
            },
            {
              action:
                "Open **Members** to add students into their positions and keep the roster current.",
              detail:
                "A member's position decides what they can do — for example, an executive sees more than an at-large member. That role split is applied automatically; you just place people in the right position.",
              link: { label: "Open Members", href: "/learners-council/structure/members" },
            },
            {
              action:
                "Set up **Portfolio Committees** and **Verticals** so members have a working group to belong to.",
              link: { label: "Open Committees", href: "/learners-council/structure/committees" },
            },
          ],
        },
        {
          id: "selection",
          title: "Run the selection (nominations → interviews → elections)",
          steps: [
            {
              action:
                "Open **Selection** to manage how the next council is chosen.",
              detail:
                "Creating and managing elections is a staff job — members can only nominate and vote.",
              link: { label: "Open Selection", href: "/learners-council/selection" },
            },
            {
              action:
                "Create the election and set its windows in **Elections** — nomination dates, then voting dates.",
              detail:
                "Until an election exists, members have nothing to nominate for. Set clear open and close times for each stage.",
              tip: "Members see and can act only during the window that's currently open, so the dates you set are the gate.",
              link: { label: "Open Elections", href: "/learners-council/selection/elections" },
            },
            {
              action:
                "Review who put themselves forward in **Nominations**, and shortlist as needed.",
              link: { label: "Open Nominations", href: "/learners-council/selection/nominations" },
            },
            {
              action:
                "Schedule and record **Interviews** for shortlisted candidates where your process uses them.",
              link: { label: "Open Interviews", href: "/learners-council/selection/interviews" },
            },
          ],
        },
        {
          id: "approvals",
          title: "Approve OD requests and event proposals",
          steps: [
            {
              action:
                "Open **OD Approvals** to act on the On-Duty requests waiting for your sign-off.",
              detail:
                "Anything awaiting your approval also appears under **Awaiting Your Approval** on the dashboard — approve or reject from there too.",
              link: { label: "Open OD Approvals", href: "/learners-council/od/approvals" },
            },
            {
              action:
                "Set up who signs off, and in what order, in **Approval Chains**.",
              detail:
                "The chain decides the route an OD request takes before it's final. Get this right once and every future request follows it.",
              link: { label: "Open Approval Chains", href: "/learners-council/od/chains" },
            },
            {
              action:
                "Review members' event ideas in **Event Proposals** and approve the ones that should go ahead.",
              detail:
                "An event only reaches the public calendar after you approve it — that's your quality gate.",
              link: { label: "Open Event Proposals", href: "/learners-council/events/proposals" },
            },
          ],
        },
        {
          id: "communication",
          title: "Keep students informed",
          steps: [
            {
              action:
                "Open **Communication** to post announcements to the council.",
              detail:
                "Set the urgency so members know what needs attention. You can also run **Polls** to gather input.",
              link: { label: "Open Communication", href: "/learners-council/communication" },
            },
            {
              action:
                "Run a **Poll** when you need a quick read on what members want.",
              link: { label: "Open Polls", href: "/learners-council/communication/polls" },
            },
          ],
        },
        {
          id: "oversee",
          title: "Watch the whole council",
          steps: [
            {
              action:
                "Use the **Council Dashboard** as your control tower — switch the scope between **My Institution** and **LC-Wide** to see one campus or all of them.",
              detail:
                "The dashboard surfaces member counts, live announcements, active polls, upcoming events, and everything awaiting your approval in one place.",
              link: { label: "Open the Council Dashboard", href: "/learners-council" },
            },
            {
              action:
                "Track student problems on the **Issues** board and make sure each one is assigned and moving.",
              link: { label: "Open Issues", href: "/learners-council/issues" },
            },
            {
              action:
                "Adjust module options in **Settings** when you need to.",
              link: { label: "Open Settings", href: "/learners-council/settings" },
            },
          ],
        },
      ],
    },
  },

  glossary: [
    { term: "Learners Council", def: "The elected student-governance body for the institution — the students who represent and act for their peers." },
    { term: "Term", def: "One year (or session) of the council. Most screens read from the active term, so it must be set up first." },
    { term: "Position", def: "A defined role on the council, e.g. an executive, a portfolio head, or an at-large member." },
    { term: "Portfolio Committee", def: "A working group inside the council that owns one area of work, led by a portfolio head." },
    { term: "Vertical", def: "A theme or stream the council organises its work under." },
    { term: "Executive", def: "A member in an executive position — the council's senior office-bearers, who see and do more than a regular member." },
    { term: "Senior Learner Advisor", def: "The staff member (admin or staff role) who coordinates and advises the council." },
    { term: "OD (On-Duty)", def: "An official record that a student was on council duty, so the time isn't counted as an absence." },
    { term: "Approval Chain", def: "The set order of people who sign off an OD request before it's final." },
    { term: "Event Proposal", def: "A member's event idea that a staff coordinator must approve before it reaches the public calendar." },
    { term: "Selection", def: "The whole process of choosing the next council: nominations, then interviews, then elections." },
    { term: "Nomination", def: "Putting yourself (or being put) forward for a council position while its nomination window is open." },
    { term: "Election", def: "The vote that decides who fills a position. Staff create and run it; members vote." },
    { term: "YUVA Chapter", def: "A youth-leadership wing some councils run alongside their core work." },
    { term: "Issue", def: "A student problem logged on the council's board and tracked from open to resolved." },
  ],

  plannedLocaleNote: "A Tamil version is planned — English only for now.",
};

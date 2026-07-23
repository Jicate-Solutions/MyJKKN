/**
 * Board of Studies (BoS) Smart Guide — authored content (the actual product).
 *
 * Four persona lanes in plain 12th-grade language, authored from the module's
 * REAL routes. Every step that happens on a page carries a "Take me there"
 * deep-link. Permission gating uses the shared REQUIRES keys below (imported by
 * detect-lane.ts so a rename is a compile error, not a silent fail-open lane).
 *
 * NOTE on gating: BoS uses GRANULAR permission keys (academic.bos-<area>.<action>)
 * plus a structural board-membership model (chairman vs member vs principal,
 * resolved at runtime in lib/utils/bos/bos-access.ts) that no single permission
 * key captures. The REQUIRES keys below are the closest real "can this person
 * even open this area" gate per lane — they decide whether the lane is OFFERED,
 * while the deeper chairman/member/principal distinction is enforced in the app.
 */
import type { GuideBook } from "./types";

/** Permission keys that gate each lane. ONE source of truth — content.ts sets
 *  `requires`, detect-lane.ts checks the same key. Every key below is REAL and
 *  present in lib/constants/permissions.ts. */
export const REQUIRES = {
  // The academic office / super-admin who builds the master data the whole
  // module runs on. Compositions is the most representative create gate.
  coordinator: "academic.bos-compositions.create",
  // The board chairman schedules and runs meetings — meeting create is the
  // sharpest "you chair a board" gate available as a permission key.
  chairman: "academic.bos-meetings.create",
  // A board member's everyday job is reviewing meeting papers and syllabi.
  member: "academic.bos-meetings.view",
  // The principal's distinct power is approving meetings (read + approve).
  principal: "academic.bos-meetings.approve",
} as const;

export const GUIDES: GuideBook = {
  lanes: {
    /* ── COORDINATOR (academic office / super-admin) ───────────────────── */
    coordinator: {
      persona: "coordinator",
      title: "Coordinator Guide",
      tagline:
        "You set up the master data every board runs on, then keep reports NAAC-ready.",
      whyItMatters:
        "Boards, member types, experts and the SOP are the rails everything else rides on. Get these right once and chairmen can run their meetings without coming back to you.",
      startHere: { label: "Open Board of Studies", href: "/bos" },
      requires: REQUIRES.coordinator,
      journey: [
        "Set the SOP and taxonomy",
        "Add experts and member types",
        "Build the committees",
        "Create the composition",
        "Export reports",
      ],
      sections: [
        {
          id: "foundations",
          title: "Lay the foundations (do these first)",
          steps: [
            {
              action: "Open **Board of Studies** to see the whole module at a glance.",
              detail:
                "The landing page shows total meetings, active compositions, and anything expiring soon.",
              platforms: {
                web: "left sidebar → Board of Studies",
                mobile: "tap the menu (☰) → Board of Studies",
              },
              link: { label: "Open Board of Studies", href: "/bos" },
            },
            {
              action: "Publish the **SOP** so every board follows the same rules.",
              detail:
                "Write the standard operating procedure for how boards run, then have it approved. Members can read it but only you set it.",
              link: { label: "Open SOP", href: "/bos/sop" },
            },
            {
              action: "Set up the **Taxonomy** — the regulations, POs and PSOs per programme.",
              detail:
                "This is the outcomes framework boards map their courses against. Add a regulation, then open it to fill in outcomes.",
              link: { label: "Open Taxonomy", href: "/bos/taxonomy" },
            },
          ],
        },
        {
          id: "people",
          title: "Add the people and committees",
          steps: [
            {
              action: "Add **External Experts** — the outside academics and industry members boards invite.",
              detail:
                "These are the experts a chairman picks from when building a composition.",
              link: { label: "Open External Experts", href: "/bos/experts" },
            },
            {
              action: "Define the **Member Types** — Chairman, Subject Expert, University Nominee, and so on.",
              detail:
                "Member types control where each person shows up on a composition and in reports. Set the order once.",
              link: { label: "Open Member Types", href: "/bos/member-types" },
            },
            {
              action: "Set up the **Committees** that govern each programme.",
              detail:
                "A committee links the boards to the programmes they govern, so the right courses reach the right board.",
              link: { label: "Open Committees", href: "/bos/committees" },
            },
          ],
        },
        {
          id: "composition",
          title: "Create the board composition",
          steps: [
            {
              action: "Create a new **Composition** for the term.",
              detail:
                "A composition is one board's roster for a fixed term — who chairs it and who sits on it.",
              tip: "Watch the **Expiring Soon** card on the landing page — renew a composition before its term ends or the board can't meet.",
              link: { label: "New Composition", href: "/bos/compositions/new" },
            },
            {
              action: "Appoint the **Chairman** on the composition.",
              detail:
                "The person you mark as Chairman gets the power to schedule meetings and approve that board's work. Until a chairman exists, the board can't run.",
              prerequisite:
                "Add the chairman first. Most board actions (scheduling, approving) are chairman-only — an empty chair blocks the whole board.",
              link: { label: "Open Compositions", href: "/bos/compositions" },
            },
          ],
        },
        {
          id: "reports",
          title: "Reports and evidence",
          steps: [
            {
              action: "Open **Reports** to see board activity and export NAAC-ready evidence.",
              detail:
                "Pull meeting counts, composition rosters and resolutions in one place when accreditation asks for proof.",
              link: { label: "Open Reports", href: "/bos/reports" },
            },
          ],
        },
      ],
    },

    /* ── CHAIRMAN (HOD who chairs a board) ─────────────────────────────── */
    chairman: {
      persona: "chairman",
      title: "Chairman Guide",
      tagline:
        "You chair a board — schedule its meetings, run them, and approve the work.",
      whyItMatters:
        "Almost nothing happens on your board until you act: only the chairman can schedule a meeting, edit the composition, and approve syllabi. You are the board's engine.",
      startHere: { label: "Schedule a Meeting", href: "/bos/meetings/new" },
      requires: REQUIRES.chairman,
      journey: [
        "Check your composition",
        "Schedule the meeting",
        "Run it and record minutes",
        "Approve the syllabi",
        "Ratify and report",
      ],
      sections: [
        {
          id: "board",
          title: "Know your board",
          steps: [
            {
              action: "Open **Compositions** and find the board you chair.",
              detail:
                "This is your roster — the members, experts and their types for this term. As chairman you can edit it; members can only view.",
              platforms: {
                web: "left sidebar → Board of Studies → Compositions",
                mobile: "tap the menu (☰) → Board of Studies → Compositions",
              },
              link: { label: "Open Compositions", href: "/bos/compositions" },
            },
          ],
        },
        {
          id: "meeting",
          title: "Schedule and run the meeting",
          steps: [
            {
              action: "Press **Schedule Meeting** to set a new board meeting.",
              detail:
                "Pick the board, date and agenda. Only a chairman can do this — if the button is missing, you're not listed as chairman of an active composition.",
              prerequisite:
                "You must be marked as **Chairman** on an active composition. If you only show as a member, ask your BoS coordinator to update the composition.",
              link: { label: "Schedule a Meeting", href: "/bos/meetings/new" },
            },
            {
              action: "Open the **Meetings** list to track every meeting and its status.",
              detail:
                "Each meeting moves from draft, through the session, to ratified. Open one to add the agenda and record what was decided.",
              link: { label: "Open Meetings", href: "/bos/meetings" },
            },
          ],
        },
        {
          id: "syllabus",
          title: "Approve the academic work",
          steps: [
            {
              action: "Review the **Syllabus** entries your board produced and approve them.",
              detail:
                "Members draft syllabi; as board chairman you (or the creator) can edit and approve them. Approval is what makes a syllabus official.",
              link: { label: "Open Syllabus", href: "/bos/syllabus" },
            },
            {
              action: "Set the **POs and PSOs** for each programme in **Taxonomy**.",
              detail:
                "Only the board chairman for a programme can configure its outcomes — this is where you lock the framework courses map to.",
              link: { label: "Open Taxonomy", href: "/bos/taxonomy" },
            },
          ],
        },
      ],
    },

    /* ── MEMBER (faculty / external expert on a board) ─────────────────── */
    member: {
      persona: "member",
      title: "Member Guide",
      tagline:
        "You sit on a board — review the papers, shape the syllabus, and claim your TA/DA.",
      whyItMatters:
        "Your reading and your inputs are the board's real work. The chairman runs the meeting, but the courses and outcomes are decided by what members like you contribute.",
      startHere: { label: "Open Meetings", href: "/bos/meetings" },
      requires: REQUIRES.member,
      journey: [
        "Read the meeting papers",
        "Review the courses",
        "Add to the syllabus",
        "Claim your TA/DA",
      ],
      sections: [
        {
          id: "prepare",
          title: "Prepare for the meeting",
          steps: [
            {
              action: "Open **Meetings** and read the agenda for your board's next meeting.",
              detail:
                "You can see every meeting for the boards you sit on. Open one to read the agenda and papers before you attend.",
              platforms: {
                web: "left sidebar → Board of Studies → Meetings",
                mobile: "tap the menu (☰) → Board of Studies → Meetings",
              },
              link: { label: "Open Meetings", href: "/bos/meetings" },
            },
            {
              action: "Check the **Courses** and **Course Scheme** your board is reviewing.",
              detail:
                "See the course list and how courses are arranged across semesters, so you come to the meeting prepared.",
              link: { label: "Open Courses", href: "/bos/courses" },
            },
          ],
        },
        {
          id: "contribute",
          title: "Contribute the academic work",
          steps: [
            {
              action: "Draft or update a **Syllabus** for a course you own.",
              detail:
                "You can edit syllabi you created. The chairman or creator approves them — until then they're a working draft.",
              tip: "If a syllabus is locked, you may not be its creator. Only the creator, the board chairman, or a super-admin can edit it.",
              link: { label: "Open Syllabus", href: "/bos/syllabus" },
            },
          ],
        },
        {
          id: "tada",
          title: "Claim your TA/DA",
          steps: [
            {
              action: "Open **TA/DA Claims** to submit travel and daily allowance for a meeting you attended.",
              detail:
                "Enter your travel details against the meeting; the rates are applied for you. Submit it for approval.",
              link: { label: "Open TA/DA Claims", href: "/bos/ta-da" },
            },
          ],
        },
      ],
    },

    /* ── PRINCIPAL (read-only governor + approver) ─────────────────────── */
    principal: {
      persona: "principal",
      title: "Principal Guide",
      tagline:
        "You oversee every board in your institution and approve their meetings.",
      whyItMatters:
        "You see all the boards but you don't edit their field work — your role is oversight and the approval that signs off a meeting's outcome.",
      startHere: { label: "Open Meetings", href: "/bos/meetings" },
      requires: REQUIRES.principal,
      journey: [
        "See every board",
        "Watch the meetings",
        "Approve the outcome",
      ],
      sections: [
        {
          id: "oversee",
          title: "Oversee the boards",
          steps: [
            {
              action: "Open **Compositions** to see every board in your institution.",
              detail:
                "Unlike a member, you see all compositions, not just your own. This is read-only — you don't edit a board's roster.",
              platforms: {
                web: "left sidebar → Board of Studies → Compositions",
                mobile: "tap the menu (☰) → Board of Studies → Compositions",
              },
              link: { label: "Open Compositions", href: "/bos/compositions" },
            },
            {
              action: "Open **Meetings** to watch every board's meeting across the institution.",
              detail:
                "Track which boards are meeting, what's scheduled, and what's still pending sign-off.",
              link: { label: "Open Meetings", href: "/bos/meetings" },
            },
          ],
        },
        {
          id: "approve",
          title: "Approve the outcome",
          steps: [
            {
              action: "Open a meeting and **approve** its status when the board has finished.",
              detail:
                "Your approval moves a meeting's workflow forward. You can approve and change status, but you can't edit the field data inside — that's the board's work.",
              tip: "If an edit button is missing, that's by design — principals approve, they don't fill in a board's records.",
              link: { label: "Open Meetings", href: "/bos/meetings" },
            },
            {
              action: "Use **Reports** to review board activity for your institution.",
              detail:
                "A quick way to see meeting counts and rosters across all your boards in one view.",
              link: { label: "Open Reports", href: "/bos/reports" },
            },
          ],
        },
      ],
    },
  },

  glossary: [
    { term: "Board of Studies (BoS)", def: "A committee that reviews and approves the courses, syllabus and outcomes for a set of programmes." },
    { term: "Composition", def: "One board's roster for a fixed term — who chairs it and who sits on it. Renew it before its term ends." },
    { term: "Chairman", def: "The board's head (often an HOD). Only the chairman can schedule meetings, edit the composition, and approve syllabi." },
    { term: "Member", def: "A faculty member or external expert who sits on a board, reviews papers, and shapes the syllabus." },
    { term: "Principal", def: "The institution head. Sees every board and approves meeting outcomes, but does not edit a board's field data." },
    { term: "Member Type", def: "The role a person holds on a composition — Chairman, Subject Expert, University Nominee, and so on." },
    { term: "Taxonomy", def: "The outcomes framework: regulations plus the Programme Outcomes (POs) and Programme Specific Outcomes (PSOs) courses are mapped against." },
    { term: "TA/DA", def: "Travel Allowance and Daily Allowance — what board members claim for attending a meeting." },
    { term: "SOP", def: "Standard Operating Procedure — the agreed rules for how boards are run, set once by the coordinator." },
    { term: "NAAC", def: "The national college-accreditation body — board records and reports become evidence for it." },
  ],

  plannedLocaleNote: "A Tamil version is planned — English only for now.",
};

/**
 * InstaSolver — Smart Guide content (PURE DATA, no I/O, no JSX).
 *
 * Spec: specs/instasolver-2026-09-14.md. InstaSolver is the ONE front door for
 * "something is wrong here" — decision I3: one button whose first screen asks
 * what kind, then hands you to the lane that already owns the work.
 *
 * ONE lane, contributed to the OPEN canonical `learner` lane and nothing else.
 * That is the whole point of decision I1 ("everyone with a login can file"):
 * every role holds instasolver.view, so gating these steps behind a permission
 * would be theatre — and worse than theatre for the learner persona, because
 * the resolver short-circuits it to `can: () => false`, which would filter a
 * permission-tagged section away from exactly the people the front door exists
 * for. So these sections carry NO `requires`: open, like the door itself.
 *
 * Voice: plain words, present tense, short. Every link points at a page that
 * exists today (guide-smoke fails on an href with no page).
 *
 * TENSE IS A PROMISE (Director, 2026-09-30: "no out-of-date words"). Every step
 * here describes something a person can do right now: report a broken thing
 * with a camera or gallery photo, follow it in My reports and say "Not fixed"
 * within 7 days of it being marked fixed, file a complaint (without your name
 * for most types, with a tracking code), and send a complaint about your own
 * HOD or manager past them. Wording mirrors the screens — the complaint form's
 * tick-box says "HOD or manager", so the guide does too. "My complaints" is not
 * linked here until its page is on main (PR #4144). Parents are not mentioned:
 * they sign in through a separate portal (`/parent/*`) and cannot reach this
 * door.
 */
import type { GlossaryTerm, GuideLink, GuideSection } from "@/lib/guide/types";

/** The key that unlocks InstaSolver. Exported so the one file that owns this
 *  module's keys still names it — deliberately NOT registered in
 *  `PERSONA_REQUIRES`: the lane it feeds is the open `learner` lane, which is
 *  always visible, and `lib/guide/resolve-persona.ts` short-circuits the learner
 *  persona before it reads that row, so an entry there would buy nothing and
 *  cost one permission RPC per page load, platform-wide. */
export const REQUIRES = {
  filer: "instasolver.view",
} as const;

interface InstaSolverLane {
  title: string;
  tagline: string;
  whyItMatters?: string;
  startHere?: GuideLink;
  journey: string[];
  sections: GuideSection[];
}

const filerSections: GuideSection[] = [
  {
    id: "raise-an-issue",
    title: "Raise an issue",
    steps: [
      {
        action: "Open **InstaSolver** from the sidebar, just below Dashboard.",
        detail:
          "Everyone with a MyJKKN login can use it: learners, teaching and non-teaching team members. You don't need anyone's permission.",
        link: { label: "Open InstaSolver", href: "/instasolver" },
      },
      {
        action: "Pick **what kind** of problem it is.",
        detail:
          "Something is broken, I have a complaint, or we need to buy something.",
        tip: "Not sure? Pick the closest one.",
      },
    ],
  },
  {
    id: "something-broken",
    title: "Something is broken",
    steps: [
      {
        action: "Say what is broken and where.",
        detail:
          "One or two sentences is enough. Where it is matters most: room, block, floor. Add a photo if you can — from the camera or your gallery.",
        link: { label: "Report something broken", href: "/instasolver/broken" },
      },
      {
        action: "Follow it in **My reports**.",
        detail:
          "It goes straight to the team that fixes things on campus. My reports shows each thing you reported and when it is marked fixed.",
        link: { label: "My reports", href: "/instasolver/my-reports" },
      },
      {
        action: "Still broken? Tap **Not fixed**.",
        detail:
          "For 7 days after a job is marked fixed, you can tap Not fixed in My reports. It goes straight back to the people who fix it.",
      },
    ],
  },
  {
    id: "complaint",
    title: "I have a complaint",
    steps: [
      {
        action: "Pick the type and say what happened.",
        detail:
          "About a service, a person, or how you were treated.",
        link: { label: "File a complaint", href: "/instasolver/complaint" },
      },
      {
        action: "Want to leave your name off? Tick **File without my name**.",
        detail:
          "Most types allow it; the form tells you if one needs your name. You get a tracking code — save it. It is the only way back to that complaint.",
        link: { label: "Check with a tracking code", href: "/instasolver/track" },
      },
      {
        action: "About your own HOD or manager? Tick **This is about my HOD or manager**.",
        detail:
          "It skips them and goes straight to senior management.",
      },
    ],
  },
  {
    id: "buy-something",
    title: "We need to buy something",
    steps: [
      {
        action: "Purchases go through **Procurement**.",
        detail:
          "If you can raise purchase requests, the card takes you straight there. If not, ask your Store Administrator or the Procurement team — they can raise it for you.",
      },
    ],
  },
];

export const GUIDES: {
  lanes: { filer: InstaSolverLane };
  glossary: GlossaryTerm[];
} = {
  lanes: {
    filer: {
      title: "InstaSolver Guide",
      tagline:
        "Tell us what's wrong. It goes to the right person, and you'll see when it's fixed.",
      whyItMatters:
        "A problem nobody reports is a problem nobody fixes. InstaSolver is one place to report anything, open to everyone.",
      startHere: { label: "Open InstaSolver", href: "/instasolver" },
      journey: [
        "Open InstaSolver",
        "Pick what kind",
        "Say what and where",
        "See when it's fixed",
      ],
      sections: filerSections,
    },
  },
  glossary: [
    {
      term: "InstaSolver",
      def: "One place to report anything wrong on campus. It sends your report to the team that fixes it.",
    },
    {
      term: "Tracking code",
      def: "The private code you get when you file a complaint without your name. It is the only way back to that complaint, so save it.",
    },
    {
      term: "Not fixed",
      def: "A button in My reports. For 7 days after a job is marked fixed, it sends the job back to the people who fix it.",
    },
  ],
};

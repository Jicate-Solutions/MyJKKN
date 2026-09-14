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
 * would be theatre — and worse than theatre for a learner, because the resolver
 * short-circuits the student role to `can: () => false`, which would filter a
 * permission-tagged section away from exactly the people the front door exists
 * for. So these sections carry NO `requires`: open, like the door itself.
 *
 * Voice: 12th-grade plain English, imperative. Every link points at a route that
 * exists in this PR — the chooser. The three lanes behind it land in their own
 * PRs and get their own steps then (guide-smoke fails on an href with no page).
 *
 * TENSE IS A PROMISE. A guide written ahead of its lanes is a guide that lies.
 * Only the broken-things flow is described in the present tense, because that is
 * the only intake reachable from this door today. Complaints, filing without
 * your name and the tracking code are all named as "opens shortly" — said once,
 * plainly, with no date attached. Parents are not mentioned at all: they sign in
 * through a separate portal (`/parent/*`, its own JWT and nav) and cannot reach
 * this door, so naming them here would send the one audience that cannot follow
 * the steps looking for a sidebar row they do not have.
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
        action: "Open **InstaSolver** from the sidebar once your college has switched it on.",
        detail:
          "Everyone with a MyJKKN login can use it: learners, teaching and non-teaching team members. You do not need anyone's permission to report a problem. The row appears for you once your college turns InstaSolver on — if you cannot see it yet, that is why.",
        link: { label: "Open InstaSolver", href: "/instasolver" },
      },
      {
        action: "Pick **what kind** of problem it is.",
        detail:
          "One screen, three choices. Something is broken — a tap, a fan, a light, a leak. I have a complaint — about a service, a person, or how you were treated. We need to buy something — equipment or supplies that have to be paid for.",
        tip: "Not sure which one? Pick the closest. Whoever picks it up can move it, and nothing is lost by choosing wrong.",
      },
      {
        action: "For **something is broken**, say what you saw and where.",
        detail:
          "One or two plain sentences is enough. Where it is matters more than long wording — a room, a block, a floor. A photo helps. This goes to the same team that already fixes what the campus walk finds, so it lands in a list somebody works through, not an inbox.",
      },
      {
        action: "About **I have a complaint** — this lane opens shortly.",
        detail:
          "The card is on the chooser, and the complaint form behind it is not open yet. Until it is, a complaint still goes through Learners Council → Issues for the roles that can reach it. Filing without your name, and the private tracking code that goes with it, arrive together with that form.",
      },
      {
        action: "About **We need to buy something**.",
        detail:
          "Buying is handled by Procurement, not by InstaSolver — the card takes you straight there. If you are not one of the people who can raise a purchase request yet, the card says so and tells you to ask your HOD, rather than sending you to a page that will turn you away.",
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
        "One button for anything wrong on campus. Report a broken thing in under a minute; the complaint lane opens shortly.",
      whyItMatters:
        "A problem nobody reports is a problem nobody fixes. InstaSolver removes the two excuses that stop people reporting: not knowing where to go, and not being allowed in.",
      startHere: { label: "Open InstaSolver", href: "/instasolver" },
      journey: [
        "Open InstaSolver",
        "Pick what kind",
        "Say what you saw and where",
        "It reaches the team that fixes it",
      ],
      sections: filerSections,
    },
  },
  glossary: [
    {
      term: "InstaSolver",
      def: "The one front door for reporting anything wrong on campus. It does not solve the problem itself — it routes it to the team that does.",
    },
    {
      term: "Tracking code",
      def: "A private code that comes with filing a complaint without your name. That lane opens shortly; when it does, the code will be the only way back to that report, so save it.",
    },
  ],
};

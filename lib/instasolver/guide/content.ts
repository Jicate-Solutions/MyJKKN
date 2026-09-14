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
 */
import type { GlossaryTerm, GuideLink, GuideSection } from "@/lib/guide/types";

/** The key that unlocks InstaSolver. Registered for completeness — the lane it
 *  feeds is the OPEN learner lane, so nothing here is gated on it. Every role
 *  holds it (migration 20261212120000, decision I1). */
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
        action: "Open **InstaSolver** from the sidebar — it is the second row, under Dashboard.",
        detail:
          "Everyone with a login can use it: learners, teaching and non-teaching team members, and parents. You do not need anyone's permission to report a problem.",
        link: { label: "Open InstaSolver", href: "/instasolver" },
      },
      {
        action: "Pick **what kind** of problem it is.",
        detail:
          "One screen, three choices. Something is broken — a tap, a fan, a light, a leak. I have a complaint — about a service, a person, or how you were treated. We need to buy something — equipment or supplies that have to be paid for.",
        tip: "Not sure which one? Pick the closest. Whoever picks it up can move it, and nothing is lost by choosing wrong.",
      },
      {
        action: "Say what you saw, and where.",
        detail:
          "One or two plain sentences is enough. Where it is matters more than long wording — a room, a block, a floor. A photo helps when something is broken.",
      },
      {
        action: "Send it, and keep the tracking code.",
        detail:
          "A complaint can be sent without your name. When you do that, the tracking code is the only way back to it — save it, because nobody can look it up for you afterwards.",
        tip: "If you gave your name, you can find the issue again from InstaSolver without a code.",
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
        "Report a broken thing, a complaint, or something that needs buying — from one button, in under a minute.",
      whyItMatters:
        "A problem nobody reports is a problem nobody fixes. InstaSolver removes the two excuses that stop people reporting: not knowing where to go, and not being allowed in.",
      startHere: { label: "Open InstaSolver", href: "/instasolver" },
      journey: [
        "Open InstaSolver",
        "Pick what kind",
        "Say what you saw",
        "Send it",
        "Keep the tracking code",
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
      def: "A private code given when you report something without your name. It is the only way back to that report, so save it.",
    },
  ],
};

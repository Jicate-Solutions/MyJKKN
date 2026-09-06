/**
 * ID Cards module — Smart Guide content (PURE DATA, no I/O, no JSX).
 *
 * The registrar / module-admin lane for physical ID card printing: design the
 * card template, check the printer policy, print one card or many, and watch
 * the print queue while the on-premises bridge does the work. The registry
 * (lib/guide/registry.ts) re-keys this onto the canonical `module-admin` lane,
 * with each section gated by the permission that unlocks it (fail-closed):
 * template/policy setup behind id_cards.templates.edit, day-to-day printing
 * behind id_cards.jobs.manage.
 *
 * Voice: 12th-grade plain English, imperative, no jargon. Links point at REAL
 * routes (/admin/id-cards/*, /learners/profiles). Job-status names match the
 * queue UI labels exactly (Pending / Rendering / Sent to printer / Printed /
 * Failed) so the guide never contradicts the screen.
 */
import type { GlossaryTerm, GuideLink, GuideSection } from "@/lib/guide/types";

/**
 * Permission keys gating the two groups of sections in this lane. Real
 * id_cards.* keys from lib/constants/permissions.ts — reused, never re-seeded.
 *  - templates → the setup group (card template + printer policy)
 *  - operator  → the printing group (enqueue jobs + watch the queue)
 */
export const REQUIRES = {
  templates: "id_cards.templates.edit",
  operator: "id_cards.jobs.manage",
} as const;

interface IdCardsLane {
  title: string;
  tagline: string;
  whyItMatters?: string;
  startHere?: GuideLink;
  journey: string[];
  sections: GuideSection[];
}

/** Entry group — gated by REQUIRES.operator in the registry. */
export const entrySections: GuideSection[] = [
  {
    id: "open-the-module",
    title: "Find ID Cards in Admin",
    steps: [
      {
        action: "Open **Admin → ID Cards** from the left sidebar.",
        detail:
          "This is the home of card printing: the printer policy, the card template, and the live print queue all live here.",
        link: { label: "Open ID Cards", href: "/admin/id-cards" },
        platforms: {
          web: "left sidebar → Admin → ID Cards",
          mobile: "tap ☰ → Admin → ID Cards",
        },
      },
    ],
  },
];

/** Setup group — gated by REQUIRES.templates in the registry. */
export const setupSections: GuideSection[] = [
  {
    id: "design-the-template",
    title: "Create or edit the card template",
    steps: [
      {
        action: "Open the **Template** page under Admin → ID Cards.",
        detail:
          "The template decides what appears on the card: which fields print where, and which photo to use. Every card printed uses this template.",
        link: { label: "Open the template editor", href: "/admin/id-cards/template" },
      },
      {
        action: "Check the **Field Mappings** tab first.",
        detail:
          "Each mapping connects a spot on the card (name, roll number, photo) to the learner record it reads from. If a field prints blank, the mapping is the first place to look.",
      },
      {
        action: "Know what happens when a learner has **no photograph**.",
        detail:
          "Their card is not printed. A card with no face shows only initials, and the code beside it carries just a number — a photo of somebody else's card scans the same way, so the photograph IS the identity check. The print screen refuses and says whose photograph is missing.",
        tip: "A picture from the learner's own login account does NOT count. It is not evidence anyone here photographed them, so the card is still refused. Only a photograph the institution took will print.",
      },
    ],
  },
  {
    id: "check-printer-policy",
    title: "Check the printer policy",
    steps: [
      {
        action: "Open the **Printer Policy** page and confirm the **ribbon type**.",
        detail:
          "The ribbon setting must match the ribbon cartridge physically loaded in the printer. A wrong setting wastes blank cards.",
        link: { label: "Open printer policy", href: "/admin/id-cards/policy" },
      },
      {
        action: "Confirm **single-sided or double-sided** printing.",
        detail:
          "Single-sided prints the front only — faster and cheaper. Double-sided prints front and back in one pass and uses twice the ribbon. The template editor shows or hides the back-side layout to match.",
        prerequisite:
          "Set the policy BEFORE printing a batch — changing ribbon or sides mid-batch wastes cards and ribbon.",
      },
    ],
  },
];

/** Printing group — gated by REQUIRES.operator in the registry. */
export const printSections: GuideSection[] = [
  {
    id: "print-one-card",
    title: "Print one card from a learner profile",
    steps: [
      {
        action: "Open the learner's profile from the **Learner Profiles** list.",
        detail:
          "Search by name, roll number, or register number, then open the profile of the learner who needs a card.",
        link: { label: "Open learner profiles", href: "/learners/profiles" },
      },
      {
        action: "Use the **Print ID card** action on the profile.",
        detail:
          "This creates one print job for that learner. If the learner already has a card being printed, you'll see a message instead of a duplicate job — one active job per person.",
        tip: "Check the learner's photograph on the profile before you print. With no photograph on file the card is refused, not printed with a placeholder — use Photo Check below to see who is affected before anyone queues.",
      },
    ],
  },
  {
    id: "bulk-print",
    title: "Print many cards at once",
    steps: [
      {
        action: "On the **Learner Profiles** list, select the learners who need cards.",
        detail:
          "Filter to the group you want first — a program, a year, a section — then use the bulk print action to queue one job per selected learner.",
        link: { label: "Open learner profiles", href: "/learners/profiles" },
      },
      {
        action: "Let the queue drain at its own pace.",
        detail:
          "Jobs print one at a time in the order they were queued. You don't need to keep the page open — the queue keeps working.",
        tip: "Learners who already have an active print job are skipped, not duplicated.",
      },
    ],
  },
  {
    id: "photo-check",
    title: "See who cannot be printed yet",
    steps: [
      {
        action: "Open **Photo Check** under Admin → ID Cards and pick a college.",
        detail:
          "It lists the people a card cannot be printed for yet, worst first, so the photo drive has a list to work down instead of finding out one person at a time at the counter.",
        link: { label: "Open Photo Check", href: "/admin/id-cards/photo-check" },
      },
      {
        action: "Read the two states.",
        detail:
          "**No photograph** — no card can be printed at all; this is the drive list and the page opens on it. A picture from the learner's own login account does not count here. **Ready to print** — an institutional photograph is on file and nothing needs doing.",
      },
      {
        action: "Use **Export** to hand the list to whoever is taking the photographs.",
        detail:
          "It writes the list currently on screen to a spreadsheet. Nothing on this page changes a record — every row links out to the learner's own screen, because the fix is a photograph somebody has to take.",
      },
    ],
  },
  {
    id: "watch-the-queue",
    title: "Watch progress on the print queue",
    steps: [
      {
        action: "Open the **Print Queue** to see every job and its status.",
        detail:
          "The page refreshes itself every 5 seconds. Each job moves through: **Pending** (waiting) → **Rendering** (card image being prepared) → **Sent to printer** (the office print station has it) → **Printed** (done). **Failed** means something went wrong.",
        link: { label: "Open the print queue", href: "/admin/id-cards/print-queue" },
      },
      {
        action: "If a job shows **Failed**, read its result message first.",
        detail:
          "Common causes: the print station is unreachable, the ribbon ran out, or the card feeder is empty. Fix the physical cause, then press **Retry** on the job.",
        tip: "Jobs stuck on **Sent to printer** usually mean the office print station is off or offline — check the printer and the bridge machine before retrying.",
      },
      {
        action: "Use **Cancel** to remove a job that's still **Pending**.",
        detail:
          "Only jobs that haven't started printing can be cancelled. Once a job reaches the printer, let it finish or fail.",
      },
    ],
  },
];

/** Module-only "Words to know" — consumed by MODULE_GLOSSARIES in the registry. */
export const glossary: GlossaryTerm[] = [
  {
    term: "Template",
    def: "The card design: which fields print where on the front and back, and which photo source to use.",
  },
  {
    term: "Printer policy",
    def: "The printer settings — ribbon type and single- or double-sided printing. Must match the physical printer setup.",
  },
  {
    term: "Ribbon",
    def: "The ink cartridge inside the card printer. Each card printed uses a panel of ribbon; double-sided uses twice as much.",
  },
  {
    term: "Print job",
    def: "One card for one learner, moving through the queue: Pending → Rendering → Sent to printer → Printed (or Failed).",
  },
  {
    term: "Print bridge",
    def: "A small program on the office computer that checks MyJKKN every few seconds, picks up ready jobs, and sends them to the card printer.",
  },
];

export const GUIDES: { lanes: { registrar: IdCardsLane }; glossary: GlossaryTerm[] } = {
  lanes: {
    registrar: {
      title: "ID Card Printing",
      tagline:
        "Design the card, check the printer, print one card or a whole batch, and watch the queue.",
      whyItMatters:
        "The ID card is the one thing every learner carries every day. Getting the template and printer settings right up front means every card after that is a two-click job.",
      startHere: { label: "Open ID Cards", href: "/admin/id-cards" },
      journey: [
        "Open Admin → ID Cards",
        "Set up the template",
        "Check the printer policy",
        "Check who has no photograph",
        "Print a card",
        "Bulk print a batch",
        "Watch the queue",
      ],
      sections: [...entrySections, ...setupSections, ...printSections],
    },
  },
  glossary,
};

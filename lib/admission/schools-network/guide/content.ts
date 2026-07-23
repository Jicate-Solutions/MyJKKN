/**
 * Schools Network — Smart Guide content.
 *
 * Installed via the /smart-guide convention (docs/guides/smart-guide-contributing-a-section.md).
 *
 * Two STAFF lanes (no learner / applicant audience — every viewer of these
 * screens is JKKN staff):
 *   - coordinator (schools_network.schools.view)    → the in-charge JKKN
 *                                                     faculty (outreach
 *                                                     coordinator) or program
 *                                                     lead working their
 *                                                     assigned schools
 *   - admin       (schools_network.partners.manage) → the Director / module
 *                                                     admin configuring
 *                                                     partners, master tables,
 *                                                     ownership and grants
 *
 * Headmasters interact through the separate HM portal at /schools-portal and
 * have their own guide surface (out of scope for this admin guide).
 *
 * All hrefs match the real page files under
 * `app/(routes)/admission/schools-network/`. Permission keys are the real
 * `schools_network.*` strings from lib/sidebarMenuLink.ts MENU_PERMISSIONS.
 */

import type { GuideBook } from './types';

/**
 * Permission keys gating which lanes a NON-owner viewer may switch to. Defined
 * ONCE and re-exported by the registry so a rename surfaces as a compile error,
 * not silent fail-open. Keys are OPAQUE — never split or parse them.
 */
export const REQUIRES = {
  coordinator: 'schools_network.schools.view',
  admin: 'schools_network.partners.manage',
} as const;

export const GUIDES: GuideBook = {
  lanes: {
    /* ────────────────────────────── ADMIN ────────────────────────────── */
    admin: {
      persona: 'admin',
      title: 'Schools Network Admin',
      tagline:
        'Wire the partners, assign the owners, and watch how the school network grows.',
      whyItMatters:
        "Every school relationship JKKN holds — Matric, CBSE, our own and the ones we engage with — needs a clear owner and a partner chain. Get the setup right and the network compounds; leave it un-owned and schools quietly go dormant before anyone notices.",
      requires: REQUIRES.admin,
      startHere: {
        label: 'Open the Schools Network',
        href: '/admission/schools-network',
      },
      journey: [
        'See every school in the network',
        'Configure program partners and their funding',
        'Assign JKKN owners to each school',
        'Read activity rollups and silence alerts',
      ],
      sections: [
        {
          id: 'see-the-network',
          title: 'See the whole network',
          steps: [
            {
              action: 'Open **Schools Network** to see every school in the system.',
              detail:
                'Every external K-12 school we engage with, plus our own Matric and CBSE schools, on one screen. Filter by ownership, status, district, owner or program partner.',
              prerequisite:
                'You need **Schools Network admin access**. If the page is blocked, ask a platform admin to grant the Schools Network admin permissions.',
              platforms: {
                web: 'Left sidebar → **Admission** → **Schools Network**.',
                mobile: 'Tap the menu (**☰**), then **Admission → Schools Network**.',
              },
              link: { label: 'Take me there', href: '/admission/schools-network' },
            },
            {
              action: 'Add a new school with **Add School**.',
              detail:
                'Mark it **external** for a partner school in the community, or **internal** for one of JKKN\'s own schools (in which case it ties to an institution). Capture location, intake year and status.',
              tip: 'Set the right ownership at creation — switching it later breaks the link to the institution record.',
              link: { label: 'Take me there', href: '/admission/schools-network/new' },
            },
            {
              action: 'Click a school name to open its **detail page**.',
              detail:
                'Tabs for Overview, Sessions, Contributions, Contacts and JKKN Owners — one place to see the full history of the relationship.',
              link: { label: 'Take me there', href: '/admission/schools-network' },
            },
          ],
        },
        {
          id: 'partners',
          title: 'Set up program partners and funding',
          steps: [
            {
              action: 'Open **Program Partners** to manage the funding chains.',
              detail:
                'CSR partners, grant foundations, corporate sponsors, government foundations — the external organisations that pay for or co-deliver our school work.',
              link: {
                label: 'Take me there',
                href: '/admission/schools-network/partners',
              },
            },
            {
              action: 'Add a partner with **Add Partner**.',
              detail:
                'Capture name, type (CSR / grant / corporate / govt foundation), contact, status. A school can be touched by any number of partners.',
              link: {
                label: 'Take me there',
                href: '/admission/schools-network/partners/new',
              },
            },
            {
              action: 'Open a partner to see the **rollup dashboard**.',
              detail:
                'Schools touched, sessions held, attendees reached, contributions delivered, grants received and outstanding — the full impact of that partnership in one card.',
              link: {
                label: 'Take me there',
                href: '/admission/schools-network/partners',
              },
            },
          ],
        },
        {
          id: 'ownership',
          title: 'Assign JKKN owners to each school',
          steps: [
            {
              action:
                'On a school\'s detail page, open the **JKKN Owners** tab and click **Assign**.',
              detail:
                'Pick a JKKN faculty member as **Outreach Coordinator** (responsible for the relationship) or a **Program Lead** (accountable for a partner\'s programme at this school).',
              tip:
                'A school without an active owner shows up in the silence-detector alert after 14 days of no activity — assign owners early so nobody has to chase a cold school later.',
              prerequisite:
                'Outreach coordinators and program leads must exist as users in MyJKKN first. The role determines what they can see and edit.',
              link: { label: 'Take me there', href: '/admission/schools-network' },
            },
            {
              action: 'Switch a school to **dormant** when activity tails off.',
              detail:
                'Active → Sustaining → Dormant → Inactive. The status drives reports and the silence-detector; keep it honest so you only chase the schools that need chasing.',
              link: { label: 'Take me there', href: '/admission/schools-network' },
            },
          ],
        },
      ],
    },

    /* ─────────────────────────── COORDINATOR ─────────────────────────── */
    coordinator: {
      persona: 'coordinator',
      title: 'Schools Network Coordinator',
      tagline:
        'Work your assigned schools: log every visit, every contribution, and never let one go silent.',
      whyItMatters:
        "Your schools only stay warm because you show up. Every visit, training, orientation or drop-by you log builds the relationship history that proves the network is real — and keeps the silence detector quiet.",
      requires: REQUIRES.coordinator,
      startHere: {
        label: 'Open My Schools',
        href: '/admission/schools-network',
      },
      journey: [
        'Open your assigned schools',
        'Log every session you conduct',
        'Record contributions you deliver',
        'Keep contacts up to date',
      ],
      sections: [
        {
          id: 'my-schools',
          title: 'Find your assigned schools',
          steps: [
            {
              action: 'Open **Schools Network** to see the schools you own.',
              detail:
                'If you are an outreach coordinator, the list defaults to the schools you are assigned to. If you are a program lead, you see the schools touched by your partner.',
              prerequisite:
                'You need to be assigned as a JKKN owner of at least one school. If your list is empty, ask the Schools Network admin to assign you.',
              link: { label: 'Take me there', href: '/admission/schools-network' },
            },
            {
              action: 'Click a school name to open its **detail page**.',
              detail:
                'Tabs for everything we have done at that school — sessions, contributions, contacts, owners. Start here whenever you are about to visit or contact the HM.',
              link: { label: 'Take me there', href: '/admission/schools-network' },
            },
          ],
        },
        {
          id: 'log-sessions',
          title: 'Log every session you conduct',
          steps: [
            {
              action: 'Click **Log Session** on a school\'s detail page (or from the table row menu).',
              detail:
                'Pick the type (visit, orientation, training, event, drop-by), when it happened, how many attended, the topic and any notes. Logged sessions feed reports and silence alerts.',
              tip:
                'Log the session the same day, not at the end of the week — details get lost and attendee counts get fuzzy.',
            },
            {
              action: 'Read the **Sessions** tab to see the school\'s full session history.',
              detail:
                'Every session by every JKKN owner, ordered most-recent first. Use it before a visit to remember what was discussed last time.',
            },
          ],
        },
        {
          id: 'contributions-and-contacts',
          title: 'Record contributions and keep contacts up to date',
          steps: [
            {
              action: 'Use **Log Contribution** when JKKN or a partner delivers something to the school.',
              detail:
                'Devices, branding kits, training materials, funds, websites — capture the kind, value, when delivered and the partner that paid. Evidence URLs (photos / receipts) attach to the record.',
            },
            {
              action: 'Keep school **Contacts** current in the Contacts tab.',
              detail:
                'Headmaster, principal, key teachers, alternates. The HM\'s email enables the school\'s HM-portal login (a separate read-only view); a wrong email means they cannot get in.',
              tip:
                'Mark the right person as primary — only ONE primary contact per school. The primary is who the silence-detector and reminders attribute to.',
            },
          ],
        },
      ],
    },
  },

  glossary: [
    {
      term: 'School',
      def: 'A K-12 school in JKKN\'s network — external (a partner school in the community) or internal (one of our own Matric / CBSE schools). The master record.',
    },
    {
      term: 'Ownership (external vs internal)',
      def: 'External schools live only in this module. Internal schools also have an `institution_id` linking to the existing institutions table — they are JKKN\'s own schools running on our infrastructure.',
    },
    {
      term: 'Status (active / sustaining / dormant / inactive)',
      def: 'How alive the relationship is. Active = regular contact. Sustaining = stable but quieter. Dormant = no contact in months. Inactive = closed. The silence detector and reports group by status.',
    },
    {
      term: 'JKKN owner',
      def: 'A faculty member or coordinator inside JKKN who is responsible for the relationship with a school — either an outreach coordinator (relationship owner) or a program lead (coordinator of a partner programme that touches this school).',
    },
    {
      term: 'Program partner',
      def: 'An external organisation that funds or co-delivers our school work — CSR arms (HP, NIIT), grant foundations, corporate sponsors, government foundations. A school can be touched by any number of partners.',
    },
    {
      term: 'Session',
      def: 'A real interaction we had with a school — a visit, an orientation, a training session, an event or a quick drop-by. Logging sessions builds the relationship history and keeps the silence detector quiet.',
    },
    {
      term: 'Contribution',
      def: 'Something we (or a partner) gave the school — a device, branding kit, training kit, funds, a website. Captured with value, delivered date, and the partner that paid.',
    },
    {
      term: 'Silence detector',
      def: 'A cron job that flags any school with no session in the last 14 days, fans out a notification to its primary owner, and surfaces in the admin alert view. Keeps schools from going silently cold.',
    },
    {
      term: 'HM portal',
      def: 'A separate, read-only portal at /schools-portal where headmasters sign in via magic-link to see their own school\'s record and submit short updates. Out of scope for this admin guide.',
    },
  ],

  plannedLocaleNote: 'A Tamil version is planned — English only for now.',
};

/**
 * Meetings (Universal Booking) — Smart Guide content.
 *
 * Installed mirroring the admission / campus-living / PDE installs: ONE
 * GuideBook drives the full /guide page, the in-app drawer, and the platform
 * "? Help" FAB on every Meetings screen, so the three surfaces can never drift.
 *
 * Two STAFF lanes, authored from the REAL production routes (jicate/main) under
 * the basePath `/meetings`:
 *   - host  (meetings.view)            → the everyday booking-page owner: connect
 *                                         Google, claim a link, pick what people
 *                                         can book, go live, and handle bookings.
 *                                         This is the ADOPTION lane — the whole
 *                                         point of the module is "every staff
 *                                         member has a booking link."
 *   - admin (meetings.analytics.view)  → the module operator: routing forms,
 *                                         automated reminders, webhooks, the
 *                                         embeddable widget, analytics, and the
 *                                         leadership adoption scoreboard.
 *
 * There is NO ungated baseline lane: people who BOOK a meeting do so from the
 * public internet (`/meet/<handle>`), which is not a guide surface. Every viewer
 * of the in-app `/meetings/*` screens is staff.
 *
 * DESIGN NOTE (leadership): the leadership framing (Wedge 3 of the leverage
 * memo — "your page sets the example") is folded INTO the host lane as its final
 * section, NOT a separate lane, because a principal's setup is identical to a
 * counsellor's. Split it out later only if leadership needs distinct steps.
 *
 * ACCURACY NOTES:
 *   - All hrefs are taken verbatim from lib/sidebarMenuLink.ts (the Meetings
 *     submenu) and the live page files; `[uid]` detail routes are referenced via
 *     their list route (/meetings/inbox) since a step can't know a booking id.
 *   - Permission keys are real `meetings.*` strings from lib/sidebarMenuLink.ts
 *     MENU_PERMISSIONS.
 */

import type { GuideBook } from './types';

/**
 * Permission keys gating which lanes a NON-owner viewer may switch to. Defined
 * ONCE here and read by the central resolver (via lanes[p].requires in the
 * registry), so a rename is a compile error, not a silently fail-open lane.
 * Keys are real meetings.* strings from lib/sidebarMenuLink.ts MENU_PERMISSIONS:
 *   - host  → meetings.view            (module access — every staff member who
 *                                        can open Meetings can own a booking page)
 *   - admin → meetings.analytics.view  (the operator key — gates the adoption
 *                                        scoreboard + analytics, the admin's core)
 * Keys are OPAQUE — never split or parse them.
 */
export const REQUIRES = {
  host: 'meetings.view',
  admin: 'meetings.analytics.view',
} as const;

export const GUIDES: GuideBook = {
  lanes: {
    /* ──────────────────────────── HOST ──────────────────────────── */
    host: {
      persona: 'host',
      title: 'Your Booking Page',
      tagline:
        'Share one link that lets anyone pick a time that is genuinely free on your calendar — and stop playing phone tag.',
      whyItMatters:
        'Your booking link reads your real Google Calendar, so it never offers a slot during a class or a meeting you already have. The person booking sees only your name and what you do — never your phone or email. Set it up once, share it forever.',
      requires: REQUIRES.host,
      startHere: { label: 'Set up your booking page', href: '/meetings/availability' },
      journey: [
        'Connect your Google Calendar',
        'Claim your link and go live',
        'Pick what people can book',
        'Share your link',
        'Handle your bookings',
        'Find a time for a group',
      ],
      sections: [
        {
          id: 'set-up',
          title: 'Set up your page in 3 steps',
          steps: [
            {
              action: 'Open **My Availability & Page** — this is where your booking page lives.',
              detail:
                'Everything to get live is on this one screen: connect Google, claim your link, and switch your page on.',
              platforms: {
                web: 'Left sidebar → **Meetings** → **My Availability & Page**.',
                mobile: 'Tap **More (⋯)** in the bottom bar → **Meetings → My Availability & Page**.',
              },
              link: { label: 'Take me there', href: '/meetings/availability' },
            },
            {
              action: '**Step 1 — Connect Google Calendar.** Click **Connect Google Calendar** and approve on the consent screen.',
              detail:
                'This is the one thing only you can do — it links your real calendar so the system never offers a time you are busy. It takes one click and a quick Google approval.',
              prerequisite:
                'Your page cannot go public until Google is connected. This protects you from ever being double-booked. If you skip it, the "Page is public" switch stays locked.',
              tip: 'Use your JKKN Google account so your work calendar (classes, meetings) is the one that protects your slots.',
            },
            {
              action: '**Step 2 — Confirm your link.** Your link is pre-filled from your name as **jkkn.ai/meet/your-name** — edit it once if you like, then save.',
              detail:
                'This short, memorable link is what you share with anyone who wants to book you. You can change the headline shown on your page here too.',
            },
            {
              action: '**Step 3 — Switch "Page is public" on** to go live.',
              detail:
                'Once Google is connected, flip the switch and your page is live. Copy the link straight from this screen with the copy button.',
              tip: 'The public switch only turns on after Google is connected — that is the safety check, not a bug.',
            },
          ],
        },
        {
          id: 'meeting-types',
          title: 'Pick what people can book',
          steps: [
            {
              action: 'Open **Meeting Types** to choose the kinds of meeting people can book with you.',
              detail:
                'A meeting type is one bookable option — for example a 15-minute phone call, a 30-minute in-person meeting, or an online meeting. Each has its own length and how it happens (in person, by phone, or online).',
              platforms: {
                web: 'Left sidebar → **Meetings** → **Meeting Types**.',
                mobile: 'Tap **More (⋯)** → **Meetings → Meeting Types**.',
              },
              link: { label: 'Take me there', href: '/meetings/manage' },
            },
            {
              action: 'Set each type as **in person**, **phone**, or **online**.',
              detail:
                'For an online type, a meeting link is created automatically when someone books. For a phone type, it means "you will call them" — useful for a sensitive or quick conversation.',
              tip: 'Start with one simple type (a 30-minute in-person meeting is created for you by default). You can add more later.',
            },
            {
              action: 'Choose your meeting link provider in **My Availability & Page** if your type is online.',
              detail:
                'Pick whether online meetings use Google Meet, Zoom, or Teams. The right link is then attached to every online booking automatically.',
              link: { label: 'Take me there', href: '/meetings/availability' },
            },
          ],
        },
        {
          id: 'availability',
          title: 'Set when you are available',
          steps: [
            {
              action: 'Set your **working hours** on My Availability & Page so bookings only land when you want them.',
              detail:
                'Pick the days and times you are open to meetings. People can only book inside these hours — and never on top of something already on your Google Calendar.',
              link: { label: 'Take me there', href: '/meetings/availability' },
            },
            {
              action: 'Block out **holidays** and days off on the same screen.',
              detail:
                'Add dates you are away so no one can book you then, even if the hours would normally be open.',
            },
          ],
        },
        {
          id: 'share',
          title: 'Share your link',
          steps: [
            {
              action: 'Share **jkkn.ai/meet/your-name** anywhere — WhatsApp, email, your signature, a poster.',
              detail:
                'Anyone with the link can see your available times and book one. They never need a login, and they never see your phone or email.',
              tip: 'Put the link in your email signature and WhatsApp "about" — that is the single fastest way to stop the back-and-forth.',
            },
            {
              action: 'Open your own page to see exactly what people booking you will see.',
              detail:
                'Check it shows the right meeting types and that no slots appear during your classes — a quick sanity check before you share it widely. The live link to your page is on My Availability & Page, next to the copy button.',
              link: { label: 'Open My Availability & Page', href: '/meetings/availability' },
            },
          ],
        },
        {
          id: 'handle-bookings',
          title: 'Handle your bookings',
          steps: [
            {
              action: 'Open the **Inbox** to see everything booked with you.',
              detail:
                'Every upcoming and past booking in one place, with who booked, when, and which meeting type.',
              platforms: {
                web: 'Left sidebar → **Meetings** → **Inbox**.',
                mobile: 'Tap **More (⋯)** → **Meetings → Inbox**.',
              },
              link: { label: 'Take me there', href: '/meetings/inbox' },
            },
            {
              action: 'Open a booking to **cancel or reschedule** it when plans change.',
              detail:
                'Click any booking in your Inbox to see its details and, if you need to, cancel it or move it to a new time — the person who booked is notified automatically.',
              tip: 'Cancelling from here frees the slot and updates your Google Calendar, so the time opens back up for someone else.',
            },
            {
              action: 'Check **Contacts** to see who you have met and their booking history.',
              detail:
                'A running list of the people who have booked you, so you can see past and upcoming meetings with each one.',
              link: { label: 'Take me there', href: '/meetings/contacts' },
            },
          ],
        },
        {
          id: 'schedule-it-yourself',
          title: 'Schedule a meeting yourself',
          steps: [
            {
              action:
                'Use **Schedule a Meeting** when you already know the time and the people — you do not have to wait for anyone to book you.',
              detail:
                'Your booking page works the other way round: people pick a free slot from you. This is the opposite direction. Pick the time, add the people, and MyJKKN books it, creates the Google Meet link and emails everyone the invitation.',
              platforms: {
                web: 'Left sidebar → **Meetings** → **Schedule a Meeting**.',
                mobile: 'Tap **More (⋯)** → **Meetings → Schedule a Meeting**.',
              },
              link: { label: 'Take me there', href: '/meetings/schedule' },
            },
            {
              action: 'Add **several people** to the same meeting, not just one.',
              detail:
                'Search JKKN team members and learners by name, pick anyone who has booked you before, or type any email address — so external examiners, candidates and parents can be invited too.',
              tip: 'Everyone you add lands on the same Google Calendar invitation, so nobody is left out of the Meet link.',
            },
            {
              action: 'Choose **Online** and the Google Meet link is created for you.',
              detail:
                'In person asks you where, Phone means you call them, and Online generates the join link automatically. It needs your Google Calendar connected — the same connection your booking page uses.',
              link: { label: 'Check my Google connection', href: '/meetings/availability' },
            },
            {
              action: 'If MyJKKN says the time is already taken, **pick another slot**.',
              detail:
                'It will never move your meeting quietly to a different time. If something else is already on your calendar at that hour, it tells you and lets you choose again.',
            },
          ],
        },
        {
          id: 'group-meetings',
          title: 'Find a time for a group (Polls)',
          steps: [
            {
              action: 'Use **Polls** when several people need to agree on one time — a viva panel, a committee, a guest.',
              detail:
                'Propose a few candidate times, send the poll, and let everyone vote on what suits them. You then confirm the winning time and it books for everyone.',
              platforms: {
                web: 'Left sidebar → **Meetings** → **Polls**.',
                mobile: 'Tap **More (⋯)** → **Meetings → Polls**.',
              },
              link: { label: 'Take me there', href: '/meetings/polls' },
            },
            {
              action: 'Invite people who are **not** on JKKN — external examiners, guests, parents.',
              detail:
                'Voters do not need a login. This is the one job a WhatsApp thread cannot do well: line up 3–5 calendars (some outside JKKN) in a single round instead of phoning each person.',
            },
          ],
        },
        {
          id: 'for-leaders',
          title: 'If you lead a team',
          steps: [
            {
              action: 'Set up your own page first — when leaders are on it, everyone follows.',
              detail:
                'When principals and HODs each have a live booking link, "do you have a booking link?" becomes a normal question across the institution. Your page is the fastest way to make this the norm in your department.',
              tip: 'A live page removes the "is the Principal free Thursday?" phone-tag through a PA — people just book a free slot directly.',
            },
            {
              action: 'Ask your department to set up their pages too, and point them at this guide.',
              detail:
                'Every staff member can have a link in three steps. A department where everyone is bookable runs with far less coordination overhead.',
            },
          ],
        },
      ],
    },

    /* ──────────────────────────── ADMIN ──────────────────────────── */
    admin: {
      persona: 'admin',
      title: 'Meetings Admin',
      tagline:
        'Route bookings to the right people, automate reminders, feed bookings into the CRM, and watch adoption climb.',
      whyItMatters:
        'The module only delivers value when staff are actually on it. Your job is to remove the friction: route enquiries to the right pool, turn on reminders so no one no-shows, and use the adoption scoreboard to see which departments are live and which need a nudge.',
      requires: REQUIRES.admin,
      startHere: { label: 'Open the Adoption scoreboard', href: '/meetings/adoption' },
      journey: [
        'Watch adoption by department',
        'Route enquiries with forms',
        'Automate reminders and follow-ups',
        'Read the analytics',
        'Wire bookings into other systems',
        'Embed booking on other sites',
      ],
      sections: [
        {
          id: 'watch-adoption',
          title: 'Watch adoption — the leading indicator',
          steps: [
            {
              action: 'Open the **Adoption** scoreboard to see who has a live booking page.',
              detail:
                'Adoption is reported by department, so you can see "Pharmacy: 18/22 staff live" at a glance and nudge the laggards. The honest early-warning is simple: are leaders on it? If the principals and HODs each have a live page, the rest follows.',
              prerequisite:
                'You need **Meetings analytics access** (meetings.analytics.view). If the page is blocked, ask your administrator to grant it.',
              platforms: {
                web: 'Left sidebar → **Meetings** → **Adoption**.',
                mobile: 'Tap **More (⋯)** → **Meetings → Adoption**.',
              },
              link: { label: 'Take me there', href: '/meetings/adoption' },
            },
            {
              action: 'Open **Analytics** for booking volume and outcomes.',
              detail:
                'How many bookings happened, by meeting type and over time — the numbers that tell you whether the tool is actually being used, not just set up.',
              link: { label: 'Take me there', href: '/meetings/analytics' },
            },
          ],
        },
        {
          id: 'routing-forms',
          title: 'Route enquiries to the right people',
          steps: [
            {
              action: 'Build a **Routing Form** to send each booker to the right host or pool.',
              detail:
                'A routing form asks a few questions (programme of interest, location, language) and then sends the person to the right counsellor pool or host based on their answers — instead of everyone landing on one inbox.',
              platforms: {
                web: 'Left sidebar → **Meetings** → **Routing Forms**.',
                mobile: 'Tap **More (⋯)** → **Meetings → Routing Forms**.',
              },
              link: { label: 'Take me there', href: '/meetings/routing-forms' },
            },
            {
              action: 'Use routing for admission counselling — the highest-leverage case.',
              detail:
                'Point applicants at one routed entry, and the form hands each enquiry to the least-loaded counsellor in the right college pool, with no manual assignment over WhatsApp.',
            },
          ],
        },
        {
          id: 'workflows',
          title: 'Automate reminders and follow-ups',
          steps: [
            {
              action: 'Set up **Workflows** so reminders and follow-ups send themselves.',
              detail:
                'A workflow fires on a booking event — for example, send a reminder 24 hours and 1 hour before the meeting, or a thank-you afterwards. This is the single biggest lever on no-shows.',
              platforms: {
                web: 'Left sidebar → **Meetings** → **Workflows**.',
                mobile: 'Tap **More (⋯)** → **Meetings → Workflows**.',
              },
              link: { label: 'Take me there', href: '/meetings/workflows' },
            },
          ],
        },
        {
          id: 'integrations',
          title: 'Wire bookings into other systems',
          steps: [
            {
              action: 'Use **Webhooks** to send booking events to other systems in real time.',
              detail:
                'A webhook fires a message the moment a booking is made, confirmed, or cancelled — so another system (a CRM, a sheet, an automation) can react without anyone copying data by hand.',
              platforms: {
                web: 'Left sidebar → **Meetings** → **Webhooks**.',
                mobile: 'Tap **More (⋯)** → **Meetings → Webhooks**.',
              },
              link: { label: 'Take me there', href: '/meetings/webhooks' },
            },
            {
              action: 'Know that confirmed counselling bookings already log to the **admission CRM**.',
              detail:
                'When a booking is confirmed against an admission lead, it is recorded as an activity on that lead automatically — so a counselling call becomes a tracked funnel event, not a number nobody has.',
            },
          ],
        },
        {
          id: 'embed',
          title: 'Embed booking on other sites',
          steps: [
            {
              action: 'Open **Embed & Theming** to drop a booking widget into another page.',
              detail:
                'Generate a small embed you can place on a department microsite, the alumni portal, or a campaign landing page, so people can book without leaving that site. You can match it to your brand colours here.',
              platforms: {
                web: 'Left sidebar → **Meetings** → **Embed & Theming**.',
                mobile: 'Tap **More (⋯)** → **Meetings → Embed & Theming**.',
              },
              link: { label: 'Take me there', href: '/meetings/embed' },
            },
          ],
        },
      ],
    },
  },

  glossary: [
    ['Booking page', 'Your personal page at jkkn.ai/meet/your-name where anyone can pick a free time and book a meeting with you.'],
    ['Handle', 'The short name in your link — the "your-name" part of jkkn.ai/meet/your-name. You claim it once on My Availability & Page.'],
    ['Meeting type', 'One bookable option you offer — for example a 15-minute phone call or a 30-minute in-person meeting. Each has its own length and how it happens (in person, phone, or online).'],
    ['Google connection', 'Linking your real Google Calendar so the system only offers times you are actually free — and never books over a class or an existing meeting. Your page cannot go public without it.'],
    ['Public switch', 'The toggle that makes your page live. It only turns on after Google is connected, so you can never be double-booked once you go live.'],
    ['Poll', 'A way to find one time that several people share: propose a few options, let everyone vote (no login needed), then confirm the winning time. Built for vivas, panels, and committees.'],
    ['Routing form', 'A short set of questions that sends each booker to the right host or pool based on their answers — used most for admission counselling.'],
    ['Workflow', 'An automatic action that fires on a booking — most often a reminder before the meeting or a follow-up after, to cut no-shows.'],
    ['Webhook', 'A message sent to another system the instant a booking is made, confirmed, or cancelled, so that system can react automatically.'],
    ['Adoption scoreboard', 'The admin view that shows, by department, how many staff have a live booking page — the leading indicator of whether the tool is being used.'],
  ].map(([term, def]) => ({ term, def })),

  plannedLocaleNote: 'A Tamil version is planned — English only for now.',
};

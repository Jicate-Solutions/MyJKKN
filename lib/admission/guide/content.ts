/**
 * Admission CRM — Smart Guide content.
 *
 * Installed via the /smart-guide skill (2026-06-15), mirroring the campus-living
 * and PDE installs: ONE GuideBook drives the full page, the in-app drawer, and
 * the "?Help" FAB on every Admission screen, so the three surfaces can never
 * drift.
 *
 * Two STAFF lanes, authored from the REAL production routes (jicate/main) under
 * the basePath `/admission`:
 *   - counsellor (admission.leads.view)    → the front-line operator who works
 *                                             leads, makes calls, books follow-ups,
 *                                             runs gate-entry and GD-PI duty
 *   - admin      (admission.settings.view) → configures the module, runs
 *                                             marketing + consultants, watches
 *                                             analytics, cleans data
 *
 * There is NO ungated baseline lane: the Admission CRM has no self-service
 * applicant audience inside the platform — every user of these screens is staff.
 * (Prospective students interact through public lead forms, WhatsApp, expos and
 * the chatbot, none of which are guide surfaces.)
 *
 * SCOPE NOTE (verified, not assumed): the primary admissions workflow lives
 * under `/admission/*` (key prefix `admission.*`). A SEPARATE, older "admissions"
 * view exists in the Learners module at `/learners/enquiries` + `/learners/
 * applications` (key prefix `learners.admissions.*`). That is a different module
 * and is intentionally NOT documented here — this guide covers the `/admission`
 * CRM only.
 *
 * ACCURACY NOTES:
 *   - All hrefs are taken verbatim from app/(routes)/admission/nav-config.ts and
 *     the live page files; `[id]` detail routes are stripped to their list route.
 *   - Permission keys are real `admission.*` strings from lib/sidebarMenuLink.ts
 *     MENU_PERMISSIONS, composed the same way the pages' PermissionGuard composes
 *     them (module="admission" + action → "admission.<action>").
 */

import type { GuideBook } from './types';

/**
 * Permission keys gating which lanes a NON-owner viewer may switch to. Defined
 * ONCE here and read by the lane detector (via lanes[p].requires), so a rename
 * is a compile error, not a silently fail-open lane (auth-adapters.md rule).
 * Keys are real admission.* strings from lib/sidebarMenuLink.ts MENU_PERMISSIONS:
 *   - counsellor → admission.leads.view    (the front-line lead-working gate;
 *                                            the counsellor's My Queue, leads
 *                                            list and lead detail all check it)
 *   - admin      → admission.settings.view  (the module-configuration gate; the
 *                                            distinctly-admin "set the rules" key)
 * Keys are OPAQUE — never split or parse them.
 */
export const REQUIRES = {
  counsellor: 'admission.leads.view',
  admin: 'admission.settings.view',
} as const;

export const GUIDES: GuideBook = {
  lanes: {
    /* ──────────────────────────── ADMIN ──────────────────────────── */
    admin: {
      persona: 'admin',
      title: 'Admin Guide',
      tagline:
        'Set the rules, wire the sources, run marketing and partners, and watch the funnel.',
      whyItMatters:
        "Every lead that reaches a counsellor was shaped by your setup: which sources are switched on, how leads get assigned, what the application form asks, and which campaigns are running. Get the configuration right once and the whole team works a clean, well-routed pipeline; get it wrong and counsellors chase duplicates and dead numbers.",
      requires: REQUIRES.admin,
      startHere: { label: 'Open the Admission Dashboard', href: '/admission/dashboard' },
      journey: [
        'Read the funnel on the dashboard',
        'Configure sources, statuses, assignment and the form',
        'Open the season and set fees and seats',
        'Run marketing campaigns and manage consultant partners',
        'Watch analytics, clean the data, and read AI insights',
      ],
      sections: [
        {
          id: 'see-the-funnel',
          title: 'See the whole funnel',
          steps: [
            {
              action: 'Open the **Admission Dashboard** to read this season at a glance.',
              detail:
                'Total leads, new this week, conversion rate, and the funnel from enquiry to admitted — the single screen that tells you whether the pipeline is healthy.',
              prerequisite:
                'You need **Admission admin access**. If a settings page is blocked, ask your administrator to grant the admission settings permission.',
              platforms: {
                web: 'Left sidebar → **Admission** → the **Dashboard** tab.',
                mobile: 'Tap the menu (**☰**), then **Admission → Dashboard**.',
              },
              link: { label: 'Take me there', href: '/admission/dashboard' },
            },
            {
              action: 'Open **Analytics** for the deeper breakdowns.',
              detail:
                'Funnel by program, drop-off points, time-to-convert, and counsellor performance — use it to find where leads stall.',
              link: { label: 'Take me there', href: '/admission/analytics' },
            },
            {
              action: 'Use the **Group Dashboard** to compare institutions side by side.',
              detail:
                'Year-on-year numbers across every institution in the group, for a board-level view of the whole admissions season.',
              link: { label: 'Take me there', href: '/admission/group-dashboard' },
            },
          ],
        },
        {
          id: 'configure-intake',
          title: '1. Configure how leads come in and get routed',
          steps: [
            {
              action: 'Open **Settings → Sources** and switch on the channels you use.',
              detail:
                'A source is where a lead came from — a campaign, a walk-in, a consultant, social. Only active sources appear in the New Lead form and in reports.',
              link: { label: 'Take me there', href: '/admission/settings/sources' },
            },
            {
              action: 'Set the **lead Statuses** that describe each stage.',
              detail:
                'Statuses are the stages a lead moves through (New, Contacted, Interested, Application, Admitted, and so on). Counsellors update these as they work; reports group by them.',
              link: { label: 'Take me there', href: '/admission/settings/statuses' },
            },
            {
              action: 'Set **Assignment Rules** so new leads land with the right counsellor.',
              detail:
                'Decide who gets which leads — by program, institution, source, or an even round-robin split — so nothing sits unassigned.',
              tip: 'A lead with no owner is a lead nobody calls. Make sure every program and source is covered by a rule.',
              link: { label: 'Take me there', href: '/admission/settings/assignment-rules' },
            },
            {
              action: 'Build the **application form** in Form Builder.',
              detail:
                'Add the fields you want applicants to fill, set which are required, and publish. The public lead form and the in-app application both read from here.',
              link: { label: 'Take me there', href: '/admission/settings/forms' },
            },
            {
              action: 'Tidy the dropdown values in **Lookups**.',
              detail:
                'Quotas, community categories, castes, and accommodation types — the controlled lists counsellors pick from. Clean lookups keep the data reportable.',
              link: { label: 'Take me there', href: '/admission/settings/lookups' },
            },
          ],
        },
        {
          id: 'season-money-seats',
          title: '2. Open the season: years, fees and seats',
          steps: [
            {
              action: 'Open or roll over the **Admission Year** before you start taking leads.',
              detail:
                'Every lead and application is tagged to an admission year. Create the new year and mark it active so the team works the right intake.',
              prerequisite:
                'Leads and applications must be attached to an active admission year. If the year is missing, counsellors cannot file new leads correctly.',
              link: { label: 'Take me there', href: '/admission/settings/years' },
            },
            {
              action: 'Set the **Fees Structure** for each program.',
              detail:
                'Define the fee heads and amounts applicants will be quoted. You can clone last year’s structure and adjust rather than start from scratch.',
              link: { label: 'Take me there', href: '/admission/settings/fees-structure' },
            },
            {
              action: 'Lay out **Seat Configuration** — how many seats per program and quota.',
              detail:
                'Seat counts feed the admitted-versus-available view, so the team knows when a program is filling up.',
              link: { label: 'Take me there', href: '/admission/settings/seat-config' },
            },
            {
              action: 'Set the document **Checklists** an applicant must complete.',
              detail:
                'The list of documents and steps a lead has to clear before admission. Counsellors tick these off on each application.',
              link: { label: 'Take me there', href: '/admission/settings/checklists' },
            },
          ],
        },
        {
          id: 'marketing',
          title: '3. Run marketing and outreach',
          steps: [
            {
              action: 'Open **Marketing → Campaigns** to launch and track outreach.',
              detail:
                'Build a campaign, attach tracked links, and watch leads, cost, and ROI come back against it. The compare view sets two campaigns side by side.',
              link: { label: 'Take me there', href: '/admission/marketing/campaigns' },
            },
            {
              action: 'Set up **Expos** for on-ground events.',
              detail:
                'Create an event, generate a QR capture form, and let staff log walk-up leads on a phone. Each expo has its own report and analytics.',
              link: { label: 'Take me there', href: '/admission/marketing/expos' },
            },
            {
              action: 'Wire WhatsApp and chat with **Chat** and **Chatbot**.',
              detail:
                'Chat is your team replying to inbound messages; Chatbot answers common questions automatically and hands off to a human when needed.',
              link: { label: 'Take me there', href: '/admission/marketing/chat' },
            },
            {
              action: 'Recover cooling leads with **Re-engagement** and **Remarketing**.',
              detail:
                'Re-engagement chases people who started a form but did not finish; Remarketing builds audiences to advertise to again.',
              link: { label: 'Take me there', href: '/admission/marketing/re-engagement' },
            },
            {
              action: 'Connect Meta accounts under the **Social** tab.',
              detail:
                'Link Facebook and Instagram, pull Lead Ads straight into the CRM, and read attribution (which post or ad produced which lead). Set up the Meta Pixel and audiences here too.',
              tip: 'Some Social and telephony pages are restricted. If you see a "no access" card instead of the page, ask for the matching permission — the screen tells you which.',
              link: { label: 'Take me there', href: '/admission/social' },
            },
          ],
        },
        {
          id: 'consultants',
          title: '4. Manage consultant partners',
          steps: [
            {
              action: 'Open **Consultants** to manage your referral partners.',
              detail:
                'Consultants are external agents who refer students. Each has a profile, a referral history, and a commission record.',
              link: { label: 'Take me there', href: '/admission/consultants' },
            },
            {
              action: 'Add a partner with **New Consultant**.',
              detail:
                'Capture their details and tier so their referrals are tracked and credited correctly from day one.',
              link: { label: 'Take me there', href: '/admission/consultants/new' },
            },
            {
              action: 'Track **Commissions** and **Referrals** as leads convert.',
              detail:
                'Commissions shows what each partner has earned; Referrals shows the leads they sent and where each one reached in the funnel.',
              link: { label: 'Take me there', href: '/admission/consultants/commissions' },
            },
          ],
        },
        {
          id: 'data-and-insight',
          title: '5. Keep the data clean and read the AI insights',
          steps: [
            {
              action: 'Run **Data Quality** checks regularly.',
              detail:
                'Profile the data, merge duplicate leads, and validate phone numbers so counsellors are not calling dead or repeated numbers.',
              tip: 'Duplicates split one applicant across two counsellors and double-count your funnel. Deduplicate before a big push, not after.',
              link: { label: 'Take me there', href: '/admission/data-quality' },
            },
            {
              action: 'Open **AI Insights** for an automatic read of the season.',
              detail:
                'Plain-language summaries of what is working, where leads drop off, and which applications are most likely to convert.',
              link: { label: 'Take me there', href: '/admission/insights' },
            },
            {
              action: 'Tune everything else in **Settings → Templates** and **Workflows**.',
              detail:
                'Message and document templates, WhatsApp numbers, and the automated workflows that fire when a lead changes status all live in Settings.',
              link: { label: 'Take me there', href: '/admission/settings/templates' },
            },
          ],
        },
      ],
    },

    /* ──────────────────────────── COUNSELLOR ──────────────────────────── */
    counsellor: {
      persona: 'counsellor',
      title: 'Counsellor Guide',
      tagline:
        'Work your assigned leads: call them, log every touch, book the next follow-up, and move them toward admission.',
      whyItMatters:
        "A lead goes cold fast. The counsellors who win are not the ones with the most leads — they are the ones who call back first, log what was said, and never miss a follow-up. Your work queue and call log are how you make sure no warm lead slips through.",
      requires: REQUIRES.counsellor,
      startHere: { label: 'Open My Queue', href: '/admission/leads/work' },
      journey: [
        'Start the day with your briefing',
        'Work your queue, lead by lead',
        'Call, then log every call',
        'Book the next follow-up before you move on',
        'Run gate entry and GD-PI when on duty',
      ],
      sections: [
        {
          id: 'start-the-day',
          title: 'Start the day',
          steps: [
            {
              action: 'Read your **Daily Briefing** first thing.',
              detail:
                'A short summary of what needs your attention today — overdue follow-ups, new leads, and the day’s priorities.',
              prerequisite:
                "You need leads assigned to you. If your queue is empty, ask your team lead to assign you leads or check the assignment rules.",
              platforms: {
                web: 'Left sidebar → **Admission** → **Counselors** → **Daily Briefing**.',
                mobile: 'Tap the menu (**☰**), then **Admission → Counselors → Daily Briefing**.',
              },
              link: { label: 'Take me there', href: '/admission/counselors/briefing' },
            },
            {
              action: 'Open the **Daily View** for your numbers and follow-up list.',
              detail:
                'Your KPIs for the day, the follow-ups due now, any unassigned leads you can pick up, and a live log of what you have done so far.',
              link: { label: 'Take me there', href: '/admission/counselors/daily-view' },
            },
          ],
        },
        {
          id: 'work-the-queue',
          title: 'Work your queue, lead by lead',
          steps: [
            {
              action: 'Open **My Queue** — your leads, one card at a time, built for the phone.',
              detail:
                'Each card shows the lead’s details and recent history with quick buttons to call, WhatsApp, add a note, or mark them unreachable. Move to the next card when you are done.',
              tip: 'Work top to bottom. The queue is ordered so the leads that need attention first are at the top.',
              link: { label: 'Take me there', href: '/admission/leads/work' },
            },
            {
              action: 'Open the full **Leads** list when you need to search or filter.',
              detail:
                'The complete table of leads you can see — filter by status, source, program, or date, and sort to find exactly who you are looking for.',
              link: { label: 'Take me there', href: '/admission/leads' },
            },
            {
              action: 'Click a lead to open its **detail page** and full timeline.',
              detail:
                'Every call, message, note and status change on one screen. Update the status as the conversation moves the lead forward.',
              tip: 'Always set the right status after a call — that is what keeps the funnel and your reports honest.',
              link: { label: 'Take me there', href: '/admission/leads' },
            },
            {
              action: 'Add a **New Lead** when someone reaches you directly.',
              detail:
                'A walk-in, a phone enquiry, or a referral that is not already in the system — capture them so they are tracked and assigned.',
              link: { label: 'Take me there', href: '/admission/leads/new' },
            },
          ],
        },
        {
          id: 'calls-and-followups',
          title: 'Call, log, and book the next step',
          steps: [
            {
              action: 'Make the call, then **log it** — outcome, notes, and what happens next.',
              detail:
                'Use the call button on the lead card or detail page. Logging the call records the outcome and keeps the lead’s history complete for whoever picks it up next.',
              tip: 'Log the call right after you hang up, not at the end of the day — by then you have forgotten the details that matter.',
            },
            {
              action: 'Review everything in **Call Logs**.',
              detail:
                'Your full call history with outcomes and stats — how many you made, how many connected, and what came of them.',
              link: { label: 'Take me there', href: '/admission/counselors/calls' },
            },
            {
              action: 'Set a **Reminder** for the next follow-up before you leave the lead.',
              detail:
                'A dated nudge so a warm lead never slips. Reminders show up on your Daily View and briefing when they fall due.',
              tip: 'Never close a lead card without booking the next contact. "I will remember" is how leads go cold.',
              link: { label: 'Take me there', href: '/admission/counselors/reminders' },
            },
            {
              action: 'Watch your **Activity Alerts** for leads going quiet.',
              detail:
                'Flags for leads that have had no contact in too long, so you can step in before they cool off completely.',
              link: { label: 'Take me there', href: '/admission/counselors/alerts' },
            },
          ],
        },
        {
          id: 'on-duty',
          title: 'On duty: gate entry and GD-PI',
          steps: [
            {
              action: 'Use **Gate Entry** to capture visitors as they arrive.',
              detail:
                'A fast kiosk form for the bare minimum — name and phone — when a prospective student walks in at the gate. The same record can be enriched later from Leads, so there is no duplicate entry.',
              tip: 'Keep it quick: capture name and number, hit save, and the form resets for the next visitor.',
              link: { label: 'Take me there', href: '/admission/gate-entry' },
            },
            {
              action: "Check **Today's Entries** to see who came in.",
              detail: 'The running list of gate entries logged today, so the team can follow up on every walk-in.',
              link: { label: 'Take me there', href: '/admission/gate-entry/today' },
            },
            {
              action: 'When you are evaluating, open **GD-PI** for scheduled interviews.',
              detail:
                'Group Discussion and Personal Interview rounds. Open a session to see candidates and record scores. (GD-PI is a restricted function — if the page is blocked, you have not been assigned to it.)',
              prerequisite:
                'GD-PI access is granted separately from regular lead work. If you do not see the GD-PI tab, you are not an assigned evaluator — ask your administrator.',
              link: { label: 'Take me there', href: '/admission/gd-pi' },
            },
          ],
        },
      ],
    },
  },

  glossary: [
    ['Lead', 'A prospective student who has shown interest — the core record in the CRM. A lead carries a source, a status, an owner (counsellor), and a full history of contact.'],
    ['Enquiry vs Application', 'An enquiry is early interest — someone who asked about a course. An application is a lead who has formally applied with a filled form and documents. Leads move from enquiry toward application as they progress.'],
    ['Source', 'Where a lead came from — a campaign, a walk-in, a consultant, social media. Only active sources appear in the New Lead form and in reports.'],
    ['Status', 'The stage a lead is at (New, Contacted, Interested, Application, Admitted, and so on). Counsellors update it as they work; reports group by it.'],
    ['Assignment rule', 'A setting that decides which counsellor a new lead lands with — by program, institution, source, or an even split. Keeps leads from sitting unassigned.'],
    ['My Queue', 'The mobile-first, one-card-at-a-time work list for a counsellor — their assigned leads ordered so the most urgent come first.'],
    ['Follow-up / Reminder', 'A dated nudge to contact a lead again. Booking one before leaving a lead is how a counsellor keeps warm leads from going cold.'],
    ['Gate Entry', 'A fast kiosk form for capturing a walk-in visitor at the institution gate — name and phone only — to be enriched later from Leads, with no duplicate record.'],
    ['GD-PI', 'Group Discussion and Personal Interview — the selection rounds where candidates are evaluated and scored. A restricted, evaluator-only function.'],
    ['Consultant', 'An external referral partner who sends students. Each has a profile, referral history, and commission record tracked in the CRM.'],
    ['Attribution', 'Tracing a lead back to the exact post, ad, or campaign that produced it — so you know which marketing actually works.'],
    ['Lead Ad', 'An ad on Facebook or Instagram with a built-in form. When someone fills it, the lead flows straight into the CRM without manual entry.'],
    ['Meta Pixel', 'A small piece of tracking code that reports website visits back to Facebook/Instagram, so campaigns can measure results and build remarketing audiences.'],
    ['Expo', 'An on-ground event (a fair or campus visit) where staff log walk-up leads on a phone via a QR capture form. Each expo has its own report and analytics.'],
    ['Deduplication', 'Merging two records that are the same applicant. Duplicates split one person across two counsellors and double-count the funnel, so they get merged.'],
  ].map(([term, def]) => ({ term, def })),

  plannedLocaleNote: 'A Tamil version is planned — English only for now.',
};

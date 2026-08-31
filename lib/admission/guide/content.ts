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
        'Configure the lead-routing engine',
        'Set consultant tier and commission policies',
        'Set super-admin policy controls (lead stages, telephony)',
        'Wire automation, templates and messaging',
        'Configure Meta integration and marketing masters',
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
          id: 'release-referral-charges',
          title: '5. Release referral service charges',
          steps: [
            {
              action: 'Start at **Review Worklist** — before you set any rate.',
              detail:
                'This lists every credit that needs a human look first: referrals recorded as a walk-in yet credited to an agency, credits with no enquiry behind them at all, and referrals with no agency attached. The walk-in ones are HELD — the generator skips them, so they cannot be paid even after a rate exists, until someone opens each and presses Release. The screen shows how many are still held and how many have been released.',
              tip: 'A walk-in can be genuinely agency-referred, so treat this as a question to answer, not an accusation. Releasing is the normal outcome, not the exception — the hold exists so that the answer is recorded rather than assumed, and it records who released it and when.',
              link: { label: 'Take me there', href: '/admission/consultants/review-worklist' },
            },
            {
              action: 'Attach the missing agencies in **Unlinked Referrals**.',
              detail:
                'These learners are marked as agency-referred but no agency is attached, so the generator skips them in silence — the agency that actually sent them would simply never be paid, and nothing would warn you.',
              tip: 'Linking is write-once on purpose. If a learner already carries a different agency, the screen warns you rather than quietly replacing the first one.',
              link: { label: 'Take me there', href: '/admission/consultants/unlinked-referrals' },
            },
            {
              action: 'Confirm the list with each agency in **Reconciliation**.',
              detail:
                'Enter the agency’s own list of learners they claim to have referred. The screen compares it against what the system credits them and shows three groups: both agree, the agency claims someone we do not credit, and — the one that matters — we credit them for someone they do not claim.',
              tip: 'Frame the meeting as releasing their charges faster, which is true. The contradictions surface on their own; nobody has to be accused of anything.',
              link: { label: 'Take me there', href: '/admission/consultants/reconciliation' },
            },
            {
              action: 'Check each agency can actually be paid in **Payout Readiness**.',
              detail:
                'An agency with no bank account or PAN on file cannot receive a payment, however correct its credits are. This screen lists them ordered by how many referrals are waiting behind each one, so you start where the money is actually stuck.',
              tip: 'Most blocked agencies have no referrals this year at all — collecting their details would move nothing. The screen opens on the few that are holding something up, and keeps the idle ones behind a toggle. Fill in the missing details on each agency\u2019s own page.',
              link: { label: 'Take me there', href: '/admission/consultants/payout-readiness' },
            },
            {
              action: 'Set the rate in **Rates & Generate**, then run **Preview** first.',
              detail:
                'The rate is the switch that turns credited referrals into money owed — until one exists, nothing can be generated and nothing can be paid. Set the amount for the year, institution or programme, then use Preview to see exactly how many referrals qualify and what the total comes to, without writing anything.',
              tip: 'Preview is a dry run. Read it as the bill you are about to accept, and stop if the count or the total is not what you expected.',
              prerequisite: 'The three checks above are done and the rate has been agreed.',
              link: { label: 'Take me there', href: '/admission/consultants/referral-rates' },
            },
            {
              action: 'Generate the pending charges.',
              detail:
                'This writes one pending commission per qualifying referral, using the rate you set. Referrals already carrying a commission are skipped, so running it twice does not double-charge.',
              link: { label: 'Take me there', href: '/admission/consultants/referral-rates' },
            },
            {
              action: 'Approve what was generated in **Commissions**.',
              detail:
                'Every generated charge arrives as pending and stays there until someone approves it. This is the point to reject anything the review or the agency meeting left in doubt.',
              link: { label: 'Take me there', href: '/admission/consultants/commissions' },
            },
            {
              action: 'Pay through the four stages in **Payouts**.',
              detail:
                'A payout batch moves through prepare, review, approve and pay — and the platform requires four different people, one per stage. That is deliberate: no single person can take a charge from creation to payment on their own.',
              tip: 'If a stage will not let you act, it is usually because you already acted on an earlier one. That is the control working, not a fault.',
              link: { label: 'Take me there', href: '/admission/consultants/payouts' },
            },
            {
              action: 'For an earlier year, load the list through **Import** first.',
              detail:
                'Referrals from a past admission year are only in the system if someone imported them. The import matches each name to a real learner and flags conflicts before anything is promoted.',
              tip: 'Bring the already-paid list with the import file. Without it there is no way to tell which of those referrals were settled by hand last year, and you risk paying twice for the same learner.',
              link: { label: 'Take me there', href: '/admission/consultants/import' },
            },
          ],
        },
        {
          id: 'data-and-insight',
          title: '6. Keep the data clean and read the AI insights',
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
              action: 'Set module-wide defaults in **Settings → General**.',
              detail:
                'Institution-level admission defaults and options that apply across the whole module.',
              link: { label: 'Take me there', href: '/admission/settings/general' },
            },
          ],
        },
        {
          id: 'lead-routing-engine',
          title: '7. Configure the lead-routing engine',
          steps: [
            {
              action: 'Open **Counselor Administration** — the engine behind "assignment rules".',
              detail:
                'This hub holds the real routing configuration: how an incoming lead is automatically matched to a counsellor. The Assignment Rules you set earlier are the simple front; this is the machinery underneath.',
              prerequisite:
                'The Counselor Administration screens are super-admin only. If you see a restriction card instead of the page, you are not a super-admin — ask your platform admin.',
              link: { label: 'Take me there', href: '/admission/counselors/admin' },
            },
            {
              action: 'Set the **Routing Config** that decides how leads are auto-assigned.',
              detail:
                'The rules the system follows to hand each new lead to a counsellor — the policy that drives automatic assignment.',
              link: { label: 'Take me there', href: '/admission/counselors/admin/routing-config' },
            },
            {
              action: 'Choose the **Rule Types** — the routing strategies you allow.',
              detail:
                'The kinds of rule the engine can use (by programme, institution, language, tier, weighted split, or a custom condition).',
              link: { label: 'Take me there', href: '/admission/counselors/admin/rule-types' },
            },
            {
              action: 'Set the counsellor **Tier Policy** — the fallback order for assignment.',
              detail:
                'The tier ordering the engine walks when it assigns leads, globally or per institution, so the best-placed counsellor is tried first.',
              link: { label: 'Take me there', href: '/admission/counselors/admin/tier-policy' },
            },
            {
              action: 'Tune **Alert Thresholds** for staffing imbalances.',
              detail:
                'When to warn about idle leads, overloaded counsellors, or slow response times, so you can rebalance before leads go cold.',
              link: { label: 'Take me there', href: '/admission/counselors/admin/alert-thresholds' },
            },
            {
              action: 'Clear stuck leads in **Routing Errors**.',
              detail:
                'A triage queue for leads that failed to auto-route — diagnose the mismatched rule or missing scope and retry the assignment by hand.',
              link: { label: 'Take me there', href: '/admission/counselors/admin/routing-errors' },
            },
          ],
        },
        {
          id: 'consultant-policies',
          title: '8. Set consultant partner policies',
          steps: [
            {
              action: 'Open **Consultant Administration** — the policies that make consultant tracking pay out.',
              detail:
                'Separate from the day-to-day Consultants list, this hub sets the rules: the partner tiers, what triggers a commission, and who can use the consultant portal.',
              prerequisite:
                'The Consultant Administration screens are super-admin only. If they are blocked, ask your platform admin.',
              link: { label: 'Take me there', href: '/admission/consultants/admin' },
            },
            {
              action: 'Set the consultant **Tier Policy** — the partner ladder.',
              detail:
                'The bronze → silver → gold → platinum → diamond ladder for consultants and the conversion thresholds that move a partner up it, globally or per institution.',
              link: { label: 'Take me there', href: '/admission/consultants/admin/tier-policy' },
            },
            {
              action: 'Define **Commission Triggers** — what earns a commission, and when.',
              detail:
                'Which lead, admission, or enrolment status change fires a consultant commission, at what TDS rate, the auto-approve threshold, and the clawback grace window.',
              tip: 'Auto-triggers ship switched OFF — only manual commissions are active until the director turns specific triggers on. Check this is set the way you intend before relying on automatic payouts.',
              link: { label: 'Take me there', href: '/admission/consultants/admin/commission-triggers' },
            },
            {
              action: 'Control **Portal Access** — who can use the consultant portal.',
              detail:
                'The allowlist that decides who can load the consultant portal, who can read their own attribution and commission data, and who may preview it as a consultant.',
              link: { label: 'Take me there', href: '/admission/consultants/admin/portal-access' },
            },
          ],
        },
        {
          id: 'super-admin-policies',
          title: '9. Super-admin policy controls',
          steps: [
            {
              action: 'Set the **Lead Stages Policy** — which stages count as an active lead.',
              detail:
                'Marks which funnel stages count toward a counsellor’s workload and which are terminal (Lost or Enrolled free up capacity). This drives the funnel counts the rest of the team reads, so it must match how you actually work leads.',
              prerequisite:
                'These are super-admin policy screens. If one is blocked, you are not a super-admin — ask your platform admin.',
              link: { label: 'Take me there', href: '/admission/settings/lead-stages-policy' },
            },
            {
              action: 'Configure **Telephony Policies** — call classification and voice tasks.',
              detail:
                'The call-classification taxonomy and the ExoVoice analysis tasks the call pipeline applies. Edits take effect on the next call ingest — no deploy needed.',
              link: { label: 'Take me there', href: '/admission/settings/telephony-policies' },
            },
            {
              action: 'Fix call routing in **Exophone Mapping**.',
              detail:
                'Maps each inbound phone line (DID) to its real institution. A wrong or missing mapping silently sends calls to the wrong institution, so check this whenever a number is added.',
              tip: 'This is a known footgun — unmapped lines default to one institution. Verify every DID points where you expect.',
              link: { label: 'Take me there', href: '/admission/settings/exophone-mapping' },
            },
            {
              action: 'Tune the **Voice Memo Monitor** — thresholds, alerts, and the director digest.',
              detail:
                'The write side of the voice-memo pipeline: alert thresholds, how the director’s digest is grouped, and the real-time toggle.',
              link: { label: 'Take me there', href: '/admission/settings/voice-memo-monitor' },
            },
          ],
        },
        {
          id: 'automation-templates',
          title: '10. Automation, templates and messaging',
          steps: [
            {
              action: 'Build automated **Workflows** that fire on a lead event.',
              detail:
                'The trigger-and-action builder — for example, when a lead changes status, send a message or assign a task. This is the automation engine behind the CRM.',
              link: { label: 'Take me there', href: '/admission/settings/workflows' },
            },
            {
              action: 'Manage the engine in **Workflow Config**.',
              detail:
                'The configuration side of automation, separate from the builder — where the workflow engine’s settings live.',
              link: { label: 'Take me there', href: '/admission/settings/workflow-config' },
            },
            {
              action: 'Manage **Document Templates** under Settings → Templates.',
              detail:
                'The downloadable document templates (brochures and the like) you attach to programmes.',
              link: { label: 'Take me there', href: '/admission/settings/templates/documents' },
            },
            {
              action: 'Design emails in the **Email Builder**.',
              detail:
                'A drag-block builder for email templates — subject and body blocks — used in campaigns and automated messages.',
              link: { label: 'Take me there', href: '/admission/settings/templates/email-builder' },
            },
            {
              action: 'Register your **WhatsApp Numbers** for broadcasts and chat.',
              detail:
                'The WhatsApp Business numbers used for messaging, set per institution or department with their tokens and IDs.',
              link: { label: 'Take me there', href: '/admission/settings/whatsapp-numbers' },
            },
            {
              action: 'Set up **Chat Settings** — canned replies and routing.',
              detail:
                'Configure the live-chat workspace: quick/canned replies and how inbound chats are routed to the team.',
              link: { label: 'Take me there', href: '/admission/marketing/chat/settings' },
            },
            {
              action: 'Curate the **Chatbot Knowledge Base**.',
              detail:
                'The question-and-answer entries the admission chatbot answers from — keep it current so the bot gives correct, on-message replies.',
              link: { label: 'Take me there', href: '/admission/marketing/chatbot/knowledge' },
            },
          ],
        },
        {
          id: 'meta-and-masters',
          title: '11. Meta integration and marketing masters',
          steps: [
            {
              action: 'Manage social account credentials in **Dept Accounts**.',
              detail:
                'The per-department vault of social-account credentials (page tokens and the like) that the Lead Ads and attribution pipeline reads.',
              tip: 'These Social screens use their own permission, separate from the admission ones. If a page shows "no access", ask for the matching social permission — the screen names it.',
              link: { label: 'Take me there', href: '/admission/social/departments' },
            },
            {
              action: 'Configure the **Meta Pixel** for conversion tracking.',
              detail:
                'The Meta Pixel and Conversions API (pixel ID and access token) per institution, so campaigns can measure conversions and feed remarketing.',
              link: { label: 'Take me there', href: '/admission/social/meta-pixel' },
            },
            {
              action: 'Build remarketing lists in **Meta Custom Audiences**.',
              detail:
                'Create and sync Meta Custom Audiences (by ad account and lead-status filters) to advertise to the right people again.',
              link: { label: 'Take me there', href: '/admission/social/meta-audiences' },
            },
            {
              action: 'Maintain the **Expo Masters** catalogue.',
              detail:
                'The master list of recurring expo events (name, organiser, city, venue, frequency) you reuse when creating an expo instance.',
              link: { label: 'Take me there', href: '/admission/marketing/expos/masters' },
            },
            {
              action: 'Keep lookups clean with **Data Quality Review mapping**.',
              detail:
                'Maps raw or dirty lookup values to canonical ones, so reports stay clean even when data comes in messy.',
              link: { label: 'Take me there', href: '/admission/settings/lookups/data-quality' },
            },
            {
              action: 'Set the **Group Dashboard pace targets** in Cycle Setup.',
              detail:
                'Defines the admission-cycle pace targets the Group Dashboard’s Pace tab reads, so the board-level view measures against the right goals.',
              link: { label: 'Take me there', href: '/admission/group-dashboard/setup' },
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

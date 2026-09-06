/**
 * Billing (Fees & Billing) — Smart Guide content.
 *
 * Authored once, drives every renderer: ONE GuideBook feeds the full page, the
 * in-app drawer, and the "?Help" FAB on every /billing screen, so the surfaces
 * can never drift.
 *
 * Three lanes, authored from the REAL production routes (jicate/main):
 *   - payer            (ungated baseline) → a student/parent viewing & paying
 *     their own fees. They see the SAME /billing/schedule, /billing/receipts and
 *     /billing/invoices routes that staff use, but RELABELLED "My Bills / My
 *     Receipts / My Invoices", read-only (Create buttons hidden, data filtered to
 *     their own records server-side). lib/sidebarMenuLink.ts does the relabel.
 *   - finance-officer  (billing.receipts.create) → records payments by issuing
 *     receipts, applies scholarships, processes refunds, day-to-day collections.
 *   - finance-admin    (billing.reports.view)     → sets up fee categories and
 *     schedules, runs reports & analytics, configures payment gateway accounts.
 *
 * ACCURACY NOTES (verified against code, not assumed):
 *   - There is NO self-service "pay now" page distinct from the staff routes.
 *     Online payment runs through per-institution Razorpay / HDFC accounts
 *     (/billing/payment-accounts); a receipt is what records any payment, cash
 *     or online. So the payer lane is VIEW-honest: see what you owe, see what you
 *     paid, and (where online payment is enabled) pay from your bill.
 *   - "Discounts" is labelled **Scholarships** everywhere in the UI (sidebar +
 *     page title). The route is still /billing/discounts. The guide says
 *     "scholarship" to match the screen.
 *   - /billing/discounts/policies, /billing/discounts/bulk, /billing/refunds/policies
 *     and /billing/refunds/bulk are buttons on the list pages but have NO page
 *     file in this checkout — they are deliberately NOT used as deep-links here.
 *   - /billing/student-bills has only a [billId] detail route, no list page — so
 *     no link points at a bare /billing/student-bills list.
 */

import type { GuideBook } from './types';

/**
 * Permission keys gating which lanes a NON-owner viewer may switch to. Defined
 * ONCE here and read by the page's client detector (via lanes[p].requires), so a
 * rename is a compile error, not a silently fail-open lane (auth-adapters.md rule).
 * Keys are real billing.* strings from lib/sidebarMenuLink.ts MENU_PERMISSIONS.
 * The payer lane is intentionally ungated — the universal instructional baseline
 * (like campus-living's resident lane).
 */
export const REQUIRES = {
  'finance-officer': 'billing.receipts.create',
  'finance-admin': 'billing.reports.view',
} as const;

export const GUIDES: GuideBook = {
  lanes: {
    /* ──────────────────────────── PAYER ──────────────────────────── */
    payer: {
      persona: 'payer',
      title: 'My Fees Guide',
      tagline:
        'See what you owe, see what you have already paid, and keep your receipts in one place.',
      whyItMatters:
        'Your fee bills, your payments, and your receipts all sit in one place, updated the moment the accounts office records anything. Checking here before a deadline means no surprise dues and no lost receipt when you need proof of payment.',
      startHere: { label: 'Go to My Bills', href: '/billing/schedule' },
      journey: [
        'Open My Bills to see what you owe',
        'Check the due date and the outstanding amount',
        'Pay (online where enabled, or at the office)',
        'Find the receipt for every payment',
        'View your invoices for your records',
      ],
      sections: [
        {
          id: 'see-bills',
          title: 'See what you owe',
          steps: [
            {
              action: 'Open **My Bills** to see every fee bill raised for you.',
              detail:
                'Each bill shows what it is for, the total amount, the due date, and the status — Paid, Unpaid, Partially Paid, or Overdue.',
              platforms: {
                web: 'Left sidebar → **Billing** → **My Bills**.',
                mobile: 'Tap the menu (**☰**) at the top, then **Billing → My Bills**.',
              },
              link: { label: 'Take me there', href: '/billing/schedule' },
            },
            {
              action: 'Read the **status** and **outstanding amount** on each bill.',
              detail:
                'Outstanding is what is still left to pay after any payments and scholarships. A red Overdue badge means the due date has passed — clear it as soon as you can.',
              tip: 'Partially Paid means part of the bill is settled and a balance remains. The outstanding figure is the number that matters.',
            },
          ],
        },
        {
          id: 'pay',
          title: 'Pay your fee',
          steps: [
            {
              action: 'Pay your bill — online where your institution has it switched on, otherwise at the accounts office.',
              detail:
                'When online payment is enabled, your payment is routed securely to your institution’s account. If it is not enabled for you, pay at the office and they record it for you.',
              prerequisite:
                'A payment only counts once a **receipt** is created for it. If you paid but the bill still shows a balance, give it a little time, then check My Receipts — if it is still missing, contact the accounts office.',
            },
            {
              action: 'After paying, check that the bill moves to **Paid** (or that the outstanding drops).',
              detail:
                'The bill status and outstanding amount update once the receipt is recorded against it.',
              link: { label: 'Take me there', href: '/billing/schedule' },
            },
          ],
        },
        {
          id: 'receipts',
          title: 'Find your receipts',
          steps: [
            {
              action: 'Open **My Receipts** to see proof of every payment you have made.',
              detail:
                'Each receipt shows the receipt number, the amount paid, the date, and how you paid (cash, online, bank transfer, DD, or cheque).',
              platforms: {
                web: 'Left sidebar → **Billing** → **My Receipts**.',
                mobile: 'Tap **☰** → **Billing → My Receipts**.',
              },
              link: { label: 'Take me there', href: '/billing/receipts' },
            },
            {
              action: 'Open a receipt to view or print it when you need proof of payment.',
              detail:
                'Use Print (Cmd+P / Ctrl+P) to save a copy for your records, a scholarship claim, or a parent’s reference.',
            },
          ],
        },
        {
          id: 'invoices',
          title: 'View your invoices',
          steps: [
            {
              action: 'Open **My Invoices** for the formal, tax-compliant version of your bills.',
              detail:
                'An invoice is the official document for a fee — useful for reimbursement, a loan, or your own records. Your bill is the day-to-day view; the invoice is the formal one.',
              link: { label: 'Take me there', href: '/billing/invoices' },
            },
          ],
        },
      ],
    },

    /* ──────────────────────── FINANCE OFFICER ──────────────────────── */
    'finance-officer': {
      persona: 'finance-officer',
      title: 'Collections Guide',
      tagline:
        'Record payments, issue receipts and invoices, apply scholarships, and process refunds.',
      whyItMatters:
        'You are the person who turns a payment into a record. Every receipt you issue updates a student’s outstanding balance instantly, every scholarship you apply lowers what they owe, and every refund you process closes the loop. Accurate, same-day recording is what keeps the outstanding figures everyone else relies on honest.',
      requires: REQUIRES['finance-officer'],
      startHere: { label: 'Go to Billing Schedule', href: '/billing/schedule' },
      journey: [
        'Find a student’s bill in the Schedule',
        'Record the payment by creating a receipt',
        'Apply a scholarship where it is due',
        'Generate or send the invoice',
        'Process refunds when needed',
      ],
      sections: [
        {
          id: 'find-bill',
          title: 'Find the bill',
          steps: [
            {
              action: 'Open the **Billing Schedule** to find the bill you are collecting against.',
              detail:
                'The schedule lists every student bill. Use the filters (institution, programme, semester, due-date range) to narrow down, or use **Student Search** to go straight to one learner.',
              prerequisite:
                'You need the **billing.receipts.create** permission to record payments. If buttons are greyed out or a page is blocked, ask your administrator to grant your collections role.',
              platforms: {
                web: 'Left sidebar → **Billing** → **Schedule · All Bills**.',
              },
              link: { label: 'Take me there', href: '/billing/schedule' },
            },
            {
              action: 'Use **Student Search** to look up one learner’s bills quickly.',
              detail:
                'Search by name or roll number to see all of that student’s bills, payments, and balances in one place.',
              link: { label: 'Take me there', href: '/billing/schedule/students' },
            },
          ],
        },
        {
          id: 'receipt',
          title: 'Record a payment (issue a receipt)',
          steps: [
            {
              action: 'Open **Receipts** to see every payment recorded, then start a new one.',
              detail:
                'A receipt is how a payment — cash, online, bank transfer, DD, or cheque — gets recorded against a bill. No receipt means the bill still shows as owed.',
              link: { label: 'Take me there', href: '/billing/receipts' },
            },
            {
              action: 'Click **Create Receipt** and pick the bill (or bills) the payment covers.',
              detail:
                'Choose the payment mode and date, enter the amount, and the page shows you how it will be allocated across the selected bills before you save.',
              tip: 'One payment can settle several bills. Check the allocation preview so the right amount lands on each bill.',
              link: { label: 'Take me there', href: '/billing/receipts/new' },
            },
            {
              action: 'Save the receipt and confirm the bill’s **outstanding** drops.',
              detail:
                'Once saved, the bill moves to Paid or Partially Paid and the student sees the receipt under My Receipts straight away.',
            },
          ],
        },
        {
          id: 'scholarships',
          title: 'Apply a scholarship',
          steps: [
            {
              action: 'Open **Scholarships** to see applied scholarships and pending approvals.',
              detail:
                'A scholarship (a discount) lowers what a student owes — by a fixed amount or a percentage. The page also shows how many are awaiting approval.',
              platforms: {
                web: 'Left sidebar → **Billing** → **Scholarships**.',
              },
              link: { label: 'Take me there', href: '/billing/discounts' },
            },
            {
              action: 'Click **Apply Scholarship** to add one to a student’s bill.',
              detail:
                'Pick the category, choose fixed-amount or percentage, and enter the value. Most scholarships need an approver to sign off before they reduce the bill.',
              tip: 'A scholarship sits as Pending until it is approved — only an approved scholarship changes the outstanding amount.',
              link: { label: 'Take me there', href: '/billing/discounts/new' },
            },
          ],
        },
        {
          id: 'invoices',
          title: 'Issue invoices',
          steps: [
            {
              action: 'Open **Invoices** to manage formal, tax-compliant invoices.',
              detail:
                'An invoice is the official document for a fee — separate from the working bill. Students see their own under My Invoices.',
              link: { label: 'Take me there', href: '/billing/invoices' },
            },
            {
              action: 'Use **Create Invoice** on the Invoices page when a student or institution needs the formal document.',
              detail:
                'Invoices can be individual (one student) or consolidated. They carry the tax and compliance details a plain bill does not.',
              link: { label: 'Take me there', href: '/billing/invoices' },
            },
          ],
        },
        {
          id: 'refunds',
          title: 'Process refunds',
          steps: [
            {
              action: 'Open **Refunds** to manage refund requests and their approval workflow.',
              detail:
                'A refund returns money for an overpayment or a withdrawal. The page shows requests moving through review and disbursement, with their amounts.',
              link: { label: 'Take me there', href: '/billing/refunds' },
            },
            {
              action: 'From a student\'s bill page, click **Initiate Refund** to start one.',
              detail:
                'Pick the eligible bills and amounts to refund. A request moves through Pending Review → Pending Disbursement → Disbursed; only a disbursed request actually reduces the net amount paid.',
              tip: 'A refund request can span multiple bills for the same student.',
            },
          ],
        },
      ],
    },

    /* ──────────────────────── FINANCE ADMIN ──────────────────────── */
    'finance-admin': {
      persona: 'finance-admin',
      title: 'Billing Admin Guide',
      tagline:
        'Set up fee categories and schedules, onboard learners, run reports, and configure payments.',
      whyItMatters:
        'You set the rules the whole module runs on. The fee categories you define, the bills you schedule, the payment accounts you connect, and the reports you read decide what every student is charged, how collections flow, and whether leadership can see the real cash position. Get the setup right once and every officer and student downstream works from clean numbers.',
      requires: REQUIRES['finance-admin'],
      startHere: { label: 'Go to Billing Reports', href: '/billing/reports' },
      journey: [
        'Define the fee categories everyone bills against',
        'Schedule the bills (single or in bulk)',
        'Onboard learners pending payment',
        'Connect and go live with the online payment accounts',
        'Read reports and analytics to track collections',
        'Set who can grant and approve scholarships',
        'Oversee the refund approval workflow',
      ],
      sections: [
        {
          id: 'categories',
          title: '1. Set up fee categories',
          steps: [
            {
              action: 'Open **Categories** to manage the fee heads shared across institutions.',
              detail:
                'A category is a kind of fee — Tuition, Hostel, Transport, Mess, and so on. Every bill is raised against a category, so this is the foundation the rest of billing sits on.',
              prerequisite:
                'You need **billing admin access** (or super-admin). If a setup page is blocked, ask for the billing admin role.',
              platforms: {
                web: 'Left sidebar → **Billing** → **Categories**.',
              },
              link: { label: 'Take me there', href: '/billing/categories' },
            },
            {
              action: 'Click **Add Category** and set its name, **frequency**, and **default amount**.',
              detail:
                'Give it a clear name (it appears on bills, receipts, and reports). Set the **frequency** — one-time, monthly, quarterly, or yearly — which is how the fee recurs, and an optional **default amount** so bills against this category pre-fill the usual figure.',
              tip: 'Frequency is the recurring-billing policy for the category. Set it deliberately — a "monthly" category behaves very differently from a "one-time" one when bills are generated.',
              link: { label: 'Take me there', href: '/billing/categories/new' },
            },
          ],
        },
        {
          id: 'schedule',
          title: '2. Schedule the bills',
          steps: [
            {
              action: 'Open the **Billing Schedule** to manage every student bill.',
              detail:
                'This is the master list of bills — what is due, from whom, and by when. Filter by institution, programme, semester, or due date.',
              link: { label: 'Take me there', href: '/billing/schedule' },
            },
            {
              action: 'Click **New Bill** to raise a single bill for one student.',
              detail:
                'Pick the student, the fee category, the amount, and the due date.',
              link: { label: 'Take me there', href: '/billing/schedule/new' },
            },
            {
              action: 'Use **Bulk Create** to raise the same bill for a whole group at once.',
              detail:
                'Bill an entire programme, semester, or section in one pass instead of one student at a time — the fastest way to roll out a term’s fees.',
              tip: 'Filter to exactly the group you mean before you generate — a bulk run touches every matching learner.',
              link: { label: 'Take me there', href: '/billing/schedule/bulk-create' },
            },
            {
              action: 'Use **Bulk Edit** to change many bills together (for example, shift a due date).',
              detail:
                'Adjust amounts or due dates across a filtered set without editing each bill by hand.',
              link: { label: 'Take me there', href: '/billing/schedule/bulk-edit' },
            },
          ],
        },
        {
          id: 'onboarding',
          title: '3. Onboard learners',
          steps: [
            {
              action: 'Open **Learner Onboarding** to review and approve learners pending payment before enrollment.',
              detail:
                'New learners who owe a first payment land here. Approving clears them to enrol; the notification bell flags new fee-change events that need your attention.',
              link: { label: 'Take me there', href: '/billing/onboarding' },
            },
          ],
        },
        {
          id: 'payments',
          title: '4. Connect online payments',
          steps: [
            {
              action: 'Open **Payment Gateway Accounts** to set up where online payments go.',
              detail:
                'Each institution can have its own Razorpay (HDFC Collect Now) account; a learner’s online payment is routed to their institution’s account, and institutions without one fall back to the common account.',
              tip: 'Gateway secrets are encrypted and never shown again after you save — store a copy somewhere safe before saving.',
              link: { label: 'Take me there', href: '/billing/payment-accounts' },
            },
            {
              action: '**Test** the connection before you go live.',
              detail:
                'Use the Test button on an account to confirm the keys actually reach the gateway — so you catch a wrong key now, not when a student’s payment fails.',
            },
            {
              action: 'Add keys to **Activate** an account, and **Deactivate** to roll it back.',
              detail:
                'A new account stays inert (the institution keeps using the common account) until you add its keys to activate it. Deactivating an account sends that institution back to the common-account fallback, so you can take a gateway offline safely.',
              tip: 'This is the go-live switch. Test first, activate only once the test passes, and keep the common account as the fallback for any institution without its own.',
            },
          ],
        },
        {
          id: 'apportionment',
          title: '5. Apportion bundled revenue',
          steps: [
            {
              action: 'Open **Apportionment** to split a bundled bill across revenue heads — without changing the student’s bill.',
              detail:
                'When one tuition bill really covers several heads (Hostel, Transport, Mess), apportionment records how much belongs to each, for the accounts team only. The student’s bill is never touched.',
              tip: 'Every split needs a second person to approve it — create the split, then it waits for approval before it counts.',
              link: { label: 'Take me there', href: '/billing/apportionment' },
            },
            {
              action: 'Set **Default Rules** so common bundles split automatically.',
              detail:
                'Save the usual split percentages once and new bundled bills follow them, instead of splitting each one by hand.',
              link: { label: 'Take me there', href: '/billing/apportionment/rules' },
            },
          ],
        },
        {
          id: 'reports',
          title: '6. Read reports and analytics',
          steps: [
            {
              action: 'Open **Reports** for the full financial picture across tabs.',
              detail:
                'Dashboard, Outstanding, Collection, Invoices, Scholarships, and Refunds — each a tab. Filter by institution and date range, and export where you have export rights.',
              link: { label: 'Take me there', href: '/billing/reports' },
            },
            {
              action: 'Watch the **Outstanding** and **Collection** tabs to track dues and cash coming in.',
              detail:
                'Outstanding shows what is still owed; Collection shows what has actually been collected over a period — the two numbers leadership asks about most.',
            },
            {
              action: 'Open **Analytics** for collections, pending fees, and institution-wise performance.',
              detail:
                'A visual view of how each institution is doing and what the accounts team has been working on.',
              link: { label: 'Take me there', href: '/billing/analytics' },
            },
            {
              action: 'Open **Activities** for an audit trail of every billing action.',
              detail:
                'A timeline of bills, receipts, invoices, scholarships, and refunds — useful when you need to trace who did what and when.',
              link: { label: 'Take me there', href: '/billing/activities' },
            },
          ],
        },
        {
          id: 'scholarship-permissions',
          title: '7. Set who can grant and approve scholarships',
          steps: [
            {
              action: 'Open **Role Management → Scholarships** to set scholarship permissions per role.',
              detail:
                'This is the separation-of-duties control for scholarships. For each role you pick a template — Full Manager (create, edit, approve, delete), Creator (create and edit, but cannot approve), Reviewer (approve only, cannot create), Read Only, or No Access. It decides who can hand out a scholarship versus who signs one off.',
              prerequisite:
                'This screen lives under **Users → Role Management**, not under Billing, and it is super-admin only. If it is blocked, ask your platform admin.',
              tip: 'Keep granting and approving in different hands — give front-line staff Creator and a senior approver Reviewer. That separation is what stops a scholarship being self-approved.',
              link: { label: 'Take me there', href: '/users/role-management' },
            },
          ],
        },
        {
          id: 'refund-oversight',
          title: '8. Oversee the refund approval workflow',
          steps: [
            {
              action: 'Open **Refunds** to oversee the Pending → Approved → Processed workflow.',
              detail:
                'Every refund moves through three stages — requested (Pending), signed off (Approved), then paid out (Processed). Only a processed refund actually reduces the net amount paid. From here you watch what is awaiting approval and what has been processed.',
              tip: 'A refund stuck in Pending is money a student is waiting on. Clear approvals promptly — and remember a refund is tied to the receipt the payment came in on, not just the bill.',
              link: { label: 'Take me there', href: '/billing/refunds' },
            },
          ],
        },
      ],
    },
  },

  glossary: [
    ['Bill', 'A charge raised on a student for a fee — what they owe, with a due date and a status (Paid, Unpaid, Partially Paid, Overdue). Students see their bills as "My Bills".'],
    ['Invoice vs Receipt', 'An invoice is the formal, tax-compliant document that states a fee is due. A receipt is proof that a payment was made. Put simply: an invoice asks for money; a receipt confirms money came in.'],
    ['Fee head / Category', 'The kind of fee a bill is for — Tuition, Hostel, Transport, Mess, and so on. Every bill is raised against one category, and reports group by them.'],
    ['Outstanding / Due', 'The amount still left to pay on a bill after payments and approved scholarships. The single number that says whether a student still owes anything.'],
    ['Partially Paid', 'A bill where some of the amount has been paid and a balance remains. The outstanding figure is what is still owed.'],
    ['Overdue', 'A bill whose due date has passed while a balance remains. Flagged in red so it gets cleared first.'],
    ['Scholarship (Discount)', 'A reduction in what a student owes, as a fixed amount or a percentage. Labelled "Scholarship" in the screens; usually needs approval before it lowers the bill.'],
    ['Refund / Adjustment', 'Money returned to a student for an overpayment or a withdrawal. A refund is tied to the receipt the payment came in on and moves through Pending → Approved → Processed.'],
    ['Payment mode', 'How a payment was made — cash, online, bank transfer, DD (demand draft), or cheque. Recorded on the receipt.'],
    ['Reconciliation', 'Checking that recorded receipts match the money actually received — making sure every payment has a receipt and every receipt has a real payment behind it.'],
    ['Apportionment', 'An accounts-only split of one bundled bill across several revenue heads (Hostel, Transport, Mess). It records who the money belongs to internally and never changes the student’s bill.'],
    ['Payment gateway account', 'The online account (Razorpay / HDFC) a student’s online payment is routed to. Each institution can have its own; the rest use a common account.'],
  ].map(([term, def]) => ({ term, def })),

  plannedLocaleNote: 'A Tamil version is planned — English only for now.',
};

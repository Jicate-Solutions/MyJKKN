/**
 * Campus Living — Smart Guide content (authored once, drives every renderer).
 *
 * Installed via the /smart-guide skill (2026-06-13), superseding the hand-built
 * single-page guide (PR #1376). One GuideBook → the full page, the in-app
 * drawer, and the FAB launcher.
 *
 * RESIDENT-LANE LINKS stay inside the resident allow-list (/my-hostel/*) —
 * student-role residents are confined there by CampusLivingResidentGuard, so a
 * deep-link outside it would bounce them. Staff lanes (warden/mess/admin) link
 * freely. FEES are how-to only — the live page shows the price, so the guide
 * never goes stale on money (Director decision 2026-06-13).
 */

import type { GuideBook } from './types';

/**
 * Permission keys gating which lanes a NON-owner viewer may switch to. Defined
 * ONCE here and imported by the page's client detector, so a rename is a
 * compile error, not a silently fail-open lane (auth-adapters.md rule).
 * Keys are real campus_living.* permission strings (lib/constants/permissions).
 */
export const REQUIRES = {
  warden: 'campus_living.allocations.approve',
  mess: 'campus_living.mess.menu.publish',
  // admin gate — CHANGED 2026-06-16 from 'campus_living.mess.menu.approve'.
  // That mess-menu key gated the WHOLE settings/config lane but appears on ZERO
  // settings pages. 'campus_living.settings.edit' is the representative config-edit
  // key (enforced on the core settings pages — fee-config, general, maintenance-sla,
  // notification-rules, ac-amenity-audit, …); leave-types uses its own
  // 'campus_living.leave_types' key, and three pages (block-economics, housekeeping,
  // choose-your-menu) are additionally super-admin-gated (the lane carries a
  // prerequisite note on each). FOLLOW-UP (separate APP ticket, not a guide issue):
  // a few settings pages (amenities, billable-amenities, categories, hostel-years,
  // packages, program-eligibility, curfew) currently enforce NO in-page permission
  // guard and rely on RLS only — worth hardening. settings.edit remains the correct
  // lane gate regardless.
  admin: 'campus_living.settings.edit',
} as const;

export const GUIDES: GuideBook = {
  lanes: {
    // ── RESIDENT (the universal lane — no `requires`, everyone can read it) ──
    resident: {
      persona: 'resident',
      title: 'Resident Guide',
      tagline: 'Your room, your meals, and everything you need day-to-day.',
      whyItMatters:
        'Your room, your meals, and everything you need day-to-day all live in one place — My Hostel.',
      startHere: { label: 'Go to My Hostel', href: '/campus-living/my-hostel' },
      journey: [
        'You get a room & mess automatically',
        'Check your details on My Hostel',
        'Upgrade if you want (optional)',
        'See your menu, book cleaning, raise requests',
      ],
      sections: [
        {
          id: 'find',
          title: 'See your room & mess',
          steps: [
            {
              action: 'Open **My Hostel** to see your block, room, mess plan and fees.',
              detail:
                'This is your default allocation — given to you by your course and year, with no booking needed.',
              link: { label: 'Open My Hostel', href: '/campus-living/my-hostel' },
            },
          ],
        },
        {
          id: 'upgrade',
          title: 'Upgrade your room or mess',
          steps: [
            {
              action: 'On **My Hostel**, look for an upgrade card on the Overview tab.',
              detail:
                'If an upgrade is available, you’ll see the next tier and its price right there — always the current amount.',
              link: { label: 'Open My Hostel', href: '/campus-living/my-hostel' },
            },
            {
              action: 'Pay the upgrade fee **within 48 hours** of the option opening.',
              tip: 'Miss the 48-hour window and the option closes.',
            },
            {
              action: 'Pay at least **30% of your year fee** (your minimum due) by **Monday 6:00 PM**.',
              prerequisite:
                'Paying the upgrade fee alone does NOT confirm your upgrade — only the minimum due does. Miss it and your spot goes to the waiting list.',
            },
            {
              action: 'You’re confirmed once the minimum due is paid.',
              detail:
                'If it isn’t paid in time, your spot moves to the next person on the waiting list. (There is no downgrade once allotted.)',
            },
          ],
        },
        {
          id: 'pick-room',
          title: 'Pick your room & roommate (Premium)',
          steps: [
            {
              action: 'If you’re on a Premium room, **pick your room** online.',
              detail:
                'Premium rooms are open to online booking for all colleges, courses and years. Classic and Deluxe rooms are auto-allocated — no room or roommate choice.',
              link: { label: 'Pick Room', href: '/campus-living/my-hostel/premium/pick-room' },
            },
            {
              action: '**Invite a roommate** to share your premium room.',
              link: { label: 'Invite Roommate', href: '/campus-living/my-hostel/premium/invite-roommate' },
            },
          ],
        },
        {
          id: 'meals',
          title: 'Your weekly menu',
          steps: [
            {
              action: 'Open **My Meals** to see this week’s menu for your mess plan.',
              detail: 'Breakfast, lunch, tea and dinner, day by day — tap any day to switch.',
              link: { label: 'Open My Meals', href: '/campus-living/my-hostel/my-meals' },
            },
          ],
        },
        {
          id: 'cleaning',
          title: 'Book room cleaning',
          steps: [
            {
              action: 'If your plan includes housekeeping, open **Room Cleaning** and book a slot.',
              detail: 'Pick a date and an open time slot, confirm, and see your upcoming bookings there.',
              link: { label: 'Open Room Cleaning', href: '/campus-living/my-hostel/housekeeping' },
            },
          ],
        },
        {
          id: 'requests',
          title: 'Requests & moving out',
          steps: [
            {
              action: 'Use the **Requests** tab on My Hostel to raise maintenance or apply for leave.',
              link: { label: 'Open My Hostel', href: '/campus-living/my-hostel' },
            },
            {
              // The self-service vacate form was withdrawn on 2026-08-10 and is
              // being rebuilt; the route is now permission-guarded, so linking
              // learners to it would send them to a permission error.
              action: 'To move out, contact the hostel office — they raise and process the vacate on your behalf.',
            },
          ],
        },
      ],
    },

    // ── WARDEN ──
    warden: {
      persona: 'warden',
      title: 'Warden Guide',
      tagline: 'You keep your block running — approvals, requests, and welfare.',
      whyItMatters:
        'Approvals, requests, and resident welfare all flow through you — these are the day-to-day controls.',
      startHere: { label: 'Open Campus Living', href: '/campus-living' },
      requires: REQUIRES.warden,
      journey: ['Approve allocations & vacates', 'Handle maintenance', 'Approve leave', 'Oversee the mess'],
      sections: [
        {
          id: 'approvals',
          title: 'Approve allocations & vacates',
          steps: [
            {
              action: 'Review and approve new allocations and **vacate requests** for your block.',
              detail: 'An approval confirms the move; a rejection sends the spot back to the waiting list.',
              link: { label: 'Vacate Requests', href: '/campus-living/vacate-requests' },
            },
          ],
        },
        {
          id: 'maintenance',
          title: 'Handle maintenance & requests',
          steps: [
            {
              action: 'Assign, track and close **maintenance requests** raised by residents.',
              detail: 'Work against the service-level targets your admin has set.',
            },
          ],
        },
        {
          id: 'leave',
          title: 'Approve leave',
          steps: [
            {
              action: 'Approve **leave applications** from your block.',
              detail: 'Parent-consent rules are applied automatically where required; the chief warden signs off where set.',
            },
          ],
        },
        {
          id: 'mess',
          title: 'Oversee the mess',
          steps: [
            {
              action: 'Keep an eye on the **weekly menu** and **feedback** for your residents.',
              link: { label: 'Mess Menu', href: '/campus-living/mess/menu' },
            },
            {
              action: 'Read **mess feedback** and raise issues to the mess team.',
              link: { label: 'Mess Feedback', href: '/campus-living/mess/feedback' },
            },
          ],
        },
      ],
    },

    // ── MESS COMMITTEE ──
    mess: {
      persona: 'mess',
      title: 'Mess Committee Guide',
      tagline: 'The food residents eat is shaped here — menu, special days, feedback.',
      whyItMatters:
        'The menu, the special-day meals, and the feedback loop are all yours to shape. (A dedicated “Mess Committee” role isn’t switched on yet — wardens and admins do these tasks until it is.)',
      startHere: { label: 'Open the Mess Menu', href: '/campus-living/mess/menu' },
      requires: REQUIRES.mess,
      journey: ['View & edit the weekly menu', 'Choose Your Menu & special days', 'Close the feedback loop'],
      sections: [
        {
          id: 'menu',
          title: 'The weekly menu',
          steps: [
            {
              action: 'View the **weekly menu** — one shared set across all colleges, by tier and by hostel.',
              link: { label: 'Open Menu', href: '/campus-living/mess/menu' },
            },
            {
              action: 'Edit it in the **Menu Editor** — 7 days × 4 meals, per tier and hostel.',
              link: { label: 'Menu Editor', href: '/campus-living/mess/menu-editor/classic' },
            },
          ],
        },
        {
          id: 'choose',
          title: 'Choose Your Menu & special days',
          steps: [
            {
              action: 'When admin switches on **Choose Your Menu**, eligible residents pick meals and vote on dishes.',
              detail: 'Special festival menus can be proposed for review.',
              link: { label: 'Choose Your Menu settings', href: '/campus-living/settings/choose-your-menu' },
            },
          ],
        },
        {
          id: 'feedback',
          title: 'Close the feedback loop',
          steps: [
            {
              action: 'Read **mess feedback** and let it shape next week’s menu.',
              tip: 'Closing the loop is the point — residents who see their input land keep giving it.',
              link: { label: 'Mess Feedback', href: '/campus-living/mess/feedback' },
            },
          ],
        },
      ],
    },

    // ── ADMIN ──
    admin: {
      persona: 'admin',
      title: 'Admin Guide',
      tagline: 'You set the rules everyone else follows.',
      whyItMatters:
        'Tiers, fees, categories, and which features are switched on — you configure how Campus Living works for every resident. Changes apply on the next page load, no deploy needed.',
      startHere: { label: 'Open Settings', href: '/campus-living/settings' },
      requires: REQUIRES.admin,
      journey: [
        'Set the foundations: years, hostels, categories, eligibility',
        'Configure fees and amenities',
        'Set up the mess and caterers',
        'Configure premium room and bed economics',
        'Set the rules: leave, curfew, approvals, SLAs',
      ],
      sections: [
        {
          id: 'foundations',
          title: '1. Set the foundations',
          steps: [
            {
              action: 'Open **Settings** to reach every configuration screen in one place.',
              detail:
                'The settings hub lists all the configuration cards — start here whenever you need to change how Campus Living works. Changes apply on the next page load, no deploy needed.',
              prerequisite:
                'Most settings need the **Campus Living settings** permission; a few (Bed Economics, Housekeeping, Choose Your Menu) are super-admin only. If a page is blocked, ask your platform admin.',
              link: { label: 'Open Settings', href: '/campus-living/settings' },
            },
            {
              action: 'Set the academic year and hostel names in **General**.',
              detail: 'The foundational settings every other screen builds on.',
              link: { label: 'General Settings', href: '/campus-living/settings/general' },
            },
            {
              action: 'Open the **Hostel Years** that scope your fees.',
              detail:
                'Fee configuration is set per calendar year — create and open the year before you set fees against it.',
              link: { label: 'Hostel Years', href: '/campus-living/settings/hostel-years' },
            },
            {
              action: 'Define the room **Categories** residents can be on.',
              detail: 'The hostel room categories (Boys / Girls / Mixed) that allocation and fees follow.',
              link: { label: 'Room Categories', href: '/campus-living/settings/categories' },
            },
            {
              action: 'Set **Program Eligibility** — which room and mess categories each programme allows.',
              detail: 'The core allocation policy: it decides what a student from each programme can be placed in.',
              link: { label: 'Program Eligibility', href: '/campus-living/settings/program-eligibility' },
            },
            {
              action: 'Lay out the **Blocks** and rooms, and assign **Wardens** to them.',
              detail: 'The physical structure (blocks and rooms) and which warden runs each block.',
              link: { label: 'Blocks', href: '/campus-living/blocks' },
            },
            {
              action: 'Assign which warden runs each block on the **Wardens** screen.',
              link: { label: 'Wardens', href: '/campus-living/wardens' },
            },
          ],
        },
        {
          id: 'fees-amenities',
          title: '2. Configure fees and amenities',
          steps: [
            {
              action: 'Set room-type fees, AC charges, deposits and upgrade amounts in **Fee Configuration**.',
              detail: 'Scoped to the open hostel year. This drives every price residents see.',
              link: { label: 'Fee Configuration', href: '/campus-living/settings/fee-config' },
            },
            {
              action: 'Maintain the **Amenities** catalogue.',
              detail: 'The informational list of what each room/hostel offers.',
              link: { label: 'Amenities', href: '/campus-living/settings/amenities' },
            },
            {
              action: 'Set the **Billable Amenities** that carry a fee.',
              detail: 'The fee-bearing amenities (AC, premium services) residents pay for, separate from the informational catalogue.',
              link: { label: 'Billable Amenities', href: '/campus-living/settings/billable-amenities' },
            },
            {
              action: 'Bundle rooms for admissions in **Packages**.',
              detail: 'Admission packages that bundle a room type for the intake.',
              link: { label: 'Packages', href: '/campus-living/settings/packages' },
            },
            {
              action: 'Run the **AC Amenity Audit** to check AC billing is correct.',
              link: { label: 'AC Amenity Audit', href: '/campus-living/settings/ac-amenity-audit' },
            },
          ],
        },
        {
          id: 'mess-setup',
          title: '3. Set up the mess and caterers',
          steps: [
            {
              action: 'Manage the **Mess Categories** residents can be on.',
              tip: 'Adding a mess category surfaces it everywhere automatically — the menu and settings follow the categories page.',
              link: { label: 'Mess Categories', href: '/campus-living/mess/categories' },
            },
            {
              action: 'Set the **Mess Policies** that govern how the mess runs.',
              link: { label: 'Mess Policies', href: '/campus-living/mess/policies' },
            },
            {
              action: 'Onboard and manage caterers in **Caterer Management**.',
              detail: 'The configuration that links a caterer to a mess (the underlying caterer records live alongside it).',
              link: { label: 'Caterer Management', href: '/campus-living/mess/caterer-management' },
            },
            {
              action: 'Turn **Choose Your Menu** on or off, and pick which tiers can personalize and vote.',
              detail: 'A live preview shows exactly what residents will experience before you save.',
              prerequisite: 'Choose Your Menu is a super-admin setting. If it is blocked, ask your platform admin.',
              link: { label: 'Choose Your Menu settings', href: '/campus-living/settings/choose-your-menu' },
            },
          ],
        },
        {
          id: 'premium-economics',
          title: '4. Premium room and bed economics',
          steps: [
            {
              action: 'Set the **premium Allocation Rules** — who can book premium rooms and how.',
              link: { label: 'Allocation Rules', href: '/campus-living/premium/allocation-rules' },
            },
            {
              action: 'Set the premium **Tier Policy**, and use **Override** for one-off admin adjustments.',
              detail: 'The tier rules for premium room, plus the override screen when you need to make an exception.',
              link: { label: 'Tier Policy', href: '/campus-living/premium/tier-policy' },
            },
            {
              action: 'Enter block running costs and investments in **Block Economics**.',
              detail: 'This is where the cost and investment numbers are entered — it powers the Bed Economics dashboard.',
              prerequisite: 'Block Economics is a super-admin screen. If it is blocked, ask your platform admin.',
              link: { label: 'Block Economics', href: '/campus-living/settings/block-economics' },
            },
            {
              action: 'Track the money side on the **Bed Economics dashboard** — ROI, margin and payback per block.',
              link: { label: 'Bed Economics', href: '/campus-living/premium/dashboard' },
            },
          ],
        },
        {
          id: 'rules-workflows',
          title: '5. Set the rules and workflows',
          steps: [
            {
              action: 'Define **Leave Types** — the leave catalogue, maximum days, and parent-consent rules.',
              detail: 'Wardens approve leave against these; parent consent is applied automatically where you require it.',
              link: { label: 'Leave Types', href: '/campus-living/settings/leave-types' },
            },
            {
              action: 'Set the **Curfew** policy.',
              link: { label: 'Curfew', href: '/campus-living/settings/curfew' },
            },
            {
              action: 'Configure **Approval Chains** for leave, curfew and visitor requests.',
              detail: 'Who signs off, and in what order, for each kind of request.',
              link: { label: 'Approval Chains', href: '/campus-living/settings/approval-chains' },
            },
            {
              action: 'Set **Maintenance SLA** targets by category and priority.',
              detail: 'These are the service-level targets wardens work their maintenance queue against.',
              link: { label: 'Maintenance SLA', href: '/campus-living/settings/maintenance-sla' },
            },
            {
              action: 'Tune **Notification Rules** — which email, SMS and push messages go out.',
              link: { label: 'Notification Rules', href: '/campus-living/settings/notification-rules' },
            },
            {
              action: 'Configure **Housekeeping** slots and quotas residents book against.',
              detail: 'The slot and quota config behind the resident room-cleaning booking.',
              prerequisite: 'Housekeeping config is a super-admin screen. If it is blocked, ask your platform admin.',
              link: { label: 'Housekeeping', href: '/campus-living/settings/housekeeping' },
            },
          ],
        },
      ],
    },
  },

  glossary: [
    ['Default allocation', 'The room and mess you are given automatically by your course and year — no booking needed.'],
    ['Tier / Plan', 'The level of your room or mess (Classic, Premium, and so on). Higher tiers cost more and offer more.'],
    ['Upgrade', 'Moving from your default to a higher room or mess tier, for a one-time fee shown on the page. There is no downgrade.'],
    ['Premium Room', 'The premium-room option where YOU choose your own room and roommate online, instead of being auto-allocated.'],
    ['Mess plan', 'Which set of food you are on — Classic or Premium. It decides the menu you see in My Meals.'],
    ['Choose Your Menu', 'When switched on, lets eligible residents pick their own meals from the menu, instead of just eating the fixed menu.'],
    ['Minimum due', 'The smallest part of your year fee you must pay to confirm a booking or upgrade (the rest follows later).'],
    ['Vacate request', 'Asking to move out of your hostel room. A warden reviews and approves it.'],
  ].map(([term, def]) => ({ term, def })),

  plannedLocaleNote: 'A Tamil version is planned — English only for now.',
};

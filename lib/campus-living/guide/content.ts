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
  admin: 'campus_living.mess.menu.approve',
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
              action: 'To move out, open a **vacate request** — a warden reviews and approves it.',
              link: { label: 'Vacate Request', href: '/campus-living/my-hostel/vacate-request' },
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
      startHere: { label: 'Open Settings', href: '/campus-living/settings/fee-config' },
      requires: REQUIRES.admin,
      journey: ['Set tiers, fees & categories', 'Switch Choose Your Menu on/off', 'Run premium & bed economics'],
      sections: [
        {
          id: 'config',
          title: 'Tiers, fees & categories',
          steps: [
            {
              action: 'Set room-type fees and upgrade amounts in **Fee Configuration**.',
              link: { label: 'Fee Configuration', href: '/campus-living/settings/fee-config' },
            },
            {
              action: 'Manage the room and **mess categories** residents can be on.',
              tip: 'Adding a mess category surfaces it everywhere automatically — the menu and settings follow the categories page.',
              link: { label: 'Mess Categories', href: '/campus-living/mess/categories' },
            },
          ],
        },
        {
          id: 'choose',
          title: 'Choose Your Menu',
          steps: [
            {
              action: 'Turn the engagement layer on or off, and choose which tiers can personalize, vote and propose.',
              detail: 'A live preview shows exactly what residents will experience before you save.',
              link: { label: 'Choose Your Menu settings', href: '/campus-living/settings/choose-your-menu' },
            },
          ],
        },
        {
          id: 'premium',
          title: 'Premium stay & economics',
          steps: [
            {
              action: 'Configure who can book premium rooms and how.',
              link: { label: 'Premium Dashboard', href: '/campus-living/premium/dashboard' },
            },
            {
              action: 'Track the money side on the **Bed Economics dashboard** — ROI, margin and payback per block.',
              link: { label: 'Bed Economics', href: '/campus-living/premium/dashboard' },
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
    ['Premium Stay', 'The premium-room option where YOU choose your own room and roommate online, instead of being auto-allocated.'],
    ['Mess plan', 'Which set of food you are on — Classic or Premium. It decides the menu you see in My Meals.'],
    ['Choose Your Menu', 'When switched on, lets eligible residents pick their own meals from the menu, instead of just eating the fixed menu.'],
    ['Minimum due', 'The smallest part of your year fee you must pay to confirm a booking or upgrade (the rest follows later).'],
    ['Vacate request', 'Asking to move out of your hostel room. A warden reviews and approves it.'],
  ].map(([term, def]) => ({ term, def })),

  plannedLocaleNote: 'A Tamil version is planned — English only for now.',
};

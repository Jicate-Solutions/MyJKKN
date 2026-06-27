/**
 * Resource Management — Smart Guide content (PURE DATA, the actual product).
 *
 * Three persona lanes in plain 12th-grade language, authored from the module's
 * REAL routes under app/(routes)/resource-management/*. Every step that happens
 * on a page carries a "Take me there" deep-link. Permission gating uses the
 * shared REQUIRES keys below (the same key a renderer checks via lanes[p].requires,
 * so a rename is a compile error, not a silently fail-open lane).
 *
 * ── ACCURACY NOTES (verified against page code + lib/sidebarMenuLink.ts, not
 *    assumed) ───────────────────────────────────────────────────────────────
 *   - The route directory is `resource-management`, but every PERMISSION KEY is
 *     `resources.*` (see lib/constants/permissions.ts). Both are correct — the
 *     folder name and the key namespace simply differ.
 *   - BOOKING IS PERMISSION-GATED, NOT OPEN TO EVERYONE. lib/sidebarMenuLink.ts
 *     maps `/resource-management/reservations/new` → `resources.reservations.create`
 *     and `/reservations`, `/my-reservations`, `/calendar` →
 *     `resources.reservations.view`. There is no anonymous / all-users booking
 *     path. So the requester lane is GATED with `resources.reservations.view`,
 *     per the "default to gating" rule. (If product later opens booking to all
 *     authenticated staff, drop the `requires` to make this an open lane.)
 *   - The module LANDING `/resource-management` is gated by
 *     `resources.categories.view` (an admin-leaning key), so the requester's
 *     `startHere` points at a reservations route, NOT the landing.
 *   - The scan page comment states scan is available to any user with
 *     `resources.resources.view`, with assign/return still gated server-side by
 *     RLS. So the requester "check in / check out" step uses that real key.
 *   - The new-reservation flow shows an "Approval Required" notice before submit:
 *     a booking becomes a request that an approver must approve before access is
 *     granted. That is reflected in both the requester and approver lanes.
 */
import type { GuideBook } from './types';

/**
 * Permission keys that gate each lane. ONE source of truth — content.ts sets
 * `requires`, the renderer's auth adapter checks the same key. Every value is a
 * real `resources.*` string copied VERBATIM from lib/constants/permissions.ts.
 */
export const REQUIRES = {
  // Requester books + tracks reservations. Gated on the lowest reservation key.
  // FLAG(SME): booking is permission-gated in code (sidebarMenuLink maps
  // /reservations/new → resources.reservations.create), so this is NOT an open
  // lane. If product confirms booking should be open to ALL signed-in staff,
  // remove this `requires` to convert it to an open/instructional lane.
  requester: 'resources.reservations.view',
  // Approver reviews + decides reservation requests.
  approver: 'resources.approvals.view',
  // Admin runs the catalogue + upkeep + analytics.
  admin: 'resources.categories.view',
} as const;

export const GUIDES: GuideBook = {
  lanes: {
    /* ── REQUESTER (books and tracks resources) ────────────────────────── */
    requester: {
      persona: 'requester',
      title: 'Booking Guide',
      tagline:
        'Find a room or a piece of equipment, book it, and check it in and out — here is how.',
      whyItMatters:
        'A booking is a request, not an instant grab. Sending a clear request early — and checking your resource in and out on time — is what keeps shared rooms and equipment available for everyone.',
      startHere: {
        label: 'Make a booking',
        href: '/resource-management/reservations/new',
      },
      requires: REQUIRES.requester,
      journey: [
        'Find what you need',
        'Pick a free time slot',
        'Send the request',
        'Check in and out',
      ],
      sections: [
        {
          id: 'browse',
          title: 'Find a resource',
          steps: [
            {
              action:
                'Open **Resources** to see every room and piece of equipment you can book.',
              detail:
                'Use the category and status filters to narrow it down — for example, show only items that are currently "Available".',
              platforms: {
                web: 'left sidebar → Resource Management → Resources',
                mobile: 'tap More (⋯) in the bottom bar → Resource Management → Resources',
              },
              link: { label: 'Open Resources', href: '/resource-management/resources' },
            },
            {
              action:
                'Check the **calendar** to see when a resource is already booked.',
              detail:
                'The calendar shows existing reservations across the day so you can spot a free slot before you start a request.',
              link: {
                label: 'Open Calendar',
                href: '/resource-management/reservations/calendar',
              },
            },
          ],
        },
        {
          id: 'book',
          title: 'Make a booking',
          steps: [
            {
              action: 'Open **New Reservation** and follow the four steps.',
              detail:
                'Pick the resource, choose the date, pick a free time slot, then fill in the booking details (what it is for and how important it is).',
              prerequisite:
                'You need the "Create Reservations" permission to book. If the New Reservation page is blocked, ask your resource administrator to grant it.',
              link: {
                label: 'Make a booking',
                href: '/resource-management/reservations/new',
              },
            },
            {
              action:
                'Write a clear **purpose** (at least 10 characters) and set the **priority**, then submit.',
              detail:
                'A specific reason ("Final-year project demo, needs the projector") helps the approver decide quickly.',
              tip:
                'After you submit, the page shows an **"Approval Required"** notice. Your booking is now a request — you get access only once an approver approves it.',
            },
          ],
        },
        {
          id: 'track',
          title: 'Track your bookings',
          steps: [
            {
              action:
                'Open **My Reservations** to see the status of everything you have booked.',
              detail:
                'Each request shows as pending, approved, or rejected. Open one to see the details or to cancel it if your plans change.',
              link: {
                label: 'Open My Reservations',
                href: '/resource-management/reservations/my-reservations',
              },
            },
            {
              action:
                'Open a single reservation to view its full details or to **cancel** it.',
              detail:
                'Cancel early if you no longer need the slot — that frees the resource for someone else.',
              tip: 'Cancelling needs the "Cancel Reservations" permission, which most requesters have.',
              link: {
                label: 'Open a reservation',
                href: '/resource-management/reservations/:scopeId',
              },
            },
          ],
        },
        {
          id: 'scan',
          title: 'Check in and check out',
          steps: [
            {
              action:
                'Open **Scan** to check a resource out when you collect it and back in when you return it.',
              detail:
                'Point your camera at the resource QR code, or type the token by hand if there is no camera. This records who has the item right now.',
              platforms: {
                web: 'left sidebar → Resource Management → Scan',
                mobile: 'tap More (⋯) in the bottom bar → Resource Management → Scan',
              },
              tip:
                'Always check the item back in when you are done — an item left "checked out" looks unavailable to everyone else.',
              link: { label: 'Open Scan', href: '/resource-management/scan' },
            },
          ],
        },
      ],
    },

    /* ── APPROVER (reviews and approves requests) ──────────────────────── */
    approver: {
      persona: 'approver',
      title: 'Approvals Guide',
      tagline:
        'You review booking requests and decide which ones go ahead.',
      whyItMatters:
        'Nobody gets access to a resource until you approve their request. Clearing the queue quickly keeps people unblocked; a careful "no" prevents double-bookings and misuse.',
      startHere: {
        label: 'Open Approvals',
        href: '/resource-management/reservations/approvals',
      },
      requires: REQUIRES.approver,
      journey: [
        'Open the approvals queue',
        'Read each request',
        'Approve or reject',
        'Keep the queue clear',
      ],
      sections: [
        {
          id: 'review',
          title: 'Work the approvals queue',
          steps: [
            {
              action:
                'Open **Approvals** to see every booking request waiting on a decision.',
              detail:
                'Each row shows the resource, who asked, the time slot, the stated purpose, and the priority.',
              platforms: {
                web: 'left sidebar → Resource Management → Reservations · Approvals',
                mobile: 'tap More (⋯) in the bottom bar → Resource Management → Reservations · Approvals',
              },
              prerequisite:
                'You need the "View Resource Approvals" permission to see this queue. If it is blocked, ask your resource administrator.',
              link: {
                label: 'Open Approvals',
                href: '/resource-management/reservations/approvals',
              },
            },
            {
              action:
                'Read each request against the slot and the purpose before you decide.',
              detail:
                'Check that the resource is genuinely free at that time and that the reason is a fair use of a shared room or item.',
              tip: 'Use the calendar in another tab if you are unsure whether the slot clashes with another booking.',
              link: {
                label: 'Open Calendar',
                href: '/resource-management/reservations/calendar',
              },
            },
          ],
        },
        {
          id: 'decide',
          title: 'Approve or reject',
          steps: [
            {
              action:
                '**Approve** the requests that are fine — that immediately grants the booker access to the resource.',
              detail:
                'You can approve more than one at a time by selecting several rows, then confirming.',
              tip:
                'Approving needs the "Approve Resource Requests" permission. Approval is the moment access is granted, so only approve slots you are sure about.',
            },
            {
              action:
                '**Reject** requests that clash, are unclear, or are not a fair use — and say why.',
              detail:
                'A short reason helps the requester fix and re-submit instead of guessing what went wrong.',
              tip: 'Rejecting needs the "Reject Resource Requests" permission.',
            },
          ],
        },
      ],
    },

    /* ── ADMIN (runs the catalogue + upkeep + analytics) ───────────────── */
    admin: {
      persona: 'admin',
      title: 'Administrator Guide',
      tagline:
        'You build the catalogue of rooms and equipment, keep it in good repair, and watch how it is used.',
      whyItMatters:
        'Everything everyone else does depends on your catalogue. A clean, well-categorised list of resources — kept up to date and serviced on time — is what makes booking fast and fair.',
      startHere: {
        label: 'Open Categories',
        href: '/resource-management/categories',
      },
      requires: REQUIRES.admin,
      journey: [
        'Set up categories',
        'Add the resources',
        'Schedule maintenance',
        'Watch the dashboard',
      ],
      sections: [
        {
          id: 'catalogue',
          title: 'Build the catalogue',
          steps: [
            {
              action:
                'Open **Categories** and create the top-level groups for your resources (for example "Seminar Halls" or "Lab Equipment").',
              detail:
                'Use **Add Category** to create one, and open any category to edit it later.',
              platforms: {
                web: 'left sidebar → Resource Management → Categories · Parents',
                mobile: 'tap More (⋯) in the bottom bar → Resource Management → Categories · Parents',
              },
              prerequisite:
                'You need the "Create Resource Categories" permission to add categories. If Add is blocked, ask your platform admin.',
              link: { label: 'Open Categories', href: '/resource-management/categories' },
            },
            {
              action:
                'Open **Sub-categories** to break a big category into finer groups (for example "Projectors" under "Lab Equipment").',
              detail:
                'Sub-categories keep long resource lists easy to browse and filter.',
              link: {
                label: 'Open Sub-categories',
                href: '/resource-management/categories/sub-categories',
              },
            },
            {
              action:
                'Open **Resources** and use **Add Resource** to add each bookable room or item.',
              detail:
                'Give it a category, a status, and the details people need. Open any resource to view or edit it.',
              tip: 'Adding or editing resources needs the "Create Resources" / "Edit Resources" permission.',
              link: { label: 'Open Resources', href: '/resource-management/resources' },
            },
          ],
        },
        {
          id: 'upkeep',
          title: 'Keep resources in service',
          steps: [
            {
              action:
                'Open **Maintenance** to log servicing, repairs, and maintenance windows.',
              detail:
                'Use **New Maintenance Record** to book a window when a resource is unavailable because it is being serviced.',
              platforms: {
                web: 'left sidebar → Resource Management → Maintenance',
                mobile: 'tap More (⋯) in the bottom bar → Resource Management → Maintenance',
              },
              tip:
                'Scheduling maintenance ahead of time stops people booking a resource that will be out of action.',
              link: { label: 'Open Maintenance', href: '/resource-management/maintenance' },
            },
            {
              action:
                'Use **Scan** to check resources in and out and confirm where each item physically is.',
              detail:
                'Scanning the QR token is the fastest way to assign an item to a holder or mark it returned.',
              link: { label: 'Open Scan', href: '/resource-management/scan' },
            },
          ],
        },
        {
          id: 'analytics',
          title: 'Watch how resources are used',
          steps: [
            {
              action:
                'Open the **Dashboard** to see usage, booking trends, and which resources are in highest demand.',
              detail:
                'Use it to spot a room that is always full (you may need more of it) or an item nobody books (it may not be worth keeping).',
              // FLAG(SME): the analytics dashboard route is gated by
              // resources.analytics.view in sidebarMenuLink.ts. This admin lane is
              // gated on resources.categories.view; an admin without
              // resources.analytics.view will be blocked here. Grant both keys to
              // resource admins, or split analytics into its own lane if needed.
              link: {
                label: 'Open Dashboard',
                href: '/resource-management/analytics-dashboard',
              },
            },
          ],
        },
      ],
    },
  },

  glossary: [
    { term: 'Resource', def: 'Anything you can book — a room, a hall, or a piece of equipment like a projector.' },
    { term: 'Reservation', def: 'A booking of one resource for a set date and time. It starts life as a request.' },
    { term: 'Booking request', def: 'A reservation you have submitted that is waiting for an approver to say yes or no.' },
    { term: 'Approval', def: 'An approver agreeing to a request. This is the moment access to the resource is granted.' },
    { term: 'Rejection', def: 'An approver turning a request down — usually because the slot clashes or the reason is unclear.' },
    { term: 'My Reservations', def: 'Your personal list of bookings, showing which are pending, approved, or rejected.' },
    { term: 'Category', def: 'A top-level group of resources, like "Seminar Halls" or "Lab Equipment".' },
    { term: 'Sub-category', def: 'A finer group inside a category, like "Projectors" inside "Lab Equipment".' },
    { term: 'Maintenance window', def: 'A planned period when a resource is out of action for servicing or repair, so it cannot be booked.' },
    { term: 'QR check-in / check-out', def: 'Scanning a resource\'s QR code (or typing its token) to record that you have collected it or returned it.' },
    { term: 'Token', def: 'The short text code on a resource (e.g. res_a1b2c3d4) you can type when there is no camera to scan the QR code.' },
    { term: 'Priority', def: 'How urgent or important a booking is — it helps approvers decide between competing requests.' },
  ],

  plannedLocaleNote: 'A Tamil version is planned — English only for now.',
};

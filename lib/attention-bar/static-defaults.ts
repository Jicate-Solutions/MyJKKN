/**
 * Layer 1 static defaults registry.
 *
 * Spec §3 Layer 1: every page × role pair must have an entry. This is the
 * safety net that fires when Layers 0/2/3 produce nothing.
 *
 * Coverage v1: 10 pages × 5 roles = 50 entries. Lookup picks the most
 * specific entry: exact (page, role) → exact (page, '*') → ('*', role) → ('*', '*').
 *
 * Adding a page: add 5 entries (one per role) at minimum. If a role wouldn't
 * meaningfully act on the page, fall through to the page-level '*' default
 * by omitting the role-specific entry.
 *
 * Adding a role: add it to the constant list and provide entries for any page
 * where the role's default differs from the page-level '*' fallback.
 */

import type { ActionTemplate, ResolverContext, StaticDefault } from './types';

/* ─────────────────────────────────────────────────────────────────
 * Internal helper — keeps the registry table compact.
 * ─────────────────────────────────────────────────────────────── */

interface Entry {
  page: string;
  role: string;
  action: Omit<ActionTemplate, 'id'> & { id?: string };
}

function entry(page: string, role: string, action: Entry['action']): StaticDefault {
  return {
    page,
    role,
    build: (_ctx: ResolverContext) => ({
      id: action.id ?? `L1.${role}.${page.replace(/^\//, '').replace(/\//g, '.')}`,
      label: action.label,
      context: action.context,
      tone: action.tone,
      cta: action.cta,
      icon: action.icon,
      href: action.href,
    }),
  };
}

/* ─────────────────────────────────────────────────────────────────
 * The registry — read top-to-bottom for hand-edit clarity.
 * ─────────────────────────────────────────────────────────────── */

export const STATIC_DEFAULTS: readonly StaticDefault[] = Object.freeze([
  /* /dashboard */
  entry('/dashboard', 'super_admin', {
    label: 'Open Director\'s Brief',
    context: 'Daily roll-up of every module that needs your attention',
    tone: 'blue', cta: 'Open brief', icon: 'LayoutDashboard',
    href: '/dashboard?view=briefing',
  }),
  entry('/dashboard', 'admin', {
    label: 'Review today\'s queue',
    context: 'Approvals and items waiting on your action',
    tone: 'blue', cta: 'Open queue', icon: 'Inbox',
    href: '/dashboard?view=queue',
  }),
  entry('/dashboard', 'counselor', {
    label: 'Resume your day',
    context: 'Pending leads, scheduled calls, today\'s briefing',
    tone: 'green', cta: 'Open', icon: 'PlayCircle',
    href: '/admission/counselors',
  }),
  entry('/dashboard', 'faculty', {
    label: 'Mark today\'s attendance',
    context: 'Quickest path to your active class period',
    tone: 'green', cta: 'Mark', icon: 'CalendarCheck',
    href: '/academic/attendance/dashboard?view=today',
  }),
  entry('/dashboard', 'hod', {
    label: 'Department pulse',
    context: 'Sections with unmarked attendance + pending approvals',
    tone: 'amber', cta: 'Open', icon: 'Activity',
    href: '/dashboard?view=hod-pulse',
  }),

  /* /admission/leads */
  entry('/admission/leads', 'super_admin', {
    label: 'Funnel overview',
    context: 'Cross-counselor view of pipeline health',
    tone: 'blue', cta: 'Open', icon: 'BarChart3',
    href: '/admission/leads/analytics',
  }),
  entry('/admission/leads', 'admin', {
    label: 'Bulk-assign unassigned leads',
    context: 'Distribute new captures across the counselor team',
    tone: 'amber', cta: 'Assign', icon: 'UsersRound',
    href: '/admission/leads/bulk-assignment',
  }),
  entry('/admission/leads', 'counselor', {
    label: 'Add new lead',
    context: 'Capture a walk-in or phone enquiry',
    tone: 'neutral', cta: 'Add lead', icon: 'UserPlus',
    href: '/admission/leads/new',
  }),
  entry('/admission/leads', 'faculty', {
    label: 'Refer a candidate',
    context: 'Pass a strong applicant to admissions',
    tone: 'neutral', cta: 'Refer', icon: 'Send',
    href: '/admission/leads/refer',
  }),
  entry('/admission/leads', 'hod', {
    label: 'Review program enrolments',
    context: 'See your program\'s admission funnel',
    tone: 'blue', cta: 'Open', icon: 'BookOpen',
    href: '/admission/leads?filter=hod-program',
  }),

  /* /admission/counselors */
  entry('/admission/counselors', 'super_admin', {
    label: 'Counselor team performance',
    context: 'Productivity, attribution, briefing adoption',
    tone: 'blue', cta: 'Open', icon: 'BarChart',
    href: '/admission/counselors/productivity',
  }),
  entry('/admission/counselors', 'admin', {
    label: 'Manage counselor roster',
    context: 'Assign sources, set schedules, mark off-duty',
    tone: 'neutral', cta: 'Manage', icon: 'Settings2',
    href: '/admission/counselors/team',
  }),
  entry('/admission/counselors', 'counselor', {
    label: 'Today\'s briefing',
    context: 'Your queue + scheduled calls + new assignments',
    tone: 'green', cta: 'Open', icon: 'ClipboardList',
    href: '/admission/counselors/briefing',
  }),
  entry('/admission/counselors', 'faculty', {
    label: 'Counselor directory',
    context: 'Find the counselor for a candidate you\'re referring',
    tone: 'neutral', cta: 'Open', icon: 'Search',
    href: '/admission/counselors',
  }),
  entry('/admission/counselors', 'hod', {
    label: 'Program counselor coverage',
    context: 'Which counselors handle your program',
    tone: 'neutral', cta: 'Open', icon: 'Users',
    href: '/admission/counselors?filter=hod-program',
  }),

  /* /academic/attendance/dashboard */
  entry('/academic/attendance/dashboard', 'super_admin', {
    label: 'Today\'s attendance health',
    context: 'Cross-institution unmarked-periods rollup',
    tone: 'blue', cta: 'Open', icon: 'Activity',
    href: '/academic/attendance/dashboard?view=health',
  }),
  entry('/academic/attendance/dashboard', 'admin', {
    label: 'Review unmarked periods',
    context: 'Sections that haven\'t marked attendance today',
    tone: 'amber', cta: 'Open', icon: 'AlertCircle',
    href: '/academic/attendance/dashboard?view=unmarked',
  }),
  entry('/academic/attendance/dashboard', 'counselor', {
    label: 'Lead attendance check',
    context: 'See if your converted candidates are showing up',
    tone: 'neutral', cta: 'Open', icon: 'UserCheck',
    href: '/academic/attendance/dashboard?filter=mine-converted',
  }),
  entry('/academic/attendance/dashboard', 'faculty', {
    label: 'Mark current period',
    context: 'Your active class right now',
    tone: 'green', cta: 'Mark', icon: 'CheckCircle2',
    href: '/academic/attendance/dashboard?view=now',
  }),
  entry('/academic/attendance/dashboard', 'hod', {
    label: 'Department compliance',
    context: 'Faculty who haven\'t marked today',
    tone: 'amber', cta: 'Open', icon: 'ShieldAlert',
    href: '/academic/attendance/dashboard?view=hod-compliance',
  }),

  /* /academic/timetables */
  entry('/academic/timetables', 'super_admin', {
    label: 'Timetable health',
    context: 'Conflicts, missing assignments, gaps',
    tone: 'blue', cta: 'Open', icon: 'CalendarRange',
    href: '/academic/timetables?view=health',
  }),
  entry('/academic/timetables', 'admin', {
    label: 'Resolve scheduling conflicts',
    context: 'Faculty double-booked or missing assignments',
    tone: 'amber', cta: 'Open', icon: 'AlertTriangle',
    href: '/academic/timetables?view=conflicts',
  }),
  entry('/academic/timetables', 'counselor', {
    label: 'Program schedule lookup',
    context: 'Class times for your converted candidates',
    tone: 'neutral', cta: 'Open', icon: 'Calendar',
    href: '/academic/timetables?view=lookup',
  }),
  entry('/academic/timetables', 'faculty', {
    label: 'My schedule today',
    context: 'Periods, sections, room assignments',
    tone: 'neutral', cta: 'Open', icon: 'Clock',
    href: '/academic/timetables?view=mine&day=today',
  }),
  entry('/academic/timetables', 'hod', {
    label: 'Department schedule',
    context: 'All faculty in your department',
    tone: 'neutral', cta: 'Open', icon: 'Users',
    href: '/academic/timetables?view=department',
  }),

  /* /billing/invoices */
  entry('/billing/invoices', 'super_admin', {
    label: 'Approvals queue',
    context: 'Invoices waiting on your sign-off',
    tone: 'amber', cta: 'Open', icon: 'FileCheck2',
    href: '/billing/invoices?filter=approvals',
  }),
  entry('/billing/invoices', 'admin', {
    label: 'Generate invoices',
    context: 'Run scheduled billing for the next cycle',
    tone: 'neutral', cta: 'Generate', icon: 'FilePlus2',
    href: '/billing/invoices/new',
  }),
  entry('/billing/invoices', 'counselor', {
    label: 'My referred candidates\' invoices',
    context: 'Track financial close for your conversions',
    tone: 'neutral', cta: 'Open', icon: 'Receipt',
    href: '/billing/invoices?filter=mine-referred',
  }),
  entry('/billing/invoices', 'faculty', {
    label: 'View student fee status',
    context: 'For learners in your sections',
    tone: 'neutral', cta: 'Open', icon: 'Search',
    href: '/billing/invoices?filter=section',
  }),
  entry('/billing/invoices', 'hod', {
    label: 'Department fee collection',
    context: 'Outstanding amounts in your program',
    tone: 'amber', cta: 'Open', icon: 'IndianRupee',
    href: '/billing/invoices?filter=hod-program',
  }),

  /* /billing/receipts */
  entry('/billing/receipts', 'super_admin', {
    label: 'Reconciliation status',
    context: 'Today\'s collections vs system records',
    tone: 'blue', cta: 'Open', icon: 'BarChart3',
    href: '/billing/receipts?view=reconciliation',
  }),
  entry('/billing/receipts', 'admin', {
    label: 'Issue new receipt',
    context: 'Record a fee payment',
    tone: 'neutral', cta: 'Issue', icon: 'ReceiptIndianRupee',
    href: '/billing/receipts/new',
  }),
  entry('/billing/receipts', 'counselor', {
    label: 'Verify referred candidate payments',
    context: 'Confirm fee close for your conversions',
    tone: 'neutral', cta: 'Open', icon: 'CheckSquare',
    href: '/billing/receipts?filter=mine',
  }),
  entry('/billing/receipts', 'faculty', {
    label: 'Section fee status',
    context: 'Quick lookup for any learner',
    tone: 'neutral', cta: 'Search', icon: 'Search',
    href: '/billing/receipts?view=lookup',
  }),
  entry('/billing/receipts', 'hod', {
    label: 'Program collection report',
    context: 'Last 30 days summary',
    tone: 'blue', cta: 'Open', icon: 'TrendingUp',
    href: '/billing/receipts?view=hod-30day',
  }),

  /* /staff */
  entry('/staff', 'super_admin', {
    label: 'Staff roster',
    context: 'All institutions, all departments',
    tone: 'blue', cta: 'Open', icon: 'Users',
    href: '/staff/list',
  }),
  entry('/staff', 'admin', {
    label: 'Onboard a new staff member',
    context: 'Create profile + assign roles',
    tone: 'neutral', cta: 'Add', icon: 'UserPlus',
    href: '/staff/list/new',
  }),
  entry('/staff', 'counselor', {
    label: 'Counselor team',
    context: 'See the admission cell',
    tone: 'neutral', cta: 'Open', icon: 'Users',
    href: '/staff?filter=counselor',
  }),
  entry('/staff', 'faculty', {
    label: 'Faculty directory',
    context: 'Find a colleague',
    tone: 'neutral', cta: 'Open', icon: 'Search',
    href: '/staff?filter=faculty',
  }),
  entry('/staff', 'hod', {
    label: 'Department roster',
    context: 'Faculty + admin in your department',
    tone: 'neutral', cta: 'Open', icon: 'Users',
    href: '/staff?filter=hod-department',
  }),

  /* /learners */
  entry('/learners', 'super_admin', {
    label: 'Learner master',
    context: 'All institutions, all programs',
    tone: 'blue', cta: 'Open', icon: 'GraduationCap',
    href: '/learners',
  }),
  entry('/learners', 'admin', {
    label: 'Onboard a new learner',
    context: 'Manual enrolment after admission',
    tone: 'neutral', cta: 'Add', icon: 'UserPlus',
    href: '/learners/new',
  }),
  entry('/learners', 'counselor', {
    label: 'My converted candidates',
    context: 'Learners you brought in',
    tone: 'green', cta: 'Open', icon: 'Trophy',
    href: '/learners?filter=mine-converted',
  }),
  entry('/learners', 'faculty', {
    label: 'My sections\' learners',
    context: 'Quick roster lookup',
    tone: 'neutral', cta: 'Open', icon: 'BookOpen',
    href: '/learners?filter=my-sections',
  }),
  entry('/learners', 'hod', {
    label: 'Program enrolment',
    context: 'Active learners in your department',
    tone: 'neutral', cta: 'Open', icon: 'Users',
    href: '/learners?filter=hod-program',
  }),

  /* /system/notifications */
  entry('/system/notifications', 'super_admin', {
    label: 'Compose announcement',
    context: 'Send to roles, audiences, or institutions',
    tone: 'neutral', cta: 'Compose', icon: 'Megaphone',
    href: '/admin/notifications/new',
  }),
  entry('/system/notifications', 'admin', {
    label: 'Review pending notifications',
    context: 'Drafts and scheduled messages',
    tone: 'amber', cta: 'Open', icon: 'Inbox',
    href: '/admin/notifications?filter=pending',
  }),
  entry('/system/notifications', 'counselor', {
    label: 'My notifications',
    context: 'Lead assignments, briefings, replies',
    tone: 'neutral', cta: 'Open', icon: 'Bell',
    href: '/system/notifications?filter=mine',
  }),
  entry('/system/notifications', 'faculty', {
    label: 'My notifications',
    context: 'Assignments, leave responses, announcements',
    tone: 'neutral', cta: 'Open', icon: 'Bell',
    href: '/system/notifications?filter=mine',
  }),
  entry('/system/notifications', 'hod', {
    label: 'Department notifications',
    context: 'Approvals + announcements affecting your department',
    tone: 'neutral', cta: 'Open', icon: 'Bell',
    href: '/system/notifications?filter=hod-scope',
  }),

  /* Catch-all — every page should match something even if not in the registry */
  entry('*', '*', {
    id: 'L1.fallback.global',
    label: 'Open dashboard',
    context: 'Return to your home view',
    tone: 'neutral', cta: 'Open', icon: 'Home',
    href: '/dashboard',
  }),
]);

/**
 * Look up the most specific Layer 1 default for a (page, role) pair.
 *
 * Specificity order:
 *  1. exact (page, role)
 *  2. exact page, role = '*'
 *  3. page = '*', exact role
 *  4. ('*', '*') catch-all
 *
 * Returns null only if the catch-all is missing — should never happen at runtime.
 */
export function findStaticDefault(
  page: string,
  role: string,
): StaticDefault | null {
  const exact = STATIC_DEFAULTS.find(d => d.page === page && d.role === role);
  if (exact) return exact;

  const pageWildcard = STATIC_DEFAULTS.find(d => d.page === page && d.role === '*');
  if (pageWildcard) return pageWildcard;

  const roleWildcard = STATIC_DEFAULTS.find(d => d.page === '*' && d.role === role);
  if (roleWildcard) return roleWildcard;

  const catchAll = STATIC_DEFAULTS.find(d => d.page === '*' && d.role === '*');
  return catchAll ?? null;
}

/**
 * Coverage matrix — used by the future admin UI Tab 2 to surface gaps.
 *
 * Returns the set of (page, role) pairs that resolve via fallback rather
 * than an exact match. Phase 1 doesn't render this anywhere; Phase 4 will.
 */
export function getCoverageGaps(
  pages: readonly string[],
  roles: readonly string[],
): { page: string; role: string }[] {
  const gaps: { page: string; role: string }[] = [];
  for (const page of pages) {
    for (const role of roles) {
      const exact = STATIC_DEFAULTS.find(d => d.page === page && d.role === role);
      if (!exact) gaps.push({ page, role });
    }
  }
  return gaps;
}

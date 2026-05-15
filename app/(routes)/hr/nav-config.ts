import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * HR — 9 logical module groups.
 *
 * Created 2026-05-10 in response to BUG-003301: COO reported that the HR
 * sidebar entry rendered as a single non-expandable link, hiding all the
 * sub-pages (recruitment, leave, employees, attendance, shifts, documents,
 * onboarding, policies). This config makes every page reachable via tier-2
 * group chips and tier-3 page chips, mirroring the admission-CRM pattern.
 *
 * Children entries (and their `matchPaths`) double as the orphan-coverage
 * manifest for `scripts/check-nav-reachability.ts`. Every URL we want the
 * nav-check to consider "discoverable" must appear here as a literal `href`
 * or an exact `matchPaths` entry.
 */
const config: ModuleNavConfig = {
  module: 'hr',
  groups: [
    {
      label: 'Dashboard',
      icon: 'LayoutDashboard',
      href: '/hr',
      matchPaths: ['/hr'],
    },
    {
      label: 'Recruitment',
      icon: 'UserPlus',
      href: '/hr/recruitment',
      matchPaths: ['/hr/recruitment'],
      children: [
        {
          label: 'Overview',
          icon: 'UserPlus',
          href: '/hr/recruitment',
          exact: true,
        },
        {
          label: 'Submit Candidate',
          icon: 'FilePlus',
          href: '/hr/recruitment/submit',
          matchPaths: ['/hr/recruitment/submit'],
        },
        {
          label: 'Approvals',
          icon: 'ClipboardCheck',
          href: '/hr/recruitment/approvals',
          matchPaths: ['/hr/recruitment/approvals'],
        },
        {
          label: 'Jobs',
          icon: 'Briefcase',
          href: '/hr/recruitment/jobs',
          matchPaths: ['/hr/recruitment/jobs'],
        },
        // Candidates list page not yet built (only [id] detail exists).
        // Re-add this nav entry when app/(routes)/hr/recruitment/candidates/page.tsx
        // ships. Removed 2026-05-11 so the nav-config-href-audit gate ships
        // as-enforcing.
        {
          label: 'My Submissions',
          icon: 'ClipboardList',
          href: '/hr/recruitment/my',
          matchPaths: ['/hr/recruitment/my'],
        },
      ],
    },
    {
      label: 'Leave',
      icon: 'CalendarDays',
      href: '/hr/leave',
      matchPaths: ['/hr/leave'],
      children: [
        {
          label: 'Overview',
          icon: 'CalendarDays',
          href: '/hr/leave',
          exact: true,
        },
        {
          label: 'Apply',
          icon: 'FilePlus',
          href: '/hr/leave/apply',
          matchPaths: ['/hr/leave/apply'],
        },
        {
          label: 'Approve',
          icon: 'ClipboardCheck',
          href: '/hr/leave/approve',
          matchPaths: ['/hr/leave/approve'],
        },
        {
          label: 'Balance',
          icon: 'Wallet',
          href: '/hr/leave/balance',
          matchPaths: ['/hr/leave/balance'],
        },
        {
          label: 'Calendar',
          icon: 'Calendar',
          href: '/hr/leave/calendar',
          matchPaths: ['/hr/leave/calendar'],
        },
        {
          label: 'Encashment',
          icon: 'IndianRupee',
          href: '/hr/leave/encashment',
          matchPaths: ['/hr/leave/encashment'],
        },
        {
          label: 'My Applications',
          icon: 'ClipboardList',
          href: '/hr/leave/my-applications',
          matchPaths: ['/hr/leave/my-applications'],
        },
      ],
    },
    {
      label: 'Employees',
      icon: 'UsersRound',
      href: '/hr/employees',
      matchPaths: ['/hr/employees'],
    },
    {
      label: 'Onboarding',
      icon: 'UserCog',
      href: '/hr/onboarding',
      matchPaths: ['/hr/onboarding'],
    },
    {
      label: 'My Assets',
      icon: 'Laptop',
      href: '/hr/my-assets',
      matchPaths: ['/hr/my-assets'],
    },
    {
      label: 'Offboarding',
      icon: 'LogOut',
      href: '/hr/offboarding',
      matchPaths: ['/hr/offboarding'],
    },
    {
      label: 'Attendance',
      icon: 'UserCheck',
      href: '/hr/attendance',
      matchPaths: ['/hr/attendance'],
      children: [
        {
          label: 'Overview',
          icon: 'UserCheck',
          href: '/hr/attendance',
          exact: true,
        },
        {
          label: 'Regularize',
          icon: 'ClipboardCheck',
          href: '/hr/attendance/regularize',
          matchPaths: ['/hr/attendance/regularize'],
        },
        {
          label: 'Regularize Approvals',
          icon: 'ShieldCheck',
          href: '/hr/attendance/regularize/approvals',
          matchPaths: ['/hr/attendance/regularize/approvals'],
        },
      ],
    },
    {
      label: 'Shifts',
      icon: 'Clock',
      href: '/hr/shifts',
      matchPaths: ['/hr/shifts'],
      children: [
        {
          label: 'Overview',
          icon: 'Clock',
          href: '/hr/shifts',
          exact: true,
        },
        {
          label: 'My Shifts',
          icon: 'Clock',
          href: '/hr/shifts/my',
          matchPaths: ['/hr/shifts/my'],
        },
        {
          label: 'Shift Approvals',
          icon: 'ClipboardCheck',
          href: '/hr/shifts/approvals',
          matchPaths: ['/hr/shifts/approvals'],
        },
      ],
    },
    {
      label: 'Documents',
      icon: 'FileText',
      href: '/hr/documents',
      matchPaths: ['/hr/documents'],
      children: [
        {
          label: 'Overview',
          icon: 'FileText',
          href: '/hr/documents',
          exact: true,
        },
        {
          label: 'Verify Documents',
          icon: 'ShieldCheck',
          href: '/hr/documents/verify',
          matchPaths: ['/hr/documents/verify'],
        },
      ],
    },
    {
      label: 'Performance Reviews',
      icon: 'ClipboardCheck',
      href: '/hr/performance-reviews',
      matchPaths: ['/hr/performance-reviews'],
      children: [
        {
          label: 'My Appraisal',
          icon: 'ClipboardCheck',
          href: '/hr/performance-reviews',
          exact: true,
        },
        {
          label: 'Team Reviews',
          icon: 'UsersRound',
          href: '/hr/performance-reviews/team',
          matchPaths: ['/hr/performance-reviews/team'],
        },
      ],
    },
    {
      label: 'Policies',
      icon: 'ShieldCheck',
      href: '/hr/policies',
      matchPaths: ['/hr/policies'],
    },
  ],
};

export default config;

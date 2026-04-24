import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Academic Management — 10 logical module tabs.
 *
 * Mirrors the previous hand-coded AcademicNav but as data.
 * `matchPaths` preserves the original groupPaths — notably
 * Leaves spans /academic/leaves + /academic/leave-calendar +
 * /academic/leave-onduty so all three routes highlight one tab, and
 * Assessment spans /academic/course-grades + /academic/internal-marks
 * so both marks/grades faculty surfaces live under one tab.
 *
 * URLs are unchanged — this is a pure navigation-chrome migration for
 * a HIGH-TRAFFIC module (timetables / attendance / periods are used
 * daily by faculty).
 *
 * Tier-3 `children` entries (added 2026-04-23 in orphan-sweep PR)
 * restore discoverability for sub-dashboards and settings pages that
 * previously lived under hand-coded SectionSubNav components deleted
 * in PR #375. Each child is a real chip users can click, and satisfies
 * the nav-coverage detector (scripts/assert-nav-coverage.mjs).
 */
const config: ModuleNavConfig = {
  module: 'academic',
  groups: [
    {
      label: 'Years',
      icon: 'CalendarDays',
      href: '/academic/years',
      matchPaths: ['/academic/years'],
    },
    {
      label: 'Regulations',
      icon: 'Bookmark',
      href: '/academic/regulations',
      matchPaths: ['/academic/regulations'],
    },
    {
      label: 'Batches',
      icon: 'Boxes',
      href: '/academic/batches',
      matchPaths: ['/academic/batches'],
    },
    {
      label: 'Periods',
      icon: 'Clock',
      href: '/academic/periods',
      matchPaths: ['/academic/periods'],
    },
    {
      label: 'Timetables',
      icon: 'CalendarClock',
      href: '/academic/timetables',
      matchPaths: ['/academic/timetables'],
      children: [
        {
          label: 'Overview',
          icon: 'LayoutDashboard',
          href: '/academic/timetables',
          exact: true,
        },
        {
          label: 'Faculty Calendar',
          icon: 'CalendarRange',
          href: '/academic/timetables/faculty-calendar',
          matchPaths: ['/academic/timetables/faculty-calendar'],
        },
        {
          label: 'Calendar Admin',
          icon: 'Settings2',
          href: '/academic/timetables/faculty-calendar/admin',
          matchPaths: ['/academic/timetables/faculty-calendar/admin'],
        },
        {
          label: 'Templates',
          icon: 'FileStack',
          href: '/academic/timetables/templates',
          matchPaths: ['/academic/timetables/templates'],
        },
        {
          label: 'Template Analytics',
          icon: 'BarChart3',
          href: '/academic/timetables/templates/analytics',
          matchPaths: ['/academic/timetables/templates/analytics'],
        },
        {
          label: 'Conflicts',
          icon: 'AlertTriangle',
          href: '/academic/timetables/conflicts',
          matchPaths: ['/academic/timetables/conflicts'],
        },
      ],
    },
    {
      label: 'Attendance',
      icon: 'ClipboardCheck',
      href: '/academic/attendance',
      matchPaths: ['/academic/attendance'],
      children: [
        {
          label: 'Overview',
          icon: 'LayoutDashboard',
          href: '/academic/attendance',
          exact: true,
        },
        {
          label: 'Dashboard',
          icon: 'Gauge',
          href: '/academic/attendance/dashboard',
          matchPaths: ['/academic/attendance/dashboard'],
        },
        {
          label: 'Mark',
          icon: 'PenLine',
          href: '/academic/attendance/mark',
          matchPaths: ['/academic/attendance/mark'],
        },
        {
          label: 'Pending',
          icon: 'Hourglass',
          href: '/academic/attendance/pending',
          matchPaths: ['/academic/attendance/pending'],
        },
        {
          label: 'Reports',
          icon: 'FileBarChart',
          href: '/academic/attendance/reports',
          matchPaths: ['/academic/attendance/reports'],
        },
        {
          label: 'Consolidation',
          icon: 'Layers',
          href: '/academic/attendance/consolidation',
          matchPaths: ['/academic/attendance/consolidation'],
        },
        {
          label: 'Facilitators',
          icon: 'Users',
          href: '/academic/attendance/consolidation/facilitators',
          matchPaths: ['/academic/attendance/consolidation/facilitators'],
        },
      ],
    },
    {
      label: 'Assessment',
      icon: 'GraduationCap',
      href: '/academic/internal-marks',
      matchPaths: [
        '/academic/internal-marks',
        '/academic/course-grades',
      ],
      children: [
        {
          label: 'Internal Marks',
          icon: 'PenLine',
          href: '/academic/internal-marks',
          exact: true,
        },
        {
          label: 'Internal Marks Report',
          icon: 'FileBarChart',
          href: '/academic/internal-marks/report',
        },
        {
          label: 'Course Grades',
          icon: 'GraduationCap',
          href: '/academic/course-grades',
        },
      ],
    },
    {
      label: 'Leaves',
      icon: 'CalendarX2',
      href: '/academic/leaves',
      matchPaths: [
        '/academic/leaves',
        '/academic/leave-calendar',
        '/academic/leave-onduty',
      ],
      children: [
        {
          label: 'Leaves',
          icon: 'CalendarX2',
          href: '/academic/leaves',
          exact: true,
        },
        {
          label: 'Leave Calendar',
          icon: 'CalendarDays',
          href: '/academic/leave-calendar',
          matchPaths: ['/academic/leave-calendar'],
        },
        {
          label: 'On-Duty',
          icon: 'UserCheck',
          href: '/academic/leave-onduty',
          exact: true,
        },
        {
          label: 'On-Duty Approvals',
          icon: 'BadgeCheck',
          href: '/academic/leave-onduty/approvals',
          matchPaths: ['/academic/leave-onduty/approvals'],
        },
        {
          label: 'On-Duty Reports',
          icon: 'FileBarChart',
          href: '/academic/leave-onduty/reports',
          matchPaths: ['/academic/leave-onduty/reports'],
        },
        {
          label: 'On-Duty Settings',
          icon: 'Settings2',
          href: '/academic/leave-onduty/settings',
          matchPaths: ['/academic/leave-onduty/settings'],
        },
        {
          label: 'Leave Settings',
          icon: 'Settings',
          href: '/academic/leaves/settings',
          matchPaths: ['/academic/leaves/settings'],
        },
        {
          label: 'Leave Types',
          icon: 'Tag',
          href: '/academic/leaves/settings/types',
          matchPaths: ['/academic/leaves/settings/types'],
        },
        {
          label: 'Leave Workflows',
          icon: 'Workflow',
          href: '/academic/leaves/settings/workflows',
          matchPaths: ['/academic/leaves/settings/workflows'],
        },
      ],
    },
    {
      label: 'Planning',
      icon: 'UserSearch',
      href: '/academic/staff-planning',
      matchPaths: ['/academic/staff-planning'],
    },
    {
      label: 'Privileges',
      icon: 'Shield',
      href: '/academic/privileges',
      matchPaths: ['/academic/privileges'],
      children: [
        {
          label: 'Overview',
          icon: 'LayoutDashboard',
          href: '/academic/privileges',
          exact: true,
        },
        {
          label: 'My Privileges',
          icon: 'UserCircle',
          href: '/academic/privileges/my',
          matchPaths: ['/academic/privileges/my'],
        },
        {
          label: 'My Report',
          icon: 'FileBarChart',
          href: '/academic/privileges/my/report',
          matchPaths: ['/academic/privileges/my/report'],
        },
        {
          label: 'Templates',
          icon: 'FileStack',
          href: '/academic/privileges/templates',
          matchPaths: ['/academic/privileges/templates'],
        },
      ],
    },
  ],
};

export default config;

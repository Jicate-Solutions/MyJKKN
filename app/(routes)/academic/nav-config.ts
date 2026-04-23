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
    },
    {
      label: 'Attendance',
      icon: 'ClipboardCheck',
      href: '/academic/attendance',
      matchPaths: ['/academic/attendance'],
    },
    {
      label: 'Assessment',
      icon: 'GraduationCap',
      href: '/academic/internal-marks',
      matchPaths: [
        '/academic/internal-marks',
        '/academic/course-grades',
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
    },
  ],
};

export default config;

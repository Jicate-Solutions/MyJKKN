import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Board of Studies (BoS) — 10 logical tabs.
 *
 * Mirrors BOS_NAV_TABS in layout.tsx as data for the reachability checker.
 * Each tab is a clickable chip in AutoTabNav.
 */
const config: ModuleNavConfig = {
  module: 'bos',
  groups: [
    {
      label: 'Taxonomy',
      icon: 'Layers',
      href: '/bos/taxonomy',
      matchPaths: ['/bos/taxonomy'],
    },
    {
      label: 'Courses',
      icon: 'BookText',
      href: '/bos/courses',
      matchPaths: ['/bos/courses'],
    },
    {
      label: 'Course Scheme',
      icon: 'ListTree',
      href: '/bos/course-scheme',
      matchPaths: ['/bos/course-scheme'],
    },
    {
      label: 'External Experts',
      icon: 'Users',
      href: '/bos/experts',
      matchPaths: ['/bos/experts'],
    },
    {
      label: 'Compositions',
      icon: 'ClipboardList',
      href: '/bos/compositions',
      matchPaths: ['/bos/compositions'],
    },
    {
      label: 'Syllabus',
      icon: 'BookOpen',
      href: '/bos/syllabus',
      matchPaths: ['/bos/syllabus'],
    },
    {
      label: 'SOP',
      icon: 'FileText',
      href: '/bos/sop',
      matchPaths: ['/bos/sop'],
    },
    {
      label: 'Meetings',
      icon: 'CalendarDays',
      href: '/bos/meetings',
      matchPaths: ['/bos/meetings'],
    },
    {
      label: 'TA/DA Claims',
      icon: 'Receipt',
      href: '/bos/ta-da',
      matchPaths: ['/bos/ta-da'],
    },
    {
      label: 'Reports',
      icon: 'BarChart3',
      href: '/bos/reports',
      matchPaths: ['/bos/reports'],
    },
  ],
};

export default config;

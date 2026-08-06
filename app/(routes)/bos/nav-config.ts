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
      label: 'SOP',
      icon: 'FileText',
      href: '/bos/sop',
      matchPaths: ['/bos/sop'],
    },
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
      label: 'Committees',
      icon: 'UsersRound',
      href: '/bos/committees',
      matchPaths: ['/bos/committees'],
    },
    {
      label: 'Member Types',
      icon: 'UserCog',
      href: '/bos/member-types',
      matchPaths: ['/bos/member-types'],
    },
    {
      label: 'Compositions',
      icon: 'ClipboardList',
      href: '/bos/compositions',
      matchPaths: ['/bos/compositions'],
    },
    {
      label: 'PO & PSO',
      icon: 'Target',
      href: '/bos/po-pso',
      matchPaths: ['/bos/po-pso'],
    },
    {
      label: 'Syllabus',
      icon: 'BookOpen',
      href: '/bos/syllabus',
      matchPaths: ['/bos/syllabus'],
    },
    {
      label: 'Meetings',
      icon: 'CalendarDays',
      href: '/bos/meetings',
      matchPaths: ['/bos/meetings'],
    },
    {
      label: 'Academic Council',
      icon: 'Landmark',
      href: '/bos/academic-council',
      matchPaths: ['/bos/academic-council'],
    },
    {
      label: 'Governing Body',
      icon: 'Building2',
      href: '/bos/governing-body',
      matchPaths: ['/bos/governing-body'],
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

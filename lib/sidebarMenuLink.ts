'use client';

import {
  Home,
  Users,
  Box,
  FileText,
  School,
  HeadphonesIcon,
  MessageSquare,
  Settings,
  BarChart,
  Database,
  Key,
  Globe,
  Bell,
  HelpCircle,
  LogOut,
  UserPlus,
  Shield,
  ClipboardList,
  TabletSmartphone,
  Tags,
  Link2,
  MessageCircle,
  CalendarDays,
  Building2,
  GraduationCap,
  BookOpen,
  ClipboardCheck,
  Gauge,
  Lock,
  LucideIcon,
  LayoutGrid,
  Building,
  Boxes,
  CalendarClock,
  UserSearch,
  Flame,
  FolderTree,
  Calendar,
  FileBarChart
} from 'lucide-react';

interface MenuItem {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  submenus: Array<{
    href: string;
    label: string;
    active: boolean;
  }>;
}

interface MenuGroup {
  groupLabel?: string;
  menus: MenuItem[];
}

export function GetPages(pathname: string): MenuGroup[] {
  return [
    {
      groupLabel: 'Overview',
      menus: [
        {
          href: '/',
          label: 'Dashboard',
          active: pathname === '/',
          icon: Home,
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'User Management',
      menus: [
        {
          href: '/users',
          label: 'All Users',
          active: pathname === '/users',
          icon: Users,
          submenus: []
        },
        // {
        //   href: '/users/new',
        //   label: 'Add New User',
        //   active: pathname === '/users/new',
        //   icon: UserPlus,
        //   submenus: []
        // },
        {
          href: '/users/roles',
          label: 'Roles & Permissions',
          active: pathname === '/users/roles',
          icon: Shield,
          submenus: []
        }
        // {
        //   href: '/users/activity',
        //   label: 'User Activity Logs',
        //   active: pathname === '/users/activity',
        //   icon: ClipboardList,
        //   submenus: []
        // }
      ]
    },
    {
      groupLabel: 'Applications',
      menus: [
        {
          href: '/application-hub/api-guidelines',
          label: 'API Guidelines',
          active: pathname === '/application-hub/api-guidelines',
          icon: BookOpen, // or any other icon you prefer
          submenus: []
        },
        {
          href: '/application-hub',
          label: 'Application Hub',
          active: pathname === '/application-hub',
          icon: LayoutGrid, // or any other icon you prefer
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'Application Management',
      menus: [
        {
          href: '/applications',
          label: 'All Applications',
          active: pathname === '/applications',
          icon: TabletSmartphone,
          submenus: []
        },
        {
          href: '/applications/new',
          label: 'Add New Application',
          active: pathname === '/applications/new',
          icon: Box,
          submenus: []
        },
        {
          href: '/applications/categories',
          label: 'Categories & Subcategories',
          active: pathname === '/applications/categories',
          icon: Tags,
          submenus: []
        }
        // {
        //   href: '/applications/integrations',
        //   label: 'API Integrations',
        //   active: pathname === '/applications/integrations',
        //   icon: Link2,
        //   submenus: []
        // },
        // {
        //   href: '/applications/feedback',
        //   label: 'Application Feedback',
        //   active: pathname === '/applications/feedback',
        //   icon: MessageCircle,
        //   submenus: []
        // }
      ]
    },
    {
      groupLabel: 'Organization Management',
      menus: [
        {
          href: '/organizations/institutions',
          label: 'Institutions',
          active: pathname.startsWith('/organizations/institutions'),
          icon: Building,
          submenus: []
        },
        {
          href: '/organizations/degrees',
          label: 'Degrees',
          active: pathname.startsWith('/organizations/degrees'),
          icon: Boxes,
          submenus: []
        },
        {
          href: '/organizations/departments',
          label: 'Departments',
          active: pathname.startsWith('/organizations/departments'),
          icon: Flame,
          submenus: []
        },
        {
          href: '/organizations/programs',
          label: 'Programs',
          active: pathname.startsWith('/organizations/programs'),
          icon: GraduationCap,
          submenus: []
        },
        {
          href: '/organizations/courses',
          label: 'Courses',
          active: pathname.startsWith('/organizations/courses'),
          icon: BookOpen,
          submenus: []
        },
        {
          href: '/organizations/semesters',
          label: 'Semesters',
          active: pathname.startsWith('/organizations/semesters'),
          icon: CalendarDays,
          submenus: []
        },
        {
          href: '/organizations/sections',
          label: 'Sections',
          active: pathname.startsWith('/organizations/sections'),
          icon: BookOpen,
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'Staff Management',
      menus: [
        {
          href: '/staff/category',
          label: 'Staff Category',
          active: pathname === '/staff/category',
          icon: Tags,
          submenus: []
        },
        {
          href: '/staff/list',
          label: 'Staff List',
          active: pathname === '/staff/list',
          icon: Users,
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'Academic Management',
      menus: [
        {
          href: '/academic/years',
          label: 'Academic Years',
          active: pathname === '/academic/years',
          icon: CalendarDays,
          submenus: []
        },
        {
          href: '/academic/staff-planning',
          label: 'Staff Planning',
          active: pathname === '/academic/staff-planning',
          icon: UserSearch,
          submenus: []
        },
        {
          href: '/academic/timetables',
          label: 'Timetables',
          active: pathname === '/academic/timetables',
          icon: CalendarClock,
          submenus: []
        }
      ]
    },
    // {
    //   groupLabel: 'Support & Feedback',
    //   menus: [
    //     {
    //       href: '/support/tickets',
    //       label: 'Support Tickets',
    //       active: pathname === '/support/tickets',
    //       icon: HeadphonesIcon,
    //       submenus: []
    //     },
    //     {
    //       href: '/support/feedback',
    //       label: 'Feedback',
    //       active: pathname === '/support/feedback',
    //       icon: MessageSquare,
    //       submenus: []
    //     },
    //     {
    //       href: '/support/knowledge-base',
    //       label: 'Knowledge Base',
    //       active: pathname === '/support/knowledge-base',
    //       icon: FileText,
    //       submenus: []
    //     }
    //   ]
    // },
    // {
    //   groupLabel: 'Settings',
    //   menus: [
    //     {
    //       href: '/settings/general',
    //       label: 'General Settings',
    //       active: pathname === '/settings/general',
    //       icon: Settings,
    //       submenus: []
    //     },
    //     {
    //       href: '/settings/auth',
    //       label: 'Authentication Settings',
    //       active: pathname === '/settings/auth',
    //       icon: Lock,
    //       submenus: []
    //     },
    //     {
    //       href: '/settings/security',
    //       label: 'Security Settings',
    //       active: pathname === '/settings/security',
    //       icon: Shield,
    //       submenus: []
    //     }
    //   ]
    // },
    // {
    //   groupLabel: 'Reports & Analytics',
    //   menus: [
    //     {
    //       href: '/reports/users',
    //       label: 'User Reports',
    //       active: pathname === '/reports/users',
    //       icon: BarChart,
    //       submenus: []
    //     },
    //     {
    //       href: '/reports/usage',
    //       label: 'Application Usage',
    //       active: pathname === '/reports/usage',
    //       icon: Gauge,
    //       submenus: []
    //     }
    //   ]
    // },

    {
      groupLabel: 'Resource Management',
      menus: [
        {
          href: '/resources/physical-resources',
          label: 'Physical Resources',
          icon: Boxes,
          active: pathname.startsWith('/resources/physical-resources'),
          submenus: [
            {
              href: '/resources/physical-resources/dashboard',
              label: 'Dashboard',
              active: pathname === '/resources/physical-resources/dashboard'
            },
            {
              href: '/resources/physical-resources/resources',
              label: 'All Resources',
              active: pathname === '/resources/physical-resources/resources'
            },
            {
              href: '/resources/physical-resources/categories',
              label: 'Categories',
              active: pathname === '/resources/physical-resources/categories'
            },
            {
              href: '/resources/physical-resources/reservations',
              label: 'Reservations',
              active: pathname === '/resources/physical-resources/reservations'
            },
            {
              href: '/resources/physical-resources/policies',
              label: 'Sharing Policies',
              active: pathname === '/resources/physical-resources/policies'
            },
            {
              href: '/resources/physical-resources/reports',
              label: 'Usage Reports',
              active: pathname === '/resources/physical-resources/reports'
            },
            {
              href: '/resources/physical-resources/requests',
              label: 'Resource Requests',
              active: pathname === '/resources/physical-resources/requests'
            }
          ]
        },
        {
          href: '/resources/digital-resources',
          label: 'Digital Resources',
          icon: FileBarChart,
          active: pathname.startsWith('/resources/digital-resources'),
          submenus: [
            {
              href: '/resources/digital-resources/dashboard',
              label: 'Dashboard',
              active: pathname === '/resources/digital-resources/dashboard'
            },
            {
              href: '/resources/digital-resources/resources',
              label: 'All Resources',
              active: pathname === '/resources/digital-resources/resources'
            },
            {
              href: '/resources/digital-resources/categories',
              label: 'Categories',
              active: pathname === '/resources/digital-resources/categories'
            },
            {
              href: '/resources/digital-resources/reservations',
              label: 'Reservations',
              active: pathname === '/resources/digital-resources/reservations'
            }
          ]
        }
      ]
    },
    {
      groupLabel: 'System',
      menus: [
        // {
        //   href: '/system/database',
        //   label: 'Database Management',
        //   active: pathname === '/system/database',
        //   icon: Database,
        //   submenus: []
        // },
        {
          href: '/system/api-management',
          label: 'API Management',
          active: pathname === '/system/api-management',
          icon: Key,
          submenus: []
        }
        // {
        //   href: '/system/localization',
        //   label: 'Localization',
        //   active: pathname === '/system/localization',
        //   icon: Globe,
        //   submenus: []
        // }
      ]
    }
    // {
    //   groupLabel: 'Help & Support',
    //   menus: [
    //     {
    //       href: '/help',
    //       label: 'Help & Documentation',
    //       active: pathname === '/help',
    //       icon: HelpCircle,
    //       submenus: []
    //     },
    //     {
    //       href: '/logout',
    //       label: 'Logout',
    //       active: false,
    //       icon: LogOut,
    //       submenus: []
    //     }
    //   ]
    // }
  ];
}

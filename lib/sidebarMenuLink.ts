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
  Boxes
} from 'lucide-react';
import { MdLocalFireDepartment } from 'react-icons/md';

type Submenu = {
  href: string;
  label: string;
  active: boolean;
};

type Menu = {
  href: string;
  label: string;
  active: boolean;
  icon: LucideIcon | React.ElementType; // ideally this should be more strictly typed
  submenus: Submenu[];
};

type Group = {
  groupLabel: string;
  menus: Menu[];
};

export function GetPages(pathname: string): Group[] {
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
          icon: MdLocalFireDepartment,
          submenus: []
        }
      ]
    },
    // {
    //   groupLabel: 'Content Management',
    //   menus: [
    //     {
    //       href: '/content/announcements',
    //       label: 'Announcements',
    //       active: pathname === '/content/announcements',
    //       icon: Bell,
    //       submenus: []
    //     },
    //     {
    //       href: '/content/events',
    //       label: 'Event Management',
    //       active: pathname === '/content/events',
    //       icon: CalendarDays,
    //       submenus: []
    //     },
    //     {
    //       href: '/content/notifications',
    //       label: 'Notifications',
    //       active: pathname === '/content/notifications',
    //       icon: Bell,
    //       submenus: []
    //     }
    //   ]
    // },
    // {
    //   groupLabel: 'Academic Management',
    //   menus: [
    //     {
    //       href: '/academic/institutions',
    //       label: 'Institutions',
    //       active: pathname === '/academic/institutions',
    //       icon: Building2,
    //       submenus: []
    //     },
    //     {
    //       href: '/academic/departments',
    //       label: 'Departments',
    //       active: pathname === '/academic/departments',
    //       icon: School,
    //       submenus: []
    //     },
    //     {
    //       href: '/academic/programs',
    //       label: 'Programs',
    //       active: pathname === '/academic/programs',
    //       icon: GraduationCap,
    //       submenus: []
    //     },
    //     {
    //       href: '/academic/courses',
    //       label: 'Courses',
    //       active: pathname === '/academic/courses',
    //       icon: BookOpen,
    //       submenus: []
    //     },
    //     {
    //       href: '/academic/enrollments',
    //       label: 'Enrollments',
    //       active: pathname === '/academic/enrollments',
    //       icon: ClipboardCheck,
    //       submenus: []
    //     }
    //   ]
    // },
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

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
  FileBarChart,
  PlusCircle,
  Clock
} from 'lucide-react';
import { CustomRole } from '@/types/auth';

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

// Define permissions required for each menu item
interface MenuPermissions {
  [menuPath: string]: string; // Maps menu path to required permission key
}

export const MENU_PERMISSIONS: MenuPermissions = {
  // Overview
  '/': 'view_dashboard', // Dashboard should have a permission too

  // User Management
  '/users': 'users.view',
  '/users/roles': 'roles.assign',
  '/users/role-management': 'roles.create',

  // Application Hub
  '/application-hub': 'application_hub.view',
  '/application-hub/api-guidelines': 'application_hub.guidelines.view',

  // Application Management
  '/applications': 'applications.view',
  '/applications/new': 'applications.create',
  '/applications/categories': 'applications.categories.view',

  // Admissions Management
  '/admissions': 'admissions.view',
  '/admissions/new': 'admissions.create',
  '/admissions/crm': 'admissions.crm.view',

  // Organization Management
  '/organizations/institutions': 'organizations.institutions.view',
  '/organizations/degrees': 'organizations.degrees.view',
  '/organizations/departments': 'organizations.departments.view',
  '/organizations/programs': 'organizations.programs.view',
  '/organizations/courses': 'organizations.courses.view',
  '/organizations/semesters': 'organizations.semesters.view',
  '/organizations/sections': 'organizations.sections.view',
  '/organizations/course-mappings': 'organizations.course_mappings.view',
  '/organizations/courses/new': 'organizations.courses.create',
  '/organizations/courses/mappings': 'organizations.course_mappings.view',

  //student management
  '/students': 'students.view',
  '/students/new': 'students.create',
  '/students/onboarding': 'students.onboarding.view',

  // Staff Management
  '/staff/category': 'staff.categories.view',
  '/staff/list': 'staff.view',

  // Academic Management
  '/academic/years': 'academic.years.view',
  '/academic/staff-planning': 'academic.staff.planning.view',
  '/academic/timetables': 'academic.timetables.view',
  '/academic/periods': 'academic.periods.view',

  // Resource Management

  // physical Resources
  '/resources/physical-resources/dashboard':
    'physical_resources.dashboard.view',
  '/resources/physical-resources/resources': 'physical_resources.view',
  '/resources/physical-resources/categories':
    'physical_resources.categories.view',
  '/resources/physical-resources/reservations':
    'physical_resources.reservations.view',
  '/resources/physical-resources/policies': 'physical_resources.policies.view',
  '/resources/physical-resources/reports': 'physical_resources.reports.view',
  '/resources/physical-resources/requests': 'physical_resources.requests.view',

  // digital Resources
  '/resources/digital-resources/dashboard': 'digital_resources.dashboard.view',
  '/resources/digital-resources/resources': 'digital_resources.view',
  '/resources/digital-resources/categories':
    'digital_resources.categories.view',
  '/resources/digital-resources/reservations':
    'digital_resources.reservations.view',
  '/resources/digital-resources/reports': 'digital_resources.reports.view',

  // Generic resource paths
  '/resources': 'resources.view',
  '/physical-resources': 'physical_resources.view',
  '/digital-resources': 'digital_resources.view',

  // System Management
  '/system/api-management': 'system.api.view'
};

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
        {
          href: '/users/roles',
          label: 'Roles Assignment',
          active: pathname === '/users/roles',
          icon: Shield,
          submenus: []
        },
        {
          href: '/users/role-management',
          label: 'Role Management',
          active: pathname === '/users/role-management',
          icon: Settings,
          submenus: []
        }
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
        },
        {
          href: '/organizations/courses',
          label: 'Courses',
          active: pathname === '',
          icon: BookOpen,
          submenus: [
            {
              href: '/organizations/courses',
              label: 'All Courses',
              active: pathname === '/organizations/courses'
            },
            {
              href: '/organizations/courses/mappings',
              label: 'Course Mappings',
              active: pathname === '/organizations/courses/mappings'
            }
          ]
        }
      ]
    },
    {
      groupLabel: 'Learners Management',
      menus: [
        {
          href: '/students',
          label: 'All Learners',
          active: pathname === '',
          icon: Users,
          submenus: [
            {
              href: '/students/onboarding',
              label: 'Learners Onboarding',
              active: pathname === '/students/onboarding'
            },
            {
              href: '/students ',
              label: 'Learners List',
              active: pathname === '/students'
            }
          ]
        }
      ]
    },

    {
      groupLabel: 'Facilitators Management',
      menus: [
        {
          href: '/staff/category',
          label: 'Facilitators Category',
          active: pathname === '/staff/category',
          icon: Tags,
          submenus: []
        },
        {
          href: '/staff/list',
          label: 'Facilitators List',
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
          href: '/academic/periods',
          label: 'Periods',
          active: pathname === '/academic/periods',
          icon: Clock,
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

    {
      groupLabel: 'Admissions Management',
      menus: [
        {
          href: '/admissions',
          label: 'All Admissions',
          active: pathname === '/admissions',
          icon: ClipboardCheck,
          submenus: []
        },
        {
          href: '/admissions/new',
          label: 'New Admission',
          active: pathname === '/admissions/new',
          icon: PlusCircle,
          submenus: []
        },
        {
          href: '/admissions/crm',
          label: 'Enquiry CRM',
          active: pathname === '/admissions/crm',
          icon: MessageCircle,
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'Resource Management',
      menus: [
        {
          href: '/resources/physical-resources/dashboard',
          label: 'Physical Resources',
          icon: Boxes,
          active: pathname === '',
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
          href: '',
          label: 'Digital Resources',
          icon: FileBarChart,
          active: pathname === '',
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
            },
            {
              href: '/resources/digital-resources/reports',
              label: 'Usage Reports',
              active: pathname === '/resources/digital-resources/reports'
            }
          ]
        }
      ]
    },
    {
      groupLabel: 'System',
      menus: [
        {
          href: '/system/api-management',
          label: 'API Management',
          active: pathname === '/system/api-management',
          icon: Key,
          submenus: []
        }
      ]
    }
  ];
}

// New function to filter menus based on user role permissions
export function GetRoleBasedPages(
  pathname: string,
  userRole?: CustomRole | null
): MenuGroup[] {
  const allMenus = GetPages(pathname);

  // Super admin gets all menus
  if (userRole?.role_key === 'super_admin') {
    return allMenus;
  }

  // If no role provided or no permissions, only show Dashboard
  if (!userRole || !userRole.permissions) {
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
      }
    ];
  }

  // Check if all permissions are false (role has been reset or has no permissions)
  const hasAnyPermission = Object.values(userRole.permissions).some(
    (value) => value === true
  );

  // If all permissions are false, only show Dashboard
  if (!hasAnyPermission) {
    console.log('All permissions are false - showing only Dashboard');
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
      }
    ];
  }

  // Filter menus based on permissions
  return allMenus
    .map((group) => {
      // Filter main menus
      const filteredMenus = group.menus
        .filter((menu) => {
          // Dashboard is always visible
          if (menu.href === '/') return true;

          // Check if user has permission for this menu
          const requiredPermission = MENU_PERMISSIONS[menu.href];

          // If no specific permission is defined, hide by default (changed behavior)
          if (!requiredPermission) {
            console.log(
              `Menu ${menu.label} has no permission defined in MENU_PERMISSIONS`
            );
            return false;
          }

          return userRole.permissions[requiredPermission] === true;
        })
        .map((menu) => {
          // Filter submenus as well
          if (menu.submenus.length === 0) return menu;

          const filteredSubmenus = menu.submenus.filter((submenu) => {
            const requiredPermission = MENU_PERMISSIONS[submenu.href];
            if (!requiredPermission) return false; // Changed to false to be consistent

            return userRole.permissions[requiredPermission] === true;
          });

          return {
            ...menu,
            submenus: filteredSubmenus
          };
        });

      // Only include groups that have menus after filtering
      return {
        ...group,
        menus: filteredMenus
      };
    })
    .filter((group) => group.menus.length > 0); // Remove empty groups
}

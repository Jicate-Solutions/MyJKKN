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
  Clock,
  RefreshCw
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
  '/users/activity': 'users.activity.view',
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
  '/organizations/courses/new': 'organizations.courses.create',
  '/organizations/courses/mappings': 'organizations.course.mappings.view',
  '/organizations/courses/mappings/new': 'organizations.course.mappings.create',
  '/organizations/courses/mappings/[id]/edit':
    'organizations.course.mappings.edit',

  //student management
  '/students': 'students.view',
  '/students/new': 'students.create',
  '/students/[id]': 'students.view',
  '/students/[id]/edit': 'students.edit',
  '/students/[id]/edit-promotion': 'students.promotion.edit',
  '/students/onboarding': 'students.onboarding.view',
  '/students/onboarding/edit': 'students.onboarding.edit',
  '/students/promotion': 'students.promotion.view',

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
  '/system/api-management': 'system.api.view',

  // Billing Management
  '/billing/categories/parent-categories': 'billing.parent_categories.view',
  '/billing/categories/parent-categories/new':
    'billing.parent_categories.create',
  '/billing/categories/parent-categories/[id]/edit':
    'billing.parent_categories.edit',
  '/billing/categories/sub-categories': 'billing.sub_categories.view',
  '/billing/categories/sub-categories/new': 'billing.sub_categories.create',
  '/billing/categories/sub-categories/[id]/edit': 'billing.sub_categories.edit',
  '/billing/categories/item-categories': 'billing.item_categories.view',
  '/billing/categories/item-categories/new': 'billing.item_categories.create',
  '/billing/categories/item-categories/[id]/edit':
    'billing.item_categories.edit',
  '/billing/schedule': 'billing.schedule.view',
  '/billing/schedule/new': 'billing.schedule.create',
  '/billing/schedule/bulk-create': 'billing.schedule.create',
  '/billing/schedule/[id]': 'billing.schedule.view',
  '/billing/schedule/[id]/edit': 'billing.schedule.update',
  '/billing/schedule/students': 'billing.schedule.view',
  '/billing/schedule/students/[id]': 'billing.schedule.view',
  '/billing/receipts': 'billing.receipts.view',
  '/billing/receipts/new': 'billing.receipts.create',
  '/billing/receipts/[id]': 'billing.receipts.view',
  '/billing/receipts/[id]/edit': 'billing.receipts.edit',
  '/billing/receipts/generate': 'billing.receipts.generate',
  '/billing/discounts': 'billing.discounts.view',
  '/billing/discounts/new': 'billing.discounts.create',
  '/billing/discounts/[id]': 'billing.discounts.view',
  '/billing/discounts/[id]/edit': 'billing.discounts.edit',
  '/billing/refunds': 'billing.refunds.view',
  '/billing/refunds/new': 'billing.refunds.create',
  '/billing/refunds/[id]': 'billing.refunds.view',
  '/billing/refunds/[id]/edit': 'billing.refunds.edit',
  '/billing/refunds/policies': 'billing.refunds.view',
  '/billing/refunds/bulk': 'billing.refunds.create',
  '/billing/invoices': 'billing.invoices.view',
  '/billing/invoices/new': 'billing.invoices.create',
  '/billing/invoices/[id]': 'billing.invoices.view',
  '/billing/invoices/[id]/edit': 'billing.invoices.edit',
  '/billing/reports': 'billing.reports.view'
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
        },
        {
          href: '/users/activity',
          label: 'Activity Audit Logs',
          active: pathname === '/users/activity',
          icon: ClipboardCheck,
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
          active: pathname.startsWith('/students'),
          icon: Users,
          submenus: [
            {
              href: '/students/onboarding',
              label: 'Learners Onboarding',
              active: pathname.startsWith('/students/onboarding')
            },
            {
              href: '/students',
              label: 'Learners List',
              active: pathname === '/students'
            }
          ]
        },
        {
          href: '/students/promotion',
          label: 'Learners Promotion',
          active: pathname === '/students/promotion',
          icon: GraduationCap,
          submenus: []
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
      groupLabel: 'Billing Management',
      menus: [
        {
          href: '/billing/categories',
          label: 'Categories',
          active: pathname.startsWith('/billing/categories'),
          icon: FolderTree,
          submenus: [
            {
              href: '/billing/categories/parent-categories',
              label: 'All Parent Categories',
              active: pathname === '/billing/categories/parent-categories'
            },
            {
              href: '/billing/categories/sub-categories',
              label: 'All Sub Categories',
              active: pathname === '/billing/categories/sub-categories'
            },
            {
              href: '/billing/categories/item-categories',
              label: 'All Item Categories',
              active: pathname === '/billing/categories/item-categories'
            }
          ]
        },
        {
          href: '/billing/schedule',
          label: 'Schedule',
          active: pathname.startsWith('/billing/schedule'),
          icon: Calendar,
          submenus: [
            {
              href: '/billing/schedule/students',
              label: 'Student Search',
              active: pathname.startsWith('/billing/schedule/students')
            },
            {
              href: '/billing/schedule',
              label: 'All Bills',
              active: pathname === '/billing/schedule'
            }
          ]
        },
        {
          href: '/billing/receipts',
          label: 'Receipts',
          active: pathname.startsWith('/billing/receipts'),
          icon: FileText,
          submenus: [
            {
              href: '/billing/receipts',
              label: 'All Receipts',
              active: pathname === '/billing/receipts'
            }
          ]
        },
        {
          href: '/billing/discounts',
          label: 'Scholarships',
          active: pathname.startsWith('/billing/discounts'),
          icon: Tags,
          submenus: []
        },
        {
          href: '/billing/refunds',
          label: 'Refunds',
          active: pathname.startsWith('/billing/refunds'),
          icon: RefreshCw,
          submenus: [
            {
              href: '/billing/refunds',
              label: 'All Refunds',
              active: pathname === '/billing/refunds'
            }
          ]
        },
        {
          href: '/billing/invoices',
          label: 'Invoices',
          active: pathname.startsWith('/billing/invoices'),
          icon: FileBarChart,
          submenus: []
        },
        {
          href: '/billing/reports',
          label: 'Reports',
          active: pathname.startsWith('/billing/reports'),
          icon: BarChart,
          submenus: []
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

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
  RefreshCw,
  Bug,
  CalendarX2,
  UserCheck,
  Package,
  Bookmark,
  Cpu,
  Award,
  CheckSquare,
  TrendingUp,
  Wrench,
  FileBarChart2,
  History,
  Sparkles,
  Bot,
  UserCircle,
  FileCheck,
  Briefcase,
  BarChart3,
  PhoneCall,
  Target,
  Megaphone,
  LineChart,
  Workflow,
  MessagesSquare,
  Radio,
  SearchCheck,
  UserCog
} from 'lucide-react';
import { CustomRole } from '@/types/auth';
// FEATURE_FLAGS import removed - not used in sidebar filtering

/**
 * Lightweight interface for role-based page filtering.
 * Can be built from usePermissions hook output without needing a full CustomRole.
 */
export interface RolePermissionData {
  role_key: string;
  permissions: Record<string, boolean>;
}

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

  // AI Assistant
  '/ai-query': 'ai_query.view', // AI Query System access

  // Profile
  '/profile': 'view_profile', // All users should be able to view their own profile

  // Bug Reports (Student Self-Service)
  '/my-bug-reports': 'learners.bug_reports.view',
  '/bug-leaderboard': 'learners.bug_reports.view',

  // User Management
  '/users': 'users.view',
  '/users/dashboard': 'users.dashboard.view',
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


  // Learners Module (Unified) - Using Granular Permissions
  '/learners': 'learners.profiles.view',

  // Learner Portal Routes (Student Self-Service)
  '/learners/my-timetable': 'learners.my-timetable.view',
  '/learners/my-attendance': 'learners.my-attendance.view',
  '/learners/my-profile': 'learners.my-profile.view',

  // Admin Routes
  '/learners/enquiries': 'learners.admissions.view',
  '/learners/enquiries/new': 'learners.admissions.create',
  '/learners/enquiries/[id]': 'learners.admissions.view',
  '/learners/enquiries/[id]/edit': 'learners.admissions.edit',
  '/learners/applications': 'learners.admissions.view',
  '/learners/applications/[id]': 'learners.admissions.view',
  '/learners/applications/[id]/edit': 'learners.admissions.edit',
  '/learners/profiles': 'learners.profiles.view',
  '/learners/profiles/[id]': 'learners.profiles.view',
  '/learners/profiles/[id]/edit': 'learners.edit',
  '/learners/profiles/bulk-edit': 'learners.bulk_edit',
  '/learners/profiles/promotion': 'learners.promotion.view',
  '/learners/alumni': 'learners.alumni.view',
  '/learners/alumni/[id]': 'learners.alumni.view',
  '/learners/analytics': 'learners.dashboard.view',
  '/learners/change-requests': 'learners.change-requests.view',
  '/learners/change-requests/[id]': 'learners.change-requests.view',

  // Organization Management
  '/organizations/dashboard': 'organizations.dashboard.view',
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

  // Student routes removed - now using /learners routes

  // Staff Management
  '/staff/category': 'staff.categories.view',
  '/staff/list': 'staff.view',
  '/staff/dashboard': 'staff.dashboard.view',

  // Academic Management
  '/academic/years': 'academic.years.view',
  '/academic/leave-calendar': 'academic.leaves.view',
  '/academic/leaves': 'academic.leaves.view',
  '/academic/leaves/new': 'academic.leaves.create',
  '/academic/leaves/[id]': 'academic.leaves.view',
  '/academic/leaves/[id]/edit': 'academic.leaves.edit',
  '/academic/leaves/settings': 'academic.leaves.manage',
  '/academic/leaves/settings/types': 'academic.leaves.manage',
  '/academic/leaves/settings/workflows': 'academic.leaves.manage',

  // Leave/OnDuty Application System (NEW - 2026-01-28)
  '/academic/leave-onduty/approvals': 'academic.leave_onduty.approve',
  '/academic/leave-onduty/settings': 'academic.leave_onduty.manage',
  '/academic/leave-onduty/reports': 'academic.leave_onduty.reports',
  '/learners/leave-onduty/apply': 'learners.leave_onduty.apply',
  '/learners/leave-onduty/my-applications': 'learners.leave_onduty.view',

  '/academic/staff-planning': 'academic.staff.planning.view',
  '/academic/timetables': 'academic.timetables.view',
  '/academic/timetables/templates': 'academic.timetables.templates.view',
  '/academic/timetables/templates/analytics': 'academic.timetables.templates.analytics',
  '/academic/timetables/templates/[id]': 'academic.timetables.templates.view',
  '/academic/timetables/new': 'academic.timetables.create',
  '/academic/timetables/[id]': 'academic.timetables.view',
  '/academic/timetables/[id]/edit': 'academic.timetables.edit',
  '/academic/timetables/faculty-calendar': 'faculty.calendar.view',
  '/academic/periods': 'academic.periods.view',
  '/academic/attendance': 'academic.attendance.view',
  '/academic/attendance/dashboard': 'academic.attendance.dashboard.view',
  '/academic/attendance/reports': 'academic.attendance.reports.view',
  '/academic/attendance/consolidation': 'academic.attendance.consolidation.view',

  // Regulations Management
  '/academic/regulations': 'academic.regulations.view',
  '/academic/regulations/new': 'academic.regulations.create',
  '/academic/regulations/[id]/edit': 'academic.regulations.edit',

  // Batches Management
  '/academic/batches': 'academic.batches.view',
  '/academic/batches/new': 'academic.batches.create',
  '/academic/batches/[id]/edit': 'academic.batches.edit',

  // Notification Management
  '/admin/notifications': 'notifications.view',
  '/admin/notifications/new': 'notifications.create',

  // System Management
  '/system/api-management': 'system.api.view',
  '/system/lti-tools': 'lti.tools.view',
  '/admin/bug-reports': 'system.bugs.view',
  '/admin/ai-query-tools': 'super_admin', // Super admin only - AI Query Tools Registry

  // Lifecycle Analytics
  '/admin/lifecycle': 'admin.lifecycle.view',

  // LTI Monitoring
  '/admin/lti/analytics': 'lti.analytics.view',
  '/admin/lti/grade-sync': 'lti.grade_sync.view',
  '/admin/lti/launches': 'lti.launches.view',

  // Billing Management - Admin/Staff Views
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
  '/billing/reports': 'billing.reports.view',


  // Resource Management
  '/resource-management': 'resources.categories.view',
  '/resource-management/categories': 'resources.categories.view',
  '/resource-management/categories/new': 'resources.categories.create',
  '/resource-management/categories/[id]/edit': 'resources.categories.edit',
  '/resource-management/categories/sub-categories':
    'resources.subcategories.view',
  '/resource-management/categories/sub-categories/new':
    'resources.subcategories.create',
  '/resource-management/categories/sub-categories/[id]/edit':
    'resources.subcategories.edit',
  '/resource-management/resources': 'resources.resources.view',
  '/resource-management/resources/new': 'resources.resources.create',
  '/resource-management/resources/[id]': 'resources.resources.view',
  '/resource-management/resources/[id]/edit': 'resources.resources.edit',
  '/resource-management/reservations': 'resources.reservations.view',
  '/resource-management/reservations/my-reservations':
    'resources.reservations.view',
  '/resource-management/reservations/new': 'resources.reservations.create',
  '/resource-management/reservations/[id]': 'resources.reservations.view',
  '/resource-management/reservations/[id]/edit': 'resources.reservations.edit',
  '/resource-management/reservations/approvals': 'resources.approvals.view',
  '/resource-management/maintenance': 'resources.maintenance.view',
  '/resource-management/analytics': 'resources.analytics.view',
  '/resource-management/analytics-dashboard': 'resources.analytics.view',
  '/audit-trail': 'audit.view',

  // Service Requests
  '/service-requests': 'service_requests.submit',
  '/service-requests/my-requests': 'service_requests.view_own',
  '/service-requests/new': 'service_requests.submit',
  '/service-requests/approvals': 'service_requests.approve',
  '/service-requests/analytics': 'service_requests.analytics.view',
  '/service-requests/types': 'service_requests.types.view',
  '/service-requests/types/new': 'service_requests.types.create',
  '/service-requests/types/[id]': 'service_requests.types.view',
  '/service-requests/types/[id]/edit': 'service_requests.types.edit',
  '/service-requests/[id]': 'service_requests.view_own',
  '/service-requests/[id]/edit': 'service_requests.edit_own',

  // Admission CRM Module
  '/admission/dashboard': 'admission.dashboard.view',
  '/admission/analytics': 'admission.analytics.view',
  '/admission/group-dashboard': 'admission.group_dashboard.view',
  '/admission/insights': 'admission.insights.view',
  '/admission/insights/status': 'admission.insights.view',

  // Admission Leads
  '/admission/leads': 'admission.leads.view',
  '/admission/leads/new': 'admission.leads.create',
  '/admission/leads/[id]': 'admission.leads.view',

  // Admission Applications
  '/admission/applications': 'admission.applications.view',
  '/admission/applications/[id]': 'admission.applications.view',

  // Admission Counselors
  '/admission/counselors': 'admission.counselors.view',
  '/admission/counselors/alerts': 'admission.counselors.view',
  '/admission/counselors/briefing': 'admission.counselors.view',
  '/admission/counselors/calls': 'admission.counselors.view',
  '/admission/counselors/daily-view': 'admission.counselors.view',
  '/admission/counselors/reminders': 'admission.counselors.view',

  // Admission Consultants
  '/admission/consultants': 'admission.consultants.view',
  '/admission/consultants/new': 'admission.consultants.create',
  '/admission/consultants/[id]': 'admission.consultants.view',
  '/admission/consultants/[id]/edit': 'admission.consultants.edit',
  '/admission/consultants/analytics': 'admission.consultants.analytics.view',
  '/admission/consultants/commissions': 'admission.consultants.commissions.view',
  '/admission/consultants/referrals': 'admission.consultants.referrals.view',
  '/admission/consultants/rewards': 'admission.consultants.rewards.view',

  // Admission Marketing
  '/admission/marketing/campaigns/monitoring': 'admission.marketing.view',
  '/admission/marketing/campaigns/roi': 'admission.marketing.view',
  '/admission/marketing/campaigns/segments': 'admission.marketing.view',
  '/admission/marketing/chat': 'admission.marketing.chat.view',
  '/admission/marketing/chat/performance': 'admission.marketing.chat.view',
  '/admission/marketing/chat/settings': 'admission.marketing.chat.manage',
  '/admission/marketing/chatbot': 'admission.marketing.chatbot.view',
  '/admission/marketing/chatbot/analytics': 'admission.marketing.chatbot.view',
  '/admission/marketing/chatbot/knowledge': 'admission.marketing.chatbot.manage',
  '/admission/marketing/parent-communication': 'admission.marketing.view',
  '/admission/marketing/publishers': 'admission.marketing.view',
  '/admission/marketing/re-engagement': 'admission.marketing.view',
  '/admission/marketing/remarketing': 'admission.marketing.view',
  '/admission/marketing/voice-agents': 'admission.marketing.voice.view',
  '/admission/marketing/voice-broadcast': 'admission.marketing.voice.view',

  // Admission Data Quality
  '/admission/data-quality/data-profiling': 'admission.data_quality.view',
  '/admission/data-quality/deduplication': 'admission.data_quality.view',
  '/admission/data-quality/phone-validation': 'admission.data_quality.view',

  // Admission Settings
  '/admission/settings': 'admission.settings.view',
  '/admission/settings/templates': 'admission.settings.templates.view',
  '/admission/settings/templates/analytics': 'admission.settings.templates.view',
  '/admission/settings/templates/documents': 'admission.settings.templates.view',
  '/admission/settings/templates/email-builder': 'admission.settings.templates.manage',
  '/admission/settings/whatsapp-numbers': 'admission.settings.whatsapp.view',
  '/admission/settings/workflows': 'admission.settings.workflows.view',
  '/admission/settings/workflow-config': 'admission.settings.workflows.manage',
  '/admission/settings/assignment-rules': 'admission.settings.assignment.view',
  '/admission/settings/sources': 'admission.settings.sources.view'
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
        },
        {
          href: '/ai-query',
          label: 'AI Assistant',
          active: pathname === '/ai-query',
          icon: Sparkles,
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'User Management',
      menus: [
        {
          href: '/users/dashboard',
          label: 'Analytics Dashboard',
          active: pathname === '/users/dashboard',
          icon: BarChart,
          submenus: []
        },
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
          href: '/organizations/dashboard',
          label: 'Dashboard',
          active: pathname.startsWith('/organizations/dashboard'),
          icon: LayoutGrid,
          submenus: []
        },
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
          href: '/academic/regulations',
          label: 'Regulations',
          active: pathname.startsWith('/academic/regulations'),
          icon: Bookmark,
          submenus: []
        },
        {
          href: '/academic/batches',
          label: 'Batches',
          active: pathname.startsWith('/academic/batches'),
          icon: Boxes,
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
          href: '/academic/leave-calendar',
          label: 'Leave Calendar',
          active: pathname === '/academic/leave-calendar',
          icon: Calendar,
          submenus: []
        },
        {
          href: '/academic/leaves',
          label: 'Leave Management',
          active: pathname.startsWith('/academic/leaves'),
          icon: CalendarX2,
          submenus: [
            {
              href: '/academic/leaves',
              label: 'All Leaves',
              active: pathname === '/academic/leaves'
            },
            {
              href: '/academic/leaves/settings/types',
              label: 'Leave Types',
              active: pathname === '/academic/leaves/settings/types'
            },
            {
              href: '/academic/leaves/settings/workflows',
              label: 'Approval Workflows',
              active: pathname === '/academic/leaves/settings/workflows'
            }
          ]
        },
        {
          href: '/academic/leave-onduty',
          label: 'Leave/OnDuty',
          active: pathname.startsWith('/academic/leave-onduty'),
          icon: Briefcase,
          submenus: [
            {
              href: '/academic/leave-onduty/approvals',
              label: 'Approvals',
              active: pathname === '/academic/leave-onduty/approvals'
            },
            {
              href: '/academic/leave-onduty/settings',
              label: 'Workflow Settings',
              active: pathname === '/academic/leave-onduty/settings'
            },
            {
              href: '/academic/leave-onduty/reports',
              label: 'Reports',
              active: pathname === '/academic/leave-onduty/reports'
            }
          ]
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
          active: pathname.startsWith('/academic/timetables'),
          icon: CalendarClock,
          submenus: [
            {
              href: '/academic/timetables',
              label: 'Manage Timetables',
              active: pathname === '/academic/timetables'
            },
            {
              href: '/academic/timetables/templates',
              label: 'Template Library',
              active: pathname.startsWith('/academic/timetables/templates')
            },
            {
              href: '/academic/timetables/faculty-calendar',
              label: 'Timetable Calendar',
              active: pathname.startsWith(
                '/academic/timetables/faculty-calendar'
              )
            }
          ]
        },
        {
          href: '/academic/attendance',
          label: 'Attendance',
          active: pathname.startsWith('/academic/attendance'),
          icon: ClipboardCheck,
          submenus: [
            {
              href: '/academic/attendance/dashboard',
              label: 'Attendance Dashboard',
              active: pathname.startsWith('/academic/attendance/dashboard')
            },
            {
              href: '/academic/attendance',
              label: 'Mark Attendance',
              active: pathname === '/academic/attendance'
            },
            {
              href: '/academic/attendance/reports',
              label: 'Attendance Reports',
              active: pathname.startsWith('/academic/attendance/reports')
            },
            {
              href: '/academic/attendance/consolidation',
              label: 'Consolidation Reports',
              active: pathname.startsWith('/academic/attendance/consolidation')
            }
          ]
        }
      ]
    },

    {
      groupLabel: 'Facilitators Management',
      menus: [
        {
          href: '/staff/dashboard',
          label: 'Analytics Dashboard',
          active: pathname === '/staff/dashboard',
          icon: BarChart,
          submenus: []
        },
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
      groupLabel: 'Learners',
      menus: [
        // Learner Portal (Student Self-Service) - Only for role='student'
        {
          href: '/learners/my-timetable',
          label: 'My Timetable',
          active: pathname === '/learners/my-timetable',
          icon: CalendarClock,
          submenus: []
        },
        {
          href: '/learners/my-attendance',
          label: 'My Attendance',
          active: pathname.startsWith('/learners/my-attendance'),
          icon: ClipboardCheck,
          submenus: []
        },
        {
          href: '/learners/my-profile',
          label: 'My Profile',
          active: pathname === '/learners/my-profile',
          icon: Users,
          submenus: []
        },
        {
          href: '/learners/leave-onduty/my-applications',
          label: 'Leave/OnDuty',
          active: pathname.startsWith('/learners/leave-onduty'),
          icon: Briefcase,
          submenus: []
        },

        // Admin Features
        {
          href: '/learners/analytics',
          label: 'Analytics Dashboard',
          active: pathname.startsWith('/learners/analytics'),
          icon: BarChart,
          submenus: []
        },
        {
          href: '/learners/enquiries',
          label: 'Admission Management',
          active: pathname.startsWith('/learners/enquiries') || pathname.startsWith('/learners/applications'),
          icon: ClipboardCheck,
          submenus: [
            {
              href: '/learners/enquiries',
              label: 'All Enquiries',
              active: pathname === '/learners/enquiries'
            },
            {
              href: '/learners/enquiries/new',
              label: 'New Enquiry',
              active: pathname === '/learners/enquiries/new'
            }
          ]
        },
        {
          href: '/learners/profiles',
          label: 'Learner Profiles',
          active: pathname.startsWith('/learners/profiles'),
          icon: Users,
          submenus: [
            {
              href: '/learners/profiles',
              label: 'All Profiles',
              active: pathname === '/learners/profiles'
            }
           
          ]
        },
        {
          href: '/learners/alumni',
          label: 'Alumni & Graduates',
          active: pathname.startsWith('/learners/alumni'),
          icon: Award,
          submenus: []
        },
        {
          href: '/learners/change-requests',
          label: 'Change Requests',
          active: pathname.startsWith('/learners/change-requests'),
          icon: FileCheck,
          submenus: []
        }
      ]
    },


    // NEW: Unified Learners Module (Will replace old modules)

    {
      groupLabel: 'Admission CRM',
      menus: [
        {
          href: '/admission/dashboard',
          label: 'Dashboard',
          active: pathname === '/admission/dashboard',
          icon: LayoutGrid,
          submenus: []
        },
        {
          href: '/admission/analytics',
          label: 'Analytics',
          active: pathname === '/admission/analytics',
          icon: LineChart,
          submenus: []
        },
        {
          href: '/admission/group-dashboard',
          label: 'Group Dashboard',
          active: pathname === '/admission/group-dashboard',
          icon: Building2,
          submenus: []
        },
        {
          href: '/admission/leads',
          label: 'Leads',
          active: pathname.startsWith('/admission/leads'),
          icon: UserPlus,
          submenus: [
            {
              href: '/admission/leads',
              label: 'All Leads',
              active: pathname === '/admission/leads'
            },
            {
              href: '/admission/leads/new',
              label: 'New Lead',
              active: pathname === '/admission/leads/new'
            }
          ]
        },
        {
          href: '/admission/applications',
          label: 'Applications',
          active: pathname.startsWith('/admission/applications'),
          icon: FileText,
          submenus: []
        },
        {
          href: '/admission/counselors',
          label: 'Counselors',
          active: pathname.startsWith('/admission/counselors'),
          icon: HeadphonesIcon,
          submenus: [
            {
              href: '/admission/counselors',
              label: 'All Counselors',
              active: pathname === '/admission/counselors'
            },
            {
              href: '/admission/counselors/daily-view',
              label: 'Daily View',
              active: pathname === '/admission/counselors/daily-view'
            },
            {
              href: '/admission/counselors/calls',
              label: 'Call Logs',
              active: pathname === '/admission/counselors/calls'
            },
            {
              href: '/admission/counselors/reminders',
              label: 'Reminders',
              active: pathname === '/admission/counselors/reminders'
            },
            {
              href: '/admission/counselors/alerts',
              label: 'Activity Alerts',
              active: pathname === '/admission/counselors/alerts'
            },
            {
              href: '/admission/counselors/briefing',
              label: 'Daily Briefing',
              active: pathname === '/admission/counselors/briefing'
            }
          ]
        },
        {
          href: '/admission/consultants',
          label: 'Consultants',
          active: pathname.startsWith('/admission/consultants'),
          icon: UserCog,
          submenus: [
            {
              href: '/admission/consultants',
              label: 'All Consultants',
              active: pathname === '/admission/consultants'
            },
            {
              href: '/admission/consultants/new',
              label: 'Add Consultant',
              active: pathname === '/admission/consultants/new'
            },
            {
              href: '/admission/consultants/commissions',
              label: 'Commissions',
              active: pathname === '/admission/consultants/commissions'
            },
            {
              href: '/admission/consultants/referrals',
              label: 'Referrals',
              active: pathname === '/admission/consultants/referrals'
            },
            {
              href: '/admission/consultants/rewards',
              label: 'Rewards',
              active: pathname === '/admission/consultants/rewards'
            },
            {
              href: '/admission/consultants/analytics',
              label: 'Analytics',
              active: pathname === '/admission/consultants/analytics'
            }
          ]
        },
        {
          href: '/admission/insights',
          label: 'AI Insights',
          active: pathname.startsWith('/admission/insights'),
          icon: Sparkles,
          submenus: []
        },
        {
          href: '/admission/marketing',
          label: 'Marketing',
          active: pathname.startsWith('/admission/marketing'),
          icon: Megaphone,
          submenus: [
            {
              href: '/admission/marketing/campaigns/monitoring',
              label: 'Campaign Monitor',
              active: pathname === '/admission/marketing/campaigns/monitoring'
            },
            {
              href: '/admission/marketing/campaigns/roi',
              label: 'Campaign ROI',
              active: pathname === '/admission/marketing/campaigns/roi'
            },
            {
              href: '/admission/marketing/campaigns/segments',
              label: 'Segments',
              active: pathname === '/admission/marketing/campaigns/segments'
            },
            {
              href: '/admission/marketing/chat',
              label: 'WhatsApp Chat',
              active: pathname.startsWith('/admission/marketing/chat')
            },
            {
              href: '/admission/marketing/chatbot',
              label: 'Chatbot',
              active: pathname.startsWith('/admission/marketing/chatbot')
            },
            {
              href: '/admission/marketing/parent-communication',
              label: 'Parent Communication',
              active: pathname === '/admission/marketing/parent-communication'
            },
            {
              href: '/admission/marketing/re-engagement',
              label: 'Re-engagement',
              active: pathname === '/admission/marketing/re-engagement'
            },
            {
              href: '/admission/marketing/remarketing',
              label: 'Remarketing',
              active: pathname === '/admission/marketing/remarketing'
            },
            {
              href: '/admission/marketing/voice-agents',
              label: 'Voice Agents',
              active: pathname === '/admission/marketing/voice-agents'
            },
            {
              href: '/admission/marketing/voice-broadcast',
              label: 'Voice Broadcast',
              active: pathname === '/admission/marketing/voice-broadcast'
            },
            {
              href: '/admission/marketing/publishers',
              label: 'Publishers',
              active: pathname === '/admission/marketing/publishers'
            }
          ]
        },
        {
          href: '/admission/data-quality',
          label: 'Data Quality',
          active: pathname.startsWith('/admission/data-quality'),
          icon: SearchCheck,
          submenus: [
            {
              href: '/admission/data-quality/data-profiling',
              label: 'Data Profiling',
              active: pathname === '/admission/data-quality/data-profiling'
            },
            {
              href: '/admission/data-quality/deduplication',
              label: 'Deduplication',
              active: pathname === '/admission/data-quality/deduplication'
            },
            {
              href: '/admission/data-quality/phone-validation',
              label: 'Phone Validation',
              active: pathname === '/admission/data-quality/phone-validation'
            }
          ]
        },
        {
          href: '/admission/settings',
          label: 'Settings',
          active: pathname.startsWith('/admission/settings'),
          icon: Settings,
          submenus: [
            {
              href: '/admission/settings',
              label: 'General Settings',
              active: pathname === '/admission/settings'
            },
            {
              href: '/admission/settings/workflows',
              label: 'Workflows',
              active: pathname === '/admission/settings/workflows'
            },
            {
              href: '/admission/settings/workflow-config',
              label: 'Workflow Config',
              active: pathname === '/admission/settings/workflow-config'
            },
            {
              href: '/admission/settings/assignment-rules',
              label: 'Assignment Rules',
              active: pathname === '/admission/settings/assignment-rules'
            },
            {
              href: '/admission/settings/sources',
              label: 'Lead Sources',
              active: pathname === '/admission/settings/sources'
            },
            {
              href: '/admission/settings/templates',
              label: 'Templates',
              active: pathname.startsWith('/admission/settings/templates')
            },
            {
              href: '/admission/settings/whatsapp-numbers',
              label: 'WhatsApp Numbers',
              active: pathname === '/admission/settings/whatsapp-numbers'
            }
          ]
        }
      ]
    },

    {
      groupLabel: 'Accounts',
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
      groupLabel: 'Resource Management',
      menus: [
        {
          href: '/resource-management/analytics-dashboard',
          label: 'Dashboard',
          active: pathname.startsWith(
            '/resource-management/analytics-dashboard'
          ),
          icon: LayoutGrid,
          submenus: []
        },
        {
          href: '/resource-management/categories',
          label: 'Categories',
          active: pathname === '',
          icon: FolderTree,
          submenus: [
            {
              href: '/resource-management/categories',
              label: 'Parent categories',
              active: pathname === '/resource-management/categories'
            },
            {
              href: '/resource-management/categories/sub-categories',
              label: 'Sub categories',
              active:
                pathname === '/resource-management/categories/sub-categories'
            }
          ]
        },

        {
          href: '/resource-management/resources',
          label: 'Resources',
          active: pathname.startsWith('/resource-management/resources'),
          icon: Package,
          submenus: []
        },
        {
          href: '/resource-management/reservations',
          label: 'Reservations',
          active: pathname.startsWith('/resource-management/reservations'),
          icon: Calendar,
          submenus: [
            {
              href: '/resource-management/reservations',
              label: 'All Reservations',
              active: pathname === '/resource-management/reservations'
            },
            {
              href: '/resource-management/reservations/my-reservations',
              label: 'My Reservations',
              active:
                pathname === '/resource-management/reservations/my-reservations'
            }
          ]
        },
        {
          href: '/resource-management/reservations/approvals',
          label: 'Approvals',
          active: pathname.startsWith(
            '/resource-management/reservations/approvals'
          ),
          icon: CheckSquare,
          submenus: []
        },
        {
          href: '/resource-management/maintenance',
          label: 'Maintenance',
          active: pathname.startsWith('/resource-management/maintenance'),
          icon: Wrench,
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'Service Requests',
      menus: [
        {
          href: '/service-requests',
          label: 'Service Requests',
          active: pathname.startsWith('/service-requests'),
          icon: ClipboardList,
          submenus: [
            {
              href: '/service-requests/my-requests',
              label: 'My Requests',
              active: pathname === '/service-requests/my-requests'
            },
            {
              href: '/service-requests/all-services',
              label: 'All Requests',
              active: pathname === '/service-requests/all-services'
            },
            {
              href: '/service-requests/approvals',
              label: 'Pending Approvals',
              active: pathname === '/service-requests/approvals'
            },
            {
              href: '/service-requests/analytics',
              label: 'Analytics',
              active: pathname === '/service-requests/analytics'
            },
            {
              href: '/service-requests/types',
              label: 'Manage Services',
              active: pathname.startsWith('/service-requests/types')
            }
          ]
        }
      ]
    },
    {
      groupLabel: 'Administration',
      menus: [
        {
          href: '/admin/notifications',
          label: 'Notifications',
          active: pathname.startsWith('/admin/notifications'),
          icon: Bell,
          submenus: [
            {
              href: '/admin/notifications',
              label: 'All Notifications',
              active: pathname === '/admin/notifications'
            },
            {
              href: '/admin/notifications/new',
              label: 'Send Notification',
              active: pathname === '/admin/notifications/new'
            }
          ]
        },
        {
          href: '/admin/lti',
          label: 'LTI Monitoring',
          active: pathname.startsWith('/admin/lti'),
          icon: Gauge,
          submenus: [
            {
              href: '/admin/lti/analytics',
              label: 'Analytics Dashboard',
              active: pathname === '/admin/lti/analytics'
            },
            {
              href: '/admin/lti/grade-sync',
              label: 'Grade Sync',
              active: pathname === '/admin/lti/grade-sync'
            },
            {
              href: '/admin/lti/launches',
              label: 'Launch Debug',
              active: pathname === '/admin/lti/launches'
            }
          ]
        },
        {
          href: '/audit-trail',
          label: 'Audit Trail',
          active: pathname.startsWith('/audit-trail'),
          icon: History,
          submenus: []
        },
        {
          href: '/admin/lifecycle',
          label: 'Lifecycle Analytics',
          active: pathname.startsWith('/admin/lifecycle'),
          icon: BarChart3,
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
        },
        {
          href: '/system/lti-tools',
          label: 'LTI Tools',
          active: pathname.startsWith('/system/lti-tools'),
          icon: Link2,
          submenus: []
        },
        {
          href: '/admin/bug-reports',
          label: 'Bug Reports',
          active: pathname.startsWith('/admin/bug-reports') || pathname.startsWith('/my-bug-reports') || pathname.startsWith('/bug-leaderboard'),
          icon: Bug,
          submenus: [
            {
              href: '/my-bug-reports',
              label: 'My Bug Reports',
              active: pathname === '/my-bug-reports'
            },
            {
              href: '/bug-leaderboard',
              label: 'Bug Leaderboard',
              active: pathname === '/bug-leaderboard'
            },
            {
              href: '/admin/bug-reports',
              label: 'All Bug Reports',
              active: pathname === '/admin/bug-reports'
            }
          ]
        },
        {
          href: '/admin/ai-query-tools',
          label: 'AI Query Tools',
          active: pathname.startsWith('/admin/ai-query-tools'),
          icon: Bot,
          submenus: []
        }
      ]
    }
  ];
}

// New function to filter menus based on user role permissions
export function GetRoleBasedPages(
  pathname: string,
  userRole?: CustomRole | RolePermissionData | null
): MenuGroup[] {
  const allMenus = GetPages(pathname);

  // Super admin gets all menus EXCEPT student-only pages
  if (userRole?.role_key === 'super_admin') {
    return allMenus.map((group) => ({
      ...group,
      menus: group.menus.filter((menu) => {
        // Hide student portal pages (my-* and leave-onduty) from super admin
        // But allow bug report pages for all users including super admin
        if (menu.href.includes('/learners/my-') || menu.href === '/learners/leave-onduty/my-applications') {
          return false;
        }
        return true;
      })
    })).filter((group) => group.menus.length > 0);
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

  const isStudent = userRole.role_key === 'student';

  // Debug: Log permissions state for troubleshooting
  if (process.env.NODE_ENV === 'development') {
    const learnerPerms = Object.entries(userRole.permissions)
      .filter(([k]) => k.startsWith('learners.'))
      .filter(([, v]) => v === true)
      .map(([k]) => k);
    if (learnerPerms.length > 0) {
      console.log('[GetRoleBasedPages] Role:', userRole.role_key, '| Learner permissions (true):', learnerPerms);
    }
  }

  // Filter menus based on permissions
  return allMenus
    .map((group) => {
      // Filter main menus
      const filteredMenus = group.menus
        .filter((menu) => {
          // Dashboard is always visible
          if (menu.href === '/') return true;

          // Bug Reports menu is always visible for all users (common feature)
          if (menu.href === '/admin/bug-reports' && menu.submenus.length > 0) {
            return true;
          }

          // Check if menu requires super admin
          if ((menu as any).requiresSuperAdmin) {
            return false; // Hide from non-super admin users
          }

          // Special case: Student portal pages (my-* and leave-onduty) are ONLY for students
          // This check must come BEFORE the submenus check
          if (
            menu.href.includes('/learners/my-') ||
            menu.href === '/learners/leave-onduty/my-applications'
          ) {
            return userRole.role_key === 'student';
          }

          // Special handling for parent menus with submenus
          if (menu.submenus.length > 0) {
            // Show parent if any submenu is accessible
            return menu.submenus.some((submenu) => {
              const requiredPermission = MENU_PERMISSIONS[submenu.href];
              return (
                requiredPermission &&
                userRole.permissions[requiredPermission] === true
              );
            });
          }

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
          if (menu.submenus.length === 0) {
            // Change billing menu labels for students
            if (isStudent) {
              if (menu.href === '/billing/schedule') {
                return { ...menu, label: 'My Bills' };
              }
              if (menu.href === '/billing/receipts') {
                return { ...menu, label: 'My Receipts' };
              }
              if (menu.href === '/billing/invoices') {
                return { ...menu, label: 'My Invoices' };
              }
            }
            return menu;
          }

          const filteredSubmenus = menu.submenus.filter((submenu) => {
            // Bug report submenus: My Bug Reports and Leaderboard are always visible for all users
            // But All Bug Reports (admin page) requires permission
            if (submenu.href === '/my-bug-reports' || submenu.href === '/bug-leaderboard') {
              return true;
            }

            const requiredPermission = MENU_PERMISSIONS[submenu.href];
            if (!requiredPermission) return false; // Changed to false to be consistent

            // Hide "Student Search" submenu for students
            if (isStudent && submenu.href === '/billing/schedule/students') {
              return false;
            }

            // Student portal submenus (leave-onduty) are shown for students without permission check
            if (isStudent && submenu.href.startsWith('/learners/leave-onduty')) {
              return true;
            }

            return userRole.permissions[requiredPermission] === true;
          }).map((submenu) => {
            // Change submenu labels for students
            if (isStudent) {
              if (submenu.href === '/billing/schedule') {
                return { ...submenu, label: 'My Bills' };
              }
              if (submenu.href === '/billing/receipts') {
                return { ...submenu, label: 'My Receipts' };
              }
              if (submenu.href === '/billing/invoices') {
                return { ...submenu, label: 'My Invoices' };
              }
            }
            return submenu;
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
    .filter((group) => {
      // Debug: Log when Learners group is filtered out
      if (process.env.NODE_ENV === 'development' && group.groupLabel === 'Learners') {
        console.log(`[GetRoleBasedPages] Learners group: ${group.menus.length} items after filtering ->`,
          group.menus.map(m => m.label)
        );
      }
      return group.menus.length > 0;
    }); // Remove empty groups
}


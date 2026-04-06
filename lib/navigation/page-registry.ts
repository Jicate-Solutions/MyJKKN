import {
  Home, Sparkles, BarChart, Users, Shield, Settings, ClipboardCheck,
  BookOpen, LayoutGrid, TabletSmartphone, Box, Tags, Building, Boxes,
  Flame, GraduationCap, CalendarDays, CalendarClock, Clock, Calendar,
  CalendarX2, Briefcase, UserSearch, UserPlus, FileText, Award,
  HeadphonesIcon, UserCog, Megaphone, SearchCheck, FolderTree,
  RefreshCw, FileBarChart, Package, CheckSquare, Wrench, ClipboardList,
  Bell, Gauge, History, BarChart3, Rocket, Activity, Brain, TrendingUp,
  Key, Link2, Bug, Bot, LineChart, Building2, LucideIcon, FileCheck
} from 'lucide-react';
import { MENU_PERMISSIONS, GetPages } from '@/lib/sidebarMenuLink';
import type { PageEntry } from './types';

// ─── Curated Keywords & Descriptions ─────────────────────────────────────────
// High-traffic pages get hand-written keywords so users can search by intent
// (e.g. "fee status") not just page name ("Invoices").

const PAGE_ENRICHMENTS: Record<string, { keywords: string[]; description: string }> = {
  '/': {
    keywords: ['home', 'main', 'overview', 'summary', 'analytics'],
    description: 'Main dashboard with analytics overview and quick stats'
  },
  '/ai-query': {
    keywords: ['ai', 'chatbot', 'ask', 'question', 'assistant', 'help'],
    description: 'AI-powered assistant for querying data and getting help'
  },
  // User Management
  '/users': {
    keywords: ['all users', 'people', 'accounts', 'members', 'user list'],
    description: 'View and manage all user accounts'
  },
  '/users/dashboard': {
    keywords: ['user analytics', 'user stats', 'login activity', 'engagement'],
    description: 'Analytics dashboard for user activity and engagement'
  },
  '/users/roles': {
    keywords: ['assign role', 'user role', 'permissions', 'access control'],
    description: 'Assign roles and permissions to users'
  },
  '/users/role-management': {
    keywords: ['create role', 'custom role', 'manage roles', 'rbac', 'permissions setup'],
    description: 'Create and manage custom roles with granular permissions'
  },
  '/users/activity': {
    keywords: ['audit', 'logs', 'activity', 'history', 'who did what', 'tracking'],
    description: 'View user activity audit logs and login history'
  },
  // Organization
  '/organizations/dashboard': {
    keywords: ['org overview', 'institution stats', 'organization analytics'],
    description: 'Organization management overview dashboard'
  },
  '/organizations/institutions': {
    keywords: ['college', 'school', 'institution', 'campus', 'jkkn'],
    description: 'Manage institutions and campuses'
  },
  '/organizations/degrees': {
    keywords: ['degree', 'qualification', 'ug', 'pg', 'diploma'],
    description: 'Manage degree types and qualifications'
  },
  '/organizations/departments': {
    keywords: ['dept', 'division', 'faculty group', 'department'],
    description: 'Manage organizational departments'
  },
  '/organizations/programs': {
    keywords: ['course program', 'degree program', 'bca', 'mca', 'bsc', 'mba'],
    description: 'Manage academic programs'
  },
  '/organizations/semesters': {
    keywords: ['sem', 'term', 'semester', 'academic term'],
    description: 'Manage semesters and academic terms'
  },
  '/organizations/sections': {
    keywords: ['section', 'class', 'division', 'batch group'],
    description: 'Manage class sections'
  },
  '/organizations/courses': {
    keywords: ['subject', 'course', 'curriculum', 'syllabus'],
    description: 'Manage courses and subjects'
  },
  '/organizations/courses/mappings': {
    keywords: ['course mapping', 'subject assignment', 'curriculum mapping'],
    description: 'Map courses to programs and semesters'
  },
  // Academic
  '/academic/years': {
    keywords: ['academic year', 'ay', 'year setup', 'session'],
    description: 'Manage academic years and sessions'
  },
  '/academic/regulations': {
    keywords: ['regulation', 'curriculum version', 'syllabus version'],
    description: 'Manage academic regulations and curriculum versions'
  },
  '/academic/batches': {
    keywords: ['batch', 'cohort', 'intake', 'year group'],
    description: 'Manage student batches and cohorts'
  },
  '/academic/periods': {
    keywords: ['period', 'time slot', 'class period', 'session time'],
    description: 'Configure class periods and time slots'
  },
  '/academic/leave-calendar': {
    keywords: ['holiday', 'leave calendar', 'off days', 'vacation'],
    description: 'View and manage leave calendar'
  },
  '/academic/leaves': {
    keywords: ['leave', 'absence', 'time off', 'leave request'],
    description: 'Manage leave requests and approvals'
  },
  '/academic/leave-onduty/approvals': {
    keywords: ['approve leave', 'onduty approval', 'leave pending'],
    description: 'Approve or reject leave and on-duty requests'
  },
  '/academic/staff-planning': {
    keywords: ['staff allocation', 'teacher assignment', 'faculty planning', 'workload'],
    description: 'Plan and allocate staff to courses and sections'
  },
  '/academic/timetables': {
    keywords: ['schedule', 'class schedule', 'time table', 'slots', 'timetable'],
    description: 'Create and manage class timetables'
  },
  '/academic/timetables/templates': {
    keywords: ['timetable template', 'schedule template', 'reusable timetable'],
    description: 'Manage reusable timetable templates'
  },
  '/academic/timetables/faculty-calendar': {
    keywords: ['faculty schedule', 'teacher calendar', 'staff timetable'],
    description: 'View faculty-wise timetable calendar'
  },
  '/academic/attendance': {
    keywords: ['absent', 'present', 'roll call', 'daily attendance', 'mark attendance', 'period attendance'],
    description: 'Mark and view student attendance records'
  },
  '/academic/attendance/dashboard': {
    keywords: ['attendance stats', 'attendance analytics', 'absence rate'],
    description: 'Attendance analytics dashboard with trends'
  },
  '/academic/attendance/pending': {
    keywords: ['unmarked attendance', 'pending', 'not yet marked'],
    description: 'View classes with pending attendance'
  },
  '/academic/attendance/reports': {
    keywords: ['attendance report', 'absence report', 'attendance export'],
    description: 'Generate attendance reports and exports'
  },
  '/academic/attendance/consolidation': {
    keywords: ['consolidation', 'monthly attendance', 'attendance summary'],
    description: 'Consolidated attendance reports across sections'
  },
  // Admission CRM
  '/admission/dashboard': {
    keywords: ['admission overview', 'crm dashboard', 'enrollment stats'],
    description: 'Admission CRM overview dashboard'
  },
  '/admission/analytics': {
    keywords: ['admission analytics', 'enrollment trends', 'conversion rate'],
    description: 'Admission analytics and conversion metrics'
  },
  '/admission/group-dashboard': {
    keywords: ['group view', 'institution comparison', 'multi-campus'],
    description: 'Cross-institution admission comparison dashboard'
  },
  '/admission/leads': {
    keywords: ['enquiry', 'prospect', 'new student', 'inquiry', 'lead', 'potential student'],
    description: 'Manage admission leads and enquiries'
  },
  '/admission/applications': {
    keywords: ['apply', 'admission form', 'applicant', 'application status'],
    description: 'Process and manage admission applications'
  },
  '/admission/gd-pi': {
    keywords: ['interview', 'group discussion', 'personal interview', 'selection'],
    description: 'Schedule and manage GD-PI sessions'
  },
  '/admission/counselors': {
    keywords: ['counselor', 'advisor', 'admission staff', 'telecaller'],
    description: 'Manage admission counselors and their assignments'
  },
  '/admission/consultants': {
    keywords: ['consultant', 'agent', 'referral partner', 'channel partner'],
    description: 'Manage admission consultants and referral partners'
  },
  '/admission/insights': {
    keywords: ['ai insights', 'predictions', 'smart recommendations'],
    description: 'AI-powered admission insights and predictions'
  },
  '/admission/marketing/chat': {
    keywords: ['whatsapp', 'message', 'chat', 'whatsapp marketing'],
    description: 'WhatsApp marketing chat and messaging'
  },
  '/admission/marketing/campaigns/monitoring': {
    keywords: ['campaign', 'marketing campaign', 'sms campaign', 'email campaign'],
    description: 'Monitor active marketing campaigns'
  },
  '/admission/marketing/expos': {
    keywords: ['expo', 'exhibition', 'education fair', 'campus visit'],
    description: 'Manage admission expos and education fairs'
  },
  '/admission/data-quality/data-profiling': {
    keywords: ['data quality', 'data profiling', 'data check', 'data validation'],
    description: 'Profile and validate admission data quality'
  },
  '/admission/data-quality/deduplication': {
    keywords: ['duplicate', 'merge', 'dedup', 'duplicate leads'],
    description: 'Find and merge duplicate lead records'
  },
  // Staff
  '/staff/dashboard': {
    keywords: ['staff analytics', 'faculty stats', 'teacher dashboard'],
    description: 'Staff analytics and statistics dashboard'
  },
  '/staff/category': {
    keywords: ['staff category', 'faculty type', 'designation'],
    description: 'Manage staff categories and designations'
  },
  '/staff/list': {
    keywords: ['faculty', 'teachers', 'facilitators', 'employee', 'staff list'],
    description: 'View and manage all staff/faculty members'
  },
  '/staff/class-incharges': {
    keywords: ['class teacher', 'class incharge', 'section head', 'class advisor'],
    description: 'Assign class incharges to sections'
  },
  // Learners - Student Portal
  '/learners/my-timetable': {
    keywords: ['my schedule', 'my classes', 'today schedule', 'class timing'],
    description: 'View your personal timetable'
  },
  '/learners/my-attendance': {
    keywords: ['my attendance', 'absence record', 'attendance percentage'],
    description: 'View your attendance records and percentage'
  },
  '/learners/my-profile': {
    keywords: ['my profile', 'student profile', 'personal details'],
    description: 'View and update your profile'
  },
  '/learners/leave-onduty/my-applications': {
    keywords: ['apply leave', 'onduty request', 'leave application'],
    description: 'Apply for leave or on-duty and track status'
  },
  // Learners - Admin
  '/learners/analytics': {
    keywords: ['learner analytics', 'student stats', 'enrollment stats'],
    description: 'Learner analytics dashboard'
  },
  '/learners/enquiries': {
    keywords: ['student enquiry', 'new admission', 'admission enquiry'],
    description: 'Manage student admission enquiries'
  },
  '/learners/profiles': {
    keywords: ['students', 'student list', 'enrollment', 'learner data', 'all students'],
    description: 'View and manage all student profiles'
  },
  '/learners/alumni': {
    keywords: ['alumni', 'graduates', 'passout', 'former students'],
    description: 'View alumni and graduated students'
  },
  '/learners/change-requests': {
    keywords: ['change request', 'data correction', 'profile update request'],
    description: 'Review student profile change requests'
  },
  // Billing / Accounts
  '/billing/categories/parent-categories': {
    keywords: ['fee category', 'billing category', 'fee head'],
    description: 'Manage parent fee categories'
  },
  '/billing/categories/sub-categories': {
    keywords: ['sub category', 'fee sub-type', 'billing sub-category'],
    description: 'Manage fee sub-categories'
  },
  '/billing/categories/item-categories': {
    keywords: ['item category', 'fee item', 'line item'],
    description: 'Manage fee item categories'
  },
  '/billing/schedule': {
    keywords: ['fee structure', 'fee plan', 'billing plan', 'fee schedule', 'charges'],
    description: 'Configure fee schedules and billing plans'
  },
  '/billing/schedule/students': {
    keywords: ['student fee', 'student bill', 'fee search', 'student balance'],
    description: 'Search students and view their fee details'
  },
  '/billing/onboarding': {
    keywords: ['onboarding', 'learner onboarding', 'account', 'enrollment', 'fee payment', 'admission billing', 'new student'],
    description: 'Review pending learner payments and approve for enrollment'
  },
  '/billing/receipts': {
    keywords: ['payments', 'paid', 'collection', 'fee receipt', 'transaction'],
    description: 'Record and view fee payment receipts'
  },
  '/billing/discounts': {
    keywords: ['scholarship', 'discount', 'fee waiver', 'concession', 'fee reduction'],
    description: 'Manage scholarships and fee discounts'
  },
  '/billing/refunds': {
    keywords: ['refund', 'fee return', 'money back', 'reversal'],
    description: 'Process and manage fee refunds'
  },
  '/billing/invoices': {
    keywords: ['bills', 'fees', 'charges', 'fee status', 'payment due', 'invoice', 'demand note'],
    description: 'View and manage student fee invoices'
  },
  '/billing/reports': {
    keywords: ['billing report', 'fee report', 'collection report', 'financial report'],
    description: 'Generate billing and financial reports'
  },
  // Resource Management
  '/resource-management/analytics-dashboard': {
    keywords: ['resource stats', 'asset dashboard', 'utilization'],
    description: 'Resource management analytics dashboard'
  },
  '/resource-management/categories': {
    keywords: ['resource category', 'asset type', 'room type'],
    description: 'Manage resource categories'
  },
  '/resource-management/resources': {
    keywords: ['rooms', 'labs', 'equipment', 'assets', 'facilities'],
    description: 'Manage physical resources and assets'
  },
  '/resource-management/reservations': {
    keywords: ['booking', 'reserve', 'room booking', 'lab booking'],
    description: 'Book and manage resource reservations'
  },
  '/resource-management/reservations/my-reservations': {
    keywords: ['my bookings', 'my reservations', 'my room booking'],
    description: 'View your resource reservations'
  },
  '/resource-management/reservations/approvals': {
    keywords: ['approve booking', 'reservation approval', 'pending booking'],
    description: 'Approve or reject resource reservation requests'
  },
  '/resource-management/maintenance': {
    keywords: ['maintenance', 'repair', 'asset maintenance', 'broken', 'fix'],
    description: 'Track and manage resource maintenance'
  },
  // Service Requests
  '/service-requests': {
    keywords: ['helpdesk', 'complaint', 'issue', 'support ticket', 'request'],
    description: 'Submit and manage service requests'
  },
  '/service-requests/my-requests': {
    keywords: ['my tickets', 'my complaints', 'my requests'],
    description: 'View your service requests'
  },
  '/service-requests/approvals': {
    keywords: ['approve request', 'pending approval', 'service approval'],
    description: 'Approve or reject service requests'
  },
  '/service-requests/analytics': {
    keywords: ['request stats', 'ticket analytics', 'helpdesk report'],
    description: 'Service request analytics and metrics'
  },
  '/service-requests/types': {
    keywords: ['service type', 'request category', 'manage services'],
    description: 'Configure available service request types'
  },
  // Administration
  '/admin/notifications': {
    keywords: ['notification', 'announcement', 'broadcast', 'alert', 'push'],
    description: 'Manage and send notifications'
  },
  '/admin/notifications/new': {
    keywords: ['send notification', 'new announcement', 'broadcast message'],
    description: 'Send a new notification or announcement'
  },
  '/admin/lti/analytics': {
    keywords: ['lti dashboard', 'lti stats', 'learning tools'],
    description: 'LTI integration analytics dashboard'
  },
  '/admin/lti/grade-sync': {
    keywords: ['grade sync', 'lti grades', 'score sync'],
    description: 'Monitor and manage LTI grade synchronization'
  },
  '/audit-trail': {
    keywords: ['audit', 'system logs', 'change history', 'who changed'],
    description: 'View system audit trail and change history'
  },
  '/admin/lifecycle': {
    keywords: ['lifecycle', 'student journey', 'enrollment to graduation'],
    description: 'Lifecycle analytics from enrollment to graduation'
  },
  // Startup Studio
  '/startup-studio/events': {
    keywords: ['startup', 'hackathon', 'innovation', 'event', 'entrepreneurship'],
    description: 'Manage startup studio events and hackathons'
  },
  // Value Added Courses
  '/vac': {
    keywords: ['value added', 'extra course', 'additional learning', 'skill course', 'elective'],
    description: 'Browse value-added course catalog'
  },
  '/vac/my-courses': {
    keywords: ['my courses', 'enrolled courses', 'my learning'],
    description: 'View your enrolled value-added courses'
  },
  '/vac/case': {
    keywords: ['case tracker', 'case study', 'case progress'],
    description: 'Track CASE framework progress'
  },
  '/vac/admin/courses': {
    keywords: ['manage vac', 'vac courses', 'create course'],
    description: 'Manage value-added courses (admin)'
  },
  '/vac/admin/enrollments': {
    keywords: ['vac enrollment', 'course enrollment', 'bulk enroll'],
    description: 'Manage VAC course enrollments'
  },
  // Work Pulse
  '/work-pulse': {
    keywords: ['daily work', 'task log', 'work report', 'productivity', 'pulse'],
    description: 'Submit and track daily work activities'
  },
  '/work-pulse/agents': {
    keywords: ['ai agents', 'agent board', 'agent tasks'],
    description: 'View and manage AI agent tasks'
  },
  '/work-pulse/all': {
    keywords: ['all submissions', 'team work', 'all work logs'],
    description: 'View all work pulse submissions'
  },
  '/work-pulse/impact': {
    keywords: ['impact', 'work impact', 'contribution', 'results'],
    description: 'View work impact and contribution metrics'
  },
  // System
  '/system/api-management': {
    keywords: ['api keys', 'api access', 'developer', 'integration'],
    description: 'Manage API keys and integrations'
  },
  '/system/lti-tools': {
    keywords: ['lti', 'learning tools', 'lms integration', 'canvas', 'moodle'],
    description: 'Configure LTI tool integrations'
  },
  '/admin/bug-reports': {
    keywords: ['bugs', 'issues', 'error report', 'bug tracker'],
    description: 'View and manage all bug reports'
  },
  '/my-bug-reports': {
    keywords: ['my bugs', 'report bug', 'my issues'],
    description: 'Submit and track your bug reports'
  },
  '/bug-leaderboard': {
    keywords: ['bug leaderboard', 'top reporters', 'bug hunters'],
    description: 'Bug reporting leaderboard'
  },
  '/admin/ai-query-tools': {
    keywords: ['ai tools', 'query tools', 'ai registry'],
    description: 'Manage AI query tool registry'
  },
  '/profile': {
    keywords: ['my profile', 'account', 'personal info', 'settings'],
    description: 'View and update your profile settings'
  },
};

// ─── Icon Name Mapping ───────────────────────────────────────────────────────
// Maps icon names (strings) to icon components for serialization/deserialization

export const ICON_MAP: Record<string, LucideIcon> = {
  Home, Sparkles, BarChart, Users, Shield, Settings, ClipboardCheck,
  BookOpen, LayoutGrid, TabletSmartphone, Box, Tags, Building, Boxes,
  Flame, GraduationCap, CalendarDays, CalendarClock, Clock, Calendar,
  CalendarX2, Briefcase, UserSearch, UserPlus, FileText, Award,
  HeadphonesIcon, UserCog, Megaphone, SearchCheck, FolderTree,
  RefreshCw, FileBarChart, Package, CheckSquare, Wrench, ClipboardList,
  Bell, Gauge, History, BarChart3, Rocket, Activity, Brain, TrendingUp,
  Key, Link2, Bug, Bot, LineChart, Building2, FileCheck
};

function getIconName(icon: LucideIcon): string {
  for (const [name, comp] of Object.entries(ICON_MAP)) {
    if (comp === icon) return name;
  }
  return 'FileText';
}

// ─── Build the Page Registry ─────────────────────────────────────────────────
// Flattens the menu hierarchy into a searchable array of PageEntry items.

interface RawMenuItem {
  href: string;
  label: string;
  icon: LucideIcon;
  submenus: Array<{ href: string; label: string }>;
}

interface RawMenuGroup {
  groupLabel?: string;
  menus: RawMenuItem[];
}

function buildRegistry(): PageEntry[] {
  // Use a static pathname since we only need the structure, not active states.
  const allGroups: RawMenuGroup[] = GetPages('/');
  const registry: PageEntry[] = [];
  const seen = new Set<string>();

  for (const group of allGroups) {
    const moduleName = (group.groupLabel || 'overview').toLowerCase().replace(/\s+/g, '-');

    for (const menu of group.menus) {
      // Add the menu item itself (if it has a real href)
      if (menu.href && !seen.has(menu.href)) {
        seen.add(menu.href);
        const enrichment = PAGE_ENRICHMENTS[menu.href];
        const permission = MENU_PERMISSIONS[menu.href];

        registry.push({
          path: menu.href,
          title: menu.label,
          keywords: enrichment?.keywords || generateDefaultKeywords(menu.label, moduleName),
          description: enrichment?.description || `${menu.label} in ${group.groupLabel || 'Overview'}`,
          module: group.groupLabel || 'Overview',
          icon: menu.icon,
          iconName: getIconName(menu.icon),
          permission: permission || undefined,
          parentPath: undefined,
        });
      }

      // Add submenus
      for (const sub of menu.submenus) {
        if (sub.href && !seen.has(sub.href)) {
          seen.add(sub.href);
          const enrichment = PAGE_ENRICHMENTS[sub.href];
          const permission = MENU_PERMISSIONS[sub.href];

          // Try to find icon — submenus inherit parent icon
          registry.push({
            path: sub.href,
            title: sub.label,
            keywords: enrichment?.keywords || generateDefaultKeywords(sub.label, moduleName),
            description: enrichment?.description || `${sub.label} in ${group.groupLabel || 'Overview'}`,
            module: group.groupLabel || 'Overview',
            icon: menu.icon,
            iconName: getIconName(menu.icon),
            permission: permission || undefined,
            parentPath: menu.href,
          });
        }
      }
    }
  }

  return registry;
}

function generateDefaultKeywords(label: string, module: string): string[] {
  // Split label into words and add module name as a keyword
  const words = label.toLowerCase().split(/[\s/&-]+/).filter(w => w.length > 2);
  return [...new Set([...words, module])];
}

// ─── Singleton Registry ──────────────────────────────────────────────────────

let _registry: PageEntry[] | null = null;

export function getPageRegistry(): PageEntry[] {
  if (!_registry) {
    _registry = buildRegistry();
  }
  return _registry;
}

export function getPageByPath(path: string): PageEntry | undefined {
  return getPageRegistry().find(p => p.path === path);
}

export function getPagesByModule(module: string): PageEntry[] {
  return getPageRegistry().filter(p => p.module.toLowerCase() === module.toLowerCase());
}

/** Force rebuild — used when admin metadata changes */
export function invalidateRegistry(): void {
  _registry = null;
}

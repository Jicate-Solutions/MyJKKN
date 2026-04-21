'use client';

import {
  Home,
  Heart,
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
  Lightbulb,
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
  Compass,
  Cpu,
  Award,
  CheckSquare,
  CircleDot,
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
  Rocket,
  Vote,
  SearchCheck,
  UserCog,
  Activity,
  Brain,
  Hammer,
  TreePine,
  UserCircle2,
  Trophy as TrophyIcon,
  PieChart,
  Wallet,
  Scale,
  ShieldCheck,
  // Campus Living Icons
  Hotel,
  UtensilsCrossed,
  WashingMachine,
  HeartPulse,
  ClipboardPlus,
  SprayCan,
  Stethoscope,
  LayoutDashboard,
  UsersRound,
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

  // Documents
  '/documents': 'documents.view',
  '/documents/history': 'documents.history.view',
  '/documents/settings': 'documents.settings.view',
  '/documents/templates': 'documents.templates.view',

  // User Management
  '/users': 'users.view',
  '/users/dashboard': 'users.dashboard.view',
  '/users/activity': 'users.activity.view',
  '/users/roles': 'roles.assign',
  '/users/role-management': 'roles.create',
  '/users/permissions-audit': 'users.permissions_audit.view',

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
  '/staff/class-incharges': 'staff.class_incharges.view',

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

  // Exceptions & Privileges
  '/academic/privileges': 'academic.privileges.view',
  '/academic/privileges/new': 'academic.privileges.create',
  '/academic/privileges/[id]': 'academic.privileges.view',
  '/academic/privileges/[id]/members': 'academic.privileges.manage',
  '/academic/privileges/[id]/review': 'academic.privileges.review',
  '/academic/privileges/[id]/renewals': 'academic.privileges.manage',
  '/academic/privileges/templates': 'academic.privileges.manage',
  '/learners/privileges/my': 'learners.privileges.view',
  '/learners/privileges/my/report': 'learners.privileges.report',

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
  '/academic/attendance/pending': 'academic.attendance.view',
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
  '/admin/notifications/compliance': 'notifications.view',
  '/admin/notifications/audiences': 'notifications.view',

  // System Management
  // Work Pulse
  '/work-pulse': 'work_pulse.view',
  '/work-pulse/all': 'work_pulse.all.view',
  '/work-pulse/agents': 'work_pulse.agents.view',
  '/work-pulse/impact': 'work_pulse.impact.view',

  // VAC (Value-Added Courses) Module
  '/vac': 'vac.courses.view',
  '/vac/my-courses': 'vac.my_courses.view',
  '/vac/progress': 'vac.progress.view',
  '/vac/case': 'vac.case.view',
  '/vac/admin': 'vac.admin.view',
  '/vac/admin/courses': 'vac.admin.courses.view',
  '/vac/admin/courses/new': 'vac.admin.courses.create',
  '/vac/admin/enrollments': 'vac.admin.enrollments.view',
  '/vac/admin/analytics': 'vac.admin.analytics.view',
  '/vac/admin/case': 'vac.admin.case.view',
  '/vac/admin/case/tracks': 'vac.admin.case.tracks.view',
  '/vac/admin/case/batches': 'vac.admin.case.batches.view',
  '/vac/admin/case/readiness': 'vac.admin.case.readiness.view',
  '/vac/admin/settings': 'vac.admin.settings.view',

  '/system/api-management': 'system.api.view',
  '/system/lti-tools': 'lti.tools.view',
  '/admin/bug-reports': 'system.bugs.view',
  '/admin/ai-query-tools': 'super_admin', // Super admin only - AI Query Tools Registry
  '/admin/page-metadata': 'super_admin', // Super admin only - Page Search Metadata

  // Lifecycle Analytics
  '/admin/lifecycle': 'admin.lifecycle.view',

  // LTI Monitoring
  '/admin/lti/analytics': 'lti.analytics.view',
  '/admin/lti/grade-sync': 'lti.grade_sync.view',
  '/admin/lti/launches': 'lti.launches.view',

  // Billing Management - Admin/Staff Views
  // Updated: 2026-04-15 - Consolidated 3-tier (parent/sub/item) categories into flat /billing/categories.
  '/billing/categories': 'billing.categories.view',
  '/billing/categories/new': 'billing.categories.create',
  '/billing/categories/[id]/edit': 'billing.categories.edit',
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
  '/billing/onboarding': 'billing.onboarding.view',


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

  // GD-PI (Group Discussion & Personal Interview)
  '/admission/gd-pi': 'admission.applications.view',
  '/admission/gd-pi/new': 'admission.applications.create',
  '/admission/gd-pi/[id]': 'admission.applications.view',
  '/admission/gd-pi/[id]/evaluate': 'admission.applications.edit',

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
  '/admission/marketing/expos': 'admission.marketing.expos.view',
  '/admission/marketing/expos/masters': 'admission.marketing.expos.create',
  '/admission/marketing/expos/new': 'admission.marketing.expos.create',
  '/admission/marketing/expos/analytics': 'admission.marketing.expos.create',

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
  '/admission/settings/sources': 'admission.settings.sources.view',
  '/admission/settings/seat-config': 'admission.settings.seats.view',
  '/admission/settings/years': 'admission.settings.years.view',
  '/admission/settings/years/new': 'admission.settings.years.create',
  '/admission/settings/years/[id]': 'admission.settings.years.view',
  '/admission/settings/years/[id]/edit': 'admission.settings.years.edit',

  // PDE (Principal Development Engine) — Learning
  '/learn/quests': 'pde.quests.view',
  '/learn/capabilities': 'pde.capabilities.view',
  '/learn/build': 'pde.build.view',
  '/learn/channels': 'pde.channels.view',
  '/learn/profile': 'pde.profile.view',
  '/learn/leaderboard': 'pde.leaderboard.view',

  // Startup Studio
  '/startup-studio/portfolio': 'startup_studio.analytics.view',
  '/startup-studio/mentors': 'startup_studio.analytics.view',
  '/startup-studio/alumni': 'startup_studio.analytics.view',
  '/startup-studio/kpi': 'startup_studio.analytics.view',
  '/startup-studio/marketing': 'startup_studio.analytics.view',
  '/startup-studio/finance': 'startup_studio.analytics.view',
  '/startup-studio/governance': 'startup_studio.analytics.view',
  '/startup-studio/solve-for-100': 'startup_studio.events.view',
  '/startup-studio/solve-for-100/dashboard': 'startup_studio.events.view',
  '/startup-studio/solve-for-100/leaderboard': 'startup_studio.leaderboard.view',
  '/startup-studio/solve-for-100/mentor': 'startup_studio.analytics.view',
  '/startup-studio/solve-for-100/programs': 'startup_studio.analytics.view',
  '/startup-studio/solve-for-100/admin': 'startup_studio.analytics.view',
  '/startup-studio/events': 'startup_studio.events.view',
  '/startup-studio/events/[id]/registrations': 'startup_studio.registrations.manage',
  '/startup-studio/events/[id]/venues': 'startup_studio.venues.manage',
  '/startup-studio/events/[id]/submit': 'startup_studio.events.view',
  '/startup-studio/events/[id]/my-team': 'startup_studio.events.view',
  '/startup-studio/events/[id]/my-registration': 'startup_studio.events.view',
  '/startup-studio/events/[id]/my-assignment': 'startup_studio.venues.manage',
  '/startup-studio/events/[id]/demo-day': 'startup_studio.demo_day.manage',
  '/startup-studio/events/[id]/evaluate': 'startup_studio.evaluations.manage',
  '/startup-studio/events/[id]/leaderboard': 'startup_studio.leaderboard.view',
  '/startup-studio/events/[id]/vote': 'startup_studio.events.view',
  '/startup-studio/events/[id]/checklists': 'startup_studio.checklists.manage',
  '/startup-studio/events/[id]/dashboard': 'startup_studio.analytics.view',
  '/startup-studio/events/[id]/solve-for-100': 'startup_studio.events.view',
  '/startup-studio/events/[id]/solve-for-100/weekly': 'startup_studio.events.view',
  '/startup-studio/events/[id]/solve-for-100/icp': 'startup_studio.events.view',
  '/startup-studio/events/[id]/solve-for-100/mentor': 'startup_studio.evaluations.manage',

  // Solution Hub
  '/solutions': 'solutions.dashboard.view',
  '/solutions/list': 'solutions.dashboard.view',
  '/solutions/pipeline': 'solutions.pipeline.view',
  '/solutions/pipeline/list': 'solutions.pipeline.view',
  '/solutions/pipeline/analytics': 'solutions.pipeline.analytics.view',
  '/solutions/clients': 'solutions.clients.view',
  '/solutions/builders': 'solutions.builders.view',
  '/solutions/training': 'solutions.training.view',
  '/solutions/training/programs': 'solutions.training.programs.view',
  '/solutions/training/sessions': 'solutions.training.sessions.view',
  '/solutions/training/cohort': 'solutions.training.cohort.view',
  '/solutions/content': 'solutions.content.view',
  '/solutions/content/deliverables': 'solutions.content.deliverables.view',
  '/solutions/content/production': 'solutions.content.production.view',
  '/solutions/content/queue': 'solutions.content.queue.view',
  '/solutions/payments': 'solutions.payments.view',
  '/solutions/earnings': 'solutions.earnings.view',
  '/solutions/discovery': 'solutions.discovery.view',
  '/solutions/publications': 'solutions.publications.view',
  '/solutions/products': 'solutions.products.view',
  '/solutions/software': 'solutions.software.view',
  '/solutions/software/builders': 'solutions.software.builders.view',
  '/solutions/software/phases': 'solutions.software.phases.view',
  '/solutions/matlab': 'solutions.matlab.view',
  '/solutions/paradigm-shift': 'solutions.paradigm_shift.view',
  '/solutions/ai-solution-compliance': 'solutions.compliance.view',
  // '/solutions/departments' retired April 2026 — replaced by paradigm-shift

  // Learners Council
  '/learners-council': 'learners_council.dashboard.view',
  '/learners-council/structure': 'learners_council.structure.view',
  '/learners-council/structure/members': 'learners_council.structure.view',
  '/learners-council/structure/terms': 'learners_council.structure.view',
  '/learners-council/structure/yuva': 'learners_council.structure.view',
  '/learners-council/structure/verticals': 'learners_council.structure.view',
  '/learners-council/structure/positions': 'learners_council.structure.view',
  '/learners-council/structure/committees': 'learners_council.structure.view',
  '/learners-council/communication': 'learners_council.communication.view',
  '/learners-council/communication/polls': 'learners_council.communication.view',
  '/learners-council/communication/forums': 'learners_council.communication.view',
  '/learners-council/communication/chat': 'learners_council.communication.view',
  '/learners-council/events': 'learners_council.events.view',
  '/learners-council/events/calendar': 'learners_council.events.view',
  '/learners-council/events/proposals': 'learners_council.events.view',
  '/learners-council/od': 'learners_council.od.view',
  '/learners-council/od/approvals': 'learners_council.od.view',
  '/learners-council/od/chains': 'learners_council.od.view',
  '/learners-council/selection': 'learners_council.selection.view',
  '/learners-council/selection/nominations': 'learners_council.selection.view',
  '/learners-council/selection/interviews': 'learners_council.selection.view',
  '/learners-council/selection/elections': 'learners_council.selection.view',
  '/learners-council/issues': 'learners_council.issues.view',
  '/learners-council/settings': 'learners_council.settings.view',

  // Campus Living Module
  '/campus-living': 'campus_living.dashboard.view',
  '/campus-living/blocks': 'campus_living.blocks.view',
  '/campus-living/allocations': 'campus_living.allocations.view',
  '/campus-living/allocations/roommate-matching': 'campus_living.allocations.view',
  '/campus-living/attendance': 'campus_living.attendance.view',
  '/campus-living/leave': 'campus_living.leave.view',
  '/campus-living/gate-passes': 'campus_living.gate_passes.view',
  '/campus-living/mess': 'campus_living.mess.view',
  '/campus-living/mess/menu': 'campus_living.mess.menu.view',
  '/campus-living/mess/meals': 'campus_living.mess.meals.view',
  '/campus-living/mess/billing': 'campus_living.mess.billing.view',
  '/campus-living/mess/feedback': 'campus_living.mess.feedback.view',
  '/campus-living/mess/waste': 'campus_living.mess.waste.view',
  '/campus-living/visitors': 'campus_living.visitors.view',
  '/campus-living/maintenance': 'campus_living.maintenance.view',
  '/campus-living/maintenance/preventive': 'campus_living.maintenance.view',
  '/campus-living/maintenance/preventive/tasks': 'campus_living.maintenance.view',
  '/campus-living/allocations/onboarding': 'campus_living.allocations.view',
  '/campus-living/allocations/onboarding/templates': 'campus_living.allocations.view',
  '/campus-living/wellness': 'campus_living.wellness.view',
  '/campus-living/wellness/surveys': 'campus_living.wellness.view',
  '/campus-living/laundry': 'campus_living.laundry.view',
  '/campus-living/laundry/orders': 'campus_living.laundry.view',
  '/campus-living/laundry/schedule': 'campus_living.laundry.view',
  '/campus-living/laundry/settings': 'campus_living.laundry.view',
  '/campus-living/maintenance/contracts': 'campus_living.maintenance.view',
  '/campus-living/housekeeping': 'campus_living.housekeeping.view',
  '/campus-living/housekeeping/schedules': 'campus_living.housekeeping.view',
  '/campus-living/housekeeping/tasks': 'campus_living.housekeeping.view',
  '/campus-living/health': 'campus_living.health.view',
  '/campus-living/dashboard': 'campus_living.dashboard.view',
  '/campus-living/activity': 'campus_living.activity.view',
  '/campus-living/calendar': 'campus_living.calendar.view',
  '/campus-living/community': 'campus_living.community.view',
  '/campus-living/community/settings': 'campus_living.community.manage',
  '/campus-living/safety': 'campus_living.safety.view',
  '/campus-living/safety/incidents': 'campus_living.safety.incidents.view',
  '/campus-living/safety/anti-ragging': 'campus_living.safety.anti_ragging.view',
  '/campus-living/safety/inspections': 'campus_living.safety.inspections.view',
  '/campus-living/analytics': 'campus_living.analytics.view',
  '/campus-living/reports': 'campus_living.reports.view',
  '/campus-living/settings': 'campus_living.settings.view',

  // Faculty Innovation Portfolio (spec v1.0.0 — 2026-04-15)
  '/faculty/innovation': 'faculty_innovation.initiative.submit',
  '/faculty/innovation/submit': 'faculty_innovation.initiative.submit',
  '/faculty/innovation/portfolio': 'faculty_innovation.initiative.view_own',
  '/faculty/innovation/approval-queue': 'faculty_innovation.initiative.approve',
  '/faculty/innovation/collab-request': 'faculty_innovation.collab_request.create',

  // Compliance Unification Program — Accreditation routes
  '/accreditation': 'accreditation.view',                       // PR-A7 landing
  '/accreditation/coverage': 'accreditation.coverage.view',     // PR-A7 coverage dashboard
  '/accreditation/naac': 'accreditation.naac.view',             // PR-A8 c1 NAAC IQAC dashboard
  '/accreditation/naac/committees': 'accreditation.naac.committees.view',         // PR-A8 c2
  '/accreditation/naac/committees/[id]': 'accreditation.naac.committees.view',    // PR-A8 c2
  '/accreditation/naac/dcf-export': 'accreditation.naac.dcf_export',              // PR-A8 c2 (super-admin)
  '/accreditation/naac/surveys/consent': 'accreditation.naac.surveys.consent.submit',  // PR-A8 c2
  '/accreditation/naac/surveys/8.4-export': 'accreditation.naac.surveys.export', // PR-A8 c2
  '/accreditation/nirf': 'accreditation.nirf.view',             // PR-A9
  '/accreditation/nba': 'accreditation.nba.view',               // PR-A10
  '/accreditation/qs': 'accreditation.qs.view',                 // PR-A11 placeholder
  '/accreditation/dci': 'accreditation.dci.view',               // PR-A12
  '/accreditation/pci': 'accreditation.pci.view',               // PR-A13
  '/accreditation/inc': 'accreditation.inc.view',               // PR-A14
  '/accreditation/ncte': 'accreditation.ncte.view',             // PR-A15
  '/accreditation/aicte': 'accreditation.aicte.view',           // PR-A15
  '/accreditation/ugc': 'accreditation.ugc.view',               // PR-A15

  // OKR Module (resurrected from clean-ss-deploy, PR #230)
  '/okr': 'okr.view',
  '/okr/objectives': 'okr.objectives.view',
  '/okr/objectives/new': 'okr.objectives.create',
  '/okr/objectives/create': 'okr.objectives.create',
  '/okr/objectives/[id]': 'okr.objectives.view',
  '/okr/objectives/[id]/edit': 'okr.objectives.edit',
  '/okr/check-in': 'okr.checkin.view',
  '/okr/analytics': 'okr.analytics.view',
  '/okr/team': 'okr.team.view',
  '/okr/department': 'okr.department.view',
  '/okr/organization': 'okr.organization.view',
  '/okr/cascade': 'okr.cascade.view',
  '/okr/manage': 'okr.manage.view',
  '/okr/admin/compliance': 'okr.admin.view',
  '/okr/elective': 'okr.elective.view',
  '/okr/elective/[id]': 'okr.elective.view',
  '/okr/elective/[id]/edit': 'okr.elective.edit',
  '/okr/abcd': 'okr.abcd.view',
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
        },
        {
          href: '/users/permissions-audit',
          label: 'Permissions Audit',
          active: pathname === '/users/permissions-audit',
          icon: ShieldCheck,
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
          href: '/academic/privileges',
          label: 'Privileges',
          active: pathname.startsWith('/academic/privileges'),
          icon: Shield,
          submenus: [
            {
              href: '/academic/privileges',
              label: 'Manage Groups',
              active: pathname === '/academic/privileges'
            },
            {
              href: '/academic/privileges/templates',
              label: 'Templates',
              active: pathname === '/academic/privileges/templates'
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
              href: '/academic/attendance/pending',
              label: 'Pending Attendance',
              active: pathname.startsWith('/academic/attendance/pending')
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
      groupLabel: 'Campus Living',
      menus: [
        {
          href: '/campus-living',
          label: 'Overview',
          active: pathname === '/campus-living',
          icon: Building2,
          submenus: []
        },
        {
          href: '/campus-living/dashboard',
          label: 'Mgmt Dashboard',
          active: pathname === '/campus-living/dashboard',
          icon: LayoutDashboard,
          submenus: []
        },
        {
          href: '/campus-living/activity',
          label: 'Activity Feed',
          active: pathname === '/campus-living/activity',
          icon: Activity,
          submenus: []
        },
        {
          href: '/campus-living/calendar',
          label: 'Calendar',
          active: pathname === '/campus-living/calendar',
          icon: Calendar,
          submenus: []
        },
        {
          href: '/campus-living/community',
          label: 'Community',
          active: pathname.startsWith('/campus-living/community'),
          icon: UsersRound,
          submenus: []
        },
        {
          href: '/campus-living/blocks',
          label: 'Hostel Blocks',
          active: pathname.startsWith('/campus-living/blocks'),
          icon: Hotel,
          submenus: [
            {
              href: '/campus-living/allocations',
              label: 'Room Allocations',
              active: pathname.startsWith('/campus-living/allocations') && !pathname.startsWith('/campus-living/allocations/onboarding')
            },
            {
              href: '/campus-living/allocations/roommate-matching',
              label: 'Roommate Matching',
              active: pathname === '/campus-living/allocations/roommate-matching'
            },
            {
              href: '/campus-living/allocations/onboarding',
              label: 'Onboarding',
              active: pathname.startsWith('/campus-living/allocations/onboarding')
            }
          ]
        },
        {
          href: '/campus-living/attendance',
          label: 'Attendance',
          active: pathname.startsWith('/campus-living/attendance'),
          icon: UserCheck,
          submenus: [
            {
              href: '/campus-living/leave',
              label: 'Leave Management',
              active: pathname.startsWith('/campus-living/leave')
            },
            {
              href: '/campus-living/gate-passes',
              label: 'Gate Passes',
              active: pathname.startsWith('/campus-living/gate-passes')
            }
          ]
        },
        {
          href: '/campus-living/mess',
          label: 'Mess & Cafeteria',
          active: pathname.startsWith('/campus-living/mess'),
          icon: UtensilsCrossed,
          submenus: [
            {
              href: '/campus-living/mess/menu',
              label: 'Menu',
              active: pathname.startsWith('/campus-living/mess/menu')
            },
            {
              href: '/campus-living/mess/meals',
              label: 'Meal Tracking',
              active: pathname.startsWith('/campus-living/mess/meals')
            },
            {
              href: '/campus-living/mess/billing',
              label: 'Mess Billing',
              active: pathname.startsWith('/campus-living/mess/billing')
            },
            {
              href: '/campus-living/mess/feedback',
              label: 'Feedback',
              active: pathname === '/campus-living/mess/feedback'
            },
            {
              href: '/campus-living/mess/waste',
              label: 'Waste Tracking',
              active: pathname === '/campus-living/mess/waste'
            }
          ]
        },
        {
          href: '/campus-living/visitors',
          label: 'Visitors',
          active: pathname.startsWith('/campus-living/visitors'),
          icon: UserPlus,
          submenus: []
        },
        {
          href: '/campus-living/maintenance',
          label: 'Maintenance',
          active: pathname.startsWith('/campus-living/maintenance'),
          icon: Wrench,
          submenus: [
            {
              href: '/campus-living/maintenance/preventive',
              label: 'Preventive Schedules',
              active: pathname.startsWith('/campus-living/maintenance/preventive')
            },
            {
              href: '/campus-living/maintenance/preventive/tasks',
              label: 'PM Tasks',
              active: pathname === '/campus-living/maintenance/preventive/tasks'
            },
            {
              href: '/campus-living/maintenance/contracts',
              label: 'AMC Contracts',
              active: pathname.startsWith('/campus-living/maintenance/contracts')
            }
          ]
        },
        {
          href: '/campus-living/housekeeping',
          label: 'Housekeeping',
          active: pathname.startsWith('/campus-living/housekeeping'),
          icon: SprayCan,
          submenus: [
            {
              href: '/campus-living/housekeeping/schedules',
              label: 'Schedules',
              active: pathname.startsWith('/campus-living/housekeeping/schedules')
            },
            {
              href: '/campus-living/housekeeping/tasks',
              label: 'Tasks',
              active: pathname === '/campus-living/housekeeping/tasks'
            }
          ]
        },
        {
          href: '/campus-living/laundry',
          label: 'Laundry',
          active: pathname.startsWith('/campus-living/laundry'),
          icon: WashingMachine,
          submenus: [
            {
              href: '/campus-living/laundry/orders',
              label: 'Orders',
              active: pathname.startsWith('/campus-living/laundry/orders')
            },
            {
              href: '/campus-living/laundry/settings',
              label: 'Configuration',
              active: pathname === '/campus-living/laundry/settings'
            }
          ]
        },
        {
          href: '/campus-living/wellness',
          label: 'Wellness',
          active: pathname.startsWith('/campus-living/wellness'),
          icon: HeartPulse,
          submenus: [
            {
              href: '/campus-living/wellness/surveys',
              label: 'Pulse Surveys',
              active: pathname.startsWith('/campus-living/wellness/surveys')
            }
          ]
        },
        {
          href: '/campus-living/health',
          label: 'Health Cases',
          active: pathname.startsWith('/campus-living/health'),
          icon: Stethoscope,
          submenus: []
        },
        {
          href: '/campus-living/safety',
          label: 'Safety & Compliance',
          active: pathname.startsWith('/campus-living/safety'),
          icon: ShieldCheck,
          submenus: [
            {
              href: '/campus-living/safety/incidents',
              label: 'Incidents',
              active: pathname.startsWith('/campus-living/safety/incidents')
            },
            {
              href: '/campus-living/safety/anti-ragging',
              label: 'Anti-Ragging',
              active: pathname === '/campus-living/safety/anti-ragging'
            },
            {
              href: '/campus-living/safety/inspections',
              label: 'Inspections',
              active: pathname.startsWith('/campus-living/safety/inspections')
            }
          ]
        },
        {
          href: '/campus-living/analytics',
          label: 'Analytics',
          active: pathname.startsWith('/campus-living/analytics'),
          icon: BarChart3,
          submenus: []
        },
        {
          href: '/campus-living/reports',
          label: 'Reports',
          active: pathname.startsWith('/campus-living/reports'),
          icon: FileText,
          submenus: []
        },
        {
          href: '/campus-living/settings',
          label: 'Settings',
          active: pathname.startsWith('/campus-living/settings'),
          icon: Settings,
          submenus: []
        }
      ]
    },
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
          href: '/admission/gd-pi',
          label: 'GD-PI',
          active: pathname.startsWith('/admission/gd-pi'),
          icon: Award,
          submenus: [
            {
              href: '/admission/gd-pi',
              label: 'All Sessions',
              active: pathname === '/admission/gd-pi'
            },
            {
              href: '/admission/gd-pi/new',
              label: 'New Session',
              active: pathname === '/admission/gd-pi/new'
            }
          ]
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
              href: '/admission/marketing/database',
              label: 'Database',
              active: pathname === '/admission/marketing/database'
            },
            {
              href: '/admission/marketing/publishers',
              label: 'Publishers',
              active: pathname === '/admission/marketing/publishers'
            },
            {
              href: '/admission/marketing/expos',
              label: 'Expos',
              active: pathname.startsWith('/admission/marketing/expos')
            },
            {
              href: '/admission/marketing/expos/masters',
              label: 'Expo Masters',
              active: pathname === '/admission/marketing/expos/masters'
            },
            {
              href: '/admission/marketing/expos/analytics',
              label: 'Expo Analytics',
              active: pathname === '/admission/marketing/expos/analytics'
            },
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
              href: '/admission/settings/seat-config',
              label: 'Seat Configuration',
              active: pathname === '/admission/settings/seat-config'
            },
            {
              href: '/admission/settings/years',
              label: 'Admission Years',
              active: pathname.startsWith('/admission/settings/years')
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
      groupLabel: 'Employee Management',
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
          label: 'Employee Category',
          active: pathname === '/staff/category',
          icon: Tags,
          submenus: []
        },
        {
          href: '/staff/list',
          label: 'Employee List',
          active: pathname === '/staff/list',
          icon: Users,
          submenus: []
        },
        {
          href: '/staff/class-incharges',
          label: 'Class Incharges',
          active: pathname.startsWith('/staff/class-incharges'),
          icon: UserCheck,
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'HR (Sprints 1-3)',
      menus: [
        {
          href: '/hr',
          label: 'HR Command Center',
          active: pathname === '/hr',
          icon: Building,
          submenus: []
        },
        {
          href: '/hr/employees',
          label: 'Non-Staff Workforce',
          active: pathname.startsWith('/hr/employees'),
          icon: Users,
          submenus: []
        },
        {
          href: '/hr/policies',
          label: 'Policies',
          active: pathname.startsWith('/hr/policies'),
          icon: ClipboardList,
          submenus: []
        },
        {
          href: '/hr/leave',
          label: 'Leave',
          active: pathname.startsWith('/hr/leave'),
          icon: CalendarDays,
          submenus: [
            { href: '/hr/leave/apply',            label: 'Apply',           active: pathname === '/hr/leave/apply' },
            { href: '/hr/leave/my-applications',  label: 'My Applications', active: pathname === '/hr/leave/my-applications' },
            { href: '/hr/leave/approve',          label: 'Approve Inbox',   active: pathname === '/hr/leave/approve' },
            { href: '/hr/leave/calendar',         label: 'Calendar',        active: pathname === '/hr/leave/calendar' },
            { href: '/hr/leave/balance',          label: 'Balance',         active: pathname === '/hr/leave/balance' },
            { href: '/hr/leave/encashment',       label: 'Encashment',      active: pathname === '/hr/leave/encashment' },
          ]
        },
        {
          href: '/hr/recruitment',
          label: 'Recruitment',
          active: pathname.startsWith('/hr/recruitment'),
          icon: Briefcase,
          submenus: [
            { href: '/hr/recruitment/submit',    label: 'Submit Candidate', active: pathname === '/hr/recruitment/submit' },
            { href: '/hr/recruitment/my',        label: 'My Candidates',    active: pathname === '/hr/recruitment/my' },
            { href: '/hr/recruitment/approvals', label: 'Approvals',        active: pathname === '/hr/recruitment/approvals' },
          ]
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
        {
          href: '/academic/privileges/my',
          label: 'My Privileges',
          active: pathname.startsWith('/academic/privileges/my'),
          icon: Shield,
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
      groupLabel: 'Accounts',
      menus: [
        {
          href: '/billing/categories',
          label: 'Categories',
          active: pathname.startsWith('/billing/categories'),
          icon: FolderTree,
          submenus: []
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
          href: '/billing/onboarding',
          label: 'Learner Onboarding',
          active: pathname.startsWith('/billing/onboarding'),
          icon: UserCheck,
          submenus: []
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
      groupLabel: 'Documents',
      menus: [
        {
          href: '/documents',
          label: 'Document Center',
          active: pathname === '/documents',
          icon: FileText,
          submenus: []
        },
        {
          href: '/documents/history',
          label: 'Document History',
          active: pathname.startsWith('/documents/history'),
          icon: Clock,
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
            },
            {
              href: '/admin/notifications/compliance',
              label: 'Compliance Dashboard',
              active: pathname === '/admin/notifications/compliance'
            },
            {
              href: '/admin/notifications/audiences',
              label: 'Audiences',
              active: pathname.startsWith('/admin/notifications/audiences')
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
        },
        {
          href: '/admin/page-metadata',
          label: 'Page Metadata',
          active: pathname.startsWith('/admin/page-metadata'),
          icon: Tags,
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'OKR & Performance',
      menus: [
        {
          href: '/okr',
          label: 'Dashboard',
          active: pathname === '/okr',
          icon: Target,
          submenus: []
        },
        {
          href: '/okr/objectives',
          label: 'My Objectives',
          active: pathname.startsWith('/okr/objectives'),
          icon: Target,
          submenus: [
            {
              href: '/okr/objectives',
              label: 'All Objectives',
              active: pathname === '/okr/objectives'
            },
            {
              href: '/okr/objectives/new',
              label: 'Create Objective',
              active: pathname === '/okr/objectives/new' || pathname.startsWith('/okr/objectives/create')
            }
          ]
        },
        {
          href: '/okr/check-in',
          label: 'Check-ins',
          active: pathname === '/okr/check-in',
          icon: CheckSquare,
          submenus: []
        },
        {
          href: '/okr/team',
          label: 'Team OKRs',
          active: pathname === '/okr/team',
          icon: Users,
          submenus: []
        },
        {
          href: '/okr/department',
          label: 'Department OKRs',
          active: pathname === '/okr/department',
          icon: Building2,
          submenus: []
        },
        {
          href: '/okr/organization',
          label: 'Organization OKRs',
          active: pathname === '/okr/organization',
          icon: Building,
          submenus: []
        },
        {
          href: '/okr/cascade',
          label: 'Cascade View',
          active: pathname === '/okr/cascade',
          icon: FolderTree,
          submenus: []
        },
        {
          href: '/okr/analytics',
          label: 'Analytics',
          active: pathname === '/okr/analytics',
          icon: BarChart,
          submenus: []
        },
        {
          href: '/okr/manage',
          label: 'Manage OKRs',
          active: pathname === '/okr/manage',
          icon: Settings,
          submenus: []
        },
        {
          href: '/okr/admin/compliance',
          label: 'Compliance',
          active: pathname.startsWith('/okr/admin'),
          icon: Shield,
          submenus: []
        },
        {
          href: '/okr/abcd',
          label: 'ABCD Matrix',
          active: pathname.startsWith('/okr/abcd'),
          icon: CircleDot,
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'Learning',
      menus: [
        {
          href: '/learn/quests',
          label: 'Quest Board',
          active: pathname === '/learn/quests' || pathname.startsWith('/learn/quests/'),
          icon: Target,
          submenus: []
        },
        {
          href: '/learn/capabilities',
          label: 'Capability Tree',
          active: pathname.startsWith('/learn/capabilities'),
          icon: TreePine,
          submenus: []
        },
        {
          href: '/learn/build',
          label: 'Build Arena',
          active: pathname.startsWith('/learn/build'),
          icon: Hammer,
          submenus: []
        },
        {
          href: '/learn/channels',
          label: 'Channels',
          active: pathname.startsWith('/learn/channels'),
          icon: MessageSquare,
          submenus: []
        },
        {
          href: '/learn/profile',
          label: 'Profile',
          active: pathname === '/learn/profile',
          icon: UserCircle2,
          submenus: []
        },
        {
          href: '/learn/leaderboard',
          label: 'Leaderboard',
          active: pathname === '/learn/leaderboard',
          icon: TrophyIcon,
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'Health & Wellness',
      menus: [
        {
          href: '/health/dashboard',
          label: 'Health Dashboard',
          active: pathname === '/health/dashboard',
          icon: Heart,
          submenus: []
        },
        {
          href: '/health/profile',
          label: 'My Health Profile',
          active: pathname === '/health/profile',
          icon: UserCheck,
          submenus: []
        },
        {
          href: '/health/leaderboard',
          label: 'Leaderboard',
          active: pathname === '/health/leaderboard',
          icon: TrophyIcon,
          submenus: []
        },
        {
          href: '/health/sports',
          label: 'Sports Profile',
          active: pathname === '/health/sports',
          icon: Activity,
          submenus: []
        },
        {
          href: '/health/fitness',
          label: 'Fitness Tests',
          active: pathname === '/health/fitness' || pathname.startsWith('/health/fitness/'),
          icon: Activity,
          submenus: []
        },
        {
          href: '/health/training',
          label: 'Training Log',
          active: pathname === '/health/training',
          icon: ClipboardList,
          submenus: []
        },
        {
          href: '/health/achievements',
          label: 'Achievements',
          active: pathname === '/health/achievements',
          icon: TrophyIcon,
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'Startup Studio',
      menus: (() => {
        // Extract active event ID from pathname: /startup-studio/events/[uuid]/...
        const eventMatch = pathname.match(/\/startup-studio\/events\/([^/]+)/);
        const activeId = eventMatch?.[1] && eventMatch[1] !== 'events' ? eventMatch[1] : null;

        return [
          {
            href: '/startup-studio/portfolio',
            label: 'Portfolio Intelligence',
            active: pathname === '/startup-studio/portfolio',
            icon: Gauge,
            submenus: []
          },
          {
            href: '/startup-studio/mentors',
            label: 'Mentor Network',
            active: pathname.startsWith('/startup-studio/mentors'),
            icon: Users,
            submenus: []
          },
          {
            href: '/startup-studio/alumni',
            label: 'Alumni Network',
            active: pathname.startsWith('/startup-studio/alumni'),
            icon: Award,
            submenus: []
          },
          {
            href: '/startup-studio/kpi',
            label: 'KPI Dashboard',
            active: pathname.startsWith('/startup-studio/kpi'),
            icon: PieChart,
            submenus: []
          },
          {
            href: '/startup-studio/marketing',
            label: 'Marketing',
            active: pathname.startsWith('/startup-studio/marketing'),
            icon: Megaphone,
            submenus: []
          },
          {
            href: '/startup-studio/finance',
            label: 'Finance',
            active: pathname.startsWith('/startup-studio/finance'),
            icon: Wallet,
            submenus: []
          },
          {
            href: '/startup-studio/governance',
            label: 'Governance',
            active: pathname.startsWith('/startup-studio/governance'),
            icon: Scale,
            submenus: []
          },
          {
            href: '/startup-studio/solve-for-100',
            label: 'Solve for 100',
            active: pathname.startsWith('/startup-studio/solve-for-100'),
            icon: Target,
            submenus: pathname.startsWith('/startup-studio/solve-for-100') ? [
              { href: '/startup-studio/solve-for-100/dashboard', label: 'My Team', active: pathname.includes('/dashboard') },
              { href: '/startup-studio/solve-for-100/leaderboard', label: 'Leaderboard', active: pathname.includes('/leaderboard') },
              { href: '/startup-studio/solve-for-100/admin', label: 'Admin', active: pathname.includes('/admin') },
              { href: '/startup-studio/solve-for-100/mentor', label: 'My Mentees', active: pathname.includes('/mentor') },
              { href: '/startup-studio/solve-for-100/programs', label: 'Programs', active: pathname.includes('/programs') },
            ] : []
          },
          {
            href: '/startup-studio/events',
            label: 'Events',
            active: pathname.startsWith('/startup-studio/events'),
            icon: Rocket,
            submenus: activeId ? [
              {
                href: `/startup-studio/events/${activeId}/dashboard`,
                label: 'Analytics Dashboard',
                active: pathname.includes('/dashboard')
              },
              {
                href: `/startup-studio/events/${activeId}/my-team`,
                label: 'My Team',
                active: pathname.includes('/my-team')
              },
              {
                href: `/startup-studio/events/${activeId}/my-registration`,
                label: 'My Registration',
                active: pathname.includes('/my-registration')
              },
              {
                href: `/startup-studio/events/${activeId}/submit`,
                label: 'Submit Project',
                active: pathname.includes('/submit')
              },
              {
                href: `/startup-studio/events/${activeId}/my-assignment`,
                label: 'My Assignment',
                active: pathname.includes('/my-assignment')
              },
              {
                href: `/startup-studio/events/${activeId}/registrations`,
                label: 'Registrations',
                active: pathname.includes('/registrations')
              },
              {
                href: `/startup-studio/events/${activeId}/venues`,
                label: 'Venues & Mentors',
                active: pathname.includes('/venues')
              },
              {
                href: `/startup-studio/events/${activeId}/demo-day`,
                label: 'Demo Day',
                active: pathname.includes('/demo-day')
              },
              {
                href: `/startup-studio/events/${activeId}/evaluate`,
                label: 'Evaluate Teams',
                active: pathname.includes('/evaluate')
              },
              {
                href: `/startup-studio/events/${activeId}/leaderboard`,
                label: 'Leaderboard',
                active: pathname.includes('/leaderboard')
              },
              {
                href: `/startup-studio/events/${activeId}/vote`,
                label: 'Live Voting',
                active: pathname.includes('/vote')
              },
              {
                href: `/startup-studio/events/${activeId}/checklists`,
                label: 'Checklists',
                active: pathname.includes('/checklists')
              },
              {
                href: `/startup-studio/events/${activeId}/declare`,
                label: 'Declare Track',
                active: pathname.includes('/declare')
              },
              {
                href: `/startup-studio/events/${activeId}/case-study`,
                label: 'Case Study',
                active: pathname.includes('/case-study')
              },
              {
                href: `/startup-studio/events/${activeId}/solve-for-100`,
                label: 'Solve for 100',
                active: pathname.includes('/solve-for-100')
              },
            ] : []
          }
        ];
      })()
    },
    {
      groupLabel: 'Solution Hub',
      menus: [
        {
          href: '/solutions',
          label: 'Dashboard',
          active: pathname === '/solutions' || pathname === '/solutions/list',
          icon: LayoutGrid,
          submenus: []
        },
        {
          href: '/solutions/pipeline',
          label: 'Pipeline',
          active: pathname.startsWith('/solutions/pipeline'),
          icon: Workflow,
          submenus: [
            { href: '/solutions/pipeline', label: 'Board View', active: pathname === '/solutions/pipeline' },
            { href: '/solutions/pipeline/list', label: 'List View', active: pathname === '/solutions/pipeline/list' },
            { href: '/solutions/pipeline/analytics', label: 'Analytics', active: pathname === '/solutions/pipeline/analytics' }
          ]
        },
        {
          href: '/solutions/clients',
          label: 'Clients',
          active: pathname.startsWith('/solutions/clients'),
          icon: Users,
          submenus: []
        },
        {
          href: '/solutions/builders',
          label: 'Builders',
          active: pathname.startsWith('/solutions/builders'),
          icon: Hammer,
          submenus: []
        },
        {
          href: '/solutions/training',
          label: 'Training',
          active: pathname.startsWith('/solutions/training'),
          icon: GraduationCap,
          submenus: [
            { href: '/solutions/training', label: 'Overview', active: pathname === '/solutions/training' },
            { href: '/solutions/training/programs', label: 'Programs', active: pathname === '/solutions/training/programs' },
            { href: '/solutions/training/sessions', label: 'Sessions', active: pathname === '/solutions/training/sessions' },
            { href: '/solutions/training/cohort', label: 'Cohort', active: pathname.startsWith('/solutions/training/cohort') }
          ]
        },
        {
          href: '/solutions/content',
          label: 'Content',
          active: pathname.startsWith('/solutions/content'),
          icon: FileText,
          submenus: [
            { href: '/solutions/content', label: 'Orders', active: pathname === '/solutions/content' },
            { href: '/solutions/content/deliverables', label: 'Deliverables', active: pathname.startsWith('/solutions/content/deliverables') },
            { href: '/solutions/content/production', label: 'Production', active: pathname.startsWith('/solutions/content/production') },
            { href: '/solutions/content/queue', label: 'Queue', active: pathname === '/solutions/content/queue' }
          ]
        },
        {
          href: '/solutions/payments',
          label: 'Payments',
          active: pathname.startsWith('/solutions/payments') || pathname.startsWith('/solutions/earnings'),
          icon: Wallet,
          submenus: [
            { href: '/solutions/payments', label: 'Payments', active: pathname === '/solutions/payments' },
            { href: '/solutions/earnings', label: 'Earnings', active: pathname === '/solutions/earnings' }
          ]
        },
        {
          href: '/solutions/discovery',
          label: 'Discovery',
          active: pathname.startsWith('/solutions/discovery') || pathname.startsWith('/solutions/publications'),
          icon: Compass,
          submenus: [
            { href: '/solutions/discovery', label: 'Visits', active: pathname === '/solutions/discovery' },
            { href: '/solutions/publications', label: 'Publications', active: pathname.startsWith('/solutions/publications') }
          ]
        },
        {
          href: '/solutions/products',
          label: 'Products',
          active: pathname.startsWith('/solutions/products'),
          icon: Package,
          submenus: []
        },
        {
          href: '/solutions/software',
          label: 'Software',
          active: pathname.startsWith('/solutions/software'),
          icon: Cpu,
          submenus: [
            { href: '/solutions/software', label: 'Overview', active: pathname === '/solutions/software' },
            { href: '/solutions/software/builders', label: 'Builders', active: pathname.startsWith('/solutions/software/builders') },
            { href: '/solutions/software/phases', label: 'Phases', active: pathname.startsWith('/solutions/software/phases') }
          ]
        },
        {
          href: '/solutions/matlab',
          label: 'MATLAB',
          active: pathname.startsWith('/solutions/matlab'),
          icon: Cpu,
          submenus: []
        },
        {
          href: '/solutions/paradigm-shift',
          label: 'Paradigm Shift',
          active: pathname.startsWith('/solutions/paradigm-shift'),
          icon: Lightbulb,
          submenus: []
        },
        {
          href: '/solutions/ai-solution-compliance',
          label: 'AI-Solution Compliance',
          active: pathname.startsWith('/solutions/ai-solution-compliance'),
          icon: ShieldCheck,
          submenus: []
        },
        {
          href: '/solutions/paradigm-shift',
          label: 'Departments',
          active: pathname.startsWith('/solutions/paradigm-shift'),
          icon: Building2,
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'Value Added Courses',
      menus: [
        {
          href: '/vac',
          label: 'Course Catalog',
          active: pathname === '/vac',
          icon: BookOpen,
          submenus: []
        },
        {
          href: '/vac/my-courses',
          label: 'My Courses',
          active: pathname.startsWith('/vac/my-courses'),
          icon: GraduationCap,
          submenus: []
        },
        {
          href: '/vac/case',
          label: 'CASE Tracker',
          active: pathname.startsWith('/vac/case') && !pathname.includes('/admin'),
          icon: Award,
          submenus: []
        },
        {
          href: '/vac/admin',
          label: 'VAC Admin',
          active: pathname.startsWith('/vac/admin'),
          icon: Settings,
          submenus: [
            {
              href: '/vac/admin/courses',
              label: 'Courses',
              active: pathname.startsWith('/vac/admin/courses')
            },
            {
              href: '/vac/admin/enrollments',
              label: 'Enrollments',
              active: pathname.startsWith('/vac/admin/enrollments')
            },
            {
              href: '/vac/admin/analytics',
              label: 'Analytics',
              active: pathname.startsWith('/vac/admin/analytics')
            },
            {
              href: '/vac/admin/case',
              label: 'CASE Admin',
              active: pathname.startsWith('/vac/admin/case')
            },
            {
              href: '/vac/admin/settings',
              label: 'Settings',
              active: pathname.startsWith('/vac/admin/settings')
            }
          ]
        }
      ]
    },
    {
      groupLabel: 'Work Pulse',
      menus: [
        {
          href: '/work-pulse',
          label: 'My Pulse',
          active: pathname === '/work-pulse',
          icon: Activity,
          submenus: []
        },
        {
          href: '/work-pulse/agents',
          label: 'Agent Board',
          active: pathname.startsWith('/work-pulse/agents'),
          icon: Brain,
          submenus: []
        },
        {
          href: '/work-pulse/all',
          label: 'All Submissions',
          active: pathname.startsWith('/work-pulse/all'),
          icon: ClipboardList,
          submenus: []
        },
        {
          href: '/work-pulse/impact',
          label: 'Impact',
          active: pathname.startsWith('/work-pulse/impact'),
          icon: TrendingUp,
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'Learners Council',
      menus: [
        {
          href: '/learners-council',
          label: 'Dashboard',
          active: pathname === '/learners-council',
          icon: Award,
          submenus: []
        },
        {
          href: '/learners-council/structure',
          label: 'Structure',
          active: pathname.startsWith('/learners-council/structure'),
          icon: Users,
          submenus: [
            {
              href: '/learners-council/structure/members',
              label: 'Members',
              active: pathname.startsWith('/learners-council/structure/members'),
            },
            {
              href: '/learners-council/structure/positions',
              label: 'Positions',
              active: pathname.startsWith('/learners-council/structure/positions'),
            },
            {
              href: '/learners-council/structure/committees',
              label: 'Portfolio Committees',
              active: pathname.startsWith('/learners-council/structure/committees'),
            },
            {
              href: '/learners-council/structure/terms',
              label: 'Terms',
              active: pathname.startsWith('/learners-council/structure/terms'),
            },
            {
              href: '/learners-council/structure/yuva',
              label: 'YUVA Chapters',
              active: pathname.startsWith('/learners-council/structure/yuva'),
            },
            {
              href: '/learners-council/structure/verticals',
              label: 'Verticals',
              active: pathname.startsWith('/learners-council/structure/verticals'),
            }
          ]
        },
        {
          href: '/learners-council/communication',
          label: 'Communication',
          active: pathname.startsWith('/learners-council/communication'),
          icon: MessagesSquare,
          submenus: []
        },
        {
          href: '/learners-council/events',
          label: 'Events',
          active: pathname.startsWith('/learners-council/events'),
          icon: CalendarDays,
          submenus: []
        },
        {
          href: '/learners-council/od',
          label: 'OD Requests',
          active: pathname.startsWith('/learners-council/od'),
          icon: Briefcase,
          submenus: []
        },
        {
          href: '/learners-council/selection',
          label: 'Selection',
          active: pathname.startsWith('/learners-council/selection'),
          icon: Vote,
          submenus: []
        },
        {
          href: '/learners-council/issues',
          label: 'Issues',
          active: pathname.startsWith('/learners-council/issues'),
          icon: Bug,
          submenus: []
        },
        {
          href: '/learners-council/settings',
          label: 'Settings',
          active: pathname.startsWith('/learners-council/settings'),
          icon: Settings,
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'Faculty Innovation',
      menus: [
        {
          href: '/faculty/innovation',
          label: 'Faculty Innovation',
          active: pathname.startsWith('/faculty/innovation'),
          icon: Lightbulb,
          submenus: [
            {
              href: '/faculty/innovation/submit',
              label: 'Submit Initiative',
              active: pathname === '/faculty/innovation/submit'
            },
            {
              href: '/faculty/innovation/portfolio',
              label: 'My Portfolio',
              active: pathname === '/faculty/innovation/portfolio'
            },
            {
              href: '/faculty/innovation/approval-queue',
              label: 'Approval Queue',
              active: pathname === '/faculty/innovation/approval-queue'
            },
            {
              href: '/faculty/innovation/collab-request',
              label: 'Request Collab',
              active: pathname === '/faculty/innovation/collab-request'
            }
          ]
        }
      ]
    },
    {
      // Compliance Unification Program — Accreditation group
      groupLabel: 'Accreditation',
      menus: [
        {
          href: '/accreditation',
          label: 'Hub (10 Bodies)',
          active: pathname === '/accreditation',
          icon: Award,
          submenus: []
        },
        {
          href: '/accreditation/coverage',
          label: 'Coverage Matrix',
          active: pathname.startsWith('/accreditation/coverage'),
          icon: BarChart3,
          submenus: []
        },
        {
          href: '/accreditation/naac',
          label: 'NAAC (IQAC)',
          active: pathname.startsWith('/accreditation/naac'),
          icon: ShieldCheck,
          submenus: [
            {
              href: '/accreditation/naac/committees',
              label: 'IQAC Committees',
              active: pathname.startsWith('/accreditation/naac/committees'),
            },
            {
              href: '/accreditation/naac/dcf-export',
              label: 'DCF / AQAR Export',
              active: pathname.startsWith('/accreditation/naac/dcf-export'),
            },
            {
              href: '/accreditation/naac/surveys/consent',
              label: 'Survey Consent (DPDPA)',
              active: pathname.startsWith('/accreditation/naac/surveys/consent'),
            },
            {
              href: '/accreditation/naac/surveys/8.4-export',
              label: '8.4 Survey Export',
              active: pathname.startsWith('/accreditation/naac/surveys/8.4-export'),
            }
          ]
        },
        {
          href: '/accreditation/nirf',
          label: 'NIRF Ranking',
          active: pathname.startsWith('/accreditation/nirf'),
          icon: TrendingUp,
          submenus: []
        },
        {
          href: '/accreditation/nba',
          label: 'NBA (Engineering)',
          active: pathname.startsWith('/accreditation/nba'),
          icon: Briefcase,
          submenus: []
        },
        {
          href: '/accreditation/qs',
          label: 'QS World Ranking (Phase 2+)',
          active: pathname.startsWith('/accreditation/qs'),
          icon: Globe,
          submenus: []
        },
        {
          href: '/accreditation/dci',
          label: 'DCI (Dental)',
          active: pathname.startsWith('/accreditation/dci'),
          icon: Stethoscope,
          submenus: []
        },
        {
          href: '/accreditation/pci',
          label: 'PCI (Pharmacy)',
          active: pathname.startsWith('/accreditation/pci'),
          icon: ClipboardPlus,
          submenus: []
        },
        {
          href: '/accreditation/inc',
          label: 'INC (Nursing)',
          active: pathname.startsWith('/accreditation/inc'),
          icon: HeartPulse,
          submenus: []
        },
        {
          href: '/accreditation/ncte',
          label: 'NCTE (Teacher Ed)',
          active: pathname.startsWith('/accreditation/ncte'),
          icon: GraduationCap,
          submenus: []
        },
        {
          href: '/accreditation/aicte',
          label: 'AICTE (Technical)',
          active: pathname.startsWith('/accreditation/aicte'),
          icon: Rocket,
          submenus: []
        },
        {
          href: '/accreditation/ugc',
          label: 'UGC (Overall)',
          active: pathname.startsWith('/accreditation/ugc'),
          icon: Scale,
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

// Normalize a route href by replacing UUID segments with [id]
// Required because GetPages builds submenus with real event UUIDs (activeId),
// but MENU_PERMISSIONS uses static [id] placeholders as keys.
// Without this, MENU_PERMISSIONS['/startup-studio/events/572a5836-.../my-team'] = undefined
// → whole Startup Studio group is filtered out for students navigating inside an event.
const UUID_SEGMENT_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
function normalizeRoute(href: string): string {
  return href.replace(UUID_SEGMENT_REGEX, '[id]');
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
              const requiredPermission = MENU_PERMISSIONS[normalizeRoute(submenu.href)];
              return (
                requiredPermission &&
                userRole.permissions[requiredPermission] === true
              );
            });
          }

          // Check if user has permission for this menu
          const requiredPermission = MENU_PERMISSIONS[normalizeRoute(menu.href)];

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

            // Evaluator roles are staff-assigned (not permission-assigned) — bypass RBAC and show only the evaluate submenu
            const isEvaluatorRole = ['judge', 'panel_chair', 'evaluator'].includes(userRole.role_key || '');
            if (isEvaluatorRole && submenu.href.includes('/startup-studio/events/')) {
              return submenu.href.includes('/evaluate') || submenu.href.includes('/vote');
            }

            // Faculty / HOD / Principal: restricted startup-studio submenu access
            // - All three: Venues & Mentors + My Assignment + Registrations (view only) + Live Voting + Evaluate
            // - Faculty only: additionally Checklists (can mark items, not add/delete)
            const isLimitedStaffRole = ['faculty', 'hod', 'principal'].includes(userRole.role_key || '');
            if (isLimitedStaffRole && submenu.href.includes('/startup-studio/events/')) {
              if (submenu.href.includes('/venues')) return true;
              if (submenu.href.includes('/my-assignment')) return true;
              if (submenu.href.includes('/registrations')) return true;
              if (submenu.href.includes('/vote')) return true;
              if (submenu.href.includes('/evaluate')) return true;
              if (submenu.href.includes('/leaderboard')) return true;
              if (userRole.role_key === 'faculty' && submenu.href.includes('/checklists')) return true;
              return false;
            }

            const requiredPermission = MENU_PERMISSIONS[normalizeRoute(submenu.href)];
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


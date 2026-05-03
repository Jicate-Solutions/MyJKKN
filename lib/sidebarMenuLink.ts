'use client';

import {
  Home,
  Heart,
  Users,
  Box,
  FileText,
  School,
  MessageSquare,
  Settings,
  BarChart,
  Database,
  Key,
  Globe,
  Bell,
  HelpCircle,
  LogOut,
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
  CalendarCog,
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
  Workflow,
  MessagesSquare,
  Radio,
  Rocket,
  Vote,
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

/**
 * Recursive submenu type — can nest arbitrarily deep.
 * Optional `icon` and `submenus` fields make existing flat submenus continue to work
 * while also enabling multi-tier nesting (e.g. Learners Council → Structure → Positions).
 */
export interface Submenu {
  href: string;
  label: string;
  active: boolean;
  icon?: LucideIcon;
  submenus?: Submenu[];
}

export interface MenuItem {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  submenus: Submenu[];
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

  // My Meetings (jicate-booking host inbox + management pages)
  // Pages do NO role gating — RLS at row level filters by host_user_id.
  // Use view_profile (universal authenticated key) so any logged-in user
  // sees the chips; users with zero mirror rows hit the empty state.
  // Replaces the temporary NAV_EXCLUDE bypass added in PR #654.
  '/meetings/inbox': 'view_profile',
  '/meetings/manage': 'view_profile',
  '/meetings/availability': 'view_profile',

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

  // Learner Counseling (Phase 1 — placeholder gate; module pages land in Phase 2)
  // Spec: specs/counselor-taxonomy-spec.md. Role seed:
  // supabase/migrations/20260427_counselor_taxonomy_phase1.sql
  '/learners/counseling': 'learners.counseling.view',

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

  // HR Management (Sprints 1-6) — keys match permissions.ts HR block and hr_* RLS policies
  '/hr': 'hr.dashboard.view',
  '/hr/employees': 'hr.employees.view',
  '/hr/employees/new': 'hr.employees.create',
  '/hr/employees/[id]': 'hr.employees.view',
  '/hr/employees/[id]/edit': 'hr.employees.edit',
  '/hr/policies': 'hr.policies.view',
  '/hr/policies/[table]': 'hr.policies.view',
  // HR Leave — parent + 6 submenus shown in sidebar
  '/hr/leave': 'hr.leave.view',
  '/hr/leave/apply': 'hr.leave.apply',
  '/hr/leave/my-applications': 'hr.leave.view',
  '/hr/leave/approve': 'hr.leave.approve',
  '/hr/leave/calendar': 'hr.leave.view',
  '/hr/leave/balance': 'hr.leave.balance.view',
  '/hr/leave/encashment': 'hr.leave.encashment.view',
  '/hr/leave/[id]': 'hr.leave.view',
  // HR Recruitment — parent + 3 submenus
  '/hr/recruitment': 'hr.recruitment.view',
  '/hr/recruitment/submit': 'hr.recruitment.create',
  '/hr/recruitment/my': 'hr.recruitment.view',
  '/hr/recruitment/candidates': 'hr.recruitment.view',
  '/hr/recruitment/approvals': 'hr.recruitment.approve',

  // Staff Counseling (Phase 1 — placeholder gate; module pages land in Phase 2)
  // Spec: specs/counselor-taxonomy-spec.md. Role seed:
  // supabase/migrations/20260427_counselor_taxonomy_phase1.sql
  '/hr/counseling': 'hr.counseling.view',

  // Academic Management
  // Added 2026-04-24 (Wave 2b PR-S2): module root for the flat sidebar row.
  // Broadest academic-facing permission chosen so faculty/HOD/principal who
  // have sub-permissions continue seeing the Academic sidebar row even
  // though the row now points at /academic instead of /academic/years.
  '/academic': 'academic.years.view',
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

  // Internal Marks (CIA) - Mark Entry & Reports
  '/academic/internal-marks': 'academic.internal-marks.view',
  '/academic/internal-marks/report': 'academic.internal-marks.view',

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
  // Recipients = super_admin only — heavy policy (who gets which digest)
  '/admin/notifications/recipients': 'super_admin',
  '/admin/whatsapp-limits': 'admin.whatsapp_limits.view',
  // Retention = super_admin only — heavy/rare (data archival policy)
  '/admin/retention-policies': 'super_admin',
  // Counselor routing/thresholds = visible to admission cell (operational, frequent tweaks).
  // Reuses key from PR #540, granted to admission + admin + super_admin.
  // Write RLS still super_admin only per Director's directive; admission/admin can view but cannot save.
  '/admin/counselors/routing-config': 'admission.counselors.team.view',
  '/admin/counselors/alert-thresholds': 'admission.counselors.team.view',
  // ExoPhone → institution mapping (M-1, 2026-05-03 — brand-integrity recovery).
  // super_admin only — directly drives per-institution call attribution.
  '/admin/exophone-mapping': 'super_admin',

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
  // 3-tier categories. RLS uses 4 keys (billing.categories.{view,create,edit,delete})
  // for all 3 tables, so all 9 paths below check the same 4 keys.
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
  '/billing/payment': 'billing.payment.view',


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
  // Added 2026-04-24 (Wave 2b PR-S2): module root for the flat sidebar row.
  '/admission': 'admission.dashboard.view',
  '/admission/dashboard': 'admission.dashboard.view',
  '/admission/analytics': 'admission.analytics.view',
  '/admission/group-dashboard': 'admission.group_dashboard.view',
  '/admission/insights': 'admission.insights.view',
  '/admission/insights/status': 'admission.insights.view',
  '/admission/marketing': 'admission.marketing.view',
  '/admission/data-quality': 'admission.data_quality.view',

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
  // Team management (Phase 5) — 5 in-page tabs under one sidebar entry
  '/admission/counselors/team': 'admission.counselors.view',
  '/admission/counselors/team/roster': 'admission.counselors.view',
  '/admission/counselors/team/allocation': 'admission.counselors.view',
  '/admission/counselors/team/rules': 'admission.counselors.view',
  '/admission/counselors/team/activity': 'admission.counselors.view',

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
  // Added 2026-04-23 — admission_years module was created 2026-04-21 but its
  // route→permission mapping and sidebar entry were never wired. Super admins
  // bypass permission checks but still need the link rendered here to navigate.
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
  // Added 2026-04-24 (Wave 2b PR-S2): module root for the flat sidebar row.
  '/startup-studio': 'startup_studio.analytics.view',
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
  '/learners-council/structure/positions': 'learners_council.structure.view',
  '/learners-council/structure/terms': 'learners_council.structure.view',
  '/learners-council/yuva': 'learners_council.structure.view',
  '/learners-council/structure/verticals': 'learners_council.structure.view',
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
  '/campus-living/residents': 'campus_living.residents.view',
  '/campus-living/my-hostel': 'campus_living.vacate_requests.view_own',
  '/campus-living/my-hostel/vacate-request': 'campus_living.vacate_requests.submit',
  '/campus-living/vacate-requests': 'campus_living.vacate_requests.view',
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
  '/campus-living/settings/approval-chains': 'campus_living.approval_chains.view',

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

  // Events — Propose (Stream C, 2026-04-26)
  '/events/propose': 'events.proposals.view',

  // Audit Workflow Sprint 01
  '/audit': 'audit.cycle.view',
  '/audit/dashboard': 'audit.cycle.view',
  '/audit/cycles': 'audit.cycle.view',
  '/audit/cycles/new': 'audit.cycle.manage',
  '/audit/cycles/[id]': 'audit.cycle.view',
  '/audit/cycles/[id]/findings': 'audit.finding.view',
  '/audit/cycles/[id]/parameters': 'audit.parameter.view',
  '/audit/cycles/[id]/attestations': 'audit.attestation.view',
  '/audit/findings': 'audit.finding.view',
  '/audit/findings/[id]': 'audit.finding.view',
  '/audit/my-findings': 'audit.finding.rectify',
  '/audit/parameters': 'audit.parameter.view',
  '/audit/parameters/[code]': 'audit.parameter.view',
  '/audit/parameters/settings': 'audit.parameter.manage',
  '/audit/finding-types/settings': 'audit.finding_type.manage',

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

  // Billing — Payment chip (originally patched by PR #511, included here so
  // this PR's gate exits 0 regardless of merge order between the two PRs.
  // Trivial conflict-resolve if both land: identical entry on either side.)
  '/billing/payment': 'billing.payment.view',

  // Tier-2 chip-leak sweep (2026-04-27, PR follow-up to #511).
  // The audit `comm -23 <find-pages> <sidebar-keys>` surfaced 23 routes that
  // had a page.tsx but no MENU_PERMISSIONS entry — AutoTabNav defaults to
  // "show" when a route has no entry (see auto-tab-nav.tsx:131), so these
  // chips leaked to every role inside their parent module's tab strip.
  // Routes considered always-visible (dashboard / notifications) are NOT
  // mapped here — they go in the AutoTabNav allow-list and the new
  // tier-2-coverage gate's allow-list. Keys without a catalog entry yet are
  // added in the same PR to lib/constants/permissions.ts.

  // Academic — Course Grades (Faculty LTI grade view, see comment in page.tsx)
  '/academic/course-grades': 'academic.course-grades.view',

  // Academic — Leave/OnDuty parent landing (redirects to /approvals)
  '/academic/leave-onduty': 'academic.leave_onduty.approve',

  // Administration
  '/admin/reset-driver-passwords': 'admin.reset_driver_passwords.manage',
  '/admin/saml': 'admin.saml.manage',

  // Audit Workflow — External Auditor admin UI (page.tsx says
  // "Permission: super_admin or audit.external_auditor.manage")
  '/audit/external-auditors': 'audit.external_auditor.manage',

  // Board of Studies — five tier-2 sub-pages under /bos
  '/bos/compositions': 'bos.compositions.view',
  '/bos/experts': 'bos.experts.view',
  '/bos/meetings': 'bos.meetings.view',
  '/bos/reports': 'bos.reports.view',
  '/bos/ta-da': 'bos.ta_da.view',

  // OKR — admin landing (redirects to /okr/admin/compliance which is gated
  // by okr.admin.view; reuse the same key on the parent)
  '/okr/admin': 'okr.admin.view',

  // Solutions Hub
  '/solutions/new': 'solutions.dashboard.view',
  '/solutions/settings': 'solutions.settings.view',

  // Startup Studio — five tier-2 sub-pages
  '/startup-studio/analytics': 'startup_studio.analytics.view',
  '/startup-studio/cycles': 'startup_studio.cycles.view',
  '/startup-studio/nif': 'startup_studio.nif.view',
  '/startup-studio/problem-bank': 'startup_studio.problem_bank.view',
  '/startup-studio/submissions': 'startup_studio.submissions.view',

  // User Management — new user form (creator-only)
  '/users/new': 'users.create',

  // Menu-coverage baseline cleanup (2026-04-27, follow-up to PR #511 / #515).
  // The check:menu-coverage gate flagged 30 sidebar hrefs with no
  // MENU_PERMISSIONS entry — without these mappings, every non-super-admin
  // role saw an empty link list under Administration, Health & Wellness,
  // Events (marathon submenu), Faculty (PDE submenu), Admin (PDE submenu),
  // and Board of Studies. Each entry below maps to either an existing
  // catalogued key or to a key newly added in lib/constants/permissions.ts
  // in this same PR (Events + Health categories, plus pde.admin.* /
  // pde.faculty.* sub-keys under existing PDE category).

  // Academic — student-facing "My Privileges" landing (mirrors /learners/privileges/my)
  '/academic/privileges/my': 'learners.privileges.view',

  // Administration parent landing
  '/admin': 'admin.view',

  // Administration — LTI Dashboard (admin surface for LTI tools, distinct from
  // sub-pages /admin/lti/{analytics,grade-sync,launches} which already have entries)
  '/admin/lti': 'lti.monitor',

  // Administration — PDE admin tree (Super Admin / IQAC / Lifecycle leads)
  '/admin/pde': 'pde.admin.view',
  '/admin/pde/assessments': 'pde.admin.assessments.view',
  '/admin/pde/at-risk': 'pde.admin.at_risk.view',
  '/admin/pde/capabilities': 'pde.admin.capabilities.view',
  '/admin/pde/engagement': 'pde.admin.engagement.view',
  '/admin/pde/lti': 'pde.admin.lti.view',
  '/admin/pde/quests': 'pde.admin.quests.view',

  // Board of Studies — parent landing (children /bos/{compositions,experts,...} above)
  '/bos': 'bos.view',

  // Events — Marathon submenu (companion to existing /events/propose entry)
  '/events/marathon': 'events.marathon.view',
  '/events/marathon/new': 'events.marathon.create',

  // Faculty — PDE faculty tree (Faculty / HOD / Mentor surface)
  '/faculty/pde': 'pde.faculty.view',
  '/faculty/pde/analytics': 'pde.faculty.analytics.view',
  '/faculty/pde/assessments': 'pde.faculty.assessments.view',
  '/faculty/pde/dashboard': 'pde.faculty.dashboard.view',
  '/faculty/pde/demonstrations': 'pde.faculty.demonstrations.view',
  '/faculty/pde/quests': 'pde.faculty.quests.view',

  // Health & Wellness — 9 tier-2 surfaces (parent /health is a PARENT in the
  // sidebar so it's auto-shown when any child is grantable)
  '/health/dashboard': 'health.dashboard.view',
  '/health/profile': 'health.profile.view',
  '/health/leaderboard': 'health.leaderboard.view',
  '/health/sports': 'health.sports.view',
  '/health/fitness': 'health.fitness.view',
  '/health/training': 'health.training.view',
  '/health/achievements': 'health.achievements.view',
  '/health/assessments': 'health.assessments.view',
  '/health/counselor': 'health.counselor.view',

  // IMS (Inventory Management System) — Module-level taxonomy mirrors
  // Admission CRM precedent; gateway permission `ims.view` protects the
  // parent /ims tree, child routes use specific keys so a sales cashier
  // (ims.sales.*) can't accidentally reach stock adjustments
  // (ims.stock.adjust). Permission catalog: lib/constants/permissions.ts.
  '/ims': 'ims.view',
  '/ims/dashboard': 'ims.dashboard.view',
  '/ims/financial': 'ims.financial.view',
  // Indents
  '/ims/indents': 'ims.indents.view',
  '/ims/indents/new': 'ims.indents.create',
  '/ims/indents/pending': 'ims.indents.approve',
  '/ims/indents/[id]': 'ims.indents.view',
  // Inventory
  '/ims/inventory': 'ims.inventory.view',
  '/ims/inventory/items': 'ims.inventory.view',
  '/ims/inventory/categories': 'ims.inventory.categories.manage',
  // Reports — single .view key gates all sub-reports (consumption/sales/stock/indents/upi)
  '/ims/reports': 'ims.reports.view',
  '/ims/reports/consumption': 'ims.reports.view',
  '/ims/reports/indents': 'ims.reports.view',
  '/ims/reports/sales': 'ims.reports.view',
  '/ims/reports/stock': 'ims.reports.view',
  '/ims/reports/upi': 'ims.reports.view',
  // Sales (POS, history, receipt)
  '/ims/sales': 'ims.sales.view',
  '/ims/sales/history': 'ims.sales.view',
  '/ims/sales/[id]': 'ims.sales.view',
  '/ims/sales/[id]/receipt': 'ims.sales.view',
  // Settings (master data — each sub-page maps to its specific manage key)
  '/ims/settings': 'ims.settings.view',
  '/ims/settings/stores': 'ims.settings.stores.manage',
  '/ims/settings/suppliers': 'ims.settings.suppliers.manage',
  '/ims/settings/units': 'ims.settings.units.manage',
  '/ims/settings/unit-conversions': 'ims.settings.units.manage',
  // Stock (visibility + adjustments + GRN lifecycle)
  '/ims/stock': 'ims.stock.view',
  '/ims/stock/adjustments': 'ims.stock.adjust',
  '/ims/stock/batches': 'ims.stock.view',
  '/ims/stock/department': 'ims.stock.view',
  '/ims/stock/grn': 'ims.stock.grn.view',
  '/ims/stock/grn/new': 'ims.stock.grn.create',
  '/ims/stock/grn/[id]': 'ims.stock.grn.view',
  // Transfers (supply shipments)
  '/ims/transfers': 'ims.transfers.view',
  '/ims/transfers/[id]': 'ims.transfers.view',

  // Learners — Leave/OnDuty parent landing (children /learners/leave-onduty/{apply,my-applications} above)
  '/learners/leave-onduty': 'learners.leave_onduty.view',

  // Service Requests — All Services chip (admin/staff cross-institution view)
  '/service-requests/all-services': 'service_requests.view_all',
};

/**
 * GetPages — sidebar tree builder.
 *
 * **Wave 2b PR-S2 (2026-04-24):** Structural rewrite per
 * `specs/mobile-sidebar-bottomnav-spec.md` (D2):
 *   - One module row per top-level URL prefix under each section header.
 *   - Sub-entries that used to render inline are now PRESERVED AS DATA on
 *     the module row's `submenus[]` field — the renderer in
 *     `components/Navbar/menu.tsx` no longer renders them inline. PR-S3
 *     will consume these sub-entries as the flyout panel source.
 *   - Each module row's `href` points at its module root (`/<slug>`) per
 *     D3. Sub-entries keep their exact original href/label/active logic
 *     so the flyout can drop straight in without re-deriving them.
 *   - `GetRoleBasedPages` permission filter is UNCHANGED: a module row is
 *     visible if the user has permission on the parent href OR on ANY of
 *     its submenus (existing logic at line ~2197). This preserves current
 *     per-role sidebar visibility exactly — no regressions.
 *
 * Dead entries removed:
 *   - `/documents` section — no `app/(routes)/documents` page exists on
 *     prod; flagged during PR #409 sweep.
 */
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
        },
        {
          // jicate-booking host pages — replaces temporary NAV_EXCLUDE bypass
          // from PR #654. Permission: view_profile (universal authenticated
          // key). Page-level access is RLS-gated by host_user_id, so any
          // logged-in user can see the chips; users with no mirror rows hit
          // the empty state. Source-of-truth for bookings remains Cal.com /
          // jicate-booking; these are embed-backed pages.
          href: '/meetings/inbox',
          label: 'My Meetings',
          active: pathname === '/meetings/inbox' || pathname.startsWith('/meetings/'),
          icon: CalendarClock,
          submenus: [
            {
              href: '/meetings/inbox',
              label: 'Inbox',
              active: pathname === '/meetings/inbox',
            },
            {
              href: '/meetings/manage',
              label: 'Manage Event Types',
              active: pathname === '/meetings/manage',
              icon: CalendarCog,
            },
            {
              href: '/meetings/availability',
              label: 'My Availability',
              active: pathname === '/meetings/availability',
              icon: Clock,
            },
          ]
        }
      ]
    },
    {
      groupLabel: 'User Management',
      menus: [
        {
          // Single module row — all user-management sub-entries (Analytics
          // Dashboard, Roles, Role Management, Activity, Permissions Audit)
          // collapse into `submenus[]` as DATA for the PR-S3 flyout.
          href: '/users',
          label: 'Users',
          active: pathname === '/users' || pathname.startsWith('/users/'),
          icon: Users,
          submenus: [
            { href: '/users/dashboard', label: 'Analytics Dashboard', active: pathname === '/users/dashboard' },
            { href: '/users', label: 'All Users', active: pathname === '/users' },
            { href: '/users/roles', label: 'Roles Assignment', active: pathname === '/users/roles' },
            { href: '/users/role-management', label: 'Role Management', active: pathname === '/users/role-management' },
            { href: '/users/activity', label: 'Activity Audit Logs', active: pathname === '/users/activity' },
            { href: '/users/permissions-audit', label: 'Permissions Audit', active: pathname === '/users/permissions-audit' },
          ]
        }
      ]
    },
    {
      // Wave 2 merged 'Application Management' into 'Applications'.
      groupLabel: 'Applications',
      menus: [
        {
          href: '/application-hub',
          label: 'Application Hub',
          active: pathname === '/application-hub' || pathname.startsWith('/application-hub/'),
          icon: LayoutGrid,
          submenus: [
            { href: '/application-hub', label: 'Application Hub', active: pathname === '/application-hub' },
            { href: '/application-hub/api-guidelines', label: 'API Guidelines', active: pathname === '/application-hub/api-guidelines' },
          ]
        },
        {
          href: '/applications',
          label: 'Applications',
          active: pathname === '/applications' || pathname.startsWith('/applications/'),
          icon: TabletSmartphone,
          submenus: [
            { href: '/applications', label: 'All Applications', active: pathname === '/applications' },
            { href: '/applications/new', label: 'Add New Application', active: pathname === '/applications/new' },
            { href: '/applications/categories', label: 'Categories & Subcategories', active: pathname === '/applications/categories' },
          ]
        }
      ]
    },
    {
      groupLabel: 'Organization',
      menus: [
        {
          href: '/organizations',
          label: 'Organizations',
          active: pathname === '/organizations' || pathname.startsWith('/organizations/'),
          icon: Building,
          submenus: [
            { href: '/organizations/dashboard', label: 'Dashboard', active: pathname.startsWith('/organizations/dashboard') },
            { href: '/organizations/institutions', label: 'Institutions', active: pathname.startsWith('/organizations/institutions') },
            { href: '/organizations/degrees', label: 'Degrees', active: pathname.startsWith('/organizations/degrees') },
            { href: '/organizations/departments', label: 'Departments', active: pathname.startsWith('/organizations/departments') },
            { href: '/organizations/programs', label: 'Programs', active: pathname.startsWith('/organizations/programs') },
            { href: '/organizations/semesters', label: 'Semesters', active: pathname.startsWith('/organizations/semesters') },
            { href: '/organizations/sections', label: 'Sections', active: pathname.startsWith('/organizations/sections') },
            { href: '/organizations/courses', label: 'Courses', active: pathname.startsWith('/organizations/courses') },
            { href: '/organizations/courses/mappings', label: 'Course Mappings', active: pathname === '/organizations/courses/mappings' },
          ]
        }
      ]
    },
    {
      groupLabel: 'Academic',
      menus: [
        // Single sidebar entry — all Academic navigation lives in the
        // module's in-page tab bar (AcademicNav, see app/(routes)/academic/
        // _components/academic-nav.tsx). Mirrors Campus Living + Learners
        // Council + Admission CRM. Per-section SectionSubNavs for Leaves,
        // Leave/OnDuty, Privileges, Timetables, Attendance.
        //
        // Why: flat sidebar (1 entry per module) + in-page tabs scales
        // across JKKN's 8+ high-traffic modules. URLs UNCHANGED — preserves
        // faculty daily workflow bookmarks.
        {
          // D3: click → module root. `/academic` resolves to the in-page
          // AcademicNav (nav-config.ts) which handles all drill-down.
          href: '/academic',
          label: 'Academic',
          active: pathname === '/academic' || pathname.startsWith('/academic/'),
          icon: GraduationCap,
          submenus: []
        },
        {
          // Board of Studies — institutional governance + expert management.
          // Navigation lives in the module's in-page tab bar (BOS_NAV_TABS,
          // see app/(routes)/bos/layout.tsx) and nav-config.ts.
          href: '/bos',
          label: 'Board of Studies',
          active: pathname === '/bos' || pathname.startsWith('/bos/'),
          icon: ClipboardList,
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'Campus Living',
      menus: [
        // Single sidebar entry — all Campus Living navigation lives in the
        // module's in-page tab bar (CLNav, see app/(routes)/campus-living/
        // _components/cl-nav.tsx). This mirrors the Learners Council pattern
        // where the sidebar shows only "Learners Council" as one entry.
        //
        // Why: deep sidebar nesting doesn't scale across 8+ modules. The
        // in-page tab pattern keeps the sidebar flat (1 entry per module)
        // and puts workflow-specific navigation adjacent to the content.
        {
          href: '/campus-living',
          label: 'Campus Living',
          active: pathname === '/campus-living' || pathname.startsWith('/campus-living/'),
          icon: Hotel,
          submenus: []
        }

        // ↓ Previous nested structure removed. All routes remain reachable
        // via the CLNav tab bar (Overview, Dashboard, Residents, Attendance,
        // Services, Facility, Community, Insights, Settings) and per-section
        // SectionSubNav components. URLs are UNCHANGED — no bookmarks break.
      ]
    },
    {
      groupLabel: 'Admission CRM',
      menus: [
        // Single sidebar entry — all Admission navigation lives in the module's
        // in-page tab bar (AdmissionNav, see app/(routes)/admission/
        // _components/admission-nav.tsx). Mirrors Campus Living + Learners
        // Council. Section sub-tabs (Marketing, Counselors, Consultants,
        // Data Quality, Settings) render via per-section SectionSubNav.
        //
        // Why: flat sidebar (1 entry per module) + in-page tabs keeps nav
        // adjacent to content. URLs are UNCHANGED — no bookmarks break.
        {
          // D3: click → module root. `/admission` renders AdmissionNav with
          // section sub-tabs (Marketing, Counselors, Consultants, etc).
          href: '/admission',
          label: 'Admission CRM',
          active: pathname === '/admission' || pathname.startsWith('/admission/'),
          icon: UserCheck,
          submenus: []
        }
      ]
    },

    {
      // Wave 2 merged 'Employee Management' into 'Human Resources'.
      groupLabel: 'Human Resources',
      menus: [
        {
          href: '/staff',
          label: 'Staff',
          active: pathname === '/staff' || pathname.startsWith('/staff/'),
          icon: Users,
          submenus: [
            { href: '/staff/dashboard', label: 'Analytics Dashboard', active: pathname === '/staff/dashboard' },
            { href: '/staff/category', label: 'Employee Category', active: pathname === '/staff/category' },
            { href: '/staff/list', label: 'Employee List', active: pathname === '/staff/list' },
            { href: '/staff/class-incharges', label: 'Class Incharges', active: pathname.startsWith('/staff/class-incharges') },
          ]
        },
        {
          href: '/hr',
          label: 'HR',
          active: pathname === '/hr' || pathname.startsWith('/hr/'),
          icon: Building,
          submenus: [
            { href: '/hr', label: 'HR Command Center', active: pathname === '/hr' },
            { href: '/hr/employees', label: 'Non-Staff Workforce', active: pathname.startsWith('/hr/employees') },
            { href: '/hr/policies', label: 'Policies', active: pathname.startsWith('/hr/policies') },
            { href: '/hr/leave', label: 'Leave', active: pathname.startsWith('/hr/leave') },
            { href: '/hr/leave/apply', label: 'Leave · Apply', active: pathname === '/hr/leave/apply' },
            { href: '/hr/leave/my-applications', label: 'Leave · My Applications', active: pathname === '/hr/leave/my-applications' },
            { href: '/hr/leave/approve', label: 'Leave · Approve Inbox', active: pathname === '/hr/leave/approve' },
            { href: '/hr/leave/calendar', label: 'Leave · Calendar', active: pathname === '/hr/leave/calendar' },
            { href: '/hr/leave/balance', label: 'Leave · Balance', active: pathname === '/hr/leave/balance' },
            { href: '/hr/leave/encashment', label: 'Leave · Encashment', active: pathname === '/hr/leave/encashment' },
            { href: '/hr/recruitment', label: 'Recruitment', active: pathname.startsWith('/hr/recruitment') },
            { href: '/hr/recruitment/submit', label: 'Recruitment · Submit Candidate', active: pathname === '/hr/recruitment/submit' },
            { href: '/hr/recruitment/my', label: 'Recruitment · My Candidates', active: pathname === '/hr/recruitment/my' },
            { href: '/hr/recruitment/approvals', label: 'Recruitment · Approvals', active: pathname === '/hr/recruitment/approvals' },
          ]
        }
      ]
    },
    {
      groupLabel: 'Learners',
      menus: [
        {
          // Single module row — portal pages (my-*, leave-onduty) + admin
          // pages (profiles, alumni, analytics, enquiries, change-requests)
          // all collapse into `submenus[]`. GetRoleBasedPages still gates
          // student-only portal entries (the `/learners/my-` / leave-onduty
          // check at line ~2189 operates on the submenus array intact).
          href: '/learners',
          label: 'Learners',
          active: pathname === '/learners' || pathname.startsWith('/learners/'),
          icon: GraduationCap,
          submenus: [
            // Student portal (role=student — filtered downstream)
            { href: '/learners/my-timetable', label: 'My Timetable', active: pathname === '/learners/my-timetable' },
            { href: '/learners/my-attendance', label: 'My Attendance', active: pathname.startsWith('/learners/my-attendance') },
            { href: '/learners/my-profile', label: 'My Profile', active: pathname === '/learners/my-profile' },
            { href: '/learners/leave-onduty', label: 'Leave/OnDuty · Landing', active: pathname === '/learners/leave-onduty' },
            { href: '/learners/leave-onduty/my-applications', label: 'Leave/OnDuty · My Applications', active: pathname === '/learners/leave-onduty/my-applications' },
            { href: '/learners/leave-onduty/apply', label: 'Leave/OnDuty · Apply', active: pathname === '/learners/leave-onduty/apply' },
            { href: '/academic/privileges/my', label: 'My Privileges', active: pathname.startsWith('/academic/privileges/my') },
            // Admin
            { href: '/learners/analytics', label: 'Analytics Dashboard', active: pathname.startsWith('/learners/analytics') },
            { href: '/learners/enquiries', label: 'Admission · All Admitted', active: pathname === '/learners/enquiries' },
            { href: '/learners/enquiries/new', label: 'Admission · New Admitted', active: pathname === '/learners/enquiries/new' },
            { href: '/learners/profiles', label: 'Learner Profiles', active: pathname.startsWith('/learners/profiles') },
            { href: '/learners/alumni', label: 'Alumni & Graduates', active: pathname.startsWith('/learners/alumni') },
            { href: '/learners/change-requests', label: 'Change Requests', active: pathname.startsWith('/learners/change-requests') },
          ]
        }
      ]
    },
    {
      groupLabel: 'Billing & Accounts',
      menus: [
        {
          href: '/billing',
          label: 'Billing',
          active: pathname === '/billing' || pathname.startsWith('/billing/'),
          icon: Wallet,
          submenus: [
            // Tier 1: Setup — master data and one-time configuration
            {
              href: '/billing/categories',
              label: 'Setup',
              icon: FolderTree,
              active:
                pathname.startsWith('/billing/categories') ||
                pathname.startsWith('/billing/onboarding'),
              submenus: [
                {
                  href: '/billing/categories',
                  label: 'Categories',
                  icon: Tags,
                  active: pathname.startsWith('/billing/categories'),
                },
                { href: '/billing/onboarding', label: 'Learner Onboarding', icon: UserCheck, active: pathname.startsWith('/billing/onboarding') },
              ],
            },

            // Tier 1: Operations — day-to-day billing actions
            {
              href: '/billing/schedule',
              label: 'Operations',
              icon: Activity,
              active:
                pathname.startsWith('/billing/schedule') ||
                pathname.startsWith('/billing/invoices') ||
                pathname.startsWith('/billing/receipts') ||
                pathname.startsWith('/billing/discounts') ||
                pathname.startsWith('/billing/refunds'),
              submenus: [
                {
                  href: '/billing/schedule',
                  label: 'Bill Schedule',
                  icon: CalendarClock,
                  active: pathname.startsWith('/billing/schedule'),
                  submenus: [
                    { href: '/billing/schedule', label: 'All Bills', active: pathname === '/billing/schedule' },
                    { href: '/billing/schedule/students', label: 'Student Search', active: pathname.startsWith('/billing/schedule/students') },
                  ],
                },
                { href: '/billing/invoices', label: 'Invoices', icon: FileText, active: pathname.startsWith('/billing/invoices') },
                { href: '/billing/receipts', label: 'Receipts', icon: FileCheck, active: pathname.startsWith('/billing/receipts') },
                { href: '/billing/discounts', label: 'Scholarships', icon: Award, active: pathname.startsWith('/billing/discounts') },
                { href: '/billing/refunds', label: 'Refunds', icon: RefreshCw, active: pathname.startsWith('/billing/refunds') },
              ],
            },

            // Tier 1: Analytics — reporting and insights
            {
              href: '/billing/reports',
              label: 'Analytics',
              icon: BarChart3,
              active: pathname.startsWith('/billing/reports'),
              submenus: [
                { href: '/billing/reports', label: 'Reports', icon: PieChart, active: pathname.startsWith('/billing/reports') },
              ],
            },
          ],
        },
      ],
    },
    // "Documents" section removed — `/documents` has no page on prod
    // (flagged in PR #409 sweep; no `app/(routes)/documents` folder).
    {
      groupLabel: 'Resources',
      menus: [
        {
          href: '/resource-management',
          label: 'Resources',
          active: pathname === '/resource-management' || pathname.startsWith('/resource-management/'),
          icon: Package,
          submenus: [
            { href: '/resource-management/analytics-dashboard', label: 'Dashboard', active: pathname.startsWith('/resource-management/analytics-dashboard') },
            { href: '/resource-management/categories', label: 'Categories · Parents', active: pathname === '/resource-management/categories' },
            { href: '/resource-management/categories/sub-categories', label: 'Categories · Subs', active: pathname === '/resource-management/categories/sub-categories' },
            { href: '/resource-management/resources', label: 'Resources', active: pathname.startsWith('/resource-management/resources') },
            { href: '/resource-management/reservations', label: 'Reservations · All', active: pathname === '/resource-management/reservations' },
            { href: '/resource-management/reservations/my-reservations', label: 'Reservations · Mine', active: pathname === '/resource-management/reservations/my-reservations' },
            { href: '/resource-management/reservations/approvals', label: 'Reservations · Approvals', active: pathname.startsWith('/resource-management/reservations/approvals') },
            { href: '/resource-management/maintenance', label: 'Maintenance', active: pathname.startsWith('/resource-management/maintenance') },
          ]
        }
      ]
    },
    {
      groupLabel: 'Service Requests',
      menus: [
        {
          href: '/service-requests',
          label: 'Service Requests',
          active: pathname === '/service-requests' || pathname.startsWith('/service-requests/'),
          icon: ClipboardList,
          submenus: [
            { href: '/service-requests/my-requests', label: 'My Requests', active: pathname === '/service-requests/my-requests' },
            { href: '/service-requests/all-services', label: 'All Requests', active: pathname === '/service-requests/all-services' },
            { href: '/service-requests/approvals', label: 'Pending Approvals', active: pathname === '/service-requests/approvals' },
            { href: '/service-requests/analytics', label: 'Analytics', active: pathname === '/service-requests/analytics' },
            { href: '/service-requests/types', label: 'Manage Services', active: pathname.startsWith('/service-requests/types') },
          ]
        }
      ]
    },
    {
      groupLabel: 'Administration',
      menus: [
        {
          href: '/admin',
          label: 'Administration',
          active: pathname === '/admin' || pathname.startsWith('/admin/'),
          icon: Shield,
          submenus: [
            // Notifications
            { href: '/admin/notifications', label: 'Notifications · All', active: pathname === '/admin/notifications' },
            { href: '/admin/notifications/new', label: 'Notifications · Send', active: pathname === '/admin/notifications/new' },
            { href: '/admin/notifications/compliance', label: 'Notifications · Compliance', active: pathname === '/admin/notifications/compliance' },
            { href: '/admin/notifications/audiences', label: 'Notifications · Audiences', active: pathname.startsWith('/admin/notifications/audiences') },
            { href: '/admin/notifications/recipients', label: 'Notifications · Recipients (config)', active: pathname.startsWith('/admin/notifications/recipients') },
            { href: '/admin/whatsapp-limits', label: 'WhatsApp · Send Limits', active: pathname.startsWith('/admin/whatsapp-limits') },
            // Counselor routing (config-as-row, 2026-04-29)
            { href: '/admin/counselors/routing-config', label: 'Counselors · Routing Config', active: pathname.startsWith('/admin/counselors/routing-config') },
            { href: '/admin/counselors/alert-thresholds', label: 'Counselors · Alert Thresholds', active: pathname.startsWith('/admin/counselors/alert-thresholds') },
            // Telephony (config-as-row, 2026-05-03 — M-1 brand-integrity recovery)
            { href: '/admin/exophone-mapping', label: 'Telephony · ExoPhone Mapping', active: pathname.startsWith('/admin/exophone-mapping') },
            // LTI
            { href: '/admin/lti', label: 'LTI · Dashboard', active: pathname === '/admin/lti' },
            { href: '/admin/lti/analytics', label: 'LTI · Analytics', active: pathname === '/admin/lti/analytics' },
            { href: '/admin/lti/grade-sync', label: 'LTI · Grade Sync', active: pathname === '/admin/lti/grade-sync' },
            { href: '/admin/lti/launches', label: 'LTI · Launch Debug', active: pathname === '/admin/lti/launches' },
            // PDE (Admin)
            { href: '/admin/pde', label: 'PDE · Dashboard', active: pathname === '/admin/pde' },
            { href: '/admin/pde/assessments', label: 'PDE · Assessments', active: pathname === '/admin/pde/assessments' || pathname === '/admin/pde/assessments/create' },
            { href: '/admin/pde/quests', label: 'PDE · Quests', active: pathname === '/admin/pde/quests' || pathname === '/admin/pde/quests/create' },
            { href: '/admin/pde/capabilities', label: 'PDE · Capabilities', active: pathname === '/admin/pde/capabilities' },
            { href: '/admin/pde/engagement', label: 'PDE · Engagement', active: pathname === '/admin/pde/engagement' },
            { href: '/admin/pde/at-risk', label: 'PDE · At-Risk', active: pathname === '/admin/pde/at-risk' },
            { href: '/admin/pde/lti', label: 'PDE · LTI Config', active: pathname === '/admin/pde/lti' },
            // Other
            { href: '/audit-trail', label: 'Audit Trail', active: pathname.startsWith('/audit-trail') },
            { href: '/admin/lifecycle', label: 'Lifecycle Analytics', active: pathname.startsWith('/admin/lifecycle') },
            { href: '/admin/retention-policies', label: 'Retention Policies (config)', active: pathname.startsWith('/admin/retention-policies') },
            { href: '/admin/page-metadata', label: 'Page Metadata', active: pathname.startsWith('/admin/page-metadata') },
          ]
        }
      ]
    },
    {
      groupLabel: 'OKR',
      menus: [
        // Single sidebar entry — all OKR navigation lives in the module's
        // in-page tab bar (OKRNav, see app/(routes)/okr/_components/
        // okr-nav.tsx). Mirrors Campus Living + Learners Council + Admission
        // CRM. SectionSubNav on /okr/objectives for All/Create.
        //
        // Why: flat sidebar (1 entry per module) + in-page tabs scales
        // across JKKN's 8+ modules. URLs UNCHANGED.
        {
          href: '/okr',
          label: 'OKR & Performance',
          active: pathname === '/okr' || pathname.startsWith('/okr/'),
          icon: Target,
          submenus: []
        }
      ]
    },
    {
      // Wave 2 merged 'Learning' + 'Value Added Courses' into 'Learning & Courses'.
      // The /vac entry below was previously its own groupLabel; now folded here.
      groupLabel: 'Learning & Courses',
      menus: [
        {
          href: '/learn',
          label: 'Learning',
          active: pathname === '/learn' || pathname.startsWith('/learn/'),
          icon: BookOpen,
          submenus: [
            { href: '/learn/quests', label: 'Quest Board', active: pathname === '/learn/quests' || pathname.startsWith('/learn/quests/') },
            { href: '/learn/capabilities', label: 'Capability Tree', active: pathname.startsWith('/learn/capabilities') },
            { href: '/learn/build', label: 'Build Arena', active: pathname.startsWith('/learn/build') },
            { href: '/learn/channels', label: 'Channels', active: pathname.startsWith('/learn/channels') },
            { href: '/learn/profile', label: 'Profile', active: pathname === '/learn/profile' },
            { href: '/learn/leaderboard', label: 'Leaderboard', active: pathname === '/learn/leaderboard' },
          ]
        },
        {
          href: '/vac',
          label: 'Value Added Courses',
          active: pathname === '/vac' || pathname.startsWith('/vac/'),
          icon: BookOpen,
          submenus: [
            { href: '/vac', label: 'Course Catalog', active: pathname === '/vac' },
            { href: '/vac/my-courses', label: 'My Courses', active: pathname.startsWith('/vac/my-courses') },
            { href: '/vac/case', label: 'CASE Tracker', active: pathname.startsWith('/vac/case') && !pathname.includes('/admin') },
            { href: '/vac/admin', label: 'Admin · Dashboard', active: pathname === '/vac/admin' },
            { href: '/vac/admin/courses', label: 'Admin · Courses', active: pathname.startsWith('/vac/admin/courses') },
            { href: '/vac/admin/enrollments', label: 'Admin · Enrollments', active: pathname.startsWith('/vac/admin/enrollments') },
            { href: '/vac/admin/analytics', label: 'Admin · Analytics', active: pathname.startsWith('/vac/admin/analytics') },
            { href: '/vac/admin/case', label: 'Admin · CASE', active: pathname.startsWith('/vac/admin/case') },
            { href: '/vac/admin/settings', label: 'Admin · Settings', active: pathname.startsWith('/vac/admin/settings') },
          ]
        }
      ]
    },
    {
      groupLabel: 'Health & Wellness',
      menus: [
        {
          href: '/health',
          label: 'Health & Wellness',
          active: pathname === '/health' || pathname.startsWith('/health/'),
          icon: HeartPulse,
          submenus: [
            { href: '/health/dashboard', label: 'Health Dashboard', active: pathname === '/health/dashboard' },
            { href: '/health/profile', label: 'My Health Profile', active: pathname === '/health/profile' },
            { href: '/health/leaderboard', label: 'Leaderboard', active: pathname === '/health/leaderboard' },
            { href: '/health/sports', label: 'Sports Profile', active: pathname === '/health/sports' },
            { href: '/health/fitness', label: 'Fitness Tests', active: pathname === '/health/fitness' || pathname.startsWith('/health/fitness/') },
            { href: '/health/training', label: 'Training Log', active: pathname === '/health/training' },
            { href: '/health/achievements', label: 'Achievements', active: pathname === '/health/achievements' },
            { href: '/health/assessments', label: 'Mental Health Check-In', active: pathname === '/health/assessments' },
            { href: '/health/counselor', label: 'Counselor Dashboard', active: pathname === '/health/counselor' },
          ]
        }
      ]
    },
    {
      // 2026-04-28: IMS sidebar group. Permission keys + 31 route mappings
      // already live in MENU_PERMISSIONS / PERMISSION_CATEGORIES; this is the
      // visual entry. Pattern matches Billing (single top-level entry, all
      // sections collapse into submenus[]).
      groupLabel: 'IMS',
      menus: [
        {
          href: '/ims/dashboard',
          label: 'Inventory Management',
          active: pathname === '/ims' || pathname.startsWith('/ims/'),
          icon: Boxes,
          submenus: [
            { href: '/ims/dashboard', label: 'Dashboard', active: pathname === '/ims/dashboard' },
            { href: '/ims/inventory/items', label: 'Items', active: pathname.startsWith('/ims/inventory/items') },
            { href: '/ims/inventory/categories', label: 'Categories', active: pathname === '/ims/inventory/categories' },
            { href: '/ims/stock', label: 'Stock', active: pathname === '/ims/stock' },
            { href: '/ims/stock/grn', label: 'Stock · GRN', active: pathname.startsWith('/ims/stock/grn') },
            { href: '/ims/stock/adjustments', label: 'Stock · Adjustments', active: pathname === '/ims/stock/adjustments' },
            { href: '/ims/stock/batches', label: 'Stock · Batches', active: pathname === '/ims/stock/batches' },
            { href: '/ims/stock/department', label: 'Stock · Department', active: pathname === '/ims/stock/department' },
            { href: '/ims/indents', label: 'Indents', active: pathname === '/ims/indents' },
            { href: '/ims/indents/new', label: 'Indents · New', active: pathname === '/ims/indents/new' },
            { href: '/ims/indents/pending', label: 'Indents · Pending Approval', active: pathname === '/ims/indents/pending' },
            { href: '/ims/transfers', label: 'Transfers', active: pathname.startsWith('/ims/transfers') },
            { href: '/ims/sales', label: 'Sales (POS)', active: pathname === '/ims/sales' },
            { href: '/ims/sales/history', label: 'Sales · History', active: pathname === '/ims/sales/history' },
            { href: '/ims/reports', label: 'Reports', active: pathname.startsWith('/ims/reports') },
            { href: '/ims/financial', label: 'Financial Audit', active: pathname === '/ims/financial' },
            { href: '/ims/settings/stores', label: 'Settings · Stores', active: pathname === '/ims/settings/stores' },
            { href: '/ims/settings/suppliers', label: 'Settings · Suppliers', active: pathname === '/ims/settings/suppliers' },
            { href: '/ims/settings/units', label: 'Settings · Units', active: pathname === '/ims/settings/units' },
            { href: '/ims/settings/unit-conversions', label: 'Settings · Unit Conversions', active: pathname === '/ims/settings/unit-conversions' },
          ]
        }
      ]
    },
    {
      groupLabel: 'Events',
      menus: [
        {
          href: '/events',
          label: 'Events',
          active: pathname === '/events' || pathname.startsWith('/events/'),
          icon: Calendar,
          submenus: [
            { href: '/events/marathon', label: 'Marathon · All Events', active: pathname === '/events/marathon' },
            { href: '/events/marathon/new', label: 'Marathon · New Event', active: pathname === '/events/marathon/new' },
            // Stream C (2026-04-26): event_proposals workflow — chat-bypass propose intake
            { href: '/events/propose', label: 'Propose an Event', active: pathname === '/events/propose' || pathname.startsWith('/events/propose/') },
          ]
        }
      ]
    },
    {
      groupLabel: 'Startup Studio',
      menus: [
        // Single sidebar entry — all Startup Studio navigation lives in the
        // module's in-page tab bar rendered by AutoTabNav (driven by
        // app/(routes)/startup-studio/nav-config.ts — 9 groups incl.
        // Solve-for-100's nested sub-tabs). Event-specific 15-tab
        // SectionSubNav renders dynamically on /events/[id] pages via
        // layout.tsx (useParams-driven). Mirrors Campus Living +
        // Learners Council + Admission CRM.
        //
        // Why: flat sidebar (1 entry per module) + dynamic in-page subnav
        // for event context. URLs UNCHANGED — all /events/[id]/<tab> routes
        // preserved.
        {
          // D3: click → module root. `/startup-studio` renders AutoTabNav
          // from startup-studio/nav-config.ts (9 groups).
          href: '/startup-studio',
          label: 'Startup Studio',
          active: pathname === '/startup-studio' || pathname.startsWith('/startup-studio/'),
          icon: Rocket,
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'Solution Hub',
      menus: [
        // Single sidebar entry — all Solution Hub navigation lives in the
        // module's in-page tab bar, rendered by AutoTabNav reading
        // app/(routes)/solutions/nav-config.ts. Mirrors Campus Living +
        // Learners Council + Admission CRM. Pipeline / Training / Content
        // / Products sub-tabs are nested as tier-3 `children` in the
        // nav-config — no per-section layout.tsx needed.
        //
        // Why: flat sidebar (1 entry per module) + in-page tabs keeps nav
        // adjacent to content. URLs are UNCHANGED — no bookmarks break.
        {
          href: '/solutions',
          label: 'Solution Hub',
          active: pathname === '/solutions' || pathname.startsWith('/solutions/'),
          icon: LayoutGrid,
          submenus: []
        }
      ]
    },
    // 'Value Added Courses' standalone groupLabel was folded into 'Learning & Courses' above (Wave 2).
    {
      groupLabel: 'Work Pulse',
      menus: [
        {
          href: '/work-pulse',
          label: 'Work Pulse',
          active: pathname === '/work-pulse' || pathname.startsWith('/work-pulse/'),
          icon: Activity,
          submenus: [
            { href: '/work-pulse', label: 'My Pulse', active: pathname === '/work-pulse' },
            { href: '/work-pulse/agents', label: 'Agent Board', active: pathname.startsWith('/work-pulse/agents') },
            { href: '/work-pulse/all', label: 'All Submissions', active: pathname.startsWith('/work-pulse/all') },
            { href: '/work-pulse/impact', label: 'Impact', active: pathname.startsWith('/work-pulse/impact') },
          ]
        }
      ]
    },
    {
      groupLabel: 'Learners Council',
      menus: [
        {
          href: '/learners-council',
          label: 'Learners Council',
          active: pathname === '/learners-council' || pathname.startsWith('/learners-council/'),
          icon: Vote,
          submenus: [
            { href: '/learners-council', label: 'Dashboard', active: pathname === '/learners-council' },
            { href: '/learners-council/structure', label: 'Structure · Overview', active: pathname === '/learners-council/structure' },
            { href: '/learners-council/structure/positions', label: 'Structure · Positions', active: pathname.startsWith('/learners-council/structure/positions') },
            { href: '/learners-council/structure/committees', label: 'Structure · Committees', active: pathname.startsWith('/learners-council/structure/committees') },
            { href: '/learners-council/communication', label: 'Communication', active: pathname.startsWith('/learners-council/communication') },
            { href: '/learners-council/events', label: 'Events', active: pathname.startsWith('/learners-council/events') },
            { href: '/learners-council/od', label: 'OD Requests', active: pathname.startsWith('/learners-council/od') },
            { href: '/learners-council/selection', label: 'Selection', active: pathname.startsWith('/learners-council/selection') },
            { href: '/learners-council/issues', label: 'Issues', active: pathname.startsWith('/learners-council/issues') },
            { href: '/learners-council/settings', label: 'Settings', active: pathname.startsWith('/learners-council/settings') },
          ]
        }
      ]
    },
    {
      groupLabel: 'Faculty',
      menus: [
        {
          href: '/faculty',
          label: 'Faculty',
          active: pathname === '/faculty' || pathname.startsWith('/faculty/'),
          icon: UserCheck,
          submenus: [
            { href: '/faculty/innovation', label: 'Innovation · Dashboard', active: pathname === '/faculty/innovation' },
            { href: '/faculty/innovation/submit', label: 'Innovation · Submit', active: pathname === '/faculty/innovation/submit' },
            { href: '/faculty/innovation/portfolio', label: 'Innovation · Portfolio', active: pathname === '/faculty/innovation/portfolio' },
            { href: '/faculty/innovation/approval-queue', label: 'Innovation · Approvals', active: pathname === '/faculty/innovation/approval-queue' },
            { href: '/faculty/innovation/collab-request', label: 'Innovation · Collab Request', active: pathname === '/faculty/innovation/collab-request' },
            { href: '/faculty/pde', label: 'PDE · Landing', active: pathname === '/faculty/pde' },
            { href: '/faculty/pde/dashboard', label: 'PDE · Dashboard', active: pathname === '/faculty/pde/dashboard' },
            { href: '/faculty/pde/assessments', label: 'PDE · Assessments', active: pathname === '/faculty/pde/assessments' },
            { href: '/faculty/pde/quests', label: 'PDE · Quests', active: pathname === '/faculty/pde/quests' },
            { href: '/faculty/pde/demonstrations', label: 'PDE · Demonstrations', active: pathname === '/faculty/pde/demonstrations' },
            { href: '/faculty/pde/analytics', label: 'PDE · Analytics', active: pathname === '/faculty/pde/analytics' },
          ]
        }
      ]
    },
    {
      // Audit Workflow Sprint 01 — Lead Auditor / Group Registrar surface
      groupLabel: 'Audit Workflow',
      menus: [
        // Single sidebar entry — all audit navigation lives in the module's
        // in-page tab bar (AutoTabNav, see app/(routes)/audit/nav-config.ts)
        // with 5 tabs: Dashboard, Cycles, Findings (+ All/My/Types), Parameters
        // (+ Catalog/Settings), Attestations. Mirrors Accreditation + OKR +
        // Campus Living + Learners Council pattern.
        //
        // Why: flat sidebar (1 entry per module) + in-page tabs keep the
        // sidebar scalable as the 36-parameter audit workflow grows. Route
        // permission gating (audit.cycle.view) lives in MENU_PERMISSIONS map
        // above. Distinct from /audit-trail (platform activity log) in the
        // Administration group.
        {
          href: '/audit',
          label: 'Audit Workflow',
          active: pathname === '/audit' || pathname.startsWith('/audit/'),
          icon: ShieldCheck,
          submenus: []
        }
      ]
    },
    {
      // Compliance Unification Program — Accreditation group
      groupLabel: 'Accreditation',
      menus: [
        // Single sidebar entry — all 10 accreditation bodies live in the
        // module's in-page tab bar (AccreditationNav, see app/(routes)/
        // accreditation/_components/accreditation-nav.tsx). Mirrors Campus
        // Living + Learners Council + Admission CRM. NAAC has a 5-tab
        // SectionSubNav on /accreditation/naac for its DCF/survey/IQAC pages.
        //
        // Why: flat sidebar (1 entry per module) + in-page tabs scales
        // better as more compliance bodies are added. URLs UNCHANGED.
        {
          href: '/accreditation',
          label: 'Accreditation',
          active: pathname === '/accreditation' || pathname.startsWith('/accreditation/'),
          icon: Award,
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'System',
      menus: [
        {
          href: '/system',
          label: 'System',
          active:
            pathname === '/system' ||
            pathname.startsWith('/system/') ||
            pathname.startsWith('/admin/bug-reports') ||
            pathname.startsWith('/admin/ai-query-tools'),
          icon: Settings,
          submenus: [
            { href: '/system/api-management', label: 'API Management', active: pathname === '/system/api-management' },
            { href: '/system/lti-tools', label: 'LTI Tools', active: pathname.startsWith('/system/lti-tools') },
            { href: '/my-bug-reports', label: 'My Bug Reports', active: pathname === '/my-bug-reports' },
            { href: '/bug-leaderboard', label: 'Bug Leaderboard', active: pathname === '/bug-leaderboard' },
            { href: '/admin/bug-reports', label: 'All Bug Reports', active: pathname === '/admin/bug-reports' },
            { href: '/admin/ai-query-tools', label: 'AI Query Tools', active: pathname.startsWith('/admin/ai-query-tools') },
          ]
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
export function normalizeRoute(href: string): string {
  return href.replace(UUID_SEGMENT_REGEX, '[id]');
}

// Recursive helper: returns true if the user has permission for any leaf
// in this submenu subtree. Used so a parent group (e.g. Billing > Setup)
// stays visible whenever ANY descendant leaf is accessible — even when
// the parent's own href maps to a permission the user lacks.
type SubmenuLike = {
  href: string;
  submenus?: SubmenuLike[];
};

function hasAccessibleDescendant(
  submenu: SubmenuLike,
  permissions: Record<string, boolean>
): boolean {
  if (!submenu.submenus || submenu.submenus.length === 0) {
    const requiredPermission = MENU_PERMISSIONS[normalizeRoute(submenu.href)];
    return !!requiredPermission && permissions[requiredPermission] === true;
  }
  return submenu.submenus.some((child) =>
    hasAccessibleDescendant(child, permissions)
  );
}

// Recursive helper: deep-clone a submenu tree, dropping leaves the user
// can't see and dropping branches whose children all got dropped. Returns
// null when the entire subtree is empty after filtering. Preserves the
// branch's own metadata (label, icon, active) for surviving children.
function filterSubmenuTree<T extends SubmenuLike>(
  submenu: T,
  permissions: Record<string, boolean>
): T | null {
  if (!submenu.submenus || submenu.submenus.length === 0) {
    const requiredPermission = MENU_PERMISSIONS[normalizeRoute(submenu.href)];
    if (!requiredPermission || permissions[requiredPermission] !== true) {
      return null;
    }
    return submenu;
  }
  const filteredChildren = submenu.submenus
    .map((child) => filterSubmenuTree(child, permissions))
    .filter((c): c is T => c !== null);
  if (filteredChildren.length === 0) return null;
  return { ...submenu, submenus: filteredChildren };
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
            // Show parent if any LEAF in the subtree is accessible.
            // hasAccessibleDescendant recurses so nested groups (e.g. Billing
            // > Setup > Categories > Parents) are checked correctly.
            return menu.submenus.some((submenu) =>
              hasAccessibleDescendant(submenu, userRole.permissions)
            );
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

          const filteredSubmenus = menu.submenus.map((submenu) => {
            // Branch submenu (has its own children) — recurse via filterSubmenuTree.
            // None of the leaf-level special cases below apply to branch nodes;
            // grandchildren get the standard MENU_PERMISSIONS lookup recursively.
            if (submenu.submenus && submenu.submenus.length > 0) {
              return filterSubmenuTree(submenu, userRole.permissions);
            }
            return submenu;
          }).filter((submenu): submenu is NonNullable<typeof submenu> => {
            if (submenu === null) return false;

            // Branch survivors (already filtered by filterSubmenuTree) pass through
            if (submenu.submenus && submenu.submenus.length > 0) return true;

            // ----- Leaf-only special cases below -----

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


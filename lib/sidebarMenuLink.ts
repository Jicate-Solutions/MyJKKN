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
  CalendarCheck,
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
  BookMarked,
  Cpu,
  Award,
  CheckSquare,
  TrendingUp,
  TrendingDown,
  Wrench,
  FileBarChart2,
  History,
  Sparkles,
  Bot,
  UserCircle,
  FileCheck,
  Briefcase,
  Handshake,
  Target,
  Phone,
  DollarSign,
  Send,
  MessageSquarePlus,
  Trophy,
  FileSpreadsheet,
  PhoneCall,
  // TQM Module Icons
  BarChart3,
  Settings2,
  MessageSquareWarning,
  CircleDot,
  UsersRound,
  // Solutions Hub Icons
  FileStack,
  Code,
  Palette,
  Search,
  CreditCard,
  Hammer,
  Lightbulb,
  // Personalization Icons
  Route,
  KeyRound,
  // Compliance Icon
  ShieldCheck,
  // Learners Council Icons
  Crown,
  Network,
  Megaphone,
  Vote,
  Kanban,
  ClipboardSignature,
  // Social Media Icons
  Share2,
  Activity,
  Eye,
  // Campus Living Icons
  Hotel,
  UtensilsCrossed,
  WashingMachine,
  HeartPulse,
  ClipboardPlus,
  // Admission CRM extra icons
  Radio,
  GitMerge,
} from 'lucide-react';
import { CustomRole } from '@/types/auth';
import { FEATURE_FLAGS } from '@/lib/config/feature-flags';

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
  '/learners/my-gate-passes': 'campus_living.gate_passes.view',

  // Parent Portal Routes (Parent Self-Service)
  '/parent/child-gate-passes': 'campus_living.gate_passes.view',

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
  '/facilitator-impact': 'staff.dashboard.view',

  // Competency Catalog
  '/competency-catalog': 'competency.catalog.view',
  '/competency-catalog/new': 'competency.catalog.create',
  '/competency-catalog/[id]': 'competency.catalog.view',
  '/competency-catalog/[id]/edit': 'competency.catalog.edit',

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
  '/academic/timetables/conflicts': 'academic.timetables.view',
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
  '/admin/reset-driver-passwords': 'system.admin.view',

  // System Management
  '/system/api-management': 'system.api.view',
  '/system/lti-tools': 'lti.tools.view',
  '/admin/bug-reports': 'system.bugs.view',
  '/bug-leaderboard': 'system.bugs.view',
  '/admin/ai-query-tools': 'super_admin', // Super admin only - AI Query Tools Registry

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
  '/billing/receipts/templates': 'billing.receipts.view',
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
  '/billing/copq': 'billing.copq.view',


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

  // Admission CRM Module
  '/admission/counselors/daily-view': 'admission.dashboard.view',
  '/admission/dashboard': 'admission.dashboard.view',
  '/admission/leads': 'admission.leads.view',
  '/admission/leads/new': 'admission.leads.create',
  '/admission/applications': 'admission.applications.view',
  '/admission/analytics': 'admission.analytics.view',
  '/admission/consultants': 'admission.consultants.view',
  '/admission/consultants/new': 'admission.consultants.create',
  '/admission/consultants/commissions': 'admission.consultants.commissions.view',
  '/admission/consultants/rewards': 'admission.consultants.rewards.view',
  '/admission/consultants/analytics': 'admission.consultants.analytics.view',
  '/admission/consultants/referrals': 'admission.consultants.view',
  '/admission/counselors': 'admission.counselors.view',
  '/admission/interviews': 'admission.interviews.view',
  '/admission/gd-pi': 'admission.gd_pi.view',
  '/admission/scholarships': 'admission.scholarships.view',
  '/admission/loans': 'admission.loans.view',
  '/admission/publishers': 'admission.publishers.view',
  '/admission/sources': 'admission.sources.view',
  '/admission/apply': 'admission.apply.view',
  '/admission/templates': 'admission.templates.view',
  '/admission/settings': 'admission.settings.view',
  '/admission/workflows': 'admission.workflows.view',
  '/admission/merit-list': 'admission.merit_list.view',
  '/admission/seat-confirmation': 'admission.seat_confirmation.view',
  '/admission/offer-letter': 'admission.offer_letter.view',
  '/admission/documents': 'admission.documents.view',
  '/admission/hostels': 'admission.hostels.view',
  '/admission/feedback': 'admission.feedback.view',
  '/admission/counselors/reminders': 'admission.reminders.view',
  '/admission/screening-exam': 'admission.screening_exam.view',
  '/admission/lateral-entry': 'admission.lateral_entry.view',
  '/admission/re-engagement': 'admission.re_engagement.view',
  '/admission/chatbot': 'admission.chatbot.view',
  '/admission/parent-communication': 'admission.parent_communication.view',
  '/admission/data-profiling': 'admission.data_profiling.view',
  '/admission/deduplication': 'admission.deduplication.view',
  '/admission/phone-validation': 'admission.phone_validation.view',
  '/admission/scoring-rules': 'admission.scoring_rules.view',
  '/admission/assignment-rules': 'admission.assignment_rules.view',
  '/admission/status': 'admission.status.view',
  '/admission/workflow-config': 'admission.settings.view',
  '/admission/group-dashboard': 'admission.dashboard.view',
  '/admission/counselors/calls': 'admission.calls.view',
  '/admission/campaigns': 'admission.campaigns.view',
  '/admission/campaigns/monitoring': 'admission.campaigns.view',
  '/admission/campaigns/roi': 'admission.campaigns.view',
  '/admission/chat': 'admission.chat.view',
  '/admission/chat/settings': 'admission.chat.view',
  '/admission/chatbot/analytics': 'admission.chatbot.view',
  '/admission/chatbot/knowledge': 'admission.chatbot.view',
  '/admission/remarketing': 'admission.remarketing.view',
  '/admission/voice-agents': 'admission.voice_agents.view',
  '/admission/voice-broadcast': 'admission.voice_broadcast.view',
  '/admission/counselors/briefing': 'admission.briefing.view',
  '/admission/counselors/alerts': 'admission.alerts.view',
  '/admission/insights': 'admission.insights.view',

  // Consultant Portal (EC Self-Service)
  '/consultant-portal': 'consultant_portal.view',
  '/consultant-portal/leads': 'consultant_portal.leads.view',
  '/consultant-portal/leads/submit': 'consultant_portal.leads.submit',
  '/consultant-portal/commissions': 'consultant_portal.commissions.view',
  '/consultant-portal/rewards': 'consultant_portal.rewards.view',
  '/consultant-portal/profile': 'consultant_portal.profile.view',

  // OKR Module
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

  // Facilitator Development
  '/facilitator-development': 'facilitator_development.view',
  '/facilitator-development/records': 'facilitator_development.view',
  '/facilitator-development/records/new': 'facilitator_development.create',
  '/facilitator-development/records/[id]': 'facilitator_development.view',
  '/facilitator-development/immersions': 'facilitator_development.immersions.view',

  // Industry Integration
  '/industry': 'industry.view',
  '/industry/partners': 'industry.partners.view',
  '/industry/partners/new': 'industry.partners.create',
  '/industry/partners/[id]': 'industry.partners.view',
  '/industry/partners/[id]/edit': 'industry.partners.edit',
  '/industry/mentors': 'industry.mentors.view',
  '/industry/mentors/new': 'industry.mentors.create',
  '/industry/mentors/[id]': 'industry.mentors.view',
  '/industry/mentors/[id]/edit': 'industry.mentors.edit',
  '/industry/projects': 'industry.projects.view',
  '/industry/projects/new': 'industry.projects.create',
  '/industry/projects/[id]': 'industry.projects.view',
  '/industry/projects/[id]/edit': 'industry.projects.edit',
  '/industry/engagements': 'industry.engagements.view',
  '/industry/engagements/new': 'industry.engagements.create',
  '/industry/engagements/[id]': 'industry.engagements.view',
  '/industry/engagements/[id]/edit': 'industry.engagements.edit',

  // Social Media Module
  '/social-media': 'sm.monitoring.view',
  '/social-media/accounts': 'sm.monitoring.view',
  '/social-media/accounts/[id]': 'sm.monitoring.view',
  '/social-media/analytics': 'sm.monitoring.view',

  // TQM (Total Quality Management) Module
  '/stakeholder-nps': 'tqm.nps.view',
  '/stakeholder-nps/surveys': 'tqm.nps.surveys.view',
  '/stakeholder-nps/surveys/new': 'tqm.nps.surveys.create',
  '/stakeholder-nps/analytics': 'tqm.nps.analytics.view',
  '/stakeholder-nps/feedback': 'tqm.nps.feedback.view',
  '/process-excellence': 'tqm.process.view',
  '/process-excellence/workflows': 'tqm.process.workflows.view',
  '/process-excellence/metrics': 'tqm.process.metrics.view',
  '/process-excellence/improvements': 'tqm.process.improvements.view',
  '/parent-portal': 'tqm.parent_portal.view',
  '/parent-portal/dashboard': 'tqm.parent_portal.dashboard.view',
  '/parent-portal/access': 'tqm.parent_portal.view',
  '/parent-portal/access/new': 'tqm.parent_portal.view',
  '/parent-portal/communications': 'tqm.parent_portal.communication.view',
  '/parent-portal/communications/new': 'tqm.parent_portal.communication.view',
  '/parent-portal/communication': 'tqm.parent_portal.communication.view',
  '/parent-portal/[id]': 'tqm.parent_portal.view',
  '/parent-portal/feedback': 'tqm.parent_portal.feedback.view',
  '/grievance': 'tqm.grievance.view',
  '/grievance/dashboard': 'tqm.grievance.view',
  '/grievance/sla': 'tqm.grievance.view',
  '/grievance/tickets': 'tqm.grievance.tickets.view',
  '/grievance/tickets/new': 'tqm.grievance.tickets.create',
  '/grievance/analytics': 'tqm.grievance.analytics.view',
  '/grievance/escalations': 'tqm.grievance.escalations.view',
  // Learners Council
  '/learners-council': 'lc.view',
  '/learners-council/structure': 'lc.structure.view',
  '/learners-council/communication': 'lc.communication.view',
  '/learners-council/events': 'lc.events.view',
  '/learners-council/od': 'lc.od.view',
  '/learners-council/selection': 'lc.selection.view',
  '/learners-council/issues': 'lc.issues.view',
  '/learners-council/settings': 'lc.view',
  '/maturity-assessment': 'tqm.maturity.view',
  '/maturity-assessment/assessments': 'tqm.maturity.assessments.view',
  '/maturity-assessment/assessments/new': 'tqm.maturity.assessments.create',
  '/maturity-assessment/roadmap': 'tqm.maturity.roadmap.view',
  '/maturity-assessment/benchmarks': 'tqm.maturity.benchmarks.view',
  '/okr/abcd': 'okr.abcd.view',

  // Value Added Courses (VAC) Module
  '/vac': 'vac.view',
  '/vac/my-courses': 'vac.view',
  '/vac/progress': 'vac.progress.view',
  '/vac/admin/courses': 'vac.admin.view',
  '/vac/admin/courses/new': 'vac.admin.create',
  '/vac/admin/courses/[id]': 'vac.admin.view',
  '/vac/admin/courses/[id]/edit': 'vac.admin.edit',
  '/vac/admin/analytics': 'vac.admin.analytics',
  '/vac/admin/enrollments': 'vac.admin.view',
  '/vac/[courseId]': 'vac.view',
  '/vac/[courseId]/[lessonId]': 'vac.view',

  // Solutions Hub Module (Admin/Staff Views)
  '/solutions': 'solutions.view',
  '/solutions/clients': 'solutions.clients.view',
  '/solutions/clients/new': 'solutions.clients.create',
  '/solutions/clients/[id]': 'solutions.clients.view',
  '/solutions/clients/[id]/edit': 'solutions.clients.edit',
  '/solutions/list': 'solutions.view',
  '/solutions/new': 'solutions.create',
  '/solutions/[id]': 'solutions.view',
  '/solutions/[id]/edit': 'solutions.edit',
  '/solutions/[id]/mou': 'solutions.mou.view',
  '/solutions/software': 'solutions.software.view',
  '/solutions/builders': 'solutions.builders.view',
  '/solutions/builders/new': 'solutions.builders.create',
  '/solutions/builders/[id]': 'solutions.builders.view',
  '/solutions/software/builders': 'solutions.builders.view',
  '/solutions/software/builders/new': 'solutions.builders.create',
  '/solutions/software/phases': 'solutions.phases.view',
  '/solutions/training': 'solutions.training.view',
  '/solutions/training/programs': 'solutions.training.programs.view',
  '/solutions/training/cohort': 'solutions.cohort.view',
  '/solutions/training/cohort/new': 'solutions.cohort.create',
  '/solutions/training/sessions': 'solutions.sessions.view',
  '/solutions/content': 'solutions.content.view',
  '/solutions/content/orders': 'solutions.content.orders.view',
  '/solutions/content/production': 'solutions.production.view',
  '/solutions/content/production/new': 'solutions.production.create',
  '/solutions/content/queue': 'solutions.content.queue.view',
  '/solutions/discovery': 'solutions.discovery.view',
  '/solutions/discovery/new': 'solutions.discovery.create',
  '/solutions/payments': 'solutions.payments.view',
  '/solutions/payments/new': 'solutions.payments.create',
  '/solutions/earnings': 'solutions.earnings.view',
  '/solutions/departments': 'solutions.view',
  '/solutions/departments/[id]': 'solutions.view',
  '/solutions/settings/types': 'solutions.view',
  '/solutions/publications': 'solutions.publications.view',
  '/solutions/publications/new': 'solutions.publications.create',
  '/solutions/compliance': 'solutions.view',
  '/solutions/products': 'solutions.view',
  '/solutions/products/new': 'solutions.create',
  '/solutions/products/[id]': 'solutions.view',
  '/solutions/products/[id]/edit': 'solutions.edit',
  '/solutions/products/rdif': 'solutions.view',
  '/solutions/pipeline': 'solutions.view',
  '/solutions/pipeline/list': 'solutions.view',
  '/solutions/pipeline/new': 'solutions.create',
  '/solutions/pipeline/[id]': 'solutions.view',
  '/solutions/pipeline/[id]/edit': 'solutions.edit',
  '/solutions/pipeline/analytics': 'solutions.view',

  // Talent Portals (Role-specific)
  '/talent/builder': 'talent.builder.view',
  '/talent/builder/assignments': 'talent.builder.assignments.view',
  '/talent/builder/available': 'talent.builder.available.view',
  '/talent/builder/earnings': 'talent.builder.earnings.view',
  '/talent/cohort': 'talent.cohort.view',
  '/talent/cohort/sessions': 'talent.cohort.sessions.view',
  '/talent/cohort/earnings': 'talent.cohort.earnings.view',
  '/talent/production': 'talent.production.view',
  '/talent/production/queue': 'talent.production.queue.view',
  '/talent/production/earnings': 'talent.production.earnings.view',

  // Learning Paths (Personalization)
  '/learning-paths': 'learning_paths.view',
  '/learning-paths/new': 'learning_paths.create',
  '/learning-paths/[id]': 'learning_paths.view',
  '/learning-paths/[id]/edit': 'learning_paths.edit',

  // Client Portal (External)
  '/portal/client': 'portal.client.view',
  '/portal/client/projects': 'portal.client.projects.view',
  '/portal/client/deliverables': 'portal.client.deliverables.view',
  '/portal/client/invoices': 'portal.client.invoices.view',

  // Alumni Outcomes (Accountability)
  '/alumni': 'alumni.outcomes.view',
  '/alumni/outcomes': 'alumni.outcomes.view',
  '/alumni/outcomes/new': 'alumni.outcomes.create',
  '/alumni/outcomes/[id]': 'alumni.outcomes.view',
  '/alumni/effectiveness': 'alumni.effectiveness.view',

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
  '/campus-living/safety': 'campus_living.safety.view',
  '/campus-living/safety/incidents': 'campus_living.safety.incidents.view',
  '/campus-living/safety/anti-ragging': 'campus_living.safety.anti_ragging.view',
  '/campus-living/safety/inspections': 'campus_living.safety.inspections.view',
  '/campus-living/analytics': 'campus_living.analytics.view',
  '/campus-living/reports': 'campus_living.reports.view',
  '/campus-living/settings': 'campus_living.settings.view'
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
      groupLabel: 'Admission CRM',
      menus: [
        {
          href: '/admission/counselors/daily-view',
          label: 'My Day',
          active: pathname === '/admission/counselors/daily-view',
          icon: CalendarCheck,
          submenus: []
        },
        {
          href: '/admission/dashboard',
          label: 'Dashboard',
          active: pathname === '/admission/dashboard',
          icon: BarChart,
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
          icon: Target,
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
          href: '/admission/consultants',
          label: 'Education Consultants',
          active: pathname.startsWith('/admission/consultants'),
          icon: Handshake,
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
              href: '/admission/consultants/rewards',
              label: 'Rewards',
              active: pathname === '/admission/consultants/rewards'
            },
            {
              href: '/admission/consultants/analytics',
              label: 'Analytics',
              active: pathname === '/admission/consultants/analytics'
            },
            {
              href: '/admission/consultants/referrals',
              label: 'Referrals',
              active: pathname === '/admission/consultants/referrals'
            }
          ]
        },
        {
          href: '/admission/interviews',
          label: 'Interviews & GD-PI',
          active: pathname.startsWith('/admission/interviews') || pathname.startsWith('/admission/gd-pi'),
          icon: PhoneCall,
          submenus: [
            {
              href: '/admission/interviews',
              label: 'Interviews',
              active: pathname === '/admission/interviews'
            },
            {
              href: '/admission/gd-pi',
              label: 'GD-PI',
              active: pathname === '/admission/gd-pi'
            }
          ]
        },
        {
          href: '/admission/scholarships',
          label: 'Financial Aid',
          active: pathname.startsWith('/admission/scholarships') || pathname.startsWith('/admission/loans'),
          icon: DollarSign,
          submenus: [
            {
              href: '/admission/scholarships',
              label: 'Scholarships',
              active: pathname === '/admission/scholarships'
            },
            {
              href: '/admission/loans',
              label: 'Education Loans',
              active: pathname === '/admission/loans'
            }
          ]
        },
        {
          href: '/admission/analytics',
          label: 'Analytics',
          active: pathname === '/admission/analytics',
          icon: TrendingUp,
          submenus: []
        },
        {
          href: '/admission/settings',
          label: 'Settings',
          active: pathname.startsWith('/admission/settings') || pathname.startsWith('/admission/workflows') || pathname.startsWith('/admission/workflow-config'),
          icon: Settings,
          submenus: [
            {
              href: '/admission/settings',
              label: 'General Settings',
              active: pathname === '/admission/settings'
            },
            {
              href: '/admission/workflows',
              label: 'Workflows',
              active: pathname === '/admission/workflows'
            },
            {
              href: '/admission/workflow-config',
              label: 'Workflow Config',
              active: pathname === '/admission/workflow-config'
            },
            {
              href: '/admission/templates',
              label: 'Templates',
              active: pathname === '/admission/templates'
            },
            {
              href: '/admission/sources',
              label: 'Lead Sources',
              active: pathname === '/admission/sources'
            },
            {
              href: '/admission/scoring-rules',
              label: 'Scoring Rules',
              active: pathname === '/admission/scoring-rules'
            },
            {
              href: '/admission/assignment-rules',
              label: 'Assignment Rules',
              active: pathname === '/admission/assignment-rules'
            }
          ]
        },
        {
          href: '/admission/counselors',
          label: 'Counselors & Teams',
          active: pathname.startsWith('/admission/counselors'),
          icon: UserCheck,
          submenus: [
            { href: '/admission/counselors', label: 'Counselors', active: pathname === '/admission/counselors' },
            { href: '/admission/counselors/calls', label: 'Calls', active: pathname === '/admission/counselors/calls' },
            { href: '/admission/counselors/briefing', label: 'Briefing', active: pathname === '/admission/counselors/briefing' },
            { href: '/admission/counselors/reminders', label: 'Reminders', active: pathname === '/admission/counselors/reminders' },
            { href: '/admission/counselors/alerts', label: 'Alerts', active: pathname === '/admission/counselors/alerts' }
          ]
        },
        {
          href: '/admission/campaigns',
          label: 'Marketing & Engagement',
          active: pathname.startsWith('/admission/campaigns') || pathname.startsWith('/admission/chat') || pathname.startsWith('/admission/chatbot') || pathname === '/admission/voice-agents' || pathname === '/admission/voice-broadcast' || pathname === '/admission/remarketing' || pathname === '/admission/re-engagement' || pathname === '/admission/publishers' || pathname === '/admission/parent-communication',
          icon: Megaphone,
          submenus: [
            { href: '/admission/campaigns', label: 'Campaigns', active: pathname.startsWith('/admission/campaigns') },
            { href: '/admission/chat', label: 'Live Chat', active: pathname.startsWith('/admission/chat') },
            { href: '/admission/chatbot', label: 'Chatbot', active: pathname.startsWith('/admission/chatbot') },
            { href: '/admission/voice-agents', label: 'Voice Agents', active: pathname === '/admission/voice-agents' },
            { href: '/admission/voice-broadcast', label: 'Voice Broadcast', active: pathname === '/admission/voice-broadcast' },
            { href: '/admission/remarketing', label: 'Remarketing', active: pathname === '/admission/remarketing' },
            { href: '/admission/re-engagement', label: 'Re-engagement', active: pathname === '/admission/re-engagement' },
            { href: '/admission/publishers', label: 'Publishers', active: pathname === '/admission/publishers' },
            { href: '/admission/parent-communication', label: 'Parent Communication', active: pathname === '/admission/parent-communication' }
          ]
        },
        {
          href: '/admission/screening-exam',
          label: 'Selection Process',
          active: pathname === '/admission/screening-exam' || pathname === '/admission/merit-list' || pathname === '/admission/lateral-entry',
          icon: ClipboardList,
          submenus: [
            { href: '/admission/screening-exam', label: 'Screening Exam', active: pathname === '/admission/screening-exam' },
            { href: '/admission/merit-list', label: 'Merit List', active: pathname === '/admission/merit-list' },
            { href: '/admission/lateral-entry', label: 'Lateral Entry', active: pathname === '/admission/lateral-entry' }
          ]
        },
        {
          href: '/admission/seat-confirmation',
          label: 'Admissions Operations',
          active: pathname === '/admission/seat-confirmation' || pathname === '/admission/offer-letter' || pathname === '/admission/documents' || pathname === '/admission/hostels' || pathname === '/admission/feedback' || pathname === '/admission/apply',
          icon: CheckSquare,
          submenus: [
            { href: '/admission/seat-confirmation', label: 'Seat Confirmation', active: pathname === '/admission/seat-confirmation' },
            { href: '/admission/offer-letter', label: 'Offer Letter', active: pathname === '/admission/offer-letter' },
            { href: '/admission/documents', label: 'Documents', active: pathname === '/admission/documents' },
            { href: '/admission/hostels', label: 'Hostels', active: pathname === '/admission/hostels' },
            { href: '/admission/feedback', label: 'Feedback', active: pathname === '/admission/feedback' },
            { href: '/admission/apply', label: 'Apply Online', active: pathname === '/admission/apply' }
          ]
        },
        {
          href: '/admission/insights',
          label: 'Insights & Status',
          active: pathname === '/admission/insights' || pathname === '/admission/status',
          icon: Lightbulb,
          submenus: [
            { href: '/admission/insights', label: 'Insights', active: pathname === '/admission/insights' },
            { href: '/admission/status', label: 'Pipeline Status', active: pathname === '/admission/status' }
          ]
        },
        {
          href: '/admission/data-profiling',
          label: 'Data Quality',
          active: pathname === '/admission/data-profiling' || pathname === '/admission/deduplication' || pathname === '/admission/phone-validation',
          icon: Database,
          submenus: [
            { href: '/admission/data-profiling', label: 'Data Profiling', active: pathname === '/admission/data-profiling' },
            { href: '/admission/deduplication', label: 'Deduplication', active: pathname === '/admission/deduplication' },
            { href: '/admission/phone-validation', label: 'Phone Validation', active: pathname === '/admission/phone-validation' }
          ]
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
            },
            {
              href: '/organizations/courses/new',
              label: 'Add Course',
              active: pathname === '/organizations/courses/new'
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
          label: 'Leave/OnDuty Applications',
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
            },
            {
              href: '/academic/timetables/conflicts',
              label: 'Conflict Checker',
              active: pathname === '/academic/timetables/conflicts'
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
      groupLabel: 'Value Added Courses',
      menus: [
        {
          href: '/vac',
          label: 'All Courses',
          active: pathname === '/vac',
          icon: BookOpen,
          submenus: []
        },
        {
          href: '/vac/my-courses',
          label: 'My Courses',
          active: pathname === '/vac/my-courses',
          icon: BookMarked,
          submenus: []
        },
        {
          href: '/vac/progress',
          label: 'My Progress',
          active: pathname === '/vac/progress',
          icon: TrendingUp,
          submenus: []
        },
        {
          href: '/vac/admin/courses',
          label: 'Course Admin',
          active: pathname.startsWith('/vac/admin'),
          icon: Settings,
          submenus: [
            {
              href: '/vac/admin/courses',
              label: 'Manage Courses',
              active: pathname === '/vac/admin/courses'
            },
            {
              href: '/vac/admin/courses/new',
              label: 'Create Course',
              active: pathname === '/vac/admin/courses/new'
            },
            {
              href: '/vac/admin/enrollments',
              label: 'Enrollments',
              active: pathname === '/vac/admin/enrollments'
            },
            {
              href: '/vac/admin/analytics',
              label: 'Analytics',
              active: pathname === '/vac/admin/analytics'
            }
          ]
        }
      ]
    },

    {
      groupLabel: 'Facilitators Management',
      menus: [
        {
          href: '/facilitator-impact',
          label: 'Impact Dashboard',
          active: pathname === '/facilitator-impact',
          icon: Target,
          submenus: []
        },
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
        },
        {
          href: '/facilitator-development',
          label: 'Facilitator Development',
          active: pathname.startsWith('/facilitator-development'),
          icon: TrendingUp,
          submenus: [
            {
              href: '/facilitator-development',
              label: 'Dashboard',
              active: pathname === '/facilitator-development'
            },
            {
              href: '/facilitator-development/records',
              label: 'Development Records',
              active: pathname.startsWith('/facilitator-development/records')
            },
            {
              href: '/facilitator-development/immersions',
              label: 'Industry Immersions',
              active: pathname.startsWith('/facilitator-development/immersions')
            }
          ]
        }
      ]
    },
    {
      groupLabel: 'Competency & Outcomes',
      menus: [
        {
          href: '/competency-catalog',
          label: 'Competency Catalog',
          active: pathname === '/competency-catalog',
          icon: BookOpen,
          submenus: [
            {
              href: '/competency-catalog',
              label: 'All Competencies',
              active: pathname === '/competency-catalog'
            },
            {
              href: '/competency-catalog/new',
              label: 'Create Competency',
              active: pathname === '/competency-catalog/new'
            }
          ]
        }
      ]
    },
    {
      groupLabel: 'Personalization',
      menus: [
        {
          href: '/learning-paths',
          label: 'Learning Paths',
          active: pathname.startsWith('/learning-paths'),
          icon: Route,
          submenus: [
            {
              href: '/learning-paths',
              label: 'All Paths',
              active: pathname === '/learning-paths'
            },
            {
              href: '/learning-paths/new',
              label: 'Create Path',
              active: pathname === '/learning-paths/new'
            }
          ]
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
      groupLabel: 'Industry Connect',
      menus: [
        {
          href: '/industry',
          label: 'Dashboard',
          active: pathname === '/industry',
          icon: Briefcase,
          submenus: []
        },
        {
          href: '/industry/partners',
          label: 'Industry Partners',
          active: pathname.startsWith('/industry/partners'),
          icon: Handshake,
          submenus: [
            {
              href: '/industry/partners',
              label: 'All Partners',
              active: pathname === '/industry/partners'
            },
            {
              href: '/industry/partners/new',
              label: 'Add Partner',
              active: pathname === '/industry/partners/new'
            }
          ]
        },
        {
          href: '/industry/mentors',
          label: 'Mentors',
          active: pathname.startsWith('/industry/mentors'),
          icon: Users,
          submenus: [
            {
              href: '/industry/mentors',
              label: 'All Mentors',
              active: pathname === '/industry/mentors'
            },
            {
              href: '/industry/mentors/new',
              label: 'Add Mentor',
              active: pathname === '/industry/mentors/new'
            }
          ]
        },
        {
          href: '/industry/projects',
          label: 'Projects',
          active: pathname.startsWith('/industry/projects'),
          icon: Target,
          submenus: [
            {
              href: '/industry/projects',
              label: 'All Projects',
              active: pathname === '/industry/projects'
            },
            {
              href: '/industry/projects/new',
              label: 'Add Project',
              active: pathname === '/industry/projects/new'
            }
          ]
        },
        {
          href: '/industry/engagements',
          label: 'Learner Engagements',
          active: pathname.startsWith('/industry/engagements'),
          icon: UserCheck,
          submenus: [
            {
              href: '/industry/engagements',
              label: 'All Engagements',
              active: pathname === '/industry/engagements'
            },
            {
              href: '/industry/engagements/new',
              label: 'New Engagement',
              active: pathname === '/industry/engagements/new'
            }
          ]
        }
      ]
    },
    {
      groupLabel: 'Solutions Hub',
      menus: [
        {
          href: '/solutions',
          label: 'Dashboard',
          active: pathname === '/solutions',
          icon: LayoutGrid,
          submenus: []
        },
        {
          href: '/solutions/pipeline',
          label: 'Pipeline',
          active: pathname.startsWith('/solutions/pipeline'),
          icon: Target,
          submenus: [
            {
              href: '/solutions/pipeline',
              label: 'Board View',
              active: pathname === '/solutions/pipeline'
            },
            {
              href: '/solutions/pipeline/list',
              label: 'List View',
              active: pathname === '/solutions/pipeline/list'
            },
            {
              href: '/solutions/pipeline/new',
              label: 'Add Prospect',
              active: pathname === '/solutions/pipeline/new'
            },
            {
              href: '/solutions/pipeline/analytics',
              label: 'Analytics',
              active: pathname === '/solutions/pipeline/analytics'
            }
          ]
        },
        {
          href: '/solutions/departments',
          label: 'Departments',
          active: pathname.startsWith('/solutions/departments'),
          icon: Building2,
          submenus: [
            {
              href: '/solutions/departments',
              label: 'All Departments',
              active: pathname === '/solutions/departments'
            }
          ]
        },
        {
          href: '/solutions/builders',
          label: 'Builders',
          active: pathname.startsWith('/solutions/builders'),
          icon: Hammer,
          submenus: [
            {
              href: '/solutions/builders',
              label: 'All Builders',
              active: pathname === '/solutions/builders'
            },
            {
              href: '/solutions/builders/new',
              label: 'Add Builder',
              active: pathname === '/solutions/builders/new'
            }
          ]
        },
        {
          href: '/solutions/clients',
          label: 'Clients',
          active: pathname.startsWith('/solutions/clients'),
          icon: Building,
          submenus: [
            {
              href: '/solutions/clients',
              label: 'All Clients',
              active: pathname === '/solutions/clients'
            },
            {
              href: '/solutions/clients/new',
              label: 'Add Client',
              active: pathname === '/solutions/clients/new'
            }
          ]
        },
        {
          href: '/solutions/list',
          label: 'All Solutions',
          active: pathname === '/solutions/list' || (pathname.startsWith('/solutions/') && !pathname.startsWith('/solutions/clients') && !pathname.startsWith('/solutions/software') && !pathname.startsWith('/solutions/training') && !pathname.startsWith('/solutions/content') && !pathname.startsWith('/solutions/discovery') && !pathname.startsWith('/solutions/payments') && !pathname.startsWith('/solutions/earnings') && !pathname.startsWith('/solutions/publications') && !pathname.startsWith('/solutions/departments') && !pathname.startsWith('/solutions/builders') && !pathname.startsWith('/solutions/settings') && !pathname.startsWith('/solutions/compliance') && !pathname.startsWith('/solutions/pipeline')),
          icon: FileStack,
          submenus: [
            {
              href: '/solutions/list',
              label: 'View All',
              active: pathname === '/solutions/list'
            },
            {
              href: '/solutions/new',
              label: 'Create Solution',
              active: pathname === '/solutions/new'
            }
          ]
        },
        {
          href: '/solutions/software',
          label: 'Software',
          active: pathname.startsWith('/solutions/software'),
          icon: Code,
          submenus: [
            {
              href: '/solutions/software',
              label: 'Overview',
              active: pathname === '/solutions/software'
            },
            {
              href: '/solutions/software/phases',
              label: 'Phase Management',
              active: pathname === '/solutions/software/phases'
            }
          ]
        },
        {
          href: '/solutions/training',
          label: 'Training',
          active: pathname.startsWith('/solutions/training'),
          icon: GraduationCap,
          submenus: [
            {
              href: '/solutions/training',
              label: 'Overview',
              active: pathname === '/solutions/training'
            },
            {
              href: '/solutions/training/programs',
              label: 'Programs',
              active: pathname === '/solutions/training/programs'
            },
            {
              href: '/solutions/training/cohort',
              label: 'Cohort Management',
              active: pathname.startsWith('/solutions/training/cohort')
            },
            {
              href: '/solutions/training/sessions',
              label: 'Sessions',
              active: pathname === '/solutions/training/sessions'
            }
          ]
        },
        {
          href: '/solutions/content',
          label: 'Content',
          active: pathname.startsWith('/solutions/content'),
          icon: Palette,
          submenus: [
            {
              href: '/solutions/content',
              label: 'Overview',
              active: pathname === '/solutions/content'
            },
            {
              href: '/solutions/content/orders',
              label: 'Orders',
              active: pathname === '/solutions/content/orders'
            },
            {
              href: '/solutions/content/production',
              label: 'Production Learners',
              active: pathname.startsWith('/solutions/content/production')
            },
            {
              href: '/solutions/content/queue',
              label: 'Deliverable Queue',
              active: pathname === '/solutions/content/queue'
            }
          ]
        },
        {
          href: '/solutions/discovery',
          label: 'Discovery',
          active: pathname.startsWith('/solutions/discovery'),
          icon: Search,
          submenus: [
            {
              href: '/solutions/discovery',
              label: 'Site Visits',
              active: pathname === '/solutions/discovery'
            },
            {
              href: '/solutions/discovery/new',
              label: 'Log Visit',
              active: pathname === '/solutions/discovery/new'
            }
          ]
        },
        {
          href: '/solutions/payments',
          label: 'Payments',
          active: pathname.startsWith('/solutions/payments'),
          icon: CreditCard,
          submenus: [
            {
              href: '/solutions/payments',
              label: 'All Payments',
              active: pathname === '/solutions/payments'
            },
            {
              href: '/solutions/payments/new',
              label: 'Record Payment',
              active: pathname === '/solutions/payments/new'
            }
          ]
        },
        {
          href: '/solutions/earnings',
          label: 'Earnings',
          active: pathname.startsWith('/solutions/earnings'),
          icon: TrendingUp,
          submenus: []
        },
        {
          href: '/solutions/publications',
          label: 'Publications',
          active: pathname.startsWith('/solutions/publications'),
          icon: BookOpen,
          submenus: [
            {
              href: '/solutions/publications',
              label: 'All Publications',
              active: pathname === '/solutions/publications'
            },
            {
              href: '/solutions/publications/new',
              label: 'Add Publication',
              active: pathname === '/solutions/publications/new'
            }
          ]
        },
        {
          href: '/solutions/products',
          label: 'Products & TRL',
          active: pathname.startsWith('/solutions/products'),
          icon: Lightbulb,
          submenus: [
            {
              href: '/solutions/products',
              label: 'All Products',
              active: pathname === '/solutions/products'
            },
            {
              href: '/solutions/products/new',
              label: 'Add Product',
              active: pathname === '/solutions/products/new'
            },
            {
              href: '/solutions/products/rdif',
              label: 'RDIF Readiness',
              active: pathname === '/solutions/products/rdif'
            }
          ]
        },
        {
          href: '/solutions/compliance',
          label: 'Compliance',
          active: pathname.startsWith('/solutions/compliance'),
          icon: ShieldCheck,
          submenus: []
        },
        {
          href: '/solutions/settings/types',
          label: 'Settings',
          active: pathname.startsWith('/solutions/settings'),
          icon: Settings,
          submenus: [
            {
              href: '/solutions/settings/types',
              label: 'Solution Types',
              active: pathname === '/solutions/settings/types'
            }
          ]
        }
      ]
    },
    {
      groupLabel: 'Talent Portals',
      menus: [
        {
          href: '/talent/builder',
          label: 'Builder Portal',
          active: pathname.startsWith('/talent/builder'),
          icon: Hammer,
          submenus: [
            {
              href: '/talent/builder',
              label: 'Dashboard',
              active: pathname === '/talent/builder'
            },
            {
              href: '/talent/builder/assignments',
              label: 'My Assignments',
              active: pathname === '/talent/builder/assignments'
            },
            {
              href: '/talent/builder/available',
              label: 'Available Phases',
              active: pathname === '/talent/builder/available'
            },
            {
              href: '/talent/builder/earnings',
              label: 'My Earnings',
              active: pathname === '/talent/builder/earnings'
            }
          ]
        },
        {
          href: '/talent/cohort',
          label: 'Cohort Portal',
          active: pathname.startsWith('/talent/cohort'),
          icon: Users,
          submenus: [
            {
              href: '/talent/cohort',
              label: 'Dashboard',
              active: pathname === '/talent/cohort'
            },
            {
              href: '/talent/cohort/sessions',
              label: 'Available Sessions',
              active: pathname === '/talent/cohort/sessions'
            },
            {
              href: '/talent/cohort/earnings',
              label: 'My Earnings',
              active: pathname === '/talent/cohort/earnings'
            }
          ]
        },
        {
          href: '/talent/production',
          label: 'Production Portal',
          active: pathname.startsWith('/talent/production'),
          icon: Palette,
          submenus: [
            {
              href: '/talent/production',
              label: 'Dashboard',
              active: pathname === '/talent/production'
            },
            {
              href: '/talent/production/queue',
              label: 'Work Queue',
              active: pathname === '/talent/production/queue'
            },
            {
              href: '/talent/production/earnings',
              label: 'My Earnings',
              active: pathname === '/talent/production/earnings'
            }
          ]
        }
      ]
    },
    {
      groupLabel: 'Client Portal',
      menus: [
        {
          href: '/portal/client',
          label: 'Client Dashboard',
          active: pathname === '/portal/client',
          icon: Building,
          submenus: []
        },
        {
          href: '/portal/client/projects',
          label: 'My Projects',
          active: pathname.startsWith('/portal/client/projects'),
          icon: Lightbulb,
          submenus: []
        },
        {
          href: '/portal/client/deliverables',
          label: 'My Deliverables',
          active: pathname.startsWith('/portal/client/deliverables'),
          icon: FileStack,
          submenus: []
        },
        {
          href: '/portal/client/invoices',
          label: 'My Invoices',
          active: pathname.startsWith('/portal/client/invoices'),
          icon: FileText,
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'Quality Management',
      menus: [
        {
          href: '/stakeholder-nps',
          label: 'Stakeholder NPS',
          active: pathname.startsWith('/stakeholder-nps'),
          icon: BarChart3,
          submenus: [
            {
              href: '/stakeholder-nps',
              label: 'Dashboard',
              active: pathname === '/stakeholder-nps'
            },
            {
              href: '/stakeholder-nps/surveys',
              label: 'Surveys',
              active: pathname.startsWith('/stakeholder-nps/surveys')
            },
            {
              href: '/stakeholder-nps/analytics',
              label: 'Analytics',
              active: pathname === '/stakeholder-nps/analytics'
            },
            {
              href: '/stakeholder-nps/feedback',
              label: 'Feedback',
              active: pathname === '/stakeholder-nps/feedback'
            }
          ]
        },
        {
          href: '/process-excellence',
          label: 'Process Excellence',
          active: pathname.startsWith('/process-excellence'),
          icon: Settings2,
          submenus: [
            {
              href: '/process-excellence',
              label: 'Dashboard',
              active: pathname === '/process-excellence'
            },
            {
              href: '/process-excellence/workflows',
              label: 'Workflows',
              active: pathname === '/process-excellence/workflows'
            },
            {
              href: '/process-excellence/metrics',
              label: 'Metrics',
              active: pathname === '/process-excellence/metrics'
            },
            {
              href: '/process-excellence/improvements',
              label: 'Improvements',
              active: pathname === '/process-excellence/improvements'
            }
          ]
        },
        {
          href: '/parent-portal',
          label: 'Parent Portal',
          active: pathname.startsWith('/parent-portal'),
          icon: UsersRound,
          submenus: [
            {
              href: '/parent-portal',
              label: 'Dashboard',
              active: pathname === '/parent-portal'
            },
            {
              href: '/parent-portal/access',
              label: 'Access Management',
              active: pathname.startsWith('/parent-portal/access')
            },
            {
              href: '/parent-portal/communications',
              label: 'Communications',
              active: pathname.startsWith('/parent-portal/communications')
            },
            {
              href: '/parent-portal/communication',
              label: 'Messages',
              active: pathname === '/parent-portal/communication'
            },
            {
              href: '/parent-portal/feedback',
              label: 'Feedback',
              active: pathname === '/parent-portal/feedback'
            }
          ]
        },
        {
          href: '/grievance',
          label: 'Grievance System',
          active: pathname.startsWith('/grievance'),
          icon: MessageSquareWarning,
          submenus: [
            {
              href: '/grievance/dashboard',
              label: 'Dashboard',
              active: pathname === '/grievance/dashboard'
            },
            {
              href: '/grievance',
              label: 'Tickets',
              active: pathname === '/grievance'
            },
            {
              href: '/grievance/analytics',
              label: 'Analytics',
              active: pathname === '/grievance/analytics'
            },
            {
              href: '/grievance/escalations',
              label: 'Escalations',
              active: pathname === '/grievance/escalations'
            }
          ]
        },
        {
          href: '/maturity-assessment',
          label: 'Maturity Assessment',
          active: pathname.startsWith('/maturity-assessment'),
          icon: Award,
          submenus: [
            {
              href: '/maturity-assessment',
              label: 'Dashboard',
              active: pathname === '/maturity-assessment'
            },
            {
              href: '/maturity-assessment/assessments',
              label: 'Assessments',
              active: pathname.startsWith('/maturity-assessment/assessments')
            },
            {
              href: '/maturity-assessment/roadmap',
              label: 'Roadmap',
              active: pathname === '/maturity-assessment/roadmap'
            },
            {
              href: '/maturity-assessment/benchmarks',
              label: 'Benchmarks',
              active: pathname === '/maturity-assessment/benchmarks'
            }
          ]
        }
      ]
    },
    {
      groupLabel: 'Accountability',
      menus: [
        {
          href: '/alumni',
          label: 'Alumni Outcomes',
          active: pathname === '/alumni' || pathname.startsWith('/alumni/outcomes'),
          icon: Award,
          submenus: [
            {
              href: '/alumni',
              label: 'Dashboard',
              active: pathname === '/alumni'
            },
            {
              href: '/alumni/outcomes',
              label: 'All Outcomes',
              active: pathname === '/alumni/outcomes'
            },
            {
              href: '/alumni/outcomes/new',
              label: 'Record Outcome',
              active: pathname === '/alumni/outcomes/new'
            }
          ]
        },
        {
          href: '/alumni/effectiveness',
          label: 'Program Effectiveness',
          active: pathname === '/alumni/effectiveness',
          icon: TrendingUp,
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'Learners Management',
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
          href: '/learners/leave-onduty',
          label: 'Leave/OnDuty',
          active: pathname.startsWith('/learners/leave-onduty'),
          icon: Briefcase,
          submenus: [
            {
              href: '/learners/leave-onduty/apply',
              label: 'Apply',
              active: pathname === '/learners/leave-onduty/apply'
            },
            {
              href: '/learners/leave-onduty/my-applications',
              label: 'My Applications',
              active: pathname === '/learners/leave-onduty/my-applications'
            }
          ]
        },
        {
          href: '/learners/my-gate-passes',
          label: 'My Gate Passes',
          active: pathname.startsWith('/learners/my-gate-passes'),
          icon: Key,
          submenus: [],
          requiresHostel: true
        } as any,
        // Parent self-service (only visible to parent role)
        {
          href: '/parent/child-gate-passes',
          label: "Child's Gate Passes",
          active: pathname.startsWith('/parent/child-gate-passes'),
          icon: Key,
          submenus: [],
          requiresParent: true
        } as any,

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
            },
            {
              href: '/learners/profiles/promotion',
              label: 'Student Promotion',
              active: pathname.startsWith('/learners/profiles/promotion')
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

    {
      groupLabel: 'Learners Council',
      menus: [
        {
          href: '/learners-council',
          label: 'LC Dashboard',
          active: pathname === '/learners-council',
          icon: Crown,
          submenus: []
        },
        {
          href: '/learners-council/structure',
          label: 'Structure',
          active: pathname.startsWith('/learners-council/structure'),
          icon: Network,
          submenus: [
            {
              href: '/learners-council/structure',
              label: 'Org Chart',
              active: pathname === '/learners-council/structure'
            },
            {
              href: '/learners-council/structure/terms',
              label: 'Terms',
              active: pathname === '/learners-council/structure/terms'
            },
            {
              href: '/learners-council/structure/members',
              label: 'Members',
              active: pathname === '/learners-council/structure/members'
            },
            {
              href: '/learners-council/structure/yuva',
              label: 'YUVA Chapters',
              active: pathname.startsWith('/learners-council/structure/yuva')
            }
          ]
        },
        {
          href: '/learners-council/communication',
          label: 'Communication',
          active: pathname.startsWith('/learners-council/communication'),
          icon: Megaphone,
          submenus: [
            {
              href: '/learners-council/communication',
              label: 'Announcements',
              active: pathname === '/learners-council/communication'
            },
            {
              href: '/learners-council/communication/polls',
              label: 'Polls',
              active: pathname === '/learners-council/communication/polls'
            },
            {
              href: '/learners-council/communication/forums',
              label: 'Forums',
              active: pathname === '/learners-council/communication/forums'
            },
            {
              href: '/learners-council/communication/chat',
              label: 'Chat',
              active: pathname === '/learners-council/communication/chat'
            }
          ]
        },
        {
          href: '/learners-council/events',
          label: 'Events',
          active: pathname.startsWith('/learners-council/events'),
          icon: CalendarCheck,
          submenus: [
            {
              href: '/learners-council/events/calendar',
              label: 'Calendar',
              active: pathname === '/learners-council/events/calendar'
            },
            {
              href: '/learners-council/events/proposals',
              label: 'Proposals',
              active: pathname === '/learners-council/events/proposals'
            }
          ]
        },
        {
          href: '/learners-council/od',
          label: 'OD Management',
          active: pathname.startsWith('/learners-council/od'),
          icon: ClipboardSignature,
          submenus: [
            {
              href: '/learners-council/od',
              label: 'My Requests',
              active: pathname === '/learners-council/od'
            },
            {
              href: '/learners-council/od/approvals',
              label: 'Approvals',
              active: pathname === '/learners-council/od/approvals'
            },
            {
              href: '/learners-council/od/chains',
              label: 'Approval Chains',
              active: pathname === '/learners-council/od/chains'
            }
          ]
        },
        {
          href: '/learners-council/selection',
          label: 'Selection & Elections',
          active: pathname.startsWith('/learners-council/selection'),
          icon: Vote,
          submenus: [
            {
              href: '/learners-council/selection',
              label: 'Active Elections',
              active: pathname === '/learners-council/selection'
            },
            {
              href: '/learners-council/selection/nominations',
              label: 'Nominations',
              active: pathname === '/learners-council/selection/nominations'
            },
            {
              href: '/learners-council/selection/nominations',
              label: 'Interviews',
              active: pathname === '/learners-council/selection/nominations'
            },
            {
              href: '/learners-council/selection',
              label: 'Elections',
              active: pathname === '/learners-council/selection'
            }
          ]
        },
        {
          href: '/learners-council/issues',
          label: 'Issues',
          active: pathname.startsWith('/learners-council/issues'),
          icon: Kanban,
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

    // NEW: Unified Learners Module (Will replace old modules)
  

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
            },
            {
              href: '/billing/receipts/templates',
              label: 'Receipt Templates',
              active: pathname === '/billing/receipts/templates'
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
        },
        {
          href: '/billing/copq',
          label: 'Cost of Poor Quality',
          active: pathname.startsWith('/billing/copq'),
          icon: TrendingDown,
          submenus: []
        }
      ]
    },
    {
      groupLabel: 'Social Media',
      menus: [
        {
          href: '/social-media',
          label: 'Dashboard',
          active: pathname === '/social-media',
          icon: Share2,
          submenus: [],
        },
        {
          href: '/social-media/accounts',
          label: 'Accounts',
          active: pathname.startsWith('/social-media/accounts'),
          icon: Eye,
          submenus: [
            {
              href: '/social-media/accounts',
              label: 'All Accounts',
              active: pathname === '/social-media/accounts',
            },
          ],
        },
        {
          href: '/social-media/analytics',
          label: 'Analytics',
          active: pathname === '/social-media/analytics',
          icon: BarChart3,
          submenus: [],
        },
      ],
    },
    {
      groupLabel: 'Campus Living',
      menus: [
        {
          href: '/campus-living',
          label: 'Dashboard',
          active: pathname === '/campus-living',
          icon: Building2,
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
              active: pathname.startsWith('/campus-living/allocations')
            },
            {
              href: '/campus-living/allocations/roommate-matching',
              label: 'Roommate Matching',
              active: pathname === '/campus-living/allocations/roommate-matching'
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
          href: '/admin/reset-driver-passwords',
          label: 'Reset Driver Passwords',
          active: pathname === '/admin/reset-driver-passwords',
          icon: KeyRound,
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
          active: pathname.startsWith('/admin/bug-reports'),
          icon: Bug,
          submenus: []
        },
        {
          href: '/bug-leaderboard',
          label: 'Bug Leaderboard',
          active: pathname === '/bug-leaderboard',
          icon: Trophy,
          submenus: []
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
export interface RoleBasedPagesOptions {
  isHostelResident?: boolean;
}

export function GetRoleBasedPages(
  pathname: string,
  userRole?: CustomRole | null,
  options?: RoleBasedPagesOptions
): MenuGroup[] {
  const allMenus = GetPages(pathname);

  // Super admin gets all menus EXCEPT student-only pages
  if (userRole?.role_key === 'super_admin') {
    return allMenus.map((group) => ({
      ...group,
      menus: group.menus.filter((menu) => {
        // Hide student portal pages (my-*) from super admin
        if (menu.href.includes('/learners/my-')) {
          return false;
        }
        // Hide talent portals (personal workspaces requiring individual enrollment)
        if (menu.href.startsWith('/talent/')) {
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

  // Filter menus based on permissions
  return allMenus
    .map((group) => {
      // Filter main menus
      const filteredMenus = group.menus
        .filter((menu) => {
          // Dashboard is always visible
          if (menu.href === '/') return true;

          // Check if menu requires super admin
          if ((menu as any).requiresSuperAdmin) {
            return false; // Hide from non-super admin users
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

          // Special case: Parent portal pages are ONLY for parents
          if ((menu as any).requiresParent) {
            return userRole.role_key === 'parent';
          }

          // Special case: Student portal pages (my-*) are ONLY for students
          if (menu.href.includes('/learners/my-')) {
            if (userRole.role_key !== 'student') return false;
            // Hostel-only menus (e.g. gate passes) require active hostel allocation
            if ((menu as any).requiresHostel && !options?.isHostelResident) return false;
            return true;
          }

          // Check if user has permission for this menu
          const requiredPermission = MENU_PERMISSIONS[menu.href];

          // If no specific permission is defined, hide by default (changed behavior)
          if (!requiredPermission) {
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
            const requiredPermission = MENU_PERMISSIONS[submenu.href];
            if (!requiredPermission) return false; // Changed to false to be consistent

            // Hide "Student Search" submenu for students
            if (isStudent && submenu.href === '/billing/schedule/students') {
              return false;
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
    .filter((group) => group.menus.length > 0); // Remove empty groups
}


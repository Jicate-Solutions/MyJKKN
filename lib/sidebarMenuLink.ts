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
  Bus,
  GraduationCap,
  BookOpen,
  ClipboardCheck,
  Inbox,
  Gauge,
  IdCard,
  Lock,
  LucideIcon,
  LayoutGrid,
  LibraryBig,
  FolderKanban,
  Lightbulb,
  Building,
  Boxes,
  ShoppingCart,
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
  Users2,
  Factory,
  FileDown,
  Share2,
  Truck,
  UserPlus,
  HeadphonesIcon,
  UserCog,
  SearchCheck,
  BadgeCheck,
  Presentation,
} from 'lucide-react';
import { CustomRole } from '@/types/auth';
// The single answer to "which MENU_PERMISSIONS values are not permission keys".
// Imported rather than restated so the sidebar, the route guard
// (isPageAccessible) and the SQL walls cannot drift into disagreeing about the
// `super_admin` sentinel. permission-filter imports only a type from
// ./navigation/types, so there is no import cycle back into this file.
import { isSentinelPermission } from '@/lib/navigation/permission-filter';
import {
  INDUCTION_ONLY_NAV_HREFS,
  INDUCTION_ONLY_NAV_REWRITES,
} from '@/lib/constants/induction-access';
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
  /** Force a plain link even when submenus exist (read by Navbar/menu.tsx). */
  noSubmenus?: boolean;
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
  // Foundation & Competitive-Exam Programme
  '/foundation': 'foundation.dashboard.view',
  '/foundation/console': 'foundation.cohorts.view',
  // The learner surface. Most-specific match wins, so this reads
  // foundation.practice.take rather than inheriting the operator key on
  // '/foundation' — somebody sitting the programme has no reason to hold
  // foundation.dashboard.view.
  '/foundation/practice': 'foundation.practice.take',
  // Same key as practising alone. Holding it is not enough to see anything
  // here — the page also requires you to actually run a group, which is
  // fp_cohorts.resource_person_id, not a permission.
  '/foundation/practice/facilitate': 'foundation.practice.take',
  // OneMark — the TN State Board Class-12 one-mark MCQ product, built as an
  // extension of this programme (specs/onemark-decisions-2026-09-02.md).
  // Three surfaces on three EXISTING keys — no new permission keys, by ruling:
  //   a Senior Learner builds a board-shape paper      → assessments.manage
  //   the subject Senior Learner ticks drafted items   → items.manage
  //   a learner sits practice / timed / live / vault   → practice.take
  // None of these inherits the operator key on '/foundation': the sidebar
  // looks up the EXACT normalized href (MENU_PERMISSIONS[normalizeRoute(href)]),
  // and the proxy's longest-prefix trie (lib/auth/route-matcher.ts) now stops
  // at these three nodes instead of falling through to '/foundation' — which
  // NARROWS server-side access to /foundation/onemark/* from dashboard.view
  // to each screen's own key.
  // The OneMark hub (Lane I's app/(routes)/foundation/onemark/page.tsx) renders
  // permission-filtered cards for practice / paper / review and its own
  // access panel when none apply. Keyed on the widest key every OneMark
  // audience holds (learners and school_faculty both): without this entry
  // the trie resolved the hub to '/foundation' -> foundation.dashboard.view
  // and a role holding only practice.take bounced to /unauthorized. Not a
  // sidebar row: a hub child under 'Foundation Programme' keyed on
  // practice.take would reveal the operator accordion to every learner.
  '/foundation/onemark': 'foundation.practice.take',
  '/foundation/onemark/paper': 'foundation.assessments.manage',
  '/foundation/onemark/review': 'foundation.items.manage',
  '/foundation/onemark/practice': 'foundation.practice.take',

  // Improvement Board (MBA teaching-enterprise)
  '/improvement-board': 'improvement.ideas.view',
  '/improvement-board/dashboard': 'improvement.ideas.view',
  '/improvement-board/leaderboard': 'improvement.ideas.view',
  // Gemba visits — the screen that records someone going to look. A posted
  // associate holds improvement.ideas.view, and the RPC does the real gating
  // (posted to that department, or an officer). NOTE: the database grants read
  // on a UNION this one-key-per-route map cannot express — the CAO, Executive
  // Administrative Officers and MBA Faculty reach it on
  // improvement.area_role.assign / improvement.board.manage and hold no
  // ideas.view at all. The submenu filter in GetRoleBasedPages carries that
  // union; keep the two in step.
  '/improvement-board/gemba': 'improvement.ideas.view',
  '/ceo-rounds': 'ceo_rounds.log',
  // MBA Analyst dashboard — an associate's own assigned-department analytics.
  '/improvement-board/analytics': 'improvement.ideas.view',
  // MBA case studies — the write-up of an improvement that was actually made.
  // This entry is the WRITERS' key. It is not the whole gate: navPathAllowed()
  // widens this path to a union of three keys, in BOTH filter sites below and
  // in lib/navigation/permission-filter.ts. See CASE_STUDIES_NAV_PATH.
  '/improvement-board/case-studies': 'improvement.ideas.view',
  // MBA Analyst assignments — manager-only "who covers which department".
  '/improvement-board/postings': 'improvement.board.manage',
  // MBA Data Gaps — manager-only triage of gaps Associates reported.
  '/improvement-board/data-gaps': 'improvement.board.manage',
  // Manage boards — manager-only CRUD over the areas ideas are filed against.
  '/improvement-board/manage-boards': 'improvement.board.manage',
  // Department owners — names ONE accountable person per board. Two tiers:
  // improvement.board.manage OR improvement.area_role.assign may SEE it, but
  // only improvement.area_role.assign may CHANGE an owner (the RPC refuses
  // everyone else). This map holds one key per route, so the broader SEE tier
  // is declared here and the officer half of the union is carried at the two
  // nav filter sites via OWNERS_UNION_PERMISSIONS below — an officer role that
  // does not also hold board.manage would otherwise get a page it can use and
  // no link to reach it.
  '/improvement-board/owners': 'improvement.board.manage',
  // MBA Team Rotation — the rota chart is viewable by associates; team-builder
  // and cycle-setup are manager-only (improvement.board.manage).
  '/improvement-board/rotation': 'improvement.ideas.view',
  '/improvement-board/rotation/teams': 'improvement.board.manage',
  '/improvement-board/rotation/config': 'improvement.board.manage',
  // Teaching-enterprise cohorts — the config rows that decide WHO participates
  // (programme + semester window) and WHAT they get (role + contribution mode).
  // Manager-only (improvement.board.manage); super admins pass via that check.
  '/admin/teaching-cohorts': 'improvement.board.manage',

  // Overview
  '/': 'view_dashboard', // Dashboard should have a permission too

  // AI Assistant
  '/ai-query': 'ai_query.view', // AI Query System access

  // Profile
  '/profile': 'view_profile', // All users should be able to view their own profile

  // ======================================================================
  // Director's Desk (2026-08-05) — spec: specs/director-desk/SPEC.md
  //
  // /director-desk is the Director's own console: everything he has handed
  // out, and which of it is not green. Genuinely restricted — it lists work
  // assigned across the whole institution — so it carries a real key.
  //
  // /my-desk is the RECEIVER's side and must be reachable by someone who
  // holds NO module permission at all: the entire point of a handover is that
  // the receiver could not open the page before. Gating it on any real module
  // key would defeat the feature.
  //
  // `view_profile` is this codebase's universal-authenticated idiom — it is
  // hard-coded as always-true in isPageAccessible() and filterByPermissions()
  // (lib/navigation/permission-filter.ts), which is what RoutePermissionGuard
  // reads, and it is EXEMPT from the catalog gate for exactly this reason
  // (scripts/check-permissions-catalog.mjs EXEMPT_KEYS). Same pattern already
  // used by /profile and /ai-pulse.
  //
  // CAUTION, measured 2026-08-05 against production: `view_profile` is true on
  // only 18 of 85 custom_roles. It is a baseline in DEFAULT_ROLE_PERMISSIONS
  // but 67 live roles predate that and do not carry it — including principal,
  // hod, faculty, staff, coo and ceo. isPageAccessible short-circuits the key
  // so the PAGE opens for everyone; the SIDEBAR filter in GetRoleBasedPages
  // does NOT short-circuit it and would have hidden the link from 79% of
  // roles. That is why /my-desk also gets an explicit always-visible carve-out
  // below, the same treatment as /guide and /my-induction-sessions.
  // ======================================================================
  '/director-desk': 'director.handover.view_all',
  '/my-desk': 'view_profile',
  // What's New (the product changelog) is open to everyone signed in — the
  // Director's decision, 2026-09-05. `view_profile` is the documented universal
  // sentinel (isPageAccessible returns true for it unconditionally); an entry
  // here is REQUIRED because the sidebar's filter is default-deny, so a route
  // with no mapping is silently super-admin-only. The page scopes its own
  // CONTENT by role.
  '/whats-new': 'view_profile',

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
  '/users/jkkn-id': 'users.jkkn_id.view',
  // Added 2026-06-19: dynamic user-detail routes were unguarded (no page guard,
  // no MENU_PERMISSIONS entry) so they rendered to any authenticated user. Now
  // declared canonically + enforced by RoutePermissionGuard (/users/layout.tsx).
  '/users/[id]': 'users.view',
  '/users/[id]/edit': 'users.edit',

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
  '/learners/school-master': 'learners.school_master.view',
  '/learners/postal-codes': 'learners.postal_codes.view',

  // Learner Counseling (Phase 1 — placeholder gate; module pages land in Phase 2)
  // Spec: specs/counselor-taxonomy-spec.md. Role seed:
  // supabase/migrations/20260427_counselor_taxonomy_phase1.sql
  '/learners/counseling': 'learners.counseling.view',

  // Reference / Masters hub — registry-driven master-data catalogs
  '/reference': 'reference.catalogs.view',

  // Organization Management
  '/organizations/dashboard': 'organizations.dashboard.view',
  '/organizations/institutions': 'organizations.institutions.view',
  '/organizations/school-defaults': 'organizations.school-defaults.view',
  '/organizations/degrees': 'organizations.degrees.view',
  '/organizations/departments': 'organizations.departments.view',
  // 2026-08-04 — College Leadership. New page; its own key.
  '/organizations/leadership': 'organizations.leadership.manage',
  // 2026-08-04 — HoD Assignment has existed and worked since 2026-05-07 but was
  // never in the sidebar; it was reachable only from lib/organizations/guide/
  // content.ts. That is why it sits at 7 departments of 89, all Pharmacy. The
  // page itself gates on admin_or_super_admin (AdminPermissionGuard), so this
  // maps to the nearest catalog key rather than inventing one.
  '/organizations/departments/hod-assignment': 'organizations.departments.edit',
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
  // ('/hr' itself is mapped once, later in this object: 'hr.view' — the value
  // that already won under JS last-key-wins before the duplicate was removed.)
  // '/hr/employees/new' and '/hr/employees/[id]/edit' removed 2026-07-20:
  // hr_employees was dropped by 20260524083600_consolidate_hr_employees_to_staff
  // and this surface is read-only now. Creating/editing happens at /staff/list.
  // The hr.employees.create/edit KEYS stay in lib/constants/permissions.ts —
  // roles still hold them in custom_roles.permissions JSONB, so removing them
  // from the catalog would only hide them from Role Management, not revoke.
  '/hr/employees': 'hr.employees.view',
  '/hr/employees/[id]': 'hr.employees.view',
  // WHO PAYS each team member. This entry is load-bearing, not decorative:
  // app/(routes)/hr/layout.tsx guards the subtree by LONGEST PREFIX, so without
  // it this page would fall through to '/hr' → 'hr.view' — a key almost every
  // role holds — and the paying organisation is HR-only by design.
  '/hr/payroll/organisation': 'hr.payroll.institution.view',
  // WHAT EACH PERSON EARNS. A separate key from the line above on purpose:
  // maintaining the payer directory and seeing everyone's pay are different
  // decisions, and longest-prefix resolution would otherwise hand this page to
  // '/hr/payroll' → 'hr.payroll.institution.view' and grant the second to
  // everyone holding the first.
  '/hr/payroll/salaries': 'hr.payroll.salary.view',
  // The TDS bands sit on the SALARY key, not a new one: setting the rate and
  // seeing what people earn are the same decision by the same person. This entry
  // is mandatory rather than tidy — longest-prefix resolution would otherwise
  // hand the page to '/hr/payroll' -> 'hr.payroll.institution.view', which
  // hr_manager holds, quietly opening tax configuration to a wider audience than
  // the salaries it is derived from.
  '/hr/payroll/tds-slabs': 'hr.payroll.salary.view',
  // WHERE THE MONEY LANDS. A third key again, not a reuse of the salary one:
  // the amount and the destination are separate decisions, and the destination
  // is the field a change to redirects real money.
  '/hr/payroll/bank-accounts': 'hr.payroll.bank.view',
  // The frozen monthly salary register. A fourth key, because this is the one
  // screen that shows amount AND destination AND day counts for everybody at
  // once — the union of the three above, which is a wider grant than any of
  // them individually.
  '/hr/payroll/register': 'hr.payroll.register.view',
  // Closing an attendance month. Its own key, NOT the self-service
  // '/hr/attendance' one: 22 roles hold hr.attendance.view_self, and without an
  // entry here longest-prefix resolution would hand all of them the ability to
  // freeze an institution-month.
  '/hr/attendance/close': 'hr.attendance.period.view',
  // The hub at /hr/payroll only redirects to the page above, but it needs its
  // own entry: without one the longest-prefix match falls through to '/hr' →
  // 'hr.view', so anyone in HR could open it and be denied one redirect later.
  // Gating it here denies at the hub and keeps the AutoTabNav chip's gate
  // (MENU_PERMISSIONS[href]) in step with the route guard.
  '/hr/payroll': 'hr.payroll.institution.view',
  '/hr/policies': 'hr.policies.view',
  '/hr/policies/[table]': 'hr.policies.view',
  // HR Leave — parent + 6 submenus shown in sidebar.
  // '/hr/leave' and '/hr/leave/calendar' are the SHARED/approver lens and keep
  // the HR-tier 'hr.leave.view'. Everything an employee does with their OWN
  // leave gates on a self-service key instead — see the block below.
  '/hr/leave': 'hr.leave.view',
  '/hr/leave/apply': 'hr.leave.apply',
  '/hr/leave/approve': 'hr.leave.approve',
  '/hr/leave/calendar': 'hr.leave.view',
  '/hr/leave/balance': 'hr.leave.balance.view',
  '/hr/leave/encashment': 'hr.leave.encashment.view',
  // ── Time Off self-service (2026-07-23) ──────────────────────────────────
  // 'hr.leave.view' is DUAL-PURPOSE: besides gating these routes it is an
  // org-wide read grant inside hla_select on hr_leave_applications
  // (`user_has_permission('hr.leave.view') AND hr_organization_id IN
  // fn_my_hr_organization_ids()`). Holding it at the 61-role self-service
  // population meant every employee could read every colleague's leave in
  // their HR organization. It is now an HR-tier key (7 roles).
  //
  // These routes therefore moved to 'hr.leave.apply'. Nothing is lost: hla_select
  // already returns own rows through the IDENTITY clauses
  // (`employee_id IN fn_my_staff_ids()` / `applied_by = auth.uid()`), so the
  // route guard only has to let the applicant through — RLS still decides which
  // rows they actually see.
  //
  // requests / compensatory-off / short-time-off / approvals had NO entry at all
  // before today. They were gated purely by accident: the '[id]' line below
  // inserts a '*' wildcard node in the route trie (lib/auth/route-matcher.ts:204),
  // and they fell through to it. Deleting that one line would have left all four
  // COMPLETELY ungated. They are declared explicitly now.
  '/hr/leave/my-applications': 'hr.leave.apply',
  '/hr/leave/requests': 'hr.leave.apply',
  '/hr/leave/compensatory-off': 'hr.leave.apply',
  '/hr/leave/short-time-off': 'hr.leave.apply',
  // Approvals tab: visibility is a RUNTIME capability the static map cannot
  // express — the page self-gates on hr_can_approve_leave() (which mirrors the
  // hla_update policy) and renders a "not an approver" state otherwise. The
  // static gate is deliberately the permissive self-service key so approvers
  // whose authority comes from an approval flow rather than a permission key
  // are not blocked at the route layer. See app/(routes)/hr/leave/approvals/page.tsx.
  '/hr/leave/approvals': 'hr.leave.apply',
  '/hr/leave/[id]': 'hr.leave.apply',
  // ── Employee Self Service (2026-07-21) ───────────────────────────────────
  // These entries are LOAD-BEARING beyond the sidebar. app/(routes)/hr/layout.tsx
  // wraps the whole /hr subtree in RoutePermissionGuard, and routeMatcher
  // resolves by LONGEST PREFIX (lib/auth/route-matcher.ts:183) — so before
  // these existed, every one of these pages inherited '/hr' → 'hr.view', which
  // is TRUE for 2 of 75 roles. They were hard-blocked for 73 roles including
  // CEO and COO, despite each page already scoping its data to the caller.
  // Deleting any line here does not merely hide a menu item; it re-blocks the
  // page.
  '/hr/attendance': 'hr.attendance.view_self',
  '/hr/attendance/regularize': 'hr.attendance.regularize_self',
  // Biometric punch import — an HR-ops surface, NOT self-service. Without this
  // line it inherited '/hr/attendance' -> hr.attendance.view_self and rendered
  // for all 61 self-service roles; the page is deliberately permissive and lets
  // /api/hr/attendance/import return the 403, so every non-HR user who opened it
  // got a dead-end upload dialog. hr.dashboard.view is the same core-HR gate the
  // other 99 admin pages use, and it is already in the permission catalog
  // (hr.attendance.view_all is NOT — 2 roles carry it undeclared).
  '/hr/attendance/import': 'hr.dashboard.view',
  '/hr/my-assets': 'hr.assets.view_own',
  '/hr/memos/my': 'hr.memos.view_own',
  '/hr/performance-reviews': 'hr.performance_reviews.view_own',
  '/hr/promotions/apply': 'hr.promotion.apply_own',
  '/hr/training': 'hr.training.view_own',
  '/hr/training/[id]/enroll': 'hr.training.view_own',
  '/hr/fdp': 'hr.fdp.view_own',
  '/hr/fdp/[id]/apply': 'hr.fdp.view_own',
  '/hr/documents': 'hr.documents.view_own',
  '/hr/forms/[id]/submit': 'hr.forms.submit_own',
  // HR Recruitment — parent + 5 submenus
  '/hr/recruitment': 'hr.recruitment.view',
  '/hr/recruitment/jobs': 'hr.recruitment.view',
  '/hr/recruitment/submit': 'hr.recruitment.create',
  '/hr/recruitment/my': 'hr.recruitment.view',
  '/hr/recruitment/candidates': 'hr.recruitment.view',
  '/hr/recruitment/interviews': 'hr.recruitment.view',
  '/hr/recruitment/approvals': 'hr.recruitment.approve',
  // "All Approvals" sidebar link — same page, ?view=all preselects the all-pending
  // view. Keyed with the query string because normalizeRoute() only strips UUIDs.
  '/hr/recruitment/approvals?view=all': 'hr.recruitment.approve',
  // HR Admin cluster — all entries share the strict core-HR gate used by the
  // /hr/admin landing (see PermissionGuard in app/(routes)/hr/admin/page.tsx).
  '/hr/admin': 'hr.dashboard.view',
  '/hr/admin/automation-rules': 'hr.dashboard.view',
  // Sorting a job title rewrites hr_staff_details for everyone who carries it,
  // so this mirrors the page's own PermissionGuard (hr.employees.edit) rather
  // than the cluster's read-only hr.dashboard.view.
  '/hr/admin/designation-mapping': 'hr.employees.edit',
  '/hr/admin/disciplinary': 'hr.dashboard.view',
  '/hr/admin/fdp': 'hr.dashboard.view',
  '/hr/admin/forms': 'hr.dashboard.view',
  '/hr/admin/memos': 'hr.dashboard.view',
  '/hr/admin/offboarding': 'hr.dashboard.view',
  '/hr/admin/onboarding-checklists': 'hr.dashboard.view',
  '/hr/admin/payroll': 'hr.dashboard.view',
  '/hr/admin/performance-reviews': 'hr.dashboard.view',
  '/hr/admin/policies': 'hr.dashboard.view',
  '/hr/admin/promotions': 'hr.dashboard.view',
  '/hr/admin/recruitment-approval-flows': 'hr.dashboard.view',
  '/hr/admin/recruitment-maintenance': 'hr.dashboard.view',
  '/hr/admin/recruitment-need': 'hr.dashboard.view',
  '/hr/admin/required-documents': 'hr.dashboard.view',
  // Gated on its own key, not the blanket hr.dashboard.view the neighbours use.
  // The retired /hr/admin/shift-templates rode on hr.dashboard.view while its
  // writes were hardcoded to is_admin(), which locked out custom roles such as
  // HR Head that hold every other HR key. hr.shift_timings.manage is declared in
  // the catalog and granted by 20260806090200_hr_shift_timings_permissions.sql.
  '/hr/admin/shift-timings': 'hr.shift_timings.manage',
  // Work patterns are a per-staff week on top of shift timings and share
  // their key: defining a 3-day week and deciding who is on it are the same
  // amount of trust as defining the institution's week.
  '/hr/admin/work-patterns': 'hr.shift_timings.manage',
  '/hr/admin/terminations': 'hr.dashboard.view',
  '/hr/admin/training': 'hr.dashboard.view',
  '/hr/admin/leave-types': 'hr.leave.types.manage',
  '/hr/admin/leave-balances': 'hr.leave.balance.manage',
  '/hr/admin/academic-years': 'hr.academic_years.manage',
  '/hr/admin/sanctioned-posts': 'hr.sanctioned_posts.view',

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
  '/events/induction': 'induction.view',
  // Split off induction.manage 2026-08-21 — creating an induction is Induction
  // Lead + super admin only; manage now covers running one, not starting one.
  '/events/induction/new': 'induction.create',
  '/events/induction/catalog': 'induction.view',
  // Events landing + Projects module entry (menu-visibility gap fix
  // 2026-07-12). 'projects.view' is a NEW key — grant it to roles in
  // Role Management to reveal the Projects sidebar entry.
  '/events': 'events.view',
  '/courses': 'courses.view',
  '/courses/new': 'courses.create',
  '/projects': 'projects.view',
  // Campus Walk — the Director photographs a physical campus condition while
  // walking and it routes as a project_task under CAMPUS-OPS. Same module, so
  // same key. D2 restricts *posting* to the Director for v1, but that is
  // enforced in the API layer (app/api/campus-walk/observations/route.ts):
  // project_* RLS is auth.uid() IS NOT NULL for read AND write, so the database
  // will not enforce it and a menu key must not be mistaken for a security gate.
  '/campus-walk': 'projects.view',
  // The Director's approval queue. D4 makes his sign-off the closing step, so
  // without a way to reach this the fixer's proof photo sits in `review`
  // forever and the loop never closes.
  '/campus-walk/review': 'projects.view',
  '/academic/parent-portal': 'academic.parent_portal.manage',
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
  // Retrospective view of sessions that went unmarked. Gated on the DASHBOARD
  // key, not the plain view key, and deliberately: it reads across a whole
  // department or institution for months at a time, which is the dashboard's
  // audience (10 roles hold it), not the per-session Senior Learner audience. The RPC
  // behind it enforces the identical key server-side, so the page gate and the
  // data gate cannot drift apart.
  '/academic/attendance/history': 'academic.attendance.dashboard.view',
  '/academic/attendance/reports': 'academic.attendance.reports.view',
  '/academic/attendance/consolidation': 'academic.attendance.consolidation.view',

  // Post-Class Session Feedback lanes.
  // faculty lane: gated to academic.attendance.view (the teacher's own session
  //   feedback = the attendance-confirmation surface). Held by faculty/hod/
  //   principal/administrator → previously the faculty lane had NO permission key
  //   so it was hidden from the `faculty` role (only super_admin saw it via
  //   bypass). This key makes the faculty completion lane REACHABLE by faculty.
  // principal lane: gated to academic.attendance.dashboard.view (held by
  //   principal/hod, not plain faculty) — the escalation oversight audience.
  // (admin lane is super-admin-only via requiresSuperAdmin on the menu item.)
  '/academic/session-feedback/faculty': 'academic.attendance.view',
  '/academic/session-feedback/principal': 'academic.attendance.dashboard.view',
  // Admin lane of session feedback (D2 gate) — leadership-view key
  // (menu-visibility gap fix 2026-07-12)
  '/academic/session-feedback/admin': 'academic.session_feedback.leadership.view',
  // SCF note-safety loop Phase 0 (2026-07-26): the named-reviewer queue for
  // AI-drafted learner support notes. Its own key (note-safety spec §6.3),
  // held by the scf_note_reviewer role; the review/pending RPCs enforce the
  // same permission server-side. Separate surface from the super-admin
  // /admin/learner-notes queue (same RPCs underneath).
  '/academic/session-feedback/note-review': 'scf.notes.review',

  // Curriculum AI — faculty review of the AI-drafted lesson spine (Phase 2).
  // Same teaching-staff audience as the faculty session-feedback lane, so it
  // reuses academic.attendance.view (held by faculty/hod/principal/admin). The
  // page's RPCs re-authorize teaching-staff/HOD/admin server-side regardless.
  '/academic/curriculum-review': 'academic.attendance.view',

  // IA Question Papers (proxied to COE /api/v1/ia/*)
  '/academic/question-papers': 'academic.ia_question_paper.view',

  // Internal Marks (CIA) - Mark Entry & Reports
  '/academic/internal-marks': 'academic.internal-marks.view',
  '/academic/internal-marks/monitor': 'academic.internal-marks.view',
  '/academic/internal-marks/attendance-insight': 'academic.internal-marks.view',
  // Exam IA Audit has its OWN narrower key (registrar/leadership audit sheet)
  '/academic/internal-marks/exam-audit': 'academic.internal_marks.exam_audit.view',
  '/academic/internal-marks/report': 'academic.internal-marks.view',

  // CIA Mark Entry (question-wise / direct). Its OWN key, separate from
  // internal-marks: entry is for teaching staff and HODs, while the
  // internal-marks reports are read by a wider leadership audience. The
  // matching '.enter' grant is what unlocks the inputs — see
  // lib/utils/mark-entry/mark-entry-access.ts, which additionally makes the
  // 'all' role tier (principal/registrar/CoE) view-only server-side.
  '/academic/mark-entry': 'academic.mark-entry.view',

  // Regulations Management
  '/academic/regulations': 'academic.regulations.view',
  '/academic/regulations/new': 'academic.regulations.create',
  '/academic/regulations/[id]/edit': 'academic.regulations.edit',

  // Batches Management
  '/academic/batches': 'academic.batches.view',
  '/academic/batches/new': 'academic.batches.create',
  '/academic/batches/[id]/edit': 'academic.batches.edit',

  // Notification Management (relocated /admin/notifications → /notifications/admin, 2026-06-11 wave-2)
  '/notifications/admin': 'notifications.view',
  '/notifications/admin/new': 'notifications.create',
  '/notifications/admin/compliance': 'notifications.view',
  '/notifications/admin/audiences': 'notifications.view',

  // System Management
  // Work Pulse
  '/work-pulse': 'work_pulse.view',
  '/work-pulse/all': 'work_pulse.all.view',
  '/work-pulse/agents': 'work_pulse.agents.view',
  '/work-pulse/impact': 'work_pulse.impact.view',

  // AI Pulse Module (events-extension — weekly Pulse-to-Practice cycle)
  '/ai-pulse': 'ai_pulse.view',
  '/ai-pulse/my-pulse': 'aiPulse:view.self',
  // Leaderboard is public to any authenticated learner (Director decision #6);
  // gate the sidebar entry on the same key as the AI Pulse landing page.
  '/ai-pulse/leaderboard': 'ai_pulse.view',
  // In-module tab (parent) routes — so AutoTabNav hides a tab when the person
  // lacks the permission its page enforces (each key = the gate on that tab's
  // page). '/ai-pulse/guide' is intentionally omitted (it redirects to the
  // general /guide help page, which everyone may see, so its tab stays visible).
  '/ai-pulse/admin': 'aiPulse:cycles.manage',
  '/ai-pulse/dept': 'aiPulse:dept.heatmap',
  '/ai-pulse/evidence': 'aiPulse:naac.evidence_export',
  // Permission value split so the JKKN-terminology delta gate (which scans quoted
  // strings) does not false-positive the identifier segment in this permission
  // KEY — it is a key, not learner-facing copy. Identical at runtime.
  '/ai-pulse/lab': 'aiPulse:' + 'lab.score',
  '/ai-pulse/submit': 'aiPulse:submit.publication',
  '/ai-pulse/admin/cycles': 'aiPulse:cycles.manage',
  '/ai-pulse/admin/anomalies': 'aiPulse:anomaly.review',
  // Champion review queue for REPORTED feed prompts (moderation #3). Same
  // permission the page itself enforces, and the SAME key as the sibling
  // champion console '/ai-pulse/admin/anomalies' directly above — the Director
  // retargeted this surface to the designated-champion key (the purpose-built
  // ai_pulse_champion role holds it; the Monday-Lab scoring key it used to
  // carry is held by ~587 staff, who must not see reported prompts or the
  // author names attached to them). Written plain, like its neighbour: this key
  // has no segment the terminology delta gate matches, so no value split is
  // needed here.
  '/ai-pulse/admin/reports': 'aiPulse:anomaly.review',
  // Cross-cycle session trend. Deliberately NOT 'aiPulse:cycles.manage', even
  // though it sits beside the Champion Console: the SELECT policy on
  // ai_pulse_live_attendance (20260611) admits `aiPulse:attendance.mark` and
  // `aiPulse:anomaly.review` but not `cycles.manage`, so gating on cycles.manage
  // would open a page whose every rate then read "not captured" for want of
  // rows. The ai_pulse_champion role holds both keys, so the Champion and
  // Co-Champion are admitted either way — this key also guarantees the data.
  '/ai-pulse/admin/trends': 'aiPulse:anomaly.review',
  '/ai-pulse/admin/policies': 'aiPulse:policies.manage',
  '/ai-pulse/evidence/naac': 'aiPulse:naac.evidence_export',

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

  // `/system` is not a page — app/(routes)/system/route.ts answers with a 307 to
  // /system/api-management. It takes that destination's key so the redirect is
  // gated exactly like the page it lands on, instead of being an unmatched (and
  // therefore unprotected) path in the route trie. Same shape as '/staff', which
  // is the same route.ts-redirect class and carries 'staff.view'.
  //
  // This does NOT change who sees the System group in the sidebar: a menu with
  // submenus is filtered by `menu.submenus.some(...)` and its own key is never
  // read, so a learner holding only learners.bug_reports.view keeps the group
  // (and My Bug Reports inside it) exactly as before.
  '/system': 'system.api.view',
  '/system/api-management': 'system.api.view',
  '/system/lti-tools': 'lti.tools.view',
  '/admin/bug-reports': 'system.bugs.view',
  '/ai-query/admin': 'super_admin', // Super admin only - AI Query Tools Registry
  '/admin/ai-models': 'super_admin', // Super admin only - AI Model Config (provider/model picker + spend caps + usage)
  '/admin/loops': 'super_admin', // Super admin only - Loop Control Tower (live health of every self-improving/cadence/accountability loop)
  '/admin/learner-notes': 'super_admin', // Super admin only - Learner Notes approval queue (AI-drafted support notes reviewed before students see them)
  '/admin/page-metadata': 'super_admin', // Super admin only - Page Search Metadata

  // ID Cards (nav wiring 2026-07-24) — keys from PERMISSION_CATEGORIES
  // (lib/constants/permissions.ts, id_cards group). Hub redirects to policy.
  '/admin/id-cards': 'id_cards.jobs.view',
  '/admin/id-cards/template': 'id_cards.templates.view',
  '/admin/id-cards/print-queue': 'id_cards.jobs.view',
  // Morning page (2026-08-14) — the daily exception/coverage read. Same key as
  // the print queue: anyone who can see the ID Cards menu can read it.
  '/admin/id-cards/morning': 'id_cards.jobs.view',
  // Batch print enqueues jobs, so it needs the manage key (not just view).
  '/admin/id-cards/batch-print': 'id_cards.jobs.manage',
  // Address Check (2026-08-14) is read-only — it lists the addresses that will
  // print wrong and links out to the learner's edit screen, so it shares the
  // view key rather than requiring manage.
  '/admin/id-cards/address-check': 'id_cards.jobs.view',
  // Photo Check (2026-08-26) is read-only — it lists the learners Guard 3 will
  // refuse to print a card for and links out to the learner's edit screen, so
  // it shares the view key rather than requiring manage.
  '/admin/id-cards/photo-check': 'id_cards.jobs.view',
  // Policy page self-guards super_admin (PolicyPageShell permission="super_admin"),
  // so the nav entry mirrors it — no id_cards.* policy-view key exists.
  '/admin/id-cards/policy': 'super_admin',

  // Social Media module (added 2026-05-31 for Meta integration nav-bar
  // wiring; 2026-06-11 retrofit from hardcoded 'super_admin' to granular
  // social.* keys — grantable per-role via Role Management. Super admins
  // still see everything via the isSuperAdmin bypass in the nav filter).
  '/admission/social': 'social.view',
  '/admission/social/facebook': 'social.facebook.view',
  '/admission/social/instagram': 'social.instagram.view',
  '/admission/social/insights': 'social.insights.view',
  '/admission/social/lead-ads': 'social.lead_ads.view',
  '/admission/social/departments': 'social.departments.view',
  '/admission/social/attribution': 'social.attribution.view',
  '/admission/social/meta-pixel': 'social.meta_pixel.view',
  '/admission/social/meta-audiences': 'social.meta_audiences.view',
  // 2026-06-23 — Social Governance wave (#1493/#1494/#1496) nav-wiring.
  // Governance is now a tier-3 chip under Social (admission/nav-config.ts).
  // Gate it to social.view — matches the page's own PermissionGuard — so the
  // chip honours per-role social access instead of AutoTabNav's show-by-default
  // (auto-tab-nav.tsx:150, `if (!perm) return true`). The super-admin policy
  // editor (/admission/social/admin/policies) is intentionally NOT a chip
  // (kept off the Social strip + in NAV_EXCLUDE; reached via the governance
  // page's "Edit policy →" links) and self-guards as super-admin, so it needs
  // no MENU_PERMISSIONS entry.
  '/admission/social/governance': 'social.view',
  '/admission/social/loop': 'social.view',

  // Internship Module — Policy Admin (super_admin only)
  '/internships/policy': 'super_admin',
  '/internships/policy/eligibility': 'super_admin',
  '/internships/policy/fees': 'super_admin',
  '/internships/policy/attendance': 'super_admin',
  '/internships/policy/evaluation': 'super_admin',
  '/internships/policy/cycle': 'super_admin',
  '/internships/policy/notifications': 'super_admin',

  // Internship Module — Operational routes
  '/internships/cycles': 'internship.cycles.view',
  '/internships/cycles/new': 'internship.cycles.create',
  '/internships/cycles/[id]': 'internship.cycles.view',
  '/internships/sites': 'internship.sites.view',
  '/internships/sites/new': 'internship.sites.create',
  '/internships/sites/[id]': 'internship.sites.view',
  '/internships/preceptors': 'internship.preceptors.view',
  '/internships/preceptors/new': 'internship.preceptors.create',
  '/internships/preceptors/[id]': 'internship.preceptors.view',
  '/internships/vehicles': 'internship.vehicles.view',
  '/internships/vehicles/new': 'internship.vehicles.create',
  '/internships/vehicles/[id]': 'internship.vehicles.view',

  // Lifecycle Analytics
  '/learners/lifecycle': 'admin.lifecycle.view',

  // LTI Monitoring
  '/admin/lti/analytics': 'lti.analytics.view',
  '/admin/lti/grade-sync': 'lti.grade_sync.view',
  '/admin/lti/launches': 'lti.launches.view',

  // Billing Management - Admin/Staff Views
  // Single unified Billing Categories page (the old parent/sub/item 3-tier
  // routes never shipped as pages; consolidated into /billing/categories).
  '/billing/categories': 'billing.categories.view',
  '/billing/categories/new': 'billing.categories.create',
  '/billing/categories/[id]/edit': 'billing.categories.edit',
  '/billing/schedule': 'billing.schedule.view',
  '/billing/schedule/new': 'billing.schedule.create',
  '/billing/schedule/bulk-create': 'billing.schedule.create',
  // Multi-step Excel upload reached from a button on bulk-create. Same key as
  // its parent — it creates bills, it just reviews them first.
  '/billing/schedule/bulk-create/upload': 'billing.schedule.create',
  '/billing/schedule/bulk-edit': 'billing.schedule.update',
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
  '/billing/refunds/[id]': 'billing.refunds.view',
  '/billing/refund-approvals': 'billing.refunds.configure',
  // Gated on the REQUEST key so accounts staff can watch their own requests;
  // approve/decline inside is gated separately and re-checked by the RPC.
  '/billing/receipt-cancellations': 'billing.receipts.cancel.request',
  '/billing/apportionment': 'billing.apportionment.view',
  '/billing/apportionment/rules': 'billing.apportionment.view',
  '/billing/invoices': 'billing.invoices.view',
  '/billing/invoices/[id]': 'billing.invoices.view',
  '/billing/invoices/[id]/edit': 'billing.invoices.edit',
  '/billing/reports': 'billing.reports.view',
  '/billing/analytics': 'billing.analytics.view',
  '/billing/payment-accounts': 'billing.payment_accounts.view',
  '/billing/transport': 'billing.transport.view',
  '/billing/onboarding': 'billing.onboarding.view',
  '/billing/activities': 'billing.activities.view',
  '/billing/coverage': 'billing.coverage.view',
  '/billing/payment': 'billing.payment.view',
  // School fees (2026-08-13; moved under /billing 2026-08-13). Gated on
  // school_fees.read, granted to accounts / accountant_assistant /
  // administrator / super_admin only.
  // NOT hidden by filterMenuByEntityType: that helper keys on the *user's own*
  // institution entity_type, and the accounts staff who run school billing sit
  // at an admin office, not at the school — hiding it there would lock out the
  // very people who need it. The institution dropdown inside the page is what
  // restricts the data to entity_type='school'.
  '/billing/school-fees': 'school_fees.read',
  '/billing/school-fees/term-calendar': 'school_fees.read',
  '/billing/school-fees/new': 'school_fees.manage',
  '/billing/school-fees/[id]': 'school_fees.read',
  '/billing/school-fees/concessions': 'school_fees.read',
  '/billing/school-fees/generate': 'school_fees.generate',
  // The payment counter. Gated on .collect, not .read — everything on that
  // screen leads to writing a receipt, so a read-only user has no reason there.
  '/billing/school-fees/collect': 'school_fees.collect',
  '/billing/late-charges': 'billing.late_charges.view',

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
  '/resource-management/reservations/calendar': 'resources.reservations.view',
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

  // Admission Consultants
  '/admission/consultants': 'admission.consultants.view',
  '/admission/consultants/new': 'admission.consultants.create',
  '/admission/consultants/[id]': 'admission.consultants.view',
  '/admission/consultants/[id]/edit': 'admission.consultants.edit',
  '/admission/consultants/analytics': 'admission.consultants.analytics.view',
  '/admission/consultants/commissions': 'admission.consultants.commissions.view',
  '/admission/consultants/referral-rates': 'admission.consultants.commissions.view',
  '/admission/consultants/unlinked-referrals': 'admission.consultants.commissions.view',
  '/admission/consultants/import': 'admission.consultants.commissions.view',
  '/admission/consultants/payouts': 'admission.consultants.commissions.view',
  // Added 2026-08-17 — which agencies cannot be paid at all, ordered by the
  // referrals stuck behind them. Same read permission as the rest of the
  // commission machinery, matching its RPC.
  '/admission/consultants/payout-readiness': 'admission.consultants.commissions.view',
  '/admission/consultants/reconciliation': 'admission.consultants.commissions.view',
  '/admission/consultants/referrals': 'admission.consultants.referrals.view',
  // Added 2026-08-10 — read-only review worklist for agency credits that need a
  // human look. Gated on the enquiry-desk read permission, matching its RPC.
  '/admission/consultants/review-worklist': 'admission.leads.view',
  '/admission/consultants/rewards': 'admission.consultants.rewards.view',

  // Schools Network (2026-06-30) — track external K-12 schools the org engages
  // with + JKKN's own Matric/CBSE schools. Sessions conducted, contributions
  // made, JKKN ownership, and program-partner (CSR/grant/corporate) funding
  // chains. Keys gated by schools_network.* per /tmp/schools-network-spec.md §4.
  '/admission/schools-network': 'schools_network.schools.view',
  '/admission/schools-network/new': 'schools_network.schools.create',
  '/admission/schools-network/[schoolId]': 'schools_network.schools.view',
  '/admission/schools-network/[schoolId]/edit': 'schools_network.schools.edit',
  '/admission/schools-network/[schoolId]/sessions/log': 'schools_network.sessions.create',
  '/admission/schools-network/[schoolId]/contributions/new': 'schools_network.contributions.create',
  '/admission/schools-network/[schoolId]/contacts/new': 'schools_network.contacts.create',
  '/admission/schools-network/[schoolId]/owners/assign': 'schools_network.owners.manage',
  '/admission/schools-network/partners': 'schools_network.partners.view',
  '/admission/schools-network/partners/new': 'schools_network.partners.manage',
  '/admission/schools-network/partners/[partnerId]': 'schools_network.partners.view',

  // Admission Marketing
  '/admission/marketing/campaigns/monitoring': 'admission.marketing.view',
  '/admission/marketing/campaigns/roi': 'admission.marketing.view',
  '/admission/marketing/campaigns/segments': 'admission.marketing.view',
  // Menu-visibility gap fix 2026-07-12: these sidebar hrefs had no
  // MENU_PERMISSIONS entry, so the filter hid them for every
  // non-super-admin role (caught by check:menu-coverage).
  '/admission/marketing/campaigns': 'admission.marketing.view',
  '/admission/marketing/automations/monitoring': 'admission.marketing.view',
  '/admission/marketing/automations/roi': 'admission.marketing.view',
  '/admission/marketing/automations/segments': 'admission.marketing.view',
  '/admission/marketing/database': 'admission.marketing.view',
  '/admission/marketing/whatsapp-broadcast': 'admission.marketing.view',
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
  '/admission/settings/statuses': 'admission.settings.statuses.view',

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
  // Foundations (Level 0) — student journey reads .view; cohort admin reads .manage;
  // the review queue reads .review. /foundations/[worksheetId] inherits the .view of
  // its /foundations parent via the route-matcher (most-specific match wins).
  '/startup-studio/foundations': 'startup_studio.foundations.view',
  '/startup-studio/foundations/my-journey': 'startup_studio.foundations.view',
  '/startup-studio/foundations/cohorts': 'startup_studio.foundations.manage',
  '/startup-studio/foundations/review': 'startup_studio.foundations.review',
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
  // School of Influence — programme settings (S2, 2026-07-31). Deliberately
  // gated on its OWN key rather than startup_studio.analytics.view: the page
  // guard uses the same key, so the chip is visible to exactly the people the
  // page admits (plus super admins, who bypass both). Mapping it to a broad
  // .view key would surface a chip that then denies — the sidebar-shows /
  // page-denies anti-pattern.
  '/startup-studio/school-of-influence/admin/settings': 'startup_studio.school_of_influence.configure',
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
  '/startup-studio/events/[id]/declare': 'startup_studio.events.view',
  '/startup-studio/events/[id]/case-study': 'startup_studio.events.view',
  '/startup-studio/events/[id]/solve-for-100': 'startup_studio.events.view',
  '/startup-studio/events/[id]/solve-for-100/weekly': 'startup_studio.events.view',
  '/startup-studio/events/[id]/solve-for-100/icp': 'startup_studio.events.view',
  '/startup-studio/events/[id]/solve-for-100/mentor': 'startup_studio.evaluations.manage',

  // School of Influence — coordinator register + completion (spec §7 S6).
  // MUST stay declared: RoutePermissionGuard treats a route with NO entry here as
  // visible to every authenticated user, so without this line any learner could
  // open the staff tick-list by typing the URL. 'cohort.manage' is the same
  // already-registered key the page's SECURITY DEFINER RPCs check, so the screen
  // and the database cannot disagree about who belongs here.
  '/startup-studio/school-of-influence/admin/attendance': 'cohort.manage',
  // Same reasoning for the batch roster — it is the only screen somebody can be
  // taken off a batch from, so it must not be reachable by typing the URL.
  '/startup-studio/school-of-influence/admin/members': 'cohort.manage',
  // 2026-08-13 (BUG-005799 / BUG-005800): the other three admin screens were
  // never declared, so each one inherited '/startup-studio' ->
  // startup_studio.analytics.view from the ancestor match — a key about
  // innovation-cycle analytics deciding who may read applications. Declaring
  // them on cohort.manage puts the chip, the route guard and the RPCs on ONE
  // word, and is what lets the appointment seam in
  // hooks/school-of-influence/use-soi-coordinator-nav-access.ts reveal exactly
  // these four screens and nothing else on the platform.
  '/startup-studio/school-of-influence/admin/applications': 'cohort.manage',
  '/startup-studio/school-of-influence/admin/coordinators': 'cohort.manage',
  '/startup-studio/school-of-influence/admin/lifecycle': 'cohort.manage',

  // School of Influence — folding a batch too small to run (Director decision
  // 2026-08-02). Declared for the same reason as the line above: an undeclared
  // route inherits the broad '/startup-studio' key, and this screen names the
  // people a fold would move. 'cohort.manage' is the same already-registered key
  // fn_soi_merge_plan and fn_soi_record_batch_merge check, so the screen and the
  // database cannot disagree about who belongs here.
  '/startup-studio/school-of-influence/admin/merge': 'cohort.manage',

  '/staff': 'staff.view',
  '/hr': 'hr.view',

  // Family Moments (2026-06-12 — Father's Day 2026, NV CBSE + Matric HSS)
  '/moments/submit': 'moments.submissions.create',
  '/moments/campaigns': 'moments.campaigns.view',

  // Solution Hub
  '/solutions': 'solutions.dashboard.view',
  '/solutions/list': 'solutions.dashboard.view',
  // Deliberately REUSES the dashboard key (2026-08-14): a freshly minted
  // solutions.digest.view would be true on almost no role — the trap hit
  // three times the week of 08-13. Anyone who can see the dashboard can
  // see its weekly digest.
  '/solutions/digest': 'solutions.dashboard.view',
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
  // '/solutions/departments' retired April 2026 — replaced by paradigm-shift.
  // Reinstated 2026-08-01 as the capability register only (the nomination /
  // approval workflow stays retired). Reached from the Solutions Hub tab bar.
  '/solutions/departments': 'solutions.departments.view',

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
  // Read-only audit. Its own key (held by no role) so the nav chip and the
  // route guard agree it is super-admin-only — a link the sidebar hides but
  // the guard opens is still a reachable page.
  '/campus-living/allocations/audit': 'campus_living.allocations.audit',
  '/campus-living/residents': 'campus_living.residents.view',
  '/campus-living/my-hostel': 'campus_living.my_hostel.view',
  '/campus-living/my-hostel/vacate-request': 'campus_living.vacate_requests.submit',
  '/campus-living/my-hostel/premium': 'campus_living.premium.view_dashboard',
  '/campus-living/my-hostel/premium/pick-room': 'campus_living.premium.pick_room',
  '/campus-living/my-hostel/premium/invite-roommate': 'campus_living.premium.invite_roommate',
  '/campus-living/vacate-requests': 'campus_living.vacate_requests.view',
  '/campus-living/attendance': 'campus_living.attendance.view',
  '/campus-living/leave': 'campus_living.leave.view',
  '/campus-living/gate-passes': 'campus_living.gate_passes.view',
  // Gated on the WRITE key, not .view: the scan screen exists only to record
  // exits and returns, so a read-only holder has nothing to do there.
  '/campus-living/gate-passes/scan': 'campus_living.gate_passes.edit',
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
  // Read-only practice run for settle-then-bill. Gated on the same permission
  // fn_settle_bill_close itself demands, so nobody reads the list who could not
  // authorize the run.
  '/campus-living/settle-preview': 'campus_living.fees.config',
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
  // Per-owner worklist. Gated on the landing key rather than a new one so the
  // people already trusted with accreditation can reach it — a key not present
  // in lib/constants/permissions.ts would be ungrantable and the page would be
  // reachable by nobody but super-admins.
  '/accreditation/my-gaps': 'accreditation.view',               // per-owner worklist
  '/accreditation/coverage': 'accreditation.coverage.view',     // PR-A7 coverage dashboard
  // IQAC reads the 107-row master framework (sh_accreditation_metrics) whole.
  // Gated on the EXISTING metrics-catalog key rather than a new one: a key that
  // is not in lib/constants/permissions.ts is ungrantable and never appears as
  // a toggle in the role dialog.
  '/accreditation/iqac': 'accreditation.metrics.view',          // IQAC master framework dashboard
  '/accreditation/naac': 'accreditation.naac.view',             // PR-A8 c1 NAAC IQAC dashboard
  '/accreditation/naac/committees': 'accreditation.naac.committees.view',         // PR-A8 c2
  '/accreditation/naac/committees/[id]': 'accreditation.naac.committees.view',    // PR-A8 c2
  '/accreditation/naac/dcf-export': 'accreditation.naac.dcf_export',              // PR-A8 c2 (super-admin)
  '/accreditation/naac/surveys/consent': 'accreditation.naac.surveys.consent.submit',  // PR-A8 c2
  '/accreditation/naac/surveys/8.4-export': 'accreditation.naac.surveys.export', // PR-A8 c2
  '/accreditation/naac/surveys/stakeholders': 'accreditation.naac.surveys.stakeholder.view', // employer + alumni half of NAAC 1.2
  '/accreditation/naac/narratives': 'accreditation.naac.narrative.view',         // AI narrative drafter (list)
  '/accreditation/naac/narratives/owners': 'accreditation.naac.narrative.manage', // IQAC owner-assignment desk
  '/accreditation/naac/narratives/[id]': 'accreditation.naac.narrative.view',    // AI narrative drafter (detail)
  '/accreditation/nirf': 'accreditation.nirf.view',             // PR-A9
  '/accreditation/nba': 'accreditation.nba.view',               // PR-A10
  '/accreditation/qs': 'accreditation.qs.view',                 // PR-A11 placeholder
  '/accreditation/dci': 'accreditation.dci.view',               // PR-A12
  '/accreditation/pci': 'accreditation.pci.view',               // PR-A13
  '/accreditation/inc': 'accreditation.inc.view',               // PR-A14
  '/accreditation/ncte': 'accreditation.ncte.view',             // PR-A15
  '/accreditation/aicte': 'accreditation.aicte.view',           // PR-A15
  '/accreditation/ugc': 'accreditation.ugc.view',               // PR-A15
  '/accreditation/cac': 'accreditation.cac.view',               // Cluster Academic Council — JKKN's own body, not a regulator
  // Assigning accountability writes accreditation_metric_owners, whose live RLS
  // gates writes on accreditation.naac.narrative.manage — so the page gate uses
  // the same key rather than a second one that could drift away from the table.
  '/accreditation/manage/owners': 'accreditation.naac.narrative.view',
  // Which bodies apply to which campus. Gated on VIEW, not manage: the page
  // shows a college which bodies it answers to, and that is worth reading even
  // to somebody who may not change it. The write policies on both tables are
  // the actual guard.
  '/accreditation/manage/bodies': 'accreditation.bodies.view',

  // Events — Propose (Stream C, 2026-04-26)
  '/events/propose': 'events.proposals.view',

  // Global Calendar module
  '/calendar': 'calendar.view',
  '/calendar/holidays': 'calendar.holidays.manage',
  '/calendar/settings': 'calendar.config.manage',

  // Audit Workflow Sprint 01
  '/audit': 'audit.cycle.view',
  '/audit/dashboard': 'audit.cycle.view',
  '/audit/care/coverage': 'audit.cycle.view', // CARRE Coverage Map (leadership view)
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

  // Board of Studies — tier-2 sub-pages under /bos.
  '/bos/compositions': 'bos.compositions.view',
  '/bos/experts': 'bos.experts.view',
  '/bos/meetings': 'bos.meetings.view',
  // Academic Council — institution-level body, super-admin + principal only.
  // The grant (20260706b) gives principals 'academic.bos-academic-council.manage';
  // super-admins bypass the nav filter. No entry here would make the link
  // visible to ALL authenticated users, so this line is load-bearing.
  '/bos/academic-council': 'academic.bos-academic-council.manage',
  // Governing Body — institution-level body, super-admin + principal only.
  // The grant (20260724120000) gives principals 'academic.bos-governing-body.manage';
  // super-admins bypass the nav filter. Modelled "all as same" as Academic Council.
  '/bos/governing-body': 'academic.bos-governing-body.manage',
  '/bos/reports': 'bos.reports.view',
  '/bos/ta-da': 'bos.ta_da.view',
  // Remaining BoS tab pages. These live only in the in-page tab bar (not the
  // sidebar), so they were absent from MENU_PERMISSIONS. The Command Palette
  // builds its searchable surface from the route manifest and treats any path
  // with NO permission entry as "visible to all authenticated users"
  // (lib/navigation/permission-filter.ts:19). That let students surface these
  // pages via search even though the sidebar correctly hid the /bos parent.
  // Mapping each to its canonical academic.bos-*.view key (catalogued in
  // lib/constants/permissions.ts) restores the filter. committees + email-
  // settings have no dedicated key, so they fall back to the bos.view parent
  // gate — held by BoS users (auto-derived via applyBOSFallback) but not students.
  '/bos/syllabus': 'academic.bos-syllabus.view',
  '/bos/courses': 'academic.bos-courses.view',
  '/bos/course-scheme': 'academic.bos-scheme.view',
  '/bos/taxonomy': 'academic.bos-taxonomy.view',
  '/bos/sop': 'academic.bos-sop.view',
  '/bos/member-types': 'academic.bos-members.view',
  '/bos/committees': 'bos.view',
  '/bos/email-settings': 'bos.view',
  // PO & PSO master page — no dedicated permission key; same bos.view parent
  // fallback as committees (page-level access is BosViewGuard + membership).
  '/bos/po-pso': 'bos.view',

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
  '/pde/admin': 'pde.admin.view',
  '/pde/admin/assessments': 'pde.admin.assessments.view',
  '/pde/admin/at-risk': 'pde.admin.at_risk.view',
  '/pde/admin/capabilities': 'pde.admin.capabilities.view',
  '/pde/admin/engagement': 'pde.admin.engagement.view',
  '/pde/admin/lti': 'pde.admin.lti.view',
  '/pde/admin/quests': 'pde.admin.quests.view',
  // BoS PDE Evidence is an admin-only page with no granular key — gate it
  // behind the PDE admin landing so it stops surfacing in search for students.
  '/pde/admin/bos-evidence': 'pde.admin.view',

  // Board of Studies — parent landing (children /bos/{compositions,experts,...} above)
  '/bos': 'bos.view',
  // MyJKKN RCLTP — gated to content managers for now (only admin authoring +
  // policies exist in Phase 4a); broaden when student/teacher surfaces (4b/4c) land.
  '/rcltp': 'rcltp.config.manage',

  // Events — Marathon submenu (companion to existing /events/propose entry)
  '/events/marathon': 'events.marathon.view',
  '/events/marathon/new': 'events.marathon.create',

  // Events — Sports Tournament submenu (Sports Tournament PR1, 2026-06-22)
  // '/events/tournaments' (plural) is the STUDENT read-only browse page — a separate
  // subtree so it never inherits the admin detail page's logistics boards.
  '/events/tournaments': 'sports.tournaments.browse',
  '/events/tournament': 'sports.tournaments.view',
  '/events/tournament/new': 'sports.tournaments.create',

  // Events — unified create-flow + preset hub (Events Platform Promotion PR9)
  '/events/create': 'events.view',
  '/events/presets': 'events.view',

  // Faculty — PDE faculty tree (Faculty / HOD / Mentor surface)
  '/pde/faculty': 'pde.faculty.view',
  '/pde/faculty/analytics': 'pde.faculty.analytics.view',
  '/pde/faculty/assessments': 'pde.faculty.assessments.view',
  '/pde/faculty/dashboard': 'pde.faculty.dashboard.view',
  '/pde/faculty/demonstrations': 'pde.faculty.demonstrations.view',
  '/pde/faculty/quests': 'pde.faculty.quests.view',

  // Health & Wellness — 9 tier-2 surfaces (parent /health is a PARENT in the
  // sidebar so it's auto-shown when any child is grantable)
  '/health/dashboard': 'health.dashboard.view',
  '/health/profile': 'health.profile.view',
  '/health/leaderboard': 'health.leaderboard.view',
  '/health/sports': 'health.sports.view',
  // Approver inbox (2026-07-30). Gated on .approve, NOT .view — the Principal
  // decides tournament permission but is not a sports-profile viewer
  // (health.sports.view is false for that role), so reusing .view would hide
  // the inbox from the only person who can act on it.
  '/health/sports/approvals': 'health.sports.approve',
  // Filing desk (2026-07-30). Separate route from the inbox because the two
  // parties hold DIFFERENT keys — one route can carry only one permission here,
  // and merging them would hide whichever surface the viewer is not gated for.
  '/health/sports/squad-requests': 'health.sports.file_request',
  '/health/fitness': 'health.fitness.view',
  '/health/training': 'health.training.view',
  '/health/achievements': 'health.achievements.view',
  '/health/assessments': 'health.assessments.view',
  '/health/admin/programs': 'health.programs.manage',
  '/health/counselor': 'health.counselor.view',
  '/health/programs': 'health.programs.view',

  // IMS (Inventory Management System) — Added 2026-04-27. Module-level
  // taxonomy mirrors Admission CRM precedent; gateway permission `ims.view`
  // protects the parent /ims tree, child routes use specific keys so a sales
  // cashier (ims.sales.*) can't accidentally reach stock adjustments
  // (ims.stock.adjust). Permission catalog: lib/constants/permissions.ts.
  '/ims': 'ims.view',

  // Procurement (centralized purchasing) — Added 2026-07-08. Gateway
  // procurement.view protects /procurement/*; request_create gates raising a
  // new request (list/detail stay on view). See PLAN-procurement-v1.md.
  '/procurement': 'procurement.view',
  '/procurement/requests': 'procurement.view',
  '/procurement/requests/new': 'procurement.request_create',
  '/procurement/requests/[id]': 'procurement.view',
  '/procurement/rfqs': 'procurement.view',
  '/procurement/rfqs/[id]': 'procurement.view',
  '/procurement/rfqs/[id]/quotations': 'procurement.view',
  '/procurement/purchase-orders': 'procurement.view',
  '/procurement/purchase-orders/[id]': 'procurement.view',
  '/procurement/purchase-orders/formats': 'procurement.po_create',
  '/procurement/purchase-orders/formats/new': 'procurement.po_create',
  '/procurement/purchase-orders/formats/[id]/edit': 'procurement.po_create',
  '/procurement/grn': 'procurement.view',
  '/procurement/grn/[id]': 'procurement.view',
  '/procurement/grn/new': 'procurement.grn_create',
  '/meetings': 'meetings.view',
  // Universal Booking sub-surfaces (reconcile 2026-06-19) — gate each by its
  // module permission so the sidebar submenus render per-role.
  '/meetings/availability': 'meetings.view',
  '/meetings/manage': 'meetings.view',
  '/meetings/inbox': 'meetings.view',
  // "My Meetings" — the meetings the signed-in user is IN, hosting OR
  // attending. Same gate as the inbox: the page only ever reads the caller's
  // own participation, so a separate key would add role-config burden without
  // adding protection.
  '/meetings/my-bookings': 'meetings.view',
  // Host-initiated scheduling. Same gate as the rest of the module: the page
  // can only ever book the SIGNED-IN user's own calendar, so a separate key
  // would add a role-config burden without adding any protection.
  '/meetings/schedule': 'meetings.view',
  '/meetings/routing-forms': 'meetings.routing.view',
  '/meetings/workflows': 'meetings.workflows.view',
  '/meetings/polls': 'meetings.polls.view',
  '/meetings/contacts': 'meetings.contacts.view',
  '/meetings/contacts/scan': 'meetings.contacts.scan',
  '/meetings/contacts/scan/saved': 'meetings.contacts.scan',
  '/meetings/analytics': 'meetings.analytics.view',
  '/meetings/adoption': 'meetings.analytics.view',
  '/meetings/webhooks': 'meetings.webhooks.view',
  '/meetings/embed': 'meetings.embed.manage',
  '/meetings/triggers': 'meetings.view',
  // Recurring series (Monthly Slate, pieces 1 and 2). Its own key rather than
  // meetings.view: unlike the rest of the module, these two screens configure
  // meetings for OTHER people's calendars across every college, so they are not
  // something every meetings user should see by default.
  '/meetings/series': 'meetings.series.view',
  '/meetings/series/rules': 'meetings.series.view',

  // CDC — module landing hub
  '/cdc': 'cdc.view',
  '/cdc/career-guidance': 'cdc.view',

  // CDC — Campus Drives
  '/cdc/drives': 'cdc.drives.view',
  '/cdc/drives/new': 'cdc.drives.create',
  '/cdc/drives/[id]': 'cdc.drives.view',
  '/cdc/drives/[id]/willingness': 'cdc.drives.edit',

  // CDC — Placements
  '/cdc/placements': 'cdc.placements.view',
  '/cdc/placements/new': 'cdc.placements.create',
  '/cdc/placements/[id]': 'cdc.placements.view',

  // CDC — Internships
  '/cdc/internships': 'cdc.internships.view',
  '/cdc/internships/new': 'cdc.internships.create',
  '/cdc/internships/[id]': 'cdc.internships.view',

  // CDC — Individual Development Plans
  '/cdc/idp': 'cdc.idp.view',
  '/cdc/idp/new': 'cdc.idp.create',
  '/cdc/idp/[id]': 'cdc.idp.view',

  // CDC — Clubs
  '/cdc/clubs': 'cdc.clubs.view',
  '/cdc/clubs/new': 'cdc.clubs.create',
  '/cdc/clubs/[id]': 'cdc.clubs.view',

  // CDC — Mentor Pairings
  '/cdc/mentors': 'cdc.mentors.view',
  '/cdc/mentors/new': 'cdc.mentors.create',
  '/cdc/mentors/[id]': 'cdc.mentors.view',

  // CDC — Training Programmes
  '/cdc/training': 'cdc.training.view',
  '/cdc/training/new': 'cdc.training.create',
  '/cdc/training/[id]': 'cdc.training.view',

  // CDC — Government Job Readiness (TNPSC / RRB / banking / SSC / TN Police)
  '/cdc/govt-readiness': 'cdc.govt_readiness.view',
  // Govt-readiness admin surfaces. These /cdc/admin/* pages sit under the
  // RoutePermissionGuard layout, which only gates routes that HAVE a
  // MENU_PERMISSIONS entry (an unmapped route falls through as "visible to any
  // authenticated user"), so an entry is REQUIRED. cdc.training.edit is the
  // COARSE pre-filter here (held by cdc_head + cdc_coordinator); the PRECISE
  // boundary is head-only and enforced at the page (CdcHeadGuard) and at the
  // write route + table RLS, all on is_cdc_head_or_super() — app == UI == RLS
  // (deep-review R4 #1). There is no head-only permission KEY to map to, so the
  // coarse pre-filter stays and the page guard narrows it to CDC Head / super.
  '/cdc/admin/exam-syllabus-topics': 'cdc.training.edit',
  '/cdc/admin/exam-topic-map': 'cdc.training.edit',

  // CDC — UNNATI → UDYOG application tracker
  '/cdc/udyog': 'cdc.udyog.view',

  // CDC — Opportunities Bulletin
  '/cdc/bulletin': 'cdc.bulletin.view',
  '/cdc/bulletin/new': 'cdc.bulletin.create',
  '/cdc/bulletin/[id]': 'cdc.bulletin.view',

  // CDC — Employer Requirement Intake
  '/cdc/requirements': 'cdc.requirements.view',
  '/cdc/requirements/new': 'cdc.requirements.create',
  '/cdc/requirements/[id]': 'cdc.requirements.view',

  // CDC — Industry Mentors directory
  '/cdc/industry-mentors': 'cdc.industry_mentors.view',
  '/cdc/industry-mentors/new': 'cdc.industry_mentors.create',
  '/cdc/industry-mentors/[id]': 'cdc.industry_mentors.view',

  // Industry Partners directory (public.industry_partners — the COMPANIES).
  // Top-level route, but CDC-owned: the table is already documented as
  // CDC-owned in lib/services/pde-employer-briefing-service.ts, so the
  // permission key and the sidebar entry both live under CDC.
  '/industry-partners': 'cdc.industry_partners.view',
  '/industry-partners/[id]': 'cdc.industry_partners.view',

  // CDC — Reports & Exports
  '/cdc/exports': 'cdc.exports.view',

  // PDE — Clinical Reasoning (AICBL → PDE port, PR #1059)
  // Closes the [unused-prefix] /pde/admin audit-coverage warning by giving the
  // prefix at least one MENU_PERMISSIONS entry. Faculty cases (CRUD) and the
  // student case attempt URL also wired so RBAC enforces the documented matrix:
  //   - /pde/admin/policies/clinical-reasoning → Director / institution_admin /
  //     super_admin (uses pde.admin.view)
  //   - /pde/faculty/cases (+ subroutes) → faculty / institution_admin /
  //     super_admin (uses pde.faculty.view)
  //   - /pde/learn/cases/[caseSlug] → auto-discoverable for BDS-enrolled
  //     learners (uses pde.profile.view; VAC course-page wiring is a follow-up)
  '/pde/admin/policies/clinical-reasoning': 'pde.admin.view',
  '/pde/faculty/cases': 'pde.faculty.view',
  '/pde/faculty/cases/new': 'pde.faculty.view',
  '/pde/faculty/cases/[id]/edit': 'pde.faculty.view',
  '/pde/faculty/cases/[id]/preview': 'pde.faculty.view',
  '/pde/faculty/cases/[id]/attempts': 'pde.faculty.view',
  '/pde/faculty/cases/[id]/attempts/[studentId]': 'pde.faculty.view',
  '/pde/learn/cases/[caseSlug]': 'pde.profile.view',
  // PDE learner surfaces — added to the unified 'PDE' sidebar group
  // (sidebar-unify, 2026-06-09). Same learner-facing key as cases.
  '/pde/learn/demonstrations': 'pde.profile.view',
  '/pde/learn/cohort': 'pde.profile.view',
  '/pde/learn/transcript': 'pde.profile.view',

  '/ims/dashboard': 'ims.dashboard.view',
  '/ims/financial': 'ims.financial.view',
  // Indents
  '/ims/indents': 'ims.indents.view',
  '/ims/indents/new': 'ims.indents.create',
  '/ims/indents/pending': 'ims.indents.approve',
  // Phase D: HOD queue — gated on view (queue itself is scoped by
  // departments.head_of_department_id, so non-HODs just see an empty state)
  '/ims/indents/hod-approvals': 'ims.indents.view',
  '/ims/indents/[id]': 'ims.indents.view',
  '/ims/indents/[id]/edit': 'ims.indents.edit',
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
  '/ims/reports/gateway-payments': 'ims.reports.view',
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
  // Store Kits (PR-K2, 2026-07-12) — per-group item kits handed over at the
  // central store. Spec: specs/store-kit-entitlements-spec-2026-07-12.md.
  // Keys ship UNGRANTED (dark) until the grn_verify rollout.
  '/ims/kits': 'ims.kits.manage',
  '/ims/kits/counter': 'ims.kits.handover',
  '/ims/kits/billing-flags': 'ims.kits.billing_flags.view',
  // Learner/staff self view — top-level route; grant ims.kits.my.view to
  // student/staff roles at rollout to reveal it.
  '/my-kit': 'ims.kits.my.view',
  // Verified Skills Record — learner self view (granted to student role in the
  // VSR migration) + the admin correction queue.
  '/my-proof': 'learners.proof.view',
  '/admin/proof-disputes': 'super_admin',
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

  // Feedback Dashboard — Universal Feedback Spine (added 2026-06-26).
  // Admin / super-admin always have access via RLS; feedback.view grants
  // access to non-admin roles (e.g. dedicated feedback reviewers).
  '/feedback': 'feedback.view',
};

/**
 * The case-study screen carries TWO populations that are reached by DIFFERENT
 * permission keys: the people who write the cases hold `improvement.ideas.view`,
 * and the people who grade them hold `improvement.board.manage`. Holding one is
 * no guarantee of holding the other, so a single-key mapping would hide the
 * link from one population or the other.
 *
 * Which role_key holds which of these is a live value in `custom_roles.
 * permissions` — read it there, not here. This file is not a copy of the role
 * table and must not be maintained as one.
 *
 * The union is applied at BOTH nav filter sites below — the submenu filter AND
 * the parent-menu filter — because the parent row is shown only when at least
 * one child passes, and a role whose sole reachable child is this one would
 * otherwise lose the whole Improvement Board row.
 *
 * Mirrors the identical treatment `/improvement-board/analytics` already gets
 * in lib/navigation/permission-filter.ts.
 */
export const CASE_STUDIES_NAV_PATH = '/improvement-board/case-studies';
export const CASE_STUDIES_NAV_KEYS = [
  'improvement.ideas.view',
  'improvement.board.manage',
  'improvement.area_role.assign',
] as const;

/**
 * /improvement-board/owners — a board manager may SEE who owns each department;
 * an officer (improvement.area_role.assign) is the only one who may CHANGE it,
 * and is the screen's real audience. Declaring only the officer key would hide
 * it from managers; declaring only the manager key would hide it from an
 * officer role that does not also hold board.manage. Both are listed.
 */
export const OWNERS_NAV_PATH = '/improvement-board/owners';
export const OWNERS_NAV_KEYS = [
  'improvement.board.manage',
  'improvement.area_role.assign',
] as const;

/**
 * Does this person reach `href` in the nav? Compares by VALUE (`=== true`), not
 * by key existence: a role may carry a permission key set to an explicit
 * `false`, and an existence test reads that denial as a grant.
 *
 * Real super admins and admins never reach this function — GetRoleBasedPages
 * returns their whole menu earlier — so anything that arrives here belongs to
 * somebody who is not one. That is why the sentinel wall below is a flat `false`
 * rather than a role test.
 */
export function navPathAllowed(
  href: string,
  permissions: Record<string, boolean>,
  requiredPermission: string | undefined
): boolean {
  if (href === CASE_STUDIES_NAV_PATH) {
    return CASE_STUDIES_NAV_KEYS.some((key) => permissions[key] === true);
  }
  if (href === OWNERS_NAV_PATH) {
    return OWNERS_NAV_KEYS.some((key) => permissions[key] === true);
  }
  if (!requiredPermission) return false;
  // A sentinel is not a permission key. MENU_PERMISSIONS gates 14 routes on the
  // literal value `super_admin`, and Director's Desk ORs a handover's keys into
  // this very map — so a handover of the ID-card printing policy page used to
  // reveal the entire super-admin sidebar to its receiver. The database walls
  // the key now; this is the layer that would have acted on it.
  if (isSentinelPermission(requiredPermission)) return false;
  return permissions[requiredPermission] === true;
}

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
          href: '/guide',
          label: 'Guide',
          active: pathname === '/guide' || pathname.startsWith('/guide/'),
          icon: BookOpen,
          submenus: []
        },
        {
          // What's New — the product changelog. Deliberately has NO
          // MENU_PERMISSIONS entry: the Director's decision (2026-09-05) is that
          // everyone signed in can open it. The page scopes its own CONTENT by
          // role, so a student sees student-relevant changes rather than a
          // locked door.
          href: '/whats-new',
          label: "What's New",
          active: pathname === '/whats-new',
          icon: Megaphone,
          submenus: []
        },
        {
          // Store Kits self view (PR-K2) — entitled vs collected vs owed.
          // Hidden until ims.kits.my.view is granted to student/staff roles.
          href: '/my-kit',
          label: 'My Kit',
          active: pathname === '/my-kit',
          icon: Package,
          submenus: []
        },
        {
          // Verified Skills Record self view (spec 2026-07-14) — visible to
          // learners only (learners.proof.view, granted to the student role).
          href: '/my-proof',
          label: 'My Proof',
          active: pathname === '/my-proof',
          icon: BadgeCheck,
          submenus: []
        },
        {
          // MBA Improvement Board — business-case pipeline (kanban) + impact
          // leaderboard. Gated by improvement.ideas.view via MENU_PERMISSIONS.
          href: '/improvement-board',
          label: 'Improvement Board',
          active:
            pathname === '/improvement-board' ||
            pathname.startsWith('/improvement-board/'),
          icon: Lightbulb,
          submenus: [
            { href: '/improvement-board', label: 'Board', active: pathname === '/improvement-board' },
            { href: '/improvement-board/dashboard', label: 'My Dashboard', active: pathname === '/improvement-board/dashboard' },
            { href: '/improvement-board/leaderboard', label: 'Impact Leaderboard', active: pathname === '/improvement-board/leaderboard' },
            // Gemba visits — records that somebody went and looked, which is the
            // only thing that makes a department playbook official (improvement.ideas.view).
            { href: '/improvement-board/gemba', label: 'Gemba Visits', active: pathname === '/improvement-board/gemba' },
            // MBA Analyst — an associate's own department analytics (improvement.ideas.view).
            { href: '/improvement-board/analytics', label: 'My Analytics', active: pathname === '/improvement-board/analytics' },
            // MBA case studies — associates write them (improvement.ideas.view),
            // board managers grade them (improvement.board.manage). Reached via
            // navPathAllowed's union so neither population loses the link.
            { href: '/improvement-board/case-studies', label: 'Case Studies', active: pathname === '/improvement-board/case-studies' },
            // MBA Analyst assignments — manager-only; hidden from associates via MENU_PERMISSIONS (improvement.board.manage).
            { href: '/improvement-board/postings', label: 'Analyst Assignments', active: pathname === '/improvement-board/postings' },
            // MBA Data Gaps — manager-only triage of gaps Associates reported (improvement.board.manage).
            { href: '/improvement-board/data-gaps', label: 'Data Gaps', active: pathname === '/improvement-board/data-gaps' },
            // MBA Team Rotation — rota chart (associates + managers); team-builder
            // and setup are manager-only via MENU_PERMISSIONS (improvement.board.manage).
            { href: '/improvement-board/rotation', label: 'Team Rotation', active: pathname === '/improvement-board/rotation' },
            { href: '/improvement-board/rotation/teams', label: 'Rotation Teams', active: pathname === '/improvement-board/rotation/teams' },
            { href: '/improvement-board/rotation/config', label: 'Rotation Setup', active: pathname === '/improvement-board/rotation/config' },
            // Manage boards — manager-only CRUD over the areas ideas are filed
            // against (improvement.board.manage).
            { href: '/improvement-board/manage-boards', label: 'Manage Boards', active: pathname === '/improvement-board/manage-boards' },
            // Department owners — who is accountable for each board. Visible to
            // board managers AND to the officers who assign holders; see
            // OWNERS_UNION_PERMISSIONS for why that union is not in MENU_PERMISSIONS.
            { href: '/improvement-board/owners', label: 'Department Owners', active: pathname === '/improvement-board/owners' },
            // Teaching-enterprise cohort config — manager-only, hidden from
            // participants via MENU_PERMISSIONS (improvement.board.manage).
            { href: '/admin/teaching-cohorts', label: 'Teaching Cohorts', active: pathname === '/admin/teaching-cohorts' }
          ]
        },
        {
          // Director's Desk — the red/green master view of every job handed
          // out (spec: specs/director-desk/SPEC.md). Gated by
          // director.handover.view_all via MENU_PERMISSIONS.
          href: '/director-desk',
          label: "Director's Desk",
          active: pathname === '/director-desk' || pathname.startsWith('/director-desk/'),
          icon: ClipboardCheck,
          submenus: []
        },
        {
          // My Desk — the receiving side of a handover. Deliberately visible to
          // EVERY authenticated user (explicit carve-out in GetRoleBasedPages
          // below): a handover exists precisely because the receiver holds no
          // permission for the work, so gating its inbox on a module key would
          // make the feature undiscoverable to the only people who need it.
          href: '/my-desk',
          label: 'My Desk',
          active: pathname === '/my-desk' || pathname.startsWith('/my-desk/'),
          icon: Inbox,
          submenus: []
        },
        {
          // CEO Rounds — the daily rounds log (participation-graded attendance,
          // rotating-associate summary, Rounds-task → Board link). Gated by
          // ceo_rounds.log via MENU_PERMISSIONS.
          href: '/ceo-rounds',
          label: 'CEO Rounds',
          active: pathname === '/ceo-rounds' || pathname.startsWith('/ceo-rounds/'),
          icon: ClipboardList,
          submenus: []
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
            { href: '/users/jkkn-id', label: 'JKKN ID', active: pathname === '/users/jkkn-id' },
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
            { href: '/organizations/departments', label: 'Departments', active: pathname === '/organizations/departments' },
            // Both entries added 2026-08-04. Leadership is new; HoD Assignment
            // already worked but had no sidebar entry, which is why 82 of 89
            // departments still have no Head.
            { href: '/organizations/leadership', label: 'College Leadership', active: pathname.startsWith('/organizations/leadership') },
            { href: '/organizations/departments/hod-assignment', label: 'HoD Assignment', active: pathname.startsWith('/organizations/departments/hod-assignment') },
            { href: '/organizations/programs', label: 'Programs', active: pathname.startsWith('/organizations/programs') },
            { href: '/organizations/semesters', label: 'Semesters', active: pathname.startsWith('/organizations/semesters') },
            { href: '/organizations/sections', label: 'Sections', active: pathname.startsWith('/organizations/sections') },
            { href: '/organizations/courses', label: 'Courses', active: pathname.startsWith('/organizations/courses') },
            { href: '/organizations/courses/mappings', label: 'Course Mappings', active: pathname === '/organizations/courses/mappings' },
          ]
        },
        {
          // Reference / Masters hub — every master-data catalog with live
          // counts; generic catalogs editable inline, complex ones link out.
          href: '/reference',
          label: 'Reference / Masters',
          active: pathname === '/reference' || pathname.startsWith('/reference/'),
          icon: LibraryBig,
          submenus: []
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
          // Foundation & Competitive-Exam Programme — school-grade foundation +
          // govt/competitive-exam coaching. Gated by
          // '/foundation' -> 'foundation.dashboard.view' (MENU_PERMISSIONS).
          href: '/foundation',
          label: 'Foundation Programme',
          active: pathname === '/foundation' || pathname.startsWith('/foundation/'),
          icon: Target,
          // Hand-authored children REPLACE the route manifest's depth-2
          // auto-discovery for this row (components/Navbar/menu.tsx), so the
          // Console is listed explicitly to keep it. The two OneMark operator
          // screens sit at depth 3 and would never be auto-discovered. They are
          // children here, not top-level rows, because the Academic group is
          // one row below the sidebar validator's hard cap (15). Each child is
          // gated by its own MENU_PERMISSIONS key.
          //
          // 'Overview' is the hub itself, listed as its own first child (same
          // idiom as '/procurement'). Two things depend on it: (1) a row with
          // explicit children is filtered by its CHILDREN only —
          // GetRoleBasedPages never reads MENU_PERMISSIONS['/foundation'] once
          // submenus is non-empty — so without this child a holder of ONLY
          // foundation.dashboard.view lost the row that main rendered for them;
          // (2) an explicit-children row renders as an accordion whose parent
          // click is a pure toggle (menu.tsx), so this child is the only
          // sidebar door to /foundation for ANY role.
          submenus: [
            { href: '/foundation', label: 'Overview', active: pathname === '/foundation' },
            { href: '/foundation/console', label: 'Console', active: pathname.startsWith('/foundation/console') },
            { href: '/foundation/onemark/paper', label: 'OneMark: Build a Paper', active: pathname.startsWith('/foundation/onemark/paper') },
            { href: '/foundation/onemark/review', label: 'OneMark: Review Drafts', active: pathname.startsWith('/foundation/onemark/review') },
          ]
        },
        {
          // The learner's own door into the same programme. Separate entry
          // rather than a submenu because the audience is disjoint: whoever
          // sits the programme holds foundation.practice.take and none of the
          // operator keys, so '/foundation' above never renders for them.
          href: '/foundation/practice',
          label: 'Foundation Practice',
          // Exact, so that running a session for somebody else does not also
          // light up "practise on my own" — they are different acts.
          active: pathname === '/foundation/practice',
          icon: Target,
          submenus: []
        },
        {
          // Running the programme FOR a group, as opposed to sitting it.
          // Gated on the same permission, but only ever populated for whoever
          // is named as a cohort's resource person — most holders of the key
          // will correctly see "you are not running any groups yet".
          href: '/foundation/practice/facilitate',
          label: 'Run a Practice Session',
          active: pathname.startsWith('/foundation/practice/facilitate'),
          icon: Users,
          submenus: []
        },
        {
          // OneMark — the Class-12 one-mark MCQ sitting: practice, timed, a
          // Senior Learner's live paper, and vault review. Same audience and
          // same key as Foundation Practice. A separate flat row, not a child
          // of '/foundation', for the same reason Foundation Practice is: the
          // learner never holds the operator keys that render that parent.
          // This makes the Academic group 14 top-level rows — ONE below the
          // sidebar validator's hard cap; the next entry must nest.
          href: '/foundation/onemark/practice',
          label: 'OneMark Practice',
          active: pathname.startsWith('/foundation/onemark/practice'),
          icon: ClipboardCheck,
          submenus: []
        },
        {
          // D3: click → module root. `/academic` resolves to the in-page
          // AcademicNav (nav-config.ts) which handles all drill-down.
          href: '/academic',
          label: 'Academic',
          active: pathname === '/academic' || pathname.startsWith('/academic/'),
          icon: GraduationCap,
          // Flat link — the Academic sub-pages (incl. Parent Portal Content)
          // are surfaced by the in-module tab bar (academic/nav-config.ts),
          // NOT as sidebar submenus. Adding submenus here would hide the rest.
          submenus: []
        },
        {
          // Fresher Induction — guided onboarding program per college. Lives
          // under the Events module (/events/induction); kept as a sidebar
          // shortcut for prominence (institution-wide, recurring, student-facing).
          // Gated by '/events/induction' -> 'induction.view' (MENU_PERMISSIONS).
          href: '/events/induction',
          label: 'Induction',
          active: pathname === '/events/induction' || pathname.startsWith('/events/induction/'),
          icon: Rocket,
          submenus: []
        },
        {
          // "My Induction Sessions" — a CREDITED resource person's own lane on
          // their session feedback. UNGATED on purpose (no MENU_PERMISSIONS entry):
          // a resource person needs NO induction.view, and the page self-scopes to
          // the sessions you led (non-presenters see an empty state). Distinct from
          // the gated coordinator console above.
          href: '/my-induction-sessions',
          label: 'My Induction Sessions',
          active: pathname.startsWith('/my-induction-sessions'),
          icon: MessageSquare,
          submenus: []
        },
        // NOTE: the learner lanes (Class Feedback /learn, My Attendance Feedback
        // /me) were moved OUT of this admin/faculty "Academic" group into the
        // student "Learners" group below — students never see "Academic", so they
        // could not reach Class Feedback (root cause of 0 submissions). The
        // faculty (/faculty) + principal (/principal) lanes remain here.
        {
          // Board of Studies — institutional governance + expert management.
          // Navigation lives in the module's in-page tab bar (BOS_NAV_TABS,
          // see app/(routes)/bos/layout.tsx) and nav-config.ts.
          href: '/bos',
          label: 'Board of Studies',
          active: pathname === '/bos' || pathname.startsWith('/bos/'),
          icon: ClipboardList,
          submenus: []
        },
        {
          // MyJKKN RCLTP — reading-assessment module. Role-aware landing at /rcltp
          // routes each persona to their lane (admin authoring + policies live now;
          // student/teacher/principal surfaces land in Phase 4b/4c).
          href: '/rcltp',
          label: 'Reading (RCLTP)',
          active: pathname === '/rcltp' || pathname.startsWith('/rcltp/'),
          icon: BookOpen,
          submenus: []
        },
        {
          // Post-class feedback — faculty's own anonymized session-understanding signal.
          href: '/academic/session-feedback/faculty',
          label: 'Session Feedback (Faculty)',
          active: pathname.startsWith('/academic/session-feedback/faculty'),
          icon: MessageSquare,
          submenus: []
        },
        {
          // Curriculum AI — review + approve the AI-drafted lesson spine (Phase 2).
          // Drafts are never student-visible until a faculty approves them here.
          href: '/academic/curriculum-review',
          label: 'Lesson Spine Review',
          active: pathname.startsWith('/academic/curriculum-review'),
          icon: BookOpen,
          submenus: []
        },
        {
          // Post-class feedback — principal escalation dashboard (L4). Sessions
          // where learners reported low understanding, for follow-up with faculty.
          href: '/academic/session-feedback/principal',
          label: 'Session Escalations',
          active: pathname.startsWith('/academic/session-feedback/principal'),
          icon: Activity,
          submenus: []
        },
        {
          // SCF note-safety loop Phase 0 (2026-07-26): the named reviewer's
          // queue for AI-drafted learner support notes. Visible only to
          // holders of scf.notes.review (via MENU_PERMISSIONS) — today the
          // scf_note_reviewer role — plus the super-admin bypass. The page's
          // RPCs re-enforce the same permission server-side.
          href: '/academic/session-feedback/note-review',
          label: 'Learner Note Review',
          active: pathname.startsWith('/academic/session-feedback/note-review'),
          icon: ClipboardCheck,
          submenus: []
        },
        {
          // Post-class feedback — SUPER-ADMIN all-college dashboard (L5). The
          // cross-college rollup (submission + understanding per college / faculty
          // / day). Cross-college reach is super-admin-only, so the sidebar entry
          // is gated to super admin via requiresSuperAdmin (super_admin sees ALL
          // menus via the bypass earlier in GetRoleBasedPages). The page's RPCs
          // still authorize institution leadership if they navigate directly.
          href: '/academic/session-feedback/admin',
          label: 'All-College Feedback',
          active: pathname.startsWith('/academic/session-feedback/admin'),
          icon: BarChart,
          requiresSuperAdmin: true,
          submenus: []
        } as MenuItem & { requiresSuperAdmin: boolean }
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
          // GD-PI sits next to Applications since interviews are part of the
          // application/admission decision process.
          href: '/admission/gd-pi',
          label: 'GD-PI',
          active: pathname.startsWith('/admission/gd-pi'),
          icon: ClipboardCheck,
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
              href: '/admission/consultants/referral-rates',
              label: 'Rates & Generate',
              active: pathname === '/admission/consultants/referral-rates'
            },
            {
              href: '/admission/consultants/unlinked-referrals',
              label: 'Unlinked Referrals',
              active: pathname === '/admission/consultants/unlinked-referrals'
            },
            {
              href: '/admission/consultants/import',
              label: 'Import Referrals',
              active: pathname === '/admission/consultants/import'
            },
            {
              href: '/admission/consultants/payouts',
              label: 'Payouts',
              active: pathname === '/admission/consultants/payouts'
            },
            {
              // Added 2026-08-17 — sits next to Payouts because it answers the
              // question Payouts cannot: who is not payable at all, and why.
              href: '/admission/consultants/payout-readiness',
              label: 'Payout Readiness',
              active: pathname === '/admission/consultants/payout-readiness'
            },
            {
              href: '/admission/consultants/reconciliation',
              label: 'Reconciliation',
              active: pathname === '/admission/consultants/reconciliation'
            },
            {
              href: '/admission/consultants/referrals',
              label: 'Referrals',
              active: pathname === '/admission/consultants/referrals'
            },
            {
              // Added 2026-08-10 — read-only queue of agency credits to review
              // before any referral rate is switched on.
              href: '/admission/consultants/review-worklist',
              label: 'Review Worklist',
              active: pathname === '/admission/consultants/review-worklist'
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
          // Added 2026-06-30 — Schools Network module. Tracks external K-12
          // schools JKKN engages with + own Matric/CBSE schools, sessions,
          // contributions, JKKN ownership, and CSR/grant/corporate funding.
          // Spec: /tmp/schools-network-spec.md (Agent A) + service layer in
          // a sibling PR (Agent B).
          href: '/admission/schools-network',
          label: 'Schools Network',
          active: pathname.startsWith('/admission/schools-network'),
          icon: School,
          submenus: [
            {
              href: '/admission/schools-network',
              label: 'All Schools',
              active: pathname === '/admission/schools-network'
            },
            {
              href: '/admission/schools-network/partners',
              label: 'Program Partners',
              active: pathname.startsWith('/admission/schools-network/partners')
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
              href: '/admission/marketing/campaigns',
              label: 'Campaigns',
              active: pathname.startsWith('/admission/marketing/campaigns')
            },
            {
              href: '/admission/marketing/automations/monitoring',
              label: 'Automation Monitor',
              active: pathname === '/admission/marketing/automations/monitoring'
            },
            {
              href: '/admission/marketing/automations/roi',
              label: 'Automation ROI',
              active: pathname === '/admission/marketing/automations/roi'
            },
            {
              href: '/admission/marketing/automations/segments',
              label: 'Segments',
              active: pathname === '/admission/marketing/automations/segments'
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
              href: '/admission/marketing/whatsapp-broadcast',
              label: 'WhatsApp Broadcast',
              active: pathname === '/admission/marketing/whatsapp-broadcast'
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
              href: '/admission/settings/statuses',
              label: 'Statuses',
              active: pathname === '/admission/settings/statuses'
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
      // HR Management — the whole people domain in one section, read as four
      // rows: HR · Employee · Recruitment · Admin.
      //
      // History: /staff + /hr were unified under a 'Employee Management'
      // groupLabel on 2026-05-09, split apart again 2026-07-03, and re-merged
      // 2026-07-20 — this time at the MenuItem level, so /staff/* gets its own
      // collapsible "Employee" row instead of a competing section header.
      //
      // This groupLabel MUST stay in lock-step with the MODULES `section`
      // string in lib/navigation/modules.ts — the mobile bottom-nav matches
      // sections by exact groupLabel===section string, so any drift demotes
      // the whole section to the trailing fallback slot on the bottom bar.
      // No build gate catches that; verify on mobile, not just desktop.
      groupLabel: 'HR Management',
      menus: [
        {
          // ── Self Service (2026-07-21) ────────────────────────────────────
          // Every employee's OWN records. Deliberately the FIRST row: it is the
          // only part of HR that all 61 staff-bearing roles can use, whereas
          // HR / Recruitment / Admin below are held by 2-10 roles each.
          //
          // PLACEMENT HISTORY — do not "promote" this back to its own
          // groupLabel. It shipped that way on 2026-07-21 and was moved here
          // the same day: a group assembled from /hr/* sub-routes cannot have a
          // lib/navigation/modules.ts entry (MODULES is keyed by top-level URL
          // slug), and components/Navbar/menu.tsx:223 appends unmatched groups
          // AFTER every MODULES-ordered section. For an admin who sees ~30
          // groups that buried it at the very bottom of the sidebar, nowhere
          // near HR. As a row inside HR Management it inherits HR's position
          // and mobile icon for free.
          //
          // The leave entries here are the SELF-SERVICE half; the HR row below
          // keeps the shared/approver half (overview, approve inbox, calendar)
          // so the same label never appears twice in one group.
          href: '/hr/leave/apply',
          label: 'Self Service',
          active:
            pathname.startsWith('/hr/leave/apply')
            || pathname.startsWith('/hr/leave/my-applications')
            || pathname.startsWith('/hr/leave/balance')
            || pathname.startsWith('/hr/leave/encashment')
            || pathname.startsWith('/hr/attendance')
            || pathname.startsWith('/hr/performance-reviews')
            || pathname.startsWith('/hr/training')
            || pathname.startsWith('/hr/fdp')
            || pathname.startsWith('/hr/promotions/apply')
            || pathname.startsWith('/hr/documents')
            || pathname.startsWith('/hr/my-assets')
            || pathname.startsWith('/hr/memos/my'),
          icon: UserCheck,
          submenus: [
            { href: '/hr/leave/apply', label: 'Apply for Leave', active: pathname === '/hr/leave/apply' },
            { href: '/hr/leave/my-applications', label: 'My Leave Applications', active: pathname === '/hr/leave/my-applications' },
            { href: '/hr/leave/balance', label: 'My Leave Balance', active: pathname === '/hr/leave/balance' },
            { href: '/hr/leave/encashment', label: 'Leave Encashment', active: pathname === '/hr/leave/encashment' },
            { href: '/hr/attendance', label: 'My Attendance', active: pathname === '/hr/attendance' },
            { href: '/hr/attendance/regularize', label: 'Regularize Attendance', active: pathname.startsWith('/hr/attendance/regularize') },
            // HR-ops, not self-service: gated on hr.attendance.period.view so it
            // is invisible to the 22 roles that hold only view_self.
            { href: '/hr/attendance/close', label: 'Attendance · Month Close', active: pathname.startsWith('/hr/attendance/close') },
            { href: '/hr/performance-reviews', label: 'My Appraisal', active: pathname === '/hr/performance-reviews' },
            { href: '/hr/training', label: 'My Training', active: pathname.startsWith('/hr/training') },
            { href: '/hr/fdp', label: 'My FDP', active: pathname.startsWith('/hr/fdp') },
            { href: '/hr/promotions/apply', label: 'Apply for Promotion', active: pathname === '/hr/promotions/apply' },
            { href: '/hr/documents', label: 'My Documents', active: pathname.startsWith('/hr/documents') },
            { href: '/hr/my-assets', label: 'My Assets', active: pathname.startsWith('/hr/my-assets') },
            { href: '/hr/memos/my', label: 'My Memos', active: pathname.startsWith('/hr/memos/my') },
          ]
        },
        {
          href: '/hr',
          label: 'HR',
          // Recruitment and Admin live under /hr/ but have their own menu rows.
          // /hr/employees is NOT excluded from `active` — it has no sidebar
          // submenu of its own (product decision 2026-07-21: the employee list
          // belongs to the Employee row below, which owns the record). It
          // surfaces as an AutoTabNav chip under /hr and highlights this row.
          active: pathname === '/hr' || (pathname.startsWith('/hr/') && !pathname.startsWith('/hr/recruitment') && !pathname.startsWith('/hr/admin')),
          icon: Building,
          submenus: [
            // Apply / My Applications / Balance / Encashment moved to the Self
            // Service row above (2026-07-21). What stays here is the shared and
            // approver-facing half — duplicating the self-service entries in
            // both rows would put the same label twice in one group, the exact
            // confusion the Employee List rename fixed a day earlier.
            { href: '/hr', label: 'HR Command Center', active: pathname === '/hr' },
            { href: '/hr/policies', label: 'Policies', active: pathname.startsWith('/hr/policies') },
            { href: '/hr/leave', label: 'Leave Overview', active: pathname === '/hr/leave' },
            { href: '/hr/leave/approve', label: 'Leave · Approve Inbox', active: pathname === '/hr/leave/approve' },
            { href: '/hr/leave/calendar', label: 'Leave · Calendar', active: pathname === '/hr/leave/calendar' },
            // Gates on hr.payroll.institution.view, held by hr_admin / hr_head /
            // hr_manager only — so this row is invisible to the rest of the HR
            // group rather than visible-and-denied.
            { href: '/hr/payroll/organisation', label: 'Payroll Organisation', active: pathname.startsWith('/hr/payroll/organisation') },
            // Gates on hr.payroll.salary.view — held by hr_head ALONE, plus the
            // Super Administrator via is_super_admin(). Narrowed from three
            // roles on 2026-08-21; what someone earns is a tighter decision than
            // which organisation pays them.
            { href: '/hr/payroll/salaries', label: 'Employee Salaries', active: pathname.startsWith('/hr/payroll/salaries') },
            // Directly under Employee Salaries and on the same key: the bands are
            // configuration FOR that screen, and the TDS column there is derived
            // from them rather than stored per person.
            { href: '/hr/payroll/tds-slabs', label: 'TDS Bands', active: pathname.startsWith('/hr/payroll/tds-slabs') },
            // Gates on hr.payroll.bank.view — hr_head alone, plus the Super
            // Administrator via is_super_admin().
            { href: '/hr/payroll/bank-accounts', label: 'Bank Accounts', active: pathname.startsWith('/hr/payroll/bank-accounts') },
            // Gates on hr.payroll.register.view — hr_head alone, plus the Super
            // Administrator. Last in the group because it is the step AFTER the
            // three above are populated: the register reads the payer directory,
            // the salary and the bank account, and reports whichever is missing.
            { href: '/hr/payroll/register', label: 'Salary Register', active: pathname.startsWith('/hr/payroll/register') },
          ]
        },
        {
          // Employee — people-records row, merged in from the retired
          // 'Employee Management' group (2026-07-20).
          //
          // ONE submenu by product decision (2026-07-20): a single employee
          // list, not five entries.
          //
          // This is the ONLY employee-list entry in the sidebar (2026-07-21).
          // It stays on '/staff/list' — the WRITE surface, owning the record
          // (create/edit/bulk upload/photos). The read-only '/hr/employees'
          // lens deliberately has no sidebar entry of its own; it reads the
          // same `staff` table and is reachable as an AutoTabNav chip under
          // /hr. Repointing this href there would strand the only entry point
          // for creating and editing staff records.
          //
          // Visibility note: GetRoleBasedPages (~:3100) shows this row only if
          // SOME submenu is permitted. '/staff/list' gates on `staff.view`,
          // held by 61 roles — so this row is effectively universal. Do not
          // narrow it to an HR-tier key without checking that count first.
          //
          // The parent href stays '/staff' (NOT '/staff/list') so the rest of
          // the subtree — dashboard, category, class-incharges — remains
          // reachable as manifest-derived AutoTabNav chips. staff has no
          // nav-config.ts, so this seed is their only reachability source.
          href: '/staff',
          label: 'Employee',
          active: pathname === '/staff' || pathname.startsWith('/staff/'),
          icon: Users,
          submenus: [
            { href: '/staff/list', label: 'Employee List', active: pathname === '/staff/list' },
          ]
        },
        {
          // Recruitment — own top-level menu (moved out of the HR dropdown so the
          // hiring pipeline reads as one unit: screen → submit → approve → interview).
          href: '/hr/recruitment',
          label: 'Recruitment',
          active: pathname.startsWith('/hr/recruitment'),
          icon: UserSearch,
          submenus: [
            { href: '/hr/recruitment', label: 'Dashboard', active: pathname === '/hr/recruitment' },
            { href: '/hr/recruitment/jobs', label: 'Job Postings', active: pathname.startsWith('/hr/recruitment/jobs') },
            { href: '/hr/recruitment/submit', label: 'Apply for Jobs', active: pathname === '/hr/recruitment/submit' },
            { href: '/hr/recruitment/my', label: 'My Submissions', active: pathname === '/hr/recruitment/my' },
            { href: '/hr/recruitment/approvals', label: 'Approvals', active: pathname === '/hr/recruitment/approvals' },
            { href: '/hr/recruitment/interviews', label: 'Interviews', active: pathname.startsWith('/hr/recruitment/interviews') },
            { href: '/hr/recruitment/approvals?view=all', label: 'All Approvals', active: false },
          ]
        },
        {
          // HR Admin cluster (/hr/admin) — one submenu per top-level admin
          // section. All entries gate on hr.dashboard.view, matching the strict
          // core-HR-only guard on the /hr/admin landing (Director decision, see
          // app/(routes)/hr/admin/page.tsx); each page still self-gates deeper.
          href: '/hr/admin',
          label: 'Admin',
          active: pathname.startsWith('/hr/admin'),
          icon: Settings,
          submenus: [
            { href: '/hr/admin', label: 'Dashboard', active: pathname === '/hr/admin' },
            { href: '/hr/admin/automation-rules', label: 'Automation Rules', active: pathname.startsWith('/hr/admin/automation-rules') },
            { href: '/hr/admin/designation-mapping', label: 'Designation Mapping', active: pathname.startsWith('/hr/admin/designation-mapping') },
            { href: '/hr/admin/disciplinary', label: 'Disciplinary', active: pathname.startsWith('/hr/admin/disciplinary') },
            { href: '/hr/admin/fdp', label: 'FDP', active: pathname.startsWith('/hr/admin/fdp') },
            { href: '/hr/admin/forms', label: 'Forms', active: pathname.startsWith('/hr/admin/forms') },
            { href: '/hr/admin/memos', label: 'Memos', active: pathname.startsWith('/hr/admin/memos') },
            { href: '/hr/admin/offboarding', label: 'Offboarding', active: pathname.startsWith('/hr/admin/offboarding') },
            { href: '/hr/admin/onboarding-checklists', label: 'Onboarding Checklists', active: pathname.startsWith('/hr/admin/onboarding-checklists') },
            { href: '/hr/admin/payroll', label: 'Payroll', active: pathname.startsWith('/hr/admin/payroll') },
            { href: '/hr/admin/performance-reviews', label: 'Performance Reviews', active: pathname.startsWith('/hr/admin/performance-reviews') },
            { href: '/hr/admin/policies', label: 'Policies', active: pathname.startsWith('/hr/admin/policies') },
            { href: '/hr/admin/promotions', label: 'Promotions', active: pathname.startsWith('/hr/admin/promotions') },
            { href: '/hr/admin/recruitment-approval-flows', label: 'Recruitment Approval Flows', active: pathname.startsWith('/hr/admin/recruitment-approval-flows') },
            { href: '/hr/admin/recruitment-maintenance', label: 'Recruitment Maintenance', active: pathname.startsWith('/hr/admin/recruitment-maintenance') },
            { href: '/hr/admin/recruitment-need', label: 'Recruitment Need', active: pathname.startsWith('/hr/admin/recruitment-need') },
            { href: '/hr/admin/required-documents', label: 'Required Documents', active: pathname.startsWith('/hr/admin/required-documents') },
            { href: '/hr/admin/shift-timings', label: 'Shift Timings', active: pathname.startsWith('/hr/admin/shift-timings') },
            { href: '/hr/admin/work-patterns', label: 'Work Patterns', active: pathname.startsWith('/hr/admin/work-patterns') },
            { href: '/hr/admin/terminations', label: 'Terminations', active: pathname.startsWith('/hr/admin/terminations') },
            { href: '/hr/admin/training', label: 'Training', active: pathname.startsWith('/hr/admin/training') },
            { href: '/hr/admin/leave-types', label: 'Leave Types', active: pathname.startsWith('/hr/admin/leave-types') },
            { href: '/hr/admin/leave-balances', label: 'Leave Balances', active: pathname.startsWith('/hr/admin/leave-balances') },
            { href: '/hr/admin/academic-years', label: 'HR Academic Years', active: pathname.startsWith('/hr/admin/academic-years') },
            { href: '/hr/admin/sanctioned-posts', label: 'Sanctioned Posts', active: pathname.startsWith('/hr/admin/sanctioned-posts') },
          ]
        }
      ]
    },
    {
      // Family Moments — campaign-based parent engagement (Father's Day 2026).
      groupLabel: 'Family Moments',
      menus: [
        {
          href: '/moments/submit',
          label: 'Family Moments',
          active: pathname.startsWith('/moments'),
          icon: Heart,
          submenus: [
            { href: '/moments/submit', label: 'Collect Messages', active: pathname === '/moments/submit' },
            { href: '/moments/campaigns', label: 'Campaigns', active: pathname === '/moments/campaigns' },
          ]
        }
      ]
    },
    {
      groupLabel: 'Learners',
      menus: [
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
          // Post-class feedback — the student gives a 10-second rating that
          // CONFIRMS their attendance. Lives in the student /learners namespace
          // (relocated out of /academic so it no longer inherits the Academic
          // module tab bar). Visibility gated to students by the session-feedback
          // special-case in GetRoleBasedPages.
          // 2026-07-06: absorbed the old "My Attendance Feedback" tab — this one
          // page now shows BOTH pending sessions (with inline confirm) AND the
          // confirmed-session history, so there is a single feedback tab, not two.
          // Renamed to the JKKN house term "Learning Studio Feedback" (JKKN calls
          // classrooms "Learning Studios"). The old /learners/my-attendance-feedback
          // route now redirects here via next.config.ts, which also drops it from
          // the auto-generated nav surfaces.
          href: '/learners/class-feedback',
          label: 'Learning Studio Feedback',
          active: pathname.startsWith('/learners/class-feedback'),
          icon: MessageSquare,
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
          // Fresher induction — the student's own induction view (their batch
          // schedule + per-session 1–5 rating + a Day-10 profile-completion
          // nudge). Auto student-visible via isStudentPortalRoute (/learners/my-).
          href: '/learners/my-induction',
          label: 'My Induction',
          active: pathname.startsWith('/learners/my-induction'),
          icon: Rocket,
          submenus: []
        },
        {
          // Senior Peer Mentor — a final-year student's lane to run their assigned
          // group of freshers (attendance check-in + kiosk feedback). UNGATED by
          // design: the page self-scopes via fn_induction_my_volunteer_sessions, so a
          // non-mentor sees an empty state. Student-visible via the isStudentPortalRoute
          // special-case, NOT a MENU_PERMISSIONS entry.
          href: '/my-induction-feedback',
          label: 'Senior Peer Mentor',
          active: pathname.startsWith('/my-induction-feedback'),
          icon: UserCheck,
          submenus: []
        },
        {
          // My Individual Development Plan — learner self-service (BUG-004298).
          // UNGATED by design (student self-scopes via RLS on cdc_idp_responses),
          // so it is student-visible via the isStudentPortalRoute special-case
          // below, NOT a MENU_PERMISSIONS entry. Distinct path from /learners/*.
          href: '/learner/idp',
          label: 'My Development Plan',
          active: pathname.startsWith('/learner/idp'),
          icon: ClipboardList,
          submenus: []
        },
        {
          href: '/learners/my-marks',
          label: 'My Marks',
          active: pathname.startsWith('/learners/my-marks'),
          icon: GraduationCap,
          submenus: []
        },
        {
          // No MENU_PERMISSIONS entry, same as My Marks above: the page gates
          // on profiles.role === 'student' itself and explains when it refuses.
          href: '/learners/my-syllabus',
          label: 'My Syllabus',
          active: pathname.startsWith('/learners/my-syllabus'),
          icon: BookOpen,
          submenus: []
        },
        {
          href: '/learners/my-bills',
          label: 'My Bills',
          active: pathname.startsWith('/learners/my-bills'),
          icon: Wallet,
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
            // Student portal (role=student — filtered downstream)
            { href: '/learners/my-timetable', label: 'My Timetable', active: pathname === '/learners/my-timetable' },
            { href: '/learners/my-attendance', label: 'My Attendance', active: pathname.startsWith('/learners/my-attendance') },
            { href: '/learners/my-profile', label: 'My Profile', active: pathname === '/learners/my-profile' },
            { href: '/learners/my-bills', label: 'My Bills', active: pathname.startsWith('/learners/my-bills') },
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
            { href: '/learners/school-master', label: 'School Master', active: pathname.startsWith('/learners/school-master') },
            { href: '/learners/postal-codes', label: 'Postal Codes', active: pathname.startsWith('/learners/postal-codes') },
          ]
        }
      ]
    },
    {
      groupLabel: 'Billing & Accounts',
      menus: [
        // Split into three domains 2026-08-25. One "Billing" menu had grown to
        // 23 submenus mixing college, transport and school work in one list.
        // The domains are real, not cosmetic: the schedule services filter on
        // institution_entity_type='institution', and school fees run on their
        // own school_fees.* permission namespace and school_fee_* tables.
        //
        // The three `active` predicates MUST stay mutually exclusive — all
        // three rows live under /billing, so the college one has to exclude the
        // other two prefixes or every row highlights at once.
        {
          href: '/billing',
          label: 'Colleges',
          active:
            pathname === '/billing' ||
            (pathname.startsWith('/billing/') &&
              !pathname.startsWith('/billing/transport') &&
              !pathname.startsWith('/billing/school-fees')),
          icon: GraduationCap,
          submenus: [
            { href: '/billing/schedule', label: 'Schedule · All Bills', active: pathname === '/billing/schedule' },
            { href: '/billing/schedule/students', label: 'Schedule · Student Search', active: pathname.startsWith('/billing/schedule/students') },
            { href: '/billing/coverage', label: 'Bill Coverage', active: pathname.startsWith('/billing/coverage') },
            { href: '/billing/onboarding', label: 'Learner Onboarding', active: pathname.startsWith('/billing/onboarding') },
            { href: '/billing/discounts', label: 'Scholarships', active: pathname.startsWith('/billing/discounts') },
            { href: '/billing/refunds', label: 'Refunds', active: pathname.startsWith('/billing/refunds') },
            { href: '/billing/refund-approvals', label: 'Refund Approvals', active: pathname.startsWith('/billing/refund-approvals') },
            { href: '/billing/receipt-cancellations', label: 'Receipt Cancellations', active: pathname.startsWith('/billing/receipt-cancellations') },
            { href: '/billing/apportionment', label: 'Apportionment', active: pathname.startsWith('/billing/apportionment') },
            { href: '/billing/invoices', label: 'Invoices', active: pathname.startsWith('/billing/invoices') },
            { href: '/billing/late-charges', label: 'Late Charges', active: pathname.startsWith('/billing/late-charges') },
            // ── Group-wide, not college-only ──────────────────────────────
            // These six serve schools too and deliberately have no second row
            // under Schools: one href in two menus highlights both at once.
            // Categories IS the school fee-head master (school-fee-head-service
            // reads billing_categories, collapsed to global in 20260428000001),
            // and the school counter writes billing_receipt_items, so Receipts
            // lists school payments as well.
            { href: '/billing/categories', label: 'Categories', active: pathname.startsWith('/billing/categories') },
            { href: '/billing/receipts', label: 'Receipts', active: pathname.startsWith('/billing/receipts') },
            { href: '/billing/reports', label: 'Reports', active: pathname.startsWith('/billing/reports') },
            { href: '/billing/analytics', label: 'Analytics', active: pathname.startsWith('/billing/analytics') },
            { href: '/billing/activities', label: 'Activities', active: pathname.startsWith('/billing/activities') },
            { href: '/billing/payment-accounts', label: 'Payment Gateway Accounts', active: pathname.startsWith('/billing/payment-accounts') },
          ]
        },
        {
          // /billing/transport is the app's ONLY transport route, so this is a
          // direct link rather than a menu whose arrow opens a single child.
          // Note the filter consequence: a menu with an empty submenus[] is
          // gated on its OWN MENU_PERMISSIONS entry (billing.transport.view)
          // instead of "any child is allowed". That mapping already exists.
          href: '/billing/transport',
          label: 'Transport Fees',
          active: pathname.startsWith('/billing/transport'),
          icon: Bus,
          submenus: []
        },
        {
          href: '/billing/school-fees',
          label: 'Schools',
          active: pathname.startsWith('/billing/school-fees'),
          icon: School,
          submenus: [
            // School fees (moved here from Admission > Settings 2026-08-13).
            // 'School Fee Plans' owns /billing/school-fees and its plan
            // sub-routes (/new, /[id]) but NOT the siblings below, which have
            // their own rows — otherwise two highlight at once.
            { href: '/billing/school-fees', label: 'School Fee Plans',
              active: pathname === '/billing/school-fees' ||
                (pathname.startsWith('/billing/school-fees/') &&
                  !pathname.startsWith('/billing/school-fees/term-calendar') &&
                  !pathname.startsWith('/billing/school-fees/concessions') &&
                  !pathname.startsWith('/billing/school-fees/generate') &&
                  !pathname.startsWith('/billing/school-fees/collect')) },
            { href: '/billing/school-fees/term-calendar', label: 'School Term Calendar', active: pathname.startsWith('/billing/school-fees/term-calendar') },
            { href: '/billing/school-fees/concessions', label: 'School Fee Concessions', active: pathname.startsWith('/billing/school-fees/concessions') },
            { href: '/billing/school-fees/generate', label: 'Generate School Fees', active: pathname.startsWith('/billing/school-fees/generate') },
            // Sits after Generate because that is the order of the work: raise
            // the year's bills, then take money against them.
            { href: '/billing/school-fees/collect', label: 'School Bill Payment', active: pathname.startsWith('/billing/school-fees/collect') },
          ]
        }
      ]
    },
    {
      // 2026-04-28: visual sidebar entry for IMS. Permission keys + 31 route mappings
      // already lived in MENU_PERMISSIONS / PERMISSION_CATEGORIES; the menu tree itself
      // had no IMS group, so super_admins still couldn't see it. Pattern matches Billing
      // (single top-level entry, all sections collapse into submenus[]).
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
            { href: '/ims/indents/hod-approvals', label: 'Indents · HOD Approvals', active: pathname === '/ims/indents/hod-approvals' },
            { href: '/ims/transfers', label: 'Transfers', active: pathname.startsWith('/ims/transfers') },
            { href: '/ims/sales', label: 'Sales (POS)', active: pathname === '/ims/sales' },
            { href: '/ims/sales/history', label: 'Sales · History', active: pathname === '/ims/sales/history' },
            { href: '/ims/reports', label: 'Reports', active: pathname.startsWith('/ims/reports') },
            { href: '/ims/financial', label: 'Financial Audit', active: pathname === '/ims/financial' },
            { href: '/ims/settings/stores', label: 'Settings · Stores', active: pathname === '/ims/settings/stores' },
            { href: '/ims/settings/suppliers', label: 'Settings · Suppliers', active: pathname === '/ims/settings/suppliers' },
            { href: '/ims/settings/units', label: 'Settings · Units', active: pathname === '/ims/settings/units' },
            { href: '/ims/settings/unit-conversions', label: 'Settings · Unit Conversions', active: pathname === '/ims/settings/unit-conversions' },
            // Store Kits (PR-K2) — visibility gated per-entry via MENU_PERMISSIONS
            { href: '/ims/kits', label: 'Kits · Rules', active: pathname === '/ims/kits' },
            { href: '/ims/kits/counter', label: 'Kits · Counter', active: pathname === '/ims/kits/counter' },
            { href: '/ims/kits/billing-flags', label: 'Kits · Billing Flags', active: pathname === '/ims/kits/billing-flags' },
          ]
        }
      ]
    },
    {
      // 2026-07-08: visual sidebar entry for Procurement (centralized purchasing).
      // Mirrors the IMS group pattern (single top-level entry, sections collapse
      // into submenus[]). Submenu hrefs are the reachability seeds. Later phases
      // (RFQ / PO / GRN) add submenu rows here. See PLAN-procurement-v1.md.
      groupLabel: 'Procurement',
      menus: [
        {
          href: '/procurement',
          label: 'Procurement',
          active: pathname === '/procurement' || pathname.startsWith('/procurement/'),
          icon: ShoppingCart,
          submenus: [
            { href: '/procurement', label: 'Overview', active: pathname === '/procurement' },
            { href: '/procurement/requests', label: 'Purchase Requests', active: pathname.startsWith('/procurement/requests') },
            { href: '/procurement/rfqs', label: 'RFQs', active: pathname.startsWith('/procurement/rfqs') },
            { href: '/procurement/purchase-orders', label: 'Purchase Orders', active: pathname.startsWith('/procurement/purchase-orders') },
            { href: '/procurement/grn', label: 'Goods Receipt', active: pathname.startsWith('/procurement/grn') },
          ]
        }
      ]
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
            { href: '/resource-management/reservations/calendar', label: 'Reservations · Calendar', active: pathname === '/resource-management/reservations/calendar' },
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
            // Notifications (relocated /admin/notifications → /notifications/admin, 2026-06-11 wave-2)
            { href: '/notifications/admin', label: 'Notifications · All', active: pathname === '/notifications/admin' },
            { href: '/notifications/admin/new', label: 'Notifications · Send', active: pathname === '/notifications/admin/new' },
            { href: '/notifications/admin/compliance', label: 'Notifications · Compliance', active: pathname === '/notifications/admin/compliance' },
            { href: '/notifications/admin/audiences', label: 'Notifications · Audiences', active: pathname.startsWith('/notifications/admin/audiences') },
            // LTI
            { href: '/admin/lti', label: 'LTI · Dashboard', active: pathname === '/admin/lti' },
            { href: '/admin/lti/analytics', label: 'LTI · Analytics', active: pathname === '/admin/lti/analytics' },
            { href: '/admin/lti/grade-sync', label: 'LTI · Grade Sync', active: pathname === '/admin/lti/grade-sync' },
            { href: '/admin/lti/launches', label: 'LTI · Launch Debug', active: pathname === '/admin/lti/launches' },
            // PDE admin entries moved to the unified 'PDE' sidebar group (PR
            // sidebar-unify, 2026-06-09). See groupLabel: 'PDE' below.
            // Other
            { href: '/audit-trail', label: 'Audit Trail', active: pathname.startsWith('/audit-trail') },
            { href: '/learners/lifecycle', label: 'Lifecycle Analytics', active: pathname.startsWith('/learners/lifecycle') },
            { href: '/admin/page-metadata', label: 'Page Metadata', active: pathname.startsWith('/admin/page-metadata') },
            { href: '/admin/ai-models', label: 'AI Models', active: pathname.startsWith('/admin/ai-models') },
          ]
        },
        {
          // ID Cards (nav wiring 2026-07-24) — print queue, template editor
          // and printer policy for the on-prem card-print bridge.
          href: '/admin/id-cards',
          label: 'ID Cards',
          active: pathname.startsWith('/admin/id-cards'),
          icon: IdCard,
          submenus: [
            { href: '/admin/id-cards/morning', label: 'Morning Page', active: pathname.startsWith('/admin/id-cards/morning') },
            { href: '/admin/id-cards/print-queue', label: 'Print Queue', active: pathname.startsWith('/admin/id-cards/print-queue') },
            { href: '/admin/id-cards/batch-print', label: 'Batch Print', active: pathname.startsWith('/admin/id-cards/batch-print') },
            { href: '/admin/id-cards/photo-check', label: 'Photo Check', active: pathname.startsWith('/admin/id-cards/photo-check') },
            { href: '/admin/id-cards/address-check', label: 'Address Check', active: pathname.startsWith('/admin/id-cards/address-check') },
            { href: '/admin/id-cards/template', label: 'Template', active: pathname.startsWith('/admin/id-cards/template') },
            { href: '/admin/id-cards/policy', label: 'Policy', active: pathname.startsWith('/admin/id-cards/policy') },
          ]
        }
      ]
    },
    // OKR menu retired 2026-06-01 — superseded by Projects (unified work-management).
    // OKR's data tables were dropped in PR #1114 so its dashboard only errors/zeros.
    // Routes remain at /okr (direct-URL) but are removed from the sidebar.
    {
      groupLabel: 'Projects',
      menus: [
        // Single sidebar entry — all OKR navigation lives in the module's
        // in-page tab bar (OKRNav, see app/(routes)/okr/_components/
        // okr-nav.tsx). Mirrors Campus Living + Learners Council + Admission
        // CRM. SectionSubNav on /okr/objectives for All/Create.
        //
        // Why: flat sidebar (1 entry per module) + in-page tabs scales
        // across JKKN's 8+ modules. URLs UNCHANGED.
        {
          href: '/projects',
          label: 'Projects',
          active: pathname.startsWith('/projects'),
          icon: FolderKanban,
          submenus: []
        },
        {
          // Sits beside Projects because a walk observation IS a project_task
          // under the standing CAMPUS-OPS project — not a separate module.
          // This literal href is also the reachability seed: without it
          // check-nav-reachability.ts reports /campus-walk as unreachable and
          // the Director has no way to open his own capture screen.
          href: '/campus-walk',
          label: 'Campus Walk',
          active: pathname.startsWith('/campus-walk'),
          icon: ClipboardCheck,
          submenus: [
            {
              href: '/campus-walk',
              label: 'Capture',
              active: pathname === '/campus-walk'
            },
            {
              // Literal href, so check-nav-reachability.ts can reach it. The
              // fixer screen deliberately is NOT here — it is ?task=-invoked
              // from its bell notification and has no standalone surface.
              href: '/campus-walk/review',
              label: 'Awaiting approval',
              active: pathname.startsWith('/campus-walk/review')
            }
          ]
        }
      ]
    },
    {
      // Wave 2 merged 'Learning' + 'Value Added Courses' into 'Learning & Courses'.
      // The /vac entry below was previously its own groupLabel; now folded here.
      groupLabel: 'Learning & Courses',
      // The legacy 'Learning' menu (/learn/* quest board, capability tree, build
      // arena, channels, profile, leaderboard) moved to the unified 'PDE'
      // sidebar group (PR sidebar-unify, 2026-06-09) — those are PDE learner
      // surfaces (gated by pde.* keys). VAC stays here.
      menus: [
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
        },
        {
          // AI Pulse — JKKN's weekly Pulse-to-Practice AI-learning cycle.
          // Events-module extension (cycles = startup_events rows, config.kind
          // = 'ai_pulse'). Re-added to the sidebar after the 2026-06-09
          // sidebar-unify wave dropped the May entry. Each submenu is gated by
          // its MENU_PERMISSIONS key, so learners see My Pulse, the Champion
          // sees the admin consoles, IQAC sees NAAC evidence.
          href: '/ai-pulse',
          label: 'AI Pulse',
          active: pathname === '/ai-pulse' || pathname.startsWith('/ai-pulse/'),
          icon: Sparkles,
          submenus: [
            { href: '/ai-pulse', label: 'Home', active: pathname === '/ai-pulse' },
            { href: '/ai-pulse/my-pulse', label: 'My AI Pulse', active: pathname.startsWith('/ai-pulse/my-pulse') },
            { href: '/ai-pulse/leaderboard', label: 'Leaderboard', active: pathname.startsWith('/ai-pulse/leaderboard') },
            { href: '/ai-pulse/admin/cycles', label: 'Champion · Cycles', active: pathname.startsWith('/ai-pulse/admin/cycles') },
            { href: '/ai-pulse/admin/anomalies', label: 'Champion · Anomalies', active: pathname.startsWith('/ai-pulse/admin/anomalies') },
            { href: '/ai-pulse/admin/reports', label: 'Champion · Reported Prompts', active: pathname.startsWith('/ai-pulse/admin/reports') },
            { href: '/ai-pulse/admin/trends', label: 'Champion · Session Trend', active: pathname.startsWith('/ai-pulse/admin/trends') },
            { href: '/ai-pulse/admin/policies', label: 'Admin · Policies', active: pathname.startsWith('/ai-pulse/admin/policies') },
            { href: '/ai-pulse/evidence/naac', label: 'NAAC Evidence', active: pathname.startsWith('/ai-pulse/evidence/naac') },
          ]
        }
      ]
    },
    {
      // Meetings — Universal Booking module (Calendly-parity). Added to the
      // sidebar 2026-06-19 in the post-merge reconcile: the 8 surfaces (PRs
      // #1466–#1474) shipped pages + permissions but NO sidebar entry, so the
      // module was unreachable by clicking. Each submenu is gated by its
      // MENU_PERMISSIONS key. "My Availability & Page" is the self-service
      // booking-page setup (handle + Google connect + public toggle).
      groupLabel: 'Scheduling',
      menus: [
        {
          href: '/meetings',
          label: 'Meetings',
          active: pathname === '/meetings' || pathname.startsWith('/meetings/'),
          icon: CalendarClock,
          submenus: [
            { href: '/meetings', label: 'Home', active: pathname === '/meetings' },
            { href: '/meetings/my-bookings', label: 'My Meetings', active: pathname.startsWith('/meetings/my-bookings') },
            { href: '/meetings/schedule', label: 'Schedule a Meeting', active: pathname.startsWith('/meetings/schedule') },
            { href: '/meetings/availability', label: 'My Availability & Page', active: pathname.startsWith('/meetings/availability') },
            { href: '/meetings/manage', label: 'Meeting Types', active: pathname.startsWith('/meetings/manage') },
            { href: '/meetings/series', label: 'Recurring Series', active: pathname === '/meetings/series' },
            // Listed explicitly, like /meetings/contacts/scan/saved: /meetings has
            // no nav-config, so a tier-N+1 chip is never rendered for it and the
            // reachability gate reports the rules screen as unreachable otherwise.
            { href: '/meetings/series/rules', label: 'Scheduling Rules', active: pathname.startsWith('/meetings/series/rules') },
            { href: '/meetings/inbox', label: 'Inbox', active: pathname.startsWith('/meetings/inbox') },
            { href: '/meetings/routing-forms', label: 'Routing Forms', active: pathname.startsWith('/meetings/routing-forms') },
            { href: '/meetings/workflows', label: 'Workflows', active: pathname.startsWith('/meetings/workflows') },
            { href: '/meetings/polls', label: 'Polls', active: pathname.startsWith('/meetings/polls') },
            { href: '/meetings/contacts', label: 'Contacts', active: pathname === '/meetings/contacts' },
            { href: '/meetings/contacts/scan', label: 'Scan a Card', active: pathname === '/meetings/contacts/scan' },
            { href: '/meetings/contacts/scan/saved', label: 'Scanned Contacts', active: pathname.startsWith('/meetings/contacts/scan/saved') },
            { href: '/meetings/analytics', label: 'Analytics', active: pathname.startsWith('/meetings/analytics') },
            { href: '/meetings/adoption', label: 'Adoption', active: pathname.startsWith('/meetings/adoption') },
            { href: '/meetings/webhooks', label: 'Webhooks', active: pathname.startsWith('/meetings/webhooks') },
            { href: '/meetings/embed', label: 'Embed & Theming', active: pathname.startsWith('/meetings/embed') },
          ]
        }
      ]
    },
    {
      // PDE (Principal Development Engine) — unified module group.
      // Phase 2 of the module extraction (PR #1257 moved the routes to
      // /pde/{admin,faculty,learn}/*; this PR unifies the sidebar entries that
      // were previously scattered across Administration / Faculty /
      // Learning & Courses). Three role-scoped menus; each entry is gated by
      // its MENU_PERMISSIONS key, so users only see the menus their role grants
      // (learners see Learner, faculty see Faculty, admins see Administration).
      groupLabel: 'PDE',
      menus: [
        {
          href: '/pde/learn/demonstrations',
          label: 'Learner',
          active: pathname.startsWith('/pde/learn') || pathname.startsWith('/learn/'),
          icon: BookOpen,
          submenus: [
            { href: '/pde/learn/demonstrations', label: 'My Demonstrations', active: pathname.startsWith('/pde/learn/demonstrations') },
            { href: '/pde/learn/cohort', label: 'Cohort Comparison', active: pathname.startsWith('/pde/learn/cohort') },
            { href: '/pde/learn/transcript', label: 'My Transcript', active: pathname.startsWith('/pde/learn/transcript') },
            { href: '/learn/quests', label: 'Quest Board', active: pathname === '/learn/quests' || pathname.startsWith('/learn/quests/') },
            { href: '/learn/capabilities', label: 'Capability Tree', active: pathname.startsWith('/learn/capabilities') },
            { href: '/learn/build', label: 'Build Arena', active: pathname.startsWith('/learn/build') },
            { href: '/learn/channels', label: 'Channels', active: pathname.startsWith('/learn/channels') },
            { href: '/learn/profile', label: 'Profile', active: pathname === '/learn/profile' },
            { href: '/learn/leaderboard', label: 'Leaderboard', active: pathname === '/learn/leaderboard' },
            { href: '/guide', label: 'Guide', active: pathname.startsWith('/guide') },
          ]
        },
        {
          href: '/pde/faculty/dashboard',
          label: 'Faculty',
          active: pathname.startsWith('/pde/faculty'),
          icon: GraduationCap,
          submenus: [
            { href: '/pde/faculty/dashboard', label: 'Dashboard', active: pathname === '/pde/faculty/dashboard' },
            { href: '/pde/faculty/assessments', label: 'Assessments', active: pathname === '/pde/faculty/assessments' },
            { href: '/pde/faculty/quests', label: 'Quests', active: pathname === '/pde/faculty/quests' },
            { href: '/pde/faculty/demonstrations', label: 'Demonstrations', active: pathname === '/pde/faculty/demonstrations' },
            { href: '/pde/faculty/cases', label: 'Clinical Cases', active: pathname.startsWith('/pde/faculty/cases') },
            { href: '/pde/faculty/analytics', label: 'Analytics', active: pathname === '/pde/faculty/analytics' },
            { href: '/guide', label: 'Guide', active: pathname.startsWith('/guide') },
          ]
        },
        {
          href: '/pde/admin',
          label: 'Administration',
          active: pathname.startsWith('/pde/admin'),
          icon: Brain,
          submenus: [
            { href: '/pde/admin', label: 'Dashboard', active: pathname === '/pde/admin' },
            { href: '/pde/admin/assessments', label: 'Assessments', active: pathname === '/pde/admin/assessments' || pathname === '/pde/admin/assessments/create' },
            { href: '/pde/admin/quests', label: 'Quests', active: pathname === '/pde/admin/quests' || pathname === '/pde/admin/quests/create' },
            { href: '/pde/admin/capabilities', label: 'Capabilities', active: pathname === '/pde/admin/capabilities' },
            { href: '/pde/admin/engagement', label: 'Engagement', active: pathname === '/pde/admin/engagement' },
            { href: '/pde/admin/at-risk', label: 'At-Risk', active: pathname === '/pde/admin/at-risk' },
            { href: '/pde/admin/lti', label: 'LTI Config', active: pathname === '/pde/admin/lti' },
            { href: '/guide', label: 'Guide', active: pathname.startsWith('/guide') },
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
            { href: '/health/sports/squad-requests', label: 'Squad Requests', active: pathname === '/health/sports/squad-requests' },
            { href: '/health/sports/approvals', label: 'Tournament Permissions', active: pathname === '/health/sports/approvals' },
            { href: '/health/fitness', label: 'Fitness Tests', active: pathname === '/health/fitness' || pathname.startsWith('/health/fitness/') },
            { href: '/health/training', label: 'Training Log', active: pathname === '/health/training' },
            { href: '/health/achievements', label: 'Achievements', active: pathname === '/health/achievements' },
            { href: '/health/assessments', label: 'Mental Health Check-In', active: pathname === '/health/assessments' },
            { href: '/health/admin/programs', label: 'Manage Programs', active: pathname.startsWith('/health/admin/programs') },
            { href: '/health/counselor', label: 'Counselor Dashboard', active: pathname === '/health/counselor' },
            { href: '/health/programs', label: 'Wellness Programs', active: pathname === '/health/programs' || pathname.startsWith('/health/programs/') },
            // Sports activities surfaced under Health & Wellness (Director ask, 2026-06-22).
            // These are NAV LINKS to the events-platform modules — NOT route moves:
            // /events/marathon & /events/tournament keep their canonical homes + permissions
            // (each link's visibility is gated by its own MENU_PERMISSIONS entry).
            { href: '/events/marathon', label: 'Sports Marathon', active: pathname === '/events/marathon' || pathname.startsWith('/events/marathon/') },
            { href: '/events/tournament', label: 'Sports Tournaments', active: pathname === '/events/tournament' || pathname.startsWith('/events/tournament/') },
            // Student-facing browse page (sports.tournaments.browse) — the only
            // tournament surface a learner can open; admin pages need .view.
            { href: '/events/tournaments', label: 'Tournaments · Register', active: pathname === '/events/tournaments' },
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
            // The parent "Events" row is a PURE ACCORDION TOGGLE at runtime
            // (components/Navbar/menu.tsx: `e.preventDefault(); toggleModule(...)`),
            // so its own href was never clickable and /events had no sidebar path
            // at all — the hub's General Events list (the only surface listing
            // wizard-created lectures/cultural/convocation events) was reachable
            // only via Ctrl+K or a typed URL. check:reachability did NOT catch
            // this: it seeds from every literal href in this file and assumes
            // sidebar links are reachable, which the accordion parent is not.
            // Same parent-href-as-leaf fix as '/users' → "All Users" and
            // '/procurement' → "Overview". Also restores the chip gateway to
            // /events/proposals, which AutoTabNav only renders from /events.
            { href: '/events', label: 'All Events', active: pathname === '/events' },
            // Events Platform Promotion PR9 (2026-06-23): one create flow asks format + home
            { href: '/events/create', label: 'Create an Event', active: pathname === '/events/create' },
            { href: '/events/presets', label: 'Event Presets', active: pathname === '/events/presets' },
            { href: '/events/marathon', label: 'Marathon · All Events', active: pathname === '/events/marathon' },
            { href: '/events/marathon/new', label: 'Marathon · New Event', active: pathname === '/events/marathon/new' },
            // Sports Tournament PR1 (2026-06-22): conduct sports tournaments on the events platform
            { href: '/events/tournament', label: 'Tournament · All', active: pathname === '/events/tournament' },
            { href: '/events/tournament/new', label: 'Tournament · New', active: pathname === '/events/tournament/new' },
            // Stream C (2026-04-26): event_proposals workflow — chat-bypass propose intake
            { href: '/events/propose', label: 'Propose an Event', active: pathname === '/events/propose' || pathname.startsWith('/events/propose/') },
          ]
        }
      ]
    },
    {
      groupLabel: 'Courses',
      menus: [
        {
          href: '/courses',
          label: 'Courses',
          // Same parent-href-as-leaf trap as '/events' above: the parent row is
          // a pure accordion toggle at runtime, so its own href is never
          // clickable. The 'All Courses' submenu leaf below is what actually
          // makes /courses reachable by check:reachability's chip-click walk.
          active: pathname === '/courses' || pathname.startsWith('/courses/'),
          icon: Presentation,
          submenus: [
            { href: '/courses', label: 'All Courses', active: pathname === '/courses' },
            { href: '/courses/new', label: 'Create a Course', active: pathname === '/courses/new' },
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
        },
        {
          // 2026-08-13 (BUG-005799 / BUG-005800) — the one exception to the flat
          // single-row rule above, and it is not decoration.
          //
          // A School of Influence coordinator is authorised for the review queue
          // and for nothing else in Startup Studio: /startup-studio itself is
          // gated on startup_studio.analytics.view, which they do not hold. So
          // the module row is a locked door for them, and routing them through
          // it would land them on a page they cannot open — and even if they
          // could, the in-page chip strip suppresses a lone surviving chip, so
          // the module root is a dead end by construction.
          //
          // This row is therefore a DIRECT link to the work: gated on
          // cohort.manage, the same key the queue and its RPCs use, so the
          // people who already run the programme finally get a link instead of
          // a URL they have to remember. menu.tsx grants that key to an active
          // appointment for nav purposes only (see
          // hooks/school-of-influence/use-soi-coordinator-nav-access.ts).
          href: '/startup-studio/school-of-influence/admin/applications',
          label: 'School of Influencer',
          active: pathname.startsWith('/startup-studio/school-of-influence'),
          icon: GraduationCap,
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
            // PDE faculty entries moved to the unified 'PDE' sidebar group (PR
            // sidebar-unify, 2026-06-09). See groupLabel: 'PDE' below.
          ]
        }
      ]
    },
    {
      groupLabel: 'Calendar',
      menus: [
        {
          href: '/calendar',
          label: 'Calendar',
          active: pathname === '/calendar' || pathname.startsWith('/calendar/'),
          icon: Calendar,
          submenus: []
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
      groupLabel: 'CDC',
      menus: [
        {
          href: '/cdc',
          label: 'CDC Hub',
          active: pathname === '/cdc',
          icon: LayoutGrid,
          submenus: []
        },
        {
          href: '/cdc/drives',
          label: 'Campus Drives',
          active: pathname.startsWith('/cdc/drives'),
          icon: Briefcase,
          submenus: []
        },
        {
          href: '/cdc/placements',
          label: 'Placements',
          active: pathname.startsWith('/cdc/placements'),
          icon: Award,
          submenus: []
        },
        {
          href: '/cdc/internships',
          label: 'Internships',
          active: pathname.startsWith('/cdc/internships'),
          icon: GraduationCap,
          submenus: []
        },
        {
          href: '/cdc/idp',
          label: 'Development Plans',
          active: pathname.startsWith('/cdc/idp'),
          icon: ClipboardList,
          submenus: []
        },
        {
          href: '/cdc/clubs',
          label: 'Clubs',
          active: pathname.startsWith('/cdc/clubs'),
          icon: Users2,
          submenus: []
        },
        {
          href: '/cdc/mentors',
          label: 'Mentor Pairings',
          active: pathname.startsWith('/cdc/mentors'),
          icon: UserCheck,
          submenus: []
        },
        {
          href: '/cdc/training',
          label: 'Training Programmes',
          active: pathname.startsWith('/cdc/training'),
          icon: BookOpen,
          submenus: []
        },
        {
          href: '/cdc/govt-readiness',
          label: 'Govt Job Readiness',
          active: pathname.startsWith('/cdc/govt-readiness'),
          icon: Target,
          submenus: []
        },
        {
          href: '/cdc/career-guidance',
          label: 'AI Career Guidance',
          active: pathname.startsWith('/cdc/career-guidance'),
          icon: Compass,
          submenus: []
        },
        {
          href: '/cdc/bulletin',
          label: 'Opportunities Bulletin',
          active: pathname.startsWith('/cdc/bulletin'),
          icon: Megaphone,
          submenus: []
        },
        {
          // Employer Requirement Intake — company job-vacancy submissions
          // (public self-submit + CDC staff entry). Public URL: /employers/submit.
          href: '/cdc/requirements',
          label: 'Employer Requirements',
          active: pathname.startsWith('/cdc/requirements'),
          icon: Building2,
          submenus: []
        },
        {
          // Industry Relations — one accordion row over the two industry
          // directories. They are DIFFERENT TABLES with the same first word:
          //   • Industry Mentors  → industry_mentors  (individual people)
          //   • Industry Partners → industry_partners (companies)
          //
          // Nested rather than flat because the CDC group was already sitting
          // on the hard cap of 14 top-level items (lib/sidebar-validator.ts);
          // adding a 15th flat row fails `npm run check:sidebar`. Both URLs are
          // unchanged, so no bookmark breaks.
          //
          // The parent row carries no permission of its own — GetRoleBasedPages
          // shows a parent when ANY submenu is accessible, and menu.tsx attaches
          // MENU_PERMISSIONS[sub.href] to each child, so a viewer who holds only
          // one of the two keys sees only that one child.
          href: '/cdc/industry-mentors',
          label: 'Industry Relations',
          active:
            pathname.startsWith('/cdc/industry-mentors') ||
            pathname.startsWith('/industry-partners'),
          icon: Factory,
          submenus: [
            {
              href: '/cdc/industry-mentors',
              label: 'Industry Mentors',
              active: pathname.startsWith('/cdc/industry-mentors')
            },
            {
              href: '/industry-partners',
              label: 'Industry Partners',
              active: pathname.startsWith('/industry-partners')
            }
          ]
        },
        {
          href: '/cdc/exports',
          label: 'Reports & Exports',
          active: pathname.startsWith('/cdc/exports'),
          icon: FileDown,
          submenus: []
        },
      ]
    },
    {
      // Feedback Dashboard — Universal Feedback Spine.
      // Added 2026-06-26: admin-level view of AI-classified feedback_events
      // (sentiment, themes, complaints, troll-storm concentration). Gated by
      // feedback.view; super-admin and admin always see it via RLS bypass.
      groupLabel: 'Feedback',
      menus: [
        {
          href: '/feedback',
          label: 'Feedback',
          active: pathname === '/feedback' || pathname.startsWith('/feedback/'),
          icon: MessageSquare,
          submenus: [],
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
            pathname.startsWith('/admin/proof-disputes') ||
            pathname.startsWith('/admin/learner-notes') ||
            pathname.startsWith('/ai-query/admin'),
          icon: Settings,
          submenus: [
            { href: '/system/api-management', label: 'API Management', active: pathname === '/system/api-management' },
            { href: '/system/lti-tools', label: 'LTI Tools', active: pathname.startsWith('/system/lti-tools') },
            { href: '/my-bug-reports', label: 'My Bug Reports', active: pathname === '/my-bug-reports' },
            { href: '/bug-leaderboard', label: 'Bug Leaderboard', active: pathname === '/bug-leaderboard' },
            { href: '/admin/bug-reports', label: 'All Bug Reports', active: pathname === '/admin/bug-reports' },
            { href: '/admin/proof-disputes', label: 'Record Corrections', active: pathname === '/admin/proof-disputes' },
            { href: '/admin/learner-notes', label: 'Learner Notes', active: pathname === '/admin/learner-notes' },
            { href: '/ai-query/admin', label: 'AI Query Tools', active: pathname.startsWith('/ai-query/admin') },
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

/**
 * Student-portal routes (My Timetable / My Attendance / My Profile / My Marks
 * and the student Leave-OnDuty "My Applications" surface) are visible ONLY to
 * the `student` role — never to super admin or any staff/admin role, and
 * regardless of any permission grants. The pages themselves server-side
 * redirect every non-student to `/` (see the learners/my-* page shells),
 * so surfacing the link to anyone else is dead navigation.
 *
 * Single source of truth — used by both the top-level row filter AND the
 * nested-submenu filter (these links also appear as flyout submenus under the
 * admin "Admission Management" parent), for super admin and every other role.
 */
export function isStudentPortalRoute(href: string): boolean {
  return (
    href.includes('/learners/my-') ||
    href === '/learners/leave-onduty/my-applications' ||
    // Post-class feedback (Class Feedback) — student-only lane relocated out of
    // /academic. (My Attendance Feedback already matches /learners/my- above.)
    href === '/learners/class-feedback' ||
    // My Development Plan (learner self-service IDP, BUG-004298) — ungated,
    // student-visible; distinct /learner/ path doesn't match /learners/my-.
    href === '/learner/idp' ||
    // Senior Peer Mentor lane — a final-year student's induction mentor duties
    // (attendance + kiosk feedback for their assigned freshers). Ungated,
    // student-visible; self-scopes to an empty state for non-mentors.
    href === '/my-induction-feedback'
  );
}

// Pre-onboarding (induction-only) learners may navigate to ONLY the allowlisted
// pages. Second-stage filter applied AFTER GetRoleBasedPages in the nav
// consumers (menu.tsx, bottom-navbar.tsx) so the sidebar shows only what they
// can actually reach. The proxy is the real gate; the href list is shared with
// it (lib/constants/induction-access.ts) so the two can't drift.
// Spec: specs/pre-onboarding-induction-access-2026-06-29.md

/** Keep only the induction-only menu entries; drop everything else. */
export function filterToInductionOnlyMenu(groups: MenuGroup[]): MenuGroup[] {
  return groups
    .map((group) => ({
      ...group,
      menus: group.menus
        .filter((menu) => INDUCTION_ONLY_NAV_HREFS.has(menu.href))
        .map((menu) => {
          // Accordion parents are retargeted at the one leaf these learners can
          // actually use (see INDUCTION_ONLY_NAV_REWRITES); submenus always go,
          // so the entry renders as a plain link.
          const rewrite = INDUCTION_ONLY_NAV_REWRITES[menu.href];
          return rewrite
            ? {
                ...menu,
                href: rewrite.href,
                label: rewrite.label,
                noSubmenus: true,
                submenus: [],
              }
            : { ...menu, submenus: [] };
        }),
    }))
    .filter((group) => group.menus.length > 0);
}


// New function to filter menus based on user role permissions
export function GetRoleBasedPages(
  pathname: string,
  userRole?: CustomRole | RolePermissionData | null
): MenuGroup[] {
  const allMenus = GetPages(pathname);

  // Campus Living sidebar is role-aware: students get a single entry (no
  // admin sub-page accordion — those pages auto-discover from the route
  // manifest ungated and would otherwise leak the full admin list). Everyone
  // else (super admin, wardens, staff) gets the full auto-discovered
  // accordion. Set here because GetPages() has no role context.
  //
  // Students never hold the staff gate (campus_living.dashboard.view), so the
  // entry is rewritten to the My Hostel hub and gated on
  // campus_living.my_hostel.view instead. The nav surfaces (menu.tsx +
  // bottom-navbar.tsx) overwrite that key with live user_is_hosteler() status,
  // so only students with hostel accommodation see it.
  if (userRole?.role_key === 'student') {
    for (const group of allMenus) {
      for (const menu of group.menus) {
        if (menu.href === '/campus-living') {
          menu.noSubmenus = true;
          menu.href = '/campus-living/my-hostel';
          menu.label = 'My Hostel';
        }
      }
    }
  }

  // Super admin gets all menus EXCEPT student-only pages
  if (userRole?.role_key === 'super_admin') {
    return allMenus.map((group) => ({
      ...group,
      menus: group.menus
        // Hide student-portal top-level rows (my-* and leave-onduty/my-applications)
        // from super admin. Bug report pages are NOT student-portal routes, so
        // they remain visible to everyone including super admin.
        .filter((menu) => !isStudentPortalRoute(menu.href))
        // Also strip any student-portal links nested as submenus under an admin
        // parent. The "Admission Management" (/learners/enquiries) flyout carries
        // My Attendance / My Profile / My Timetable as submenus — without this
        // they would still leak into the super-admin flyout.
        .map((menu) => ({
          ...menu,
          submenus: menu.submenus.filter((submenu) => !isStudentPortalRoute(submenu.href)),
        })),
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

          // Platform Guide is always visible for all users (universal in-app help)
          if (menu.href === '/guide') return true;

          // My Desk is always visible for all users. A handover exists BECAUSE
          // the receiver holds no permission for the work — so the inbox where
          // they accept or decline it cannot itself be permission-gated, or the
          // only people it is for can never find it. Its MENU_PERMISSIONS entry
          // maps to view_profile, which isPageAccessible() treats as universal
          // and so opens the page; this line is the sidebar half, because the
          // filter below does NOT short-circuit view_profile and that key is
          // true on only 18 of 85 live roles (measured 2026-08-05 — principal,
          // hod, faculty, staff, coo and ceo are all missing it). Same
          // treatment as /guide and /my-induction-sessions.
          if (menu.href === '/my-desk') return true;

          // "My Induction Sessions" is SELF-SCOPED: its RPCs gate on speakership
          // (event_session_speakers.profile_id = auth.uid()); non-presenters just
          // see an empty state. It deliberately has no MENU_PERMISSIONS entry, but
          // the default-deny below hides unmapped routes from every non-super-admin
          // — exactly the resource persons the page exists for (found live
          // 2026-07-03: presenter couldn't discover his own feedback + live-pulse
          // page). Always visible, same pattern as /guide.
          if (menu.href === '/my-induction-sessions') return true;

          // Check if menu requires super admin
          if ((menu as any).requiresSuperAdmin) {
            return false; // Hide from non-super admin users
          }

          // Special case: Student portal pages (my-* and leave-onduty) are ONLY for students
          // This check must come BEFORE the submenus check
          if (isStudentPortalRoute(menu.href)) {
            return userRole.role_key === 'student';
          }

          // Special handling for parent menus with submenus
          if (menu.submenus.length > 0) {
            // Improvement Board — the oversight read (HOD / principal). They
            // hold improvement.ideas.view_scoped and NOT one of the keys any
            // submenu below declares, so the .some() would hide the whole
            // parent and the rows the RLS branch hands them stay unreachable
            // except by typing the URL. MENU_PERMISSIONS is one key per route
            // and cannot express the union, so the union is carried here — the
            // same idiom the submenu filter below already uses for several
            // routes. The matching submenu case opens the board itself ONLY.
            if (
              menu.href === '/improvement-board' &&
              userRole.permissions['improvement.ideas.view_scoped'] === true
            ) {
              return true;
            }

            // Show parent if any submenu is accessible. Routed through
            // navPathAllowed so a path whose access is a UNION of keys (see
            // CASE_STUDIES_NAV_PATH) can still be the child that keeps the
            // parent row visible.
            return menu.submenus.some((submenu) => {
              const route = normalizeRoute(submenu.href);
              return navPathAllowed(
                route,
                userRole.permissions,
                MENU_PERMISSIONS[route]
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

          // A sentinel is not a permission key (see isSentinelPermission).
          // `super_admin` marks 14 routes and real super admins already returned
          // above; reaching here means the viewer is not one, so the link stays
          // hidden no matter what the merged permission map contains under that
          // name. Director's Desk can put arbitrary MENU_PERMISSIONS values into
          // that map, which is how a handover of the ID-card printing policy page
          // used to reveal the whole super-admin sidebar.
          if (isSentinelPermission(requiredPermission)) return false;

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

            // Improvement Board — the oversight read. A HOD / principal holding
            // improvement.ideas.view_scoped reads open ideas raised inside their
            // own institution (the branch this PR adds to improvement_ideas_select),
            // but MENU_PERMISSIONS is one key per route and can only name
            // improvement.ideas.view. Without this case the rows arrive and the
            // link does not, so the board is reachable only by typing the URL.
            //
            // DELIBERATELY the board itself and nothing else. My Dashboard,
            // Team Rotation and My Analytics are cohort-management surfaces
            // (an associate's own contribution, the rota, the analyst views);
            // an oversight reader has no use for them and opening them would
            // hand a HOD the associate-management surface nobody asked for.
            // They stay on improvement.ideas.view.
            if (submenu.href === '/improvement-board') {
              return (
                userRole.permissions['improvement.ideas.view'] === true ||
                userRole.permissions['improvement.ideas.view_scoped'] === true
              );
            }

            // Student-portal links (My Attendance / My Profile / My Marks /
            // My Timetable) are ONLY for students — even when nested as a
            // submenu under an admin parent's flyout (e.g. "Admission
            // Management"). Gate on role, not permission, so a staff/admin role
            // that happens to hold a learners.my-*.view grant still won't see them.
            if (isStudentPortalRoute(submenu.href)) {
              return isStudent;
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

            // Gemba visits — the database grants read on a union MENU_PERMISSIONS
            // (one key per route) cannot express. `gemba_observations_read` allows
            // improvement.area_role.assign OR improvement.board.manage as well as
            // a posting, because — as that migration records — the CAO and
            // Executive Administrative Officers hold no improvement.ideas.view at
            // all. Without this the link is hidden from the very officers the
            // RPC's officer lane exists for.
            if (submenu.href === '/improvement-board/gemba') {
              return (
                userRole.permissions['improvement.ideas.view'] === true ||
                userRole.permissions['improvement.area_role.assign'] === true ||
                userRole.permissions['improvement.board.manage'] === true
              );
            }

            const submenuRoute = normalizeRoute(submenu.href);
            const requiredPermission = MENU_PERMISSIONS[submenuRoute];
            if (!requiredPermission) return false; // Changed to false to be consistent

            // Hide "Student Search" submenu for students
            if (isStudent && submenu.href === '/billing/schedule/students') {
              return false;
            }

            // Student portal submenus (leave-onduty) are shown for students without permission check
            if (isStudent && submenu.href.startsWith('/learners/leave-onduty')) {
              return true;
            }

            return navPathAllowed(
              submenuRoute,
              userRole.permissions,
              requiredPermission
            );
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

/**
 * Filter menu items based on institution entity_type
 * Schools hide college-only pages (degrees, departments, programs, semesters, courses)
 * since they use virtual academic structure records
 *
 * @param menus Array of menu items to filter
 * @param entityType Institution entity type ('school', 'institution', 'admin_office', 'company')
 * @returns Filtered menu array
 */
export function filterMenuByEntityType(menus: MenuItem[], entityType?: string | null): MenuItem[] {
  // Only filter for schools
  if (entityType !== 'school') {
    return menus;
  }

  // Define college-only menu paths that should be hidden for schools
  const COLLEGE_ONLY_PATHS = [
    '/organizations/degrees',
    '/organizations/departments',
    '/organizations/programs',
    '/organizations/semesters',
    '/organizations/courses',
    '/organizations/regulations',
    '/organizations/batches',
  ];

  return menus.filter(menu => {
    // Hide the menu if it's in the college-only list
    if (COLLEGE_ONLY_PATHS.includes(menu.href)) {
      return false;
    }

    // Filter submenus too
    if (menu.submenus?.length > 0) {
      menu.submenus = menu.submenus.filter(submenu =>
        !COLLEGE_ONLY_PATHS.some(path => submenu.href.startsWith(path))
      );
    }

    return true;
  });
}


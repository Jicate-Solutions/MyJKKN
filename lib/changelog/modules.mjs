/**
 * Module dictionary for the What's New changelog.
 *
 * `perm` is a permission NAMESPACE (or list of them), not a single key. A module
 * is shown to you when you hold *any* live permission inside its namespace —
 * which is the honest test for "does this part of MyJKKN concern you". A single
 * key would have been wrong: Billing has ~20 sub-permissions and no `billing.view`,
 * so gating on one of them would hide Billing news from people who work in Billing.
 * Namespaces also pick up new sub-permissions automatically, so this cannot drift.
 *
 * `perm: null` means platform-wide — sign-in, navigation, mobile, performance.
 * Everyone signed in sees those. That is intended, not an oversight.
 *
 * `href` is only used for the "Open <module>" link on an entry.
 */

/** Scopes describing scaffolding, not a change any user would notice. */
export const INTERNAL_SCOPES = new Set([
  'ci', 'build', 'deps', 'tests', 'testing', 'test', 'scripts', 'gitignore',
  'next-config', 'vercel', 'deploy', 'sentry', 'terminology', 'claude-review',
  'guide-e2e', 'nav-reachability', 'shell', 'proof', 'doctrines', 'types',
  'schema', 'empirical-first', 'metadata', 'lint', 'tsconfig', 'eslint',
  'db', 'migrations', 'migration', 'supabase', 'cron', 'crons', 'webhook',
  'webhooks', 'queue', 'proxy', 'core', 'shared', 'utils',
]);

const M = (label, perm, href) => ({ label, perm, href });

const CAMPUS   = M('Campus Living',      'campus_living',   '/campus-living');
const BILLING  = M('Billing',            'billing',         '/billing');
const ADMISSION= M('Admission',          'admission',       '/admission');
const EVENTS   = M('Events',             'events',          '/events');
const HR       = M('HR',                 'hr',              '/hr');
const STAFF    = M('Staff',              'staff',           '/staff');
const ACAD     = M('Academic',           'academic',        '/academic');
const LEARNERS = M('Learners',           'learners',        '/learners');
const ACCRED   = M('Accreditation',      'accreditation',   '/accreditation');
const MEETINGS = M('Meetings',           'meetings',        '/meetings');
const COURSES  = M('Courses',            'courses',         '/courses');
const CDC      = M('Career Development', 'cdc',             '/cdc');
const USERS    = M('Users & Roles',      ['users','roles'], '/users');
const SOCIAL   = M('Social',             'social',          '/admin/social');
const ADMIN    = M('Administration',     'admin',           '/admin/ai-models');
const AIRUN    = M('AI Routines',        'admin',           '/admin/ai-routines');
const SOLUTION = M('Solutions Hub',      'solutions',       '/solutions');
const RESOURCE = M('Resources',          'resources',       '/resource-management');
const BUGS     = M('Bug Reports',        'learners.bug_reports', '/my-bug-reports');
const PROJECTS = M('Projects',           'projects',        '/projects');
const FEEDBACK = M('Feedback',           'feedback',        '/feedback');
const HEALTH   = M('Health',             ['health','sports'], '/health/dashboard');
const INTERN   = M('Internships',        'internship',      '/internships');
const IDCARD   = M('ID Cards',           'id_cards',        '/id-cards');
const IMPROVE  = M('Improvement Board',  'improvement',     '/improvement-board');
const SCHOOLS  = M('Schools Network',    'schools_network', '/admission/schools-network');
const FACULTY  = M('Faculty',            ['faculty','faculty_innovation'], '/staff');
// The shared cohort spine and the programmes built on it (School of Influence,
// the teaching-enterprise cohorts, the SF100 backfill). No sidebar route of its
// own — it is back-office plumbing for whoever runs a cohort — so href is null.
// `cohort.*` is a real permission namespace (cohort.view/create/edit/manage plus
// cohort.school_of_influence.*), so this scopes to people who work with cohorts
// instead of landing on every student's screen.
const COHORT   = M('Cohort Programmes',  'cohort',          null);

export const MODULES = {
  // Campus Living
  'campus-living': CAMPUS, hostel: CAMPUS, mess: CAMPUS, 'mess-menu': CAMPUS,
  'mess-loop': CAMPUS,

  // Billing & fees
  billing: BILLING, 'billing-reports': BILLING, 'billing-onboarding': BILLING,
  payments: BILLING, fees: BILLING, 'fees-structure': BILLING, 'my-bills': BILLING,
  'admission-fees': M('Admission Fees', 'admission_fees', '/admission'),
  'school-fees': M('School Fees', 'school_fees', '/billing'),

  // Admission (telephony is the admission call system — the git scopes
  // `admission/telephony` and `admission/calls` are the same code path)
  admission: ADMISSION, 'admission-leads': ADMISSION, 'admission-year': ADMISSION,
  'admission-seats': ADMISSION, enquiries: ADMISSION, 'learners-enquiry': ADMISSION,
  counselors: ADMISSION, 'counselor-routing': ADMISSION,
  'counselor-routing-config': ADMISSION, expos: ADMISSION, expo: ADMISSION,
  leads: ADMISSION, 'lead-ads': ADMISSION, 'enquiry-form': ADMISSION,
  'enquiry-submit': ADMISSION, 'student-form': ADMISSION, 'seat-config': ADMISSION,
  telephony: M('Telephony', 'admission', '/admission'), calls: M('Telephony', 'admission', '/admission'),
  'voice-memos': M('Telephony', 'admission', '/admission'),
  'voice-memo': M('Telephony', 'admission', '/admission'),
  referral: M('Referrals', ['referrals','admission'], '/admission'),
  'schools-network': SCHOOLS, 'schools-portal': SCHOOLS,

  // Events & induction
  events: EVENTS, tournament: EVENTS, marathon: EVENTS, 'marathon-ops': EVENTS,
  'marathon-api': EVENTS,
  induction: M('Induction', 'induction', '/induction'),

  // People
  hr: HR, 'hr-attendance': HR, 'hr-recruitment': HR, payroll: HR,
  staff: STAFF, 'staff-list': STAFF, 'staff-api': STAFF,
  'faculty-appraisal': FACULTY,
  // `faculty-innovation` has its own pages under /faculty/innovation and its own
  // permission namespace (14 keys). It was falling into Platform, so the two
  // "Week 1/Week 2 — Submit + Portfolio / Approval Queue" entries were shown to
  // every signed-in learner.
  'faculty-innovation': FACULTY,
  // Parent portal lives in its own route group, app/(parent-portal). Staff-side
  // control of it sits under `academic.parent_portal.*`. Before this, "global
  // unread COUNT on parent bell" read as platform-wide news to every student.
  parent: M('Parent Portal', 'academic.parent_portal', '/parent'),
  'parent-portal': M('Parent Portal', 'academic.parent_portal', '/parent'),

  // Academic
  academic: ACAD, attendance: ACAD, timetable: ACAD, timetables: ACAD,
  'internal-marks': ACAD, 'my-marks': ACAD, 'leave-onduty': ACAD, exam: ACAD,
  'exam-audit': ACAD,
  courses: COURSES, curriculum: COURSES, 'curriculum-poll': COURSES,
  'course-events': COURSES,
  // The CoE client wraps course-master CRUD; its one entry ("add put + delete
  // methods for course master CRUD") is a Courses change.
  'coe-client': COURSES,
  bos: M('Board of Studies', 'bos', '/bos'),
  learners: LEARNERS, 'learner-notes': LEARNERS, 'learner-intelligence': LEARNERS,
  'learners-council': M('Learners Council', 'learners_council', '/learners'),
  lc: M('Learners Council', 'learners_council', '/learners'),

  // Compliance & quality
  accreditation: ACCRED, iqac: ACCRED, naac: ACCRED, obe: ACCRED,
  compliance: ACCRED, 'compliance-unification': ACCRED,
  // /tracker is the compliance & tracking board (its migration is literally
  // 20260724090000_compliance_tracker.sql). Unlisted in the sidebar, but it is
  // compliance work, not a platform-wide change.
  tracker: ACCRED,
  audit: M('Audit Trail', 'audit', '/audit-trail'),
  'audit-coverage': M('Audit Trail', 'audit', '/audit-trail'),
  grievance: M('Grievance', 'grievance', '/service-requests'),

  // Collaboration
  meetings: MEETINGS, meet: MEETINGS, booking: MEETINGS, 'jicate-booking': MEETINGS,
  cal: MEETINGS, 'cal-client': MEETINGS, 'cal-com-api': MEETINGS,
  'cal-api-key-vault': MEETINGS,
  availability: MEETINGS, 'availability-spine': MEETINGS,
  // Business-card scanning: the pages are app/(routes)/meetings/contacts and the
  // tests live in __tests__/meetings/. Nothing to do with the platform shell.
  contacts: MEETINGS,
  calendar: M('Calendar', 'calendar', '/calendar'),
  notifications: M('Notifications', 'notifications', '/notifications/admin'),
  broadcast: M('Notifications', 'notifications', '/notifications/admin'),
  digest: M('Notifications', 'notifications', '/notifications/admin'),

  // Development programmes
  pde: M('PDE', 'pde', '/pde'), 'aicbl-pde': M('PDE', 'pde', '/pde'),
  scf: M('SCF', 'scf', '/scf'), 'scf-loop': M('SCF', 'scf', '/scf'),
  'scf-learner-notes': M('SCF', 'scf', '/scf'),
  rcltp: M('RCLTP', 'rcltp', '/rcltp'),
  foundation: M('Foundation', 'foundation', '/foundation'),
  // OneMark (the TN Class-12 one-mark MCQ product) ships inside Foundation:
  // every page is under app/(routes)/foundation/onemark/.
  onemark: M('Foundation', 'foundation', '/foundation'),
  // `learn` is a real sidebar route with its own `learn.view` permission. The
  // one commit here ("add hub page to stop /learn/pde 404'ing") is a PDE hub.
  learn: M('Learn', 'learn', '/learn'),
  // The cohort spine and the programmes on it.
  'cohort-core': COHORT, 'school-of-influence': COHORT,
  'teaching-enterprise': COHORT,
  vac: M('Value-Added Courses', 'vac', '/vac'),
  cdc: CDC, internships: INTERN, internship: INTERN, 'internship-module': INTERN,
  'internship-policy': INTERN,

  // Operations
  procurement: M('Procurement', 'procurement', '/procurement'),
  ims: M('Inventory', 'ims', '/ims'),
  'id-cards': IDCARD, 'card-scan': IDCARD,
  'service-requests': M('Service Requests', 'service_requests', '/service-requests'),
  'resource-management': RESOURCE, 'resource-mgmt': RESOURCE, resources: RESOURCE,
  reservations: RESOURCE,
  health: HEALTH, 'health-sports': HEALTH,

  // Improvement & strategy
  'improvement-board': IMPROVE, mba: IMPROVE, 'mba-analyst': IMPROVE,
  'mba-rotation': IMPROVE,
  'ceo-rounds': M('CEO Rounds', 'ceo_rounds', '/ceo-rounds'),
  okr: M('OKR', 'okr', '/okr'),
  solutions: SOLUTION, 'solutions-hub': SOLUTION, sf100: SOLUTION,
  'solve-for-100': SOLUTION,
  'startup-studio': M('Startup Studio', 'startup_studio', '/startup-studio'),
  projects: PROJECTS, 'campus-walk': M('Campus Walk', 'projects', '/campus-walk'),
  tms: M('TMS', 'tms', '/tms'),

  // Admin & platform surfaces
  admin: ADMIN, loops: AIRUN, orchestration: AIRUN, routines: AIRUN,
  // "batch routines run Max-only — drop the API fallback" is an AI Routines
  // change, not a platform one.
  'max-lane': AIRUN,
  // The drilldown key catalog behind /admin/dashboard-drilldowns.
  'dashboard-drilldown': M('Administration', 'admin', '/admin/dashboard-drilldowns'),
  // b2a = the external API door for trusted first-party apps. It is administered
  // from /system/api-management and gated by the `system.api.*` keys.
  b2a: M('External API', 'system.api', '/system/api-management'),
  'ai-routines': AIRUN, 'ai-lane': AIRUN, 'ai-lanes': AIRUN, 'ai-tasks': AIRUN,
  'ai-jobs': AIRUN, 'ai-models': ADMIN, 'ai-config': ADMIN, 'ai-registry': ADMIN,
  'ai-model-config': ADMIN, 'ai-console': ADMIN, 'ai-studio': ADMIN,
  'ai-clients': ADMIN,
  users: USERS, roles: USERS, 'role-management': USERS, permissions: USERS,
  'permissions-audit': USERS, privileges: USERS, perms: USERS, rbac: USERS,
  rls: USERS,
  organizations: M('Organisation', 'organizations', '/organizations/dashboard'),
  organization: M('Organisation', 'organizations', '/organizations/dashboard'),
  institutions: M('Organisation', 'organizations', '/organizations/dashboard'),
  social: SOCIAL, instagram: SOCIAL, ig: SOCIAL, meta: SOCIAL, facebook: SOCIAL,
  messenger: SOCIAL, linkedin: SOCIAL, whatsapp: SOCIAL,
  'whatsapp-campaign': SOCIAL, 'whatsapp-broadcast': SOCIAL,
  'director-desk': M("Director's Desk", 'director', '/director-desk'),
  documents: M('Documents', 'documents', '/documents'),
  applications: M('Applications', 'applications', '/applications'),
  'application-hub': M('Application Hub', 'application_hub', '/application-hub'),
  reference: M('Reference Data', 'reference', '/reference'),
  'work-pulse': M('Work Pulse', 'work_pulse', '/work-pulse'),
  'work-signals': M('Work Pulse', 'work_pulse', '/work-pulse'),
  'ai-pulse': M('AI Pulse', 'ai_pulse', '/ai-pulse'),
  'ai-query': M('AI Query', 'ai_query', '/ai-query'),
  bugs: BUGS, 'bug-reports': BUGS, 'bug-reporter': BUGS, 'bug-cluster': BUGS,
  'bug-reverify': BUGS,
  feedback: FEEDBACK, 'session-feedback': FEEDBACK, 'class-feedback': FEEDBACK,
  moments: M('Moments', 'moments', '/moments'),

  // Deliberately universal — everyone signed in has these.
  guide: M('Guide', null, '/guide'),
  'whats-new': M("What's New", null, '/whats-new'),
  'my-desk': M('My Desk', null, '/my-desk'),
};

/**
 * Scope families that number their own waves, so the exact scope string is
 * open-ended and cannot be enumerated. Matched only after an exact MODULES
 * lookup fails, in listed order.
 *
 * `byow` is "bring your own WhatsApp" — the per-department WhatsApp connector.
 * It shipped as byow-s1, byow-s3, byow-s3-p2-t14, byow-s3-p2-t16 …, and all 16
 * of those entries were sitting in Platform, i.e. on every learner's screen,
 * saying things like "register hourly synthetic-audit cron schedule".
 */
const SCOPE_PREFIXES = [['byow', SOCIAL]];

/** Cross-cutting changes: sign-in, navigation, mobile, speed. Everyone sees these. */
export const PLATFORM = M('Platform', null, null);

/** Canonical slug for a module, derived from its label so aliases collapse
 *  ("hostel", "mess" and "campus-living" are all one module to a reader). */
export function slugify(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Exact match, then a numbered-wave prefix. Null when neither knows the scope. */
export function lookupModule(scope) {
  if (!scope) return null;
  if (MODULES[scope]) return MODULES[scope];
  for (const [prefix, mod] of SCOPE_PREFIXES) {
    if (scope === prefix || scope.startsWith(`${prefix}-`)) return mod;
  }
  return null;
}

/** scope (a git commit scope) -> { key, label, perm, href } */
export function moduleFor(scope) {
  const m = lookupModule(scope) || PLATFORM;
  return { key: slugify(m.label), label: m.label, perm: m.perm, href: m.href };
}

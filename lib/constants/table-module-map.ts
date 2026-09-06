/**
 * Maps Supabase table names to application module names.
 *
 * Uses convention-based prefix matching with explicit overrides
 * for tables that don't follow a standard prefix convention.
 */

/** Explicit table-to-module overrides for tables without a standard prefix. */
export const TABLE_OVERRIDES: Record<string, string> = {
  profiles: 'Users',
  custom_roles: 'Users',
  user_roles: 'Users',
  user_institution_access: 'Users',
  user_activity_logs: 'Users',
  push_subscriptions: 'Users',
  institutions: 'Organization',
  departments: 'Organization',
  programs: 'Organization',
  degrees: 'Organization',
  semesters: 'Organization',
  sections: 'Organization',
  courses: 'Organization',
  course_mappings: 'Organization',
  academic_years: 'Organization',
  regulations: 'Organization',
  batches: 'Organization',
  periods: 'Academic',
  timetables: 'Academic',
  student_attendance: 'Academic',
  daily_attendance: 'Academic',
  class_incharges: 'Academic',
  api_keys: 'System',
  institution_program_approvals: 'Staff',
  // Instagram monitoring audit log — doesn't follow the ig_ prefix because
  // it sits alongside future social_<platform>_logs siblings.
  social_instagram_logs: 'Instagram',
  // Meta surface modules (catalog consolidation 2026-05-30, κ): tables that
  // don't fit the per-module prefix below.
  social_facebook_logs: 'Social Facebook', // sibling to social_instagram_logs
  meta_campaigns: 'Social Ads', // ζ — sits alongside meta_ad_accounts/insights
  // Foundation & Competitive-Exam Programme (2026-07-06): fp_* substrate plus
  // the two exam_* catalog tables. Mapped explicitly (rather than via an
  // `exam_` prefix) so the shared exam_* namespace can't swallow unrelated
  // COE/exam tables. Module name matches the 'Foundation Programme' label in
  // lib/permissions-audit/module-mappings.ts (foundation.* perms).
  fp_students: 'Foundation Programme',
  fp_cohorts: 'Foundation Programme',
  fp_enrollments: 'Foundation Programme',
  fp_items: 'Foundation Programme',
  fp_assessments: 'Foundation Programme',
  fp_assessment_items: 'Foundation Programme',
  fp_attempts: 'Foundation Programme',
  fp_responses: 'Foundation Programme',
  fp_student_weakness: 'Foundation Programme',
  fp_baselines: 'Foundation Programme',
  fp_revision_plans: 'Foundation Programme',
  exam_definitions: 'Foundation Programme',
  exam_topic_map: 'Foundation Programme',
  // Teaching-enterprise participant layer (2026-07-27): the cohort config table
  // that replaced the hardcoded MBA enrolment predicate. Mapped explicitly
  // rather than via a `teaching_` prefix so the generic word can't swallow
  // unrelated future tables. Same module as improvement_* (improvement.* perms).
  teaching_enterprise_cohorts: 'Improvement Board',
};

/** Prefix-to-module mapping checked in order; first match wins. */
export const MODULE_PREFIXES: [string, string][] = [
  ['reference_catalog', 'Reference'],
  // Projects module tables (project_statuses, project_labels, …) — module
  // registered 2026-07-12 with its first permission key (projects.view)
  ['project_', 'Projects'],
  ['billing_', 'Billing'],
  ['learners_', 'Learners'],
  ['staff_plan', 'Academic'],
  ['staff_', 'Staff'],
  ['resource_', 'Resources'],
  ['service_request', 'Service Requests'],
  ['service_type', 'Service Requests'],
  ['bug_report', 'Bug Reports'],
  ['admission_', 'Admission'],
  ['notification', 'Notifications'],
  ['usage_', 'Lifecycle Analytics'],
  ['module_usage_', 'Lifecycle Analytics'],
  ['institution_health_', 'Lifecycle Analytics'],
  ['feature_usage_', 'Lifecycle Analytics'],
  ['events_', 'Events'],
  ['vac_', 'VAC'],
  ['privilege_', 'Privileges'],
  // Added 2026-04-14: modules that were previously bucketed into "Other"
  ['ss_', 'Startup Studio'],
  ['work_', 'Work Pulse'],
  ['okr_', 'Work Pulse'],
  ['pulse_', 'Work Pulse'],
  ['health_', 'Health'],
  ['ims_', 'IMS'],
  ['marathon_', 'Marathon'],
  ['hr_', 'Staff'],
  ['hostel_', 'Campus Living'],
  ['mess_', 'Campus Living'],
  ['pde_', 'PDE Learning'],
  ['improvement_', 'Improvement Board'], // MBA teaching-enterprise: improvement_ideas/areas/idea_activity
  ['cdc_', 'CDC'],
  // Internship Module — operational substrate for cycles, sites, preceptors,
  // vehicles, assignments, logbook, evaluations, attendance, incidents,
  // certificates. Distinct from CDC's `cdc_internship_*` substrate (which
  // models placement-style internship records inside Career Development
  // Centre). Catalog ships alongside PR #1209 sidebar wiring.
  ['internship_', 'Internship'],
  ['chatbot_', 'Chatbot'],
  ['chat_', 'Chatbot'],
  // Course Events (2026-08-13): course_events, course_packages,
  // course_sessions, course_installments, etc. `course_mappings` (Organization
  // curriculum catalog) keeps its exact TABLE_OVERRIDES entry above, which is
  // checked before this prefix scan, so it is unaffected.
  ['course_', 'Courses'],
  ['expo_', 'Expo'],
  // Instagram monitoring substrate (Phase 1B, 2026-05-30):
  // ig_accounts / ig_account_metrics / ig_posts / ig_post_metrics →
  // Instagram. Companion social_instagram_logs goes through TABLE_OVERRIDES.
  // Phase 2 (ι, 2026-05-30): ig_stories / ig_story_insights /
  // ig_dm_conversations / ig_dm_messages also bucket here via the same prefix.
  ['ig_', 'Instagram'],
  // Meta surface modules (catalog consolidation 2026-05-30, κ).
  // Order: longer/more-specific meta_* prefixes BEFORE shorter ones.
  ['meta_lead_', 'Social Lead Ads'], // meta_lead_forms, meta_lead_field_mappings (γ)
  ['meta_leadgen_', 'Social Lead Ads'], // meta_leadgen_events (γ)
  ['meta_capi_', 'Integrations Meta Pixel'], // meta_capi_events (ε)
  ['meta_audience_', 'Integrations Meta Audiences'], // meta_audience_rules, meta_audience_sync_history (η)
  ['meta_ad_', 'Social Ads'], // meta_ad_accounts, meta_ad_insights (ζ); meta_campaigns goes through TABLE_OVERRIDES
  ['fb_', 'Social Facebook'], // fb_pages, fb_posts, fb_post_metrics, fb_page_metrics (β)
  ['messenger_', 'Social Messenger'], // messenger_conversations, messenger_messages (δ)
  ['scholarship', 'Billing'],
  ['counselor_', 'Admission'],
  ['consultant_', 'Admission'],
  ['lead_', 'Admission'],
  ['application_', 'Applications'],
  ['workflow_', 'System'],
  ['audit_', 'System'],
  ['integration_', 'System'],
  ['template_', 'System'],
];

/**
 * Sub-module overrides — when a table name doesn't follow the
 * standard `module_submodule_*` pattern, map it explicitly.
 */
const SUBMODULE_OVERRIDES: Record<string, string> = {
  // Users sub-modules
  profiles: 'Profiles',
  custom_roles: 'Roles',
  user_roles: 'Roles',
  user_institution_access: 'Access Control',
  user_activity_logs: 'Activity Logs',
  push_subscriptions: 'Notifications',
  // Organization sub-modules
  institutions: 'Institutions',
  departments: 'Departments',
  programs: 'Programs',
  degrees: 'Degrees',
  semesters: 'Semesters',
  sections: 'Sections',
  courses: 'Courses',
  course_mappings: 'Courses',
  academic_years: 'Academic Years',
  regulations: 'Regulations',
  batches: 'Batches',
  // Academic sub-modules
  periods: 'Periods',
  timetables: 'Timetables',
  student_attendance: 'Attendance',
  daily_attendance: 'Attendance',
  class_incharges: 'Class Incharges',
  api_keys: 'API Keys',
};

/**
 * Returns the application module name for a given Supabase table name.
 *
 * Checks explicit overrides first, then prefix matches (first match wins).
 * Returns `'Other'` if no match is found.
 */
export function getModuleForTable(tableName: string): string {
  if (TABLE_OVERRIDES[tableName]) {
    return TABLE_OVERRIDES[tableName];
  }

  for (const [prefix, moduleName] of MODULE_PREFIXES) {
    if (tableName.startsWith(prefix)) {
      return moduleName;
    }
  }

  return 'Other';
}

/**
 * Returns the sub-module name for a given table, derived from its structure.
 *
 * Logic:
 *   1. If the table is in SUBMODULE_OVERRIDES, use that.
 *   2. Otherwise extract the segment after the module prefix. For example:
 *      - `billing_invoices` → "Invoices"
 *      - `admission_lead_activities` → "Lead Activities"
 *      - `ss_kpi_definitions` → "Kpi Definitions"
 *   3. If no prefix matches, returns "General".
 *
 * Sub-module names are Title Case with underscores replaced by spaces.
 */
export function getSubModuleForTable(tableName: string): string {
  if (SUBMODULE_OVERRIDES[tableName]) {
    return SUBMODULE_OVERRIDES[tableName];
  }

  // Find which prefix matched
  for (const [prefix] of MODULE_PREFIXES) {
    if (tableName.startsWith(prefix)) {
      const remainder = tableName.slice(prefix.length);
      if (!remainder) return 'General';
      // Take first 2 words of remainder as sub-module name (handles things
      // like "lead_activities" → "Lead Activities")
      const words = remainder.split('_').filter(Boolean);
      const subModuleWords = words.slice(0, 2);
      return subModuleWords
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
  }

  return 'General';
}

/**
 * Returns a sorted array of all unique module names from both the
 * override map and the prefix map.
 */
export function getAllModuleNames(): string[] {
  const modules = new Set<string>();

  for (const mod of Object.values(TABLE_OVERRIDES)) {
    modules.add(mod);
  }

  for (const [, mod] of MODULE_PREFIXES) {
    modules.add(mod);
  }

  return Array.from(modules).sort();
}

/**
 * Groups an array of table names by their resolved module name.
 *
 * Each key in the returned record is a module name, and its value is the
 * list of table names that belong to that module.
 */
export function groupTablesByModule(
  tableNames: string[]
): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};

  for (const table of tableNames) {
    const mod = getModuleForTable(table);
    if (!grouped[mod]) {
      grouped[mod] = [];
    }
    grouped[mod].push(table);
  }

  return grouped;
}

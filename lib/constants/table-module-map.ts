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
  class_incharges: 'Academic',
  api_keys: 'System',
};

/** Prefix-to-module mapping checked in order; first match wins. */
export const MODULE_PREFIXES: [string, string][] = [
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
];

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

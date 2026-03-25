/**
 * Cache Tag Registry for MyJKKN Application
 *
 * Centralized cache tag management for invalidation and dependency tracking.
 *
 * @see https://nextjs.org/docs/app/api-reference/functions/revalidateTag
 */

/**
 * Cache Tag Prefixes
 *
 * Organized by module for easy identification and invalidation
 */
export const CACHE_TAG_PREFIXES = {
  // Academic Module
  ACADEMIC_YEARS: 'academic-years',
  PERIODS: 'periods',
  TIMETABLES: 'timetables',
  ATTENDANCE: 'attendance',
  LEAVES: 'leaves',
  REGULATIONS: 'regulations',
  BATCHES: 'batches',
  STAFF_PLANNING: 'staff-planning',

  // Billing Module
  INVOICES: 'invoices',
  RECEIPTS: 'receipts',
  REFUNDS: 'refunds',
  BILLS: 'bills',
  DISCOUNTS: 'discounts',
  BILLING_CATEGORIES: 'billing-categories',
  BILLING_SCHEDULE: 'billing-schedule',

  // Learners Module
  LEARNERS: 'learners',
  LEARNER_PROFILES: 'learner-profiles',
  ENQUIRIES: 'enquiries',
  ALUMNI: 'alumni',

  // Organizations Module
  INSTITUTIONS: 'institutions',
  DEPARTMENTS: 'departments',
  PROGRAMS: 'programs',
  DEGREES: 'degrees',
  SEMESTERS: 'semesters',
  SECTIONS: 'sections',
  COURSES: 'courses',
  COURSE_MAPPINGS: 'course-mappings',

  // Resource Management Module
  RESOURCES: 'resources',
  RESOURCE_CATEGORIES: 'resource-categories',
  RESERVATIONS: 'reservations',
  MAINTENANCE: 'maintenance',

  // Staff Module
  STAFF: 'staff',
  STAFF_CATEGORIES: 'staff-categories',

  // Users & Admin Module
  USERS: 'users',
  ROLES: 'roles',
  BUG_REPORTS: 'bug-reports',
  NOTIFICATIONS: 'notifications',

  // Dashboard Module
  DASHBOARD: 'dashboard',
  WIDGETS: 'widgets',

  // System
  AUDIT_LOGS: 'audit-logs'
} as const;

/**
 * Cache Tag Builders
 *
 * Helper functions to generate standardized cache tags
 */
export const cacheTags = {
  /**
   * Academic Tags
   */
  academic: {
    years: {
      list: () => CACHE_TAG_PREFIXES.ACADEMIC_YEARS,
      byId: (id: string) => `${CACHE_TAG_PREFIXES.ACADEMIC_YEARS}-${id}`,
      byInstitution: (institutionId: string) =>
        `${CACHE_TAG_PREFIXES.ACADEMIC_YEARS}-institution-${institutionId}`
    },
    periods: {
      list: () => CACHE_TAG_PREFIXES.PERIODS,
      byId: (id: string) => `${CACHE_TAG_PREFIXES.PERIODS}-${id}`,
      byInstitution: (institutionId: string) =>
        `${CACHE_TAG_PREFIXES.PERIODS}-institution-${institutionId}`
    },
    regulations: {
      list: () => CACHE_TAG_PREFIXES.REGULATIONS,
      byId: (id: string) => `${CACHE_TAG_PREFIXES.REGULATIONS}-${id}`,
      byInstitution: (institutionId: string) =>
        `${CACHE_TAG_PREFIXES.REGULATIONS}-institution-${institutionId}`
    },
    batches: {
      list: () => CACHE_TAG_PREFIXES.BATCHES,
      byId: (id: string) => `${CACHE_TAG_PREFIXES.BATCHES}-${id}`,
      byInstitution: (institutionId: string) =>
        `${CACHE_TAG_PREFIXES.BATCHES}-institution-${institutionId}`
    },
    timetables: {
      list: () => CACHE_TAG_PREFIXES.TIMETABLES,
      byId: (id: string) => `${CACHE_TAG_PREFIXES.TIMETABLES}-${id}`,
      bySection: (sectionId: string) =>
        `${CACHE_TAG_PREFIXES.TIMETABLES}-section-${sectionId}`,
      byFaculty: (staffId: string) =>
        `${CACHE_TAG_PREFIXES.TIMETABLES}-faculty-${staffId}`,
      conflicts: () => `${CACHE_TAG_PREFIXES.TIMETABLES}-conflicts`
    },
    attendance: {
      list: () => CACHE_TAG_PREFIXES.ATTENDANCE,
      bySection: (sectionId: string) =>
        `${CACHE_TAG_PREFIXES.ATTENDANCE}-section-${sectionId}`,
      byDate: (date: string) =>
        `${CACHE_TAG_PREFIXES.ATTENDANCE}-date-${date}`,
      dashboard: () => `${CACHE_TAG_PREFIXES.ATTENDANCE}-dashboard`
    },
    leaves: {
      list: () => CACHE_TAG_PREFIXES.LEAVES,
      byId: (id: string) => `${CACHE_TAG_PREFIXES.LEAVES}-${id}`,
      byStaff: (staffId: string) =>
        `${CACHE_TAG_PREFIXES.LEAVES}-staff-${staffId}`,
      pending: () => `${CACHE_TAG_PREFIXES.LEAVES}-pending`
    },
    staffPlanning: {
      list: () => CACHE_TAG_PREFIXES.STAFF_PLANNING,
      byId: (id: string) => `${CACHE_TAG_PREFIXES.STAFF_PLANNING}-${id}`,
      byDepartment: (departmentId: string) =>
        `${CACHE_TAG_PREFIXES.STAFF_PLANNING}-department-${departmentId}`,
      bySemester: (semesterId: string) =>
        `${CACHE_TAG_PREFIXES.STAFF_PLANNING}-semester-${semesterId}`
    },
    leaveCalendar: {
      view: () => `${CACHE_TAG_PREFIXES.LEAVES}-calendar`,
      byMonth: (year: number, month: number) =>
        `${CACHE_TAG_PREFIXES.LEAVES}-calendar-${year}-${month}`,
      byInstitution: (institutionId: string) =>
        `${CACHE_TAG_PREFIXES.LEAVES}-calendar-institution-${institutionId}`
    }
  },

  /**
   * Billing Tags
   */
  billing: {
    invoices: {
      list: () => CACHE_TAG_PREFIXES.INVOICES,
      byId: (id: string) => `${CACHE_TAG_PREFIXES.INVOICES}-${id}`,
      byStudent: (studentId: string) =>
        `${CACHE_TAG_PREFIXES.INVOICES}-student-${studentId}`,
      byInstitution: (institutionId: string) =>
        `${CACHE_TAG_PREFIXES.INVOICES}-institution-${institutionId}`
    },
    bills: {
      list: () => CACHE_TAG_PREFIXES.BILLS,
      byStudent: (studentId: string) =>
        `${CACHE_TAG_PREFIXES.BILLS}-student-${studentId}`,
      byStatus: (status: string) =>
        `${CACHE_TAG_PREFIXES.BILLS}-status-${status}`
    },
    receipts: {
      list: () => CACHE_TAG_PREFIXES.RECEIPTS,
      byId: (id: string) => `${CACHE_TAG_PREFIXES.RECEIPTS}-${id}`,
      byStudent: (studentId: string) =>
        `${CACHE_TAG_PREFIXES.RECEIPTS}-student-${studentId}`
    }
  },

  /**
   * Learners Tags
   */
  learners: {
    profiles: {
      list: () => CACHE_TAG_PREFIXES.LEARNER_PROFILES,
      byId: (id: string) => `${CACHE_TAG_PREFIXES.LEARNER_PROFILES}-${id}`,
      bySection: (sectionId: string) =>
        `${CACHE_TAG_PREFIXES.LEARNER_PROFILES}-section-${sectionId}`,
      byInstitution: (institutionId: string) =>
        `${CACHE_TAG_PREFIXES.LEARNER_PROFILES}-institution-${institutionId}`,
      byStatus: (status: string) =>
        `${CACHE_TAG_PREFIXES.LEARNER_PROFILES}-status-${status}`
    }
  },

  /**
   * Organizations Tags
   */
  organizations: {
    institutions: {
      list: () => CACHE_TAG_PREFIXES.INSTITUTIONS,
      byId: (id: string) => `${CACHE_TAG_PREFIXES.INSTITUTIONS}-${id}`,
      hierarchy: () => `${CACHE_TAG_PREFIXES.INSTITUTIONS}-hierarchy`
    },
    departments: {
      list: () => CACHE_TAG_PREFIXES.DEPARTMENTS,
      byId: (id: string) => `${CACHE_TAG_PREFIXES.DEPARTMENTS}-${id}`,
      byInstitution: (institutionId: string) =>
        `${CACHE_TAG_PREFIXES.DEPARTMENTS}-institution-${institutionId}`
    },
    degrees: {
      list: () => CACHE_TAG_PREFIXES.DEGREES,
      byId: (id: string) => `${CACHE_TAG_PREFIXES.DEGREES}-${id}`,
      byInstitution: (institutionId: string) =>
        `${CACHE_TAG_PREFIXES.DEGREES}-institution-${institutionId}`,
      byType: (degreeType: string) =>
        `${CACHE_TAG_PREFIXES.DEGREES}-type-${degreeType}`
    },
    programs: {
      list: () => CACHE_TAG_PREFIXES.PROGRAMS,
      byId: (id: string) => `${CACHE_TAG_PREFIXES.PROGRAMS}-${id}`,
      byInstitution: (institutionId: string) =>
        `${CACHE_TAG_PREFIXES.PROGRAMS}-institution-${institutionId}`,
      byDepartment: (departmentId: string) =>
        `${CACHE_TAG_PREFIXES.PROGRAMS}-department-${departmentId}`
    },
    semesters: {
      list: () => CACHE_TAG_PREFIXES.SEMESTERS,
      byId: (id: string) => `${CACHE_TAG_PREFIXES.SEMESTERS}-${id}`,
      byProgram: (programId: string) =>
        `${CACHE_TAG_PREFIXES.SEMESTERS}-program-${programId}`
    },
    sections: {
      list: () => CACHE_TAG_PREFIXES.SECTIONS,
      byId: (id: string) => `${CACHE_TAG_PREFIXES.SECTIONS}-${id}`,
      byProgram: (programId: string) =>
        `${CACHE_TAG_PREFIXES.SECTIONS}-program-${programId}`,
      students: (sectionId: string) =>
        `${CACHE_TAG_PREFIXES.SECTIONS}-${sectionId}-students`
    },
    courses: {
      list: () => CACHE_TAG_PREFIXES.COURSES,
      byId: (id: string) => `${CACHE_TAG_PREFIXES.COURSES}-${id}`,
      mappings: () => CACHE_TAG_PREFIXES.COURSE_MAPPINGS,
      mappingBySection: (sectionId: string) =>
        `${CACHE_TAG_PREFIXES.COURSE_MAPPINGS}-section-${sectionId}`
    }
  },

  /**
   * Resource Management Tags
   */
  resources: {
    list: () => CACHE_TAG_PREFIXES.RESOURCES,
    byId: (id: string) => `${CACHE_TAG_PREFIXES.RESOURCES}-${id}`,
    byCategory: (categoryId: string) =>
      `${CACHE_TAG_PREFIXES.RESOURCES}-category-${categoryId}`,
    reservations: {
      list: () => CACHE_TAG_PREFIXES.RESERVATIONS,
      byResource: (resourceId: string) =>
        `${CACHE_TAG_PREFIXES.RESERVATIONS}-resource-${resourceId}`,
      byUser: (userId: string) =>
        `${CACHE_TAG_PREFIXES.RESERVATIONS}-user-${userId}`,
      pending: () => `${CACHE_TAG_PREFIXES.RESERVATIONS}-pending`
    }
  },

  /**
   * Staff Tags
   */
  staff: {
    list: () => CACHE_TAG_PREFIXES.STAFF,
    byId: (id: string) => `${CACHE_TAG_PREFIXES.STAFF}-${id}`,
    byInstitution: (institutionId: string) =>
      `${CACHE_TAG_PREFIXES.STAFF}-institution-${institutionId}`,
    byCategory: (categoryId: string) =>
      `${CACHE_TAG_PREFIXES.STAFF}-category-${categoryId}`,
    categories: {
      list: () => CACHE_TAG_PREFIXES.STAFF_CATEGORIES,
      byId: (id: string) => `${CACHE_TAG_PREFIXES.STAFF_CATEGORIES}-${id}`
    }
  },

  /**
   * Users Tags
   */
  users: {
    list: () => CACHE_TAG_PREFIXES.USERS,
    byId: (id: string) => `${CACHE_TAG_PREFIXES.USERS}-${id}`,
    roles: () => CACHE_TAG_PREFIXES.ROLES,
    roleById: (roleId: string) => `${CACHE_TAG_PREFIXES.ROLES}-${roleId}`
  },

  /**
   * Dashboard Tags
   */
  dashboard: {
    widgets: () => CACHE_TAG_PREFIXES.WIDGETS,
    configurations: () => `${CACHE_TAG_PREFIXES.DASHBOARD}-configurations`,
    userConfig: (userId: string) =>
      `${CACHE_TAG_PREFIXES.DASHBOARD}-user-${userId}`
  }
};

/**
 * Cache Invalidation Helpers
 *
 * Common patterns for invalidating related caches
 */
export const cacheInvalidation = {
  /**
   * Invalidate all caches related to a student
   */
  student: (studentId: string) => [
    cacheTags.learners.profiles.byId(studentId),
    cacheTags.billing.invoices.byStudent(studentId),
    cacheTags.billing.bills.byStudent(studentId),
    cacheTags.billing.receipts.byStudent(studentId)
  ],

  /**
   * Invalidate all caches related to a section
   */
  section: (sectionId: string) => [
    cacheTags.organizations.sections.byId(sectionId),
    cacheTags.organizations.sections.students(sectionId),
    cacheTags.learners.profiles.bySection(sectionId),
    cacheTags.academic.timetables.bySection(sectionId),
    cacheTags.academic.attendance.bySection(sectionId),
    cacheTags.organizations.courses.mappingBySection(sectionId)
  ],

  /**
   * Invalidate all caches related to an institution
   */
  institution: (institutionId: string) => [
    cacheTags.organizations.institutions.byId(institutionId),
    cacheTags.organizations.departments.byInstitution(institutionId),
    cacheTags.learners.profiles.byInstitution(institutionId),
    cacheTags.staff.byInstitution(institutionId),
    cacheTags.billing.invoices.byInstitution(institutionId),
    cacheTags.academic.years.byInstitution(institutionId)
  ],

  /**
   * Invalidate all caches related to a timetable
   */
  timetable: (timetableId: string, sectionId: string, facultyIds: string[]) => [
    cacheTags.academic.timetables.byId(timetableId),
    cacheTags.academic.timetables.bySection(sectionId),
    ...facultyIds.map((id) => cacheTags.academic.timetables.byFaculty(id)),
    cacheTags.academic.timetables.conflicts(),
    cacheTags.academic.attendance.bySection(sectionId)
  ]
};

/**
 * Type exports for TypeScript
 */
export type CacheTagPrefix = typeof CACHE_TAG_PREFIXES[keyof typeof CACHE_TAG_PREFIXES];

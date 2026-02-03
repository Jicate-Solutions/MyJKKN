/**
 * Query Key Factory Pattern
 * Purpose: Centralize and standardize query key management for React Query
 * Created: 2025-12-10
 *
 * Benefits:
 * - Consistent cache key structure across the app
 * - Easy cache invalidation by prefix
 * - Type-safe query keys
 * - Avoid typos and key collisions
 *
 * Usage:
 * import { queryKeys } from '@/lib/query-keys';
 *
 * // In hooks:
 * useQuery({
 *   queryKey: queryKeys.students.list({ institutionId: '123' }),
 *   queryFn: () => fetchStudents({ institutionId: '123' })
 * });
 *
 * // For invalidation:
 * queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
 */

// ============================================
// Organization Module Keys
// ============================================
export const organizationKeys = {
  all: ['organization'] as const,

  // Institutions
  institutions: {
    all: ['organization', 'institutions'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...organizationKeys.institutions.all, 'list', filters] as const,
    detail: (id: string) =>
      [...organizationKeys.institutions.all, 'detail', id] as const
  },

  // Degrees
  degrees: {
    all: ['organization', 'degrees'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...organizationKeys.degrees.all, 'list', filters] as const,
    detail: (id: string) =>
      [...organizationKeys.degrees.all, 'detail', id] as const
  },

  // Departments
  departments: {
    all: ['organization', 'departments'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...organizationKeys.departments.all, 'list', filters] as const,
    detail: (id: string) =>
      [...organizationKeys.departments.all, 'detail', id] as const
  },

  // Programs
  programs: {
    all: ['organization', 'programs'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...organizationKeys.programs.all, 'list', filters] as const,
    detail: (id: string) =>
      [...organizationKeys.programs.all, 'detail', id] as const
  },

  // Semesters
  semesters: {
    all: ['organization', 'semesters'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...organizationKeys.semesters.all, 'list', filters] as const,
    detail: (id: string) =>
      [...organizationKeys.semesters.all, 'detail', id] as const
  },

  // Sections
  sections: {
    all: ['organization', 'sections'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...organizationKeys.sections.all, 'list', filters] as const,
    detail: (id: string) =>
      [...organizationKeys.sections.all, 'detail', id] as const
  },

  // Courses
  courses: {
    all: ['organization', 'courses'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...organizationKeys.courses.all, 'list', filters] as const,
    detail: (id: string) =>
      [...organizationKeys.courses.all, 'detail', id] as const,
    mappings: (filters?: Record<string, unknown>) =>
      [...organizationKeys.courses.all, 'mappings', filters] as const
  }
};

// ============================================
// Students Module Keys
// ============================================
export const studentKeys = {
  all: ['students'] as const,
  list: (filters?: Record<string, unknown>) =>
    [...studentKeys.all, 'list', filters] as const,
  detail: (id: string) => [...studentKeys.all, 'detail', id] as const,
  search: (query: string, filters?: Record<string, unknown>) =>
    [...studentKeys.all, 'search', query, filters] as const,
  billing: (studentId: string) =>
    [...studentKeys.all, 'billing', studentId] as const,
  billingSummary: (studentId: string) =>
    [...studentKeys.all, 'billing-summary', studentId] as const
};

// ============================================
// Staff Module Keys
// ============================================
export const staffKeys = {
  all: ['staff'] as const,
  list: (filters?: Record<string, unknown>) =>
    [...staffKeys.all, 'list', filters] as const,
  detail: (id: string) => [...staffKeys.all, 'detail', id] as const,
  search: (query: string, filters?: Record<string, unknown>) =>
    [...staffKeys.all, 'search', query, filters] as const,
  plans: (filters?: Record<string, unknown>) =>
    [...staffKeys.all, 'plans', filters] as const
};

// ============================================
// Billing Module Keys
// ============================================
export const billingKeys = {
  all: ['billing'] as const,

  // Invoices
  invoices: {
    all: ['billing', 'invoices'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...billingKeys.invoices.all, 'list', filters] as const,
    detail: (id: string) =>
      [...billingKeys.invoices.all, 'detail', id] as const,
    byStudent: (studentId: string) =>
      [...billingKeys.invoices.all, 'student', studentId] as const
  },

  // Receipts
  receipts: {
    all: ['billing', 'receipts'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...billingKeys.receipts.all, 'list', filters] as const,
    detail: (id: string) =>
      [...billingKeys.receipts.all, 'detail', id] as const,
    byStudent: (studentId: string) =>
      [...billingKeys.receipts.all, 'student', studentId] as const
  },

  // Bills
  bills: {
    all: ['billing', 'bills'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...billingKeys.bills.all, 'list', filters] as const,
    detail: (id: string) => [...billingKeys.bills.all, 'detail', id] as const,
    byStudent: (studentId: string) =>
      [...billingKeys.bills.all, 'student', studentId] as const
  },

  // Discounts
  discounts: {
    all: ['billing', 'discounts'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...billingKeys.discounts.all, 'list', filters] as const,
    detail: (id: string) =>
      [...billingKeys.discounts.all, 'detail', id] as const
  },

  // Refunds
  refunds: {
    all: ['billing', 'refunds'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...billingKeys.refunds.all, 'list', filters] as const,
    detail: (id: string) => [...billingKeys.refunds.all, 'detail', id] as const
  },

  // Categories
  categories: {
    all: ['billing', 'categories'] as const,
    parent: (filters?: Record<string, unknown>) =>
      [...billingKeys.categories.all, 'parent', filters] as const,
    sub: (filters?: Record<string, unknown>) =>
      [...billingKeys.categories.all, 'sub', filters] as const,
    items: (filters?: Record<string, unknown>) =>
      [...billingKeys.categories.all, 'items', filters] as const
  },

  // Reports
  reports: {
    all: ['billing', 'reports'] as const,
    summary: (filters?: Record<string, unknown>) =>
      [...billingKeys.reports.all, 'summary', filters] as const,
    detailed: (filters?: Record<string, unknown>) =>
      [...billingKeys.reports.all, 'detailed', filters] as const
  }
};

// ============================================
// Academic Module Keys
// ============================================
export const academicKeys = {
  all: ['academic'] as const,

  // Academic Years
  academicYears: {
    all: ['academic', 'years'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...academicKeys.academicYears.all, 'list', filters] as const,
    detail: (id: string) =>
      [...academicKeys.academicYears.all, 'detail', id] as const,
    current: () => [...academicKeys.academicYears.all, 'current'] as const
  },

  // Timetables
  timetables: {
    all: ['academic', 'timetables'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...academicKeys.timetables.all, 'list', filters] as const,
    detail: (id: string) =>
      [...academicKeys.timetables.all, 'detail', id] as const,
    bySection: (sectionId: string) =>
      [...academicKeys.timetables.all, 'section', sectionId] as const
  },

  // Attendance
  attendance: {
    all: ['academic', 'attendance'] as const,
    stats: (
      institutionId?: string,
      date?: string,
      academicYearId?: string,
      refreshTrigger?: number
    ) =>
      [
        ...academicKeys.attendance.all,
        'stats',
        institutionId,
        date,
        academicYearId,
        refreshTrigger
      ] as const,
    pending: (filters?: Record<string, unknown>, refreshTrigger?: number) =>
      [
        ...academicKeys.attendance.all,
        'pending',
        filters,
        refreshTrigger
      ] as const,
    trend: (institutionId?: string, days?: number) =>
      [...academicKeys.attendance.all, 'trend', institutionId, days] as const,
    byStudent: (studentId: string, filters?: Record<string, unknown>) =>
      [...academicKeys.attendance.all, 'student', studentId, filters] as const,
    bySection: (sectionId: string, date?: string) =>
      [...academicKeys.attendance.all, 'section', sectionId, date] as const
  },

  // Periods
  periods: {
    all: ['academic', 'periods'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...academicKeys.periods.all, 'list', filters] as const,
    byInstitution: (institutionId: string) =>
      [...academicKeys.periods.all, 'institution', institutionId] as const
  }
};

// ============================================
// Admissions Module Keys
// ============================================
export const admissionKeys = {
  all: ['admissions'] as const,
  list: (filters?: Record<string, unknown>) =>
    [...admissionKeys.all, 'list', filters] as const,
  detail: (id: string) => [...admissionKeys.all, 'detail', id] as const,
  analytics: (filters?: Record<string, unknown>) =>
    [...admissionKeys.all, 'analytics', filters] as const,
  byStudent: (studentId: string) =>
    [...admissionKeys.all, 'student', studentId] as const
};

// ============================================
// User & Auth Module Keys
// ============================================
export const userKeys = {
  all: ['users'] as const,
  list: (filters?: Record<string, unknown>) =>
    [...userKeys.all, 'list', filters] as const,
  detail: (id: string) => [...userKeys.all, 'detail', id] as const,
  profile: () => [...userKeys.all, 'profile'] as const,
  permissions: (userId?: string) =>
    [...userKeys.all, 'permissions', userId] as const,
  institutionAccess: (userId?: string) =>
    [...userKeys.all, 'institution-access', userId] as const,
  departmentAccess: (userId?: string) =>
    [...userKeys.all, 'department-access', userId] as const
};

// ============================================
// Resource Management Keys
// ============================================
export const resourceKeys = {
  all: ['resources'] as const,
  list: (filters?: Record<string, unknown>) =>
    [...resourceKeys.all, 'list', filters] as const,
  detail: (id: string) => [...resourceKeys.all, 'detail', id] as const,
  categories: {
    all: ['resources', 'categories'] as const,
    parent: (filters?: Record<string, unknown>) =>
      [...resourceKeys.categories.all, 'parent', filters] as const,
    sub: (filters?: Record<string, unknown>) =>
      [...resourceKeys.categories.all, 'sub', filters] as const
  },
  reservations: {
    all: ['resources', 'reservations'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...resourceKeys.reservations.all, 'list', filters] as const,
    detail: (id: string) =>
      [...resourceKeys.reservations.all, 'detail', id] as const,
    availability: (resourceId: string, date?: string) =>
      [...resourceKeys.reservations.all, 'availability', resourceId, date] as const
  },
  maintenance: {
    all: ['resources', 'maintenance'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...resourceKeys.maintenance.all, 'list', filters] as const,
    detail: (id: string) =>
      [...resourceKeys.maintenance.all, 'detail', id] as const
  }
};

// ============================================
// Solutions Hub Module Keys
// ============================================
export const solutionsHubKeys = {
  all: ['solutions-hub'] as const,

  // Clients
  clients: {
    all: ['solutions-hub', 'clients'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.clients.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.clients.all, 'detail', id] as const,
    industries: () =>
      [...solutionsHubKeys.clients.all, 'industries'] as const
  },

  // Solutions
  solutions: {
    all: ['solutions-hub', 'solutions'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.solutions.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.solutions.all, 'detail', id] as const,
    stats: () =>
      [...solutionsHubKeys.solutions.all, 'stats'] as const
  },

  // Phases
  phases: {
    all: ['solutions-hub', 'phases'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.phases.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.phases.all, 'detail', id] as const,
    bySolution: (solutionId: string) =>
      [...solutionsHubKeys.phases.all, 'solution', solutionId] as const,
    stats: () =>
      [...solutionsHubKeys.phases.all, 'stats'] as const,
    nextNumber: (solutionId: string) =>
      [...solutionsHubKeys.phases.all, 'next-number', solutionId] as const
  },

  // MOUs
  mous: {
    all: ['solutions-hub', 'mous'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.mous.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.mous.all, 'detail', id] as const,
    bySolution: (solutionId: string) =>
      [...solutionsHubKeys.mous.all, 'solution', solutionId] as const
  },

  // Builders
  builders: {
    all: ['solutions-hub', 'builders'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.builders.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.builders.all, 'detail', id] as const,
    stats: () =>
      [...solutionsHubKeys.builders.all, 'stats'] as const,
    available: (phaseId: string) =>
      [...solutionsHubKeys.builders.all, 'available', phaseId] as const
  },

  // Builder Assignments
  builderAssignments: {
    all: ['solutions-hub', 'builder-assignments'] as const,
    pending: () =>
      [...solutionsHubKeys.builderAssignments.all, 'pending'] as const,
    byStatus: (status: string) =>
      [...solutionsHubKeys.builderAssignments.all, 'status', status] as const,
    approvalCheck: (phaseId: string) =>
      [...solutionsHubKeys.builderAssignments.all, 'approval-check', phaseId] as const
  },

  // Builder Portal
  builderPortal: {
    all: ['solutions-hub', 'builder-portal'] as const,
    profile: (userId: string) =>
      [...solutionsHubKeys.builderPortal.all, 'profile', userId] as const,
    overview: (builderId: string) =>
      [...solutionsHubKeys.builderPortal.all, 'overview', builderId] as const,
    assignments: (builderId: string, status?: string) =>
      [...solutionsHubKeys.builderPortal.all, 'assignments', builderId, status] as const,
    availablePhases: (builderId: string) =>
      [...solutionsHubKeys.builderPortal.all, 'available-phases', builderId] as const,
    skills: (builderId: string) =>
      [...solutionsHubKeys.builderPortal.all, 'skills', builderId] as const,
    earnings: (builderId: string) =>
      [...solutionsHubKeys.builderPortal.all, 'earnings', builderId] as const
  },

  // Training Programs
  trainingPrograms: {
    all: ['solutions-hub', 'training-programs'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.trainingPrograms.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.trainingPrograms.all, 'detail', id] as const,
    bySolution: (solutionId: string) =>
      [...solutionsHubKeys.trainingPrograms.all, 'solution', solutionId] as const
  },

  // Training Sessions
  trainingSessions: {
    all: ['solutions-hub', 'training-sessions'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.trainingSessions.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.trainingSessions.all, 'detail', id] as const,
    byProgram: (programId: string) =>
      [...solutionsHubKeys.trainingSessions.all, 'program', programId] as const,
    canSelfClaim: (sessionId: string) =>
      [...solutionsHubKeys.trainingSessions.all, 'can-self-claim', sessionId] as const
  },

  // Cohort Members
  cohortMembers: {
    all: ['solutions-hub', 'cohort-members'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.cohortMembers.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.cohortMembers.all, 'detail', id] as const,
    byUser: (userId: string) =>
      [...solutionsHubKeys.cohortMembers.all, 'user', userId] as const,
    stats: () =>
      [...solutionsHubKeys.cohortMembers.all, 'stats'] as const,
    availableSessions: (memberId: string) =>
      [...solutionsHubKeys.cohortMembers.all, 'available-sessions', memberId] as const
  },

  // Cohort Portal
  cohortPortal: {
    all: ['solutions-hub', 'cohort-portal'] as const,
    profile: (userId: string) =>
      [...solutionsHubKeys.cohortPortal.all, 'profile', userId] as const,
    member: (memberId: string) =>
      [...solutionsHubKeys.cohortPortal.all, 'member', memberId] as const,
    availableSessions: (memberId: string, level?: number) =>
      [...solutionsHubKeys.cohortPortal.all, 'available-sessions', memberId, level] as const,
    schedule: (memberId: string) =>
      [...solutionsHubKeys.cohortPortal.all, 'schedule', memberId] as const,
    upcoming: (memberId: string) =>
      [...solutionsHubKeys.cohortPortal.all, 'upcoming', memberId] as const,
    completed: (memberId: string) =>
      [...solutionsHubKeys.cohortPortal.all, 'completed', memberId] as const,
    earnings: (memberId: string) =>
      [...solutionsHubKeys.cohortPortal.all, 'earnings', memberId] as const,
    levelProgress: (memberId: string) =>
      [...solutionsHubKeys.cohortPortal.all, 'level-progress', memberId] as const,
    dashboard: (memberId: string) =>
      [...solutionsHubKeys.cohortPortal.all, 'dashboard', memberId] as const
  },

  // Content Orders
  contentOrders: {
    all: ['solutions-hub', 'content-orders'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.contentOrders.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.contentOrders.all, 'detail', id] as const,
    bySolution: (solutionId: string) =>
      [...solutionsHubKeys.contentOrders.all, 'solution', solutionId] as const,
    byDivision: (division: string) =>
      [...solutionsHubKeys.contentOrders.all, 'division', division] as const,
    stats: () =>
      [...solutionsHubKeys.contentOrders.all, 'stats'] as const
  },

  // Content Deliverables
  contentDeliverables: {
    all: ['solutions-hub', 'content-deliverables'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.contentDeliverables.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.contentDeliverables.all, 'detail', id] as const,
    byOrder: (orderId: string) =>
      [...solutionsHubKeys.contentDeliverables.all, 'order', orderId] as const
  },

  // Production Learners
  productionLearners: {
    all: ['solutions-hub', 'production-learners'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.productionLearners.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.productionLearners.all, 'detail', id] as const,
    byUser: (userId: string) =>
      [...solutionsHubKeys.productionLearners.all, 'user', userId] as const
  },

  // Production Portal
  productionPortal: {
    all: ['solutions-hub', 'production-portal'] as const,
    learner: (userId: string) =>
      [...solutionsHubKeys.productionPortal.all, 'learner', userId] as const,
    stats: (learnerId: string) =>
      [...solutionsHubKeys.productionPortal.all, 'stats', learnerId] as const,
    availableWork: (learnerId: string, division?: string) =>
      [...solutionsHubKeys.productionPortal.all, 'available-work', learnerId, division] as const,
    allAvailableWork: () =>
      [...solutionsHubKeys.productionPortal.all, 'all-available-work'] as const,
    myWork: (learnerId: string) =>
      [...solutionsHubKeys.productionPortal.all, 'my-work', learnerId] as const,
    myActiveWork: (learnerId: string) =>
      [...solutionsHubKeys.productionPortal.all, 'my-active-work', learnerId] as const,
    earnings: (learnerId: string) =>
      [...solutionsHubKeys.productionPortal.all, 'earnings', learnerId] as const,
    submission: (deliverableId: string, learnerId: string) =>
      [...solutionsHubKeys.productionPortal.all, 'submission', deliverableId, learnerId] as const
  },

  // Discovery Visits
  discoveryVisits: {
    all: ['solutions-hub', 'discovery-visits'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.discoveryVisits.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.discoveryVisits.all, 'detail', id] as const,
    byClient: (clientId: string) =>
      [...solutionsHubKeys.discoveryVisits.all, 'client', clientId] as const
  },

  // Communications
  communications: {
    all: ['solutions-hub', 'communications'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.communications.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.communications.all, 'detail', id] as const,
    byClient: (clientId: string) =>
      [...solutionsHubKeys.communications.all, 'client', clientId] as const
  },

  // Payments
  payments: {
    all: ['solutions-hub', 'payments'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.payments.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.payments.all, 'detail', id] as const,
    stats: () =>
      [...solutionsHubKeys.payments.all, 'stats'] as const,
    monthlyBatch: (month: number, year: number) =>
      [...solutionsHubKeys.payments.all, 'monthly-batch', month, year] as const
  },

  // Earnings
  earnings: {
    all: ['solutions-hub', 'earnings'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.earnings.all, 'list', filters] as const,
    byRecipient: (recipientType: string, recipientId: string) =>
      [...solutionsHubKeys.earnings.all, 'recipient', recipientType, recipientId] as const,
    summary: () =>
      [...solutionsHubKeys.earnings.all, 'summary'] as const,
    total: (recipientType: string, recipientId: string) =>
      [...solutionsHubKeys.earnings.all, 'total', recipientType, recipientId] as const,
    byDepartment: (departmentId: string, fromDate?: string, toDate?: string) =>
      [...solutionsHubKeys.earnings.all, 'department', departmentId, fromDate, toDate] as const,
    monthlyReport: (month: number, year: number) =>
      [...solutionsHubKeys.earnings.all, 'monthly', month, year] as const
  },

  // Publications
  publications: {
    all: ['solutions-hub', 'publications'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.publications.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.publications.all, 'detail', id] as const,
    stats: () =>
      [...solutionsHubKeys.publications.all, 'stats'] as const,
    contributors: (publicationId: string) =>
      [...solutionsHubKeys.publications.all, 'contributors', publicationId] as const
  },

  // Accreditation
  accreditation: {
    all: ['solutions-hub', 'accreditation'] as const,
    metrics: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.accreditation.all, 'metrics', filters] as const
  },

  // Department Dashboard
  departmentDashboard: {
    all: ['solutions-hub', 'department-dashboard'] as const,
    stats: (departmentId: string) =>
      [...solutionsHubKeys.departmentDashboard.all, 'stats', departmentId] as const
  }
};

// ============================================
// Combined Export
// ============================================
export const queryKeys = {
  organization: organizationKeys,
  students: studentKeys,
  staff: staffKeys,
  billing: billingKeys,
  academic: academicKeys,
  admissions: admissionKeys,
  users: userKeys,
  resources: resourceKeys,
  solutionsHub: solutionsHubKeys
} as const;

// ============================================
// Helper Functions
// ============================================

/**
 * Get all keys for a module (useful for invalidation)
 */
export function getModuleKeys(
  module: keyof typeof queryKeys
): readonly unknown[] {
  return queryKeys[module].all;
}

/**
 * Type helper for query key arrays
 */
export type QueryKey = readonly unknown[];

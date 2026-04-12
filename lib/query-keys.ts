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
// Solutions Hub Keys
// ============================================
export const solutionsHubKeys = {
  all: ['solutions-hub'] as const,

  solutions: {
    all: ['solutions-hub', 'solutions'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.solutions.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.solutions.all, 'detail', id] as const,
    stats: () =>
      [...solutionsHubKeys.solutions.all, 'stats'] as const,
  },

  clients: {
    all: ['solutions-hub', 'clients'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.clients.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.clients.all, 'detail', id] as const,
    industries: () =>
      [...solutionsHubKeys.clients.all, 'industries'] as const,
  },

  phases: {
    all: ['solutions-hub', 'phases'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.phases.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.phases.all, 'detail', id] as const,
    bySolution: (solutionId: string) =>
      [...solutionsHubKeys.phases.all, 'by-solution', solutionId] as const,
    stats: () =>
      [...solutionsHubKeys.phases.all, 'stats'] as const,
  },

  builders: {
    all: ['solutions-hub', 'builders'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.builders.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.builders.all, 'detail', id] as const,
    stats: () =>
      [...solutionsHubKeys.builders.all, 'stats'] as const,
  },

  training: {
    all: ['solutions-hub', 'training'] as const,
    programs: {
      all: ['solutions-hub', 'training', 'programs'] as const,
      list: (filters?: Record<string, unknown>) =>
        [...solutionsHubKeys.training.programs.all, 'list', filters] as const,
      detail: (id: string) =>
        [...solutionsHubKeys.training.programs.all, 'detail', id] as const,
    },
    sessions: {
      all: ['solutions-hub', 'training', 'sessions'] as const,
      list: (filters?: Record<string, unknown>) =>
        [...solutionsHubKeys.training.sessions.all, 'list', filters] as const,
    },
    cohortMembers: {
      all: ['solutions-hub', 'training', 'cohort-members'] as const,
      list: (filters?: Record<string, unknown>) =>
        [...solutionsHubKeys.training.cohortMembers.all, 'list', filters] as const,
      stats: () =>
        [...solutionsHubKeys.training.cohortMembers.all, 'stats'] as const,
    },
  },

  content: {
    all: ['solutions-hub', 'content'] as const,
    orders: {
      all: ['solutions-hub', 'content', 'orders'] as const,
      list: (filters?: Record<string, unknown>) =>
        [...solutionsHubKeys.content.orders.all, 'list', filters] as const,
      detail: (id: string) =>
        [...solutionsHubKeys.content.orders.all, 'detail', id] as const,
      bySolution: (solutionId: string) =>
        [...solutionsHubKeys.content.orders.all, 'by-solution', solutionId] as const,
      stats: () =>
        [...solutionsHubKeys.content.orders.all, 'stats'] as const,
    },
    deliverables: {
      all: ['solutions-hub', 'content', 'deliverables'] as const,
      byOrder: (orderId: string) =>
        [...solutionsHubKeys.content.deliverables.all, 'by-order', orderId] as const,
    },
  },

  payments: {
    all: ['solutions-hub', 'payments'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.payments.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.payments.all, 'detail', id] as const,
    bySolution: (solutionId: string) =>
      [...solutionsHubKeys.payments.all, 'by-solution', solutionId] as const,
  },

  earnings: {
    all: ['solutions-hub', 'earnings'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.earnings.all, 'list', filters] as const,
  },

  discovery: {
    all: ['solutions-hub', 'discovery'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.discovery.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.discovery.all, 'detail', id] as const,
  },

  publications: {
    all: ['solutions-hub', 'publications'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.publications.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.publications.all, 'detail', id] as const,
  },

  mous: {
    all: ['solutions-hub', 'mous'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.mous.all, 'list', filters] as const,
    bySolution: (solutionId: string) =>
      [...solutionsHubKeys.mous.all, 'by-solution', solutionId] as const,
  },

  prospects: {
    all: ['solutions-hub', 'prospects'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.prospects.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.prospects.all, 'detail', id] as const,
    stats: () =>
      [...solutionsHubKeys.prospects.all, 'stats'] as const,
    pipelineBoard: () =>
      [...solutionsHubKeys.prospects.all, 'pipeline-board'] as const,
    activities: (prospectId: string) =>
      [...solutionsHubKeys.prospects.all, 'activities', prospectId] as const,
  },

  products: {
    all: ['solutions-hub', 'products'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.products.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.products.all, 'detail', id] as const,
    stats: () =>
      [...solutionsHubKeys.products.all, 'stats'] as const,
    rdifScore: () =>
      [...solutionsHubKeys.products.all, 'rdif-score'] as const,
  },

  departmentTracker: {
    all: ['solutions-hub', 'department-tracker'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.departmentTracker.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.departmentTracker.all, 'detail', id] as const,
    summary: () =>
      [...solutionsHubKeys.departmentTracker.all, 'summary'] as const,
    revenue: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.departmentTracker.all, 'revenue', filters] as const,
  },

  paradigmShift: {
    all: ['solutions-hub', 'paradigm-shift'] as const,
    overview: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.paradigmShift.all, 'overview', filters] as const,
    department: (departmentId: string) =>
      [...solutionsHubKeys.paradigmShift.all, 'department', departmentId] as const,
    leaderboard: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.paradigmShift.all, 'leaderboard', filters] as const,
  },

  // Portals
  builderPortal: {
    all: ['solutions-hub', 'builder-portal'] as const,
    profile: () =>
      [...solutionsHubKeys.builderPortal.all, 'profile'] as const,
    assignments: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.builderPortal.all, 'assignments', filters] as const,
  },
  cohortPortal: {
    all: ['solutions-hub', 'cohort-portal'] as const,
    profile: () =>
      [...solutionsHubKeys.cohortPortal.all, 'profile'] as const,
    assignments: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.cohortPortal.all, 'assignments', filters] as const,
  },
  productionPortal: {
    all: ['solutions-hub', 'production-portal'] as const,
    profile: () =>
      [...solutionsHubKeys.productionPortal.all, 'profile'] as const,
    assignments: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.productionPortal.all, 'assignments', filters] as const,
  },
  clientPortal: {
    all: ['solutions-hub', 'client-portal'] as const,
    profile: () =>
      [...solutionsHubKeys.clientPortal.all, 'profile'] as const,
  },

  // Compliance
  compliance: {
    all: ['solutions-hub', 'compliance'] as const,
    dashboard: () =>
      [...solutionsHubKeys.compliance.all, 'dashboard'] as const,
  },

  // Revenue splits
  revenueSplits: {
    all: ['solutions-hub', 'revenue-splits'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.revenueSplits.all, 'list', filters] as const,
  },

  // Unified earnings
  unifiedEarnings: {
    all: ['solutions-hub', 'unified-earnings'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.unifiedEarnings.all, 'list', filters] as const,
  },

  // MATLAB analytics
  matlabAnalytics: {
    all: ['solutions-hub', 'matlab-analytics'] as const,
    dashboard: (filters?: Record<string, unknown>) =>
      [...solutionsHubKeys.matlabAnalytics.all, 'dashboard', filters] as const,
  },
};

// ============================================
// Startup Studio Keys
// ============================================
export const startupStudioKeys = {
  all: ['startup-studio'] as const,

  nif: {
    all: ['startup-studio', 'nif'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...startupStudioKeys.nif.all, 'list', filters] as const,
    detail: (id: string) =>
      [...startupStudioKeys.nif.all, 'detail', id] as const,
    stageCounts: () =>
      [...startupStudioKeys.nif.all, 'stage-counts'] as const,
    history: (candidateId: string) =>
      [...startupStudioKeys.nif.all, 'history', candidateId] as const,
  },

  trl: {
    all: ['startup-studio', 'trl'] as const,
    list: (candidateId: string) =>
      [...startupStudioKeys.trl.all, 'list', candidateId] as const,
    distribution: () =>
      [...startupStudioKeys.trl.all, 'distribution'] as const,
    stalled: () =>
      [...startupStudioKeys.trl.all, 'stalled'] as const,
  },

  risk: {
    all: ['startup-studio', 'risk'] as const,
    list: (candidateId: string) =>
      [...startupStudioKeys.risk.all, 'list', candidateId] as const,
    heatmap: () =>
      [...startupStudioKeys.risk.all, 'heatmap'] as const,
    highRisk: (threshold?: number) =>
      [...startupStudioKeys.risk.all, 'high-risk', threshold] as const,
  },

  competitive: {
    all: ['startup-studio', 'competitive'] as const,
    list: (candidateId: string) =>
      [...startupStudioKeys.competitive.all, 'list', candidateId] as const,
  },

  portfolio: {
    all: ['startup-studio', 'portfolio'] as const,
    dashboard: () =>
      [...startupStudioKeys.portfolio.all, 'dashboard'] as const,
  },

  cycles: {
    all: ['startup-studio', 'cycles'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...startupStudioKeys.cycles.all, 'list', filters] as const,
    detail: (id: string) =>
      [...startupStudioKeys.cycles.all, 'detail', id] as const,
  },

  problems: {
    all: ['startup-studio', 'problems'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...startupStudioKeys.problems.all, 'list', filters] as const,
    detail: (id: string) =>
      [...startupStudioKeys.problems.all, 'detail', id] as const,
    top: () =>
      [...startupStudioKeys.problems.all, 'top'] as const,
  },

  problemBank: {
    all: ['startup-studio', 'problem-bank'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...startupStudioKeys.problemBank.all, 'list', filters] as const,
    detail: (id: string) =>
      [...startupStudioKeys.problemBank.all, 'detail', id] as const,
    top: () =>
      [...startupStudioKeys.problemBank.all, 'top'] as const,
    tags: () =>
      [...startupStudioKeys.problemBank.all, 'tags'] as const,
  },

  submissions: {
    all: ['startup-studio', 'submissions'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...startupStudioKeys.submissions.all, 'list', filters] as const,
    detail: (id: string) =>
      [...startupStudioKeys.submissions.all, 'detail', id] as const,
    leaderboard: (eventId: string) =>
      [...startupStudioKeys.submissions.all, 'leaderboard', eventId] as const,
  },

  events: {
    all: ['startup-studio', 'events'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...startupStudioKeys.events.all, 'list', filters] as const,
    detail: (id: string) =>
      [...startupStudioKeys.events.all, 'detail', id] as const,
    active: () =>
      [...startupStudioKeys.events.all, 'active'] as const,
  },

  analytics: {
    all: ['startup-studio', 'analytics'] as const,
    dashboard: (eventId?: string) =>
      [...startupStudioKeys.analytics.all, 'dashboard', eventId] as const,
    nifStages: () =>
      [...startupStudioKeys.analytics.all, 'nif-stages'] as const,
    problemThemes: () =>
      [...startupStudioKeys.analytics.all, 'problem-themes'] as const,
    cycleStatus: () =>
      [...startupStudioKeys.analytics.all, 'cycle-status'] as const,
    stepCompletion: () =>
      [...startupStudioKeys.analytics.all, 'step-completion'] as const,
    impact: () =>
      [...startupStudioKeys.analytics.all, 'impact'] as const,
  },

  teams: {
    all: ['startup-studio', 'teams'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...startupStudioKeys.teams.all, 'list', filters] as const,
    detail: (id: string) =>
      [...startupStudioKeys.teams.all, 'detail', id] as const,
  },

  mentors: {
    all: ['startup-studio', 'mentors'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...startupStudioKeys.mentors.all, 'list', filters] as const,
    detail: (id: string) =>
      [...startupStudioKeys.mentors.all, 'detail', id] as const,
    matches: (candidateId: string) =>
      [...startupStudioKeys.mentors.all, 'matches', candidateId] as const,
    sessions: (matchId: string) =>
      [...startupStudioKeys.mentors.all, 'sessions', matchId] as const,
    suggestions: (candidateId: string) =>
      [...startupStudioKeys.mentors.all, 'suggestions', candidateId] as const,
    dashboard: () =>
      [...startupStudioKeys.mentors.all, 'dashboard'] as const,
  },

  graduation: {
    all: ['startup-studio', 'graduation'] as const,
    criteria: (institutionId?: string) =>
      [...startupStudioKeys.graduation.all, 'criteria', institutionId] as const,
    readiness: (candidateId: string) =>
      [...startupStudioKeys.graduation.all, 'readiness', candidateId] as const,
    exit: (candidateId: string) =>
      [...startupStudioKeys.graduation.all, 'exit', candidateId] as const,
    alumni: () =>
      [...startupStudioKeys.graduation.all, 'alumni'] as const,
    alumniMetrics: (year?: number) =>
      [...startupStudioKeys.graduation.all, 'alumni-metrics', year] as const,
  },

  kpi: {
    all: ['startup-studio', 'kpi'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...startupStudioKeys.kpi.all, 'list', filters] as const,
    detail: (id: string) =>
      [...startupStudioKeys.kpi.all, 'detail', id] as const,
    dashboard: (institutionId?: string) =>
      [...startupStudioKeys.kpi.all, 'dashboard', institutionId] as const,
    compliance: (framework: string, institutionId?: string) =>
      [...startupStudioKeys.kpi.all, 'compliance', framework, institutionId] as const,
    reports: (filters?: Record<string, unknown>) =>
      [...startupStudioKeys.kpi.all, 'reports', filters] as const,
    reportDetail: (id: string) =>
      [...startupStudioKeys.kpi.all, 'report-detail', id] as const,
  },

  marketing: {
    all: ['startup-studio', 'ss-marketing'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...startupStudioKeys.marketing.all, 'list', filters] as const,
    detail: (id: string) =>
      [...startupStudioKeys.marketing.all, 'detail', id] as const,
    dashboard: (institutionId?: string) =>
      [...startupStudioKeys.marketing.all, 'dashboard', institutionId] as const,
  },

  finance: {
    all: ['startup-studio', 'finance'] as const,
    grants: (institutionId?: string) =>
      [...startupStudioKeys.finance.all, 'grants', institutionId] as const,
    grant: (id: string) =>
      [...startupStudioKeys.finance.all, 'grant', id] as const,
    budgets: (filters?: Record<string, unknown>) =>
      [...startupStudioKeys.finance.all, 'budgets', filters] as const,
    revenue: (filters?: Record<string, unknown>) =>
      [...startupStudioKeys.finance.all, 'revenue', filters] as const,
    auditRecords: (filters?: Record<string, unknown>) =>
      [...startupStudioKeys.finance.all, 'audit-records', filters] as const,
    sustainability: (filters?: Record<string, unknown>) =>
      [...startupStudioKeys.finance.all, 'sustainability', filters] as const,
    grantUtilization: (institutionId?: string) =>
      [...startupStudioKeys.finance.all, 'grant-utilization', institutionId] as const,
  },

  governance: {
    all: ['startup-studio', 'governance'] as const,
    members: (filters?: Record<string, unknown>) =>
      [...startupStudioKeys.governance.all, 'members', filters] as const,
    compliance: (filters?: Record<string, unknown>) =>
      [...startupStudioKeys.governance.all, 'compliance', filters] as const,
    complianceDashboard: (institutionId?: string) =>
      [...startupStudioKeys.governance.all, 'compliance-dashboard', institutionId] as const,
    readiness: (institutionId?: string) =>
      [...startupStudioKeys.governance.all, 'readiness', institutionId] as const,
    latestReadiness: (institutionId?: string) =>
      [...startupStudioKeys.governance.all, 'latest-readiness', institutionId] as const,
  },

  sf100: {
    all: ['startup-studio', 'sf100'] as const,
    programs: {
      all: ['startup-studio', 'sf100', 'programs'] as const,
      list: (filters?: Record<string, unknown>) =>
        [...startupStudioKeys.sf100.programs.all, 'list', filters] as const,
      detail: (id: string) =>
        [...startupStudioKeys.sf100.programs.all, 'detail', id] as const,
      funnel: (id: string) =>
        [...startupStudioKeys.sf100.programs.all, 'funnel', id] as const,
    },
    enrollments: {
      all: ['startup-studio', 'sf100', 'enrollments'] as const,
      list: (programId: string, filters?: Record<string, unknown>) =>
        [...startupStudioKeys.sf100.enrollments.all, 'list', programId, filters] as const,
      detail: (id: string) =>
        [...startupStudioKeys.sf100.enrollments.all, 'detail', id] as const,
      my: (programId: string) =>
        [...startupStudioKeys.sf100.enrollments.all, 'my', programId] as const,
    },
    checkIns: (enrollmentId: string) =>
      [...startupStudioKeys.sf100.all, 'check-ins', enrollmentId] as const,
    paidUsers: (enrollmentId: string) =>
      [...startupStudioKeys.sf100.all, 'paid-users', enrollmentId] as const,
    verificationQueue: (programId: string) =>
      [...startupStudioKeys.sf100.all, 'verification-queue', programId] as const,
    interviews: (enrollmentId: string) =>
      [...startupStudioKeys.sf100.all, 'interviews', enrollmentId] as const,
    pivots: (enrollmentId: string) =>
      [...startupStudioKeys.sf100.all, 'pivots', enrollmentId] as const,
    leaderboard: (programId: string) =>
      [...startupStudioKeys.sf100.all, 'leaderboard', programId] as const,
    publicStats: (programId: string) =>
      [...startupStudioKeys.sf100.all, 'public-stats', programId] as const,
    notifications: (profileId: string) =>
      [...startupStudioKeys.sf100.all, 'notifications', profileId] as const,
    stalledTeams: (programId: string) =>
      [...startupStudioKeys.sf100.all, 'stalled', programId] as const,
    exercises: {
      all: ['startup-studio', 'sf100', 'exercises'] as const,
      list: (programId: string, filters?: Record<string, unknown>) =>
        [...startupStudioKeys.sf100.exercises.all, 'list', programId, filters] as const,
      detail: (exerciseId: string) =>
        [...startupStudioKeys.sf100.exercises.all, 'detail', exerciseId] as const,
      responses: (exerciseId: string) =>
        [...startupStudioKeys.sf100.exercises.all, 'responses', exerciseId] as const,
      teamResponse: (exerciseId: string, enrollmentId: string) =>
        [...startupStudioKeys.sf100.exercises.all, 'team-response', exerciseId, enrollmentId] as const,
    },
  },
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
  users: userKeys,
  resources: resourceKeys,
  startupStudio: startupStudioKeys,
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

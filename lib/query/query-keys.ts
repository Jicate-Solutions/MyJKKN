// lib/query/query-keys.ts
export const queryKeys = {
  bugReports: {
    all: ['bug-reports'] as const,
    lists: () => [...queryKeys.bugReports.all, 'list'] as const,
    list: (filters: any) => [...queryKeys.bugReports.lists(), filters] as const,
    details: () => [...queryKeys.bugReports.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.bugReports.details(), id] as const,
    mine: () => [...queryKeys.bugReports.all, 'mine'] as const,
    leaderboard: () => [...queryKeys.bugReports.all, 'leaderboard'] as const,
    stats: () => [...queryKeys.bugReports.all, 'stats'] as const,
    reporterStats: (filters: any) =>
      [...queryKeys.bugReports.all, 'reporter-stats', filters] as const
  },
  campusLiving: {
    all: ['campus-living'] as const,
    myHostel: {
      all: ['campus-living', 'my-hostel'] as const,
      summary: (learnerId: string) =>
        ['campus-living', 'my-hostel', 'summary', learnerId] as const,
      fees: (categoryId: string) =>
        ['campus-living', 'my-hostel', 'fees', categoryId] as const,
    },
    hostelFeeResolution: (learnerId: string, hostelYearId: string) =>
      ['campus-living', 'hostel-fee-resolution', learnerId, hostelYearId] as const,
    hostelBillGeneration: (hostelYearId: string) =>
      ['campus-living', 'hostel-bill-generation', hostelYearId] as const,
  },
  razorpayAccounts: {
    all: ['razorpay-accounts'] as const,
    list: () => [...queryKeys.razorpayAccounts.all, 'list'] as const,
  },
  transportCollectables: {
    all: ['transport-collectables'] as const,
    list: (institutionId: string | null, academicYearId: string | null) =>
      [...queryKeys.transportCollectables.all, 'list', institutionId, academicYearId] as const,
  },
  postalCodes: {
    all: ['postal-codes'] as const,
    lookup: (pincode: string) =>
      [...queryKeys.postalCodes.all, 'lookup', pincode] as const,
    detail: (id: string) => [...queryKeys.postalCodes.all, 'detail', id] as const,
    list: (filters: unknown) =>
      [...queryKeys.postalCodes.all, 'list', filters] as const,
  },
  schoolMaster: {
    all: ['school-master'] as const,
    districts: (board: string) =>
      [...queryKeys.schoolMaster.all, 'districts', board] as const,
    list: (filters: unknown) =>
      [...queryKeys.schoolMaster.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.schoolMaster.all, 'detail', id] as const,
  },
  academicTree: {
    all: ['academic-tree'] as const,
    byInstitution: (institutionId: string) =>
      [...queryKeys.academicTree.all, institutionId] as const,
  },
  calendar: {
    all: ['calendar'] as const,
    items: (query: unknown) => ['calendar', 'items', query] as const,
    /** COE-backed feeds (coe_calendar / exam_schedule) — fetched over HTTP, not the RPC. */
    coeItems: (feed: string, query: unknown) => ['calendar', 'coe', feed, query] as const,
    entries: (params: unknown) => ['calendar', 'entries', params] as const,
    categories: () => ['calendar', 'categories'] as const,
  },
  courses: {
    all: ['courses'] as const,
    lists: () => [...queryKeys.courses.all, 'list'] as const,
    list: (filters: unknown) => [...queryKeys.courses.lists(), filters] as const,
    details: () => [...queryKeys.courses.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.courses.details(), id] as const,
  },
  /** Separate root from `courses` so invalidating a course list never refetches
   *  every package list, and vice versa. `list()` spreads `lists()` so one
   *  invalidate of lists() still reaches every course's packages. */
  coursePackages: {
    all: ['course-packages'] as const,
    lists: () => [...queryKeys.coursePackages.all, 'list'] as const,
    list: (courseEventId: string) =>
      [...queryKeys.coursePackages.lists(), courseEventId] as const,
    details: () => [...queryKeys.coursePackages.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.coursePackages.details(), id] as const,
  },
  /** Own root, same reasoning as coursePackages. Note a session mutation can also
   *  change a resource_reservations row, so anything caching the Resource
   *  Management calendar needs invalidating too — that lives outside this file. */
  courseSessions: {
    all: ['course-sessions'] as const,
    lists: () => [...queryKeys.courseSessions.all, 'list'] as const,
    list: (courseEventId: string) =>
      [...queryKeys.courseSessions.lists(), courseEventId] as const,
    details: () => [...queryKeys.courseSessions.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.courseSessions.details(), id] as const,
  },
} as const;

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
  schoolMaster: {
    all: ['school-master'] as const,
    districts: (board: string) =>
      [...queryKeys.schoolMaster.all, 'districts', board] as const,
    list: (filters: unknown) =>
      [...queryKeys.schoolMaster.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.schoolMaster.all, 'detail', id] as const,
  },
  calendar: {
    all: ['calendar'] as const,
    items: (query: unknown) => ['calendar', 'items', query] as const,
    entries: (params: unknown) => ['calendar', 'entries', params] as const,
    categories: () => ['calendar', 'categories'] as const,
  },
} as const;

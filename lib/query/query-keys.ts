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
  },
} as const;

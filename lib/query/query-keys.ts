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
    stats: () => [...queryKeys.bugReports.all, 'stats'] as const
  }
} as const;

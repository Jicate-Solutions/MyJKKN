import { useQuery } from '@tanstack/react-query';

interface SyllabusMetrics {
  totalSyllabi: number;
  byStream: Record<string, number>;
  byRegulation: Record<string, number>;
  averageRevisionsPerCourse: number;
  incompleteCount: number;
  recentlyModified: Array<{
    id: string;
    courseCode: string;
    courseName: string;
    stream: string;
    lastModified: string;
  }>;
  revisionDistribution: Array<{
    version: number;
    count: number;
  }>;
}

export function useSyllabusMetrics(institutionsId?: string) {
  return useQuery({
    queryKey: ['syllabi-metrics', institutionsId],
    queryFn: async () => {
      if (!institutionsId) throw new Error('Institution ID required');

      const response = await fetch(
        `/api/bos/syllabi/metrics?institutions_id=${institutionsId}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch syllabi metrics');
      }

      return response.json() as Promise<SyllabusMetrics>;
    },
    enabled: !!institutionsId,
  });
}

export function useSyllabusHealthCheck(institutionsId?: string) {
  return useQuery({
    queryKey: ['syllabi-health', institutionsId],
    queryFn: async () => {
      if (!institutionsId) throw new Error('Institution ID required');

      const response = await fetch(
        `/api/bos/syllabi/health?institutions_id=${institutionsId}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch health check');
      }

      const data = await response.json();
      return data as {
        totalIssues: number;
        missingObjectives: string[];
        missingLearningOutcomes: string[];
        missingContent: string[];
        missingMappings: string[];
      };
    },
    enabled: !!institutionsId,
  });
}

// hooks/parent-portal/use-learner-skills.ts
// React Query hook for fetching learner skill progression data in the parent portal

import { useQuery } from '@tanstack/react-query';
import type { LearnerSkillData } from '@/types/parent-portal';

async function fetchLearnerSkills(learnerId: string): Promise<LearnerSkillData> {
  const response = await fetch(`/api/parent-portal/learner/${learnerId}/skills`, {
    credentials: 'include', // httpOnly session cookie
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Authentication required');
    }
    if (response.status === 403) {
      throw new Error('Access denied');
    }
    throw new Error('Failed to fetch skill data');
  }

  return response.json();
}

export function useLearnerSkills(learnerId: string | undefined) {
  return useQuery<LearnerSkillData>({
    queryKey: ['parent-learner-skills', learnerId],
    queryFn: () => fetchLearnerSkills(learnerId!),
    enabled: !!learnerId,
    staleTime: 5 * 60 * 1000, // 5 minutes — skill data changes slowly
    refetchOnWindowFocus: false,
  });
}

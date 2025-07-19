import { useQuery } from '@tanstack/react-query';
import { OrganizationStats } from '@/types/organizations';

const fetchOrganizationStats = async (
  institutionId: string | null
): Promise<OrganizationStats> => {
  const url = institutionId
    ? `/api/organizations/dashboard?institutionId=${institutionId}`
    : '/api/organizations/dashboard';
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch organization stats');
  }
  return response.json();
};

export function useOrganizationDashboard(institutionId: string | null) {
  return useQuery<OrganizationStats, Error>({
    queryKey: ['organization-stats', institutionId],
    queryFn: () => fetchOrganizationStats(institutionId),
    staleTime: 1000 * 60 * 5 // 5 minutes
  });
}

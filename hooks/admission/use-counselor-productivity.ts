// hooks/admission/use-counselor-productivity.ts
// Real-time counselor productivity data with 60-second auto-refresh

import { useQuery } from '@tanstack/react-query';

interface CounselorProductivityRow {
  id: string;
  name: string;
  designation: string | null;
  callsAttempted: number;
  callsConnected: number;
  callsNotConnected: number;
  whatsappSent: number;
  smsSent: number;
  conversions: number;
  avgResponseMin: number;
  avgCallDuration: number;
  hourly: number[]; // 11 buckets: 9am-7pm
}

interface TeamKPIs {
  callsAttempted: number;
  callsConnected: number;
  callsNotConnected: number;
  whatsappSent: number;
  smsSent: number;
  conversions: number;
  avgResponseMin: number;
}

interface ProductivityData {
  team: TeamKPIs;
  counselors: CounselorProductivityRow[];
  date: string;
}

export function useCounselorProductivity(
  institutionId: string | undefined,
  date?: string
) {
  const dateStr = date || new Date().toISOString().split('T')[0];

  return useQuery<ProductivityData>({
    queryKey: ['counselor-productivity', institutionId, dateStr],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (institutionId) params.set('institution_id', institutionId);
      params.set('date', dateStr);

      const res = await fetch(`/api/admission/counselors/productivity?${params}`);
      if (!res.ok) throw new Error('Failed to fetch productivity data');
      const json = await res.json();
      return json.data;
    },
    enabled: true,
    refetchInterval: 60000, // Auto-refresh every 60 seconds
    staleTime: 30000,
  });
}

export type { CounselorProductivityRow, TeamKPIs, ProductivityData };

import { useQuery } from '@tanstack/react-query';

interface TelephonyHealth {
  status: 'healthy' | 'warning' | 'critical';
  latest: {
    status_type: string;
    connectivity_status: string;
    created_at: string;
  } | null;
  recent: {
    id: string;
    status_type: string;
    connectivity_status: string;
    created_at: string;
  }[];
  lastIssueAt: string | null;
}

export const telephonyHealthKeys = {
  all: ['telephony-health'] as const,
};

export function useTelephonyHealth() {
  return useQuery({
    queryKey: telephonyHealthKeys.all,
    queryFn: async () => {
      const res = await fetch('/api/admission/telephony/health');
      if (!res.ok) throw new Error('Failed to fetch health');
      return (await res.json()) as TelephonyHealth;
    },
    refetchInterval: 60000, // 60s
    staleTime: 30000,
  });
}

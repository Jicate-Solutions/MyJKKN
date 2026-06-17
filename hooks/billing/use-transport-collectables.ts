'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';

// One row per bus-requiring dayscholar who has transport-kind bills.
export interface TransportCollectable {
  student_id: string;
  first_name: string | null;
  last_name: string | null;
  roll_number: string | null;
  institution_id: string;
  route_number: string | null;
  route_name: string | null;
  stop_name: string | null;
  outstanding_amount: number;
  payable_bill_ids: string[];
  bill_count: number;
}

export interface TransportCollectablesFilters {
  institutionId?: string | null;
  academicYearId?: string | null;
}

export function useTransportCollectables(filters: TransportCollectablesFilters = {}) {
  const institutionId = filters.institutionId ?? null;
  const academicYearId = filters.academicYearId ?? null;
  return useQuery({
    queryKey: queryKeys.transportCollectables.list(institutionId, academicYearId),
    queryFn: async (): Promise<TransportCollectable[]> => {
      const params = new URLSearchParams();
      if (institutionId) params.set('institution_id', institutionId);
      if (academicYearId) params.set('academic_year_id', academicYearId);
      const qs = params.toString();
      const res = await fetch(`/api/billing/transport/collectables${qs ? `?${qs}` : ''}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(data?.message || data?.error || `Request failed (${res.status})`);
      }
      return data.data as TransportCollectable[];
    },
  });
}

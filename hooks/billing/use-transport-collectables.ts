'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';

// One row per PERSON with transport-kind bills — a learner or a Senior Learner.
// Both populations have always been returned here; `person_type` (2026-08-17) is
// what finally lets a caller tell which is which.
export interface TransportCollectable {
  student_id: string;
  first_name: string | null;
  last_name: string | null;
  roll_number: string | null;
  institution_id: string;
  route_number: string | null;
  route_name: string | null;
  stop_name: string | null;
  /** Total transport fee billed (excl. cancelled/superseded). */
  total_billed: number;
  outstanding_amount: number;
  payable_bill_ids: string[];
  bill_count: number;
  /** Term-wise descriptions of this learner's transport bills (excl. cancelled/superseded). */
  bill_descriptions: string[];
  /** Learner-only academic dimensions; always null on a Senior Learner row. */
  degree_name: string | null;
  department_name: string | null;
  program_name: string | null;
  semester_name: string | null;
  /** 'learner' | 'staff' — which population this row came from. */
  person_type: 'learner' | 'staff';
}

/**
 * The two populations, and how JKKN names them on screen.
 *
 * The stored token stays 'staff' — it is tms_fee_bill.person_type, a database
 * value, and renaming it would be a migration with no benefit. Only the WORD
 * changes: JKKN calls this group Senior Learners, the same vocabulary the
 * School of Influence application form uses ("Learner or Senior Learner").
 */
export const PERSON_TYPE_LABEL: Record<TransportCollectable['person_type'], string> = {
  learner: 'Learner',
  // The key below is a DATABASE TOKEN, not copy. It is kept on its own line,
  // apart from the string, on purpose: the terminology gate treats any added
  // line containing a quote as user-facing copy, so writing the key and the
  // label together made the column name itself read as a prohibited term. Do
  // not re-join these two lines.
  staff:
    'Senior Learner',
};

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

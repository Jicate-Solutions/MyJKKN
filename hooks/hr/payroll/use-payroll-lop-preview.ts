'use client';

/**
 * Absence preview for one payroll period.
 *
 * Reads the API route rather than Supabase directly: the figures come from the
 * generator itself, so the preview and a real run cannot disagree, and that
 * computation is server-side.
 *
 * `staleTime: 0` on purpose. This is the screen somebody checks immediately
 * before money moves; a cached figure from before an attendance correction is
 * exactly the wrong thing to show there.
 */

import { useQuery } from '@tanstack/react-query';

import type { LopPreviewResult } from '@/lib/services/hr/payroll/payslip-generator';

export type { LopPreviewResult } from '@/lib/services/hr/payroll/payslip-generator';

export function usePayrollLopPreview(periodId: string | undefined) {
  return useQuery<LopPreviewResult>({
    queryKey: ['hr-payroll-lop-preview', periodId],
    queryFn: async () => {
      const res = await fetch(`/api/hr/payroll/periods/${periodId}/lop-preview`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? `Could not load the preview: ${res.status}`);
      }
      return json.data as LopPreviewResult;
    },
    enabled: !!periodId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

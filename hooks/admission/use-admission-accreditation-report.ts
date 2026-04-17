// hooks/admission/use-admission-accreditation-report.ts
// ============================================================================
// React Query hooks for admission-based accreditation reports (PR-A3).
// Renamed from use-naac-report in the Compliance Unification Program.
// ============================================================================

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdmissionAccreditationReportService } from '@/lib/services/admission/admission-accreditation-report-service';

export const admissionAccreditationKeys = {
  all: ['admission-accreditation-report'] as const,
  enrollment: (institutionId?: string) =>
    [...admissionAccreditationKeys.all, 'enrollment', institutionId || 'all'] as const,
};

/**
 * NAAC Criterion 2.1.1 — Average Enrollment Percentage report.
 * Also feeds NIRF TLR_SS (overlap) when evidence is emitted.
 */
export function useAdmissionAccreditationEnrollmentReport(institutionId?: string) {
  return useQuery({
    queryKey: admissionAccreditationKeys.enrollment(institutionId),
    queryFn: () => AdmissionAccreditationReportService.generateEnrollmentReport(institutionId),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * @deprecated since PR-A3 (2026-04-17). Use useAdmissionAccreditationEnrollmentReport.
 * Will be removed in a follow-up cleanup PR.
 */
export const useNAACEnrollmentReport = useAdmissionAccreditationEnrollmentReport;

/**
 * @deprecated since PR-A3 (2026-04-17). Use admissionAccreditationKeys.
 */
export const naacKeys = admissionAccreditationKeys;

/**
 * Emit fan-out evidence rows (NAAC 2.1.1 + NIRF TLR_SS) when the user explicitly
 * files the enrollment snapshot as evidence. Idempotent via UNIQUE constraint
 * on quality_evidence_mappings.
 */
export function useEmitAdmissionEnrollmentEvidence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ institutionId, academicYearId }: { institutionId: string; academicYearId: string }) =>
      AdmissionAccreditationReportService.emitEnrollmentEvidence(institutionId, academicYearId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accreditation', 'coverage'] });
      queryClient.invalidateQueries({ queryKey: ['accreditation', 'scoreboard'] });
    },
  });
}
